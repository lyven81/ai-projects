/* The PostToolUse hook: one shared hook after all five tools.
 *
 * postToolUse(tool, input, raw, staffId, env, pre) -> { result, changes }
 *   raw:     what the tool returned (sen, Unix seconds, stored values), or { backendRefusal } when
 *            the back end refused on its own.
 *   pre:     what PreToolUse allowed with (the summary for an order, the figures before a raise).
 *   result:  the shared result shape: amounts in RM, times in Malaysia time, only the fields the
 *            department may see, contacts masked, out_of_date and price_missing flags set by code.
 *   changes: one line per thing converted, trimmed, masked, flagged or recomputed (the hook view).
 * After an action, any mismatch between what was sent and what came back is needs_reconciliation:
 * the reference is kept, the agent does not retry, and next_step names who reconciles.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"), require("../lib/backend.js"));
  else root.FDPostToolUse = factory(root.FDFormat, root.FDBackend);
})(typeof self !== "undefined" ? self : this, function (F, B) {
  "use strict";

  function postToolUse(tool, input, raw, staffId, env, pre) {
    const { rules, now } = env;
    const V = rules.V;
    const staff = rules.who(staffId);
    const changes = [];
    const did = (s) => changes.push(s);

    if (raw && raw.backendRefusal) {
      const e = raw.backendRefusal;
      did(`Back end refused on its own: ${e.code}`);
      const nexts = {
        credit_balance_exceeded: "Options (FP-05): a smaller order; the prepaid route with FN-01-01's approval; or a credit raise by Finance (FN-02-01).",
        stock_short: "Tell the staff member the quantity available; they decide whether to order it with a new confirmation. There are no back orders.",
      };
      const data = e.data && e.data.balance !== undefined ? { balance: F.rm(e.data.balance), total: F.rm(e.data.total) } : e.data;
      return { result: F.fail(tool, e.code, e.message, { data, next_step: nexts[e.code] }), changes };
    }

    if (tool === "check_stock" && raw.detail === "storage") {
      const cat = Object.fromEntries(env.store.get("catalogue").map((c) => [c.sku, c]));
      const items = [], missing = [];
      for (const [sku, r] of Object.entries(raw.items)) {
        if (!r) { missing.push(sku); continue; }
        items.push({ sku, name: cat[sku] ? cat[sku].name : null, bin: r.bin, last_counted: F.myt(r.last_count), days_since_count: Math.floor((now - r.last_count) / 86400) });
      }
      did("Storage: bin location and last manual count, time in Malaysia time");
      const data = { warehouse: raw.warehouse, items };
      if (missing.length) return { result: F.fail(tool, "data_missing", `No storage record for ${missing.join(", ")} at ${raw.warehouse}.`, { clause: "WP-02", data, next_step: "Ask WH-01-01 (warehouse manager) to check the record." }), changes };
      return { result: F.ok(tool, data), changes };
    }

    if (tool === "check_stock") {
      const items = [];
      const missing = [];
      const cat = Object.fromEntries(env.store.get("catalogue").map((c) => [c.sku, c]));
      for (const [sku, r] of Object.entries(raw.items)) {
        if (!r) { missing.push(sku); continue; }
        const age = Math.floor((now - r.updated) / 3600);
        const out = age > V.stock_max_age_hours;
        items.push({ sku, name: cat[sku] ? cat[sku].name : null, qty: r.qty, unit: cat[sku] ? cat[sku].unit : null, updated: F.myt(r.updated), age_hours: age, out_of_date: out });
        if (out) did(`${sku}: figure ${age} hours old, out_of_date set (WP-03)`);
      }
      did("Quantities in whole ordering units; update times converted to Malaysia time");
      const data = { warehouse: raw.warehouse, items };
      if (missing.length) {
        did(`No stock record: ${missing.join(", ")}, returned as data_missing`);
        return { result: F.fail(tool, "data_missing", `No stock record for ${missing.join(", ")} at ${raw.warehouse}; nothing was changed.`,
          { clause: "WP-02", data, next_step: "Ask WH-01-01 (warehouse manager) to check the stock record." }), changes };
      }
      return { result: F.ok(tool, data), changes };
    }

    if (tool === "retrieve_customer_account") {
      const allowed = B.VIEWS[input.view].fields;
      const extra = Object.keys(raw).filter((k) => !allowed.includes(k));
      const data = {};
      for (const k of allowed) if (k in raw) data[k] = raw[k];
      if (extra.length) did(`Removed fields this department may not see: ${extra.join(", ")} (MP-07)`);
      else did(`Checked: only the ${input.view} fields are present (MP-07)`);
      const missing = ["credit_limit", "outstanding"].filter((k) => k in data && (data[k] === null || data[k] === undefined));
      for (const k of ["credit_limit", "outstanding", "balance", "not_yet_invoiced"]) if (k in data) data[k] = F.rm(data[k]);
      if ("credit_limit" in data) did("Credit amounts converted from sen to RM; balance computed by code (FP-01)");
      if (data.contacts) { data.contacts = data.contacts.map((c) => ({ id: c.id, name: c.name, channel: c.channel, value: F.mask(c.value) })); did("Contacts masked, shown by contact ID"); }
      if (data.open_orders) data.open_orders = data.open_orders.map((o) => ({ id: o.id, total: F.rm(o.total), status: o.status, delivery_date: o.delivery_date }));
      if (data.invoices) {
        const today = F.mytDate(now);
        const dayN = (iso) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000);
        data.invoices = data.invoices.map((i) => {
          const late = dayN(today) - dayN(i.due);
          return { id: i.id, issued: i.issued, due: i.due, amount: F.rm(i.amount), overdue: late > 0, days_overdue: late > 0 ? late : 0 };
        });
        const od = data.invoices.filter((i) => i.overdue);
        data.overdue_count = od.length;
        data.overdue_total = F.rm(od.reduce((a, i) => a + Math.round(Number(i.amount.replace(/[^0-9.]/g, "")) * 100), 0));
        did(`Invoices checked against today (${today}) and their due dates (issue date plus ${data.terms_days} days' terms): ${od.length} overdue (FP-09)`);
      }
      if (input.view === "delivery") {
        const loc = rules.tables.locations[data.location];
        const std = rules.standardDelivery(now);
        data.served_from = `${data.warehouse} ${rules.tables.warehouses[data.warehouse]}`;
        data.if_confirmed_now = F.myt(now);
        data.delivery_day = F.dayLabel(std);
        did(`Serving warehouse from the location table: ${data.location} (${loc ? loc.district : "?"}) is served from ${data.served_from} (WP-01, WP-08)`);
        did(`Delivery day applied for an order confirmed ${F.myt(now)}: before 3 pm on a working day, so the next working day, ${F.dayLabel(std)}; Sundays and Selangor public holidays skipped (WP-07, WP-09)`);
      }
      if (missing.length) {
        did(`Permitted field missing: ${missing.join(", ")}, returned as data_missing`);
        return { result: F.fail(tool, "data_missing", `${raw.id}'s credit record is incomplete (${missing.join(", ")} missing); nothing was changed.`,
          { clause: "FP-01", data, next_step: "Do not act on this credit. FN-01-01 (finance manager) completes the record in the customer system (MP-13)." }), changes };
      }
      return { result: F.ok(tool, data), changes };
    }

    if (tool === "retrieve_customer_prices") {
      const today = F.mytDate(now);
      const cat = Object.fromEntries(env.store.get("catalogue").map((c) => [c.sku, c]));
      const prices = [];
      for (const [sku, sen] of Object.entries(raw.prices)) {
        const u = rules.unitPrice(sen, sku, today);
        const row = { sku, name: cat[sku] ? cat[sku].name : null, unit: cat[sku] ? cat[sku].unit : null, price: F.rm(u.price) };
        if (sen === null) { row.price_missing = true; did(`${sku}: no price on the list, flagged price_missing (SP-04)`); }
        if (u.promo) { row.list_price = F.rm(sen); row.promotion = u.promo; did(`${sku}: promotion ${u.promo} applied for ${today} (SP-05, SP-12)`); }
        prices.push(row);
      }
      did("Prices converted from sen to RM per ordering unit");
      return { result: F.ok(tool, { customer: raw.customer, date: today, prices }), changes };
    }

    if (tool === "create_order") {
      const ref = raw.id;
      const sent = raw.existing ? raw : pre.summary;
      const recomputed = (() => {
        const sub = raw.lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
        return sub - Math.round((sub * (raw.discount_pct || 0)) / 100);
      })();
      const expectStatus = raw.route === "prepaid" ? "awaiting_payment" : "pending_dispatch";
      const idOk = /^FD-SO-\d{5}$/.test(ref || "");
      const totalOk = raw.total === recomputed && (raw.existing || raw.total === sent.total);
      const statusOk = raw.existing || raw.status === expectStatus;
      did(`Order ID ${idOk ? "in the expected form" : "NOT in the expected form"}; total recomputed from the lines: ${F.rm(recomputed)}${totalOk ? ", matches" : `, returned ${F.rm(raw.total)}`}`);
      const data = { order_id: ref, customer: raw.customer, lines: raw.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: F.rm(l.unit_price) })),
        discount_pct: raw.discount_pct, total: F.rm(raw.total), payment_route: raw.route, status: raw.status,
        delivery_date: raw.delivery_date, created_at: F.myt(raw.created_at), created_by: raw.created_by };
      if (!idOk || !totalOk || !statusOk) {
        did("Mismatch after the action: needs_reconciliation, reference kept, no retry");
        return { result: F.fail(tool, "order_result_mismatch", `Order ${ref} was submitted, but the returned ${!totalOk ? "total" : !idOk ? "ID" : "status"} does not match what was sent.`,
          { data, next_step: `Do not retry or place it again. Keep the reference ${ref}; SL-01-01 (sales manager) reconciles it.` }), changes };
      }
      did(`Status ${raw.status} (${raw.route} route); amounts in RM; time in Malaysia time; recorded with ${raw.created_by} (MP-15)`);
      if (raw.existing) {
        did(`Request ID ${raw.request_id} seen before: the existing order returned, no second order (SP-08)`);
        data.existing = true;
        return { result: F.ok(tool, data, `This request was already placed as ${ref}; no second order was created. Tell the staff member.`), changes };
      }
      return { result: F.ok(tool, data), changes };
    }

    if (tool === "raise_credit_limit") {
      const amount = raw.existing ? raw.amount : Math.round(Number(input.amount_rm) * 100);
      const old = raw.existing ? raw.old_limit : pre.before.credit_limit;
      const wantLimit = old + amount;
      const wantBal = raw.new_limit - raw.outstanding;
      const ok = raw.new_limit === wantLimit && raw.balance === wantBal;
      did(`New limit recomputed ${F.rm(wantLimit)}, balance ${F.rm(wantBal)}${ok ? ": both match" : `: returned balance ${F.rm(raw.balance)}`} (FP-01, FP-06)`);
      const data = { customer: raw.customer, raised_by: F.rm(amount), old_limit: F.rm(old), new_limit: F.rm(raw.new_limit),
        outstanding: F.rm(raw.outstanding), balance: F.rm(raw.balance), approved_by: raw.approved_by, time: F.myt(raw.time) };
      if (!ok) {
        did("Mismatch after the action: needs_reconciliation, no retry");
        return { result: F.fail(tool, "raise_result_mismatch", `The raise for ${raw.customer} was submitted, but the returned balance does not match.`,
          { data, next_step: `Do not retry. FN-01-01 (finance manager) reconciles the raise on request ${raw.request_id}.` }), changes };
      }
      did(`Recorded with the approver's staff ID ${raw.approved_by} (MP-15)`);
      if (raw.existing) { data.existing = true; return { result: F.ok(tool, data, "This raise was already made on this request ID; nothing was raised again."), changes }; }
      return { result: F.ok(tool, data), changes };
    }

    return { result: F.fail(tool, "data_missing", `No tool named ${tool}.`), changes };
  }

  return { postToolUse };
});
