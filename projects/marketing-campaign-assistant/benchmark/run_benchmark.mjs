// Benchmark runner: 24 scenarios plus the consistency run, on Claude Haiku 5.5 (config.json).
//   node benchmark/run_benchmark.mjs --sample        the founder's 3-case sample (one per kind of path)
//   node benchmark/run_benchmark.mjs --only=V6,U1    rerun chosen cases after a fix
//   node benchmark/run_benchmark.mjs                 the full run (the gate asks the founder first)
//   node benchmark/run_benchmark.mjs --rescore=FILE  score a recorded run again, no API call
// Each case gets a fresh desk (its own clock, plan copy and figure memory) and runs about 5 at a time.
// Needs ANTHROPIC_API_KEY (read from ~/.env when unset); the key is never written to the results.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, makeDesk, memoryStore, loadConfig } from "../lib/load.mjs";
import { loadKey } from "../lib/env.mjs";
import { scoreCase, figureSignature } from "./score.mjs";

const require = createRequire(import.meta.url);
const Agent = require(path.join(ROOT, "agent.js"));
const Prompt = require(path.join(ROOT, "prompt.js"));
const B = path.join(ROOT, "benchmark");
const KEY = JSON.parse(fs.readFileSync(path.join(B, "answer-key.json"), "utf8"));
const { cases, consistency } = JSON.parse(fs.readFileSync(path.join(B, "cases.json"), "utf8"));
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "plan.seed.json"), "utf8"));
const res = (n) => fs.readFileSync(path.join(ROOT, "resources", n), "utf8");
const RESOURCES = { businessProfile: res("business-profile.md"), metricDefinitions: res("metric-definitions.md"),
  reviewPolicy: res("review-policy.md"), planningRules: res("planning-rules.md") };
const SAMPLE = ["F1", "V10", "V8"];

const arg = (n) => (process.argv.find((a) => a.startsWith(`--${n}`)) || "").split("=")[1];
const flag = (n) => process.argv.some((a) => a === `--${n}` || a.startsWith(`--${n}=`));

function summarise(results, sig, kind, usageByModel, fallbacks) {
  const scored = results.map((r) => r.score);
  const byGroup = {};
  for (const s of scored) { byGroup[s.group] = byGroup[s.group] || { passed: 0, total: 0 }; byGroup[s.group].total++; if (s.pass) byGroup[s.group].passed++; }
  const gates = { wrong_calculation: 0, invented_figure: 0, approval_bypass: 0 };
  for (const s of scored) for (const g of Object.keys(gates)) gates[g] += s.gates[g].length;
  return { kind, passed: scored.filter((s) => s.pass).length, total: scored.length, by_group: byGroup, gates,
    consistency: sig, usage_by_model: usageByModel, tool_choice_fallbacks: fallbacks,
    tool_calls: results.reduce((a, r) => a + r.run.trace.length, 0), reply_fixes: results.reduce((a, r) => a + r.run.turns.reduce((b, t) => b + t.fixes, 0), 0) };
}

// R1: the same question in a fresh session gives the same figures. Every figure quoted in both runs has the same
// value, and both quote the case's required figures; a reply may quote an extra figure.
function consistencyOf(runA, runB) {
  const a = figureSignature(runA), b = figureSignature(runB);
  const va = Object.fromEntries(a.map((x) => x.split("="))), vb = Object.fromEntries(b.map((x) => x.split("=")));
  const differ = Object.keys(va).filter((k) => k in vb && va[k] !== vb[k]);
  const need = (cases.find((c) => c.id === consistency.of).expect.figures || []).map((f) => f.id);
  const missing = need.filter((id) => !(id in va) || !(id in vb));
  return { identical: !differ.length && !missing.length, same_set: JSON.stringify(a) === JSON.stringify(b), differ, missing, first: a, second: b };
}

