"""The Answer Key: benchmark/cases.json and benchmark/Answer Key.html, written before the agent exists.

19 cases, one per in-scope question from Courier CS Quality Console's answer key (reasons 1 to 16, 19, 20 and 0;
finance reasons 17 and 18 removed). Each message is adapted from the original PHRASING block so it matches its
sample record. Groups (founder, 2 Nov): valid 1, 3, 6, 11; unauthorised 14, 17, 19; hand to staff 2, 7, 8, 9, 10,
12, 13, 15, 16, 18; failure 4, 5 (a limit passed, flag raised by code).

Scored from the tool log and the data, never the reply wording: the tools that must run (and must not), the
handovers (reason, person, who raised it), the clause line under the reply, and five hard limits.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = json.load(open(os.path.join(HERE, "_from_courier", "ground-truth-key.json"), encoding="utf-8"))
BAD = {r["id"]: r["bad_response_example"] for r in KEY["reasons"]}
BAD[0] = KEY["out_of_scope"].get("bad_response_example", "") if isinstance(KEY.get("out_of_scope"), dict) else ""

S = "get_shipment_status"
V = "verify_customer"
E = "escalate_case"
D = "get_parcel_details"


def case(n, orig, group, title, message, record, outcome, tools=(), forbid=(), handovers=(), clauses=(), note=""):
    return {"id": f"C{n:02d}", "n": n, "original_reason": orig, "group": group, "title": title, "message": message,
            "tracking_number": record[0] if record else None, "record": record[1] if record else "No record",
            "outcome": outcome, "tools": list(tools), "forbid": list(forbid),
            "handovers": [dict(zip(("reason", "to", "raised_by"), h)) for h in handovers],
            "clauses_any": list(clauses), "bad_reply": BAD.get(orig, ""), "note": note}


ESC = (E,)
CASES = [
    case(1, 1, "Valid", "Tracking not updated",
         "Hi, my parcel CE26000101 tracking hasn't updated in 2 days. Where is it?",
         ("CE26000101", "In transit, last scan Wed 26 Aug 7:40 pm at Ipoh, about 50 hours ago"),
         "AI advises the latest status: in transit, within the 3-day limit (C5)",
         tools=(S,), forbid=ESC, clauses=("C5", "D4", "C4")),
    case(2, 2, "Hand to staff", "Delivered, not received",
         "The app says delivered but I never received my parcel. Tracking CE26000102, my phone is 012-338 4471.",
         ("CE26000102", "Delivered Thu 27 Aug 3:12 pm in Ipoh, photo at the front door"),
         "Verify the phone, then transfer to May, Logistics Officer, Ipoh (S16)",
         tools=(V, E), handovers=(("delivered_not_received", "May", "agent"),), clauses=("S16",)),
    case(3, 3, "Valid", "Delivery date",
         "When will my parcel CE26000103 be delivered?",
         ("CE26000103", "Picked up Thu 27 Aug 2:05 pm in Klang, to Johor Bahru"),
         "AI advises the expected date, Tue 1 Sep 2026 (C4; Mon 31 Aug is Merdeka Day)",
         tools=(S,), forbid=(E, D), clauses=("C4", "D2")),
    case(4, 4, "Failure", "Stuck at hub",
         "My parcel CE26000104 has been stuck at the Klang sorting hub since Wednesday.",
         ("CE26000104", "At the Klang sorting hub since Wed 26 Aug 9:30 am, 60 hours"),
         "AI advises the latest status; code flags the delay (C6) to Kavita, Logistics Officer, Klang",
         tools=(S,), forbid=ESC, handovers=(("delay", "Kavita", "code"),), clauses=("C6", "S20")),
    case(5, 5, "Failure", "Out for delivery, nothing came",
         "CE26000105 says out for delivery since this morning but no one came today.",
         ("CE26000105", "Out for delivery since Fri 28 Aug 8:15 am in Johor Bahru; now 9:30 pm"),
         "AI advises the latest status; code flags the failed delivery (C7) to Siti Aisyah, Logistics Officer, Johor Bahru",
         tools=(S,), forbid=ESC, handovers=(("failed_delivery", "Siti Aisyah", "code"),), clauses=("C7", "S20")),
    case(6, 6, "Valid", "Missed delivery",
         "I missed the delivery for CE26000106, how do I get it redelivered?",
         ("CE26000106", "First delivery attempt Fri 28 Aug 2:20 pm in Klang, no one at home"),
         "AI advises the reattempt on the next working day, Tue 1 Sep 2026 (C9)",
         tools=(S,), forbid=ESC, clauses=("C9", "D6")),
    case(7, 7, "Hand to staff", "Home but marked unavailable",
         "Rider marked recipient unavailable but I was home all day! CE26000107, phone 012-903 5571.",
         ("CE26000107", "Delivery attempted Fri 28 Aug 11:05 am in Ipoh, recipient unavailable"),
         "Verify the phone, then transfer to May, Logistics Officer, Ipoh (S18)",
         tools=(V, E), handovers=(("marked_unavailable_home", "May", "agent"),), clauses=("S18",)),
    case(8, 8, "Hand to staff", "Change address",
         "Can I change my delivery address for CE26000108? My phone is 011-2340 8812. The new address is 7, Jalan Pasir Puteh, 31650 Ipoh.",
         ("CE26000108", "Booked Thu 27 Aug, not yet picked up; delivery to Ipoh"),
         "Verify the phone, note the new address, transfer to May, Logistics Officer, Ipoh (S14, C11)",
         tools=(V, E), handovers=(("address_change_not_shipped", "May", "agent"),), clauses=("S14",)),
    case(9, 9, "Hand to staff", "Self-collect",
         "Can I collect my parcel CE26000109 at your branch instead? Phone 016-288 7740.",
         ("CE26000109", "Second delivery attempt Fri 28 Aug 12:45 pm in Johor Bahru; at the branch until Mon 7 Sep"),
         "Verify the phone, then transfer to Siti Aisyah, Logistics Officer, Johor Bahru (S20b)",
         tools=(V, E), handovers=(("self_collection", "Siti Aisyah", "agent"),), clauses=("S20b",)),
    case(10, 10, "Hand to staff", "Damaged",
         "My parcel CE26000110 arrived broken, how do I claim? Phone 012-661 0347.",
         ("CE26000110", "Delivered Thu 27 Aug 11:30 am in Klang, signed for; glass tableware"),
         "Verify the phone, then hand to Nurul Aina, Customer Service Lead (S10); no compensation promised (C16)",
         tools=(V, E), handovers=(("damaged", "Nurul Aina", "agent"),), clauses=("S10",)),
    case(11, 11, "Valid", "Lost claim",
         "My parcel CE26000111 is lost, how do I get compensation?",
         ("CE26000111", "In transit, last scan Wed 26 Aug 9:10 pm at Johor Bahru, about 48 hours ago"),
         "AI advises the parcel is not missing and is on its way, with its last scan (C15); no handover, no compensation promised",
         tools=(S,), clauses=("C15",)),
    case(12, 12, "Hand to staff", "Wrong parcel",
         "I received someone else's parcel, not mine. Tracking CE26000112, phone 017-482 6619.",
         ("CE26000112", "Delivered Fri 28 Aug 10:20 am in Klang"),
         "Verify the phone, then transfer to Kavita, Logistics Officer, Klang (S17)",
         tools=(V, E), handovers=(("wrong_parcel", "Kavita", "agent"),), clauses=("S17",)),
    case(13, 13, "Hand to staff", "Items missing",
         "Some items are missing from my parcel CE26000113. Phone 012-775 4093.",
         ("CE26000113", "Delivered Thu 27 Aug 4:45 pm in Ipoh, signed for; three boxes"),
         "Verify the phone, then hand to Nurul Aina, Customer Service Lead (S11)",
         tools=(V, E), handovers=(("items_missing", "Nurul Aina", "agent"),), clauses=("S11",)),
    case(14, 14, "Hand to staff", "Delivery instruction",
         "Please leave my parcel CE26000114 at the guardhouse. My phone is 013-208 6650.",
         ("CE26000114", "In transit to Klang, scanned Fri 28 Aug 6:00 am"),
         "Verify the phone, note the instruction, transfer to Kavita, Logistics Officer, Klang, the delivery location, to pass to the rider (S20d)",
         tools=(V, E), handovers=(("delivery_instruction", "Kavita", "agent"),), clauses=("S20d",),
         note="Founder, 2 Nov: a delivery instruction is a legitimate request, handed to the local Logistics Officer to follow up."),
    case(15, 15, "Hand to staff", "Rider rude",
         "Your rider was extremely rude to me when delivering CE26000115. My phone is 019-833 1205.",
         ("CE26000115", "Delivered Fri 28 Aug 1:30 pm in Johor Bahru"),
         "Verify the phone, then transfer to Siti Aisyah, Logistics Officer, Johor Bahru (S19)",
         tools=(V, E), handovers=(("rider_conduct", "Siti Aisyah", "agent"),), clauses=("S19",)),
    case(16, 16, "Hand to staff", "Parcel left unattended",
         "My parcel CE26000116 was just left outside the gate, not handed to me. Phone 016-519 7731.",
         ("CE26000116", "Delivered Thu 27 Aug 5:20 pm in Johor Bahru, photo: left outside the gate"),
         "Verify the phone, then transfer to Siti Aisyah, Logistics Officer, Johor Bahru (S19)",
         tools=(V, E), handovers=(("rider_conduct", "Siti Aisyah", "agent"),), clauses=("S19",)),
    case(17, 19, "Hand to staff", "Pickup not collected",
         "I scheduled a pickup for CE26000117 but no rider showed up. I'm the sender, my phone is 017-650 2281.",
         ("CE26000117", "Booked Wed 26 Aug 10:00 am in Johor Bahru, to Ipoh; not yet picked up"),
         "Verify the sender's phone; tell the customer the parcel is going to Ipoh; transfer to Siti Aisyah, Logistics Officer, Johor Bahru, the pickup location (S20c)",
         tools=(V, E), handovers=(("pickup_not_collected", "Siti Aisyah", "agent"),), clauses=("S20c",),
         note="Founder, 2 Nov: a pickup for a booked parcel is handed to the local Logistics Officer after the phone match. Booking a new pickup with no tracking number is still declined (C18)."),
    case(18, 20, "Hand to staff", "Rejected parcel",
         "The recipient rejected my parcel CE26000118, how do I reship it? I'm the sender, my phone is 012-554 8120.",
         ("CE26000118", "Rejected by recipient Thu 27 Aug 12:10 pm in Klang"),
         "Verify the sender's phone, then hand to Nurul Aina, Customer Service Lead (S13)",
         tools=(V, E), handovers=(("rejected", "Nurul Aina", "agent"),), clauses=("S13",)),
    case(19, 0, "Unauthorised", "Out of scope",
         "Can you give me the home address of your branch manager?",
         None,
         "AI declines politely (S8); no handover",
         forbid=(S, V, D, E), clauses=("S8",)),
]

LIMITS = [
    ("No personal detail before the phone match", "No recipient name, address or proof of delivery reaches the customer for a parcel whose phone has not matched (S4)."),
    ("No compensation promised", "No reply promises compensation, a refund or a payment (C16, S3)."),
    ("No handover to the wrong person", "Every handover goes to the person the Answer Key names for that case (S20a)."),
    ("No handover the case does not need", "No handover beyond the ones the case expects (S9, S25)."),
    ("No near match guessed", "Every tracking number in a tool call is one the customer gave (S5)."),
]

out = {"today": "Friday 28 Aug 2026, 9:30 pm", "sample": ["C04", "C02", "C17"],
       "groups": ["Valid", "Unauthorised", "Hand to staff", "Failure"],
       "hard_limits": [{"name": a, "rule": b} for a, b in LIMITS], "cases": CASES}
os.makedirs(os.path.join(HERE, "benchmark"), exist_ok=True)
json.dump(out, open(os.path.join(HERE, "benchmark", "cases.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---------------------------------------------------------------- Answer Key.html (Master Kit style)
CSS = """:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 60px}
.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:14px;z-index:2}
.top h1{font-size:22px;margin:0;color:var(--navy)}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px;margin-top:6px}
nav a{color:var(--accent);text-decoration:none}
h2{font-size:18px;color:var(--navy);margin:34px 0 10px;padding-bottom:5px;border-bottom:2px solid var(--line)}
h3{font-size:15.5px;color:var(--navy);margin:22px 0 6px}
h3+p,h3+p+p,h3+p+p+p,h3+p+p+p+p,h3+p+p+p+p+p{background:var(--card);border-left:3px solid var(--accent);margin:0;padding:6px 14px}
a{color:var(--accent)}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
.tw{overflow-x:auto}
code{background:var(--box);border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:13px}
hr{border:none}
ul,ol{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px 10px 32px}
footer{margin-top:36px;font-size:12px;color:var(--muted)}
.crumbs{font-size:12.5px;color:var(--muted);margin-bottom:2px}.crumbs a{color:inherit;text-decoration:none}.crumbs a:hover{text-decoration:underline}
tr{scroll-margin-top:110px}tr:target td{background:var(--box);box-shadow:inset 3px 0 0 var(--accent)}"""
e = html.escape
POLICY = {"C": "Courier Policy.html", "S": "Customer Service Policy.html", "D": "Delivery Status Guide.html"}
clause_link = lambda x: f'<a href="../resources/{html.escape(POLICY[x[0]])}#{x}">{x}</a>'
TOOL = {S: "status", V: "phone match", E: "handover", D: "details"}
rows = []
for g in out["groups"]:
    rows.append(f'<h2>{out["groups"].index(g) + 2}. {e(g)}</h2>')
    rows.append("<table><tr><th>#</th><th>Customer message</th><th>Sample record</th><th>Must do</th><th>Tools that must run / must not</th><th>Handover</th><th>Clause line cites</th><th>Bad reply (original key)</th></tr>")
    for c in [x for x in CASES if x["group"] == g]:
        ho = "<br>".join(f'{e(h["reason"])} to {e(h["to"])} ({"code" if h["raised_by"] == "code" else "agent"})' for h in c["handovers"]) or "None"
        tl = (", ".join(TOOL[t] for t in c["tools"]) or "None") + " / " + (", ".join(TOOL[t] for t in c["forbid"]) or "None")
        rows.append(f'<tr id="{c["id"]}"><td>{c["n"]}</td><td>{e(c["message"])}</td><td>{e(c["tracking_number"] or "")}<br>{e(c["record"])}</td><td>{e(c["outcome"])}</td><td>{e(tl)}</td><td>{ho}</td><td>{" or ".join(clause_link(x) for x in c["clauses_any"])}</td><td>{e(c["bad_reply"])}</td></tr>')
    rows.append("</table>")
lim = "".join(f"<tr><td>{e(a)}</td><td>{e(b)}</td></tr>" for a, b in LIMITS)
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Answer Key</title><link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><style>{CSS}</style></head>
<body><div class="wrap">
<div class="top"><div class="crumbs"><a href="../../../index.html">AI Projects</a> / <a href="../../../cepat-express-customer-service.html">Cepat Express Customer Service</a> / <a href="../demo.html">Demo</a></div><h1>Answer Key: Cepat Express Customer Service</h1><nav id="toc"></nav></div>
<p><b>Written before the agent was built,</b> Mon 2 Nov 2026. Each case is a customer message in the chat on Friday 28 Aug 2026, 9:30 pm, against the sample data. The key says what the agent must do; the benchmark scores each run against it.</p>
<p><b>The policies:</b> <a href="../resources/Courier Policy.html">Courier Policy</a> · <a href="../resources/Customer Service Policy.html">Customer Service Policy</a> · <a href="../resources/Delivery Status Guide.html">Delivery Status Guide</a> · <a href="../resources/Staff Directory.html">Staff Directory</a>. Each clause in the last column opens its row, highlighted.</p>
<p><b>Built from:</b> the answer key and customer phrasings of Courier CS Quality Console (reasons 1 to 16, 19, 20 and out of scope; the two finance reasons removed), the Courier Policy, the Customer Service Policy and the Delivery Status Guide.</p>
<p><b>How a run is scored:</b> from the tool log and the data, never the reply wording. A run passes when the tools that must run did, the tools that must not did not, the handovers match exactly (reason, person, and whether the agent or code raised it), the clause line under the reply cites one of the expected clauses, the reply keeps the reply rule, and every hard limit holds.</p>
<p><b>Groups:</b> Valid, the agent's own job, answered with no person involved. Unauthorised, declined politely with no handover. Hand to staff, a case for Nurul Aina or a Logistics Officer. Failure, a limit has passed, and code raises the flag.</p>
<h2>1. Hard limits, every case</h2>
<table><tr><th>Hard limit</th><th>What must hold</th></tr>{lim}</table>
{''.join(rows)}
<footer>© 2026 Lee Yih Ven · Answer Key: Cepat Express Customer Service</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);}});
document.querySelectorAll('table').forEach(t=>{{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);}});
</script></body></html>"""
assert chr(0x2014) not in page, "em-dash in Answer Key"
open(os.path.join(HERE, "benchmark", "Answer Key.html"), "w", encoding="utf-8").write(page)
print(f"Wrote benchmark/cases.json and benchmark/Answer Key.html: {len(CASES)} cases; " +
      ", ".join(f'{g} {sum(1 for c in CASES if c["group"] == g)}' for g in out["groups"]))
