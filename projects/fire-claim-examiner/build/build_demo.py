"""
Build the static claim file page, demo.html, from frozen results.

Four tabs per claim, in the examiner's reading order: the incident report, the
adjuster's report, the policy schedule, and the underwriter's advice. The
advice and the figure come from one recorded run (its tool log and the advice
the guard accepted); nothing is written by hand and no key is needed to view it.

    python build/build_demo.py --run <run_id> [--out demo.html]
"""

import argparse
import sys
import html
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CASES = BASE / "cases"
RUNS = BASE / "benchmark" / "runs"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from hood import hood_html  # noqa: E402


def esc(s):
    return html.escape(str(s), quote=False)


def inline(s):
    s = esc(s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
    return s


NUMERIC = re.compile(r"^[\d,]+\.\d{2}$|^\*\*[\d,]+\.\d{2}\*\*$")


def md_table(lines):
    rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in lines if not re.match(r"^\|\s*-", l)]
    head, body = rows[0], rows[1:]
    num = [i for i in range(len(head)) if body and all(NUMERIC.match(r[i]) or not r[i] for r in body if i < len(r))
           and any(r[i] for r in body if i < len(r))]
    th = "".join(f'<th{" class=\"num\"" if i in num else ""}>{inline(h)}</th>' for i, h in enumerate(head))
    trs = "".join("<tr>" + "".join(f'<td{" class=\"num\"" if i in num else ""}>{inline(c)}</td>'
                                   for i, c in enumerate(r)) + "</tr>" for r in body)
    return f"<table><tr>{th}</tr>{trs}</table>"


def md(text, skip_title=True):
    out, buf, table = [], [], []

    def flush():
        if buf:
            out.append("<p>" + "<br>".join(inline(b.rstrip()) for b in buf) + "</p>")
            buf.clear()
        if table:
            out.append(md_table(table))
            table.clear()

    for line in text.splitlines():
        if line.startswith("|"):
            if buf:
                flush()
            table.append(line)
            continue
        if table:
            flush()
        if line.startswith("# "):
            flush()
            if not skip_title:
                out.append(f"<h2>{inline(line[2:])}</h2>")
        elif line.startswith("## "):
            flush(); out.append(f"<h3>{inline(line[3:])}</h3>")
        elif line.startswith("### "):
            flush(); out.append(f"<h3>{inline(line[4:])}</h3>")
        elif not line.strip() or line.strip() == "---":
            flush()
        else:
            buf.append(line)
    flush()
    return "\n".join(out)


def incident_html(text):
    body = text.split("\n", 1)[1]
    channel = "WhatsApp" if "Channel: WhatsApp" in body else "Email"
    body = re.sub(r"^Channel:.*$", "", body, flags=re.M)
    if channel == "WhatsApp":
        parts = ['<div class="chat">']
        for line in body.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.startswith("### "):
                parts.append(f'<div class="day">{esc(line[4:])}</div>')
                continue
            m = re.match(r"\*\*(.+?)\*\*\s*\(([^)]+)\):\s*(.*)$", line)
            if not m:
                parts.append(f'<div class="att">{inline(line)}</div>')
                continue
            who, t, msg = m.groups()
            msg = inline(msg).replace("&lt;br&gt;", "<br>")
            msg = re.sub(r"\[([^\]]+)\]", r'<span class="att">\1</span>', msg)
            msg = msg.replace("<br>", "<br>")
            if "(agent)" in who:
                parts.append(f'<div class="msg in"><span class="who">{esc(who.replace(" (agent)", ""))}</span>{msg}<span class="t">{esc(t)}</span></div>')
            else:
                parts.append(f'<div class="msg out">{msg}<span class="t">{esc(t)}</span></div>')
        parts.append("</div>")
        return "<h2>Incident report</h2>" + "".join(parts)
    mails = [m for m in re.split(r"^---\s*$", body, flags=re.M) if m.strip()]
    out = ["<h2>Incident report</h2>"]
    for m in mails:
        lines = [l for l in m.strip().splitlines()]
        hd = [l for l in lines if re.match(r"\*\*(From|To|Date|Subject):\*\*", l.strip())]
        rest = [l for l in lines if l not in hd]
        hd_html = "<br>".join(inline(l.strip().rstrip()) for l in hd)
        out.append(f'<div class="mail"><div class="hd">{hd_html}</div>{md(chr(10).join(rest))}</div>')
    return "\n".join(out)


