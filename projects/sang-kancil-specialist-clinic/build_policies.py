import json
import os
import re
# Writes the Sang Kancil Specialist Clinic resources into resources/ from one source: the founder's
# seven files in sources/ (four policies, Fee Schedule, Clinic Formulary, Immunisation Schedule,
# 22 Oct 2026) plus the Clinic Hours and Rota table below. For each resource: the HTML page people
# read and the .md copy Claude reads as an MCP resource; clauses.json, the clause list every
# refusal's citation is checked against; and policy_tables.json, the tables the hooks, the back end
# and the generator read (staff, rota, holidays, slot lengths, fees, formulary, immunisation rows,
# request types). Change a clause in sources/ or a table here, nowhere else.
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sources")
OUT = os.path.join(HERE, "resources")
os.makedirs(OUT, exist_ok=True)
PROJECT = "Sang Kancil Specialist Clinic"
SLUG = "sang-kancil-specialist-clinic"

STAFF = [
    # id, name, first name, job title, band (doctor of record for), role
    ("PD-01-01", "Dr Aisyah Rahman", "Dr Aisyah", "Lead paediatrician", "infant", "doctor"),
    ("PD-02-01", "Dr Daniel Ong", "Dr Daniel", "Associate paediatrician", "child", "doctor"),
    ("PD-02-02", "Dr Priya Nair", "Dr Priya", "Associate paediatrician", "adolescent", "doctor"),
    ("FD-02-01", "Nurul Huda", "Nurul Huda", "Clinic clerk", None, "clerk"),
]
BANDS = {  # CL-01: age in completed years at the encounter date, Malaysia time
    "infant": dict(min_years=0, max_years=0, doctor="PD-01-01", label="under 1"),
    "child": dict(min_years=1, max_years=12, doctor="PD-02-01", label="1 to 12"),
    "adolescent": dict(min_years=13, max_years=17, doctor="PD-02-02", label="13 to 17"),
}

# ---------------------------------------------------------------- Clinic Hours and Rota (OP-03)
SESSIONS = {"AM": ("09:00", "13:00"), "PM": ("14:00", "17:00")}
WEEKLY = {  # weekday -> session -> doctors working; Saturday AM follows SATURDAY_ROTA
    "Mon": {"AM": ["PD-01-01", "PD-02-01"], "PM": ["PD-01-01", "PD-02-01", "PD-02-02"]},
    "Tue": {"AM": ["PD-01-01", "PD-02-01", "PD-02-02"], "PM": ["PD-02-01", "PD-02-02"]},
    "Wed": {"AM": ["PD-01-01", "PD-02-01"], "PM": ["PD-01-01", "PD-02-01", "PD-02-02"]},
    "Thu": {"AM": ["PD-01-01", "PD-02-01", "PD-02-02"], "PM": ["PD-02-01", "PD-02-02"]},
    "Fri": {"AM": ["PD-01-01", "PD-02-01"], "PM": ["PD-02-01", "PD-02-02"]},
    "Sat": {"AM": [], "PM": []},
    "Sun": {"AM": [], "PM": []},
}
ON_DUTY = {"AM": "PD-01-01", "PM": "PD-02-01"}  # weekdays, for urgent attendance (OP-10, CL-04)
SATURDAY_ROTA = [  # one doctor, morning only; Saturday afternoon closed
    ("2026-10-24", "PD-01-01"), ("2026-10-31", "PD-02-01"), ("2026-11-07", "PD-02-02"),
    ("2026-11-14", "PD-01-01"), ("2026-11-21", "PD-02-01"), ("2026-11-28", "PD-02-02"),
    ("2026-12-05", "PD-01-01"), ("2026-12-12", "PD-02-01"), ("2026-12-19", "PD-02-02"), ("2026-12-26", "PD-01-01"),
]
ROTA_VALID = ("2026-10-01", "2026-12-31")
HOLIDAYS = [  # Selangor public holidays, Oct to Dec 2026 (FMM circular GI17, 12 Aug 2025; checked 22 Oct 2026)
    ("2026-11-08", "Deepavali (a Sunday)"),
    ("2026-11-09", "Deepavali holiday in lieu"),
    ("2026-12-11", "Birthday of the Sultan of Selangor"),
    ("2026-12-25", "Christmas Day"),
]
SLOT_MINUTES = {"vaccination": 15, "follow_up": 20, "new_patient": 30, "sick_visit": 30}
GRID_MINUTES = 10

