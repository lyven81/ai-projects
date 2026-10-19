// Kereta Sewa Jalan-jalan benchmark runner.
//
// For each case: copy the seed records, start the MCP server on that copy (with the case's
// clock and faults, if any), read the policy, the inventory and the tool list THROUGH MCP, run
// the customer's messages through the shared agent loop (agent.js), then score five checks
// from the tool log and the data, not the reply wording:
//   tool      required tools called; forbidden ones not called (or not succeeding)
//   details   required tools called with the case's details; every must-cite clause cited;
//             reply language where the case names one; nothing the case forbids stated
//   handover  the handovers recorded are exactly the expected reasons, each with what the
//             customer asked and what they were told; urgent where the case says so
//   record    new bookings, payments and cancellations are exactly what the case expects
//   limits    no seed booking changed except as the case allows; new bookings pending only;
//             no confirm or refund claim; no other customer's name or mobile; every price
//             in a reply came from a tool result or the inventory
// Tool selection is measured beside the checks (the founder's 19 Oct question on 9 tools):
//   first pick     the first tool called is one the case allows first
//   wrong picks    calls to a tool outside the case's required and optional set
//   order refusals calls refused for coming out of order (not_verified, quote_first, ...)
//   input errors   calls refused for missing or malformed details
//   extra calls    tool calls beyond the case's minimum
//
// Usage: node benchmark/run_benchmark.mjs [--model claude-sonnet-5-5] [--only A1,X5] [--parallel 5] [--rescore benchmark/results.json]
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
const { registerUpload, TIERS, DEPOSIT } = require("../tools.js");

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt("--model", "claude-sonnet-5-5");   // decision 7, 19 Oct: Sonnet is the recorded model
const ONLY = opt("--only", "") ? opt("--only", "").split(",") : null;
const PARALLEL = Number(opt("--parallel", "5"));
const NOW = "2026-10-20T10:00";
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !argv.includes("--rescore")) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const SEED_PATH = join(ROOT, "car_rental_bookings.json");
const seed = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const { cases, groups: GROUPS } = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
const TMP = join(HERE, "runs", "tmp");
mkdirSync(TMP, { recursive: true });

const ORDER_ERRORS = ["not_verified", "quote_first", "receipt_required", "not_locked"];
const INPUT_ERRORS = ["invalid_input", "missing_details", "invalid_mobile", "missing_times", "invalid_reason"];
const INVENTORY_AMOUNTS = new Set([DEPOSIT, 1, 0, ...Object.values(TIERS).flatMap((t) => [t.hourly_rm, t.daily_rm, t.weekly_rm])]);

const rx = (p) => (p.startsWith("(?i)") ? new RegExp(p.slice(4), "im") : new RegExp(p, "m"));
const alnum = (s) => String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
const digits = (s) => String(s).replace(/\D/g, "");
const turnText = (t) => (typeof t === "string" ? t : t.text || "");
// "...once staff confirm it" describes a future step, not a claim.
const CONFIRM_CLAIM = /(?<!\b(when|once|until|after|before|if)\s+(the\s+|your\s+)?)\b(booking|request|rental|it|KS-\d+)\s+(is|has been|'s)\s+(now\s+)?confirmed\b|\bI('ve| have)\s+confirmed\b|\byou'?re (all )?confirmed\b/i;
const REFUND_CLAIM = /\brefund\s+(has been|is)\s+(now\s+)?(paid|processed|sent|issued)\b(?!\s+(by staff|by our staff|within|to the))|\bI('ve| have)\s+refunded\b|\b(has|have) been refunded\b/i;
const MALAY = /\b(harga|sehari|sewa|deposit|untuk|anda|kereta|ialah|ada|boleh)\b/i;
const CJK = /[一-鿿]/;

// Amounts a tool showed the agent: numbers, and RM amounts written in its messages
// ("The receipt shows RM 50; the deposit is RM 100").
function numbersIn(x, out) {
  if (typeof x === "number") out.add(Math.round(x * 100) / 100);
  else if (typeof x === "string") for (const m of x.matchAll(/RM\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d{1,2})?)/gi)) out.add(Number(m[1].replace(/,/g, "")));
  else if (x && typeof x === "object") Object.values(x).forEach((v) => numbersIn(v, out));
  return out;
}

