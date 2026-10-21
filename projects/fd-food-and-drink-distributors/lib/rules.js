/* Policy calculations written once and used by the back end, both hooks, the Confirm button and
 * the tests: who a staff ID is (MP-01 to MP-04), the promotion price by date (SP-05, SP-12),
 * the order summary (SP-07), working days and the delivery terms (WP-07, WP-09), and the credit
 * limit balance (FP-01). Reads the tables in resources/policy_tables.json, never a copy.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.FDRules = factory(root.FDFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  function createRules(tables) {
    const V = tables.values;
    const staffById = Object.fromEntries(tables.staff.map((s) => [s.id, s]));

    /** MP-01: DD-TT-NN. Only the staff list counts; a typed ID is never looked up here. */
    function who(id) {
      const s = staffById[id];
      if (!s) return null;
      return { id, name: s.name, dept: s.department, tier: s.tier, role: s.role };
    }

    function promotion(sku, isoDate) {
      return tables.promotions.find((p) => p.skus.includes(sku) && p.start <= isoDate && isoDate <= p.end) || null;
    }
    /** The price per ordering unit on a date: the customer's list price, less a calendar promotion. */
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

    /** FP-01: credit limit balance = credit limit - outstanding; null when the record is incomplete. */
    function balance(c) {
      if (c.credit_limit === null || c.credit_limit === undefined || c.outstanding === null || c.outstanding === undefined) return null;
      return c.credit_limit - c.outstanding;
    }

    function warehouseFor(c) {
      const l = tables.locations[c.location];
      return l ? l.warehouse : null;
    }

    return { V, who, promotion, unitPrice, summary, sameSummary, isWorkingDay, addWorkingDays, standardDelivery, balance, warehouseFor, tables };
  }

  return { createRules };
});
