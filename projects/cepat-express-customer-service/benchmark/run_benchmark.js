/* The Cepat Express benchmark: the 19 cases of cases.json (the Answer Key) on Claude Haiku 5.5.
 *
 * Each case: a fresh copy of the sample data and a fresh desk (tools.js, the same code the MCP server serves), the
 * customer message through agent.js, then scored by harness.score from the tool log and the data. Cases run in
 * parallel (5 at a time). Writes benchmark/<out>.json (full transcripts, used by the demo page replay) and <out>.md,
 * with summary.usage_by_model for the spend ledger and results per group.
 *
 *   node benchmark/run_benchmark.js [--sample] [--only C01,C04] [--rescore] [--parallel 5] [--out results]
 *   --sample   the three cases in cases.json "sample" (one per kind of path), written to sample.json
 *   --rescore  scores an existing <out>.json again with no API call
 * Needs ANTHROPIC_API_KEY (read from ~/.env when not set), except --rescore.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const H = require("./harness.js");
const { createDesk, memoryStore, TOOLS } = require(path.join(H.ROOT, "tools.js"));
const A = require(path.join(H.ROOT, "agent.js"));
const P = require(path.join(H.ROOT, "prompt.js"));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const SAMPLE = argv.includes("--sample");
const OUT = opt("--out", SAMPLE ? "sample" : "results");
const PARALLEL = Number(opt("--parallel", "5"));
const only = opt("--only", null);

let cases = H.CASES.cases;
if (SAMPLE) cases = cases.filter((c) => H.CASES.sample.includes(c.id));
if (only) { const want = new Set(only.split(",")); cases = cases.filter((c) => want.has(c.id)); }

function write(summary, results) {
  fs.writeFileSync(path.join(__dirname, `${OUT}.json`), JSON.stringify({ summary, results }, null, 1));
  const md = [`# Cepat Express benchmark: ${OUT}`, "", `Run ${summary.date}, system today ${summary.today}. Model: ${summary.model}.`, "",
    `- Cases passed: ${summary.passed} of ${summary.runs}`, `- Hard-limit breaches: ${summary.hard_limit_breaches}`,
    `- By group: ${Object.entries(summary.by_group).map(([g, v]) => `${g} ${v.passed} of ${v.runs}`).join("; ")}`,
    `- Failure labels: ${Object.entries(summary.labels).map(([k, v]) => `${k} ${v}`).join("; ") || "none"}`,
    ...(summary.merged ? [`- Merged: ${summary.merged.note} First run: ${summary.merged.first_run}.`] : []), "",
    "| Case | Group | Pass | Label | Failed checks | Tools | Reply |", "|---|---|---|---|---|---|---|"];
  for (const r of results) {
    const fails = Object.entries(r.score.checks).filter(([, v]) => !v).map(([k]) => k).concat(Object.entries(r.score.limits).filter(([, v]) => !v).map(([k]) => "LIMIT " + k));
    md.push(`| ${r.id} ${r.title} | ${r.group} | ${r.score.pass ? "yes" : "no"} | ${r.score.label || ""} | ${r.error ? "error: " + r.error : fails.join("; ")} | ${r.score.metrics.tools.join(", ")} | ${(r.reply || "").replace(/\n/g, " / ").replace(/\|/g, "/")} |`);
  }
  fs.writeFileSync(path.join(__dirname, `${OUT}.md`), md.join("\n") + "\n");
}

function summarise(results, extra) {
  const by_group = {}, labels = {};
  for (const r of results) {
    const g = (by_group[r.group] = by_group[r.group] || { runs: 0, passed: 0 });
    g.runs++; if (r.score.pass) g.passed++;
    if (r.score.label) labels[r.score.label] = (labels[r.score.label] || 0) + 1;
  }
  const usage = results.reduce((a, r) => { for (const [k, v] of Object.entries(r.usage || {})) a[k] = (a[k] || 0) + v; return a; }, {});
  return Object.assign({ date: new Date().toISOString(), today: H.CASES.today, model: A.MODEL, runs: results.length,
    passed: results.filter((r) => r.score.pass).length,
    hard_limit_breaches: results.reduce((a, r) => a + Object.values(r.score.limits).filter((v) => !v).length, 0),
    by_group, labels, usage, usage_by_model: { [A.MODEL]: usage } }, extra || {});
}

if (argv.includes("--rescore")) {
  const file = path.join(__dirname, `${OUT}.json`);
  const prev = JSON.parse(fs.readFileSync(file, "utf8"));
  const data = H.loadData();
  for (const r of prev.results) {
    const c = H.CASES.cases.find((x) => x.id === r.id);
    r.score = H.score(c, { events: r.events, reply: r.reply, handovers: r.handovers, stoppedBy: r.stoppedBy, error: r.error, parcels: data.parcels });
  }
  const s = summarise(prev.results, Object.assign({ rescored_from: prev.summary.date, usage: prev.summary.usage, usage_by_model: prev.summary.usage_by_model },
    prev.summary.merged ? { merged: prev.summary.merged } : {}));
  write(s, prev.results);
  console.log(`Rescored ${OUT}.json: ${s.passed} of ${s.runs} passed, ${s.hard_limit_breaches} hard-limit breaches.`);
  process.exit(0);
}

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch (e) { /* no ~/.env */ }
}
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const DATA = H.loadData();
const SYSTEM = P.system(H.RESOURCES, H.TABLES);
const TOOL_LIST = Object.entries(TOOLS).map(([name, t]) => Object.assign({ name }, t));