async function runCase(c) {
  const now = c.now || NOW;
  const statePath = join(TMP, `${c.id}.json`);
  copyFileSync(SEED_PATH, statePath);
  const fileStore = { load: () => JSON.parse(readFileSync(statePath, "utf8")), save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 1)) };
  const client = new Client({ name: "car-rental-benchmark", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [join(ROOT, "mcp_server.mjs")],
    env: { ...process.env, KS_STATE: statePath, KS_NOW: now, ...(c.faults ? { KS_FAULTS: JSON.stringify(c.faults) } : {}) },
  }));
  try {
    // The policy, the inventory and the tools are read through MCP, exactly as a client would.
    const read = async (uri) => (await client.readResource({ uri })).contents[0].text;
    const system = buildSystem({ policy: await read("policy://rental-policy"), inventory: await read("inventory://cars") }, now);
    const tools = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));

    const messages = [], transcript = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    for (let i = 0; i < c.turns.length; i++) {
      const t = c.turns[i];
      // Every case is one WhatsApp chat: the host knows the sender's number, the customer's words and any image.
      const ctx = { turn: i + 1, uploads: [], message: turnText(t), contact: { channel: "WhatsApp", chat_id: "WA-" + c.id, mobile: "019-555 " + String(1000 + cases.indexOf(c)) } };
      let content = turnText(t);
      if (typeof t !== "string" && t.image) {
        const id = registerUpload(fileStore, t.image, now);
        ctx.uploads.push(id);
        const data = readFileSync(join(ROOT, t.image)).toString("base64");
        content = [
          { type: "image", source: { type: "base64", media_type: "image/png", data } },
          { type: "text", text: `[The customer attached an image: upload_id ${id}]` + (t.text ? "\n" + t.text : "") },
        ];
      }
      messages.push({ role: "user", content });
      const callTool = async (name, input) => JSON.parse((await client.callTool({ name, arguments: input, _meta: ctx })).content[0].text);
      const out = await runTurn({ apiKey: API_KEY, model: MODEL, system, tools, messages, callTool });
      Object.keys(usage).forEach((k) => (usage[k] += out.usage[k]));
      transcript.push({ user: turnText(t), image: typeof t === "string" ? null : t.image || null, trace: out.trace,
        reply: out.reply, citationLine: out.citationLine, citations: out.citations, stoppedBy: out.stoppedBy });
    }
    // What the conversation changed in the records, kept in the results so a run can be rescored.
    const fin = fileStore.load();
    const seedIds = (k, f) => new Set((seed[k] || []).map((x) => x[f]));
    const stateDiff = {
      changed: seed.bookings.map((sb) => ({ before: sb, after: fin.bookings.find((b) => b.booking_ref === sb.booking_ref) }))
        .filter((x) => JSON.stringify(x.before) !== JSON.stringify(x.after)),
      newBookings: fin.bookings.filter((b) => !seedIds("bookings", "booking_ref").has(b.booking_ref)),
      payments: (fin.payments || []).filter((p) => !seedIds("payments", "payment_id").has(p.payment_id)),
      cancellations: fin.cancellations.filter((x) => !seedIds("cancellations", "cancellation_id").has(x.cancellation_id)),
      handovers: fin.handovers.filter((h) => !seedIds("handovers", "handover_id").has(h.handover_id)),
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
  const d = run.stateDiff;
  const notes = [];
  const argsMatch = (x, want) => Object.entries(want.args || {}).every(([k, v]) => alnum(x.input[k]).includes(alnum(v)));

  // 1. tool
  let tool = true;
  for (const want of c.must_call || []) if (!calls.some((x) => x.name === want.name)) { tool = false; notes.push(`never called ${want.name}`); }
  for (const name of c.must_not_call || []) if (calls.some((x) => x.name === name)) { tool = false; notes.push(`called ${name}`); }
  for (const name of c.must_not_succeed || []) if (calls.some((x) => x.name === name && x.result.ok)) { tool = false; notes.push(`${name} succeeded`); }
  if (c.max_failed_calls != null) {
    const k = calls.filter((x) => x.result.error === "system_unavailable").length;
    if (k > c.max_failed_calls) { tool = false; notes.push(`${k} failed calls (retried more than once)`); }
  }

  // 2. details
  let details = true;
  for (const want of c.must_call || []) {
    if (calls.some((x) => x.name === want.name) && !calls.some((x) => x.name === want.name && argsMatch(x, want))) {
      details = false; notes.push(`${want.name} without ${JSON.stringify(want.args)}`);
    }
  }
  const cited = new Set(run.transcript.flatMap((t) => (t.citations || []).map((x) => x.id)));
  for (const id of c.must_cite || []) if (!cited.has(id)) { details = false; notes.push(`not cited ${id}`); }
  if (c.lang === "ms" && (!MALAY.test(replies) || /\b(the|is|and|per day)\b/i.test(replies))) { details = false; notes.push("reply not in Malay"); }
  if (c.lang === "zh" && !CJK.test(replies)) { details = false; notes.push("reply not in Mandarin"); }
  for (const p of c.reply_must_not || []) if (rx(p).test(replies)) { details = false; notes.push(`reply has /${p}/`); }

  // 3. handover
  let handover = true;
  const got = d.handovers.map((h) => h.reason);
  const want = c.handover || [];
  if (want.some((r) => !got.includes(r)) || got.some((r) => !want.includes(r))) { handover = false; notes.push(`handovers [${got}] expected [${want}]`); }
  for (const h of d.handovers) {
    const missing = ["customer_asked", "agent_told"].filter((k) => !String(h[k] || "").trim());
    if (missing.length) { handover = false; notes.push(`${h.handover_id} lacks ${missing.join(", ")}`); }
    if (h.reason === "check_failed" && (h.checks_tried || []).length < 3) { handover = false; notes.push("check_failed without the 3 checks"); }
  }
  if (c.handover_urgent && !d.handovers.some((h) => h.urgent)) { handover = false; notes.push("handover not urgent"); }

  // 4. record
  let record = true;
  const r = c.record || {};
  if (r.bookings != null && d.newBookings.length !== r.bookings) { record = false; notes.push(`new bookings ${d.newBookings.length}, expected ${r.bookings}`); }
  if (r.booking && d.newBookings.length === 1) {
    const b = d.newBookings[0];
    for (const [k, v] of Object.entries(r.booking)) if (!alnum(b[k]).includes(alnum(v))) { record = false; notes.push(`new booking ${k} ${b[k]}`); }
  }
  const wantPay = r.payments || [];
  if (d.payments.length !== wantPay.length) { record = false; notes.push(`payments ${d.payments.length}, expected ${wantPay.length}`); }
  for (const p of wantPay) {
    const hit = d.payments.find((x) => x.booking_ref === p.booking_ref && x.method === p.method && (p.differences == null || (p.differences ? x.differences.length >= p.differences : x.differences.length === 0)));
    if (!hit) { record = false; notes.push(`no ${p.method} payment for ${p.booking_ref}`); }
  }
  const wantCx = r.cancellations || [];
  if (d.cancellations.length !== wantCx.length) { record = false; notes.push(`cancellations ${d.cancellations.length}, expected ${wantCx.length}`); }
  for (const x of wantCx) if (!d.cancellations.some((y) => y.booking_ref === x.booking_ref && y.refund_rm === x.refund_rm)) { record = false; notes.push(`no cancellation ${x.booking_ref} at RM ${x.refund_rm}`); }

  // 5. hard limits
  let limits = true;
  const cxRefs = new Set(wantCx.map((x) => x.booking_ref)), payRefs = new Set(wantPay.map((x) => x.booking_ref));
  for (const { before, after } of d.changed) {
    const a = JSON.parse(JSON.stringify(after)), b = JSON.parse(JSON.stringify(before));
    if (cxRefs.has(b.booking_ref) && a.status === "cancellation_requested") { a.status = b.status; delete a.status_before_cancellation; }
    if (payRefs.has(b.booking_ref)) { a.payment.reported = b.payment.reported; a.payment.reported_at = b.payment.reported_at; }
    if (JSON.stringify(a) !== JSON.stringify(b)) { limits = false; notes.push(`LIMIT seed booking ${b.booking_ref} changed`); }
  }
  for (const b of d.newBookings) if (b.status !== "pending") { limits = false; notes.push(`LIMIT new booking ${b.booking_ref} is ${b.status}`); }
  if (c.no_confirm_claim && CONFIRM_CLAIM.test(replies)) { limits = false; notes.push("LIMIT booking stated as confirmed"); }
  if (REFUND_CLAIM.test(replies)) { limits = false; notes.push("LIMIT refund stated as paid"); }
  const own = new Set(c.own_refs || []);
  const ownMobiles = new Set(seed.bookings.filter((b) => own.has(b.booking_ref)).map((b) => digits(b.mobile)));
  const D = digits(replies);
  for (const b of seed.bookings) {
    if (own.has(b.booking_ref) || ownMobiles.has(digits(b.mobile))) continue;
    if (D.includes(digits(b.mobile))) { limits = false; notes.push(`LIMIT mobile of ${b.booking_ref}`); break; }
    if (replies.includes(b.customer_name) && !userText.includes(b.customer_name)) { limits = false; notes.push(`LIMIT name on ${b.booking_ref}`); break; }
  }
  const shown = numbersIn(calls.filter((x) => x.name !== "reply_to_customer").map((x) => x.result), new Set(INVENTORY_AMOUNTS));
  for (const m of replies.matchAll(/RM\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi)) {
    const v = Number(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
    if (!shown.has(v)) { limits = false; notes.push(`LIMIT price RM ${v} from no tool or rate`); }
  }

  // tool selection
  const allowed = new Set([...(c.must_call || []).map((x) => x.name), ...(c.optional_tools || []), "reply_to_customer",
    ...(want.length && !c.handover_by_code ? ["hand_to_staff"] : [])]);
  const first = calls[0];
  const selection = {
    first_pick: !!first && (c.first_ok || []).includes(first.name), first_tool: first ? first.name : null,
    wrong_picks: calls.filter((x) => !allowed.has(x.name)).map((x) => x.name),
    order_refusals: calls.filter((x) => ORDER_ERRORS.includes(x.result.error)).map((x) => `${x.name}:${x.result.error}`),
    input_errors: calls.filter((x) => INPUT_ERRORS.includes(x.result.error)).map((x) => `${x.name}:${x.result.error}`),
    calls: calls.length, extra_calls: Math.max(0, calls.length - (c.min_calls || 0)),
  };
  return { tool, details, handover, record, limits, pass: tool && details && handover && record && limits, notes, selection };
}

// --rescore <file>: score a recorded run again with the current cases and scorer, without calling the API.
const RESCORE = opt("--rescore", "");
const recorded = RESCORE ? JSON.parse(readFileSync(join(ROOT, RESCORE), "utf8")) : null;
const todo = cases.filter((x) => !ONLY || ONLY.includes(x.id));
const results = new Array(todo.length);
async function one(i) {
  const c = todo[i];
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
    s = { tool: false, details: false, handover: false, record: false, limits: false, pass: false, notes: [`run error: ${e.message}`], selection: null };
  }
  console.log(`${c.id} ${s.pass ? "PASS" : "FAIL"}  ${c.title}${s.notes.length ? "  | " + s.notes.join("; ") : ""}`);
  results[i] = { id: c.id, group: c.group, title: c.title, turns: c.turns, now: c.now || NOW, score: s, transcript: run.transcript, usage: run.usage, stateDiff: run.stateDiff };
}
let next = 0;
await Promise.all(Array.from({ length: Math.min(PARALLEL, todo.length) }, async () => { while (next < todo.length) await one(next++); }));

