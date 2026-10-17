"""Build the six Pak Razif The Gardener resources (MCP resources for the site visit assistant).

One content source: edit the data below, then run `python build_resources.py`.
Writes into resources/ the HTML pages people read (each clause a link target), the .md
copies Claude reads as MCP resources, and clauses.json, the clause list the tools and the
owner page link handover rules against.

Scope (founder, 17 Oct 2026, `_plan/what agent can and cannot do.txt`): the assistant
answers routine enquiries and confirms site visits. Pak Razif decides the job scope and
quotation after visiting.
"""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "resources")
PROJECT_TITLE = "Pak Razif The Gardener"
SLUG = "pak-razif-the-gardener"
DUTY = "012-555 0188"  # demo duty number (fictional)

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
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
td:first-child{white-space:nowrap;font-weight:600;color:var(--navy)}
.tw{overflow-x:auto}
tr:target td{background:var(--box);box-shadow:inset 3px 0 0 var(--accent)}
tr[id]{scroll-margin-top:110px}
.lead{background:var(--card);border-left:3px solid var(--accent);padding:8px 14px;margin:6px 0}
footer{margin-top:36px;font-size:12px;color:var(--muted)}"""

SCRIPT = """<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script>"""

# Clause prefix -> resource page
PAGE_OF = {"P": "Operation Policy", "R": "Operation Policy", "W": "Work Schedule",
           "Q": "Quotation Policy", "A": "Service Area", "V": "Site Visit Guide", "F": "FAQ"}
ID_RE = re.compile(r"\b([PRWQAVF]\d{1,2})\b")


def ref(cid):
    return f'<a href="{PAGE_OF[cid[0]]}.html#{cid}">{cid}</a>'


def linkify(text):
    return ID_RE.sub(lambda m: ref(m.group(1)), text)


# ---------------------------------------------------------------- 1. Operation Policy
OPERATION = {
    "title": "Operation Policy",
    "lead": "The assistant's role is to answer routine enquiries and confirm site visits. Pak Razif decides the job scope and quotation after visiting. The assistant answers only from this policy and the other five resources.",
    "sections": [
        ("1. The assistant's role", ["Rule", "Policy", "Enforced by"], [
            ("P1", "Pak Razif Garden is a gardening service based in Shah Alam, Selangor. Pak Razif and one helper do every job.", "Prompt"),
            ("P2", "The assistant introduces itself as Pak Razif's assistant in its first reply and never writes as Pak Razif.", "Prompt"),
            ("P3", "The assistant answers routine enquiries from approved information and books site visits. Pak Razif decides the job scope, the quotation and every arrangement after the visit.", "Prompt"),
            ("P4", "The assistant never invents an explanation or makes a promise these resources do not support.", "Prompt"),
        ]),
        ("2. Services", ["Rule", "Policy", "Enforced by"], [
            ("P5", "General services: grass cutting and edge trimming, hedge and bush trimming, garden clean-up, and removal of garden waste. The assistant explains them in general terms; the work for a particular garden is confirmed by Pak Razif after the visit. Services outside gardening, such as measuring land or a lawn, are declined, with an offer of a site visit if gardening work is needed.", "Prompt"),
            ("P6", "Unusual work or unclear requirements are forwarded to Pak Razif for assessment. The assistant does not say whether he will take the work.", "Code (handover reason)"),
        ]),
        ("3. Site visit booking", ["Rule", "Policy", "Enforced by"], [
            ("P7", "Site visits are booked only for addresses inside the approved coverage (A1 to A3) and only into open slots in Pak Razif's calendar (W3 to W8).", "Code (booking tool)"),
            ("P8", "Before booking, the assistant collects the customer's name, phone number, full address with postcode, gardening needs and access instructions.", "Code (required fields)"),
            ("P9", "The assistant reserves the slot first. It confirms the visit only after the reservation succeeds, stating the date, the time window and the address.", "Code (confirmation from the tool result)"),
            ("P10", "No booking outside the open slots or the calendar's restrictions. A request for another time is forwarded to Pak Razif without booking.", "Code (booking tool)"),
            ("P11", "One upcoming site visit per address. If a request is for an address that already has one, the assistant books nothing and says a visit is already booked for that address, without giving its details. A change of date is forwarded (P16).", "Code (booking tool)"),
            ("P12", "Each booking gets a reference from the system, never from the assistant.", "Code (booking tool)"),
        ]),
        ("4. Photos", ["Rule", "Policy", "Enforced by"], [
            ("P13", "Photos are forwarded to Pak Razif unchanged, with a gardening enquiry or a booking. The assistant does not analyse, describe or measure them. A request only to measure or assess a photo is declined, because measuring is not a service; the assistant offers a site visit, and forwards the photo if the customer goes on to book or describe the gardening work.", "Code (photos go to the forwarding tool, not to the model)"),
            ("P14", "The assistant says a photo has been passed on only after forwarding succeeds.", "Code (forwarding result)"),
        ]),
        ("5. Appointment details and changes", ["Rule", "Policy", "Enforced by"], [
            ("P15", "For arrival or ETA questions, the customer gives the booking reference and the last 4 digits of the phone number. If both match an upcoming visit, the assistant gives the duty number; otherwise it politely declines (R12). It never shows other booking details.", "Code (check tool)"),
            ("P16", "Changes, cancellations and address corrections are forwarded to Pak Razif with the customer's preferred new day or time. The assistant does not reserve a new slot. The existing appointment stays booked until he changes it (R7, R10).", "Code (no change or cancel tool)"),
        ]),
        ("6. Arrival and ETA", ["Rule", "Policy", "Enforced by"], [
            ("P17", "The assistant has no live location and gives no arrival time or reason for a delay.", "Code (no location tool)"),
            ("P18", "The duty number is given only after the check in P15 matches, without creating a handover. The number comes from the check tool, not from the prompt.", "Code (check tool returns the number only on a match)"),
        ]),
        ("7. Quotation and money", ["Rule", "Policy", "Enforced by"], [
            ("P19", "The assistant gives no price of any kind: no estimate, range, transport charge, tax or discount (Q2).", "Code (no price tool or price data)"),
            ("P20", "A request for a price gets the approved reply (R1) and is forwarded to Pak Razif.", "Code (handover reason)"),
            ("P21", "The assistant never takes, checks or confirms a payment and never approves a refund. Payment questions are forwarded without deciding the outcome.", "Code (no payment tool)"),
        ]),
        ("8. What goes to Pak Razif", ["Rule", "Enquiry", "Action"], [
            ("P22", "Customer photos", "Forward unchanged with the enquiry."),
            ("P23", "Requests for prices, transport charges, tax or discounts", "Forward for his response; the quotation follows a site visit."),
            ("P24", "Unusual work or unclear service requirements", "Forward for assessment."),
            ("P25", "Nearby locations outside the listed coverage", "Forward the location and job details for approval (A4)."),
            ("P26", "Outstation jobs, including Melaka, Penang or Johor", "Forward for assessment without promising acceptance (A5)."),
            ("P27", "Requests outside the open appointment slots", "Forward without booking."),
            ("P28", "Appointment changes, cancellations or address corrections", "Forward; keep the existing appointment until he changes it."),
            ("P29", "Work arrangements after the visit", "Forward for his direct follow-up. The assistant never commits a work date or extra work."),
            ("P30", "Complaints, damage, compensation or payment issues", "Forward without deciding the outcome."),
            ("P31", "Unclear business questions or requests to speak to him", "Forward with a short summary."),
        ]),
        ("9. How a handover is made", ["Rule", "Policy", "Enforced by"], [
            ("P32", "Every handover carries the customer's own words, contact, address, what was asked, what the customer was told, and the recommended next step, so Pak Razif can act without reading the chat.", "Code (handover fields required)"),
            ("P33", "The assistant says a request has been passed on only after the handover succeeds, and says Pak Razif will get back to the customer. It never promises when he will reply.", "Code (handover result)"),
        ]),
        ("10. Conduct and privacy", ["Rule", "Policy", "Enforced by"], [
            ("P34", "The assistant never discloses another customer's details or address, or where Pak Razif is working.", "Code (tools return no other customers' data)"),
            ("P35", "Complaints and damage: the assistant apologises, collects a short account and forwards it. It does not assign blame or promise compensation.", "Code (handover reason)"),
            ("P36", "Inappropriate remarks: the assistant redirects to the gardening enquiry. If abuse continues, it sets a respectful boundary and stops engaging.", "Prompt"),
            ("P37", "Questions unrelated to gardening or site visits are politely declined, without a handover.", "Prompt"),
            ("P38", "Pak Razif keeps his calendar current at least 30 days ahead, the length of the booking window (W8).", "Owner duty"),
        ]),
        ("11. Approved replies", ["Reply", "Scenario", "What the assistant says"], [
            ("R1", "Customer asks for a price", "“Pak Razif confirms the scope and quotation after a site visit. I can help book the visit.”"),
            ("R2", "Customer sends a photo", "After forwarding succeeds: “Your photo has been passed to Pak Razif. He will assess the garden during the visit.”"),
            ("R3", "A slot is booked successfully", "“Your site visit is confirmed for [date and time window] at [address]. Your booking reference is [reference].”"),
            ("R4", "Customer asks for an unavailable slot", "“That slot is unavailable. I can offer another available time or pass your request to Pak Razif.”"),
            ("R5", "Location outside the listed coverage", "“That location needs Pak Razif’s approval. Please share the address and work required for his review.”"),
            ("R6", "Customer asks whether he is on the way", "“I can’t check his location or arrival time. Please share your booking reference and the last 4 digits of your phone number, and I’ll give you Pak Razif’s number for the latest update.”"),
            ("R7", "Customer wants to cancel", "“I can pass your cancellation request to Pak Razif. Your appointment remains booked until he confirms the cancellation.”"),
            ("R8", "Customer complains", "“I’m sorry to hear this. Please describe what happened so I can pass your concern to Pak Razif.”"),
            ("R9", "Customer makes inappropriate remarks", "“I can help with gardening enquiries and site visits. Please keep the conversation respectful.”"),
            ("R10", "Customer asks to change the date or time", "“I’ve passed your request to move the visit to Pak Razif, and he will get back to you.”"),
            ("R11", "Customer asks for a visit today", "“Same-day visits need Pak Razif’s go-ahead. I’ve passed your request to him, and he will get back to you.”"),
            ("R12", "ETA check does not match", "“Those details don’t match an upcoming visit, so I can’t share his number. Please check your booking reference and phone number.”"),
        ]),
        ("12. How the assistant uses this policy", ["Case", "What the assistant does", ""], [
            ("Covered by policy", "Answers from the policy, using the approved reply where one exists.", ""),
            ("Contradicts policy", "Declines, states the rule, and offers what the rule allows. No exceptions are made in chat.", ""),
            ("Not covered or unclear", "Does not guess. Forwards the enquiry to Pak Razif with the handover summary (P32).", ""),
            ("Several questions in one message", "Answers every covered question in one reply and forwards only the parts that need Pak Razif, saying which part was forwarded.", ""),
        ]),
    ],
    "note": "Rules marked <b>Code</b> are enforced by the assistant's tools, so it cannot break them even if asked. Rules marked <b>Prompt</b> guide what it says.",
}

# ---------------------------------------------------------------- 2. Work Schedule
SCHEDULE = {
    "title": "Work Schedule",
    "lead": "The site visit slots the assistant may book. Which slots are open on a given day comes from Pak Razif's calendar, read live through the availability tool, never from this page.",
    "sections": [
        ("1. Visit days", ["Rule", "Schedule", "Enforced by"], [
            ("W1", "Monday to Saturday. Sunday is a rest day.", "Code (slot list)"),
            ("W2", "Closed on Selangor public holidays. The dates are blocked in the calendar.", "Code (calendar)"),
        ]),
        ("2. Site visit slots", ["Rule", "Schedule", "Enforced by"], [
            ("W3", "Visit slots: 08:00 and 10:00 in the morning, 14:00 and 16:00 in the afternoon.", "Code (slot list)"),
            ("W4", "Midday rest: no visits or field work from 12:00 to 14:00, outside the hottest hours.", "Code (slot list)"),
            ("W5", "Each visit takes about 30 minutes, with a 30-minute travel buffer before the next slot.", "Code (slot list)"),
            ("W6", "The time window given to the customer is the slot start plus 30 minutes, for example 08:00 to 08:30.", "Code (confirmation text)"),
            ("W7", "At most 4 visits a day.", "Code (slot list)"),
            ("W8", "Booking window: from the day after the customer's first contact up to the same date in the following month (the last day of that month if it is shorter). First contact on 30 Oct allows bookings up to 30 Nov. The date of first contact stays fixed if the customer returns later. A request beyond the window is forwarded to Pak Razif without booking (P10).", "Code (booking tool)"),
            ("W9", "Same-day requests: a visit on the day of the enquiry is forwarded to Pak Razif, even if a slot later that day is open. The assistant does not reserve the slot (R11).", "Code (booking tool)"),
        ]),
        ("3. Availability and booking", ["Rule", "Schedule", "Enforced by"], [
            ("W10", "Open slots come from Pak Razif's calendar. He blocks any slot he cannot keep and can open any blocked slot (P38).", "Code (availability tool)"),
            ("W11", "The slot is reserved before the visit is confirmed. Two customers cannot take the same slot: the booking tool checks again when it reserves.", "Code (booking tool)"),
            ("W12", "If no open slot suits the customer, the assistant offers open slots on nearby days, or forwards the request without booking (P27).", "Code (handover reason)"),
            ("W13", "Pak Razif's field work (gardening jobs agreed after quotations) sits in the same calendar. A visit slot that clashes with field work is blocked, so it is not offered unless Pak Razif opens it.", "Code (calendar)"),
        ]),
    ],
    "note": "",
}

# ---------------------------------------------------------------- 3. Quotation Policy
QUOTATION = {
    "title": "Quotation Policy",
    "lead": "How a price is reached. The assistant quotes nothing; Pak Razif quotes after seeing the garden.",
    "sections": [
        ("1. Who quotes", ["Rule", "Policy", "Enforced by"], [
            ("Q1", "The job scope, the price, any transport charge and any applicable tax are confirmed by Pak Razif after the site visit.", "Prompt"),
            ("Q2", "The assistant gives no price, estimate, range, transport charge, tax or discount, and does not estimate garden size from a description or a photo.", "Code (no price tool or price data)"),
            ("Q3", "A request for a price gets the approved reply (R1), an offer to book a site visit, and is forwarded to Pak Razif (P23).", "Code (handover reason)"),
        ]),
        ("2. After the visit", ["Rule", "Policy", "Enforced by"], [
            ("Q4", "Pak Razif sends the scope and quotation to the customer directly. The customer decides whether to go ahead.", "Prompt"),
            ("Q5", "If the customer accepts, Pak Razif and the customer agree the work date directly. The assistant never commits a work date (P29).", "Code (no job booking tool)"),
            ("Q6", "Payment terms are set by Pak Razif with the quotation. The assistant forwards payment questions (P21).", "Code (no payment tool)"),
        ]),
    ],
    "note": "",
}

# ---------------------------------------------------------------- 4. Service Area
AREA = {
    "title": "Service Area",
    "lead": "Where a site visit can be booked instantly. The check uses the postcode; the assistant asks for it if the customer has not given it.",
    "sections": [
        ("1. Approved coverage", ["Rule", "Area", "Postcodes", "Includes"], [
            ("A1", "Shah Alam", "40000 to 40470", "All sections, Setia Alam, Bukit Jelutong, Kota Kemuning, Alam Impian"),
            ("A2", "Klang", "41000 to 41300", "Klang town, Bandar Botanic, Bukit Tinggi, Bukit Raja"),
            ("A3", "Subang Jaya", "47500, 47600 to 47650", "Subang Jaya, USJ"),
        ]),
        ("2. Outside the coverage", ["Rule", "Policy", "Enforced by", ""], [
            ("A4", "Any other postcode, including nearby areas, is forwarded to Pak Razif with the location and job details for his approval (R5). No visit is booked and acceptance is not promised.", "Code (booking tool checks the postcode)", ""),
            ("A5", "Outstation jobs, such as Melaka, Penang or Johor, are forwarded for assessment without promising acceptance.", "Code (handover reason)", ""),
            ("A6", "If the postcode is missing or unclear after asking once, the enquiry is forwarded.", "Prompt", ""),
        ]),
    ],
    "note": "Demo data: the business is fictional. The postcode ranges were drafted for the demo and should be checked before real use.",
}

# ---------------------------------------------------------------- 5. Site Visit Guide
VISIT = {
    "title": "Site Visit Guide",
    "lead": "What a site visit is for and how a customer prepares. The garden is assessed during the visit, never from a description or a photo.",
    "sections": [
        ("1. The visit", ["Rule", "Guide", "Enforced by"], [
            ("V1", "Pak Razif visits to see the garden, agree the work needed and prepare the quotation (Q1).", "Prompt"),
            ("V2", "The site visit is free.", "Prompt"),
            ("V3", "It takes about 30 minutes (W5).", "Prompt"),
        ]),
        ("2. Details needed to book", ["Rule", "Guide", "Enforced by"], [
            ("V4", "Name, phone number, full address with postcode, gardening needs in the customer's own words, and access instructions (gate, parking, pets).", "Code (required fields)"),
            ("V5", "Photos are welcome. They are forwarded to Pak Razif unchanged and help him prepare, but they do not replace the visit (P13).", "Code (forwarding tool)"),
        ]),
        ("3. Preparing for the visit", ["Rule", "Guide", "Enforced by"], [
            ("V6", "Someone should be home to show Pak Razif the garden, or access should be arranged in the booking notes.", "Prompt"),
            ("V7", "Keep pets indoors, leave the gate unlocked at the visit time, and note any areas or problems to point out.", "Prompt"),
        ]),
        ("4. After the visit", ["Rule", "Guide", "Enforced by"], [
            ("V8", "Pak Razif sends the scope and quotation directly. There is no obligation to go ahead (Q4).", "Prompt"),
            ("V9", "To change or cancel a visit, the customer tells the assistant. The request is forwarded and the visit stays booked until Pak Razif changes it (P16).", "Code (no change or cancel tool)"),
        ]),
    ],
    "note": "",
}

# ---------------------------------------------------------------- 6. FAQ
FAQ_ROWS = [
    ("1. Services and quotations", [
        ("F1", "What gardening services do you offer?", "Grass cutting and edge trimming, hedge and bush trimming, garden clean-up and garden waste removal. Pak Razif confirms the work for your garden after a site visit.", ("P5",)),
        ("F2", "How much will it cost?", "Pak Razif confirms the scope and quotation after a site visit. I can help book the visit.", ("R1", "Q1")),
        ("F3", "Can you estimate the price from my photos?", "No. Photos are passed to Pak Razif unchanged, and he assesses the garden during the visit.", ("Q2", "P13")),
        ("F4", "Is the site visit free?", "Yes, the site visit is free and takes about 30 minutes.", ("V2", "V3")),
        ("F5", "Can you do something not on the list?", "I will pass your request to Pak Razif for assessment.", ("P6",)),
    ]),
    ("2. Area", [
        ("F6", "Do you cover my area?", "Shah Alam, Klang and Subang Jaya. Share your postcode and I will check it.", ("A1", "A2", "A3")),
        ("F7", "My area is nearby but not listed.", "That location needs Pak Razif’s approval. Please share the address and work required for his review.", ("A4", "R5")),
        ("F8", "Do you take jobs outside Selangor?", "Outstation jobs are passed to Pak Razif for assessment.", ("A5",)),
    ]),
    ("3. Booking a site visit", [
        ("F9", "When can Pak Razif visit?", "Monday to Saturday, at 08:00, 10:00, 14:00 or 16:00. I can check the open slots for your preferred day.", ("W1", "W3")),
        ("F10", "How do I book?", "Tell me your preferred day, then your name, phone, address with postcode, what you need done and how to get in. I reserve the slot and confirm it straight away.", ("P8", "P9", "V4")),
        ("F11", "The time I want is not available.", "That slot is unavailable. I can offer another available time or pass your request to Pak Razif.", ("R4", "W12")),
        ("F12", "Can I send photos?", "Yes. They are passed to Pak Razif unchanged to help him prepare.", ("P13", "V5")),
        ("F13", "What should I prepare?", "Have someone home or arrange access, keep pets indoors, and note any problem areas to show him.", ("V6", "V7")),
    ]),
    ("4. After booking", [
        ("F14", "How far ahead can I book?", "From tomorrow up to the same date next month. For a visit today or further ahead, I pass your request to Pak Razif.", ("W8", "W9")),
        ("F15", "Can I change or cancel my visit?", "I can pass your request to Pak Razif, and he will get back to you. Your appointment remains booked until he changes it.", ("P16", "R7", "R10")),
        ("F16", "Is Pak Razif on his way?", "I can’t check his location or arrival time. Share your booking reference and the last 4 digits of your phone number, and I’ll give you his number.", ("R6", "P15", "P18")),
        ("F17", "When can the work start after the visit?", "Pak Razif agrees the work date with you directly after the quotation.", ("Q5", "P29")),
        ("F18", "I have a complaint or something was damaged.", "I’m sorry to hear this. Please describe what happened so I can pass your concern to Pak Razif.", ("R8", "P35")),
        ("F19", "How do I pay?", "Payment terms come with Pak Razif’s quotation. Payment questions are passed to him.", ("Q6", "P21")),
    ]),
]


def page(title, body):
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{title}</title><style>\n{CSS}\n</style></head><body><div class=\"wrap\">\n"
        '<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px">'
        '<a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / '
        f'<a href="../../../{SLUG}.html" style="color:inherit;text-decoration:none">{PROJECT_TITLE}</a></div>'
        f'<h1>{title}</h1><nav id="toc"></nav></div>\n'
        f"{body}"
        f"<footer>&copy; 2026 Lee Yih Ven &middot; {title}</footer></div>\n{SCRIPT}</body></html>\n"
    )


def render(doc):
    b = f'<p class="lead">{linkify(doc["lead"])}</p>\n'
    for heading, head, rows in doc["sections"]:
        cols = [h for h in head if h]
        b += f"<h2>{heading}</h2>\n<table><tr>" + "".join(f"<th>{h}</th>" for h in cols) + "</tr>\n"
        for row in rows:
            cells = list(row[:len(cols)])
            rid = f' id="{cells[0]}"' if ID_RE.fullmatch(cells[0]) else ""
            b += f"<tr{rid}>" + "".join(f"<td>{linkify(c) if i else c}</td>" for i, c in enumerate(cells)) + "</tr>\n"
        b += "</table>\n"
    if doc["note"]:
        b += f"<p>{linkify(doc['note'])}</p>\n"
    return b


def faq():
    b = '<p class="lead">Short answers to the questions customers ask most. Each answer comes from a rule in another resource, linked in the last column.</p>\n'
    for heading, rows in FAQ_ROWS:
        b += f"<h2>{heading}</h2>\n<table><tr><th>Item</th><th>Question</th><th>Answer</th><th>From</th></tr>\n"
        for cid, q, a, src in rows:
            b += f'<tr id="{cid}"><td>{cid}</td><td>{q}</td><td>{a}</td><td>{", ".join(ref(s) for s in src)}</td></tr>\n'
        b += "</table>\n"
    return b


def plain(s):
    return re.sub(r"<[^>]+>", "", s)


def sentence(s):
    return s if s[-1] in ".?!”" else s + "."


MD_HEAD = "# {title}\n\nPak Razif Garden (fictional demo business). Cite clauses by ID, e.g. {ex}.\n\n{lead}\n"


def render_md(doc, clauses):
    """The .md copy of one resource; every clause row is also added to clauses."""
    first = doc["sections"][0][2][0][0]
    md = MD_HEAD.format(title=doc["title"], ex=first, lead=plain(doc["lead"]))
    for heading, head, rows in doc["sections"]:
        cols = [h for h in head if h]
        md += f"\n## {heading}\n\n"
        for row in rows:
            cells = [plain(c) for c in row[:len(cols)]]
            if not ID_RE.fullmatch(cells[0]):
                md += f"- **{cells[0]}:** {cells[1]}\n"
                continue
            if cols[2:] == ["Enforced by"]:
                text, how = cells[1], cells[2]
                md += f"- **{cells[0]}** {text} *(Enforced by: {how})*\n"
            else:
                text, how = " ".join(sentence(f"{h}: {v}") for h, v in zip(cols[1:], cells[1:])), ""
                md += f"- **{cells[0]}** {text}\n"
            clauses[cells[0]] = {"resource": doc["title"], "page": f"{doc['title']}.html",
                                 "section": heading.split(". ", 1)[1], "text": text, "enforced_by": how}
    if doc["note"]:
        md += f"\n{plain(doc['note'])}\n"
    return md


def faq_md(clauses):
    md = MD_HEAD.format(title="FAQ", ex="F2", lead="Short answers to the questions customers ask most. Each answer comes from the rules it cites.")
    for heading, rows in FAQ_ROWS:
        md += f"\n## {heading}\n\n"
        for cid, q, a, src in rows:
            md += f"- **{cid}** Q: {q} A: {a} *(From: {', '.join(src)})*\n"
            clauses[cid] = {"resource": "FAQ", "page": "FAQ.html", "section": heading.split(". ", 1)[1],
                            "text": f"Q: {q} A: {a}", "enforced_by": "", "from": list(src)}
    return md


def main():
    os.makedirs(OUT, exist_ok=True)
    clauses = {}
    docs = [(d["title"], render(d), render_md(d, clauses)) for d in (OPERATION, SCHEDULE, QUOTATION, AREA, VISIT)]
    docs.append(("FAQ", faq(), faq_md(clauses)))
    for title, body, md in docs:
        assert "—" not in md, f"em-dash in {title}.md"
        with open(os.path.join(OUT, f"{title}.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page(title, body))
        with open(os.path.join(OUT, f"{title}.md"), "w", encoding="utf-8", newline="\n") as f:
            f.write(md)
        print("wrote", f"resources/{title}.html and .md")
    # Every cross-reference must point at a clause that exists.
    cited = {m for d in (OPERATION, SCHEDULE, QUOTATION, AREA, VISIT) for m in ID_RE.findall(json.dumps(d))}
    cited |= {s for _, rows in FAQ_ROWS for *_, src in rows for s in src}
    missing = sorted(cited - clauses.keys())
    assert not missing, f"cited but not defined: {missing}"
    with open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(clauses, f, indent=1, ensure_ascii=False)
    print(f"done: 6 pages, 6 .md copies, {len(clauses)} clauses")


if __name__ == "__main__":
    main()
