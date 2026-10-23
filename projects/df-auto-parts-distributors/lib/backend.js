/* The back end data layer: the second line behind the hooks.
 *
 * Critical checks run here too, on their own, so a hook fault or a direct call cannot get past them:
 *   department and tier (MP-07, SP-01, WP-03, WP-10), customer assignment (MP-06), permitted fields per
 *   department before any data leaves (MP-07), request IDs so a retry returns the existing order (SP-08),
 *   stock and credit rechecked and reserved together when an order is placed (WP-04, FP-03), a draft
 *   placed once (SP-13), an escalation decided once and only by the person it is addressed to (MP-05, MP-09).
 * New in DF (Build List sections 6 and 7): order drafts, escalations with the data to decide, the
 * notifications written by code, approvals recorded by request ID, delivery schedules, stock counts.
 * Raw values leave in sen and Unix seconds; PostToolUse converts them. A refusal is thrown as
 * { backend: true, code, message, data }.
 *
 * store: { get(name), set(name, value) } over the data files (catalogue, customers, price_lists, stock,
 * storage, orders, invoices, staff, approvals, confirmations, escalations, drafts, notifications,
 * stock_counts, schedules, meta, call_log).
 * opts.faults (benchmark only): { create_order: "total_mismatch" | "unavailable", <tool>: "unavailable" }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.DFBackend = factory(root.DFFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  // MP-07: each view of a customer account, its fields and the departments that may open it.
  const VIEWS = {
    location: { fields: ["id", "name", "location"], depts: ["SL", "FN", "WH"] },
    delivery: { fields: ["id", "name", "location", "warehouse"], depts: ["SL", "WH"] },
    credit: { fields: ["id", "name", "credit_limit", "outstanding", "balance", "terms_days"], depts: ["SL", "FN"] },
    payments: { fields: ["id", "name", "terms_days", "outstanding", "invoices", "not_yet_invoiced"], depts: ["FN"] },
  };
  const PLACED = ["pending_dispatch", "awaiting_payment"];
  const COUNT_WORDS = { 2: "Both", 3: "All three", 4: "All four" };

  function refuse(code, message, data) {
    const e = new Error(message);
    Object.assign(e, { backend: true, code, data: data === undefined ? null : data });
    return e;
  }

  function createBackend(store, rules, opts) {
    const o = opts || {};
    const faults = o.faults || {};
    const now = () => o.now;
    const R = rules;

    const all = (n) => store.get(n) || [];
    const customer = (id) => all("customers").find((c) => c.id === id) || null;
    const cat = () => Object.fromEntries(all("catalogue").map((c) => [c.sku, c]));
    const unavailable = (tool) => { if (faults[tool] === "unavailable") throw refuse("system_unavailable", "The back end did not respond; nothing was changed."); };
    const mustBe = (staff, depts, tool) => { if (!staff || !depts.includes(staff.dept)) throw refuse("department_not_permitted", `Back end: ${tool} is not open to this department.`); };
    const mustOwn = (staff, c) => { if (staff.dept === "SL" && staff.tier === "02" && c.assigned_to !== staff.id) throw refuse("customer_not_assigned", "Back end: not this salesperson's customer."); };
    const nextId = (prefix, key, width) => {
      const meta = store.get("meta");
      const id = `${prefix}${String(meta[key]).padStart(width, "0")}`;
      meta[key] += 1;
      store.set("meta", meta);
      return id;
    };
    const seq = (name, prefix) => `${prefix}${String(all(name).length + 1).padStart(4, "0")}`;
    const push = (name, rec) => store.set(name, all(name).concat([rec]));
    const save = (name, list) => store.set(name, list);

    /** "10 cartons of 5W-30 engine oil", "12 oil filters". */
    function linesWords(lines) {
      const c = cat();
      return lines.map((l) => (l.qty === 1 ? `1 ${c[l.sku].unit} of ${c[l.sku].name}` : `${l.qty} ${c[l.sku].plural}`)).join(" and ");
    }
    const unitWords = (sku, qty) => `${qty} ${cat()[sku].unit}${qty === 1 ? "" : "s"}`;
    function overdue(customerId) {
      const today = F.mytDate(now());
      const day = (iso) => Math.round(new Date(iso + "T00:00:00Z").getTime() / 86400000);
      const od = all("invoices").filter((i) => i.customer === customerId && !i.paid && day(today) > day(i.due))
        .map((i) => ({ amount: i.amount, days: day(today) - day(i.due) }));
      return { total: od.reduce((a, i) => a + i.amount, 0), oldest: od.reduce((a, i) => Math.max(a, i.days), 0), count: od.length };
    }

    // ---------------------------------------------------------------- reads
    function stock(staff, skus, warehouse, detail, date) {
      unavailable("check_stock");
      if (detail === "storage" || detail === "schedule") mustBe(staff, ["WH"], `check_stock (${detail})`);  // Warehouse only (MP-07)
      else mustBe(staff, ["SL", "WH"], "check_stock");
      if (detail === "storage") {
        const st = store.get("storage");
        const items = {};
        for (const sku of skus) items[sku] = (st[sku] && st[sku][warehouse]) ? { bin: st[sku][warehouse].bin, last_count: st[sku][warehouse].last_count } : null;
        return { warehouse, detail: "storage", items };
      }
      if (detail === "schedule") {
        const day = date || R.standardDelivery(now());
        const sched = all("schedules");
        const deliveries = all("orders").filter((x) => x.warehouse === warehouse && x.delivery_date === day && x.status !== "delivered")
          .map((x) => {
            const s = sched.find((y) => y.order === x.id);
            return { order_id: x.id, customer: x.customer, customer_name: (customer(x.customer) || {}).name,
              lines: x.lines.map((l) => ({ sku: l.sku, qty: l.qty })), status: x.status, scheduled_by: s ? s.by : null, scheduled_at: s ? s.time : null };
          });  // no prices, order values or credit (MP-07)
        return { warehouse, detail: "schedule", date: day, deliveries };
      }
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
      const open = all("orders").filter((x) => x.customer === c.id && x.status !== "delivered" && x.route === "credit");
      const full = {
        id: c.id, name: c.name, location: c.location, warehouse: c.warehouse, assigned_to: c.assigned_to,
        credit_limit: c.credit_limit, outstanding: c.outstanding, balance: R.balance(c), terms_days: c.terms,
        not_yet_invoiced: open.reduce((a, x) => a + x.total, 0),
        invoices: all("invoices").filter((x) => x.customer === c.id && !x.paid).map((x) => ({ id: x.id, issued: x.issued, due: x.due, amount: x.amount })),
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

    // ---------------------------------------------------------------- drafts (SP-13)
    /** Marks the customer's drafts that are 90 days old as lapsed, closes their open escalations, tells the requester. */
    function lapseDrafts(customerId) {
      const drafts = all("drafts");
      const due = drafts.filter((d) => d.customer === customerId && R.isLapsed(d, now()));
      if (!due.length) return [];
      const esc = all("escalations");
      for (const d of due) {
        d.status = "lapsed";
        for (const e of esc) if (e.request_id === d.request_id && e.status === "open") Object.assign(e, { status: "lapsed", decided_at: now() });
        push("notifications", { id: seq("notifications", "NT-"), to: d.created_by, from: null, kind: "lapsed", request_id: d.request_id, time: now(),
          text: `${d.customer}'s draft ${d.request_id} has lapsed after ${R.V.draft_lapse_days} days. Nothing was placed.` });
      }
      save("drafts", drafts);
      save("escalations", esc);
      return due.map((d) => d.request_id);
    }
    /** The customer's open drafts (not lapsed). */
    const openDrafts = (customerId) => all("drafts").filter((d) => d.customer === customerId && d.status === "draft" && !R.isLapsed(d, now()));
    const approvalsFor = (requestId) => (requestId ? all("approvals").filter((a) => a.request_id === requestId) : []);

    // ---------------------------------------------------------------- escalate (MP-16)
    /** Opens or extends the draft and writes the escalation to the manager who owns the rule, then the notification. */
    function escalate(staff, input) {
      unavailable("create_order");
      mustBe(staff, ["SL"], "create_order");
      const c = customer(input.customer_id);
      if (!c) throw refuse("data_missing", `No customer ${input.customer_id}.`);
      mustOwn(staff, c);
      lapseDrafts(c.id);
      const s = input.summary, type = input.rule;
      const drafts = all("drafts");
      let d = input.request_id ? drafts.find((x) => x.request_id === input.request_id && x.status === "draft") : null;
      if (d && all("escalations").some((e) => e.request_id === d.request_id && e.status === "open")) throw refuse("escalation_open", "Back end: an escalation is already open on this draft.");
      if (!d) {
        d = { request_id: nextId("RQ-", "next_request", 4), customer: c.id, created_by: staff.id, created_at: now(), lapses_at: R.lapsesAt(now()),
          lines: [], discount_pct: 0, payment_route: "credit", delivery_date: null, escalations: [], status: "draft", order_id: null };
        drafts.push(d);
      }
      Object.assign(d, { lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty })), discount_pct: s.discount_pct, payment_route: s.route, delivery_date: s.delivery_date });
      const to = R.managerOf(R.tables.approval_types[type].department);
      const id = seq("escalations", "ES-");
      const bal = R.balance(c);
      // The data the decision needs, filtered by the decider's department (MP-07): Warehouse sees no prices or credit.
      const decision = type === "delivery_exception"
        ? { lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty })), asked_date: s.delivery_date, standard_date: R.standardDelivery(now()), warehouse: c.warehouse,
            stock: Object.fromEntries(s.lines.map((l) => [l.sku, (store.get("stock")[l.sku] || {})[c.warehouse] || null])),
            out_today: all("orders").filter((x) => x.warehouse === c.warehouse && x.delivery_date === F.mytDate(now()) && x.status === "out_for_delivery").map((x) => x.id) }
        : { lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: l.unit_price })), subtotal: s.subtotal, discount_pct: s.discount_pct, discount: s.discount,
            total: s.total, route: s.route, delivery_date: s.delivery_date, credit_limit: c.credit_limit, outstanding: c.outstanding, balance: bal,
            overdue: type === "prepaid" ? overdue(c.id) : undefined, minimum: type === "minimum_order" ? R.V.minimum_order_sen : undefined };
      const rec = { id, type, from: staff.id, to, customer: c.id, request_id: d.request_id, decision_data: decision, sent_at: now(),
        status: "open", decision: null, reason: null, decided_by: null, decided_at: null, approval_id: null };
      d.escalations.push(id);
      save("drafts", drafts);
      push("escalations", rec);
      push("notifications", { id: seq("notifications", "NT-"), to, from: staff.id, kind: "escalation", escalation: id, request_id: d.request_id, time: now(), text: managerNotice(rec, c) });
      return { escalation: rec, draft: d };
    }

    /** The two sentences the manager receives (Build List section 7). */
    function managerNotice(e, c) {
      const from = R.nameOf(e.from), x = e.decision_data, cid = c.id, rq = e.request_id;
      if (e.type === "discount")
        return `${from} has sent you a ${x.discount_pct}% discount request for ${cid}'s order ${rq}: ${F.rm(x.subtotal)} less ${F.rm(x.discount)}, total ${F.rm(x.total)}, with ${F.rm(x.balance)} of credit available. You can approve or decline it here.`;
      if (e.type === "minimum_order")
        return `${from} has sent you a below-minimum order for ${cid}, request ${rq}: ${linesWords(x.lines)} for ${F.rm(x.total)} against the ${F.rm(x.minimum)} minimum. You can approve or decline it here.`;
      if (e.type === "delivery_exception") {
        const today = x.asked_date === F.mytDate(now());
        const first = x.lines[0], st = x.stock[first.sku];
        const out = x.out_today.length === 0 ? "no delivery" : x.out_today.length === 1 ? "one delivery" : `${x.out_today.length} deliveries`;
        return `${from} has sent you a ${today ? "same-day delivery" : "delivery-date"} request for ${cid}'s order ${rq}: ${linesWords(x.lines)} ${today ? `today, ${F.dayWords(x.asked_date)}` : `on ${F.dayWords(x.asked_date)}`}, instead of ${F.dayWords(x.standard_date)}. ${x.warehouse} holds ${st ? unitWords(first.sku, st.qty) : "no stock record"} with ${out} already out today, and you can approve or decline it here.`;
      }
      const od = x.overdue;
      const odText = !od || !od.count ? "nothing overdue" : od.count === 1 ? `${F.rm(od.total)} overdue for ${od.oldest} days` : `${F.rm(od.total)} overdue, the oldest for ${od.oldest} days`;
      return `${from} has sent you a prepaid route request for ${cid}'s order ${rq}: ${F.rm(x.total)} paid before dispatch, with ${F.rm(x.balance)} of credit available and ${odText}. You can approve or decline it here.`;
    }

    // ---------------------------------------------------------------- decide (MP-05, MP-09)
    const DESC = { discount: (e) => `${e.decision_data.discount_pct}% discount`, minimum_order: () => "below-minimum order",
      delivery_exception: (e) => (e.decision_data.asked_date === F.mytDate(e.sent_at) ? "same-day delivery" : "delivery date"), prepaid: () => "prepaid route" };
    function reasonText(r) {
      const t = String(r || "").trim().replace(/[.!\s]+$/, "");
      return t ? (/^[A-Z]{2,}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1)) : "";
    }
    /** What the decision is about, in a sentence: "Chloe's 10% discount on C-0001's order RQ-0002" or "C-0001's RM 216.00 order RQ-0003". */
    function about(e) {
      if (e.type === "minimum_order") return `${e.customer}'s ${F.rm(e.decision_data.total)} order ${e.request_id}`;
      return `${R.firstOf(e.from)}'s ${DESC[e.type](e)} on ${e.customer}'s order ${e.request_id}`;
    }

    function decide(staff, input) {
      unavailable("decide_escalation");
      if (!staff || staff.tier !== "01") throw refuse("tier_not_permitted", "Back end: only a Tier 01 manager decides an escalation.");
      const esc = all("escalations");
      const e = esc.find((x) => x.id === input.escalation_id);
      if (!e) throw refuse("escalation_not_found", "Back end: no such escalation.");
      if (e.to !== staff.id) throw refuse("approval_wrong_department", "Back end: the escalation is not addressed to this manager.");
      if (e.status !== "open") throw refuse("escalation_already_decided", "Back end: the escalation was already decided.");
      const approve = input.decision === "approve";
      const reason = input.reason ? String(input.reason).trim() : null;
      Object.assign(e, { status: approve ? "approved" : "declined", decision: input.decision, reason, decided_by: staff.id, decided_at: now() });
      const drafts = all("drafts");
      const d = drafts.find((x) => x.request_id === e.request_id);
      let approval = null;
      if (approve) {
        const x = e.decision_data;
        const value = e.type === "discount" ? x.discount_pct : e.type === "delivery_exception" ? x.asked_date : x.total;
        approval = { id: nextId("AP-", "next_approval", 4), approver: staff.id, type: e.type, customer: e.customer, request_id: e.request_id, value, time: now(), escalation: e.id };
        e.approval_id = approval.id;
        push("approvals", approval);
      } else if (d && d.status === "draft") d.status = "declined";
      save("escalations", esc);
      save("drafts", drafts);
      // The requester is told (code, no model call).
      const n = approvalsFor(e.request_id).length;
      const mgr = R.nameOf(staff.id);
      let text;
      if (approve) {
        text = `${mgr} has approved your ${DESC[e.type](e)} for ${e.customer}'s order ${e.request_id} (${approval.id}). ` +
          (n >= 2 ? `${COUNT_WORDS[n] || `All ${n}`} approvals are recorded, so you can confirm the summary and place the order now.` : "You can place the order when the customer's terms are settled.");
      } else {
        const what = e.type === "minimum_order" ? `${e.customer}'s ${F.rm(e.decision_data.total)} order ${e.request_id}` : `your ${DESC[e.type](e)} for ${e.customer}'s order ${e.request_id}`;
        text = `${mgr} has declined ${what}${reason ? `: ${reasonText(reason)}` : ""}. Nothing was placed.`;
      }
      push("notifications", { id: seq("notifications", "NT-"), to: e.from, from: staff.id, kind: approve ? "approved" : "declined", escalation: e.id, request_id: e.request_id, time: now(), text });
      const say = approve
        ? `OK. ${R.ucFirst(about(e))} is approved as ${approval.id}, and ${R.firstOf(e.from)} will place the order.`
        : `OK. ${R.ucFirst(about(e))} is declined, and ${R.firstOf(e.from)} ${reason ? `has your reason: ${reasonText(reason)}.` : "has been told."}`;
      return { escalation: e, approval, approvals_recorded: n, notification: text, say };
    }

    // ---------------------------------------------------------------- confirm and place
    /** The Confirm summary button (Sales Tier 02): writes the confirmation record bound to the full summary (SP-07).
     * For a draft (input.request_id), the summary is the draft's own terms. */
    function confirm(staff, input) {
      if (!staff || staff.dept !== "SL" || staff.tier !== "02") throw refuse("tier_not_permitted", "Only Sales Tier 02 confirms an order summary.");
      const c = customer(input.customer);
      if (!c) throw refuse("data_missing", `No customer ${input.customer}.`);
      mustOwn(staff, c);
      lapseDrafts(c.id);
      const list = store.get("price_lists")[c.id] || {};
      let d = null, t = input;
      if (input.request_id) {
        d = all("drafts").find((x) => x.request_id === input.request_id && x.customer === c.id && x.status === "draft");
        if (!d) throw refuse("data_missing", `No open draft ${input.request_id} for ${c.id}.`);
        t = { lines: d.lines, discount_pct: d.discount_pct, route: d.payment_route, delivery_date: d.delivery_date };
      }
      const s = R.summary(c.id, list, t.lines, t.discount_pct, t.route, t.delivery_date || R.standardDelivery(now()), now());
      const id = seq("confirmations", "CF-");
      const rec = Object.assign({ id, staff: staff.id, time: now(), request_id: d ? d.request_id : nextId("RQ-", "next_request", 4) }, s);
      push("confirmations", rec);
      return rec;
    }

    /** Places the order once: recheck and reserve stock and credit together (WP-04, FP-03), then write it. */
    function createOrder(staff, input) {
      unavailable("create_order");
      mustBe(staff, ["SL"], "create_order");
      if (staff.tier !== "02") throw refuse("tier_not_permitted", "Back end: orders are placed by Sales Tier 02 only.");
      const orders = all("orders");
      const existing = orders.find((x) => x.request_id === input.request_id);
      if (existing) return Object.assign({ existing: true }, existing);  // SP-08: never a second order
      const customers = all("customers");
      const c = customers.find((x) => x.id === input.customer_id);
      if (!c) throw refuse("data_missing", `No customer ${input.customer_id}.`);
      mustOwn(staff, c);
      const s = input.summary;
      if (s.total === null) throw refuse("price_missing", "Back end: a line has no price.", { skus: s.missing_prices });
      const drafts = all("drafts");
      const d = drafts.find((x) => x.request_id === input.request_id);
      if (d && d.status !== "draft") throw refuse("data_missing", `Back end: draft ${d.request_id} is ${d.status}; it cannot be placed.`);
      const need = R.unmetRule(s, now(), approvalsFor(input.request_id));
      if (need) throw refuse("approval_not_recorded", `Back end: the ${need} approval is not recorded for ${input.request_id}.`);
      const stockAll = store.get("stock");
      const wh = c.warehouse;
      for (const l of s.lines) {
        const rec = stockAll[l.sku] && stockAll[l.sku][wh];
        if (!rec) throw refuse("data_missing", `Back end: no stock record for ${l.sku} at ${wh}.`);
        if (rec.qty < l.qty) throw refuse("stock_short", `Back end: ${l.sku} has ${rec.qty} at ${wh}.`, { sku: l.sku, available: rec.qty });
      }
      const route = s.route === "prepaid" ? "prepaid" : "credit";
      if (route === "credit") {
        const bal = R.balance(c);
        if (bal === null) throw refuse("data_missing", "Back end: the credit record is incomplete.");
        if (s.total > bal) throw refuse("credit_balance_exceeded", "Back end: the order total is above the credit limit balance now.", { balance: bal, total: s.total });
      }
      // Reserve both, then write: nothing is half-done.
      for (const l of s.lines) stockAll[l.sku][wh].qty -= l.qty;
      if (route === "credit") c.outstanding += s.total;
      const id = nextId("DF-SO-", "next_order", 5);
      const declined = d ? null : all("drafts").filter((x) => x.customer === c.id && x.status === "declined" && R.skuKey(x.lines) === R.skuKey(s.lines)).pop();
      const order = { id, request_id: input.request_id, customer: c.id, created_by: staff.id, created_at: now(),
        lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: l.unit_price })), discount_pct: s.discount_pct,
        total: s.total, route, delivery_date: s.delivery_date,
        status: route === "credit" ? "pending_dispatch" : "awaiting_payment", warehouse: wh,
        approvals: approvalsFor(input.request_id).map((a) => a.id), confirmation: input.confirmation_id,
        revised_from: declined ? declined.request_id : null };
      if (d) Object.assign(d, { status: "placed", order_id: id });
      store.set("stock", stockAll);
      store.set("customers", customers);
      save("drafts", drafts);
      store.set("orders", orders.concat([order]));
      const returned = Object.assign({}, order);
      if (faults.create_order === "total_mismatch") returned.total = order.total + 1000;
      return returned;
    }

    // ---------------------------------------------------------------- schedule and count
    function schedule(staff, input) {
      unavailable("schedule_delivery");
      mustBe(staff, ["WH"], "schedule_delivery");
      const orders = all("orders");
      const x = orders.find((y) => y.id === input.order_id);
      if (!x) throw refuse("data_missing", `No order ${input.order_id}.`);
      if (!PLACED.includes(x.status)) throw refuse("order_not_placed", `Back end: ${x.id} is ${x.status}.`);
      const scheds = all("schedules").filter((y) => y.order !== x.id);
      const rec = { order: x.id, date: input.date, warehouse: x.warehouse, by: staff.id, time: now() };
      x.delivery_date = input.date;
      save("schedules", scheds.concat([rec]));
      store.set("orders", orders);
      return { order_id: x.id, customer: x.customer, customer_name: (customer(x.customer) || {}).name, lines: x.lines.map((l) => ({ sku: l.sku, qty: l.qty })),
        date: rec.date, warehouse: rec.warehouse, scheduled_by: rec.by, time: rec.time };  // no prices (MP-07)
    }

    function confirmCount(staff, input) {
      unavailable("confirm_stock_count");
      mustBe(staff, ["WH"], "confirm_stock_count");
      if (staff.tier !== "01") throw refuse("tier_not_permitted", "Back end: only the warehouse manager confirms a count (WP-03).");
      const st = store.get("stock");
      const cur = st[input.sku] && st[input.sku][input.warehouse];
      if (!cur) throw refuse("data_missing", `No stock record for ${input.sku} at ${input.warehouse}.`);
      const rec = { id: seq("stock_counts", "SC-"), sku: input.sku, warehouse: input.warehouse, before_qty: cur.qty, before_updated: cur.updated,
        qty: input.qty, by: staff.id, time: now() };
      st[input.sku][input.warehouse] = { qty: input.qty, updated: now() };
      store.set("stock", st);
      push("stock_counts", rec);
      const c = cat()[input.sku];
      const p = F.mytParts(now());
      const say = `OK. ${R.ucFirst(c.plural)} at ${input.warehouse} ${input.qty === 1 ? "is" : "are"} confirmed at ${unitWords(input.sku, input.qty)}, counted ${F.dayWords(F.mytDate(now()))} ${p.y} at ${F.hhmm(now())}, and Sales can order them again.`;
      return Object.assign({ say }, rec);
    }

    // ---------------------------------------------------------------- the desk's views
    const notificationsFor = (staffId) => all("notifications").filter((n) => n.to === staffId);
    const escalationsFor = (staffId) => all("escalations").filter((e) => e.to === staffId || e.from === staffId);

    return { stock, account, prices, confirm, createOrder, escalate, decide, schedule, confirmCount, lapseDrafts, openDrafts,
      approvalsFor, notificationsFor, escalationsFor, managerNotice, linesWords, unitWords, customer, VIEWS, PLACED };
  }

  return { createBackend, VIEWS, PLACED };
});
