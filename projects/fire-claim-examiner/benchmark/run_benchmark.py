"""
The benchmark: the underwriter on the 22 founder-approved claims.

Scored from what the system did (the tool log and the recorded advice), never
from how the reply reads. Before any paid call it runs the no-key tool tests
and refuses to spend if one fails, and it keeps a cost ledger: once the ledger
reaches USD 2.00 it stops and asks the founder.

    python benchmark/run_benchmark.py --sample                 # the 3-case sample, Haiku
    python benchmark/run_benchmark.py                          # all 22, Haiku, once
    python benchmark/run_benchmark.py --model claude-sonnet-5-5 --only CLM-...,CLM-...
    python benchmark/run_benchmark.py --rescore <run_id>       # score a run again, no spend

The key is read from the environment, or from the git-ignored .env in the
user's home folder. It is never printed or logged.
"""

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
BENCH = BASE / "benchmark"
RUNS = BENCH / "runs"
RESULTS = BENCH / "results"
LEDGER = RESULTS / "ledger.json"
LEDGER_CAP = 2.00
SAMPLE = ["CLM-2024-15093", "CLM-2023-11207", "CLM-2025-09207"]   # all passed, failed at gate 5, passed with a flag
sys.path.insert(0, str(BASE))


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def load_key():
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    env = Path.home() / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                os.environ["ANTHROPIC_API_KEY"] = line.split("=", 1)[1].strip().strip('"')
                return
    sys.exit("No ANTHROPIC_API_KEY in the environment or ~/.env.")


# ------------------------------------------------------------------ scoring
CODE = re.compile(r"(operative clause|condition \d+|f[pcw]\d{3}[a-z]?(?:\.\d+)?|peril_not_insured)", re.I)
SUB = re.compile(r"\(([a-z])\)|special condition (\d+)|period", re.I)


def clause_key(s):
    s = (s or "").lower()
    code = CODE.search(s)
    sub = SUB.search(s[code.end():] if code else s)
    subref = None
    if sub:
        subref = sub.group(1) or (f"sc{sub.group(2)}" if sub.group(2) else "period")
    m = re.match(r"condition (\d+)\(([a-z])\)", s.strip())
    if m:
        return (f"condition {m.group(1)}", m.group(2))
    return ((code.group(1).lower() if code else s.strip()), subref)


def same_clause(got, want):
    g, w = clause_key(got), clause_key(want)
    return g[0] == w[0] and (w[1] is None or g[1] == w[1])


CAUSE_WORDS = {"burglary_or_theft": ("burglary", "theft"), "malicious_damage": ("malicious",)}


def replay(log):
    """Final gate statuses, facts per gate, figure and advice, from the tool log."""
    gates, facts, figure, advice, calls, gate2 = {}, {}, None, None, 0, None
    for e in log:
        if e["kind"] != "tool":
            continue
        calls += 1
        r = e["result"]
        if e["name"] == "check_gate" and "status" in r:
            n = r["gate"]
            for k in [k for k in gates if k >= n]:
                gates.pop(k, None)
                facts.pop(k, None)
            gates[n] = r
            facts[n] = {k: (v.get("value") if isinstance(v, dict) else v) for k, v in e["args"]["facts"].items()}
            if n == 2:
                gate2 = facts[n].get("proximate_cause")
        if e["name"] == "calculate_payable" and "label" in r:
            figure = r
        if e["name"] == "submit_advice" and r.get("recorded"):
            advice = e["args"]["advice"]
    statuses = []
    for n in range(1, 7):
        if n in gates:
            statuses.append(gates[n]["status"])
        else:
            statuses.append("not_reached")
    return statuses, gates, facts, figure, advice, calls, gate2


