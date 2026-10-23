// Builds staff-desk.html (the DF staff desk, mock-up E on the real engine) from staff-desk.template.html.
//
// Inlines the same files the MCP server and the benchmark load: lib/format.js, lib/rules.js, lib/backend.js,
// hooks/pre_tool_use.js, hooks/post_tool_use.js, tools.js, prompt.js and agent.js; the data files,
// resources/policy_tables.json, the clause list, the six resource texts, the Answer Key (benchmark/cases.json:
// the timeline and the cases), a slimmed copy of the recorded runs (benchmark/results.json, or
// benchmark/sample.json until the full run exists) and staff-desk.content.json (mock-up E's tab notes, the
// AI, CODE and HUMAN split per step, the areas, what each person may do). The page then works from a static
// host with no fetch at runtime, except the Anthropic API in live mode.
//
// Run after each benchmark run: node build_staff.mjs   (pass --results <file> for another run)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { RESOURCE_LIST } = require("./tools.js");
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c"); // safe inside <script>
const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

let resultsFile = arg("--results", "benchmark/results.json");
if (!existsSync(join(HERE, resultsFile))) {
  console.log(`${resultsFile} not found; using benchmark/sample.json`);
  resultsFile = "benchmark/sample.json";
}

const DATA_FILES = ["catalogue", "customers", "price_lists", "stock", "storage", "orders", "invoices", "staff", "approvals",
  "confirmations", "escalations", "drafts", "notifications", "stock_counts", "schedules", "meta"];
const data = Object.fromEntries(DATA_FILES.map((n) => [n, JSON.parse(read(`data/${n}.json`))]));
const tables = JSON.parse(read("resources/policy_tables.json"));
const resources = RESOURCE_LIST.map((r) => ({ uri: r.uri, name: r.name, text: read("resources/" + r.file) }));
const cases = JSON.parse(read("benchmark/cases.json"));

// Slim the recorded runs: a tool step keeps its hook record (whose result is the one the agent saw).
const raw = JSON.parse(read(resultsFile));
const slimStep = (t) => (t.type !== "tool" ? t : Object.assign({ type: "tool", name: t.name, input: t.input, hook: t.hook || null }, t.hook ? {} : { result: t.result }));
const results = {
  file: resultsFile.replace(/^benchmark\//, ""),
  summary: raw.summary,
  results: raw.results.map((r) => ({ id: r.id, group: r.group, staff: r.staff, error: r.error || null, reply: r.reply || null, notice: r.notice || null,
    score: { pass: !!(r.score && r.score.pass), checks: (r.score && r.score.checks) || {} }, trace: (r.trace || []).map(slimStep) })),
};

const TEMPLATE = arg("--template", "staff-desk.template.html");
let html = read(TEMPLATE);
if (html.includes("—")) throw new Error(`em-dash in ${TEMPLATE}`);
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing in ${TEMPLATE}`);
  html = html.replace(marker, () => value); // function form: "$" in the value stays literal
};
swap("/*__FORMAT_JS__*/", read("lib/format.js"));
swap("/*__RULES_JS__*/", read("lib/rules.js"));
swap("/*__BACKEND_JS__*/", read("lib/backend.js"));
swap("/*__PRE_JS__*/", read("hooks/pre_tool_use.js"));
swap("/*__POST_JS__*/", read("hooks/post_tool_use.js"));
swap("/*__TOOLS_JS__*/", read("tools.js"));
swap("/*__PROMPT_JS__*/", read("prompt.js"));
swap("/*__AGENT_JS__*/", read("agent.js"));
swap("/*__DATA_JSON__*/null", json(data));
swap("/*__TABLES_JSON__*/null", json(tables));
swap("/*__CLAUSES_JSON__*/null", json(JSON.parse(read("resources/clauses.json"))));
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__CASES_JSON__*/null", json({ timeline: cases.timeline }));
swap("/*__RESULTS_JSON__*/null", json(results));
swap("/*__CONTENT_JSON__*/null", json(JSON.parse(read("staff-desk.content.json"))));
if (html.includes("—")) console.warn("Warning: an em-dash came in with the inlined files");

const outFile = arg("--out", "staff-desk.html");
writeFileSync(join(HERE, outFile), html);
console.log(`Wrote ${outFile} (${html.length.toLocaleString()} chars): ${results.results.length} recorded runs from ${resultsFile}`);
