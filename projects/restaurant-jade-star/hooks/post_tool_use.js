/* PostToolUse for the restaurant assistant: the fixed sentences, written in code for every refusal and every handover,
 * and shown to the guest as they are (the AI never rewords them). Each result gets a next_step:
 *   { say, end }      end: true   -> the turn ends here and the reply is written in code (not available, already held,
 *                                    not found, handover done)
 *   { action }                     -> the assistant must now call hand_to_manager with this reason
 * Runs in Node and the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JSPostToolUse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GREETING = "Welcome to Jade Star Chinese Dining 吉星饭厅.";
  const list = (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);

  // One sentence per handover reason; {phone} is the masked number the manager will call.
  const HANDOVER = {
    party_over_10: "Our private rooms seat up to 10 guests, so I've passed your booking to our restaurant manager, who will call you on {phone} to arrange it.",
    too_soon: "Bookings close 2 hours before the slot starts, so I've passed your request to our restaurant manager, who will call you on {phone} shortly.",
    after_booking: "Changes to a confirmed booking are handled by our restaurant manager, who will call you on {phone} shortly.",
    special_request: "I've passed your special request to our restaurant manager, who will call you on {phone} to arrange it.",
    outside_season: "We take bookings for December 2026 only, so I've passed your request to our restaurant manager, who will call you on {phone}.",
    party_changed: "I've passed the new party size to our restaurant manager, who will call you on {phone}; your current hold stays in place until then.",
    service_down: "Our booking system is not available right now, so I've passed your request to our restaurant manager, who will call you on {phone} shortly.",
    duplicate_conflict: "This phone number already has a booking for that slot with different details, so I've passed it to our restaurant manager, who will call you on {phone}.",
    complaint: "I'm sorry to hear that, and I've passed this to our restaurant manager, who will call you on {phone} shortly.",
    asks_for_person: "I've asked our restaurant manager to call you on {phone} shortly.",
  };
  // Refusals that must be handed over, and the reason to use.
  const NEEDS = { OUTSIDE_SEASON: "outside_season", TOO_SOON: "too_soon", PARTY_TOO_LARGE: "party_over_10", SERVICE_DOWN: "service_down", DUPLICATE_CONFLICT: "duplicate_conflict" };

  /** On the A2A route the reply goes to the customer's agent, so it names the person instead of "you". */
  function forPerson(s) {
    return s.replace(/\bcall you on\b/g, "call the person on").replace(/\bheld for you\b/g, "held for the person").replace(/\byour phone\b/g, "the person's phone")
      .replace(/\bYou already have\b/g, "The person already has").replace(/\byour (bill|request|booking|special request)\b/g, "the $1");
  }

  function heldSentence(d) {
    return `${d.room} is held for you on ${d.date_label} at ${d.slot_label} for ${d.party_size} guests. A 6-digit code has gone to your phone, so please enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out.`;
  }

  /** postToolUse(name, result, session, B) -> result with next_step (mutated and returned). B: lib/booking.js helpers. */
  function postToolUse(name, result, session, B) {
    const e = result.error, d = result.data || {};
    const phone = B.maskPhone(session.phone);
    let next = {};
    if (name === "hand_to_manager" && result.status === "ok") {
      next = { say: HANDOVER[d.reason].replace("{phone}", phone), end: true };
    } else if (name === "create_proposal" && result.status === "ok") {
      next = { say: heldSentence(d), end: false };
    } else if (e && NEEDS[e.code]) {
      next = { action: `call hand_to_manager with reason ${NEEDS[e.code]}`, reason: NEEDS[e.code] };
    } else if (e && e.code === "INVALID_SLOT") {
      const alt = (d.other_free_slots || []).map((x) => x.slot_label);
      next = { say: `Sorry, that time is outside our booking times of 10am, 1pm, 4pm and 7pm. ${alt.length ? `On ${d.date_label} you can still book ${list(alt)}.` : `No slot is free on ${d.date_label}.`}`, end: true };
    } else if (e && e.code === "NO_ROOM") {
      const alt = (d.other_free_slots || []).map((x) => x.slot_label);
      next = { say: `Sorry, every room for ${d.party_size} guests is fully booked at ${d.slot_label} on ${d.date_label}. ${alt.length ? `That day you can still book ${list(alt)}.` : "No other slot is free that day."}`, end: true };
    } else if (e && e.code === "ALREADY_HELD") {
      next = d.status === "confirmed"
        ? { say: `You already have this booking, ${d.booking_number}: ${d.room} on ${d.date_label} at ${d.slot_label} for ${d.party_size} guests.`, end: true }
        : { say: `${d.room} is already held for you on ${d.date_label} at ${d.slot_label}, reference ${d.existing_ref}. The code is on your phone and works for ${d.minutes_left} more minutes.`, end: true };
    } else if (e && e.code === "NOT_FOUND") {
      next = { say: "I can't find that booking in this conversation.", end: true };
    }
    if (next.say && session.route === "A2A agent") next.say = forPerson(next.say);
    result.next_step = next;
    return result;
  }
  return { postToolUse, HANDOVER, NEEDS, GREETING, heldSentence, forPerson };
});
