// Pak Razif Garden MCP server (stdio).
//
// Resources: resource://operation, resource://work-schedule, resource://quotation,
//            resource://service-area, resource://site-visit, resource://faq (the six resources)
// Tools:     the 6 tools in tools.js, the same file the pages and the benchmark load.
//
// One server process = one conversation: the session (first contact, photos attached,
// visits booked, the customer's words already forwarded) lives in this process.
// Host context comes in the request's _meta, never from the model:
//   { turn, uploads, message, history, contact, first_contact }
// the turn number, photo IDs attached with this message, the customer's words (this message
// and the earlier ones), the chat contact, and the date the customer first made contact.
//
// Env: HG_STATE (state file, default ./calendar.state.json, copied from calendar.json when
// missing, so the seed is never written), HG_NOW (demo now, default 2026-10-17T10:00).
// Run: node mcp_server.mjs   (or register it in .mcp.json for Claude Code)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
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
const { createAssistant, RESOURCE_LIST, DEFAULT_NOW } = require("./tools.js");

const statePath = process.env.HG_STATE || join(HERE, "calendar.state.json");
if (!existsSync(statePath)) copyFileSync(join(HERE, "calendar.json"), statePath);
const store = {
  load: () => JSON.parse(readFileSync(statePath, "utf8")),
  save: (state) => writeFileSync(statePath, JSON.stringify(state, null, 1)),
};

const resourceText = Object.fromEntries(RESOURCE_LIST.map((r) => [r.key, readFileSync(join(HERE, "resources", r.file), "utf8")]));
const assistant = createAssistant(store, { now: process.env.HG_NOW || DEFAULT_NOW });

const server = new Server(
  { name: "pak-razif-the-gardener", version: "2.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCE_LIST.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = RESOURCE_LIST.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: resourceText[r.key] }] };
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: assistant.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const ctx = {
    turn: Number(meta.turn) || 0, uploads: Array.isArray(meta.uploads) ? meta.uploads : [],
    message: typeof meta.message === "string" ? meta.message : "", history: Array.isArray(meta.history) ? meta.history : [],
    contact: meta.contact || null, first_contact: typeof meta.first_contact === "string" ? meta.first_contact : "",
  };
  const result = assistant.call(req.params.name, req.params.arguments || {}, ctx);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.ok === false,
  };
});

await server.connect(new StdioServerTransport());
