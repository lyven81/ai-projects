// Builds workspace.html from workspace.template.html: inlines the shared code (tools.js, hooks, the reply check,
// agent.js, prompt.js), the sample data, the resources and the recorded benchmark runs (newest full run, else
// the newest sample). Never edit workspace.html by hand.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, loadConfig, loadData, readCsv } from "./lib/load.mjs";

const require = createRequire(import.meta.url);
const { collect } = require(path.join(ROOT, "lib", "replycheck.js"));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const libs = ["tools.js", "hooks/guards.js", "lib/replycheck.js", "agent.js", "prompt.js"].map(read).join("\n;\n");

const B = path.join(ROOT, "benchmark");
const pick = (re) => fs.readdirSync(B).filter((f) => re.test(f)).sort().pop();
// The newest full run; until there is one, every sample and --only run, the newest record of each case winning.
const full = pick(/^results-full-.*\.json$/);
const stamp = (f) => f.replace(/^\D+/, "");
// The newest full run, then any sample or --only run recorded after it (a rerun after a fix wins for its case).
const files = fs.readdirSync(B).filter((f) => /^(sample-sample|results-only)-.*\.json$/.test(f) && (!full || stamp(f) > stamp(full)))
  .concat(full ? [full] : []).sort((a, b) => stamp(a).localeCompare(stamp(b))); // by run time, oldest first
const file = files.join(", ");
const cases = JSON.parse(read("benchmark/cases.json")).cases;
const byCase = new Map();
for (const f of files) for (const r of JSON.parse(fs.readFileSync(path.join(B, f), "utf8")).results.filter((x) => x.id !== "R1")) byCase.set(r.id, r);
const recorded = cases.map((c) => byCase.get(c.id)).filter(Boolean);
let runs = [];
if (recorded.length) {
  runs = recorded.map((r) => {
    const cs = cases.find((c) => c.id === r.case_id);
    const { records } = collect(r.run.trace);
    const tagged = new Set(r.run.turns.flatMap((t) => [...(t.reply || "").matchAll(/\[(F-[0-9a-f]{6})\]/g)].map((m) => m[1])));
    return { id: r.id, title: cs.title, group: cs.group, clock: cs.clock, pass: r.score.pass,
      turns: r.run.turns.map((t) => ({ owner: t.owner, reply: t.reply, steps: t.steps.filter((s) => s.type === "tool") })),
      trace: [{ name: "records", result: { records: [...tagged].map((id) => records.get(id)).filter(Boolean) } }] };
  });
}
// The approval tab starts with the pending proposals the assistant saved in the recorded runs, for the owner to decide.
const pending = { changes: [] };
{
  for (const r of recorded)
    for (const x of (r.run.plan_after || { changes: [] }).changes.filter((y) => y.status === "pending"))
      if (!pending.changes.some((y) => y.campaign_id === x.campaign_id && y.type === x.type))
        pending.changes.push(Object.assign({}, x, { id: "P-" + String(pending.changes.length + 1).padStart(2, "0"), from_run: r.id }));
}
const DATA = { pending, config: loadConfig(), ...loadData(), next: readCsv(path.join(ROOT, "data", "weekly_results_next.csv")),
  seed: JSON.parse(read("data/plan.seed.json")),
  resources: { businessProfile: read("resources/business-profile.md"), metricDefinitions: read("resources/metric-definitions.md"),
    reviewPolicy: read("resources/review-policy.md"), planningRules: read("resources/planning-rules.md") }, runs };
let html = read("workspace.template.html").replace("/*INLINE:LIBS*/", () => libs).replace("/*INLINE:DATA*/", () => JSON.stringify(DATA));
if (/sk-ant-[A-Za-z0-9_\-]{20,}/.test(html)) { console.error("refusing to write: key-shaped text found"); process.exit(1); }
fs.writeFileSync(path.join(ROOT, "workspace.html"), html);
console.log(`workspace.html ${(html.length / 1024).toFixed(0)} KB, ${runs.length} recorded runs and ${pending.changes.length} pending proposals from ${file || "none"}`);
