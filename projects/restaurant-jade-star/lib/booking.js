/* Jade Star Chinese Dining 吉星饭厅: the booking module, written once for every route.
 *
 * The website form, the four assistant tools (tools.js) and the confirmation screen on the customer's phone all call
 * this module; none keeps its own copy of the rules. Runs in Node and the browser.
 *
 *   check(req)                 availability: P1 season, P3 slot, P8 cut-off, P6 party of 10 or fewer, P5 room size
 *                              with upsizing, never down; the other free slots that day when none
 *   propose(req, who)          all the checks again, P10 one booking per phone per slot on any route, then a room held
 *                              15 minutes (P11) and a 6-digit code sent by simulated SMS to the customer's phone
 *   status(ref, who)           held (minutes left), confirmed (booking number) or released; only the proposal's own
 *                              conversation or A2A task sees it
 *   confirm(ref, code)         the customer's click only: code matches the exact proposal, not expired, unchanged,
 *                              room still free, committed once; every attempt notifies the restaurant manager
 *   handover(fields)           a handover card for the restaurant manager (the note's fields, section 5)
 *   sweep()                    the 15-minute release: held proposals past their expiry are released
 *
 * Times are Malaysia time written "YYYY-MM-DDTHH:MM" and computed as if UTC. `clock()` returns the current time in ms,
 * so the benchmark and the tests run on a fixed clock (Mon 14 Dec 2026, 2:00pm unless a case sets its own).
 * Every refusal has one shape: { code, retryable, alternatives, clause, message }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JSBooking = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MIN = 60 * 1000;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // ------------------------------------------------------------------ time and labels
  const ms = (s) => { const [d, tm = "00:00"] = String(s).split("T"); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = tm.split(":").map(Number); return Date.UTC(y, m - 1, dd, h, mi); };
  const iso = (t) => new Date(t).toISOString().slice(0, 16);
  const dateLabel = (d) => { const x = new Date(ms(d)); return `${DAYS[x.getUTCDay()]} ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`; };
  const slotLabel = (s) => { const [h, m] = String(s).split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${ap}`; };
  const roomLabel = (r) => `${r.name} ${r.zh}`;
  const digits = (p) => { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("60")) d = "0" + d.slice(2); return d; };
  const maskPhone = (p) => { const d = digits(p); return d.length > 6 ? d.slice(0, 3) + "-" + "*".repeat(d.length - 7) + d.slice(-4) : d; };

  /** "7pm", "7:00 pm", "19:00", "1900", "19" -> "19:00"; anything else -> the trimmed input (refused later). */
  function normSlot(v) {
    const s = String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, "");
    let m = s.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)?$/);
    if (!m) return String(v == null ? "" : v).trim();
    let h = Number(m[1]); const mi = Number(m[2] || 0);
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h > 23 || mi > 59) return String(v).trim();
    return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
  }
  const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && !isNaN(ms(d)) && iso(ms(d)).slice(0, 10) === d;

  function err(code, clause, message, retryable, alternatives) {
    return { code, retryable: !!retryable, alternatives: alternatives || [], clause, message };
  }

  /** A seeded random source, so a benchmark run sends the same codes every time. */
  function seeded(seed) {
    let s = (Number(seed) >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  const emptyState = () => ({ proposals: [], bookings: [], handovers: [], notices: [], sms: [], seq: { proposal: 1000, booking: 5000, handover: 3000, notice: 7000 } });

  /**
   * createBooking({ config, state, clock, random, listeners })
   *   config: resources/restaurant.json
   *   state:  { proposals, bookings, handovers, notices, sms, seq } (mutated in place; the caller persists it)
   */
  function createBooking(opts) {
    const C = opts.config;
    const S = opts.state || emptyState();
    ["proposals", "bookings", "handovers", "notices", "sms"].forEach((k) => (S[k] = S[k] || []));
    S.seq = Object.assign({ proposal: 1000, booking: 5000, handover: 3000, notice: 7000 }, S.seq || {});
    const clock = opts.clock || (() => Date.now());
    const random = opts.random || Math.random;
    const listeners = [];
    const flags = { serviceDown: false };
    const emit = (type, data) => listeners.forEach((fn) => { try { fn(type, data); } catch (e) { /* a listener never breaks a booking */ } });
    const room = (id) => C.rooms.find((r) => r.id === id);
    const now = () => clock();
    const sizeFor = (n) => (n <= 6 ? 6 : n <= 8 ? 8 : 10);
    const slotStart = (date, slot) => ms(`${date}T${slot}`);
    const minutesLeft = (p) => Math.max(0, Math.ceil((ms(p.expires_at) - now()) / MIN));

    // ---------------------------------------------------------------- the 15-minute release (P11)
    function sweep() {
      const t = now();
      for (const p of S.proposals) {
        if (p.status === "held" && t > ms(p.expires_at)) {
          p.status = "released"; p.released_at = iso(t);
          emit("released", p);
        }
      }
    }

    /** Rooms taken at date and slot: confirmed bookings and live holds. */
    function taken(date, slot) {
      const ids = new Set();
      S.bookings.forEach((b) => { if (b.status === "confirmed" && b.date === date && b.slot === slot) ids.add(b.room_id); });
      S.proposals.forEach((p) => { if (p.status === "held" && p.date === date && p.slot === slot) ids.add(p.room_id); });
      return ids;
    }

    /** The free rooms of the smallest size that fits, never smaller (P5). */
    function freeRooms(date, slot, party) {
      const busy = taken(date, slot);
      for (const size of [6, 8, 10].filter((x) => x >= sizeFor(party))) {
        const free = C.rooms.filter((r) => r.size === size && !busy.has(r.id));
        if (free.length) return { size, rooms: free };
      }
      return { size: null, rooms: [] };
    }

    /** The other slots that day still bookable for this party. */
    function otherSlots(date, party, except) {
      if (!isDate(date) || date < C.season.from || date > C.season.to) return [];
      return C.slots.filter((s) => s !== except && slotStart(date, s) - now() >= C.cutoff_minutes * MIN && freeRooms(date, s, party).rooms.length)
        .map((s) => ({ slot: s, slot_label: slotLabel(s) }));
    }

    /** check(req) -> { ok, data } | { ok: false, error } */
    function check(req) {
      sweep();
      if (flags.serviceDown) return { ok: false, error: err("SERVICE_DOWN", "H7", "The booking service is unavailable. Never state availability.", true) };
      const date = String(req.date || "").trim();
      const slot = normSlot(req.slot);
      const party = Number(req.party_size);
      if (!date || !req.slot || req.party_size == null || req.party_size === "") {
        return { ok: false, error: err("MISSING_DETAILS", "P9", "A date, a slot and a party size are all needed. Ask for the missing one.", true) };
      }
      if (!isDate(date)) return { ok: false, error: err("MISSING_DETAILS", "P9", "The date must be written YYYY-MM-DD.", true) };
      if (date < C.season.from || date > C.season.to) return { ok: false, error: err("OUTSIDE_SEASON", "P1", "Bookings are for 1 to 31 December 2026 only.", false, ["hand_to_manager reason outside_season"]) };
      if (!C.slots.includes(slot)) {
        const alt = otherSlots(date, Number.isFinite(party) && party > 0 ? Math.min(party, 10) : 1, null);
        return { ok: false, error: err("INVALID_SLOT", "P3", "Not one of the booking times 10am, 1pm, 4pm or 7pm.", true, alt.map((a) => a.slot_label)), data: { date, date_label: dateLabel(date), other_free_slots: alt } };
      }
      if (slotStart(date, slot) - now() < C.cutoff_minutes * MIN) return { ok: false, error: err("TOO_SOON", "P8", "Less than 2 hours before the slot starts.", false, ["hand_to_manager reason too_soon"]) };
      if (!Number.isInteger(party) || party < 1) return { ok: false, error: err("MISSING_DETAILS", "P9", "The party size must be a whole number of guests.", true) };
      if (party > C.max_party) return { ok: false, error: err("PARTY_TOO_LARGE", "P6", "Parties over 10 go to the restaurant manager.", false, ["hand_to_manager reason party_over_10"]) };
      const fr = freeRooms(date, slot, party);
      const base = { date, date_label: dateLabel(date), slot, slot_label: slotLabel(slot), party_size: party };
      if (!fr.rooms.length) {
        const alt = otherSlots(date, party, slot);
        return { ok: false, error: err("NO_ROOM", "P5", "Every room that fits this party is booked for this slot.", true, alt.map((a) => a.slot_label)), data: Object.assign(base, { other_free_slots: alt }) };
      }
      return { ok: true, data: Object.assign(base, { room_size: fr.size, upsized: fr.size > sizeFor(party), rooms_free: fr.rooms.map(roomLabel), _room_ids: fr.rooms.map((r) => r.id) }) };
    }

    /** The live hold or confirmed booking this phone has for the slot, on any route (P10). */
    function existingFor(phone, date, slot) {
      const d = digits(phone);
      const p = S.proposals.find((x) => x.status === "held" && digits(x.phone) === d && x.date === date && x.slot === slot);
      if (p) return { kind: "held", rec: p };
      const b = S.bookings.find((x) => x.status === "confirmed" && digits(x.phone) === d && x.date === date && x.slot === slot);
      return b ? { kind: "confirmed", rec: b } : null;
    }

    function code6() { return String(Math.floor(random() * 900000) + 100000); }

    function proposalView(p) {
      return { proposal_ref: p.ref, status: p.status, room: roomLabel(room(p.room_id)), date: p.date, date_label: dateLabel(p.date), slot: p.slot, slot_label: slotLabel(p.slot),
        party_size: p.party_size, hold_minutes: C.hold_minutes, expires_at: p.expires_at, minutes_left: p.status === "held" ? minutesLeft(p) : 0,
        fee: `RM ${C.fee_rm} booking fee, added to the bill at check-out; nothing is paid now`, code_sent_to: maskPhone(p.phone) };
    }

    /** propose(req, who) -> { ok, data } | { ok: false, error, data? }. who: { name, phone, route, conversation } from the host. */
    function propose(req, who) {
      const c = check(req);
      if (!c.ok) return c;
      if (!who || !who.name || !who.phone || !who.route) return { ok: false, error: err("MISSING_DETAILS", "P9", "The customer's name and phone come from the host context and are missing.", false) };
      const { date, slot, party_size } = c.data;
      const ex = existingFor(who.phone, date, slot);
      if (ex) {
        const same = ex.rec.party_size === party_size;
        const ref = ex.rec.ref || ex.rec.proposal_ref;
        if (same) {
          const view = ex.kind === "held" ? proposalView(ex.rec) : { booking_number: ex.rec.booking_no, status: "confirmed", room: roomLabel(room(ex.rec.room_id)), date_label: dateLabel(date), slot_label: slotLabel(slot), party_size };
          return { ok: false, error: err("ALREADY_HELD", "P10", "This phone already has this slot with the same details. Nothing new was created; give the existing reference.", false), data: Object.assign({ existing_ref: ex.kind === "held" ? ref : ex.rec.booking_no }, view) };
        }
        return { ok: false, error: err("DUPLICATE_CONFLICT", "P10", "This phone already has this slot with different details.", false, ["hand_to_manager reason duplicate_conflict"]), data: { existing_ref: ex.kind === "held" ? ref : ex.rec.booking_no } };
      }
      const r = room(c.data._room_ids[0]);
      const t = now();
      const p = { ref: `JS-H${++S.seq.proposal}`, status: "held", date, slot, party_size, room_id: r.id, name: who.name, phone: who.phone, route: who.route,
        conversation: who.conversation || null, created_at: iso(t), expires_at: iso(t + C.hold_minutes * MIN), code: code6(), changed: false, attempts: [] };
      S.proposals.push(p);
      const text = `Jade Star Chinese Dining 吉星饭厅: your code is ${p.code}. ${roomLabel(r)}, ${dateLabel(date)}, ${slotLabel(slot)}, ${party_size} guests. Enter it within ${C.hold_minutes} minutes to confirm.`;
      S.sms.push({ to: p.phone, at: p.created_at, proposal_ref: p.ref, kind: "code", text });
      emit("held", p);
      return { ok: true, data: Object.assign(proposalView(p), { upsized: c.data.upsized }) };
    }

    function findProposal(ref) { return S.proposals.find((p) => p.ref === String(ref || "").trim().toUpperCase()); }

    /** status(ref, who) -> held / confirmed / released, only inside the proposal's own conversation or task. */
    function status(ref, who) {
      sweep();
      const p = findProposal(ref);
      if (!p || !who || p.conversation !== who.conversation) return { ok: false, error: err("NOT_FOUND", "P11", "No proposal with that reference in this conversation. Give no details.", false) };
      const v = proposalView(p);
      if (p.status === "confirmed") v.booking_number = p.booking_no;
      return { ok: true, data: v };
    }

    function notice(kind, p, detail) {
      const n = { ref: `JS-N${++S.seq.notice}`, kind, reason: kind === "confirmed" ? null : "confirmation_failed", receiver: "Restaurant manager",
        proposal_ref: p ? p.ref : null, booking_number: p && p.booking_no ? p.booking_no : null, name: p ? p.name : null, phone: p ? p.phone : null,
        date: p ? p.date : null, slot: p ? p.slot : null, party_size: p ? p.party_size : null, room: p ? roomLabel(room(p.room_id)) : null,
        route: p ? p.route : null, detail, created_at: iso(now()), status: "open" };
      S.notices.push(n);
      return n;
    }

    /**
     * confirm(ref, code) -> the customer's click on the confirmation screen (never an agent tool).
     * { ok: true, data: { booking_number, ... } } | { ok: false, error: { code: WRONG_CODE | EXPIRED | CHANGED | ROOM_TAKEN | NOT_FOUND } }
     */
    function confirm(ref, code) {
      const p = findProposal(ref);
      if (!p) return { ok: false, error: err("NOT_FOUND", "P11", "No booking with that reference.", false) };
      const t = now();
      const attempt = { at: iso(t), code_ok: String(code || "").trim() === p.code };
      p.attempts.push(attempt);
      if (p.status === "confirmed") {
        attempt.result = "already_confirmed";
        return { ok: true, data: { booking_number: p.booking_no, already: true, status: "confirmed" } };
      }
      const fail = (codeName, message, sms, release) => {
        if (release && p.status === "held") { p.status = "released"; p.released_at = iso(t); emit("released", p); }
        attempt.result = codeName;
        S.sms.push({ to: p.phone, at: iso(t), proposal_ref: p.ref, kind: "refused", text: sms });
        const n = notice("confirmation_failed", p, message);
        emit("confirmation_failed", { proposal: p, notice: n, code: codeName });
        return { ok: false, error: err(codeName, "P11", message, false), data: { status: p.status, notice_ref: n.ref } };
      };
      if (p.status === "released" || t > ms(p.expires_at)) {
        return fail("EXPIRED", "Code entered after the 15 minutes: refused, room released.", "Jade Star Chinese Dining 吉星饭厅: the code has expired and the room has been released. Please book again.", true);
      }
      if (!attempt.code_ok) {
        return fail("WRONG_CODE", "Wrong code entered: refused, the room stays held.", "Jade Star Chinese Dining 吉星饭厅: that code was not accepted. The room is still held for you.", false);
      }
      if (p.changed) {
        return fail("CHANGED", "The booking details changed after the code was sent: refused, the restaurant manager follows up.", "Jade Star Chinese Dining 吉星饭厅: your booking details changed, so the restaurant manager will call you.", false);
      }
      const clash = S.bookings.find((b) => b.status === "confirmed" && b.room_id === p.room_id && b.date === p.date && b.slot === p.slot);
      if (clash) {
        return fail("ROOM_TAKEN", "The room was taken before the code was entered: refused.", "Jade Star Chinese Dining 吉星饭厅: that room is no longer free. The restaurant manager will call you.", true);
      }
      p.status = "confirmed"; p.confirmed_at = iso(t);
      p.booking_no = `JS-B${++S.seq.booking}`;
      const b = { booking_no: p.booking_no, proposal_ref: p.ref, status: "confirmed", date: p.date, slot: p.slot, party_size: p.party_size, room_id: p.room_id,
        name: p.name, phone: p.phone, route: p.route, fee_rm: C.fee_rm, fee_note: `RM ${C.fee_rm} due at check-out`, confirmed_at: p.confirmed_at, confirmed_by: "customer" };
      S.bookings.push(b);
      attempt.result = "confirmed";
      S.sms.push({ to: p.phone, at: iso(t), proposal_ref: p.ref, kind: "confirmed",
        text: `Jade Star Chinese Dining 吉星饭厅: booking ${b.booking_no} confirmed. ${roomLabel(room(p.room_id))}, ${dateLabel(p.date)}, ${slotLabel(p.slot)}, ${p.party_size} guests. RM ${C.fee_rm} booking fee is added to your bill at check-out.` });
      const n = notice("confirmed", p, "Booking confirmed by the customer.");
      emit("confirmed", { proposal: p, booking: b, notice: n });
      return { ok: true, data: { booking_number: b.booking_no, status: "confirmed", room: roomLabel(room(p.room_id)), date_label: dateLabel(p.date), slot_label: slotLabel(p.slot), party_size: p.party_size, notice_ref: n.ref } };
    }

    /** handover(fields) -> the card for the restaurant manager. Reason and summary from the assistant; the rest from code. */
    function handover(f) {
      const reason = C.handover_reasons.find((r) => r.code === f.reason);
      const h = { ref: `JS-M${++S.seq.handover}`, reason: reason.code, reason_label: reason.label, receiver: "Restaurant manager", name: f.name || null, phone: f.phone || null,
        date: f.date || null, slot: f.slot || null, party_size: f.party_size == null ? null : f.party_size, room: f.room_id ? roomLabel(room(f.room_id)) : null,
        proposal_ref: f.proposal_ref || null, route: f.route || null, words: f.words || null, summary: f.summary, created_at: iso(now()), status: "open" };
      if (reason.code === "party_changed" && f.proposal_ref) { const p = findProposal(f.proposal_ref); if (p) p.changed = true; }
      S.handovers.push(h);
      emit("handover", h);
      return h;
    }

    /**
     * act(ref, action, text) -> the restaurant manager's action on a handover or notice, from the owner dashboard.
     *   action: "note" (a note only), "called" (called the customer), "arranged" (request arranged), "closed"
     * Every action is kept on the item with its time; "closed" also takes it off the open lane. Never an agent tool.
     */
    const ACTIONS = ["note", "called", "arranged", "closed"];
    function act(ref, action, text) {
      const x = S.handovers.find((h) => h.ref === ref) || S.notices.find((n) => n.ref === ref);
      if (!x) return { ok: false, error: err("NOT_FOUND", "H12", "No handover or notice with that reference.", false) };
      if (!ACTIONS.includes(action)) return { ok: false, error: err("INVALID_ACTION", "H12", `Use one of ${ACTIONS.join(", ")}.`, false) };
      const note = String(text || "").trim();
      if (action === "note" && !note) return { ok: false, error: err("MISSING_DETAILS", "H12", "Write the note first.", true) };
      if (x.status === "closed") return { ok: false, error: err("ALREADY_CLOSED", "H12", "This item is already closed.", false) };
      x.actions = x.actions || [];
      x.actions.push({ at: iso(now()), by: "Restaurant manager", action, note: note || null });
      if (action === "closed") { x.status = "closed"; x.closed_at = iso(now()); }
      emit("manager_action", { ref, action, note });
      return { ok: true, data: { ref, status: x.status, actions: x.actions.length } };
    }
    /** close(ref) -> the restaurant manager's Close button on the owner dashboard. */
    function close(ref, text) { return act(ref, "closed", text); }

    /** The owner dashboard: four lanes and the seating map for a date and slot. */
    function dashboard(date, slot) {
      sweep();
      const lanes = {
        held: S.proposals.filter((p) => p.status === "held").map((p) => Object.assign(proposalView(p), { name: p.name, route: p.route })),
        confirmed: S.bookings.filter((b) => b.status === "confirmed" && !b.seeded).map((b) => ({ booking_number: b.booking_no, room: roomLabel(room(b.room_id)), date_label: dateLabel(b.date), slot_label: slotLabel(b.slot), party_size: b.party_size, name: b.name, route: b.route, fee_note: b.fee_note })),
        handovers: S.handovers.concat(S.notices).filter((x) => x.status === "open"),
        released: S.proposals.filter((p) => p.status === "released").map((p) => Object.assign(proposalView(p), { name: p.name, route: p.route })),
      };
      let map = null;
      if (date && slot) {
        const state = (id) => {
          if (S.bookings.some((b) => b.status === "confirmed" && b.room_id === id && b.date === date && b.slot === slot)) return "booked";
          if (S.proposals.some((p) => p.status === "held" && p.room_id === id && p.date === date && p.slot === slot)) return "held";
          return "free";
        };
        map = { date, slot, rooms: C.rooms.map((r) => ({ id: r.id, name: roomLabel(r), size: r.size, beside: r.beside, state: state(r.id) })),
          zones: C.zones.map((z) => ({ name: `${z.name} ${z.zh}`, seats: z.seats, tables: Array.from({ length: z.tables }, (_, i) => `${z.prefix}-${String(i + 1).padStart(2, "0")}`), state: "walk-in" })) };
      }
      return { lanes, map };
    }

    return { check, propose, status, confirm, handover, close, act, sweep, dashboard, findProposal, normSlot, flags, state: S, config: C,
      on: (fn) => listeners.push(fn), now, roomLabel: (id) => roomLabel(room(id)) };
  }

  return { createBooking, emptyState, seeded, ms, iso, dateLabel, slotLabel, normSlot, digits, maskPhone };
});
