// The published result: the final full run (results-final.json) with the A2A cases replaced by their rerun after the
// A2A wording fix (results-a2a-fix2.json: cases 13, 14, 15 and 18). The fix changed only the A2A route (the
// fixed sentences and the reply check speak about the person, and an A2A-only prompt paragraph and example); the
// form and chat code paths and the chat prompt are as the final run used them. No API call.
//   node benchmark/merge_results.mjs   -> benchmark/results-published.json and .md
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(HERE, f), "utf8"));
const base = read("results-final.json"), fix = read("results-a2a-fix2.json");
const ids = fix.results.map((r) => r.id);
const results = base.results.filter((r) => !ids.includes(r.id)).concat(fix.results).sort((a, b) => a.id - b.id);
if (JSON.stringify(results.map((r) => r.id)) !== JSON.stringify(Array.from({ length: 20 }, (_, i) => i + 1))) throw new Error("the published result must hold exactly cases 1 to 20");
const by_group = {};
for (const r of results) { const g = (by_group[r.group] = by_group[r.group] || { runs: 0, passed: 0 }); g.runs++; if (r.score.pass) g.passed++; }
const summary = { date: fix.summary.date, today: base.summary.today, model: base.summary.model, runs: results.length, passed: results.filter((r) => r.score.pass).length,
  hard_limit_breaches: results.reduce((a, r) => a + Object.values(r.score.limits).filter((v) => !v).length, 0), by_group,
  merged: { note: `Cases ${ids.join(", ")} from results-a2a-fix2.json (${fix.summary.date.slice(0, 10)}), after the A2A wording fix; the rest from results-final.json (${base.summary.date.slice(0, 10)}).`, final_run: `${base.summary.passed} of ${base.summary.runs}` } };
writeFileSync(join(HERE, "results-published.json"), JSON.stringify({ summary, results }, null, 1));
writeFileSync(join(HERE, "results-published.md"), [`# Jade Star benchmark: published result`, "", `- Cases passed: ${summary.passed} of ${summary.runs}`, `- Hard-limit breaches: ${summary.hard_limit_breaches}`,
  `- By group: ${Object.entries(by_group).map(([g, v]) => `${g} ${v.passed} of ${v.runs}`).join("; ")}`, `- ${summary.merged.note}`, "",
  "| Case | Group | Pass | Reply (last) |", "|---|---|---|---|", ...results.map((r) => `| ${r.id} ${r.type} | ${r.group} | ${r.score.pass ? "yes" : "no"} | ${(((r.turns || []).slice(-1)[0] || {}).reply || "").replace(/\|/g, "/")} |`)].join("\n") + "\n");
console.log(`results-published.json: ${summary.passed} of ${summary.runs} passed, ${summary.hard_limit_breaches} hard-limit breaches. ${summary.merged.note}`);
