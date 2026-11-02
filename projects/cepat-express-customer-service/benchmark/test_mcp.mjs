// No-key MCP test: start the server on a temporary copy of the data, list its 4 resources and 4 tools, read a
// policy, and call the status tool and a refused escalation, with the session in _meta.
//   node benchmark/test_mcp.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = mkdtempSync(join(tmpdir(), "cx-mcp-"));
for (const f of ["parcels.json", "handovers.json"]) copyFileSync(join(ROOT, "data", f), join(state, f));

let passed = 0, failed = 0;
const check = (name, cond, info) => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${info !== undefined ? "  " + JSON.stringify(info).slice(0, 300) : ""}`); } };

const transport = new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "mcp_server.mjs")], cwd: ROOT, env: Object.assign({}, process.env, { CX_STATE: state }) });
const client = new Client({ name: "cx-test", version: "1.0.0" });
try {
  await client.connect(transport);
  const res = (await client.listResources()).resources.map((r) => r.uri).sort();
  check("4 resources", JSON.stringify(res) === JSON.stringify(["policy://courier", "policy://customer-service", "policy://delivery-status", "staff://directory"]), res);
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  check("4 tools", JSON.stringify(tools) === JSON.stringify(["escalate_case", "get_parcel_details", "get_shipment_status", "verify_customer"]), tools);
  const pol = await client.readResource({ uri: "policy://courier" });
  check("Courier Policy readable", /C15/.test(pol.contents[0].text));
  const st = await client.callTool({ name: "get_shipment_status", arguments: { tracking_number: "CE26000104" }, _meta: { session: "m1" } });
  const r = JSON.parse(st.content[0].text);
  check("Status through MCP, flagged for our Klang team", r.status === "ok" && /our Klang team/.test(r.data.flag.sentence));
  const esc = await client.callTool({ name: "escalate_case", arguments: { tracking_number: "CE26000102", reason: "delivered_not_received", told_customer: "x x x", summary: "y y y" }, _meta: { session: "m1" } });
  check("Escalation before the phone match refused through MCP", esc.isError && JSON.parse(esc.content[0].text).error.code === "not_verified");
  await client.callTool({ name: "verify_customer", arguments: { tracking_number: "CE26000102", phone: "012-338 4471" }, _meta: { session: "m1" } });
  const other = await client.callTool({ name: "get_parcel_details", arguments: { tracking_number: "CE26000102" }, _meta: { session: "m2" } });
  check("A phone match holds only in its own chat (session)", other.isError);
  const mine = await client.callTool({ name: "get_parcel_details", arguments: { tracking_number: "CE26000102" }, _meta: { session: "m1" } });
  check("Details in the verified chat", !mine.isError);
} catch (e) {
  failed++; console.log("FAIL MCP server: " + (e.message || e));
} finally {
  await client.close().catch(() => {});
  rmSync(state, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