if (flag("rescore")) {
  const file = path.resolve(arg("rescore"));
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const r of d.results) { r.score = scoreCase(cases.find((c) => c.id === (r.case_id || r.id)), r.run, KEY); if (r.id === consistency.id) r.score.group = "Consistency"; }
  const r1 = d.results.find((r) => r.id === consistency.id);
  if (r1) d.summary.consistency = consistencyOf(d.results.find((r) => r.id === consistency.of).run, r1.run);
  d.summary = Object.assign(d.summary, summarise(d.results.filter((r) => r.id !== consistency.id), d.summary.consistency, d.summary.kind, d.summary.usage_by_model, d.summary.tool_choice_fallbacks));
  fs.writeFileSync(file, JSON.stringify(d, null, 1));
  console.log(`rescored ${path.basename(file)}: ${d.summary.passed}/${d.summary.total}`);
  process.exit(0);
}

const apiKey = loadKey();
if (!apiKey) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }
const config = loadConfig();
const model = config.model;
const only = arg("only") ? arg("only").split(",") : null;
const kind = flag("sample") ? "sample" : only ? "only" : "full";
let todo = kind === "sample" ? cases.filter((c) => SAMPLE.includes(c.id)) : only ? cases.filter((c) => only.includes(c.id)) : cases.slice();
const runs = todo.map((c) => ({ cs: c, tag: c.id }));
if (kind === "full") runs.push({ cs: cases.find((c) => c.id === consistency.of), tag: consistency.id });

const usageByModel = { [model]: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
const state = { anyUnsupported: false, fallbacks: 0 };

async function runCase({ cs, tag }) {
  const plan0 = cs.plan === "seed" ? SEED : { changes: [] };
  const store = memoryStore(plan0);
  const lines = [];
  const desk = makeDesk({ config: loadConfig(Object.assign({ today: cs.clock }, cs.targets ? { owner_targets: cs.targets } : {})), store, logLines: lines });
  const callTool = async (name, input) => (cs.fail_tool === name
    ? { ok: false, error: { category: "unavailable", message: "The figures service is not responding.", retryable: true } }
    : desk.call(name, input));
  const system = Prompt.buildSystem({ resources: RESOURCES, today: cs.clock });
  const messages = [], trace = [], turns = [];
  const t0 = Date.now();
  for (const text of cs.turns) {
    messages.push({ role: "user", content: text });
    try {
      const out = await Agent.runTurn({ apiKey, model, system, tools: desk.tools, messages, callTool, trace, state });
      for (const k of Object.keys(usageByModel[model])) usageByModel[model][k] += out.usage[k] || 0;
      turns.push({ owner: text, reply: out.reply, stopped_by: out.stoppedBy, fixes: out.fixes,
        steps: out.steps.map((s) => (s.type === "tool" ? { type: "tool", name: s.name, input: s.input, ok: s.result.ok, error: s.result.ok ? null : s.result.error.category } : s)) });
    } catch (e) { turns.push({ owner: text, reply: "", error: String(e.message).slice(0, 200), fixes: 0, steps: [] }); }
  }
  const run = { trace, turns, tool_log: lines, plan_before: plan0, plan_after: store.load(), seconds: Math.round((Date.now() - t0) / 1000) };
  return { id: tag, case_id: cs.id, run, score: scoreCase(cs, run, KEY) };
}

async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); process.stdout.write(`${items[k].tag} `); } }));
  return out;
}

const results = await pool(runs, 5, runCase);
console.log("");
let sig = null;
const r1 = results.find((r) => r.id === consistency.id);
if (r1) { r1.score.group = "Consistency";
  sig = consistencyOf(results.find((r) => r.id === consistency.of).run, r1.run); }
const main = results.filter((r) => r.id !== consistency.id);
const summary = summarise(main, sig, kind, usageByModel, state.fallbacks);
summary.model = model; summary.cases = main.map((r) => r.id);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(B, `${kind === "sample" ? "sample" : "results"}-${kind}-${stamp}.json`);
fs.writeFileSync(file, JSON.stringify({ summary, results }, null, 1));
for (const r of main) console.log(`${r.id} ${r.score.pass ? "PASS" : "FAIL"} ${r.score.title}${r.score.pass ? "" : "  | " + [...r.score.tool_log.problems, ...r.score.reply_check.problems, ...Object.values(r.score.gates).flat()].slice(0, 3).join(" | ")}`);
if (sig) console.log(`R1 consistency: ${sig.identical ? "identical" : "DIFFERENT"}`);
console.log(`${summary.passed}/${summary.total} passed; gates ${JSON.stringify(summary.gates)}; ${path.basename(file)}`);
