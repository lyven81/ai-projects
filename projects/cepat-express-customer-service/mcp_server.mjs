// Cepat Express Customer Service: MCP server (stdio).
//
// Resources: the Courier Policy, the Customer Service Policy, the Delivery Status Guide (policy://) and the staff
//            directory (staff://directory). The parcel data is not a resource: it is served only through the tools.
// Tools:     the 4 tools in tools.js, with every limit, check, route and fixed sentence in code.
//
// Host context comes in the request's _meta, never from the model: { session } names the chat, so a phone match
// holds only for the chat it was made in. Env: CX_STATE (data folder, default ./data; handovers written through),
// CX_NOW (system "today", default policy_tables.json).
// Run: node mcp_server.mjs   (or register it in .mcp.json for Claude Code)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createDesk } = require("./tools.js");

const dir = process.env.CX_STATE || join(HERE, "data");
const cache = { parcels: JSON.parse(readFileSync(join(dir, "parcels.json"), "utf8")), handovers: JSON.parse(readFileSync(join(dir, "handovers.json"), "utf8")) };
const store = { get: (n) => cache[n], set: (n, v) => { cache[n] = v; writeFileSync(join(dir, `${n}.json`), JSON.stringify(v, null, 1)); } };
const tables = JSON.parse(readFileSync(join(HERE, "resources", "policy_tables.json"), "utf8"));
const staff = JSON.parse(readFileSync(join(HERE, "resources", "staff-directory.json"), "utf8"));
const resources = tables.resources.map((r) => ({ uri: r.uri, name: r.name, mimeType: r.file.endsWith(".json") ? "application/json" : "text/markdown",
  text: readFileSync(join(HERE, "resources", r.file), "utf8") }));

const desk = createDesk(store, tables, staff, { now: process.env.CX_NOW || tables.today });
const sessions = new Map();
const sessionFor = (id) => { if (!sessions.has(id)) sessions.set(id, desk.newSession(id)); return sessions.get(id); };

const server = new Server({ name: "cepat-express-customer-service", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) }));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = resources.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text }] };
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(desk.TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.input_schema })),
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const session = sessionFor(typeof meta.session === "string" ? meta.session : "default");
  const { result } = await desk.call(session, req.params.name, req.params.arguments || {});
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: result.status !== "ok" };
});

await server.connect(new StdioServerTransport());
