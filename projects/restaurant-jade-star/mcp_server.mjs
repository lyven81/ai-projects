// Jade Star Chinese Dining 吉星饭厅: the MCP server (stdio) for the restaurant assistant.
//
// Resources: R1 Restaurant Policy (policy://restaurant), R2 Room and Table Guide (guide://rooms),
//            R3 Booking Calendar (calendar://december-2026), R4 Handover Guide (guide://handover).
// Tools:     the 4 tools in tools.js (T1 to T4), with every limit, check and fixed sentence in code.
//
// Host context comes in each request's _meta, never from the model: { conversation, name, phone, route }. A call
// without it is refused by PreToolUse (NO_HOST_CONTEXT).
// Env: JS_STATE (a state file to start from, default data/state.json, read once; the server keeps its own copy in
// memory), JS_NOW (the clock, default the test clock Mon 14 Dec 2026 2:00pm; "real" for the wall clock),
// JS_SERVICE_DOWN=1 (the booking service unavailable).
// Run: node mcp_server.mjs   (or register it in .mcp.json for Claude Code)

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const B = require("./lib/booking.js");
const { createDesk } = require("./tools.js");

const config = JSON.parse(readFileSync(join(HERE, "resources", "restaurant.json"), "utf8"));
const state = JSON.parse(readFileSync(process.env.JS_STATE || join(HERE, "data", "state.json"), "utf8"));
const start = Date.now();
const t0 = process.env.JS_NOW === "real" ? null : B.ms(process.env.JS_NOW || config.today);
const clock = () => (t0 == null ? Date.now() + 8 * 3600 * 1000 : t0 + (Date.now() - start));
const booking = B.createBooking({ config, state, clock });
if (process.env.JS_SERVICE_DOWN === "1") booking.flags.serviceDown = true;
const desk = createDesk({ booking });

const resources = config.resources.map((r) => ({ uri: r.uri, name: `${r.id} ${r.name}`, mimeType: "text/markdown", text: readFileSync(join(HERE, "resources", r.file), "utf8") }));
const sessions = new Map();
function sessionFor(meta) {
  const id = typeof meta.conversation === "string" ? meta.conversation : null;
  if (!id) return { conversation: null, events: [] };
  if (!sessions.has(id)) sessions.set(id, desk.newSession({ conversation: id, name: meta.name, phone: meta.phone, route: meta.route }));
  return sessions.get(id);
}

const server = new Server({ name: "jade-star-booking-desk", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });
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
  const session = sessionFor(meta);
  if (typeof meta.message === "string") session.last_message = meta.message;
  const { result } = await desk.call(session, req.params.name, req.params.arguments || {});
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: result.status !== "ok" };
});

await server.connect(new StdioServerTransport());
