// Builds owner.html (Pak Razif's page, layout D) from owner.template.html.
// Inlines tools.js, demo_state.json (stamped with meta.seed_version) and resources/clauses.json.
// Run: node build_owner.mjs   (no dependencies). Do not edit owner.html by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
// Safe inside a <script> element: no "</script>" or "<!--" can close or confuse it.
const js = (o) => JSON.stringify(o).replace(/</g, "\\u003c");

// seed_version is a hash of demo_state.json, so owner.html and assistant.html (which stamps the
// same hash) agree, and a rebuild with unchanged data never wipes a visitor's live state.
const seedText = read("demo_state.json");
const seed = JSON.parse(seedText);
seed.meta = Object.assign({}, seed.meta, { seed_version: createHash("sha1").update(seedText).digest("hex").slice(0, 12) });
const clauses = JSON.parse(read("resources/clauses.json"));
const tools = read("tools.js");
if (/<\/script/i.test(tools)) throw new Error("tools.js contains </script> and cannot be inlined");

let html = read("owner.template.html");
for (const [marker, value] of [
  ["/*__TOOLS_JS__*/", tools],
  ["/*__SEED_JSON__*/null", js(seed)],
  ["/*__CLAUSES_JSON__*/null", js(clauses)],
]) {
  if (!html.includes(marker)) throw new Error("Marker missing in template: " + marker);
  html = html.replace(marker, () => value);
}
if (html.includes("\u2014")) throw new Error("owner.html contains an em-dash");
writeFileSync(join(HERE, "owner.html"), html);
console.log(`owner.html written (${Math.round(html.length / 1024)} KB), seed_version ${seed.meta.seed_version}`);