async function runCase(c) {
  const store = memoryStore(DATA);
  const desk = createDesk(store, H.TABLES, H.STAFF, { now: H.TABLES.today });
  const session = desk.newSession(c.id);
  const messages = [];
  const usage = {};
  const replies = [];
  const t0 = Date.now();
  let last = null;
  try {
    for (const msg of c.turns || [c.message]) {
      messages.push({ role: "user", content: msg });
      session.last_message = msg;
      last = await A.runTurn({ apiKey: API_KEY, system: SYSTEM, tools: TOOL_LIST, messages, callTool: (n, i) => desk.call(session, n, i) });
      desk.recordReply(session, last.reply);
      for (const [k, v] of Object.entries(last.usage)) usage[k] = (usage[k] || 0) + v;
      replies.push({ customer: msg, reply: last.reply, trace: last.trace });
    }
    const run = { events: session.events, reply: last.reply, handovers: store.get("handovers"), stoppedBy: last.stoppedBy, parcels: DATA.parcels };
    return { id: c.id, group: c.group, title: c.title, message: c.message, reply: last.reply, stoppedBy: last.stoppedBy, sentBack: last.sentBack, reworded: last.reworded,
      turns: replies, events: session.events, handovers: store.get("handovers"), usage, ms: Date.now() - t0, score: H.score(c, run) };
  } catch (e) {
    const run = { events: session.events, reply: null, handovers: store.get("handovers"), error: String(e.message || e), parcels: DATA.parcels };
    return { id: c.id, group: c.group, title: c.title, message: c.message, error: run.error, turns: replies, events: session.events,
      handovers: store.get("handovers"), usage, ms: Date.now() - t0, score: H.score(c, run) };
  }
}

(async () => {
  const results = [];
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(PARALLEL, cases.length) }, async () => {
    while (next < cases.length) {
      const c = cases[next++];
      const r = await runCase(c);
      results.push(r);
      const fails = Object.entries(r.score.checks).filter(([, v]) => !v).map(([k]) => k).concat(Object.entries(r.score.limits).filter(([, v]) => !v).map(([k]) => "LIMIT " + k));
      console.log(`${r.score.pass ? "PASS" : "FAIL"} ${c.id} ${c.title} (${(r.ms / 1000).toFixed(1)} s)${r.score.label ? "  " + r.score.label : ""}${r.error ? "  ERROR " + r.error : ""}${fails.length ? "  [" + fails.join(", ") + "]" : ""}`);
      console.log(`     ${(r.reply || "").replace(/\n/g, " / ")}`);
    }
  }));
  results.sort((a, b) => a.id.localeCompare(b.id));
  const s = summarise(results, { wall_ms: Date.now() - started, sample: SAMPLE, only: only || null });
  write(s, results);
  console.log(`\n${s.passed} of ${s.runs} passed; ${s.hard_limit_breaches} hard-limit breaches; usage ${JSON.stringify(s.usage)}; wrote benchmark/${OUT}.json and .md`);
})();
