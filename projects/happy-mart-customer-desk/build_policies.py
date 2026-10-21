"""Happy Mart routing agent: the one source for every policy, sheet and table.

Writes resources/:
  six department policies (.md), the router workbook, five specialist role sheets, the contact list,
  clauses.json (every clause, its department and what it is silent on) and policy_tables.json
  (contacts, departments, tool owners, field sets, values, campaign days, Selangor holidays, the test "today").
Wording follows Step C - Policies, agents, tools and hooks.html (approved 21 Oct 2026).
Change a clause or a table here, nowhere else, then rerun this file.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "resources")
os.makedirs(OUT, exist_ok=True)

# ---------------------------------------------------------------- contacts
CONTACTS = [
    {"id": "store", "name": "Terrance Ngadan", "title": "store manager", "department": "Store",
     "takes": "Every Happy Mart matter no policy covers (CS4)"},
    {"id": "customer_service", "name": "Nurul Aina Rahim", "title": "customer service manager", "department": "Customer Service",
     "takes": "A customer's request for a person (CS6), verification lock-outs (CS2), replies blocked twice"},
    {"id": "fulfilment", "name": "Tan Wei Ming", "title": "fulfilment supervisor", "department": "Fulfilment",
     "takes": "Delivery matters the Fulfilment policy is silent on; Fulfilment lookups that time out"},
    {"id": "returns", "name": "Siti Hajar Kamal", "title": "returns lead", "department": "Returns",
     "takes": "Return matters the Returns policy is silent on; approving returns after checking the item"},
    {"id": "finance", "name": "Priya Ramasamy", "title": "finance manager", "department": "Finance",
     "takes": "Refund matters the Finance policy is silent on; processing approved refunds"},
    {"id": "claims", "name": "Jessica Chan", "title": "claims officer", "department": "Quality and Claims",
     "takes": "Damage reports, warranty claims, and claims matters the policy is silent on"},
    {"id": "marketing", "name": "Faizal Hamid", "title": "marketing executive", "department": "Marketing",
     "takes": "Campaign and free-delivery matters the Marketing policy is silent on"},
]
STORE_MANAGER_SENTENCE = "We will transfer the matter to our store manager, he will get back to you."

# ---------------------------------------------------------------- policies
POLICIES = {
    "customer_service": {
        "title": "Customer Service Policy", "prefix": "CS", "owner": "Customer Service",
        "read_by": "The router, through the router workbook",
        "clauses": [
            ("CS1", "Before any department looks into an order, the customer gives the order ID and the last 4 digits of the phone number on the order. Both must match one order.", ""),
            ("CS2", "After 3 failed attempts in one conversation, the matter is handed to the customer service manager.", ""),
            ("CS3", "A matter outside the nature of the business (for example politics or the weather) is politely declined. It is not handed to anyone.", ""),
            ("CS4", "A Happy Mart matter that no policy covers is handed to the store manager. The customer is told: \"" + STORE_MANAGER_SENTENCE + "\"", ""),
            ("CS5", "A matter a policy covers but is silent on is handed to that department's contact.", ""),
            ("CS6", "A customer who asks for a person is handed to the customer service manager straight away, with what the customer said.", ""),
            ("CS7", "The assistant never approves, promises or processes a refund, waives a fee or offers credit. Money is decided by staff.", ""),
        ],
    },
    "fulfilment": {
        "title": "Fulfilment Policy", "prefix": "FP", "owner": "Fulfilment", "read_by": "The Fulfilment specialist",
        "clauses": [
            ("FP1", "Standard delivery is RM5 per order.", ""),
            ("FP2", "Orders are delivered within 3 to 5 working days of the order date.", ""),
            ("FP3", "A delivery address can be changed before the order is dispatched. After dispatch, the delivery address cannot be changed.", ""),
            ("FP4", "An order can be cancelled before it is dispatched.", "What happens after dispatch"),
        ],
    },
    "returns": {
        "title": "Returns Policy", "prefix": "RP", "owner": "Returns", "read_by": "The Returns specialist",
        "clauses": [
            ("RP1", "Items can be returned within 14 days of delivery.", ""),
            ("RP2", "Returned items must be unused and in their original packaging.", "Receipts, accessories, the outer shipping box"),
            ("RP3", "Sale items cannot be returned.", ""),
            ("RP4", "3C products cannot be exchanged. Only a return and refund apply, under RP1 (14-day window), RP2 (unused, original packaging), RP3 (no sale items), RP5 (customer arranges and pays the return postage) and FN1 (refund within 5 to 7 working days of approval).", ""),
            ("RP5", "Customers arrange their own return and bear the return postage. The RM5 standard delivery fee (FP1) applies only to delivering an order to the customer; it does not apply to returned goods.", "Whether the original delivery fee is refunded"),
        ],
    },
    "finance": {
        "title": "Finance Policy", "prefix": "FN", "owner": "Finance", "read_by": "The Finance specialist",
        "clauses": [
            ("FN1", "Approved refunds are processed within 5 to 7 working days.", "The refund method"),
        ],
    },
    "claims": {
        "title": "Quality and Claims Policy", "prefix": "QP", "owner": "Quality and Claims", "read_by": "The Claims specialist",
        "clauses": [
            ("QP1", "For a damaged or wrong item, contact customer service within 48 hours of delivery.", "Any evidence the customer must supply"),
            ("QP2", "Every product carries a 30-day Happy Mart shop warranty from the delivery date. The warranty is limited to this shop warranty.", "Any manufacturer warranty"),
            ("QP3", "The warranty covers manufacturing defects only. It does not cover physical damage, liquid damage or misuse.", ""),
            ("QP4", "A faulty product under warranty is repaired or replaced, as decided by the claims officer after inspection.", ""),
            ("QP5", "The customer arranges and pays the postage to send a product in for a warranty claim.", "Return postage after repair"),
        ],
    },
    "marketing": {
        "title": "Marketing Policy", "prefix": "MP", "owner": "Marketing", "read_by": "The Marketing specialist",
        "clauses": [
            ("MP1", "Delivery is free on orders above RM100. An order totalling exactly RM100 is not above RM100 and pays the standard RM5 delivery fee.", ""),
            ("MP2", "Campaign days in 2026: 9 September, 25 September, 10 October, 25 October, 11 November and 25 November.", ""),
            ("MP3", "On an order placed on a campaign day (Malaysia time), delivery is free on orders above RM50, in place of MP1. An order totalling exactly RM50 pays the standard RM5 delivery fee. The order total is the value of the items, before delivery.", ""),
            ("MP4", "9 September, 10 October and 11 November are storewide sales: every product ordered on those days is a sale item.", ""),
            ("MP5", "25 September, 25 October and 25 November are payday sales: selected products, about 20% of the range, are on sale. A product ordered on a payday sale is a sale item only when the order marks it as one.", "Which products are selected, beyond the mark on the order"),
            ("MP6", "Sale items cannot be returned (RP3). The 48-hour damage report (QP1) and the 30-day shop warranty (QP2 to QP5) still apply to sale items.", "The size of the sale discount"),
        ],
    },
}
SPECIALISTS = ["fulfilment", "returns", "finance", "claims", "marketing"]

# ---------------------------------------------------------------- tools and field sets
TOOL_OWNERS = {
    "router": ["verify_order", "ask_specialist", "compose_reply", "send_reply", "hand_to_staff"],
    "fulfilment": ["get_delivery_info", "request_address_change", "request_cancellation", "submit_answer"],
    "returns": ["get_return_info", "request_return", "submit_answer"],
    "finance": ["get_refund_status", "submit_answer"],
    "claims": ["get_claim_info", "file_damage_report", "file_warranty_claim", "submit_answer"],
    "marketing": ["get_order_value", "submit_answer"],
    "synthesis": ["write_reply"],
}
# The fields each lookup may return, enforced in the back end and checked again in PostToolUse (task statement 5.1).
FIELD_SETS = {
    "get_delivery_info": ["order_id", "status", "order_time", "dispatch_time", "delivery_time", "delivery_address", "delivery_window"],
    "get_return_info": ["order_id", "delivery_time", "days_since_delivery", "items"],
    "get_refund_status": ["order_id", "state", "amount", "approval_date", "paid_date"],
    "get_claim_info": ["order_id", "delivery_time", "hours_since_delivery", "days_since_delivery", "items"],
    "get_order_value": ["order_id", "order_time", "order_total", "delivery_fee_charged", "campaign_day", "threshold", "fee_due"],
}

TOPIC_MAP = [
    ("The standard delivery fee amount (FP1), delivery time, order status, dispatch, address change, cancellation", "fulfilment"),
    ("Return window, item condition, sale items and returns, exchanges, return postage, whether the delivery fee is refunded on a return", "returns"),
    ("Refund timing and refund status", "finance"),
    ("Damaged or wrong item, warranty, a faulty product", "claims"),
    ("Whether delivery is free on an order, and why a delivery fee was or was not charged on it; campaign days, sales", "marketing"),
]

HANDOVERS = [
    {"reason": "customer_requested_person", "when": "The customer asks for a person (CS6)", "contact": "customer_service", "clause": "CS6"},
    {"reason": "policy_not_covered", "when": "A Happy Mart matter no policy covers (CS4)", "contact": "store", "clause": "CS4"},
    {"reason": "policy_not_clear", "when": "A specialist finds its clause silent on the case (CS5)", "contact": "department", "clause": "CS5"},
    {"reason": "specialist_timeout", "when": "A specialist could not answer after its own retry", "contact": "department", "clause": "CS5"},
    {"reason": "verification_locked", "when": "3 failed verification attempts (CS2)", "contact": "customer_service", "clause": "CS2"},
    {"reason": "reply_blocked_twice", "when": "The pre-send check blocks the rewrite too", "contact": "customer_service", "clause": "CS7"},
]

VALUES = {
    "standard_fee_sen": 500, "free_above_sen": 10000, "campaign_free_above_sen": 5000,
    "return_days": 14, "report_hours": 48, "warranty_days": 30,
    "verify_attempts": 3, "specialist_limit_ms": 20000, "rewrites_after_block": 1,
    # The fixed values a reply may state without a fact behind it (the pre-send check).
    "allowed_rm": [5, 50, 100], "allowed_ranges": [[3, 5], [5, 7]],
    "allowed_periods": [[14, "days"], [48, "hours"], [30, "days"]],
}
CAMPAIGN_DAYS = {
    "2026-09-09": "storewide", "2026-09-25": "payday", "2026-10-10": "storewide",
    "2026-10-25": "payday", "2026-11-11": "storewide", "2026-11-25": "payday",
}
# Selangor public holidays, Sep to Dec 2026 (the FD table, checked 21 Oct 2026: 25 Oct declared for the
# Sultan's silver jubilee, a Sunday, so Monday 26 Oct is the replacement day).
HOLIDAYS = {
    "2026-09-01": "Selangor public holiday",
    "2026-09-16": "Malaysia Day",
    "2026-10-26": "Silver Jubilee of the Sultan of Selangor (replacement for Sunday 25 October)",
    "2026-11-08": "Deepavali",
    "2026-11-09": "Deepavali (replacement)",
    "2026-12-11": "Birthday of the Sultan of Selangor",
    "2026-12-25": "Christmas Day",
}
NOW = 1793066400  # Tuesday 27 October 2026, 10:00 Malaysia time


def contact(cid):
    return next(c for c in CONTACTS if c["id"] == cid)


def handover_sentence(cid):
    if cid == "store":
        return STORE_MANAGER_SENTENCE
    c = contact(cid)
    return f"We will transfer the matter to {c['name']}, our {c['title']}, who will get back to you."


def policy_md(key):
    p = POLICIES[key]
    lines = [f"# Happy Mart {p['title']}", "",
             f"Owned by {p['owner']}. Read by: {p['read_by']}. Happy Mart Sdn Bhd is a fictional online 3C store in Shah Alam, Selangor.", "",
             "| Clause | Rule | Silent on |", "|---|---|---|"]
    for cid, rule, silent in p["clauses"]:
        lines.append(f"| {cid} | {rule} | {silent} |")
    lines += ["", "Where a clause is silent, the matter is not answered from this policy: it goes to the department's contact (CS5)."]
    return "\n".join(lines) + "\n"


def contacts_md():
    lines = ["# Happy Mart contact list", "", "| Department | Contact | Job title | Takes |", "|---|---|---|---|"]
    for c in CONTACTS:
        lines.append(f"| {c['department']} | {c['name']} | {c['title']} | {c['takes']} |")
    lines += ["", "Every handover names the person and the job title. The sentence the customer is told is built in code:"]
    for c in CONTACTS:
        lines.append(f"- {c['name']}: \"{handover_sentence(c['id'])}\"")
    return "\n".join(lines) + "\n"


def workbook_md():
    L = ["# Router workbook (Customer Service)", "",
         "You are the Customer Service router of Happy Mart. Customers never see the specialists; they see one reply.", "",
         "## What you can do",
         "- Verify the order with verify_order (order ID plus the last 4 digits of the phone number, CS1).",
         "- Read the enquiry and split it into parts; send each part to the specialist that owns it, and only those (ask_specialist).",
         "- Decide the content of the reply from the specialists' answers, then pass that content to compose_reply.",
         "- Send the reply with send_reply. Hand a matter to the named contact with hand_to_staff.", "",
         "## What you cannot do",
         "- Read policy text or order fields, or answer a policy question yourself.",
         "- Let one specialist's answer go to another specialist, or change a specialist's answer.",
         "- Send a reply the pre-send check has blocked. Handle money in any way (CS7).", "",
         "## Topic map", "| Topic | Department |", "|---|---|"]
    for topic, dept in TOPIC_MAP:
        L.append(f"| {topic} | {dept} |")
    L += ["",
          "A Happy Mart matter not on this map (for example a trade-in, a loyalty scheme, corporate pricing) is not covered: hand it to the store manager (policy_not_covered, CS4). Do not verify the order first.",
          "A matter outside the nature of the business (politics, the weather, general knowledge) is politely declined with CS3. Nothing is verified, routed or handed over.",
          "A customer who asks for a person is handed to the customer service manager straight away (customer_requested_person, CS6), without verification.", "",
          "## Order of work",
          "1. Outside the business: compose_reply with decline_outside_business true, then send_reply.",
          "2. Asks for a person, or not covered: hand_to_staff, then compose_reply, then send_reply.",
          "3. Anything else: verify_order first. Without an order ID and the last 4 phone digits, ask for them (CS1). After a failed verification, ask the customer to check both and try again, giving no hint which part was wrong.",
          "4. ask_specialist once per department the enquiry needs. Pass the part of the enquiry that department owns, in the customer's words.",
          "5. A specialist answer with status handover: call hand_to_staff with the reason and contact it names.",
          "6. compose_reply with the specialists' points, each with the clauses the specialist cited. Keep every point; when two answers bear on the same fact, keep both in that order (for example the free-delivery threshold, then the fee).",
          "7. send_reply with the draft exactly as compose_reply returned it. If it is blocked, call compose_reply once more with the same content and the block reasons in fix_note, then send_reply again.", "",
          "## Handovers", "| Reason | When | Contact | Customer is told |", "|---|---|---|---|"]
    for h in HANDOVERS:
        if h["contact"] == "department":
            L.append(f"| {h['reason']} | {h['when']} | That department's contact | \"We will transfer the matter to [name], our [job title], who will get back to you.\" |")
        else:
            c = contact(h["contact"])
            L.append(f"| {h['reason']} | {h['when']} | {c['name']}, {c['title']} | \"{handover_sentence(h['contact'])}\" |")
    L += ["", "The handover sentence is added to the reply by code. A reply that leaves out the person's name and job title is blocked.", "",
          "## When something goes wrong",
          "- A policy is silent: the specialist returns status handover, reason policy_not_clear, and names its contact. Hand it over; state nothing the policy does not say.",
          "- A specialist times out or returns an error: hand to that department's contact with reason specialist_timeout. Never state an unknown as fact.",
          "- No record matches: ask the customer to recheck the order ID and the phone digits (CS1). After 3 failed attempts, hand to the customer service manager (verification_locked, CS2)."]
    return "\n".join(L) + "\n"


ROLE = {
    "fulfilment": {"owns": "FP1 to FP4", "can": [
        "get_delivery_info: status, dispatch and delivery times, the delivery address and the delivery window computed in code (FP2).",
        "request_address_change: a pending address change for Tan Wei Ming, only before dispatch (FP3).",
        "request_cancellation: a pending cancellation for Tan Wei Ming, only before dispatch (FP4)."],
        "silent": "After dispatch, an address change is refused under FP3: answer that the address cannot be changed. FP4 is silent after dispatch: a cancellation after dispatch is handed back as policy_not_clear."},
    "returns": {"owns": "RP1 to RP5", "can": [
        "get_return_info: the delivery date, days since delivery, each item (line ID, product, variant, sale flag) and its return status.",
        "request_return: a pending return for Siti Hajar Kamal; the code refuses it after 14 days (RP1) or for a sale item (RP3)."],
        "silent": "RP2 is silent on receipts, accessories and the outer box; RP5 is silent on whether the original delivery fee is refunded."},
    "finance": {"owns": "FN1", "can": [
        "get_refund_status: the refund state (none, awaiting approval, approved, paid), the amount, the approval date and the paid date."],
        "silent": "FN1 is silent on the refund method."},
    "claims": {"owns": "QP1 to QP5", "can": [
        "get_claim_info: the delivery date and time, hours and days since delivery, each item (line ID, product, variant).",
        "file_damage_report: a pending damaged or wrong item report for Jessica Chan; the code refuses it after 48 hours (QP1).",
        "file_warranty_claim: a pending warranty claim for Jessica Chan; the code refuses it after 30 days (QP2)."],
        "silent": "QP1 is silent on any evidence the customer must supply: never ask for photos, videos, receipts or forms."},
    "marketing": {"owns": "MP1 to MP6", "can": [
        "get_order_value: the order date and total, the delivery fee charged, whether it was a campaign day, the threshold that applies and the fee due, computed in code (MP1, MP2, MP3)."],
        "silent": "MP5 is silent on which products are selected beyond the mark on the order; MP6 on the size of the discount."},
}


def role_md(key):
    r = ROLE[key]
    p = POLICIES[key]
    c = contact(key)
    L = [f"# {p['owner']} specialist: role sheet", "",
         f"## Owns", f"The {p['title']}: {r['owns']}.", "",
         "## Can do", *[f"- {x}" for x in r["can"]],
         "- submit_answer: your answer, always the last call.", "",
         "## Cannot do",
         "- Speak to the customer, call another specialist or a person.",
         "- Approve, promise or process a refund, waive a fee or offer credit (CS7).",
         "- Cite another department's clauses, add a step or requirement the policy does not state, or state what a clause is silent on.",
         "- Act on an order other than the one in the hand-off, or an item not in that order.", "",
         "## Hand back when",
         f"- {r['silent']}",
         f"- A clause is silent on the case: submit_answer with status handover, reason policy_not_clear. Your contact is {c['name']}, {c['title']}.",
         "- A lookup fails with a transient error: retry it once. If it fails again, submit_answer with status error, saying what you attempted.", "",
         "## Answer format (submit_answer)",
         "- status: answered, handover, or error.",
         "- points: short statements, each with the clause IDs that support it. Every point needs at least one clause from your policy.",
         "- handover: the reason, when status is handover.",
         "- error: what was attempted, when status is error."]
    return "\n".join(L) + "\n"


# ---------------------------------------------------------------- policy pages (build step 17), FD's page style
PROJECT = "Happy Mart Customer Desk"
# What holds each clause, in plain words: a hook in code, the back end, the pre-send check, or the specialist answering from the policy.
ENFORCED = {
    "CS1": "Code: verify_order checks the order ID and phone digits; every order lookup is refused for any other order (PreToolUse and back end)",
    "CS2": "Code: a fourth attempt is refused and handed to the customer service manager (PreToolUse)",
    "CS3": "The router declines; the hooks allow no order lookup or handover for it",
    "CS4": "The router hands it to the store manager; the handover check confirms the contact (PreToolUse)",
    "CS5": "The specialist hands it back; the handover check confirms the department's contact (PreToolUse)",
    "CS6": "The router hands it to the customer service manager straight away; the handover check confirms the contact",
    "CS7": "Code: the pre-send check blocks any refund promise, waiver or credit before a reply is sent",
    "FP1": "The delivery team answers from this clause; the pre-send check allows only the fixed amounts",
    "FP2": "Code: the delivery window is worked out from the order date, skipping weekends and Selangor holidays (PostToolUse)",
    "FP3": "Code: an address change after dispatch is refused, and the delivery team answers that it cannot be changed (PreToolUse and back end)",
    "FP4": "Code: a cancellation after dispatch is refused (PreToolUse and back end)",
    "RP1": "Code: a return after 14 days is refused (PreToolUse and back end)",
    "RP2": "The returns team answers from this clause",
    "RP3": "Code: a return of a sale item is refused (PreToolUse and back end)",
    "RP4": "The returns team answers from this clause; the pre-send check blocks any offer of an exchange",
    "RP5": "The returns team answers from this clause; the pre-send check blocks pickup and return labels",
    "FN1": "The finance team answers from this clause; the pre-send check blocks any refund date not on record",
    "QP1": "Code: a damage report after 48 hours is refused (PreToolUse and back end); the pre-send check blocks requests for photos",
    "QP2": "Code: a warranty claim after 30 days is refused (PreToolUse and back end)",
    "QP3": "The claims team answers from this clause",
    "QP4": "The claims team answers from this clause; the pre-send check blocks a promised repair or replacement",
    "QP5": "The claims team answers from this clause",
    "MP1": "Code: the threshold and the fee due are worked out from the order (PostToolUse)",
    "MP2": "Code: the campaign day is read from this calendar (PostToolUse)",
    "MP3": "Code: the campaign threshold and the fee due are worked out from the order date (PostToolUse)",
    "MP4": "The order data marks every line ordered on a storewide sale day as a sale item",
    "MP5": "The order data marks the selected products on a payday sale day",
    "MP6": "Code: the sale-item check refuses the return (RP3); damage reports and warranty claims still run",
}
PAGE_CSS = """*{box-sizing:border-box}
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
.cl td:first-child{white-space:nowrap;font-weight:600;color:var(--navy)}
.tw{overflow-x:auto}
tr:target td{background:var(--box);box-shadow:inset 3px 0 0 var(--accent)}
tr[id]{scroll-margin-top:110px}
footer{margin-top:36px;font-size:12px;color:var(--muted)}"""
PAGE_JS = """<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script>"""
PAGE_ORDER = ["customer_service", "fulfilment", "returns", "finance", "claims", "marketing"]


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def table(head, rows, ids=False):
    out = "<table><tr>" + "".join(f"<th>{h}</th>" for h in head) + "</tr>\n"
    for r in rows:
        rid = f' id="{r[0]}"' if ids else ""
        out += f"<tr{rid}>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>\n"
    return out + "</table>"


def page(title, intro, body):
    others = [POLICIES[k]["title"] for k in PAGE_ORDER] + ["Contact List", "Campaign Calendar"]
    links = ", ".join(f'<a href="{t}.html">{t}</a>' for t in others if t != title)
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title>
<link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><style>
{PAGE_CSS}
</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../happy-mart-customer-desk.html" style="color:inherit;text-decoration:none">{PROJECT}</a></div><h1>Happy Mart {title}</h1><nav id="toc"></nav></div>
<p><strong>Happy Mart Sdn Bhd</strong> is a fictional online 3C store in Shah Alam, Selangor, used for demonstration. {intro}</p>
<p>The other pages: {links}.</p>
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; Happy Mart {title}</footer></div>
{PAGE_JS}</body></html>"""
    if "—" in html:
        raise SystemExit(f"em-dash in {title}")
    with open(os.path.join(OUT, f"{title}.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(html)


def write_pages():
    for key in PAGE_ORDER:
        p = POLICIES[key]
        c = contact(key if key != "customer_service" else "customer_service")
        rows = [(cid, rule, silent or "", ENFORCED[cid]) for cid, rule, silent in p["clauses"]]
        body = (f"<h2>1. Clauses</h2>\n<div class=\"cl\">{table(['Clause', 'Rule', 'Silent on', 'How the assistant keeps it'], rows, ids=True)}</div>\n"
                f"<h2>2. Who to ask</h2>\n<p>{esc(c['name'])}, {esc(c['title'])}: {esc(c['takes'])}. Where a clause is silent, the matter goes to this person (CS5).</p>")
        page(p["title"], f"This policy is owned by {p['owner']} and read by {p['read_by'].lower()}. Every point the assistant makes cites a clause from these pages.", body)
    rows = [(c["department"], c["name"], c["title"], c["takes"], handover_sentence(c["id"])) for c in CONTACTS]
    page("Contact List", "Every handover names the person and the job title. The sentence the customer is told is built in code from this list.",
         f"<h2>1. Contacts</h2>\n{table(['Department', 'Contact', 'Job title', 'Takes', 'The customer is told'], rows)}\n"
         f"<h2>2. Handover reasons</h2>\n" + table(['Reason', 'When', 'Goes to', 'Clause'],
         [(h["reason"].replace("_", " "), h["when"], "That department's contact" if h["contact"] == "department" else f"{contact(h['contact'])['name']}, {contact(h['contact'])['title']}", h["clause"]) for h in HANDOVERS]))
    import datetime as _dt
    lab = lambda iso: _dt.date.fromisoformat(iso).strftime("%a %d %b %Y").replace(" 0", " ")
    camp = [(lab(d), "Storewide sale: every product is a sale item (MP4)" if k == "storewide" else "Payday sale: selected products, about 20% of the range (MP5)",
             "Free above RM50 (MP3)") for d, k in CAMPAIGN_DAYS.items()]
    hol = [(lab(d), n) for d, n in HOLIDAYS.items()]
    page("Campaign Calendar", "The campaign days set the free-delivery threshold and the sale items; the public holidays are skipped when the delivery window is worked out.",
         f"<h2>1. Campaign days, 2026 (MP2)</h2>\n{table(['Date', 'Sale', 'Delivery'], camp)}\n<p>On every other day, delivery is free on orders above RM100 (MP1); otherwise RM5 (FP1). Sale items cannot be returned (RP3); damage reports and the warranty still apply (MP6).</p>\n"
         f"<h2>2. Selangor public holidays, Sep to Dec 2026</h2>\n{table(['Date', 'Holiday'], hol)}\n<p>Working days are Monday to Friday, except these holidays. The delivery window (FP2) and refund processing (FN1) count working days.</p>")


def main():
    files = {}
    for key, p in POLICIES.items():
        files[f"{p['title']}.md"] = policy_md(key)
    files["Router Workbook.md"] = workbook_md()
    for key in SPECIALISTS:
        files[f"Role Sheet - {POLICIES[key]['owner']}.md"] = role_md(key)
    files["Contact List.md"] = contacts_md()
    for name, text in files.items():
        if "—" in text:
            raise SystemExit(f"em-dash in {name}")
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(text)

    write_pages()
    clauses = {}
    for key, p in POLICIES.items():
        for cid, rule, silent in p["clauses"]:
            clauses[cid] = {"department": key, "rule": rule, "silent_on": silent, "page": f"{p['title']}.html#{cid}", "enforced_by": ENFORCED[cid]}
    with open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8") as f:
        json.dump(clauses, f, indent=1, ensure_ascii=False)

    resources = [{"uri": f"policy://{k}", "name": POLICIES[k]["title"], "file": f"{POLICIES[k]['title']}.md", "for": [k if k != "customer_service" else "router"]} for k in POLICIES]
    resources.append({"uri": "workbook://router", "name": "Router Workbook", "file": "Router Workbook.md", "for": ["router"]})
    for k in SPECIALISTS:
        resources.append({"uri": f"role://{k}", "name": f"Role Sheet - {POLICIES[k]['owner']}", "file": f"Role Sheet - {POLICIES[k]['owner']}.md", "for": [k]})
    resources.append({"uri": "contacts://staff", "name": "Contact List", "file": "Contact List.md", "for": ["router"] + SPECIALISTS})

    tables = {
        "now": NOW, "contacts": CONTACTS, "store_manager_sentence": STORE_MANAGER_SENTENCE,
        "handover_sentences": {c["id"]: handover_sentence(c["id"]) for c in CONTACTS},
        "departments": {k: {"title": POLICIES[k]["owner"], "prefix": POLICIES[k]["prefix"]} for k in POLICIES},
        "specialists": SPECIALISTS, "tool_owners": TOOL_OWNERS, "field_sets": FIELD_SETS,
        "handovers": HANDOVERS, "values": VALUES, "campaign_days": CAMPAIGN_DAYS, "holidays": HOLIDAYS,
        "router_clauses": ["CS1", "CS2", "CS3", "CS4", "CS6"], "resources": resources,
    }
    with open(os.path.join(OUT, "policy_tables.json"), "w", encoding="utf-8") as f:
        json.dump(tables, f, indent=1, ensure_ascii=False)
    print(f"Wrote {len(files)} resources, {len(clauses)} clauses, policy_tables.json")


if __name__ == "__main__":
    main()
