/* Subang Badminton Arena: the assistant's tools and the staff actions, written once.
 *
 * Loaded by the MCP server (mcp_server.mjs, Node), the benchmark, and both pages
 * (assistant.html, demo.html), so every rule below is the same everywhere.
 *
 * Every rule the assistant must never break lives here, in code, not in the prompt:
 * the booking window and hours, the 2-hour lead time, the court limit, the conflict
 * check, fees and deposit from the fee table, the 30-minute hold, the booking check
 * with its lock, receipt-only payment reports compared in code, quote before
 * cancellation, fixed handover reasons, and citations checked against the clause list.
 * No tool confirms, cancels, releases, refunds or changes a booking, and none lists
 * bookings or names a player. Those are staff buttons (STAFF below), each sending a
 * fixed message written here, never by the AI.
 *
 * Each tool returns { ok: true, ... } or
 * { ok: false, error: { category, retryable, message } }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BadmintonTools = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CENTRE = "Subang Badminton Arena";
  const OPEN_HOUR = 7, CLOSE_HOUR = 25;            // 07:00 to 01:00; hour 24 is the 00:00 start
  const RATES = { weekday: 20, weekend: 25 };       // B7, per court per hour
  const DEPOSIT = 50;                               // B8
  const HOLD_MINUTES = 30;                          // B11
  const WINDOW_DAYS = 7;                            // B1
  const LEAD_HOURS = 2;                             // B3
  const MAX_HOURS = 3;                              // B2
  const MAX_COURTS_AT_ONCE = 2;                     // B4
  const MAX_CHECKS = 3;                             // B18
  const COURTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const HANDOVER_REASONS = [
    "not_in_policy", "policy_unclear", "staff_only_booking", "check_failed",
    "centre_cancelled", "refund_issue_or_complaint", "asks_for_staff", "system_unavailable",
  ];
  // Handovers whose reply ends with "Not covered by policy" instead of clause citations.
  const NOT_COVERED_REASONS = ["not_in_policy", "system_unavailable"];
  // A reply that tells the player staff will take the enquiry up.
  // ("Staff will confirm once they find the payment" is a fact about the process, not a handover.)
  // The four-way rule as a field of every reply, checked in code.
  const POLICY_CASES = ["covered", "contradicts", "not_covered", "unclear", "other"];
  const CASE_NEEDS = { not_covered: "not_in_policy", unclear: "policy_unclear" };
  // A reply that offers to pass the question on instead of passing it on.
  // ("Do you want me to send the cancellation request to staff?" is the C7 confirmation, not an offer.)
  const HANDOVER_OFFER = /\b(I can|I could|shall I|should I|would you like me to|do you want me to|want me to|happy to)\s+(also\s+)?((pass|forward|refer|send)\s+(it|this|that|your (question|enquiry|query)|the (question|enquiry|query))\b[^.?]{0,15}\bstaff|(check with|ask)\s+(our\s+)?staff)\b/i;
  // A reply that tells the player the policies are silent on the question.
  const POLICY_GAP_CLAIM = /\b(policy|policies|rules?)\b[^.]{0,40}\b(doesn't|does not|don't|do not|isn't|is not)\s+(say|cover|settle|mention|state|specify|define|address|covered|clear|set|allow|include|count|explain)\b|\b(not|n't) covered\b[^.]{0,30}\bpolic|\bcan('|no)t (confirm|answer|say)\b[^.]{0,40}\b(polic|from)/i;
  const HANDOVER_CLAIM =/\b(passed|forwarded|handed|referred|escalated)\b[^.]{0,40}\b(to|with)\b[^.]{0,10}\bstaff\b|\bstaff\b[^.]{0,20}\b(will|can|would)\s+(follow up|get back|contact you|reach out|look into)/i;

  // ---------- tool definitions (shared by MCP, the benchmark and the pages) ----------

  const TOOL_DEFINITIONS = [
    {
      name: "check_availability",
      description:
        "Show which courts are free on one date: free or taken per court and hour, never who booked. " +
        "Give date only for the whole day (optionally one court), or add start_time and hours to see which courts are free for that exact session, " +
        "with the nearest free times on the requested court. Only times at least 2 hours from now are shown as free (B3). " +
        "Date format YYYY-MM-DD; start_time HH:00 in 24-hour time, 07:00 to 00:00 (00:00 is the midnight session at the end of that date). " +
        "Errors: outside_booking_window, date_in_past, outside_opening_hours, too_long, system_unavailable.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          court: { type: "integer", description: "1 to 12, optional" },
          start_time: { type: "string", description: "HH:00, optional, e.g. 20:00" },
          hours: { type: "integer", description: "1, 2 or 3; used with start_time" },
        },
        required: ["date"],
      },
    },
    {
      name: "request_booking",
      description:
        "Create ONE held booking request for one court. Code issues the booking reference, works out the court fee and the RM 50 deposit, " +
        "and holds the court for 30 minutes. It never confirms a booking: staff confirm after finding the payment in the bank record. " +
        "Ask the player first for anything missing: name, Malaysian mobile number, and whether to pay the court fee now (with the deposit) or at the counter after the session. " +
        "Returns the reference, the amount to pay now by DuitNow QR, and the hold deadline. " +
        "Errors: slot_taken (with nearest alternatives), too_late_to_book, court_limit, invalid_mobile, outside_booking_window, outside_opening_hours, too_long, missing_details, system_unavailable.",
      input_schema: {
        type: "object",
        properties: {
          court: { type: "integer", description: "1 to 12" },
          date: { type: "string", description: "YYYY-MM-DD" },
          start_time: { type: "string", description: "HH:00, 24-hour" },
          hours: { type: "integer", description: "1, 2 or 3" },
          player_name: { type: "string" },
          mobile: { type: "string", description: "Malaysian mobile, e.g. 012-345 6789" },
          pay_court_fee_now: { type: "boolean", description: "true: deposit plus court fee now. false: deposit now, court fee at the counter after the session." },
        },
        required: ["court", "date", "start_time", "hours", "player_name", "mobile", "pay_court_fee_now"],
      },
    },
    {
      name: "verify_booking",
      description:
        "Check that the player owns a booking: the booking reference plus the last 4 digits of the mobile number on it, both given by the player. Never guess either. " +
        "Required before get_booking, quote_cancellation, request_cancellation or report_payment on a booking not made in this conversation. " +
        "The same error is returned whether the booking does not exist or the digits are wrong. After 3 failed checks it locks for this conversation: hand to staff with reason check_failed. " +
        "Errors: no_match, locked.",
      input_schema: {
        type: "object",
        properties: {
          booking_ref: { type: "string", description: "e.g. BK-2041" },
          mobile_last4: { type: "string", description: "4 digits as text, e.g. \"6789\"" },
        },
        required: ["booking_ref", "mobile_last4"],
      },
    },
    {
      name: "get_booking",
      description:
        "Return ONE booking: court, date, time, amounts and status. Only for a booking verified in this conversation (verify_booking) or made in it (request_booking). Never a list. " +
        "Errors: not_verified.",
      input_schema: {
        type: "object",
        properties: { booking_ref: { type: "string" } },
        required: ["booking_ref"],
      },
    },
    {
      name: "report_payment",
      description:
        "Record a payment receipt the player uploaded IN THIS MESSAGE, for a held booking made in this conversation or verified. " +
        "Read the image and pass what it shows: document_type, amount, payment reference, date and time paid, recipient. " +
        "Code compares them with the booking and flags differences for staff. This does NOT confirm the booking: the hold continues until staff check the payment. " +
        "A message saying the player paid, with no image, is not a payment report: do not call this tool, ask for the receipt. " +
        "Errors: receipt_required, not_a_receipt, hold_expired, not_held, invalid_fields, not_verified.",
      input_schema: {
        type: "object",
        properties: {
          booking_ref: { type: "string" },
          upload_id: { type: "string", description: "The upload_id shown with the player's image, e.g. UP-001" },
          document_type: { type: "string", enum: ["payment_receipt", "not_a_receipt", "unreadable"] },
          amount_rm: { type: "number", description: "Amount on the receipt, e.g. 100" },
          reference: { type: "string", description: "Payment reference on the receipt" },
          paid_at: { type: "string", description: "Date and time on the receipt, YYYY-MM-DDTHH:MM" },
          recipient: { type: "string", description: "Recipient name on the receipt" },
        },
        required: ["booking_ref", "upload_id", "document_type"],
      },
    },
    {
      name: "quote_cancellation",
      description:
        "Work out the refund if the player cancels a confirmed booking: the deposit, plus the court fee if it was paid at booking (C3). " +
        "Only after verify_booking, and only before the session starts. Tell the player the amount and ask whether to go ahead; nothing is submitted. " +
        "Errors: not_verified, session_started, not_confirmed, already_requested.",
      input_schema: {
        type: "object",
        properties: { booking_ref: { type: "string" } },
        required: ["booking_ref"],
      },
    },
    {
      name: "request_cancellation",
      description:
        "Submit a cancellation request for staff to approve. Only after quote_cancellation for the same booking, and only when the player agreed in a later message (C7). " +
        "The booking stays in place until staff approve; the refund is paid by staff. Whole bookings only (C6). " +
        "Errors: no_quote, not_verified, session_started.",
      input_schema: {
        type: "object",
        properties: { booking_ref: { type: "string" } },
        required: ["booking_ref"],
      },
    },
    {
      name: "hand_to_staff",
      description:
        "Hand the enquiry to staff on the dashboard. The reason must be one of: " +
        "not_in_policy (no clause covers it), policy_unclear (a clause seems to apply but neither allows nor forbids), " +
        "staff_only_booking (recurring, over 3 hours, over 2 courts, tournaments, events, coaching, corporate, school: B20), " +
        "check_failed (3 failed booking checks: B18), centre_cancelled (a session the centre cancels: C12), " +
        "refund_issue_or_complaint (complaints, refund disputes, refunds not received: C13), asks_for_staff (the player asks for a person: B22), " +
        "system_unavailable (a tool still fails after one retry). " +
        "Staff work from a queue and cannot see this chat, so the handover is a structured summary of facts (no guesses about the player's intent or mood): the root cause (why it needs a person), " +
        "the clauses you checked, any amount involved, and the recommended next step for staff. Code attaches the player's own words, " +
        "the chat contact, and for check_failed the checks tried. check_failed is accepted only after verify_booking has locked. " +
        "Errors: invalid_reason, missing_details, not_locked.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", enum: HANDOVER_REASONS },
          root_cause: { type: "string", description: "Why this needs a person, in one or two sentences, e.g. \"No clause covers lockers or bag storage; O8 lists the facilities and does not mention them.\"" },
          clause_ids: { type: "array", items: { type: "string" }, description: "Clauses checked: for policy_unclear the clause that seemed to apply; for not_in_policy the nearest clauses checked; [] if none" },
          amount_rm: { type: "number", description: "Money involved (fee, deposit, refund), if any" },
          recommended_action: { type: "string", description: "The next step for staff, one sentence, e.g. \"Reply on lockers or bag storage; consider adding it to O8.\"" },
          booking_ref: { type: "string", description: "If the enquiry is about a booking" },
          player_name: { type: "string", description: "Only if the player gave it" },
        },
        required: ["reason", "root_cause", "clause_ids", "recommended_action"],
      },
    },
    {
      name: "reply_to_player",
      description:
        "Send your reply to the player. Every reply goes through this tool, including questions. " +
        "Pass the clause IDs the reply relies on (e.g. B7, O9, C3); code turns them into the citation line with links, and drops IDs that do not exist. " +
        "After a hand_to_staff with reason not_in_policy or system_unavailable, code ends the reply with \"Not covered by policy\" instead. " +
        "A reply that says the enquiry was passed to staff, or that staff will follow up, is refused (handover_not_made) unless hand_to_staff succeeded in this turn. " +
        "State which policy case the reply is: covered (a clause answers it), contradicts (a clause forbids it: you decline), " +
        "not_covered (no clause speaks to it), unclear (a clause seems to apply but does not settle it), or other (booking steps, questions to the player, other handovers). " +
        "not_covered needs hand_to_staff reason not_in_policy, and unclear needs reason policy_unclear, in this turn before the reply. " +
        "This ends your turn.",
      input_schema: {
        type: "object",
        properties: {
          policy_case: { type: "string", enum: POLICY_CASES },
          message: { type: "string", description: "The reply, without a citation line" },
          clause_ids: { type: "array", items: { type: "string" }, description: "e.g. [\"B7\", \"B8\"]" },
        },
        required: ["policy_case", "message", "clause_ids"],
      },
    },
  ];

  // What each tool's code enforces, for the "How it works" view. Keep in step with the handlers.
  const TOOL_CHECKS = {
    check_availability: ["Today and the next 7 days only (B1), opening hours (O3)", "Times under 2 hours away are not offered (B3)", "Free or taken only: no names (O18)"],
    request_booking: ["Window, 1 to 3 hours, 2 hours ahead, up to 2 courts at once per mobile (B1 to B4)", "Conflict re-checked at the moment of writing; nearest alternatives on slot_taken (B6)", "Fee from the fee table, RM 50 deposit, 30-minute hold, reference issued by code (B7, B8, B11)"],
    verify_booking: ["Reference and mobile last 4 must both match, compared as text (B17)", "Same error whether the booking is missing or the digits are wrong", "Locked after 3 failed checks (B18)"],
    get_booking: ["Only a booking verified or made in this conversation", "One booking, never a list (O20)", "No mobile number returned"],
    report_payment: ["Needs an image uploaded in this message: \"I have paid\" is refused (B12); refused once the hold has expired (B13)", "Receipt fields compared with the booking in code; differences flagged for staff (B23)", "Records the receipt only: the booking stays held (B25)"],
    quote_cancellation: ["Verified, confirmed, and the session not started (C1, C3)", "Refund worked out in code: deposit plus any court fee paid at booking"],
    request_cancellation: ["Only after a quote, and only in a later message than the quote (C7)", "Pending until staff approve; the booking stays in place (C8)"],
    hand_to_staff: ["Reason must be one of the 8 fixed reasons; check_failed only after the booking check has locked (B18)", "A structured summary for staff who cannot see the chat: root cause, clauses checked, amount, recommended action", "Code attaches the player's words, the chat contact and, for check_failed, the checks tried"],
    reply_to_player: ["Clause IDs checked against the clause list; links built by code, with the clauses an unclear handover names", "Every reply states its policy case; not_covered and unclear are refused without the matching handover this turn", "A reply that claims a handover, a policy gap or offers to pass it on is refused unless hand_to_staff ran this turn"],
  };

  // ---------- helpers ----------

  const fail = (category, message, retryable) => ({ ok: false, error: { category, retryable: !!retryable, message } });
  const digits = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  const normRef = (s) => {
    const d = digits(s);
    return d ? "BK-" + d : "";
  };
  const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z"));
  const dayOfWeek = (iso) => new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const toMin = (iso) => Math.round(Date.parse(iso.length === 10 ? iso + "T00:00:00Z" : iso.slice(0, 16) + ":00Z") / 60000);
  const fromMin = (m) => new Date(m * 60000).toISOString().slice(0, 16);
  const addDays = (iso, n) => fromMin(toMin(iso) + n * 1440).slice(0, 10);
  const daysBetween = (a, b) => Math.round((toMin(b) - toMin(a)) / 1440);
  const hhmm = (h) => String(h % 24).padStart(2, "0") + ":00";
  const sessionStart = (b) => toMin(b.date) + b.start_hour * 60;
  const sessionEnd = (b) => sessionStart(b) + b.hours * 60;
  const ACTIVE = (b) => b.status === "held" || b.status === "confirmed";
  const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateText = (iso) => { const d = new Date(iso + "T00:00:00Z"); return `${LONG_DAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const rm = (n) => "RM " + Number(n).toFixed(2);
  const sessionText = (b) => `Court ${b.court}, ${dateText(b.date)}, ${hhmm(b.start_hour)} to ${hhmm(b.start_hour + b.hours)}`;

  function parseStart(s) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(String(s == null ? "" : s));
    if (!m || (m[2] && m[2] !== "00")) return null;
    const h = parseInt(m[1], 10);
    if (h === 0 || h === 24) return 24;   // the midnight session at the end of the date
    return h >= 0 && h < 24 ? h : null;
  }
  function normMobile(s) {
    let d = digits(s);
    if (d.startsWith("60")) d = d.slice(1);
    return /^01\d{8,9}$/.test(d) ? d : null;
  }
  const prettyMobile = (d) => d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)} ${d.slice(7)}`;

  function isWeekend(state, date) {
    const dow = dayOfWeek(date);
    return dow === 0 || dow === 6 || ((state.meta && state.meta.public_holidays) || []).includes(date);
  }
  const rateFor = (state, date) => (isWeekend(state, date) ? RATES.weekend : RATES.weekday);

  // Hours taken on each court on one date by held or confirmed bookings (an expired hold stays
  // taken until staff release it, B13).
  function taken(state, date) {
    const t = {};
    COURTS.forEach((c) => (t[c] = new Set()));
    state.bookings.filter((b) => b.date === date && ACTIVE(b)).forEach((b) => {
      for (let h = b.start_hour; h < b.start_hour + b.hours; h++) t[b.court].add(h);
    });
    return t;
  }
  const spanFree = (set, h, n) => { for (let k = h; k < h + n; k++) if (set.has(k)) return false; return true; };
  function ranges(hours) {
    const out = []; let s = null, p = null;
    hours.forEach((h) => { if (s === null) { s = p = h; } else if (h === p + 1) p = h; else { out.push([s, p + 1]); s = p = h; } });
    if (s !== null) out.push([s, p + 1]);
    return out.map(([a, b]) => `${hhmm(a)} to ${hhmm(b)}`);
  }

  /**
   * createCentre(store, resources, options)
   *   store:     { load() -> state, save(state) }
   *   resources: { clauses }   clauses = { "B7": { policy, page, text }, ... } from resources/clauses.json
   *   options:   { now: "YYYY-MM-DDTHH:MM" or () => string, faults: { down, takeOnRequest } }
   * Returns { tools, call(name, input, ctx), session }.
   *   ctx (from the host, never from the model): { turn: number, uploads: ["UP-001"] }
   * One centre object = one conversation (the session holds verified and own bookings).
   */
  function createCentre(store, resources, options) {
    const opts = options || {};
    const nowIso = () => (typeof opts.now === "function" ? opts.now() : opts.now || "2026-10-16T10:00");
    const faults = opts.faults || {};
    const clauses = (resources && resources.clauses) || {};
    const session = {
      verified: [], own: [], failedChecks: 0, quotes: {}, systemFailures: 0, invalidReceipts: 0,
      handoversByTurn: {}, attempts: [], madeByTurn: {}, unclearClausesByTurn: {},
    };
    // Items made in a turn get the reply the player saw ("told_player") when the turn ends.
    const made = (ctx, kind, id) => (session.madeByTurn[ctx.turn] = session.madeByTurn[ctx.turn] || []).push({ kind, id });
    const contactOf = (ctx) => (ctx && ctx.contact) || null;
    const msgOf = (ctx) => String((ctx && ctx.message) || "").trim();
    let takeoverDone = false;

    const canSee = (ref) => session.verified.includes(ref) || session.own.includes(ref);
    const find = (state, ref) => state.bookings.find((b) => b.booking_ref === ref);

    function down() {
      if (!faults.down) return null;
      session.systemFailures += 1;
      return session.systemFailures < 2
        ? fail("system_unavailable", "The booking system did not respond. You may retry once.", true)
        : fail("system_unavailable", "The booking system is still not responding. Do not retry. Hand to staff with reason system_unavailable.", false);
    }

    function checkDate(date) {
      const today = nowIso().slice(0, 10);
      if (!isIsoDate(date)) return fail("invalid_input", "Date must be YYYY-MM-DD.", true);
      if (date < today) return fail("date_in_past", `That date has passed. Today is ${today}.`, true);
      const last = addDays(today, WINDOW_DAYS);
      if (date > last) return fail("outside_booking_window", `Bookings are open for today and the next 7 days, up to ${last} (B1). ${date} opens for booking on ${addDays(date, -WINDOW_DAYS)}.`, false);
      return null;
    }
    function checkSession(h, n) {
      if (h === null) return fail("invalid_input", "start_time must be on the hour, HH:00 in 24-hour time.", true);
      if (!Number.isInteger(n) || n < 1) return fail("invalid_input", "hours must be 1, 2 or 3.", true);
      if (n > MAX_HOURS) return fail("too_long", "Sessions are 1 to 3 hours (B2). Longer sessions are booked by staff: hand to staff with reason staff_only_booking (B20).", false);
      if (h < OPEN_HOUR || h + n > CLOSE_HOUR) return fail("outside_opening_hours", "Sessions run inside opening hours, 07:00 to 01:00 (O3). The last session ends at 01:00.", true);
      return null;
    }
    // First start hour on a date that is at least 2 hours from now (B3).
    function earliestStart(date) {
      const now = toMin(nowIso());
      const h = Math.ceil((now + LEAD_HOURS * 60 - toMin(date)) / 60);
      return Math.max(OPEN_HOUR, h);
    }
    function freeHours(set, date) {
      const out = [];
      for (let h = earliestStart(date); h < CLOSE_HOUR; h++) if (!set.has(h)) out.push(h);
      return out;
    }
    function alternatives(state, date, court, h, n) {
      const t = taken(state, date), first = earliestStart(date);
      const otherCourts = COURTS.filter((c) => c !== court && spanFree(t[c], h, n)).slice(0, 4);
      const times = [];
      for (let d = 1; d < CLOSE_HOUR && times.length < 3; d++) {
        for (const s of [h - d, h + d]) {
          if (times.length < 3 && s >= first && s + n <= CLOSE_HOUR && spanFree(t[court], s, n)) times.push(`${hhmm(s)} to ${hhmm(s + n)}`);
        }
      }
      return { other_courts_same_time: otherCourts.map((c) => `Court ${c}`), same_court_nearest_times: times };
    }

    const handlers = {
      check_availability({ date, court, start_time, hours }) {
        const dn = down(); if (dn) return dn;
        const bad = checkDate(date); if (bad) return bad;
        const state = store.load();
        const t = taken(state, date);
        const base = { ok: true, date, day: LONG_DAYS[dayOfWeek(date)], fee_per_court_per_hour_rm: rateFor(state, date) };
        if (court != null && !COURTS.includes(Number(court))) return fail("invalid_input", "Courts are numbered 1 to 12.", true);
        if (start_time != null && start_time !== "") {
          const h = parseStart(start_time), n = hours == null ? 1 : Number(hours);
          const bs = checkSession(h, n); if (bs) return bs;
          if (h < earliestStart(date)) return fail("too_late_to_book", "That session starts in less than 2 hours. Bookings close 2 hours before the session; the player books at the counter (B3).", false);
          const free = COURTS.filter((c) => spanFree(t[c], h, n));
          const out = Object.assign(base, { start: hhmm(h), end: hhmm(h + n), hours: n, free_courts: free.map((c) => `Court ${c}`) });
          if (court != null) {
            out.requested_court = { court: Number(court), free: free.includes(Number(court)) };
            if (!out.requested_court.free) Object.assign(out, alternatives(state, date, Number(court), h, n));
          }
          return out;
        }
        const list = (court != null ? [Number(court)] : COURTS).map((c) => ({ court: c, free: ranges(freeHours(t[c], date)) }));
        return Object.assign(base, { bookable_from: hhmm(earliestStart(date)), courts: list, note: "Free or taken only; times under 2 hours away are not shown." });
      },

      request_booking(input, ctx) {
        const dn = down(); if (dn) return dn;
        const court = Number(input.court);
        if (!COURTS.includes(court)) return fail("invalid_input", "Courts are numbered 1 to 12.", true);
        const bad = checkDate(input.date); if (bad) return bad;
        const h = parseStart(input.start_time), n = Number(input.hours);
        const bs = checkSession(h, n); if (bs) return bs;
        if (h < earliestStart(input.date)) return fail("too_late_to_book", "That session starts in less than 2 hours. Bookings close 2 hours before the session; the player books at the counter (B3).", false);
        const name = String(input.player_name || "").trim();
        if (!name) return fail("missing_details", "Ask the player for their name (B5).", true);
        const mob = normMobile(input.mobile);
        if (!mob) return fail("invalid_mobile", "The mobile number must be a Malaysian mobile starting 01, e.g. 012-345 6789 (B5). Ask the player to check it.", true);
        if (typeof input.pay_court_fee_now !== "boolean") return fail("missing_details", "Ask the player whether to pay the court fee now with the deposit, or at the counter after the session (B9).", true);

        const state = store.load();
        // Fault injection for the benchmark: another player takes the court first.
        if (faults.takeOnRequest && !takeoverDone) {
          takeoverDone = true;
          const f = faults.takeOnRequest;
          state.bookings.push({ booking_ref: "BK-" + state.meta.next_ref++, court: f.court, date: f.date, start_hour: f.start_hour, hours: f.hours,
            player_name: "Another player", mobile: "019-000 0000", court_fee_rm: f.hours * rateFor(state, f.date), deposit_rm: DEPOSIT,
            pay_fee_now: false, amount_due_now_rm: DEPOSIT, status: "held", requested_at: nowIso(), hold_expires_at: fromMin(toMin(nowIso()) + HOLD_MINUTES),
            confirmed_at: null, paid: { deposit_rm: 0, court_fee_rm: 0 }, source: "other_player" });
          store.save(state);
        }
        const t = taken(state, input.date);
        if (!spanFree(t[court], h, n))
          return Object.assign(fail("slot_taken", `Court ${court} is not free for ${hhmm(h)} to ${hhmm(h + n)} on ${input.date}. Offer the alternatives below (B6).`, true),
            { alternatives: alternatives(state, input.date, court, h, n) });
        const s0 = toMin(input.date) + h * 60, s1 = s0 + n * 60;
        const overlapping = state.bookings.filter((b) => ACTIVE(b) && digits(b.mobile) === mob && sessionStart(b) < s1 && s0 < sessionEnd(b));
        if (overlapping.length >= MAX_COURTS_AT_ONCE)
          return fail("court_limit", "This mobile number already holds 2 courts at that time. A player may hold up to 2 courts at the same time (B4); more courts are booked by staff (B20).", false);

        const ref = "BK-" + state.meta.next_ref++;
        const fee = n * rateFor(state, input.date);
        const payNow = input.pay_court_fee_now;
        const amount = DEPOSIT + (payNow ? fee : 0);
        const now = nowIso();
        const expires = fromMin(toMin(now) + HOLD_MINUTES);
        state.bookings.push({
          booking_ref: ref, court, date: input.date, start_hour: h, hours: n,
          player_name: name, mobile: prettyMobile(mob), court_fee_rm: fee, deposit_rm: DEPOSIT,
          pay_fee_now: payNow, amount_due_now_rm: amount, status: "held", requested_at: now, hold_expires_at: expires,
          confirmed_at: null, paid: { deposit_rm: 0, court_fee_rm: 0 }, source: "assistant", contact: contactOf(ctx), question: msgOf(ctx),
        });
        store.save(state);
        session.own.push(ref);
        made(ctx, "booking", ref);
        return {
          ok: true, booking_ref: ref, status: "held", court, date: input.date, start: hhmm(h), end: hhmm(h + n),
          court_fee_rm: fee, deposit_rm: DEPOSIT, amount_to_pay_now_rm: amount, court_fee_due_after_session_rm: payNow ? 0 : fee,
          hold_expires_at: expires.slice(11),
          payment: { method: "DuitNow QR", recipient: CENTRE, reference: ref, amount_rm: amount },
          message: `Held, not confirmed. The page shows the DuitNow QR. The player pays ${rm(amount)} with reference ${ref} and uploads the receipt in this chat by ${expires.slice(11)} (B11, B12). Staff confirm after finding the payment (B14).`,
        };
      },

      verify_booking({ booking_ref, mobile_last4 }, ctx) {
        if (session.failedChecks >= MAX_CHECKS)
          return fail("locked", "Booking check locked after 3 failed attempts (B18). Do not check again. Hand to staff with reason check_failed.", false);
        const last4 = String(mobile_last4 == null ? "" : mobile_last4).trim();
        if (!/^\d{4}$/.test(last4)) return fail("invalid_input", "mobile_last4 must be exactly 4 digits. Ask the player.", true);
        const ref = normRef(booking_ref);
        const b = find(store.load(), ref);
        if (!b || digits(b.mobile).slice(-4) !== last4) {
          session.failedChecks += 1;
          session.attempts.push({ booking_ref: ref, mobile_last4: last4, at: nowIso(), message: String((ctx && ctx.message) || "").trim() });
          const left = MAX_CHECKS - session.failedChecks;
          return fail(left > 0 ? "no_match" : "locked",
            left > 0 ? `The booking reference and mobile digits do not match. Share nothing about the booking. ${left} attempt(s) left (B17).`
                     : "The booking reference and mobile digits do not match. No attempts left (B18): hand to staff with reason check_failed.",
            left > 0);
        }
        if (!session.verified.includes(ref)) session.verified.push(ref);
        return { ok: true, verified: true, booking_ref: ref };
      },

      get_booking({ booking_ref }) {
        const ref = normRef(booking_ref);
        if (!canSee(ref)) return fail("not_verified", "This booking has not been verified in this conversation. Ask for the reference and the last 4 digits of the mobile, then call verify_booking (B17).", true);
        const state = store.load();
        const b = find(state, ref);
        const rc = state.receipts.filter((r) => r.booking_ref === ref).slice(-1)[0];
        const cx = state.cancellations.find((c) => c.booking_ref === ref && c.status === "pending");
        const out = {
          booking_ref: ref, status: b.status, court: b.court, date: b.date, day: LONG_DAYS[dayOfWeek(b.date)],
          start: hhmm(b.start_hour), end: hhmm(b.start_hour + b.hours), hours: b.hours,
          court_fee_rm: b.court_fee_rm, deposit_rm: b.deposit_rm,
          paid_rm: { deposit: b.paid.deposit_rm, court_fee: b.paid.court_fee_rm },
          court_fee_due_at_counter_rm: b.status === "confirmed" ? b.court_fee_rm - b.paid.court_fee_rm : null,
        };
        if (b.status === "held") {
          out.amount_to_pay_now_rm = b.amount_due_now_rm;
          out.hold_expires_at = b.hold_expires_at.slice(11);
          out.hold_expired = !rc && toMin(nowIso()) > toMin(b.hold_expires_at);
          out.receipt_uploaded = !!rc;
        }
        if (cx) out.cancellation_pending = true;
        return { ok: true, booking: out };
      },

      report_payment(input, ctx) {
        const dn = down(); if (dn) return dn;
        const up = String(input.upload_id || "").trim().toUpperCase();
        const state = store.load();
        const upload = (state.uploads || []).find((u) => u.upload_id === up);
        if (!up || !(ctx.uploads || []).includes(up) || !upload || upload.used)
          return fail("receipt_required", "Payment is reported only by uploading the receipt in this chat (B12). No image came with this message. Ask the player to upload the payment receipt.", false);
        const ref = normRef(input.booking_ref);
        if (!canSee(ref)) return fail("not_verified", "This booking was not made or verified in this conversation. Ask for the reference and the last 4 digits of the mobile, then call verify_booking (B17).", true);
        const b = find(state, ref);
        const earlier = state.receipts.some((r) => r.booking_ref === ref);
        if (b.status === "held" && !earlier && toMin(nowIso()) > toMin(b.hold_expires_at))
          return fail("hold_expired", `The hold on ${ref} expired at ${b.hold_expires_at.slice(11)}, 30 minutes after the request, with no payment reported (B13). The receipt cannot be attached to it. The court is not released yet: it stays marked on the staff dashboard until staff release it, so do not say it has been released. Offer to check availability for a new booking, or hand to staff with reason refund_issue_or_complaint if the player has already sent money.`, false);
        if (b.status !== "held") return fail("not_held", `${ref} is not waiting for payment (status ${b.status}). Do not record a receipt. Hand to staff if the player has sent money.`, false);
        if (input.document_type !== "payment_receipt")
          return fail("not_a_receipt", "The image is not a payment receipt or cannot be read (B24). Ask the player to upload the payment receipt again.", true);
        const amount = Number(input.amount_rm);
        const paidAt = String(input.paid_at || "").trim().replace(" ", "T");
        const reference = String(input.reference || "").trim();
        const recipient = String(input.recipient || "").trim();
        if (!(amount > 0) || !reference || !recipient || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(paidAt)) {
          session.invalidReceipts += 1;
          return fail("invalid_fields", session.invalidReceipts < 2
            ? "Pass amount_rm as a number, reference, recipient, and paid_at as YYYY-MM-DDTHH:MM, read from the receipt. Try once more."
            : "The receipt fields still cannot be read. Ask the player to upload a clearer receipt.", session.invalidReceipts < 2);
        }
        const differences = [];
        if (Math.abs(amount - b.amount_due_now_rm) > 0.005)
          differences.push({ field: "amount", receipt: rm(amount), expected: rm(b.amount_due_now_rm), note: `The receipt shows ${rm(amount)}; ${rm(b.amount_due_now_rm)} is due.` });
        if (normRef(reference) !== ref)
          differences.push({ field: "reference", receipt: reference, expected: ref, note: `The receipt reference is ${reference}, not ${ref}.` });
        if (toMin(paidAt) < toMin(b.requested_at))
          differences.push({ field: "paid_at", receipt: paidAt, expected: `after ${b.requested_at}`, note: "The receipt is dated before the booking was made." });
        if (!/subang\s*badminton\s*arena/i.test(recipient))
          differences.push({ field: "recipient", receipt: recipient, expected: CENTRE, note: `The recipient is ${recipient}, not ${CENTRE}.` });
        const id = "RC-" + String(state.receipts.length + 1).padStart(3, "0");
        state.receipts.push({
          receipt_id: id, booking_ref: ref, image: upload.image, uploaded_at: nowIso(),
          fields: { document_type: "payment_receipt", amount_rm: amount, reference, paid_at: paidAt, recipient },
          differences, status: "to_check", contact: contactOf(ctx), question: msgOf(ctx),
        });
        upload.used = true;
        store.save(state);
        made(ctx, "receipt", id);
        return {
          ok: true, receipt_id: id, booking_ref: ref, recorded: true, booking_status: "held",
          differences: differences.map((x) => x.note),
          message: "Receipt recorded for staff to check. The booking is still held, not confirmed: staff confirm only after finding the payment in the bank record (B14, B25), and the player gets a message when they do." +
            (differences.length ? " Tell the player each difference; staff will check it." : ""),
        };
      },

      quote_cancellation({ booking_ref }, ctx) {
        const ref = normRef(booking_ref);
        if (!session.verified.includes(ref)) return fail("not_verified", "Verify the booking first: reference and last 4 digits of the mobile (C1, B17).", true);
        const state = store.load();
        const b = find(state, ref);
        if (b.status === "held") return fail("not_confirmed", "This booking is held, not confirmed. If it is unpaid, the hold expires on its own and nothing is charged (C2). If the player has sent a payment, hand to staff with reason refund_issue_or_complaint.", false);
        if (b.status === "no_show" || b.status === "completed" || toMin(nowIso()) >= sessionStart(b))
          return fail("session_started", "The session has started or passed, so it cannot be cancelled. A no-show forfeits the deposit (C5).", false);
        if (b.status !== "confirmed") return fail("not_confirmed", `This booking is ${b.status}; there is nothing to cancel.`, false);
        if (state.cancellations.some((c) => c.booking_ref === ref && c.status === "pending"))
          return fail("already_requested", "A cancellation request for this booking is already waiting for staff.", false);
        const refund = { deposit_rm: b.paid.deposit_rm, court_fee_rm: b.paid.court_fee_rm, total_rm: b.paid.deposit_rm + b.paid.court_fee_rm };
        session.quotes[ref] = { turn: ctx.turn, refund };
        return {
          ok: true, booking_ref: ref, session: sessionText(b), refund,
          message: `If cancelled, ${rm(refund.total_rm)} is refunded (C3) to the account that paid, within 3 working days of staff approval (C4). Tell the player and ask whether to go ahead. Do not submit until they agree in their next message (C7).`,
        };
      },

      request_cancellation({ booking_ref }, ctx) {
        const ref = normRef(booking_ref);
        if (!session.verified.includes(ref)) return fail("not_verified", "Verify the booking first (C1, B17).", true);
        const q = session.quotes[ref];
        if (!q) return fail("no_quote", "Call quote_cancellation first and tell the player the refund (C7).", true);
        if (!(ctx.turn > q.turn)) return fail("no_quote", "The player has not answered the quote yet. Tell them the refund and wait for their agreement (C7).", false);
        const state = store.load();
        const b = find(state, ref);
        if (toMin(nowIso()) >= sessionStart(b)) return fail("session_started", "The session has started, so it cannot be cancelled (C3, C5).", false);
        if (state.cancellations.some((c) => c.booking_ref === ref && c.status === "pending"))
          return fail("already_requested", "A cancellation request for this booking is already waiting for staff.", false);
        const id = "CX-" + String(state.cancellations.length + 1).padStart(3, "0");
        state.cancellations.push({ cancellation_id: id, booking_ref: ref, requested_at: nowIso(), refund: q.refund, status: "pending", contact: contactOf(ctx), question: msgOf(ctx) });
        store.save(state);
        made(ctx, "cancellation", id);
        return {
          ok: true, cancellation_id: id, booking_ref: ref, status: "pending", refund: q.refund,
          message: "Submitted for staff approval. The booking stays in place until staff approve (C8); the player gets a message when they do (C9). Staff pay the refund, not the assistant (C10).",
        };
      },

      hand_to_staff(input, ctx) {
        if (!HANDOVER_REASONS.includes(input.reason))
          return fail("invalid_reason", "reason must be one of: " + HANDOVER_REASONS.join(", "), true);
        const rootCause = String(input.root_cause || "").trim();
        const action = String(input.recommended_action || "").trim();
        if (rootCause.length < 15 || action.length < 10)
          return fail("missing_details", "Staff cannot see this chat. Give root_cause (why it needs a person) and recommended_action (the next step for staff).", true);
        const checked = (Array.isArray(input.clause_ids) ? input.clause_ids : []).map((x) => String(x).trim().toUpperCase()).filter((x) => clauses[x]);
        if (input.reason === "policy_unclear" && !checked.length)
          return fail("missing_details", "For policy_unclear, name the clause that seemed to apply in clause_ids.", true);
        if (input.reason === "check_failed" && session.failedChecks < MAX_CHECKS)
          return fail("not_locked", "check_failed is for a booking check locked after 3 failures (B18). The check is not locked; ask the player to check the reference and digits.", false);
        const tried = input.reason === "check_failed" ? session.attempts.slice() : [];
        const ref = input.booking_ref ? normRef(input.booking_ref) : (tried.length ? tried[tried.length - 1].booking_ref : "");
        const state = store.load();
        const id = "HO-" + String(state.handovers.length + 1).padStart(3, "0");
        state.handovers.push({
          handover_id: id, reason: input.reason, created_at: nowIso(), status: "open",
          // For a failed check, the player's request is the message that started the checks.
          question: (tried.length && tried[0].message) || String((ctx && ctx.message) || "").trim(), contact: contactOf(ctx),
          player_name: input.player_name || "", booking_ref: ref,
          root_cause: rootCause, clause_ids: checked, amount_rm: typeof input.amount_rm === "number" ? input.amount_rm : null,
          checks_tried: tried, recommended_action: action, told_player: "", replies: [],
        });
        store.save(state);
        (session.handoversByTurn[ctx.turn] = session.handoversByTurn[ctx.turn] || []).push(input.reason);
        if (input.reason === "policy_unclear") (session.unclearClausesByTurn[ctx.turn] = session.unclearClausesByTurn[ctx.turn] || []).push(...checked);
        made(ctx, "handover", id);
        return { ok: true, handover_id: id, message: "Handed to staff with the summary. Tell the player staff will follow up here. Do not promise a time." };
      },

      reply_to_player(input, ctx) {
        const message = String(input.message || "").trim();
        if (!message) return fail("invalid_input", "message is empty.", true);
        const asked = Array.isArray(input.clause_ids) ? input.clause_ids : [];
        const ids = [], dropped = [];
        asked.forEach((x) => {
          const id = String(x).trim().toUpperCase();
          if (clauses[id]) { if (!ids.includes(id)) ids.push(id); } else dropped.push(String(x));
        });
        const turnHandovers = session.handoversByTurn[ctx.turn] || [];
        if (!POLICY_CASES.includes(input.policy_case))
          return fail("invalid_input", "policy_case must be one of: " + POLICY_CASES.join(", "), true);
        const needs = CASE_NEEDS[input.policy_case];
        if (needs && !turnHandovers.includes(needs))
          return fail("handover_not_made", `A ${input.policy_case} question goes to staff: call hand_to_staff with reason ${needs}${needs === "policy_unclear" ? " and clause_id" : ""} first, then reply. Do not offer to pass it on; pass it on.`, true);
        if (HANDOVER_OFFER.test(message) && !turnHandovers.length)
          return fail("handover_not_made", "Do not offer to pass the question to staff. If it belongs with staff (not covered, unclear, or another handover reason), call hand_to_staff now, then reply; otherwise answer without the offer.", true);
        // A reply may say staff will take it up only if the handover was actually made this turn.
        if (HANDOVER_CLAIM.test(message) && !turnHandovers.length)
          return fail("handover_not_made", "The reply says the enquiry goes to staff, but hand_to_staff was not called in this turn. Call hand_to_staff with the matching reason first, then reply.", true);
        // A reply that says the policies do not settle the question must come with the handover (four-way rule).
        if (POLICY_GAP_CLAIM.test(message) && !turnHandovers.length)
          return fail("handover_not_made", "The reply says the policy does not settle the question. Then it is not covered (hand_to_staff reason not_in_policy) or unclear (reason policy_unclear, with clause_id). Call hand_to_staff first; do not offer to ask or suggest the player asks.", true);
        // The player is cited the same clauses the unclear handover names for staff.
        (session.unclearClausesByTurn[ctx.turn] || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); });
        const notCovered = turnHandovers.some((r) => NOT_COVERED_REASONS.includes(r));
        const citations = notCovered ? [] : ids.map((id) => ({ id, policy: clauses[id].policy, page: clauses[id].page, label: `${clauses[id].policy}, Clause ${id}` }));
        const line = notCovered ? "Not covered by policy" : citations.map((c) => c.label).join(" · ");
        const items = session.madeByTurn[ctx.turn] || [];
        if (items.length) {
          const state = store.load();
          const told = message + (line ? "\n" + line : "");
          const where = { handover: ["handovers", "handover_id"], receipt: ["receipts", "receipt_id"], cancellation: ["cancellations", "cancellation_id"], booking: ["bookings", "booking_ref"] };
          items.forEach(({ kind, id }) => { const [k, f] = where[kind]; const x = state[k].find((y) => y[f] === id); if (x) x.told_player = told; });
          store.save(state);
        }
        return { ok: true, policy_case: input.policy_case, reply: message, citation_line: line, citations, not_covered: notCovered, dropped_clause_ids: dropped };
      },
    };

    function call(name, input, ctx) {
      const h = handlers[name];
      if (!h) return fail("unknown_tool", `No tool named ${name}.`, false);
      try { return h(input || {}, ctx || { turn: 0, uploads: [] }); }
      catch (e) { return fail("system_unavailable", "The tool failed. Hand the enquiry to staff with reason system_unavailable.", false); }
    }

    return { tools: TOOL_DEFINITIONS, call, session };
  }

  // ---------- host actions: what the page or benchmark records, never the model ----------

  // The player attached an image: store it and return the upload_id shown to Claude with it.
  function registerUpload(store, image, now) {
    const state = store.load();
    state.uploads = state.uploads || [];
    const id = "UP-" + String(state.uploads.length + 1).padStart(3, "0");
    state.uploads.push({ upload_id: id, image, uploaded_at: now, used: false });
    store.save(state);
    return id;
  }

  // ---------- staff actions and their fixed messages (B13, B15, B16, C9) ----------

  function pushMessage(state, ref, kind, text, now, chatId) {
    state.messages = state.messages || [];
    const b = ref && state.bookings.find((x) => x.booking_ref === ref);
    const chat = chatId || (b && b.contact && b.contact.chat_id) || "";
    state.messages.push({ booking_ref: ref || "", chat_id: chat, kind, text, at: now });
    return text;
  }

  const STAFF = {
    confirm(state, ref, now) {
      const b = state.bookings.find((x) => x.booking_ref === ref);
      if (!b || b.status !== "held") return fail("not_held", "Only a held booking can be confirmed.", false);
      b.status = "confirmed"; b.confirmed_at = now;
      b.paid = { deposit_rm: b.deposit_rm, court_fee_rm: b.pay_fee_now ? b.court_fee_rm : 0 };
      state.receipts.filter((r) => r.booking_ref === ref && r.status === "to_check").forEach((r) => (r.status = "confirmed"));
      const due = b.court_fee_rm - b.paid.court_fee_rm;
      return { ok: true, message: pushMessage(state, ref, "confirmed",
        `Booking confirmed: ${ref}, ${sessionText(b)}. Amount paid ${rm(b.amount_due_now_rm)}. ` +
        (due > 0 ? `Court fee ${rm(due)} is due at the counter after the session.` : "Court fee paid in full.") +
        " Please check in at the counter at least 10 minutes before the session.", now) };
    },
    notReceived(state, ref, now) {
      const b = state.bookings.find((x) => x.booking_ref === ref);
      if (!b || b.status !== "held") return fail("not_held", "Only a held booking can be marked not received.", false);
      b.status = "released";
      state.receipts.filter((r) => r.booking_ref === ref && r.status === "to_check").forEach((r) => (r.status = "not_received"));
      return { ok: true, message: pushMessage(state, ref, "not_received",
        `Payment not received: we could not find the payment for ${ref} (${sessionText(b)}) in our bank record, so the court has been released. Please contact the counter if you have paid.`, now) };
    },
    release(state, ref, now) {
      const b = state.bookings.find((x) => x.booking_ref === ref);
      if (!b || b.status !== "held") return fail("not_held", "Only a held booking can be released.", false);
      b.status = "released";
      return { ok: true, message: pushMessage(state, ref, "released",
        `Hold expired: no payment was reported within 30 minutes for ${ref} (${sessionText(b)}), so the court has been released. Nothing has been charged.`, now) };
    },
    approveCancellation(state, id, now) {
      const c = state.cancellations.find((x) => x.cancellation_id === id);
      if (!c || c.status !== "pending") return fail("not_pending", "No pending cancellation with that ID.", false);
      const b = state.bookings.find((x) => x.booking_ref === c.booking_ref);
      c.status = "approved"; c.approved_at = now; b.status = "cancelled";
      const fee = c.refund.court_fee_rm > 0 ? ` and the court fee of ${rm(c.refund.court_fee_rm)} paid at booking` : "";
      return { ok: true, message: pushMessage(state, b.booking_ref, "cancelled",
        `Cancellation approved: ${b.booking_ref} (${sessionText(b)}) is cancelled and the court released. Your deposit of ${rm(c.refund.deposit_rm)}${fee} will be refunded to the account that paid within 3 working days.`, now) };
    },
    // Staff answer a handover; the text goes to the player's chat as written.
    reply(state, id, now, text) {
      const h = state.handovers.find((x) => x.handover_id === id);
      const t = String(text || "").trim();
      if (!h || h.status !== "open") return fail("not_open", "No open handover with that ID.", false);
      if (t.length < 2) return fail("invalid_input", "Write the reply first.", false);
      h.replies = h.replies || [];
      h.replies.push({ text: t, at: now });
      return { ok: true, message: pushMessage(state, h.booking_ref, "staff_reply", t, now, h.contact && h.contact.chat_id) };
    },
    closeHandover(state, id, now) {
      const h = state.handovers.find((x) => x.handover_id === id);
      if (!h || h.status !== "open") return fail("not_open", "No open handover with that ID.", false);
      h.status = "done"; h.closed_at = now;
      return { ok: true, message: null };
    },
  };

  // Dashboard view of a booking: green available, amber held, red held past 30 minutes with no receipt, navy booked.
  function holdState(state, b, now) {
    if (b.status !== "held") return null;
    const rc = state.receipts.some((r) => r.booking_ref === b.booking_ref && r.status === "to_check");
    if (rc) return "receipt_uploaded";
    return toMin(now) > toMin(b.hold_expires_at) ? "expired" : "waiting";
  }

  // ---------- calendar: the pages follow the day they are opened ----------
  // The seed is written around Fri 16 Oct 2026, 10:00. The pages move every date by whole
  // weeks to the nearest week of today, so weekdays and the weekend fee stay in place, and
  // move the seed's recent activity (holds, receipts, cancellation requests) so it keeps its
  // age relative to the moment the page is opened. The benchmark keeps the fixed dates.
  const SEED_NOW = "2026-10-16T10:00";
  const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  function shiftState(state, days, recentMin) {
    const s = JSON.parse(JSON.stringify(state));
    const day = (iso) => (iso ? fromMin(toMin(iso) + days * 1440).slice(0, iso.length) : iso);
    const recent = (iso) => (iso ? fromMin(toMin(iso) + days * 1440 + recentMin) : iso);
    s.bookings.forEach((b) => {
      b.date = day(b.date);
      if (b.status === "held") { b.requested_at = recent(b.requested_at); b.hold_expires_at = recent(b.hold_expires_at); }
      else { b.requested_at = day(b.requested_at); b.confirmed_at = day(b.confirmed_at); }
    });
    s.receipts.forEach((r) => { r.uploaded_at = recent(r.uploaded_at); r.fields.paid_at = recent(r.fields.paid_at); });
    s.cancellations.forEach((c) => (c.requested_at = recent(c.requested_at)));
    s.handovers.forEach((h) => { h.created_at = recent(h.created_at); (h.checks_tried || []).forEach((a) => (a.at = recent(a.at))); });
    (s.uploads || []).forEach((u) => (u.uploaded_at = recent(u.uploaded_at)));
    (s.messages || []).forEach((m) => (m.at = recent(m.at)));
    s.meta.public_holidays = (s.meta.public_holidays || []).map(day);
    return s;
  }

  // Saved state, or the seed moved to now. Saved state from an earlier week moves by whole weeks only.
  function stateForNow(stored, seed, nowDate) {
    const now = localIso(nowDate || new Date());
    if (stored && stored.bookings) {
      const from = stored.meta.anchor_now || SEED_NOW;
      const weeks = Math.round(daysBetween(from.slice(0, 10), now.slice(0, 10)) / 7);
      if (!weeks) return stored;
      const out = shiftState(stored, weeks * 7, 0);
      out.meta.anchor_now = fromMin(toMin(from) + weeks * 7 * 1440);
      return out;
    }
    const weeks = Math.round(daysBetween(SEED_NOW.slice(0, 10), now.slice(0, 10)) / 7);
    const shiftedNow = toMin(SEED_NOW) + weeks * 7 * 1440;
    const out = shiftState(seed, weeks * 7, toMin(now) - shiftedNow);
    out.meta.anchor_now = fromMin(shiftedNow);
    return out;
  }

  // Resources as the MCP server exposes them.
  const RESOURCE_LIST = [
    { uri: "policy://operation", name: "Operation Policy", mimeType: "text/markdown", key: "operation", file: "Operation Policy.md" },
    { uri: "policy://booking", name: "Booking Policy", mimeType: "text/markdown", key: "booking", file: "Booking Policy.md" },
    { uri: "policy://cancellation", name: "Cancellation Policy", mimeType: "text/markdown", key: "cancellation", file: "Cancellation Policy.md" },
  ];

  return {
    createCentre, registerUpload, STAFF, holdState, stateForNow, localIso, HANDOVER_CLAIM, POLICY_GAP_CLAIM, HANDOVER_OFFER,
    TOOL_DEFINITIONS, TOOL_CHECKS, RESOURCE_LIST, HANDOVER_REASONS, NOT_COVERED_REASONS, POLICY_CASES,
    CENTRE, RATES, DEPOSIT, HOLD_MINUTES, COURTS, OPEN_HOUR, CLOSE_HOUR,
    helpers: { toMin, fromMin, addDays, hhmm, dateText, sessionText, rm, digits, normRef, isWeekend, rateFor, taken },
  };
});
