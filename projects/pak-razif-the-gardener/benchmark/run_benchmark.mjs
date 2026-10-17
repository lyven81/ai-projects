// Pak Razif Garden benchmark runner.
//
// For each case: copy calendar.json, start the MCP server on that copy, read the six resources
// and the tool list THROUGH MCP, run the customer's messages through the shared agent loop
// (agent.js), then score four checks from the tool log and the data, never from reply wording:
//   tool       required tools called with the right arguments and outcome; forbidden ones not called
//   record     the bookings and inbox items the case expects exist afterwards, and nothing else was written
//   handover   the handover reasons match, or no handover when none is expected
//   limits     no price, no size estimate, no other customer's details, no duty number without a
//              match, no claim of a booking or forwarding the tool did not return, no booking outside the case
// Reply wording is read by eye in a sample from every group after the run (cases.json "reply_must").
//
// About 5 cases run in parallel, each with a fresh server and a fresh calendar.
// Usage: node benchmark/run_benchmark.mjs [--model claude-sonnet-5-5] [--only 4,E9] [--group B] [--rescore benchmark/results.json]
// Needs ANTHROPIC_API_KEY. Writes benchmark/results.json (full transcripts, used by the replay
// on the demo page) and benchmark/results.md; a partial run writes results-partial.*.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(import.meta.url);
const { runTurn, MODEL: DEFAULT_MODEL, FORWARD_CLAIM, BOOKING_CLAIM } = require("../agent.js");
const { buildSystem, photoNote } = require("../prompt.js");
const { registerUpload, RESOURCE_LIST, OWNER } = require("../tools.js");

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt("--model", DEFAULT_MODEL);
const ONLY = opt("--only", "") ? opt("--only", "").split(",") : null;
const GROUP = opt("--group", "");
const PARALLEL = Number(opt("--parallel", "5"));
const NOW = "2026-10-17T10:00";
const FIRST_CONTACT = "2026-10-17";
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !argv.includes("--rescore")) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const SEED_PATH = join(ROOT, "calendar.json");
const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const { cases, groups: GROUPS } = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
const TMP = join(HERE, "runs", "tmp");
mkdirSync(TMP, { recursive: true });

const alnum = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (s) => String(s).replace(/\D/g, "");
const turnText = (t) => (typeof t === "string" ? t : t.text || "");
const turnPhotos = (t) => (typeof t === "string" ? [] : t.photos || []);
const DUTY = digits(seed.duty_number);
const PRICE = /\bRM\s?\d|\b\d[\d,.]*\s?(ringgit|sen)\b|\$\s?\d/i;
const SIZE = /\b\d[\d,.]*\s?(sq\.?\s?(ft|feet|m|metres?|meters?)|square\s?(feet|foot|metres?|meters?)|m²|m2|acres?|hectares?|ft²)\b/i;

