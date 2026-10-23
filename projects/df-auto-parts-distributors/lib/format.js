/* The shared format file: one result shape for every hooked call, written once.
 *
 *   { tool, status, data, error, next_step }
 *   status: ok | refused (a rule says no) | escalated (sent to the manager who decides; nothing placed)
 *           | error (missing data or a system fault; nothing was changed)
 *           | needs_reconciliation (something may have changed; the result could not be confirmed)
 *   error:  null, or { code, clause, message } (one line)
 *   next_step: null, or { text, person, say, basis }
 *              text:   one line written by code: who acts next and what they do
 *              person: the staff ID of the person named, when there is one
 *              say:    the reply written by code for a fixed outcome (an escalation, a decision, no access,
 *                      no authority), shown as it is with no further model call (access-level reply rule)
 *              basis:  the Basis line under the reply (clause, record ID, data age)
 *
 * The PreToolUse hook writes a block in this shape, the tools write their results in it, and the
 * PostToolUse hook returns it, so a blocked call reads the same as a tool result. Also: money (sen
 * to RM) and time (Unix seconds to Malaysia time) conversions, used by PostToolUse and the pages.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DFFormat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MANAGER = { SL: "SL-01-01", FN: "FN-01-01", WH: "WH-01-01" };

  // One situation, one code, one status. clause: the default; a hook may name a narrower one.
  const CODES = {
    department_not_permitted: { status: "refused", clause: "MP-07" },
    tier_not_permitted: { status: "refused", clause: "MP-05" },
    customer_not_assigned: { status: "refused", clause: "MP-06" },
    approval_wrong_department: { status: "refused", clause: "MP-05" },
    approval_not_recorded: { status: "refused", clause: "MP-09" },
    confirmation_missing: { status: "refused", clause: "SP-07" },
    discount_above_maximum: { status: "refused", clause: "SP-06" },
    credit_balance_exceeded: { status: "refused", clause: "FP-03" },
    likely_duplicate: { status: "refused", clause: "SP-09" },
    price_missing: { status: "refused", clause: "SP-04", approver: "SL" },
    stock_out_of_date: { status: "refused", clause: "WP-03", approver: "WH" },
    stock_short: { status: "refused", clause: "WP-05" },
    order_not_placed: { status: "refused", clause: "WP-10" },
    delivery_outside_terms: { status: "refused", clause: "WP-07", approver: "WH" },
    order_ambiguous: { status: "refused", clause: "WP-10" },
    // The four rules a manager decides: the request becomes an escalation (MP-16).
    discount_needs_approval: { status: "escalated", clause: "SP-06", approver: "SL" },
    below_minimum_order: { status: "escalated", clause: "SP-03", approver: "SL" },
    delivery_exception: { status: "escalated", clause: "WP-07", approver: "WH" },
    prepaid_needs_approval: { status: "escalated", clause: "FP-04", approver: "FN" },
    escalation_open: { status: "refused", clause: "MP-16" },
    escalation_not_found: { status: "refused", clause: "MP-16" },
    escalation_ambiguous: { status: "refused", clause: "MP-16" },
    escalation_already_decided: { status: "refused", clause: "MP-09" },
    draft_ambiguous: { status: "refused", clause: "SP-13" },
    // Errors: nothing was changed.
    data_missing: { status: "error", clause: "MP-07" },
    system_unavailable: { status: "error", clause: "MP-15" },
    // Something may have changed: keep the reference, no retry, a named person reconciles.
    order_result_mismatch: { status: "needs_reconciliation", clause: "MP-15", reconciler: "SL" },
  };

  /** next: a string (the text line) or { text, person, say, basis }. */
  function step(next) {
    if (!next) return null;
    if (typeof next === "string") return { text: next, person: null, say: null, basis: null };
    return { text: next.text || null, person: next.person || null, say: next.say || null, basis: next.basis || null };
  }

  function ok(tool, data, next) {
    return { tool, status: "ok", data, error: null, next_step: step(next) };
  }

  /** A result for any code. message: one line; opts.next_step: string or object (defaults below). */
  function fail(tool, code, message, opts) {
    const c = CODES[code];
    if (!c) throw new Error(`Unknown code ${code}`);
    const o = opts || {};
    let next = o.next_step;
    if (!next && c.approver) next = { text: `${MANAGER[c.approver]} decides; nothing was placed.`, person: MANAGER[c.approver] };
    if (!next && c.reconciler) next = { text: `Do not retry. ${MANAGER[c.reconciler]} reconciles it; keep the reference.`, person: MANAGER[c.reconciler] };
    return {
      tool, status: c.status, data: o.data === undefined ? null : o.data,
      error: { code, clause: o.clause || c.clause, message }, next_step: step(next),
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
  const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
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
  /** "10:13" in Malaysia time. */
  function hhmm(unix) {
    const p = mytParts(unix);
    return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
  }
  function mytDate(unix) {
    const p = mytParts(unix);
    return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  function dayLabel(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  /** "Friday 2 October" (no year), for sentences. */
  function dayWords(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]}`;
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

  return { CODES, MANAGER, ok, fail, step, isShape, rm, myt, hhmm, mytDate, mytParts, dayLabel, dayWords, mask };
});
