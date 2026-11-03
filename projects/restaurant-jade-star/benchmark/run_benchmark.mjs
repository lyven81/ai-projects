// The Jade Star benchmark: the 20 cases of cases.json (the Answer Key) on Claude Haiku 5.5.
//
// Each case gets a fresh copy of the sample data, a fresh booking module on its own fixed clock and code seed, and a
// fresh desk (tools.js, the same code the MCP server serves):
//   form (case 1)       the form calls the booking module directly, no AI
//   chat (cases 2-12)   each message through agent.js
//   A2A (cases 13-15)   a fresh A2A server around the assistant; the sample customer agent (Haiku 5.5) as the
//                       A2A client over JSON-RPC; the A2A message log saved for the published replay
//   confirm (16-20)     the customer's own click on the confirmation screen, starting from the state case 1, 2,
//                       13, 3 or 4 left (those run first; group d never runs on its own)
// Scored by score.js from the tool log, the A2A message log and the data. Writes benchmark/<out>.json (full
// transcripts, for the demo replay), <out>.md, and a2a_logs/<out>-case-N.json, with results per group and
// summary.usage_by_model for the spend ledger.
//
//   node benchmark/run_benchmark.mjs [--sample] [--only 2,13] [--rescore] [--parallel 4] [--out results]
//   --sample   cases 2, 13 and 8 (cases.json "sample"), written to sample.json
//   --only     these case IDs; a group d case runs its setup case first, unscored
//   --rescore  scores an existing <out>.json again with no API call
// Refuses any case ID outside 1 to 20. Needs ANTHROPIC_API_KEY (read from ~/.env when not set), except --rescore.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startA2AServer, STATE_NAME, partsData } from "../a2a/server.mjs";
import { runCustomerAgent } from "../a2a/customer_agent.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const require = createRequire(import.meta.url);
const B = require(join(ROOT, "lib", "booking.js"));
const T = require(join(ROOT, "tools.js"));
const A = require(join(ROOT, "agent.js"));
const P = require(join(ROOT, "prompt.js"));
const { score } = require(join(HERE, "score.js"));

const ALLOWED = Array.from({ length: 20 }, (_, i) => i + 1);
const CONFIG = JSON.parse(readFileSync(join(ROOT, "resources", "restaurant.json"), "utf8"));
const DOC = JSON.parse(readFileSync(join(HERE, "cases.json"), "utf8"));
const SEED = readFileSync(join(ROOT, "data", "state.json"), "utf8");
const CUSTOMERS = JSON.parse(readFileSync(join(ROOT, "data", "customers.json"), "utf8"));
const A2A_REQ = JSON.parse(readFileSync(join(ROOT, "data", "a2a_requests.json"), "utf8"));
const RESOURCES = CONFIG.resources.map((r) => Object.assign({ text: readFileSync(join(ROOT, "resources", r.file), "utf8") }, r));

if (JSON.stringify(DOC.cases.map((c) => c.id)) !== JSON.stringify(ALLOWED)) { console.error("cases.json must hold exactly cases 1 to 20. Refused."); process.exit(2); }

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SAMPLE = argv.includes("--sample");
const OUT = opt("--out", SAMPLE ? "sample" : "results");
const PARALLEL = Number(opt("--parallel", "4"));
const only = opt("--only", null);
let wanted = ALLOWED.slice();
if (SAMPLE) wanted = DOC.sample.slice();
if (only) {
  const ids = only.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = ids.filter((s) => !/^\d+$/.test(s) || !ALLOWED.includes(Number(s)));
  if (bad.length) { console.error(`Refused: case IDs outside 1 to 20: ${bad.join(", ")}. The benchmark holds exactly cases 1 to 20.`); process.exit(2); }
  wanted = ids.map(Number);
}
const byId = (id) => DOC.cases.find((c) => c.id === id);
const others = (c) => {
  const mine = c.route === "confirm" ? byId(c.depends_on).customer : c.customer;
  const seeded = JSON.parse(SEED).bookings.map((b) => ({ name: b.name, phone: b.phone }));
  return Object.values(CUSTOMERS).filter((x) => x.phone !== mine.phone).concat(seeded);
};
const env = (c) => ({ config: CONFIG, others: others(c) });

