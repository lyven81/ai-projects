"""
The benchmark: the advisor on the 20 cases of the Answer Key.

Scored from what the system did (the tool log and the guidance the guard
accepted), never from how the reply reads; the founder reads the wording.
Before any paid call it runs the no-key tests and refuses to spend if one
fails, and it keeps a cost ledger: at USD 2.00 it stops and asks the founder.

    python benchmark/run_benchmark.py --sample                        # the 3-case sample, Haiku
    python benchmark/run_benchmark.py                                 # all 20, once
    python benchmark/run_benchmark.py --only 5,H1 --repeat 2          # a rerun, each case twice
    python benchmark/run_benchmark.py --model claude-sonnet-5-5 --only 5
    python benchmark/run_benchmark.py --rescore <run_id>              # score again, no spend

The key is read from the environment, or from the git-ignored .env in the
user's home folder. It is never printed or logged.
"""
import argparse
import asyncio
import json
import os
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
SAMPLE = ["1", "5", "H1"]          # a valid answer, missing facts, a handover
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "engine"))

import intake  # noqa: E402


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
def base(code):
    return str(code or "").split("(")[0].strip().upper().replace("ACT-S", "ACT-s")


def replay(log):
    """What the system did, from the tool log: intake, tools called, the accepted guidance."""
    rec = {"intake": None, "tools": [], "guidance": None, "exhausted": False}
    for e in log:
        if e["kind"] == "intake":
            rec["intake"] = e["result"]
        if e["kind"] != "tool":
            continue
        rec["tools"].append(e["name"])
        r = e["result"]
        if e["name"] == "submit_guidance":
            if r.get("status") == "recorded":
                rec["guidance"] = e["args"]["guidance"]
            if r.get("error") == "retries_exhausted":
                rec["exhausted"] = True
    return rec


def score_tools(exp, rec):
    if not exp["tools"]:
        return not rec["tools"]
    return set(exp["tools"]) <= set(rec["tools"])


def score_recorded(exp, rec):
    if exp.get("no_model_call"):
        return bool(rec["intake"] and rec["intake"].get("emergency"))
    return rec["guidance"] is not None and not rec["exhausted"]


def score_type(exp, rec):
    if exp.get("no_model_call"):
        return bool(rec["intake"] and rec["intake"].get("emergency"))
    return (rec["guidance"] or {}).get("complaint_type") in exp["type"]


def cited(rec):
    return {base(r.get("code")) for r in ((rec["guidance"] or {}).get("rules") or []) if isinstance(r, dict)}


def score_rules(exp, rec):
    got = cited(rec)
    return all(any(base(c) in got for c in group) for group in exp["must_cite"])


def score_not_cited(exp, rec):
    return not (cited(rec) & {base(c) for c in exp["must_not_cite"]})


def score_handover(exp, rec):
    if exp.get("no_model_call"):
        return bool(rec["intake"] and rec["intake"].get("emergency")) and exp["handover"] == "emergency"
    h = (rec["guidance"] or {}).get("handover") or None
    return (h.get("reason") if isinstance(h, dict) else None) == exp["handover"]


def score_facts_missing(exp, rec):
    return bool((rec["guidance"] or {}).get("facts_missing")) if exp.get("facts_missing") else True


def score_conflict(exp, rec):
    want = exp.get("conflict_governs")
    if not want:
        return True
    c = (rec["guidance"] or {}).get("conflict") or {}
    return isinstance(c, dict) and base(c.get("governs")) == base(want)


def score_masking(exp, log):
    if not exp.get("masking"):
        return True
    return not any(intake.has_personal_numbers(json.dumps(e, ensure_ascii=False)) for e in log)


def score_no_model_call(exp, result):
    return (result or {}).get("model_calls", 0) == 0 if exp.get("no_model_call") else True


FIELDS = ["tools", "recorded", "type", "rules", "not_cited", "handover", "facts_missing", "conflict", "masking", "no_model_call"]


