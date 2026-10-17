// Tool tests: every tool once through the MCP client, including every refusal, before Claude
// is connected. A fresh copy of calendar.json and a fresh server per conversation, on the fixed
// demo clock (Sat 17 Oct 2026, 10:00; first contact 17 Oct). Then Pak Razif's page actions.
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
const { registerUpload, OWNER } = require("../tools.js");
const SEED = join(ROOT, "calendar.json");
const TMP = join(HERE, "runs", "tool-tests");
mkdirSync(TMP, { recursive: true });

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else { failed++; console.log(`  FAIL  ${label}${detail ? "  | " + JSON.stringify(detail).slice(0, 300) : ""}`); }
}

const CONTACT = { channel: "WhatsApp", chat_id: "WA-test", name: "Test Customer", phone: "019-555 1000" };
async function conversation(name, fn, firstContact) {
  console.log(`\n${name}`);
  const statePath = join(TMP, name.replace(/\W+/g, "_") + ".json");
  copyFileSync(SEED, statePath);
  const client = new Client({ name: "tool-tests", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(ROOT, "mcp_server.mjs")],
    env: { ...process.env, HG_STATE: statePath, HG_NOW: "2026-10-17T10:00" },
  }));
  const fileStore = {
    load: () => JSON.parse(readFileSync(statePath, "utf8")),
    save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 1)),
  };
  const call = async (tool, args, meta) =>
    JSON.parse((await client.callTool({ name: tool, arguments: args,
      _meta: Object.assign({ turn: 1, uploads: [], message: "", contact: CONTACT, first_contact: firstContact || "2026-10-17" }, meta || {}) })).content[0].text);
  try { await fn({ client, call, fileStore }); } finally { await client.close(); }
}
const err = (r) => (r.ok ? "ok" : r.error.category);
const seed = JSON.parse(readFileSync(SEED, "utf8"));
const names = [...new Set(seed.bookings.map((b) => b.name))];
const leaks = (r) => names.some((n) => JSON.stringify(r).includes(n)) || seed.bookings.some((b) => JSON.stringify(r).includes(b.address));
const AMINAH = { name: "Aminah Yusof", phone: "012-345 6789", address: "7 Jalan Melur 2, Seksyen 7, Shah Alam", postcode: "40000", needs: "Lawn and hedge overgrown", access: "Gate unlocked" };

await conversation("Resources and tool list", async ({ client }) => {
  const res = (await client.listResources()).resources.map((r) => r.uri);
  check("6 resources", res.length === 6 && res.includes("resource://operation") && res.includes("resource://faq"), res);
  const text = (await client.readResource({ uri: "resource://operation" })).contents[0].text;
  check("resource://operation has P1 to P38 and R1 to R12", text.includes("**P1**") && text.includes("**P38**") && text.includes("**R12**"));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  check("6 tools, none prices, changes, cancels, lists or locates", tools.length === 6 && !tools.some((t) => /price|change|cancel|list|locat|pay/.test(t)), tools);
});

await conversation("check_coverage", async ({ call }) => {
  let r = await call("check_coverage", { postcode: "40460" });
  check("40460 covered: Shah Alam, Kota Kemuning (A1)", r.ok && r.area === "Shah Alam" && r.locality === "Kota Kemuning", r);
  r = await call("check_coverage", { postcode: "41050" });
  check("41050 covered: Klang (A2)", r.ok && r.area === "Klang", r);
  r = await call("check_coverage", { postcode: "47620" });
  check("47620 covered: Subang Jaya USJ (A3)", r.ok && /Subang/.test(r.area), r);
  r = await call("check_coverage", { postcode: "42000" });
  check("42000 Port Klang: not_covered, nearby (A4)", err(r) === "not_covered" && r.where === "nearby" && /outside_area/.test(r.error.message), r);
  r = await call("check_coverage", { postcode: "81300" });
  check("81300 Skudai: not_covered, outstation (A5)", err(r) === "not_covered" && r.where === "outstation" && /outstation/.test(r.error.message), r);
  r = await call("check_coverage", { postcode: "Shah Alam" });
  check("a place name is refused: bad_postcode (A6)", err(r) === "bad_postcode", r);
  r = await call("check_coverage", { postcode: "4046" });
  check("4 digits refused: bad_postcode", err(r) === "bad_postcode", r);
});

