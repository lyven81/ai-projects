/* The back end data layer: the second line behind the hooks.
 *
 * Critical checks run here too, on their own, so a hook fault or a direct call cannot get past them:
 *   department and tier (MP-07, SP-01, FP-08), customer assignment (MP-06), permitted fields per
 *   department before any data leaves (MP-07, FP-02), approved contacts (SP-11), request IDs so a
 *   retry returns the existing order or raise (SP-08), and stock and credit rechecked and reserved
 *   together in one step when an order is created (WP-04, FP-03).
 * Raw values leave in sen and Unix seconds; PostToolUse converts them. A refusal is thrown as
 * { backend: true, code, message, data }.
 *
 * store: { get(name), set(name, value) } over the data files (catalogue, customers, price_lists,
 * stock, storage, orders, invoices, staff, approvals, confirmations, credit_raises, meta, call_log).
 * opts.faults (benchmark only): { create_order: "total_mismatch", raise_credit_limit: "balance_mismatch",
 * <tool>: "unavailable" }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FDBackend = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // MP-07: each view of a customer account, its fields and the departments that may open it.
  const VIEWS = {
    location: { fields: ["id", "name", "location"], depts: ["SL", "FN", "WH"] },
    delivery: { fields: ["id", "name", "location", "warehouse"], depts: ["SL", "WH"] },
    credit: { fields: ["id", "name", "credit_limit", "outstanding", "balance", "terms_days"], depts: ["SL", "FN"] },
    payments: { fields: ["id", "name", "terms_days", "outstanding", "invoices", "not_yet_invoiced"], depts: ["FN"] },
  };

  function refuse(code, message, data) {
    const e = new Error(message);
    Object.assign(e, { backend: true, code, data: data === undefined ? null : data });
    return e;
  }

  function createBackend(store, rules, opts) {
    const o = opts || {};
    const faults = o.faults || {};
    const now = () => o.now;

    const customer = (id) => store.get("customers").find((c) => c.id === id) || null;
    const unavailable = (tool) => { if (faults[tool] === "unavailable") throw refuse("system_unavailable", "The back end did not respond; nothing was changed."); };
    function mustBe(staff, depts, tool) {
      if (!staff || !depts.includes(staff.dept)) throw refuse("department_not_permitted", `Back end: ${tool} is not open to this department.`);
    }
    function mustOwn(staff, c) {
      if (staff.dept === "SL" && staff.tier === "02" && c.assigned_to !== staff.id) throw refuse("customer_not_assigned", "Back end: not this salesperson's customer.");
    }

    function stock(staff, skus, warehouse, detail) {
      unavailable("check_stock");
      if (detail === "storage") {
        mustBe(staff, ["WH"], "check_stock (storage)");  // bin and last count: Warehouse only (MP-07)
        const st = store.get("storage");
        const items = {};
        for (const sku of skus) items[sku] = (st[sku] && st[sku][warehouse]) ? { bin: st[sku][warehouse].bin, last_count: st[sku][warehouse].last_count } : null;
        return { warehouse, detail: "storage", items };
      }
      mustBe(staff, ["SL", "WH"], "check_stock");
      const s = store.get("stock");
      const out = {};
      for (const sku of skus) out[sku] = (s[sku] && s[sku][warehouse]) ? { qty: s[sku][warehouse].qty, updated: s[sku][warehouse].updated } : null;
      return { warehouse, items: out };
    }

    function account(staff, customerId, view) {
      unavailable("retrieve_customer_account");
      const v = VIEWS[view];
      if (!v) throw refuse("data_missing", `No account view ${view}.`);
      mustBe(staff, v.depts, `retrieve_customer_account (${view})`);
      const c = customer(customerId);
      if (!c) throw refuse("data_missing", `No customer ${customerId}.`);
      mustOwn(staff, c);
      const full = {
        id: c.id, name: c.name, location: c.location, warehouse: c.warehouse, assigned_to: c.assigned_to,
        credit_limit: c.credit_limit, outstanding: c.outstanding, balance: rules.balance(c), terms_days: c.terms,
        contacts: c.contacts.map((x) => ({ id: x.id, name: x.name, channel: x.channel, value: x.value })),
        open_orders: store.get("orders").filter((x) => x.customer === c.id && x.status !== "delivered")
          .map((x) => ({ id: x.id, total: x.total, status: x.status, delivery_date: x.delivery_date })),
        not_yet_invoiced: store.get("orders").filter((x) => x.customer === c.id && x.status !== "delivered" && x.route === "credit").reduce((a, x) => a + x.total, 0),
        invoices: (store.get("invoices") || []).filter((x) => x.customer === c.id && !x.paid)
          .map((x) => ({ id: x.id, issued: x.issued, due: x.due, amount: x.amount })),
      };
      const out = {};
      for (const f of v.fields) out[f] = full[f];  // only the fields of this view
      return out;
    }

    function prices(staff, customerId, skus) {
      unavailable("retrieve_customer_prices");
      mustBe(staff, ["SL"], "retrieve_customer_prices");
      const c = customer(customerId);
      if (!c) throw refuse("data_missing", `No customer ${customerId}.`);
      mustOwn(staff, c);
      const list = store.get("price_lists")[customerId] || {};
      const want = skus && skus.length ? skus : Object.keys(list);
      return { customer: customerId, prices: Object.fromEntries(want.map((s) => [s, list[s] === undefined ? null : list[s]])) };
    }

    /** The Confirm button (Sales Tier 02): writes the confirmation record bound to the full summary (SP-07). */
    function confirm(staff, input) {
      if (!staff || staff.dept !== "SL" || staff.tier !== "02") throw refuse("tier_not_permitted", "Only Sales Tier 02 confirms an order summary.");
      const c = customer(input.customer);
      if (!c) throw refuse("data_missing", `No customer ${input.customer}.`);
      mustOwn(staff, c);
      const list = store.get("price_lists")[c.id] || {};
      const s = rules.summary(c.id, list, input.lines, input.discount_pct, input.route, input.delivery_date, now());
      const all = store.get("confirmations");
      const id = input.id || `CF-${String(all.length + 1).padStart(4, "0")}`;
      const rec = Object.assign({ id, staff: staff.id, time: now(), request_id: input.request_id || `RQ-${id.slice(3)}` }, s);
      store.set("confirmations", all.filter((x) => x.id !== id).concat([rec]));
      return rec;
    }

    /** One step: recheck and reserve stock and credit together (WP-04, FP-03), then write the order. */
    function createOrder(staff, input) {
      unavailable("create_order");
      mustBe(staff, ["SL"], "create_order");
      if (staff.tier !== "02") throw refuse("tier_not_permitted", "Back end: orders are created by Sales Tier 02 only.");
      const orders = store.get("orders");
      const existing = orders.find((x) => x.request_id === input.request_id);
      if (existing) return Object.assign({ existing: true }, existing);  // SP-08: never a second order
      const customers = store.get("customers");
      const c = customers.find((x) => x.id === input.customer_id);
      if (!c) throw refuse("data_missing", `No customer ${input.customer_id}.`);
      mustOwn(staff, c);
      const list = store.get("price_lists")[c.id] || {};
      const s = rules.summary(c.id, list, input.lines, input.discount_pct, input.payment_route, input.delivery_date, now());
      if (s.total === null) throw refuse("price_missing", "Back end: a line has no price.", { skus: s.missing_prices });
      const stockAll = store.get("stock");
      const wh = c.warehouse;
      for (const l of s.lines) {
        const rec = stockAll[l.sku] && stockAll[l.sku][wh];
        if (!rec) throw refuse("data_missing", `Back end: no stock record for ${l.sku} at ${wh}.`);
        if (rec.qty < l.qty) throw refuse("stock_short", `Back end: ${l.sku} has ${rec.qty} at ${wh}.`, { sku: l.sku, available: rec.qty });
      }
      const route = input.payment_route === "prepaid" ? "prepaid" : "credit";
      if (route === "credit") {
        const bal = rules.balance(c);
        if (bal === null) throw refuse("data_missing", "Back end: the credit record is incomplete.");
        if (s.total > bal) throw refuse("credit_balance_exceeded", "Back end: the order total is above the credit limit balance now.", { balance: bal, total: s.total });
      }
      // Reserve both, then write: nothing is half-done.
      for (const l of s.lines) stockAll[l.sku][wh].qty -= l.qty;
      if (route === "credit") c.outstanding += s.total;
      const meta = store.get("meta");
      const id = `FD-SO-${String(meta.next_order).padStart(5, "0")}`;
      meta.next_order += 1;
      const order = { id, request_id: input.request_id, customer: c.id, created_by: staff.id, created_at: now(),
        lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: l.unit_price })), discount_pct: s.discount_pct,
        total: s.total, route, delivery_date: input.delivery_date,
        status: route === "credit" ? "pending_dispatch" : "awaiting_payment", warehouse: wh,
        approvals: input.approval_ids || [], confirmation: input.confirmation_id };
      store.set("stock", stockAll);
      store.set("customers", customers);
      store.set("meta", meta);
      store.set("orders", orders.concat([order]));
      const returned = Object.assign({}, order);
      if (faults.create_order === "total_mismatch") returned.total = order.total + 1000;
      return returned;
    }

    /** FP-06: the raise increases the limit, then the balance is recalculated. */
    function raiseCredit(staff, input) {
      unavailable("raise_credit_limit");
      mustBe(staff, ["FN"], "raise_credit_limit");
      const raises = store.get("credit_raises");
      const existing = raises.find((x) => x.request_id === input.request_id);
      if (existing) return Object.assign({ existing: true }, existing);
      const customers = store.get("customers");
      const c = customers.find((x) => x.id === input.customer_id);
      if (!c) throw refuse("data_missing", `No customer ${input.customer_id}.`);
      if (rules.balance(c) === null) throw refuse("data_missing", "Back end: the credit record is incomplete; nothing was changed.");
      const amount = Math.round(Number(input.amount_rm) * 100);
      const old = c.credit_limit;
      c.credit_limit = old + amount;
      const rec = { request_id: input.request_id, customer: c.id, amount, old_limit: old, new_limit: c.credit_limit,
        outstanding: c.outstanding, balance: rules.balance(c), approved_by: staff.id, time: now() };
      store.set("customers", customers);
      store.set("credit_raises", raises.concat([rec]));
      const returned = Object.assign({}, rec);
      if (faults.raise_credit_limit === "balance_mismatch") returned.balance = rec.balance - 10000;
      return returned;
    }

    return { stock, account, prices, confirm, createOrder, raiseCredit, customer, VIEWS };
  }

  return { createBackend, VIEWS };
});
