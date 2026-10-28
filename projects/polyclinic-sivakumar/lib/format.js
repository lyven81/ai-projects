/* The shared format file: one result shape for every hooked call, written once.
 *
 *   { tool, status, data, error, next_step }
 *   status: ok | refused (a rule says no) | error (missing data or a system fault; nothing was changed)
 *   error:  null, or { code, clause, message } (one line)
 *   next_step: null, or { text, person, say, basis }
 *              text:   one line written by code: who acts next and what they do
 *              person: the staff ID of the person named, when there is one
 *              say:    the reply written by code for a fixed outcome (a handover sent, no access, no
 *                      authority), shown as it is with no further model call (access-level reply rule)
 *              basis:  the Basis line under the reply (clause, record ID, data date)
 *
 * The PreToolUse hook writes a block in this shape, the back end's refusals are converted to it, and
 * the PostToolUse hook returns it, so a blocked call reads the same as a tool result. Also: money (sen
 * to RM) and time (Unix seconds to Malaysia time) conversions, used by PostToolUse and the pages.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PSFormat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // One situation, one code, one status, one default clause; a hook may name a narrower clause.
  const CODES = {
    // who may do what
    not_offered: { status: "refused", clause: "PS-RP-01" },
    no_access: { status: "refused", clause: "PS-RP-02" },
    // identity and registration (PS-HS-04, PS-HS-07)
    identifier_required: { status: "refused", clause: "PS-HS-04" },
    no_match: { status: "refused", clause: "PS-HS-04" },
    identity_not_verified: { status: "refused", clause: "PS-PN-02" },
    already_registered: { status: "refused", clause: "PS-HS-07" },
    invalid_fields: { status: "refused", clause: "PS-HS-07" },
    // bookings and the queue (PS-HS-01 to PS-HS-06)
    clinic_closed: { status: "refused", clause: "PS-HS-02" },
    outside_hours: { status: "refused", clause: "PS-HS-01" },
    slot_taken: { status: "refused", clause: "PS-HS-05" },
    no_appointment: { status: "refused", clause: "PS-HS-05" },
    already_in_queue: { status: "refused", clause: "PS-HS-06" },
    queue_empty: { status: "refused", clause: "PS-HS-06" },
    // the consultation (PS-AC-07, PS-AC-08)
    not_called: { status: "refused", clause: "PS-HS-06" },
    prescription_incomplete: { status: "refused", clause: "PS-AC-02" },
    unknown_item: { status: "refused", clause: "PS-HS-03" },
    invalid_mc: { status: "refused", clause: "PS-AC-08" },
    invalid_referral: { status: "refused", clause: "PS-AC-08" },
    no_consultation: { status: "refused", clause: "PS-AC-02" },
    // the pharmacist's check (PS-AC-02 to PS-AC-04)
    check_not_passed: { status: "refused", clause: "PS-AC-02" },
    query_open: { status: "refused", clause: "PS-AC-03" },
    keep_not_possible: { status: "refused", clause: "PS-AC-03" },
    already_dispensed: { status: "refused", clause: "PS-AC-04" },
    invalid_reason: { status: "refused", clause: "PS-RP-06" },
    // billing (PS-PL, PS-PN, PS-AC-06)
    not_dispensed: { status: "refused", clause: "PS-AC-06" },
    no_bill_task: { status: "refused", clause: "PS-AC-06" },
    already_billed: { status: "refused", clause: "PS-PL-04" },
    panel_schedule_expired: { status: "refused", clause: "PS-PN-05" },
    no_bill: { status: "refused", clause: "PS-PL-04" },
    amount_mismatch: { status: "refused", clause: "PS-PL-04" },
    invalid_method: { status: "refused", clause: "PS-PL-04" },
    already_settled: { status: "refused", clause: "PS-PL-04" },
    already_reconciled: { status: "refused", clause: "PS-PL-05" },
    invalid_count: { status: "refused", clause: "PS-PL-05" },
    not_panel_bill: { status: "refused", clause: "PS-PN-06" },
    already_acknowledged: { status: "refused", clause: "PS-PN-06" },
    // documents (PS-AC-07 to PS-AC-09)
    no_gp_record: { status: "refused", clause: "PS-AC-07" },
    mc_declined: { status: "refused", clause: "PS-AC-07" },
    already_prepared: { status: "refused", clause: "PS-AC-09" },
    not_prepared: { status: "refused", clause: "PS-AC-09" },
    already_issued: { status: "refused", clause: "PS-AC-09" },
    // handovers (PS-RP-06)
    missing_details: { status: "refused", clause: "PS-RP-06" },
    wrong_stage: { status: "refused", clause: "PS-RP-06" },
    no_open_task: { status: "refused", clause: "PS-RP-06" },
    // errors: nothing was changed
    missing_price: { status: "error", clause: "PS-PL-03" },
    stock_record_missing: { status: "error", clause: "PS-AC-04" },
    template_missing: { status: "error", clause: "PS-AC-10" },
    data_missing: { status: "error", clause: "PS-RP-01" },
    system_unavailable: { status: "error", clause: "PS-RP-01" },
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

  /** A result for any code. message: one line; opts.next_step: string or object. */
  function fail(tool, code, message, opts) {
    const c = CODES[code];
    if (!c) throw new Error(`Unknown code ${code}`);
    const o = opts || {};
    return { tool, status: c.status, data: o.data === undefined ? null : o.data,
             error: { code, clause: o.clause || c.clause, message }, next_step: step(o.next_step) };
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
  /** RM in a tool input (a number, or "RM 37.00") -> sen; null when it is not a sum of money. */
  function toSen(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/RM|,|\s/gi, ""));
    return Number.isFinite(n) ? Math.round(n * 100) : null;
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
  const pad = (n) => String(n).padStart(2, "0");
  function myt(unix) {
    if (unix === null || unix === undefined) return null;
    const p = mytParts(unix);
    return `${DAYS[p.wd]} ${p.d} ${MONTHS[p.m]} ${p.y}, ${pad(p.h)}:${pad(p.min)}`;
  }
  const hhmm = (unix) => { const p = mytParts(unix); return `${pad(p.h)}:${pad(p.min)}`; };
  const mytDate = (unix) => { const p = mytParts(unix); return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`; };
  /** Malaysia-time date and HH:MM -> Unix seconds. */
  function unixOf(iso, hm) {
    const [h, m] = (hm || "00:00").split(":").map(Number);
    return Math.round(Date.parse(`${iso}T00:00:00Z`) / 1000) + h * 3600 + m * 60 - 8 * 3600;
  }
  function dayLabel(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  /** "Tuesday 2 June 2026", for sentences. */
  function dayWords(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  const weekday = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();
  /** Age in completed years on a date. */
  function age(dob, iso) {
    const [y, m, d] = dob.split("-").map(Number), [Y, M, D] = iso.split("-").map(Number);
    return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
  }

  return { CODES, ok, fail, step, isShape, rm, toSen, myt, hhmm, mytDate, mytParts, unixOf, dayLabel, dayWords, addDays, weekday, age };
});
