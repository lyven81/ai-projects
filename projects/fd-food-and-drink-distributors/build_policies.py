import json
import os
import re
# Writes the four FD Food and Drink Distributors policies into resources/ from one source:
# for each policy the HTML page people read (each clause a link target) and the .md copy Claude
# reads as an MCP resource; clauses.json, the clause list every refusal's citation is checked
# against; and policy_tables.json, the tables the hooks and the generator read (approval domains,
# promotion calendar, location table, public holidays). Text from the step C outlines approved by
# the founder, 20 Oct 2026. Change a clause or a table here, nowhere else.
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "resources")
os.makedirs(OUT, exist_ok=True)
PROJECT = "FD Food and Drink Distributors"

# Enforced by: "PreToolUse" a hook check refuses before the tool runs; "PostToolUse" the hook
# checks or converts the result; "Back end" the data layer repeats the check on its own;
# "Policy" no tool exists, the assistant answers from the clause and names who decides.
MP = [
    ("Staff and identity", [
        ("MP-01", "Every staff ID has the form DD-TT-NN: department, tier, staff number. SL-01-01 is the Tier 1 employee of Sales, staff number 01.", "PreToolUse"),
        ("MP-02", "Departments: SL Sales, FN Finance, WH Warehouse.", "PreToolUse"),
        ("MP-03", "Tier 01 is the management layer of a department. The department manager is the highest authority in the department; there is no authority above them. Tier 02 is a non-management employee.", "PreToolUse"),
        ("MP-04", "The staff list: SL-01-01 Sales manager, who manages the Sales Tier 02 staff, has no customers of his own, and creates no orders; SL-02-01 and SL-02-02 Sales staff; FN-01-01 Finance manager; FN-02-01 Finance staff; WH-01-01 Warehouse manager; WH-02-01 Warehouse staff.", "PreToolUse"),
        ("MP-05", "Each manager decides only within their own department's domain (SP, FP, WP), as set in the approval domain table below. An approval given by a manager of another department is invalid. Example: the finance manager cannot approve a warehouse decision. Each manager's interface shows only the approval records of their own domain, read-only, and the PreToolUse hook refuses any action that relies on another department's approval (approval_wrong_department).", "PreToolUse"),
        ("MP-06", "Each customer is assigned to one Sales Tier 02 salesperson; customers are assigned only to Sales Tier 02. A Sales Tier 02 employee may act only on their own assigned customers, and makes no decision on another salesperson's customer, including opening the file or the credit. The sales manager may open every customer's account and prices and check stock, for supervision, and acts on a customer only through approvals: his approval of a Tier 02 request is an approval record (MP-09).", "PreToolUse, Back end"),
        ("MP-07", "What each department may open, by view: a customer's location (where it is): every department; a customer's delivery (the warehouse that serves it and the delivery day for an order confirmed now): Sales and Warehouse; a customer's credit (limit, outstanding, available credit, terms): Sales and Finance; a customer's payments (unpaid invoices and their due dates): Finance only; stock quantities: Sales and Warehouse; stock storage (bin location and last manual count): Warehouse only; prices: Sales. Sales Tier 02 opens only its own assigned customers; the sales manager opens every customer, for supervision. The back end enforces this before it returns any data.", "PreToolUse, Back end, PostToolUse"),
        ("MP-08", "A staff member's identity comes from their signed-in session: the staff ID chosen at sign-in, the first step on the staff page. A name or ID typed later in the conversation is never used.", "PreToolUse"),
        ("MP-09", "An approval counts only when it is recorded in the approval records. An approval claimed in the conversation counts as none.", "PreToolUse"),
    ]),
    ("What the assistant may do", [
        ("MP-10", "The assistant may: check stock and its storage, open a view of a customer account, open a customer's prices, create an order, and raise a credit limit, each within the rules in these policies. Where a rule settles the outcome, the assistant applies it and tells the staff member; where a person decides, it explains what happened and who decides.", "PreToolUse"),
        ("MP-11", "Never allowed through the assistant: deleting or changing an order or a customer record, taking or confirming a payment. Changes to customer records are made by their owners under MP-13, outside the assistant. No tool exists for these; the assistant answers such a request from this clause.", "Policy"),
        ("MP-12", "Not for the assistant, but a person can: cancelling an order, changing a price or payment terms, moving a customer between salespersons, transferring stock. No tool exists for these; the assistant tells the staff member which manager of that domain does it (MP-14).", "Policy"),
        ("MP-13", "Customer records are created, changed and closed only in the customer system, outside the assistant, by the manager of the department that owns that part of the record: the sales manager for the customer's name, contacts, delivery address and assigned salesperson; the finance manager for the credit limit, payment terms and closing a customer; the warehouse manager for the warehouse that serves the customer. No one deletes a customer record: a former customer is closed and its order history is kept.", "Policy"),
        ("MP-14", "When a request needs a decision these policies give to a person, the assistant tells the staff member who decides and which clause applies. A request no policy covers is referred to the manager of the department it concerns.", "PreToolUse (next_step), Policy"),
        ("MP-15", "Every tool call and refusal is recorded with the staff ID and the time; every approval record carries the approver's staff ID and the time.", "PostToolUse"),
    ]),
]