def score_case(exp, gold, log):
    statuses, gates, facts, figure, advice, calls, gate2 = replay(log)
    want = [g["status"] for g in exp["gates"]]
    out = {"claim_no": exp["claim_no"], "label": exp["label"], "peril": exp["peril"], "tool_calls": calls}
    # proximate cause: from the gate 2 facts; where gate 2 was never reached, from the advice
    if gate2 is not None:
        out["proximate_cause"] = str(gate2).lower() == gold["proximate_cause"]
    else:
        text = json.dumps((advice or {}).get("proximate_cause", "")).lower()
        out["proximate_cause"] = any(w in text for w in CAUSE_WORDS.get(gold["proximate_cause"], (gold["proximate_cause"],)))
    out["gate_statuses"] = statuses == want
    out["statuses"] = statuses
    out["governing_clause"] = bool(advice) and same_clause(advice.get("governing_clause"), exp["governing_clause"])
    out["governing_got"] = (advice or {}).get("governing_clause")
    want_fig = exp["payable"] if exp["determination"] == "APPROVE" else exp["but_for"]
    got_fig = None if not figure else (figure["payable"] if figure["label"] == "payable" else figure.get("but_for"))
    out["payable"] = (figure is not None) and got_fig == want_fig and (exp["determination"] == "APPROVE") == (figure["label"] == "payable")
    out["figure_got"] = got_fig
    out["advice_recorded"] = advice is not None          # the guard passed: quotes retrieved and cited
    bad = [m for m in exp["must_not_cite"] + exp["must_not_apply"]
           if advice and CODE.search(m) and same_clause(advice.get("governing_clause"), CODE.search(m).group(1))
           and not same_clause(exp["governing_clause"], CODE.search(m).group(1))]
    out["no_forbidden_ground"] = advice is not None and not bad
    out["flags"] = (exp["underwriting_flags"] == 0) or bool(advice and advice.get("flags"))
    # facts per field, against the reference facts, for every gate both reached
    fields = []
    for n, gf in gold["gates"].items():
        n = int(n)
        if n not in facts or n == 6:
            continue
        for k, v in gf.items():
            got = facts[n].get(k)
            ok = (str(got).strip().lower() == str(v["value"]).strip().lower()) if not isinstance(v["value"], list) \
                else sorted(map(str, got or [])) == sorted(map(str, v["value"]))
            fields.append({"gate": n, "field": k, "ok": ok, "doc": v["source"].split(",")[0]})
    if 6 in facts and gold["items"]:
        got_items = {str(i.get("ref")): i for i in (facts[6].get("items") or [])}
        for i in gold["items"]:
            g = got_items.get(str(i["ref"]), {})
            fields.append({"gate": 6, "field": "item.category", "ok": g.get("category") == i["category"],
                           "doc": "Adjuster's report"})
            fields.append({"gate": 6, "field": "item.assessed", "ok": float(g.get("assessed", -1)) == float(i["assessed"]),
                           "doc": "Adjuster's report"})
    out["facts"] = fields
    out["pass"] = all(out[k] for k in ("proximate_cause", "gate_statuses", "governing_clause", "payable",
                                       "advice_recorded", "no_forbidden_ground", "flags"))
    return out


def summarise(scores):
    def rate(key):
        return f"{sum(s[key] for s in scores)}/{len(scores)}"
    by_peril = {}
    for s in scores:
        p = by_peril.setdefault(s["peril"], [0, 0])
        p[0] += s["pass"]
        p[1] += 1
    fields, docs = {}, {}
    for s in scores:
        for f in s["facts"]:
            a = fields.setdefault(f["field"], [0, 0]); a[0] += f["ok"]; a[1] += 1
            d = docs.setdefault(f["doc"], [0, 0]); d[0] += f["ok"]; d[1] += 1
    return {"cases_passed": rate("pass"), "proximate_cause": rate("proximate_cause"),
            "gate_statuses": rate("gate_statuses"), "governing_clause": rate("governing_clause"),
            "payable": rate("payable"), "advice_recorded": rate("advice_recorded"),
            "no_forbidden_ground": rate("no_forbidden_ground"), "flags": rate("flags"),
            "by_peril": {k: f"{v[0]}/{v[1]}" for k, v in sorted(by_peril.items())},
            "facts_by_field": {k: f"{v[0]}/{v[1]}" for k, v in sorted(fields.items())},
            "facts_by_document": {k: f"{v[0]}/{v[1]}" for k, v in sorted(docs.items())},
            "tool_calls_per_case": {s["claim_no"]: s["tool_calls"] for s in scores}}


def score_run(run_dir, claim_nos):
    cases = {c["claim_no"]: c for c in load(BENCH / "cases.json")["cases"]}
    gold = {c["claim_no"]: c for c in load(BENCH / "gold_facts.json")["cases"]}
    scores = []
    for no in claim_nos:
        p = run_dir / "logs" / f"{no}.jsonl"
        log = [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines()] if p.exists() else []
        scores.append(score_case(cases[no], gold[no], log))
    return scores


