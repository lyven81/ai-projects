// Tool tests: every tool once through the MCP client, including every refusal, before Claude
// is connected. A fresh copy of the seed and a fresh server per conversation, on the fixed
// demo clock (Tue 20 Oct 2026, 10:00). Then the staff actions on the resulting state.
//
// Run: node benchmark/test_tools.mjs   (no API key needed)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(import.meta.url);
const { registerUpload, STAFF, createAgency } = require("../tools.js");
const SEED = join(ROOT, "car_rental_bookings.json");
const TMP = join(HERE, "runs", "tool-tests");
mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? "  | " + JSON.stringify(detail).slice(0, 400) : ""}`); }
}

async function conversation(name, fn, opts) {
  console.log(`\n${name}`);
  const o = opts || {};
  const statePath = join(TMP, name.replace(/\W+/g, "_") + ".json");
  copyFileSync(SEED, statePath);
  const client = new Client({ name: "tool-tests", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(ROOT, "mcp_server.mjs")],
    env: { ...process.env, KS_STATE: statePath, KS_NOW: o.now || "2026-10-20T10:00", ...(o.faults ? { KS_FAULTS: JSON.stringify(o.faults) } : {}) },
  }));
  const fileStore = { load: () => JSON.parse(readFileSync(statePath, "utf8")), save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 1)) };
  const call = async (tool, args, meta) =>
    JSON.parse((await client.callTool({ name: tool, arguments: args, _meta: meta || { turn: 1, uploads: [] } })).content[0].text);
  try { await fn({ client, call, fileStore }); } finally { await client.close(); }
}
const err = (r) => (r.ok ? "ok" : r.error);
const seed = JSON.parse(readFileSync(SEED, "utf8"));
const names = [...new Set(seed.bookings.map((b) => b.customer_name))];
const leaksCustomer = (r) => { const s = JSON.stringify(r); return names.some((n) => s.includes(n)) || /licence_no|"mobile"/.test(s); };
const when = (pd, pt, rd, rt) => ({ pickup_date: pd, pickup_time: pt, return_date: rd, return_time: rt });
const AISYAH = { pickup_place: "KLIA", return_place: "KLIA", customer_name: "Aisyah Rahman", mobile: "012-345 9876", licence_no: "70012345" };

await conversation("Resources and tool list", async ({ client }) => {
  const res = (await client.listResources()).resources.map((r) => r.uri);
  check("3 resources: policy, inventory, schedule", res.length === 3 && ["policy://rental-policy", "inventory://cars", "schedule://availability"].every((u) => res.includes(u)), res);
  const policy = (await client.readResource({ uri: "policy://rental-policy" })).contents[0].text;
  check("policy://rental-policy has R1 to R48", policy.includes("**R1**") && policy.includes("**R48**"));
  const inv = (await client.readResource({ uri: "inventory://cars" })).contents[0].text;
  check("inventory://cars has the 4 tiers and RM 4,200 MPV weekly", ["Standard", "Premium", "SUV", "MPV"].every((t) => inv.includes(t)) && inv.includes("RM 4,200"));
  const sched = (await client.readResource({ uri: "schedule://availability" })).contents[0].text;
  check("schedule://availability: 56 cars, no customer details", Object.keys(JSON.parse(sched).cars).length === 56 && !leaksCustomer(JSON.parse(sched)));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check("9 tools, none confirms, cancels, refunds, changes or lists", tools.length === 9 && !tools.some((t) => /confirm|refund|list|change|extend|^cancel/.test(t)), tools);
});

await conversation("check_availability: prices (Answer Key figures)", async ({ call }) => {
  let r = await call("check_availability", { model: "Myvi", ...when("2026-10-22", "10:00", "2026-10-22", "14:00") });
  check("A2 Myvi Thu 10:00 to 14:00: RM 80 (4 hours)", r.ok && r.free[0].model === "Perodua Myvi" && r.free[0].price.total_rm === 80, r);
  r = await call("check_availability", { model: "Honda City", ...when("2026-10-23", "10:00", "2026-10-26", "13:00") });
  check("A3 City 3 days 3 hours: RM 705 (R13)", r.ok && r.free[0].price.total_rm === 705 && r.free[0].price.parts.days_rm === 600 && r.free[0].price.parts.extra_hours_rm === 105, r);
  r = await call("check_availability", { tier: "Standard", ...when("2026-10-24", "10:00", "2026-11-02", "10:00") });
  check("A4 Standard 9 days: RM 940 (R14)", r.ok && r.free.every((m) => m.price.total_rm === 940), r);
  r = await call("check_availability", when("2026-10-24", "10:00", "2026-11-02", "10:00"));
  check("no tier or model: every model, cheapest first", r.ok && r.free[0].tier === "Standard" && r.free[r.free.length - 1].tier === "MPV", r.free && r.free.map((m) => m.model));
  r = await call("check_availability", { model: "Alphard", ...when("2026-10-21", "10:00", "2026-10-23", "10:00") });
  check("A5 Alphard 2 days: RM 1,400", r.ok && r.free[0].price.total_rm === 1400, r);
  check("free or taken only: no customer details", !leaksCustomer(r));
  r = await call("check_availability", { model: "Alphard", ...when("2026-10-24", "10:00", "2026-10-25", "18:00") });
  check("VHC047 in maintenance is never offered", r.ok && !r.free[0].car_ids.includes("VHC047"), r);
});

await conversation("check_availability: refusals", async ({ call }) => {
  let r = await call("check_availability", { model: "Axia", ...when("2026-10-21", "11:00", "2026-10-21", "12:00") });
  check("1 hour: too_short (R12)", err(r) === "too_short" && r.retryable, r);
  r = await call("check_availability", { model: "Myvi", ...when("2026-10-20", "14:00", "2026-10-20", "18:00") });
  check("today: same_day, handover same_day (R16)", err(r) === "same_day" && r.handover === "same_day", r);
  r = await call("check_availability", { model: "Alphard", ...when("2026-12-02", "10:00", "2026-12-05", "16:00") });
  check("2 Dec: too_far_ahead, handover far_ahead (R16)", err(r) === "too_far_ahead" && r.handover === "far_ahead", r);
  r = await call("check_availability", { model: "Myvi", ...when("2026-11-19", "10:00", "2026-11-20", "10:00") });
  check("19 Nov (day 30) is allowed", r.ok, r);
  r = await call("check_availability", { model: "Honda City", pickup_date: "2026-11-01", return_date: "2026-11-20" });
  check("1 to 20 Nov, no times: too_long first, handover long_or_corporate (R17)", err(r) === "too_long" && r.handover === "long_or_corporate", r);
  r = await call("check_availability", { model: "Honda City", ...when("2026-10-22", "10:00", "2026-11-05", "11:00") });
  check("14 days and 1 hour: too_long", err(r) === "too_long", r);
  r = await call("check_availability", { model: "Honda City", ...when("2026-10-22", "10:00", "2026-11-05", "10:00") });
  check("exactly 14 days: allowed, capped at RM 2,400", r.ok && r.free[0].price.total_rm === 2400, r);
  r = await call("check_availability", { model: "Vios", ...when("2026-10-22", "07:00", "2026-10-24", "10:00") });
  check("pickup 7am: out_of_hours, handover out_of_hours (R2)", err(r) === "out_of_hours" && r.handover === "out_of_hours", r);
  r = await call("check_availability", { model: "Vios", ...when("2026-10-22", "10:00", "2026-10-24", "18:30") });
  check("return 6:30pm: out_of_hours", err(r) === "out_of_hours", r);
  r = await call("check_availability", { model: "Vios", pickup_date: "2026-10-22", return_date: "2026-10-24" });
  check("no times: missing_times", err(r) === "missing_times", r);
  r = await call("check_availability", { model: "Ferrari", ...when("2026-10-22", "10:00", "2026-10-24", "10:00") });
  check("unknown model: invalid_input naming the models", err(r) === "invalid_input" && r.message.includes("Perodua Axia"), r);
  r = await call("check_availability", { model: "Vellfire", ...when("2026-10-24", "10:00", "2026-10-25", "18:00") });
  const alt = r.alternatives && r.alternatives.other_models_same_period;
  check("D4 Vellfire taken: not_available, Alphard offered at RM 1,400", err(r) === "not_available" && alt[0].model === "Toyota Alphard" && alt[0].price.total_rm === 1400, r);
  check("not_available names no customer", !leaksCustomer(r));
});

await conversation("request_booking", async ({ call, fileStore }) => {
  const A5 = { model: "Alphard", ...when("2026-10-21", "10:00", "2026-10-23", "10:00") };
  let r = await call("request_booking", { ...A5, ...AISYAH, licence_no: "" });
  check("licence missing: missing_details (R4)", err(r) === "missing_details" && r.message.includes("licence"), r);
  r = await call("request_booking", { ...A5, ...AISYAH, mobile: "12345" });
  check("bad mobile: invalid_mobile", err(r) === "invalid_mobile", r);
  r = await call("request_booking", { ...A5, ...AISYAH });
  check("A5: KS-2049 pending, RM 1,400, RM 100 deposit, DuitNow with the reference", r.ok && r.booking_ref === "KS-2049" && r.status === "pending" && r.price.total_rm === 1400 && r.payment.amount_rm === 100 && r.payment.reference === "KS-2049", r);
  let st = fileStore.load();
  const b = st.bookings.find((x) => x.booking_ref === "KS-2049");
  check("the request blocks one Alphard (R6)", b && b.status === "pending" && b.car_id.startsWith("VHC04"), b);
  r = await call("request_booking", { model: "Myvi", ...when("2026-10-24", "10:00", "2026-10-25", "10:00"), pickup_place: "Hilton, KL Sentral", return_place: "KLIA", customer_name: "Ben Lee", mobile: "+65 9123 4567", licence_no: "S1234567A" }, { turn: 2, uploads: [], message: "Deliver it to the Hilton.", contact: { chat_id: "WA-T1" } });
  st = fileStore.load();
  const ho = st.handovers.find((h) => h.booking === r.booking_ref);
  check("A6 international mobile accepted; pickup away from KLIA records delivery_quote", r.ok && r.delivery_handover && ho && ho.reason === "delivery_quote" && ho.urgent === false, { r, ho });
  check("delivery charge left for staff (R11)", st.bookings.find((x) => x.booking_ref === r.booking_ref).delivery.charge_rm === null);
  r = await call("request_booking", { model: "Myvi", ...when("2026-10-28", "10:00", "2026-10-30", "10:00"), pickup_place: "KLIA", return_place: "KLIA", customer_name: "Lim Wei Ming", mobile: "016-223 5555", licence_no: "47719920" });
  check("H4 third booking on one mobile: booking_limit, handover group_booking (R8)", err(r) === "booking_limit" && r.handover === "group_booking", r);
  r = await call("request_booking", { model: "Myvi", ...when("2026-10-20", "14:00", "2026-10-20", "18:00"), ...AISYAH });
  check("same day: same_day, no request", err(r) === "same_day", r);
  r = await call("request_booking", { model: "Vellfire", ...when("2026-10-24", "10:00", "2026-10-25", "18:00"), ...AISYAH });
  check("all Vellfires taken: not_available with alternatives", err(r) === "not_available" && r.alternatives.other_models_same_period.length > 0, r);
  r = await call("get_booking", { booking_ref: "KS-2049" });
  check("own new booking readable without the check, no mobile or licence", r.ok && r.booking.status === "pending" && !("mobile" in r.booking) && !("licence_no" in r.booking), r);
  st = fileStore.load();
  check("seed bookings unchanged", seed.bookings.every((s) => JSON.stringify(st.bookings.find((x) => x.booking_ref === s.booking_ref)) === JSON.stringify(s)));
});

await conversation("request_booking at night (R3)", async ({ call }) => {
  const r = await call("request_booking", { model: "Myvi", ...when("2026-10-22", "10:00", "2026-10-23", "10:00"), pickup_place: "KLIA", return_place: "KLIA", customer_name: "Ravi Shankar", mobile: "017-246 8100", licence_no: "55501234" });
  check("H6 at 10pm: pending, message says staff review from 9am", r.ok && r.status === "pending" && /from 9am/.test(r.message), r);
}, { now: "2026-10-20T22:00" });

await conversation("request_booking: car taken between check and request", async ({ call, fileStore }) => {
  let r = await call("check_availability", { model: "Alphard", ...when("2026-10-21", "10:00", "2026-10-23", "10:00") });
  const st = fileStore.load();
  st.cars.filter((c) => c.model === "Toyota Alphard").forEach((c, i) => st.bookings.push({ booking_ref: "KS-90" + i, car_id: c.car_id, status: "pending", pickup_at: "2026-10-21T09:00", return_at: "2026-10-23T18:00", mobile: "019-000 0000" }));
  fileStore.save(st);
  r = await call("request_booking", { model: "Alphard", ...when("2026-10-21", "10:00", "2026-10-23", "10:00"), ...AISYAH });
  check("availability checked again at write time: not_available", err(r) === "not_available", r);
});

await conversation("verify_booking and get_booking", async ({ call, fileStore }) => {
  let r = await call("get_booking", { booking_ref: "KS-2041" });
  check("get before verify: not_verified", err(r) === "not_verified", r);
  r = await call("verify_booking", { booking_ref: "KS-2041", mobile_last4: "1111" }, { turn: 1, uploads: [], message: "KS-2041, ends 1111." });
  check("X1 wrong digits: no_match, nothing shared", err(r) === "no_match" && !JSON.stringify(r).includes("Vios"), r);
  r = await call("verify_booking", { booking_ref: "KS-9999", mobile_last4: "6789" }, { turn: 2, uploads: [] });
  check("missing booking: the same no_match", err(r) === "no_match", r);
  r = await call("hand_to_staff", { reason: "check_failed", customer_asked: "Wants to see booking KS-2041.", clause_ids: [] }, { turn: 2, uploads: [] });
  check("check_failed before the lock: not_locked", err(r) === "not_locked", r);
  r = await call("verify_booking", { booking_ref: "KS-2041", mobile_last4: "3333" }, { turn: 3, uploads: [] });
  check("X3 third failure: check_locked, handover check_failed", err(r) === "check_locked" && r.handover === "check_failed", r);
  r = await call("verify_booking", { booking_ref: "KS-2041", mobile_last4: "6789" }, { turn: 4, uploads: [] });
  check("right digits after the lock: still locked", err(r) === "check_locked", r);
  r = await call("hand_to_staff", { reason: "check_failed", customer_asked: "Wants to see booking KS-2041; 3 checks failed.", clause_ids: [] }, { turn: 4, uploads: [], contact: { chat_id: "WA-T2" } });
  const ho = fileStore.load().handovers.find((h) => h.reason === "check_failed");
  check("check_failed after the lock: 3 checks attached, booking, first message as the customer's words", r.ok && ho.checks_tried.length === 3 && ho.booking === "KS-2041" && ho.customer_words === "KS-2041, ends 1111." && ho.customer.name === null, ho);
});

await conversation("get_booking after verify", async ({ call }) => {
  let r = await call("verify_booking", { booking_ref: "ks 2041", mobile_last4: "6789" });
  check("verify KS-2041 with 6789 (reference normalised)", r.ok && r.booking_ref === "KS-2041", r);
  r = await call("get_booking", { booking_ref: "KS-2041" });
  check("A8 KS-2041: Vios, Sat 24 Oct 10am to Mon 26 Oct 10am, KLIA, RM 400, deposit paid, confirmed",
    r.ok && r.booking.car === "Toyota Vios" && r.booking.pickup === "Sat 24 Oct 10am" && r.booking.return === "Mon 26 Oct 10am" && r.booking.price_rm === 400 && r.booking.deposit_paid_rm === 100 && r.booking.status === "confirmed", r);
  check("no mobile, licence or name returned", !leaksCustomer(r), r);
});

await conversation("cancellation, 24 hours or more (R19)", async ({ call, fileStore }) => {
  let r = await call("quote_cancellation", { booking_ref: "KS-2041" });
  check("quote before verify: not_verified", err(r) === "not_verified", r);
  await call("verify_booking", { booking_ref: "KS-2041", mobile_last4: "6789" });
  r = await call("request_cancellation", { booking_ref: "KS-2041" }, { turn: 1, uploads: [] });
  check("request before quote: quote_first", err(r) === "quote_first", r);
  r = await call("quote_cancellation", { booking_ref: "KS-2041" }, { turn: 1, uploads: [] });
  check("A9 quote: RM 100 refunded (R19)", r.ok && r.refund_rm === 100 && r.clause === "R19", r);
  r = await call("request_cancellation", { booking_ref: "KS-2041" }, { turn: 1, uploads: [] });
  check("request in the same turn as the quote: quote_first", err(r) === "quote_first", r);
  r = await call("request_cancellation", { booking_ref: "KS-2041" }, { turn: 2, uploads: [] });
  check("request after the customer's next message: cancellation_requested", r.ok && r.status === "cancellation_requested" && r.refund_rm === 100, r);
  r = await call("request_cancellation", { booking_ref: "KS-2041" }, { turn: 3, uploads: [] });
  check("second request: already_requested", err(r) === "already_requested", r);
  const b = fileStore.load().bookings.find((x) => x.booking_ref === "KS-2041");
  check("KS-2041 is cancellation requested, not cancelled (R22)", b.status === "cancellation_requested", b.status);
});

await conversation("cancellation, less than 24 hours (R20)", async ({ call }) => {
  await call("verify_booking", { booking_ref: "KS-2044", mobile_last4: "4321" });
  let r = await call("quote_cancellation", { booking_ref: "KS-2044" }, { turn: 1, uploads: [] });
  check("A10 KS-2044, 23 hours before pickup: RM 0, deposit kept (R20)", r.ok && r.refund_rm === 0 && r.clause === "R20" && r.hours_before_pickup === 23, r);
  await call("verify_booking", { booking_ref: "KS-2038", mobile_last4: "8642" });
  r = await call("quote_cancellation", { booking_ref: "KS-2038" }, { turn: 1, uploads: [] });
  check("rented KS-2038: already_started", err(r) === "already_started", r);
});

await conversation("report_payment", async ({ call, fileStore }) => {
  const R = { booking_ref: "KS-2046", method: "receipt", document_type: "payment_receipt", amount_rm: 100, reference: "KS-2046", paid_at: "2026-10-20T09:50", recipient: "Kereta Sewa Jalan-jalan Sdn Bhd" };
  let r = await call("report_payment", { ...R, upload_id: "UP-001" }, { turn: 1, uploads: [] });
  check("before verify: not_verified", err(r) === "not_verified", r);
  await call("verify_booking", { booking_ref: "KS-2046", mobile_last4: "2468" });
  r = await call("report_payment", { ...R, upload_id: "UP-001" }, { turn: 1, uploads: [] });
  check("no image this message: receipt_required", err(r) === "receipt_required", r);
  const up0 = registerUpload(fileStore, "images/car.png", "2026-10-20T10:00");
  r = await call("report_payment", { ...R, upload_id: up0, document_type: "not_a_receipt" }, { turn: 2, uploads: [up0] });
  check("a photo of a car: not_a_receipt", err(r) === "not_a_receipt", r);
  const up1 = registerUpload(fileStore, "images/R1.png", "2026-10-20T10:01");
  r = await call("report_payment", { ...R, upload_id: up1, paid_at: "20 Oct" }, { turn: 3, uploads: [up1] });
  check("bad date: invalid_input, retryable", err(r) === "invalid_input" && r.retryable, r);
  r = await call("report_payment", { ...R, upload_id: up1 }, { turn: 3, uploads: [up1] });
  check("A7 R1: recorded, no differences, still pending", r.ok && r.differences.length === 0 && r.booking_status === "pending", r);
  r = await call("report_payment", { ...R, upload_id: up1 }, { turn: 4, uploads: [] });
  check("the same upload in a later message: receipt_required", err(r) === "receipt_required", r);
  const up2 = registerUpload(fileStore, "images/R2.png", "2026-10-20T10:02");
  r = await call("report_payment", { ...R, upload_id: up2, amount_rm: 50 }, { turn: 4, uploads: [up2] });
  check("X5 R2: receipt_mismatch, recorded, handover receipt_problem", err(r) === "receipt_mismatch" && r.handover === "receipt_problem" && r.payment_id && r.differences[0].includes("RM 50"), r);
  const st = fileStore.load();
  check("both receipts recorded for staff; KS-2046 still pending (R7)", st.payments.filter((p) => p.booking_ref === "KS-2046").length === 2 && st.bookings.find((b) => b.booking_ref === "KS-2046").status === "pending");
  await call("verify_booking", { booking_ref: "KS-2041", mobile_last4: "6789" });
  r = await call("report_payment", { booking_ref: "KS-2041", method: "word" }, { turn: 5, uploads: [] });
  check("confirmed KS-2041: not_pending, nothing recorded", err(r) === "not_pending", r);
});

await conversation("report_payment by the customer's word", async ({ call, fileStore }) => {
  await call("verify_booking", { booking_ref: "KS-2046", mobile_last4: "2468" });
  const r = await call("report_payment", { booking_ref: "KS-2046", method: "word" }, { turn: 1, uploads: [] });
  const st = fileStore.load();
  check("D6 by word: recorded with no receipt, still pending", r.ok && r.method === "word" && st.payments.find((p) => p.payment_id === r.payment_id).method === "word" && st.bookings.find((b) => b.booking_ref === "KS-2046").status === "pending", r);
});

await conversation("hand_to_staff", async ({ call, fileStore }) => {
  let r = await call("hand_to_staff", { reason: "maybe", customer_asked: "Asks about child seats.", clause_ids: [] });
  check("unknown reason: invalid_reason", err(r) === "invalid_reason", r);
  r = await call("hand_to_staff", { reason: "not_in_policy", customer_asked: "Seat?", clause_ids: [] });
  check("no summary of the ask: missing_details", err(r) === "missing_details", r);
  r = await call("hand_to_staff", { reason: "late_return", customer_asked: "Will return the car 3 hours late tomorrow.", clause_ids: ["R38"] });
  check("late_return with no booking: missing_details", err(r) === "missing_details", r);
  r = await call("hand_to_staff", { reason: "urgent_on_road", customer_asked: "Accident on the highway, car will not start, nobody hurt.", clause_ids: [], booking_ref: "KS-2039" },
    { turn: 1, uploads: [], message: "Accident on the highway with KS-2039.", contact: { chat_id: "WA-T3" } });
  let ho = fileStore.load().handovers.find((h) => h.handover_id === r.handover_id);
  check("H9 urgent_on_road: urgent, booking named, no identity shared before the check", r.ok && r.urgent && ho.urgent && ho.booking === "KS-2039" && ho.customer.name === null, ho);
  r = await call("hand_to_staff", { reason: "damage", customer_asked: "Scratch on the bumper, car drives fine.", clause_ids: [] });
  check("damage, car drivable: not urgent", r.ok && r.urgent === false, r);
  r = await call("hand_to_staff", { reason: "damage", customer_asked: "Front wheel bent, car cannot be driven.", clause_ids: [], car_cannot_be_driven: true });
  check("damage, car cannot be driven: urgent (decision 5)", r.ok && r.urgent === true, r);
  r = await call("hand_to_staff", { reason: "urgent_safety", customer_asked: "Smoke coming from the engine.", clause_ids: [] });
  check("urgent_safety: the agent is told to give 999", r.ok && r.message.includes("999"), r);
  r = await call("hand_to_staff", { reason: "not_in_policy", customer_asked: "How much is a child seat?", clause_ids: ["R4", "Z9"] }, { turn: 2, uploads: [], message: "How much is a child seat?" });
  ho = fileStore.load().handovers.slice(-1)[0];
  check("eight fields: reason, urgent, customer, booking, asked, told, clauses (unknown dropped), time",
    ["reason", "urgent", "customer", "booking", "customer_asked", "agent_told", "clauses", "time"].every((k) => k in ho) && ho.clauses.join() === "R4" && ho.time === "2026-10-20T10:00", ho);
  r = await call("reply_to_customer", { message: "I've passed your question to our staff.", clause_ids: [] }, { turn: 2, uploads: [] });
  check("the reply is recorded on the handover as what the agent told them", r.ok && fileStore.load().handovers.slice(-1)[0].agent_told.startsWith("I've passed"), fileStore.load().handovers.slice(-1)[0]);
});

await conversation("reply_to_customer", async ({ call }) => {
  let r = await call("reply_to_customer", { message: "The deposit is RM 100.", clause_ids: ["R5", "r5"] }, { turn: 1, uploads: [] });
  check("citation line built by code, duplicate merged", r.ok && r.citation_line === "Rental Policy, R5", r);
  r = await call("reply_to_customer", { message: "The deposit is RM 100.", clause_ids: ["R5", "R99"] }, { turn: 1, uploads: [] });
  check("unknown clause: uncited_clause", err(r) === "uncited_clause", r);
  r = await call("reply_to_customer", { message: "I've passed this to our team.", clause_ids: [] }, { turn: 2, uploads: [] });
  check("handover claim with no handover: unrecorded_handover (N23)", err(r) === "unrecorded_handover", r);
  r = await call("reply_to_customer", { message: "Staff will confirm once they find the payment, and review it from 9am.", clause_ids: ["R7", "R3"] }, { turn: 2, uploads: [] });
  check("process facts about staff are not a handover claim", r.ok, r);
  r = await call("reply_to_customer", { message: "A Myvi is RM 120 a day, a Fortuner RM 380, an Alphard RM 4,200 a week, plus RM 100 deposit; delivery RM 1 per km.", clause_ids: ["R12"] }, { turn: 3, uploads: [] });
  check("inventory rates, deposit and per-km rate are allowed prices", r.ok, r);
  r = await call("reply_to_customer", { message: "For 2 hours that's RM 40.", clause_ids: ["R12"] }, { turn: 3, uploads: [] });
  check("RM 40 not from any tool yet: price_mismatch (N16)", err(r) === "price_mismatch", r);
  await call("check_availability", { model: "Axia", ...when("2026-10-21", "11:00", "2026-10-21", "13:00") }, { turn: 3, uploads: [] });
  r = await call("reply_to_customer", { message: "For 2 hours that's RM 40.", clause_ids: ["R12"] }, { turn: 3, uploads: [] });
  check("after check_availability returns it: allowed", r.ok, r);
  r = await call("reply_to_customer", { message: "I can do RM 960 for 5 days.", clause_ids: [] }, { turn: 4, uploads: [] });
  check("D2 an invented discounted price: price_mismatch", err(r) === "price_mismatch", r);
});

await conversation("system down", async ({ call }) => {
  let r = await call("check_availability", { model: "Vios", ...when("2026-10-22", "10:00", "2026-10-23", "10:00") });
  check("X4 first failure: system_unavailable, retry once", err(r) === "system_unavailable" && r.retryable && r.handover === null, r);
  r = await call("check_availability", { model: "Vios", ...when("2026-10-22", "10:00", "2026-10-23", "10:00") });
  check("second failure: do not retry, handover system_unavailable", err(r) === "system_unavailable" && !r.retryable && r.handover === "system_unavailable", r);
}, { faults: { down: true } });

console.log("\nStaff actions");
{
  const state = JSON.parse(JSON.stringify(seed));
  const store = { load: () => state, save: () => {} };
  const a = createAgency(store, { clauses: {} }, { now: "2026-10-20T10:00" });
  a.call("request_booking", { model: "Alphard", ...when("2026-10-21", "10:00", "2026-10-23", "10:00"), ...AISYAH }, { turn: 1, uploads: [] });
  let r = STAFF.confirm(state, "KS-2049", "2026-10-20T10:20");
  check("Confirm: confirmed, deposit received, fixed message", r.ok && state.bookings.find((b) => b.booking_ref === "KS-2049").status === "confirmed" && r.message.includes("Deposit RM 100 received"), r);
  r = STAFF.reject(state, "KS-2046", "2026-10-20T10:20");
  check("Reject: rejected, car freed, nothing charged (R26)", r.ok && state.bookings.find((b) => b.booking_ref === "KS-2046").status === "rejected" && r.message.includes("Nothing has been charged"), r);
  r = STAFF.confirm(state, "KS-2046", "2026-10-20T10:21");
  check("Confirm after Reject: refused", !r.ok);
  r = STAFF.setDeliveryCharge(state, "KS-2043", "2026-10-20T10:22", 52);
  check("Set delivery charge: stored, delivery handover closed, fixed message (R11)", r.ok && state.bookings.find((b) => b.booking_ref === "KS-2043").delivery.charge_rm === 52 && state.handovers.find((h) => h.handover_id === "HO-001").status === "done" && r.message.includes("RM 52"), r);
  r = STAFF.confirmCancellation(state, "CX-001", "2026-10-20T10:23");
  check("Confirm cancellation: cancelled, RM 100 within 24 hours (R23)", r.ok && state.bookings.find((b) => b.booking_ref === "KS-2045").status === "cancelled" && r.message.includes("within 24 hours"), r);
  r = STAFF.done(state, "HO-001", "2026-10-20T10:24");
  check("Done on a closed handover: refused", !r.ok);
  check("4 fixed messages queued for the chat", state.messages.length === 4, state.messages.length);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
