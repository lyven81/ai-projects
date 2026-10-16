// Builds assistant.html from assistant.template.html: inlines tools.js, prompt.js
// and agent.js (the same files the MCP server and benchmark use), the seed data,
// the three resources and the latest benchmark results, so the page works from
// file:// and on GitHub Pages with no server.
//
// Run after build_dashboard.py and after each benchmark run: node build_assistant.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c"); // safe inside <script>

const resultsPath = join(HERE, "benchmark", "results.json");
const resources = {
  policyGuide: read("resources/policy-guide.md"),
  faq: read("resources/faq.md"),
  servicePackages: JSON.parse(read("resources/service-packages.json")),
};

let html = read("assistant.template.html");
const swap = (marker, value) => {
  if (!html.includes(marker)) throw new Error(`marker ${marker} missing`);
  html = html.replace(marker, () => value); // function form: "$" in the value stays literal
};
swap("/*__TOOLS_JS__*/", read("tools.js"));
swap("/*__PROMPT_JS__*/", read("prompt.js"));
swap("/*__AGENT_JS__*/", read("agent.js"));
// The page starts from the seed plus the demo queue (items already waiting for staff).
const seed = JSON.parse(read("workshop_bookings.json"));
const queue = JSON.parse(read("demo_queue.json"));
seed.bookings = seed.bookings.concat(queue.bookings);
seed.handovers = queue.handovers;
swap("/*__SEED_JSON__*/null", json(seed));
swap("/*__RESOURCES_JSON__*/null", json(resources));
swap("/*__RESULTS_JSON__*/null", existsSync(resultsPath) ? json(JSON.parse(readFileSync(resultsPath, "utf8"))) : "null");

writeFileSync(join(HERE, "assistant.html"), html);
console.log(`Wrote assistant.html (${html.length.toLocaleString()} chars)`);
