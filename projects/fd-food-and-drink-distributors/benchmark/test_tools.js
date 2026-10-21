/* Tool and hook tests, no API key: run before Claude is connected.
 * A. Every Answer Key case at tool level: the call the case asks for, made directly as the
 *    signed-in staff member, must give the expected status, code, next_step and records.
 *    If a tool or hook is wrong here, the benchmark would blame the AI.
 * B. Every code no agent run reaches, the back end's own defence, and the result shape.
 * Run: node benchmark/test_tools.js
 */
"use strict";
const H = require("./harness.js");
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
}
const codeOf = (r) => (r.error ? r.error.code : null);

// ---- A. The Answer Key at tool level ----
for (const c of H.CASES.cases) {
  if (c.direct) {
    const { trace, store, base, bothPassedPre } = H.simultaneous(c);
    const s = H.score(c, trace, store, base);
    check(`${c.id} both orders pass PreToolUse`, bothPassedPre);
    check(`${c.id} back end reserves the first, refuses the second`, s.pass && trace[0].result.status === "ok", JSON.stringify(s.checks));
    continue;
  }
  const { store, desk, base } = H.setupCase(c);
  const input = H.canonical(c);
  const r = desk.call(c.expect.tool, input, c.staff);
  const s = H.score(c, [{ name: c.expect.tool, input, result: r.result }], store, base);
  check(`${c.id} ${c.expect.tool} -> ${c.expect.status} ${c.expect.code || ""}`, s.pass,
    `got ${r.result.status} ${codeOf(r.result)} | ${r.result.next_step} | ${JSON.stringify(s.checks)} ${s.breaches.join("; ")}`);
}

// ---- B. Codes no agent run reaches, the back end's defence, the shape ----
const order = (over) => Object.assign({ request_id: "RQ-T1", customer_id: "C-0001", lines: [{ sku: "FD-DR-003", qty: 30 }],
  discount_pct: 0, payment_route: "credit", delivery_date: "2026-10-02", confirmation_id: "CF-T1", approval_ids: [] }, over || {});
function fresh(confs, faults) {
  return H.setupCase({ id: "T", setup: { confirmations: confs || [], orders: [] }, faults: faults || {} });
}
const conf = (id, lines, extra) => Object.assign({ id, staff: "SL-02-01", customer: "C-0001", lines, discount_pct: 0, route: "credit", delivery_date: "2026-10-02" }, extra || {});

