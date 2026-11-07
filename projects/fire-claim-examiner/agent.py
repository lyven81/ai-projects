"""
The underwriter: one AI agent, a manual tool loop on the Anthropic SDK, with
the MCP server's four tools.

The agent reads the three claim resources, which the loop attaches to its first
message, then works the gates through the tools. The loop stops when the advice
is recorded, when the guard rejects it after two retries, or at the turn limit.
"""

import json

import anthropic

from prompt import SYSTEM, first_message

MAX_TURNS = 40

# USD per million tokens (claude-api reference, 2026-10-06). Cache writes at
# 1.25x input and cache reads at 0.1x input.
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


async def run_case(mcp, client: anthropic.AsyncAnthropic, model: str, claim_no: str, tools: list) -> dict:
    docs = {}
    for d in ("incident", "adjuster", "schedule"):       # incident first: it opens the claim
        r = await mcp.read_resource(f"claim://{claim_no}/{d}")
        docs[d] = r.contents[0].text
    messages = [{"role": "user", "content": [
        {"type": "text", "text": first_message(claim_no, docs["incident"], docs["adjuster"], docs["schedule"])}]}]
    system = [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}]

    usage = {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0}
    calls, outcome, turns = [], "turn_limit", 0
    for turns in range(1, MAX_TURNS + 1):
        # one moving breakpoint on the newest user content, so each turn reads the history from cache
        for m in messages:
            if m["role"] == "user" and isinstance(m["content"], list):
                for b in m["content"]:
                    b.pop("cache_control", None)
        messages[-1]["content"][-1]["cache_control"] = {"type": "ephemeral"}

        resp = await client.messages.create(model=model, max_tokens=16000, system=system, tools=tools,
                                            messages=messages,
                                            # the installed SDK predates output_config as a named argument
                                            extra_body={"output_config": {"effort": "medium"}})
        for k in usage:
            usage[k] += getattr(resp.usage, k, 0) or 0
        messages.append({"role": "assistant", "content": [b.model_dump(exclude_none=True) for b in resp.content]})
        if resp.stop_reason == "refusal":
            outcome = "refusal"
            break
        uses = [b for b in resp.content if b.type == "tool_use"]
        if not uses:
            outcome = "stopped_without_advice" if resp.stop_reason != "max_tokens" else "max_tokens"
            break
        results, done = [], None
        for u in uses:
            r = await mcp.call_tool(u.name, dict(u.input))
            text = r.content[0].text if r.content else "{}"
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = {"error": "bad_tool_output", "message": text[:300]}
            calls.append({"tool": u.name, "error": parsed.get("error")})
            results.append({"type": "tool_result", "tool_use_id": u.id, "content": text,
                            "is_error": bool(parsed.get("error"))})
            if u.name == "submit_advice":
                if parsed.get("recorded"):
                    done = "recorded"
                elif parsed.get("error") == "rejected":
                    done = "rejected"
        messages.append({"role": "user", "content": results})
        if done:
            outcome = done
            break
    return {"claim_no": claim_no, "model": model, "outcome": outcome, "turns": turns,
            "tool_calls": len(calls), "tool_errors": sum(1 for c in calls if c["error"]),
            "usage": usage, "cost_usd": round(cost(model, usage), 5), "calls": calls}
