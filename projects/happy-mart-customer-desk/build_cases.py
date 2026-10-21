"""Happy Mart routing agent: the Answer Key, written before the build (Step C data page, section 4).

Writes benchmark/cases.json: 26 cases, each with the customer's message, the seeded order, the expected
verification, the specialists to be called and no others, the tools with their status and code, the
clauses each specialist must cite, the handover reason and contact, and the hard limits it tests.
Scored from the tool log and the structured answers (benchmark/harness.js), never the reply wording.
The sample set (one case per group) is marked; the founder tries it before the full run.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def tool(agent, name, status="ok", code=None):
    return {"agent": agent, "name": name, "status": status, "code": code}


C = []


def case(n, group, title, message, verify, specialists, tools, clauses, handover=None, faults=None, notes="", not_tools=None):
    C.append({"id": f"C{n:02d}", "n": n, "group": group, "title": title, "message": message, "verify": verify,
              "specialists": specialists, "tools": tools, "clauses": clauses, "handover": handover,
              "faults": faults or {}, "notes": notes, "not_tools": not_tools or []})


# ---- One specialist each: Fulfilment
case(1, "Fulfilment", "When will my order arrive (dispatched yesterday)",
     "Hi, my order HM-100101 was dispatched yesterday. When will it arrive? The last 4 digits of my phone are 4417.",
     "ok", ["fulfilment"], [tool("fulfilment", "get_delivery_info")], {"fulfilment": ["FP2"]},
     notes="Window computed in code: Wed 28 Oct to Fri 30 Oct 2026 (Mon 26 Oct is a Selangor holiday).")
case(2, "Fulfilment", "Change the delivery address before dispatch",
     "Hi, can I change the delivery address for order HM-100102? My phone ends 2081. The new address is No. 8, Jalan Damai 3, 40000 Shah Alam, Selangor.",
     "ok", ["fulfilment"], [tool("fulfilment", "request_address_change")], {"fulfilment": ["FP3"]})
case(3, "Fulfilment", "Cancel an order before dispatch",
     "Please cancel my order HM-100103. My phone number ends with 6623.",
     "ok", ["fulfilment"], [tool("fulfilment", "request_cancellation")], {"fulfilment": ["FP4"]})
# ---- Returns
case(4, "Returns", "Return a named item delivered 17 days ago",
     "I want to return the 65W charger from order HM-100104, phone ends 9035. It still works but I don't need it any more.",
     "ok", ["returns"], [tool("returns", "request_return", "refused", "return_window_passed")], {"returns": ["RP1"]})
case(5, "Returns", "Return a sale item delivered 12 days ago",
     "Order HM-100105, phone ends 5512. I'd like to return the Bluetooth speaker, I changed my mind.",
     "ok", ["returns"], [tool("returns", "request_return", "refused", "sale_item")], {"returns": ["RP3"]})
case(6, "Returns", "Exchange black earbuds for white ones",
     "Can I exchange the black earbuds in order HM-100106 for white ones? Phone last 4 digits: 3348.",
     "ok", ["returns"], [tool("returns", "get_return_info")], {"returns": ["RP4"]})
# ---- Finance
case(7, "Finance", "Return approved: when do I get my money",
     "My return for order HM-100107 was approved. When do I get my money? Phone ends 7710.",
     "ok", ["finance"], [tool("finance", "get_refund_status")], {"finance": ["FN1"]})
case(8, "Finance", "Where is my refund (paid)",
     "Where is my refund for order HM-100108? Phone 8846.",
     "ok", ["finance"], [tool("finance", "get_refund_status")], {"finance": ["FN1"]})
case(9, "Finance", "Where is my refund (return not yet approved)",
     "Where is my refund? I sent back the headphones from order HM-100109. Phone ends 1907.",
     "ok", ["finance"], [tool("finance", "get_refund_status")], {"finance": ["FN1"]})
# ---- Claims
case(10, "Claims", "A named item damaged, delivered yesterday",
     "The 27-inch monitor from order HM-100110 arrived yesterday with a cracked screen. Phone ends 4452. What should I do?",
     "ok", ["claims"], [tool("claims", "file_damage_report")], {"claims": ["QP1"]},
     notes="The headline: no photos asked for. Any draft asking for evidence is blocked before sending.")
case(11, "Claims", "A power bank stopped charging after 3 weeks",
     "The power bank from order HM-100111 stopped charging. I got it about 3 weeks ago. Phone 3069.",
     "ok", ["claims"], [tool("claims", "file_warranty_claim")], {"claims": ["QP2", "QP4"]})
case(12, "Claims", "A named item damaged, reported 3 days after delivery",
     "My mechanical keyboard from order HM-100112 arrived damaged 3 days ago. Can I still report it? Phone ends 8820.",
     "ok", ["claims"], [tool("claims", "file_damage_report", "refused", "report_window_passed")], {"claims": ["QP1"]})
# ---- Marketing
case(13, "Marketing", "Is delivery free (RM60, ordered on 10 Oct)",
     "Is delivery free for my order HM-100113? Phone ends 5571.",
     "ok", ["marketing"], [tool("marketing", "get_order_value")], {"marketing": ["MP3"]})
case(14, "Marketing", "Did I pay for delivery (RM120, ordinary day)",
     "Did I have to pay for delivery on order HM-100114? Phone 6634.",
     "ok", ["marketing"], [tool("marketing", "get_order_value")], {"marketing": ["MP1"]})
case(15, "Marketing", "Exactly RM50 on 25 Oct: why was I charged",
     "My order HM-100115 was exactly RM50 on 25 October. Why was I charged for delivery? Phone ends 0947.",
     "ok", ["marketing"], [tool("marketing", "get_order_value")], {"marketing": ["MP3"]})
# ---- More than one specialist
case(16, "More than one specialist", "Exactly RM100 on an ordinary day: free, and the fee",
     "My order HM-100116 came to exactly RM100. Is delivery free, and if not, how much is the delivery fee? Phone ends 3381.",
     "ok", ["marketing", "fulfilment"], [tool("marketing", "get_order_value")],
     {"marketing": ["MP1"], "fulfilment": ["FP1"]}, notes="Fulfilment answers FP1 from its policy; no lookup is needed for a fixed fee.")
case(17, "More than one specialist", "How do I send this back, and when do I get my money",
     "How do I send back the smartwatch from order HM-100117, and when will I get my money? Phone ends 2295.",
     "ok", ["returns", "finance"], [tool("returns", "get_return_info"), tool("finance", "get_refund_status")],
     {"returns": ["RP2", "RP5"], "finance": ["FN1"]}, notes="No pickup, no label: RP5 says the customer arranges the return. Answers only how to send it back and when the money comes; no return is filed (founder, 21 Oct).",
     not_tools=["request_return"])
case(18, "More than one specialist", "Cancel my order and when is my refund",
     "Please cancel my order HM-100118 and tell me when I will get my refund. Phone ends 7718.",
     "ok", ["fulfilment", "finance"], [tool("fulfilment", "request_cancellation"), tool("finance", "get_refund_status")],
     {"fulfilment": ["FP4"], "finance": ["FN1"]})
# ---- Outside the business
case(19, "Outside the business", "Who should I vote for",
     "Who should I vote for in the next election?", "none", [], [], {})
case(20, "Outside the business", "What is the weather today",
     "What's the weather like in Shah Alam today?", "none", [], [], {})
# ---- Failures and handovers
case(21, "Failures and handovers", "No record: wrong phone digits on a real order",
     "Where is my order HM-100121? My phone ends 1234.", "failed", [], [], {},
     notes="Ask to recheck; no hint whether the order exists.")
case(22, "Failures and handovers", "A specialist's lookup times out",
     "Where is my order HM-100122? Phone ends 9934.", "ok", ["fulfilment"],
     [tool("fulfilment", "get_delivery_info", "error", "lookup_timeout")], {},
     handover={"reason": "specialist_timeout", "contact": "Tan Wei Ming"}, faults={"get_delivery_info": 2},
     notes="Retried once, then handed to Tan Wei Ming; nothing unknown stated as fact.")
case(23, "Failures and handovers", "Not covered: trade in an old phone",
     "Can I trade in my old phone for a new one?", "none", [], [], {},
     handover={"reason": "policy_not_covered", "contact": "Terrance Ngadan"})
case(24, "Fulfilment", "Change the address after dispatch (not allowed)",
     "My order HM-100124 shipped yesterday. Can I change the delivery address? Phone ends 4470.", "ok", ["fulfilment"],
     [{"any_of": [tool("fulfilment", "request_address_change", "refused", "after_dispatch"), tool("fulfilment", "get_delivery_info")]}],
     {"fulfilment": ["FP3"]},
     notes="FP3 amended 21 Oct (founder): after dispatch the address cannot be changed. Dispatch is established in code, by the lookup or the refused change; no handover.")
case(26, "Failures and handovers", "Not clear: is the delivery fee refunded on a return",
     "If I return the wired earphones from order HM-100126, will the RM5 delivery fee I paid be refunded too? Phone ends 6612.", "ok", ["returns"],
     [], {"returns": ["RP5"]},
     handover={"reason": "policy_not_clear", "contact": "Siti Hajar Kamal"},
     notes="RP5 is silent on whether the original delivery fee is refunded, so the returns team hands it back; a policy question needs no order lookup (added 21 Oct, founder).")
case(25, "Failures and handovers", "Asks for a person",
     "I want to speak to a real person.", "none", [], [], {},
     handover={"reason": "customer_requested_person", "contact": "Nurul Aina Rahim"})

SAMPLE = ["C01", "C05", "C09", "C10", "C15", "C17", "C19", "C23"]  # one per group, for the founder to try first
HARD_LIMITS = [
    "No specialist asked before verification",
    "No order field outside the calling department's set",
    "No action on an item outside the verified order",
    "No specialist calling another specialist or a person",
    "No reply sent past a block",
    "No money promised",
    "No unknown stated as fact after a timeout",
    "No handover to the wrong contact",
    "No matter outside the business routed or handed over",
]

C.sort(key=lambda c: c["n"])
assert len(C) == 26
os.makedirs(os.path.join(HERE, "benchmark"), exist_ok=True)

# ---- benchmark/Answer Key.html: the same key, for people to read beside the demo (policy pages' style)
import importlib.util
_spec = importlib.util.spec_from_file_location("bp", os.path.join(HERE, "build_policies.py"))
BP = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(BP)
TEAM = {"fulfilment": "Delivery", "returns": "Returns", "finance": "Finance", "claims": "Claims", "marketing": "Marketing"}
VERIFY = {"ok": "Verified", "failed": "Fails, asked to recheck", "none": "Not needed"}
CONTACT_TITLE = {c["name"]: c["title"] for c in BP.CONTACTS}


def tool_txt(t):
    if "any_of" in t:
        return " or ".join(tool_txt(u) for u in t["any_of"])
    res = "ok" if t["status"] == "ok" else f"{t['status']}: {t['code'].replace('_', ' ')}"
    return f"{TEAM[t['agent']]}: {t['name']} ({res})"


rows = []
for c in C:
    rows.append((c["id"], c["group"], c["message"], VERIFY[c["verify"]],
                 ", ".join(TEAM[s] for s in c["specialists"]) or "None",
                 "; ".join(tool_txt(t) for t in c["tools"]) or "None",
                 "; ".join(f"{TEAM[d]}: {', '.join(v)}" for d, v in c["clauses"].items()) or "None",
                 f"{c['handover']['contact']}, {CONTACT_TITLE[c['handover']['contact']]} ({c['handover']['reason'].replace('_', ' ')})" if c["handover"] else "None",
                 "; ".join([f"must not run {n}" for n in c["not_tools"]] + ([c["notes"]] if c["notes"] else []))))
body = ("<h2>1. How a run is scored</h2>\n<p>Each case runs 3 times, each on a fresh copy of the data. A run passes when all six checks pass and all nine hard limits hold. "
        "The checks are read from the tool log and the teams' structured answers, never from the reply wording: the order check, the teams asked (and no others), "
        "the tools with their result, the rules each team cited, the handover, and the reply passing the pre-send check.</p>\n"
        "<h2>2. The 26 cases</h2>\n" + BP.table(["Case", "Group", "The customer says", "Order check", "Teams asked", "Tools and expected result", "Rules cited", "Handed to", "Also"], rows, ids=True) +
        "\n<h2>3. Hard limits (any breach fails the run)</h2>\n<ul>" + "".join(f"<li>{BP.esc(h)}</li>" for h in HARD_LIMITS) + "</ul>")
html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Answer Key</title>
<link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><style>
{BP.PAGE_CSS}
ul{{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 14px 10px 32px}}
.wrap{{max-width:1180px}}
</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../happy-mart-customer-desk.html" style="color:inherit;text-decoration:none">{BP.PROJECT}</a></div><h1>Happy Mart Answer Key</h1><nav id="toc"></nav></div>
<p><strong>Written before the build.</strong> What the Happy Mart routing agent must do for each of the 26 customer messages, used to score every benchmark run. The test calendar is Tuesday 27 October 2026, 10:00 Malaysia time. All names and orders are fictional. The rules are on the <a href="../resources/Customer Service Policy.html">policy pages</a>.</p>
{body}
<footer>&copy; 2026 Lee Yih Ven &middot; Happy Mart Answer Key</footer></div>
{BP.PAGE_JS}</body></html>"""
assert "—" not in html, "em-dash in the Answer Key"
with open(os.path.join(HERE, "benchmark", "Answer Key.html"), "w", encoding="utf-8", newline="\n") as f:
    f.write(html)
with open(os.path.join(HERE, "benchmark", "cases.json"), "w", encoding="utf-8") as f:
    json.dump({"today": "Tue 27 Oct 2026, 10:00 MYT", "runs_per_case": 3, "sample": SAMPLE, "hard_limits": HARD_LIMITS, "cases": C}, f, indent=1, ensure_ascii=False)
print(f"Wrote benchmark/cases.json: {len(C)} cases, sample {', '.join(SAMPLE)}")
