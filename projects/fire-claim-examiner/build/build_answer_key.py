"""
Build answer-key.html: the expected result for each of the 22 claims, written
before the run and checked by an independent reviewer, in peril order.

    python build/build_answer_key.py
"""

import html
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
STATUS = {"pass": "Passed", "fail": "Failed", "not_reached": "Not reached", "pass_flagged": "Passed, flagged"}


def esc(s):
    return html.escape(str(s), quote=False)


def money(v):
    return f"RM {v:,.2f}"


def main():
    cases = json.loads((BASE / "benchmark" / "cases.json").read_text(encoding="utf-8"))["cases"]
    summary = []
    blocks = []
    for i, c in enumerate(cases, 1):
        e = json.loads((BASE / "cases" / c["folder"] / "expected.json").read_text(encoding="utf-8"))
        if c["determination"] == "APPROVE":
            fig = money(c["payable"])
        elif c["but_for"] is not None:
            fig = f"0 (but for: {money(c['but_for'])}, not payable)"
        else:
            fig = "0, not priced"
        decided = next((g for g in e["gates"] if g["status"] == "fail"), None)
        result = f"Failed at gate {decided['gate']}" if decided else (
            "All passed, one flagged" if any(g["status"] == "pass_flagged" for g in e["gates"]) else "All passed")
        summary.append(f"<tr><td>{esc(c['peril'])}</td><td>{esc(c['claim_no'])}</td><td>{esc(c['label'])}</td>"
                       f"<td>{result}</td><td>{esc(c['governing_clause'])}</td><td>{esc(fig)}</td></tr>")
        gates = "".join(f"<tr><td>{g['gate']}. {esc(g['name'])}</td><td>{STATUS[g['status']]}</td><td>{esc(g['reason'])}</td></tr>"
                        for g in e["gates"])
        quotes = "".join(f"<tr><td>{esc(q['clause'])}</td><td><code>{esc(q['chunk_id'])}</code></td><td>{esc(q['text'])}</td></tr>"
                         for q in e["quotes"])
        flags = "".join(f"<li>{esc(f['flag'])}</li>" for f in (e.get("underwriting_flags") or []))
        amb = "".join(f"<li><b>{esc(a['clause'])}:</b> {esc(a['question'])} {esc(a['expected_behaviour'])}</li>"
                      for a in (e.get("ambiguity") or []))
        pc = e["proximate_cause"]
        blocks.append(
            f"<h2>{i}. {esc(c['label'])} ({esc(c['claim_no'])})</h2>"
            f"<p><b>Peril:</b> {esc(c['peril'])} · <b>Channel:</b> {esc(c['channel'])} · <b>Result:</b> {result} · "
            f"<b>Governing clause:</b> {esc(c['governing_clause'])} · <b>Figure:</b> {esc(fig)}</p>"
            f"<h3>Proximate cause</h3><p>{esc(pc['cause'])}. {esc(' '.join(pc['sequence']))} Intervening event: {esc(pc['intervening_event'])}.</p>"
            f"<table><tr><th>Gate</th><th>Expected</th><th>Reason</th></tr>{gates}</table>"
            f"<h3>Wording the advice should quote</h3><table><tr><th>Clause</th><th>Chunk</th><th>Wording</th></tr>{quotes}</table>"
            + (f"<h3>Underwriting flags</h3><ul>{flags}</ul>" if flags else "")
            + (f"<h3>Open points for the examiner</h3><ul>{amb}</ul>" if amb else ""))
    page = TEMPLATE.replace("__SUMMARY__", "".join(summary)).replace("__BLOCKS__", "\n".join(blocks))
    (BASE / "answer-key.html").write_text(page, encoding="utf-8")
    print(f"{len(cases)} claims -> answer-key.html")


TEMPLATE = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><link rel="icon" href="../../favicon.ico" sizes="any"><link rel="icon" href="../../favicon.svg" type="image/svg+xml"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Answer Key</title>
<style>
:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 60px}
.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:14px;z-index:2}
.top h1{font-size:22px;margin:0;color:var(--navy)}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px;margin-top:6px;max-height:4.5em;overflow:auto}
nav a{color:var(--accent);text-decoration:none}
h2{font-size:18px;color:var(--navy);margin:34px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--line)}
h3{font-size:15.5px;color:var(--navy);margin:22px 0 6px}
h3+p,h3+p+p{background:var(--card);border-left:3px solid var(--accent);margin:0;padding:6px 14px}
a{color:var(--accent)}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
.tw{overflow-x:auto}
code{background:var(--box);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:13px}
ul,ol{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px 10px 32px}
.crumb{font-size:13px;color:var(--muted);margin:0 0 4px}.crumb a{color:var(--accent);text-decoration:none}
footer{margin-top:36px;font-size:12px;color:var(--muted)}
</style></head>
<body><div class="wrap">
<div class="top"><p class="crumb"><a href="../../index.html">AI Projects</a> / <a href="../../fire-claim-examiner.html">Fire Policy Underwriter Advisor</a></p><h1>Answer Key: Fire Policy Underwriter Advisor</h1><nav id="toc"></nav></div>
<p><b>What this is.</b> The expected result for each of the 22 claims, written before the run and checked by an independent reviewer for judgement (7 Nov 2026). The benchmark scores the underwriter's advice against it: proximate cause, every gate status, the governing clause and the figure to the ringgit.</p>
<p><b>Order.</b> By peril, then claim number. The first failed gate decides; a gate after it is not reached. A declined claim carries the figure the policy would have paid but for that ground, labelled not payable, where there is a basis to price it.</p>
<h2>Summary</h2>
<table><tr><th>Peril</th><th>Claim</th><th>Case</th><th>Result</th><th>Governing clause</th><th>Figure</th></tr>__SUMMARY__</table>
__BLOCKS__
<footer>© 2026 Lee Yih Ven · Answer Key: Fire Policy Underwriter Advisor</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent.replace(/ \\(CLM.*$/,'');toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script></body></html>
"""

if __name__ == "__main__":
    main()