SP = [
    ("Orders", [
        ("SP-01", "Orders are created by Sales Tier 02 only, for their own assigned customers (MP-06). The sales manager does not create orders; the sales manager approves the team's requests and may read any order summary.", "PreToolUse, Back end"),
        ("SP-02", "An order lists catalogue SKUs in their ordering unit, in whole units.", "PreToolUse"),
        ("SP-03", "Minimum order value RM 300. A smaller order needs the sales manager's recorded approval.", "PreToolUse"),
        ("SP-04", "Prices are the customer's own price list, held in the back end and served only by retrieve_customer_prices. An SKU with no price on that list cannot be ordered until the sales manager sets one.", "PostToolUse, PreToolUse"),
        ("SP-05", "Promotions apply only between their start and end dates, as listed in the promotion calendar (SP-12). A promotion is a published price and applies without approval.", "PostToolUse, PreToolUse"),
        ("SP-06", "Every discount needs the sales manager's recorded approval, up to 15%; nothing above 15%. Sales Tier 02 staff cannot give a discount on their own.", "PreToolUse"),
        ("SP-07", "The staff member confirms the full order summary on the staff page before the order is created: customer, SKUs and quantities, prices, discount, total, payment route and delivery date. A change to any of these needs a new confirmation.", "PreToolUse"),
        ("SP-08", "Every order request carries a unique request ID. A retry with the same request ID returns the order already created and never creates a second one. The same applies to a credit raise.", "PreToolUse, Back end"),
        ("SP-09", "Separately, the same order for the same customer (same SKUs and quantities) under a new request ID within 30 minutes is treated as a likely duplicate and not created; the staff member is asked.", "PreToolUse"),
        ("SP-10", "A confirmed order may be cancelled before dispatch by the sales manager only, outside the assistant. After dispatch it cannot be cancelled.", "Policy"),
        ("SP-11", "Order confirmations to customers are sent outside the assistant, only to an approved contact stored against the customer, with text taken from the saved order. The assistant has no tool for them.", "Policy"),
        ("SP-12", "The promotion calendar is the table below: promotion, SKUs, discount, start and end date. Its promotion prices are published prices, not discounts under SP-06.", "PostToolUse"),
    ]),
]

