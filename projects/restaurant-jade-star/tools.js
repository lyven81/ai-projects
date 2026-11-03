/* Jade Star Chinese Dining 吉星饭厅: the four assistant tools, on the booking module. Shared by the MCP server, the
 * A2A server, the benchmark and the demo page (runs in Node and the browser).
 *
 *   check_availability(date, slot, party_size)   T1  the room size offered and the rooms free, or a structured refusal
 *   create_proposal(date, slot, party_size)      T2  the same function the form calls; holds the room 15 minutes and
 *                                                    sends the code to the customer's phone
 *   get_proposal_status(proposal_ref)            T3  only a proposal opened in this conversation or A2A task
 *   hand_to_manager(reason, summary)             T4  a handover card for the restaurant manager; the note's other
 *                                                    fields are filled in by code
 *
 * No tool confirms, releases or closes. Every call runs PreToolUse (hooks/pre_tool_use.js) first and PostToolUse
 * (hooks/post_tool_use.js, the fixed sentences) after. Every result has one shape:
 *   { tool, status: "ok" | "refused", data, error: { code, retryable, alternatives, clause, message }, next_step }
 * Name, phone, route and conversation come from the session (the host context), never from the model.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./lib/booking.js"), require("./hooks/pre_tool_use.js"), require("./hooks/post_tool_use.js"));
  else root.JSTools = factory(root.JSBooking, root.JSPreToolUse, root.JSPostToolUse);
})(typeof self !== "undefined" ? self : this, function (B, PRE, POST) {
  "use strict";

  const DATE = { type: "string", description: "The date as YYYY-MM-DD, for example 2026-12-18. Work it out from the guest's words and today's date." };
  const SLOT = { type: "string", description: "The start time the guest asked for, as HH:MM in 24 hours, for example 19:00 for 7pm. Pass the time the guest asked for even if it is not a booking slot." };
  const PARTY = { type: "integer", description: "Number of guests. Never guess: ask when it is not given." };
  const ASSISTANT_REASONS = ["party_over_10", "too_soon", "after_booking", "special_request", "outside_season", "party_changed", "service_down", "duplicate_conflict", "complaint", "asks_for_person"];

  const TOOLS = {
    check_availability: {
      description: "Check whether a private room is free for a date, slot and party size. Call it every time before saying whether a room or slot is free. Returns the room size offered and the rooms free, or a refusal with a code (OUTSIDE_SEASON, INVALID_SLOT, TOO_SOON, PARTY_TOO_LARGE, NO_ROOM, SERVICE_DOWN, MISSING_DETAILS) and the next step.",
      input_schema: { type: "object", properties: { date: DATE, slot: SLOT, party_size: PARTY }, required: ["date", "slot", "party_size"] },
    },
    create_proposal: {
      description: "Hold a private room for 15 minutes for the guest in this conversation and send a 6-digit code to their phone. This is not a booking: only the guest's own click with the code confirms it. Runs every availability check again. Refusals as check_availability, plus ALREADY_HELD (give the existing reference; nothing new is created) and DUPLICATE_CONFLICT.",
      input_schema: { type: "object", properties: { date: DATE, slot: SLOT, party_size: PARTY }, required: ["date", "slot", "party_size"] },
    },
    get_proposal_status: {
      description: "The status of a proposal opened in this conversation: held (minutes left), confirmed (booking number) or released. Refuses NOT_FOUND for any other reference.",
      input_schema: { type: "object", properties: { proposal_ref: { type: "string", description: "The reference, for example JS-H1001." } }, required: ["proposal_ref"] },
    },
    hand_to_manager: {
      description: "Hand the guest's request to the restaurant manager on one of the fixed reasons. The guest's name, phone, route and any held room are added by the system. Returns the handover reference; the guest is then told in a fixed sentence.",
      input_schema: { type: "object", properties: {
        reason: { type: "string", enum: ASSISTANT_REASONS, description: "party_over_10 (more than 10 guests), too_soon (less than 2 hours before the slot), after_booking (change or cancel a confirmed booking), special_request (cake, decoration, high chair, microphone), outside_season (date not in December 2026), party_changed (party size changed after the code was sent), service_down (booking service unavailable), duplicate_conflict (same phone and slot with different details), complaint, asks_for_person (the guest asks for a person: at once)." },
        summary: { type: "string", description: "One line for the manager: what the guest wants." },
      }, required: ["reason", "summary"] },
    },
  };

  /**
   * createDesk({ booking }) -> { TOOLS, newSession, call }
   *   booking: lib/booking.js createBooking(...)
   */
  function createDesk(opts) {
    const bk = opts.booking;
    const C = bk.config;
    const iso = () => B.iso(bk.now());

    /** A session is one conversation or A2A task: { conversation, name, phone, route } from the host. */
    function newSession(ctx) {
      return Object.assign({ conversation: ctx.conversation, name: ctx.name, phone: ctx.phone, route: ctx.route, events: [], last_message: "", last_request: null, turn: 0 }, {});
    }

    const ok = (tool, data) => ({ tool, status: "ok", data, error: null });
    const refused = (tool, error, data) => ({ tool, status: "refused", data: data || null, error });
    const strip = (d) => { if (!d) return d; const x = Object.assign({}, d); delete x._room_ids; return x; };

    function heldInConversation(s) {
      return bk.state.proposals.filter((p) => p.conversation === s.conversation && p.status === "held").slice(-1)[0] || null;
    }

    const RUN = {
      check_availability(s, a) {
        s.last_request = { date: a.date, slot: B.normSlot(a.slot), party_size: a.party_size };
        const r = bk.check(a);
        return r.ok ? ok("check_availability", strip(r.data)) : refused("check_availability", r.error, strip(r.data));
      },
      create_proposal(s, a) {
        s.last_request = { date: a.date, slot: B.normSlot(a.slot), party_size: a.party_size };
        const r = bk.propose(a, { name: s.name, phone: s.phone, route: s.route, conversation: s.conversation });
        return r.ok ? ok("create_proposal", r.data) : refused("create_proposal", r.error, strip(r.data));
      },
      get_proposal_status(s, a) {
        const r = bk.status(a.proposal_ref, { conversation: s.conversation });
        return r.ok ? ok("get_proposal_status", r.data) : refused("get_proposal_status", r.error);
      },
      hand_to_manager(s, a) {
        if (!ASSISTANT_REASONS.includes(a.reason)) return refused("hand_to_manager", { code: "INVALID_REASON", retryable: true, alternatives: ASSISTANT_REASONS, clause: "H12", message: "Use one of the listed reasons." });
        if (!a.summary || !String(a.summary).trim()) return refused("hand_to_manager", { code: "MISSING_DETAILS", retryable: true, alternatives: [], clause: "H12", message: "Write a one-line summary for the restaurant manager." });
        const open = bk.state.handovers.find((h) => h.conversation === s.conversation && h.reason === a.reason && h.status === "open");
        if (open) return ok("hand_to_manager", { handover_ref: open.ref, reason: open.reason, receiver: open.receiver, already: true });
        const p = heldInConversation(s), lr = s.last_request || {};
        const h = bk.handover({ reason: a.reason, summary: String(a.summary).trim(), name: s.name, phone: s.phone, route: s.route, words: s.last_message || null,
          date: p ? p.date : lr.date || null, slot: p ? p.slot : lr.slot || null, party_size: p ? p.party_size : lr.party_size == null ? null : lr.party_size,
          room_id: p ? p.room_id : null, proposal_ref: p ? p.ref : null });
        h.conversation = s.conversation;
        return ok("hand_to_manager", { handover_ref: h.ref, reason: h.reason, receiver: h.receiver, room: h.room });
      },
    };

    /** call(session, name, input) -> { result }. PreToolUse, the tool, PostToolUse; every call written to the tool log. */
    async function call(session, name, input) {
      const pre = PRE.preToolUse(name, input || {}, session);
      let result;
      if (!pre.allow) result = refused(name, pre.error);
      else {
        try { result = RUN[name](session, pre.input); } catch (e) { result = refused(name, { code: "SERVICE_DOWN", retryable: true, alternatives: [], clause: "H7", message: String(e.message || e) }); }
      }
      POST.postToolUse(name, result, session, B);
      if (pre.notes.length) result.notes = pre.notes;
      session.events.push({ turn: session.turn, at: iso(), tool: name, input: input || {}, result: JSON.parse(JSON.stringify(result)) });
      return { result };
    }

    return { TOOLS, newSession, call, heldInConversation, booking: bk };
  }

  /** The website form: no AI, the same proposal function create_proposal calls. */
  function submitForm(booking, form, who) {
    return booking.propose({ date: form.date, slot: form.slot, party_size: form.party_size }, Object.assign({ route: "Form" }, who));
  }

  return { createDesk, submitForm, TOOLS, ASSISTANT_REASONS };
});