def score_case(case, log, result):
    exp, rec = case["expect"], replay(log)
    out = {"tools": score_tools(exp, rec), "recorded": score_recorded(exp, rec), "type": score_type(exp, rec),
           "rules": score_rules(exp, rec), "not_cited": score_not_cited(exp, rec), "handover": score_handover(exp, rec),
           "facts_missing": score_facts_missing(exp, rec), "conflict": score_conflict(exp, rec),
           "masking": score_masking(exp, log), "no_model_call": score_no_model_call(exp, result)}
    out["pass"] = all(out[k] for k in FIELDS)
    out["cited"] = sorted(cited(rec))
    out["handover_got"] = ((rec["guidance"] or {}).get("handover") or {}).get("reason") if rec["guidance"] else \
        ("emergency" if rec["intake"] and rec["intake"].get("emergency") else None)
    out["tool_calls"] = len(rec["tools"])
    return out


def read_log(p):
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines()] if p.exists() else []


def score_run(run_dir, entries):
    cases = {c["id"]: c for c in load(BENCH / "cases.json")["cases"]}
    for e in entries:
        log = read_log(run_dir / "logs" / f"{e['id']}-r{e['repeat']}.jsonl")
        e["score"] = score_case(cases[e["id"]], log, e)
    return entries


def summarise(entries):
    n = len(entries)
    s = {"cases_passed": f"{sum(e['score']['pass'] for e in entries)}/{n}"}
    for f in FIELDS:
        s[f] = f"{sum(e['score'][f] for e in entries)}/{n}"
    s["tool_calls_per_case"] = {f"{e['id']}-r{e['repeat']}": e["score"]["tool_calls"] for e in entries}
    return s