REQUEST_TYPES = {
    # type: raised by, decided or closed by, clause
    "consult": ("an associate, for their own patient", "Dr Aisyah Rahman as lead", "CL-05, CP-12"),
    "cover": ("a doctor, for their own patients", "Dr Aisyah Rahman as lead", "CL-04, CP-12"),
    "handover": ("the attending doctor", "the receiving band doctor, who accepts or declines", "CL-02, CP-12"),
    "fee_waiver": ("Nurul Huda", "Dr Aisyah Rahman as lead", "BP-07, CP-12"),
    "doctor_assignment": ("Nurul Huda", "Dr Aisyah Rahman as lead", "OP-04, CP-12"),
    "overbooking": ("Nurul Huda", "the requested doctor", "OP-09, CP-12"),
    "callback": ("Nurul Huda", "the patient's own doctor", "CL-10, CP-12"),
    "repeat_prescription": ("Nurul Huda", "the patient's own doctor", "CL-10, CP-12"),
    "external_referral": ("the responsible doctor", "Nurul Huda, who arranges it", "CL-12, OP-12"),
    # Founder, 22 Oct: a request no rule covers is referred to the policy owner, who is notified first.
    "policy_question": ("any staff member, for a request no rule covers in their own work", "Dr Aisyah Rahman as policy owner", "CP-12"),
}

# Formulary test profiles (Clinic Formulary section 4), as numbers the code checks against.
PROFILES = {
    "CF-PAR-01": dict(medicine="paracetamol", presentations=["MED-PAR120", "MED-PAR250"], age_min_months=3, age_max_months=215,
                      weight_max_kg=40, weight_required=True, mg_per_kg_dose=[10, 15], max_doses_day=4, max_mg_per_kg_day=60,
                      duration=[1, 3], clause="CL-07, CL-08"),
    "CF-AMX-GAS-BID": dict(medicine="amoxicillin", presentations=["MED-AMX125", "MED-AMX250"], age_min_months=36, age_max_months=215,
                           weight_required=True, indication="confirmed_gas", mg_per_kg_dose_target=25, cap_mg_dose=500, cap_mg_day=1000,
                           doses_day_exact=2, duration_exact=10, tolerance_pct=2, clause="CL-07, CL-08"),
    "CF-CET-2TO5": dict(medicine="cetirizine", presentations=["MED-CET1"], age_min_months=24, age_max_months=71, weight_required=False,
                        mg_dose_exact=2.5, doses_day_exact=2, max_mg_day=5, duration=[1, 14], clause="CL-07"),
    "CF-CET-6TO11": dict(medicine="cetirizine", presentations=["MED-CET1"], age_min_months=72, age_max_months=143, weight_required=False,
                         mg_dose_exact=5, doses_day_exact=2, max_mg_day=10, duration=[1, 14], clause="CL-07"),
    "CF-CET-12TO17": dict(medicine="cetirizine", presentations=["MED-CET1", "MED-CET10"], age_min_months=144, age_max_months=215, weight_required=False,
                          mg_dose_exact=10, doses_day_exact=1, max_mg_day=10, duration=[1, 14], clause="CL-07"),
    "CF-SAL-ROUTINE": dict(medicine="salbutamol", presentations=["MED-SAL100"], age_min_months=72, age_max_months=215, weight_required=False,
                           puffs=[1, 2], max_occasions_day=4, max_puffs_day=8, review_max_days=30, clause="CL-07"),
    "CF-HC-MANUAL": dict(medicine="hydrocortisone", presentations=["MED-HC1"], weight_required=False, manual=True, clause="CL-07"),
}
MG_PER_UNIT = {  # strength per dose unit, from the presentation register
    "MED-PAR120": ("mL", 24), "MED-PAR250": ("mL", 50), "MED-AMX125": ("mL", 25), "MED-AMX250": ("mL", 50),
    "MED-CET1": ("mL", 1), "MED-CET10": ("tablet", 10), "MED-SAL100": ("puff", 0.1), "MED-HC1": ("application", None),
}
STOCKED = {"MED-PAR120": 60, "MED-PAR250": 60, "MED-AMX125": 100, "MED-AMX250": 100, "MED-CET1": 60}

