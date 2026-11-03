// No-key tool tests through the MCP client: the four resources, every tool once and every structured error, the
// different-details branch of the duplicate rule (reason 9), reasons 10 and 11 through hand_to_manager, NOT_FOUND for
// another conversation's proposal, the blocked calls, and the fixed sentence on each refusal and handover.
// Never counted or shown as benchmark cases. Run: node benchmark/test_tools.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); } };
const ok = (v, m) => { if (!v) throw new Error(m || "expected true"); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

async function connect(env) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "mcp_server.mjs")], cwd: ROOT, env: Object.assign({}, process.env, env || {}), stderr: "pipe" });
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}
const host = (conversation, n) => ({ conversation, name: `Guest ${n}`, phone: `012-88800${String(n).padStart(2, "0")}`, route: "Chat" });
async function call(client, name, args, meta) {
  const r = await client.callTool({ name, arguments: args, _meta: meta });
  return JSON.parse(r.content[0].text);
}

const c = await connect();
await t("four resources R1 to R4", async () => {
  const r = await c.listResources(); eq(r.resources.map((x) => x.uri), ["policy://restaurant", "guide://rooms", "calendar://december-2026", "guide://handover"]);
  const p = await c.readResource({ uri: "policy://restaurant" }); ok(p.contents[0].text.includes("## P14 After booking"));
});
await t("four tools, no confirm, release or close", async () => {
  const r = await c.listTools(); eq(r.tools.map((x) => x.name), ["check_availability", "create_proposal", "get_proposal_status", "hand_to_manager"]);
});
const A = host("conv-A", 1), Bm = host("conv-B", 2);
await t("T1 ok: room size, rooms free by name, no IDs", async () => {
  const r = await call(c, "check_availability", { date: "2026-12-16", slot: "16:00", party_size: 5 }, A);
  eq(r.status, "ok"); eq(r.data.room_size, 8); eq(r.data.upsized, true); ok(r.data.rooms_free.every((x) => /Room .+厅$/.test(x))); ok(!JSON.stringify(r).match(/R\d+-\d/), "no room ID in the result");
});
for (const [label, args, code, retry] of [
  ["OUTSIDE_SEASON", { date: "2027-01-01", slot: "13:00", party_size: 6 }, "OUTSIDE_SEASON", false],
  ["INVALID_SLOT", { date: "2026-12-18", slot: "21:00", party_size: 4 }, "INVALID_SLOT", true],
  ["TOO_SOON", { date: "2026-12-14", slot: "13:00", party_size: 4 }, "TOO_SOON", false],
  ["PARTY_TOO_LARGE", { date: "2026-12-18", slot: "19:00", party_size: 12 }, "PARTY_TOO_LARGE", false],
  ["NO_ROOM", { date: "2026-12-26", slot: "19:00", party_size: 8 }, "NO_ROOM", true],
  ["MISSING_DETAILS", { date: "2026-12-23", slot: "16:00" }, "MISSING_DETAILS", true],
]) {
  await t(`T1 ${label}: code, retryable, alternatives`, async () => {
    const r = await call(c, "check_availability", args, A);
    eq(r.status, "refused"); eq(r.error.code, code); eq(r.error.retryable, retry); ok(Array.isArray(r.error.alternatives)); ok(r.error.clause);
  });
}
await t("fixed sentences: INVALID_SLOT and NO_ROOM end the turn with the free slots that day", async () => {
  const a = await call(c, "check_availability", { date: "2026-12-18", slot: "21:00", party_size: 4 }, A);
  eq(a.next_step.end, true); ok(/10am, 1pm, 4pm or 7pm/.test(a.next_step.say));
  const b = await call(c, "check_availability", { date: "2026-12-26", slot: "19:00", party_size: 8 }, A);
  eq(b.next_step.end, true); eq(b.next_step.say, "Sorry, every room for 8 guests is fully booked at 7pm on Sat 26 Dec 2026. That day you can still book 10am, 1pm or 4pm.");
});
await t("refusals that need a person point to the handover reason", async () => {
  eq((await call(c, "check_availability", { date: "2026-12-18", slot: "19:00", party_size: 12 }, A)).next_step.reason, "party_over_10");
  eq((await call(c, "check_availability", { date: "2027-01-01", slot: "13:00", party_size: 6 }, A)).next_step.reason, "outside_season");
  eq((await call(c, "check_availability", { date: "2026-12-14", slot: "13:00", party_size: 4 }, A)).next_step.reason, "too_soon");
});
let ref;
await t("T2 ok: held 15 minutes, code sent, RM 100 fee line, no code in the result", async () => {
  const r = await call(c, "create_proposal", { date: "2026-12-22", slot: "1pm", party_size: 6 }, A);
  eq(r.status, "ok"); eq(r.data.status, "held"); eq(r.data.hold_minutes, 15); ok(/^RM 100 /.test(r.data.fee)); ok(/^012-\*+\d{4}$/.test(r.data.code_sent_to));
  ok(!/"code"\s*:\s*"\d{6}"/.test(JSON.stringify(r))); ref = r.data.proposal_ref; ok(/^JS-H\d+$/.test(ref));
});
await t("T2 ALREADY_HELD: same phone, same details, the existing reference, fixed sentence", async () => {
  const r = await call(c, "create_proposal", { date: "2026-12-22", slot: "13:00", party_size: 6 }, A);
  eq(r.error.code, "ALREADY_HELD"); eq(r.data.existing_ref, ref); eq(r.next_step.end, true); ok(r.next_step.say.includes(ref));
});
await t("T2 DUPLICATE_CONFLICT then reason 9 through hand_to_manager", async () => {
  const r = await call(c, "create_proposal", { date: "2026-12-22", slot: "13:00", party_size: 4 }, A);
  eq(r.error.code, "DUPLICATE_CONFLICT"); eq(r.next_step.reason, "duplicate_conflict");
  const h = await call(c, "hand_to_manager", { reason: "duplicate_conflict", summary: "Same slot asked again for 4 instead of 6." }, A);
  eq(h.status, "ok"); eq(h.data.reason, "duplicate_conflict"); eq(h.data.receiver, "Restaurant manager"); eq(h.next_step.end, true); ok(/012-\*+0001/.test(h.next_step.say));
});
await t("T2 identity arguments from the model are removed; the host's phone is used", async () => {
  const r = await call(c, "create_proposal", { date: "2026-12-23", slot: "10:00", party_size: 2, phone: "019-1111111", name: "Someone Else" }, Bm);
  eq(r.status, "ok"); ok(/0002$/.test(r.data.code_sent_to)); ok(r.notes && r.notes.length === 2);
});
await t("T3 held with minutes left in its own conversation", async () => {
  const r = await call(c, "get_proposal_status", { proposal_ref: ref }, A); eq(r.status, "ok"); eq(r.data.status, "held"); ok(r.data.minutes_left > 0 && r.data.minutes_left <= 15);
});
await t("T3 NOT_FOUND for another conversation's proposal, no details", async () => {
  const r = await call(c, "get_proposal_status", { proposal_ref: ref }, Bm); eq(r.error.code, "NOT_FOUND"); eq(r.data, null); eq(r.next_step.say, "I can't find that booking in this conversation.");
});
await t("T4 reasons 10 and 11: complaint and asks_for_person, fixed sentences", async () => {
  const a = await call(c, "hand_to_manager", { reason: "complaint", summary: "Unhappy with a past visit." }, host("conv-C", 3));
  const b = await call(c, "hand_to_manager", { reason: "asks_for_person", summary: "Wants to speak to someone." }, host("conv-D", 4));
  eq([a.status, b.status], ["ok", "ok"]); ok(/^I'm sorry to hear that/.test(a.next_step.say)); eq(b.next_step.say, "I've asked our restaurant manager to call you on 012-***0004 shortly.");
});
await t("T4 a held room is added to the note by code (special request)", async () => {
  const s = host("conv-E", 5); await call(c, "create_proposal", { date: "2026-12-20", slot: "13:00", party_size: 6 }, s);
  const h = await call(c, "hand_to_manager", { reason: "special_request", summary: "Birthday cake." }, s); ok(/Orchid Room|Rose Room/.test(h.data.room));
  const again = await call(c, "hand_to_manager", { reason: "special_request", summary: "Birthday cake." }, s); eq(again.data.already, true); eq(again.data.handover_ref, h.data.handover_ref);
});
await t("T4 INVALID_REASON (reason 8 is the confirmation screen's) and MISSING_DETAILS", async () => {
  eq((await call(c, "hand_to_manager", { reason: "confirmation_failed", summary: "x" }, A)).error.code, "INVALID_REASON");
  eq((await call(c, "hand_to_manager", { reason: "complaint", summary: " " }, A)).error.code, "MISSING_DETAILS");
});
await t("PreToolUse: a confirm tool is never run", async () => {
  const r = await call(c, "confirm_booking", { proposal_ref: ref, code: "123456" }, A); eq(r.error.code, "TOOL_NOT_ALLOWED");
});
await t("PreToolUse: a 6-digit code in any argument is blocked", async () => {
  const r = await call(c, "get_proposal_status", { proposal_ref: "JS-H1001 code 482913" }, A); eq(r.error.code, "CODE_IN_ARGUMENT");
  const s = await call(c, "hand_to_manager", { reason: "complaint", summary: "Guest says the code 482913 failed." }, A); eq(s.error.code, "CODE_IN_ARGUMENT");
});
await t("PreToolUse: no host context, no tool", async () => {
  const r = await call(c, "check_availability", { date: "2026-12-18", slot: "19:00", party_size: 4 }, { conversation: "x" }); eq(r.error.code, "NO_HOST_CONTEXT");
});
await c.close();

const down = await connect({ JS_SERVICE_DOWN: "1" });
await t("SERVICE_DOWN: retryable, no availability, then reason 7", async () => {
  const r = await call(down, "check_availability", { date: "2026-12-21", slot: "13:00", party_size: 4 }, A);
  eq(r.error.code, "SERVICE_DOWN"); eq(r.error.retryable, true); eq(r.data, null); eq(r.next_step.reason, "service_down");
  const p = await call(down, "create_proposal", { date: "2026-12-21", slot: "13:00", party_size: 4 }, A); eq(p.error.code, "SERVICE_DOWN");
  const h = await call(down, "hand_to_manager", { reason: "service_down", summary: "Room for 4 on 21 Dec 1pm." }, A); eq(h.status, "ok"); ok(/^Our booking system is not available right now/.test(h.next_step.say));
});
await down.close();

console.log(`test_tools: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