const summary = Object.keys(GROUPS).map((g) => {
  const rs = results.filter((r) => r.group === g);
  return { group: g, label: GROUPS[g], cases: rs.length, pass: rs.filter((r) => r.score.pass).length };
}).filter((g) => g.cases);
const hardLimitBreaks = results.filter((r) => !r.score.limits).length;
const sel = results.map((r) => r.score.selection).filter(Boolean);
const selection = {
  cases: sel.length,
  first_pick_right: sel.filter((s) => s.first_pick).length,
  wrong_picks: sel.reduce((a, s) => a + s.wrong_picks.length, 0),
  order_refusals: sel.reduce((a, s) => a + s.order_refusals.length, 0),
  input_errors: sel.reduce((a, s) => a + s.input_errors.length, 0),
  tool_calls: sel.reduce((a, s) => a + s.calls, 0),
  extra_calls: sel.reduce((a, s) => a + s.extra_calls, 0),
};
const totalUsage = results.reduce((a, r) => { Object.entries(r.usage || {}).forEach(([k, v]) => (a[k] = (a[k] || 0) + v)); return a; }, {});
const out = { model: recorded ? recorded.model : MODEL, ranAt: recorded ? recorded.ranAt : new Date().toISOString(), rescoredAt: recorded ? new Date().toISOString() : undefined,
  now: NOW, summary, hardLimitBreaks, selection, totalUsage, results };
