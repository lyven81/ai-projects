// Builds assistant.html (the two-phone demo page, design E) from assistant.template.html.
// Inlines tools.js, prompt.js and agent.js (the same files the MCP server and the benchmark use),
// the six resources, clauses.json, calendar.json (the replay's starting state), demo_state.json
// (the live chat's starting state), the recorded benchmark run and the cases, so the page works
// on GitHub Pages with no server. The right-hand phone is owner.html in an iframe.
//
// Run after make_demo_state.mjs and after each benchmark run: node build_assistant.mjs
// The replay shows benchmark/results.json; pass --results <file> to embed another run.

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { RESOURCE_LIST } = require("./tools.js");
const read = (p) => readFileSync(join(HERE, p), "utf8");
// Safe inside <script>: no "</script>" or "<!--" can close or confuse the block.
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");
const argv = process.argv.slice(2);
const resultsFile = argv.includes("--results") ? argv[argv.indexOf("--results") + 1] : "benchmark/results.json";

const resources = Object.fromEntries(RESOURCE_LIST.map((r) => [r.key, read("resources/" + r.file)]));
const demoStateText = read("demo_state.json");
// The live chat seeds Pak Razif's phone with demo_state.json stamped with this version.
const seedVersion = createHash("sha1").update(demoStateText).digest("hex").slice(0, 12);
const results = JSON.parse(read(resultsFile));
const cases = JSON.parse(read("benchmark/cases.json"));
if (results.results.length !== cases.cases.length) console.warn(`Warning: ${results.results.length} recorded cases, ${cases.cases.length} in cases.json`);

let html = read("assistant.template.html");
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing`);
  html = html.replace(marker, () => value); // function form: "$" in the value stays literal
};
const script = (p) => { const s = read(p); if (/<\/script/i.test(s)) throw new Error(`${p} contains </script>`); return s; };
swap("/*__TOOLS_JS__*/", script("tools.js"));
swap("/*__PROMPT_JS__*/", script("prompt.js"));
swap("/*__AGENT_JS__*/", script("agent.js"));
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__CLAUSES_JSON__*/null", json(JSON.parse(read("resources/clauses.json"))));
swap("/*__CALENDAR_JSON__*/null", json(JSON.parse(read("calendar.json"))));
swap("/*__DEMO_STATE_JSON__*/null", json(JSON.parse(demoStateText)));
swap("/*__RESULTS_JSON__*/null", json(results));
swap("/*__CASES_JSON__*/null", json(cases));
swap('/*__SEED_VERSION__*/""', JSON.stringify(seedVersion));
if (/\/\*__[A-Z_]+__\*\//.test(html)) throw new Error("a marker was left in assistant.html");
if (html.includes("—")) throw new Error("em-dash in assistant.html");
writeFileSync(join(HERE, "assistant.html"), html);
console.log(`Wrote assistant.html (${html.length.toLocaleString()} chars) with ${resultsFile}, seed ${seedVersion}`);
