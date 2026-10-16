// Tool tests: every tool once through the MCP client, including every refusal, before Claude
// is connected. A fresh copy of the seed and a fresh server per conversation, on the fixed
// demo calendar (Fri 16 Oct 2026, 10:00). Then the staff actions on the resulting state.
//
// Run: node benchmark/test_tools.mjs   (no API key needed)

import { createRequire } from "node:module";
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(import.meta.url);
const { registerUpload, STAFF } = require("../tools.js");
const SEED = join(ROOT, "badminton_bookings.json");
const TMP = join(HERE, "runs", "tool-tests");
mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? "  | " + JSON.stringify(detail).slice(0, 300) : ""}`); }
}

async function conversation(name, fn, faults) {
  console.log(`\n${name}`);
  const statePath = join(TMP, name.replace(/\W+/g, "_") + ".json");
  copyFileSync(SEED, statePath);
  const client = new Client({ name: "tool-tests", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(ROOT, "mcp_server.mjs")],
    env: { ...process.env, BB_STATE: statePath, BB_NOW: "2026-10-16T10:00", ...(faults ? { BB_FAULTS: JSON.stringify(faults) } : {}) },
  }));
  const fileStore = {
    load: () => JSON.parse(readFileSync(statePath, "utf8")),
    save: (s) => require("node:fs").writeFileSync(statePath, JSON.stringify(s, null, 1)),
  };
  const call = async (tool, args, meta) =>
    JSON.parse((await client.callTool({ name: tool, arguments: args, _meta: meta || { turn: 1, uploads: [] } })).content[0].text);
  try { await fn({ client, call, fileStore, statePath }); } finally { await client.close(); }
}
const err = (r) => (r.ok ? "ok" : r.error.category);
const seed = JSON.parse(readFileSync(SEED, "utf8"));
const names = [...new Set(seed.bookings.map((b) => b.player_name))];

await conversation("Resources and tool list", async ({ client }) => {
  const res = (await client.listResources()).resources.map((r) => r.uri);
  check("3 policy resources", res.length === 3 && res.includes("policy://booking"), res);
  const text = (await client.readResource({ uri: "policy://booking" })).contents[0].text;
  check("policy://booking has B1 to B25", text.includes("**B1**") && text.includes("**B25**"));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check("9 tools, none confirms, cancels, releases or lists", tools.length === 9 && !tools.some((t) => /confirm|release|refund|list|change/.test(t)), tools);
});

await conversation("check_availability", async ({ call }) => {
  let r = await call("check_availability", { date: "2026-10-17", court: 5 });
  check("Court 5 Sat 17 Oct free 18:00 to 23:00", r.ok && r.courts[0].free.includes("18:00 to 23:00") && r.fee_per_court_per_hour_rm === 25, r);
  r = await call("check_availability", { date: "2026-10-17", start_time: "20:00", hours: 2 });
  check("Sat 20:00 to 22:00 free courts include 5, 9, 11", r.ok && ["Court 5", "Court 9", "Court 11"].every((c) => r.free_courts.includes(c)), r);
  check("no player name in the result (O18)", !names.some((n) => JSON.stringify(r).includes(n)));
  r = await call("check_availability", { date: "2026-10-19" });
  check("weekday fee RM 20", r.ok && r.fee_per_court_per_hour_rm === 20, r);
  r = await call("check_availability", { date: "2026-10-16" });
  check("today bookable from 12:00 (B3)", r.ok && r.bookable_from === "12:00", r.bookable_from);
  r = await call("check_availability", { date: "2026-10-25" });
  check("25 Oct refused: outside_booking_window, opens 18 Oct", err(r) === "outside_booking_window" && r.error.message.includes("2026-10-18"), r);
  r = await call("check_availability", { date: "2026-10-15" });
  check("15 Oct refused: date_in_past", err(r) === "date_in_past", r);
  r = await call("check_availability", { date: "2026-10-16", start_time: "11:00" });
  check("today 11:00 refused: too_late_to_book", err(r) === "too_late_to_book", r);
  r = await call("check_availability", { date: "2026-10-17", start_time: "06:00" });
  check("06:00 refused: outside_opening_hours", err(r) === "outside_opening_hours", r);
  r = await call("check_availability", { date: "2026-10-17", start_time: "23:00", hours: 3 });
  check("23:00 for 3 hours refused: outside_opening_hours", err(r) === "outside_opening_hours", r);
  r = await call("check_availability", { date: "2026-10-17", start_time: "18:00", hours: 4 });
  check("4 hours refused: too_long (B20)", err(r) === "too_long", r);
  r = await call("check_availability", { date: "2026-10-17", court: 5, start_time: "17:00", hours: 1 });
  check("Court 5 17:00 taken, nearest times offered", r.ok && r.requested_court.free === false && r.same_court_nearest_times.includes("18:00 to 19:00"), r);
});

await conversation("request_booking", async ({ call, fileStore }) => {
  let r = await call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 2, player_name: "Aisyah", mobile: "012-345 6789" });
  check("pay choice missing: missing_details", err(r) === "missing_details", r);
  r = await call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 2, player_name: "Aisyah", mobile: "12345", pay_court_fee_now: true });
  check("bad mobile: invalid_mobile", err(r) === "invalid_mobile", r);
  r = await call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 2, player_name: "Aisyah", mobile: "012-345 6789", pay_court_fee_now: true });
  check("A1 request: BK-2051 held, fee RM 50, pay RM 100, hold to 10:30", r.ok && r.booking_ref === "BK-2051" && r.status === "held" && r.court_fee_rm === 50 && r.amount_to_pay_now_rm === 100 && r.hold_expires_at === "10:30", r);
  r = await call("request_booking", { court: 5, date: "2026-10-17", start_time: "21:00", hours: 1, player_name: "Ben", mobile: "013-111 2233", pay_court_fee_now: false });
  check("overlap: slot_taken with alternatives", err(r) === "slot_taken" && r.alternatives.other_courts_same_time.length > 0, r);
  r = await call("request_booking", { court: 9, date: "2026-10-17", start_time: "20:00", hours: 1, player_name: "Aisyah", mobile: "0123456789", pay_court_fee_now: false });
  check("second court at the same time allowed (B4)", r.ok && r.booking_ref === "BK-2052", r);
  r = await call("request_booking", { court: 11, date: "2026-10-17", start_time: "20:00", hours: 1, player_name: "Aisyah", mobile: "012 345 6789", pay_court_fee_now: false });
  check("third court at the same time: court_limit", err(r) === "court_limit", r);
  r = await call("request_booking", { court: 1, date: "2026-10-16", start_time: "11:00", hours: 1, player_name: "Ben", mobile: "013-111 2233", pay_court_fee_now: false });
  check("today 11:00: too_late_to_book", err(r) === "too_late_to_book", r);
  r = await call("get_booking", { booking_ref: "BK-2051" });
  check("own new booking readable without the check", r.ok && r.booking.status === "held" && !("mobile" in r.booking), r);
  const st = fileStore.load();
  check("seed bookings unchanged", seed.bookings.every((s) => JSON.stringify(st.bookings.find((b) => b.booking_ref === s.booking_ref)) === JSON.stringify(s)));
});

await conversation("verify_booking and get_booking", async ({ call, fileStore }) => {
  let r = await call("get_booking", { booking_ref: "BK-2041" });
  check("get before verify: not_verified", err(r) === "not_verified", r);
  r = await call("verify_booking", { booking_ref: "BK-2041", mobile_last4: "1111" });
  check("wrong digits: no_match, nothing shared", err(r) === "no_match" && !JSON.stringify(r).includes("Court 3"), r);
  r = await call("verify_booking", { booking_ref: "BK-9999", mobile_last4: "6789" });
  check("missing booking: same no_match", err(r) === "no_match", r);
  r = await call("verify_booking", { booking_ref: "BK-2041", mobile_last4: "3333" });
  check("third failure: locked", err(r) === "locked" && r.error.message.includes("check_failed"), r);
  r = await call("verify_booking", { booking_ref: "BK-2041", mobile_last4: "6789" });
  check("right digits after the lock: still locked (B18)", err(r) === "locked", r);
  r = await call("hand_to_staff", { reason: "check_failed", root_cause: "The booking check for BK-2041 locked after 3 mismatched mobile endings (B18); nothing was shared.", clause_ids: ["B18"], recommended_action: "Contact the player on this chat's number to help with BK-2041." },
    { turn: 3, uploads: [], message: "Then it must be 3333.", contact: { channel: "WhatsApp", chat_id: "WA-T2", mobile: "019-555 1001" } });
  const ho = fileStore.load().handovers[0];
  check("check_failed after the lock: code attaches the 3 checks tried and the booking", r.ok && ho.checks_tried.length === 3 && ho.checks_tried[0].mobile_last4 === "1111" && ho.checks_tried[2].mobile_last4 === "3333" &&ho.booking_ref === "BK-2041", ho);
});

await conversation("cancellation", async ({ call, fileStore }) => {
  let r = await call("quote_cancellation", { booking_ref: "BK-2041" });
  check("quote before verify: not_verified", err(r) === "not_verified", r);
  r = await call("verify_booking", { booking_ref: "bk2041", mobile_last4: "6789" });
  check("verify BK-2041 with 6789", r.ok, r);
  r = await call("get_booking", { booking_ref: "BK-2041" });
  check("BK-2041: Court 3, Sun 18 Oct 10:00 to 12:00, RM 50 due at counter", r.ok && r.booking.court === 3 && r.booking.start === "10:00" && r.booking.end === "12:00" && r.booking.court_fee_due_at_counter_rm === 50, r);
  r = await call("request_cancellation", { booking_ref: "BK-2041" }, { turn: 1, uploads: [] });
  check("request before quote: no_quote", err(r) === "no_quote", r);
  r = await call("quote_cancellation", { booking_ref: "BK-2041" }, { turn: 1, uploads: [] });
  check("quote: RM 50 deposit refunded (C3)", r.ok && r.refund.total_rm === 50, r);
  r = await call("request_cancellation", { booking_ref: "BK-2041" }, { turn: 1, uploads: [] });
  check("request in the same turn as the quote: no_quote (C7)", err(r) === "no_quote", r);
  r = await call("request_cancellation", { booking_ref: "BK-2041" }, { turn: 2, uploads: [] });
  check("request after the player's next message: pending", r.ok && r.status === "pending", r);
  r = await call("request_cancellation", { booking_ref: "BK-2041" }, { turn: 3, uploads: [] });
  check("second request: already_requested", err(r) === "already_requested", r);
  const st = fileStore.load();
  check("BK-2041 still confirmed until staff approve (C8)", st.bookings.find((b) => b.booking_ref === "BK-2041").status === "confirmed");
  r = await call("verify_booking", { booking_ref: "BK-2032", mobile_last4: "6789" });
  r = await call("quote_cancellation", { booking_ref: "BK-2032" });
  check("no-show BK-2032: session_started", err(r) === "session_started", r);
});

await conversation("report_payment", async ({ call, fileStore }) => {
  await call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 2, player_name: "Aisyah", mobile: "012-345 6789", pay_court_fee_now: true });
  const R = { booking_ref: "BK-2051", document_type: "payment_receipt", amount_rm: 100, reference: "BK-2051", paid_at: "2026-10-16T10:05", recipient: "Subang Badminton Arena" };
  let r = await call("report_payment", { ...R, upload_id: "UP-001" }, { turn: 2, uploads: [] });
  check("no image this message: receipt_required (B12)", err(r) === "receipt_required", r);
  const up1 = registerUpload(fileStore, "images/R4.png", "2026-10-16T10:04");
  r = await call("report_payment", { ...R, upload_id: up1, document_type: "not_a_receipt" }, { turn: 2, uploads: [up1] });
  check("racket photo: not_a_receipt (B24)", err(r) === "not_a_receipt", r);
  const up2 = registerUpload(fileStore, "images/R1.png", "2026-10-16T10:06");
  r = await call("report_payment", { ...R, upload_id: up2, paid_at: "16 Oct" }, { turn: 3, uploads: [up2] });
  check("bad date: invalid_fields, retryable once", err(r) === "invalid_fields" && r.error.retryable, r);
  r = await call("report_payment", { ...R, upload_id: up2 }, { turn: 3, uploads: [up2] });
  check("R1: recorded, no differences, still held", r.ok && r.differences.length === 0 && r.booking_status === "held", r);
  r = await call("report_payment", { ...R, upload_id: up2 }, { turn: 4, uploads: [] });
  check("same upload reused in a later message: receipt_required", err(r) === "receipt_required", r);
  const up3 = registerUpload(fileStore, "images/R2.png", "2026-10-16T10:07");
  r = await call("report_payment", { ...R, upload_id: up3, amount_rm: 50 }, { turn: 4, uploads: [up3] });
  check("R2: amount difference flagged (B23)", r.ok && r.differences.length === 1 && r.differences[0].includes("RM 50.00"), r);
  const up4 = registerUpload(fileStore, "images/R3.png", "2026-10-16T10:08");
  r = await call("report_payment", { ...R, upload_id: up4, reference: "BK-1999", paid_at: "2026-10-16T09:00" }, { turn: 5, uploads: [up4] });
  check("R3: reference and paid-before-booking flagged", r.ok && r.differences.length === 2, r);
  const st = fileStore.load();
  check("BK-2051 still held after 3 receipts (B25)", st.bookings.find((b) => b.booking_ref === "BK-2051").status === "held");
});

await conversation("report_payment on an expired hold", async ({ call, fileStore }) => {
  const up = registerUpload(fileStore, "images/R1.png", "2026-10-16T10:00");
  let r = await call("report_payment", { booking_ref: "BK-2050", upload_id: up, document_type: "payment_receipt", amount_rm: 50, reference: "BK-2050", paid_at: "2026-10-16T09:58", recipient: "Subang Badminton Arena" }, { turn: 1, uploads: [up] });
  check("BK-2050 not verified: not_verified", err(r) === "not_verified", r);
  await call("verify_booking", { booking_ref: "BK-2050", mobile_last4: "4321" });
  r = await call("report_payment", { booking_ref: "BK-2050", upload_id: up, document_type: "payment_receipt", amount_rm: 50, reference: "BK-2050", paid_at: "2026-10-16T09:58", recipient: "Subang Badminton Arena" }, { turn: 1, uploads: [up] });
  check("BK-2050: hold_expired at 09:30 (B13)", err(r) === "hold_expired" && r.error.message.includes("09:30"), r);
  check("no receipt recorded against BK-2050", !fileStore.load().receipts.some((x) => x.booking_ref === "BK-2050"));
});

await conversation("hand_to_staff and reply_to_player", async ({ call, fileStore }) => {
  let r = await call("reply_to_player", { policy_case: "other", message: "Court fee is RM 20 an hour on weekdays.", clause_ids: ["B7", "Z9", "b7"] }, { turn: 1, uploads: [] });
  check("citation line built by code; unknown Z9 dropped; duplicate merged", r.ok && r.citation_line === "Booking Policy, Clause B7" && r.dropped_clause_ids.includes("Z9"), r);
  r = await call("reply_to_player", { policy_case: "other", message: "I've passed your question to our staff.", clause_ids: [] }, { turn: 2, uploads: [] });
  check("reply claiming a handover that was not made: handover_not_made", err(r) === "handover_not_made", r);
  r = await call("reply_to_player", { policy_case: "other", message: "Our policy does not say whether parents watching count.", clause_ids: ["O12"] }, { turn: 2, uploads: [] });
  check("reply saying the policy is silent, with no handover: handover_not_made", err(r) === "handover_not_made", r);
  r = await call("reply_to_player", { policy_case: "other", message: "Staff will confirm once they find the payment.", clause_ids: ["B14"] }, { turn: 2, uploads: [] });
  check("process fact about staff is not a handover claim", r.ok, r);
  r = await call("hand_to_staff", { reason: "maybe", root_cause: "No clause covers lockers.", clause_ids: [], recommended_action: "Reply on lockers." }, { turn: 2, uploads: [] });
  check("unknown reason: invalid_reason", err(r) === "invalid_reason", r);
  r = await call("hand_to_staff", { reason: "not_in_policy", root_cause: "Lockers?", clause_ids: [], recommended_action: "Reply." }, { turn: 2, uploads: [] });
  check("handover with no root cause or action: missing_details", err(r) === "missing_details", r);
  r = await call("hand_to_staff", { reason: "check_failed", root_cause: "Player failed the booking check three times.", clause_ids: ["B18"], recommended_action: "Contact the player." }, { turn: 2, uploads: [] });
  check("check_failed before the check is locked: not_locked", err(r) === "not_locked", r);
  r = await call("hand_to_staff", { reason: "not_in_policy", root_cause: "No clause covers lockers or bag storage; O8 lists the facilities without them.", clause_ids: ["O8", "Z1"], recommended_action: "Reply on lockers or bag storage; consider adding it to O8." },
    { turn: 2, uploads: [], message: "Do you have lockers for our bags?", contact: { channel: "WhatsApp", chat_id: "WA-T1", mobile: "019-555 1000" } });
  { const h = fileStore.load().handovers[0];
    check("handover saved with the player's words, contact, clauses checked (unknown dropped) and action",
      r.ok && h.question === "Do you have lockers for our bags?" && h.contact.mobile === "019-555 1000" && h.clause_ids.join() === "O8" && h.recommended_action.startsWith("Reply"), h); }
  r = await call("reply_to_player", { policy_case: "other", message: "I've passed this to our staff.", clause_ids: ["O8"] }, { turn: 2, uploads: [] });
  check("after not_in_policy: line is Not covered by policy", r.ok && r.citation_line === "Not covered by policy" && r.citations.length === 0, r);
  check("the reply is recorded on the handover as what the player was told", fileStore.load().handovers[0].told_player.startsWith("I've passed this to our staff."), fileStore.load().handovers[0]);
  r = await call("hand_to_staff", { reason: "policy_unclear", root_cause: "B7 names public holidays; a state holiday is not mentioned.", clause_ids: ["B7"], recommended_action: "Confirm the state holiday fee to the player." }, { turn: 3, uploads: [] });
  r = await call("reply_to_player", { policy_case: "other", message: "B7 does not settle it; staff will confirm.", clause_ids: ["B7"] }, { turn: 3, uploads: [] });
  r = await call("reply_to_player", { policy_case: "unclear", message: "The policy doesn't settle it; staff will confirm.", clause_ids: [] }, { turn: 3, uploads: [] });
  check("after policy_unclear: the clause named for staff is cited to the player", r.ok && r.citation_line === "Booking Policy, Clause B7", r);
  r = await call("reply_to_player", { policy_case: "unclear", message: "That depends on how the clause is read.", clause_ids: ["O12"] }, { turn: 4, uploads: [] });
  check("policy_case unclear with no handover this turn: handover_not_made", err(r) === "handover_not_made", r);
  r = await call("reply_to_player", { policy_case: "maybe", message: "Hello.", clause_ids: [] }, { turn: 4, uploads: [] });
  check("unknown policy_case refused", err(r) === "invalid_input", r);
});

await conversation("system down", async ({ call }) => {
  let r = await call("check_availability", { date: "2026-10-17" });
  check("first failure: system_unavailable, retry once", err(r) === "system_unavailable" && r.error.retryable, r);
  r = await call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 2, player_name: "A", mobile: "0123456789", pay_court_fee_now: false });
  check("second failure: do not retry, hand over", err(r) === "system_unavailable" && !r.error.retryable, r);
}, { down: true });

await conversation("court taken before the request", async ({ call }) => {
  let r = await call("check_availability", { date: "2026-10-17", court: 5, start_time: "20:00", hours: 1 });
  check("Court 5 20:00 free at the check", r.ok && r.requested_court.free, r);
  r = await call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 1, player_name: "Farid", mobile: "013-222 4455", pay_court_fee_now: false });
  check("taken first by another player: slot_taken, alternatives", err(r) === "slot_taken" && r.alternatives.other_courts_same_time.length === 4 && r.alternatives.same_court_nearest_times.length > 0, r);
}, { takeOnRequest: { court: 5, date: "2026-10-17", start_hour: 20, hours: 1 } });

console.log("\nStaff actions");
{
  const state = JSON.parse(JSON.stringify(seed));
  const m = { load: () => state, save: () => {} };
  const { createCentre } = require("../tools.js");
  const c = createCentre(m, { clauses: {} }, { now: "2026-10-16T10:00" });
  c.call("request_booking", { court: 5, date: "2026-10-17", start_time: "20:00", hours: 2, player_name: "Aisyah", mobile: "012-345 6789", pay_court_fee_now: false });
  let r = STAFF.confirm(state, "BK-2051", "2026-10-16T10:20");
  check("Confirm: confirmed, fixed message with fee due (B15)", r.ok && state.bookings.find((b) => b.booking_ref === "BK-2051").status === "confirmed" && r.message.includes("RM 50.00 is due at the counter"), r);
  r = STAFF.release(state, "BK-2050", "2026-10-16T10:20");
  check("Release expired hold: released, nothing charged (B13)", r.ok && r.message.includes("Nothing has been charged"), r);
  r = STAFF.notReceived(state, "BK-2050", "2026-10-16T10:20");
  check("Not received on a released booking: refused", !r.ok);
  r = STAFF.approveCancellation(state, "CX-001", "2026-10-16T10:20");
  check("Approve cancellation: cancelled, refund message (C9)", r.ok && r.message.includes("refunded"), r);
  check("3 fixed messages queued for the chat", state.messages.length === 3);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
