// Comel Diaper MCP server (stdio), for Claude Code through .mcp.json.
// Resources: comel://business-profile, comel://metric-definitions, comel://review-policy, comel://planning-rules
// Tools: get_performance, get_campaign, propose_change, check_plan, from tools.js (the same functions server.mjs,
// the benchmark and the workspace use). The plan file is data/plan.json, shared with the owner workspace.
// One server process is one conversation: the figure IDs returned so far live in this process.
import fs from "node:fs";
import path from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ROOT, makeDesk, fileStore, loadConfig } from "./lib/load.mjs";

const RESOURCES = ["business-profile", "metric-definitions", "review-policy", "planning-rules"].map((n) => ({
  uri: `comel://${n}`, name: n, mimeType: "text/markdown", file: path.join(ROOT, "resources", `${n}.md`) }));
const logFile = path.join(ROOT, "logs", "tool-log.jsonl");
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const lines = { push: (e) => fs.appendFileSync(logFile, JSON.stringify(e) + "\n") };
const desk = makeDesk({ config: loadConfig(process.env.COMEL_TODAY ? { today: process.env.COMEL_TODAY } : {}),
  store: fileStore(path.join(ROOT, "data", "plan.json")), logLines: lines });

const server = new Server({ name: "comel-diaper", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) }));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = RESOURCES.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: fs.readFileSync(r.file, "utf8") }] };
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: desk.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const result = desk.call(req.params.name, req.params.arguments || {});
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: result.ok === false };
});
await server.connect(new StdioServerTransport());
