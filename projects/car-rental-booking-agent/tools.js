/* Kereta Sewa Jalan-jalan: the agent's tools and the staff actions, written once.
 *
 * Loaded by the MCP server (mcp_server.mjs, Node), the benchmark, and both pages
 * (assistant.html, demo.html), so every rule below is the same everywhere.
 *
 * Every rule the agent must never break lives here, in code, not in the prompt:
 * hours 9am to 6pm, the 2-hour minimum, the 14-day limit, same day and more than 30 days
 * ahead passed to staff, overlap and maintenance, the price from the rates with the caps,
 * details present, 2 bookings per mobile, the identity check with its lock, quote before
 * cancellation, receipts compared in code, fixed handover reasons, and replies checked for
 * clause IDs, handover claims and prices. No tool confirms, cancels, changes, extends or
 * refunds a booking, and none lists bookings or names a customer. Those are staff buttons
 * (STAFF below), each sending a fixed message written here, never by the AI.
 *
 * Each tool returns { ok: true, ... } or
 * { ok: false, error, message, retryable, handover }, where handover names the reason to
 * hand to staff with, or is null.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CarRentalTools = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const COMPANY = "Kereta Sewa Jalan-jalan";
  const PAYEE = "Kereta Sewa Jalan-jalan Sdn Bhd";
  const OPEN_HOUR = 9, CLOSE_HOUR = 18;          // R1
  const DEPOSIT = 100;                           // R5
  const MIN_HOURS = 2;                           // R12
  const MAX_HOURS = 14 * 24;                     // R17
  const MAX_DAYS_AHEAD = 30;                     // R16
  const MAX_ACTIVE_PER_MOBILE = 2;               // R8
  const MAX_CHECKS = 3;
  const PER_KM = 1;                              // R11
  const HOME = "KLIA";                           // R10
  const TIERS = {                                // Car Inventory, approved 19 Oct
    Standard: { seats: 4, hourly_rm: 20, daily_rm: 120, weekly_rm: 700 },
    Premium: { seats: 4, hourly_rm: 35, daily_rm: 200, weekly_rm: 1200 },
    SUV: { seats: 7, hourly_rm: 65, daily_rm: 380, weekly_rm: 2300 },
    MPV: { seats: 7, hourly_rm: 120, daily_rm: 700, weekly_rm: 4200 },
  };
  const ACTIVE_STATUSES = ["pending", "confirmed", "rented", "cancellation_requested"];

  // 25 reason codes in five groups (Step C, approved 19 Oct).
  const HANDOVER_GROUPS = {
    urgent: ["urgent_on_road", "pickup_problem", "urgent_safety"],
    booking_rules: ["far_ahead", "same_day", "long_or_corporate", "group_booking", "delivery_quote", "out_of_hours"],
    existing_booking: ["late_return", "extend", "change_request", "lost_item", "fine", "documents", "cross_border", "driver_eligibility"],
    money_and_disputes: ["refund_issue", "complaint", "damage", "receipt_problem"],
    process: ["asks_for_staff", "check_failed", "not_in_policy", "system_unavailable"],
  };
  const HANDOVER_REASONS = [].concat(...Object.values(HANDOVER_GROUPS));
  const NEEDS_BOOKING = ["late_return", "extend", "change_request", "receipt_problem"];

  // A reply that tells the customer staff have the enquiry (N23).
  // ("Staff confirm once they find the payment" and "staff review it from 9am" are facts about the process, not a handover.)
  const HANDOVER_CLAIM = /\b(passed|forwarded|handed|referred|escalated|sent)\b[^.]{0,40}\b(to|with)\b[^.]{0,10}\b(staff|team|colleagues?)\b|\b(staff|team|colleagues?)\b[^.]{0,20}\b(will|can|would)\s+(follow up|get back|contact you|reach out|look into|call you|arrange)/i;
  const PRICE = /\bRM\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi;

  // ---------- tool definitions (shared by MCP, the benchmark and the pages) ----------

  const WHEN = {
    pickup_date: { type: "string", description: "YYYY-MM-DD" },
    pickup_time: { type: "string", description: "HH:MM, 24-hour, on the hour or half hour, e.g. 10:00" },
    return_date: { type: "string", description: "YYYY-MM-DD" },
    return_time: { type: "string", description: "HH:MM, 24-hour" },
  };
  const WHICH = {
    tier: { type: "string", enum: Object.keys(TIERS), description: "Optional" },
    model: { type: "string", description: "Optional, e.g. Perodua Myvi, Toyota Alphard" },
  };

  const TOOL_DEFINITIONS = [
    {
      name: "check_availability",
      description:
        "Find free cars for a pickup and return date and time, with the price worked out in code (R12 to R14). " +
        "Give a tier or a model, or neither to see every model, cheapest first. Never shows who booked. " +
        "If nothing is free it returns not_available with the nearest alternatives. " +
        "A refusal names the handover reason when the rental is for staff: same_day, too_far_ahead, too_long, out_of_hours. " +
        "Errors: invalid_input, missing_times, out_of_hours, too_short, too_long, same_day, too_far_ahead, not_available, system_unavailable.",
      input_schema: { type: "object", properties: Object.assign({}, WHICH, WHEN), required: ["pickup_date", "return_date"] },
    },
    {
      name: "request_booking",
      description:
        "Create ONE booking request for one car. Code picks a free car of the model or tier, checks every rule again at the moment of writing, " +
        "issues the reference, and blocks the car until staff confirm or reject it (R6). It never confirms a booking. " +
        "Ask the customer first for anything missing: name, mobile (Malaysian or international), driving licence number, and pickup and return place (KLIA unless they say otherwise). " +
        "Never ask for licence or IC images, or card numbers. A place other than KLIA is recorded for staff to set the delivery charge (R11), and code records the delivery_quote handover itself. " +
        "Returns the reference, price, the RM 100 deposit and the DuitNow payment details. " +
        "Errors: as check_availability, plus missing_details, invalid_mobile, booking_limit.",
      input_schema: {
        type: "object",
        properties: Object.assign({}, WHICH, WHEN, {
          pickup_place: { type: "string", description: "KLIA, or the address the customer gave" },
          return_place: { type: "string", description: "KLIA, or the address the customer gave" },
          customer_name: { type: "string" },
          mobile: { type: "string", description: "e.g. 012-345 6789 or +65 9123 4567" },
          licence_no: { type: "string", description: "Driving licence number as the customer gives it" },
        }),
        required: ["pickup_date", "pickup_time", "return_date", "return_time", "pickup_place", "return_place", "customer_name", "mobile", "licence_no"],
      },
    },
    {
      name: "verify_booking",
      description:
        "Check that the customer owns a booking: the reference plus the last 4 digits of the mobile on it, both given by the customer. Never guess either. " +
        "Required before get_booking, report_payment, quote_cancellation or request_cancellation on a booking not made in this conversation. " +
        "The same error comes back whether the booking does not exist or the digits are wrong. After 3 failures it locks: hand to staff with reason check_failed. " +
        "Errors: invalid_input, no_match, check_locked.",
      input_schema: {
        type: "object",
        properties: {
          booking_ref: { type: "string", description: "e.g. KS-2041" },
          mobile_last4: { type: "string", description: "4 digits as text, e.g. \"6789\"" },
        },
        required: ["booking_ref", "mobile_last4"],
      },
    },
    {
      name: "get_booking",
      description:
        "Return ONE booking: car, dates, times, places, amounts and status. Only for a booking verified or made in this conversation. Never a list. " +
        "Errors: not_verified.",
      input_schema: { type: "object", properties: { booking_ref: { type: "string" } }, required: ["booking_ref"] },
    },
    {
      name: "report_payment",
      description:
        "Record the customer's deposit payment for staff to check (R7), on a pending booking verified or made in this conversation. " +
        "method receipt: the customer uploaded the receipt IN THIS MESSAGE; read the image and pass upload_id, amount, payment reference, date and time paid, and recipient. " +
        "method word: the customer says they paid, with no receipt. " +
        "Either way the booking stays pending until staff find the payment in the bank and confirm. Code compares a receipt with the booking; " +
        "a difference returns receipt_mismatch, the receipt is still recorded for staff, and you hand to staff with reason receipt_problem. " +
        "Errors: not_verified, not_pending, receipt_required, not_a_receipt, invalid_input, receipt_mismatch, system_unavailable.",
      input_schema: {
        type: "object",
        properties: {
          booking_ref: { type: "string" },
          method: { type: "string", enum: ["receipt", "word"] },
          upload_id: { type: "string", description: "For a receipt: the upload_id shown with the image, e.g. UP-001" },
          document_type: { type: "string", enum: ["payment_receipt", "not_a_receipt", "unreadable"] },
          amount_rm: { type: "number" },
          reference: { type: "string", description: "Payment reference on the receipt" },
          paid_at: { type: "string", description: "YYYY-MM-DDTHH:MM on the receipt" },
          recipient: { type: "string", description: "Recipient name on the receipt" },
        },
        required: ["booking_ref", "method"],
      },
    },
    {
      name: "quote_cancellation",
      description:
        "Work out what a cancellation would refund, from the fixed clock: 24 hours or more before pickup, the deposit paid is refunded in full (R19); " +
        "less than 24 hours, the deposit is kept (R20). Only after verify_booking. Tell the customer and ask whether to go ahead; nothing is submitted. " +
        "Errors: not_verified, already_started, not_cancellable, already_requested.",
      input_schema: { type: "object", properties: { booking_ref: { type: "string" } }, required: ["booking_ref"] },
    },
    {
      name: "request_cancellation",
      description:
        "Record a cancellation request for staff. Only after quote_cancellation for the same booking, and only when the customer agreed in a later message. " +
        "The booking becomes cancellation requested, not cancelled; staff confirm it and process any refund (R22, R23). " +
        "Errors: not_verified, quote_first, already_started, already_requested.",
      input_schema: { type: "object", properties: { booking_ref: { type: "string" } }, required: ["booking_ref"] },
    },
    {
      name: "hand_to_staff",
      description:
        "Hand the enquiry to staff, who work from a queue and cannot see this chat. One record per handover, in the eight-field format: " +
        "reason, urgent, customer, booking, what the customer asked, what you told them, clauses involved, time. Code sets urgent, the time and what you told them (from your reply). " +
        "Reasons: urgent: urgent_on_road (breakdown or accident on the road), pickup_problem (a problem at pickup now), urgent_safety (a safety concern; also give 999). " +
        "Booking rules: far_ahead (more than 30 days ahead, R16), same_day (R16), long_or_corporate (over 2 weeks or corporate, R17), group_booking (more than 2 cars per mobile, R8), " +
        "delivery_quote (recorded by request_booking itself), out_of_hours (pickup or return outside 9am to 6pm, R2). " +
        "Existing booking: late_return (R38), extend (R32), change_request (R28), lost_item, fine (R48), documents, cross_border (R47), " +
        "driver_eligibility (only what R39 to R42 do not settle; staff decide eligibility from the documents at pickup). " +
        "Money and disputes: refund_issue, complaint, damage (set car_cannot_be_driven when the customer says so), receipt_problem. " +
        "Process: asks_for_staff (at once, no questions), check_failed (only after the identity check locked), not_in_policy (nothing written covers it, or the policy does not settle it), system_unavailable. " +
        "Errors: invalid_reason, missing_details, not_locked.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", enum: HANDOVER_REASONS },
          customer_asked: { type: "string", description: "What the customer asked, in one sentence of facts, e.g. \"Alphard from 2 Dec 10am to 5 Dec 4pm, KLIA\"" },
          clause_ids: { type: "array", items: { type: "string" }, description: "Clauses involved, e.g. [\"R16\"]; [] if none" },
          booking_ref: { type: "string", description: "If the enquiry is about a booking" },
          customer_name: { type: "string", description: "Only if the customer gave it" },
          customer_mobile: { type: "string", description: "Only if the customer gave it" },
          car_cannot_be_driven: { type: "boolean", description: "damage only: true when the customer says the car cannot be driven" },
        },
        required: ["reason", "customer_asked", "clause_ids"],
      },
    },
    {
      name: "reply_to_customer",
      description:
        "Send your reply to the customer. Every reply goes through this tool, including questions, in the customer's language (English, Malay or Mandarin). " +
        "Pass the clause IDs the reply relies on (e.g. R12, R5); code builds the citation line with links. " +
        "Code refuses: a clause ID that does not exist (uncited_clause); a reply saying the customer was passed to staff, or staff will follow up, without hand_to_staff in this turn (unrecorded_handover); " +
        "and an amount in RM that no tool result in this conversation, and no rate in the inventory, gave (price_mismatch). This ends your turn.",
      input_schema: {
        type: "object",
        properties: {
          message: { type: "string", description: "The reply, without a citation line" },
          clause_ids: { type: "array", items: { type: "string" }, description: "e.g. [\"R12\", \"R5\"]" },
        },
        required: ["message", "clause_ids"],
      },
    },
  ];

  // What each tool's code enforces, for the "How it works" view. Keep in step with the handlers.
  const TOOL_CHECKS = {
    check_availability: ["Pickup and return 9am to 6pm (R1, R2); at least 2 hours (R12); at most 14 days (R17)", "Not today and not more than 30 days ahead (R16); maintenance and any overlap excluded (R6)", "Price from the rates with the caps (R12 to R14); never shows who booked"],
    request_booking: ["Every availability check again at the moment of writing", "Name, mobile and licence number present (R4); at most 2 active bookings per mobile (R8)", "Reference from code; a place away from KLIA records a delivery_quote handover (R11)"],
    verify_booking: ["Reference and last 4 digits both match, compared as text", "Same error whether the booking is missing or the digits are wrong", "Locked after 3 failures; then only check_failed"],
    get_booking: ["Only a booking verified or made in this conversation", "One booking, never a list", "No mobile or licence number returned"],
    report_payment: ["Pending bookings only; the booking stays pending (R7)", "A receipt needs an image uploaded in this message", "Amount, reference and recipient compared in code; a difference requires a receipt_problem handover"],
    quote_cancellation: ["Verified first", "24 hours or more before pickup: deposit refunded; less: deposit kept (R19, R20)", "From the fixed clock"],
    request_cancellation: ["Only after a quote, in a later message", "Cancellation requested, not cancelled (R22)"],
    hand_to_staff: ["One of 25 fixed reasons; check_failed only after the lock", "Eight fields for staff who cannot see the chat", "Urgent set by code from the reason"],
    reply_to_customer: ["Clause IDs must exist", "A handover claim needs a handover this turn (N23)", "Every price must come from a tool result or the inventory (N16)"],
  };

  // ---------- helpers ----------

  const fail = (error, message, retryable, handover) => ({ ok: false, error, message, retryable: !!retryable, handover: handover || null });
  const digits = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  const normRef = (s) => { const d = digits(s); return d ? "KS-" + d : ""; };
  const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !isNaN(new Date(s + "T00:00:00Z"));
  const toMin = (iso) => Math.round(Date.parse(iso.length === 10 ? iso + "T00:00:00Z" : iso.slice(0, 16) + ":00Z") / 60000);
  const fromMin = (m) => new Date(m * 60000).toISOString().slice(0, 16);
  const addDays = (iso, n) => fromMin(toMin(iso) + n * 1440).slice(0, iso.length === 10 ? 10 : 16);
  const daysBetween = (a, b) => Math.round((toMin(b.slice(0, 10)) - toMin(a.slice(0, 10))) / 1440);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateText = (iso) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
  const timeText = (iso) => { const h = +iso.slice(11, 13), m = iso.slice(14, 16); return `${h % 12 || 12}${m === "00" ? "" : ":" + m}${h < 12 ? "am" : "pm"}`; };
  const whenText = (iso) => `${dateText(iso)} ${timeText(iso)}`;
  const rm = (n) => "RM " + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const rentalText = (b) => `${b.model}, ${whenText(b.pickup_at)} at ${b.pickup_place} to ${whenText(b.return_at)} at ${b.return_place}`;
  const isActive = (b) => ACTIVE_STATUSES.includes(b.status);

  function parseTime(s) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(String(s == null ? "" : s));
    if (!m || !["00", "30"].includes(m[2])) return null;
    const h = parseInt(m[1], 10);
    return h <= 23 ? `${String(h).padStart(2, "0")}:${m[2]}` : null;
  }
  const inHours = (t) => t >= `${String(OPEN_HOUR).padStart(2, "0")}:00` && t <= `${CLOSE_HOUR}:00`;

  // Malaysian 01x numbers (with or without +60), or any international number with a + prefix (R4).
  function normMobile(s) {
    const raw = String(s == null ? "" : s).trim();
    let d = digits(raw);
    if (raw.startsWith("+") && !d.startsWith("60")) return d.length >= 8 && d.length <= 15 ? { digits: d, pretty: "+" + d.slice(0, d.length - 8) + " " + d.slice(-8, -4) + " " + d.slice(-4) } : null;
    if (d.startsWith("60")) d = d.slice(1);
    if (!/^01\d{8,9}$/.test(d)) return null;
    return { digits: d, pretty: d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)} ${d.slice(7)}` };
  }

  // R12 to R14, with the parts a reply may quote.
  function priceOf(tier, hours) {
    const r = TIERS[tier];
    if (hours <= 5) return { total_rm: hours * r.hourly_rm, parts: { hours, hourly_rm: r.hourly_rm }, rule: "R12", how: `${hours} hours x ${rm(r.hourly_rm)}` };
    const days = Math.floor(hours / 24), rem = hours % 24;
    if (days === 0) return { total_rm: r.daily_rm, parts: { days: 1, daily_rm: r.daily_rm }, rule: "R12", how: `${hours} hours counts as one day, ${rm(r.daily_rm)}` };
    const weeks = Math.floor(days / 7), rest = days % 7;
    const extra = Math.min(rem * r.hourly_rm, r.daily_rm);
    const raw = weeks * r.weekly_rm + rest * r.daily_rm + extra;
    const total = Math.min(raw, 2 * r.weekly_rm);
    const parts = { weeks, weeks_rm: weeks * r.weekly_rm, days: rest, days_rm: rest * r.daily_rm, extra_hours: rem, extra_hours_rm: extra };
    const how = [weeks ? `${weeks} week${weeks > 1 ? "s" : ""} ${rm(weeks * r.weekly_rm)}` : "", rest ? `${rest} day${rest > 1 ? "s" : ""} ${rm(rest * r.daily_rm)}` : "",
      rem ? `${rem} extra hour${rem > 1 ? "s" : ""} ${rm(extra)}${rem * r.hourly_rm > r.daily_rm ? " (capped at one day)" : ""}` : ""].filter(Boolean).join(" + ");
    return { total_rm: total, parts, rule: weeks ? "R14" : rem ? "R13" : "R12", how: how + (total < raw ? `, capped at the two-week rate ${rm(total)}` : "") };
  }

  function overlaps(b, p0, p1) { return toMin(b.pickup_at) < p1 && p0 < toMin(b.return_at); }

  /**
   * createAgency(store, resources, options)
   *   store:     { load() -> state, save(state) }
   *   resources: { clauses }   from resources/clauses.json
   *   options:   { now: "YYYY-MM-DDTHH:MM" or () => string, faults: { down } }
   * Returns { tools, call(name, input, ctx), session }.
   *   ctx (from the host, never from the model): { turn, uploads: ["UP-001"], message, contact }
   * One agency object = one conversation (the session holds verified and own bookings).
   */
  function createAgency(store, resources, options) {
    const opts = options || {};
    const nowIso = () => (typeof opts.now === "function" ? opts.now() : opts.now || "2026-10-20T10:00");
    const faults = opts.faults || {};
    const clauses = (resources && resources.clauses) || {};
    const session = { verified: [], own: [], failedChecks: 0, attempts: [], quotes: {}, systemFailures: 0, handoversByTurn: {}, madeByTurn: {}, amounts: new Set() };
    const made = (ctx, kind, id) => (session.madeByTurn[ctx.turn] = session.madeByTurn[ctx.turn] || []).push({ kind, id });
    const msgOf = (ctx) => String((ctx && ctx.message) || "").trim();
    const canSee = (ref) => session.verified.includes(ref) || session.own.includes(ref);
    const find = (state, ref) => state.bookings.find((b) => b.booking_ref === ref);
    const nextId = (list, prefix) => prefix + String(list.length + 1).padStart(3, "0");

    // Every amount a tool shows the agent may appear in a reply (N16).
    function remember(x) {
      if (typeof x === "number") session.amounts.add(Math.round(x * 100));
      else if (x && typeof x === "object") Object.values(x).forEach(remember);
      return x;
    }
    Object.values(TIERS).forEach((t) => [t.hourly_rm, t.daily_rm, t.weekly_rm].forEach((n) => session.amounts.add(n * 100)));
    [DEPOSIT, PER_KM, 0].forEach((n) => session.amounts.add(n * 100));

    function down() {
      if (!faults.down) return null;
      session.systemFailures += 1;
      return session.systemFailures < 2
        ? fail("system_unavailable", "The booking system did not respond. You may retry once.", true)
        : fail("system_unavailable", "The booking system is still not responding. Do not retry. Hand to staff with reason system_unavailable and state no availability or price.", false, "system_unavailable");
    }

    function cars(state, { tier, model, car_id }) {
      let list = state.cars;
      if (car_id) list = list.filter((c) => c.car_id === String(car_id).toUpperCase());
      if (tier) {
        const t = Object.keys(TIERS).find((k) => k.toLowerCase() === String(tier).toLowerCase());
        if (!t) return { error: fail("invalid_input", "tier must be one of: " + Object.keys(TIERS).join(", "), true) };
        list = list.filter((c) => c.tier === t);
      }
      if (model) {
        const q = String(model).toLowerCase().replace(/\s+/g, " ").trim();
        const hit = list.filter((c) => c.model.toLowerCase() === q || c.model.toLowerCase().split(" ").slice(1).join(" ") === q || c.model.toLowerCase().includes(q));
        if (!hit.length) {
          const names = [...new Set(state.cars.map((c) => c.model))];
          return { error: fail("invalid_input", `No model "${model}" in the inventory. Models: ${names.join(", ")}.`, true) };
        }
        list = hit;
      }
      return { list };
    }

    // The rules every rental must pass, in the order a customer would want to hear them.
    function checkRental(input) {
      const today = nowIso().slice(0, 10);
      const { pickup_date: pd, return_date: rd } = input;
      if (!isIsoDate(pd) || !isIsoDate(rd)) return { error: fail("invalid_input", "pickup_date and return_date must be YYYY-MM-DD.", true) };
      if (pd < today) return { error: fail("invalid_input", `That pickup date has passed. Today is ${today}.`, true) };
      if (rd < pd) return { error: fail("invalid_input", "The return date is before the pickup date.", true) };
      if (pd === today) return { error: fail("same_day", "A rental starting today is arranged by staff (R16). Do not book it. Hand to staff with reason same_day.", false, "same_day") };
      if (daysBetween(today, pd) > MAX_DAYS_AHEAD)
        return { error: fail("too_far_ahead", `A rental starting more than 30 days from today (after ${addDays(today, MAX_DAYS_AHEAD)}) is arranged by staff (R16). Do not book it. Hand to staff with reason far_ahead.`, false, "far_ahead") };
      if (daysBetween(pd, rd) > 14)
        return { error: fail("too_long", "A rental longer than 2 weeks is passed to staff, who may offer a long-term rate (R17). Quote no price and promise no discount. Hand to staff with reason long_or_corporate.", false, "long_or_corporate") };
      if (input.pickup_time == null || input.pickup_time === "" || input.return_time == null || input.return_time === "")
        return { error: fail("missing_times", "Ask the customer for the pickup and return times (9am to 6pm).", true) };
      const pt = parseTime(input.pickup_time), rt = parseTime(input.return_time);
      if (!pt || !rt) return { error: fail("invalid_input", "Times must be HH:MM in 24-hour time, on the hour or half hour.", true) };
      if (!inHours(pt) || !inHours(rt))
        return { error: fail("out_of_hours", "Pickup and return are handled from 9am to 6pm (R1). A pickup or return outside those hours is arranged by staff (R2): hand to staff with reason out_of_hours, or offer a time inside the hours.", false, "out_of_hours") };
      const p0 = toMin(`${pd}T${pt}`), p1 = toMin(`${rd}T${rt}`);
      if (p1 <= p0) return { error: fail("invalid_input", "The return time is before the pickup time.", true) };
      const hours = Math.ceil((p1 - p0) / 60);
      if (hours < MIN_HOURS) return { error: fail("too_short", "The minimum rental is 2 hours (R12). Offer at least 2 hours.", true) };
      if (hours > MAX_HOURS)
        return { error: fail("too_long", "A rental longer than 2 weeks is passed to staff, who may offer a long-term rate (R17). Quote no price and promise no discount. Hand to staff with reason long_or_corporate.", false, "long_or_corporate") };
      return { p0, p1, hours, pickup_at: `${pd}T${pt}`, return_at: `${rd}T${rt}` };
    }

    function freeCars(state, list, p0, p1) {
      const busy = new Set(state.bookings.filter((b) => isActive(b) && overlaps(b, p0, p1)).map((b) => b.car_id));
      return list.filter((c) => c.status === "active" && !busy.has(c.car_id));
    }
    function byModel(free, hours) {
      const out = {};
      free.forEach((c) => {
        out[c.model] = out[c.model] || { model: c.model, tier: c.tier, seats: c.seats, free_cars: 0, car_ids: [], price: priceOf(c.tier, hours) };
        out[c.model].free_cars += 1; out[c.model].car_ids.push(c.car_id);
      });
      return Object.values(out).sort((a, b) => a.price.total_rm - b.price.total_rm || a.model.localeCompare(b.model));
    }
    // Nearest alternatives: other models of the same tier for the same period, then the same choice moved by up to 3 days.
    function alternatives(state, wanted, rental) {
      const tiers = [...new Set(wanted.map((c) => c.tier))];
      const sameTier = byModel(freeCars(state, state.cars.filter((c) => tiers.includes(c.tier) && !wanted.includes(c)), rental.p0, rental.p1), rental.hours);
      const shifted = [];
      const today = nowIso().slice(0, 10);
      for (let d = 1; d <= 3 && shifted.length < 3; d++) {
        for (const s of [-d, d]) {
          const p0 = rental.p0 + s * 1440, p1 = rental.p1 + s * 1440, day = fromMin(p0).slice(0, 10);
          if (day <= today || daysBetween(today, day) > MAX_DAYS_AHEAD || shifted.length >= 3) continue;
          if (freeCars(state, wanted, p0, p1).length) shifted.push({ pickup_at: fromMin(p0), return_at: fromMin(p1), when: `${whenText(fromMin(p0))} to ${whenText(fromMin(p1))}` });
        }
      }
      return { other_models_same_period: sameTier, same_choice_nearest_dates: shifted };
    }

    const handlers = {
      check_availability(input) {
        const dn = down(); if (dn) return dn;
        const r = checkRental(input); if (r.error) return r.error;
        const state = store.load();
        const c = cars(state, input); if (c.error) return c.error;
        const free = freeCars(state, c.list, r.p0, r.p1);
        const base = { pickup_at: r.pickup_at, return_at: r.return_at, hours: r.hours, deposit_rm: DEPOSIT, pickup_and_return: "KLIA free (R10); any other place RM 1 per km from KLIA, charge set by staff (R11)" };
        if (!free.length)
          return remember(Object.assign(fail("not_available", `No ${input.model || input.tier || "car"} is free from ${whenText(r.pickup_at)} to ${whenText(r.return_at)} (R6). Offer the nearest alternatives below.`, true),
            base, { alternatives: alternatives(state, c.list, r) }));
        return remember(Object.assign({ ok: true }, base, { free: byModel(free, r.hours), note: "Prices from the rates with the caps (R12 to R14). Free or taken only; never who booked." }));
      },

      request_booking(input, ctx) {
        const dn = down(); if (dn) return dn;
        const r = checkRental(input); if (r.error) return r.error;
        const name = String(input.customer_name || "").trim(), lic = String(input.licence_no || "").trim();
        const pickupPlace = String(input.pickup_place || "").trim(), returnPlace = String(input.return_place || "").trim();
        const missing = [!name && "name", !String(input.mobile || "").trim() && "mobile number", !lic && "driving licence number", !pickupPlace && "pickup place", !returnPlace && "return place"].filter(Boolean);
        if (missing.length) return fail("missing_details", `Ask the customer for: ${missing.join(", ")} (R4). Do not ask for images of the licence or IC.`, true);
        const mob = normMobile(input.mobile);
        if (!mob) return fail("invalid_mobile", "The mobile number is not valid. A Malaysian number starts 01 (e.g. 012-345 6789); an international number starts with + and the country code (R4). Ask the customer to check it.", true);
        if (!input.tier && !input.model && !input.car_id) return fail("missing_details", "Ask which tier or model the customer wants.", true);
        const state = store.load();
        const c = cars(state, input); if (c.error) return c.error;
        const held = state.bookings.filter((b) => isActive(b) && digits(b.mobile) === mob.digits);
        if (held.length >= MAX_ACTIVE_PER_MOBILE)
          return fail("booking_limit", "This mobile number already holds 2 bookings. One mobile number may hold up to 2 bookings at the same time; more cars are passed to staff (R8). Hand to staff with reason group_booking.", false, "group_booking");
        const free = freeCars(state, c.list, r.p0, r.p1);
        if (!free.length)
          return remember(Object.assign(fail("not_available", `No ${input.model || input.tier} is free for that period any more (R6). Offer the nearest alternatives below.`, true), { alternatives: alternatives(state, c.list, r) }));
        const car = free[0];
        const ref = "KS-" + state.meta.next_ref++;
        const now = nowIso();
        const away = (p) => !/^\s*klia\b/i.test(p);
        const delivery = away(pickupPlace) || away(returnPlace) ? { pickup: away(pickupPlace), return: away(returnPlace), charge_rm: null } : null;
        const hourNow = +now.slice(11, 13);
        const afterHours = hourNow < OPEN_HOUR || hourNow >= CLOSE_HOUR;
        const price = priceOf(car.tier, r.hours);
        const b = {
          booking_ref: ref, car_id: car.car_id, tier: car.tier, model: car.model, pickup_at: r.pickup_at, return_at: r.return_at, hours: r.hours,
          pickup_place: away(pickupPlace) ? pickupPlace : HOME, return_place: away(returnPlace) ? returnPlace : HOME, delivery,
          customer_name: name, mobile: mob.pretty, licence_no: lic, price_rm: price.total_rm, deposit_rm: DEPOSIT,
          status: "pending", requested_at: now, confirmed_at: null, after_hours: afterHours,
          payment: { reported: null, reported_at: null, deposit_paid_rm: 0 }, source: "agent", contact: (ctx && ctx.contact) || null, question: msgOf(ctx),
        };
        state.bookings.push(b);
        let handoverId = null;
        if (delivery) {
          handoverId = nextId(state.handovers, "HO-");
          state.handovers.push({
            handover_id: handoverId, reason: "delivery_quote", urgent: false, customer: { name, mobile: mob.pretty }, booking: ref,
            customer_asked: `${car.model} from ${whenText(r.pickup_at)} to ${whenText(r.return_at)}; pickup ${b.pickup_place}, return ${b.return_place}.`,
            agent_told: "", clauses: ["R6", "R11"], time: now, status: "open", customer_words: msgOf(ctx), contact: (ctx && ctx.contact) || null,
          });
          (session.handoversByTurn[ctx.turn] = session.handoversByTurn[ctx.turn] || []).push("delivery_quote");
          made(ctx, "handover", handoverId);
        }
        store.save(state);
        session.own.push(ref);
        made(ctx, "booking", ref);
        return remember({
          ok: true, booking_ref: ref, status: "pending", car: car.model, tier: car.tier, pickup_at: r.pickup_at, return_at: r.return_at,
          pickup_place: b.pickup_place, return_place: b.return_place, hours: r.hours, price, deposit_rm: DEPOSIT,
          payment: { method: "DuitNow QR", recipient: PAYEE, reference: ref, amount_rm: DEPOSIT },
          delivery_charge: delivery ? "RM 1 per km from KLIA, set by staff (R11)" : null, delivery_handover: handoverId,
          message: `Pending, not confirmed. The car is blocked until staff confirm or reject the request (R6). The customer pays the ${rm(DEPOSIT)} deposit by DuitNow QR with reference ${ref} and reports it here by receipt or by saying it was paid (R7).` +
            (afterHours ? " The request was made outside 9am to 6pm: tell the customer it is recorded and staff review it from 9am (R3)." : "") +
            (delivery ? " Staff set the delivery or collection charge at RM 1 per km from KLIA (R11); the delivery_quote handover is recorded." : ""),
        });
      },

      verify_booking({ booking_ref, mobile_last4 }, ctx) {
        if (session.failedChecks >= MAX_CHECKS)
          return fail("check_locked", "The identity check is locked after 3 failures. Do not check again. Hand to staff with reason check_failed.", false, "check_failed");
        const last4 = String(mobile_last4 == null ? "" : mobile_last4).trim();
        if (!/^\d{4}$/.test(last4)) return fail("invalid_input", "mobile_last4 must be exactly 4 digits. Ask the customer.", true);
        const ref = normRef(booking_ref);
        const b = find(store.load(), ref);
        if (!b || digits(b.mobile).slice(-4) !== last4) {
          session.failedChecks += 1;
          session.attempts.push({ booking_ref: ref, mobile_last4: last4, at: nowIso(), message: msgOf(ctx) });
          const left = MAX_CHECKS - session.failedChecks;
          return left > 0
            ? fail("no_match", `The reference and mobile digits do not match. Share nothing about the booking. ${left} attempt(s) left.`, true)
            : fail("check_locked", "The reference and mobile digits do not match. No attempts left: hand to staff with reason check_failed.", false, "check_failed");
        }
        if (!session.verified.includes(ref)) session.verified.push(ref);
        return { ok: true, verified: true, booking_ref: ref };
      },

      get_booking({ booking_ref }) {
        const ref = normRef(booking_ref);
        if (!canSee(ref)) return fail("not_verified", "This booking has not been verified in this conversation. Ask for the reference and the last 4 digits of the mobile, then call verify_booking.", true);
        const state = store.load();
        const b = find(state, ref);
        const pay = (state.payments || []).filter((p) => p.booking_ref === ref).slice(-1)[0];
        return remember({
          ok: true, booking: {
            booking_ref: ref, status: b.status, car: b.model, tier: b.tier, pickup_at: b.pickup_at, return_at: b.return_at,
            pickup: whenText(b.pickup_at), return: whenText(b.return_at), pickup_place: b.pickup_place, return_place: b.return_place,
            price_rm: b.price_rm, deposit_rm: b.deposit_rm, deposit_paid_rm: b.payment.deposit_paid_rm,
            payment_reported: b.payment.reported || (pay ? pay.method : null),
            delivery_charge_rm: b.delivery ? b.delivery.charge_rm : null,
          },
        });
      },

      report_payment(input, ctx) {
        const dn = down(); if (dn) return dn;
        const ref = normRef(input.booking_ref);
        if (!canSee(ref)) return fail("not_verified", "This booking was not made or verified in this conversation. Ask for the reference and the last 4 digits of the mobile, then call verify_booking.", true);
        const state = store.load();
        state.payments = state.payments || [];
        const b = find(state, ref);
        if (b.status !== "pending") return fail("not_pending", `${ref} is ${b.status.replace("_", " ")}, not waiting for the deposit. Record nothing.`, false);
        const id = nextId(state.payments, "PY-");
        const base = { payment_id: id, booking_ref: ref, reported_at: nowIso(), status: "to_check", contact: (ctx && ctx.contact) || null, customer_words: msgOf(ctx) };
        if (input.method === "word") {
          state.payments.push(Object.assign(base, { method: "word", fields: null, differences: [] }));
          b.payment.reported = "word"; b.payment.reported_at = nowIso();
          store.save(state); made(ctx, "payment", id);
          return { ok: true, payment_id: id, booking_ref: ref, booking_status: "pending", method: "word",
            message: "Recorded as reported by the customer, with no receipt. The booking stays pending until staff find the payment in the bank and confirm (R7). The agent cannot confirm it." };
        }
        if (input.method !== "receipt") return fail("invalid_input", "method must be receipt or word.", true);
        const up = String(input.upload_id || "").trim().toUpperCase();
        const upload = (state.uploads || []).find((u) => u.upload_id === up);
        if (!up || !((ctx && ctx.uploads) || []).includes(up) || !upload || upload.used)
          return fail("receipt_required", "No image came with this message. Ask the customer to upload the receipt, or record the payment with method word if they say they paid without one.", true);
        if (input.document_type !== "payment_receipt")
          return fail("not_a_receipt", "The image is not a payment receipt or cannot be read. Ask the customer to upload the receipt again.", true);
        const amount = Number(input.amount_rm), reference = String(input.reference || "").trim(), recipient = String(input.recipient || "").trim();
        const paidAt = String(input.paid_at || "").trim().replace(" ", "T");
        if (!(amount > 0) || !reference || !recipient || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(paidAt))
          return fail("invalid_input", "Pass amount_rm as a number, reference, recipient, and paid_at as YYYY-MM-DDTHH:MM, read from the receipt.", true);
        const differences = [];
        if (Math.abs(amount - DEPOSIT) > 0.005) differences.push(`The receipt shows ${rm(amount)}; the deposit is ${rm(DEPOSIT)}.`);
        if (normRef(reference) !== ref) differences.push(`The receipt reference is ${reference}, not ${ref}.`);
        if (toMin(paidAt) < toMin(b.requested_at)) differences.push("The receipt is dated before the request was made.");
        if (!/kereta\s*sewa\s*jalan/i.test(recipient)) differences.push(`The recipient is ${recipient}, not ${PAYEE}.`);
        state.payments.push(Object.assign(base, { method: "receipt", image: upload.image, fields: { amount_rm: amount, reference, paid_at: paidAt, recipient }, differences }));
        upload.used = true;
        b.payment.reported = "receipt"; b.payment.reported_at = nowIso();
        store.save(state); made(ctx, "payment", id);
        remember({ amount });
        if (differences.length)
          return Object.assign(fail("receipt_mismatch", "The receipt is recorded for staff, with these differences. Tell the customer each one, hand to staff with reason receipt_problem, and say the booking stays pending.", false, "receipt_problem"),
            { payment_id: id, booking_ref: ref, booking_status: "pending", differences });
        return { ok: true, payment_id: id, booking_ref: ref, booking_status: "pending", method: "receipt", differences: [],
          message: "Receipt recorded for staff to check. The booking stays pending until staff find the payment in the bank and confirm (R7)." };
      },

      quote_cancellation({ booking_ref }, ctx) {
        const ref = normRef(booking_ref);
        if (!session.verified.includes(ref)) return fail("not_verified", "Verify the booking first: reference and last 4 digits of the mobile.", true);
        const state = store.load();
        const b = find(state, ref);
        if (["rented", "returned"].includes(b.status) || toMin(nowIso()) >= toMin(b.pickup_at))
          return fail("already_started", "The rental has started, so it cannot be cancelled. Returning early gives no refund for unused time (R25).", false);
        if (b.status === "cancellation_requested") return fail("already_requested", "A cancellation request for this booking is already waiting for staff.", false);
        if (!["pending", "confirmed"].includes(b.status)) return fail("not_cancellable", `This booking is ${b.status}; there is nothing to cancel.`, false);
        const hoursBefore = (toMin(b.pickup_at) - toMin(nowIso())) / 60;
        const full = hoursBefore >= 24;
        const refund = full ? b.payment.deposit_paid_rm : 0;
        session.quotes[ref] = { turn: ctx.turn, refund_rm: refund, clause: full ? "R19" : "R20" };
        return remember({
          ok: true, booking_ref: ref, rental: rentalText(b), hours_before_pickup: Math.floor(hoursBefore), deposit_paid_rm: b.payment.deposit_paid_rm, refund_rm: refund, clause: full ? "R19" : "R20",
          message: (full ? `Cancelling 24 hours or more before pickup: the deposit paid, ${rm(refund)}, is refunded in full (R19), within 24 hours of staff confirming (R23).`
                         : `Pickup is less than 24 hours away: the deposit is kept (R20).`) +
            " Tell the customer and ask whether to go ahead. Do not submit until they agree in their next message.",
        });
      },

      request_cancellation({ booking_ref }, ctx) {
        const ref = normRef(booking_ref);
        if (!session.verified.includes(ref)) return fail("not_verified", "Verify the booking first.", true);
        const q = session.quotes[ref];
        if (!q) return fail("quote_first", "Call quote_cancellation first and tell the customer the refund.", true);
        if (!(ctx.turn > q.turn)) return fail("quote_first", "The customer has not answered the quote yet. Tell them the refund and wait for their agreement.", false);
        const state = store.load();
        const b = find(state, ref);
        if (toMin(nowIso()) >= toMin(b.pickup_at)) return fail("already_started", "The rental has started, so it cannot be cancelled.", false);
        if (b.status === "cancellation_requested") return fail("already_requested", "A cancellation request for this booking is already waiting for staff.", false);
        const id = nextId(state.cancellations, "CX-");
        state.cancellations.push({ cancellation_id: id, booking_ref: ref, requested_at: nowIso(), refund_rm: q.refund_rm, clause: q.clause, status: "pending",
          contact: (ctx && ctx.contact) || null, customer_words: msgOf(ctx) });
        b.status_before_cancellation = b.status;
        b.status = "cancellation_requested";
        store.save(state);
        made(ctx, "cancellation", id);
        return remember({ ok: true, cancellation_id: id, booking_ref: ref, status: "cancellation_requested", refund_rm: q.refund_rm,
          message: "Recorded for staff. The booking is cancellation requested, not cancelled, until staff confirm it (R22); the customer gets a message when they do." });
      },

      hand_to_staff(input, ctx) {
        if (!HANDOVER_REASONS.includes(input.reason))
          return fail("invalid_reason", "reason must be one of: " + HANDOVER_REASONS.join(", "), true);
        const asked = String(input.customer_asked || "").trim();
        if (asked.length < 8) return fail("missing_details", "Staff cannot see this chat. Give customer_asked: what the customer asked, in one sentence of facts.", true);
        if (input.reason === "check_failed" && session.failedChecks < MAX_CHECKS)
          return fail("not_locked", "check_failed is only for an identity check locked after 3 failures. Ask the customer to check the reference and digits.", false);
        const tried = input.reason === "check_failed" ? session.attempts.slice() : [];
        const ref = input.booking_ref ? normRef(input.booking_ref) : (tried.length ? tried[tried.length - 1].booking_ref : "");
        if (NEEDS_BOOKING.includes(input.reason) && !ref)
          return fail("missing_details", `A ${input.reason} handover needs the booking reference. Ask the customer for it.`, true);
        const state = store.load();
        const b = ref && canSee(ref) ? find(state, ref) : null;
        const ids = (Array.isArray(input.clause_ids) ? input.clause_ids : []).map((x) => String(x).trim().toUpperCase()).filter((x) => clauses[x]);
        const urgent = HANDOVER_GROUPS.urgent.includes(input.reason) || (input.reason === "damage" && input.car_cannot_be_driven === true);
        const id = nextId(state.handovers, "HO-");
        state.handovers.push({
          handover_id: id, reason: input.reason, urgent,
          customer: { name: (b && b.customer_name) || String(input.customer_name || "").trim() || null, mobile: (b && b.mobile) || String(input.customer_mobile || "").trim() || null },
          booking: ref || null, customer_asked: asked, agent_told: "", clauses: ids, time: nowIso(), status: "open",
          customer_words: (tried.length && tried[0].message) || msgOf(ctx), contact: (ctx && ctx.contact) || null, checks_tried: tried,
        });
        store.save(state);
        (session.handoversByTurn[ctx.turn] = session.handoversByTurn[ctx.turn] || []).push(input.reason);
        made(ctx, "handover", id);
        return { ok: true, handover_id: id, urgent,
          message: (urgent ? "Recorded as urgent, at the top of the staff page. " : "Handed to staff. ") +
            (input.reason === "urgent_safety" ? "Tell the customer to call 999 now if anyone is in danger. " : "") +
            "Tell the customer staff will follow up here. Do not promise a time." };
      },

      reply_to_customer(input, ctx) {
        const message = String(input.message || "").trim();
        if (!message) return fail("invalid_input", "message is empty.", true);
        const ids = [], unknown = [];
        (Array.isArray(input.clause_ids) ? input.clause_ids : []).forEach((x) => {
          const id = String(x).trim().toUpperCase();
          if (clauses[id]) { if (!ids.includes(id)) ids.push(id); } else unknown.push(String(x));
        });
        if (unknown.length) return fail("uncited_clause", `No clause ${unknown.join(", ")} in the Rental Policy. Cite only R1 to R48, or none.`, true);
        const turnHandovers = session.handoversByTurn[ctx.turn] || [];
        if (HANDOVER_CLAIM.test(message) && !turnHandovers.length)
          return fail("unrecorded_handover", "The reply says the customer was passed to staff, but no handover was recorded this turn (N23). Call hand_to_staff with the matching reason first, or reword the reply.", true);
        const bad = [];
        message.replace(PRICE, (m, whole, cents) => {
          const v = parseInt(whole.replace(/,/g, ""), 10) * 100 + (cents ? parseInt(cents.padEnd(2, "0"), 10) : 0);
          if (!session.amounts.has(v)) bad.push(m);
          return m;
        });
        if (bad.length)
          return fail("price_mismatch", `${bad.join(", ")} did not come from a tool result in this conversation or the inventory rates (N16). Call check_availability for the price, or remove the amount.`, true);
        const citations = ids.map((id) => ({ id, label: `Rental Policy, ${id}`, page: clauses[id].page }));
        const line = citations.map((c) => c.label).join(" · ");
        const items = session.madeByTurn[ctx.turn] || [];
        if (items.length) {
          const state = store.load();
          const told = message + (line ? "\n" + line : "");
          const where = { handover: ["handovers", "handover_id", "agent_told"], booking: ["bookings", "booking_ref", "told_customer"], payment: ["payments", "payment_id", "told_customer"], cancellation: ["cancellations", "cancellation_id", "told_customer"] };
          items.forEach(({ kind, id }) => { const [k, f, field] = where[kind]; const x = (state[k] || []).find((y) => y[f] === id); if (x) x[field] = told; });
          store.save(state);
        }
        return { ok: true, reply: message, citation_line: line, citations };
      },
    };

    function call(name, input, ctx) {
      const h = handlers[name];
      if (!h) return fail("unknown_tool", `No tool named ${name}.`, false);
      try { return h(input || {}, ctx || { turn: 0, uploads: [] }); }
      catch (e) { return fail("system_unavailable", "The tool failed. Hand the enquiry to staff with reason system_unavailable.", false, "system_unavailable"); }
    }

    return { tools: TOOL_DEFINITIONS, call, session };
  }

  // ---------- host actions: what the page or benchmark records, never the model ----------

  function registerUpload(store, image, now) {
    const state = store.load();
    state.uploads = state.uploads || [];
    const id = "UP-" + String(state.uploads.length + 1).padStart(3, "0");
    state.uploads.push({ upload_id: id, image, uploaded_at: now, used: false });
    store.save(state);
    return id;
  }

  // ---------- staff actions and their fixed messages (Build List section 6) ----------

  function pushMessage(state, ref, kind, text, now, contact) {
    state.messages = state.messages || [];
    const b = ref && state.bookings.find((x) => x.booking_ref === ref);
    const c = contact || (b && b.contact) || null;
    state.messages.push({ booking_ref: ref || "", chat_id: (c && c.chat_id) || "", kind, text, at: now });
    return text;
  }

  const STAFF = {
    confirm(state, ref, now) {
      const b = state.bookings.find((x) => x.booking_ref === ref);
      if (!b || b.status !== "pending") return fail("not_pending", "Only a pending request can be confirmed.", false);
      b.status = "confirmed"; b.confirmed_at = now; b.payment.deposit_paid_rm = DEPOSIT;
      (state.payments || []).filter((p) => p.booking_ref === ref && p.status === "to_check").forEach((p) => (p.status = "confirmed"));
      return { ok: true, message: pushMessage(state, ref, "confirmed",
        `Booking confirmed: ${ref}, ${rentalText(b)}. Deposit ${rm(DEPOSIT)} received. Please bring your driving licence and IC or passport to pickup.`, now) };
    },
    reject(state, ref, now) {
      const b = state.bookings.find((x) => x.booking_ref === ref);
      if (!b || b.status !== "pending") return fail("not_pending", "Only a pending request can be rejected.", false);
      b.status = "rejected";
      (state.payments || []).filter((p) => p.booking_ref === ref && p.status === "to_check").forEach((p) => (p.status = "not_found"));
      return { ok: true, message: pushMessage(state, ref, "rejected",
        `No deposit payment was found for ${ref} (${rentalText(b)}), so the request is cancelled and the car released. Nothing has been charged.`, now) };
    },
    setDeliveryCharge(state, ref, now, amount) {
      const b = state.bookings.find((x) => x.booking_ref === ref);
      const n = Number(amount);
      if (!b || !b.delivery) return fail("no_delivery", "This booking has no pickup or return away from KLIA.", false);
      if (!(n >= 0)) return fail("invalid_input", "Enter the charge in ringgit.", false);
      b.delivery.charge_rm = n;
      state.handovers.filter((h) => h.booking === ref && h.reason === "delivery_quote" && h.status === "open").forEach((h) => { h.status = "done"; h.closed_at = now; });
      const where = [b.delivery.pickup && `pickup at ${b.pickup_place}`, b.delivery.return && `return at ${b.return_place}`].filter(Boolean).join(" and ");
      return { ok: true, message: pushMessage(state, ref, "delivery_charge",
        `Delivery or collection charge for ${ref} (${where}): ${rm(n)}, at RM 1 per km from KLIA.`, now) };
    },
    confirmCancellation(state, id, now) {
      const c = state.cancellations.find((x) => x.cancellation_id === id);
      if (!c || c.status !== "pending") return fail("not_pending", "No pending cancellation with that ID.", false);
      const b = state.bookings.find((x) => x.booking_ref === c.booking_ref);
      c.status = "confirmed"; c.confirmed_at = now; b.status = "cancelled";
      return { ok: true, message: pushMessage(state, b.booking_ref, "cancelled", c.refund_rm > 0
        ? `Cancellation confirmed: ${b.booking_ref} (${rentalText(b)}) is cancelled. Your ${rm(c.refund_rm)} deposit will be refunded to the original payment method within 24 hours.`
        : `Cancellation confirmed: ${b.booking_ref} (${rentalText(b)}) is cancelled. As it was cancelled less than 24 hours before pickup, the deposit is kept.`, now) };
    },
    done(state, id, now) {
      const h = state.handovers.find((x) => x.handover_id === id);
      if (!h || h.status !== "open") return fail("not_open", "No open handover with that ID.", false);
      h.status = "done"; h.closed_at = now;
      return { ok: true, message: null };
    },
  };

  // ---------- calendar: the pages follow the day they are opened ----------
  // The seed is written around Tue 20 Oct 2026, 10:00. The pages move every date by whole
  // weeks to the nearest week of today, and move the recent activity (pending requests,
  // payments, cancellation requests, handovers) so it keeps its age relative to the moment
  // the page is opened. The benchmark keeps the fixed dates.
  const SEED_NOW = "2026-10-20T10:00";
  const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  function shiftState(state, days, recentMin) {
    const s = JSON.parse(JSON.stringify(state));
    const day = (iso) => (iso ? fromMin(toMin(iso) + days * 1440).slice(0, iso.length) : iso);
    const recent = (iso) => (iso ? fromMin(toMin(iso) + days * 1440 + recentMin) : iso);
    s.bookings.forEach((b) => {
      b.pickup_at = day(b.pickup_at); b.return_at = day(b.return_at);
      const live = b.status === "pending" || b.status === "cancellation_requested";
      b.requested_at = (live ? recent : day)(b.requested_at); b.confirmed_at = day(b.confirmed_at);
      if (b.payment) b.payment.reported_at = (live ? recent : day)(b.payment.reported_at);
    });
    (s.payments || []).forEach((p) => { p.reported_at = recent(p.reported_at); if (p.fields) p.fields.paid_at = recent(p.fields.paid_at); });
    s.cancellations.forEach((c) => (c.requested_at = recent(c.requested_at)));
    s.handovers.forEach((h) => { h.time = recent(h.time); (h.checks_tried || []).forEach((a) => (a.at = recent(a.at))); });
    (s.uploads || []).forEach((u) => (u.uploaded_at = recent(u.uploaded_at)));
    (s.messages || []).forEach((m) => (m.at = recent(m.at)));
    s.meta.seed_start = day(s.meta.seed_start); s.meta.seed_end = day(s.meta.seed_end);
    return s;
  }

  function stateForNow(stored, seed, nowDate) {
    const now = localIso(nowDate || new Date());
    if (stored && stored.bookings) {
      const from = stored.meta.anchor_now || SEED_NOW;
      const weeks = Math.round(daysBetween(from, now) / 7);
      if (!weeks) return stored;
      const out = shiftState(stored, weeks * 7, 0);
      out.meta.anchor_now = fromMin(toMin(from) + weeks * 7 * 1440);
      return out;
    }
    const weeks = Math.round(daysBetween(SEED_NOW, now) / 7);
    const shiftedNow = toMin(SEED_NOW) + weeks * 7 * 1440;
    const out = shiftState(seed, weeks * 7, toMin(now) - shiftedNow);
    out.meta.anchor_now = fromMin(shiftedNow);
    return out;
  }

  // Resources as the MCP server exposes them.
  const RESOURCE_LIST = [
    { uri: "policy://rental-policy", name: "Rental Policy", mimeType: "text/markdown", file: "Rental Policy.md" },
    { uri: "inventory://cars", name: "Car Inventory", mimeType: "text/markdown", file: "Car Inventory.md" },
    { uri: "schedule://availability", name: "Fleet schedule, free or taken per car per day", mimeType: "application/json", file: "schedule.json" },
  ];

  return {
    createAgency, registerUpload, STAFF, stateForNow, localIso, HANDOVER_CLAIM, priceOf,
    TOOL_DEFINITIONS, TOOL_CHECKS, RESOURCE_LIST, HANDOVER_REASONS, HANDOVER_GROUPS,
    COMPANY, PAYEE, TIERS, DEPOSIT, OPEN_HOUR, CLOSE_HOUR, SEED_NOW,
    helpers: { toMin, fromMin, addDays, dateText, timeText, whenText, rentalText, rm, digits, normRef, normMobile, isActive },
  };
});
