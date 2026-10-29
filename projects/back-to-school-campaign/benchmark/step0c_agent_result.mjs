// Step 0 follow-up (c): can a main-thread PostToolUse hook on the Agent tool replace what the coordinator receives
// with the runner's own record of the writer's check? Also logs every tool result in (b)'s order.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"; import { z } from "zod";
const HERE = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.ANTHROPIC_API_KEY) { const l = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((x) => /^\s*ANTHROPIC_API_KEY\s*=/.test(x)); if (l) process.env.ANTHROPIC_API_KEY = l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, ""); }
const MODEL = "claude-haiku-5-5"; const ev = []; const checks = {};
const srv = createSdkMcpServer({ name: "kiddoz", version: "0.0.1", tools: [
  tool("extract_facts", "Turn the owner's brief into campaign facts. Run this first.", { brief: z.string() }, async () => { ev.push("handler:extract_facts"); return { content: [{ type: "text", text: '{"facts":[{"id":"F1","sku":"PB01","promo":"RM20.00"}]}' }] }; }),
  tool("write_whatsapp", "Return the WhatsApp copy.", { copy: z.string() }, async () => { ev.push("handler:write_whatsapp"); return { content: [{ type: "text", text: "saved" }] }; }),
] });
let done = false; let seenByCoordinator = ""; let cost = 0;
for await (const m of query({ prompt: "Run extract_facts on the brief 'PB01 at RM20.00', then start whatsapp_writer for it. Report exactly the result the Agent tool returned to you.", options: {
  model: MODEL, settingSources: [], tools: ["Agent"], permissionMode: "dontAsk", persistSession: false, maxTurns: 10,
  mcpServers: { kiddoz: srv }, allowedTools: ["Agent", "mcp__kiddoz__extract_facts", "mcp__kiddoz__write_whatsapp"],
  agents: { whatsapp_writer: { description: "Writes the WhatsApp broadcast.", prompt: "Write the copy and call write_whatsapp. Then say: I wrote it beautifully.", tools: ["mcp__kiddoz__write_whatsapp"], model: MODEL } },
  hooks: {
    PreToolUse: [{ hooks: [async (i) => { if (!i.agent_id && i.tool_name !== "mcp__kiddoz__extract_facts" && !done) return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "extract_facts first" } }; if (i.tool_name === "mcp__kiddoz__extract_facts") done = true; return {}; }] }],
    PostToolUse: [
      { matcher: "mcp__kiddoz__write_whatsapp", hooks: [async (i) => { checks.whatsapp = { status: "failed_check", error: "RM18.00 in copy; listed promotion price RM20.00 (F1)", agent_id: i.agent_id }; ev.push("hook:writer:" + (i.agent_id ? "sub" : "main")); return {}; }] },
      { matcher: "Agent", hooks: [async (i) => { ev.push("hook:Agent:" + (i.agent_id ? "sub" : "main")); return { hookSpecificOutput: { hookEventName: "PostToolUse", updatedToolOutput: JSON.stringify({ channel: "whatsapp", record: checks.whatsapp || null }) } }; }] },
    ],
  } } })) {
  if (m.type === "user" && !m.parent_tool_use_id) for (const b of m.message.content || []) if (b.type === "tool_result") { const t = typeof b.content === "string" ? b.content : JSON.stringify(b.content); ev.push("result:" + t.slice(0, 160)); seenByCoordinator += t; }
  if (m.type === "assistant" && !m.parent_tool_use_id) for (const b of m.message.content || []) if (b.type === "tool_use") ev.push("call:" + b.name);
  if (m.type === "result") { cost = m.total_cost_usd; ev.push("final:" + (m.result || "").slice(0, 300)); }
}
const out = { ev, coordinatorGotRecord: /failed_check/.test(seenByCoordinator), coordinatorGotWriterProse: /beautifully/i.test(seenByCoordinator), cost };
fs.writeFileSync(path.join(HERE, "step0c-results.json"), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