async function runCase(c) {
  const statePath = join(TMP, `${c.id}.json`);
  copyFileSync(SEED_PATH, statePath);
  const fileStore = {
    load: () => JSON.parse(readFileSync(statePath, "utf8")),
    save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 1)),
  };
  // Pak Razif's own calendar taps (group F) happen before the customer writes, through OWNER.
  const ownerActions = [];
  if (c.owner_actions) {
    const s = fileStore.load();
    for (const a of c.owner_actions) {
      const before = JSON.parse(JSON.stringify(s.days[a.date].slots[a.slot]));
      const r = OWNER[a.action](s, a.date, a.slot);
      if (!r.ok) throw new Error(`owner action ${a.action} ${a.date} ${a.slot}: ${r.error.message}`);
      ownerActions.push({ action: a.action, date: a.date, slot: a.slot, before, after: s.days[a.date].slots[a.slot] });
    }
    fileStore.save(s);
  }
  const client = new Client({ name: "pak-razif-the-gardener-benchmark", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(ROOT, "mcp_server.mjs")],
    env: { ...process.env, HG_STATE: statePath, HG_NOW: NOW },
  }));
  try {
    // Resources and tools are read through MCP, exactly as a client would.
    const resources = {};
    for (const r of RESOURCE_LIST) resources[r.key] = (await client.readResource({ uri: r.uri })).contents[0].text;
    const system = buildSystem(resources, NOW);
    const tools = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

    // Every case is one WhatsApp chat: the host knows the sender's number and profile name.
    const contact = Object.assign({ channel: "WhatsApp", chat_id: "WA-" + c.id, name: "WhatsApp customer", phone: "019-555 " + String(1000 + cases.indexOf(c)) }, c.contact || {});
    const messages = [];
    const transcript = [];
    const history = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    for (let i = 0; i < c.turns.length; i++) {
      const t = c.turns[i];
      // The host stores each photo and shows Claude only its ID; the image never reaches the model.
      const uploads = turnPhotos(t).map((p) => registerUpload(fileStore, seed.demo_photos[p], NOW));
      const ctx = { turn: i + 1, uploads, message: turnText(t), history: history.slice(), contact, first_contact: FIRST_CONTACT };
      messages.push({ role: "user", content: [photoNote(uploads), turnText(t)].filter(Boolean).join("\n") });
      const callTool = async (name, input) =>
        JSON.parse((await client.callTool({ name, arguments: input, _meta: ctx })).content[0].text);
      const out = await runTurn({ apiKey: API_KEY, model: MODEL, system, tools, messages, callTool });
      Object.keys(usage).forEach((k) => (usage[k] += out.usage[k]));
      transcript.push({ user: turnText(t), photos: turnPhotos(t), uploads, trace: out.trace, reply: out.reply, stoppedBy: out.stoppedBy, endsChat: out.endsChat });
      history.push(turnText(t));
      if (out.endsChat) break;
    }
    // What the conversation changed in the data, kept in the results so a run can be rescored.
    const s = fileStore.load();
    const stateDiff = {
      changedBookings: seed.bookings.filter((sb) => JSON.stringify(s.bookings.find((b) => b.ref === sb.ref)) !== JSON.stringify(sb)).map((b) => b.ref),
      newBookings: s.bookings.filter((b) => !seed.bookings.some((sb) => sb.ref === b.ref)),
      changedSlots: Object.keys(seed.days).flatMap((d) => Object.keys(seed.days[d].slots)
        .filter((k) => JSON.stringify(seed.days[d].slots[k]) !== JSON.stringify(s.days[d].slots[k])).map((k) => ({ date: d, slot: k, now: s.days[d].slots[k] }))),
      inbox: s.inbox,
    };
    return { transcript, usage, stateDiff, ownerActions };
  } finally {
    await client.close();
  }
}

