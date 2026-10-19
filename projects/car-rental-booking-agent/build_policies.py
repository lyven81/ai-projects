import json
import os
import re
# Writes the Rental Policy into resources/ from one source: the HTML page people read (each
# clause a link target), the .md copy Claude reads as policy://rental-policy, and clauses.json,
# the clause list the reply tool checks citations against. Text approved by the founder, 19 Oct 2026.
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources")
os.makedirs(OUT, exist_ok=True)
TITLE = "Rental Policy"
PROJECT = "Kereta Sewa Jalan-jalan Car Rental Agent"
CSS = """*{box-sizing:border-box}
:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}
body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 60px}
.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:14px;z-index:2}
.top h1{font-size:22px;margin:0;color:var(--navy)}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px;margin-top:6px}
nav a{color:var(--accent);text-decoration:none}
h2{font-size:18px;color:var(--navy);margin:34px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--line)}
a{color:var(--accent)}
p{margin:6px 0}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
td:first-child{white-space:nowrap;font-weight:600;color:var(--navy)}
.tw{overflow-x:auto}
code{background:var(--box);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:13px}
tr:target td{background:var(--box);box-shadow:inset 3px 0 0 var(--accent)}
tr[id]{scroll-margin-top:110px}
footer{margin-top:36px;font-size:12px;color:var(--muted)}"""
JS = """<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script>"""
INTRO = """<p><strong>Kereta Sewa Jalan-jalan</strong> is a fictional car rental company at KLIA used for demonstration. This policy is an MCP resource: the AI agent reads it to answer customers, and the booking tools enforce the rules marked Code. Rates are in the <a href="Car Inventory.html">Car Inventory</a>.</p>
<p><strong>Enforced by:</strong> <b>Code</b> means a tool refuses or calculates it; <b>Staff</b> means a person decides; <b>Prompt</b> means the agent states it. Anything not written here goes to staff.</p>"""
USE = """<h2>{n}. How the agent uses this policy</h2>
<table><tr><th>Enquiry</th><th>What the agent does</th></tr>
<tr><td>Covered by policy</td><td>Answers from this policy and names the rule (e.g. R12).</td></tr>
<tr><td>Contradicts policy</td><td>Declines, states the rule that applies, and offers what the rule does allow. No exceptions are made in chat.</td></tr>
<tr><td>Not covered by policy</td><td>Does not guess. Hands the enquiry to staff with the structured handover.</td></tr>
<tr><td>Policy neither says yes nor no</td><td>Does not choose a reading. Hands the enquiry to staff, naming the rule that seemed to apply and why it is unclear.</td></tr></table>"""
MD_USE = """## {n}. How the agent uses this policy

- Covered by policy: answer from this policy and cite the clause.
- Contradicts policy: decline, state the rule, offer what the rule does allow. No exceptions in chat.
- Not covered by policy: do not guess. Hand to staff (reason not_in_policy).
- Policy neither says yes nor no: do not choose a reading. Hand to staff (reason not_in_policy), naming the clause that seemed to apply and why it is unclear.
"""