# ------------------------------------------------------------------ running
async def run(model, ids, repeat, run_dir):
    import anthropic
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client
    from agent import run_case, to_anthropic_tools

    out = []
    client = anthropic.AsyncAnthropic(max_retries=4)
    for r in range(1, repeat + 1):
        env = dict(os.environ, PYTHONIOENCODING="utf-8", HF_HUB_OFFLINE="1", STRATA_RUN_DIR=str(run_dir / "logs"), STRATA_REPEAT=str(r))
        env.pop("ANTHROPIC_API_KEY", None)          # the MCP server never sees the key
        params = StdioServerParameters(command=sys.executable, args=[str(BASE / "mcp_server.py")], env=env)
        async with stdio_client(params) as (rd, wr):
            async with ClientSession(rd, wr) as s:
                await s.initialize()
                tools = to_anthropic_tools((await s.list_tools()).tools)
                for cid in ids:
                    t0 = time.time()
                    try:
                        res = await run_case(s, client, model, cid, tools)
                    except anthropic.APIError as e:
                        res = {"id": cid, "model": model, "outcome": f"api_error: {type(e).__name__}", "turns": 0,
                               "model_calls": 0, "tool_calls": 0, "tool_errors": 0, "usage": {}, "cost_usd": 0.0,
                               "calls": [], "result": None}
                    res["repeat"] = r
                    res["seconds"] = round(time.time() - t0, 1)
                    # the server logs to <id>.jsonl; keep one log per repeat
                    lp = run_dir / "logs" / f"{cid}.jsonl"
                    if lp.exists():
                        lp.replace(run_dir / "logs" / f"{cid}-r{r}.jsonl")
                    print(f"  r{r} {cid:>3}  {res['outcome']:<22} turns {res['turns']:>2}  tools {res['tool_calls']:>2}  "
                          f"USD {res['cost_usd']:.4f}  {res['seconds']}s", flush=True)
                    out.append(res)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="claude-haiku-5-5")
    ap.add_argument("--sample", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--rescore", default="")
    ap.add_argument("--over-budget", action="store_true", help="only with the founder's yes")
    a = ap.parse_args()

    all_ids = [c["id"] for c in load(BENCH / "cases.json")["cases"]]
    if a.rescore:
        run_dir = RUNS / a.rescore
        meta = load(run_dir / "run.json")
        meta["results"] = score_run(run_dir, meta["results"])
        meta["summary"]["score"] = summarise(meta["results"])
        (run_dir / "run.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
        print(json.dumps(meta["summary"]["score"], indent=1))
        return

    ids = SAMPLE if a.sample else ([x.strip() for x in a.only.split(",") if x.strip()] or all_ids)
    unknown = [x for x in ids if x not in all_ids]
    if unknown:
        sys.exit(f"Refused: not among the 20 cases of the Answer Key: {unknown}")

    print("no-key tests")
    t = subprocess.run([sys.executable, str(BENCH / "test_tools.py")], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=dict(os.environ, ANTHROPIC_API_KEY=""))
    last = [l for l in t.stdout.splitlines() if "passed" in l]
    print("  " + (last[-1] if last else "no result"))
    if t.returncode != 0:
        sys.exit("Refused: the no-key tests failed. Fix the tools before a paid run.")

    ledger = load(LEDGER) if LEDGER.exists() else {"cap_usd": LEDGER_CAP, "total_usd": 0.0, "runs": []}
    if ledger["total_usd"] >= LEDGER_CAP and not a.over_budget:
        sys.exit(f"Stopped: the ledger is at USD {ledger['total_usd']:.4f}, the USD {LEDGER_CAP:.2f} cap. Ask the founder.")

    load_key()
    kind = "sample" if a.sample else ("only" if a.only else "full")
    run_id = time.strftime("%Y%m%d-%H%M%S") + f"-{kind}-{a.model.split('-')[1]}"
    run_dir = RUNS / run_id
    (run_dir / "logs").mkdir(parents=True, exist_ok=True)
    print(f"run {run_id}: {len(ids)} cases x {a.repeat} on {a.model}")
    results = asyncio.run(run(a.model, ids, a.repeat, run_dir))

    usage_by_model = {}
    for r in results:
        u = usage_by_model.setdefault(r["model"], {"input_tokens": 0, "output_tokens": 0, "cache_creation_input_tokens": 0,
                                                   "cache_read_input_tokens": 0, "cost_usd": 0.0})
        for k, v in (r.get("usage") or {}).items():
            u[k] += v
        u["cost_usd"] = round(u["cost_usd"] + r["cost_usd"], 5)
    spend = round(sum(r["cost_usd"] for r in results), 5)
    results = score_run(run_dir, results)
    meta = {"run_id": run_id, "kind": kind, "ids": ids, "repeat": a.repeat, "results": results,
            "summary": {"model": a.model, "usage_by_model": usage_by_model, "cost_usd": spend, "score": summarise(results)}}
    (run_dir / "run.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    (BENCH / f"results-{run_id}.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    ledger["runs"].append({"run_id": run_id, "model": a.model, "cases": len(ids), "repeat": a.repeat, "cost_usd": spend})
    ledger["total_usd"] = round(ledger["total_usd"] + spend, 5)
    RESULTS.mkdir(parents=True, exist_ok=True)
    LEDGER.write_text(json.dumps(ledger, indent=1), encoding="utf-8")
    s = meta["summary"]["score"]
    print(f"\npassed {s['cases_passed']}  " + "  ".join(f"{f} {s[f]}" for f in FIELDS))
    print(f"spend USD {spend:.4f}; ledger USD {ledger['total_usd']:.4f} of {LEDGER_CAP:.2f}")
    for e in results:
        if not e["score"]["pass"]:
            print(f"  FAIL {e['id']} r{e['repeat']}: " + ", ".join(f for f in FIELDS if not e["score"][f])
                  + f"  (cited {e['score']['cited']}, handover {e['score']['handover_got']}, outcome {e['outcome']})")


if __name__ == "__main__":
    main()
