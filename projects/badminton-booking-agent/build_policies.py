import json
import os
import re
# Writes the three policies into resources/ from one source: the HTML pages people read (each
# clause a link target), the .md copies Claude reads as MCP resources, and clauses.json, the
# clause list the reply tool checks citations against.
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources")
os.makedirs(OUT, exist_ok=True)
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
h3{font-size:15.5px;color:var(--navy);margin:22px 0 6px}
a{color:var(--accent)}
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
USE = """<h2>{n}. How the assistant uses this policy</h2>
<table><tr><th>Enquiry</th><th>What the assistant does</th></tr>
<tr><td>Covered by policy</td><td>Answers from this policy and names the rule (e.g. {ex}).</td></tr>
<tr><td>Contradicts policy</td><td>Declines, states the rule that applies, and offers what the rule does allow. No exceptions are made in chat.</td></tr>
<tr><td>Not covered by policy</td><td>Does not guess. Hands the enquiry to staff with a short summary and the handover reason.</td></tr>
<tr><td>Policy neither says yes nor no</td><td>Does not choose a reading. Hands the enquiry to staff with the rule that seemed to apply and why it is unclear.</td></tr></table>
<p>Rules marked <b>Code</b> are enforced by the booking tools, so the assistant cannot break them even if asked. Rules marked <b>Prompt</b> guide what the assistant says.</p>"""
COMMON = "<p><strong>Subang Badminton Arena</strong> is a fictional centre used for demonstration. This policy is an MCP resource: the AI assistant reads it to answer players, and the booking tools enforce the rules marked Code.</p>"
BUILT = "<p><strong>Built from:</strong> the project data (<code>main.py</code>: 12 courts, the four hourly rates), the founder's can-do and cannot-do list, and the decisions of 16 Oct 2026 (staff verify deposits, automatic messages, cancellation by request).</p>"


def table(rows):
    out = "<table><tr><th>Rule</th><th>Policy</th><th>Enforced by</th></tr>\n"
    for r in rows:
        out += "<tr id=\"%s\"><td>%s</td><td>%s</td><td>%s</td></tr>\n" % ((r[0],) + r)
    return out + "</table>"


CLAUSES = {}
MD_USE = """## {n}. How the assistant uses this policy

- Covered by policy: answer from this policy and cite the clause.
- Contradicts policy: decline, state the rule, offer what the rule does allow. No exceptions in chat.
- Not covered by policy: do not guess. Hand to staff (reason not_in_policy).
- Policy neither says yes nor no: do not choose a reading. Hand to staff (reason policy_unclear), naming the clause that seemed to apply.
"""


def plain(s):
    return re.sub(r"<[^>]+>", "", s)


