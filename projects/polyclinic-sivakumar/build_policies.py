import json
import os
import re
import sys
# Writes the Polyclinic Sivakumar resources into resources/ from one source: the founder-approved policy
# files in sources/ (27 Oct 2026). For each policy: the .md copy Claude reads as an MCP resource. Then
# clauses.json, the clause list every refusal's citation is checked against, and policy_tables.json, the
# tables the hooks, the back end and the generator read: staff, hours, holidays, services, the price list,
# the formulary with drug classes and dose ranges, the allergy mapping, the two panels, the handover
# reasons and the resource list. Every table is parsed from the policy text, so a price or a dose is
# changed in sources/ and nowhere else.
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sources")
OUT = os.path.join(HERE, "resources")
os.makedirs(OUT, exist_ok=True)

POLICIES = [  # source file, resource name, URI, clause prefix
    ("Hours_and_Services.txt", "Hours and Services", "clinic://hours-and-services", "PS-HS"),
    ("Price_List.txt", "Price List", "reference://price-list", "PS-PL"),
    ("Panel_Price_Schedule.txt", "Panel Price Schedule", "policy://panel", "PS-PN"),
    ("After_Consultation.txt", "After the Consultation", "policy://after-consultation", "PS-AC"),
    ("Roles_and_Privacy.txt", "Roles and Privacy", "policy://roles-and-privacy", "PS-RP"),
]


def read(fn):
    return open(os.path.join(SRC, fn), encoding="utf-8").read()


def tables_in(text):
    """Every pipe table in a policy, as a list of rows (header first)."""
    out, cur = [], []
    for line in text.split("\n") + [""]:
        if line.startswith("|"):
            if not re.match(r"^\|[-| ]+\|$", line.strip()):
                cur.append([c.strip() for c in line.strip().strip("|").split("|")])
        elif cur:
            out.append(cur)
            cur = []
    return out


def sen(text):
    m = re.search(r"RM ([\d,]+)\.(\d\d)", text)
    return int(m.group(1).replace(",", "")) * 100 + int(m.group(2)) if m else None


def num(s):
    return float(s.replace(",", ""))


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


texts = {fn: read(fn) for fn, *_ in POLICIES}

# ---------------------------------------------------------------- clauses
clauses = {}
for fn, name, uri, prefix in POLICIES:
    for m in re.finditer(rf"^({prefix}-\d\d)\. (.+)$", texts[fn], re.M):
        clauses[m.group(1)] = {"title": m.group(2).strip(), "resource": uri}

# ---------------------------------------------------------------- staff (PS-RP-01)
staff_rows = tables_in(texts["Roles_and_Privacy.txt"])[0][1:]
ROLE = {"FD-01": "desk", "GP-01": "gp", "PH-01": "pharmacist"}
staff = [{"id": r[0], "name": r[1], "job": r[2], "role": ROLE[r[0]],
          "first": {"FD-01": "Siti", "GP-01": "Dr Sivakumar", "PH-01": "Ms Yong"}[r[0]]} for r in staff_rows]

# ---------------------------------------------------------------- hours (PS-HS-01, PS-HS-02)
hs = texts["Hours_and_Services.txt"]
hours = {"open": "09:00", "close": "18:00", "first_slot": "09:00", "last_slot": "17:45", "walk_in_until": "17:30", "slot_minutes": 15}
for k, v in hours.items():
    if isinstance(v, str):
        assert v in hs, f"{v} not in Hours and Services"
holidays = {"2026-06-01": "Yang di-Pertuan Agong's birthday"}
assert "1 June 2026" in hs

# ---------------------------------------------------------------- price list (PS-PL-01, PS-PL-02)
pl = tables_in(texts["Price_List.txt"])
services = {}
for r in pl[0][1:]:
    services[slug(r[0])] = {"name": r[0], "price": sen(r[1]) if "RM" in r[1] else 0}
medicines = {}
for r in pl[1][1:]:
    medicines[slug(r[0])] = {"name": r[0], "unit": r[1], "price": sen(r[2])}