await conversation("find_open_slots", async ({ call }) => {
  let r = await call("find_open_slots", { date: "2026-10-20" });
  check("Tue 20 Oct: 08:00 and 14:00 only", r.ok && r.open.map((s) => s.slot).join() === "08:00,14:00", r);
  check("no names or addresses in the result (P34)", !leaks(r));
  r = await call("find_open_slots", { date: "2026-10-19" });
  check("Mon 19 Oct: no open slot, offer nearby days (W12)", r.ok && r.open.length === 0, r);
  r = await call("find_open_slots", { date: "2026-10-22" });
  check("Thu 22 Oct: 08:00 and 10:00", r.ok && r.open.map((s) => s.slot).join() === "08:00,10:00", r);
  r = await call("find_open_slots", { date: "2026-10-17" });
  check("today refused: same_day (W9)", err(r) === "same_day", r);
  r = await call("find_open_slots", { date: "2026-10-16" });
  check("yesterday refused: past_date", err(r) === "past_date", r);
  r = await call("find_open_slots", { date: "2026-10-25" });
  check("Sunday refused: closed_day (W1)", err(r) === "closed_day", r);
  r = await call("find_open_slots", { date: "2026-11-10" });
  check("Tue 10 Nov inside the window: 08:00", r.ok && r.open.map((s) => s.slot).join() === "08:00", r);
  r = await call("find_open_slots", { date: "2026-11-25" });
  check("Wed 25 Nov refused: beyond_window, though all slots are open (W8)", err(r) === "beyond_window", r);
  r = await call("find_open_slots", { date: "2026-10-17", to_date: "2026-10-23" });
  check("range from today skips today and Sunday", r.ok && r.days[0].date === "2026-10-19" && r.skipped.some((s) => s.reason === "same_day") && r.skipped.some((s) => s.reason === "closed_day"), r);
  check("range result has no names or addresses", !leaks(r));
});

await conversation("find_open_slots, first contact 30 Oct", async ({ call }) => {
  const r = await call("find_open_slots", { date: "2026-11-25" });
  check("window counts from first contact: 25 Nov bookable when first contact is 30 Oct (W8)", r.ok && r.open.length === 4, r);
}, "2026-10-30");

