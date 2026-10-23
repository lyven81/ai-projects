/* The PreToolUse hook: one shared hook in front of all seven tools.
 *
 * preToolUse(tool, input, staffId, env) -> { allow, checks, result, ...plan }
 *   staffId: from the signed-in session (request _meta), never from the model (MP-08).
 *   checks:  every check run, in order: { check, clause, pass } (shown under the hood).
 *   result:  when allow is false, the block in the shared result shape: the code, the clause, a
 *            one-line message, and next_step (who acts next; say, the reply written in code for a
 *            refusal about who is asking; basis).
 *   plan:    when allow is true, what the tool does: create_order { mode: "escalate" | "place", summary,
 *            request_id, rule }; decide_escalation { escalation }; schedule_delivery { order }.
 * env: { rules, store (read only here), now }.
 * Approvals count only when recorded for the request (MP-09): the hook finds them by the draft's request
 * ID on its own; nobody cites an approval ID. A rule a manager decides turns into an escalation (MP-16).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"));
  else root.DFPreToolUse = factory(root.DFFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  const DEPT_NAME = { SL: "Sales", FN: "Finance", WH: "Warehouse" };
  const PLACED = ["pending_dispatch", "awaiting_payment"];

  function preToolUse(tool, input, staffId, env) {
    const { rules: R, store, now } = env;
    const V = R.V;
    const checks = [];
    const pass = (check, clause) => { checks.push({ check, clause, pass: true }); };
    const block = (check, code, message, opts) => {
      const o = opts || {};
      checks.push({ check, clause: o.clause || F.CODES[code].clause, pass: false });
      return { allow: false, checks, result: F.fail(tool, code, message, o) };
    };
    const allow = (plan) => Object.assign({ allow: true, checks, result: null }, plan || {});
    const staff = R.who(staffId);
    const get = (n) => store.get(n) || [];
    const cust = (id) => get("customers").find((c) => c.id === id) || null;
    const S = R.say;

    if (!staff) return block("Signed-in staff ID", "department_not_permitted", "No signed-in staff member.", { clause: "MP-08", next_step: "Sign in with a staff ID first." });
    pass(`Signed in as ${staff.id}, ${R.person(staff.id)} (${DEPT_NAME[staff.dept]}, tier ${staff.tier})`, "MP-08");

    // ---------------------------------------------------------------- check_stock
    if (tool === "check_stock") {
      const detail = input.detail || "quantity";
      if (detail === "storage" || detail === "schedule") {
        const what = detail === "storage" ? "where stock is stored" : "the delivery schedule";
        if (staff.dept !== "WH") return block(`${DEPT_NAME[staff.dept]} may see ${what}`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not see ${what}.`,
          { clause: "MP-07", next_step: { text: `${what} is open to Warehouse only (MP-07).`, say: S.noAccess(what, "Warehouse staff"), basis: "MP-07" } });
        pass(`Warehouse may see ${what}`, "MP-07");
      } else {
        if (!["SL", "WH"].includes(staff.dept)) return block(`${DEPT_NAME[staff.dept]} may check stock`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not check stock.`,
          { clause: "WP-02", next_step: { text: "Stock is open to Sales and Warehouse (WP-02, MP-07).", say: S.noAccessPlural("stock figures", "Sales and Warehouse staff"), basis: "MP-07, WP-02" } });
        pass(`${DEPT_NAME[staff.dept]} may check stock`, "WP-02");
      }
      if (!(input.warehouse in R.tables.warehouses))
        return block(`Warehouse ${input.warehouse} exists`, "data_missing", `No warehouse ${input.warehouse}.`, { clause: "WP-01", next_step: "Use WH-A (Shah Alam) or WH-B (Puchong)." });
      pass(`Warehouse ${input.warehouse} exists`, "WP-01");
      if (detail === "schedule") {
        if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return block("Date as YYYY-MM-DD", "data_missing", "Give the date as YYYY-MM-DD.", { clause: "WP-07" });
        pass(`Schedule for ${input.date ? F.dayLabel(input.date) : "the next delivery day"}`, "WP-10");
        return allow();
      }
      const known = new Set(get("catalogue").map((x) => x.sku));
      const bad = (input.skus || []).filter((s) => !known.has(s));
      if (!input.skus || !input.skus.length || bad.length)
        return block("Every SKU is in the catalogue", "data_missing", `Not in the catalogue: ${bad.join(", ") || "no SKU given"}.`, { clause: "SP-02", next_step: "Check the SKUs in the product catalogue." });
      pass("Every SKU is in the catalogue", "SP-02");
      return allow();
    }

    // ---------------------------------------------------------------- shared checks
    const customerExists = (id) => {
      const c = cust(id);
      if (!c) return [null, block(`Customer ${id || "(none)"} exists`, "data_missing", `No customer ${id}.`, { clause: "MP-07", next_step: "Check the customer ID in the customer directory." })];
      pass(`Customer ${id} exists`, "MP-07");
      return [c, null];
    };
    const ownCustomer = (c) => {
      if (staff.dept === "SL" && staff.tier === "02" && c.assigned_to !== staff.id)
        return block(`${c.id} is assigned to ${staff.id}`, "customer_not_assigned", `${c.id} is assigned to ${c.assigned_to}, not ${staff.id}.`,
          { next_step: { text: `Only ${c.assigned_to}, the assigned salesperson, acts on ${c.id} (MP-06).`, person: c.assigned_to, say: S.customerNotAssigned(c.id, c.assigned_to), basis: `MP-06 · ${c.id} is assigned to ${c.assigned_to}` } });
      pass(staff.dept === "SL" && staff.tier === "01" ? "Sales manager: every customer, for supervision" : staff.dept === "SL" ? `${c.id} is assigned to ${staff.id}` : `${DEPT_NAME[staff.dept]} may open ${c.id} (limited fields)`, "MP-06");
      return null;
    };

    // ---------------------------------------------------------------- retrieve_customer_account
    if (tool === "retrieve_customer_account") {
      const VIEW_DEPTS = { location: ["SL", "FN", "WH"], delivery: ["SL", "WH"], credit: ["SL", "FN"], payments: ["FN"] };
      const WHO = { location: "every department", delivery: "Sales and Warehouse staff", credit: "Sales and Finance staff", payments: "Finance staff" };
      const view = input.view;
      if (!VIEW_DEPTS[view]) return block(`Account view ${view || "(none)"} exists`, "data_missing", "Choose the location, delivery, credit or payments view.", { clause: "MP-07", next_step: "Ask again with view location, delivery, credit or payments." });
      if (!VIEW_DEPTS[view].includes(staff.dept))
        return block(`${DEPT_NAME[staff.dept]} may open a customer's ${view}`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not open a customer's ${view}.`,
          { clause: view === "credit" ? "FP-02" : "MP-07", next_step: { text: `A customer's ${view} is open to ${WHO[view]} (MP-07).`, say: S.noAccess(`a customer's ${view === "payments" ? "payment record" : view}`, WHO[view]), basis: view === "credit" ? "FP-02, MP-07" : "MP-07" } });
      pass(`${DEPT_NAME[staff.dept]} may open a customer's ${view}`, view === "credit" ? "FP-02" : "MP-07");
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const a = ownCustomer(c); if (a) return a;
      return allow();
    }

    // ---------------------------------------------------------------- retrieve_customer_prices
    if (tool === "retrieve_customer_prices") {
      if (staff.dept !== "SL") return block(`${DEPT_NAME[staff.dept]} may open prices`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not open prices.`,
        { clause: "MP-07", next_step: { text: "Prices are open to Sales (MP-07).", say: S.noAccessPlural("prices", "Sales staff"), basis: "MP-07" } });
      pass("Sales may open prices", "MP-07");
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const a = ownCustomer(c); if (a) return a;
      return allow();
    }

    // ---------------------------------------------------------------- create_order
    if (tool === "create_order") {
      const c0 = cust(input.customer_id);
      const placer = c0 ? c0.assigned_to : null;
      const cantPlace = () => ({ text: `${placer ? `${placer}, the assigned salesperson, places` : "The assigned salesperson places"} the order (SP-01).`, person: placer,
        say: placer ? S.noAuthority("place orders", [placer], `place an order for ${c0.id}`) : "I'm sorry, you can't place orders. Only the customer's assigned sales executive can place an order.", basis: "SP-01, MP-06" });
      if (staff.dept !== "SL") return block(`${DEPT_NAME[staff.dept]} may place orders`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not place orders.`, { clause: "SP-01", next_step: cantPlace() });
      if (staff.tier !== "02") return block("Tier 02 places orders", "tier_not_permitted", "The sales manager does not place orders; the sales manager decides the team's escalations.", { clause: "SP-01", next_step: cantPlace() });
      pass("Sales Tier 02 places orders", "SP-01");
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const a = ownCustomer(c); if (a) return a;
      const orders = get("orders");
      if (input.request_id) {
        const prior = orders.find((x) => x.request_id === input.request_id);
        if (prior) { pass(`Request ID ${input.request_id} already placed as ${prior.id}: the tool returns it, no second order`, "SP-08"); return allow({ mode: "place", repeat: true, request_id: input.request_id }); }
      }

      // The draft this request belongs to (SP-13): named by request ID, or a request that adds only terms
      // (no lines, or the draft's own lines) joins the customer's open draft; different lines are a new request.
      const open = get("drafts").filter((d) => d.customer === c.id && d.status === "draft" && !R.isLapsed(d, now));
      const hasLines = (input.lines || []).length > 0;
      let draft = null;
      if (input.request_id) draft = open.find((d) => d.request_id === input.request_id) || null;
      else if (!hasLines) {
        if (open.length > 1) return block("One open draft to add the terms to", "draft_ambiguous", `${c.id} has ${open.length} open drafts (${open.map((d) => d.request_id).join(", ")}).`,
          { next_step: { text: `Ask which order the terms are for: ${open.map((d) => d.request_id).join(" or ")}.` } });
        draft = open[0] || null;
        if (!draft) return block("Lines given, or an open draft to add the terms to", "data_missing", `No lines were given and ${c.id} has no open draft.`, { clause: "SP-02", next_step: "Ask the staff member which items and quantities to order." });
      } else draft = open.find((d) => R.lineKey(d.lines) === R.lineKey(input.lines)) || null;
      if (draft) pass(`Joins ${c.id}'s open draft ${draft.request_id}`, "SP-13");
      else pass("A request of its own (no open draft for these lines)", "SP-13");

      // One escalation at a time per draft (MP-16): asking again while one is open sends nothing new.
      const openEsc = draft && get("escalations").find((x) => x.request_id === draft.request_id && x.status === "open");
      if (openEsc) return block(`No escalation open on ${draft.request_id}`, "escalation_open", `${openEsc.id} on ${draft.request_id} is still with ${openEsc.to}.`,
        { next_step: { text: `${openEsc.to} decides ${openEsc.id}; nothing new was sent.`, person: openEsc.to, say: S.stillWith(openEsc.to), basis: `MP-16 · ${openEsc.id} open since ${F.hhmm(openEsc.sent_at)}` } });
      if (draft) pass(`No escalation open on ${draft.request_id}`, "MP-16");

      // The terms: a confirmation carries the summary it confirmed; otherwise the draft's terms with this request's on top.
      const conf = input.confirmation_id ? get("confirmations").find((x) => x.id === input.confirmation_id) : null;
      const base = draft ? { lines: draft.lines, discount_pct: draft.discount_pct, payment_route: draft.payment_route, delivery_date: draft.delivery_date } : {};
      const pick = (k) => (input[k] !== undefined && input[k] !== null && input[k] !== "" ? input[k] : base[k]);
      const t = conf && !hasLines && input.discount_pct === undefined && !input.payment_route && !input.delivery_date
        ? { lines: conf.lines.map((l) => ({ sku: l.sku, qty: l.qty })), discount_pct: conf.discount_pct, payment_route: conf.route, delivery_date: conf.delivery_date }
        : { lines: hasLines ? input.lines : base.lines, discount_pct: pick("discount_pct") || 0, payment_route: pick("payment_route") || "credit", delivery_date: pick("delivery_date") || R.standardDelivery(now) };
      const known = new Set(get("catalogue").map((x) => x.sku));
      if (!t.lines || !t.lines.length || t.lines.some((l) => !known.has(l.sku) || !Number.isInteger(l.qty) || l.qty <= 0))
        return block("Lines: catalogue SKUs in whole selling units", "data_missing", "Every line needs a catalogue SKU and a whole quantity.", { clause: "SP-02", next_step: "Check the SKUs and quantities with the staff member." });
      pass("Lines: catalogue SKUs in whole selling units", "SP-02");

      const s = R.summary(c.id, store.get("price_lists")[c.id] || {}, t.lines, t.discount_pct, t.payment_route, t.delivery_date, now);
      if (s.missing_prices.length) return block("Every line is on the customer's price list", "price_missing", `${s.missing_prices.join(", ")} has no price on ${c.id}'s list.`,
        { data: { skus: s.missing_prices }, next_step: { text: `${R.person("SL-01-01")} sets a price for ${s.missing_prices.join(", ")} on ${c.id}'s list first (SP-04).`, person: "SL-01-01", basis: "SP-04" } });
      pass("Every line is on the customer's price list", "SP-04");
      const promos = s.lines.filter((l) => l.promotion);
      if (promos.length) pass(`Promotion price by date: ${promos.map((l) => `${l.sku} ${l.promotion}`).join(", ")}; a published price, no approval`, "SP-05, SP-12");
      if (s.discount_pct > V.max_discount_pct) return block(`Discount at most ${V.max_discount_pct}%`, "discount_above_maximum", `${s.discount_pct}% is above the ${V.max_discount_pct}% maximum.`,
        { next_step: { text: `Nothing above ${V.max_discount_pct}% is allowed, with any approval (SP-06).`, basis: "SP-06" } });

      const stockAll = store.get("stock");
      const wh = c.warehouse;
      const ages = [];
      for (const l of s.lines) {
        const r = stockAll[l.sku] && stockAll[l.sku][wh];
        if (!r) return block(`Stock record for ${l.sku} at ${wh}`, "data_missing", `No stock record for ${l.sku} at ${wh}.`, { clause: "WP-02", next_step: { text: `${R.person("WH-01-01")} checks the record.`, person: "WH-01-01" } });
        const age = Math.floor((now - r.updated) / 3600);
        if (age > V.stock_max_age_hours) return block(`${l.sku} stock figure within ${V.stock_max_age_hours} hours`, "stock_out_of_date", `The ${l.sku} figure at ${wh} is ${age} hours old.`,
          { data: { sku: l.sku, warehouse: wh, age_hours: age }, next_step: { text: `${R.person("WH-01-01")} confirms the ${l.sku} figure at ${wh} by a count first (WP-03).`, person: "WH-01-01", basis: `WP-03 · ${l.sku} at ${wh}, updated ${age} hours ago` } });
        pass(`${l.sku}: figure ${age} hours old`, "WP-03");
        if (r.qty < l.qty) {
          const less = s.lines.map((x) => (x.sku === l.sku ? { sku: x.sku, qty: r.qty } : { sku: x.sku, qty: x.qty })).filter((x) => x.qty > 0);
          const s2 = R.summary(c.id, store.get("price_lists")[c.id] || {}, less, s.discount_pct, s.route, s.delivery_date, now);
          return block(`${l.sku}: ${l.qty} asked, ${r.qty} available at ${wh}`, "stock_short", `${l.sku} has ${r.qty} at ${wh}; the order asks for ${l.qty}. No back orders.`,
            { data: { sku: l.sku, asked: l.qty, available: r.qty, warehouse: wh, summary: shown(s2, null) },
              next_step: { text: `Only ${r.qty} of ${l.sku} are available at ${wh}. Ordering ${r.qty} is the salesperson's call, with a new confirmation (WP-05).`, basis: `WP-05 · ${l.sku} at ${wh}, ${r.qty} available` } });
        }
        pass(`${l.sku}: ${l.qty} of ${r.qty} at ${wh}`, "WP-05");
        ages.push(`${wh} ${r.qty} ${(get("catalogue").find((x) => x.sku === l.sku) || {}).unit}${r.qty === 1 ? "" : "s"}, updated ${age} hours ago`);
      }
      if (s.route === "credit") {
        const bal = R.balance(c);
        if (bal === null) return block("Credit record complete", "data_missing", `${c.id}'s credit record is incomplete.`, { clause: "FP-01", next_step: { text: `${R.person("FN-01-01")} completes the credit record (MP-13).`, person: "FN-01-01" } });
        if (s.total > bal) return block(`Credit route: total within the balance ${F.rm(bal)}`, "credit_balance_exceeded", `${F.rm(s.total)} is above ${c.id}'s credit limit balance of ${F.rm(bal)}; no approval overrides this.`,
          { clause: "FP-03, FP-05", data: { total: F.rm(s.total), balance: F.rm(bal) }, next_step: { text: "Options (FP-05): a smaller order, or the prepaid route with the finance manager's approval.", basis: `FP-03 · ${c.id} credit ${F.rm(bal)} available` } });
        pass(`Credit route: ${F.rm(s.total)} within the balance ${F.rm(bal)}`, "FP-03");
      } else pass("Prepaid route: no credit used", "FP-04");
      const since = now - V.duplicate_window_min * 60;
      const dup = orders.find((o) => o.customer === c.id && o.created_at >= since && R.lineKey(o.lines) === R.lineKey(s.lines));
      if (dup) return block(`Not the same order within ${V.duplicate_window_min} minutes`, "likely_duplicate", `${dup.id} with the same lines was placed for ${c.id} ${Math.round((now - dup.created_at) / 60)} minutes ago.`,
        { next_step: { text: `Ask whether this is a second order; ${dup.id} already covers these lines (SP-09).`, basis: `SP-09 · ${dup.id}` } });
      pass(`Not the same order within ${V.duplicate_window_min} minutes`, "SP-09");

      // The approvals recorded for this draft's request ID, found by the hook on its own (MP-05, MP-09).
      const recorded = draft ? get("approvals").filter((x) => x.request_id === draft.request_id) : [];
      for (const r of recorded) {
        const need = R.tables.approval_types[r.type].department, ap = R.who(r.approver);
        if (!ap || ap.dept !== need || ap.tier !== "01") return block(`Approval ${r.id} from the ${DEPT_NAME[need]} manager`, "approval_wrong_department", `${r.id} was recorded by ${r.approver}; only ${R.managerOf(need)} decides it.`, { next_step: { text: `${R.managerOf(need)} decides it (MP-05).`, person: R.managerOf(need) } });
        pass(`Approval ${r.id}: ${R.tables.approval_types[r.type].label}, recorded by ${r.approver} for ${r.request_id}`, "MP-05, MP-09");
      }
      const rule = R.unmetRule(s, now, recorded);
      if (rule) {
        const to = R.managerOf(R.tables.approval_types[rule].department);
        checks.push({ check: `${R.tables.approval_types[rule].label}: no recorded approval for this request, so it goes to ${to}`, clause: `${R.RULE_CLAUSE[rule]}, MP-16`, pass: true });
        return allow({ mode: "escalate", rule, to, summary: s, request_id: draft ? draft.request_id : null });
      }
      pass(s.discount_pct || s.total < V.minimum_order_sen || !R.withinTerms(s.delivery_date, now) || s.route === "prepaid" ? "Every approval the request needs is recorded" : "No approval needed", "MP-09");

      const ok = conf && conf.staff === staff.id && R.sameSummary(conf, s) && (!draft || conf.request_id === draft.request_id) && !get("orders").some((x) => x.confirmation === conf.id);
      if (!ok) return block("Staff confirmation matches the full summary", "confirmation_missing", conf ? `${conf.id} does not match this summary.` : "No staff confirmation for this summary.",
        { data: { summary: shown(s, draft ? draft.request_id : null) },
          next_step: { text: "The summary waits on the staff page; the staff member confirms it, then the order is placed with the confirmation ID and request ID shown.", person: staff.id, basis: `SP-07 · ${c.id} price list · ${ages.join("; ")}` } });
      pass(`Staff confirmation ${conf.id} matches the full summary`, "SP-07");
      return allow({ mode: "place", summary: s, request_id: conf.request_id, confirmation_id: conf.id, approvals: recorded.map((r) => r.id) });
    }

    // ---------------------------------------------------------------- decide_escalation
    if (tool === "decide_escalation") {
      const all = get("escalations");
      const byId = input.escalation_id ? all.find((x) => x.id === input.escalation_id) : null;
      const type = byId ? byId.type : input.type;
      if (!R.tables.approval_types[type]) return block(`Escalation type ${type || "(none)"} exists`, "data_missing", "Name the decision: discount, minimum_order, delivery_exception or prepaid.", { clause: "MP-16" });
      const owner = R.managerOf(R.tables.approval_types[type].department);
      const words = S.decisionRule(type);
      if (staff.tier !== "01") return block("Tier 01 manager decides escalations", "tier_not_permitted", `${staff.id} is Tier 02; only ${owner} decides this.`,
        { clause: `${R.RULE_CLAUSE[type]}, MP-05`, next_step: { text: `${owner} decides it (MP-05).`, person: owner, say: S.noAuthority(words.cant, [owner], words.canDo), basis: `${R.RULE_CLAUSE[type]}, MP-05` } });
      pass("Tier 01 manager", "MP-03");
      if (staff.id !== owner) return block(`${R.tables.approval_types[type].label} is ${DEPT_NAME[staff.dept]}'s decision`, "approval_wrong_department", `${R.tables.approval_types[type].label} is decided by ${owner}.`,
        { next_step: { text: `${owner} decides it (MP-05).`, person: owner, say: S.noAuthority(words.cant, [owner], words.canDo), basis: `${R.RULE_CLAUSE[type]}, MP-05` } });
      pass(`${R.tables.approval_types[type].label} is in ${DEPT_NAME[staff.dept]}'s domain`, "MP-05");
      if (!["approve", "decline"].includes(input.decision)) return block("Decision is approve or decline", "data_missing", "Say approve or decline.", { clause: "MP-16" });
      const mine = byId ? [byId] : all.filter((x) => x.to === staff.id && x.type === type && (!input.customer_id || x.customer === input.customer_id));
      const openOnes = mine.filter((x) => x.status === "open");
      if (!openOnes.length) {
        const done = mine.filter((x) => x.status === "approved" || x.status === "declined").pop();
        if (done) return block("An open escalation to decide", "escalation_already_decided", `${done.id} was already ${done.status} by ${done.decided_by}.`,
          { next_step: { text: "Nothing changed.", say: S.alreadyDecided(done), basis: `MP-09 · ${done.id}${done.approval_id ? ` · ${done.approval_id}` : ""}` } });
        return block("An open escalation to decide", "escalation_not_found", `No open ${type} escalation for ${input.customer_id || "this customer"} is addressed to ${staff.id}.`,
          { next_step: { text: "Nothing changed.", say: S.nothingWaiting(input.customer_id || "this customer", type), basis: "MP-16" } });
      }
      if (openOnes.length > 1) return block("One open escalation matches", "escalation_ambiguous", `${openOnes.length} open escalations match: ${openOnes.map((x) => x.id).join(", ")}.`,
        { next_step: { text: `Ask which request: ${openOnes.map((x) => x.request_id).join(" or ")}.` } });
      const esc = openOnes[0];
      if (esc.to !== staff.id) return block(`${esc.id} is addressed to ${staff.id}`, "approval_wrong_department", `${esc.id} is addressed to ${esc.to}.`, { next_step: { text: `${esc.to} decides it.`, person: esc.to } });
      pass(`${esc.id} for ${esc.customer} (${esc.request_id}) is open and addressed to ${staff.id}`, "MP-16");
      if (type === "discount" && esc.decision_data.discount_pct > V.max_discount_pct) return block(`Discount at most ${V.max_discount_pct}%`, "discount_above_maximum", "Above the maximum.", {});
      return allow({ escalation: esc });
    }

    // ---------------------------------------------------------------- schedule_delivery
    if (tool === "schedule_delivery") {
      const whIds = R.deptStaff("WH");
      if (staff.dept !== "WH") return block(`${DEPT_NAME[staff.dept]} may schedule deliveries`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not schedule deliveries.`,
        { clause: "WP-10", next_step: { text: "Warehouse schedules deliveries (WP-10).", person: "WH-02-01", say: S.noAuthority("schedule deliveries", ["WH-02-01", "WH-01-01"], "schedule a delivery"), basis: "WP-10" } });
      pass("Warehouse schedules deliveries", "WP-10");
      const orders = get("orders");
      let order = null;
      if (input.order_id) order = orders.find((x) => x.id === input.order_id) || null;
      else {
        const cands = orders.filter((x) => x.customer === input.customer_id && PLACED.includes(x.status) && !get("schedules").some((y) => y.order === x.id));
        if (cands.length > 1) return block("One placed order for the customer", "order_ambiguous", `${input.customer_id} has ${cands.length} placed orders: ${cands.map((x) => x.id).join(", ")}.`, { next_step: { text: `Ask which order: ${cands.map((x) => x.id).join(" or ")}.` } });
        order = cands[0] || null;
      }
      if (!order) return block("The order exists", "data_missing", `No placed order found${input.order_id ? ` ${input.order_id}` : ` for ${input.customer_id}`}.`, { clause: "WP-10", next_step: "Check the order ID." });
      pass(`Order ${order.id} exists`, "WP-10");
      if (!PLACED.includes(order.status)) return block(`${order.id} is placed`, "order_not_placed", `${order.id} is ${order.status.replace(/_/g, " ")}.`,
        { next_step: { text: `${order.created_by} places the order first.`, person: order.created_by } });
      pass(`${order.id} is placed (${order.status.replace(/_/g, " ")})`, "WP-10");
      const date = input.date || order.delivery_date;
      const approved = get("approvals").some((x) => x.type === "delivery_exception" && x.request_id === order.request_id && x.value === date);
      if (!(date === order.delivery_date || R.withinTerms(date, now) || approved))
        return block(`Delivery on ${date} within the terms`, "delivery_outside_terms", `${date} is outside the delivery terms for ${order.id}.`,
          { next_step: { text: `${R.person("WH-01-01")} decides a date outside the terms (WP-07).`, person: "WH-01-01", basis: "WP-07" } });
      pass(date === order.delivery_date ? `${F.dayLabel(date)}: the order's own delivery date` : `${F.dayLabel(date)} within the terms`, "WP-07, WP-09");
      return allow({ order, date, whIds });
    }

    // ---------------------------------------------------------------- confirm_stock_count
    if (tool === "confirm_stock_count") {
      const say = S.noAuthority("confirm stock counts", ["WH-01-01"], "confirm a count");
      if (staff.dept !== "WH") return block(`${DEPT_NAME[staff.dept]} may confirm stock counts`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not confirm stock counts.`,
        { clause: "WP-03", next_step: { text: "The warehouse manager confirms counts (WP-03).", person: "WH-01-01", say, basis: "WP-03, MP-07" } });
      if (staff.tier !== "01") return block("The warehouse manager confirms counts", "tier_not_permitted", `${staff.id} is Tier 02; only WH-01-01 confirms a count.`,
        { clause: "WP-03", next_step: { text: "The warehouse manager confirms counts (WP-03).", person: "WH-01-01", say, basis: "WP-03, MP-05" } });
      pass("The warehouse manager confirms counts", "WP-03");
      const st = store.get("stock");
      if (!(st[input.sku] && st[input.sku][input.warehouse])) return block(`Stock record for ${input.sku} at ${input.warehouse}`, "data_missing", `No stock record for ${input.sku} at ${input.warehouse}.`, { clause: "WP-02" });
      pass(`Stock record for ${input.sku} at ${input.warehouse}`, "WP-02");
      if (!Number.isInteger(input.qty) || input.qty < 0) return block("A whole counted quantity", "data_missing", "Give the counted quantity as a whole number.", { clause: "SP-02" });
      pass(`Counted quantity ${input.qty}`, "WP-03");
      return allow();
    }

    return block(`Tool ${tool} exists`, "data_missing", `No tool named ${tool}.`, { clause: "MP-10" });
  }

  /** The order summary the staff page shows with Confirm summary (amounts in RM). */
  function shown(s, requestId) {
    return { customer: s.customer, request_id: requestId, lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: F.rm(l.unit_price), line_total: F.rm(l.line_total), promotion: l.promotion })),
      subtotal: F.rm(s.subtotal), discount_pct: s.discount_pct, discount: F.rm(s.discount), total: F.rm(s.total), payment_route: s.route, delivery_date: s.delivery_date };
  }

  return { preToolUse, shown };
});
