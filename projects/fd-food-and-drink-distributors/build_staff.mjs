// Builds staff.html (the Staff Desk) from staff.template.html, and the new desk (founder, 23 Oct: the Sang Kancil
// desk layout in FD's own colours) with: node build_staff.mjs --template staff-desk.template.html --out staff-desk.html
//
// Inlines the same files the MCP server and the benchmark load: lib/format.js, lib/rules.js,
// lib/backend.js, hooks/pre_tool_use.js, hooks/post_tool_use.js, tools.js, prompt.js and agent.js;
// the data files, resources/policy_tables.json, the six resource texts, the case list
// (benchmark/cases.json, id, group, title, staff, message only) and a slimmed copy of the recorded
// runs (benchmark/results.json, or benchmark/smoke.json until the full run exists). The page then
// works from a static host with no fetch at runtime, except the Anthropic API in live mode.
//
// Run after each benchmark run: node build_staff.mjs   (rerunnable; pass --results <file> for another run)

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

let resultsFile = argv.includes("--results") ? argv[argv.indexOf("--results") + 1] : "benchmark/results.json";
if (!existsSync(join(HERE, resultsFile))) {
  console.log(`${resultsFile} not found; using benchmark/smoke.json`);
  resultsFile = "benchmark/smoke.json";
}

const DATA_FILES = ["catalogue", "customers", "price_lists", "stock", "storage", "orders", "invoices", "staff", "approvals",
  "confirmations", "credit_raises", "meta"];
const data = Object.fromEntries(DATA_FILES.map((n) => [n, JSON.parse(read(`data/${n}.json`))]));
const tables = JSON.parse(read("resources/policy_tables.json"));
const resources = RESOURCE_LIST.map((r) => ({ uri: r.uri, name: r.name, text: read("resources/" + r.file) }));

const casesFile = argv.includes("--cases") ? argv[argv.indexOf("--cases") + 1] : "benchmark/cases.json";
const cases = JSON.parse(read(casesFile));
const caseList = cases.cases.map((c) => ({ id: c.id, group: c.group, row: c.row || null, kind: c.kind || null, title: c.title, staff: c.staff,
  message: c.message, faults: !!(c.faults && Object.keys(c.faults).length),
  prior_orders: !!(c.setup && c.setup.orders && c.setup.orders.length) }));

// Slim the recorded runs: a tool step keeps its hook record (whose result is the one the agent saw);
// the separate copy of the result is kept only when there is no hook record.
const raw = JSON.parse(read(resultsFile));
const slimStep = (t) => {
  if (t.type !== "tool") return t;
  const s = { type: "tool", name: t.name, input: t.input, hook: t.hook || null };
  if (!t.hook) s.result = t.result;
  return s;
};
const results = {
  file: resultsFile.replace(/^benchmark\//, ""),
  summary: raw.summary,
  results: raw.results.map((r) => ({
    id: r.id, group: r.group, staff: r.staff, title: r.title, message: r.message, direct: !!r.direct,
    error: r.error || null, reply: r.reply || null,
    score: { pass: !!(r.score && r.score.pass), checks: (r.score && r.score.checks) || {} },
    trace: (r.trace || []).map(slimStep),
  })),
};

const TEMPLATE = argv.includes("--template") ? argv[argv.indexOf("--template") + 1] : "staff.template.html";
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
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__CASES_JSON__*/null", json(caseList));
swap("/*__RESULTS_JSON__*/null", json(results));
// The clause texts behind the cited clause buttons (the desk only).
if (html.includes("/*__CLAUSES_JSON__*/null")) swap("/*__CLAUSES_JSON__*/null", json(JSON.parse(read("resources/clauses.json"))));
if (html.includes("—")) console.warn("Warning: an em-dash came in with the inlined files");

const outFile = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : "staff.html";
writeFileSync(join(HERE, outFile), html);
console.log(`Wrote ${outFile} (${html.length.toLocaleString()} chars): ${results.results.length} recorded runs from ${resultsFile}, ${caseList.length} cases`);
