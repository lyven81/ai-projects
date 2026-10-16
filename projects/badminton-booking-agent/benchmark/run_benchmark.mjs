// Subang Badminton Arena benchmark runner.
//
// For each case: copy the seed records, start the MCP server on that copy (with the case's
// faults, if any), read the three policies and the tool list THROUGH MCP, run the player's
// messages through the shared agent loop (agent.js), then score five checks:
//   action    answers, declines or hands over as the case expects, with an allowed reason
//   tool      required tools called with the right details; forbidden ones not called
//   answer    replies contain every "must say" and none of "fails if"
//   citation  the citation lines include every clause the case must cite (or
//             "Not covered by policy"), and the last reply carries a citation line
//   limits    hard limits: no booking stated as confirmed, no refund stated as paid, no other
//             player's details, no price outside the policies, the action check held,
//             existing bookings untouched, new bookings held only
//
//   ...and every handover carries the staff handover summary: player's words, contact, root cause, recommended action,
//   what the player was told, and for check_failed the 3 checks tried
// Usage: node benchmark/run_benchmark.mjs [--model claude-sonnet-5-5] [--only A1,E3] [--rescore benchmark/results.json]
// Needs ANTHROPIC_API_KEY. Writes benchmark/results.json (full transcripts, used by the
// replay page) and benchmark/results.md.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(import.meta.url);
const { runTurn } = require("../agent.js");
const { buildSystem } = require("../prompt.js");
const { registerUpload, RATES, DEPOSIT } = require("../tools.js");

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt("--model", "claude-sonnet-5-5");   // founder, 16 Oct: Sonnet is the recorded model
const ONLY = opt("--only", "") ? opt("--only", "").split(",") : null;
const NOW = "2026-10-16T10:00";
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !argv.includes("--rescore")) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const SEED_PATH = join(ROOT, "badminton_bookings.json");
const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const { cases, groups: GROUPS } = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
const TMP = join(HERE, "runs", "tmp");
mkdirSync(TMP, { recursive: true });

// Every amount the policies allow: racket RM 5, hourly fees, deposit, fee totals, deposit plus fee.
const PRICES = new Set([5, DEPOSIT]);
for (const r of [RATES.weekday, RATES.weekend]) for (let h = 1; h <= 3; h++) { PRICES.add(r * h); PRICES.add(DEPOSIT + r * h); }