SECTIONS = [
    ("Hours", [
        ("R1", "Bookings, pickup and return are handled from 9am to 6pm, seven days a week.", "Code"),
        ("R2", "A pickup or return outside 9am to 6pm is passed to staff to arrange.", "Code (handover)"),
        ("R3", "A booking request made outside 9am to 6pm is recorded as pending; staff review it from 9am.", "Code")]),
    ("Booking and deposit", [
        ("R4", "A booking needs the customer's name, a mobile number (Malaysian or international) and a driving licence number. The licence itself is checked by staff at pickup (R43).", "Code (details present)"),
        ("R5", "Every booking needs a deposit of RM 100, paid when booking.", "Code"),
        ("R6", "A booking request blocks the car until staff confirm or reject it. A car blocked or rented for any part of the requested period cannot be booked.", "Code"),
        ("R7", "The customer reports the deposit payment by uploading the receipt or by saying it was paid. Staff check the bank record; the booking stays pending until staff confirm it.", "Code (no confirm tool)"),
        ("R8", "One mobile number may hold up to 2 car bookings at the same time. More cars are passed to staff.", "Code"),
        ("R9", "The deposit is released within 48 hours after the car is returned with no damage and a full tank (R18).", "Staff")]),
    ("Pickup, return and delivery", [
        ("R10", "Pickup and return at KLIA are free.", "Code"),
        ("R11", "Pickup or return at any other place costs RM 1 per km from KLIA. The staff member who delivers or collects the car works out the distance.", "Staff")]),
    ("Rental period and price", [
        ("R12", "The minimum rental is 2 hours. Up to 5 hours is charged by the hour; 6 hours or more counts as one day at the daily rate.", "Code"),
        ("R13", "Beyond whole days, extra hours are charged at the hourly rate, capped at one more day.", "Code"),
        ("R14", "Whole weeks are charged at the weekly rate and remaining days at the daily rate, capped at the two-week rate.", "Code"),
        ("R15", "A rented car can be driven at any hour, every day of the week, for the whole rental period.", "Prompt")]),
    ("Bookings passed to staff", [
        ("R16", "A rental that starts more than 30 days from today, or on the day of the request, is passed to staff. The agent does not block the car.", "Code (handover)"),
        ("R17", "A rental longer than 2 weeks is passed to staff, who may offer a long-term rate. The agent does not quote or promise a discount.", "Code (handover)")]),
    ("Fuel", [
        ("R18", "Every car is released with a full tank and must be returned with a full tank. Otherwise the cost of refuelling is deducted from the deposit.", "Staff")]),
    ("Cancellation and refund", [
        ("R19", "A cancellation 24 hours or more before pickup: the RM 100 deposit is refunded in full.", "Code (quote)"),
        ("R20", "A cancellation less than 24 hours before pickup: the deposit is kept.", "Code (quote)"),
        ("R21", "No-show: the car is not picked up within 2 hours of the pickup time without notice. The booking is cancelled and the deposit kept.", "Staff"),
        ("R22", "A cancellation is a request until staff confirm it. The agent records it; staff process the refund.", "Code (no cancel tool)"),
        ("R23", "Refunds go back to the original payment method within 24 hours of staff confirming the cancellation.", "Staff"),
        ("R24", "If the company cancels (car unavailable), the customer chooses a full deposit refund or a car of the same or higher tier at the same price.", "Staff"),
        ("R25", "Returning early: no refund for unused hours or days.", "Prompt"),
        ("R26", "A booking request that staff reject because no payment was found is cancelled; nothing is charged or refunded.", "Staff"),
        ("R27", "A cancellation for an emergency (flight cancelled, medical) less than 24 hours before pickup is decided by staff, with proof.", "Staff"),
        ("R28", "Changing the dates, time or car of a booking is handled by staff.", "Code (no change tool)")]),
    ("Late return", [
        ("R29", "A grace period of 30 minutes after the return time, with no charge.", "Staff"),
        ("R30", "Beyond the grace period, each hour or part hour is charged at the tier's hourly rate.", "Staff"),
        ("R31", "Late charges for one day are capped at the daily rate; 6 hours or more late is charged as one extra day.", "Staff"),
        ("R32", "To extend, the customer asks at least 2 hours before the return time; staff confirm, subject to availability.", "Code (handover)"),
        ("R33", "Late charges are deducted from the deposit; any balance is paid at return.", "Staff"),
        ("R34", "A late return that ends after 6pm needs staff to arrange the return.", "Code (handover)"),
        ("R35", "A car not returned and not contactable 24 hours after the return time is treated as unauthorised use and may be reported to the police.", "Staff"),
        ("R36", "The car is returned to KLIA. Collection from elsewhere is arranged by staff at RM 1 per km, worked out by the staff member who collects it.", "Staff"),
        ("R37", "If a late return stops the next customer's booking, the company offers the next customer another car; the late customer pays the late charges only.", "Staff"),
        ("R38", "The customer tells the company as soon as they know they will be late.", "Code (handover)")]),
    ("Driver and vehicle use", [
        ("R39", "The driver is 20 to 70 years old.", "Staff (at pickup)"),
        ("R40", "The driver has held a full licence for at least 2 years. Probationary (P) licences are not accepted.", "Staff (at pickup)"),
        ("R41", "A Malaysian class D licence is accepted.", "Staff (at pickup)"),
        ("R42", "A foreign driver needs a valid national licence plus an International Driving Permit, unless the licence is in English.", "Staff (at pickup)"),
        ("R43", "At pickup, the driver shows the licence and IC or passport; the name must match the booking.", "Staff (at pickup)"),
        ("R44", "Only the person who booked may drive. Damage while anyone else drives is charged to the renter in full.", "Staff"),
        ("R45", "No smoking in the car. A cleaning fee is deducted from the deposit if the car smells of smoke.", "Staff"),
        ("R46", "No pets, unless agreed with staff in advance.", "Staff"),
        ("R47", "The car may not be driven out of Peninsular Malaysia (no Singapore or Thailand) without staff approval.", "Code (handover)"),
        ("R48", "Traffic summonses and tolls during the rental are paid by the renter.", "Prompt")]),
]


def plain(s):
    return re.sub(r"<[^>]+>", "", s)


def table(rows):
    out = "<table><tr><th>Rule</th><th>Policy</th><th>Enforced by</th></tr>\n"
    for r in rows:
        out += "<tr id=\"%s\"><td>%s</td><td>%s</td><td>%s</td></tr>\n" % ((r[0],) + r)
    return out + "</table>"


CLAUSES = {}
md = f"# {TITLE}\n\nKereta Sewa Jalan-jalan (fictional demo car rental company at KLIA). Rates are in inventory://cars. Cite clauses by ID, e.g. R12.\n"
body = ""
for i, (h, rows) in enumerate(SECTIONS, 1):
    md += f"\n## {i}. {h}\n\n"
    for cid, text, how in rows:
        md += f"- **{cid}** {plain(text)} *(Enforced by: {how})*\n"
        CLAUSES[cid] = {"policy": TITLE, "page": f"{TITLE}.html", "section": h, "text": plain(text), "enforced_by": how}
    body += "<h2>%d. %s</h2>\n%s\n" % (i, h, table(rows))
md += "\n" + MD_USE.format(n=len(SECTIONS) + 1)
body += USE.format(n=len(SECTIONS) + 1)
assert list(CLAUSES) == [f"R{n}" for n in range(1, 49)], "clauses must run R1 to R48 in order"
html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{TITLE}</title><style>
{CSS}
</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../car-rental-booking-agent.html" style="color:inherit;text-decoration:none">{PROJECT}</a></div><h1>{TITLE}</h1><nav id="toc"></nav></div>
{INTRO}
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; {TITLE}</footer></div>
{JS}</body></html>"""
for text in (md, html):
    assert "—" not in text
open(os.path.join(OUT, f"{TITLE}.md"), "w", encoding="utf-8").write(md)
open(os.path.join(OUT, f"{TITLE}.html"), "w", encoding="utf-8").write(html)
with open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8") as f:
    json.dump(CLAUSES, f, indent=1)
print(f"done: {TITLE} page, .md copy, {len(CLAUSES)} clauses")
