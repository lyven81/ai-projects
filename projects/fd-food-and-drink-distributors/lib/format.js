/* The shared format file: one result shape for every hooked call, written once.
 *
 *   { tool, status, data, error, next_step }
 *   status: ok | refused (a rule says no) | error (missing data or a system fault; nothing was changed)
 *           | needs_reconciliation (something may have changed; the result could not be confirmed)
 *   error:  null, or { code, clause, message } (one line)
 *   next_step: one line written by code: the approver on a refusal a manager decides, the person
 *              who reconciles after needs_reconciliation; the flow ends there.
 *
 * The PreToolUse hook writes a block in this shape, the tools write their results in it, and the
 * PostToolUse hook returns it, so a blocked call reads the same as a tool result. Also: money (sen
 * to RM) and time (Unix seconds to Malaysia time) conversions, used by PostToolUse and the pages.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FDFormat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MANAGER = {
    SL: "SL-01-01 (sales manager)", FN: "FN-01-01 (finance manager)", WH: "WH-01-01 (warehouse manager)",
  };

  // One situation, one code, one status (step C, section 8). clause: the default; a hook may name a narrower one.
  const CODES = {
    department_not_permitted: { status: "refused", clause: "MP-07" },
    tier_not_permitted: { status: "refused", clause: "SP-01" },
    customer_not_assigned: { status: "refused", clause: "MP-06" },
    approval_wrong_department: { status: "refused", clause: "MP-05" },
    approval_not_recorded: { status: "refused", clause: "MP-09" },
    confirmation_missing: { status: "refused", clause: "SP-07" },
    discount_above_maximum: { status: "refused", clause: "SP-06" },
    credit_balance_exceeded: { status: "refused", clause: "FP-03" },
    likely_duplicate: { status: "refused", clause: "SP-09" },
    // Refused, a manager decides: next_step names the approver.
    discount_needs_approval: { status: "refused", clause: "SP-06", approver: "SL" },
    below_minimum_order: { status: "refused", clause: "SP-03", approver: "SL" },
    price_missing: { status: "refused", clause: "SP-04", approver: "SL" },
    prepaid_needs_approval: { status: "refused", clause: "FP-04", approver: "FN" },
    raise_beyond_tier2: { status: "refused", clause: "FP-06", approver: "FN" },
    raise_from_zero_or_negative: { status: "refused", clause: "FP-06", approver: "FN" },
    stock_out_of_date: { status: "refused", clause: "WP-03", approver: "WH" },
    stock_short: { status: "refused", clause: "WP-05" },
    delivery_exception: { status: "refused", clause: "WP-07", approver: "WH" },
    // Errors: nothing was changed.
    data_missing: { status: "error", clause: "MP-07" },
    system_unavailable: { status: "error", clause: "MP-15" },
    // Something may have changed: keep the reference, no retry, a named person reconciles.
    order_result_mismatch: { status: "needs_reconciliation", clause: "MP-15", reconciler: "SL" },
    raise_result_mismatch: { status: "needs_reconciliation", clause: "FP-06", reconciler: "FN" },
  };

  function ok(tool, data, nextStep) {
    return { tool, status: "ok", data, error: null, next_step: nextStep || null };
  }

  /** A result for any code. message: one line; next: the next_step line (defaults below). */
  function fail(tool, code, message, opts) {
    const c = CODES[code];
    if (!c) throw new Error(`Unknown code ${code}`);
    const o = opts || {};
    let next = o.next_step;
    if (!next && c.approver) next = `Ask ${MANAGER[c.approver]} to decide, then try again.`;
    if (!next && c.reconciler) next = `Do not retry. ${MANAGER[c.reconciler]} reconciles it; keep the reference.`;
    return {
      tool, status: c.status, data: o.data === undefined ? null : o.data,
      error: { code, clause: o.clause || c.clause, message }, next_step: next || null,
    };
  }

  const SHAPE_KEYS = ["tool", "status", "data", "error", "next_step"];
  function isShape(r) {
    return !!r && SHAPE_KEYS.every((k) => k in r) && Object.keys(r).length === SHAPE_KEYS.length;
  }

  // ---- conversions ----
  function rm(sen) {
    if (sen === null || sen === undefined) return null;
    const neg = sen < 0;
    const s = (Math.abs(sen) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-RM " : "RM ") + s;
  }
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  /** Unix seconds -> parts in Malaysia time (UTC+8). */
  function mytParts(unix) {
    const d = new Date((unix + 8 * 3600) * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
  }
  function myt(unix) {
    if (unix === null || unix === undefined) return null;
    const p = mytParts(unix);
    return `${DAYS[p.wd]} ${p.d} ${MONTHS[p.m]} ${p.y}, ${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")} MYT`;
  }
  function mytDate(unix) {
    const p = mytParts(unix);
    return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  function dayLabel(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  /** Mask a contact: phone keeps the last 4 digits, email the first 2 letters and the domain. */
  function mask(value) {
    if (!value) return value;
    if (value.includes("@")) {
      const [u, dom] = value.split("@");
      return u.slice(0, 2) + "*".repeat(Math.max(2, u.length - 2)) + "@" + dom;
    }
    const digits = value.replace(/\D/g, "");
    return "+** ***-*** " + digits.slice(-4);
  }

  return { CODES, MANAGER, ok, fail, isShape, rm, myt, mytDate, mytParts, dayLabel, mask };
});
