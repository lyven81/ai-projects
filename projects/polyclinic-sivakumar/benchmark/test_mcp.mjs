// The MCP round trip, no API key: the tools and resources each person is offered, then calls through the
// server with the staff ID in _meta. Checks that the role comes from the session (a staff ID typed into the
// arguments changes nothing), that a refusal's sentence is written in code, that a handover reaches its
// receiver as a notice, that the hook record comes back in _meta, and that the pharmacist is served neither
// the Price List nor the Panel Price Schedule. Uses a temporary copy of the data. Run: node benchmark/test_mcp.mjs
import { spawn } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "ps-mcp-"));
cpSync(join(ROOT, "data"), tmp, { recursive: true });
const meta = JSON.parse(readFileSync(join(ROOT, "data", "meta.json"), "utf8"));
const P = Object.fromEntries(JSON.parse(readFileSync(join(ROOT, "data", "patients.json"), "utf8")).map((p) => [p.id, p]));
const child = spawn(process.execPath, [join(ROOT, "mcp_server.mjs")], { env: { ...process.env, PS_STATE: tmp, PS_NOW: String(meta.now) }, stdio: ["pipe", "pipe", "pipe"] });
let buf = "", n = 0;
const waiting = new Map();
child.stdout.on("data", (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); }
  }
});
const rpc = (method, params) => new Promise((res, rej) => { const id = ++n; waiting.set(id, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result))); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
let failed = 0, passed = 0;
const t = (name, cond, d) => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${d ? ": " + d : ""}`); } };
const call = async (staff, name, args) => { const r = await rpc("tools/call", { name, arguments: args, _meta: { staff } }); return { result: JSON.parse(r.content[0].text), hook: r._meta && r._meta.hook, isError: r.isError }; };

try {
  await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const tools = async (s) => (await rpc("tools/list", { _meta: { staff: s } })).tools.map((x) => x.name).sort().join(",");
  t("front desk offered 5 tools", (await tools("FD-01")) === "billing,documents,patient,schedule,tasks");
  t("GP offered 5 tools", (await tools("GP-01")) === "billing,patient,record_consultation,schedule,tasks");
  t("pharmacist offered 3 tools", (await tools("PH-01")) === "dispense,patient,tasks");
  t("no session, no tools", (await tools(null)) === "");
  const gpBilling = (await rpc("tools/list", { _meta: { staff: "GP-01" } })).tools.find((x) => x.name === "billing").inputSchema.properties.action.enum;
  t("the GP's billing lists only the GP's actions", gpBilling.length === 5 && !gpBilling.includes("record_payment"), gpBilling.join(","));
  const res = async (s) => (await rpc("resources/list", { _meta: { staff: s } })).resources.map((x) => x.uri);
  t("five resources for the desk", (await res("FD-01")).length === 5);
  const ph = await res("PH-01");
  t("pharmacist not served prices or panels", ph.length === 3 && !ph.includes("reference://price-list") && !ph.includes("policy://panel"), ph.join(","));
  let refused = false;
  try { await rpc("resources/read", { uri: "policy://panel", _meta: { staff: "PH-01" } }); } catch (e) { refused = true; }
  t("pharmacist read of the panel schedule refused", refused);
  const read = await rpc("resources/read", { uri: "policy://after-consultation", _meta: { staff: "PH-01" } });
  t("pharmacist reads After the Consultation", read.contents[0].text.includes("PS-AC-02"));

  const a2 = P[meta.who.a2];
  const x = await call("GP-01", "billing", { action: "record_payment", bill_id: "BL-0003", amount_rm: 37, method: "cash", name: a2.name, ic_last4: a2.ic_last4, staff: "FD-01" });
  t("the GP is refused even with FD-01 in the arguments", x.result.status === "refused" && x.result.error.code === "not_offered" && x.isError);
  t("refusal sentence written in code", x.result.next_step.say === "I'm sorry, you can't record payments. Only Siti Kasim, clinic assistant, can record a payment.");
  t("hook record in _meta", x.hook && x.hook.pre.verdict === "block");
  const q1 = P[meta.who.q1];
  const r = await call("FD-01", "tasks", { action: "hand_over", matter: "outside_policy", question: "a hospital specialist's prescription", name: q1.name, ic_last4: q1.ic_last4 });
  t("handover sent", r.result.status === "ok" && r.result.next_step.say.startsWith("Sent to Dr Sivakumar"));
  const l = await call("GP-01", "tasks", { action: "list" });
  t("the GP's list shows the handover and its notice", l.result.data.tasks.some((k) => k.reason === "D4") && l.result.data.notices.some((s) => s.startsWith("Siti Kasim has handed")));
  const disk = JSON.parse(readFileSync(join(tmp, "tasks.json"), "utf8"));
  t("written through to disk", disk.some((k) => k.reason === "D4"));
} catch (e) {
  failed++;
  console.log("ERROR", e.message);
} finally {
  child.stdin.end(); child.kill();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
