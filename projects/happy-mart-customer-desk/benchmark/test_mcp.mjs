// MCP server test, no API key: lists the resources and tools, then runs the access checks over stdio with
// the session and agent in _meta. Run: node benchmark/test_mcp.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const state = mkdtempSync(join(tmpdir(), "hm-mcp-"));
cpSync(join(ROOT, "data"), state, { recursive: true });
const child = spawn(process.execPath, [join(ROOT, "mcp_server.mjs")], { env: { ...process.env, HM_STATE: state, ANTHROPIC_API_KEY: "" }, stdio: ["pipe", "pipe", "inherit"] });
let buf = "", id = 0;
const waiting = new Map();
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  }
});
const rpc = (method, params) => new Promise((res) => { const n = ++id; waiting.set(n, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });
const call = async (name, args, meta) => JSON.parse((await rpc("tools/call", { name, arguments: args, _meta: meta })).result.content[0].text);

let pass = 0, fail = 0;
const check = (n, c) => { console.log(`${c ? "PASS" : "FAIL"}  ${n}`); c ? pass++ : fail++; };
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const res = (await rpc("resources/list", {})).result.resources;
check(`13 resources listed (6 policies, workbook, 5 role sheets, contacts), no order data (${res.length})`, res.length === 13 && !res.some((r) => /order/i.test(r.uri)));
const tools = (await rpc("tools/list", {})).result.tools;
check(`17 tools listed (${tools.length})`, tools.length === 17);
const S = { session: "t1", message: "Where is my order?" };
check("ask_specialist before verification: not_verified", (await call("ask_specialist", { department: "fulfilment", question: "x" }, S)).error.code === "not_verified");
check("verify_order HM-100101 / 4417: ok", (await call("verify_order", { order_id: "HM-100101", phone_last4: "4417" }, { session: "t1" })).status === "ok");
check("Finance calling get_delivery_info: tool_not_permitted", (await call("get_delivery_info", { order_id: "HM-100101" }, { session: "t1", agent: "finance" })).error.code === "tool_not_permitted");
const d = await call("get_delivery_info", { order_id: "HM-100101" }, { session: "t1", agent: "fulfilment" });
check(`Fulfilment lookup: window ${d.data && d.data.delivery_window}`, d.status === "ok" && d.data.delivery_window === "Wed 28 Oct 2026 to Fri 30 Oct 2026");
check("Another session cannot read the verified order", (await call("get_delivery_info", { order_id: "HM-100101" }, { session: "t2", agent: "fulfilment" })).error.code === "order_not_verified");
console.log(`\n${pass} passed, ${fail} failed`);
child.kill();
process.exit(fail ? 1 : 0);