# ------------------------------------------------------------------ running
async def run(model, claim_nos, run_dir):
    import anthropic
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    from agent import run_case, to_anthropic_tools

    env = dict(os.environ, PYTHONIOENCODING="utf-8", FIRE_RUN_DIR=str(run_dir / "logs"))
    env.pop("ANTHROPIC_API_KEY", None)          # the MCP server never sees the key
    params = StdioServerParameters(command=sys.executable, args=[str(BASE / "mcp_server.py")], env=env)
    client = anthropic.AsyncAnthropic(max_retries=4)
    out = []
    async with stdio_client(params) as (r, w):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = to_anthropic_tools((await s.list_tools()).tools)
            for no in claim_nos:
                t0 = time.time()
                try:
                    res = await run_case(s, client, model, no, tools)
                except anthropic.APIError as e:
                    res = {"claim_no": no, "model": model, "outcome": f"api_error: {type(e).__name__}",
                           "turns": 0, "tool_calls": 0, "tool_errors": 0,
                           "usage": {}, "cost_usd": 0.0, "calls": []}
                res["seconds"] = round(time.time() - t0, 1)
                print(f"  {no}  {res['outcome']:<22} turns {res['turns']:>2}  tools {res['tool_calls']:>2}  "
                      f"USD {res['cost_usd']:.4f}  {res['seconds']}s", flush=True)
                out.append(res)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="claude-haiku-5-5")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--rescore", default="")
    ap.add_argument("--over-budget", action="store_true", help="only with the founder's yes")
    a = ap.parse_args()

    cases = [c["claim_no"] for c in load(BENCH / "cases.json")["cases"]]
    if a.rescore:
        run_dir = RUNS / a.rescore
        meta = load(run_dir / "run.json")
        scores = score_run(run_dir, meta["claim_nos"])
        meta["scores"], meta["summary"]["score"] = scores, summarise(scores)
        (run_dir / "run.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(meta["summary"]["score"], indent=1))
        return

    claim_nos = SAMPLE if a.sample else ([x.strip() for x in a.only.split(",") if x.strip()] or cases)
    unknown = [x for x in claim_nos if x not in cases]
    if unknown:
        sys.exit(f"Refused: not among the 22 approved claims: {unknown}")

    print("no-key tool tests")
    t = subprocess.run([sys.executable, str(BENCH / "test_tools.py")], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    last = [l for l in t.stdout.splitlines() if "passed" in l]
    print("  " + (last[-1] if last else "no result"))
    if t.returncode != 0:
        sys.exit("Refused: the no-key tool tests failed. Fix the tools before a paid run.")

    ledger = load(LEDGER) if LEDGER.exists() else {"cap_usd": LEDGER_CAP, "total_usd": 0.0, "runs": []}
    if ledger["total_usd"] >= LEDGER_CAP and not a.over_budget:
        sys.exit(f"Stopped: the ledger is at USD {ledger['total_usd']:.4f}, the USD {LEDGER_CAP:.2f} cap. Ask the founder.")

    load_key()
    run_id = time.strftime("%Y%m%d-%H%M%S") + ("-sample" if a.sample else "") + f"-{a.model.split('-')[1]}"
    run_dir = RUNS / run_id
    (run_dir / "logs").mkdir(parents=True, exist_ok=True)
    print(f"run {run_id}: {len(claim_nos)} claims on {a.model}")
    results = asyncio.run(run(a.model, claim_nos, run_dir))

    usage_by_model = {}
    for r in results:
        u = usage_by_model.setdefault(r["model"], {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0,
                                                   "cache_read_input_tokens": 0, "cost_usd": 0.0})
        for k, v in r["usage"].items():
            u[k] += v
        u["cost_usd"] = round(u["cost_usd"] + r["cost_usd"], 5)
    spend = round(sum(r["cost_usd"] for r in results), 5)
    scores = score_run(run_dir, claim_nos)
    meta = {"run_id": run_id, "model": a.model, "claim_nos": claim_nos, "sample": a.sample,
            "results": results, "scores": scores,
            "summary": {"usage_by_model": usage_by_model, "cost_usd": spend, "score": summarise(scores)}}
    (run_dir / "run.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    # the sprint's spend ledger (check-benchmark-run.py) prices a run from benchmark/results*.json
    (BENCH / f"results-{run_id}.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    ledger["runs"].append({"run_id": run_id, "model": a.model, "claims": len(claim_nos), "cost_usd": spend})
    ledger["total_usd"] = round(ledger["total_usd"] + spend, 5)
    RESULTS.mkdir(parents=True, exist_ok=True)
    LEDGER.write_text(json.dumps(ledger, indent=1), encoding="utf-8")
    s = meta["summary"]["score"]
    print(f"\npassed {s['cases_passed']}  cause {s['proximate_cause']}  gates {s['gate_statuses']}  "
          f"clause {s['governing_clause']}  payable {s['payable']}  recorded {s['advice_recorded']}")
    print(f"spend USD {spend:.4f}; ledger USD {ledger['total_usd']:.4f} of {LEDGER_CAP:.2f}")
    for sc in scores:
        if not sc["pass"]:
            print(f"  FAIL {sc['claim_no']} {sc['label']}: " + ", ".join(
                k for k in ("proximate_cause", "gate_statuses", "governing_clause", "payable", "advice_recorded",
                            "no_forbidden_ground", "flags") if not sc[k])
                  + f"  (statuses {sc['statuses']}, clause {sc['governing_got']!r}, figure {sc['figure_got']})")


if __name__ == "__main__":
    main()
