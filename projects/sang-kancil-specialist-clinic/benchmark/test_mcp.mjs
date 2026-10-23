// The MCP round trip, no API key: the resources and tools each role is given, the Fee Schedule served only
// to the clerk and the lead, and calls through the server with the staff ID in _meta (a staff ID in the
// arguments changes nothing). Uses a temporary copy of the data. Run: node benchmark/test_mcp.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListResourcesResultSchema, ListToolsResultSchema, ReadResourceResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "sk-mcp-"));
cpSync(join(ROOT, "data"), tmp, { recursive: true });
const client = new Client({ name: "test", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [join(ROOT, "mcp_server.mjs")], env: { ...process.env, SK_STATE: tmp } }));
let failed = 0;
const check = (n, c) => { console.log(`${c ? "ok  " : "FAIL"} ${n}`); if (!c) failed++; };
const req = (method, params, schema) => client.request({ method, params }, schema);
const call = async (name, args, staff) => {
  const r = await req("tools/call", { name, arguments: args, _meta: { staff } }, CallToolResultSchema);
  return { result: JSON.parse(r.content[0].text), hook: r._meta && r._meta.hook };
};
const resources = async (staff) => (await req("resources/list", { _meta: { staff } }, ListResourcesResultSchema)).resources.map((r) => r.uri);
const tools = async (staff) => (await req("tools/list", { _meta: { staff } }, ListToolsResultSchema)).tools.map((t) => t.name);

check("Nurul Huda: eight resources, the Fee Schedule among them", (await resources("FD-02-01")).length === 8);
check("Dr Aisyah: eight resources", (await resources("PD-01-01")).includes("reference://fee-schedule"));
check("Dr Daniel: seven resources, no Fee Schedule", (await resources("PD-02-01")).length === 7 && !(await resources("PD-02-01")).includes("reference://fee-schedule"));
let refused = false;
try { await req("resources/read", { uri: "reference://fee-schedule", _meta: { staff: "PD-02-02" } }, ReadResourceResultSchema); } catch (e) { refused = /restricted/.test(e.message); }
check("Dr Priya: reading the Fee Schedule is refused", refused);
const pol = await req("resources/read", { uri: "policy://clinic", _meta: { staff: "PD-02-02" } }, ReadResourceResultSchema);
check("Clinic Policy readable, cites CP-09", pol.contents[0].text.includes("CP-09"));
check("no patient directory resource", !(await resources("FD-02-01")).some((u) => /patient|directory/.test(u)));
const tn = await tools("FD-02-01"), td = await tools("PD-02-01");
check("the clerk gets book_appointment and record_payment, not close_visit or find_patients", tn.includes("book_appointment") && tn.includes("record_payment") && !tn.includes("close_visit") && !tn.includes("find_patients"));
check("a doctor gets close_visit and find_patients, not book_appointment or record_payment", td.includes("close_visit") && td.includes("find_patients") && !td.includes("book_appointment") && !td.includes("record_payment"));
const a = await call("retrieve_patient_record", { patient: "Aiman", view: "clinical", staff_id: "PD-02-01" }, "PD-01-01");
check("Dr Aisyah refused Aiman's clinical view, Dr Daniel named, even with his ID in the arguments", a.result.error.code === "not_attending" && a.result.next_step.staff_id === "PD-02-01");
check("hook record in _meta: PreToolUse blocked, lead capacity recorded", a.hook && a.hook.pre.verdict === "block" && a.hook.tool_ran === false && a.hook.capacity === "lead");
const b = await call("retrieve_patient_record", { patient: "Arjun", view: "billing" }, "FD-02-01");
check("Nurul Huda reads Arjun's RM 185.00 outstanding", b.result.status === "ok" && b.result.data.total_outstanding === "RM 185.00");
const c = await call("list_my_actions", {}, null);
check("no session: refused", c.result.error.code === "no_session");
await client.close();
rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
