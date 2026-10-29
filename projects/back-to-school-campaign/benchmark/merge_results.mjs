// Builds the final benchmark/results.json from the runs recorded on the final build: the 16 runs that write copy
// (results-final-copy.json, 29 Oct, after the products-named-in-words rule) plus the 5 runs that stop before any
// copy is written (B2, B5, B7, B8, F1 from the first full run, results-full-1.json), which that rule cannot change.
// C3 comes from results-c3.json, rerun after the owner became a fact (F-OWNER, store profile S3); D3 from
// results-d3.json, rerun after the coverage check also waits for a writer still working.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const B = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(B, f), "utf8"));
const copy = read("results-final-copy.json"), full = read("results-full-1.json"), c3 = read("results-c3.json"), d3 = read("results-d3.json");
const KEEP = ["B2", "B5", "B7", "B8", "F1"];
const kept = full.results.filter((r) => KEEP.includes(r.id));
if (kept.length !== KEEP.length) throw new Error("a kept run is missing from results-full-1.json");
const results = [...kept, ...copy.results.filter((r) => !["C3", "D3"].includes(r.id)), ...c3.results, ...d3.results];
const by = {};
for (const r of results) for (const [m, u] of Object.entries(r.usage_by_model || {})) { const b = (by[m] = by[m] || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }); for (const k of Object.keys(b)) b[k] += u[k] || 0; }
const first = (id) => results.find((r) => r.id === id);
const ids = [...new Set(results.map((r) => r.id))];
const out = {
  when: new Date().toISOString(), model: copy.model, plan: "results.json",
  note: "Final build, 29 Oct 2026: 16 runs that write copy from results-final-copy.json (C3 from results-c3.json, D3 from results-d3.json) and 5 runs that stop before any copy (B2, B5, B7, B8, F1) from results-full-1.json.",
  summary: {
    runs: results.length, scenarios: ids.length, scenarios_passed: ids.filter((id) => first(id).pass).length, all_runs_passed: results.filter((r) => r.pass).length,
    cost_usd: +results.reduce((a, r) => a + (r.cost_usd || 0), 0).toFixed(4), usage_by_model: by, models: { all: copy.model }, timing: copy.summary.timing,
  },
  sources: { copy_runs: "results-final-copy.json", c3: "results-c3.json", d3: "results-d3.json", kept_runs: "results-full-1.json" },
  results,
};
fs.writeFileSync(path.join(B, "results.json"), JSON.stringify(out, null, 1));
console.log(`merged: ${out.summary.scenarios_passed}/${out.summary.scenarios} scenarios, ${out.summary.all_runs_passed}/${out.summary.runs} runs, USD ${out.summary.cost_usd}`);
