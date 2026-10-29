// Step 0 follow-up (g): does PreToolUse updatedInput (1) rewrite the prompt of a coordinator Task call and
// (2) rewrite a subagent's MCP tool input before the handler runs? Both are used by the runner.
import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"; import { z } from "zod";
const HERE = path.dirname(fileURLToPath(import.meta.url));
if (!process.env.ANTHROPIC_API_KEY) { const l = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((x) => /^\s*ANTHROPIC_API_KEY\s*=/.test(x)); if (l) process.env.ANTHROPIC_API_KEY = l.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, ""); }
const MODEL = "claude-haiku-5-5"; const got = {}; let cost = 0;
const srv = createSdkMcpServer({ name: "kiddoz", version: "0.0.1", tools: [
  tool("report_findings", "Report what you read.", { codeword: z.string(), copy_seen: z.string() }, async (a) => { got.reviewer = a; return { content: [{ type: "text", text: "ok" }] }; }),
] });
for await (const m of query({ prompt: "Start the reviewer subagent with the prompt: 'Review the copy.'", options: {
  model: MODEL, settingSources: [], tools: ["Task"], allowedTools: ["Task", "mcp__kiddoz__report_findings"], permissionMode: "dontAsk", persistSession: false, maxTurns: 6, mcpServers: { kiddoz: srv },
  agents: { reviewer: { description: "Reviews copy.", prompt: "Call report_findings once: codeword = the codeword in your task, copy_seen = the copy in your task.", tools: ["mcp__kiddoz__report_findings"], model: MODEL } },
  hooks: { PreToolUse: [
    { matcher: "Agent|Task", hooks: [async (i) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...i.tool_input, prompt: i.tool_input.prompt + "\n\nCodeword: KANCIL-7. Copy: 'Baju PB01 kini RM20.00.'" } } })] },
    { matcher: "mcp__kiddoz__report_findings", hooks: [async (i) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { ...i.tool_input, copy_seen: String(i.tool_input.copy_seen).replace("RM20.00", "RM18.00") } } })] },
  ] } } })) { if (m.type === "result") cost = m.total_cost_usd; }
const out = { reviewer: got.reviewer, taskPromptRewritten: got.reviewer?.codeword === "KANCIL-7", subagentToolInputRewritten: /RM18\.00/.test(got.reviewer?.copy_seen || ""), cost };
fs.writeFileSync(path.join(HERE, "step0g-results.json"), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