FP = [
    ("Credit", [
        ("FP-01", "Each customer has a credit limit, a credit limit balance (the credit still available) and an outstanding balance. Credit limit balance = credit limit minus outstanding balance. It can be negative when the outstanding balance is above the limit.", "PostToolUse"),
        ("FP-02", "Credit is visible to Finance for every customer, to the assigned salesperson for their own customers, and to the sales manager for every customer. Warehouse does not see credit.", "Back end, PostToolUse"),
        ("FP-03", "Credit route: an order on credit always requires a credit limit balance at least equal to the order total. No approval from any department overrides this.", "PreToolUse, Back end"),
        ("FP-04", "Prepaid route: with the finance manager's recorded approval, an order is created as a separate prepaid order. It uses no credit, is held as awaiting payment, and is not dispatched until Finance confirms payment outside the assistant. A prepaid approval never turns a credit order into an allowed one.", "PreToolUse"),
        ("FP-05", "When a credit order exceeds the balance, the options are: a smaller order, the prepaid route (FP-04), or a credit raise by Finance (FP-06 to FP-08).", "PreToolUse (next_step)"),
    ]),
    ("Credit raises", [
        ("FP-06", "A credit raise increases the customer's credit limit; the credit limit balance is then recalculated (FP-01). Finance Tier 02 may raise credit only when the current balance is above zero and the balance after the raise is at most RM 2,000. Example: a balance of RM 1,900 allows a Tier 02 raise of RM 100 at most. Any other raise by Finance Tier 02 is refused, naming the finance manager (raise_beyond_tier2 or raise_from_zero_or_negative).", "PreToolUse, PostToolUse"),
        ("FP-07", "The finance manager may approve any credit raise. A raise that takes the balance beyond RM 2,000, or any raise when the current balance is zero or negative, is decided by the finance manager only.", "PreToolUse"),
        ("FP-08", "No one outside Finance approves a credit raise, the sales manager included.", "PreToolUse, Back end"),
    ]),
    ("Terms and payments", [
        ("FP-09", "Payment terms are set per customer (30 days by default) and changed only by the finance manager, outside the assistant.", "Policy"),
        ("FP-10", "The assistant never takes, records or confirms a payment.", "Policy"),
    ]),
]

WP = [
    ("Stock", [
        ("WP-01", "Two warehouses, WH-A Shah Alam and WH-B Puchong. Each customer is served from the warehouse for its location, as set in the location table (WP-08).", "Back end"),
        ("WP-02", "Stock is checked per warehouse. Sales and Warehouse may check stock; Finance may not (MP-07).", "PreToolUse, Back end"),
        ("WP-03", "24 hours is the maximum age of a stock figure. A figure within 24 hours is recent enough to quote, not proof that the stock is still there. A figure older than 24 hours is out of date: no order is created on it until the warehouse manager confirms it by a manual count.", "PostToolUse, PreToolUse"),
        ("WP-04", "Stock is rechecked and reserved by the back end when the order is created, together with the credit.", "Back end"),
        ("WP-05", "When stock is short, the salesperson decides whether to order the quantity available, with a new confirmation of the summary. There are no back orders. The warehouse delivers what Sales has ordered.", "PreToolUse"),
        ("WP-06", "Transfers between the two warehouses are decided by the warehouse manager only, outside the assistant.", "Policy"),
    ]),
    ("Delivery", [
        ("WP-07", "Delivery terms, in Malaysia time (UTC+8): an order confirmed before 3 pm on a working day is delivered the next working day; an order confirmed at or after 3 pm, or on a non-working day, is delivered on the second working day. Working days are Monday to Saturday, except Selangor public holidays listed in WP-09. An earlier or special delivery date needs the warehouse manager's recorded approval.", "PreToolUse"),
        ("WP-08", "The location table below: each customer location and the warehouse that serves it.", "Back end"),
        ("WP-09", "The public holiday table below: the Selangor public holidays for the period the demo covers, September to December 2026.", "PreToolUse"),
        ("WP-10", "Warehouse staff check stock and schedule deliveries within the terms. They do not create orders or see credit.", "PreToolUse, Back end"),
        ("WP-11", "An order's delivery address cannot be changed after 3 pm Malaysia time on the working day before delivery, when routes are planned. Before that, an address change is made by the sales manager on the customer record (MP-13). After it, the order is delivered as planned, or cancelled and placed again (SP-10). No tool changes an order's address; the assistant answers such a request from this clause.", "Policy"),
    ]),
]