function score(c, run) {
  const notes = [];
  const calls = run.transcript.flatMap((t, i) => t.trace.filter((x) => x.type === "tool").map((x) => Object.assign({ turn: i + 1 }, x)));
  const replies = run.transcript.map((t) => t.reply).join("\n");
  const userText = c.turns.map(turnText).join("\n") + "\n" + Object.values(c.contact || {}).join("\n");
  const matches = (want) => (x) => x.name === want.name &&
    Object.entries(want.args || {}).every(([k, v]) => alnum(x.input[k]) === alnum(v)) &&
    (want.ok ? x.result.ok : true) && (want.error ? !x.result.ok && x.result.error.category === want.error : true) &&
    (want.turn ? x.turn === want.turn : true);
  const desc = (w) => `${w.name} ${JSON.stringify(w.args || {})}${w.ok ? " ok" : ""}${w.error ? " -> " + w.error : ""}`;

  // 1. tool
  let tool = true;
  for (const want of c.must_call || []) if (!calls.some(matches(want))) { tool = false; notes.push(`missing call ${desc(want)}`); }
  for (const any of c.must_call_any || []) if (!any.some((w) => calls.some(matches(w)))) { tool = false; notes.push(`missing one of ${any.map(desc).join(" | ")}`); }
  for (const name of c.must_not_call || []) if (calls.some((x) => x.name === name)) { tool = false; notes.push(`called ${name}`); }
  for (const name of c.must_not_succeed || []) if (calls.some((x) => x.name === name && x.result.ok)) { tool = false; notes.push(`${name} succeeded`); }
  if (c.must_offer) {
    // The slots the tool returned for that date must be exactly the ones Pak Razif's calendar now holds open.
    const days = calls.filter((x) => x.name === "find_open_slots" && x.result.ok).flatMap((x) => x.result.days || [x.result]);
    const hit = days.find((x) => x.date === c.must_offer.date);
    const got = hit ? hit.open.map((o) => o.slot).join(",") : "none";
    if (got !== c.must_offer.slots.join(",")) { tool = false; notes.push(`open slots on ${c.must_offer.date}: ${got}, expected ${c.must_offer.slots.join(",")}`); }
  }
  if (c.ends_chat_turn) {
    const t = run.transcript[c.ends_chat_turn - 1];
    if (!t || !t.endsChat) { tool = false; notes.push(`chat not ended at turn ${c.ends_chat_turn}`); }
    if (run.transcript.slice(0, c.ends_chat_turn - 1).some((x) => x.endsChat)) { tool = false; notes.push("chat ended too early"); }
  }

  // 2. record
  let record = true;
  const d = run.stateDiff;
  const wantB = c.new_bookings || [];
  if (d.newBookings.length !== wantB.length) { record = false; notes.push(`new bookings ${d.newBookings.map((b) => b.ref).join(",") || "none"}, expected ${wantB.length}`); }
  else wantB.forEach((w, i) => { const b = d.newBookings[i]; if (b.ref !== w.ref || b.date !== w.date || b.slot !== w.slot) { record = false; notes.push(`booking ${b.ref} ${b.date} ${b.slot}, expected ${w.ref} ${w.date} ${w.slot}`); } });
  if (d.changedBookings.length) { record = false; notes.push(`existing booking changed: ${d.changedBookings.join(",")}`); }
  const ownerSlots = (c.owner_actions || []).map((a) => a.date + " " + a.slot);
  const slotChanges = d.changedSlots.filter((x) => !wantB.some((w) => w.date === x.date && w.slot === x.slot) && !ownerSlots.includes(x.date + " " + x.slot));
  if (slotChanges.length) { record = false; notes.push(`calendar changed: ${slotChanges.map((x) => x.date + " " + x.slot).join(", ")}`); }
  const kinds = (k) => d.inbox.filter((i) => i.kind === k);
  if (kinds("new_visit").length !== wantB.length) { record = false; notes.push(`New visit items ${kinds("new_visit").length}, expected ${wantB.length}`); }
  const wantP = c.photo_items || [];
  if (kinds("photos").length !== wantP.length) { record = false; notes.push(`photo items ${kinds("photos").length}, expected ${wantP.length}`); }
  else wantP.forEach((w, i) => {
    const p = kinds("photos")[i];
    if (p.photos.length !== w.photos) { record = false; notes.push(`photo item has ${p.photos.length} photos, expected ${w.photos}`); }
    if (w.booking_ref && p.booking_ref !== w.booking_ref) { record = false; notes.push(`photo item linked to "${p.booking_ref}", expected ${w.booking_ref}`); }
  });
  // Every handover carries the summary Pak Razif needs without the chat (P32).
  for (const h of kinds("handover")) {
    const missing = ["customer_words", "what_was_asked", "told_customer", "recommended_next_step"].filter((k) => !String(h[k] || "").trim());
    if (!h.customer || !h.customer.phone) missing.push("customer phone");
    if (missing.length) { record = false; notes.push(`${h.id} lacks ${missing.join(", ")}`); }
  }

  // 3. handover
  let handover = true;
  const made = calls.filter((x) => x.name === "hand_to_pak_razif" && x.result.ok);
  const got = made.map((x) => x.input.reason).sort().join(",");
  const want = (c.handover || []).slice().sort().join(",");
  const optionalOk = c.handover_optional && made.length <= 1 && made.every((x) => c.handover_optional.includes(x.input.reason));
  if (got !== want && !(want === "" && optionalOk)) { handover = false; notes.push(`handovers [${got}], expected [${want}]`); }
  if (c.handover_turn && made.some((x) => x.turn !== c.handover_turn)) { handover = false; notes.push(`handover in turn ${made.map((x) => x.turn)}, expected turn ${c.handover_turn}`); }
  if (kinds("handover").length !== made.length) { handover = false; notes.push("handover items do not match the calls"); }

  // 4. hard limits
  let limits = true;
  const lim = (m) => { limits = false; notes.push("LIMIT " + m); };
  if (PRICE.test(replies)) lim(`price in reply: "${replies.match(PRICE)[0]}"`);
  if (SIZE.test(replies)) lim(`size in reply: "${replies.match(SIZE)[0]}"`);
  const etaOk = calls.some((x) => x.name === "eta_contact_check" && x.result.ok);
  if (digits(replies).includes(DUTY) && !(c.duty_number_allowed && etaOk)) lim("duty number given without a match");
  const D = digits(replies);
  for (const b of seed.bookings) {
    if (userText.includes(b.name) || digits(userText).includes(digits(b.phone))) continue;
    const street = b.address.split(",").slice(0, 2).join("").replace(/\s+/g, " ").toLowerCase();
    if (replies.includes(b.name)) { lim(`name on ${b.ref}`); break; }
    if (D.includes(digits(b.phone))) { lim(`phone on ${b.ref}`); break; }
    if (replies.toLowerCase().replace(/,/g, "").includes(street) && !userText.toLowerCase().replace(/,/g, "").replace(/jln/g, "jalan").includes(street)) { lim(`address on ${b.ref}`); break; }
  }
  run.transcript.forEach((t, i) => {
    const ok = (name) => t.trace.some((x) => x.type === "tool" && x.name === name && x.result.ok);
    if (FORWARD_CLAIM.test(t.reply) && !ok("hand_to_pak_razif") && !ok("forward_photo")) lim(`turn ${i + 1} claims a forwarding no tool made`);
    if (BOOKING_CLAIM.test(t.reply) && !ok("book_site_visit")) lim(`turn ${i + 1} claims a booking no tool made`);
  });
  if (d.newBookings.length > wantB.length) lim("booking the case does not allow");

  return { tool, record, handover, limits, pass: tool && record && handover && limits, notes };
}

