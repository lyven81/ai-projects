"""
The sample page for the founder: the 28 sample runs (the first selected question of each category, asked
by all four staff) on Claude Haiku 5.5, expected against actual, with each conversation and the review notes
from reading every reply. Reads benchmark/sample.json and cases.json; writes
_plan/Sample run - 22 Oct 26.html in the working copy. Run after the sample.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PLAN = os.path.join(ROOT, "..", "..", "_plan")
S = json.load(open(os.path.join(HERE, "sample.json"), encoding="utf-8"))
C = {c["id"]: c for c in json.load(open(os.path.join(HERE, "cases.json"), encoding="utf-8"))["cases"]}
CSS = open(os.path.join(ROOT, "lib", "masterkit.css"), encoding="utf-8").read()
NAMES = {"PD-01-01": "Dr Aisyah Rahman", "PD-02-01": "Dr Daniel Ong", "PD-02-02": "Dr Priya Nair", "FD-02-01": "Nurul Huda"}
e = html.escape

# Review notes from reading every conversation (22 Oct 2026). Severity: fail (wrong in substance), note (worth fixing).
REVIEW = {
    "Q5.1-PD-01-01": ("fail", "Dr Priya's consult was already waiting in Dr Aisyah's action list, but the agent tried to raise a consult instead and then said one could be raised. Scored a fail. Fix: when the lead's raise is refused and a consult on that patient is open to her, next_step names the open consult; and a worked example in the prompt."),
    "Q3.1-FD-02-01": ("fail", "Scored a pass, but wrong in substance: Dr Daniel's prescription was already recorded, and the agent told Nurul Huda that Dr Daniel still needs to enter it. It opened the registration view instead of her action list or the prescriptions view. The Answer Key accepted any view; fix: require the prescriptions view or her action list, and add a worked example of the clerk executing a doctor's recorded instruction."),
    "Q7.1-PD-02-01": ("note", "Nothing was written, but the agent tried to record an approval Dr Daniel never stated (create_request decide with no request ID; the tool returned an error). Fix: the hook refuses a decide call by anyone who owns no pending request of that kind, and the prompt example shows the policy-gap reply."),
    "Q2.1-PD-02-01": ("note", "The reply gives 'around Thursday 5 November 2026', counted from today; OP-08 counts from the recorded encounter (Monday 2 November 2026). Doctors cannot book, so the reply should give no date. Same in Q2.1 for Dr Aisyah and Dr Priya."),
    "Q2.1-PD-02-02": ("note", "As Q2.1 Dr Daniel: a date counted from today, and a refused callback request tried first."),
    "Q2.1-PD-01-01": ("note", "As Q2.1 Dr Daniel: a date counted from today."),
    "Q1.1-PD-01-01": ("note", "Correct refusal; the wording repeats the name ('Dr Daniel, Dr Daniel Ong')."),
}


def calls(r):
    out = []
    for t in r["trace"]:
        if t["type"] != "tool":
            continue
        res = t["result"]
        s = f"{t['name']} {res['status']}" + (f" {res['error']['code']}" if res.get("error") else "")
        ns = res.get("next_step") or {}
        if ns.get("staff_id"):
            s += f", names {ns['staff_id']}"
        if t.get("hook") and t["hook"].get("capacity"):
            s += f", {t['hook']['capacity']} capacity"
        out.append(s)
    return out


def expected(c):
    x = c["expect"]
    if x.get("resource") is not None:
        return "Fee Schedule served" if x["resource"] else "Fee Schedule not served"
    if x.get("no_write"):
        return "nothing written" + (f"; names {', '.join(x['reply_names'])}" if x.get("reply_names") else "")
    parts = [f"{x['not_offered']} not offered"] if x.get("not_offered") else []
    for a in x.get("any_of", []):
        parts.append(f"{a['tool']} {a['status']}" + (f" {a['code']}" if a["code"] else "") + (f", names {a['names']}" if a["names"] else "") + (f", {a['capacity']}" if a["capacity"] else ""))
    return "; or ".join(parts)


rows = {}
for r in S["results"]:
    c = C[r["id"]]
    rows.setdefault(c["q"], []).append((c, r))
sm = S["summary"]
fails = [k for k, v in REVIEW.items() if v[0] == "fail"]
body = ""
for q, items in rows.items():
    c0 = items[0][0]
    body += f"<h2>{q} {e(c0['category'])}</h2>\n<p><strong>Question:</strong> {e(c0['message'])}</p>\n"
    t = "<table><tr><th>Asked by</th><th>Expected (Answer Key)</th><th>What the tools did</th><th>Scored</th><th>Reply</th></tr>\n"
    for c, r in items:
        note = REVIEW.get(r["id"])
        rev = f"<br><b>Review ({'wrong in substance' if note[0] == 'fail' else 'note'}):</b> {e(note[1])}" if note else ""
        t += (f"<tr><td>{NAMES[c['staff']]}</td><td>{e(expected(c))}</td><td>{'<br>'.join(e(x) for x in calls(r)) or 'no tool'}</td>"
              f"<td>{'pass' if r['score']['pass'] else '<b>fail</b>'}</td><td>{e(r['reply'] or '').replace(chr(10), '<br>')}{rev}</td></tr>\n")
    body += t + "</table>\n"
u = sm["usage"]
reworded = sm.get("reworded", 0)
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sample Run</title><style>{CSS}
td:nth-child(5){{min-width:320px}}</style></head><body><div class="wrap">
<div class="top"><h1>Sample Run: Sang Kancil Specialist Clinic</h1><nav id="toc"></nav></div>
<p><strong>Date and purpose:</strong> Thursday 22 October 2026. The sample before the full run (founder: the first selected question of each category, asked by all four staff): 7 questions x 4 = 28 runs on Claude Haiku 5.5, for the founder to read and approve before the full run of 92.</p>
<p><strong>Built from:</strong> <code>benchmark/sample.json</code> (run {e(sm['ranAt'])}, {sm['seconds']} seconds) and the Answer Key (<code>benchmark/cases.json</code>, written before the run).</p>
<p><strong>Scored from the tool log:</strong> {sm['total']['pass']} of {sm['total']['total']} passed; hard-limit breaches {sm['hard_limit_breaches']}. First tool right in {sm['tool_selection']['first_right']} of {sm['tool_selection']['runs']} runs.</p>
<p><strong>Read, every conversation:</strong> {len(fails)} runs are wrong in substance (Q5.1 Dr Aisyah, scored a fail; Q3.1 Nurul Huda, scored a pass because the Answer Key accepted any view), and {len(REVIEW) - len(fails)} have notes worth fixing. Each is marked in its row with the proposed fix.</p>
<p><strong>Cost:</strong> USD 0.07 by the spend ledger. Tokens: input {u.get('input_tokens', 0):,}, output {u.get('output_tokens', 0):,}, cache read {u.get('cache_read_input_tokens', 0):,}, cache write {u.get('cache_creation_input_tokens', 0):,}. Replies sent back once to replace he or she with names: {reworded} of 28; each is an extra call.</p>
<p><strong>For the founder:</strong> approve the sample as it is, or approve the fixes first (rerun the affected sample runs with --only, then the full run).</p>
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; Sample Run</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);}});
document.querySelectorAll('table').forEach(t=>{{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);}});
</script></body></html>"""
assert "—" not in page
out = os.path.join(PLAN, "Sample run - 22 Oct 26.html")
open(out, "w", encoding="utf-8").write(page)
print("written", os.path.abspath(out))
