// Builds assistant.html (the player chat page) from assistant.template.html: inlines tools.js,
// prompt.js and agent.js (the same files the MCP server and the benchmark use), the seed plus
// the demo queue, the three policies, the clause list and the recorded benchmark results, so
// the page works on GitHub Pages with no server.
//
// Run after build_dashboard.py and after each benchmark run: node build_assistant.mjs
// The replay shows benchmark/results.json; pass --results <file> to embed another run.

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { RESOURCE_LIST } = require("./tools.js");
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (o) => JSON.stringify(o).replace(/</g, "\u003c"); // safe inside <script>
const argv = process.argv.slice(2);
const resultsFile = argv.includes("--results") ? argv[argv.indexOf("--results") + 1] : "benchmark/results.json";

// The page seed is the same one demo.html starts from (build_dashboard.page_seed).
const seed = JSON.parse(execFileSync("python", ["-c", "import json,build_dashboard;print(json.dumps(build_dashboard.page_seed()))"], { cwd: HERE, encoding: "utf8", maxBuffer: 1 << 26 }));
const resources = Object.fromEntries(RESOURCE_LIST.map((r) => [r.key, read("resources/" + r.file)]));
const results = JSON.parse(read(resultsFile));

let html = read("assistant.template.html");
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing`);
  html = html.replace(marker, () => value); // function form: "$" in the value stays literal
};
swap("/*__TOOLS_JS__*/", read("tools.js"));
swap("/*__PROMPT_JS__*/", read("prompt.js"));
swap("/*__AGENT_JS__*/", read("agent.js"));
swap("/*__SEED_JSON__*/null", json(seed));
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__CLAUSES_JSON__*/null", read("resources/clauses.json").trim());
swap("/*__RESULTS_JSON__*/null", json(results));
if (html.includes("—")) throw new Error("em-dash in assistant.html");
writeFileSync(join(HERE, "assistant.html"), html);
console.log(`Wrote assistant.html (${html.length.toLocaleString()} chars) with ${resultsFile}`);
