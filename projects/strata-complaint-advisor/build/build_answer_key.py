"""
Build the Answer Key page (answer-key.html) from benchmark/cases.json and the
three runs: runs 1 and 2 are one run of all 20 cases with two repeats, run 3
covers only the cases that failed in either (the 2 + 1 rule, 17 Nov 2026).

    python build/build_answer_key.py --pair <run_id> --third <run_id>
"""
import argparse
import html
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "engine"))
import complaint_file  # noqa: E402

FIELD_LABEL = {"tools": "right tools", "recorded": "guidance passed the guard", "type": "complaint type",
               "rules": "rules cited", "not_cited": "no forbidden rule", "handover": "handover reason",
               "facts_missing": "missing facts named", "conflict": "conflict by precedence",
               "masking": "personal numbers masked", "no_model_call": "no model call"}


def esc(s):
    return html.escape(str(s), quote=True)


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair", required=True)
    ap.add_argument("--third", default="")
    a = ap.parse_args()
    pair = load(BASE / "benchmark" / "runs" / a.pair / "run.json")
    third = load(BASE / "benchmark" / "runs" / a.third / "run.json") if a.third else {"results": [], "run_id": "none"}
    runs = [{"run_id": f"{a.pair}, repeat 1", "results": [x for x in pair["results"] if x["repeat"] == 1]},
            {"run_id": f"{a.pair}, repeat 2", "results": [x for x in pair["results"] if x["repeat"] == 2]},
            {"run_id": third["run_id"], "results": third["results"]}]
    cases = load(BASE / "benchmark" / "cases.json")["cases"]
    rows, both = [], 0
    for c in cases:
        e = c["expect"]
        r = complaint_file.intake_record(c["id"])
        res = []
        for run in runs:
            got = [x for x in run["results"] if x["id"] == c["id"]]
            ok = bool(got) and all(x["score"]["pass"] for x in got)
            miss = sorted({FIELD_LABEL[f] for x in got for f in FIELD_LABEL if not x["score"][f]})
            res.append(("passed" if ok else "did not pass: " + ", ".join(miss)) if got else "")
        both += res[0] == "passed" and res[1] == "passed"
        must = "; ".join(" or ".join(g) for g in e["must_cite"]) or "none required"
        rows.append(f"<tr><td><b>{esc(c['id'])}</b><br>{esc(c['label'])}</td><td>{esc(r['text'])}</td>"
                    f"<td>Tools: {esc(', '.join(e['tools']) or 'none (code only)')}<br>Must cite: {esc(must)}"
                    + (f"<br>Never cite: {esc(', '.join(e['must_not_cite']))}" if e["must_not_cite"] else "")
                    + f"<br>Handover: {esc(e['handover'] or 'none')}"
                    + ("<br>Facts still missing must be named" if e.get("facts_missing") else "")
                    + (f"<br>Conflict: {esc(e['conflict_governs'])} governs" if e.get("conflict_governs") else "")
                    + ("<br>Personal numbers masked" if e.get("masking") else "")
                    + ("<br>No model call" if e.get("no_model_call") else "")
                    + f"</td><td>{esc(c['why'])}</td>" + "".join(f"<td>{esc(x)}</td>" for x in res) + "</tr>")
    run_heads = "".join(f"<th>Run {i + 1}<br><small>{esc(r['run_id'])}</small></th>" for i, r in enumerate(runs))
    third_ids = sorted({x["id"] for x in third["results"]})
    third_ok = [x["id"] for x in third["results"] if x["score"]["pass"]]
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="../../favicon.ico" sizes="any"><link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<title>Strata Complaint Advisor: Answer Key</title><style>
:root{{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}}}
:root[data-theme="dark"]{{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}}
.wrap{{max-width:1100px;margin:0 auto;padding:20px 16px 60px}}.crumb{{font-size:13px}}.crumb a,a{{color:var(--accent)}}
h1{{font-size:22px;color:var(--navy);margin:10px 0}}table{{border-collapse:collapse;width:100%;background:var(--card);font-size:13.5px;margin:8px 0}}
th,td{{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}}th{{background:var(--box);color:var(--navy)}}.tw{{overflow-x:auto}}
footer{{margin-top:36px;font-size:12px;color:var(--muted)}}</style></head><body><div class="wrap">
<div class="crumb"><a href="../../index.html">AI Projects</a> / <a href="../../strata-complaint-advisor.html">Strata Complaint Advisor</a></div>
<h1>Answer Key: Strata Complaint Advisor</h1>
<p>The 20 sample complaints and what the advisor must do on each, written before the advisor was built and reviewed by an independent reviewer before the full runs. Each case is scored from the tool log and the guidance the guard accepted, never from the wording of the reply. Runs 1 and 2 are all 20 cases, twice each; {both} of {len(cases)} passed both. Run 3 covers only the cases that failed in either ({", ".join(third_ids) or "none"}), once: {len(third_ok)} of {len(third_ids)} passed. Every rule code opens in the <a href="documents.html">building documents</a>.</p>
<div class="tw"><table><tr><th>Case</th><th>Complaint, as the advisor reads it</th><th>What it must do</th><th>Why</th>{run_heads}</tr>
{''.join(rows)}</table></div>
<footer>© 2026 Lee Yih Ven · Answer Key: Strata Complaint Advisor</footer></div></body></html>"""
    (BASE / "answer-key.html").write_text(page, encoding="utf-8")
    print("answer-key.html:", both, "of", len(cases), "passed runs 1 and 2; run 3:", third_ok, "of", third_ids)


if __name__ == "__main__":
    main()