STATUS = {"pass": ("pass", "Passed"), "fail": ("fail", "Failed"), "not_reached": ("skip", "Not reached"),
          "pass_flagged": ("flag", "Passed, flagged")}
NAMES = ["Period of insurance", "Peril insured", "Conditions precedent", "Endorsement held",
         "Endorsement satisfied", "Item admitted"]


def advice_html(advice, figure, chunks):
    if not advice:
        return "<h2>Underwriter's advice</h2><p class=\"meta\">No advice recorded for this claim in this run.</p>"
    rows = []
    gates = {g.get("gate"): g for g in advice.get("gates", [])}
    for n in range(1, 7):
        g = gates.get(n, {})
        cls, label = STATUS.get(g.get("status"), ("skip", "Not reached"))
        quotes = "".join(
            f'<blockquote>{esc(q.get("text", ""))}<span class="cite">{esc(chunks.get(q.get("chunk_id"), q.get("chunk_id", "")))}</span></blockquote>'
            for q in (g.get("quotes") or []))
        app = esc(g.get("application", ""))
        facts = "<br>".join(f'{esc(f.get("fact", ""))} <span class="meta">({esc(f.get("source", ""))})</span>'
                            for f in (g.get("facts_relied_on") or []))
        rows.append(f"<tr><td>{n}. {NAMES[n-1]}</td><td><span class=\"st {cls}\">{label}</span></td>"
                    f"<td>{quotes}{app}</td><td>{facts}</td></tr>")
    out = ["<h2>Underwriter's advice</h2>",
           "<table><tr><th>Gate</th><th>Status</th><th>Wording and application</th><th>Fact relied on</th></tr>"
           + "".join(rows) + "</table>"]
    pc = advice.get("proximate_cause") or {}
    if pc:
        seq = pc.get("sequence")
        seq = " ".join(seq) if isinstance(seq, list) else (seq or "")
        out.append(f"<h3>Proximate cause</h3><p>{esc(pc.get('cause', ''))}</p>"
                   + (f"<p>{esc(seq)}</p>" if seq else "")
                   + f"<p>Intervening event: {esc(pc.get('intervening_event', 'none'))}.</p>")
    conflicts = advice.get("conflicts") or []
    if conflicts:
        out.append("<h3>Claimant's account and the adjuster's finding</h3>")
        out.append("<table><tr><th>Claimant's account</th><th>Adjuster's finding</th><th>Finding applied</th></tr>"
                   + "".join(f"<tr><td>{esc(c.get('claimant_account', ''))}</td><td>{esc(c.get('adjuster_finding', ''))}</td>"
                             f"<td>{esc(c.get('finding_applied', ''))}</td></tr>" for c in conflicts) + "</table>")
    flags = advice.get("flags") or []
    if flags:
        out.append("<h3>Flags for the claims examiner</h3><ul>" +
                   "".join(f"<li>{esc(f if isinstance(f, str) else json.dumps(f, ensure_ascii=False))}</li>" for f in flags) + "</ul>")
    out.append(f"<h3>Advice</h3><p>{esc(advice.get('advice', ''))}</p>")
    out.append(f"<p class=\"meta\">Governing clause: {esc(advice.get('governing_clause', ''))}. The claims examiner decides.</p>")
    if figure:
        if figure.get("label") == "not priced":
            out.append(f"<h3>Figure</h3><p>Not priced. {esc(figure.get('reason', ''))}</p>")
        else:
            head = (f"Payable RM {figure['payable']:,.2f}." if figure["label"] == "payable"
                    else f"Not payable. But for the ground above, the policy would have paid RM {figure['but_for']:,.2f}.")
            lines = [l for l in figure.get("working", []) if l.strip()]
            out.append(f"<h3>Figure</h3><p>{esc(head)}</p>"
                       "<table><tr><th>Working, in the calculator's order</th></tr>"
                       + "".join(f"<tr><td><code>{esc(l)}</code></td></tr>" for l in lines) + "</table>")
    return "\n".join(out)


