/* The shared format file: one result shape for every hooked call, written once.
 *
 *   { tool, status, data, error, next_step, elapsed_ms }
 *   status: ok | refused (a rule says no) | error (missing data or a system fault; nothing was changed)
 *           | handover (the matter goes to a named person)
 *   error:  null, or { code, clause, message, errorCategory (transient | validation | permission), isRetryable }
 *   next_step: one line written by code telling the agent what to do next.
 *
 * The PreToolUse hook writes a block in this shape, the tools write their results in it, and the
 * PostToolUse hook returns it, so a blocked call reads the same as a tool result. Also the specialist
 * answer shape (submit_answer), and money (sen to RM) and time (Unix seconds to Malaysia time) conversions.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HMFormat = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // One situation, one code (Step C, section 6).
  const CODES = {
    verification_failed: { status: "refused", clause: "CS1", category: "validation" },
    verification_locked: { status: "handover", clause: "CS2", category: "permission" },
    not_verified: { status: "refused", clause: "CS1", category: "permission" },
    order_not_verified: { status: "refused", clause: "CS1", category: "permission" },
    tool_not_permitted: { status: "refused", clause: "Section 3", category: "permission" },
    item_not_in_order: { status: "refused", clause: "CS1", category: "permission" },
    after_dispatch: { status: "refused", clause: "FP3", category: "validation" },
    return_window_passed: { status: "refused", clause: "RP1", category: "validation" },
    sale_item: { status: "refused", clause: "RP3", category: "validation" },
    report_window_passed: { status: "refused", clause: "QP1", category: "validation" },
    warranty_expired: { status: "refused", clause: "QP2", category: "validation" },
    reply_blocked: { status: "refused", clause: "Pre-send check", category: "validation" },
    handover_invalid: { status: "refused", clause: "CS5", category: "validation" },
    content_unsupported: { status: "refused", clause: "Router workbook", category: "validation" },
    // Errors: nothing was changed.
    lookup_timeout: { status: "error", clause: "Section 6", category: "transient", retry: true },
    specialist_timeout: { status: "handover", clause: "CS5", category: "transient" },
    specialist_output_invalid: { status: "error", clause: "Section 5", category: "validation" },
    input_invalid: { status: "error", clause: "CS1", category: "validation" },
  };

  function ok(tool, data, nextStep) {
    return { tool, status: "ok", data, error: null, next_step: nextStep || null, elapsed_ms: 0 };
  }

  /** A result for any code. message: one line; opts.next_step, opts.clause, opts.data, opts.status. */
  function fail(tool, code, message, opts) {
    const c = CODES[code];
    if (!c) throw new Error(`Unknown code ${code}`);
    const o = opts || {};
    return {
      tool, status: o.status || c.status, data: o.data === undefined ? null : o.data,
      error: { code, clause: o.clause || c.clause, message, errorCategory: c.category, isRetryable: !!c.retry },
      next_step: o.next_step || null, elapsed_ms: 0,
    };
  }

  const SHAPE_KEYS = ["tool", "status", "data", "error", "next_step", "elapsed_ms"];
  function isShape(r) {
    return !!r && SHAPE_KEYS.every((k) => k in r) && Object.keys(r).length === SHAPE_KEYS.length;
  }

  /** The specialist answer shape (submit_answer), checked by PostToolUse on ask_specialist. */
  const ANSWER_STATUS = ["answered", "handover", "error"];
  function checkAnswer(a, department, clauses) {
    const problems = [];
    if (!a || typeof a !== "object") return ["no answer"];
    if (!ANSWER_STATUS.includes(a.status)) problems.push(`status ${a.status} is not answered, handover or error`);
    if (!Array.isArray(a.points)) problems.push("points is not a list");
    for (const p of a.points || []) {
      if (!p || typeof p.text !== "string" || !Array.isArray(p.clauses) || !p.clauses.length) { problems.push("a point without text or clauses"); continue; }
      for (const c of p.clauses) {
        if (!clauses[c]) problems.push(`${c} is not a clause`);
        else if (clauses[c].department !== department) problems.push(`${c} belongs to ${clauses[c].department}, not ${department}`);
      }
    }
    if (a.status === "handover" && !(a.handover && a.handover.reason)) problems.push("status handover without a reason");
    return problems;
  }

  // ---- conversions ----
  function rm(sen) {
    if (sen === null || sen === undefined) return null;
    return "RM " + (sen / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
  /** Unix seconds -> "2026-10-27" in Malaysia time. */
  function mytDate(unix) {
    const p = mytParts(unix);
    return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  /** "2026-10-27" -> "Tue 27 Oct 2026". */
  function dayLabel(iso) {
    const d = new Date(iso + "T00:00:00Z");
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  return { CODES, ok, fail, isShape, checkAnswer, rm, myt, mytDate, mytParts, dayLabel, DAYS, MONTHS };
});
