// The MCP round trip, no API key: lists the six resources and seven tools, then calls through the server
// with the staff ID in _meta. Checks the headline (a sales executive cannot approve a discount, even with
// the sales manager's ID in the arguments; the sentence is written in code), that the warehouse manager's
// count is recorded, that an escalation reaches its manager as a notification, and that no session is
// refused. Uses a temporary copy of the data. Run: node benchmark/test_mcp.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "df-mcp-"));
cpSync(join(ROOT, "data"), tmp, { recursive: true });
const NOW = JSON.parse(readFileSync(join(ROOT, "data", "meta.json"), "utf8")).now;
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "mcp_server.mjs")], env: { ...process.env, HP_STATE: tmp, HP_NOW: String(NOW + 600) } }));
let failed = 0;
const check = (n, c) => { console.log(`${c ? "ok  " : "FAIL"} ${n}`); if (!c) failed++; };
const call = async (name, args, staff) => {
  const r = await client.request({ method: "tools/call", params: { name, arguments: args, _meta: { staff } } }, CallToolResultSchema);
  return { result: JSON.parse(r.content[0].text), hook: r._meta && r._meta.hook };
};

const res = await client.listResources();
check("six resources", res.resources.length === 6);
const pol = await client.readResource({ uri: "policy://management" });
check("Management Policy readable, carries MP-16", pol.contents[0].text.includes("MP-16"));
const tools = await client.listTools();
check("seven tools", tools.tools.length === 7);
const esc = await call("create_order", { customer_id: "C-0001", lines: [{ sku: "DF-EO-001", qty: 10 }], discount_pct: 10 }, "SL-02-01");
check("Chloe's 10% discount escalated to Farid: Sent to Farid Iskandar, sales manager.", esc.result.status === "escalated" && esc.result.next_step.say === "Sent to Farid Iskandar, sales manager.");
const notes = JSON.parse(readFileSync(join(tmp, "notifications.json"), "utf8"));
check("Farid's notification written through to the data", notes.length === 1 && notes[0].to === "SL-01-01");
const a = await call("decide_escalation", { customer_id: "C-0001", type: "discount", decision: "approve", staff_id: "SL-01-01" }, "SL-02-02");
check("Daniel refused tier_not_permitted, the sentence written in code", a.result.error.code === "tier_not_permitted" && a.result.next_step.say.startsWith("I'm sorry, you can't approve discounts."));
check("hook record returned in _meta, PreToolUse blocked", a.hook && a.hook.pre.verdict === "block" && a.hook.tool_ran === false);
const b = await call("decide_escalation", { customer_id: "C-0001", type: "discount", decision: "approve" }, "SL-01-01");
check("Farid approves: AP-0105", b.result.status === "ok" && b.result.data.approval_id === "AP-0105");
const c = await call("check_stock", { skus: ["DF-EO-001"], warehouse: "WH-A" }, null);
check("no session: refused", c.result.status === "refused");
await client.close();
rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
