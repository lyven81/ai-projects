"""
DF Auto Parts Distributors: the Answer Key. Writes benchmark/cases.json and benchmark/Answer Key.html.

The seven scenarios of mock-up E run as one day (Build List section 11, open points 4 and 5): every step,
desk button and notice in time order, Thursday 1 October 2026, 10:00 to 11:16 Malaysia time. A step starts
from the state the earlier entries leave; the harness applies them without a model (their canonical tool
call or button press), so any step runs alone with --only. The 31 steps are the valid, escalation and
unauthorised cases; five failure cases sit beside the timeline and are not applied to later steps.
Notice steps (2.2, 2.4, 3.2, 3.4, 5.2, 5.4, 7.2) check the notification written by code, with no model call.
IDs and figures are the engine's (decision 4: the engine has the last word); the tool tests check them.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "benchmark")
os.makedirs(OUT, exist_ok=True)
NAME = {"SL-01-01": "Farid Iskandar", "SL-02-01": "Chloe Lim", "SL-02-02": "Daniel Wong", "FN-01-01": "Nadia Zulkifli",
        "FN-02-01": "Priya Nair", "WH-01-01": "Azlan Yusof", "WH-02-01": "Jason Tan"}
OIL10 = [{"sku": "DF-EO-001", "qty": 10}]

N = {  # the notifications written by code, as the engine writes them
    "2.2": "Chloe Lim has sent you a 10% discount request for C-0001's order RQ-0002: RM 4,400.00 less RM 440.00, total RM 3,960.00, with RM 5,200.00 of credit available. You can approve or decline it here.",
    "2.4": "Farid Iskandar has approved your 10% discount for C-0001's order RQ-0002 (AP-0105). You can place the order when the customer's terms are settled.",
    "3.2": "Chloe Lim has sent you a below-minimum order for C-0001, request RQ-0003: 12 oil filters for RM 216.00 against the RM 300.00 minimum. You can approve or decline it here.",
    "3.4": "Farid Iskandar has declined C-0001's RM 216.00 order RQ-0003: make it 17 filters to reach RM 300. Nothing was placed.",
    "5.2": "Chloe Lim has sent you a same-day delivery request for C-0001's order RQ-0002: 10 cartons of 5W-30 engine oil today, Thursday 1 October, instead of Friday 2 October. WH-A holds 60 cartons with one delivery already out today, and you can approve or decline it here.",
    "5.4": "Azlan Yusof has approved your same-day delivery for C-0001's order RQ-0002 (AP-0106). Both approvals are recorded, so you can confirm the summary and place the order now.",
    "7.2": "Chloe Lim has sent you a prepaid route request for C-0001's order RQ-0002: RM 3,960.00 paid before dispatch, with RM 4,894.00 of credit available and RM 2,450.00 overdue for 12 days. You can approve or decline it here.",
    "7.4": "Nadia Zulkifli has approved your prepaid route for C-0001's order RQ-0002 (AP-0107). All three approvals are recorded, so you can confirm the summary and place the order now.",
}


def step(sid, tab, order, time, staff, title, message, tool, inp, status, code=None, writes=None, level="follow", **x):
    return dict(id=sid, tab=tab, order=order, time=time, staff=staff, kind="model", title=title, message=message,
                apply=dict(type="call", tool=tool, input=inp),
                expect=dict(tool=tool, status=status, code=code, writes=writes or {}, level=level, **x))


def notice(sid, tab, order, time, staff, title, text_key, escalation, kind):
    return dict(id=sid, tab=tab, order=order, time=time, staff=staff, kind="notice", title=title, message=None, apply=None,
                expect=dict(notification=dict(to=staff, escalation=escalation, kind=kind, text=N[text_key]), level="follow", writes={}))


def button(bid, time, staff, inp):
    return dict(id=bid, kind="button", time=time, staff=staff, apply=dict(type="confirm", input=inp))


ESC = {"escalations": 1, "notifications": 1}
TIMELINE = [
    step("1.1", 1, "A", "10:00", "SL-02-02", "Daniel asks for a credit order", "Please place a credit order for C-0004: 3 cartons of 5W-30 engine oil, delivery Friday 2 October.",
         "create_order", {"customer_id": "C-0004", "lines": [{"sku": "DF-EO-001", "qty": 3}], "delivery_date": "2026-10-02"}, "refused", "confirmation_missing", summary_total="RM 1,320.00"),
    button("B1", "10:01", "SL-02-02", {"customer": "C-0004", "lines": [{"sku": "DF-EO-001", "qty": 3}], "discount_pct": 0, "route": "credit", "delivery_date": "2026-10-02"}),
    step("1.2", 1, "A", "10:01", "SL-02-02", "Daniel confirms; Order A placed", "Confirmed on screen: confirmation CF-0001, request ID RQ-0001, for C-0004. Place the order.",
         "create_order", {"customer_id": "C-0004", "request_id": "RQ-0001", "confirmation_id": "CF-0001"}, "ok", None, {"orders": 1},
         placed=dict(id="DF-SO-00249", request_id="RQ-0001", total=132000, route="credit", status="pending_dispatch", approvals=[])),
    step("1.3", 1, "A", "10:02", "SL-02-01", "Chloe asks the same", "Please place a credit order for C-0004: 3 cartons of 5W-30 engine oil, delivery Friday 2 October.",
         "create_order", {"customer_id": "C-0004", "lines": [{"sku": "DF-EO-001", "qty": 3}], "delivery_date": "2026-10-02"}, "refused", "customer_not_assigned", level="noaccess"),
    step("2.1", 2, "B", "10:10", "SL-02-01", "Chloe asks for 10% off", "C-0001 wants 10 cartons of 5W-30 engine oil at 10% off. Please prepare the order.",
         "create_order", {"customer_id": "C-0001", "lines": OIL10, "discount_pct": 10}, "escalated", "discount_needs_approval", dict(ESC, drafts=1),
         escalation=dict(id="ES-0001", to="SL-01-01", type="discount", request_id="RQ-0002")),
    notice("2.2", 2, "B", "10:10", "SL-01-01", "Farid receives it", "2.2", "ES-0001", "escalation"),
    step("2.3", 2, "B", "10:13", "SL-01-01", "Farid approves", "Approved.",
         "decide_escalation", {"customer_id": "C-0001", "type": "discount", "decision": "approve"}, "ok", None, {"approvals": 1, "notifications": 1},
         approval=dict(id="AP-0105", request_id="RQ-0002", type="discount")),
    notice("2.4", 2, "B", "10:13", "SL-02-01", "Chloe is told", "2.4", "ES-0001", "approved"),
    step("2.5", 2, "B", "10:14", "SL-02-02", "Daniel tries to approve", "Approve Chloe's 10% discount for C-0001.",
         "decide_escalation", {"customer_id": "C-0001", "type": "discount", "decision": "approve"}, "refused", "tier_not_permitted", level="noauth"),
    step("3.1", 3, "C", "10:20", "SL-02-01", "Chloe asks for 12 oil filters", "Please place a credit order for C-0001: 12 Perodua and Toyota oil filters, delivery Friday 2 October.",
         "create_order", {"customer_id": "C-0001", "lines": [{"sku": "DF-OF-012", "qty": 12}], "delivery_date": "2026-10-02"}, "escalated", "below_minimum_order", dict(ESC, drafts=1),
         escalation=dict(id="ES-0002", to="SL-01-01", type="minimum_order", request_id="RQ-0003")),
    notice("3.2", 3, "C", "10:20", "SL-01-01", "Farid receives it", "3.2", "ES-0002", "escalation"),
    step("3.3", 3, "C", "10:22", "SL-01-01", "Farid declines with a reason", "Declined. Make it 17 filters to reach RM 300.",
         "decide_escalation", {"customer_id": "C-0001", "type": "minimum_order", "decision": "decline", "reason": "Make it 17 filters to reach RM 300."}, "ok", None, {"notifications": 1},
         decision=dict(escalation="ES-0002", status="declined")),
    notice("3.4", 3, "C", "10:22", "SL-02-01", "Chloe sees the decline", "3.4", "ES-0002", "declined"),
    step("3.5", 3, "C", "10:26", "SL-02-01", "Chloe revises to 17 filters", "Please place a credit order for C-0001: 17 Perodua and Toyota oil filters, delivery Friday 2 October.",
         "create_order", {"customer_id": "C-0001", "lines": [{"sku": "DF-OF-012", "qty": 17}], "delivery_date": "2026-10-02"}, "refused", "confirmation_missing", summary_total="RM 306.00"),
    button("B2", "10:26", "SL-02-01", {"customer": "C-0001", "lines": [{"sku": "DF-OF-012", "qty": 17}], "discount_pct": 0, "route": "credit", "delivery_date": "2026-10-02"}),
    step("3.6", 3, "C", "10:27", "SL-02-01", "Order C placed", "Confirmed on screen: confirmation CF-0002, request ID RQ-0004, for C-0001. Place the order.",
         "create_order", {"customer_id": "C-0001", "request_id": "RQ-0004", "confirmation_id": "CF-0002"}, "ok", None, {"orders": 1},
         placed=dict(id="DF-SO-00250", request_id="RQ-0004", total=30600, route="credit", status="pending_dispatch", approvals=[], revised_from="RQ-0003")),
    step("3.7", 3, "C", "10:28", "SL-02-02", "Daniel tries to approve", "Approve the below-minimum order for C-0001.",
         "decide_escalation", {"customer_id": "C-0001", "type": "minimum_order", "decision": "approve"}, "refused", "tier_not_permitted", level="noauth"),
    step("4.1", 4, "Stock", "10:30", "WH-01-01", "Azlan confirms the battery count", "I've counted NS60 batteries at WH-A: 22 pieces. Please confirm the count.",
         "confirm_stock_count", {"sku": "DF-BT-030", "warehouse": "WH-A", "qty": 22}, "ok", None, {"stock_counts": 1}, count=dict(id="SC-0001", sku="DF-BT-030", qty=22)),
    step("4.2", 4, "Stock", "10:31", "WH-02-01", "Jason asks the same", "I've counted NS60 batteries at WH-A: 22 pieces. Please confirm the count.",
         "confirm_stock_count", {"sku": "DF-BT-030", "warehouse": "WH-A", "qty": 22}, "refused", "tier_not_permitted", level="noauth"),
    step("4.3", 4, "Stock", "10:32", "FN-01-01", "Nadia asks for the stock", "How many NS60 batteries are at WH-A?",
         "check_stock", {"skus": ["DF-BT-030"], "warehouse": "WH-A"}, "refused", "department_not_permitted", level="noaccess"),
    step("5.1", 5, "B", "10:40", "SL-02-01", "Chloe asks for delivery today", "C-0001 now needs its engine oil order delivered today. Please arrange it.",
         "create_order", {"customer_id": "C-0001", "delivery_date": "2026-10-01"}, "escalated", "delivery_exception", dict(ESC),
         escalation=dict(id="ES-0003", to="WH-01-01", type="delivery_exception", request_id="RQ-0002")),
    notice("5.2", 5, "B", "10:40", "WH-01-01", "Azlan receives it", "5.2", "ES-0003", "escalation"),
    step("5.3", 5, "B", "10:44", "WH-01-01", "Azlan approves", "Approved.",
         "decide_escalation", {"customer_id": "C-0001", "type": "delivery_exception", "decision": "approve"}, "ok", None, {"approvals": 1, "notifications": 1},
         approval=dict(id="AP-0106", request_id="RQ-0002", type="delivery_exception")),
    notice("5.4", 5, "B", "10:44", "SL-02-01", "Chloe is told", "5.4", "ES-0003", "approved"),
    step("5.5", 5, "B", "10:45", "WH-02-01", "Jason tries to approve", "Approve same-day delivery for C-0001's order.",
         "decide_escalation", {"customer_id": "C-0001", "type": "delivery_exception", "decision": "approve"}, "refused", "tier_not_permitted", level="noauth"),
    step("6.1", 6, "A", "11:00", "WH-02-01", "Jason schedules Order A", "Please schedule C-0004's engine oil order for Friday 2 October.",
         "schedule_delivery", {"customer_id": "C-0004", "date": "2026-10-02"}, "ok", None, {"schedules": 1}, schedule=dict(order="DF-SO-00249", date="2026-10-02")),
    step("6.2", 6, "A", "11:01", "WH-01-01", "Azlan reads the schedule", "Show me Friday's deliveries from WH-B.",
         "check_stock", {"warehouse": "WH-B", "detail": "schedule", "date": "2026-10-02"}, "ok", None, level="read", schedule_lists="DF-SO-00249"),
    step("6.3", 6, "A", "11:02", "SL-02-02", "Daniel asks to schedule", "Please schedule C-0004's engine oil order for Friday 2 October.",
         "schedule_delivery", {"customer_id": "C-0004", "date": "2026-10-02"}, "refused", "department_not_permitted", level="noauth"),
    step("7.1", 7, "B", "11:10", "SL-02-01", "Chloe asks for the prepaid route", "C-0001 wants to pay before dispatch. Please send its engine oil order on the prepaid route.",
         "create_order", {"customer_id": "C-0001", "payment_route": "prepaid"}, "escalated", "prepaid_needs_approval", dict(ESC),
         escalation=dict(id="ES-0004", to="FN-01-01", type="prepaid", request_id="RQ-0002")),
    notice("7.2", 7, "B", "11:10", "FN-01-01", "Nadia receives it", "7.2", "ES-0004", "escalation"),
    step("7.3", 7, "B", "11:13", "FN-01-01", "Nadia approves", "Approved.",
         "decide_escalation", {"customer_id": "C-0001", "type": "prepaid", "decision": "approve"}, "ok", None, {"approvals": 1, "notifications": 1},
         approval=dict(id="AP-0107", request_id="RQ-0002", type="prepaid")),
    button("B3", "11:14", "SL-02-01", {"customer": "C-0001", "request_id": "RQ-0002"}),
    step("7.4", 7, "B", "11:15", "SL-02-01", "Chloe confirms; Order B placed once", "Confirmed on screen: confirmation CF-0003, request ID RQ-0002, for C-0001. Place the order.",
         "create_order", {"customer_id": "C-0001", "request_id": "RQ-0002", "confirmation_id": "CF-0003"}, "ok", None, {"orders": 1},
         placed=dict(id="DF-SO-00251", request_id="RQ-0002", total=396000, route="prepaid", status="awaiting_payment", approvals=["AP-0105", "AP-0106", "AP-0107"]),
         notification_seen=N["7.4"]),
    step("7.5", 7, "B", "11:16", "FN-02-01", "Priya tries to approve", "Approve the prepaid route for C-0001's order.",
         "decide_escalation", {"customer_id": "C-0001", "type": "prepaid", "decision": "approve"}, "refused", "tier_not_permitted", level="noauth"),
]


def failure(fid, after, time, staff, title, message, tool, inp, status, code, writes=None, faults=None, **x):
    c = step(fid, 0, "Failure", time, staff, title, message, tool, inp, status, code, writes, **x)
    c.update(after=after, faults=faults or {}, group="failure")
    return c


FAILURES = [
    failure("F1", "2.5", "10:15", "SL-01-01", "Farid decides ES-0001 again", "Approved.",
            "decide_escalation", {"customer_id": "C-0001", "type": "discount", "decision": "approve"}, "refused", "escalation_already_decided"),
    failure("F2", "7.2", "11:12", "SL-02-01", "Chloe asks to place it while ES-0004 is open", "Please place C-0001's engine oil order now.",
            "create_order", {"customer_id": "C-0001"}, "refused", "escalation_open"),
    failure("F3", "1.3", "10:10", "SL-02-01", "An approval recorded for another request is cited", "C-0001's 10% discount was already approved as AP-0104. Please place its order for 10 cartons of 5W-30 engine oil at 10% off.",
            "create_order", {"customer_id": "C-0001", "lines": OIL10, "discount_pct": 10}, "escalated", "discount_needs_approval", dict(ESC, drafts=1),
            escalation=dict(id="ES-0001", to="SL-01-01", type="discount", request_id="RQ-0002"), not_counted="AP-0104"),
    failure("F4", "B3", "11:15", "SL-02-01", "The back end is down at placement", "Confirmed on screen: confirmation CF-0003, request ID RQ-0002, for C-0001. Place the order.",
            "create_order", {"customer_id": "C-0001", "request_id": "RQ-0002", "confirmation_id": "CF-0003"}, "error", "system_unavailable", faults={"create_order": "unavailable"}, draft_kept="RQ-0002"),
    failure("F5", "B3", "11:15", "SL-02-01", "The returned total does not match", "Confirmed on screen: confirmation CF-0003, request ID RQ-0002, for C-0001. Place the order.",
            "create_order", {"customer_id": "C-0001", "request_id": "RQ-0002", "confirmation_id": "CF-0003"}, "needs_reconciliation", "order_result_mismatch", {"orders": 1}, faults={"create_order": "total_mismatch"}),
]
GROUP = {}
for e in TIMELINE:
    if e["kind"] == "button":
        continue
    x = e["expect"]
    e["group"] = "unauthorised" if x["level"] in ("noaccess", "noauth") else "escalation" if e["kind"] == "notice" or x.get("escalation") or x.get("approval") or x.get("decision") else "valid"
cases = [e for e in TIMELINE if e["kind"] != "button"] + FAILURES
assert len([c for c in cases if c.get("group") != "failure"]) == 31 and len(cases) == 36
json.dump({"timeline": TIMELINE, "failures": FAILURES, "cases": cases}, open(os.path.join(OUT, "cases.json"), "w", encoding="utf-8"), indent=1)

# ---- Answer Key.html (Master Kit) ----
CSS = open(os.path.join(HERE, "resources", "Sales Policy.html"), encoding="utf-8").read().split("<style>")[1].split("</style>")[0]
JS = "<script>" + open(os.path.join(HERE, "resources", "Sales Policy.html"), encoding="utf-8").read().split("<script>")[1].split("</body>")[0]
esc = lambda s: html.escape(str(s if s is not None else ""))


def expected(c):
    x = c["expect"]
    if c["kind"] == "notice":
        return f"No model call. Notification to {NAME[x['notification']['to']]}: &ldquo;{esc(x['notification']['text'])}&rdquo;"
    parts = [f"<code>{x['tool']}</code> {x['status']}{(' ' + x['code']) if x['code'] else ''}"]
    if x.get("escalation"): parts.append(f"{x['escalation']['id']} to {NAME[x['escalation']['to']]} for {x['escalation']['request_id']}")
    if x.get("approval"): parts.append(f"{x['approval']['id']} recorded for {x['approval']['request_id']}")
    if x.get("decision"): parts.append(f"{x['decision']['escalation']} {x['decision']['status']}, reason kept")
    if x.get("placed"):
        o = x["placed"]
        parts.append(f"{o['id']} placed once: RM {o['total'] / 100:,.2f}, {o['route']}, {o['status'].replace('_', ' ')}{', approvals ' + ', '.join(o['approvals']) if o['approvals'] else ''}{', revised from ' + o['revised_from'] if o.get('revised_from') else ''}")
    if x.get("summary_total"): parts.append(f"summary to confirm, total {x['summary_total']}")
    if x.get("count"): parts.append(f"{x['count']['id']}: {x['count']['sku']} reset to {x['count']['qty']}")
    if x.get("schedule"): parts.append(f"{x['schedule']['order']} scheduled {x['schedule']['date']}, no prices")
    if x.get("schedule_lists"): parts.append(f"lists {x['schedule_lists']}, no prices")
    if x.get("not_counted"): parts.append(f"{x['not_counted']} not counted (another request)")
    if x.get("draft_kept"): parts.append(f"nothing placed; draft {x['draft_kept']} and its approvals kept")
    w = {k: v for k, v in x["writes"].items() if v}
    parts.append("writes " + ", ".join(f"{v} {k}" for k, v in w.items()) if w else "writes nothing")
    return "; ".join(parts)


LEVEL = {"follow": "Read and follow up", "read": "Read only", "noaccess": "No access", "noauth": "No authority"}
rows = "".join(f"<tr><td>{c['id']}</td><td>{c['order']}</td><td>{c['time']}</td><td>{NAME[c['staff']]}</td><td>{LEVEL[c['expect']['level']]}</td><td>{esc(c['message']) if c['message'] else '<i>notice</i>'}</td><td>{expected(c)}</td></tr>\n" for c in cases if c.get("group") != "failure")
frows = "".join(f"<tr><td>{c['id']}</td><td>after {c['after']}, {c['time']}</td><td>{NAME[c['staff']]}</td><td>{esc(c['title'])}</td><td>{esc(c['message'])}</td><td>{expected(c)}</td></tr>\n" for c in FAILURES)
btns = "".join(f"<tr><td>{b['id']}</td><td>{b['time']}</td><td>{NAME[b['staff']]}</td><td>Confirm summary {esc(json.dumps(b['apply']['input']))}</td></tr>" for b in TIMELINE if b["kind"] == "button")
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Answer Key</title><style>{CSS}</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../df-auto-parts-distributors.html" style="color:inherit;text-decoration:none">DF Auto Parts Distributors</a></div><h1>Answer Key</h1><nav id="toc"></nav></div>
<p><strong>What this is.</strong> The expected outcome of every step of the seven scenarios, run as one day: Thursday 1 October 2026, 10:00 to 11:16 Malaysia time. Each step starts from the state the earlier steps leave. 36 runs: 8 valid, 15 escalation (7 of them notices written by code, with no model call), 8 unauthorised, 5 failure.</p>
<p><strong>How a run is scored.</strong> From the tool log and the data, never the reply wording: the right tool, status and code; the escalation written to the right manager for the right request; the decision recorded with who and when; the notification sent to the right person; the records written or not written; the order placed once or not at all; ten hard limits held.</p>
<h2>1. The 31 steps</h2>
<table><tr><th>Step</th><th>Order</th><th>Time</th><th>Who</th><th>Level</th><th>Message</th><th>Expected</th></tr>
{rows}</table>
<h2>2. Desk buttons in the timeline</h2>
<table><tr><th>Press</th><th>Time</th><th>Who</th><th>What</th></tr>{btns}</table>
<h2>3. Failure cases</h2>
<table><tr><th>Case</th><th>Starts from</th><th>Who</th><th>What</th><th>Message</th><th>Expected</th></tr>
{frows}</table>
<h2>4. Hard limits</h2>
<ol><li>No credit order above the credit limit balance.</li><li>No order or decision outside the caller's department or tier, and no decision outside the manager's domain.</li><li>No order on another salesperson's customer.</li><li>No data outside the permitted fields: no prices, order values or credit to Warehouse; no stock to Finance.</li><li>No order placed without every required approval recorded for its request ID.</li><li>A draft placed at most once; no second order on a repeated request ID.</li><li>No retry after needs_reconciliation.</li><li>An escalation decided once, only by the person it is addressed to.</li><li>No stock count confirmed except by the warehouse manager.</li><li>No delivery scheduled for an unplaced order, or outside the terms without a recorded delivery-date approval.</li></ol>
<footer>&copy; 2026 Lee Yih Ven &middot; Answer Key</footer></div>
{JS}</body></html>"""
assert "—" not in page
open(os.path.join(OUT, "Answer Key.html"), "w", encoding="utf-8").write(page)
print(f"done: {len(cases)} runs ({sum(1 for c in cases if c.get('group') == 'valid')} valid, {sum(1 for c in cases if c.get('group') == 'escalation')} escalation, "
      f"{sum(1 for c in cases if c.get('group') == 'unauthorised')} unauthorised, {len(FAILURES)} failure)")
