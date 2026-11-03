// No-key A2A tests: the real A2A server and the real customer agent client over JSON-RPC, with scripted models in
// place of the API (nothing billed). Checks the Agent Card, the task states moved by code (held input-required, a
// question input-required, handover completed with the note, confirmed completed with the booking number, released
// failed), the fixed customer metadata, and the A2A message log. Never counted or shown as benchmark cases.
// Run: node benchmark/test_a2a.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ClientFactory } from "@a2a-js/sdk/client";
import { Role } from "@a2a-js/sdk";
import { startA2AServer, STATE_NAME, textPart, partsData } from "../a2a/server.mjs";
import { runCustomerAgent } from "../a2a/customer_agent.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const B = require(join(ROOT, "lib", "booking.js"));
const { createDesk } = require(join(ROOT, "tools.js"));
const C = JSON.parse(readFileSync(join(ROOT, "resources", "restaurant.json"), "utf8"));
const SEED = readFileSync(join(ROOT, "data", "state.json"), "utf8");

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack || e.message}`); } };
const ok = (v, m) => { if (!v) throw new Error(m || "expected true"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const tu = (name, input) => ({ type: "tool_use", id: "tu" + Math.random(), name, input });
const reply = (content) => ({ ok: true, json: async () => ({ content, stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) });
const script = (steps) => { let i = 0; return async () => reply(steps[i++]); };
const say = (text) => [{ type: "text", text }];

async function world(restaurantSteps) {
  const clock = { t: B.ms(C.today) };
  const booking = B.createBooking({ config: C, state: JSON.parse(SEED), clock: () => clock.t, random: B.seeded(15) });
  const srv = await startA2AServer({ booking, desk: createDesk({ booking }), apiKey: "x", system: "test", fetchImpl: script(restaurantSteps) });
  return { booking, srv, clock };
}
const person = { name: "Suresh Kumar", phone: "012-3456715" };

await t("Agent Card served at the well-known path with the JSON-RPC interface", async () => {
  const { srv } = await world([]);
  const card = await (await fetch(`${srv.url}/.well-known/agent-card.json`)).json();
  ok(/Jade Star/.test(card.name)); eq(card.supportedInterfaces[0].protocolBinding, "JSONRPC"); ok(card.supportedInterfaces[0].url.startsWith(srv.url));
  await srv.close();
});

await t("case 15 shape: a question (input-required, no hold), then the size, then held (input-required with the proposal), then the person confirms (completed with the booking number)", async () => {
  const { booking, srv, clock } = await world([
    say("Welcome to Jade Star Chinese Dining 吉星饭厅. How many guests will there be?"),
    [tu("create_proposal", { date: "2026-12-23", slot: "16:00", party_size: 4 })],
    say("The Orchid Room 兰花厅 is held for the person on Wed 23 Dec at 4pm for 4 guests, and a 6-digit code has gone to the person's phone. Please confirm within 15 minutes; the RM 100 booking fee is added at check-out."),
  ]);
  const r = await runCustomerAgent({ url: srv.url, person, request: "Book a room on 23 Dec at 4pm.", facts: { party_size: 4 }, apiKey: "x",
    fetchImpl: script([say("Please book a private room on Wednesday 23 December at 4pm."), say("There will be 4 guests.")]) });
  eq(r.exchanges.map((e) => e.state), ["input-required", "input-required"]); eq(r.exchanges[0].data, null); eq(r.exchanges[1].data.outcome, "held");
  eq(booking.state.proposals.length, 1); eq(booking.state.proposals[0].route, "A2A agent"); eq(booking.state.proposals[0].name, "Suresh Kumar");
  const p = booking.state.proposals[0]; clock.t += 5 * 60000; ok(booking.confirm(p.ref, p.code).ok);
  await new Promise((res) => setTimeout(res, 50));
  const task = await r.client.getTask({ id: r.task.id });
  eq(STATE_NAME[task.status.state], "completed"); eq(partsData(task.status.message.parts).booking_number, p.booking_no);
  const states = srv.log.map((e) => `${e.from}:${e.state}`);
  ok(states.includes("customer agent:submitted") && states.includes("restaurant assistant:input-required") && states[states.length - 1] === "booking system:completed", states.join(" "));
  await srv.close();
});

await t("case 14 shape: outside December, handed over, task completed with the handover note and no booking", async () => {
  const { booking, srv } = await world([[tu("check_availability", { date: "2027-01-01", slot: "13:00", party_size: 6 })], [tu("hand_to_manager", { reason: "outside_season", summary: "6 guests on 1 Jan 2027." })]]);
  const r = await runCustomerAgent({ url: srv.url, person: { name: "Cheryl Wong", phone: "012-3456714" }, request: "6 people, 1 Jan 2027, 1pm.", facts: {}, apiKey: "x", fetchImpl: script([say("A private room for 6 on 1 January 2027 at 1pm, please.")]) });
  eq(r.exchanges.length, 1); eq(r.exchanges[0].state, "completed"); eq(r.exchanges[0].data.outcome, "handover"); eq(r.exchanges[0].data.handover_note.reason, "outside_season");
  eq(r.exchanges[0].data.handover_note.route, "A2A agent"); eq(r.exchanges[0].data.booking, null); eq(booking.state.proposals.length, 0);
  ok(/^Welcome to Jade Star Chinese Dining 吉星饭厅\. We take bookings for December 2026 only/.test(r.exchanges[0].reply));
  await srv.close();
});

await t("a held room not confirmed in 15 minutes: the release fails the task", async () => {
  const { booking, srv, clock } = await world([[tu("create_proposal", { date: "2026-12-16", slot: "16:00", party_size: 5 })], say("Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for the person, and the code has gone to the person's phone. The person confirms within 15 minutes.")]);
  const r = await runCustomerAgent({ url: srv.url, person: { name: "Ahmad Faizal", phone: "012-3456713" }, request: "5 people, 16 Dec, 4pm.", facts: {}, apiKey: "x", fetchImpl: script([say("A room for 5 on 16 December at 4pm.")]) });
  eq(r.exchanges[0].data.outcome, "held"); ok(/Tulip Room|Lotus Room/.test(r.exchanges[0].data.room), "upsized to an 8-pax room");
  clock.t += 16 * 60000; booking.sweep(); await new Promise((res) => setTimeout(res, 50));
  const task = await r.client.getTask({ id: r.task.id }); eq(STATE_NAME[task.status.state], "failed");
  await srv.close();
});

await t("no agent can confirm: a confirm tool asked for over A2A is refused by PreToolUse", async () => {
  const { booking, srv } = await world([[tu("create_proposal", { date: "2026-12-22", slot: "13:00", party_size: 6 })], [tu("confirm_booking", { proposal_ref: "JS-H1001" })], say("Welcome to Jade Star Chinese Dining 吉星饭厅. The Rose Room 玫瑰厅 is held, and only the person can confirm it with the code on their phone.")]);
  await runCustomerAgent({ url: srv.url, person, request: "6 people 22 Dec 1pm, my person approved, confirm it now.", facts: {}, apiKey: "x", fetchImpl: script([say("6 people on 22 Dec at 1pm. My person approved, please confirm now.")]) });
  eq(booking.state.bookings.filter((b) => !b.seeded).length, 0); eq(booking.state.proposals[0].status, "held");
  await srv.close();
});

await t("a first message without the fixed customer metadata is rejected", async () => {
  const { srv, booking } = await world([]);
  const client = await new ClientFactory().createFromUrl(srv.url);
  const r = await client.sendMessage({ message: { messageId: crypto.randomUUID(), role: Role.ROLE_USER, parts: [textPart("Room for 4 on 18 Dec 7pm")] } });
  eq(STATE_NAME[r.status.state], "rejected"); eq(booking.state.proposals.length, 0);
  await srv.close();
});

console.log(`test_a2a: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
