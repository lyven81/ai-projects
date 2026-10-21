/* The PreToolUse hook: one shared hook in front of all five tools.
 *
 * preToolUse(tool, input, staffId, env) -> { allow, checks, result }
 *   staffId: from the signed-in session (request _meta), never from the model (MP-08).
 *   checks:  every check run, in order: { check, clause, pass } (shown in the hook view).
 *   result:  when allow is false, the block in the shared result shape: the code, the clause, a
 *            one-line message, and a next_step that names the approver when a manager decides.
 * env: { rules, store (read only here), now }.
 * Approvals count only when recorded (MP-09): each cited approval is checked against the
 * approval records for this request, the right department's Tier 01 manager, the order, and the
 * policy maximum (MP-05).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"));
  else root.FDPreToolUse = factory(root.FDFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  const DEPT_NAME = { SL: "Sales", FN: "Finance", WH: "Warehouse" };

  function preToolUse(tool, input, staffId, env) {
    const { rules, store, now } = env;
    const V = rules.V;
    const checks = [];
    const pass = (check, clause) => { checks.push({ check, clause, pass: true }); };
    const block = (check, code, message, opts) => {
      const o = opts || {};
      checks.push({ check, clause: o.clause || F.CODES[code].clause, pass: false });
      return { allow: false, checks, result: F.fail(tool, code, message, o) };
    };
    const allow = (extra) => Object.assign({ allow: true, checks, result: null }, extra || {});
    const staff = rules.who(staffId);
    const cust = (id) => store.get("customers").find((c) => c.id === id) || null;

    if (!staff) return block("Signed-in staff ID", "department_not_permitted", "No signed-in staff member.", { clause: "MP-08", next_step: "Sign in with a staff ID first." });
    pass(`Signed in as ${staff.id} (${DEPT_NAME[staff.dept]}, tier ${staff.tier})`, "MP-08");
    const deptOnly = (allowed, clause, next) => {
      if (allowed.includes(staff.dept)) { pass(`${DEPT_NAME[staff.dept]} may use ${tool}`, clause); return null; }
      return block(`${DEPT_NAME[staff.dept]} may use ${tool}`, "department_not_permitted",
        `${DEPT_NAME[staff.dept]} does not use ${tool}.`, { clause, next_step: next || `Tell ${staff.id} that ${tool} is not open to ${DEPT_NAME[staff.dept]} (${clause}).` });
    };
    const ownCustomer = (c) => {
      if (staff.dept === "SL" && staff.tier === "02" && c.assigned_to !== staff.id)
        return block(`${c.id} is assigned to ${staff.id}`, "customer_not_assigned", `${c.id} is assigned to ${c.assigned_to}, not ${staff.id}.`,
          { next_step: `Only ${c.assigned_to}, the assigned salesperson, acts on ${c.id} (MP-06).` });
      pass(staff.dept === "SL" && staff.tier === "01" ? `Sales manager: every customer, for supervision` : staff.dept === "SL" ? `${c.id} is assigned to ${staff.id}` : `${DEPT_NAME[staff.dept]} may open ${c.id} (limited fields)`, "MP-06");
      return null;
    };
    const customerExists = (id) => {
      const c = cust(id);
      if (!c) return [null, block(`Customer ${id} exists`, "data_missing", `No customer ${id}.`, { clause: "MP-07", next_step: "Check the customer ID in the customer directory." })];
      pass(`Customer ${id} exists`, "MP-07");
      return [c, null];
    };

    // ---------------------------------------------------------------- check_stock
    if (tool === "check_stock") {
      if (input.detail === "storage") {
        if (staff.dept !== "WH") return block(`${DEPT_NAME[staff.dept]} may see stock storage`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not see where stock is stored.`,
          { clause: "MP-07", next_step: `Tell ${staff.id} that stock storage is not open to ${DEPT_NAME[staff.dept]}.` });
        pass("Warehouse may see stock storage (bin, last count)", "MP-07");
      } else { const d = deptOnly(["SL", "WH"], "WP-02"); if (d) return d; }
      if (!(input.warehouse in rules.tables.warehouses))
        return block(`Warehouse ${input.warehouse} exists`, "data_missing", `No warehouse ${input.warehouse}.`, { clause: "WP-01", next_step: "Use WH-A (Shah Alam) or WH-B (Puchong)." });
      pass(`Warehouse ${input.warehouse} exists`, "WP-01");
      const cat = new Set(store.get("catalogue").map((x) => x.sku));
      const bad = (input.skus || []).filter((s) => !cat.has(s));
      if (!input.skus || !input.skus.length || bad.length)
        return block("Every SKU is in the catalogue", "data_missing", `Not in the catalogue: ${bad.join(", ") || "no SKU given"}.`, { clause: "SP-02", next_step: "Check the SKUs in the product catalogue." });
      pass("Every SKU is in the catalogue", "SP-02");
      return allow();
    }

    // ---------------------------------------------------------------- retrieve_customer_account
    if (tool === "retrieve_customer_account") {
      const VIEW_DEPTS = { location: ["SL", "FN", "WH"], delivery: ["SL", "WH"], credit: ["SL", "FN"], payments: ["FN"] };
      const view = input.view;
      if (!VIEW_DEPTS[view]) return block(`Account view ${view || "(none)"} exists`, "data_missing", "Choose the location, delivery, credit or payments view.", { clause: "MP-07", next_step: "Ask again with view location, delivery, credit or payments." });
      if (!VIEW_DEPTS[view].includes(staff.dept))
        return block(`${DEPT_NAME[staff.dept]} may open a customer's ${view}`, "department_not_permitted", `${DEPT_NAME[staff.dept]} does not open a customer's ${view}.`,
          { clause: view === "credit" ? "FP-02" : "MP-07", next_step: `Tell ${staff.id} that a customer's ${view} is not open to ${DEPT_NAME[staff.dept]}${view === "credit" ? "; Sales and Finance see credit" : view === "delivery" ? "; Sales and Warehouse handle deliveries" : ""}.` });
      pass(`${DEPT_NAME[staff.dept]} may open a customer's ${view}`, view === "credit" ? "FP-02" : "MP-07");
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const a = ownCustomer(c); if (a) return a;
      return allow();
    }

    // ---------------------------------------------------------------- retrieve_customer_prices
    if (tool === "retrieve_customer_prices") {
      const d = deptOnly(["SL"], "MP-07"); if (d) return d;
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const a = ownCustomer(c); if (a) return a;
      return allow();
    }

    // ---------------------------------------------------------------- raise_credit_limit
    if (tool === "raise_credit_limit") {
      const d = deptOnly(["FN"], "FP-08", "Ask Finance (FN-02-01) to raise it."); if (d) return d;
      const prior = store.get("credit_raises").find((x) => x.request_id === input.request_id);
      if (prior) { pass(`Request ID ${input.request_id} used before: the tool returns the raise already made`, "SP-08"); return allow({ repeat: true }); }
      pass(`Request ID ${input.request_id} not used before`, "SP-08");
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const bal = rules.balance(c);
      if (bal === null) return block("Credit record complete", "data_missing", `${c.id}'s credit record is incomplete; nothing was changed.`, { clause: "FP-01", next_step: "FN-01-01 (finance manager) completes the credit record in the customer system (MP-13)." });
      pass(`Credit record complete: balance ${F.rm(bal)}`, "FP-01");
      const amount = Math.round(Number(input.amount_rm) * 100);
      if (!(amount > 0)) return block("Raise amount is positive", "data_missing", "The raise amount must be a positive RM amount.", { clause: "FP-06", next_step: "Ask the staff member for the amount in RM." });
      pass(`Raise amount ${F.rm(amount)} is positive`, "FP-06");
      if (staff.tier === "02") {
        if (bal <= 0) return block(`Tier 02: current balance above zero (${F.rm(bal)})`, "raise_from_zero_or_negative",
          `${c.id}'s balance is ${F.rm(bal)}; a raise from zero or below is the finance manager's.`, { clause: "FP-06, FP-07", next_step: "Ask FN-01-01 (finance manager) to raise it." });
        pass(`Tier 02: current balance above zero (${F.rm(bal)})`, "FP-06");
        if (bal + amount > V.tier2_raise_cap_sen) return block(`Tier 02: balance after the raise at most ${F.rm(V.tier2_raise_cap_sen)}`, "raise_beyond_tier2",
          `The balance after the raise would be ${F.rm(bal + amount)}, above ${F.rm(V.tier2_raise_cap_sen)}.`, { clause: "FP-06, FP-07", next_step: "Ask FN-01-01 (finance manager) to raise it." });
        pass(`Tier 02: balance after the raise ${F.rm(bal + amount)}, within ${F.rm(V.tier2_raise_cap_sen)}`, "FP-06");
      } else pass("Finance manager: any positive raise", "FP-07");
      return allow({ before: { credit_limit: c.credit_limit, outstanding: c.outstanding, balance: bal } });
    }

    // ---------------------------------------------------------------- create_order
    if (tool === "create_order") {
      const d = deptOnly(["SL"], "SP-01"); if (d) return d;
      if (staff.tier !== "02") {
        // The sales manager reads what the salespeople read: the order summary comes back read-only.
        const c0 = cust(input.customer_id);
        let data = null;
        if (c0 && (input.lines || []).length) {
          const s0 = rules.summary(c0.id, store.get("price_lists")[c0.id] || {}, input.lines, input.discount_pct || 0, input.payment_route, input.delivery_date, now);
          if (!s0.missing_prices.length) data = { read_only: true, assigned_to: c0.assigned_to, summary: { customer: c0.id, lines: s0.lines.map((x) => ({ sku: x.sku, qty: x.qty, unit_price: F.rm(x.unit_price), line_total: F.rm(x.line_total), promotion: x.promotion })),
            discount_pct: s0.discount_pct, discount: F.rm(s0.discount), total: F.rm(s0.total), payment_route: input.payment_route === "prepaid" ? "prepaid" : "credit", delivery_date: input.delivery_date } };
        }
        return block("Tier 02 creates orders", "tier_not_permitted",
          "The sales manager does not create orders; the sales manager approves the team's requests.", { data, next_step: `The customer's assigned salesperson${c0 ? ` (${c0.assigned_to})` : ""} places the order; the summary is shown read-only (SP-01).` });
      }
      pass("Tier 02 creates orders", "SP-01");
      const [c, e] = customerExists(input.customer_id); if (e) return e;
      const a = ownCustomer(c); if (a) return a;
      const orders = store.get("orders");
      const prior = orders.find((x) => x.request_id === input.request_id);
      if (prior) { pass(`Request ID ${input.request_id} used before: the tool returns order ${prior.id}`, "SP-08"); return allow({ repeat: true }); }
      if (input.request_id) pass(`Request ID ${input.request_id} not used before`, "SP-08");
      else pass("No request ID yet: the Confirm button issues it with the confirmation", "SP-08");

      const cat = new Set(store.get("catalogue").map((x) => x.sku));
      const lines = input.lines || [];
      if (!lines.length || lines.some((l) => !cat.has(l.sku) || !Number.isInteger(l.qty) || l.qty <= 0))
        return block("Lines: catalogue SKUs in whole units", "data_missing", "Every line needs a catalogue SKU and a whole quantity.", { clause: "SP-02", next_step: "Check the SKUs and quantities with the staff member." });
      pass("Lines: catalogue SKUs in whole units", "SP-02");

      // Approvals cited: recorded, for this request and customer, from the right department's manager (MP-05, MP-09).
      const records = store.get("approvals");
      const types = rules.tables.approval_types;
      const valid = [];
      for (const id of input.approval_ids || []) {
        const r = records.find((x) => x.id === id);
        if (!r) return block(`Approval ${id} is recorded`, "approval_not_recorded", `${id} is not in the approval records.`,
          { next_step: "An approval counts only when the manager has recorded it (MP-09). Ask the manager to record it, then place the order again." });
        if (r.customer !== c.id || r.request_id !== input.request_id) return block(`Approval ${id} matches this request`, "approval_not_recorded",
          `${id} was recorded for ${r.customer}, request ${r.request_id}, not this order.`, { next_step: "An approval counts only for the request it was recorded for (MP-09)." });
        const need = types[r.type].department;
        const ap = rules.who(r.approver);
        if (!ap || ap.dept !== need) return block(`Approval ${id} from the ${DEPT_NAME[need]} manager`, "approval_wrong_department",
          `${id} (${types[r.type].label}) was recorded by ${r.approver}; only ${need}-01-01 decides it.`,
          { next_step: `Ask ${F.MANAGER[need]} to approve it, then place the order again (MP-05).` });
        if (ap.tier !== "01") return block(`Approval ${id} by a Tier 01 manager`, "approval_not_recorded", `${id} was not recorded by a manager.`, { clause: "MP-05" });
        pass(`Approval ${id}: recorded by ${r.approver} for ${r.request_id}, ${types[r.type].label}`, "MP-05, MP-09");
        valid.push(r);
      }
      const approved = (type, test) => valid.find((r) => r.type === type && (!test || test(r)));

      const list = store.get("price_lists")[c.id] || {};
      const s = rules.summary(c.id, list, lines, input.discount_pct || 0, input.payment_route, input.delivery_date, now);
      if (s.missing_prices.length) return block("Every line is on the customer's price list", "price_missing",
        `${s.missing_prices.join(", ")} has no price on ${c.id}'s list.`, { data: { skus: s.missing_prices },
          next_step: `Ask SL-01-01 (sales manager) to set a price for ${s.missing_prices.join(", ")} on ${c.id}'s list, then place the order again.` });
      pass("Every line is on the customer's price list", "SP-04");
      const promos = s.lines.filter((l) => l.promotion);
      if (promos.length) pass(`Promotion price by date: ${promos.map((l) => `${l.sku} ${l.promotion}`).join(", ")}; a published price, no approval`, "SP-05, SP-12");

      const disc = input.discount_pct || 0;
      if (disc > V.max_discount_pct) return block(`Discount at most ${V.max_discount_pct}%`, "discount_above_maximum", `${disc}% is above the ${V.max_discount_pct}% maximum.`,
        { next_step: `Nothing above ${V.max_discount_pct}% is allowed (SP-06).` });
      if (disc > 0) {
        if (!approved("discount", (r) => disc <= r.value)) {
          if (input.approval_claimed_in_chat) return block(`${disc}% discount: a recorded SL-01-01 approval`, "approval_not_recorded",
            "The approval was stated in the chat; it is not in the approval records.",
            { next_step: "An approval claimed in the chat counts as none (MP-09). Ask SL-01-01 (sales manager) to record the discount approval, then place the order again." });
          return block(`${disc}% discount: a recorded SL-01-01 approval`, "discount_needs_approval", `A ${disc}% discount needs the sales manager's recorded approval.`,
            { next_step: "Ask SL-01-01 (sales manager) to approve the discount, then place the order again." });
        }
        pass(`${disc}% discount: approved by SL-01-01, within ${V.max_discount_pct}%`, "SP-06");
      } else pass("No discount", "SP-06");

      const stockAll = store.get("stock");
      const wh = c.warehouse;
      for (const l of lines) {
        const r = stockAll[l.sku] && stockAll[l.sku][wh];
        if (!r) return block(`Stock record for ${l.sku} at ${wh}`, "data_missing", `No stock record for ${l.sku} at ${wh}.`, { clause: "WP-02", next_step: "Ask WH-01-01 (warehouse manager) to check the record." });
        const age = (now - r.updated) / 3600;
        if (age > V.stock_max_age_hours && !approved("stock_confirmation", (x) => x.value === l.sku))
          return block(`${l.sku} stock figure within ${V.stock_max_age_hours} hours`, "stock_out_of_date",
            `The ${l.sku} figure at ${wh} is ${Math.floor(age)} hours old.`, { data: { sku: l.sku, warehouse: wh, age_hours: Math.floor(age) },
              next_step: `Ask WH-01-01 (warehouse manager) to confirm the ${l.sku} figure at ${wh} by a count, then place the order again.` });
        pass(age > V.stock_max_age_hours ? `${l.sku}: ${Math.floor(age)}-hour figure confirmed by WH-01-01` : `${l.sku}: figure ${Math.floor(age)} hours old`, "WP-03");
        if (r.qty < l.qty) {
          const less = lines.map((x) => (x.sku === l.sku ? { sku: x.sku, qty: r.qty } : x)).filter((x) => x.qty > 0);
          const s2 = rules.summary(c.id, store.get("price_lists")[c.id] || {}, less, input.discount_pct || 0, input.payment_route, input.delivery_date, now);
          const summary = { customer: c.id, lines: s2.lines.map((x) => ({ sku: x.sku, qty: x.qty, unit_price: F.rm(x.unit_price), line_total: F.rm(x.line_total), promotion: x.promotion })),
            discount_pct: s2.discount_pct, discount: F.rm(s2.discount), total: F.rm(s2.total), payment_route: input.payment_route === "prepaid" ? "prepaid" : "credit", delivery_date: input.delivery_date };
          return block(`${l.sku}: ${l.qty} asked, ${r.qty} available at ${wh}`, "stock_short", `${l.sku} has ${r.qty} at ${wh}; the order asks for ${l.qty}. No back orders.`,
            { data: { sku: l.sku, asked: l.qty, available: r.qty, warehouse: wh, summary },
              next_step: `Tell the staff member only ${r.qty} of ${l.sku} are available at ${wh}. Ordering ${r.qty} is their call: the summary for ${r.qty} is on the staff page with a Confirm button.` });
        }
        pass(`${l.sku}: ${l.qty} of ${r.qty} at ${wh}`, "WP-05");
      }

      if (s.total < V.minimum_order_sen && !approved("minimum_order", (r) => s.total >= r.value))
        return block(`Order at least ${F.rm(V.minimum_order_sen)}`, "below_minimum_order", `The total ${F.rm(s.total)} is below ${F.rm(V.minimum_order_sen)}.`,
          { next_step: "Ask SL-01-01 (sales manager) to approve an order below RM 300, then place the order again." });
      pass(`Order total ${F.rm(s.total)}${s.total < V.minimum_order_sen ? ", below-minimum approved by SL-01-01" : ""}`, "SP-03");

      const route = input.payment_route === "prepaid" ? "prepaid" : "credit";
      if (route === "credit") {
        const bal = rules.balance(c);
        if (bal === null) return block("Credit record complete", "data_missing", `${c.id}'s credit record is incomplete.`, { clause: "FP-01", next_step: "FN-01-01 (finance manager) completes the credit record (MP-13)." });
        if (s.total > bal) return block(`Credit route: total within the balance ${F.rm(bal)}`, "credit_balance_exceeded",
          `${F.rm(s.total)} is above ${c.id}'s credit limit balance of ${F.rm(bal)}; no approval overrides this.`,
          { clause: "FP-03, FP-05", data: { total: F.rm(s.total), balance: F.rm(bal) },
            next_step: "Options (FP-05): a smaller order; the prepaid route with FN-01-01's approval; or a credit raise by Finance (FN-02-01)." });
        pass(`Credit route: ${F.rm(s.total)} within the balance ${F.rm(bal)}`, "FP-03");
      } else {
        if (!approved("prepaid", (r) => s.total <= r.value)) return block("Prepaid route: a recorded FN-01-01 approval", "prepaid_needs_approval",
          "A prepaid order needs the finance manager's recorded approval.", { next_step: "Ask FN-01-01 (finance manager) to approve the prepaid route, then place the order again." });
        pass("Prepaid route: approved by FN-01-01; no credit used", "FP-04");
      }

      const std = rules.standardDelivery(now);
      const want = input.delivery_date;
      if (!want || want < std || !rules.isWorkingDay(want)) {
        if (!approved("delivery_exception", (r) => r.value === want)) return block(`Delivery on ${want || "no date"} within the terms (standard ${std})`, "delivery_exception",
          `${want || "No date"} is outside the delivery terms; the standard date is ${F.dayLabel(std)}.`,
          { data: { standard_date: std }, next_step: `Ask WH-01-01 (warehouse manager) to approve the date, or place the order for ${F.dayLabel(std)}.` });
        pass(`Delivery ${want}: exception approved by WH-01-01`, "WP-07");
      } else pass(`Delivery ${F.dayLabel(want)} within the terms (standard ${F.dayLabel(std)})`, "WP-07, WP-09");

      const since = now - V.duplicate_window_min * 60;
      const key = (ls) => JSON.stringify(ls.map((l) => [l.sku, l.qty]).sort());
      const dup = orders.find((o) => o.customer === c.id && o.created_at >= since && key(o.lines) === key(lines));
      if (dup) return block(`Not the same order within ${V.duplicate_window_min} minutes`, "likely_duplicate",
        `${dup.id} with the same lines was placed for ${c.id} ${Math.round((now - dup.created_at) / 60)} minutes ago.`,
        { next_step: `Ask the staff member whether this is a second order; ${dup.id} already covers these lines.` });
      pass(`Not the same order within ${V.duplicate_window_min} minutes`, "SP-09");

      const conf = input.confirmation_id && store.get("confirmations").find((x) => x.id === input.confirmation_id);
      const shown = { customer: c.id, lines: s.lines.map((l) => ({ sku: l.sku, qty: l.qty, unit_price: F.rm(l.unit_price), line_total: F.rm(l.line_total), promotion: l.promotion })),
        discount_pct: s.discount_pct, discount: F.rm(s.discount), total: F.rm(s.total), payment_route: route, delivery_date: want };
      if (!conf || conf.staff !== staff.id || conf.request_id !== input.request_id || !rules.sameSummary(conf, s))
        return block("Staff confirmation matches the full summary", "confirmation_missing",
          conf ? `${conf.id} does not match this summary.` : "No staff confirmation for this summary.",
          { data: { summary: shown }, next_step: "Show the staff member this summary; they confirm it on the staff page, then place the order again with the confirmation ID and request ID shown." });
      pass(`Staff confirmation ${conf.id} matches the full summary`, "SP-07");
      return allow({ summary: s });
    }

    return block(`Tool ${tool} exists`, "data_missing", `No tool named ${tool}.`, { clause: "MP-10" });
  }

  return { preToolUse };
});
