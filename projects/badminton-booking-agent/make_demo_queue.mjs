// Builds demo_queue.json: what a visitor first sees in the staff dashboard's Follow up card,
// on top of the seed's own items (receipt RC-001, cancellation CX-001, expired holds BK-2050
// and one more). Every item is made through the real tools, as a WhatsApp chat: the host passes
// the player's words and the chat contact, Claude's part is written out, and each chat ends with
// reply_to_player so "told the player" is recorded exactly as in a live chat. Examples are drawn
// from the benchmark cases (founder, 16 Oct: three per follow-up item, one for asks for a person):
//   Booking check failed  3 checks locked after 3 failures, handed over under B18 (X2)
//   Policy unclear        U1 state holiday, U2 parents watching, U3 own shuttlecocks
//   Not covered           N1 wheelchair access, N2 lockers, N5 first aid
//   Receipts              matching (seed), wrong amount (E3), wrong reference (R3)
//   Expired holds         2 in the seed, 1 here
//   Cancellations         1 in the seed, 2 here (verify and quote, then request a message later)
//   Asks for a person     S1
// Times are on the seed calendar (Fri 16 Oct 2026, before 10:00); the pages move them to the
// moment they are opened. Pages only: the benchmark runs on the plain seed.
//
// Run: node make_demo_queue.mjs   (then rebuild both pages)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createCentre, registerUpload } = require("./tools.js");

const seed = JSON.parse(readFileSync(join(HERE, "badminton_bookings.json"), "utf8"));
const clauses = JSON.parse(readFileSync(join(HERE, "resources", "clauses.json"), "utf8"));
const state = JSON.parse(JSON.stringify(seed));
const store = { load: () => state, save: () => {} };
let now = "2026-10-16T09:00";
const must = (r) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r; };
const at = (t) => { now = "2026-10-16T" + t; };

// One WhatsApp chat per player. say(turn, words) returns the host context for that message.
function chat(mobile) {
  const c = createCentre(store, { clauses }, { now: () => now });
  const contact = { channel: "WhatsApp", chat_id: "WA-" + mobile.replace(/\D/g, ""), mobile };
  c.say = (turn, message, uploads) => ({ turn, uploads: uploads || [], message, contact });
  c.reply = (ctx, policy_case, message, clause_ids) => must(c.call("reply_to_player", { policy_case, message, clause_ids }, ctx));
  return c;
}

// ---------- receipts: wrong amount and wrong reference ----------
let c = chat("016-552 8190"); at("09:52");
let ctx = c.say(1, "Book Court 10 on Sunday at 7pm for 2 hours. Name Kumar Selvam, 016-552 8190. I'll pay the court fee now.");
const r1 = must(c.call("request_booking", { court: 10, date: "2026-10-18", start_time: "19:00", hours: 2, player_name: "Kumar Selvam",
  mobile: "016-552 8190", pay_court_fee_now: true }, ctx));
c.reply(ctx, "other", `Court 10 is held for you, not confirmed yet. Booking reference ${r1.booking_ref}. Please pay RM 100 by DuitNow QR with ${r1.booking_ref} as the payment reference and upload the receipt here by ${r1.hold_expires_at}.`, ["B7", "B8", "B11"]);
at("09:57");
let up = registerUpload(store, "images/receipt-queue.png", now);
ctx = c.say(2, "Here is my receipt.", [up]);
must(c.call("report_payment", { booking_ref: r1.booking_ref, upload_id: up, document_type: "payment_receipt", amount_rm: 50,
  reference: r1.booking_ref, paid_at: "2026-10-16T09:56", recipient: "Subang Badminton Arena" }, ctx));
c.reply(ctx, "other", "Thanks, I've recorded your receipt for staff to check. One difference: the receipt shows RM 50.00, but RM 100.00 is due (RM 50 deposit plus RM 50 court fee). Staff will check it, and your court stays held until they do.", ["B12", "B23"]);

c = chat("012-466 3015"); at("09:46");
ctx = c.say(1, "Can I book Court 4 on Monday 8pm for 1 hour? Wong Mei Kuan, 012-466 3015. I'll pay the fee after playing.");
const r2 = must(c.call("request_booking", { court: 4, date: "2026-10-19", start_time: "20:00", hours: 1, player_name: "Wong Mei Kuan",
  mobile: "012-466 3015", pay_court_fee_now: false }, ctx));
