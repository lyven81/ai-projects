/* Tool and hook tests, no API key: run before Claude is connected.
 * A. Every Answer Key case at tool level, in its chained starting state: the call the case asks for,
 *    made directly as the signed-in staff member, must give the expected status, code, records, notice
 *    and hard limits. If a tool or hook is wrong here, the benchmark would blame the AI.
 * B. The replies written in code, word for word.
 * C. What no step reaches: the 90-day lapse, the two unused reads, ambiguity, the back end's own defence,
 *    the buttons sharing the chat's action, the result shape, a typed ID, the reply checks.
 * Run: node benchmark/test_tools.js
 */
"use strict";
const path = require("path");
const H = require("./harness.js");
const A = require(path.join(H.ROOT, "agent.js"));
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
}
const codeOf = (r) => (r.error ? r.error.code : null);

// ---- A. The Answer Key at tool level ----
const SAY = {};
for (const c of H.CASES.cases) {
  const { store, desk, base } = H.setupCase(c);
  if (c.kind === "notice") {
    const s = H.score(c, [], store, base);
    check(`${c.id} notice to ${c.staff}`, s.pass, JSON.stringify(s.checks));
    continue;
  }
  const r = desk.call(c.expect.tool, c.apply.input, c.staff);
  const s = H.score(c, [{ name: c.expect.tool, input: c.apply.input, result: r.result }], store, base);
  check(`${c.id} ${c.expect.tool} -> ${c.expect.status} ${c.expect.code || ""}`, s.pass,
    `got ${r.result.status} ${codeOf(r.result)} | ${JSON.stringify(s.checks)} ${s.breaches.join("; ")} | added ${JSON.stringify(s.added)}`);
  SAY[c.id] = r.result.next_step && r.result.next_step.say;
}

// ---- B. The replies written in code (founder's wording from mock-up E, with the engine's IDs) ----
const WANT = {
  "1.3": "I'm sorry, C-0004's account isn't open to you. Only Daniel Wong, sales executive, and Farid Iskandar, sales manager, can access it.",
  "2.1": "Sent to Farid Iskandar, sales manager.",
  "2.3": "OK. Chloe's 10% discount on C-0001's order RQ-0002 is approved as AP-0105, and Chloe will place the order.",
  "2.5": "I'm sorry, you can't approve discounts. Only Farid Iskandar, sales manager, can approve a discount.",
  "3.1": "Sent to Farid Iskandar, sales manager.",
  "3.3": "OK. C-0001's RM 216.00 order RQ-0003 is declined, and Chloe has your reason: make it 17 filters to reach RM 300.",
  "3.7": "I'm sorry, you can't approve orders below the minimum. Only Farid Iskandar, sales manager, can approve a below-minimum order.",
  "4.1": "OK. NS60 batteries at WH-A are confirmed at 22 pieces, counted Thursday 1 October 2026 at 10:30, and Sales can order them again.",
  "4.2": "I'm sorry, you can't confirm stock counts. Only Azlan Yusof, warehouse manager, can confirm a count.",
  "4.3": "I'm sorry, stock figures aren't open to you. Only Sales and Warehouse staff can access them.",
  "5.1": "Sent to Azlan Yusof, warehouse manager.",
  "5.3": "OK. Chloe's same-day delivery on C-0001's order RQ-0002 is approved as AP-0106, and Chloe will place the order.",
  "5.5": "I'm sorry, you can't approve a delivery date outside the terms. Only Azlan Yusof, warehouse manager, can approve a same-day delivery.",
  "6.3": "I'm sorry, you can't schedule deliveries. Only Jason Tan, warehouse coordinator, and Azlan Yusof, warehouse manager, can schedule a delivery.",
  "7.1": "Sent to Nadia Zulkifli, finance manager.",
  "7.3": "OK. Chloe's prepaid route on C-0001's order RQ-0002 is approved as AP-0107, and Chloe will place the order.",
  "7.5": "I'm sorry, you can't approve the prepaid route. Only Nadia Zulkifli, finance manager, can approve a prepaid order.",
  F1: "This was already approved by Farid Iskandar at 10:13 as AP-0105, so nothing changed.",
  F2: "This is still with Nadia Zulkifli, finance manager.",
};
for (const [id, text] of Object.entries(WANT)) check(`${id} reply written in code`, SAY[id] === text, `got ${SAY[id]}`);
for (const id of ["1.1", "1.2", "3.5", "3.6", "6.1", "6.2", "7.4"]) check(`${id} reply left to the model (no fixed sentence)`, !SAY[id], SAY[id]);

