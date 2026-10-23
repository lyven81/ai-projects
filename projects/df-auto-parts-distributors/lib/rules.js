/* Policy calculations written once and used by the back end, both hooks, the desk buttons and the
 * tests: who a staff ID is (MP-01 to MP-04), the promotion price by date (SP-05, SP-12), the order
 * summary (SP-07), working days and the delivery terms (WP-07, WP-09), the credit limit balance
 * (FP-01), the four rules a manager decides and their order (MP-16), the draft lapse (SP-13), and
 * the sentences written in code for fixed outcomes (the access-level reply rule): "Sent to ...",
 * no access, no authority, the decider's "OK.", and the notifications. Reads the tables in
 * resources/policy_tables.json, never a copy.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.DFRules = factory(root.DFFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  // The four rules a manager decides, in the order they are escalated (MP-16).
  const RULE_ORDER = ["discount", "minimum_order", "delivery_exception", "prepaid"];
  const RULE_CODE = { discount: "discount_needs_approval", minimum_order: "below_minimum_order", delivery_exception: "delivery_exception", prepaid: "prepaid_needs_approval" };
  const RULE_CLAUSE = { discount: "SP-06", minimum_order: "SP-03", delivery_exception: "WP-07", prepaid: "FP-04" };
  // What each type is called in a refusal ("you can't approve ...", "Only X can approve ...") and a notification.
  const RULE_WORDS = {
    discount: { many: "discounts", one: "a discount" },
    minimum_order: { many: "orders below the minimum", one: "a below-minimum order" },
    delivery_exception: { many: "a delivery date outside the terms", one: "a same-day delivery" },
    prepaid: { many: "the prepaid route", one: "a prepaid order" },
  };

  function createRules(tables) {
    const V = tables.values;
    const staffById = Object.fromEntries(tables.staff.map((s) => [s.id, s]));

    /** MP-01: DD-TT-NN. Only the staff list counts; a typed ID is never looked up here. */
    function who(id) {
      const s = staffById[id];
      if (!s) return null;
      return { id, name: s.name, dept: s.department, tier: s.tier, role: s.role };
    }
    const nameOf = (id) => (staffById[id] ? staffById[id].name : id);
    const firstOf = (id) => nameOf(id).split(" ")[0];
    const roleOf = (id) => (staffById[id] ? staffById[id].role.charAt(0).toLowerCase() + staffById[id].role.slice(1) : "");
    /** "Farid Iskandar, sales manager" */
    const person = (id) => `${nameOf(id)}, ${roleOf(id)}`;
    const managerOf = (dept) => `${dept}-01-01`;
    const deptStaff = (dept) => tables.staff.filter((s) => s.department === dept).map((s) => s.id);

    function promotion(sku, isoDate) {
      return tables.promotions.find((p) => p.skus.includes(sku) && p.start <= isoDate && isoDate <= p.end) || null;
    }
    /** The price per selling unit on a date: the customer's list price, less a calendar promotion. */
    function unitPrice(listSen, sku, isoDate) {
      if (listSen === null || listSen === undefined) return { price: null, promo: null };
      const p = promotion(sku, isoDate);
      return { price: p ? Math.round((listSen * (100 - p.percent)) / 100) : listSen, list: listSen, promo: p ? p.id : null };
    }

    /** SP-07: the full summary the staff member confirms, computed by code from the price list. */
    function summary(customerId, priceList, lines, discountPct, route, deliveryDate, nowUnix) {
      const today = F.mytDate(nowUnix);
      const out = lines.map((l) => {
        const u = unitPrice(priceList[l.sku], l.sku, today);
        return { sku: l.sku, qty: l.qty, list_price: u.list === undefined ? null : u.list, unit_price: u.price,
                 promotion: u.promo, line_total: u.price === null ? null : u.price * l.qty };
      });
      const missing = out.filter((l) => l.unit_price === null).map((l) => l.sku);
      const subtotal = missing.length ? null : out.reduce((a, l) => a + l.line_total, 0);
      const discount = subtotal === null ? null : Math.round((subtotal * (discountPct || 0)) / 100);
      return { customer: customerId, lines: out, missing_prices: missing, discount_pct: discountPct || 0,
               subtotal, discount, total: subtotal === null ? null : subtotal - discount,
               route: route || "credit", delivery_date: deliveryDate || null };
    }
    function sameSummary(a, b) {
      const key = (s) => JSON.stringify([s.customer, s.lines.map((l) => [l.sku, l.qty, l.unit_price]).sort(),
        s.discount_pct, s.total, s.route, s.delivery_date]);
      return key(a) === key(b);
    }
    const lineKey = (ls) => JSON.stringify((ls || []).map((l) => [l.sku, l.qty]).sort());
    const skuKey = (ls) => JSON.stringify((ls || []).map((l) => l.sku).sort());

    function isWorkingDay(iso) {
      const wd = new Date(iso + "T00:00:00Z").getUTCDay();
      return wd !== 0 && !(iso in tables.holidays);
    }
    function addWorkingDays(iso, n) {
      let d = new Date(iso + "T00:00:00Z");
      while (n > 0) {
        d = new Date(d.getTime() + 86400000);
        if (isWorkingDay(d.toISOString().slice(0, 10))) n--;
      }
      return d.toISOString().slice(0, 10);
    }
    /** WP-07: before 3 pm on a working day, the next working day; otherwise the second. */
    function standardDelivery(nowUnix) {
      const today = F.mytDate(nowUnix);
      const h = F.mytParts(nowUnix).h;
      return addWorkingDays(today, isWorkingDay(today) && h < V.delivery_cutoff_hour ? 1 : 2);
    }
    /** WP-07, WP-09: a date within the terms is a working day on or after the standard date. */
    const withinTerms = (iso, nowUnix) => !!iso && iso >= standardDelivery(nowUnix) && isWorkingDay(iso);

    /** FP-01: credit limit balance = credit limit - outstanding; null when the record is incomplete. */
    function balance(c) {
      if (c.credit_limit === null || c.credit_limit === undefined || c.outstanding === null || c.outstanding === undefined) return null;
      return c.credit_limit - c.outstanding;
    }
    function warehouseFor(c) {
      const l = tables.locations[c.location];
      return l ? l.warehouse : null;
    }

    /** SP-13: a draft lapses this many days after it is created. */
    const lapsesAt = (createdUnix) => createdUnix + V.draft_lapse_days * 86400;
    const isLapsed = (draft, nowUnix) => draft.status === "draft" && nowUnix >= draft.lapses_at;

    /** MP-16: the first rule a manager decides that the request breaks and no recorded approval covers. */
    function unmetRule(s, nowUnix, approvals) {
      const has = (type, test) => approvals.some((a) => a.type === type && test(a));
      if (s.discount_pct > 0 && !has("discount", (a) => s.discount_pct <= a.value)) return "discount";
      if (s.total < V.minimum_order_sen && !has("minimum_order", (a) => s.total >= a.value)) return "minimum_order";
      if (!withinTerms(s.delivery_date, nowUnix) && !has("delivery_exception", (a) => a.value === s.delivery_date)) return "delivery_exception";
      if (s.route === "prepaid" && !has("prepaid", (a) => s.total <= a.value)) return "prepaid";
      return null;
    }
    /** The value an approval records for its type (the table in MP-09). */
    function approvalValue(type, s) {
      return type === "discount" ? s.discount_pct : type === "delivery_exception" ? s.delivery_date : s.total;
    }

    // ---- sentences written in code (access-level reply rule) ----
    const ucFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const say = {
      sent: (to) => `Sent to ${person(to)}.`,
      stillWith: (to) => `This is still with ${person(to)}.`,
      noAccess: (what, whoText) => `I'm sorry, ${what} isn't open to you. Only ${whoText} can access it.`,
      noAccessPlural: (what, whoText) => `I'm sorry, ${what} aren't open to you. Only ${whoText} can access them.`,
      noAuthority: (cant, ids, canDo) => `I'm sorry, you can't ${cant}. Only ${ids.map(person).join(", and ")}, can ${canDo}.`,
      customerNotAssigned: (customerId, ownerId) =>
        `I'm sorry, ${customerId}'s account isn't open to you. Only ${person(ownerId)}, and ${person(managerOf("SL"))}, can access it.`,
      decisionRule: (type) => ({ cant: `approve ${RULE_WORDS[type].many}`, canDo: `approve ${RULE_WORDS[type].one}` }),
      alreadyDecided: (e) => `This was already ${e.status} by ${nameOf(e.decided_by)} at ${F.hhmm(e.decided_at)}${e.approval_id ? ` as ${e.approval_id}` : ""}, so nothing changed.`,
      nothingWaiting: (customerId, type) => `Nothing is waiting on you for ${customerId}'s ${RULE_WORDS[type].one.replace(/^an? /, "")}. Nothing was changed.`,
    };

    return { V, who, nameOf, firstOf, roleOf, person, managerOf, deptStaff, promotion, unitPrice, summary, sameSummary,
      lineKey, skuKey, isWorkingDay, addWorkingDays, standardDelivery, withinTerms, balance, warehouseFor, lapsesAt, isLapsed,
      unmetRule, approvalValue, say, ucFirst, RULE_ORDER, RULE_CODE, RULE_CLAUSE, RULE_WORDS, tables };
  }

  return { createRules, RULE_ORDER, RULE_CODE, RULE_CLAUSE, RULE_WORDS };
});
