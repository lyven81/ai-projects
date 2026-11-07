"""
The "Under the hood" tab of the claim file page: the recorded run of one claim,
replayed step by step from its tool log. Shows how one AI agent with four MCP
tools works as a retrieval (RAG) knowledge assistant: the claim documents come
in as resources, the wording comes back from search_policy, code sets each gate
and the figure, and the guard checks the advice before it is recorded.

Nothing here is written by hand: every row is a logged call and its result.
"""

import html
import json

MODEL_NAME = {"claude-haiku-5-5": "Claude Haiku 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5"}
STATUS = {"pass": "Passed", "fail": "Failed", "pass_flagged": "Passed, flagged"}
DOC = {"incident": "the incident report", "adjuster": "the adjuster's report", "schedule": "the policy schedule"}


def esc(s):
    return html.escape(str(s), quote=False)


def chip(kind, text):
    return f'<span class="chip {kind}">{esc(text)}</span>'


def _val(v):
    v = v.get("value") if isinstance(v, dict) else v
    if isinstance(v, list):
        if v and isinstance(v[0], dict):
            return f"{len(v)} items"
        return ", ".join(map(str, v)) or "none"
    return "none" if v is None else str(v)


def _search_row(e):
    a, r = e["args"], e["result"]
    asked = f'code "{a["code"]}"' if a.get("code") else f'"{a.get("query", "")}"'
    if r.get("error"):
        return asked, f'{chip("err", r["error"])} {esc(r.get("message", ""))}'
    res = r.get("results") or []
    if not res:
        return asked, "Nothing in the wording answers this: an empty result, not an error."
    items = []
    for c in res:
        note = f' <span class="meta">({esc(c["authority_note"])})</span>' if c.get("authority_note") else ""
        items.append(f'<code>{esc(c["chunk_id"])}</code> {esc(c["authority"])}{note}')
    return asked, "<br>".join(items)


def _gate_row(e):
    a, r = e["args"], e["result"]
    facts = a.get("facts") or {}
    rows = "".join(f'<tr><td><code>{esc(k)}</code></td><td>{esc(_val(v))}</td>'
                   f'<td class="meta">{esc(v.get("source", "") if isinstance(v, dict) else "")}</td></tr>'
                   for k, v in facts.items())
    asked = (f'Gate {a.get("gate")}, {len(facts)} fact{"s" if len(facts) != 1 else ""}'
             f'<details><summary>Facts supplied</summary><table><tr><th>Fact</th><th>Value</th><th>Source</th></tr>{rows}</table></details>')
    if r.get("error"):
        return asked, f'{chip("err", r["error"])} {esc(r.get("message", ""))}'
    cls = {"pass": "ok", "pass_flagged": "flag", "fail": "no"}[r["status"]]
    tests = r.get("tests") or []
    extra = ""
    if tests and isinstance(tests[0], dict) and "test" in tests[0]:
        extra = "<br>" + "; ".join(f'{esc(t["test"])} {esc(t["result"])}' for t in tests)
    elif tests and isinstance(tests[0], dict) and "ref" in tests[0]:
        extra = "<br>" + "; ".join(f'ref {esc(t["ref"])} {esc(t["result"])}' + (f' ({esc(t["clause"])})' if t["result"] != "admitted" else "")
                                   for t in tests)
    return asked, f'{chip(cls, STATUS[r["status"]])} <b>{esc(r["clause"])}</b>. {esc(r["reason"])}<span class="meta">{extra}</span>'


def _pay_row(e):
    a, r = e["args"], e["result"]
    asked = f'{len(a.get("items") or [])} items, sums insured and values at risk'
    if r.get("error"):
        return asked, f'{chip("err", r["error"])} {esc(r.get("message", ""))}'
    if r["label"] == "not priced":
        return asked, f'{chip("no", "Not priced")} {esc(r.get("reason", ""))}'
    if r["label"] == "payable":
        head = f'{chip("ok", "Payable")} RM {r["payable"]:,.2f}'
    else:
        head = f'{chip("no", "Not payable")} but-for RM {r["but_for"]:,.2f}'
    lines = "".join(f"<div><code>{esc(l)}</code></div>" for l in r.get("working", []) if l.strip())
    return asked, f'{head}<details><summary>Working</summary>{lines}</details>'


