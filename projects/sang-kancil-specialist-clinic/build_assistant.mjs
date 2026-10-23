// Builds assistant.html (Sang Kancil Staff Assistant, the two-phone demo in the Happy Mart layout: the phone of
// the staff member asking beside the phone of the person the work goes to) from assistant.template.html.
//
// Inlines the same files the MCP server, the benchmark and staff.html load: lib/format.js, lib/rules.js,
// lib/backend.js, hooks/pre_tool_use.js, hooks/post_tool_use.js, tools.js, prompt.js and agent.js; every
// data/*.json, resources/policy_tables.json, resources/clauses.json, the resource texts (the Fee Schedule's
// restriction applied per sign-in), the case list and a slimmed copy of the recorded runs (benchmark/results.json,
// or benchmark/sample.json until the full run exists). The page works from a static host with no fetch at
// runtime, except the Anthropic API in live mode.
//
// Run after each benchmark run: node build_assistant.mjs [--questions 1.1,2.1] [--results <file>] [--out <file>]
//   and: node build_assistant.mjs --template staff-desk.template.html --out staff-desk.html

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (o) => JSON.stringify(o).replace(/</g, "\u003c"); // safe inside <script>
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const TEMPLATE = opt("--template", "assistant.template.html");  // also staff-desk.template.html (the founder's desktop layout)

let resultsFile = opt("--results", "benchmark/results.json");
if (!existsSync(join(HERE, resultsFile))) {
  console.log(`${resultsFile} not found; using benchmark/sample.json`);
  resultsFile = "benchmark/sample.json";
}
// The questions shown in Replay (founder, 22 Oct: question 1.1 first).
const questions = opt("--questions", TEMPLATE.startsWith("staff-desk") ? "1.1,2.1,3.1,4.1,5.1,6.1,7.1" : "1.1").split(",");  // the desk: the sample question of each category

const data = Object.fromEntries(readdirSync(join(HERE, "data")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(read(`data/${f}`))]));
const tables = JSON.parse(read("resources/policy_tables.json"));
const clauses = JSON.parse(read("resources/clauses.json"));
const resources = tables.resources.map((r) => ({ uri: r.uri, name: r.name, restricted: r.restricted, text: read("resources/" + r.file) }));
const cases = JSON.parse(read("benchmark/cases.json")).cases.map((c) => ({ id: c.id, group: c.group, q: c.q, category: c.category, staff: c.staff,
  message: c.message, setup: c.setup, authority: c.authority || [], notice: (c.expect && c.expect.notice) || null }));

const raw = JSON.parse(read(resultsFile));
const slimStep = (t) => (t.type !== "tool" ? t : Object.assign({ type: "tool", name: t.name, input: t.input, hook: t.hook || null }, t.hook ? {} : { result: t.result }));
const results = {
  file: resultsFile.replace(/^benchmark\//, ""),
  summary: raw.summary,
  results: raw.results.filter((r) => questions.includes(r.q)).map((r) => ({ id: r.id, q: r.q, staff: r.staff, message: r.message, error: r.error || null, reply: r.reply || null,
    score: { pass: !!(r.score && r.score.pass), checks: (r.score && r.score.checks) || {} }, trace: (r.trace || []).map(slimStep) })),
};

let html = read(TEMPLATE);
if (html.includes("\u2014")) throw new Error(`em-dash in ${TEMPLATE}`);
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing in ${TEMPLATE}`);
  html = html.replace(marker, () => value);
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
swap("/*__CLAUSES_JSON__*/null", json(clauses));
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__CASES_JSON__*/null", json(cases));
swap("/*__RESULTS_JSON__*/null", json(results));
if (html.includes("/*__REPLAY_QUESTIONS__*/null")) swap("/*__REPLAY_QUESTIONS__*/null", json(questions));
if (html.includes("\u2014")) console.warn("Warning: an em-dash came in with the inlined files");
const outFile = opt("--out", "assistant.html");
writeFileSync(join(HERE, outFile), html);
console.log(`Wrote ${outFile} (${html.length.toLocaleString()} chars): replay ${questions.join(", ")} (${results.results.length} recorded runs from ${resultsFile}), ${cases.length} cases`);
