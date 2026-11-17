"""
MCP round trips with no key: the stdio server starts, lists its four tools and
four resources, serves the intake, the complaint, the SOP and a rule, and
answers each tool, so a transport fault is never read as a model fault.

    python benchmark/test_mcp.py
"""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


async def main():
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    checks = []
    log_dir = tempfile.mkdtemp()
    env = dict(os.environ, PYTHONIOENCODING="utf-8", HF_HUB_OFFLINE="1", STRATA_RUN_DIR=log_dir)
    env.pop("ANTHROPIC_API_KEY", None)
    params = StdioServerParameters(command=sys.executable, args=[str(BASE / "mcp_server.py")], env=env)
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = sorted(t.name for t in (await s.list_tools()).tools)
            checks.append(("four tools", tools == ["get_rule", "get_template", "search_rules", "submit_guidance"]))
            templates = sorted(t.uriTemplate for t in (await s.list_resource_templates()).resourceTemplates)
            checks.append(("resource templates", templates == ["complaint://{complaint_id}", "complaint://{complaint_id}/intake", "rule://{code}"]))
            res = [str(x.uri) for x in (await s.list_resources()).resources]
            checks.append(("sop resource", "sop://complaint" in res))

            rec = json.loads((await s.read_resource("complaint://9/intake")).contents[0].text)
            checks.append(("intake masks", rec["masked"] and "580315" not in rec["text"]))
            text = (await s.read_resource("complaint://9")).contents[0].text
            checks.append(("complaint resource", "A-11-02" in text and "580315" not in text))
            sop = (await s.read_resource("sop://complaint")).contents[0].text
            checks.append(("sop text", "SOP-8" in sop and "penalty_not_authorised" in sop))
            rule = (await s.read_resource("rule://BL-10")).contents[0].text
            checks.append(("rule resource", "11.00 p.m." in rule and "page 243" in rule))

            out = json.loads((await s.call_tool("search_rules", {"complaint_id": "9", "query": "guard asked visitor for identification",
                                                                  "complaint_type": "visitors_access"})).content[0].text)
            codes = [p["code"] for p in out["data"]["results"]]
            checks.append(("search_rules", out["status"] == "ok" and "BL-17" in codes and "HR-4" in codes))
            out = json.loads((await s.call_tool("get_rule", {"complaint_id": "9", "code": "HR-4"})).content[0].text)
            checks.append(("get_rule", out["status"] == "ok"))
            out = json.loads((await s.call_tool("get_template", {"complaint_id": "9", "name": "explain_rule"})).content[0].text)
            checks.append(("get_template", out["status"] == "ok"))
            g = {"complaint_type": "visitors_access", "facts_known": ["Visitor turned away on 15 November."], "facts_missing": [],
                 "rules": [{"code": "BL-17(1)", "quote": "The management corporation may require any person on the common property to identify himself for security purposes.",
                            "applies": "The guard may ask for identification."}, {"code": "HR-4", "quote": "", "applies": "Only the last four digits are recorded."}],
                 "conflict": None, "next_steps": [{"sop_step": "SOP-7", "action": "Explain the visitor rule to the resident."}],
                 "draft_reply": "Dear Resident, under by-law 17 the guard may ask visitors to identify themselves, and house rule 4 records only the last four digits. Management Office, Amber Residences.",
                 "handover": None}
            out = json.loads((await s.call_tool("submit_guidance", {"complaint_id": "9", "guidance": g})).content[0].text)
            checks.append(("submit_guidance", out["status"] == "recorded"))
    log = (Path(log_dir) / "9.jsonl").read_text(encoding="utf-8")
    checks.append(("logged, masked", "submit_guidance" in log and "580315" not in log))
    ok = sum(p for _, p in checks)
    for n, p in checks:
        print(("PASS " if p else "FAIL ") + n)
    print(f"\n{ok} passed, {len(checks) - ok} failed")
    return ok == len(checks)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(main()) else 1)