VALUES = {"weight_max_days": 30, "utc_offset_hours": 8, "demo_now_label": "Thursday 22 October 2026, 10:00 Malaysia time",
          "demo_today": "2026-10-22"}


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def table(head, rows, ids=False):
    out = "<table><tr>" + "".join(f"<th>{h}</th>" for h in head) + "</tr>\n"
    for r in rows:
        rid = f' id="{r[0]}"' if ids else ""
        out += f"<tr{rid}>" + "".join(f"<td>{esc(str(c))}</td>" for c in r) + "</tr>\n"
    return out + "</table>"


def md_table(head, rows):
    out = "| " + " | ".join(head) + " |\n|" + "---|" * len(head) + "\n"
    return out + "".join("| " + " | ".join(str(c) for c in r) + " |\n" for r in rows)


def read(name):
    return open(os.path.join(SRC, name), encoding="utf-8").read().replace("\r\n", "\n")


CLAUSES = {}


def parse_policy(text, prefix):
    """Header lines, purpose, then sections of clauses: 'CP-01. Title', the rule, 'Enforced by: ...'."""
    lines = [l for l in text.split("\n")]
    head, sections, cur = [], [], None
    i = 0
    while i < len(lines):
        l = lines[i].strip()
        m = re.match(rf"^({prefix}-\d\d)\. (.+)$", l)
        if l.startswith("SECTION "):
            cur = (l.split(": ", 1)[1].capitalize() if ": " in l else l, [])
            sections.append(cur)
        elif m:
            cid, title = m.group(1), m.group(2)
            body, how = [], ""
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("Enforced by:"):
                if lines[i].strip():
                    body.append(lines[i].strip())
                i += 1
            how = lines[i].strip()[len("Enforced by:"):].strip() if i < len(lines) else ""
            cur[1].append((cid, title, " ".join(body), how))
        elif cur is None and l:
            head.append(l)
        i += 1
    return head, sections


CSS = open(os.path.join(HERE, "lib", "masterkit.css"), encoding="utf-8").read()
JS = """<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script>"""
FAVICON = '<link rel="icon" href="../../../favicon.svg" type="image/svg+xml">'