def page(fname, title, change, sections, ex):
    md = f"# {title}\n\nSubang Badminton Arena (fictional demo centre). Cite clauses by ID, e.g. {ex}.\n"
    for i, (h, rows) in enumerate(sections, 1):
        md += f"\n## {i}. {h}\n\n"
        for cid, text, how in rows:
            md += f"- **{cid}** {plain(text)} *(Enforced by: {how})*\n"
            CLAUSES[cid] = {"policy": title, "page": fname, "section": h, "text": plain(text), "enforced_by": how}
    md += "\n" + MD_USE.format(n=len(sections) + 1)
    assert "—" not in md
    open(os.path.join(OUT, fname.replace(".html", ".md")), "w", encoding="utf-8").write(md)
    body = ""
    for i, (h, rows) in enumerate(sections, 1):
        body += "<h2>%d. %s</h2>\n%s\n" % (i, h, table(rows))
    body += USE.format(n=len(sections) + 1, ex=ex)
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><style>
{CSS}
</style></head><body><div class="wrap">
<div class="top"><h1>{title}</h1><nav id="toc"></nav></div>
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; {title}</footer></div>
{JS}</body></html>"""
    assert "\u2014" not in html
    open(os.path.join(OUT, fname), "w", encoding="utf-8").write(html)


page("Operation Policy.html", "Operation Policy", "",
     [("The centre", [
         ("O1", "Subang Badminton Arena, Subang Jaya, Selangor. 12 indoor courts, Court 1 to Court 12.", "Code (court list)"),
         ("O2", "Every court has a rubber mat surface, LED lighting, air-conditioning and a scoreboard. All courts are the same and charged the same fee.", "Prompt"),
         ("O3", "Open every day, including public holidays, from 07:00 to 01:00. The last session ends at 01:00.", "Code (slot list)"),
         ("O4", "The counter is staffed during opening hours. Payments are verified and requests reviewed only while the counter is open.", "Prompt")]),
      ("Prices", [
         ("O5", "The court fee, the deposit and when each is paid are set in the Booking Policy (B7 to B10).", "Code (fee table)"),
         ("O6", "Fees are fixed. No discount, package, membership price or price match is offered through the assistant.", "Code (no discount tool)"),
         ("O7", "The assistant quotes only the court fee, the deposit and the racket rental (O9). Any other price (coaching, events, shuttlecocks, merchandise) is quoted by staff.", "Prompt")]),
      ("Facilities", [
         ("O8", "Changing rooms with showers, drinking water and free parking for players.", "Prompt"),
         ("O9", "Racket rental at the counter: RM 5 per racket per booking, subject to stock. Rackets cannot be reserved in advance.", "Prompt"),
         ("O10", "Shuttlecocks are sold at the counter. Prices are given by staff.", "Prompt")]),
      ("House rules", [
         ("O11", "Non-marking indoor shoes only on court.", "Prompt"),
         ("O12", "Up to 6 players per court per session.", "Prompt"),
         ("O13", "No food on court. Bottled drinks are allowed.", "Prompt"),
         ("O14", "Check in at the counter at least 10 minutes before the session. Sessions end on time, whatever time play starts.", "Prompt")]),
      ("Payment", [
         ("O15", "Paid at booking (the deposit, and the court fee if the player pays it then): DuitNow QR only, with the booking reference in the payment reference field.", "Code (QR and reference shown by the tool)"),
         ("O16", "Paid after the session (the court fee, if not paid at booking): at the counter, by cash, card or DuitNow QR.", "Prompt"),
         ("O17", "The assistant never receives, checks or confirms a payment. Staff check every payment against the centre's bank record. A receipt screenshot helps staff find the payment but does not confirm it.", "Code (no payment tool)")]),
      ("Privacy", [
         ("O18", "Availability is shown as free or taken only. The assistant never names who booked a court.", "Code (availability tool returns no names)"),
         ("O19", "A player sees only their own booking, after verification (Booking Policy B17).", "Code"),
         ("O20", "The assistant never lists bookings.", "Code (no list tool)")]),
      ("Language", [
         ("O21", "The assistant replies in English.", "Prompt")])],
     "O9")

page("Booking Policy.html", "Booking Policy", "",
     [("Making a booking", [
         ("B1", "Bookings can be made for today and the next 7 days. A date further ahead is refused, with the date it opens for booking.", "Code"),
         ("B2", "A session starts on the hour and lasts 1, 2 or 3 hours, inside opening hours (Operation Policy O3).", "Code"),
         ("B3", "A booking must be made at least 2 hours before the session starts. Later than that, the player books at the counter.", "Code"),
         ("B4", "One booking is for one court. A player may hold up to 2 courts at the same time under one mobile number.", "Code"),
         ("B5", "The player gives a name and a Malaysian mobile number. No IC number is asked for or stored.", "Code"),
         ("B6", "A court that is held or confirmed for any part of the requested time cannot be booked. The assistant offers the nearest free courts or times instead.", "Code")]),
      ("Court fee and deposit", [
         ("B7", "Court fee, per court per hour: weekday RM 20, weekend RM 25. The weekend fee applies on Saturday, Sunday and public holidays.", "Code (fee table)"),
         ("B8", "Every booking needs a deposit of RM 50, whatever its length.", "Code"),
         ("B9", "The player chooses when to pay the court fee: together with the deposit when booking, or at the counter after the session (Operation Policy O16).", "Code (amount shown by the tool)"),
         ("B10", "After the session, the deposit is refunded. If the court fee was not paid at booking, the deposit can instead be deducted from it at the counter.", "Prompt")]),
      ("Hold", [
         ("B11", "A booking request gets a booking reference (e.g. <code>BK-2041</code>) and holds the court for 30 minutes. The assistant shows the DuitNow QR, the amount (RM 50, or RM 50 plus the court fee) and the reference.", "Code"),
         ("B12", "Payment is reported only by uploading the payment receipt in the chat within the 30 minutes. A message saying the payment was made, without a receipt, is not accepted. Once a receipt is uploaded, the hold continues until staff check it.", "Code (report needs a receipt)"),
         ("B13", "If the payment is not reported within 30 minutes, the hold is marked expired on the staff dashboard. Staff release it, the court becomes available again, and the player receives an automatic message. Nothing is charged.", "Code (dashboard and fixed message)")]),
      ("Confirmation", [
         ("B14", "A booking is confirmed only when staff find the payment in the centre's bank record and press Confirm. The assistant never confirms a booking.", "Code (no confirm tool)"),
         ("B15", "On Confirm, the player receives an automatic message: court, date, time, amount paid, and the court fee due at the counter if not yet paid.", "Code (fixed message)"),
         ("B16", "If staff cannot find the payment, they press Not received. The court is released and the player receives an automatic message.", "Code (fixed message)")]),
      ("Checking a booking", [
         ("B17", "To see a booking, the player gives the booking reference and the last 4 digits of the mobile number on it. Both must match. The assistant then shares that booking only: court, date, time, amounts and status.", "Code"),
         ("B18", "After 3 failed checks in one conversation, the assistant stops checking and hands the enquiry to staff.", "Code")]),
      ("What the assistant does not handle", [
         ("B19", "Changing or moving a booking is not done in chat. The player cancels (Cancellation Policy) and books again, or asks staff.", "Code (no change tool)"),
         ("B20", "These go to staff: weekly or recurring bookings, sessions longer than 3 hours, more than 2 courts, tournaments, events, coaching, corporate and school bookings.", "Prompt (handover reason)"),
         ("B21", "Requests to skip the deposit, hold a court without a booking, or extend a hold are declined under B8 and B11 to B13.", "Code"),
         ("B22", "A player who asks for a person is handed to staff at once, with no further questions. The request appears on the staff dashboard for follow-up.", "Code (handover reason)")]),
      ("Receipts", [
         ("B23", "The assistant reads the uploaded receipt: amount, reference, date and time, and recipient. The system compares them with the booking and shows staff the receipt with any difference (wrong amount, wrong reference, paid before the booking was made).", "Code (fixed fields, compared in code)"),
         ("B24", "An image that is not a payment receipt, or cannot be read, is not accepted. The player is asked to upload the receipt again.", "Code"),
         ("B25", "A receipt does not confirm a booking. Staff confirm only after finding the payment in the bank record (B14).", "Code (no confirm tool)")])],
     "B7")

page("Cancellation Policy.html", "Cancellation Policy", "",
     [("Who can cancel", [
         ("C1", "Only the player who made the booking, verified by booking reference and the last 4 digits of the mobile number (Booking Policy B17).", "Code"),
         ("C2", "A held booking whose payment is not reported within 30 minutes is released by staff (Booking Policy B13). Nothing is charged.", "Code")]),
      ("Refund", [
         ("C3", "A confirmed booking can be cancelled at any time before the session starts. The RM 50 deposit is refunded in full once the player is verified, with no notice period. A court fee paid at booking is refunded with it.", "Code (outcome calculated)"),
         ("C4", "Refunds go to the account that paid, within 3 working days of staff approval.", "Prompt"),
         ("C5", "Only a no-show forfeits the deposit: the player neither cancels before the session starts nor checks in. A court fee paid at booking is refunded.", "Code (outcome calculated)"),
         ("C6", "Part of a booking cannot be cancelled. To play fewer hours, the player cancels the booking and books again.", "Code")]),
      ("How a cancellation is processed", [
         ("C7", "The assistant tells the player the refund amount before submitting, and submits only when the player agrees.", "Code (outcome returned by the tool)"),
         ("C8", "The request appears on the staff dashboard as a pending cancellation. The booking stays in place until staff approve.", "Code"),
         ("C9", "On Approve, the court is released and the player receives an automatic message stating the deposit refunded (and the court fee, if paid at booking).", "Code (fixed message)"),
         ("C10", "Refunds are paid by staff outside the chat. The assistant never refunds, waives or reduces an amount.", "Code (no refund tool)")]),
      ("Outside this policy", [
         ("C11", "Requests to refund a no-show deposit are declined in chat with C5 stated. No exception is made by the assistant.", "Prompt"),
         ("C12", "A session the centre cancels (power failure, court repair, an event) is handled by staff, who offer a full refund or another slot. The assistant hands these to staff.", "Prompt (handover reason)"),
         ("C13", "Complaints, disputes about a refund, and refunds not received after 3 working days go to staff.", "Prompt (handover reason)")])],
     "C3")
with open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8") as f:
    json.dump(CLAUSES, f, indent=1)
print(f"done: 3 pages, 3 .md copies, {len(CLAUSES)} clauses")