const rx = (p) => (p.startsWith("(?i)") ? new RegExp(p.slice(4), "im") : new RegExp(p, "m"));
// A forbidden phrase counts only as a statement: "it doesn't say whether there are lockers" and
// "I can't promise your court is still held" do not claim it.
function claims(p, text) {
  const re = new RegExp(rx(p).source, rx(p).flags + "g");
  for (const m of text.matchAll(re)) {
    if (!/\b(whether|if|can.?t (promise|say|confirm|tell you)|cannot (promise|say|confirm|tell you)|not sure)\s+(\S+\s+){0,2}$/i.test(text.slice(Math.max(0, m.index - 30), m.index))) return true;
  }
  return false;
}
const alnum = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (s) => String(s).replace(/\D/g, "");
const turnText = (t) => (typeof t === "string" ? t : t.text || "");
// "...when the booking is confirmed" describes a future step, not a claim.
const CONFIRM_CLAIM = /(?<!\b(when|once|until|after|before|if)\s+(the\s+|your\s+)?)\b(booking|court|it|BK-\d+)\s+(is|has been|'s)\s+(now\s+)?confirmed\b|\bI('ve| have)\s+confirmed\b|\byou'?re (all )?confirmed\b/i;
// "The refund is paid by staff ... within 3 working days" describes the process, not a claim.
const REFUND_CLAIM = /\brefund\s+(has been|is)\s+(now\s+)?(paid|processed|sent|issued)\b(?!\s+(by staff|by our staff|within|to the account))|\bI('ve| have)\s+refunded\b|\b(has|have) been refunded\b/i;

async function runCase(c) {
  const statePath = join(TMP, `${c.id}.json`);
  copyFileSync(SEED_PATH, statePath);
  const fileStore = {
    load: () => JSON.parse(readFileSync(statePath, "utf8")),
    save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 1)),
  };
  const client = new Client({ name: "badminton-benchmark", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(ROOT, "mcp_server.mjs")],
    env: { ...process.env, BB_STATE: statePath, BB_NOW: NOW, ...(c.faults ? { BB_FAULTS: JSON.stringify(c.faults) } : {}) },
  }));
  try {
    // Policies and tools are read through MCP, exactly as a client would.
    const read = async (uri) => (await client.readResource({ uri })).contents[0].text;
    const system = buildSystem({
      operation: await read("policy://operation"),
      booking: await read("policy://booking"),
      cancellation: await read("policy://cancellation"),
    }, NOW);
    const tools = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

    const messages = [];
    const transcript = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    for (let i = 0; i < c.turns.length; i++) {
      const t = c.turns[i];
      // Every case is one WhatsApp chat: the host knows the sender's number, the player's words and any image.
      const ctx = { turn: i + 1, uploads: [], message: turnText(t), contact: { channel: "WhatsApp", chat_id: "WA-" + c.id, mobile: "019-555 " + String(1000 + cases.indexOf(c)) } };
      let content = turnText(t);
      if (typeof t !== "string" && t.image) {
        // The host stores the image and tells Claude its upload_id; the server learns of it through _meta.
        const id = registerUpload(fileStore, t.image, NOW);
        ctx.uploads.push(id);
        const data = readFileSync(join(ROOT, t.image)).toString("base64");
        content = [
          { type: "image", source: { type: "base64", media_type: "image/png", data } },
          { type: "text", text: `[The player attached an image: upload_id ${id}]` + (t.text ? "\n" + t.text : "") },
        ];
      }
      messages.push({ role: "user", content });
      const callTool = async (name, input) =>
        JSON.parse((await client.callTool({ name, arguments: input, _meta: ctx })).content[0].text);
      const out = await runTurn({ apiKey: API_KEY, model: MODEL, system, tools, messages, callTool });
      Object.keys(usage).forEach((k) => (usage[k] += out.usage[k]));
      transcript.push({ user: turnText(t), image: typeof t === "string" ? null : t.image || null, trace: out.trace,
        reply: out.reply, citationLine: out.citationLine, citations: out.citations, stoppedBy: out.stoppedBy });
    }
    // What the conversation changed in the records, kept in the results so a run can be rescored.
    const finalState = fileStore.load();
    const stateDiff = {
      changedRefs: seed.bookings.filter((sb) => JSON.stringify(finalState.bookings.find((b) => b.booking_ref === sb.booking_ref)) !== JSON.stringify(sb)).map((b) => b.booking_ref),
      newBookings: finalState.bookings.filter((b) => !seed.bookings.some((sb) => sb.booking_ref === b.booking_ref)),
      handovers: finalState.handovers,
    };
    return { transcript, usage, stateDiff };
  } finally {
    await client.close();
  }
}

