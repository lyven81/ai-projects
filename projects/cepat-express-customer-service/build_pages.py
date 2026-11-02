"""The policy pages: the four resources as HTML in resources/, written from the .md and .json files (the single source).

Every clause row (C1 to C19, S1 to S30, D1 to D8) carries its ID as an anchor, so a link such as
"Customer Service Policy.html#S16" opens the page with that row highlighted. Clause IDs inside the text link to their
own rows. Master Kit layout, with the demo breadcrumb.
  python build_pages.py
"""
import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "resources")
TITLE = "Cepat Express Customer Service"
PAGES = {"C": "Courier Policy.html", "S": "Customer Service Policy.html", "D": "Delivery Status Guide.html"}
ID = re.compile(r"\b(C\d+a?|S\d+[abcd]?|D\d)\b")

CSS = """:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 60px}
.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:14px;z-index:2}
.top h1{font-size:22px;margin:0;color:var(--navy)}
.crumbs{font-size:12.5px;color:var(--muted);margin-bottom:2px}.crumbs a{color:inherit;text-decoration:none}.crumbs a:hover{text-decoration:underline}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px;margin-top:6px}
nav a{color:var(--accent);text-decoration:none}
h2{font-size:18px;color:var(--navy);margin:34px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--line)}
h3{font-size:15.5px;color:var(--navy);margin:22px 0 6px}
a{color:var(--accent)}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
td a.cl{text-decoration:none}
tr{scroll-margin-top:110px}
tr:target td{background:var(--box);box-shadow:inset 3px 0 0 var(--accent)}
tr:target td:first-child{font-weight:700}
.tw{overflow-x:auto}
code{background:var(--box);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:13px}
ul,ol{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px 10px 32px}
footer{margin-top:36px;font-size:12px;color:var(--muted)}"""

SCRIPT = """<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
if(location.hash){const r=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(r)setTimeout(()=>r.scrollIntoView({block:'center'}),50);}
</script>"""


def link_ids(text, page):
    """Clause IDs in the text link to their row, on this page or the page that owns them."""
    def sub(m):
        i = m.group(1)
        target = PAGES[i[0]]
        href = f"#{i}" if target == page else f"{html.escape(target)}#{i}"
        return f'<a class="cl" href="{href}">{i}</a>'
    return ID.sub(sub, text)


def inline(text, page):
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
    return link_ids(t, page)


def md_to_html(md, page):
    """The small Markdown the resources use: headings, paragraphs, tables, bold, code."""
    out, rows, title, n = [], [], None, 0
    def flush():
        nonlocal rows
        if not rows:
            return
        head = rows[0]
        body = [r for r in rows[2:]]
        id_col = 0 if re.fullmatch(r"(C\d+a?|S\d+[abcd]?)", body[0][0] if body else "") else 1 if body and re.fullmatch(r"D\d", body[0][1]) else None
        h = ["<table><tr>" + "".join(f"<th>{inline(c, page)}</th>" for c in head) + "</tr>"]
        for r in body:
            rid = r[id_col] if id_col is not None else None
            cells = "".join(f"<td>{html.escape(c) if k == id_col else inline(c, page)}</td>" for k, c in enumerate(r))
            h.append(f'<tr id="{rid}">{cells}</tr>' if rid else f"<tr>{cells}</tr>")
        out.append("".join(h) + "</table>")
        rows = []
    for line in md.splitlines():
        if line.startswith("|"):
            rows.append([c.strip() for c in line.strip().strip("|").split("|")])
            continue
        flush()
        if line.startswith("# "):
            title = line[2:].strip()
        elif line.startswith("## "):
            n += 1
            out.append(f"<h2>{inline(line[3:].strip(), page)}</h2>")
        elif line.strip():
            out.append(f"<p>{inline(line.strip(), page)}</p>")
    flush()
    return title, "\n".join(out), n


def page(title, file, intro, body):
    others = " · ".join(f'<a href="{html.escape(f)}">{html.escape(f[:-5])}</a>' for f in list(PAGES.values()) + ["Staff Directory.html"] if f != file)
    doc = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title><link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><style>{CSS}</style></head>