# ---------------------------------------------------------------- formulary (PS-AC-01)
form = tables_in(texts["After_Consultation.txt"])[0][1:]
for r in form:
    key = slug(r[0])
    assert key in medicines, f"{r[0]} is in the formulary but not the price list"
    m = medicines[key]
    m["drug_class"] = r[1]
    per = r[2]
    rng = re.search(r"([\d,]+) to ([\d,]+) (mg|puffs)", per)
    one = re.search(r"^([\d,]+) (mg|sachet)", per)
    if rng:
        m["dose_min"], m["dose_max"], unit = num(rng.group(1)), num(rng.group(2)), rng.group(3)
    else:
        m["dose_min"] = m["dose_max"] = num(one.group(1))
        unit = one.group(2)
    m["dose_unit"] = {"puffs": "puff"}.get(unit, unit)
    day = re.search(r"([\d,]+) (mg|puffs|sachets)", r[3])
    m["day_max"] = num(day.group(1))
    strength = re.search(r"(\d+) mg", r[0])
    m["mg_per_unit"] = num(strength.group(1)) if strength and m["dose_unit"] == "mg" else None
for k, m in medicines.items():
    assert "drug_class" in m, f"{m['name']} has a price but no formulary row"

# ---------------------------------------------------------------- allergy mapping (PS-AC-02)
ac = texts["After_Consultation.txt"]
allergy_map = {}
for allergy, cls in re.findall(r"(Penicillin allergy|Sulfa allergy|NSAID sensitivity) to ([a-zA-Z]+)", ac):
    allergy_map[allergy] = cls

# ---------------------------------------------------------------- panels (PS-PN-01)
pn = tables_in(texts["Panel_Price_Schedule.txt"])[0]
head = pn[0]
panels = {}
for col in (1, 2):
    pname = re.match(r"Panel (\w+)", head[col]).group(1)
    pid = pname.lower()
    rows = {r[0]: r[col] for r in pn[1:]}

    def iso(d):
        dd, mon, yy = d.split()
        mm = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].index(mon) + 1
        return f"{yy}-{mm:02d}-{int(dd):02d}"
    excluded = [slug(x.strip()) for x in rows["Excluded items"].split(";")]
    svc = {}
    for sname in ("GP consultation", "Nebuliser treatment", "Wound dressing", "Blood glucose test"):
        v = rows[sname]
        if v == "Excluded":
            if slug(sname) not in excluded:
                excluded.append(slug(sname))
        else:
            svc[slug(sname)] = sen(v)
    panels[pid] = {"id": pid, "name": f"Panel {pname}", "kind": head[col].split("(")[1].rstrip(")"),
                   "valid_from": iso(rows["Valid from"]), "valid_to": iso(rows["Valid to"]),
                   "services": svc, "medicines": "price_list", "limit": sen(rows["Limit per visit"]),
                   "co_pay": sen(rows["Co-pay per visit"]) or 0, "excluded": excluded}
    for x in excluded:
        assert x in services or x in medicines, f"excluded item {x} unknown"

# ---------------------------------------------------------------- handover reasons (PS-RP-06)
reasons = {
    "P1": {"code": "allergy_conflict", "from": "PH-01", "to": "GP-01", "words": "an allergy conflict"},
    "P2": {"code": "dose_or_prescription_unclear", "from": "PH-01", "to": "GP-01", "words": "a dose outside the range or an unclear prescription"},
    "P3": {"code": "out_of_stock", "from": "PH-01", "to": "GP-01", "words": "a medicine out of stock"},
    "P4": {"code": "medicine_concern", "from": "PH-01", "to": "GP-01", "words": "a concern about a medicine"},
    "D1": {"code": "clinical_question", "from": "FD-01", "to": "GP-01", "words": "a clinical question"},
    "D2": {"code": "unwell_while_waiting", "from": "FD-01", "to": "GP-01", "words": "a patient unwell while waiting"},
    "D4": {"code": "clinical_no_policy", "from": "FD-01", "to": "GP-01", "words": "a clinical issue no policy covers"},
    "D5": {"code": "medicine_use_question", "from": "FD-01", "to": "PH-01", "words": "a medicine use question"},
}
rp = texts["Roles_and_Privacy.txt"]
for k in reasons:
    assert re.search(rf"\b{k}\b", rp), f"{k} not in Roles and Privacy"
assert "D3" not in rp

resources = [{"uri": uri, "name": name, "file": f"{name}.md", "prefix": prefix} for fn, name, uri, prefix in POLICIES]
templates = {"mc": "MC-2026-", "referral": "REF-2026-"}

for fn, name, uri, prefix in POLICIES:
    open(os.path.join(OUT, f"{name}.md"), "w", encoding="utf-8").write(texts[fn])