# ---- Tables (the single source; the hooks and the generator read policy_tables.json) ----
STAFF = [
    # id, name, department, tier, role
    ("SL-01-01", "Hafiz Rahman", "SL", "01", "Sales manager"),
    ("SL-02-01", "Chong Wei Ling", "SL", "02", "Salesperson"),
    ("SL-02-02", "Arun Kumar", "SL", "02", "Salesperson"),
    ("FN-01-01", "Siti Aminah Yusof", "FN", "01", "Finance manager"),
    ("FN-02-01", "Tan Mei Hua", "FN", "02", "Finance staff"),
    ("WH-01-01", "Rosli Ismail", "WH", "01", "Warehouse manager"),
    ("WH-02-01", "Kavitha Raman", "WH", "02", "Warehouse staff"),
]
DEPARTMENTS = {"SL": "Sales", "FN": "Finance", "WH": "Warehouse"}

# Approval types: who records each one, what its value means, the clause.
APPROVAL_TYPES = [
    ("discount", "SL", "Discount, up to 15%", "Discount in percent, the most the order may carry", "SP-06"),
    ("minimum_order", "SL", "Minimum-order exception", "The lowest order total allowed, in sen", "SP-03"),
    ("prepaid", "FN", "Prepaid route", "The highest prepaid order total allowed, in sen", "FP-04"),
    ("stock_confirmation", "WH", "Stock figure confirmation", "The SKU whose out-of-date figure was confirmed by a count", "WP-03"),
    ("delivery_exception", "WH", "Delivery-date exception", "The delivery date approved (YYYY-MM-DD)", "WP-07"),
]
APPROVAL_DOMAINS = [
    ("SL-01-01 Sales manager",
     "Approves his Tier 02 staff's requests, each recorded as an approval record: every discount, up to 15%; minimum-order exceptions. Sets missing prices (SP-04). Outside the assistant: cancelling a confirmed order before dispatch; moving a customer between salespersons; a customer's name, contacts, delivery address and assigned salesperson (MP-13). He may open every customer's account and prices and check stock (supervision); he has no customers of his own and creates no orders or confirmations.",
     "Orders for their own assigned customers only (SP-01); no discount on their own (SP-06); on short stock, whether to order what is available (WP-05)."),
    ("FN-01-01 Finance manager",
     "Any credit raise, of any size; alone, the raises beyond an RM 2,000 balance or from a zero or negative balance; the prepaid route (approval record). Outside the assistant: a customer's credit limit, payment terms and closing a customer (MP-13).",
     "Credit raises from a balance above zero to at most RM 2,000; viewing credit."),
    ("WH-01-01 Warehouse manager",
     "Confirming an out-of-date stock figure; delivery-date exceptions (each an approval record). Outside the assistant: transfers between warehouses and the warehouse that serves a customer (MP-13).",
     "Stock checks; delivery scheduling within the terms."),
]
PROMOTIONS = [
    # id, name, SKUs, percent off the customer's list price, start, end (inclusive, Malaysia dates)
    ("PR-01", "Malaysia Day drinks", ["FD-DR-001", "FD-DR-002"], 8, "2026-09-10", "2026-09-20"),
    ("PR-02", "October noodles", ["FD-PF-003", "FD-PF-004"], 10, "2026-09-25", "2026-10-15"),
    ("PR-03", "Deepavali cooking oil and ghee", ["FD-CI-001", "FD-CI-005"], 12, "2026-10-20", "2026-11-08"),
]
LOCATIONS = [
    # location, district, warehouse
    ("Shah Alam", "Petaling", "WH-A"), ("Petaling Jaya", "Petaling", "WH-A"), ("Subang Jaya", "Petaling", "WH-A"),
    ("Klang", "Klang", "WH-A"), ("Rawang", "Gombak", "WH-A"), ("Selayang", "Gombak", "WH-A"),
    ("Kuala Selangor", "Kuala Selangor", "WH-A"),
    ("Puchong", "Petaling", "WH-B"), ("Seri Kembangan", "Petaling", "WH-B"), ("Kajang", "Hulu Langat", "WH-B"),
    ("Bangi", "Hulu Langat", "WH-B"), ("Cyberjaya", "Sepang", "WH-B"), ("Sepang", "Sepang", "WH-B"),
    ("Banting", "Kuala Langat", "WH-B"),
]
WAREHOUSES = [("WH-A", "Shah Alam"), ("WH-B", "Puchong")]
# Selangor public holidays, September to December 2026, from the published 2026 Selangor
# lists (officeholidays.com, Selangor; BrioHR notice of the Silver Jubilee holiday), checked 20 Oct 2026.
HOLIDAYS = [
    ("2026-09-01", "Selangor public holiday"),
    ("2026-09-16", "Malaysia Day"),
    ("2026-10-26", "Silver Jubilee of the Sultan of Selangor (replacement for Sunday 25 October)"),
    ("2026-11-08", "Deepavali"),
    ("2026-11-09", "Deepavali (replacement)"),
    ("2026-12-11", "Birthday of the Sultan of Selangor"),
    ("2026-12-25", "Christmas Day"),
]
VALUES = {
    "minimum_order_sen": 30000, "max_discount_pct": 15, "duplicate_window_min": 30,
    "default_terms_days": 30, "stock_max_age_hours": 24, "tier2_raise_cap_sen": 200000,
    "delivery_cutoff_hour": 15, "address_cutoff_hour": 15, "utc_offset_hours": 8,
}