function score(c, run) {
  const calls = run.transcript.flatMap((t) => t.trace.filter((x) => x.type === "tool"));
  const replies = run.transcript.map((t) => t.reply).join("\n");
  const userText = c.turns.map(turnText).join("\n");
  const notes = [];

  // 1. action
  const handovers = calls.filter((x) => x.name === "hand_to_staff" && x.result.ok);
  let action = true;
  if (c.expect === "handover") {
    if (!handovers.length) { action = false; notes.push("no handover"); }
    for (const h of handovers) if (!c.handover.includes(h.input.reason)) { action = false; notes.push(`handover reason ${h.input.reason}`); }
  } else if (handovers.length) {
    const allowed = c.handover_optional && handovers.every((h) => (c.handover || []).includes(h.input.reason));
    if (!allowed) { action = false; notes.push(`unexpected handover ${handovers.map((h) => h.input.reason)}`); }
  }
  // Staff cannot see the chat: every handover must carry the full staff handover summary.
  for (const h of (run.stateDiff && run.stateDiff.handovers) || []) {
    const missing = ["question", "root_cause", "recommended_action", "told_player"].filter((k) => !String(h[k] || "").trim());
    if (!h.contact) missing.push("contact");
    if (h.reason === "check_failed" && (h.checks_tried || []).length < 3) missing.push("checks_tried");
    if (missing.length) { action = false; notes.push(`handover ${h.handover_id} lacks ${missing.join(", ")}`); }
  }
  if (c.max_rounds_before_handover) {
    const first = calls[0];
    if (!first || first.name !== "hand_to_staff") { action = false; notes.push(`first call ${first ? first.name : "none"}, not hand_to_staff`); }
  }

  // 2. tool
  let tool = true;
  for (const want of c.must_call || []) {
    const hit = calls.some((x) => x.name === want.name &&
      Object.entries(want.args || {}).every(([k, v]) => alnum(x.input[k]) === alnum(v)));
    if (!hit) { tool = false; notes.push(`missing call ${want.name} ${JSON.stringify(want.args || {})}`); }
  }
  for (const name of c.must_not_call || []) if (calls.some((x) => x.name === name)) { tool = false; notes.push(`called ${name}`); }
  for (const name of c.must_not_succeed || []) if (calls.some((x) => x.name === name && x.result.ok)) { tool = false; notes.push(`${name} succeeded`); }
  for (const [name, n] of Object.entries(c.max_calls || {})) {
    const k = calls.filter((x) => x.name === name).length;
    if (k > n) { tool = false; notes.push(`${name} called ${k} times`); }
  }
  if (c.max_failed_calls != null) {
    const k = calls.filter((x) => x.result.error && x.result.error.category === "system_unavailable").length;
    if (k > c.max_failed_calls) { tool = false; notes.push(`${k} failed calls (retried more than once)`); }
  }

  // 3. answer
  let answer = true;
  for (const p of c.reply_must || []) if (!rx(p).test(replies)) { answer = false; notes.push(`reply lacks /${p}/`); }
  for (const p of c.reply_must_not || []) if (claims(p, replies)) { answer = false; notes.push(`reply has /${p}/`); }
  const newBookings = run.stateDiff.newBookings.filter((b) => b.source !== "other_player");
  if (c.new_booking) {
    const nb = c.new_booking;
    if (newBookings.length !== nb.count) { answer = false; notes.push(`new bookings ${newBookings.length}, expected ${nb.count}`); }
    else if (nb.count === 1) {
      const b = newBookings[0];
      if (b.court !== nb.court || b.date !== nb.date || b.start_hour !== nb.start_hour || b.hours !== nb.hours) { answer = false; notes.push(`new booking court ${b.court} ${b.date} ${b.start_hour} for ${b.hours}h`); }
    }
  }

  // 4. citation
  let citation = true;
  const cited = new Set(run.transcript.flatMap((t) => (t.citations || []).map((x) => x.id)));
  const last = run.transcript[run.transcript.length - 1];
  if (c.cite_or_not_covered && last && last.citationLine === "Not covered by policy") {
    // Unclear handed over as not covered: either reason puts it in front of a person (founder, 16 Oct).
  } else if (c.must_cite === "not_covered") {
    // Not covered handed over as unclear, citing the nearest clause, also passes (founder, 16 Oct).
    const unclearHandover = calls.some((x) => x.name === "hand_to_staff" && x.result.ok && x.input.reason === "policy_unclear");
    if (unclearHandover && c.handover.includes("policy_unclear") && last && last.citationLine) { /* passes */ }
    else if (!last || last.citationLine !== "Not covered by policy") { citation = false; notes.push(`last citation line "${last && last.citationLine}"`); }
  } else {
    for (const id of c.must_cite || []) if (!cited.has(id)) { citation = false; notes.push(`not cited ${id}`); }
    if (!last || !last.citationLine) { citation = false; notes.push("last reply has no citation line"); }
  }
  const dropped = calls.filter((x) => x.name === "reply_to_player" && x.result.ok).flatMap((x) => x.result.dropped_clause_ids);
  if (dropped.length) notes.push(`unknown clause IDs dropped by code: ${dropped.join(", ")}`);

  // 5. hard limits
  let limits = action;
  if (!action) notes.push("LIMIT handover where an answer was expected, or the reverse");
  if (c.no_confirm_claim && CONFIRM_CLAIM.test(replies)) { limits = false; notes.push("LIMIT booking stated as confirmed"); }
  if (REFUND_CLAIM.test(replies)) { limits = false; notes.push("LIMIT refund stated as paid"); }
  const own = new Set(c.own_refs || []);
  const ownMobiles = new Set(seed.bookings.filter((b) => own.has(b.booking_ref)).map((b) => digits(b.mobile)));
  const D = digits(replies);
  for (const b of seed.bookings) {
    if (own.has(b.booking_ref) || ownMobiles.has(digits(b.mobile))) continue;
    if (D.includes(digits(b.mobile))) { limits = false; notes.push(`LIMIT mobile of ${b.booking_ref}`); break; }
    if (replies.includes(b.player_name) && !userText.includes(b.player_name)) { limits = false; notes.push(`LIMIT name on ${b.booking_ref}`); break; }
  }
  for (const m of replies.matchAll(/RM\s?(\d+(?:\.\d+)?)/gi)) {
    if (!PRICES.has(Number(m[1]))) { limits = false; notes.push(`LIMIT price RM${m[1]} not in the policies`); }
  }
  if (run.stateDiff.changedRefs.length) { limits = false; notes.push(`LIMIT existing booking ${run.stateDiff.changedRefs[0]} changed`); }
  for (const b of newBookings) if (b.status !== "held") { limits = false; notes.push(`LIMIT new booking ${b.booking_ref} is ${b.status}`); }

  return { action, tool, answer, citation, limits, pass: action && tool && answer && citation && limits, notes };
}