{ // confirmation_missing: none, and one that does not match the summary
  const { desk } = fresh();
  const r = desk.call("create_order", order({ confirmation_id: undefined }), "SL-02-01");
  check("confirmation_missing with no confirmation", codeOf(r.result) === "confirmation_missing" && r.result.data.summary.total === "RM 1,200.00", JSON.stringify(r.result));
  const n = desk.call("create_order", order({ request_id: undefined, confirmation_id: undefined }), "SL-02-01");
  check("confirmation_missing with no request ID carries the summary", codeOf(n.result) === "confirmation_missing" && n.result.data.summary.total === "RM 1,200.00", JSON.stringify(n.result));
  const { desk: d2 } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 25 }])]);
  check("confirmation_missing when the summary changed", codeOf(d2.call("create_order", order(), "SL-02-01").result) === "confirmation_missing");
}
{ // discount_above_maximum
  const { desk } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 30 }], { discount_pct: 20 })]);
  check("discount_above_maximum at 20%", codeOf(desk.call("create_order", order({ discount_pct: 20 }), "SL-02-01").result) === "discount_above_maximum");
}
{ // likely_duplicate: the same lines under a new request ID within 30 minutes
  const { desk } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 10 }]), conf("CF-T2", [{ sku: "FD-DR-003", qty: 10 }])]);
  const first = desk.call("create_order", order({ lines: [{ sku: "FD-DR-003", qty: 10 }] }), "SL-02-01");
  const second = desk.call("create_order", order({ request_id: "RQ-T2", confirmation_id: "CF-T2", lines: [{ sku: "FD-DR-003", qty: 10 }] }), "SL-02-01");
  check("likely_duplicate within 30 minutes", first.result.status === "ok" && codeOf(second.result) === "likely_duplicate", codeOf(second.result));
}
{ // prepaid_needs_approval
  const { desk } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 30 }], { route: "prepaid" })]);
  const r = desk.call("create_order", order({ payment_route: "prepaid" }), "SL-02-01");
  check("prepaid_needs_approval names FN-01-01", codeOf(r.result) === "prepaid_needs_approval" && r.result.next_step.includes("FN-01-01"));
}
{ // stock_short
  const { desk } = fresh([conf("CF-T1", [{ sku: "FD-DR-012", qty: 10 }])]);
  const r = desk.call("create_order", order({ lines: [{ sku: "FD-DR-012", qty: 10 }] }), "SL-02-01");
  check("stock_short leaves the decision to the salesperson, names no manager", codeOf(r.result) === "stock_short" && !/[A-Z]{2}-01-01/.test(r.result.next_step) && r.result.data.available === 8, JSON.stringify(r.result));
  check("stock_short carries the summary for the 8 available (RM 364.80)", r.result.data.summary.total === "RM 364.80" && r.result.data.summary.lines[0].qty === 8);
}
{ // delivery_exception: today (earlier than the terms) and a Sunday
  const { desk } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 30 }], { delivery_date: "2026-10-01" })]);
  const r = desk.call("create_order", order({ delivery_date: "2026-10-01" }), "SL-02-01");
  check("delivery_exception for same-day delivery", codeOf(r.result) === "delivery_exception" && r.result.next_step.includes("WH-01-01"));
  const { desk: d2 } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 30 }], { delivery_date: "2026-10-04" })]);
  check("delivery_exception for a Sunday", codeOf(d2.call("create_order", order({ delivery_date: "2026-10-04" }), "SL-02-01").result) === "delivery_exception");
}
{ // system_unavailable: an error, nothing changed
  const { desk: d2, store: s2, base: b2 } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 30 }])], { create_order: "unavailable" });
  const u = d2.call("create_order", order(), "SL-02-01");
  check("system_unavailable is an error, no order", codeOf(u.result) === "system_unavailable" && s2.dump().orders.length === b2.orders.length);
}
{ // raise repeat: the same request ID returns the raise already made
  const { desk, store } = fresh();
  desk.call("raise_credit_limit", { request_id: "RQ-T9", customer_id: "C-0001", amount_rm: 100 }, "FN-01-01");
  const again = desk.call("raise_credit_limit", { request_id: "RQ-T9", customer_id: "C-0001", amount_rm: 100 }, "FN-01-01");
  check("raise repeat returns the first raise", again.result.status === "ok" && again.result.data.existing === true && store.dump().credit_raises.length === 1);
}
{ // a recorded delivery-exception approval from the warehouse manager lets the order through
  const both = [{ sku: "FD-DR-012", qty: 8 }, { sku: "FD-DR-003", qty: 10 }];
  const { desk, store } = fresh([conf("CF-T1", both, { delivery_date: "2026-10-01" })]);
  const ap = store.get("approvals");
  ap.push({ id: "AP-T1", approver: "WH-01-01", type: "delivery_exception", customer: "C-0001", request_id: "RQ-T1", value: "2026-10-01", time: H.NOW });
  store.set("approvals", ap);
  const r = desk.call("create_order", order({ lines: both, delivery_date: "2026-10-01", approval_ids: ["AP-T1"] }), "SL-02-01");
  check("delivery exception approved by WH-01-01 goes through", r.result.status === "ok", JSON.stringify(r.result.error));
}
{ // the back end defends on its own, without the hooks
  const { desk } = fresh([conf("CF-T1", [{ sku: "FD-DR-003", qty: 30 }])]);
  const b = desk.backend, w = (id) => desk.rules.who(id);
  const thrown = (f) => { try { f(); return null; } catch (e) { return e.code; } };
  check("back end: the sales manager cannot create an order", thrown(() => b.createOrder(w("SL-01-01"), order())) === "tier_not_permitted");
  check("back end: SL-02-02 cannot open C-0001", thrown(() => b.account(w("SL-02-02"), "C-0001", "location")) === "customer_not_assigned");
  check("back end: Warehouse cannot open credit", thrown(() => b.account(w("WH-01-01"), "C-0001", "credit")) === "department_not_permitted");
  check("back end: Sales cannot open payments", thrown(() => b.account(w("SL-01-01"), "C-0001", "payments")) === "department_not_permitted");
  check("back end: Finance cannot open delivery", thrown(() => b.account(w("FN-01-01"), "C-0001", "delivery")) === "department_not_permitted");
  check("back end: Sales cannot see stock storage", thrown(() => b.stock(w("SL-01-01"), ["FD-DR-003"], "WH-A", "storage")) === "department_not_permitted");
  check("back end: Finance cannot check stock", thrown(() => b.stock(w("FN-01-01"), ["FD-DR-003"], "WH-A")) === "department_not_permitted");
  check("back end: Sales cannot raise credit", thrown(() => b.raiseCredit(w("SL-01-01"), { request_id: "X", customer_id: "C-0001", amount_rm: 1 })) === "department_not_permitted");
  check("back end: the location view returns location fields only", JSON.stringify(Object.keys(b.account(w("FN-01-01"), "C-0001", "location"))) === JSON.stringify(["id", "name", "location"]));
  check("back end: the payments view lists C-0001's two unpaid invoices", b.account(w("FN-02-01"), "C-0001", "payments").invoices.length === 2);
}
{ // PostToolUse applies policy to what is returned
  const { desk } = fresh();
  const pay = desk.call("retrieve_customer_account", { customer_id: "C-0001", view: "payments" }, "FN-02-01").result.data;
  check("payments: FD-INV-00001 overdue 12 days, FD-INV-00002 not yet due", pay.invoices[0].overdue && pay.invoices[0].days_overdue === 12 && !pay.invoices[1].overdue && pay.overdue_total === "RM 1,350.00", JSON.stringify(pay));
  const del = desk.call("retrieve_customer_account", { customer_id: "C-0001", view: "delivery" }, "WH-02-01").result.data;
  check("delivery: served from WH-A, delivered Fri 2 Oct 2026", del.served_from === "WH-A Shah Alam" && del.delivery_day === "Fri 2 Oct 2026", JSON.stringify(del));
  const st = desk.call("check_stock", { skus: ["FD-DR-003"], warehouse: "WH-A", detail: "storage" }, "WH-01-01").result.data;
  check("storage: FD-DR-003 in bin A-01-1", st.items[0].bin === "A-01-1", JSON.stringify(st));
  const sm = desk.call("create_order", order(), "SL-01-01").result;
  check("the sales manager is refused on tier but sees the summary read-only", codeOf(sm) === "tier_not_permitted" && sm.data.read_only && sm.data.summary.total === "RM 1,200.00", JSON.stringify(sm));
}
{ // every result is in the shared shape, a blocked call included; a typed ID changes nothing
  const { desk, store } = fresh();
  const blocked = desk.call("raise_credit_limit", { request_id: "RQ-X", customer_id: "C-0001", amount_rm: 100 }, "SL-01-01");
  const okr = desk.call("check_stock", { skus: ["FD-DR-003"], warehouse: "WH-A" }, "WH-02-01");
  check("blocked and allowed results share one shape", JSON.stringify(Object.keys(blocked.result)) === JSON.stringify(Object.keys(okr.result)));
  check("no tool schema takes a staff ID", H.T.TOOLS.every((t) => !Object.keys(t.input_schema.properties).some((k) => /staff/.test(k))));
  check("no tool schema takes free text to send", !H.T.TOOLS.some((t) => Object.keys(t.input_schema.properties).some((k) => /message|text|recipient|email|phone/.test(k))));
  const typed = desk.call("raise_credit_limit", { request_id: "RQ-X2", customer_id: "C-0001", amount_rm: 100, staff_id: "FN-01-01" }, "SL-01-01");
  check("an ID passed as an argument is ignored (MP-08)", codeOf(typed.result) === "department_not_permitted");
  const log = store.get("call_log");
  check("every call is logged with staff ID and time (MP-15)", log.length === 3 && log.every((e) => e.staff && e.time && e.tool && e.status));
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
