/* The Happy Mart benchmark: the 26 cases of cases.json (the Answer Key), 3 runs each, on Sonnet 5.5 (router
 * and specialists) and Haiku 5.5 (synthesis).
 *
 * Each run: a fresh copy of the data, a fresh desk with the case's faults, one customer message through
 * agent.js. Runs in process: the desk in tools.js is the same code the MCP server serves. Scored by
 * harness.score from the tool log and the structured answers, never the reply wording. Writes
 * benchmark/<out>.json (full transcripts and hook records, used by the desk replay) and <out>.md.
 *
 * Needs ANTHROPIC_API_KEY (read from ~/.env when not set).
 *   node benchmark/run_benchmark.js [--sample] [--only C01,C16] [--runs 3] [--parallel 4] [--out results]
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const H = require("./harness.js");
const { createDesk, memoryStore } = require(path.join(H.ROOT, "tools.js"));
const { createAgents, MODELS, EFFORT } = require(path.join(H.ROOT, "agent.js"));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Number(opt("--runs", argv.includes("--sample") ? "1" : "3"));
const PARALLEL = Number(opt("--parallel", "4"));
const OUT = opt("--out", argv.includes("--sample") ? "sample" : "results");

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch (e) { /* no ~/.env */ }
}
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

let cases = H.CASES.cases;
if (argv.includes("--sample")) cases = cases.filter((c) => H.CASES.sample.includes(c.id));
const only = opt("--only", null);
if (only) { const want = new Set(only.split(",")); cases = cases.filter((c) => want.has(c.id)); }
const DATA = H.loadData();

async function runCase(c, run) {
  const store = memoryStore(DATA);
  let desk, agents;
  agents = createAgents({ apiKey: API_KEY, desk: () => desk, resources: H.RESOURCES });
  desk = createDesk(store, H.TABLES, H.CLAUSES, { now: H.TABLES.now, faults: c.faults,
    runSpecialist: agents.runSpecialist, runSynthesis: agents.runSynthesis });
  const session = desk.newSession();
  const t0 = Date.now();
  try {
    const out = await agents.runTurn(session, c.message);
    const s = H.score(c, out.turn);
    return { id: c.id, run, group: c.group, title: c.title, message: c.message, reply: out.reply, sent: out.sent, stoppedBy: out.stoppedBy,
      score: s, usage: out.usage, events: out.turn.events, specialists: out.turn.specialists, handovers: out.turn.handovers,
      blocked: out.turn.blocked, drafts: out.turn.drafts,
      written: { requests: store.get("requests"), claims: store.get("claims"), handovers: store.get("handovers") } };
  } catch (e) {
    return { id: c.id, run, group: c.group, title: c.title, message: c.message, error: String(e.message || e), ms: Date.now() - t0,
      events: session.turn ? session.turn.events : [], score: { pass: false, checks: {}, limits: {}, metrics: {} } };
  }
}

(async () => {
  const jobs = [];
  for (const c of cases) for (let r = 1; r <= RUNS; r++) jobs.push([c, r]);
  const results = [];
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, async () => {
    while (next < jobs.length) {
      const [c, r] = jobs[next++];
      const res = await runCase(c, r);
      results.push(res);
      const m = res.score.metrics || {};
      const fails = Object.entries(res.score.checks || {}).filter(([, v]) => !v).map(([k]) => k)
        .concat(Object.entries(res.score.limits || {}).filter(([, v]) => !v).map(([k]) => `LIMIT ${k}`));
      console.log(`${res.score.pass ? "PASS" : "FAIL"} ${c.id} run ${r} ${c.title}  ${m.time_ms ? (m.time_ms.total / 1000).toFixed(1) + "s" : ""}  blocked ${m.first_drafts_blocked || 0}${res.error ? "  ERROR " + res.error : ""}${fails.length ? "  [" + fails.join(", ") + "]" : ""}`);
    }
  }));
  results.sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run);
  const passed = results.filter((r) => r.score.pass).length;
  const breaches = results.reduce((a, r) => a + Object.values(r.score.limits || {}).filter((v) => !v).length, 0);
  const blocked = results.reduce((a, r) => a + ((r.score.metrics || {}).first_drafts_blocked || 0), 0);
  const times = results.filter((r) => r.score.metrics && r.score.metrics.time_ms).map((r) => r.score.metrics.time_ms.total).sort((a, b) => a - b);
  const median = times.length ? times[Math.floor(times.length / 2)] : null;
  const usage = results.reduce((a, r) => { for (const [k, v] of Object.entries(r.usage || {})) a[k] = (a[k] || 0) + v; return a; }, {});
  const summary = { date: new Date().toISOString(), today: H.CASES.today, models: MODELS, effort: EFFORT, runs: results.length, passed,
    hard_limit_breaches: breaches, first_drafts_blocked: blocked, replies_with_unsupported_claim_sent: results.filter((r) => r.score.limits && r.score.limits["No reply sent past a block"] === false).length,
    median_ms: median, slowest_ms: times[times.length - 1] || null, usage, wall_ms: Date.now() - started };
  fs.writeFileSync(path.join(__dirname, `${OUT}.json`), JSON.stringify({ summary, results }, null, 1));

  const md = [`# Happy Mart benchmark: ${OUT}`, "", `Run ${summary.date}, test calendar ${summary.today}. Models: ${MODELS.router} (router, effort ${EFFORT.router}), ${MODELS.specialist} (specialists, effort ${EFFORT.specialist}), ${MODELS.synthesis} (synthesis).`, "",
    `- Runs passed: ${passed} of ${results.length}`, `- Hard-limit breaches: ${breaches}`, `- First drafts blocked by the pre-send check: ${blocked} (replies that would have reached a customer without it); replies with an unsupported claim sent: ${summary.replies_with_unsupported_claim_sent}`,
    `- Time to reply: median ${(median / 1000).toFixed(1)} s, slowest ${(summary.slowest_ms / 1000).toFixed(1)} s`, "",
    "| Case | Run | Group | Pass | Failed checks | Blocked drafts | Time (s) | Specialists (s) | Reply |", "|---|---|---|---|---|---|---|---|---|"];
  for (const r of results) {
    const m = r.score.metrics || {};
    const fails = Object.entries(r.score.checks || {}).filter(([, v]) => !v).map(([k]) => k).concat(Object.entries(r.score.limits || {}).filter(([, v]) => !v).map(([k]) => k));
    md.push(`| ${r.id} | ${r.run} | ${r.group} | ${r.score.pass ? "yes" : "no"} | ${r.error ? "error: " + r.error.replace(/\|/g, "/") : fails.join("; ")} | ${m.first_drafts_blocked || 0} | ${m.time_ms ? (m.time_ms.total / 1000).toFixed(1) : ""} | ${m.time_ms ? (m.time_ms.specialists / 1000).toFixed(1) : ""} | ${(r.reply || "").replace(/\n/g, " ").replace(/\|/g, "/")} |`);
  }
  fs.writeFileSync(path.join(__dirname, `${OUT}.md`), md.join("\n") + "\n");
  console.log(`\n${passed} of ${results.length} passed; ${breaches} hard-limit breaches; ${blocked} first drafts blocked; median ${(median / 1000).toFixed(1)} s; wrote benchmark/${OUT}.json and .md`);
})();