<body><div class="wrap">
<div class="top"><div class="crumbs"><a href="../../../index.html">AI Projects</a> / <a href="../../../cepat-express-customer-service.html">{TITLE}</a> / <a href="../demo.html">Demo</a></div><h1>{html.escape(title)}</h1><nav id="toc"></nav></div>
{intro}
<p><b>The other pages:</b> {others} · <a href="../benchmark/Answer Key.html">Answer Key</a></p>
{body}
<footer>© 2026 Lee Yih Ven · {html.escape(title)}</footer></div>
{SCRIPT}</body></html>"""
    assert chr(0x2014) not in doc, f"em-dash in {file}"
    open(os.path.join(RES, file), "w", encoding="utf-8", newline="\n").write(doc)
    return doc


INTRO = {
    "Courier Policy.html": "What a parcel status means and what Cepat Express does about it. The AI agent advises from these clauses; the limits (C4 to C7, C15) are computed in code from the parcel record.",
    "Customer Service Policy.html": "What the AI agent and the CS staff do: verification, the three outcomes (answer, decline politely, escalate), the handover routing and the replies. Each clause says whether code or the prompt enforces it.",
    "Delivery Status Guide.html": "What each shipment status means, the limit that applies and what the agent advises. The status itself always comes from the parcel record by tracking number.",
}

written = []
for file, src in [("Courier Policy.html", "Courier Policy.md"), ("Customer Service Policy.html", "Customer Service Policy.md"), ("Delivery Status Guide.html", "Delivery Status Guide.md")]:
    title, body, _ = md_to_html(open(os.path.join(RES, src), encoding="utf-8").read(), file)
    title = title.replace(", Cepat Express", "")
    intro = f"<p><b>Cepat Express</b> is a courier serving Ipoh, Johor Bahru and Klang. {INTRO[file]} A clause under a reply on the demo page opens its row here, highlighted.</p>"
    page(f"Cepat Express {title}", file, intro, body)
    written.append(file)

staff = json.load(open(os.path.join(RES, "staff-directory.json"), encoding="utf-8"))
rows = [f'<tr id="{s["id"]}"><td>{s["id"]}</td><td>{html.escape(s["name"])}</td><td>{html.escape(s["title"])}</td><td>{html.escape(s["base"])}</td><td>Reads every conversation; acts on every handover: registers a ticket and closes, or transfers to the officer code named (<a class="cl" href="Customer Service Policy.html#S2">S2</a>, <a class="cl" href="Customer Service Policy.html#S28">S28</a>)</td></tr>' for s in staff["customer_service"]]
rows += [f'<tr id="{s["id"]}"><td>{s["id"]}</td><td>{html.escape(s["name"])}</td><td>{html.escape(s["title"])}</td><td>{html.escape(s["location"])}</td><td>Investigates the transfers for {html.escape(s["location"])}: the delivery location for <a class="cl" href="Customer Service Policy.html#S14">S14</a> to <a class="cl" href="Customer Service Policy.html#S19">S19</a>, <a class="cl" href="Customer Service Policy.html#S20b">S20b</a> and <a class="cl" href="Customer Service Policy.html#S20d">S20d</a>, the last-scan location for a delay, the pickup location for <a class="cl" href="Customer Service Policy.html#S20c">S20c</a> (<a class="cl" href="Customer Service Policy.html#S20a">S20a</a>)</td></tr>' for s in staff["logistics"]]
body = "<h2>1. Staff</h2><table><tr><th>ID</th><th>Name</th><th>Job title</th><th>Base</th><th>Role in this desk</th></tr>" + "".join(rows) + "</table>"
intro = f'<p><b>Cepat Express</b> has one Customer Service Lead and one Logistics Officer for each of its three locations (<a class="cl" href="Courier Policy.html#C3a">C3a</a>). Code picks the person for every handover from this directory; the AI agent never chooses one. Customer replies name customer service or the local team; names and titles stay in the handover note.</p>'
page("Cepat Express Staff Directory", "Staff Directory.html", intro, body)
written.append("Staff Directory.html")

# Every clause the policies define has an anchor.
ids = set()
for f in PAGES.values():
    ids |= set(re.findall(r'<tr id="([^"]+)"', open(os.path.join(RES, f), encoding="utf-8").read()))
expected = {f"C{i}" for i in range(1, 20)} | {"C3a"} | {f"S{i}" for i in range(1, 31)} | {"S20a", "S20b", "S20c", "S20d"} | {f"D{i}" for i in range(1, 9)}
missing = expected - ids
assert not missing, f"clauses without an anchor: {sorted(missing)}"
print(f"Wrote {', '.join(written)} in resources/; {len(ids)} clause anchors")