def plain(s):
    return re.sub(r"<[^>]+>", "", s)


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


def rm(sen):
    return f"RM {sen / 100:,.2f}"


TABLES = {
    "MP": [
        ("Staff list (MP-04)", ["Staff ID", "Name", "Department", "Tier", "Role"],
         [(s[0], s[1], DEPARTMENTS[s[2]], s[3], s[4]) for s in STAFF]),
        ("Approval domains (MP-05)", ["Manager", "Decides alone", "Their Tier 02 staff handle"], APPROVAL_DOMAINS),
        ("Approval records (MP-09)", ["Type", "Recorded by", "Value approved", "Clause"],
         [(t[2], f"{t[1]}-01 ({DEPARTMENTS[t[1]]} manager)", t[3], t[4]) for t in APPROVAL_TYPES]),
    ],
    "SP": [
        ("Promotion calendar (SP-12)", ["Promotion", "Name", "SKUs", "Off the list price", "From", "To"],
         [(p[0], p[1], ", ".join(p[2]), f"{p[3]}%", p[4], p[5]) for p in PROMOTIONS]),
        ("Values (SP-03, SP-06, SP-09)", ["Value", "Setting"],
         [("Minimum order value", rm(VALUES["minimum_order_sen"])),
          ("Maximum discount, with the sales manager's approval", f"{VALUES['max_discount_pct']}%"),
          ("Likely-duplicate window", f"{VALUES['duplicate_window_min']} minutes")]),
    ],
    "FP": [
        ("Values (FP-06, FP-09)", ["Value", "Setting"],
         [("Finance Tier 02 raise: highest balance after the raise", rm(VALUES["tier2_raise_cap_sen"])),
          ("Default payment terms", f"{VALUES['default_terms_days']} days")]),
    ],
    "WP": [
        ("Warehouses (WP-01)", ["Warehouse", "Place"], WAREHOUSES),
        ("Location table (WP-08)", ["Location", "District", "Served from"], LOCATIONS),
        ("Public holiday table (WP-09)", ["Date", "Holiday"], HOLIDAYS),
    ],
}