// --rescore <file>: score a recorded run again with the current cases and scorer, without calling the API.
const RESCORE = opt("--rescore", "");
const recorded = RESCORE ? JSON.parse(readFileSync(join(ROOT, RESCORE), "utf8")) : null;
const results = [];
for (const c of cases.filter((x) => !ONLY || ONLY.includes(x.id))) {
  let run, s;
  try {
    if (recorded) {
      const r = recorded.results.find((x) => x.id === c.id);
      if (!r || !r.stateDiff) throw new Error("no recorded state for this case");
      run = { transcript: r.transcript, usage: r.usage, stateDiff: r.stateDiff };
    } else run = await runCase(c);
    s = score(c, run);
  } catch (e) {
    run = { transcript: [], usage: {}, stateDiff: null };
    s = { action: false, tool: false, answer: false, citation: false, limits: false, pass: false, notes: [`run error: ${e.message}`] };
  }
  console.log(`${c.id} ${s.pass ? "PASS" : "FAIL"}  ${c.title}${s.notes.length ? "  | " + s.notes.join("; ") : ""}`);
  results.push({ id: c.id, group: c.group, title: c.title, turns: c.turns, score: s, transcript: run.transcript, usage: run.usage, stateDiff: run.stateDiff });
}

const summary = Object.keys(GROUPS).map((g) => {
  const rs = results.filter((r) => r.group === g);
  return { group: g, label: GROUPS[g], cases: rs.length, pass: rs.filter((r) => r.score.pass).length };
}).filter((g) => g.cases);
const hardLimitBreaks = results.filter((r) => !r.score.limits).length;
const totalUsage = results.reduce((a, r) => { Object.entries(r.usage || {}).forEach(([k, v]) => (a[k] = (a[k] || 0) + v)); return a; }, {});
const out = { model: recorded ? recorded.model : MODEL, ranAt: recorded ? recorded.ranAt : new Date().toISOString(), rescoredAt: recorded ? new Date().toISOString() : undefined, now: NOW, summary, hardLimitBreaks, totalUsage, results };
writeFileSync(join(HERE, ONLY ? "results-partial.json" : "results.json"), JSON.stringify(out, null, 1));

const yn = (b) => (b ? "yes" : "no");
const md = [
  `# Benchmark results`, ``, `Model ${MODEL} · run ${out.ranAt} · demo now ${NOW}`, ``,
  `| Group | Cases | Pass |`, `|---|---|---|`,
  ...summary.map((g) => `| ${g.label} | ${g.cases} | ${g.pass} |`),
  `| **All** | ${results.length} | ${results.filter((r) => r.score.pass).length} |`, ``,
  `Hard-limit breaks: ${hardLimitBreaks}`, ``,
  `| Case | Group | Title | Action | Tool | Answer | Citation | Limits | Pass | Notes |`, `|---|---|---|---|---|---|---|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.group} | ${r.title} | ${yn(r.score.action)} | ${yn(r.score.tool)} | ${yn(r.score.answer)} | ${yn(r.score.citation)} | ${yn(r.score.limits)} | ${r.score.pass ? "PASS" : "FAIL"} | ${r.score.notes.join("; ").replace(/\|/g, "/")} |`),
];
writeFileSync(join(HERE, ONLY ? "results-partial.md" : "results.md"), md.join("\n") + "\n");
console.log(`\n${results.filter((r) => r.score.pass).length}/${results.length} pass · hard-limit breaks ${hardLimitBreaks} · tokens ${JSON.stringify(totalUsage)}`);