function write(summary, results) {
  writeFileSync(join(HERE, `${OUT}.json`), JSON.stringify({ summary, results }, null, 1));
  const md = [`# Jade Star benchmark: ${OUT}`, "", `Run ${summary.date}, test clock ${summary.today}. Model: ${summary.model} (assistant and sample customer agent).`, "",
    `- Cases passed: ${summary.passed} of ${summary.runs}`, `- Hard-limit breaches: ${summary.hard_limit_breaches}`,
    `- By group: ${Object.entries(summary.by_group).map(([g, v]) => `${g} ${v.passed} of ${v.runs}`).join("; ")}`,
    `- Failure labels: ${Object.entries(summary.labels).map(([k, v]) => `${k} ${v}`).join("; ") || "none"}`, "",
    "| Case | Group | Pass | Label | Failed checks | Tool log | Reply (last) |", "|---|---|---|---|---|---|---|"];
  for (const r of results) {
    const fails = Object.entries(r.score.checks).filter(([, v]) => !v).map(([k]) => k).concat(Object.entries(r.score.limits).filter(([, v]) => !v).map(([k]) => "LIMIT " + k));
    const tools = (r.events || []).map((e) => `${e.tool}:${e.result.status}${e.result.error ? ":" + e.result.error.code : ""}`).join(", ") || (r.confirm ? `confirm:${r.confirm.ok ? "ok" : r.confirm.error.code}` : r.form ? `form:${r.form.ok ? "held" : r.form.error.code}` : "");
    const last = (r.turns || []).slice(-1)[0];
    md.push(`| ${r.id} ${r.type} | ${r.group} | ${r.score.pass ? "yes" : "no"} | ${r.score.label || ""} | ${r.error ? "error: " + r.error : fails.join("; ")} | ${tools} | ${((last && last.reply) || "").replace(/\n/g, " / ").replace(/\|/g, "/")} |`);
  }
  writeFileSync(join(HERE, `${OUT}.md`), md.join("\n") + "\n");
}

function summarise(results, extra) {
  const by_group = {}, labels = {};
  for (const r of results) {
    const g = (by_group[r.group] = by_group[r.group] || { runs: 0, passed: 0 });
    g.runs++; if (r.score.pass) g.passed++;
    if (r.score.label) labels[r.score.label] = (labels[r.score.label] || 0) + 1;
  }
  const usage = results.reduce((a, r) => { for (const [k, v] of Object.entries(r.usage || {})) a[k] = (a[k] || 0) + v; return a; }, {});
  return Object.assign({ date: new Date().toISOString(), today: DOC.today, model: A.MODEL, runs: results.length, passed: results.filter((r) => r.score.pass).length,
    hard_limit_breaches: results.reduce((a, r) => a + Object.values(r.score.limits).filter((v) => !v).length, 0), by_group, labels, usage, usage_by_model: { [A.MODEL]: usage } }, extra || {});
}

