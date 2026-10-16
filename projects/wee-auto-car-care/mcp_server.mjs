// Wee Auto Car Care MCP server (stdio).
//
// Resources: workshop://policy-guide, workshop://faq, workshop://service-packages
// Tools:     verify_customer, get_booking, check_availability, request_booking, escalate_to_staff
//
// The tools come from tools.js, the same file the browser demo loads.
// One server process = one conversation: the session (verified booking,
// failed attempts) lives in this process.
//
// State file: WEE_STATE env var, default ./workshop_bookings.json.
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
const { createWorkshop, RESOURCE_LIST } = require("./tools.js");

const statePath = process.env.WEE_STATE || join(HERE, "workshop_bookings.json");
const store = {
  load: () => JSON.parse(readFileSync(statePath, "utf8")),
  save: (state) => writeFileSync(statePath, JSON.stringify(state, null, 2)),
};

const resourceText = {
  policyGuide: readFileSync(join(HERE, "resources", "policy-guide.md"), "utf8"),
  faq: readFileSync(join(HERE, "resources", "faq.md"), "utf8"),
  servicePackages: readFileSync(join(HERE, "resources", "service-packages.json"), "utf8"),
};
const workshop = createWorkshop(
  store,
  { ...resourceText, servicePackages: JSON.parse(resourceText.servicePackages) },
  { today: process.env.WEE_TODAY || "2026-03-02" },
);

const server = new Server(
  { name: "wee-auto-car-care", version: "1.0.0" },
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
  tools: workshop.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const result = workshop.call(req.params.name, req.params.arguments || {});
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.ok === false,
  };
});

await server.connect(new StdioServerTransport());