def page(title, intro, body):
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>{FAVICON}<style>
{CSS}
</style></head><body><div class="wrap">
<div class="top"><div class="crumbs"><a href="../../../index.html">AI Projects</a> / <a href="../../../{SLUG}.html">{PROJECT}</a></div><h1>{title}</h1><nav id="toc"></nav></div>
{intro}
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; {title}</footer></div>
{JS}</body></html>"""


# (prefix, file, title, uri, restricted to)
POLICIES = [
    ("CP", "Clinic_Policy.txt", "Clinic Policy", "policy://clinic"),
    ("CL", "Clinical_Policy.txt", "Clinical Policy", "policy://clinical"),
    ("OP", "Operations_Policy.txt", "Operations Policy", "policy://operations"),
    ("BP", "Billing_Policy.txt", "Billing Policy", "policy://billing"),
]
REFERENCES = [
    ("Fee_Schedule.txt", "Fee Schedule", "reference://fee-schedule", ["FD-02-01", "PD-01-01:lead"]),
    ("Clinic_Formulary.txt", "Clinic Formulary", "reference://formulary", None),
    ("Immunisation_Schedule.txt", "Immunisation Schedule", "reference://immunisation-schedule", None),
]
RESOURCES = []
ENF = "<p><strong>Enforced by</strong> names where each rule is held: the PreToolUse hook before a tool runs, the PostToolUse hook on the result, the back end on its own, or the tool boundaries (no tool exists, so the assistant answers from the clause and names who decides).</p>"

for prefix, fname, title, uri in POLICIES:
    head, sections = parse_policy(read(fname), prefix)
    meta = [h for h in head[2:] if not h.startswith("PURPOSE AND")]
    purpose = meta[-1]
    md = f"# {title}\n\n{PROJECT}, Kota Damansara, Selangor (fictional demo clinic).\n{meta[0]}\n{meta[1]}\n\nPurpose and principles: {purpose}\nCite clauses by ID, e.g. {prefix}-01.\n"
    body = ""
    for n, (h, rows) in enumerate(sections, 1):
        md += f"\n## {n}. {h}\n\n"
        for cid, t, text, how in rows:
            md += f"- **{cid} {t}.** {text} *(Enforced by: {how})*\n"
            CLAUSES[cid] = dict(policy=title, page=f"{title}.html", section=h, title=t, text=text, enforced_by=how)
        body += f"<h2>{n}. {h}</h2>\n<div class=\"cl\">{table(['Clause', 'Rule', 'Enforced by'], [(c, f'{t}. {x}', w) for c, t, x, w in rows], ids=True)}</div>\n"
    intro = f"<p><strong>{PROJECT}</strong> is a fictional private paediatric clinic in Kota Damansara, Selangor, used for demonstration. {esc(meta[1])}</p><p><strong>Purpose and principles:</strong> {esc(purpose)}</p><p>This policy is an MCP resource: the staff assistant reads it, and the hooks around its eight tools cite these clauses when they refuse.</p>{ENF}"
    open(os.path.join(OUT, f"{title}.md"), "w", encoding="utf-8").write(md)
    open(os.path.join(OUT, f"{title}.html"), "w", encoding="utf-8").write(page(title, intro, body))
    RESOURCES.append(dict(uri=uri, name=title, file=f"{title}.md", restricted=None))


def reference_to_md_html(text, title):
    """A reference file: numbered section headings, pipe tables as tables, paragraphs as text."""
    lines = text.split("\n")
    md, body, i = f"# {title}\n\n", "", 0
    header = []
    while i < len(lines) and not re.match(r"^\d+\. ", lines[i].strip()):
        if lines[i].strip() and lines[i].strip() != title.upper() and "SANG KANCIL" not in lines[i]:
            header.append(lines[i].strip())
        i += 1
    md += "\n".join(header) + "\n"
    intro = "".join(f"<p>{esc(h)}</p>" for h in header)
    while i < len(lines):
        l = lines[i].strip()
        if re.match(r"^\d+\. [A-Z]", l):
            h = l.split(". ", 1)[1].capitalize()
            md += f"\n## {l.split('.')[0]}. {h}\n\n"
            body += f"<h2>{l.split('.')[0]}. {esc(h)}</h2>\n"
            i += 1
            continue
        if " | " in l:
            rows = []
            while i < len(lines) and " | " in lines[i]:
                rows.append([c.strip() for c in lines[i].split(" | ")])
                i += 1
            md += md_table(rows[0], rows[1:]) + "\n"
            body += table(rows[0], rows[1:]) + "\n"
            continue
        if l:
            md += l + "\n\n"
            body += f"<p>{esc(l)}</p>\n"
        i += 1
    return md, intro, body


REF_TABLES = {}
for fname, title, uri, restricted in REFERENCES:
    text = read(fname)
    md, intro, body = reference_to_md_html(text, title)
    open(os.path.join(OUT, f"{title}.md"), "w", encoding="utf-8").write(md)
    note = "<p><strong>Restricted resource:</strong> served only to Nurul Huda and to Dr Aisyah Rahman in lead capacity (Fee Schedule section 5).</p>" if restricted else ""
    open(os.path.join(OUT, f"{title}.html"), "w", encoding="utf-8").write(page(title, intro + note, body))
    RESOURCES.append(dict(uri=uri, name=title, file=f"{title}.md", restricted=restricted))
    REF_TABLES[title] = [[c.strip() for c in l.split(" | ")] for l in text.split("\n") if " | " in l]

# Fees: every fee row with a sen column (sections 2 to 4 of the Fee Schedule).
FEES = {}
for r in REF_TABLES["Fee Schedule"]:
    if re.match(r"^FS-[CVME]\d\d$", r[0]):
        FEES[r[0]] = dict(id=r[0], ref=r[1] if r[0][3] in "VM" else None, label=r[2] if r[0][3] in "VME" else r[1],
                          unit=r[-3], sen=int(r[-1]))
FEE_BY_REF = {f["ref"]: k for k, f in FEES.items() if f["ref"] and f["ref"].startswith(("VAC-", "MED-"))}
# Formulary presentation register (section 3).
PRESENTATIONS = {}
for r in REF_TABLES["Clinic Formulary"]:
    if re.match(r"^MED-", r[0]):
        PRESENTATIONS[r[0]] = dict(id=r[0], generic=r[1], form=r[2], strength=r[3], route=r[4], stocked=r[5], allergy=[a.strip() for a in r[6].split(";")],
                                   dose_unit=MG_PER_UNIT[r[0]][0], mg_per_unit=MG_PER_UNIT[r[0]][1], stocked_volume_ml=STOCKED.get(r[0]))
# Immunisation rows (sections 2 and 3).
IMMUNISATION = []
for r in REF_TABLES["Immunisation Schedule"]:
    if re.match(r"^IS-", r[0]):
        IMMUNISATION.append(dict(id=r[0], vaccine=r[1], name=r[2], dose=r[3], target=r[4], channel=r[5]))
assert len(FEES) == 23 and len(PRESENTATIONS) == 8 and len(IMMUNISATION) == 17, (len(FEES), len(PRESENTATIONS), len(IMMUNISATION))

# ---------------------------------------------------------------- Clinic Hours and Rota resource
NAME = {s[0]: s[1] for s in STAFF}
rota_md = f"""# Clinic Hours and Rota