c.reply(ctx, "other", `Court 4 is held for you, not confirmed yet. Booking reference ${r2.booking_ref}. Please pay the RM 50 deposit by DuitNow QR with ${r2.booking_ref} as the payment reference and upload the receipt here by ${r2.hold_expires_at}.`, ["B8", "B9", "B11"]);
at("09:53");
up = registerUpload(store, "images/receipt-queue-ref.png", now);
ctx = c.say(2, "Paid, receipt attached.", [up]);
must(c.call("report_payment", { booking_ref: r2.booking_ref, upload_id: up, document_type: "payment_receipt", amount_rm: 50,
  reference: "BK-1999", paid_at: "2026-10-16T09:51", recipient: "Subang Badminton Arena" }, ctx));
c.reply(ctx, "other", `Thanks, I've recorded your receipt for staff to check. One difference: the receipt reference is BK-1999, not ${r2.booking_ref}. Staff will check it, and your court stays held until they do.`, ["B12", "B23"]);

// ---------- a third expired hold ----------
c = chat("017-308 2264"); at("09:05");
ctx = c.say(1, "Book Court 3 on Tuesday 9pm, 1 hour. Lim Kah Hoe, 017-308 2264. Fee after the session.");
const r3 = must(c.call("request_booking", { court: 3, date: "2026-10-20", start_time: "21:00", hours: 1, player_name: "Lim Kah Hoe",
  mobile: "017-308 2264", pay_court_fee_now: false }, ctx));
c.reply(ctx, "other", `Court 3 is held for you, not confirmed yet. Booking reference ${r3.booking_ref}. Please pay the RM 50 deposit by DuitNow QR with ${r3.booking_ref} as the payment reference and upload the receipt here by ${r3.hold_expires_at}.`, ["B8", "B11", "B12"]);

// ---------- two more pending cancellations ----------
for (const [ref, t] of [["BK-1351", "09:22"], ["BK-1531", "09:38"]]) {
  const b = state.bookings.find((x) => x.booking_ref === ref);
  c = chat(b.mobile); at(t);
  ctx = c.say(1, `Please cancel ${ref}, my number ends ${b.mobile.slice(-4)}.`);
  must(c.call("verify_booking", { booking_ref: ref, mobile_last4: b.mobile.slice(-4) }, ctx));
  const q = must(c.call("quote_cancellation", { booking_ref: ref }, ctx));
  c.reply(ctx, "covered", `If you cancel ${ref}, RM ${q.refund.total_rm} is refunded to the account that paid, within 3 working days of staff approval. Shall I submit the cancellation?`, ["C3", "C4", "C7"]);
  ctx = c.say(2, "Yes, go ahead.");
  must(c.call("request_cancellation", { booking_ref: ref }, ctx));
  c.reply(ctx, "other", `I've submitted your cancellation request for ${ref}. It's pending staff approval, and the booking stays in place until they approve it. You'll get a message here once they do.`, ["C8", "C9"]);
}

// ---------- three failed booking checks (B18) ----------
for (const [ref, mobile, t, ask, tries] of [
  ["BK-2041", "018-220 4517", "09:10", "Show me booking BK-2041, my number ends 1111.", ["1111", "2222", "3333"]],
  ["BK-1283", "013-771 2049", "09:29", "I want to cancel BK-1283, number ends 4455.", ["4455", "4456", "5544"]],
  ["BK-1500", "019-332 7710", "09:47", "What court and time is BK-1500? My number ends 7710.", ["7710", "7701", "0177"]],
]) {
  c = chat(mobile); at(t);
  tries.forEach((d, i) => {
    at(t.slice(0, 3) + String(Number(t.slice(3)) + i).padStart(2, "0"));   // one try a minute
    ctx = c.say(i + 1, i === 0 ? ask : `Try ${d}.`);
    c.call("verify_booking", { booking_ref: ref, mobile_last4: d }, ctx);
    if (i < 2) c.reply(ctx, "other", "Those details don't match, so I can't share anything about this booking. Please check the booking reference and the last 4 digits of the mobile number on it.", ["B17"]);
  });
  must(c.call("hand_to_staff", { reason: "check_failed", booking_ref: ref, clause_ids: ["B17", "B18"],
    root_cause: `The booking check for ${ref} failed 3 times in this chat (B18); nothing about the booking was shared.`,
    recommended_action: `Contact the player on this chat's number about ${ref}; share details only once the booking holder is confirmed.` }, ctx));
  c.reply(ctx, "other", "Those details don't match either. After 3 failed checks I can't check any more in this chat, and I haven't shared anything about the booking. I've passed your enquiry to our staff, and they will follow up with you here.", ["B18"]);
}