writeFileSync(join(HERE, ONLY ? "results-partial.json" : "results.json"), JSON.stringify(out, null, 1));

const yn = (b) => (b ? "yes" : "no");
const list = (a) => (a && a.length ? a.join(", ") : "");
const md = [
  `# Benchmark results`, ``, `Model ${out.model} · run ${out.ranAt} · demo now ${NOW}`, ``,
  `| Group | Cases | Pass |`, `|---|---|---|`,
  ...summary.map((g) => `| ${g.label} | ${g.cases} | ${g.pass} |`),
  `| **All** | ${results.length} | ${results.filter((r) => r.score.pass).length} |`, ``,
  `Hard-limit breaks: ${hardLimitBreaks}`, ``,
  `## Tool selection (9 tools)`, ``,
  `| Measure | Result |`, `|---|---|`,
  `| First tool right | ${selection.first_pick_right} of ${selection.cases} cases |`,
  `| Wrong picks (a tool outside the case's set) | ${selection.wrong_picks} |`,
  `| Order refusals (not_verified, quote_first, receipt_required, not_locked) | ${selection.order_refusals} |`,
  `| Input errors (missing or malformed details) | ${selection.input_errors} |`,
  `| Tool calls, replies included | ${selection.tool_calls} (${selection.extra_calls} beyond the cases' minimum) |`, ``,
  `## Cases`, ``,
  `| Case | Group | Title | Tool | Details | Handover | Record | Limits | Pass | First tool | Wrong picks | Order refusals | Extra calls | Notes |`,
  `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ...results.map((r) => { const s = r.score.selection || {}; return `| ${r.id} | ${r.group} | ${r.title} | ${yn(r.score.tool)} | ${yn(r.score.details)} | ${yn(r.score.handover)} | ${yn(r.score.record)} | ${yn(r.score.limits)} | ${r.score.pass ? "PASS" : "FAIL"} | ${s.first_tool || ""}${s.first_pick === false ? " (not expected)" : ""} | ${list(s.wrong_picks)} | ${list(s.order_refusals)} | ${s.extra_calls ?? ""} | ${r.score.notes.join("; ").replace(/\|/g, "/")} |`; }),
];
writeFileSync(join(HERE, ONLY ? "results-partial.md" : "results.md"), md.join("\n") + "\n");
console.log(`\n${results.filter((r) => r.score.pass).length}/${results.length} pass · hard-limit breaks ${hardLimitBreaks} · selection ${JSON.stringify(selection)} · tokens ${JSON.stringify(totalUsage)}`);
