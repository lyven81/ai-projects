// Runs the Answer Key scenarios and records every run in full for the replay page.
//   node benchmark/run_benchmark.mjs --smoke          one scenario (B2), writes smoke.json
//   node benchmark/run_benchmark.mjs --sample         A1, C2, B2 on Haiku 5.5, writes sample.json
//   node benchmark/run_benchmark.mjs --only=C2,D3     the named scenarios, writes rerun-<ids>.json
//   node benchmark/run_benchmark.mjs                  the full run: 16 scenarios, plus A1 twice more in parallel
//                                                     and three times sequentially (about 21 runs), results.json
// Needs ANTHROPIC_API_KEY (read from ~/.env when not set). The benchmark gate hook decides whether it may run.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScenario, loadKey } from "../run.mjs";
import { MODEL } from "../agents.mjs";
import { scoreRun } from "./score.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALL = JSON.parse(fs.readFileSync(path.join(HERE, "scenarios.json"), "utf8")).scenarios;
const arg = (k) => process.argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
const only = arg("only")?.split("=")[1]?.split(",").map((s) => s.trim().toUpperCase());
const CONCURRENCY = Number(arg("concurrency")?.split("=")[1] || 4);

let plan, outName;
if (arg("smoke")) { plan = [{ id: "B2", mode: "parallel" }]; outName = "smoke.json"; }
else if (arg("sample")) { plan = ["A1", "C2", "B2"].map((id) => ({ id, mode: "parallel" })); outName = "sample.json"; }
else if (only) {
  // A repeated ID (A1,A1,A1,A1-SEQ,...) is a timing run: numbered, and run one at a time like the full run's.
  const seen = {};
  plan = only.map((raw) => { const mode = raw.endsWith("-SEQ") ? "sequential" : "parallel"; const id = raw.replace(/-SEQ$/, ""); const k = `${id}-${mode}`; seen[k] = (seen[k] || 0) + 1; return { id, mode, k }; });
  plan = plan.map((p) => ({ id: p.id, mode: p.mode, ...(only.filter((x) => x.replace(/-SEQ$/, "") === p.id).length > 1 ? { n: (plan.filter((q) => q.k === p.k).indexOf(p) + 1) } : {}) }));
  outName = arg("out") ? `${arg("out").split("=")[1]}.json` : `rerun-${[...new Set(only)].join("-").toLowerCase()}.json`;
}
else {
  plan = ALL.map((s) => ({ id: s.id, mode: "parallel" }));
  plan.push({ id: "A1", mode: "parallel", n: 2 }, { id: "A1", mode: "parallel", n: 3 }, { id: "A1", mode: "sequential", n: 1 }, { id: "A1", mode: "sequential", n: 2 }, { id: "A1", mode: "sequential", n: 3 });
  outName = "results.json";
}
if (!loadKey()) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const runsDir = path.join(HERE, "runs");
fs.mkdirSync(runsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const results = [];

async function one(p) {
  const scn = ALL.find((s) => s.id === p.id);
  const t0 = Date.now();
  let rec;
  try { rec = await runScenario(scn, { mode: p.mode }); }
  catch (e) { rec = { id: scn.id, mode: p.mode, error: String(e?.stack || e), steps: [], usage_by_model: {}, cost_usd: 0 }; }
  rec.run_id = `${scn.id}-${p.mode === "sequential" ? "seq" : "par"}-${p.n || 1}-${stamp}`;
  rec.fault = scn.fault || null;
  const score = rec.error ? { id: scn.id, mode: p.mode, pass: false, checks: {}, notes: [rec.error.slice(0, 300)] } : scoreRun(rec, scn);
  rec.score = score;
  fs.writeFileSync(path.join(runsDir, `${rec.run_id}.json`), JSON.stringify(rec, null, 1));
  const w = rec.steps[0]?.writing;
  console.log(`${score.pass ? "PASS" : "FAIL"} ${rec.run_id}  ${((Date.now() - t0) / 1000).toFixed(1)}s  USD ${(rec.cost_usd || 0).toFixed(4)}${w ? `  writing ${(w.ms / 1000).toFixed(1)}s overlap ${w.overlap}` : ""}${score.notes.length ? "\n   " + score.notes.join("\n   ") : ""}`);
  results.push({ run_id: rec.run_id, id: scn.id, group: scn.group, title: scn.title, mode: p.mode, pass: score.pass, checks: score.checks, notes: score.notes,
    ms: rec.ms, writing: w || null, model_calls: rec.steps.reduce((a, s) => a + (s.modelCalls || 0), 0), cost_usd: rec.cost_usd, usage_by_model: rec.usage_by_model, final: rec.final,
    retries: rec.steps.reduce((a, s) => a + s.toolLog.filter((l) => l.event === "start" && l.detail?.attempt > 1).length, 0) });
}

// The timing runs (A1 sequential and repeated A1) run one at a time so they do not share the machine.
const timing = plan.filter((p) => p.n);
const rest = plan.filter((p) => !p.n);
const queue = [...rest];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => { while (queue.length) await one(queue.shift()); }));
for (const p of timing) await one(p);

// Summary: usage by model for the spend ledger, pass totals, timing.
const by = {};
for (const r of results) for (const [m, u] of Object.entries(r.usage_by_model || {})) { const b = (by[m] = by[m] || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }); for (const k of Object.keys(b)) b[k] += u[k] || 0; }
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const a1p = results.filter((r) => r.id === "A1" && r.mode === "parallel" && r.writing);
const a1s = results.filter((r) => r.id === "A1" && r.mode === "sequential" && r.writing);
const timingSummary = a1p.length && a1s.length ? {
  parallel_writing_ms: med(a1p.map((r) => r.writing.ms)), sequential_writing_ms: med(a1s.map((r) => r.writing.ms)),
  parallel_total_ms: med(a1p.map((r) => r.ms)), sequential_total_ms: med(a1s.map((r) => r.ms)),
} : null;
if (timingSummary) {
  timingSummary.writing_speedup = +(timingSummary.sequential_writing_ms / timingSummary.parallel_writing_ms).toFixed(2);
  timingSummary.total_time_reduction_pct = +(((timingSummary.sequential_total_ms - timingSummary.parallel_total_ms) / timingSummary.sequential_total_ms) * 100).toFixed(1);
}
const scored = results.filter((r) => !(r.id === "A1" && results.indexOf(r) !== results.findIndex((x) => x.id === "A1")));
const out = {
  when: new Date().toISOString(), model: MODEL, plan: outName,
  summary: {
    runs: results.length, scenarios_passed: scored.filter((r) => r.pass).length, scenarios: scored.length,
    all_runs_passed: results.filter((r) => r.pass).length, cost_usd: +results.reduce((a, r) => a + (r.cost_usd || 0), 0).toFixed(4),
    usage_by_model: by, models: { all: MODEL }, timing: timingSummary,
  },
  results,
};
fs.writeFileSync(path.join(HERE, outName), JSON.stringify(out, null, 1));
console.log(`\n${out.summary.scenarios_passed}/${out.summary.scenarios} scenarios passed; ${out.summary.all_runs_passed}/${out.summary.runs} runs; USD ${out.summary.cost_usd}${timingSummary ? `; writing speedup ${timingSummary.writing_speedup}x, total time reduction ${timingSummary.total_time_reduction_pct}%` : ""}\nWrote benchmark/${outName}`);