{PROJECT} (fictional demo clinic, Kota Damansara, Selangor). Maintained resource read by check_schedule and book_appointment (OP-03). Valid from {ROTA_VALID[0]} to {ROTA_VALID[1]}; a date outside it is reported as a gap and referred to Nurul Huda. Times are Malaysia time. Prepared 22 October 2026 from the design discussion; a demo rota, not an operating clinic's roster.

## 1. Sessions

""" + md_table(["Session", "From", "To"], [(k, v[0], v[1]) for k, v in SESSIONS.items()]) + """
Saturday: morning only, one doctor on the Saturday rota. Saturday afternoon, Sunday and Selangor public holidays: closed.

## 2. Weekly rota

""" + md_table(["Day", "Morning", "Afternoon"], [(d, ", ".join(NAME[x] for x in v["AM"]) or "Closed", ", ".join(NAME[x] for x in v["PM"]) or "Closed") for d, v in WEEKLY.items() if d not in ("Sat", "Sun")]) + """
Doctor on duty for urgent attendance on weekdays: """ + f"{NAME[ON_DUTY['AM']]} (morning), {NAME[ON_DUTY['PM']]} (afternoon); on Saturday morning, the Saturday rota doctor." + """

## 3. Saturday rota (morning only)

""" + md_table(["Saturday", "Doctor"], [(d, NAME[x]) for d, x in SATURDAY_ROTA]) + """
## 4. Slot lengths

""" + md_table(["Visit type", "Minutes"], [(k.replace("_", " "), v) for k, v in SLOT_MINUTES.items()]) + f"""
Slots start on a {GRID_MINUTES}-minute grid from the start of the session; a booking takes its full length and may not overlap another.

## 5. Selangor public holidays, October to December 2026

