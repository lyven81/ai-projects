// Happy Mart routing agent: MCP server (stdio).
//
// Resources: the six department policies, the router workbook, the five role sheets and the contact list
//            (policy://, workbook://router, role://, contacts://staff). The order data is not a resource: it is
//            served only through the tools and their hooks.
// Tools:     the 17 tools in tools.js, every call through the shared PreToolUse and PostToolUse hooks.
//
// Host context comes in the request's _meta, never from the model: { session } names the conversation and
// { agent } the calling agent (router, fulfilment, returns, finance, claims, marketing, synthesis). The
// session holds the verified order. The agent sees only the result shape; the hook record goes back in the
// result's _meta for the routing panel and the benchmark. ask_specialist and compose_reply run the
// sub-agents, so they need ANTHROPIC_API_KEY in the server's environment.
// Env: HM_STATE (data folder, default ./data; written through on every change), HM_NOW (Unix seconds),
// HM_FAULTS (JSON, benchmark fault injection), ANTHROPIC_API_KEY.
// Run: node mcp_server.mjs   (or register it in .mcp.json for Claude Code)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema, CallToolRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createDesk } = require("./tools.js");
const { createAgents } = require("./agent.js");

const dir = process.env.HM_STATE || join(HERE, "data");
const cache = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) cache[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf8"));
const store = {
  get: (n) => cache[n],
  set: (n, v) => { cache[n] = v; writeFileSync(join(dir, `${n}.json`), JSON.stringify(v)); },
};
const tables = JSON.parse(readFileSync(join(HERE, "resources", "policy_tables.json"), "utf8"));
const clauses = JSON.parse(readFileSync(join(HERE, "resources", "clauses.json"), "utf8"));
const resources = tables.resources.map((r) => ({ uri: r.uri, name: r.name, for: r.for, text: readFileSync(join(HERE, "resources", r.file), "utf8") }));

let desk;
const agents = createAgents({ apiKey: process.env.ANTHROPIC_API_KEY, desk: () => desk, resources });
desk = createDesk(store, tables, clauses, {
  now: Number(process.env.HM_NOW) || tables.now,
  faults: process.env.HM_FAULTS ? JSON.parse(process.env.HM_FAULTS) : {},
  runSpecialist: agents.runSpecialist, runSynthesis: agents.runSynthesis,
});
const sessions = new Map();
function sessionFor(id) {
  if (!sessions.has(id)) { const s = desk.newSession(); desk.beginTurn(s, ""); sessions.set(id, s); }
  return sessions.get(id);
}

const server = new Server({ name: "happymart-routing-desk", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: resources.map(({ uri, name }) => ({ uri, name, mimeType: "text/markdown" })),
}));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = resources.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  return { contents: [{ uri: r.uri, mimeType: "text/markdown", text: r.text }] };
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(desk.TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.input_schema })),
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const agent = typeof meta.agent === "string" ? meta.agent : "router";  // the host, never the model
  const session = sessionFor(typeof meta.session === "string" ? meta.session : "default");
  if (typeof meta.message === "string") desk.beginTurn(session, meta.message);  // a new customer message starts a turn
  const { result, hook } = await desk.call(session, agent, req.params.name, req.params.arguments || {});
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: result.status !== "ok", _meta: { hook } };
});

await server.connect(new StdioServerTransport());