if (argv.includes("--rescore")) {
  const prev = JSON.parse(readFileSync(join(HERE, `${OUT}.json`), "utf8"));
  for (const r of prev.results) r.score = score(byId(r.id), r, env(byId(r.id)));
  const s = summarise(prev.results, { rescored_from: prev.summary.date, usage: prev.summary.usage, usage_by_model: prev.summary.usage_by_model });
  write(s, prev.results);
  console.log(`Rescored ${OUT}.json: ${s.passed} of ${s.runs} passed, ${s.hard_limit_breaches} hard-limit breaches.`);
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const line = readFileSync(join(homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch (e) { /* no ~/.env */ }
}
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const add = (u, x) => { for (const [k, v] of Object.entries(x || {})) u[k] = (u[k] || 0) + v; return u; };
const nowLabel = (t) => `${B.dateLabel(B.iso(t).slice(0, 10))}, ${(() => { const d = new Date(t); const h = d.getUTCHours(), m = d.getUTCMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`; })()}`;
const snap = (st) => JSON.parse(JSON.stringify(st));

function world(c) {
  const clock = { t: B.ms(c.clock || DOC.today) };
  const booking = B.createBooking({ config: CONFIG, state: JSON.parse(SEED), clock: () => clock.t, random: B.seeded(1000 + c.id) });
  if (c.service_down) booking.flags.serviceDown = true;
  return { clock, booking, desk: T.createDesk({ booking }) };
}

const contexts = {}; // case ID -> the world it left, for group d
async function runBase(c) {
  const w = world(c);
  const t0 = Date.now();
  const usage = {};
  const r = { id: c.id, group: c.group, type: c.type, title: c.shown, route: c.route, clock: c.clock || DOC.today };
  try {
    if (c.route === "form") {
      const res = T.submitForm(w.booking, c.form, c.customer);
      r.form = { ok: res.ok, data: res.data || null, error: res.error || null };
      r.events = []; r.turns = [];
    } else if (c.route === "chat") {
      const s = w.desk.newSession({ conversation: `case-${c.id}`, name: c.customer.name, phone: c.customer.phone, route: "Chat" });
      const system = P.system(RESOURCES, CONFIG, { now: nowLabel(w.clock.t), route: "Chat" });
      const tools = Object.entries(w.desk.TOOLS).map(([name, x]) => Object.assign({ name }, x));
      const messages = [];
      r.turns = [];
      for (let i = 0; i < c.turns.length; i++) {
        s.turn = i + 1; s.last_message = c.turns[i];
        messages.push({ role: "user", content: c.turns[i] });
        const out = await A.runTurn({ apiKey: API_KEY, system, tools, messages, first: i === 0, callTool: (n, x) => w.desk.call(s, n, x) });
        add(usage, out.usage);
        r.turns.push({ message: c.turns[i], reply: out.reply, stoppedBy: out.stoppedBy, fixesLeft: out.fixesLeft, reworded: out.reworded, sentBack: out.sentBack, trace: out.trace });
      }
      r.events = s.events;
    } else if (c.route === "a2a") {
      const system = P.system(RESOURCES, CONFIG, { now: nowLabel(w.clock.t), route: "A2A agent" });
      const srv = await startA2AServer({ booking: w.booking, desk: w.desk, apiKey: API_KEY, system });
      w.srv = srv;
      const q = A2A_REQ[c.id];
      const ca = await runCustomerAgent({ url: srv.url, person: q.person, request: q.request, facts: q.facts, apiKey: API_KEY });
      w.client = ca.client; w.taskId = ca.task.id;
      add(usage, ca.usage);
      const conv = [...srv.convs.values()][0];
      r.turns = (conv && conv.turns) || [];
      r.turns.forEach((x) => add(usage, x.usage));
      r.events = conv ? conv.session.events : [];
      r.a2a = { exchanges: ca.exchanges, task_id: ca.task.id, customer_agent_usage: ca.usage };
      r.a2a_log = srv.log.slice();
    }
  } catch (e) {
    r.error = String((e && e.message) || e);
    r.events = r.events || []; r.turns = r.turns || [];
  }
  r.state = snap(w.booking.state);
  r.usage = usage; r.ms = Date.now() - t0;
  r.score = score(c, r, env(c));
  contexts[c.id] = w;
  return r;
}

async function runConfirm(c) {
  const w = contexts[c.depends_on];
  const dep = byId(c.depends_on);
  const r = { id: c.id, group: c.group, type: c.type, title: c.shown, route: c.route, depends_on: c.depends_on, events: [], turns: [], usage: {} };
  const t0 = Date.now();
  try {
    if (!w) throw new Error(`setup case ${c.depends_on} did not run`);
    const p = w.booking.state.proposals.find((x) => x.status === "held" && B.digits(x.phone) === B.digits(dep.customer.phone));
    if (!p) throw new Error(`case ${c.depends_on} left no held booking to confirm`);
    r.proposal_ref = p.ref;
    w.clock.t = B.ms(p.created_at) + c.confirm.after_minutes * 60000;
    const code = c.confirm.code === "right" ? p.code : String((Number(p.code) + 111111 - 100000) % 900000 + 100000);
    r.code_entered = c.confirm.code; r.at = B.iso(w.clock.t);
    r.confirm = w.booking.confirm(p.ref, code);
    if (w.srv) {
      await new Promise((res) => setTimeout(res, 100));
      const task = await w.client.getTask({ id: w.taskId });
      r.task_after = STATE_NAME[task.status.state];
      const d = partsData(task.status.message && task.status.message.parts);
      r.task_booking_number = d && d.booking_number;
      r.a2a_log = w.srv.log.slice();
    }
  } catch (e) { r.error = String((e && e.message) || e); }
  r.state = w ? snap(w.booking.state) : null;
  r.ms = Date.now() - t0;
  r.score = score(c, r, env(c));
  return r;
}

(async () => {
  const started = Date.now();
  const scored = new Set(wanted);
  const base = new Set(wanted.filter((id) => byId(id).route !== "confirm"));
  wanted.filter((id) => byId(id).route === "confirm").forEach((id) => base.add(byId(id).depends_on));
  const baseList = [...base].sort((a, b) => a - b).map(byId);
  const results = [];
  const show = (r) => {
    const fails = Object.entries(r.score.checks).filter(([, v]) => !v).map(([k]) => k).concat(Object.entries(r.score.limits).filter(([, v]) => !v).map(([k]) => "LIMIT " + k));
    console.log(`${r.score.pass ? "PASS" : "FAIL"} ${r.id} ${r.type}${scored.has(r.id) ? "" : " (setup, not scored)"} (${(r.ms / 1000).toFixed(1)} s)${r.score.label ? "  " + r.score.label : ""}${r.error ? "  ERROR " + r.error : ""}${fails.length ? "  [" + fails.join(", ") + "]" : ""}`);
    (r.turns || []).forEach((x) => console.log(`     ${x.reply.replace(/\n/g, " / ")}`));
  };
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, baseList.length) }, async () => {
    while (next < baseList.length) { const r = await runBase(baseList[next++]); show(r); if (scored.has(r.id)) results.push(r); }
  }));
  for (const id of wanted.filter((x) => byId(x).route === "confirm").sort((a, b) => a - b)) { const r = await runConfirm(byId(id)); show(r); results.push(r); }
  for (const w of Object.values(contexts)) if (w.srv) await w.srv.close();
  results.sort((a, b) => a.id - b.id);
  mkdirSync(join(HERE, "a2a_logs"), { recursive: true });
  for (const r of results) if (r.a2a_log) writeFileSync(join(HERE, "a2a_logs", `${OUT}-case-${r.id}.json`), JSON.stringify({ case: r.id, log: r.a2a_log, exchanges: r.a2a ? r.a2a.exchanges : null }, null, 1));
  const s = summarise(results, { wall_ms: Date.now() - started, sample: SAMPLE, only: only || null });
  write(s, results);
  console.log(`\n${s.passed} of ${s.runs} passed; ${s.hard_limit_breaches} hard-limit breaches; by group ${JSON.stringify(s.by_group)}; usage ${JSON.stringify(s.usage)}; wrote benchmark/${OUT}.json and .md`);
})();
