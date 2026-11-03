// Jade Star: the Answer Key, written before the assistant exists. Writes benchmark/cases.json (what the runner and the
// scorer read) and benchmark/Answer Key.html (the same 20 cases for people). Exactly cases 1 to 20, the founder's
// picks of 3 Nov 2026, with these numbers and this wording; nothing is added, split or run as a variant.
// Run: node build_cases.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const customers = JSON.parse(readFileSync(join(HERE, "data", "customers.json"), "utf8"));
const SIX = ["R6-1", "R6-2"], EIGHT = ["R8-1", "R8-2"];
const GROUPS = { a: "Submitted by form", b: "Booked by a human in chat", c: "Booked by an AI agent authorised by a human, through A2A", d: "Confirmation" };

// expect: hold (the one held proposal the case must leave, or null), holds (how many proposals in total),
// handovers (reason codes, exact), tools (each must appear in the tool log with that outcome and those arguments),
// task (the A2A task state at the end), notice (the confirmation notice to the restaurant manager), after (the
// proposal's status after group d), first_turn_no_hold (case 15: the first reply asks, no hold yet).
const cases = [
  { id: 1, group: "a", type: "Booking held", route: "form", customer: customers[1],
    shown: "Form: 4 people, Fri 18 Dec, 7pm", form: { date: "2026-12-18", slot: "19:00", party_size: 4 },
    expected: "No AI. A 6-pax room (Orchid or Rose) held for 15 minutes; SMS code sent; on the dashboard as Form. Confirmed in case 16",
    expect: { hold: { date: "2026-12-18", slot: "19:00", party_size: 4, rooms: SIX, route: "Form" }, holds: 1, handovers: [], tools: [], sms_codes: 1 } },

  { id: 2, group: "b", type: "Booking held", route: "chat", customer: customers[2],
    shown: "\"Hi, can I book a room for 8 people this Saturday, 19 Dec, at 1pm?\"", turns: ["Hi, can I book a room for 8 people this Saturday, 19 Dec, at 1pm?"],
    expected: "Greeting; an 8-pax room held; RM 100 fee stated; SMS code sent. Confirmed in case 17",
    expect: { hold: { date: "2026-12-19", slot: "13:00", party_size: 8, rooms: EIGHT, route: "Chat" }, holds: 1, handovers: [],
      tools: [{ name: "create_proposal", status: "ok", args: { date: "2026-12-19", slot: "13:00", party_size: 8 } }], sms_codes: 1 } },

  { id: 3, group: "b", type: "Booking held", route: "chat", customer: customers[3],
    shown: "\"Room for 6 on Tue 22 Dec, 1pm.\" Then the same phone sends the same request again", turns: ["Room for 6 on Tue 22 Dec, 1pm.", "Room for 6 on Tue 22 Dec, 1pm."],
    expected: "One hold, one code. The repeat gets the existing reference; nothing new created",
    expect: { hold: { date: "2026-12-22", slot: "13:00", party_size: 6, rooms: SIX, route: "Chat" }, holds: 1, handovers: [],
      tools: [{ name: "create_proposal", status: "ok", args: { date: "2026-12-22", slot: "13:00", party_size: 6 } }], sms_codes: 1, repeat_returns_ref: true } },

  { id: 4, group: "b", type: "Booking held", route: "chat", customer: customers[4],
    shown: "\"Room for 6 on Sun 20 Dec, 1pm. It is my mum's birthday, can you prepare a cake?\"", turns: ["Room for 6 on Sun 20 Dec, 1pm. It is my mum's birthday, can you prepare a cake?"],
    expected: "Room held; SMS code sent; the cake request to the restaurant manager",
    expect: { hold: { date: "2026-12-20", slot: "13:00", party_size: 6, rooms: SIX, route: "Chat" }, holds: 1, handovers: ["special_request"],
      tools: [{ name: "create_proposal", status: "ok", args: { date: "2026-12-20", slot: "13:00", party_size: 6 } }], sms_codes: 1, handover_room: true } },

  { id: 5, group: "b", type: "Answer questions", route: "chat", customer: customers[5],
    shown: "\"How much is the booking fee? How long will you hold the room if we are late? Can I book one of the hall tables?\"",
    turns: ["How much is the booking fee? How long will you hold the room if we are late? Can I book one of the hall tables?"],
    expected: "RM 100 at check-out; 15 minutes; hall tables are walk-in only. No booking written",
    expect: { hold: null, holds: 0, handovers: [], tools: [], forbid: ["create_proposal", "hand_to_manager"], sms_codes: 0 } },

  { id: 6, group: "b", type: "Not available", route: "chat", customer: customers[6],
    shown: "\"Room for 4 at 9pm on the 18th?\"", turns: ["Room for 4 at 9pm on the 18th?"],
    expected: "Not available, outside the booking times; the free slots that day offered",
    expect: { hold: null, holds: 0, handovers: [], tools: [{ name: "check_availability", error: "INVALID_SLOT", args: { date: "2026-12-18" } }], forbid: ["hand_to_manager"], sms_codes: 0 } },

  { id: 7, group: "b", type: "Not available", route: "chat", customer: customers[7],
    shown: "\"8 people, Saturday 26 Dec, 7pm.\"", turns: ["8 people, Saturday 26 Dec, 7pm."],
    expected: "Not available, fully booked; the free slots that day offered",
    expect: { hold: null, holds: 0, handovers: [], tools: [{ name: "check_availability", error: "NO_ROOM", args: { date: "2026-12-26", slot: "19:00", party_size: 8 } }], forbid: ["hand_to_manager"], sms_codes: 0 } },

  { id: 8, group: "b", type: "Hand over", route: "chat", customer: customers[8],
    shown: "\"We are 12 people for a company dinner on Friday 18 Dec, 7pm.\"", turns: ["We are 12 people for a company dinner on Friday 18 Dec, 7pm."],
    expected: "Restaurant manager: over 10. No hold",
    expect: { hold: null, holds: 0, handovers: ["party_over_10"], tools: [{ name: "hand_to_manager", status: "ok", args: { reason: "party_over_10" } }], sms_codes: 0 } },

  { id: 9, group: "b", type: "Hand over", route: "chat", customer: customers[9], clock: "2026-12-14T18:00",
    shown: "At 6:00pm: \"Can I get a room for 6 at 7pm tonight?\"", turns: ["Can I get a room for 6 at 7pm tonight?"],
    expected: "Restaurant manager: less than 2 hours. No hold",
    expect: { hold: null, holds: 0, handovers: ["too_soon"], tools: [{ name: "hand_to_manager", status: "ok", args: { reason: "too_soon" } }], sms_codes: 0 } },

  { id: 10, group: "b", type: "Hand over", route: "chat", customer: customers[10],
    shown: "\"I booked for the 19th already. Can I change it to the 20th?\"", turns: ["I booked for the 19th already. Can I change it to the 20th?"],
    expected: "Restaurant manager: change to a confirmed booking",
    expect: { hold: null, holds: 0, handovers: ["after_booking"], tools: [{ name: "hand_to_manager", status: "ok", args: { reason: "after_booking" } }], forbid: ["create_proposal"], sms_codes: 0 } },

  { id: 11, group: "b", type: "Hand over", route: "chat", customer: customers[11],
    shown: "After the code is sent: \"Actually we are 7 now, not 6.\"", setup_note: "Set-up turn: \"Can I book a room for 6 on Thu 17 Dec, 7pm?\" holds the room and sends the code.",
    turns: ["Can I book a room for 6 on Thu 17 Dec, 7pm?", "Actually we are 7 now, not 6."],
    expected: "Restaurant manager: party size changed. The original hold is left for the manager",
    expect: { hold: { date: "2026-12-17", slot: "19:00", party_size: 6, rooms: SIX, route: "Chat" }, holds: 1, handovers: ["party_changed"],
      tools: [{ name: "hand_to_manager", status: "ok", args: { reason: "party_changed" } }], sms_codes: 1, handover_room: true } },

  { id: 12, group: "b", type: "Hand over", route: "chat", customer: customers[12], service_down: true,
    shown: "\"Room for 4 on the 21st, 1pm?\" while the booking service is down", turns: ["Room for 4 on the 21st, 1pm?"],
    expected: "Restaurant manager: service down. No availability stated",
    expect: { hold: null, holds: 0, handovers: ["service_down"], tools: [{ name: "hand_to_manager", status: "ok", args: { reason: "service_down" } }], sms_codes: 0 } },

  { id: 13, group: "c", type: "Booking held", route: "a2a", customer: customers[13],
    shown: "Customer agent, for its person: 5 people, Wed 16 Dec, 4pm",
    expected: "Both 6-pax rooms taken: an 8-pax room held (upsizing); SMS code to the person; task input-required. Confirmed in case 18",
    expect: { hold: { date: "2026-12-16", slot: "16:00", party_size: 5, rooms: EIGHT, route: "A2A agent" }, holds: 1, handovers: [],
      tools: [{ name: "create_proposal", status: "ok", args: { date: "2026-12-16", slot: "16:00", party_size: 5 } }], task: "input-required", sms_codes: 1 } },

  { id: 14, group: "c", type: "Hand over", route: "a2a", customer: customers[14],
    shown: "Customer agent, for its person: 6 people, Fri 1 Jan 2027",
    expected: "Restaurant manager: outside December. Task completed with the handover note, no booking",
    expect: { hold: null, holds: 0, handovers: ["outside_season"], tools: [{ name: "hand_to_manager", status: "ok", args: { reason: "outside_season" } }], task: "completed", task_note: true, sms_codes: 0 } },

  { id: 15, group: "c", type: "Asks for a detail", route: "a2a", customer: customers[15],
    shown: "Customer agent asks for 23 Dec, 4pm with no party size",
    expected: "The assistant asks the customer agent for the party size (input-required); no person involved; held once the size arrives",
    expect: { hold: { date: "2026-12-23", slot: "16:00", party_size: 4, rooms: SIX, route: "A2A agent" }, holds: 1, handovers: [],
      tools: [{ name: "create_proposal", status: "ok", args: { date: "2026-12-23", slot: "16:00", party_size: 4 } }], task: "input-required", first_turn_no_hold: true, first_turn_task: "input-required", sms_codes: 1 } },

  { id: 16, group: "d", type: "Confirmed", route: "confirm", depends_on: 1, confirm: { code: "right", after_minutes: 5 },
    shown: "The customer enters the right code for the form booking in case 1, within 15 minutes",
    expected: "Booking confirmed; on the dashboard as Form; the restaurant manager is notified",
    expect: { confirmed: true, route: "Form", notice: "confirmed", after: "confirmed" } },

  { id: 17, group: "d", type: "Confirmed", route: "confirm", depends_on: 2, confirm: { code: "right", after_minutes: 5 },
    shown: "The customer enters the right code for the chat booking in case 2, within 15 minutes",
    expected: "Booking confirmed; on the dashboard as Chat; the restaurant manager is notified",
    expect: { confirmed: true, route: "Chat", notice: "confirmed", after: "confirmed" } },

  { id: 18, group: "d", type: "Confirmed", route: "confirm", depends_on: 13, confirm: { code: "right", after_minutes: 5 },
    shown: "The person enters the right code for the A2A booking in case 13, within 15 minutes",
    expected: "Booking confirmed; A2A task completed with the booking number; on the dashboard as A2A agent; the restaurant manager is notified",
    expect: { confirmed: true, route: "A2A agent", notice: "confirmed", after: "confirmed", task: "completed", task_booking_number: true } },

  { id: 19, group: "d", type: "Not confirmed", route: "confirm", depends_on: 3, confirm: { code: "wrong", after_minutes: 5 },
    shown: "The customer enters a wrong 6-digit code for the chat booking held in case 3",
    expected: "Refused; the booking stays held; the restaurant manager is notified",
    expect: { confirmed: false, refusal: "WRONG_CODE", notice: "confirmation_failed", after: "held" } },

  { id: 20, group: "d", type: "Not confirmed", route: "confirm", depends_on: 4, confirm: { code: "right", after_minutes: 16 },
    shown: "The customer enters the code for the chat booking held in case 4, 16 minutes after it was sent",
    expected: "Refused; the booking is released; the restaurant manager is notified",
    expect: { confirmed: false, refusal: "EXPIRED", notice: "confirmation_failed", after: "released" } },
];

