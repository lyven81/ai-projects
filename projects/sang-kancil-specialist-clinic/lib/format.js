/* The shared format file: one result shape for every hooked call, written once.
 *
 *   { tool, status, data, error, next_step }
 *   status: ok | refused (a rule says no) | error (missing data or a system fault; nothing was changed)
 *           | pending (an item now waits on a named person)                                     (CP-14)
 *   error:  null, or { code, clause, message } (one line)
 *   next_step: null, or { person, job_title, staff_id, clause, request_id, action }: the person by name and
 *              job title, the staff ID, the clause, and the request ID when one was created (D3).
 *
 * The PreToolUse hook writes a block in this shape, the tools write their results in it, and the
 * PostToolUse hook returns it, so a blocked call reads the same as a tool result. Also: money (sen
 * to RM) and time (Malaysia time, day, date and time) conversions, used by PostToolUse and the pages.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SKFormat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // One situation, one code, one status. clause: the default; a hook may name a narrower one.
  const CODES = {
    no_session: { status: "refused", clause: "CP-01" },
    tool_not_offered: { status: "refused", clause: "CP-11" },
    not_attending: { status: "refused", clause: "CP-05" },
    view_not_permitted: { status: "refused", clause: "CP-04" },
    reason_required: { status: "refused", clause: "CP-08" },
    billing_not_permitted: { status: "refused", clause: "CP-09" },
    filter_not_permitted: { status: "refused", clause: "CP-10" },
    patient_ambiguous: { status: "refused", clause: "CP-14" },
    request_not_permitted: { status: "refused", clause: "CP-12" },
    not_owner: { status: "refused", clause: "CP-12" },
    self_approval: { status: "refused", clause: "CP-12" },
    request_closed: { status: "refused", clause: "CP-13" },
    details_missing: { status: "refused", clause: "CP-13" },
    // Visits and prescriptions (CL-06 to CL-09, Clinic Formulary section 2)
    not_prescriber: { status: "refused", clause: "CL-06" },
    no_open_visit: { status: "refused", clause: "CL-06" },
    visit_already_closed: { status: "refused", clause: "CL-06" },
    FORMULARY_NOT_FOUND: { status: "refused", clause: "CL-07" },
    STRENGTH_AMBIGUOUS: { status: "refused", clause: "CL-07" },
    PROFILE_NOT_SUPPORTED: { status: "refused", clause: "CL-07" },
    WEIGHT_STALE: { status: "refused", clause: "CL-08" },
    DOSE_OUTSIDE_PROFILE: { status: "refused", clause: "CL-08" },
    FREQUENCY_INVALID: { status: "refused", clause: "CL-07" },
    DURATION_INVALID: { status: "refused", clause: "CL-07" },
    DUPLICATE_INGREDIENT: { status: "refused", clause: "CL-07" },
    ALLERGY_REVIEW_REQUIRED: { status: "refused", clause: "CL-09" },
    CLINICIAN_REVIEW_REQUIRED: { status: "refused", clause: "CL-07" },
    // Bookings (OP-03 to OP-09)
    booking_not_permitted: { status: "refused", clause: "OP-05" },
    session_closed: { status: "refused", clause: "OP-03" },
    session_full: { status: "refused", clause: "OP-06" },
    guardian_not_confirmed: { status: "refused", clause: "OP-07" },
    doctor_assignment_requested: { status: "pending", clause: "OP-04" },
    // Billing (BP-03, BP-04)
    invoice_not_found: { status: "error", clause: "BP-03" },
    amount_above_balance: { status: "refused", clause: "BP-04" },
    duplicate_reference: { status: "refused", clause: "BP-04" },
    // Errors: nothing was changed.
    patient_not_found: { status: "error", clause: "CP-14" },
    data_missing: { status: "error", clause: "CP-14" },
    rota_unavailable: { status: "error", clause: "OP-03" },
    system_unavailable: { status: "error", clause: "CP-14" },
  };

  function ok(tool, data, nextStep) {
    return { tool, status: "ok", data, error: null, next_step: nextStep || null };
  }
  function pending(tool, data, nextStep, code, message, clause) {
    return { tool, status: "pending", data, error: code ? { code, clause: clause || (CODES[code] || {}).clause, message } : null, next_step: nextStep || null };
  }

  /** A result for any code. message: one line; opts.next_step: the next_step object. */
  function fail(tool, code, message, opts) {
    const c = CODES[code];
    if (!c) throw new Error(`Unknown code ${code}`);
    const o = opts || {};
    return {
      tool, status: c.status, data: o.data === undefined ? null : o.data,
      error: { code, clause: o.clause || c.clause, message }, next_step: o.next_step || null,
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
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  /** Unix seconds -> parts in Malaysia time (UTC+8). */
  function mytParts(unix) {
    const d = new Date((unix + 8 * 3600) * 1000);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
  }
  function mytDate(unix) {
    const p = mytParts(unix);
    return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  /** "2026-11-02" -> "Monday 2 November 2026" (OP-08). */
  function dayLabel(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  /** "14:20" -> "2:20pm"; "09:00" -> "9:00am". */
  function clock(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
  }
  function when(iso, hhmm) { return hhmm ? `${dayLabel(iso)}, ${clock(hhmm)}` : dayLabel(iso); }
  function myt(unix) {
    if (unix === null || unix === undefined) return null;
    const p = mytParts(unix);
    return `${when(mytDate(unix), `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`)} Malaysia time`;
  }

  return { CODES, ok, pending, fail, isShape, rm, myt, mytDate, mytParts, dayLabel, clock, when };
});
