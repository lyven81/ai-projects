"""
The advisor: one AI agent, a manual tool loop on the Anthropic SDK, with the
MCP server's four tools.

Before any AI call the host reads the complaint's intake record. When the
emergency check found danger words, the complaint is handed to the building
manager with the note written in code and no model is called.

Otherwise the loop attaches the complaint and the SOP to the first message and
runs until the guidance is recorded, the guard rejects it after two retries,
or the turn limit. A follow-up question from the officer continues the same
conversation, with the same tools and the same guard.
"""
import json

import anthropic

from prompt import SYSTEM, first_message, follow_up_message

MAX_TURNS = 16
NOT_RECORDED = "Nothing is recorded for the officer until the guidance passes submit_guidance."

# USD per million tokens (claude-api reference, 2026-10-06). Cache writes at 1.25x input, reads at 0.1x.
PRICES = {
    "claude-haiku-5-5": {"in": 0.10, "out": 0.50},
    "claude-sonnet-5-5": {"in": 2.00, "out": 10.00},
}


def cost(model, u):
    p = PRICES[model]
    return (u["input_tokens"] * p["in"] + u["cache_creation_input_tokens"] * p["in"] * 1.25
            + u["cache_read_input_tokens"] * p["in"] * 0.1 + u["output_tokens"] * p["out"]) / 1e6


def to_anthropic_tools(mcp_tools):
    tools = [{"name": t.name, "description": t.description or "", "input_schema": t.inputSchema}
             for t in sorted(mcp_tools, key=lambda t: t.name)]
    tools[-1]["cache_control"] = {"type": "ephemeral"}
    return tools


def new_usage():
    return {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}


async def _loop(mcp, client, model, tools, messages, usage, calls):
    system = [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}]
    outcome, turns, result, nudged = "turn_limit", 0, None, False
    for turns in range(1, MAX_TURNS + 1):
        for m in messages:
            if m["role"] == "user" and isinstance(m["content"], list):
                for b in m["content"]:
                    b.pop("cache_control", None)
        messages[-1]["content"][-1]["cache_control"] = {"type": "ephemeral"}
        resp = await client.messages.create(model=model, max_tokens=8000, system=system, tools=tools,
                                            messages=messages, extra_body={"output_config": {"effort": "medium"}})
        for k in usage:
            usage[k] += getattr(resp.usage, k, 0) or 0
        messages.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in resp.content]})
        if resp.stop_reason == "refusal":
            outcome = "refusal"
            break
        uses = [b for b in resp.content if b.type == "tool_use"]
        if not uses:
            if resp.stop_reason != "max_tokens" and not nudged:
                # a stop in plain text records nothing for the officer: the loop says so once
                nudged = True
                messages.append({"role": "user", "content": [{"type": "text", "text": NOT_RECORDED}]})
                continue
            outcome = "stopped_without_guidance" if resp.stop_reason != "max_tokens" else "max_tokens"
            break
        results, done = [], None
        for u in uses:
            r = await mcp.call_tool(u.name, dict(u.input))
            text = r.content[0].text if r.content else "{}"
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = {"error": "bad_tool_output", "message": text[:300]}
            calls.append({"tool": u.name, "error": parsed.get("error"),
                          "message": (parsed.get("message") or parsed.get("next_step") or "")[:200] if parsed.get("error") else ""})
            results.append({"type": "tool_result", "tool_use_id": u.id, "content": text,
                            "is_error": bool(parsed.get("error"))})
            if u.name == "submit_guidance":
                if parsed.get("status") == "recorded":
                    done = "recorded"
                    g = dict(u.input).get("guidance")
                    g = json.loads(g) if isinstance(g, str) else g
                    data = parsed.get("data") or {}
                    result = {"guidance": dict(g, draft_reply=data.get("draft_reply") or g.get("draft_reply")),
                              "handover_note": data.get("handover_note")}
                elif parsed.get("error") == "retries_exhausted":
                    done = "retries_exhausted"
                    result = {"message": parsed.get("message")}
        messages.append({"role": "user", "content": results})
        if done:
            outcome = done
            break
    return outcome, turns, result


async def run_case(mcp, client, model, complaint_id, tools, follow_up=None):
    usage, calls = new_usage(), []
    rec = json.loads((await mcp.read_resource(f"complaint://{complaint_id}/intake")).contents[0].text)
    if rec["emergency"]:
        return {"id": complaint_id, "model": model, "outcome": "emergency_handover", "turns": 0, "model_calls": 0,
                "tool_calls": 0, "tool_errors": 0, "usage": usage, "cost_usd": 0.0, "calls": [],
                "result": {"handover_note": rec["handover_note"]}}
    complaint = (await mcp.read_resource(f"complaint://{complaint_id}")).contents[0].text
    sop = (await mcp.read_resource("sop://complaint")).contents[0].text
    messages = [{"role": "user", "content": [{"type": "text", "text": first_message(complaint, sop)}]}]
    outcome, turns, result = await _loop(mcp, client, model, tools, messages, usage, calls)
    out = {"id": complaint_id, "model": model, "outcome": outcome, "turns": turns, "model_calls": turns,
           "tool_calls": len(calls), "tool_errors": sum(1 for c in calls if c["error"]),
           "usage": usage, "calls": calls, "result": result}
    if follow_up and outcome == "recorded":
        messages.append({"role": "user", "content": [{"type": "text", "text": follow_up_message(follow_up)}]})
        o2, t2, r2 = await _loop(mcp, client, model, tools, messages, usage, calls)
        out["follow_up"] = {"question": follow_up, "outcome": o2, "turns": t2, "result": r2}
        out["model_calls"] += t2
        out["tool_calls"] = len(calls)
    out["cost_usd"] = round(cost(model, usage), 5)
    return out