// ---------- policy unclear, not covered, asks for a person ----------
const handovers = [
  ["09:08", "013-882 4105", "Is the Sultan of Selangor's birthday charged at the weekend fee?", "unclear",
   { reason: "policy_unclear", clause_ids: ["B7"], root_cause: "B7 charges the weekend fee on Saturday, Sunday and public holidays; it does not say whether a state holiday such as the Sultan of Selangor's birthday counts.",
     recommended_action: "Tell the player which fee applies on state holidays; consider clarifying B7." },
   "Our policy charges the weekend fee on Saturdays, Sundays and public holidays, but it doesn't say whether a state holiday counts. I've passed this to our staff to confirm, and they will follow up with you here."],
  ["09:27", "012-901 3374", "We have 6 players plus 2 parents watching. Is that OK?", "unclear",
   { reason: "policy_unclear", clause_ids: ["O12"], root_cause: "O12 allows up to 6 players per court per session; it does not say whether people only watching are allowed or count towards the limit.",
     recommended_action: "Tell the player whether 2 parents may watch alongside 6 players; consider clarifying O12 on spectators." },
   "Up to 6 players can play on one court, but our policy doesn't say whether people who are only watching count. I've passed this to our staff to confirm, and they will follow up with you here."],
  ["09:55", "016-217 5590", "Can we bring our own shuttlecocks?", "unclear",
   { reason: "policy_unclear", clause_ids: ["O10"], root_cause: "O10 says shuttlecocks are sold at the counter; it neither allows nor forbids players bringing their own.",
     recommended_action: "Tell the player whether their own shuttlecocks are allowed; consider clarifying O10." },
   "Shuttlecocks are sold at our counter, but our policy doesn't say whether you can bring your own. I've passed this to our staff to confirm, and they will follow up with you here."],
  ["09:15", "011-2093 4471", "Is the centre wheelchair accessible?", "not_covered",
   { reason: "not_in_policy", clause_ids: ["O1", "O8"], root_cause: "No clause covers wheelchair access; O1 describes the centre and O8 lists the facilities without mentioning access.",
     recommended_action: "Reply on access (entrance, lift or ramp, accessible toilet); consider adding an access clause to the Operation Policy." },
   "I don't have that information, so I've passed your question to our staff. They will follow up with you here."],
  ["09:34", "018-640 2218", "Do you have lockers for our bags?", "not_covered",
   { reason: "not_in_policy", clause_ids: ["O8"], root_cause: "No clause covers lockers or bag storage; O8 lists changing rooms, showers, drinking water and parking without them.",
     recommended_action: "Reply on lockers or bag storage; consider adding it to O8." },
   "I don't have that information, so I've passed your question to our staff. They will follow up with you here."],
  ["09:51", "017-455 9032", "Is there a first-aid kit, or someone trained in first aid?", "not_covered",
   { reason: "not_in_policy", clause_ids: ["O8", "O4"], root_cause: "No clause covers first aid; O8 lists the facilities and O4 says the counter is staffed, without mentioning first aid.",
     recommended_action: "Reply on the first-aid kit and first-aid trained staff; consider adding a safety clause." },
   "I don't have that information, so I've passed your question to our staff. They will follow up with you here."],
  ["09:44", "011-3301 7826", "I want to talk to a person.", "other",
   { reason: "asks_for_staff", clause_ids: ["B22"], root_cause: "The player asked to speak to a person (B22); no other request was made.",
     recommended_action: "Reply to the player in this chat and ask how you can help." },
   "Sure, I've passed your request to our staff and they will follow up with you here."],
];
for (const [t, mobile, words, policyCase, h, told] of handovers) {
  c = chat(mobile); at(t);
  ctx = c.say(1, words);
  must(c.call("hand_to_staff", h, ctx));
  c.reply(ctx, policyCase, told, h.reason === "not_in_policy" ? [] : h.clause_ids);
}

const added = (key, id) => state[key].filter((x) => !seed[key].some((s) => s[id] === x[id]));
const queue = {
  bookings: added("bookings", "booking_ref"), receipts: added("receipts", "receipt_id"),
  cancellations: added("cancellations", "cancellation_id"),
  handovers: state.handovers, uploads: state.uploads, next_ref: state.meta.next_ref,
};
writeFileSync(join(HERE, "demo_queue.json"), JSON.stringify(queue, null, 1));
console.log(`Wrote demo_queue.json: ${queue.bookings.length} requests, ${queue.receipts.length} receipts, ${queue.cancellations.length} cancellations, ${queue.handovers.length} handovers`);