POLICIES = [
    ("MP", "Management Policy", "policy://management", MP,
     "Company-wide rules every department follows, including staff authority and the approval domains."),
    ("SP", "Sales Policy", "policy://sales", SP, "Orders, prices, discounts and promotions."),
    ("FP", "Finance Policy", "policy://finance", FP, "Credit, credit raises, payment routes and terms."),
    ("WP", "Warehouse Policy", "policy://warehouse", WP, "Stock, warehouses, delivery terms and the delivery address cut-off."),
]

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
p{margin:6px 0}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
.cl td:first-child{white-space:nowrap;font-weight:600;color:var(--navy)}
.tw{overflow-x:auto}
tr:target td{background:var(--box);box-shadow:inset 3px 0 0 var(--accent)}
tr[id]{scroll-margin-top:110px}
footer{margin-top:36px;font-size:12px;color:var(--muted)}"""
JS = """<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script>"""
INTRO = """<p><strong>FD Food and Drink Distributors</strong> is a fictional Selangor wholesaler of packaged food, drinks, sauces and cooking ingredients, used for demonstration. This policy is an MCP resource: the staff assistant reads it, and the hooks around its six tools cite these clauses when they refuse.</p>
<p><strong>Enforced by:</strong> <b>PreToolUse</b> the hook checks before the tool runs; <b>PostToolUse</b> the hook checks or converts the result; <b>Back end</b> the data layer repeats the check on its own; <b>Policy</b> no tool exists, so the assistant answers from the clause and names who decides.</p>
<p>The other policies: {links}.</p>"""

CLAUSES = {}
TABLES_JSON = {
    "staff": [dict(id=s[0], name=s[1], department=s[2], tier=s[3], role=s[4]) for s in STAFF],
    "departments": DEPARTMENTS,
    "approval_types": {t[0]: dict(department=t[1], label=t[2], value=t[3], clause=t[4]) for t in APPROVAL_TYPES},
    "promotions": [dict(id=p[0], name=p[1], skus=p[2], percent=p[3], start=p[4], end=p[5]) for p in PROMOTIONS],
    "locations": {l[0]: dict(district=l[1], warehouse=l[2]) for l in LOCATIONS},
    "warehouses": dict(WAREHOUSES),
    "holidays": dict(HOLIDAYS),
    "values": VALUES,
}
RESOURCES = []
for prefix, title, uri, sections, blurb in POLICIES:
    md = f"# {title}\n\nFD Food and Drink Distributors (fictional demo wholesaler, Selangor). {blurb} Cite clauses by ID, e.g. {sections[0][1][0][0]}.\n"
    body = ""
    n = 0
    for h, rows in sections:
        n += 1
        md += f"\n## {n}. {h}\n\n"
        for cid, text, how in rows:
            md += f"- **{cid}** {plain(text)} *(Enforced by: {how})*\n"
            CLAUSES[cid] = {"policy": title, "page": f"{title}.html", "section": h, "text": plain(text), "enforced_by": how}
        body += f"<h2>{n}. {h}</h2>\n<div class=\"cl\">{table(['Clause', 'Rule', 'Enforced by'], rows, ids=True)}</div>\n"
    for th, head, rows in TABLES[prefix]:
        n += 1
        md += f"\n## {n}. {th}\n\n" + md_table(head, rows)
        body += f"<h2>{n}. {th}</h2>\n{table(head, rows)}\n"
    links = ", ".join(f'<a href="{t}.html">{t}</a>' for _, t, _, _, _ in POLICIES if t != title)
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><style>
{CSS}
</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../fd-food-and-drink-distributors.html" style="color:inherit;text-decoration:none">{PROJECT}</a></div><h1>{title}</h1><nav id="toc"></nav></div>
{INTRO.format(links=links)}
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; {title}</footer></div>
{JS}</body></html>"""
    for text in (md, html):
        assert "—" not in text, f"em-dash in {title}"
    open(os.path.join(OUT, f"{title}.md"), "w", encoding="utf-8").write(md)
    open(os.path.join(OUT, f"{title}.html"), "w", encoding="utf-8").write(html)
    RESOURCES.append(dict(uri=uri, name=title, file=f"{title}.md"))

# Clause IDs run in order with no gaps, as approved: MP-01..15, SP-01..12, FP-01..10, WP-01..11.
expected = [f"{p}-{i:02d}" for p, n in (("MP", 15), ("SP", 12), ("FP", 10), ("WP", 11)) for i in range(1, n + 1)]
assert list(CLAUSES) == expected, "clauses must run MP-01..15, SP-01..12, FP-01..10, WP-01..11 in order"
TABLES_JSON["resources"] = RESOURCES
with open(os.path.join(OUT, "clauses.json"), "w", encoding="utf-8") as f:
    json.dump(CLAUSES, f, indent=1)
with open(os.path.join(OUT, "policy_tables.json"), "w", encoding="utf-8") as f:
    json.dump(TABLES_JSON, f, indent=1)
print(f"done: 4 policies, {len(CLAUSES)} clauses, {len(PROMOTIONS)} promotions, {len(LOCATIONS)} locations, {len(HOLIDAYS)} holidays")
