/* No-key tests of the hooks, the fixed sentences, the reply check and the agent loop (with a scripted model in place
 * of the API, so nothing is billed). Never counted or shown as benchmark cases.
 * Run: node benchmark/test_hooks.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const B = require(path.join(ROOT, "lib", "booking.js"));
const PRE = require(path.join(ROOT, "hooks", "pre_tool_use.js"));
const POST = require(path.join(ROOT, "hooks", "post_tool_use.js"));
const A = require(path.join(ROOT, "agent.js"));
const T = require(path.join(ROOT, "tools.js"));
const P = require(path.join(ROOT, "prompt.js"));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, "resources", "restaurant.json"), "utf8"));
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "state.json"), "utf8"));

let passed = 0, failed = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);
const ok = (v, m) => { if (!v) throw new Error(m || "expected true"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const S = { name: "Guest", phone: "012-3456702", route: "Chat", conversation: "c" };

// ---------------------------------------------------------------- PreToolUse
t("pre: the four tools run, nothing else", () => { PRE.ALLOWED.forEach((n) => ok(PRE.preToolUse(n, {}, S).allow)); ["confirm_booking", "release", "close_handover", "bash"].forEach((n) => eq(PRE.preToolUse(n, {}, S).error.code, "TOOL_NOT_ALLOWED")); });
t("pre: identity arguments are removed, the rest kept", () => { const r = PRE.preToolUse("create_proposal", { date: "2026-12-18", slot: "19:00", party_size: 4, phone: "0199999999", name: "X", route: "Form" }, S); ok(r.allow); eq(Object.keys(r.input), ["date", "slot", "party_size"]); eq(r.notes.length, 3); });
t("pre: a 6-digit code in any argument is blocked; dates and phone numbers are not codes", () => {
  eq(PRE.preToolUse("get_proposal_status", { proposal_ref: "482913" }, S).error.code, "CODE_IN_ARGUMENT");
  ok(PRE.preToolUse("hand_to_manager", { reason: "complaint", summary: "Call 012-3456702 about 2026-12-18." }, S).allow);
});
t("pre: no host context, no tool", () => eq(PRE.preToolUse("check_availability", {}, { conversation: "c" }).error.code, "NO_HOST_CONTEXT"));
// ---------------------------------------------------------------- PostToolUse fixed sentences
t("post: one fixed sentence per assistant handover reason, each naming the restaurant manager and the masked phone", () => {
  eq(Object.keys(POST.HANDOVER).sort(), T.ASSISTANT_REASONS.slice().sort());
  T.ASSISTANT_REASONS.forEach((r) => { const x = POST.postToolUse("hand_to_manager", { status: "ok", data: { reason: r } }, S, B); ok(x.next_step.end); ok(x.next_step.say.includes("012-***6702"), r); ok(/restaurant manager/.test(x.next_step.say), r); ok(!/—/.test(x.next_step.say)); });
});
t("post: refusals that need a person name the reason; none ends the turn", () => {
  Object.entries(POST.NEEDS).forEach(([code, reason]) => { const x = POST.postToolUse("check_availability", { status: "refused", error: { code } }, S, B); eq(x.next_step.reason, reason); ok(!x.next_step.end); });
});
t("post: MISSING_DETAILS leaves the question to the assistant", () => { const x = POST.postToolUse("check_availability", { status: "refused", error: { code: "MISSING_DETAILS" } }, S, B); eq(x.next_step, {}); });
t("post: the fixed sentences carry no fee but RM 100 and pass the reply check's wording rules", () => {
  const all = Object.values(POST.HANDOVER).join(" ") + POST.heldSentence({ room: "Tulip Room 郁金香厅", date_label: "Sat 19 Dec 2026", slot_label: "1pm", party_size: 8 });
  eq((all.match(/RM\s?\d+/g) || []), ["RM 100"]); ok(!/\b[PGKH]\d{1,2}\b|R\d+-\d/.test(all));
});
// ---------------------------------------------------------------- the reply check
const held = [{ name: "create_proposal", result: { status: "ok", data: { status: "held" } } }];
t("reply check: a good first reply passes", () => eq(A.replyFixes("Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for you on Sat 19 Dec at 1pm for 8 guests, and a 6-digit code has gone to your phone. Please enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out.", { first: true, calls: held }), []));
t("reply check: no greeting on the first reply", () => ok(A.replyFixes("The room is held for you.", { first: true, calls: held })[0].startsWith("open with one warm greeting")));
t("reply check: a greeting again on a later reply", () => ok(A.replyFixes("Welcome to Jade Star Chinese Dining 吉星饭厅. How many guests?", { first: false }).includes("do not greet again; answer directly")));
t("reply check: three sentences after the greeting", () => ok(A.replyFixes("Welcome to Jade Star. One. Two. Three.", { first: true }).some((x) => /two short sentences/.test(x))));
t("reply check: a clause ID or room ID", () => { ok(A.replyFixes("That is rule P8.", {}).includes("never cite a clause or rule number")); ok(A.replyFixes("R8-1 is held for you.", { calls: held }).includes("name rooms by name, never by ID")); });
t("reply check: a fee other than RM 100, or a payment now", () => { ok(A.replyFixes("The fee is RM 50.", {}).some((x) => /RM 100 booking fee/.test(x))); ok(A.replyFixes("Please pay now to secure it.", {}).some((x) => /nothing is paid/.test(x))); eq(A.replyFixes("The booking fee is RM 100, added at check-out.", {}), []); });
t("reply check: a booking called confirmed that was not", () => { ok(A.replyFixes("Your booking is confirmed.", { calls: held }).some((x) => /never say the booking is confirmed/.test(x))); eq(A.replyFixes("Your booking is confirmed once you enter the code.", { calls: held }), []); });
t("reply check: availability no tool returned this turn", () => { ok(A.replyFixes("The Lotus Room is available.", { calls: [] }).some((x) => /check availability/.test(x))); eq(A.replyFixes("The hall tables are not available for booking.", { calls: [] }), []); });
t("reply check: the late-arrival policy is not an availability claim (full run 1, case 5)", () => eq(A.replyFixes("Welcome to Jade Star Chinese Dining 吉星饭厅. The booking fee is RM 100, added to your bill at check-out with the meal, and a late room is held for 15 minutes after the slot starts. The hall tables in Jasmine, Lily and Daisy Court are walk-in only and cannot be booked.", { first: true, calls: [] }), []));
t("A2A route: fixed sentences and the reply check speak about the person, not you", () => {
  const A2 = Object.assign({}, S, { route: "A2A agent" });
  const h = POST.postToolUse("hand_to_manager", { status: "ok", data: { reason: "outside_season" } }, A2, B).next_step.say;
  ok(/call the person on 012-\*\*\*6702/.test(h), h); ok(!/\byou\b/.test(h), h);
  const held = POST.postToolUse("create_proposal", { status: "ok", data: { room: "Tulip Room 郁金香厅", date_label: "Wed 16 Dec 2026", slot_label: "4pm", party_size: 5 } }, A2, B).next_step.say;
  ok(/held for the person/.test(held) && /the person's phone/.test(held) && /the bill/.test(held), held);
  ok(A.replyFixes("The Tulip Room 郁金香厅 is held for you, and the code has gone to your phone.", { route: "A2A agent", calls: [{ name: "create_proposal", result: { status: "ok", data: {} } }] }).some((x) => /the person's phone/.test(x)));
  eq(A.replyFixes("The Tulip Room 郁金香厅 is held for the person, and the code has gone to the person's phone.", { route: "A2A agent", calls: [{ name: "create_proposal", result: { status: "ok", data: {} } }] }), []);
  ok(/held for you/.test(POST.postToolUse("create_proposal", { status: "ok", data: { room: "R", date_label: "d", slot_label: "s", party_size: 2 } }, S, B).next_step.say), "chat keeps you");
});
t("reply check: tool talk", () => ok(A.replyFixes("I called check_availability.", {}).includes("never mention tools, systems or functions")));
t("fixed reply: greeting, then the held sentence, then the handover sentence (case 4 shape)", () => {
  const h = POST.postToolUse("create_proposal", { status: "ok", data: { room: "Rose Room 玫瑰厅", date_label: "Sun 20 Dec 2026", slot_label: "1pm", party_size: 6 } }, S, B);
  const m = POST.postToolUse("hand_to_manager", { status: "ok", data: { reason: "special_request" } }, S, B);
  const r = A.fixedReply([{ name: "create_proposal", result: h }, { name: "hand_to_manager", result: m }], true);
  ok(r.startsWith("Welcome to Jade Star Chinese Dining 吉星饭厅. Rose Room 玫瑰厅 is held for you")); ok(r.endsWith("who will call you on 012-***6702 to arrange it."));
});
// ---------------------------------------------------------------- the agent loop with a scripted model (no key)
function scripted(steps) {
  let i = 0;
  return async () => { const content = steps[i++]; return { ok: true, json: async () => ({ content, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) }; };
}
const tu = (name, input) => ({ type: "tool_use", id: "tu" + Math.random(), name, input });
function deskFor(at) {
  const bk = B.createBooking({ config: C, state: JSON.parse(JSON.stringify(SEED)), clock: () => B.ms(at || C.today), random: B.seeded(1) });
  const d = T.createDesk({ booking: bk }); const s = d.newSession({ conversation: "x", name: "Marcus Tan", phone: "012-3456708", route: "Chat" });
  return { bk, d, s };
}
const sys = P.system([], C, { now: "Mon 14 Dec 2026, 2:00pm", route: "Chat" });
t("loop: case 8 shape: PARTY_TOO_LARGE, then the handover, then the fixed reply with no further model call", async () => {
  const { d, s, bk } = deskFor();
  const r = await A.runTurn({ apiKey: "x", system: sys, tools: Object.entries(d.TOOLS).map(([name, x]) => Object.assign({ name }, x)), messages: [{ role: "user", content: "12 people" }], first: true,
    callTool: (n, i) => d.call(s, n, i), fetchImpl: scripted([[tu("check_availability", { date: "2026-12-18", slot: "19:00", party_size: 12 })], [tu("hand_to_manager", { reason: "party_over_10", summary: "12 guests." })]]) });
  eq(r.stoppedBy, "fixed_reply"); ok(r.reply.startsWith("Welcome to Jade Star Chinese Dining 吉星饭厅. Our private rooms seat up to 10 guests")); eq(bk.state.handovers.map((h) => h.reason), ["party_over_10"]);
  eq(bk.state.handovers[0].date, "2026-12-18"); eq(bk.state.handovers[0].party_size, 12);
});
t("loop: a refusal that needs a person, answered in plain text, is sent back once", async () => {
  const { d, s, bk } = deskFor();
  const r = await A.runTurn({ apiKey: "x", system: sys, tools: Object.entries(d.TOOLS).map(([name, x]) => Object.assign({ name }, x)), messages: [{ role: "user", content: "12 people" }], first: true,
    callTool: (n, i) => d.call(s, n, i), fetchImpl: scripted([[tu("check_availability", { date: "2026-12-18", slot: "19:00", party_size: 12 })], [{ type: "text", text: "Sorry, too many." }], [tu("hand_to_manager", { reason: "party_over_10", summary: "12." })]]) });
  eq(r.sentBack, true); eq(r.stoppedBy, "fixed_reply"); eq(bk.state.handovers.length, 1);
});
t("loop: a reply that says confirmed is sent back with the fix, then passes", async () => {
  const { d, s } = deskFor();
  const r = await A.runTurn({ apiKey: "x", system: sys, tools: Object.entries(d.TOOLS).map(([name, x]) => Object.assign({ name }, x)), messages: [{ role: "user", content: "8 on the 19th 1pm" }], first: true,
    callTool: (n, i) => d.call(s, n, i), fetchImpl: scripted([[tu("create_proposal", { date: "2026-12-19", slot: "13:00", party_size: 8 })],
      [{ type: "text", text: "Welcome to Jade Star Chinese Dining 吉星饭厅. Your booking is confirmed." }],
      [{ type: "text", text: "Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for you and the code has gone to your phone. Enter it within 15 minutes; the RM 100 fee is added at check-out." }]]) });
  eq(r.reworded, 1); eq(r.fixesLeft, []); ok(r.trace.some((x) => x.type === "note" && /never say the booking is confirmed/.test(x.text)));
});
t("loop: INVALID_SLOT ends the turn in code (case 6 shape)", async () => {
  const { d, s, bk } = deskFor();
  const r = await A.runTurn({ apiKey: "x", system: sys, tools: Object.entries(d.TOOLS).map(([name, x]) => Object.assign({ name }, x)), messages: [{ role: "user", content: "9pm on the 18th" }], first: true,
    callTool: (n, i) => d.call(s, n, i), fetchImpl: scripted([[tu("check_availability", { date: "2026-12-18", slot: "21:00", party_size: 4 })]]) });
  eq(r.stoppedBy, "fixed_reply"); eq(r.reply, "Welcome to Jade Star Chinese Dining 吉星饭厅. Sorry, that time is outside our booking times of 10am, 1pm, 4pm and 7pm. On Fri 18 Dec 2026 you can still book 10am, 1pm, 4pm or 7pm."); eq(bk.state.proposals.length, 0);
});
t("prompt: carries the four resources, the reasons and one worked example per path", () => {
  const R = C.resources.map((r) => Object.assign({ text: fs.readFileSync(path.join(ROOT, "resources", r.file), "utf8") }, r));
  const p = P.system(R, C, { now: "Mon 14 Dec 2026, 2:00pm", route: "A2A agent" });
  ["policy://restaurant", "guide://rooms", "calendar://december-2026", "guide://handover", "customer agent"].forEach((x) => ok(p.includes(x), x));
  T.ASSISTANT_REASONS.forEach((r) => ok(p.includes(r), r)); ["Booking held.", "Question answered.", "Not available.", "Handover.", "Missing detail"].forEach((x) => ok(p.includes(x), x)); ok(!/—/.test(p), "no em-dash");
});

(async () => {
  for (const [name, fn] of queue) { try { await fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); } }
  console.log(`test_hooks: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