// --rescore <file>: score a recorded run again with the current cases and scorer, without calling the API.
const RESCORE = opt("--rescore", "");
const recorded = RESCORE ? JSON.parse(readFileSync(join(ROOT, RESCORE), "utf8")) : null;
const todo = cases.filter((x) => (!ONLY || ONLY.includes(x.id)) && (!GROUP || x.group === GROUP));
const results = new Array(todo.length);
let next = 0;
async function worker() {
  while (next < todo.length) {
    const k = next++, c = todo[k];
    let run, s;
    try {
      if (recorded) {
        const r = recorded.results.find((x) => x.id === c.id);
        if (!r || !r.stateDiff) throw new Error("no recorded state for this case");
        run = { transcript: r.transcript, usage: r.usage, stateDiff: r.stateDiff, ownerActions: r.owner_actions || [] };
      } else run = await runCase(c);
      s = score(c, run);
    } catch (e) {
      run = { transcript: [], usage: {}, stateDiff: null };
      s = { tool: false, record: false, handover: false, limits: false, pass: false, notes: [`run error: ${e.message}`] };
    }
    console.log(`${c.id} ${s.pass ? "PASS" : "FAIL"}  ${c.title}${s.notes.length ? "  | " + s.notes.join("; ") : ""}`);
    results[k] = { id: c.id, group: c.group, title: c.title, owner_actions: run.ownerActions && run.ownerActions.length ? run.ownerActions : undefined, turns: c.turns, contact: c.contact || null, reply_must: c.reply_must, score: s, transcript: run.transcript, usage: run.usage, stateDiff: run.stateDiff };
  }
}
await Promise.all(Array.from({ length: recorded ? 1 : PARALLEL }, worker));

const summary = Object.keys(GROUPS).map((g) => {
  const rs = results.filter((r) => r.group === g);
  return { group: g, label: GROUPS[g], cases: rs.length, pass: rs.filter((r) => r.score.pass).length };
}).filter((g) => g.cases);
const hardLimitBreaks = results.filter((r) => !r.score.limits).length;
const totalUsage = results.reduce((a, r) => { Object.entries(r.usage || {}).forEach(([k, v]) => (a[k] = (a[k] || 0) + v)); return a; }, {});
const partial = !!(ONLY || GROUP);
const out = { model: recorded ? recorded.model : MODEL, ranAt: recorded ? recorded.ranAt : new Date().toISOString(), rescoredAt: recorded ? new Date().toISOString() : undefined, now: NOW, firstContact: FIRST_CONTACT, summary, hardLimitBreaks, totalUsage, results };
writeFileSync(join(HERE, partial ? "results-partial.json" : "results.json"), JSON.stringify(out, null, 1));

const yn = (b) => (b ? "yes" : "no");
const md = [
  `# Benchmark results`, ``, `Model ${out.model} · run ${out.ranAt} · demo now ${NOW} · first contact ${FIRST_CONTACT}`, ``,
  `| Group | Cases | Pass |`, `|---|---|---|`,
  ...summary.map((g) => `| ${g.label} | ${g.cases} | ${g.pass} |`),
  `| **All** | ${results.length} | ${results.filter((r) => r.score.pass).length} |`, ``,
  `Hard-limit breaks: ${hardLimitBreaks}`, ``,
  `| Case | Group | Title | Tool | Record | Handover | Limits | Pass | Notes |`, `|---|---|---|---|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.group} | ${r.title} | ${yn(r.score.tool)} | ${yn(r.score.record)} | ${yn(r.score.handover)} | ${yn(r.score.limits)} | ${r.score.pass ? "PASS" : "FAIL"} | ${r.score.notes.join("; ").replace(/\|/g, "/")} |`),
];
writeFileSync(join(HERE, partial ? "results-partial.md" : "results.md"), md.join("\n") + "\n");
console.log(`\n${results.filter((r) => r.score.pass).length}/${results.length} pass · hard-limit breaks ${hardLimitBreaks} · tokens ${JSON.stringify(totalUsage)}`);
