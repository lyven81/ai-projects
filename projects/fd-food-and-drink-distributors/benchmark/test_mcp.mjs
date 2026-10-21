// The MCP round trip, no API key: lists the six resources and six tools, then calls through the
// server with the staff ID in _meta. Checks the headline (the sales manager cannot raise credit,
// even with a Finance ID in the arguments) and that a Finance session can. Uses a temporary copy
// of the data. Run: node benchmark/test_mcp.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "hp-mcp-"));
cpSync(join(ROOT, "data"), tmp, { recursive: true });
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "mcp_server.mjs")], env: { ...process.env, HP_STATE: tmp } }));
let failed = 0;
const check = (n, c) => { console.log(`${c ? "ok  " : "FAIL"} ${n}`); if (!c) failed++; };
const call = async (name, args, staff) => {
  const r = await client.request({ method: "tools/call", params: { name, arguments: args, _meta: { staff } } }, CallToolResultSchema);
  return { result: JSON.parse(r.content[0].text), hook: r._meta && r._meta.hook };
};

const res = await client.listResources();
check("six resources", res.resources.length === 6);
const pol = await client.readResource({ uri: "policy://finance" });
check("Finance Policy readable, cites FP-08", pol.contents[0].text.includes("FP-08"));
const tools = await client.listTools();
check("five tools", tools.tools.length === 5);
const a = await call("raise_credit_limit", { request_id: "RQ-X", customer_id: "C-0001", amount_rm: 100, staff_id: "FN-01-01" }, "SL-01-01");
check("SL-01-01 refused department_not_permitted, Finance named", a.result.error.code === "department_not_permitted" && a.result.next_step.includes("FN-02-01"));
check("hook record returned in _meta, PreToolUse blocked", a.hook && a.hook.pre.verdict === "block" && a.hook.tool_ran === false);
const b = await call("raise_credit_limit", { request_id: "RQ-Y", customer_id: "C-0001", amount_rm: 100 }, "FN-02-01");
check("FN-02-01 raises RM 100: balance RM 2,000.00", b.result.status === "ok" && b.result.data.balance === "RM 2,000.00");
const c = await call("check_stock", { skus: ["FD-DR-003"], warehouse: "WH-A" }, null);
check("no session: refused", c.result.status === "refused");
await client.close();
rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
