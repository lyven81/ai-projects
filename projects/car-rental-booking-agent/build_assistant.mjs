// Builds assistant.html (the customer page, the Gardener two-phone layout chosen on 19 Oct; the staff
// phone beside it is demo.html) from assistant.template.html: inlines tools.js,
// prompt.js and agent.js (the same files the MCP server and the benchmark use), the seed, the
// policy and inventory resources, the clause list and the recorded benchmark results, so the
// page works on GitHub Pages with no server. The Answer Key cases (benchmark/cases.json) give
// the live chat's example questions, so every case can be tried.
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
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c"); // safe inside <script>
const argv = process.argv.slice(2);
const resultsFile = argv.includes("--results") ? argv[argv.indexOf("--results") + 1] : "benchmark/results.json";

// The page seed is the same one demo.html starts from (build_dashboard.page_seed).
const seed = JSON.parse(execFileSync("python", ["-c", "import json,build_dashboard;print(json.dumps(build_dashboard.page_seed()))"], { cwd: HERE, encoding: "utf8", maxBuffer: 1 << 26 }));
const resources = Object.fromEntries(RESOURCE_LIST.map((r) => [r.uri, read("resources/" + r.file)]));
const results = JSON.parse(read(resultsFile));

const cases = JSON.parse(read("benchmark/cases.json"));
for (const [template, out] of [["assistant.template.html", "assistant.html"]]) {
  let html = read(template);
  const swap = (marker, value) => {
    if (!html.includes(marker)) throw new Error(`marker ${marker} missing in ${template}`);
    html = html.replace(marker, () => value); // function form: "$" in the value stays literal
  };
  swap("/*__TOOLS_JS__*/", read("tools.js"));
  swap("/*__PROMPT_JS__*/", read("prompt.js"));
  swap("/*__AGENT_JS__*/", read("agent.js"));
  swap("/*__SEED_JSON__*/null", json(seed));
  swap("/*__RESOURCES_JSON__*/null", json(resources));
  swap("/*__CLAUSES_JSON__*/null", read("resources/clauses.json").trim());
  swap("/*__RESULTS_JSON__*/null", json(results));
  swap("/*__CASES_JSON__*/null", json({ groups: cases.groups, cases: cases.cases.map((c) => ({ id: c.id, group: c.group, title: c.title, turns: c.turns, now: c.now || null, faults: !!c.faults })) }));
  if (html.includes("—")) throw new Error(`em-dash in ${out}`);
  writeFileSync(join(HERE, out), html);
  console.log(`Wrote ${out} (${html.length.toLocaleString()} chars) with ${resultsFile}`);
}
