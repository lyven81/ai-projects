/* Pak Razif Garden: the assistant's tools and Pak Razif's page actions, written once.
 *
 * Loaded by the MCP server (mcp_server.mjs, Node), the tool tests, the benchmark and both
 * pages (Pak Razif's page and assistant.html), so every rule below is the same everywhere.
 *
 * Every rule the assistant must never break lives here, in code, not in the prompt:
 * coverage by postcode, the booking window from first contact, same-day and closed days,
 * open slots only, the slot re-checked when saving, one upcoming visit per address,
 * references issued by code, photos forwarded without the model seeing them, the duty
 * number only after the ETA check matches, and handovers on a fixed list of reasons.
 * No tool quotes a price, changes or cancels a visit, books field work, lists bookings,
 * reads a location or names another customer. Pak Razif's own actions (Done, block or open
 * a slot) are in OWNER below.
 *
 * Each tool returns { ok: true, ... } or
 * { ok: false, error: { category, retryable, message } }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GardenTools = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BUSINESS = "Pak Razif Garden";
  const SLOTS = ["08:00", "10:00", "14:00", "16:00"];   // W3
  const VISIT_MINUTES = 30;                               // W5, W6
  const DEFAULT_NOW = "2026-10-17T10:00";                 // fixed demo clock

  // Service Area A1 to A3: [from, to, area, rule]
  const COVERAGE = [
    [40000, 40470, "Shah Alam", "A1"],
    [41000, 41300, "Klang", "A2"],
    [47500, 47500, "Subang Jaya", "A3"],
    [47600, 47650, "Subang Jaya (USJ)", "A3"],
  ];
  // Known localities, so a covered postcode can be named more precisely than the area.
  const LOCALITY = {
    "40000": "Seksyen 7", "40100": "Seksyen 9 and 13", "40150": "Bukit Jelutong", "40170": "Setia Alam",
    "40460": "Kota Kemuning", "40470": "Alam Impian", "41050": "Bukit Raja", "41200": "Bandar Botanic and Bukit Tinggi",
    "47500": "SS15", "47610": "USJ",
  };
  // Klang Valley postcodes outside the coverage are "nearby" (A4); anything else is outstation (A5).
  const NEARBY = [[40000, 48999], [50000, 62999], [63000, 68199]];

  const HANDOVER_REASONS = {
    price_request: { label: "Price request", rules: ["P23", "Q3"] },
    unusual_work: { label: "Unusual work", rules: ["P24", "P6"] },
    outside_area: { label: "Outside the area", rules: ["P25", "A4"] },
    outstation: { label: "Outstation", rules: ["P26", "A5"] },
    time_not_bookable: { label: "Time not bookable", rules: ["P27", "W8", "W9", "W12"] },
    change_or_cancel: { label: "Change or cancel", rules: ["P28", "P16"] },
    after_visit: { label: "After the visit", rules: ["P29", "Q5"] },
    complaint_or_payment: { label: "Complaint or payment", rules: ["P30", "P35", "P21"] },
    asks_for_him_or_unclear: { label: "Asks for you, or unclear", rules: ["P31"] },
  };
  const REASON_IDS = Object.keys(HANDOVER_REASONS);

  // ---------- tool definitions (shared by MCP, the benchmark and the pages) ----------

  const TOOL_DEFINITIONS = [
    {
      name: "check_coverage",
      description:
        "Check whether a 5-digit Malaysian postcode is inside Pak Razif's approved coverage (Service Area A1 to A3). " +
        "Ask the customer for the postcode if they have not given it; never guess it from a town or place name. " +
        "Covered returns the area name. Not covered returns where: nearby (Klang Valley, forward as outside_area) or outstation (forward as outstation). " +
        "Errors: bad_postcode, not_covered.",
      input_schema: {
        type: "object",
        properties: { postcode: { type: "string", description: "5 digits, e.g. \"40460\"" } },
        required: ["postcode"],
      },
    },
    {
      name: "find_open_slots",
      description:
        "List the open site visit slots in Pak Razif's calendar for one date, or for a range of up to 14 days. " +
        "Only open slots are returned, never who booked or why a slot is closed. " +
        "Bookable dates run from the day after the customer's first contact to the same date next month (W8). " +
        "Today is never offered: same-day requests go to Pak Razif (W9). Sundays and holidays are closed (W1, W2). " +
        "Date format YYYY-MM-DD. Errors: same_day, beyond_window, closed_day, past_date.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD, the first or only date" },
          to_date: { type: "string", description: "YYYY-MM-DD, optional end of a range (at most 14 days after date)" },
        },
        required: ["date"],
      },
    },
    {
      name: "book_site_visit",
      description:
        "Reserve an open site visit slot and confirm it. The slot is checked again when saving; the reference is issued by code. " +
        "Ask the customer first for anything missing: name, phone number, full address, 5-digit postcode, gardening needs in their words, and access instructions (gate, parking, pets). " +
        "Returns the confirmation to give the customer (R3): date, time window, address and booking reference. " +
        "Errors: missing_fields, not_covered, same_day, beyond_window, closed_day, slot_unavailable, duplicate_address.",
      input_schema: {
        type: "object",
        properties: {
          date: { type: "string", description: "YYYY-MM-DD" },
          slot: { type: "string", enum: SLOTS },
          name: { type: "string" },
          phone: { type: "string", description: "Malaysian phone number, e.g. 012-345 6789" },
          address: { type: "string", description: "Street address without the postcode, e.g. 7 Jalan Melur 2, Seksyen 7, Shah Alam" },
          postcode: { type: "string", description: "5 digits" },
          needs: { type: "string", description: "The gardening work needed, in the customer's words" },
          access: { type: "string", description: "Access instructions: gate, parking, pets" },
        },
        required: ["date", "slot", "name", "phone", "address", "postcode", "needs", "access"],
      },
    },
    {
      name: "forward_photo",
      description:
        "Send photos the customer attached in this conversation to Pak Razif unchanged. You never see the photos: pass their photo IDs as shown in the customer's message. " +
        "Use it when the photos come with a gardening enquiry or a booking. Do not use it for a request only to measure or assess a photo (P13): decline that and offer a site visit. " +
        "The photos are linked to a visit booked in this conversation. Errors: no_photo.",
      input_schema: {
        type: "object",
        properties: {
          photo_ids: { type: "array", items: { type: "string" }, description: "e.g. [\"PH-001\", \"PH-002\"]" },
          note: { type: "string", description: "One line: the gardening enquiry the photos come with" },
        },
        required: ["photo_ids", "note"],
      },
    },
    {
      name: "hand_to_pak_razif",
      description:
        "Forward the enquiry to Pak Razif's inbox. He cannot see this chat and replies to the customer himself by phone or WhatsApp, so the summary must let him act on its own. " +
        "Reasons: price_request (any price, transport charge, tax or discount), unusual_work (work not in P5, or unclear requirements), " +
        "outside_area (a nearby postcode outside the coverage), outstation (another state, e.g. Melaka, Penang, Johor), " +
        "time_not_bookable (same day, beyond the booking window, or no open slot suits), change_or_cancel (change of date or time, cancellation, address correction), " +
        "after_visit (work date or arrangements after a site visit), complaint_or_payment (complaint, damage, compensation, payment or refund), " +
        "asks_for_him_or_unclear (asks to speak to Pak Razif, or a business question the resources do not cover). " +
        "Code adds the customer's own words, name and phone from the chat, any photos forwarded, and the time received. Returns the inbox item number. " +
        "Errors: missing_fields.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", enum: REASON_IDS },
          what_was_asked: { type: "string", description: "One line, e.g. \"Move the site visit HG-1015 to Friday 23 Oct\"" },
          told_customer: { type: "string", description: "One line: what you are telling the customer, e.g. \"Request passed on; Pak Razif will get back to him\"" },
          recommended_next_step: { type: "string", description: "One line for Pak Razif, e.g. \"Call to agree a Friday slot; 10:00, 14:00 and 16:00 are open\"" },
          address: { type: "string", description: "Address and postcode, if the customer gave them" },
          preferred_time: { type: "string", description: "Preferred day or time, if the customer gave one" },
        },
        required: ["reason", "what_was_asked", "told_customer", "recommended_next_step"],
      },
    },
    {
      name: "eta_contact_check",
      description:
        "For a customer asking whether Pak Razif is on his way or when he will arrive. Needs the booking reference and the last 4 digits of the phone number on the booking, both from the customer; never guess either. " +
        "If both match a confirmed visit today or later, returns Pak Razif's duty number for the customer to call (P15, P18). It returns no other booking detail, no location and no arrival time. " +
        "The same error is returned whichever part is wrong. Errors: no_match.",
      input_schema: {
        type: "object",
        properties: {
          booking_ref: { type: "string", description: "e.g. HG-1010" },
          phone_last4: { type: "string", description: "4 digits as text, e.g. \"1428\"" },
        },
        required: ["booking_ref", "phone_last4"],
      },
    },
  ];

  // What each tool's code enforces, for the "How it works" view. Keep in step with the handlers.
  const TOOL_CHECKS = {
    check_coverage: ["5-digit postcode only; never guessed from a place name (A6)", "Covered: Shah Alam, Klang, Subang Jaya (A1 to A3)", "Not covered: nearby or outstation, for Pak Razif to decide (A4, A5)"],
    find_open_slots: ["Open slots only: no names, addresses or reasons for taken slots (P34)", "Window from the day after first contact to the same date next month (W8)", "Today refused as same_day; Sundays and holidays closed (W9, W1, W2)"],
    book_site_visit: ["Every detail present and the postcode covered (P7, P8)", "Slot re-checked when saving; one upcoming visit per address (W11, P11)", "Reference issued by code; the confirmation built from the result (P9, P12)"],
    forward_photo: ["Only photos attached in this conversation, passed by ID (P13)", "The image never reaches the model, so it cannot be measured or described (P22)", "Linked to a visit booked in the same conversation"],
    hand_to_pak_razif: ["Reason on the fixed list of nine (P23 to P31)", "Every summary field required, so Pak Razif can act without the chat (P32)", "Code adds the customer's words, contact, photos and time"],
    eta_contact_check: ["Reference and last 4 phone digits must both match a confirmed visit today or later (P15)", "Same reply whichever part is wrong", "Returns the duty number only: no location, no arrival time (P17, P18)"],
  };

  // ---------- helpers ----------

  const fail = (category, message, retryable) => ({ ok: false, error: { category, retryable: !!retryable, message } });
  const str = (s) => String(s == null ? "" : s).trim();
  const digits = (s) => str(s).replace(/\D/g, "");
  const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z"));
  const toDay = (iso) => Math.round(Date.parse(iso.slice(0, 10) + "T00:00:00Z") / 86400000);
  const fromDay = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const addDays = (iso, n) => fromDay(toDay(iso) + n);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateText = (iso) => { const d = new Date(iso.slice(0, 10) + "T00:00:00Z"); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const windowText = (slot) => { const m = parseInt(slot, 10) * 60 + parseInt(slot.slice(3), 10) + VISIT_MINUTES; return `${slot} to ${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const normRef = (s) => { const d = digits(s); return d ? "HG-" + d : ""; };

  // W8: the same date next month, or that month's last day when it is shorter.
  function sameDateNextMonth(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
    return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  }

  function coverageOf(pc) {
    const n = Number(pc);
    const hit = COVERAGE.find(([a, b]) => n >= a && n <= b);
    if (hit) return { covered: true, area: hit[2], rule: hit[3], locality: LOCALITY[pc] || null };
    return { covered: false, where: NEARBY.some(([a, b]) => n >= a && n <= b) ? "nearby" : "outstation" };
  }

  // One normalising function for the duplicate check: lower case, "jln" to "jalan", commas and
  // spaces collapsed, then house number + street + postcode (Step C, section 6).
  function addressKey(address, postcode) {
    const pc = digits(postcode);
    let n = str(address).toLowerCase().replace(/\bjln\b\.?/g, "jalan").replace(/\bno\.?\s*/g, "").replace(/[,.#]/g, " ");
    if (pc) n = n.split(pc).join(" ");
    n = n.replace(/\s+/g, " ").trim();
    const m = /^(\d+[a-z]?(?:-\d+)?)\s+(jalan\s+(?:[a-z/]+\s+)*?[a-z/]*\d+[a-z]?)\b/.exec(n);
    return (m ? `${m[1]}|${m[2]}` : n) + "|" + pc;
  }

  function normPhone(s) {
    let d = digits(s);
    if (d.startsWith("60")) d = d.slice(1);
    return /^0\d{8,10}$/.test(d) ? d : null;
  }
  const prettyPhone = (d) => d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)} ${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)} ${d.slice(7)}`;

  /**
   * createAssistant(store, options)
   *   store:   { load() -> state, save(state) }   state = calendar.json
   *   options: { now: "YYYY-MM-DDTHH:MM" or () => string }
   * Returns { tools, call(name, input, ctx), session }.
   *   ctx (from the host, never from the model):
   *     { turn, uploads: ["PH-001"], message, contact: { channel, chat_id, name, phone }, first_contact: "YYYY-MM-DD" }
   * One assistant object = one conversation.
   */
  function createAssistant(store, options) {
    const opts = options || {};
    const nowIso = () => (typeof opts.now === "function" ? opts.now() : opts.now || DEFAULT_NOW);
    const today = () => nowIso().slice(0, 10);
    const session = { firstContact: null, uploads: [], own: [], photoItems: [], messages: [], usedMessages: 0 };

    // The first-contact date is fixed at the first message (W8), from the host.
    function windowFor() {
      const fc = session.firstContact || today();
      return { from: addDays(fc, 1), to: sameDateNextMonth(fc) };
    }
    function remember(ctx) {
      if (!session.firstContact) session.firstContact = (ctx.first_contact && isIsoDate(ctx.first_contact)) ? ctx.first_contact : today();
      (ctx.uploads || []).forEach((id) => { if (!session.uploads.includes(id)) session.uploads.push(id); });
      // ctx.history: the customer's earlier messages in this chat, so turns with no tool call still count.
      const all = (Array.isArray(ctx.history) ? ctx.history.map(str) : []).concat(str(ctx.message) ? [str(ctx.message)] : []);
      if (all.length > session.messages.length) session.messages = all;
    }
    // The customer's own words not yet sent to Pak Razif in an item from an earlier turn;
    // items made in the same turn carry the same words.
    function customerWords(ctx) {
      if (session.wordsTurn !== ctx.turn) {
        session.words = session.messages.slice(session.usedMessages).join("\n");
        session.usedMessages = session.messages.length;
        session.wordsTurn = ctx.turn;
      }
      return session.words;
    }
    const contactOf = (ctx) => {
      const c = (ctx && ctx.contact) || {};
      return { channel: c.channel || "", chat_id: c.chat_id || "", name: c.name || "", phone: c.phone || "" };
    };

    // Date checks shared by find_open_slots and book_site_visit.
    function checkDate(state, date) {
      if (!isIsoDate(date)) return fail("invalid_input", "Date must be YYYY-MM-DD.", true);
      const w = windowFor();
      if (date < today()) return fail("past_date", `That date has passed. Today is ${dateText(today())}.`, true);
      if (date === today()) return fail("same_day", "Same-day visits need Pak Razif's go-ahead (W9). Do not book; forward with hand_to_pak_razif, reason time_not_bookable, and reply with R11.", false);
      if (date > w.to) return fail("beyond_window", `Visits can be booked up to ${dateText(w.to)}, the same date next month from first contact (W8). Do not book; forward with hand_to_pak_razif, reason time_not_bookable.`, false);
      const day = state.days[date];
      if (!day) return fail("beyond_window", "That date is not in Pak Razif's calendar yet. Forward with hand_to_pak_razif, reason time_not_bookable.", false);
      if (day.closed) return fail("closed_day", `${dateText(date)} is closed (${day.closed}; W1, W2). Offer the nearest open day.`, true);
      return null;
    }
    const openSlots = (day) => SLOTS.filter((s) => day.slots[s] && day.slots[s].status === "open").map((s) => ({ slot: s, window: windowText(s) }));

    function newItem(state, item) {
      const id = "IN-" + String(state.inbox.length + 1).padStart(3, "0");
      state.inbox.push(Object.assign({ id, status: "open", received: nowIso() }, item));
      return id;
    }

    const handlers = {
      check_coverage({ postcode }) {
        const pc = digits(postcode);
        if (!/^\d{5}$/.test(str(postcode).replace(/\s/g, "")) || pc.length !== 5)
          return fail("bad_postcode", "A postcode is 5 digits. Ask the customer once for the postcode; if it is still missing or unclear, forward the enquiry (A6).", true);
        const c = coverageOf(pc);
        if (c.covered) return { ok: true, postcode: pc, covered: true, area: c.area, locality: c.locality, rules: [c.rule] };
        return Object.assign(fail("not_covered", c.where === "nearby"
          ? `${pc} is outside the approved coverage but nearby. Do not book. Reply with R5 and forward with hand_to_pak_razif, reason outside_area, with the address and work required (A4).`
          : `${pc} is outstation. Do not book or promise acceptance. Forward with hand_to_pak_razif, reason outstation, for assessment (A5).`, false),
          { postcode: pc, where: c.where, rules: [c.where === "nearby" ? "A4" : "A5"] });
      },

      find_open_slots({ date, to_date }) {
        const state = store.load();
        const end = str(to_date) || date;
        if (!isIsoDate(date) || !isIsoDate(end)) return fail("invalid_input", "Dates must be YYYY-MM-DD.", true);
        if (end < date || toDay(end) - toDay(date) > 14) return fail("invalid_input", "to_date must be on or after date, at most 14 days later.", true);
        if (end === date) {
          const bad = checkDate(state, date); if (bad) return bad;
          const open = openSlots(state.days[date]);
          return { ok: true, date, day: dateText(date), open, rules: ["W3", "W10"],
            note: open.length ? "Open slots only. Each visit takes about 30 minutes." : "No open slot on this date. Offer open slots on nearby days, or forward (W12)." };
        }
        const days = [], skipped = [];
        for (let d = date; d <= end; d = addDays(d, 1)) {
          const bad = checkDate(state, d);
          if (bad) { skipped.push({ date: d, reason: bad.error.category }); continue; }
          days.push({ date: d, day: dateText(d), open: openSlots(state.days[d]) });
        }
        if (!days.length) return fail(skipped.some((s) => s.reason === "beyond_window") ? "beyond_window" : skipped[0].reason,
          "No bookable date in that range (W8, W9, W1). Today and dates beyond the window go to Pak Razif with reason time_not_bookable.", false);
        return { ok: true, days, skipped, rules: ["W3", "W8", "W10"] };
      },

      book_site_visit(input, ctx) {
        const f = {};
        ["date", "slot", "name", "phone", "address", "postcode", "needs", "access"].forEach((k) => (f[k] = str(input[k])));
        const missing = Object.keys(f).filter((k) => !f[k]);
        if (missing.length) return fail("missing_fields", `Ask the customer for: ${missing.join(", ")} (P8, V4). Then book.`, true);
        const phone = normPhone(f.phone);
        if (!phone) return fail("missing_fields", "The phone number looks incomplete. Ask the customer to check it (P8).", true);
        if (!/^\d{5}$/.test(f.postcode)) return fail("missing_fields", "The postcode must be 5 digits. Ask the customer for it (A6).", true);
        const cov = coverageOf(f.postcode);
        if (!cov.covered) return Object.assign(fail("not_covered", cov.where === "nearby"
          ? "Outside the approved coverage (P7, A4). Do not book. Reply with R5 and forward as outside_area."
          : "Outstation (A5). Do not book. Forward as outstation for assessment.", false), { where: cov.where });
        if (!SLOTS.includes(f.slot)) return fail("slot_unavailable", "Visit slots are 08:00, 10:00, 14:00 and 16:00 (W3). Offer an open slot.", true);

        const state = store.load();
        const bad = checkDate(state, f.date); if (bad) return bad;
        const key = addressKey(f.address, f.postcode);
        const dup = state.bookings.find((b) => b.status === "confirmed" && b.date >= today() && addressKey(b.address, b.postcode) === key);
        if (dup) return fail("duplicate_address", "A site visit is already booked for this address (P11). Book nothing and give no details of that visit (no date, time or name). A change of date is forwarded as change_or_cancel.", false);
        // W11: read the calendar again at the moment of saving.
        const cell = state.days[f.date].slots[f.slot];
        if (!cell || cell.status !== "open") {
          const open = openSlots(state.days[f.date]);
          return Object.assign(fail("slot_unavailable", `That slot is unavailable (R4). ${open.length ? "Offer the open slots below" : "No slot is open that day; offer nearby days"} or forward as time_not_bookable.`, true),
            { open_same_day: open });
        }

        const ref = "HG-" + state.next_ref++;
        const address = `${f.address.replace(/[\s,]+$/, "")} ${f.postcode}`.replace(/\s+/g, " ");
        const booking = {
          ref, date: f.date, slot: f.slot, window: windowText(f.slot), name: f.name, phone: prettyPhone(phone),
          address: f.address, postcode: f.postcode, needs: f.needs, access: f.access, status: "confirmed",
          source: "assistant", booked_at: nowIso(), contact: contactOf(ctx),
        };
        state.bookings.push(booking);
        state.days[f.date].slots[f.slot] = { status: "booked", ref };
        // Photos forwarded earlier in this conversation are linked to the visit.
        const photos = [];
        state.inbox.filter((i) => session.photoItems.includes(i.id) && !i.booking_ref).forEach((i) => { i.booking_ref = ref; photos.push(...i.photos); });
        newItem(state, {
          kind: "new_visit", category: "new_visit", ref, date: f.date, window: booking.window,
          customer: { name: f.name, phone: booking.phone }, address, needs: f.needs, access: f.access,
          customer_words: customerWords(ctx), photos, contact: contactOf(ctx),
        });
        store.save(state);
        session.own.push(ref);
        const confirmation = `Your site visit is confirmed for ${dateText(f.date)}, ${booking.window}, at ${address}. Your booking reference is ${ref}.`;
        return { ok: true, booking_ref: ref, date: f.date, day: dateText(f.date), window: booking.window, address, confirmation, rules: ["P9", "P12", "W6", "W11"],
          message: "Booked and confirmed. Give the customer the confirmation (R3) as written." };
      },

      forward_photo({ photo_ids, note }, ctx) {
        const state = store.load();
        const asked = (Array.isArray(photo_ids) ? photo_ids : [photo_ids]).map((x) => str(x).toUpperCase());
        const ids = asked.filter((id) => session.uploads.includes(id) && (state.uploads || []).some((u) => u.id === id && !u.forwarded));
        if (!ids.length) return fail("no_photo", "No photo from this conversation matches those IDs, or it was already forwarded. Only photos the customer attached here can be forwarded. Do not say a photo was passed on.", false);
        state.uploads.forEach((u) => { if (ids.includes(u.id)) u.forwarded = true; });
        const ref = session.own[session.own.length - 1] || "";
        const item = newItem(state, {
          kind: "photos", category: "photos", photos: ids, images: ids.map((id) => state.uploads.find((u) => u.id === id).image),
          note: str(note), booking_ref: ref, customer: { name: contactOf(ctx).name, phone: contactOf(ctx).phone },
          customer_words: customerWords(ctx), contact: contactOf(ctx),
        });
        if (ref) { const v = state.inbox.find((i) => i.kind === "new_visit" && i.ref === ref); if (v) v.photos.push(...ids); }
        store.save(state);
        session.photoItems.push(item);
        return { ok: true, forwarded: ids, inbox_item: item, booking_ref: ref || null, rules: ["P13", "P14"],
          message: "Forwarded unchanged. Tell the customer the photo has been passed to Pak Razif (R2). Do not describe or measure it." };
      },

      hand_to_pak_razif(input, ctx) {
        const reason = str(input.reason);
        if (!HANDOVER_REASONS[reason]) return fail("missing_fields", "reason must be one of: " + REASON_IDS.join(", "), true);
        const asked = str(input.what_was_asked), told = str(input.told_customer), next = str(input.recommended_next_step);
        const missing = [["what_was_asked", asked], ["told_customer", told], ["recommended_next_step", next]].filter(([, v]) => v.length < 8).map(([k]) => k);
        if (missing.length) return fail("missing_fields", `Pak Razif cannot see this chat. Fill in: ${missing.join(", ")}, one line each (P32).`, true);
        const state = store.load();
        const c = contactOf(ctx);
        const photos = state.inbox.filter((i) => session.photoItems.includes(i.id)).flatMap((i) => i.photos);
        const id = newItem(state, {
          kind: "handover", category: reason, reason, reason_label: HANDOVER_REASONS[reason].label, rules: HANDOVER_REASONS[reason].rules,
          customer: { name: c.name, phone: c.phone }, customer_words: customerWords(ctx),
          address: str(input.address), what_was_asked: asked, preferred_time: str(input.preferred_time),
          told_customer: told, recommended_next_step: next, photos, contact: c,
        });
        store.save(state);
        return { ok: true, inbox_item: id, rules: HANDOVER_REASONS[reason].rules.concat(["P33"]),
          message: "Passed to Pak Razif. Tell the customer it has been passed on and that he will get back to them. Do not promise when." };
      },

      eta_contact_check({ booking_ref, phone_last4 }) {
        const last4 = str(phone_last4);
        if (!/^\d{4}$/.test(last4)) return fail("invalid_input", "phone_last4 must be exactly 4 digits. Ask the customer.", true);
        const state = store.load();
        const ref = normRef(booking_ref);
        const b = state.bookings.find((x) => x.ref === ref);
        if (!b || b.status !== "confirmed" || b.date < today() || digits(b.phone).slice(-4) !== last4)
          return fail("no_match", "Those details do not match an upcoming visit. Reply with R12. Do not give the duty number or any booking detail.", true);
        return { ok: true, duty_number: state.duty_number, rules: ["P15", "P18"],
          message: "Give the customer this number to call for the latest update. Give no arrival time, location or reason for a delay (P17)." };
      },
    };

    function call(name, input, ctx) {
      const h = handlers[name];
      const c = ctx || { turn: 0, uploads: [] };
      remember(c);
      if (!h) return fail("unknown_tool", `No tool named ${name}.`, false);
      try { return h(input || {}, c); }
      catch (e) { return fail("system_unavailable", "The tool failed. Forward the enquiry with hand_to_pak_razif, reason asks_for_him_or_unclear.", false); }
    }
    // The host calls this once per customer message, so the session records the words and
    // photos even when no tool is called.
    function begin(ctx) { remember(ctx || {}); }

    return { tools: TOOL_DEFINITIONS, call, begin, session };
  }

  // ---------- host actions: what the page or benchmark records, never the model ----------

  // The customer attached a photo: store it and return the photo ID shown to Claude in its place.
  function registerUpload(store, image, now) {
    const state = store.load();
    state.uploads = state.uploads || [];
    const id = "PH-" + String(state.uploads.length + 1).padStart(3, "0");
    state.uploads.push({ id, image, uploaded_at: now || DEFAULT_NOW, forwarded: false });
    store.save(state);
    return id;
  }

  // ---------- Pak Razif's actions (his page): no messages are sent by these ----------

  const OWNER = {
    // Done (Seen for a new visit): the item moves to the closed list.
    done(state, id, now) {
      const i = state.inbox.find((x) => x.id === id);
      if (!i || i.status !== "open") return fail("not_open", "No open inbox item with that ID.", false);
      i.status = "done"; i.closed_at = now || DEFAULT_NOW;
      return { ok: true };
    },
    // Tap an open slot to block it; tap any blocked slot, field work included, to open it
    // (P38, W10): his calendar is his to run. Booked slots hold a customer and are not changed here.
    toggleSlot(state, date, slot) {
      const day = state.days[date];
      const cell = day && day.slots[slot];
      if (!cell) return fail("no_slot", "No such slot.", false);
      if (cell.status === "open") { day.slots[slot] = { status: "blocked", reason: "Blocked by Pak Razif" }; return { ok: true, status: "blocked" }; }
      if (cell.status === "blocked") { day.slots[slot] = { status: "open" }; return { ok: true, status: "open" }; }
      return fail("not_changeable", "A booked visit is changed with the customer, not here.", false);
    },
  };

  // Resources as the MCP server exposes them.
  const RESOURCE_LIST = [
    { uri: "resource://operation", name: "Operation Policy", mimeType: "text/markdown", key: "operation", file: "Operation Policy.md" },
    { uri: "resource://work-schedule", name: "Work Schedule", mimeType: "text/markdown", key: "work_schedule", file: "Work Schedule.md" },
    { uri: "resource://quotation", name: "Quotation Policy", mimeType: "text/markdown", key: "quotation", file: "Quotation Policy.md" },
    { uri: "resource://service-area", name: "Service Area", mimeType: "text/markdown", key: "service_area", file: "Service Area.md" },
    { uri: "resource://site-visit", name: "Site Visit Guide", mimeType: "text/markdown", key: "site_visit", file: "Site Visit Guide.md" },
    { uri: "resource://faq", name: "FAQ", mimeType: "text/markdown", key: "faq", file: "FAQ.md" },
  ];

  return {
    createAssistant, registerUpload, OWNER, TOOL_DEFINITIONS, TOOL_CHECKS, RESOURCE_LIST,
    HANDOVER_REASONS, REASON_IDS, BUSINESS, SLOTS, DEFAULT_NOW,
    helpers: { dateText, windowText, addDays, sameDateNextMonth, addressKey, coverageOf, normRef, digits },
  };
});
