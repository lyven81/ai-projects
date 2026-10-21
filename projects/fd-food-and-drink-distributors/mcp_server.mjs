// FD Food and Drink Distributors staff desk: MCP server (stdio).
//
// Resources: policy://management, policy://sales, policy://finance, policy://warehouse,
//            catalogue://products, directory://customers
// Tools:     the six tools in tools.js, every call through the shared PreToolUse and PostToolUse hooks.
//
// Host context comes in the request's _meta, never from the model: { staff } is the staff ID chosen
// at sign-in (MP-08). A tool argument naming a staff member is ignored. The agent sees only the
// result shape; the hook record (checks, raw tool output, PostToolUse changes) goes back in the
// result's _meta for the hook view and the benchmark.
//
// Env: HP_STATE (data folder, default ./data; written through on every change), HP_NOW (Unix
// seconds, default the test calendar in meta.json), HP_FAULTS (JSON, benchmark fault injection).
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
const { createDesk, RESOURCE_LIST } = require("./tools.js");

const dir = process.env.HP_STATE || join(HERE, "data");
const cache = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) cache[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf8"));
if (!cache.call_log) cache.call_log = [];
const store = {
  get: (n) => cache[n],
  set: (n, v) => { cache[n] = v; writeFileSync(join(dir, `${n}.json`), JSON.stringify(v, null, 1)); },
};
const tables = JSON.parse(readFileSync(join(HERE, "resources", "policy_tables.json"), "utf8"));
const desk = createDesk(store, tables, {
  now: Number(process.env.HP_NOW) || cache.meta.now,
  faults: process.env.HP_FAULTS ? JSON.parse(process.env.HP_FAULTS) : {},
});
const resourceText = Object.fromEntries(RESOURCE_LIST.map((r) => [r.uri, readFileSync(join(HERE, "resources", r.file), "utf8")]));

const server = new Server(
  { name: "fd-staff-desk", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCE_LIST.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = RESOURCE_LIST.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: resourceText[r.uri] }] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: desk.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const staff = typeof meta.staff === "string" ? meta.staff : null;  // the session, never the model
  const { result, hook } = desk.call(req.params.name, req.params.arguments || {}, staff);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.status !== "ok",
    _meta: { hook },
  };
});

await server.connect(new StdioServerTransport());