await conversation("book_site_visit", async ({ call, fileStore }) => {
  let r = await call("book_site_visit", { date: "2026-10-20", slot: "08:00", name: "Aminah Yusof" });
  check("missing details refused: missing_fields (P8)", err(r) === "missing_fields" && /phone/.test(r.error.message), r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-20", slot: "08:00" }, AMINAH, { phone: "12345" }));
  check("bad phone refused: missing_fields", err(r) === "missing_fields", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-20", slot: "08:00" }, AMINAH, { postcode: "42000" }));
  check("42000 refused: not_covered (P7)", err(r) === "not_covered", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-17", slot: "14:00" }, AMINAH));
  check("today 14:00 refused: same_day, though open (W9)", err(r) === "same_day", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-11-25", slot: "08:00" }, AMINAH));
  check("25 Nov refused: beyond_window (W8)", err(r) === "beyond_window", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-25", slot: "08:00" }, AMINAH));
  check("Sunday refused: closed_day", err(r) === "closed_day", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-19", slot: "10:00" }, AMINAH));
  check("Mon 10:00 refused: slot_unavailable (W11)", err(r) === "slot_unavailable" && r.open_same_day.length === 0, r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-20", slot: "16:00" }, AMINAH));
  check("field-work slot refused: slot_unavailable (W13)", err(r) === "slot_unavailable" && r.open_same_day.map((s) => s.slot).join() === "08:00,14:00", r);
  check("refusal shows no other customer", !leaks(r));
  r = await call("book_site_visit", { date: "2026-10-23", slot: "10:00", name: "Lee Ah Kow", phone: "016-222 3344", address: "28 Jln Anggerik 9, Setia Alam", postcode: "40170", needs: "Grass cutting", access: "Gate open" });
  check("same address as HG-1015, other name: duplicate_address (P11)", err(r) === "duplicate_address", r);
  check("duplicate refusal gives no date, time or name", !/Daniel|10:00|20 Oct|HG-1015/.test(JSON.stringify(r)), r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-20", slot: "08:00" }, AMINAH), { message: "Book the Tuesday morning visit." });
  check("booked: HG-1045, Tue 20 Oct 08:00 to 08:30", r.ok && r.booking_ref === "HG-1045" && r.window === "08:00 to 08:30", r);
  check("confirmation (R3) built by code", r.ok && r.confirmation === "Your site visit is confirmed for Tue 20 Oct 2026, 08:00 to 08:30, at 7 Jalan Melur 2, Seksyen 7, Shah Alam 40000. Your booking reference is HG-1045.", r.confirmation);
  const s = fileStore.load();
  check("calendar slot now booked HG-1045", s.days["2026-10-20"].slots["08:00"].ref === "HG-1045");
  check("booking written once, confirmed, next_ref 1046", s.bookings.filter((b) => b.ref === "HG-1045").length === 1 && s.bookings.find((b) => b.ref === "HG-1045").status === "confirmed" && s.next_ref === 1046);
  check("inbox: one New visit item with the customer's words", s.inbox.length === 1 && s.inbox[0].kind === "new_visit" && s.inbox[0].ref === "HG-1045" && s.inbox[0].customer_words === "Book the Tuesday morning visit.", s.inbox);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-20", slot: "08:00" }, AMINAH, { address: "9 Jalan Kenari 3, Setia Alam", postcode: "40170" }));
  check("same slot again: slot_unavailable (re-checked at saving)", err(r) === "slot_unavailable", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-22", slot: "08:00" }, AMINAH, { address: "7, Jln Melur 2, Seksyen 7" }));
  check("second visit to the same address: duplicate_address", err(r) === "duplicate_address", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-11-10", slot: "08:00" }, AMINAH, { address: "12 Jalan Teratai 4, Bukit Jelutong", postcode: "40150" }));
  check("next booking HG-1046", r.ok && r.booking_ref === "HG-1046", r);
});

await conversation("forward_photo with a booking", async ({ call, fileStore }) => {
  const p1 = registerUpload(fileStore, "images/pak-razif-the-gardener/demo/P1 front lawn.jpeg");
  const p2 = registerUpload(fileStore, "images/pak-razif-the-gardener/demo/P2 side garden.jpeg");
  let r = await call("forward_photo", { photo_ids: ["PH-009"], note: "Lawn" }, { uploads: [p1] });
  check("unknown photo ID refused: no_photo", err(r) === "no_photo", r);
  r = await call("forward_photo", { photo_ids: [p2], note: "Garden" }, { turn: 2, uploads: [] });
  check("photo not attached in this conversation refused: no_photo", err(r) === "no_photo", r);
  r = await call("forward_photo", { photo_ids: [p1], note: "Overgrown lawn" }, { turn: 3, uploads: [], message: "Book Tuesday 8am. (photo attached)" });
  check("forwarded PH-001 (attached earlier in this conversation)", r.ok && r.forwarded.join() === p1, r);
  r = await call("forward_photo", { photo_ids: [p1], note: "Again" }, { turn: 3 });
  check("already forwarded: no_photo", err(r) === "no_photo", r);
  r = await call("book_site_visit", Object.assign({ date: "2026-10-20", slot: "08:00" }, AMINAH), { turn: 3, message: "Book Tuesday 8am. (photo attached)" });
  const s = fileStore.load();
  const photoItem = s.inbox.find((i) => i.kind === "photos"), visit = s.inbox.find((i) => i.kind === "new_visit");
  check("photo item linked to HG-1045 after booking in the same conversation", photoItem && photoItem.booking_ref === "HG-1045", photoItem);
  check("New visit item lists the photo", visit && visit.photos.join() === p1, visit);
  check("same-turn items carry the same customer words", photoItem.customer_words === visit.customer_words && visit.customer_words.includes("Book Tuesday"), [photoItem.customer_words, visit.customer_words]);
});

await conversation("forward_photo, two photos", async ({ call, fileStore }) => {
  const ids = [registerUpload(fileStore, "images/pak-razif-the-gardener/demo/P1 front lawn.jpeg"), registerUpload(fileStore, "images/pak-razif-the-gardener/demo/P2 side garden.jpeg")];
  const r = await call("forward_photo", { photo_ids: ids, note: "Photos of the garden" }, { uploads: ids, message: "Here are photos of my garden." });
  const s = fileStore.load();
  check("one inbox item with both photos (P22)", r.ok && s.inbox.length === 1 && s.inbox[0].photos.join() === ids.join() && s.inbox[0].images.length === 2, s.inbox);
  check("item has the customer's words and contact", s.inbox[0].customer_words === "Here are photos of my garden." && s.inbox[0].customer.phone === "019-555 1000");
});

await conversation("hand_to_pak_razif", async ({ call, fileStore }) => {
  let r = await call("hand_to_pak_razif", { reason: "discount", what_was_asked: "Asked for a discount", told_customer: "Passed on to Pak Razif", recommended_next_step: "Reply on the discount" });
  check("reason not on the list refused: missing_fields", err(r) === "missing_fields", r);
  r = await call("hand_to_pak_razif", { reason: "price_request", what_was_asked: "Price", told_customer: "", recommended_next_step: "" });
  check("empty summary refused: missing_fields (P32)", err(r) === "missing_fields" && /told_customer/.test(r.error.message), r);
  const meta = { turn: 2, message: "The side fence near the gate is bent, it happened on Friday.", history: ["Your worker damaged my fence."], contact: { channel: "WhatsApp", chat_id: "WA-14", name: "Daniel Lee", phone: "013-500 2363" } };
  r = await call("hand_to_pak_razif", { reason: "complaint_or_payment", what_was_asked: "Reports a bent side fence near the gate after Friday's work", told_customer: "Sorry; passed on to Pak Razif, who will get back to him", recommended_next_step: "Call Daniel Lee to look at the fence and agree what happens next", address: "28 Jalan Anggerik 9, Setia Alam 40170" }, meta);
  const s = fileStore.load(), i = s.inbox[0];
  check("handover item IN-001 written", r.ok && r.inbox_item === "IN-001" && s.inbox.length === 1, r);
  check("code adds both turns of the customer's words", i.customer_words === "Your worker damaged my fence.\nThe side fence near the gate is bent, it happened on Friday.", i.customer_words);
  check("code adds name and phone from the chat contact, and the time", i.customer.name === "Daniel Lee" && i.customer.phone === "013-500 2363" && i.received === "2026-10-17T10:00");
  check("all 10 fields present", ["reason", "customer_words", "customer", "address", "what_was_asked", "preferred_time", "told_customer", "recommended_next_step", "photos", "received"].every((k) => k in i), Object.keys(i));
  check("rules for the reason attached (P30, P35, P21)", i.rules.join() === "P30,P35,P21");
  for (const reason of ["price_request", "unusual_work", "outside_area", "outstation", "time_not_bookable", "change_or_cancel", "after_visit", "asks_for_him_or_unclear"]) {
    r = await call("hand_to_pak_razif", { reason, what_was_asked: "A test enquiry", told_customer: "Passed on to Pak Razif", recommended_next_step: "Reply to the customer" }, { turn: 3 });
    check(`reason ${reason} accepted`, r.ok, r);
  }
});

await conversation("eta_contact_check", async ({ call }) => {
  let r = await call("eta_contact_check", { booking_ref: "HG-1010", phone_last4: "1428" });
  check("HG-1010 and 1428 match: duty number only (P18)", r.ok && r.duty_number === "012-555 0188" && !leaks(r), r);
  const wrong = await call("eta_contact_check", { booking_ref: "HG-1010", phone_last4: "1482" });
  check("wrong digits: no_match, no number (R12)", err(wrong) === "no_match" && !JSON.stringify(wrong).includes("0188"), wrong);
  r = await call("eta_contact_check", { booking_ref: "HG-9999", phone_last4: "1428" });
  check("unknown reference: the same no_match message", err(r) === "no_match" && r.error.message === wrong.error.message, r);
  r = await call("eta_contact_check", { booking_ref: "HG-1009", phone_last4: "9480" });
  check("visit already done (HG-1009): no_match", err(r) === "no_match", r);
  r = await call("eta_contact_check", { booking_ref: "1010", phone_last4: "1428" });
  check("reference without the prefix still matches", r.ok, r);
  r = await call("eta_contact_check", { booking_ref: "HG-1010", phone_last4: "28" });
  check("2 digits refused: invalid_input", err(r) === "invalid_input", r);
});

console.log("\nPak Razif's page actions");
{
  const s = JSON.parse(readFileSync(SEED, "utf8"));
  s.inbox.push({ id: "IN-001", status: "open" });
  check("Done closes an open item", OWNER.done(s, "IN-001").ok && s.inbox[0].status === "done");
  check("Done twice refused", !OWNER.done(s, "IN-001").ok);
  check("tap open slot: blocked (P38)", OWNER.toggleSlot(s, "2026-10-22", "08:00").status === "blocked" && s.days["2026-10-22"].slots["08:00"].reason === "Blocked by Pak Razif");
  check("tap it again: open", OWNER.toggleSlot(s, "2026-10-22", "08:00").status === "open");
  check("his own block on Thu 22 Oct 14:00 opens", OWNER.toggleSlot(s, "2026-10-22", "14:00").status === "open");
  check("field-work block opens: his calendar, his call (W10, W13)", OWNER.toggleSlot(s, "2026-10-20", "16:00").status === "open");
  check("booked slot stays", !OWNER.toggleSlot(s, "2026-10-20", "10:00").ok);
}

console.log("\nReply claim check (agent.js)");
{
  const { claimProblem } = require("../agent.js");
  const none = [], handed = [{ name: "hand_to_pak_razif", result: { ok: true } }], photo = [{ name: "forward_photo", result: { ok: true } }], booked = [{ name: "book_site_visit", result: { ok: true } }];
  check("R10 without a handover is sent back", !!claimProblem("I've passed your request to move the visit to Pak Razif, and he will get back to you.", none));
  check("R10 after a handover passes", !claimProblem("I've passed your request to move the visit to Pak Razif, and he will get back to you.", handed));
  check("R2 without forward_photo is sent back", !!claimProblem("Your photo has been passed to Pak Razif. He will assess the garden during the visit.", none));
  check("R2 after forward_photo passes", !claimProblem("Your photo has been passed to Pak Razif. He will assess the garden during the visit.", photo));
  check("R7 and R8 (offers, not claims) pass", !claimProblem("I can pass your cancellation request to Pak Razif. Your appointment remains booked until he confirms the cancellation.", none) && !claimProblem("Please describe what happened so I can pass your concern to Pak Razif.", none));
  check("R3 without a booking is sent back", !!claimProblem("Your site visit is confirmed for Tue 20 Oct 2026, 08:00 to 08:30. Your booking reference is HG-1045.", none));
  check("R3 after book_site_visit passes", !claimProblem("Your site visit is confirmed for Tue 20 Oct 2026, 08:00 to 08:30. Your booking reference is HG-1045.", booked));
  check("duplicate address reply passes", !claimProblem("A site visit is already booked for that address, so I can't book another.", none));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
