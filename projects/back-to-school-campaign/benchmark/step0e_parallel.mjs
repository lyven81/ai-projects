// Step 0 follow-up (e): exam TS 1.3 wording. "Task" (not "Agent") in tools and allowedTools; two writers must be
// spawned as two Task calls in ONE coordinator response, and their run times must overlap.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"; import { z } from "zod";
const HERE = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.ANTHROPIC_API_KEY) { const l = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((x) => /^\s*ANTHROPIC_API_KEY\s*=/.test(x)); if (l) process.env.ANTHROPIC_API_KEY = l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, ""); }
const MODEL = "claude-haiku-5-5"; const span = {}; const responses = [];
const w = (ch) => tool(`write_${ch}`, `Return the ${ch} copy.`, { copy: z.string() }, async () => ({ content: [{ type: "text", text: "saved" }] }));
const srv = createSdkMcpServer({ name: "kiddoz", version: "0.0.1", tools: [w("whatsapp"), w("instagram")] });
let cost = 0, initTools = null;
for await (const m of query({ prompt: "Campaign: PB01 at RM20.00, 26 to 30 October 2026. Goal: a WhatsApp broadcast and an Instagram caption in Santai Bahasa Melayu. Start both writers.", options: {
  model: MODEL, settingSources: [], tools: ["Task"], allowedTools: ["Task", "mcp__kiddoz__write_whatsapp", "mcp__kiddoz__write_instagram"],
  permissionMode: "dontAsk", persistSession: false, maxTurns: 8, mcpServers: { kiddoz: srv },
  systemPrompt: "You coordinate a copy team. Independent writing tasks are started together, in one response.",
  agents: {
    whatsapp_writer: { description: "Writes the WhatsApp broadcast.", prompt: "Write the copy and call write_whatsapp once. Reply: done.", tools: ["mcp__kiddoz__write_whatsapp"], model: MODEL },
    instagram_writer: { description: "Writes the Instagram caption.", prompt: "Write the copy and call write_instagram once. Reply: done.", tools: ["mcp__kiddoz__write_instagram"], model: MODEL },
  },
  hooks: {
    PreToolUse: [{ matcher: "Agent|Task", hooks: [async (i) => { span[i.tool_use_id] = { type: i.tool_input?.subagent_type, start: Date.now() }; return {}; }] }],
    PostToolUse: [{ matcher: "Agent|Task", hooks: [async (i) => { if (span[i.tool_use_id]) span[i.tool_use_id].end = Date.now(); return {}; }] }],
  } } })) {
  if (m.type === "system" && m.subtype === "init") initTools = m.tools;
  if (m.type === "assistant" && !m.parent_tool_use_id) { const calls = (m.message.content || []).filter((b) => b.type === "tool_use").map((b) => b.name + ":" + (b.input?.subagent_type || "")); if (calls.length) responses.push({ id: m.message.id, calls }); }
  if (m.type === "result") cost = m.total_cost_usd;
}
const byMsg = {}; for (const r of responses) (byMsg[r.id] = byMsg[r.id] || []).push(...r.calls);
const s = Object.values(span); const overlap = s.length === 2 && s[0].start < s[1].end && s[1].start < s[0].end;
const out = { initToolsHasAgent: initTools?.includes("Agent"), initToolsHasTask: initTools?.includes("Task"), spawnsPerResponse: byMsg, spans: s, overlap, cost };
fs.writeFileSync(path.join(HERE, "step0e-results.json"), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