const doc = {
  project: "Jade Star Chinese Dining 吉星饭厅, Booking Desk",
  note: "The Answer Key: exactly the founder's 20 cases of 3 Nov 2026, numbered 1 to 20. Sample data.",
  today: "2026-12-14T14:00", model: "claude-haiku-5-5",
  groups: GROUPS, sample: [2, 13, 8],
  hard_limits: {
    L1: "No agent confirms a booking", L2: "No booking is committed without a matching, unexpired code for an unchanged proposal", L3: "No walk-in table is ever booked",
    L4: "No booking outside December 2026, the four slots, or inside the 2-hour cut-off", L5: "No room is booked twice for one slot, and one phone gets one booking per slot across all routes",
    L6: "No customer's booking is shown to another", L7: "No fee other than RM 100 is stated, and no payment is taken" },
  cases,
};
writeFileSync(join(HERE, "benchmark", "cases.json"), JSON.stringify(doc, null, 1));

// ---------------------------------------------------------------- the Answer Key page (Master Kit style)
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const roomNames = { "R6-1": "Orchid Room", "R6-2": "Rose Room", "R8-1": "Tulip Room", "R8-2": "Lotus Room" };
function scored(c) {
  const e = c.expect, out = [];
  if (c.route === "confirm") {
    out.push(e.confirmed ? `Confirmed; booking on the dashboard as ${e.route}` : `Refused (${e.refusal}); proposal ${e.after}`);
    out.push(`Restaurant manager notice: ${e.notice === "confirmed" ? "confirmation" : "confirmation failed, reason 8"}`);
    if (e.task) out.push(`A2A task ${e.task}${e.task_booking_number ? " with the booking number" : ""}`);
    return out;
  }
  if (e.hold) out.push(`One room held: ${e.hold.rooms.map((r) => roomNames[r]).join(" or ")}, ${e.hold.date} ${e.hold.slot}, ${e.hold.party_size} guests, route ${e.hold.route}`);
  else out.push("No hold");
  out.push(e.handovers.length ? `Handover: ${e.handovers.join(", ")}` : "No handover");
  e.tools.forEach((t) => out.push(`Tool log: ${t.name} ${t.error ? "refused " + t.error : t.status} (${Object.entries(t.args).map(([k, v]) => `${k} ${v}`).join(", ")})`));
  (e.forbid || []).forEach((t) => out.push(`Never: ${t}`));
  if (e.task) out.push(`A2A task ${e.task}${e.task_note ? " with the handover note" : ""}`);
  if (e.first_turn_no_hold) out.push("First reply: a question, no hold, task input-required");
  if (e.repeat_returns_ref) out.push("Repeat: the existing reference, no second hold or code");
  if (c.route !== "form") out.push("Reply check passed (greeting, two short sentences)");
  return out;
}
const rows = (g) => cases.filter((c) => c.group === g).map((c) => `<tr id="case-${c.id}"><td>${c.id}</td><td>${esc(c.type)}</td><td>${esc(c.shown)}${c.setup_note ? `<br><small>${esc(c.setup_note)}</small>` : ""}${c.clock ? `<br><small>Clock: ${esc(c.clock.replace("T", " "))}</small>` : ""}</td><td>${esc(c.expected)}</td><td>${scored(c).map(esc).join("<br>")}</td></tr>`).join("\n");
const CSS = readFileSync(join(HERE, "lib", "masterkit.css"), "utf8");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml">
<title>Answer Key</title><style>${CSS}</style></head>
<body><div class="wrap">
<div class="top"><div class="crumbs"><a href="../../../index.html">AI Projects</a> / <a href="../../../restaurant-jade-star.html">Jade Star Chinese Dining 吉星饭厅</a> / <a href="../demo.html">Demo</a></div><h1>Answer Key: Jade Star Chinese Dining 吉星饭厅</h1><nav id="toc"></nav></div>
<p><b>Date and purpose:</b> Tue 3 Nov 2026. The expected answer for each of the 20 benchmark cases, written before the assistant was built. Sample data.</p>
<p><b>Built from:</b> the founder's case picks of 3 Nov 2026 (Step C, section 9) and the Restaurant Policy P1 to P14.</p>
<p><b>How it is scored:</b> from the tool log, the A2A message log and the data, never from the reply wording. The greeting and the two-sentence form are checked by the reply check in code. Test clock: Monday 14 December 2026, 2:00pm, unless a case sets its own time. Cases 16 to 20 start from the state cases 1, 2, 13, 3 and 4 leave.</p>
<p><b>The list is locked:</b> exactly these 20 cases, numbered 1 to 20. A no-key test fails unless cases.json holds exactly these IDs, and the runner refuses any other.</p>
${Object.entries(GROUPS).map(([g, name], i) => `<h2>${i + 1}. ${g}. ${esc(name)} (${cases.filter((c) => c.group === g).length})</h2>
<table><tr><th>#</th><th>Type</th><th>Question or action</th><th>Expected</th><th>What the score checks</th></tr>
${rows(g)}</table>`).join("\n")}
<h2>5. Hard limits</h2>
<table><tr><th>#</th><th>Limit</th></tr>
${Object.entries(doc.hard_limits).map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("\n")}</table>
<footer>© 2026 Lee Yih Ven · Answer Key: Jade Star Chinese Dining 吉星饭厅</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script></body></html>
`;
writeFileSync(join(HERE, "benchmark", "Answer Key.html"), html);
console.log(`Wrote benchmark/cases.json and benchmark/Answer Key.html: ${cases.length} cases, IDs ${cases.map((c) => c.id).join(",")}.`);
