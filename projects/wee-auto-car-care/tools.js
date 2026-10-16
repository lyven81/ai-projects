/* Wee Auto Car Care: the assistant's tools, written once.
 *
 * Loaded by the MCP server (mcp_server.mjs, Node) and by the browser demo
 * (assistant.html), so the rules below are the same in both places.
 *
 * Every rule the assistant must never break lives here, in code, not in the
 * prompt: the identity check, one record returned with safe fields only,
 * slot checks, pending-only writes, package-only prices, IDs issued by code.
 *
 * Each tool returns { ok: true, ... } or
 * { ok: false, error: { category, retryable, message } }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WeeAutoTools = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

  // Service catalogue: which bay and which mechanic skill each service needs.
  const SERVICES = {
    "Tyre Replacement (4 wheels)": { skill: "tyre", bay: "BAY1" },
    "Tyre Replacement (1 wheel)": { skill: "tyre", bay: "BAY1" },
    "Puncture Repair": { skill: "tyre", bay: "BAY1" },
    "Tyre Rotation": { skill: "rotation", bay: "BAY1" },
    "Wheel Balancing": { skill: "balancing", bay: "BAY1" },
    "Hunter Alignment": { skill: "alignment", bay: "BAY3" },
    "Engine Oil Change": { skill: "oil", bay: "BAY2" },
    "Spark Plug Replacement": { skill: "spark_plug", bay: "BAY2" },
    "Engine Diagnostic": { skill: "diagnostic", bay: "BAY2" },
    "Timing Belt Replacement": { skill: "timing_belt", bay: "BAY2" },
    "AC Gas Top-up": { skill: "ac_topup", bay: "BAY2" },
    "AC Service": { skill: "ac_service", bay: "BAY2" },
    "AC Compressor Repair": { skill: "ac_compressor", bay: "BAY2" },
    "Battery Test": { skill: "battery", bay: "BAY2" },
    "Battery Replacement": { skill: "battery", bay: "BAY1" },
  };

  const MECHANIC_SKILLS = {
    Shamsul: ["oil", "spark_plug", "diagnostic", "timing_belt", "ac_topup", "ac_service", "ac_compressor", "battery", "tyre", "rotation", "balancing"],
    Vishnu: ["tyre", "rotation", "balancing", "alignment", "oil", "spark_plug", "ac_topup", "battery"],
    Albert: ["tyre", "rotation", "oil", "battery"],
  };

  const HANDOVER_REASONS = [
    "release_time_or_progress",
    "money",
    "price_not_in_packages_or_inspection",
    "cancel_or_change_booking",
    "complaint",
    "asked_for_person",
    "not_covered",
    "verification_failed",
  ];

  const MAX_VERIFY_ATTEMPTS = 3;

  // ---------- tool definitions (shared by MCP and the browser) ----------

  const TOOL_DEFINITIONS = [
    {
      name: "verify_customer",
      description:
        "Check that the customer owns a booking, using the booking ID and the last 4 digits of the phone number on that booking. " +
        "Call this before get_booking. Ask the customer for both values; never guess them. " +
        "Returns verified true, or an error. The same error is returned whether the booking does not exist or the digits do not match. " +
        "After 3 failed attempts the check is locked for this conversation and the enquiry must be handed to staff.",
      input_schema: {
        type: "object",
        properties: {
          booking_id: { type: "string", description: "Booking ID as given by the customer, e.g. SVC012" },
          phone_last4: { type: "string", description: "Last 4 digits of the phone number on the booking, as a 4-character string, e.g. \"0427\"" },
        },
        required: ["booking_id", "phone_last4"],
      },
    },
    {
      name: "get_booking",
      description:
        "Return the customer's own booking: date, start time, service and status (pending or confirmed). " +
        "Works only for the booking verified in this conversation by verify_customer, or a booking request made in this conversation. " +
        "Does not return the bill, the ready time or job progress: those questions go to staff via escalate_to_staff.",
      input_schema: {
        type: "object",
        properties: { booking_id: { type: "string", description: "The verified booking ID" } },
        required: ["booking_id"],
      },
    },
    {
      name: "check_availability",
      description:
        "List the free start times on one date for one service package, taking the bay, a mechanic with the right skill and the job length into account. " +
        "Use before request_booking. Only for packages in the service package list; for anything else, hand to staff. " +
        "Date format YYYY-MM-DD. Sundays and past dates are refused.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          package_id: { type: "string", description: "package_id from the service package list, e.g. OIL-FULL-5W30" },
        },
        required: ["date", "package_id"],
      },
    },
    {
      name: "request_booking",
      description:
        "Create a booking REQUEST for one service package at one free start time. The request is saved as pending; staff confirm it. " +
        "It never confirms a booking. Returns the new booking ID for the customer to keep. " +
        "Needs the customer's name, car plate and phone number; ask for any that are missing. One request per car per day.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          start_slot: { type: "string", description: "Start time from check_availability, e.g. 14:00" },
          package_id: { type: "string" },
          customer_name: { type: "string" },
          plate: { type: "string", description: "Car registration plate, e.g. WXY 1234" },
          phone: { type: "string", description: "Malaysian mobile number, e.g. 012-345 6789" },
        },
        required: ["date", "start_slot", "package_id", "customer_name", "plate", "phone"],
      },
    },
    {
      name: "escalate_to_staff",
      description:
        "Hand the enquiry to workshop staff. Use for: release time or job progress; money (bill, payment, deposit, refund, discount); " +
        "a price not in the package list or a job needing inspection; cancelling or changing a booking; a complaint; the customer asking for a person; " +
        "a question the policy guide, FAQ and package list do not answer; 3 failed booking checks. " +
        "Write a summary staff can act on without re-asking the customer. Tell the customer staff will contact them.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", enum: HANDOVER_REASONS },
          summary: { type: "string", description: "What the customer wants and what was already said, in 1 to 3 sentences" },
          customer_name: { type: "string" },
          contact_phone: { type: "string" },
          booking_id: { type: "string", description: "Only if the customer gave one" },
        },
        required: ["reason", "summary"],
      },
    },
  ];

  // What each tool's code enforces, for the "How it works" view. Keep in step with the handlers below.
  const TOOL_CHECKS = {
    verify_customer: ["Booking ID and phone last 4 must both match, compared as text", "Same error whether the booking is missing or the digits are wrong", "Locked after 3 failed attempts in one conversation"],
    get_booking: ["Only the booking verified, or requested, in this conversation", "One booking, never a list", "Date, time, service and status only: no price, ready time or mechanic"],
    check_availability: ["Package must be in the service package list", "No past dates, no Sundays, nothing after the booking window", "Bay free and a mechanic with the right skill free for the whole job"],
    request_booking: ["Package must be in the list; name, plate and phone checked", "Slot re-checked at the moment of writing", "One request per car per day", "Saved as pending; booking and customer IDs issued by code"],
    escalate_to_staff: ["Reason must be one of the 8 fixed reasons", "Summary required so staff need not re-ask", "Saved to the staff queue on the dashboard"],
  };

  // ---------- helpers ----------

  const fail = (category, message, retryable) => ({ ok: false, error: { category, retryable: !!retryable, message } });
  const digits = (s) => String(s == null ? "" : s).replace(/\D/g, "");
  const normId = (s) => String(s == null ? "" : s).trim().toUpperCase().replace(/\s+/g, "");
  const normPlate = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z"));
  const dayOfWeek = (iso) => new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  const slotsNeeded = (min) => Math.max(1, Math.ceil(min / 60));
  const addMinutes = (slot, min) => {
    const t = parseInt(slot, 10) * 60 + min;
    return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
  };
  const ACTIVE = (b) => b.status === "pending" || b.status === "confirmed";

  /**
   * createWorkshop(store, resources, options)
   *   store:     { load() -> state, save(state) }   state = { meta, bookings, handovers }
   *   resources: { policyGuide, faq, servicePackages }  (servicePackages parsed JSON)
   *   options:   { today: "YYYY-MM-DD", lastDate: "YYYY-MM-DD" }
   * Returns { tools: TOOL_DEFINITIONS, call(name, input), session }.
   * One workshop object = one conversation (the session holds the verified booking).
   */
  function createWorkshop(store, resources, options) {
    const opts = options || {};
    const today = opts.today || "2026-03-02";
    const lastDate = opts.lastDate || "2026-03-14";
    const packages = resources.servicePackages.packages;
    const session = { verifiedBookingId: null, ownBookingIds: [], failedVerifications: 0 };

    const findPackage = (id) => packages.find((p) => p.package_id === normId(id));

    function checkDate(date) {
      if (!isIsoDate(date)) return fail("validation", "Date must be YYYY-MM-DD.", true);
      if (date < today) return fail("validation", `Date is in the past. Today is ${today}.`, true);
      if (date > lastDate) return fail("validation", `Bookings are open up to ${lastDate}. Hand later dates to staff.`, false);
      if (dayOfWeek(date) === 0) return fail("validation", "The workshop is closed on Sundays.", true);
      return null;
    }

    function schedule(state, date) {
      const bay = { BAY1: Array(8).fill(false), BAY2: Array(8).fill(false), BAY3: Array(8).fill(false) };
      const mech = {};
      Object.keys(MECHANIC_SKILLS).forEach((m) => (mech[m] = Array(8).fill(false)));
      state.bookings.filter((b) => b.date === date && ACTIVE(b)).forEach((b) => {
        const i0 = SLOTS.indexOf(b.start_slot);
        for (let k = 0; k < b.slots_occupied; k++) {
          bay[b.bay][i0 + k] = true;
          if (mech[b.mechanic]) mech[b.mechanic][i0 + k] = true;
        }
      });
      return { bay, mech };
    }

    // Free start slots for a package on a date, each with the mechanics able to take it.
    function freeStarts(state, date, pkg) {
      const svc = SERVICES[pkg.service];
      const n = slotsNeeded(pkg.duration_min);
      const s = schedule(state, date);
      const out = [];
      for (let i = 0; i + n <= SLOTS.length; i++) {
        let bayFree = true;
        for (let k = 0; k < n; k++) if (s.bay[svc.bay][i + k]) bayFree = false;
        if (!bayFree) continue;
        const mechs = Object.keys(MECHANIC_SKILLS).filter((m) => {
          if (!MECHANIC_SKILLS[m].includes(svc.skill)) return false;
          for (let k = 0; k < n; k++) if (s.mech[m][i + k]) return false;
          return true;
        });
        if (mechs.length) out.push({ slot: SLOTS[i], mechanics: mechs });
      }
      return out;
    }

    const handlers = {
      verify_customer({ booking_id, phone_last4 }) {
        if (session.failedVerifications >= MAX_VERIFY_ATTEMPTS)
          return fail("locked", "Booking check locked after 3 failed attempts. Hand the enquiry to staff with reason verification_failed.", false);
        const last4 = String(phone_last4 == null ? "" : phone_last4).trim();
        if (!/^\d{4}$/.test(last4)) return fail("validation", "phone_last4 must be exactly 4 digits.", true);
        const id = normId(booking_id);
        const b = store.load().bookings.find((x) => x.booking_id === id && ACTIVE(x));
        if (!b || digits(b.phone).slice(-4) !== last4) {
          session.failedVerifications += 1;
          const left = MAX_VERIFY_ATTEMPTS - session.failedVerifications;
          return fail("not_verified",
            left > 0 ? `Booking ID and phone digits do not match. ${left} attempt(s) left.`
                     : "Booking ID and phone digits do not match. No attempts left; hand the enquiry to staff with reason verification_failed.",
            left > 0);
        }
        session.verifiedBookingId = id;
        return { ok: true, verified: true, booking_id: id };
      },

      get_booking({ booking_id }) {
        const id = normId(booking_id);
        if (id !== session.verifiedBookingId && !session.ownBookingIds.includes(id))
          return fail("not_verified", "This booking has not been verified in this conversation. Call verify_customer first.", true);
        const b = store.load().bookings.find((x) => x.booking_id === id && ACTIVE(x));
        if (!b) return fail("not_found", "The booking is no longer active. Hand to staff.", false);
        // Safe fields only: no price, no ready time, no mechanic, no other customer.
        return { ok: true, booking: { booking_id: b.booking_id, date: b.date, start_time: b.start_slot, service: b.package_name || b.service, status: b.status } };
      },

      check_availability({ date, package_id }) {
        const pkg = findPackage(package_id);
        if (!pkg) return fail("not_in_packages", "Not a package in the service package list. Hand to staff with reason price_not_in_packages_or_inspection.", false);
        const bad = checkDate(date);
        if (bad) return bad;
        const starts = freeStarts(store.load(), date, pkg);
        return { ok: true, date, package_id: pkg.package_id, duration_min: pkg.duration_min, free_start_times: starts.map((x) => x.slot) };
      },

      request_booking(input) {
        const pkg = findPackage(input.package_id);
        if (!pkg) return fail("not_in_packages", "Not a package in the service package list. Hand to staff with reason price_not_in_packages_or_inspection.", false);
        const bad = checkDate(input.date);
        if (bad) return bad;
        const name = String(input.customer_name || "").trim();
        const plate = normPlate(input.plate);
        const phone = digits(input.phone);
        if (!name) return fail("validation", "Customer name is missing. Ask the customer.", true);
        if (!/^[A-Z]{1,4}\d{1,4}[A-Z]?$/.test(plate)) return fail("validation", "Plate does not look like a Malaysian registration. Ask the customer to check it.", true);
        if (!/^01\d{8,9}$/.test(phone)) return fail("validation", "Phone must be a Malaysian mobile number starting 01. Ask the customer to check it.", true);

        const state = store.load();
        // Duplicate: same car, same day, already pending or confirmed.
        if (state.bookings.some((b) => b.date === input.date && ACTIVE(b) && normPlate(b.plate) === plate))
          return fail("duplicate", "This car already has a booking on that date. Changes go to staff.", false);
        // Slot re-checked at the moment of writing.
        const slot = String(input.start_slot || "").trim();
        const fit = freeStarts(state, input.date, pkg).find((x) => x.slot === slot);
        if (!fit) return fail("conflict", "That start time is no longer free. Call check_availability again and offer the customer another time.", true);

        // Customer ID: existing customer by phone, otherwise a new one.
        const existing = state.bookings.find((b) => digits(b.phone) === phone && b.customer_id);
        let customerId = existing && existing.customer_id;
        if (!customerId) {
          const maxC = state.bookings.reduce((m, b) => Math.max(m, parseInt(String(b.customer_id || "CUS0").slice(3), 10) || 0), 0);
          customerId = "CUS" + String(maxC + 1).padStart(3, "0");
        }
        const maxB = state.bookings.reduce((m, b) => Math.max(m, parseInt(b.booking_id.slice(3), 10) || 0), 0);
        const bookingId = "SVC" + String(maxB + 1).padStart(3, "0");
        const n = slotsNeeded(pkg.duration_min);
        const i0 = SLOTS.indexOf(slot);
        const svc = SERVICES[pkg.service];
        const pretty = phone.length === 10 ? `${phone.slice(0, 3)}-${phone.slice(3, 6)} ${phone.slice(6)}` : `${phone.slice(0, 3)}-${phone.slice(3, 7)} ${phone.slice(7)}`;
        state.bookings.push({
          booking_id: bookingId, date: input.date, start_slot: slot, slots_occupied: n,
          slot_list: SLOTS.slice(i0, i0 + n), bay: svc.bay, mechanic: fit.mechanics[0],
          service: pkg.service, package_id: pkg.package_id, package_name: pkg.name,
          duration_minutes: pkg.duration_min, ready_at: addMinutes(slot, pkg.duration_min),
          next_bookable_at: SLOTS[i0 + n] || "18:00",
          customer_name: name, plate: input.plate.toUpperCase().trim(), phone: pretty,
          price_rm: pkg.price_rm, status: "pending", customer_id: customerId, source: "assistant",
        });
        store.save(state);
        session.ownBookingIds.push(bookingId);
        return { ok: true, booking_id: bookingId, status: "pending", date: input.date, start_time: slot, package: pkg.name,
                 message: "Booking request saved as pending. Staff will review and confirm it." };
      },

      escalate_to_staff(input) {
        if (!HANDOVER_REASONS.includes(input.reason))
          return fail("validation", "reason must be one of: " + HANDOVER_REASONS.join(", "), true);
        const summary = String(input.summary || "").trim();
        if (summary.length < 10) return fail("validation", "Write a summary staff can act on.", true);
        const state = store.load();
        state.handovers = state.handovers || [];
        const id = "HO" + String(state.handovers.length + 1).padStart(3, "0");
        state.handovers.push({
          handover_id: id, reason: input.reason, summary,
          customer_name: input.customer_name || "", contact_phone: input.contact_phone || "",
          booking_id: input.booking_id ? normId(input.booking_id) : "", status: "open",
        });
        store.save(state);
        return { ok: true, handover_id: id, message: "Handed to staff. Tell the customer staff will contact them." };
      },
    };

    function call(name, input) {
      const h = handlers[name];
      if (!h) return fail("unknown_tool", `No tool named ${name}.`, false);
      try { return h(input || {}); }
      catch (e) { return fail("internal", "The tool failed. Hand the enquiry to staff.", false); }
    }

    return { tools: TOOL_DEFINITIONS, call, session };
  }

  // ---------- calendar: the demo follows the day the page is opened ----------
  // The seed is written for the fortnight starting Mon 2 Mar 2026. The pages move every
  // date by whole weeks so that fortnight starts on the Monday of the current week:
  // weekdays and Sunday closures stay in place. The benchmark keeps the fixed seed dates.
  const SEED_MONDAY = "2026-03-02";
  const addDays = (iso, n) => {
    const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000);
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // { today, anchor (Monday of this week), lastDate (Saturday of next week) }
  function calendar(now) {
    const today = isoLocal(now || new Date());
    const anchor = addDays(today, -((dayOfWeek(today) + 6) % 7));
    return { today, anchor, lastDate: addDays(anchor, 12) };
  }

  function shiftState(state, days) {
    const s = JSON.parse(JSON.stringify(state));
    s.bookings.forEach((b) => (b.date = addDays(b.date, days)));
    if (s.meta) {
      ["demo_period_start", "demo_period_end"].forEach((k) => { if (s.meta[k]) s.meta[k] = addDays(s.meta[k], days); });
      delete s.meta.closed_days; delete s.meta.day_stats; // seed-calendar notes, not used by the pages
    }
    return s;
  }

  // Saved state (or the seed) moved to the current fortnight. Saved state from an
  // earlier week is moved forward with everything the visitor added to it.
  function stateForToday(stored, seed, now) {
    const cal = calendar(now);
    const base = stored && stored.bookings ? stored : seed;
    const from = (base.meta && base.meta.anchor_monday) || SEED_MONDAY;
    if (from === cal.anchor) return base;
    const out = shiftState(base, daysBetween(from, cal.anchor));
    out.meta = out.meta || {};
    out.meta.anchor_monday = cal.anchor;
    return out;
  }

  // Resources as the MCP server exposes them.
  const RESOURCE_LIST = [
    { uri: "workshop://policy-guide", name: "Policy guide", mimeType: "text/markdown", key: "policyGuide" },
    { uri: "workshop://faq", name: "FAQ", mimeType: "text/markdown", key: "faq" },
    { uri: "workshop://service-packages", name: "Service package prices", mimeType: "application/json", key: "servicePackages" },
  ];

  return { createWorkshop, TOOL_DEFINITIONS, TOOL_CHECKS, RESOURCE_LIST, HANDOVER_REASONS, SLOTS, SERVICES, MECHANIC_SKILLS,
           calendar, stateForToday, addDays, SEED_MONDAY };
});
