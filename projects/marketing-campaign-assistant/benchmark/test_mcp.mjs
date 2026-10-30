// No-key test: the MCP server through an MCP client. Every tool once, the resources, and refusals.
// Runs on a temporary plan file so data/plan.json is untouched.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ROOT } from "../lib/load.mjs";

let pass = 0, failN = 0;
const ok = (c, n, d) => { if (c) pass++; else { failN++; console.log(`FAIL ${n}${d ? ": " + d : ""}`); } };
const planFile = path.join(ROOT, "data", "plan.json");
const saved = fs.existsSync(planFile) ? fs.readFileSync(planFile, "utf8") : null;
fs.writeFileSync(planFile, JSON.stringify({ changes: [] }));
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: [path.join(ROOT, "mcp_server.mjs")], cwd: ROOT }));
try {
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  ok(JSON.stringify(tools) === JSON.stringify(["check_plan", "get_campaign", "get_performance", "propose_change"]), "four tools", tools.join(","));
  const res = (await client.listResources()).resources.map((r) => r.uri);
  ok(res.length === 4, "four resources", res.join(","));
  const rp = await client.readResource({ uri: "comel://planning-rules" });
  ok(/PR-4 Campaign cap/.test(rp.contents[0].text), "planning rules readable");
  const call = async (name, args) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text);
  const perf = await call("get_performance", { period_start: "2026-08-31", period_end: "2026-09-27" });
  ok(perf.ok && perf.totals.spend.id, "get_performance");
  const g = await call("get_campaign", { campaign_id: "XH-05", period_start: "2026-08-31", period_end: "2026-09-27" });
  ok(g.ok && g.totals.roas, "get_campaign");
  const p = await call("propose_change", { campaign_id: "XH-05", type: "pause", reason: "low ROAS", reason_figure_ids: [g.totals.roas.id], target: { rule: "T1", baseline_figure_id: g.totals.spend.id, deadline: "2026-10-25" } });
  ok(p.ok && p.saved.status === "pending", "propose_change saved pending", JSON.stringify(p).slice(0, 150));
  ok(JSON.parse(fs.readFileSync(planFile, "utf8")).changes.length === 1, "plan.json written");
  const c = await call("check_plan", {});
  ok(!c.ok && c.error.category === "period_not_closed", "check_plan refused before the period closes");
  const bad = await call("get_campaign", { campaign_id: "ZZ-99" });
  ok(!bad.ok && bad.error.category === "campaign_not_found", "structured error through MCP");
} finally {
  await client.close();
  if (saved === null) fs.rmSync(planFile, { force: true }); else fs.writeFileSync(planFile, saved);
}
console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
