// Builds desk.html (the Happy Mart Customer Desk: Detailed View) from desk.template.html.
//
// Inlines the same files the MCP server and the benchmark load: lib/format.js, lib/presend.js,
// lib/backend.js, hooks/pre_tool_use.js, hooks/post_tool_use.js, tools.js, prompts.js and agent.js;
// every data/*.json, resources/policy_tables.json, resources/clauses.json, the resource texts, the case
// list (benchmark/cases.json: id, group, title, message, faults) and a slimmed copy of the recorded runs
// (benchmark/results.json, or benchmark/sample.json until the full run exists). The page then works from
// a static host with no fetch at runtime, except the Anthropic API in live mode.
//
// Run after each benchmark run: node build_desk.mjs   (rerunnable; --results <file> for another run, --out <file>)

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c"); // safe inside <script>
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

let resultsFile = opt("--results", "benchmark/results.json");
if (!existsSync(join(HERE, resultsFile))) {
  console.log(`${resultsFile} not found; using benchmark/sample.json`);
  resultsFile = "benchmark/sample.json";
}

const data = Object.fromEntries(readdirSync(join(HERE, "data")).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(read(`data/${f}`))]));
const tables = JSON.parse(read("resources/policy_tables.json"));
const clauses = JSON.parse(read("resources/clauses.json"));
const resources = tables.resources.map((r) => ({ uri: r.uri, name: r.name, for: r.for, text: read("resources/" + r.file) }));

const cases = JSON.parse(read("benchmark/cases.json"));
const caseList = cases.cases.map((c) => ({ id: c.id, group: c.group, title: c.title, message: c.message,
  faults: !!(c.faults && Object.keys(c.faults).length) }));

// Slim the recorded runs: keep everything the panel shows (events with their hook records, the written
// records, the score), drop token usage and the separate copies the events already hold.
const raw = JSON.parse(read(resultsFile));
const results = {
  file: resultsFile.replace(/^benchmark\//, ""),
  summary: raw.summary,
  results: raw.results.map((r) => ({
    id: r.id, run: r.run, group: r.group, title: r.title, message: r.message, reply: r.reply || null, error: r.error || null,
    score: { pass: !!(r.score && r.score.pass), checks: (r.score && r.score.checks) || {}, limits: (r.score && r.score.limits) || {},
      metrics: r.score && r.score.metrics ? { time_ms: r.score.metrics.time_ms, holding_reply: r.score.metrics.holding_reply,
        first_drafts_blocked: r.score.metrics.first_drafts_blocked } : {} },
    events: r.events || [],
    written: r.written || { requests: [], claims: [], handovers: [] },
  })),
};

let html = read("desk.template.html");
if (html.includes("—")) throw new Error("em-dash in desk.template.html");
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing in desk.template.html`);
  html = html.replace(marker, () => value); // function form: "$" in the value stays literal
};
swap("/*__FORMAT_JS__*/", read("lib/format.js"));
swap("/*__PRESEND_JS__*/", read("lib/presend.js"));
swap("/*__BACKEND_JS__*/", read("lib/backend.js"));
swap("/*__PRE_JS__*/", read("hooks/pre_tool_use.js"));
swap("/*__POST_JS__*/", read("hooks/post_tool_use.js"));
swap("/*__TOOLS_JS__*/", read("tools.js"));
swap("/*__PROMPTS_JS__*/", read("prompts.js"));
swap("/*__AGENT_JS__*/", read("agent.js"));
swap("/*__DATA_JSON__*/null", json(data));
swap("/*__TABLES_JSON__*/null", json(tables));
swap("/*__CLAUSES_JSON__*/null", json(clauses));
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__CASES_JSON__*/null", json(caseList));
swap("/*__RESULTS_JSON__*/null", json(results));
if (html.includes("—")) console.warn("Warning: an em-dash came in with the inlined files");

const outFile = opt("--out", "desk.html");
writeFileSync(join(HERE, outFile), html);
console.log(`Wrote ${outFile} (${html.length.toLocaleString()} chars): ${results.results.length} recorded runs from ${resultsFile}, ${caseList.length} cases`);
