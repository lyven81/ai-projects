import html
import json
import os
import sys
# The sample questions page: one question per category (founder, 27 Oct: category D is the workflow example),
# taken from the Answer Key (cases.json) with the final recorded Haiku 5.5 run (results.json): who sends it, what
# must happen, the reply each person saw, and how it scored. Writes benchmark/Sample Questions.html.
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
cases = json.load(open(os.path.join(HERE, "cases.json"), encoding="utf-8"))
sample = json.load(open(os.path.join(HERE, "results.json"), encoding="utf-8"))
REC = {r["id"]: r for r in sample["results"]}
CASE = {c["id"]: c for c in cases["cases"]}
NAME = {"FD-01": "Siti Kasim, clinic assistant", "GP-01": "Dr Sivakumar, GP and owner", "PH-01": "Ms Yong, pharmacist"}
CAT = {"own_job": ("A. Own job", "One person doing their own work alone."),
       "unauthorised": ("B. Unauthorised", "A person asking for something outside their role, refused."),
       "handover": ("C. Handover loop", "The sender needs someone else to decide; the receiver's answer decides the next step; the work waits on it."),
       "workflow": ("D. Workflow across the team", "Each person does their own part of one process in order; nobody waits on another's decision.")}
e = lambda s: html.escape(str(s), quote=False)


def expected(x):
    if x.get("no_tool"):
        return "Own task list only; nothing changes"
    return f"<code>{x['tool']} {x['action']}</code> {x['status']}" + (f" <code>{x['code']}</code>" if x.get("code") else "")


def badges(checks):
    names = {"right_tool": "right tool", "right_action": "right action", "right_result": "right result", "data": "data check"}
    return " ".join(f'<span class="b {"ok" if v else "no"}">{names[k]}</span>' for k, v in checks.items())


body = []
total_steps = 0
for i, s in enumerate(cases["sample"], 1):
    c = CASE[s["id"]]
    rid = f"{c['id']}-{s['staff'][:2]}" if s.get("staff") else c["id"]
    r = REC.get(rid)
    label, meaning = CAT[c["group"]]
    body.append(f"<h2>{i}. {e(label)}</h2>")
    body.append(f"<p class=\"meta\">{e(meaning)} The sample question for this category: <b>{c['id']}</b>, of {sum(1 for x in cases['cases'] if x['group'] == c['group'])} in the Answer Key.</p>")
    body.append(f"<h3>{c['id']}. {e(c['title'])}</h3>")
    body.append(f"<p>{e(c.get('plain', ''))}</p>")
    if c["group"] == "workflow":
        steps = [{"staff": x["staff"], "message": x["message"], "expect": x["expect"]} for x in c["steps"]]
    else:
        steps = [{"staff": s["staff"], "message": c["message"], "expect": c["expect"][s["staff"]]}] + [{"staff": x["staff"], "message": x["message"], "expect": x["expect"]} for x in c["steps"]]
    rows = []
    for k, st in enumerate(steps):
        rs = r["steps"][k] if r and k < len(r["steps"]) else None
        reply = e(rs["reply"].split("\nBasis: ")[0]) if rs else "Not recorded"
        basis = e(rs["reply"].split("\nBasis: ")[1]) if rs and "\nBasis: " in rs["reply"] else ""
        got = "; ".join(f"<code>{t['name']} {t['input'].get('action', '')}</code> {t['result']['status']}" for t in rs["trace"] if t["type"] == "tool") if rs else ""
        rows.append(f"<tr><td>{k + 1}</td><td>{e(NAME[st['staff']])}</td><td>{e(st['message'])}</td><td>{expected(st['expect'])}<div class=\"small\">{e(st['expect'].get('note', ''))}</div></td>"
                    f"<td>{reply}{f'<div class=small>Basis: {basis}</div>' if basis else ''}<div class=\"small\">Called: {got or 'no tool'}</div></td><td>{badges(rs['checks']) if rs else ''}</td></tr>")
        total_steps += 1
    body.append("<table><tr><th>Step</th><th>Who</th><th>Message</th><th>What must happen</th><th>Reply in the recorded run</th><th>Scored</th></tr>" + "".join(rows) + "</table>")
    if r:
        body.append(f"<p class=\"meta\">Run <b>{rid}</b>: {'passed' if r['pass'] else 'failed'}; hard-limit breaches: {len(r['breaches'])}.</p>")
    if c["group"] in ("own_job", "unauthorised", "handover"):
        others = [u for u in ("FD-01", "GP-01", "PH-01") if u != s["staff"] and u in c["expect"]]
        if others:
            body.append("<p class=\"meta\">The same question sent by the person who may do it, in the full run: " + "; ".join(f"{e(NAME[u])}: {expected(c['expect'][u])}" for u in others) + ".</p>")

sm = sample["summary"]
CSS = open(os.path.join(ROOT, "lib", "masterkit.css"), encoding="utf-8").read() + """
.meta{color:var(--muted);font-size:13.5px}.small{font-size:12px;color:var(--muted);margin-top:4px}
.b{display:inline-block;font-size:11px;border-radius:10px;padding:1px 7px;margin:2px 2px 0 0;border:1px solid var(--line)}
.b.ok{background:#e6f4ec;color:#1f6b45}.b.no{background:#fbe9e5;color:#9a3b26}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .b.ok{background:#173326;color:#8fd3ad}:root:not([data-theme="light"]) .b.no{background:#3a1f19;color:#f0a89a}}
"""
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Polyclinic Sivakumar Sample Questions</title><link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><style>{CSS}</style></head><body><div class="wrap">
<div style="font-size:13px;margin:0 0 6px"><a href="../../../index.html">AI Projects</a> / <a href="../../../polyclinic-sivakumar.html">Polyclinic Sivakumar Clinic Desk</a> · <a href="../clinic-desk.html">Clinic desk</a></div>
<div class="top"><h1>Polyclinic Sivakumar Sample Questions</h1><nav id="toc"></nav></div>
<p><b>Tuesday 2 June 2026, 10:00 Malaysia time (the test calendar).</b> One sample question per category, as recorded in the final full run on Claude Haiku 5.5.</p>
<p><b>Built from:</b> <code>benchmark/cases.json</code> (the Answer Key) and <code>benchmark/results.json</code> (the final run, {e(sm['ranAt'][:10])}).</p>
<p><b>Result for these four:</b> {sum(1 for s in cases['sample'] if REC[(s['id'] + '-' + s['staff'][:2]) if s.get('staff') else s['id']]['pass'])} of 4 runs passed; {total_steps} steps. The full run: {sm['total']['pass']} of {sm['total']['total']} runs, hard-limit breaches {sm['hard_limit_breaches']}. Scored from the tool log and the data, never the reply wording.</p>
<p><b>Categories:</b> A own job, B unauthorised, C handover loop, D workflow across the team. The full run adds the other questions of each category (19 in all) and the four failure runs: 53 runs.</p>
{''.join(body)}
<footer>© 2026 Lee Yih Ven · Polyclinic Sivakumar Sample Questions</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);}});
document.querySelectorAll('table').forEach(t=>{{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);}});
</script></body></html>"""
out = os.path.join(HERE, "Sample Questions.html")
open(out, "w", encoding="utf-8").write(page)
assert "—" not in page
print(out)
