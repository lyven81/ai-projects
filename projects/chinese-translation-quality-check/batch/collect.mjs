// Collect every ended batch by custom_id, validate, redo failures live, grade, save each section.
// Usage: node batch/collect.mjs   (safe to run again; collected sections are skipped)
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { RUN, load, saveSection, appendUsage } = require("./common.js");
const { collect } = require("../lib/batch.js");
const { ledger } = require("../lib/claude.js");
const { doc, sources } = load();
const report = await collect(doc, sources, join(RUN, "batch_run.json"), saveSection(join(RUN, "findings")));
for (const r of report) console.log(r.status === "collected" ? `${r.section}: collected, ${r.findings} findings, ${r.redone} redone live, ${r.failed} findings failed checks` : `${r.section}: ${r.status} (${JSON.stringify(r.counts)})`);
if (ledger.calls) appendUsage(join(RUN, "usage.json"), { at: new Date().toISOString(), step: "collect", usd: Number(ledger.usd.toFixed(4)), by: ledger.byLabel });
console.log(`cost of this collection: $${ledger.usd.toFixed(2)}`);