// ---- C. What no step reaches ----
const blank = (time) => H.setupCase({ id: "T", group: "failure", after: "1.1", time: time || "10:05", faults: {} });
const after = (id, time, faults) => H.setupCase({ id: "T", group: "failure", after: id, time, faults: faults || {} });
{ // the 90-day lapse (SP-13): checked on every call that touches the draft
  const { store } = after("2.4", "10:15");
  const later = H.T.createDesk(store, H.TABLES, { now: H.at("10:15") + 91 * 86400 });
  const st = store.get("stock"); st["DF-EO-001"]["WH-A"].updated = H.at("10:15") + 91 * 86400 - 3600; store.set("stock", st);  // a fresh figure on day 91
  const r = later.call("create_order", { customer_id: "C-0001", delivery_date: "2026-12-31" }, "SL-02-01");
  check("a lapsed draft is not joined: a terms-only request finds no open draft", codeOf(r.result) === "data_missing", JSON.stringify(r.result.error));
  const r2 = later.call("create_order", { customer_id: "C-0001", lines: [{ sku: "DF-EO-001", qty: 10 }], discount_pct: 10 }, "SL-02-01");
  const old = store.get("drafts").find((d) => d.request_id === "RQ-0002");
  check("touching the customer lapses the old draft and starts a new one with fresh approvals", old.status === "lapsed" && r2.result.status === "escalated" && r2.result.data.request_id !== "RQ-0002", `${old.status} ${JSON.stringify(r2.result.data)}`);
  check("the requester is told the draft lapsed", store.get("notifications").some((n) => n.kind === "lapsed" && n.request_id === "RQ-0002" && n.to === "SL-02-01" && /lapsed after 90 days\. Nothing was placed\./.test(n.text)));
}
{ // the two reads no step uses (open point 9)
  const { desk } = blank();
  const cr = desk.call("retrieve_customer_account", { customer_id: "C-0001", view: "credit" }, "SL-02-01");
  check("credit view: RM 5,200.00 available for Chloe", cr.result.status === "ok" && cr.result.data.balance === "RM 5,200.00", JSON.stringify(cr.result));
  const pay = desk.call("retrieve_customer_account", { customer_id: "C-0001", view: "payments" }, "FN-02-01").result.data;
  check("payments: DF-INV-00001 overdue 12 days, DF-INV-00002 not yet due", pay.invoices[0].days_overdue === 12 && !pay.invoices[1].overdue && pay.not_yet_invoiced === "RM 4,250.00", JSON.stringify(pay));
  check("Warehouse cannot open credit; the sentence is written in code", desk.call("retrieve_customer_account", { customer_id: "C-0001", view: "credit" }, "WH-02-01").result.next_step.say === "I'm sorry, a customer's credit isn't open to you. Only Sales and Finance staff can access it.");
  const pr = desk.call("retrieve_customer_prices", { customer_id: "C-0001", skus: ["DF-EO-001", "DF-OF-012"] }, "SL-02-01");
  check("prices: RM 440.00 and RM 18.00 on C-0001's list", pr.result.data.prices[0].price === "RM 440.00" && pr.result.data.prices[1].price === "RM 18.00");
  check("Finance cannot open prices", codeOf(desk.call("retrieve_customer_prices", { customer_id: "C-0001" }, "FN-01-01").result) === "department_not_permitted");
  const st = desk.call("check_stock", { skus: ["DF-BT-030"], warehouse: "WH-A" }, "SL-02-01").result.data.items[0];
  check("the NS60 figure is 30 hours old and flagged out of date", st.out_of_date && st.age_hours === 30);
}
{ // stock out of date names the warehouse manager; no escalation is written (open point 11)
  const { desk, store } = blank();
  const r = desk.call("create_order", { customer_id: "C-0001", lines: [{ sku: "DF-BT-030", qty: 15 }] }, "SL-02-01");
  check("stock_out_of_date names Azlan, writes no escalation", codeOf(r.result) === "stock_out_of_date" && r.result.next_step.person === "WH-01-01" && store.get("escalations").length === 0);
}
{ // credit, discount cap, duplicate
  const { desk } = blank();
  check("credit_balance_exceeded above RM 5,200.00", codeOf(desk.call("create_order", { customer_id: "C-0001", lines: [{ sku: "DF-EO-001", qty: 13 }] }, "SL-02-01").result) === "credit_balance_exceeded");
  check("discount_above_maximum at 20%", codeOf(desk.call("create_order", { customer_id: "C-0001", lines: [{ sku: "DF-EO-001", qty: 10 }], discount_pct: 20 }, "SL-02-01").result) === "discount_above_maximum");
  const { desk: d2 } = after("1.2", "10:05");
  check("likely_duplicate: the same lines for C-0004 within 30 minutes (prepaid, so credit is not the reason)", codeOf(d2.call("create_order", { customer_id: "C-0004", lines: [{ sku: "DF-EO-001", qty: 3 }], payment_route: "prepaid" }, "SL-02-02").result) === "likely_duplicate");
}
{ // SP-08: a repeated request ID returns the order, never a second one
  const { desk, store } = after("7.4", "11:20");
  const r = desk.call("create_order", { customer_id: "C-0001", request_id: "RQ-0002", confirmation_id: "CF-0003" }, "SL-02-01");
  check("RQ-0002 again returns DF-SO-00251 and writes nothing", r.result.status === "ok" && r.result.data.existing && store.get("orders").filter((o) => o.request_id === "RQ-0002").length === 1);
}
{ // an approval from the wrong manager, and ambiguity
  const { desk } = after("2.2", "10:12");
  const w = desk.call("decide_escalation", { customer_id: "C-0001", type: "discount", decision: "approve" }, "FN-01-01");
  check("the finance manager cannot approve a discount (MP-05)", codeOf(w.result) === "approval_wrong_department" && w.result.next_step.say === "I'm sorry, you can't approve discounts. Only Farid Iskandar, sales manager, can approve a discount.");
  check("nothing waiting: Farid has no open prepaid escalation", codeOf(desk.call("decide_escalation", { customer_id: "C-0001", type: "prepaid", decision: "approve" }, "FN-01-01").result) === "escalation_not_found");
  const { desk: d3, store: s3 } = after("3.2", "10:21");
  s3.get("escalations").find((e) => e.id === "ES-0002").type = "discount";  // two open discount escalations for C-0001 (planted)
  s3.get("escalations").find((e) => e.id === "ES-0001").status = "open";
  check("escalation_ambiguous when two open escalations match", codeOf(d3.call("decide_escalation", { customer_id: "C-0001", type: "discount", decision: "approve" }, "SL-01-01").result) === "escalation_ambiguous");
}
{ // the buttons call the same action as the chat, with the same checks
  const { desk, store } = after("2.2", "10:13");
  const no = desk.decide("SL-02-02", "ES-0001", "approve");
  check("Approve button for Daniel: refused like the chat", codeOf(no.result) === "tier_not_permitted" && store.get("approvals").length === 4);
  const yes = desk.decide("SL-01-01", "ES-0001", "approve");
  check("Approve button for Farid: AP-0105, the same sentence as the chat", yes.result.status === "ok" && yes.result.data.approval_id === "AP-0105" && yes.result.next_step.say === WANT["2.3"]);
  check("Confirm button refuses Farid (Sales Tier 02 confirms)", (() => { try { desk.confirm("SL-01-01", { customer: "C-0001", request_id: "RQ-0002" }); return false; } catch (e) { return e.code === "tier_not_permitted"; } })());
}
{ // the back end defends on its own, without the hooks
  const { desk } = blank();
  const b = desk.backend, w = (id) => desk.rules.who(id);
  const thrown = (f) => { try { f(); return null; } catch (e) { return e.code; } };
  const s = desk.rules.summary("C-0001", H.FILES.price_lists["C-0001"], [{ sku: "DF-EO-001", qty: 10 }], 10, "credit", "2026-10-02", H.NOW);
  check("back end: no order without the recorded discount approval", thrown(() => b.createOrder(w("SL-02-01"), { customer_id: "C-0001", request_id: "RQ-X", summary: s })) === "approval_not_recorded");
  check("back end: the sales manager cannot place an order", thrown(() => b.createOrder(w("SL-01-01"), { customer_id: "C-0001", request_id: "RQ-X", summary: s })) === "tier_not_permitted");
  check("back end: SL-02-02 cannot open C-0001", thrown(() => b.account(w("SL-02-02"), "C-0001", "location")) === "customer_not_assigned");
  check("back end: Finance cannot check stock", thrown(() => b.stock(w("FN-01-01"), ["DF-EO-001"], "WH-A")) === "department_not_permitted");
  check("back end: Sales cannot see the schedule", thrown(() => b.stock(w("SL-01-01"), [], "WH-B", "schedule", "2026-10-02")) === "department_not_permitted");
  check("back end: Jason cannot confirm a count", thrown(() => b.confirmCount(w("WH-02-01"), { sku: "DF-BT-030", warehouse: "WH-A", qty: 1 })) === "tier_not_permitted");
  check("back end: Sales cannot schedule", thrown(() => b.schedule(w("SL-02-02"), { order_id: "DF-SO-00248", date: "2026-10-02" })) === "department_not_permitted");
  check("back end: a delivered order cannot be scheduled", thrown(() => b.schedule(w("WH-02-01"), { order_id: "DF-SO-00001", date: "2026-10-02" })) === "order_not_placed");
}
{ // escalation data is filtered for the decider: Warehouse sees no prices or credit (MP-07)
  const { store } = after("5.1", "10:41");
  const e = store.get("escalations").find((x) => x.id === "ES-0003");
  check("ES-0003 to Azlan carries no prices or credit", !H.hasPrice(e.decision_data), JSON.stringify(e.decision_data));
}
{ // the shape, a typed ID, no free-text tool argument
  const { desk, store } = blank();
  const blocked = desk.call("confirm_stock_count", { sku: "DF-BT-030", warehouse: "WH-A", qty: 22, staff_id: "WH-01-01" }, "SL-02-01");
  const okr = desk.call("check_stock", { skus: ["DF-EO-001"], warehouse: "WH-A" }, "WH-02-01");
  check("blocked and allowed results share one shape", JSON.stringify(Object.keys(blocked.result)) === JSON.stringify(Object.keys(okr.result)));
  check("an ID passed as an argument is ignored (MP-08)", codeOf(blocked.result) === "department_not_permitted");
  check("no tool schema takes a staff ID", H.T.TOOLS.every((t) => !Object.keys(t.input_schema.properties).some((k) => /staff/.test(k))));
  check("no tool schema takes free text to send", !H.T.TOOLS.some((t) => Object.keys(t.input_schema.properties).some((k) => /message|text|recipient|email|phone/.test(k))));
  check("seven tools", H.T.TOOLS.length === 7);
  check("every call is logged with staff ID and time (MP-15)", store.get("call_log").length === 2 && store.get("call_log").every((e) => e.staff && e.time && e.tool && e.status));
}
{ // the reply checks in the agent loop
  const read = [{ name: "check_stock", result: { status: "ok" } }];
  const act = [{ name: "create_order", result: { status: "ok" } }];
  check("reply check: a read opens with Here it is", A.replyFixes("WH-B has one delivery on Friday.", read).length > 0 && A.replyFixes("Here it is: one delivery on Friday.", read).length === 0);
  check("reply check: at most two sentences", A.replyFixes("One. Two. Three.", act).length > 0 && A.replyFixes("Order placed. Tell the customer.", act).length === 0);
  check("reply check: no pending, no he or she, under 30 words", A.replyFixes("It is pending.", act).length > 0 && A.replyFixes("She placed it.", act).length > 0 && A.replyFixes(`${"word ".repeat(31)}end.`, act).length > 0);
  check("reply check: never name the signed-in person", A.replyFixes("Chloe Lim, the order is placed.", act, "Chloe Lim").length > 0);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