""" + md_table(["Date", "Holiday"], HOLIDAYS) + """
Source: FMM circular GI17, 2026 Public Holidays National and State (12 Aug 2025), checked 22 October 2026. Sources differ on whether Selangor observes the 9 November in-lieu day; confirm against the state gazette before real use.
"""
rota_body = (f"<h2>1. Sessions</h2>{table(['Session', 'From', 'To'], [(k, v[0], v[1]) for k, v in SESSIONS.items()])}<p>Saturday: morning only, one doctor on the Saturday rota. Saturday afternoon, Sunday and Selangor public holidays: closed.</p>"
             f"<h2>2. Weekly rota</h2>{table(['Day', 'Morning', 'Afternoon'], [(d, ', '.join(NAME[x] for x in v['AM']), ', '.join(NAME[x] for x in v['PM'])) for d, v in WEEKLY.items() if d not in ('Sat', 'Sun')])}"
             f"<p>Doctor on duty for urgent attendance on weekdays: {NAME[ON_DUTY['AM']]} (morning), {NAME[ON_DUTY['PM']]} (afternoon); on Saturday morning, the Saturday rota doctor.</p>"
             f"<h2>3. Saturday rota (morning only)</h2>{table(['Saturday', 'Doctor'], [(d, NAME[x]) for d, x in SATURDAY_ROTA])}"
             f"<h2>4. Slot lengths</h2>{table(['Visit type', 'Minutes'], [(k.replace('_', ' '), v) for k, v in SLOT_MINUTES.items()])}<p>Slots start on a {GRID_MINUTES}-minute grid from the start of the session; a booking takes its full length and may not overlap another.</p>"
             f"<h2>5. Selangor public holidays, October to December 2026</h2>{table(['Date', 'Holiday'], HOLIDAYS)}<p>Source: FMM circular GI17, 2026 Public Holidays National and State (12 Aug 2025), checked 22 October 2026. Sources differ on whether Selangor observes the 9 November in-lieu day; confirm against the state gazette before real use.</p>")
open(os.path.join(OUT, "Clinic Hours and Rota.md"), "w", encoding="utf-8").write(rota_md)
open(os.path.join(OUT, "Clinic Hours and Rota.html"), "w", encoding="utf-8").write(page("Clinic Hours and Rota",
     f"<p>Maintained resource read by check_schedule and book_appointment (OP-03). Valid {ROTA_VALID[0]} to {ROTA_VALID[1]}, Malaysia time. A demo rota prepared 22 October 2026 from the design discussion.</p>", rota_body))
RESOURCES.append(dict(uri="reference://clinic-hours-and-rota", name="Clinic Hours and Rota", file="Clinic Hours and Rota.md", restricted=None))

for f in os.listdir(OUT):
    if f.endswith((".md", ".html")):
        assert "—" not in open(os.path.join(OUT, f), encoding="utf-8").read(), f"em-dash in {f}"

expected = [f"{p}-{i:02d}" for p, n in (("CP", 15), ("CL", 15), ("OP", 12), ("BP", 8)) for i in range(1, n + 1)]
assert list(CLAUSES) == expected, "clauses must run CP-01..15, CL-01..15, OP-01..12, BP-01..08 in order"

TABLES = {
    "clinic": PROJECT,
    "staff": [dict(id=s[0], name=s[1], first=s[2], title=s[3], band=s[4], role=s[5]) for s in STAFF],
    "bands": BANDS,
    "sessions": SESSIONS, "weekly": WEEKLY, "on_duty": ON_DUTY, "saturday_rota": dict(SATURDAY_ROTA), "rota_valid": ROTA_VALID,
    "holidays": dict(HOLIDAYS), "slot_minutes": SLOT_MINUTES, "grid_minutes": GRID_MINUTES,
    "request_types": {k: dict(raised_by=v[0], decided_by=v[1], clause=v[2]) for k, v in REQUEST_TYPES.items()},
    "fees": FEES, "fee_by_ref": FEE_BY_REF,
    "presentations": PRESENTATIONS, "profiles": PROFILES,
    "immunisation": IMMUNISATION,
    "values": VALUES,
    "resources": RESOURCES,
}
with open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8") as f:
    json.dump(CLAUSES, f, indent=1)
with open(os.path.join(OUT, "policy_tables.json"), "w", encoding="utf-8") as f:
    json.dump(TABLES, f, indent=1)
print(f"done: 4 policies, {len(CLAUSES)} clauses, {len(RESOURCES)} resources, {len(FEES)} fees, {len(PRESENTATIONS)} presentations, {len(IMMUNISATION)} immunisation rows, {len(HOLIDAYS)} holidays")
