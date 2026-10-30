// Loads config, the review-period data, the guarded next-period reader and a plan store, for Node callers
// (server.mjs, mcp_server.mjs, the benchmark). The browser workspace gets the same data inlined at build time.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
export const Tools = require(path.join(ROOT, "tools.js"));
export const Hooks = require(path.join(ROOT, "hooks", "guards.js"));

const NUM = ["spend_rm", "impressions", "reach", "clicks", "engagements", "leads", "orders", "revenue_rm", "budget_rm"];
export function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  return lines.map((l) => {
    const v = l.split(","); const o = {};
    cols.forEach((c, i) => (o[c] = NUM.includes(c) ? Number(v[i]) : v[i]));
    return o;
  });
}
export function loadConfig(overrides) {
  return Object.assign(JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8")), overrides || {});
}
export function loadData() {
  const notes = path.join(ROOT, "data", "data_notes.json");
  return { campaigns: readCsv(path.join(ROOT, "data", "campaigns.csv")), weekly: readCsv(path.join(ROOT, "data", "weekly_results.csv")),
    notes: fs.existsSync(notes) ? JSON.parse(fs.readFileSync(notes, "utf8")).notes : [] };
}
export function fileStore(file) {
  return {
    load: () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { changes: [] }),
    save: (plan) => fs.writeFileSync(file, JSON.stringify(plan, null, 2)),
  };
}
export function memoryStore(initial) {
  let plan = JSON.parse(JSON.stringify(initial || { changes: [] }));
  return { load: () => JSON.parse(JSON.stringify(plan)), save: (p) => { plan = JSON.parse(JSON.stringify(p)); } };
}
// One desk: one conversation. log receives each tool call (the PostToolUse hook writes it).
// data: optional override (the no-key tests add a supplied note to exercise a refusal).
export function makeDesk({ config, store, logLines, data }) {
  const cfg = config || loadConfig();
  const readNext = Hooks.guardNextRead(cfg, () => readCsv(path.join(ROOT, "data", "weekly_results_next.csv")));
  const log = Hooks.toolLogger((e) => logLines && logLines.push(e));
  return Tools.createDesk({ data: data || loadData(), store: store || memoryStore(), config: cfg, readNext, log });
}
