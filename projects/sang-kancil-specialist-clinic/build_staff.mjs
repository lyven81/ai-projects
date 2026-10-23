// Builds staff.html (the Staff Desk) from staff.template.html.
//
// Inlines the same files the MCP server and the benchmark load: lib/format.js, lib/rules.js, lib/backend.js,
// hooks/pre_tool_use.js, hooks/post_tool_use.js, tools.js, prompt.js and agent.js; the data files,
// resources/policy_tables.json, the eight resource texts (with the Fee Schedule's restriction, applied per
// sign-in), the case list (benchmark/cases.json) and a slimmed copy of the recorded runs (benchmark/results.json,
// or benchmark/sample.json until the full run exists). The page works from a static host with no fetch at
// runtime, except the Anthropic API in live mode.
//
// Run after each benchmark run: node build_staff.mjs   (pass --results <file> for another run)

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c"); // safe inside <script>
const argv = process.argv.slice(2);

let resultsFile = argv.includes("--results") ? argv[argv.indexOf("--results") + 1] : "benchmark/results.json";
if (!existsSync(join(HERE, resultsFile))) {
  console.log(`${resultsFile} not found; using benchmark/sample.json`);
  resultsFile = "benchmark/sample.json";
}

const data = Object.fromEntries(readdirSync(join(HERE, "data")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(read(`data/${f}`))]));
const tables = JSON.parse(read("resources/policy_tables.json"));
const resources = tables.resources.map((r) => ({ uri: r.uri, name: r.name, restricted: r.restricted, text: read("resources/" + r.file) }));
const cases = JSON.parse(read("benchmark/cases.json")).cases.map((c) => ({ id: c.id, group: c.group, q: c.q, category: c.category, staff: c.staff,
  message: c.message, sample: c.sample, setup: c.setup }));

// Slim the recorded runs: a tool step keeps its hook record (whose result is the one the agent saw).
const raw = JSON.parse(read(resultsFile));
const slimStep = (t) => (t.type !== "tool" ? t : Object.assign({ type: "tool", name: t.name, input: t.input, hook: t.hook || null }, t.hook ? {} : { result: t.result }));
const results = {
  file: resultsFile.replace(/^benchmark\//, ""),
  summary: raw.summary,
  results: raw.results.map((r) => ({ id: r.id, q: r.q, staff: r.staff, message: r.message, error: r.error || null, reply: r.reply || null,
    score: { pass: !!(r.score && r.score.pass), checks: (r.score && r.score.checks) || {} }, trace: (r.trace || []).map(slimStep) })),
};

let html = read("staff.template.html");
if (html.includes("—")) throw new Error("em-dash in staff.template.html");
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing in staff.template.html`);
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
swap("/*__CASES_JSON__*/null", json(cases));
swap("/*__RESULTS_JSON__*/null", json(results));
if (html.includes("—")) console.warn("Warning: an em-dash came in with the inlined files");
writeFileSync(join(HERE, "staff.html"), html);
console.log(`Wrote staff.html (${html.length.toLocaleString()} chars): ${results.results.length} recorded runs from ${resultsFile}, ${cases.length} cases`);
