/* No-key tests of the booking module (lib/booking.js): each limit on both sides, upsizing, the 15-minute release, a
 * wrong, expired or changed-proposal code, the last-room race, the same and the different repeat, and that the .md
 * resources say what restaurant.json holds. Never counted or shown as benchmark cases.
 * Run: node benchmark/test_booking.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const B = require(path.join(ROOT, "lib", "booking.js"));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, "resources", "restaurant.json"), "utf8"));
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "state.json"), "utf8"));

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
function eq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ""} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function ok(v, m) { if (!v) throw new Error(m || "expected true"); }

function desk(at, opts) {
  const clock = { t: B.ms(at || C.today) };
  const bk = B.createBooking({ config: C, state: JSON.parse(JSON.stringify((opts && opts.empty) ? B.emptyState() : SEED)), clock: () => clock.t, random: B.seeded(7) });
  bk.advance = (min) => { clock.t += min * 60000; };
  return bk;
}
const who = (n, route, conv) => ({ name: `Guest ${n}`, phone: `012-00000${String(n).padStart(2, "0")}`, route: route || "Chat", conversation: conv || `c${n}` });
const code = (r) => r.error && r.error.code;

// ---------------------------------------------------------------- P1 season
t("P1 1 Dec and 31 Dec are bookable", () => { const b = desk(); ok(b.check({ date: "2026-12-31", slot: "13:00", party_size: 4 }).ok); ok(desk("2026-11-30T09:00").check({ date: "2026-12-01", slot: "13:00", party_size: 4 }).ok); });
t("P1 30 Nov and 1 Jan 2027 refused OUTSIDE_SEASON", () => { const b = desk(); eq(code(b.check({ date: "2027-01-01", slot: "13:00", party_size: 6 })), "OUTSIDE_SEASON"); eq(code(b.check({ date: "2026-11-30", slot: "13:00", party_size: 6 })), "OUTSIDE_SEASON"); });
t("P1 refusal is not retryable and points to the manager", () => { const r = desk().check({ date: "2027-01-01", slot: "13:00", party_size: 6 }); eq(r.error.retryable, false); ok(/outside_season/.test(r.error.alternatives[0])); });
// ---------------------------------------------------------------- P2, P3 slots
t("P3 the four slots are bookable, written any way", () => { const b = desk(); ["10am", "1pm", "4:00 pm", "19:00"].forEach((s) => ok(b.check({ date: "2026-12-18", slot: s, party_size: 4 }).ok, s)); });
t("P2/P3 9pm, 9am and 2pm refused INVALID_SLOT with the free slots that day", () => {
  const b = desk();
  ["21:00", "9am", "2pm", "22:00"].forEach((s) => eq(code(b.check({ date: "2026-12-18", slot: s, party_size: 4 })), "INVALID_SLOT", s));
  const r = b.check({ date: "2026-12-18", slot: "9pm", party_size: 4 });
  eq(r.error.retryable, true); eq(r.data.other_free_slots.map((x) => x.slot), ["10:00", "13:00", "16:00", "19:00"]);
});
// ---------------------------------------------------------------- P8 cut-off
t("P8 exactly 2 hours before is bookable", () => ok(desk("2026-12-14T14:00").check({ date: "2026-12-14", slot: "16:00", party_size: 4 }).ok));
t("P8 1 hour 59 minutes before is refused TOO_SOON", () => eq(code(desk("2026-12-14T14:01").check({ date: "2026-12-14", slot: "16:00", party_size: 4 })), "TOO_SOON"));
t("P8 case 9: 6pm asking for 7pm tonight is TOO_SOON", () => eq(code(desk("2026-12-14T18:00").check({ date: "2026-12-14", slot: "19:00", party_size: 6 })), "TOO_SOON"));
t("P8 a slot already past is TOO_SOON", () => eq(code(desk().check({ date: "2026-12-14", slot: "10:00", party_size: 2 })), "TOO_SOON"));
// ---------------------------------------------------------------- P6 party size
t("P6 10 guests bookable, 11 refused PARTY_TOO_LARGE", () => { const b = desk(); ok(b.check({ date: "2026-12-18", slot: "19:00", party_size: 10 }).ok); eq(code(b.check({ date: "2026-12-18", slot: "19:00", party_size: 11 })), "PARTY_TOO_LARGE"); eq(code(b.check({ date: "2026-12-18", slot: "19:00", party_size: 12 })), "PARTY_TOO_LARGE"); });
t("P9 missing party size is MISSING_DETAILS, never a guess", () => { eq(code(desk().check({ date: "2026-12-23", slot: "16:00" })), "MISSING_DETAILS"); eq(code(desk().check({ date: "2026-12-23", slot: "16:00", party_size: 0 })), "MISSING_DETAILS"); });
// ---------------------------------------------------------------- P5 room size and upsizing
t("P5 1 to 6 a 6-pax room, 7 to 8 an 8-pax, 9 to 10 a 10-pax", () => { const b = desk(); [[1, 6], [6, 6], [7, 8], [8, 8], [9, 10], [10, 10]].forEach(([n, s]) => eq(b.check({ date: "2026-12-22", slot: "13:00", party_size: n }).data.room_size, s, `party ${n}`)); });
t("P5 case 13: 5 guests, both 6-pax taken on 16 Dec 4pm, an 8-pax room offered (upsized)", () => { const r = desk().check({ date: "2026-12-16", slot: "16:00", party_size: 5 }); ok(r.ok); eq(r.data.room_size, 8); eq(r.data.upsized, true); });
t("P5 never down: 9 guests with both 10-pax rooms taken is NO_ROOM while smaller rooms are free", () => { const r = desk().check({ date: "2026-12-31", slot: "19:00", party_size: 9 }); eq(code(r), "NO_ROOM"); });
t("P5 case 7: 8 guests on 26 Dec 7pm is NO_ROOM with the other free slots that day", () => { const r = desk().check({ date: "2026-12-26", slot: "19:00", party_size: 8 }); eq(code(r), "NO_ROOM"); eq(r.data.other_free_slots.map((x) => x.slot), ["10:00", "13:00", "16:00"]); });
// ---------------------------------------------------------------- P7 walk-in tables
t("P7 no walk-in table is ever a bookable room", () => { const ids = new Set(C.rooms.map((r) => r.id)); C.zones.forEach((z) => ok(!ids.has(z.prefix) && !C.rooms.some((r) => r.name === z.name))); eq(C.rooms.length, 6); });
// ---------------------------------------------------------------- P11 hold, code and release
t("P11 a proposal holds the room 15 minutes and sends one SMS code", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, who(1, "Form"));
  ok(r.ok); eq(r.data.status, "held"); eq(r.data.minutes_left, 15); ok(/Orchid Room|Rose Room/.test(r.data.room));
  eq(b.state.sms.filter((s) => s.kind === "code").length, 1); ok(/^\d{6}$/.test(b.findProposal(r.data.proposal_ref).code));
  ok(!("code" in r.data), "the code is never in the tool result");
});
t("P11 a held room is not offered to anyone else", () => { const b = desk(); b.propose({ date: "2026-12-16", slot: "16:00", party_size: 8 }, who(1)); b.propose({ date: "2026-12-16", slot: "16:00", party_size: 8 }, who(2)); eq(b.check({ date: "2026-12-16", slot: "16:00", party_size: 7 }).data.room_size, 10, "upsized past the held rooms"); b.propose({ date: "2026-12-16", slot: "16:00", party_size: 10 }, who(3)); b.propose({ date: "2026-12-16", slot: "16:00", party_size: 10 }, who(4)); eq(code(b.check({ date: "2026-12-16", slot: "16:00", party_size: 7 })), "NO_ROOM"); });
t("P11 the release: still held at 15 minutes, released at 16, room free again", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-16", slot: "16:00", party_size: 8 }, who(1)); b.propose({ date: "2026-12-16", slot: "16:00", party_size: 8 }, who(2));
  b.advance(15); b.sweep(); eq(b.findProposal(r.data.proposal_ref).status, "held");
  b.advance(1); b.sweep(); eq(b.findProposal(r.data.proposal_ref).status, "released"); ok(b.check({ date: "2026-12-16", slot: "16:00", party_size: 7 }).ok);
});
t("P11 right code within 15 minutes confirms once, manager notified, SMS sent", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-19", slot: "13:00", party_size: 8 }, who(2)); const p = b.findProposal(r.data.proposal_ref);
  b.advance(5); const c = b.confirm(p.ref, p.code); ok(c.ok); ok(/^JS-B\d+$/.test(c.data.booking_number));
  eq(b.state.notices.map((n) => n.kind), ["confirmed"]); eq(b.state.sms.map((s) => s.kind), ["code", "confirmed"]);
  const again = b.confirm(p.ref, p.code); ok(again.ok && again.data.already); eq(b.state.bookings.filter((x) => x.proposal_ref === p.ref).length, 1, "committed once");
});
t("P11 wrong code refused, room stays held, manager notified (reason 8)", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-22", slot: "13:00", party_size: 6 }, who(3)); const p = b.findProposal(r.data.proposal_ref);
  const wrong = p.code === "123456" ? "654321" : "123456"; const c = b.confirm(p.ref, wrong);
  eq(code(c), "WRONG_CODE"); eq(p.status, "held"); eq(b.state.notices.map((n) => n.reason), ["confirmation_failed"]); eq(b.state.bookings.filter((x) => x.proposal_ref === p.ref).length, 0);
});
t("P11 code at 16 minutes refused, room released, manager notified (reason 8)", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-20", slot: "13:00", party_size: 6 }, who(4)); const p = b.findProposal(r.data.proposal_ref);
  b.advance(16); const c = b.confirm(p.ref, p.code); eq(code(c), "EXPIRED"); eq(p.status, "released"); eq(b.state.notices.map((n) => n.reason), ["confirmation_failed"]);
});
t("P11 a changed proposal (party changed after the code) is refused even with the right code", () => {
  const b = desk(); const w = who(11); const r = b.propose({ date: "2026-12-17", slot: "19:00", party_size: 6 }, w); const p = b.findProposal(r.data.proposal_ref);
  b.handover({ reason: "party_changed", summary: "Now 7, not 6.", name: w.name, phone: w.phone, route: w.route, proposal_ref: p.ref, room_id: p.room_id });
  eq(p.status, "held", "the hold is left for the manager"); eq(code(b.confirm(p.ref, p.code)), "CHANGED");
});
t("L5 the last-room race: the room taken before the code is entered is refused", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-22", slot: "13:00", party_size: 6 }, who(1)); const p = b.findProposal(r.data.proposal_ref);
  b.state.bookings.push({ booking_no: "JS-B9999", status: "confirmed", date: p.date, slot: p.slot, room_id: p.room_id, phone: "019-9999999", party_size: 6 });
  eq(code(b.confirm(p.ref, p.code)), "ROOM_TAKEN"); eq(b.state.bookings.filter((x) => x.room_id === p.room_id && x.date === p.date && x.slot === p.slot).length, 1);
});
// ---------------------------------------------------------------- P10 duplicates, across routes
t("P10 same phone, same slot, same details: ALREADY_HELD with the existing reference, nothing new", () => {
  const b = desk(); const w = who(3); const r = b.propose({ date: "2026-12-22", slot: "1pm", party_size: 6 }, w); const r2 = b.propose({ date: "2026-12-22", slot: "13:00", party_size: 6 }, w);
  eq(code(r2), "ALREADY_HELD"); eq(r2.data.existing_ref, r.data.proposal_ref); eq(b.state.proposals.length, 1); eq(b.state.sms.length, 1);
});
t("P10 same phone, same slot, different details: DUPLICATE_CONFLICT to the manager (reason 9)", () => {
  const b = desk(); const w = who(3); b.propose({ date: "2026-12-22", slot: "13:00", party_size: 6 }, w); const r2 = b.propose({ date: "2026-12-22", slot: "13:00", party_size: 4 }, w);
  eq(code(r2), "DUPLICATE_CONFLICT"); ok(/duplicate_conflict/.test(r2.error.alternatives[0])); eq(b.state.proposals.length, 1);
});
t("P10 across routes: a form hold blocks the same phone in chat and A2A", () => {
  const b = desk(); const p = "012-7777777"; b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, { name: "A", phone: p, route: "Form", conversation: "f1" });
  eq(code(b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, { name: "A", phone: "+60 12-777 7777", route: "Chat", conversation: "c1" })), "ALREADY_HELD");
  eq(code(b.propose({ date: "2026-12-18", slot: "19:00", party_size: 5 }, { name: "A", phone: p, route: "A2A agent", conversation: "t1" })), "DUPLICATE_CONFLICT");
});
t("P10 a confirmed booking also counts, and a different phone is not blocked", () => {
  const b = desk(); const w = who(5); const r = b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, w); const p = b.findProposal(r.data.proposal_ref); b.confirm(p.ref, p.code);
  eq(code(b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, w)), "ALREADY_HELD"); ok(b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, who(6)).ok);
});
// ---------------------------------------------------------------- status, service down, handover card
t("L6 status only inside the proposal's own conversation (NOT_FOUND elsewhere, no details)", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-18", slot: "19:00", party_size: 4 }, who(1, "Chat", "conv-A"));
  ok(b.status(r.data.proposal_ref, { conversation: "conv-A" }).ok); const x = b.status(r.data.proposal_ref, { conversation: "conv-B" }); eq(code(x), "NOT_FOUND"); ok(!x.data);
});
t("service down: SERVICE_DOWN, retryable, no availability in the result", () => { const b = desk(); b.flags.serviceDown = true; const r = b.check({ date: "2026-12-21", slot: "13:00", party_size: 4 }); eq(code(r), "SERVICE_DOWN"); ok(!r.data); });
t("handover card carries every field for the restaurant manager", () => {
  const b = desk(); const h = b.handover({ reason: "party_over_10", summary: "12 for a company dinner.", name: "M", phone: "012", route: "Chat", date: "2026-12-18", slot: "19:00", party_size: 12, words: "We are 12 people" });
  ["ref", "reason", "receiver", "name", "phone", "date", "slot", "party_size", "room", "route", "words", "summary"].forEach((k) => ok(k in h, k)); eq(h.receiver, "Restaurant manager");
});
t("dashboard: four lanes and the seating map by name, walk-in zones never bookable", () => {
  const b = desk(); b.propose({ date: "2026-12-26", slot: "13:00", party_size: 4 }, who(1)); const d = b.dashboard("2026-12-26", "19:00");
  eq(Object.keys(d.lanes), ["held", "confirmed", "handovers", "released"]); eq(d.map.rooms.every((r) => r.state === "booked"), true); eq(d.map.zones.every((z) => z.state === "walk-in"), true);
  ok(d.map.rooms.every((r) => /Room .+厅$/.test(r.name))); eq(d.map.zones.reduce((a, z) => a + z.tables.length, 0), 35);
});
t("manager actions: a note, called, arranged, then closed; every action kept with its time; closed leaves the open lane", () => {
  const b = desk(); const h = b.handover({ reason: "special_request", summary: "Birthday cake.", name: "K", phone: "012", route: "Chat" });
  eq(code(b.act(h.ref, "note", " ")), "MISSING_DETAILS"); eq(code(b.act(h.ref, "refund", "x")), "INVALID_ACTION"); eq(code(b.act("JS-M0000", "note", "x")), "NOT_FOUND");
  ok(b.act(h.ref, "note", "Cake ordered from the bakery.").ok); ok(b.act(h.ref, "called", "Confirmed chocolate cake.").ok); ok(b.act(h.ref, "arranged").ok);
  eq(b.dashboard().lanes.handovers.length, 1); ok(b.close(h.ref, "Done.").ok); eq(b.dashboard().lanes.handovers.length, 0);
  eq(h.actions.map((a) => a.action), ["note", "called", "arranged", "closed"]); ok(h.actions.every((a) => a.by === "Restaurant manager" && a.at));
  eq(code(b.act(h.ref, "note", "late")), "ALREADY_CLOSED");
});
t("manager actions on a confirmation notice: acknowledge closes it", () => {
  const b = desk(); const r = b.propose({ date: "2026-12-19", slot: "13:00", party_size: 8 }, who(2)); const p = b.findProposal(r.data.proposal_ref); b.confirm(p.ref, p.code);
  const n = b.state.notices[0]; ok(b.close(n.ref).ok); eq(n.status, "closed"); eq(b.dashboard().lanes.handovers.length, 0);
});
// ---------------------------------------------------------------- the resources say what the code holds
t("resources: the .md files state the numbers restaurant.json holds", () => {
  const md = C.resources.map((r) => fs.readFileSync(path.join(ROOT, "resources", r.file), "utf8")).join("\n");
  C.rooms.forEach((r) => ok(md.includes(`${r.name} ${r.zh}`), r.name)); C.zones.forEach((z) => ok(md.includes(`${z.name} ${z.zh}`), z.name));
  ["RM 100", "15 minutes", "2 hours", "10am, 1pm, 4pm and 7pm", "1 to 31 December", "10am to 10pm"].forEach((s) => ok(md.includes(s), s));
  C.handover_reasons.forEach((h) => ok(md.includes(h.code), h.code)); eq(C.handover_reasons.length, 11);
  for (let i = 1; i <= 14; i++) ok(md.includes(`## P${i} `), `P${i}`);
});
t("seed data: every room booked at 7pm on 26 Dec, both 6-pax rooms at 4pm on 16 Dec, no double booking", () => {
  const s = SEED.bookings; eq(s.filter((b) => b.date === "2026-12-26" && b.slot === "19:00").length, 6);
  eq(s.filter((b) => b.date === "2026-12-16" && b.slot === "16:00").map((b) => b.room_id).sort(), ["R6-1", "R6-2"]);
  const keys = s.map((b) => `${b.room_id}|${b.date}|${b.slot}`); eq(new Set(keys).size, keys.length);
});

console.log(`test_booking: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
