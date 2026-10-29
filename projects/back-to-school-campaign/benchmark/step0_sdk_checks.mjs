// Step 0 SDK checks (Build List section 13), two small runs on Haiku 5.5.
// (a) Does a PostToolUse hook fire on an MCP tool called by a subagent, and does its result reach the coordinator?
// (b) Does forcing extract_facts first work under query(), with a PreToolUse gate that denies any other tool until it has run?
// Writes benchmark/step0-results.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const HERE = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch { /* no ~/.env */ }
}
if (!process.env.ANTHROPIC_API_KEY) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

const MODEL = "claude-haiku-5-5";
const log = [];
const note = (e) => { log.push({ t: Date.now(), ...e }); };

function server() {
  return createSdkMcpServer({
    name: "kiddoz", version: "0.0.1",
    tools: [
      tool("extract_facts", "Turn the owner's brief into campaign facts. Run this first.", { brief: z.string() },
        async ({ brief }) => { note({ ev: "tool", name: "extract_facts" }); return { content: [{ type: "text", text: JSON.stringify({ facts: [{ id: "F1", sku: "PB01", promo: "RM20.00" }], brief }) }] }; }),
      tool("write_whatsapp", "Return the WhatsApp broadcast copy.", { copy: z.string() },
        async ({ copy }) => { note({ ev: "tool", name: "write_whatsapp", copy }); return { content: [{ type: "text", text: "saved" }] }; }),
    ],
  });
}

const usage = [];
async function run(label, prompt, opts) {
  const t0 = Date.now();
  const msgs = [];
  for await (const m of query({ prompt, options: {
    model: MODEL, settingSources: [], tools: ["Agent"], permissionMode: "dontAsk",
    mcpServers: { kiddoz: server() }, maxTurns: 12, persistSession: false, ...opts,
  } })) {
    if (m.type === "assistant") for (const b of m.message.content || []) if (b.type === "tool_use") note({ ev: "tool_use", run: label, name: b.name, sub: !!m.parent_tool_use_id });
    if (m.type === "result") { usage.push({ run: label, usage: m.usage, modelUsage: m.modelUsage, cost: m.total_cost_usd }); msgs.push({ result: m.subtype, text: m.result }); }
  }
  return { label, ms: Date.now() - t0, msgs };
}

// (a) hook on a subagent's tool
const hookFired = [];
const a = await run("a", "Start the whatsapp_writer subagent and ask it to write a short WhatsApp line for PB01 at RM20.00. Then report what it returned.", {
  allowedTools: ["Agent", "mcp__kiddoz__write_whatsapp"],
  agents: { whatsapp_writer: { description: "Writes the WhatsApp broadcast.", prompt: "Write the copy you are asked for and return it by calling write_whatsapp. Nothing else.", tools: ["mcp__kiddoz__write_whatsapp"], model: MODEL } },
  hooks: { PostToolUse: [{ matcher: "mcp__kiddoz__write_whatsapp", hooks: [async (input) => {
    hookFired.push({ tool: input.tool_name, agent_id: input.agent_id || null, agent_type: input.agent_type || null });
    return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "HOOK_CHECK: FAIL, RM18 found in the copy; the listed promotion price is RM20.00." } };
  }] }] },
});

// (b) extract_facts forced first: the prompt asks to go straight to the writer
const gate = { factsDone: false, denied: [] };
const b = await run("b", "Skip any preparation. Immediately start the whatsapp_writer subagent for PB01 at RM20.00.", {
  allowedTools: ["Agent", "mcp__kiddoz__extract_facts", "mcp__kiddoz__write_whatsapp"],
  agents: { whatsapp_writer: { description: "Writes the WhatsApp broadcast.", prompt: "Write the copy you are asked for and return it by calling write_whatsapp.", tools: ["mcp__kiddoz__write_whatsapp"], model: MODEL } },
  hooks: { PreToolUse: [{ hooks: [async (input) => {
    if (input.agent_id) return {};
    if (input.tool_name === "mcp__kiddoz__extract_facts") { gate.factsDone = true; return {}; }
    if (!gate.factsDone) {
      gate.denied.push(input.tool_name);
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "extract_facts must run first, on the owner's brief." } };
    }
    return {};
  }] }] },
});

const toolOrder = (lbl) => log.filter((e) => e.ev === "tool_use" && e.run === lbl).map((e) => (e.sub ? "sub:" : "") + e.name);
const out = {
  model: MODEL, sdk: "0.3.312", at: new Date().toISOString(),
  a: { hookFired, subagentToolCalls: toolOrder("a").filter((x) => x.startsWith("sub:")), coordinatorSawHookText: /RM18|HOOK_CHECK|RM20/i.test(a.msgs.map((m) => m.text).join(" ")), finalText: a.msgs.map((m) => m.text).join("\n").slice(0, 600), ms: a.ms },
  b: { toolOrder: toolOrder("b"), denied: gate.denied, firstRealTool: log.find((e) => e.ev === "tool" && ["extract_facts", "write_whatsapp"].includes(e.name))?.name, finalText: b.msgs.map((m) => m.text).join("\n").slice(0, 400), ms: b.ms },
  usage,
  cost_usd: usage.reduce((s, u) => s + (u.cost || 0), 0),
};
fs.writeFileSync(path.join(HERE, "step0-results.json"), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ a: { hookFired, sub: out.a.subagentToolCalls, coordinatorSawHookText: out.a.coordinatorSawHookText }, b: { order: out.b.toolOrder, denied: gate.denied, first: out.b.firstRealTool }, cost_usd: out.cost_usd }, null, 1));
