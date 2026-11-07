"""
No-key tool tests, through the MCP client, before Claude is connected.

If a tool is wrong, the benchmark would blame the AI, so the tools are proved
alone first. No API key, no spend. run_benchmark.py runs this file itself and
refuses a paid run unless every check passes.

    python benchmark/test_tools.py
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

BASE = Path(__file__).resolve().parents[1]
SERVER = BASE / "mcp_server.py"

# Exactly the 22 founder-approved claims (6 Nov 2026), no more.
APPROVED = sorted("""CLM-2021-05512 CLM-2022-06033 CLM-2022-08841 CLM-2023-02857 CLM-2023-06205
CLM-2023-07326 CLM-2023-09814 CLM-2023-11207 CLM-2023-12440 CLM-2024-01385 CLM-2024-03187
CLM-2024-05128 CLM-2024-06472 CLM-2024-08853 CLM-2024-11564 CLM-2024-13208 CLM-2024-15093
CLM-2025-00417 CLM-2025-03362 CLM-2025-05106 CLM-2025-07741 CLM-2025-09207""".split())

RESULTS = []


def check(name, ok, detail=""):
    RESULTS.append((name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   ({detail})" if detail and not ok else ""))


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


async def call(s, tool, **args):
    r = await s.call_tool(tool, args)
    return json.loads(r.content[0].text)


async def read(s, uri):
    r = await s.read_resource(uri)
    return r.contents[0].text


def server(env_extra=None):
    env = dict(os.environ, PYTHONIOENCODING="utf-8", **(env_extra or {}))
    env.pop("FIRE_RUN_DIR", None)
    return StdioServerParameters(command=sys.executable, args=[str(SERVER)], env=env)


# ------------------------------------------------------------------ data tests
def data_tests():
    print("data")
    cases = load(BASE / "benchmark" / "cases.json")["cases"]
    nos = sorted(c["claim_no"] for c in cases)
    check("cases.json holds exactly the 22 approved claims", nos == APPROVED, f"{len(nos)} held")
    check("cases.json sorted by peril, then claim number",
          [(c["peril"], c["claim_no"]) for c in cases] == sorted((c["peril"], c["claim_no"]) for c in cases))
    gold = sorted(c["claim_no"] for c in load(BASE / "benchmark" / "gold_facts.json")["cases"])
    check("gold_facts.json covers the same 22 claims", gold == APPROVED)
    chunks = {c["chunk_id"]: c for c in load(BASE / "data" / "chunks.json")["chunks"]}
    check("FC815 and FC816 texts differ", chunks["CLAUSE-FC815"]["text"] != chunks["CLAUSE-FC816"]["text"])
    check("FC815 holds the automatic renewal wording", "automatically renewed" in chunks["CLAUSE-FC815"]["text"])
    check("operative clause is a chunk", "FIRE or LIGHTNING during the Period of Insurance" in chunks["OPERATIVE-CLAUSE"]["text"])
    check("FP512A and FP512B carry no stored excess",
          chunks["ENDORSEMENT-FP512A"]["excess"] is None and chunks["ENDORSEMENT-FP512B"]["excess"] is None)
    check("every paired variant has a scope note",
          all(chunks[f"ENDORSEMENT-{c}"].get("scope_note") for c in
              ("FP505A", "FP505B", "FP505C", "FP505D", "FP506A", "FP506B", "FP507A", "FP507B",
               "FP508A.01", "FP508B", "FP512A", "FP512B")))
    nric = re.compile(r"\b\d{6}-\d{2}-\d{4}\b")
    phone = re.compile(r"(\+?60[\s-]?1\d|\b01\d)[\s-]?\d{3,4}[\s-]?\d{4}\b")
    hits = []
    for f in (BASE / "cases").glob("*/*.md"):
        t = f.read_text(encoding="utf-8")
        if nric.search(t) or phone.search(t):
            hits.append(f.parent.name)
    check("no NRIC-format or phone-format number in any case file", not hits, ", ".join(hits))
    rules = load(BASE / "rules" / "condition_tests.json")
    ids = set(chunks)
    refs = re.findall(r'"chunk_id":\s*"([^"{]+)"', json.dumps(rules))
    check("every chunk_id in the rules exists in chunks.json", all(r in ids for r in refs),
          ", ".join(r for r in refs if r not in ids))


# ------------------------------------------------------------- the 22 claims
async def gold_tests(s):
    print("the 22 claims, reference facts through the tools")
    gold = {c["claim_no"]: c for c in load(BASE / "benchmark" / "gold_facts.json")["cases"]}
    all_ids = [c["chunk_id"] for c in load(BASE / "data" / "chunks.json")["chunks"]
               if c["type"] != "coverage_decision"]
    codes = sorted({c["code"] for c in load(BASE / "data" / "chunks.json")["chunks"]
                    if c["type"] != "coverage_decision"})
    for exp in load(BASE / "benchmark" / "cases.json")["cases"]:
        no = exp["claim_no"]
        g = gold[no]
        await read(s, f"claim://{no}/incident")
        for code in codes:            # retrieve the whole wording for this claim
            await call(s, "search_policy", claim_no=no, code=code)
        got, last = [], None
        for n in range(1, 7):
            if str(n) not in g["gates"]:
                break
            last = await call(s, "check_gate", claim_no=no, gate=n, facts=g["gates"][str(n)])
            if "error" in last:
                break
            got.append(last["status"])
            if last["status"] == "fail":
                break
        got += ["not_reached"] * (6 - len(got))
        want = [x["status"] for x in exp["gates"]]
        if "error" in (last or {}):
            check(f"{no} gates", False, last["message"])
            continue
        items = g["items"] or [{"ref": 1, "assessed": 0, "category": "insured_damage"}]
        p = await call(s, "calculate_payable", claim_no=no, items=items, sums_insured=g["sums_insured"] or {"1": 1},
                       values_at_risk=g["values_at_risk"], endorsements_held=g["endorsements_held"])
        fig = p.get("payable") if p.get("label") == "payable" else p.get("but_for")
        want_fig = exp["payable"] if exp["determination"] == "APPROVE" else exp["but_for"]
        check(f"{no} {exp['label']}: gates and figure", got == want and fig == want_fig,
              f"gates {got} want {want}; figure {fig} want {want_fig}")
    del all_ids


# --------------------------------------------------------------- the errors
async def error_tests(s):
    print("structured errors")
    no = "CLM-2025-09207"
    await read(s, f"claim://{no}/incident")
    g1 = {"date_of_loss": {"value": "2025-08-14", "source": "Adjuster's report"},
          "period_start": {"value": "2025-03-01", "source": "Schedule"},
          "period_end": {"value": "2025-02-28", "source": "Schedule"}}
    r = await call(s, "check_gate", claim_no=no, gate=1, facts=g1)
    check("clause_not_retrieved: gate 1 before the operative clause is retrieved",
          r.get("error") == "clause_not_retrieved" and "OPERATIVE-CLAUSE" in r.get("missing", []), r)
    r = await call(s, "check_gate", claim_no=no, gate=3, facts={})
    check("gate_out_of_order: gate 3 before gate 1", r.get("error") == "gate_out_of_order", r)
    await call(s, "search_policy", claim_no=no, code="Operative clause")
    r = await call(s, "check_gate", claim_no=no, gate=1, facts={k: v for k, v in g1.items() if k != "period_end"})
    check("missing_fact names the fact", r.get("error") == "missing_fact" and r.get("fact") == "period_end", r)
    r = await call(s, "check_gate", claim_no=no, gate=1,
                   facts=dict(g1, period_end={"value": "2026-02-28", "source": ""}))
    check("missing_fact when a fact has no source", r.get("error") == "missing_fact", r)
    r = await call(s, "check_gate", claim_no=no, gate=1, facts=dict(g1, period_end={"value": "2026-02-28", "source": "Schedule"}),
                   clauses=["ENDORSEMENT-FP504"])
    check("clause_not_retrieved for a clause listed but never returned", r.get("error") == "clause_not_retrieved", r)
    r = await call(s, "check_gate", claim_no=no, gate=1, facts=dict(g1, period_end={"value": "2026-02-28", "source": "Schedule"}))
    check("gate 1 passes once the wording is retrieved and facts are complete", r.get("status") == "pass", r)
    r = await call(s, "check_gate", claim_no=no, gate=2,
                   facts={"proximate_cause": {"value": "alien invasion", "source": "x"},
                          "intervening_event": {"value": "none", "source": "x"}})
    check("no_test_for_clause for an unknown cause", r.get("error") == "no_test_for_clause", r)
    r = await call(s, "check_gate", claim_no=no, gate=2,
                   facts={"proximate_cause": {"value": "burst_pipe", "source": "x"},
                          "intervening_event": {"value": "none", "source": "x"}})
    check("clause_not_retrieved: burst pipe before FP507 is retrieved", r.get("error") == "clause_not_retrieved", r)
    r = await call(s, "calculate_payable", claim_no=no, items=[{"ref": 1, "assessed": 1, "category": "insured_damage"}],
                   sums_insured={"1": 10})
    check("gates_incomplete: calculate_payable before the gates", r.get("error") == "gates_incomplete", r)
    r = await call(s, "search_policy", claim_no="CLM-1999-00000", query="fire")
    check("unknown_case for a claim not on file", r.get("error") == "unknown_case", r)

    # a failed gate stops the chain
    no2 = "CLM-2021-05512"
    await read(s, f"claim://{no2}/incident")
    await call(s, "search_policy", claim_no=no2, code="Operative clause")
    r = await call(s, "check_gate", claim_no=no2, gate=1,
                   facts={"date_of_loss": {"value": "2021-07-14", "source": "a"},
                          "period_start": {"value": "2021-07-30", "source": "s"},
                          "period_end": {"value": "2022-07-29", "source": "s"}})
    check("George Town fails gate 1", r.get("status") == "fail", r)
    r = await call(s, "check_gate", claim_no=no2, gate=2, facts={})
    check("chain_stopped: no gate after a failure", r.get("error") == "chain_stopped", r)
    r = await call(s, "calculate_payable", claim_no=no2, items=[{"ref": 1, "assessed": 1, "category": "insured_damage"}],
                   sums_insured={"1": 10})
    check("not priced after a gate 1 failure", r.get("label") == "not priced" and r.get("payable") == 0, r)

    print("search results")
    r = await call(s, "search_policy", claim_no=no, query="cryptocurrency mining rig from Mars")
    check("empty result is a valid result, not an error", "error" not in r and r.get("results") == [], r)
    r = await call(s, "search_policy", claim_no=no, query="burst water pipe leak")
    top = (r.get("results") or [{}])[0]
    check("held FP507A ranks first and overrides; FP507B not held is informational",
          top.get("chunk_id") == "ENDORSEMENT-FP507A" and top.get("authority") == "override" and
          any(x["chunk_id"] == "ENDORSEMENT-FP507B" and x["authority"] == "informational" for x in r["results"]), r)
    check("results are trimmed to id, code, title, authority, note, scope note, text",
          set(top) == {"chunk_id", "code", "title", "authority", "authority_note", "scope_note", "text"}, sorted(top))


async def guard_tests(s):
    print("submit_advice guard")
    no = "CLM-2023-11207"
    g = {c["claim_no"]: c for c in load(BASE / "benchmark" / "gold_facts.json")["cases"]}[no]
    await read(s, f"claim://{no}/incident")
    for code in ("Operative clause", "Condition 12", "Condition 9", "FP507B"):
        await call(s, "search_policy", claim_no=no, code=code)
    for n in range(1, 6):
        await call(s, "check_gate", claim_no=no, gate=n, facts=g["gates"][str(n)])
    p = await call(s, "calculate_payable", claim_no=no, items=g["items"], sums_insured=g["sums_insured"],
                   values_at_risk=g["values_at_risk"])
    good = {"proximate_cause": {"cause": "burst pipe", "sequence": [], "intervening_event": "none"},
            "gates": [{"gate": n, "status": st, "quotes": [], "application": "", "facts_relied_on": []}
                      for n, st in zip(range(1, 7), ["pass", "pass", "pass", "pass", "fail", "not_reached"])],
            "conflicts": [], "flags": [], "governing_clause": "FP507B, exclusion (a)", "advice": "Decline.",
            "figure": {"payable": 0, "but_for": p["but_for"], "label": "not payable"}}
    good["gates"][4]["quotes"] = [{"chunk_id": "ENDORSEMENT-FP507B",
                                   "text": "(a) loss or damage caused whilst the premises are untenanted."}]

    def variant(fn):
        a = json.loads(json.dumps(good))
        fn(a)
        return a

    r = await call(s, "submit_advice", claim_no=no, advice=variant(
        lambda a: a["gates"][4]["quotes"].append({"chunk_id": "ENDORSEMENT-FP507B", "text": "the Company shall pay double"})))
    check("quote_not_retrieved names the line", r.get("error") == "quote_not_retrieved" and
          r["faults"][0]["line"] == "gates[5].quotes[1]" and r.get("retries_left") == 2, r)
    r = await call(s, "submit_advice", claim_no=no, advice=variant(
        lambda a: a["gates"][4]["quotes"].__setitem__(0, {"chunk_id": "CONDITION-9",
                                                         "text": "(a) loss or damage caused whilst the premises are untenanted."})))
    check("clause_mismatch for a quote cited to the wrong chunk", r.get("error") == "clause_mismatch" and
          r.get("retries_left") == 1, r)
    r = await call(s, "submit_advice", claim_no=no, advice=variant(lambda a: a["gates"][4].__setitem__("status", "pass")))
    check("rejected after two retries", r.get("error") == "rejected" and r.get("recorded") is False, r)

    # fresh session for the remaining checks
    await read(s, f"claim://{no}/incident")
    for code in ("Operative clause", "Condition 12", "Condition 9", "FP507B"):
        await call(s, "search_policy", claim_no=no, code=code)
    for n in range(1, 6):
        await call(s, "check_gate", claim_no=no, gate=n, facts=g["gates"][str(n)])
    r = await call(s, "submit_advice", claim_no=no, advice=good)
    check("figure_mismatch when no figure was computed", r.get("error") == "figure_mismatch", r)
    await call(s, "calculate_payable", claim_no=no, items=g["items"], sums_insured=g["sums_insured"],
               values_at_risk=g["values_at_risk"])
    r = await call(s, "submit_advice", claim_no=no, advice=variant(lambda a: a["gates"].pop(5)))
    check("missing_gate", r.get("error") == "missing_gate", r)
    r = await call(s, "submit_advice", claim_no=no, advice=variant(lambda a: a["gates"][4].__setitem__("status", "pass")))
    check("status_mismatch names the gate", (r.get("faults") or [{}])[0].get("error") == "status_mismatch"
          and r["faults"][0]["line"] == "gates[5].status", r)
    r = await call(s, "submit_advice", claim_no=no, advice=variant(
        lambda a: a.__setitem__("governing_clause", "FP507B, Special Condition 3")))
    check("clause_mismatch when the governing clause is not the deciding gate's clause",
          any(f["line"] == "governing_clause" for f in r.get("faults") or []), r)
    await read(s, f"claim://{no}/incident")
    for code in ("Operative clause", "Condition 12", "Condition 9", "FP507B"):
        await call(s, "search_policy", claim_no=no, code=code)
    for n in range(1, 6):
        await call(s, "check_gate", claim_no=no, gate=n, facts=g["gates"][str(n)])
    await call(s, "calculate_payable", claim_no=no, items=g["items"], sums_insured=g["sums_insured"],
               values_at_risk=g["values_at_risk"])
    r = await call(s, "submit_advice", claim_no=no, advice=variant(lambda a: a["figure"].__setitem__("but_for", 30900)))
    check("figure_mismatch on the but-for figure", (r.get("faults") or [{}])[0].get("line") == "figure.but_for", r)
    await read(s, f"claim://{no}/incident")
    for code in ("Operative clause", "Condition 12", "Condition 9", "FP507B"):
        await call(s, "search_policy", claim_no=no, code=code)
    for n in range(1, 6):
        await call(s, "check_gate", claim_no=no, gate=n, facts=g["gates"][str(n)])
    await call(s, "calculate_payable", claim_no=no, items=g["items"], sums_insured=g["sums_insured"],
               values_at_risk=g["values_at_risk"])
    r = await call(s, "submit_advice", claim_no=no, advice=good)
    check("valid advice is recorded", r.get("recorded") is True, r)


async def resource_tests(s):
    print("resources")
    t = await read(s, "claim://CLM-2025-09207/schedule")
    check("claim://{claim_no}/schedule serves the schedule", "FP507A" in t and "Period of insurance" in t)
    t = await read(s, "policy://clause/FP507A")
    check("policy://clause/{code} serves a clause with its scope note", "Scope note: Applies to buildings exceeding" in t)
    tools = {t.name for t in (await s.list_tools()).tools}
    check("exactly four tools", tools == {"search_policy", "check_gate", "calculate_payable", "submit_advice"}, tools)


async def down_test():
    print("search down")
    async with stdio_client(server({"FIRE_SEARCH_DOWN": "1"})) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            res = await call(s, "search_policy", claim_no="CLM-2025-09207", query="burst pipe")
            check("search_unavailable is a retryable error, not an empty result",
                  res.get("error") == "search_unavailable" and res.get("retryable") is True, res)


async def main():
    data_tests()
    async with stdio_client(server()) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            await resource_tests(s)
            await error_tests(s)
            await guard_tests(s)
            await gold_tests(s)
    await down_test()
    passed = sum(ok for _, ok, _ in RESULTS)
    print(f"\n{passed}/{len(RESULTS)} passed")
    out = BASE / "benchmark" / "results" / "no_key_tests.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"passed": passed, "total": len(RESULTS),
                               "checks": [{"name": n, "ok": ok} for n, ok, _ in RESULTS]}, indent=1), encoding="utf-8")
    return passed == len(RESULTS)


if __name__ == "__main__":
    sys.exit(0 if asyncio.run(main()) else 1)