def _submit_row(e):
    r = e["result"]
    asked = "The six-gate advice, quotes, facts, flags, governing clause and figure"
    if r.get("recorded"):
        return asked, f'{chip("ok", "Recorded")} The guard found every quote in retrieved wording, every status as code set it, the governing clause and the figure as code returned them.'
    faults = "".join(f'<div>{chip("err", f["error"])} <code>{esc(f["line"])}</code> {esc(f["message"])}</div>'
                     for f in r.get("faults") or [])
    return asked, f'{chip("no", "Sent back")} {faults}'


ROW = {"search_policy": _search_row, "check_gate": _gate_row, "calculate_payable": _pay_row, "submit_advice": _submit_row}
WHAT = {"search_policy": "Finds the wording, ranked by authority against this claim's schedule",
        "check_gate": "Code applies the gate's test to the facts and sets the status",
        "calculate_payable": "Code prices the loss: exclusions, average per item, excess",
        "submit_advice": "The guard checks the advice before it is recorded"}


def hood_html(log, meta):
    if not log:
        return "<h2>Under the hood</h2><p class=\"meta\">No recorded run for this claim.</p>"
    calls = [e for e in log if e["kind"] == "tool"]
    docs = [e["name"].rsplit("/", 1)[-1] for e in log if e["kind"] == "resource"]
    count = {n: sum(1 for e in calls if e["name"] == n) for n in ROW}
    errors = sum(1 for e in calls if e["result"].get("error"))
    model = MODEL_NAME.get((meta or {}).get("model"), (meta or {}).get("model", ""))
    out = ["<h2>Under the hood</h2>",
           "<p>One AI agent, the underwriter, works this claim through an MCP server. It reads the claim file, "
           "looks up the policy wording, and hands each decision to code. Below is the recorded run of this claim, "
           "call by call, as the tool log holds it.</p>",
           "<h3>How the pieces fit</h3>",
           "<table><tr><th>Part</th><th>What it is</th><th>Who acts</th></tr>"
           "<tr><td>Resources</td><td><code>claim://{claim_no}/incident</code>, <code>/adjuster</code>, <code>/schedule</code>: "
           "the three documents an examiner reads, attached to the agent's first message. "
           "<code>policy://clause/{code}</code> serves any clause of the wording.</td><td>MCP server</td></tr>"
           "<tr><td><code>search_policy</code></td><td>The retrieval step of the knowledge assistant: vector and keyword search over 117 clauses, "
           "a reranker, then precedence by authority against this claim's schedule. Only wording returned here may be quoted or relied on.</td><td>AI asks, code answers</td></tr>"
           "<tr><td><code>check_gate</code></td><td>The AI supplies the facts with their source; code applies the gate's test and sets the status, in order 1 to 6.</td><td>AI supplies facts, code decides the status</td></tr>"
           "<tr><td><code>calculate_payable</code></td><td>Code prices the loss after the gates.</td><td>Code</td></tr>"
           "<tr><td><code>submit_advice</code></td><td>The guard checks quotes, statuses, governing clause and figure; a fault is sent back with the line named.</td><td>Code checks, the AI fixes</td></tr>"
           "<tr><td>The decision</td><td>The claims examiner reads the file and the advice.</td><td>The examiner</td></tr></table>",
           "<h3>This run</h3>",
           f"<p>{esc(model)} read {', '.join(DOC.get(d, d) for d in docs)}, then made {len(calls)} tool calls: "
           f"{count['search_policy']} searches of the policy, {count['check_gate']} gate checks, "
           f"{count['calculate_payable']} pricing and {count['submit_advice']} submission{'s' if count['submit_advice'] != 1 else ''}."
           + (f" {errors} call{'s were' if errors != 1 else ' was'} refused or sent back and then fixed." if errors else "")
           + "</p>",
           "<table><tr><th>#</th><th>Tool</th><th>The AI asked for</th><th>Code returned</th></tr>"]
    seen = set()
    for i, e in enumerate(calls, 1):
        asked, got = ROW[e["name"]](e)
        what = "" if e["name"] in seen else f'<div class="meta">{esc(WHAT[e["name"]])}</div>'
        seen.add(e["name"])
        out.append(f'<tr><td>{i}</td><td><code>{esc(e["name"])}</code>{what}</td>'
                   f'<td>{asked}</td><td>{got}</td></tr>')
    out.append("</table>")
    return "\n".join(out)