tables = {"clinic": "Polyclinic Sivakumar", "staff": staff, "hours": hours, "holidays": holidays, "services": services,
          "medicines": medicines, "allergy_map": allergy_map, "panels": panels, "reasons": reasons,
          "resources": resources, "templates": templates, "clauses": sorted(clauses)}
json.dump(tables, open(os.path.join(OUT, "policy_tables.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
json.dump(clauses, open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(f"{len(clauses)} clauses; {len(services)} services; {len(medicines)} medicines; panels {list(panels)}; allergy map {allergy_map}")

# ---------------------------------------------------------------- policies.html: the page people read (step 18)
# The five policies on one page, each clause with its own anchor (id = the clause ID), so a Basis line in the
# clinic desk opens the clause it cites. Demo-page header: the AI Projects breadcrumb and the favicon.
import html as _h


def page_tables(rows):
    rows = [r for r in rows]
    head = "".join(f"<th>{_h.escape(c)}</th>" for c in rows[0])
    body = "".join("<tr>" + "".join(f"<td>{_h.escape(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
    return f"<table><tr>{head}</tr>{body}</table>"


parts = []
for i, (fn, name, uri, prefix) in enumerate(POLICIES, 1):
    lines = texts[fn].split("\n")
    parts.append(f'<h2 id="{prefix}">{i}. {_h.escape(name)} ({prefix})</h2>')
    parts.append(f'<p class="meta">{_h.escape(lines[2])}<br>{_h.escape(lines[3])}<br>MCP resource: <code>{uri}</code></p>')
    k, buf = 5, []
    while k < len(lines):
        s = lines[k].strip()
        if lines[k].startswith("|"):
            rows = []
            while k < len(lines) and lines[k].startswith("|"):
                if not re.match(r"^\|[-| ]+\|$", lines[k].strip()):
                    rows.append([c.strip() for c in lines[k].strip().strip("|").split("|")])
                k += 1
            parts.append(page_tables(rows))
            continue
        if not s or s.startswith("MCP resource:"):
            pass
        elif s == "PURPOSE AND PRINCIPLES":
            parts.append('<p class="sec">Purpose and principles</p>')
        elif s.startswith("SECTION "):
            parts.append(f'<p class="sec">{_h.escape(s.title().replace("And", "and"))}</p>')
        elif re.match(r"^PS-[A-Z]{2}-\d{2}\. ", s):
            cid = s.split(".")[0]
            parts.append(f'<h3 id="{cid}"><a class="anchor" href="#{cid}">{_h.escape(s)}</a></h3>')
        elif s.startswith("Enforced by:"):
            parts.append(f'<p class="enf"><b>Enforced by:</b>{_h.escape(s[12:])}</p>')
        else:
            parts.append(f"<p>{_h.escape(s)}</p>")
        k += 1

css = open(os.path.join(HERE, "lib", "masterkit.css"), encoding="utf-8").read() + """
.crumb{font-size:13px;margin:0 0 6px}.meta{color:var(--muted);font-size:13.5px}.sec{font-size:12.5px;letter-spacing:.05em;color:var(--muted);margin:20px 0 0;text-transform:uppercase}
.enf{color:var(--muted);font-size:13.5px}h3 a.anchor{color:inherit;text-decoration:none}h3:target{background:var(--box);outline:2px solid var(--accent);border-radius:4px}
"""
title = "Polyclinic Sivakumar Policies"
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title><link rel="icon" href="../../favicon.ico" sizes="any"><link rel="icon" href="../../favicon.svg" type="image/svg+xml"><style>{css}</style></head><body><div class="wrap">
<div class="crumb"><a href="../../index.html">AI Projects</a> / <a href="../../polyclinic-sivakumar.html">Polyclinic Sivakumar Clinic Desk</a></div>
<div class="top"><h1>{title}</h1><nav id="toc"></nav></div>
<p><b>The five policies the clinic desk works from.</b> The AI reads each one as an MCP resource; the hooks and the back end enforce them in code. Every clause has its own link, so a Basis line in the desk opens the clause it cites.</p>
<p><b>Demonstration policies</b> written for this staff assistant, with sample prices and sample panels.</p>
{''.join(parts)}
<footer>© 2026 Lee Yih Ven · {title}</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h)=>{{const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);}});
document.querySelectorAll('table').forEach(t=>{{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);}});
</script></body></html>"""
assert "\u2014" not in page
open(os.path.join(HERE, "policies.html"), "w", encoding="utf-8").write(page)
print("policies.html written")
