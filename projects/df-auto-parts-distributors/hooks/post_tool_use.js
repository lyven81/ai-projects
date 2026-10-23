/* The PostToolUse hook: one shared hook after all seven tools.
 *
 * postToolUse(tool, input, raw, staffId, env, pre) -> { result, changes }
 *   raw:     what the tool returned (sen, Unix seconds, stored values), or { backendRefusal } when
 *            the back end refused on its own.
 *   pre:     the plan PreToolUse allowed with (escalate or place, the summary, the escalation).
 *   result:  the shared result shape: amounts in RM, times in Malaysia time, only the fields the
 *            department may see, flags set by code, and next_step with the Basis line and, for a fixed
 *            outcome, the reply written in code (say): "Sent to ...", the decider's "OK.", the count.
 *   changes: one line per thing converted, trimmed, flagged, recomputed or written (under the hood).
 * After an action, any mismatch between what was sent and what came back is needs_reconciliation:
 * the reference is kept, the agent does not retry, and next_step names who reconciles.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"), require("../lib/backend.js"));
  else root.DFPostToolUse = factory(root.DFFormat, root.DFBackend);
})(typeof self !== "undefined" ? self : this, function (F, B) {
  "use strict";

  function postToolUse(tool, input, raw, staffId, env, pre) {
    const { rules: R, now } = env;
    const V = R.V;
    const changes = [];
    const did = (s) => changes.push(s);
    const cat = Object.fromEntries((env.store.get("catalogue") || []).map((c) => [c.sku, c]));
    const unitOf = (sku, qty) => `${qty} ${cat[sku] ? cat[sku].unit : "unit"}${qty === 1 ? "" : "s"}`;

    if (raw && raw.backendRefusal) {
      const e = raw.backendRefusal;
      did(`Back end refused on its own: ${e.code}`);
      const data = e.data && e.data.balance !== undefined ? { balance: F.rm(e.data.balance), total: F.rm(e.data.total) } : e.data;
      return { result: F.fail(tool, e.code, e.message, { data, next_step: { text: "Nothing was placed or changed.", basis: F.CODES[e.code] ? F.CODES[e.code].clause : null } }), changes };
    }

    if (tool === "check_stock" && raw.detail === "storage") {
      const items = [], missing = [];
      for (const [sku, r] of Object.entries(raw.items)) {
        if (!r) { missing.push(sku); continue; }
        items.push({ sku, name: cat[sku] ? cat[sku].name : null, bin: r.bin, last_counted: F.myt(r.last_count), days_since_count: Math.floor((now - r.last_count) / 86400) });
      }
      did("Storage: bin location and last manual count, time in Malaysia time");
      const data = { warehouse: raw.warehouse, items };
      if (missing.length) return { result: F.fail(tool, "data_missing", `No storage record for ${missing.join(", ")} at ${raw.warehouse}.`, { clause: "WP-02", data }), changes };
      return { result: F.ok(tool, data, { basis: `MP-07 · ${raw.warehouse} storage records` }), changes };
    }

    if (tool === "check_stock" && raw.detail === "schedule") {
      const deliveries = raw.deliveries.map((d) => ({ order_id: d.order_id, customer: d.customer, customer_name: d.customer_name,
        items: d.lines.map((l) => ({ sku: l.sku, name: cat[l.sku] ? cat[l.sku].name : null, qty: unitOf(l.sku, l.qty) })),
        status: d.status.replace(/_/g, " "), scheduled_by: d.scheduled_by ? `${R.nameOf(d.scheduled_by)} (${d.scheduled_by})` : "not scheduled yet",
        scheduled_at: d.scheduled_at ? F.myt(d.scheduled_at) : null }));
      did(`Deliveries due from ${raw.warehouse} on ${F.dayLabel(raw.date)}: items and quantities only, no prices or order values (MP-07)`);
      return { result: F.ok(tool, { warehouse: raw.warehouse, date: F.dayLabel(raw.date), deliveries }, { basis: `WP-10 · ${raw.warehouse} schedule, ${F.dayWords(raw.date)}` }), changes };
    }

    if (tool === "check_stock") {
      const items = [], missing = [];
      for (const [sku, r] of Object.entries(raw.items)) {
        if (!r) { missing.push(sku); continue; }
        const age = Math.floor((now - r.updated) / 3600);
        const out = age > V.stock_max_age_hours;
        items.push({ sku, name: cat[sku] ? cat[sku].name : null, qty: r.qty, unit: cat[sku] ? cat[sku].unit : null, updated: F.myt(r.updated), age_hours: age, out_of_date: out });
        if (out) did(`${sku}: figure ${age} hours old, out_of_date set (WP-03)`);
      }
      did("Quantities in whole selling units; update times converted to Malaysia time");
      const data = { warehouse: raw.warehouse, items };
      if (missing.length) return { result: F.fail(tool, "data_missing", `No stock record for ${missing.join(", ")} at ${raw.warehouse}; nothing was changed.`, { clause: "WP-02", data }), changes };
      return { result: F.ok(tool, data, { basis: `WP-02, WP-03 · ${items.map((i) => `${raw.warehouse} ${unitOf(i.sku, i.qty)}, updated ${i.age_hours} hours ago`).join("; ")}` }), changes };
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
      if (data.invoices) {
        const today = F.mytDate(now);
        const dayN = (iso) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000);
        data.invoices = data.invoices.map((i) => {
          const late = dayN(today) - dayN(i.due);
          return { id: i.id, issued: i.issued, due: i.due, amount: F.rm(i.amount), overdue: late > 0, days_overdue: late > 0 ? late : 0 };
        });
        const od = data.invoices.filter((i) => i.overdue);
        data.overdue_count = od.length;
        did(`Invoices checked against today (${today}) and their due dates: ${od.length} overdue (FP-09)`);
      }
      if (input.view === "delivery") {
        const std = R.standardDelivery(now);
        data.served_from = `${data.warehouse} ${R.tables.warehouses[data.warehouse]}`;
        data.delivery_day = F.dayLabel(std);
        did(`Delivery day for an order confirmed ${F.myt(now)}: ${F.dayLabel(std)} (WP-07, WP-09)`);
      }
      if (missing.length) return { result: F.fail(tool, "data_missing", `${raw.id}'s credit record is incomplete (${missing.join(", ")} missing); nothing was changed.`,
        { clause: "FP-01", data, next_step: { text: `Do not act on this credit. ${R.person("FN-01-01")} completes the record (MP-13).`, person: "FN-01-01" } }), changes };
      return { result: F.ok(tool, data, { basis: `MP-07 · ${raw.id} ${input.view} view` }), changes };
    }

    if (tool === "retrieve_customer_prices") {
      const today = F.mytDate(now);
      const prices = [];
      for (const [sku, sen] of Object.entries(raw.prices)) {
        const u = R.unitPrice(sen, sku, today);
        const row = { sku, name: cat[sku] ? cat[sku].name : null, unit: cat[sku] ? cat[sku].unit : null, price: F.rm(u.price) };
        if (sen === null) { row.price_missing = true; did(`${sku}: no price on the list, flagged price_missing (SP-04)`); }
        if (u.promo) { row.list_price = F.rm(sen); row.promotion = u.promo; did(`${sku}: promotion ${u.promo} applied for ${today} (SP-05, SP-12)`); }
        prices.push(row);
      }
      did("Prices converted from sen to RM per selling unit");
      return { result: F.ok(tool, { customer: raw.customer, date: today, prices }, { basis: `SP-04 · ${raw.customer} price list` }), changes };
    }

    if (tool === "create_order" && pre && pre.mode === "escalate") {
      const e = raw.escalation, d = raw.draft;
      did(`Escalation ${e.id} written to ${e.to} (${R.tables.approval_types[e.type].label}) for ${d.request_id}, with the data to decide, filtered for ${R.who(e.to).dept} (MP-07, MP-16)`);
      did(`Draft ${d.request_id} for ${d.customer}: ${d.status}, lapses ${F.myt(d.lapses_at)} (SP-13)`);
      did(`Notification written by code to ${e.to}; reply written by code: "Sent to ${R.person(e.to)}."`);
      const code = R.RULE_CODE[e.type];
      return { result: F.fail(tool, code, `${R.tables.approval_types[e.type].label} needs ${e.to}'s decision; sent as ${e.id}. Nothing was placed.`, {
        data: { escalation_id: e.id, request_id: d.request_id, to: e.to, type: e.type },
        next_step: { text: `${R.person(e.to)} decides ${e.id}; ${R.firstOf(e.from)} is told here.`, person: e.to, say: R.say.sent(e.to), basis: `${R.RULE_CLAUSE[e.type]} · escalation ${e.id}` } }), changes };
    }

    if (tool === "create_order") {
      const ref = raw.id;
      const sent = raw.existing ? raw : pre.summary;
      const sub = raw.lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
      const recomputed = sub - Math.round((sub * (raw.discount_pct || 0)) / 100);
      const expectStatus = raw.route === "prepaid" ? "awaiting_payment" : "pending_dispatch";
      const idOk = /^DF-SO-\d{5}$/.test(ref || "");
      const totalOk = raw.total === recomputed && (raw.existing || raw.total === sent.total);
      const statusOk = raw.existing || raw.status === expectStatus;
      did(`Order ID ${idOk ? "in the expected form" : "NOT in the expected form"}; total recomputed from the lines: ${F.rm(recomputed)}${totalOk ? ", matches" : `, returned ${F.rm(raw.total)}`}`);
      const data = { order_id: ref, request_id: raw.request_id, customer: raw.customer, lines: raw.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: F.rm(l.unit_price) })),
        discount_pct: raw.discount_pct, total: F.rm(raw.total), payment_route: raw.route, status: raw.status.replace(/_/g, " "),
        delivery_date: F.dayLabel(raw.delivery_date), warehouse: raw.warehouse, approvals: raw.approvals || [], revised_from: raw.revised_from || null,
        created_at: F.myt(raw.created_at), created_by: raw.created_by };
      if (!idOk || !totalOk || !statusOk) {
        did("Mismatch after the action: needs_reconciliation, reference kept, no retry");
        return { result: F.fail(tool, "order_result_mismatch", `Order ${ref} was submitted, but the returned ${!totalOk ? "total" : !idOk ? "ID" : "status"} does not match what was sent.`,
          { data, next_step: { text: `Do not retry or place it again. Keep the reference ${ref}; ${R.person("SL-01-01")} reconciles it.`, person: "SL-01-01", basis: `MP-15 · ${ref}` } }), changes };
      }
      if ((raw.approvals || []).length) did(`Approvals found for ${raw.request_id}: ${raw.approvals.join(", ")} (MP-09)`);
      if (raw.revised_from) did(`Revised from the declined request ${raw.revised_from}; the decline stays on record`);
      did(`Status ${raw.status} (${raw.route} route); amounts in RM; recorded with ${raw.created_by} (MP-15)`);
      const basis = `SP-01, SP-07, ${raw.route === "prepaid" ? "FP-04" : "FP-03"}${(raw.approvals || []).length ? ` · ${raw.approvals.join(", ")}` : ""} · ${ref} recorded by ${raw.created_by}, ${F.hhmm(raw.created_at)}`;
      if (raw.existing) {
        did(`Request ID ${raw.request_id} seen before: the existing order returned, no second order (SP-08)`);
        data.existing = true;
        return { result: F.ok(tool, data, { text: `This request was already placed as ${ref}; no second order was created.`, basis }), changes };
      }
      return { result: F.ok(tool, data, { text: raw.route === "prepaid" ? "Dispatch waits until Finance confirms payment, outside the assistant (FP-04)." : "Warehouse schedules the delivery.", basis }), changes };
    }

    if (tool === "decide_escalation") {
      const e = raw.escalation;
      did(`${e.id} ${e.status} by ${e.decided_by} at ${F.myt(e.decided_at)}${raw.approval ? `; approval ${raw.approval.id} recorded against ${e.request_id}` : ""} (MP-09, MP-15)`);
      did(`Notification written by code to ${e.from}: "${raw.notification}"`);
      did("Reply written by code (the decider's instruction, carried out)");
      const clause = `${R.RULE_CLAUSE[e.type]}, MP-05, MP-09`;
      return { result: F.ok(tool, { escalation_id: e.id, request_id: e.request_id, customer: e.customer, decision: e.status, reason: e.reason,
        approval_id: raw.approval ? raw.approval.id : null, approvals_recorded: raw.approvals_recorded, requester: e.from },
        { text: `${R.firstOf(e.from)} has been told.`, person: e.from, say: raw.say, basis: `${clause} · ${raw.approval ? raw.approval.id : e.id} recorded by ${e.decided_by}, ${F.hhmm(e.decided_at)}` }), changes };
    }

    if (tool === "schedule_delivery") {
      did(`Schedule recorded for ${raw.order_id}: ${F.dayLabel(raw.date)} from ${raw.warehouse}, by ${raw.scheduled_by} (MP-15)`);
      did("Items and quantities only; no prices or order values (MP-07)");
      return { result: F.ok(tool, { order_id: raw.order_id, customer: raw.customer, customer_name: raw.customer_name,
        items: raw.lines.map((l) => ({ sku: l.sku, name: cat[l.sku] ? cat[l.sku].name : null, qty: unitOf(l.sku, l.qty) })),
        date: F.dayLabel(raw.date), warehouse: raw.warehouse, scheduled_by: raw.scheduled_by, time: F.myt(raw.time) },
        { basis: `WP-07, WP-10 · scheduled by ${raw.scheduled_by}, ${F.hhmm(raw.time)}` }), changes };
    }

    if (tool === "confirm_stock_count") {
      did(`${raw.sku} at ${raw.warehouse}: ${raw.before_qty} (updated ${F.myt(raw.before_updated)}) reset to ${raw.qty} counted ${F.myt(raw.time)}; record ${raw.id} (WP-03, MP-15)`);
      did("Reply written by code (the warehouse manager's own count, carried out)");
      return { result: F.ok(tool, { record: raw.id, sku: raw.sku, warehouse: raw.warehouse, before: raw.before_qty, before_updated: F.myt(raw.before_updated),
        counted: raw.qty, counted_at: F.myt(raw.time), counted_by: raw.by }, { text: "Sales can order it again.", say: raw.say, basis: `WP-03 · ${raw.id} recorded by ${raw.by}, ${F.hhmm(raw.time)}` }), changes };
    }

    return { result: F.fail(tool, "data_missing", `No tool named ${tool}.`), changes };
  }

  return { postToolUse };
});
