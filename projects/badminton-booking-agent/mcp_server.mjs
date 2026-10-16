// Subang Badminton Arena MCP server (stdio).
//
// Resources: policy://operation, policy://booking, policy://cancellation (the three policies)
// Tools:     the 9 tools in tools.js, the same file the pages and the benchmark load.
//
// One server process = one conversation: the session (verified and own bookings, failed
// checks, quotes, handovers per turn) lives in this process.
// Host context comes in the request's _meta, never from the model: { turn, uploads, message, contact }:
// the turn number, images uploaded with this message, the player's words, and the chat contact.
//
// Env: BB_STATE (state file, default ./badminton_bookings.json), BB_NOW (demo now,
// default 2026-10-16T10:00), BB_FAULTS (JSON, benchmark fault injection).
// Run: node mcp_server.mjs   (or register it in .mcp.json for Claude Code)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
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
const { createCentre, RESOURCE_LIST } = require("./tools.js");

const statePath = process.env.BB_STATE || join(HERE, "badminton_bookings.json");
const store = {
  load: () => JSON.parse(readFileSync(statePath, "utf8")),
  save: (state) => writeFileSync(statePath, JSON.stringify(state, null, 1)),
};

const resourceText = Object.fromEntries(RESOURCE_LIST.map((r) => [r.key, readFileSync(join(HERE, "resources", r.file), "utf8")]));
const clauses = JSON.parse(readFileSync(join(HERE, "resources", "clauses.json"), "utf8"));
const centre = createCentre(store, { clauses }, {
  now: process.env.BB_NOW || "2026-10-16T10:00",
  faults: process.env.BB_FAULTS ? JSON.parse(process.env.BB_FAULTS) : {},
});

const server = new Server(
  { name: "badminton-booking", version: "2.0.0" },
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
  tools: centre.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const ctx = { turn: Number(meta.turn) || 0, uploads: Array.isArray(meta.uploads) ? meta.uploads : [],
                message: typeof meta.message === "string" ? meta.message : "", contact: meta.contact || null };
  const result = centre.call(req.params.name, req.params.arguments || {}, ctx);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.ok === false,
  };
});

await server.connect(new StdioServerTransport());
