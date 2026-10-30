// Build step 0: confirm the model IDs in config.json against the models list.
// Lists models only; no message is sent, so there is no token cost.
import fs from "node:fs";
import { loadKey } from "./lib/env.mjs";

const cfg = JSON.parse(fs.readFileSync(new URL("./config.json", import.meta.url), "utf8"));
const want = [cfg.model, cfg.fallback_model];
const key = loadKey();
if (!key) { console.error("No ANTHROPIC_API_KEY"); process.exit(1); }
const ids = [];
let url = "https://api.anthropic.com/v1/models?limit=100";
for (;;) {
  const res = await fetch(url, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
  if (!res.ok) { console.error(`models list ${res.status}`); process.exit(1); }
  const d = await res.json();
  ids.push(...d.data.map((m) => m.id));
  if (!d.has_more) break;
  url = `https://api.anthropic.com/v1/models?limit=100&after_id=${d.last_id}`;
}
for (const w of want) console.log(`${w}: ${ids.includes(w) ? "found" : "NOT FOUND"}`);
process.exit(want.every((w) => ids.includes(w)) ? 0 : 1);