def build(run_id, out_path, title):
    run_dir = RUNS / run_id
    def cite(c):
        title = c["title"].title() if c["title"].isupper() else c["title"]
        return title if title.lower().startswith(c["code"].lower()) else f"{c['code']}: {title}"
    chunks = {c["chunk_id"]: cite(c)
              for c in json.loads((BASE / "data" / "chunks.json").read_text(encoding="utf-8"))["chunks"]}
    cases = json.loads((BASE / "benchmark" / "cases.json").read_text(encoding="utf-8"))["cases"]
    runmeta = json.loads((run_dir / "run.json").read_text(encoding="utf-8")) if (run_dir / "run.json").exists() else {}
    per_claim = {r["claim_no"]: r for r in runmeta.get("results", [])}
    data, options = {}, []
    for c in cases:
        folder = CASES / c["folder"]
        logp = run_dir / "logs" / f"{c['claim_no']}.jsonl"
        log = [json.loads(l) for l in logp.read_text(encoding="utf-8").splitlines()] if logp.exists() else []
        advice = next((e["args"]["advice"] for e in reversed(log)
                       if e.get("name") == "submit_advice" and e["result"].get("recorded")), None)
        figure = next((e["result"] for e in reversed(log)
                       if e.get("name") == "calculate_payable" and "label" in e["result"]), None)
        data[c["claim_no"]] = {
            "incident": incident_html((folder / "incident.md").read_text(encoding="utf-8")),
            "adjuster": "<h2>Adjuster's report</h2>" + md((folder / "adjuster.md").read_text(encoding="utf-8")),
            "schedule": "<h2>Policy schedule</h2>" + md((folder / "schedule.md").read_text(encoding="utf-8")),
            "advice": advice_html(advice, figure, chunks),
            "hood": hood_html(log, per_claim.get(c["claim_no"])),
        }
        options.append({"id": c["claim_no"], "label": f"{c['peril']} · {c['claim_no']} · {c['label']}",
                        "has": advice is not None})
    tpl = TEMPLATE.replace("__TITLE__", esc(title)).replace("__DATA__", json.dumps(data, ensure_ascii=False)) \
        .replace("__OPTIONS__", json.dumps(options, ensure_ascii=False))
    out_path.write_text(tpl, encoding="utf-8")
    print(f"{len(options)} claims, {sum(o['has'] for o in options)} with advice -> {out_path}")


TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><link rel="icon" href="../../favicon.ico" sizes="any"><link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc;--pass:#2e7d4f;--fail:#b3402f;--skip:#7a8794;--flag:#a86a00}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21;--pass:#6cc790;--fail:#f08a78;--skip:#9aa7b5;--flag:#e6b45c}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21;--pass:#6cc790;--fail:#f08a78;--skip:#9aa7b5;--flag:#e6b45c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 60px}
.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:14px;z-index:2}
.top h1{font-size:22px;margin:0;color:var(--navy)}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;margin-top:8px}
.bar label{font-size:13.5px;color:var(--muted)}
select{font:inherit;font-size:14px;padding:5px 8px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);max-width:100%}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.tabs button{font:inherit;font-size:13.5px;padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--accent);cursor:pointer}
.tabs button[aria-selected="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
h2{font-size:18px;color:var(--navy);margin:26px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--line)}
h3{font-size:15.5px;color:var(--navy);margin:22px 0 6px}
h3+p,h3+p+p,h3+p+p+p{background:var(--card);border-left:3px solid var(--accent);margin:0;padding:6px 14px}
a{color:var(--accent)}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
td.num,th.num{text-align:right;white-space:nowrap}
.tw{overflow-x:auto}
code{background:var(--box);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:12.5px;white-space:pre}
ul,ol{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px 10px 32px}
.meta{font-size:13px;color:var(--muted)}
.st{font-weight:600;white-space:nowrap}
.chip{display:inline-block;font-size:12px;font-weight:600;border:1px solid currentColor;border-radius:4px;padding:0 6px;margin-right:4px;white-space:nowrap}
.chip.ok{color:var(--pass)}.chip.no{color:var(--fail)}.chip.flag{color:var(--flag)}.chip.err{color:var(--fail);background:var(--box)}
details summary{cursor:pointer;color:var(--accent);font-size:13px}
.st.pass{color:var(--pass)}.st.fail{color:var(--fail)}.st.skip{color:var(--skip)}.st.flag{color:var(--flag)}
.cite{display:block;font-style:normal;font-size:12.5px;font-weight:600;color:var(--navy);margin-top:3px}
blockquote{margin:6px 0;padding:4px 12px;border-left:3px solid var(--line);color:var(--ink);font-style:italic;background:var(--box)}
.panel[hidden]{display:none}
.chat{background:var(--box);border:1px solid var(--line);border-radius:10px;padding:12px;max-width:560px}
.day{text-align:center;font-size:12px;color:var(--muted);margin:6px 0}
.msg{max-width:85%;padding:7px 10px 4px;border-radius:9px;margin:6px 0;font-size:14.5px;line-height:1.5;box-shadow:0 1px 0 rgba(0,0,0,.06)}
.msg.in{background:var(--card);border:1px solid var(--line)}
.msg.out{background:#dcf3e4;color:#1f2a36;margin-left:auto}
.msg .t{display:block;text-align:right;font-size:11px;color:var(--muted)}
.msg.out .t{color:#5b6878}
.msg .who{display:block;font-size:12px;font-weight:600;color:var(--accent)}
.att{font-size:13px;color:var(--muted)}
.mail{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:10px 0}
.mail .hd{font-size:13.5px;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:8px;margin-bottom:8px}
.mail p{margin:8px 0}
.mail h3+p{background:none;border:none;padding:0}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) .msg.out{background:#24473a;color:#e3e8ee}:root:not([data-theme="light"]) .msg.out .t{color:#9aa7b5}}
:root[data-theme="dark"] .msg.out{background:#24473a;color:#e3e8ee}:root[data-theme="dark"] .msg.out .t{color:#9aa7b5}
.crumb{font-size:13px;color:var(--muted);margin:0 0 4px}.crumb a{color:var(--accent);text-decoration:none}
footer{margin-top:36px;font-size:12px;color:var(--muted)}
</style>
</head>
<body><div class="wrap">
<div class="top"><p class="crumb"><a href="../../index.html">AI Projects</a> / <a href="../../fire-claim-examiner.html">Fire Policy Underwriter Advisor</a></p>
  <h1>__TITLE__</h1>
  <div class="bar">
    <label for="case">Claim</label>
    <select id="case"></select>
  </div>
  <div class="tabs" role="tablist" id="tabs"></div>
</div>
<div id="content"></div>
<footer>© 2026 Lee Yih Ven · __TITLE__</footer></div>
<script>
const TABS=[["incident","1. Incident report"],["adjuster","2. Adjuster's report"],["schedule","3. Policy schedule"],["advice","4. Underwriter's advice"],["hood","5. Under the hood"]];
const DATA=__DATA__;
const OPTIONS=__OPTIONS__;
const sel=document.getElementById('case'),tabs=document.getElementById('tabs'),content=document.getElementById('content');
OPTIONS.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=c.label;sel.appendChild(o);});
const first=OPTIONS.find(o=>o.has);if(first)sel.value=first.id;
let cur='incident';
TABS.forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.id='t-'+id;b.textContent=label;b.onclick=()=>{cur=id;render();};tabs.appendChild(b);});
function render(){
  const d=DATA[sel.value];
  content.innerHTML=TABS.map(([id])=>`<section class="panel" id="p-${id}" ${id===cur?'':'hidden'}>${d[id]}</section>`).join('');
  TABS.forEach(([id])=>document.getElementById('t-'+id).setAttribute('aria-selected',id===cur));
  content.querySelectorAll('table').forEach(t=>{const w=document.createElement('div');w.className='tw';t.parentNode.insertBefore(w,t);w.appendChild(t);});
}
sel.onchange=render;render();
</script></body>
</html>
"""

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--out", default=str(BASE / "demo.html"))
    ap.add_argument("--title", default="Fire Policy Underwriter Advisor: Claim File")
    a = ap.parse_args()
    build(a.run, Path(a.out), a.title)
