// Chinese Translation Quality Check MCP server (stdio), the live path.
//
// Resources: brief://review, glossary://terms, style://house (from resources/ and config/)
// Tools:     the 6 tools in tools.js, the same file the batch validator, the tests, the benchmark and
//            the demo page load.
// Host context comes in the request's _meta, never from the model:
//   { caller: "accuracy" | "section" | "register" | "coordinator", assigned: [paragraph numbers] }
// Env: CTQC_RUN (default run/; the document is run/document.json, the state run/state.json).
// Run: node mcp_server.mjs   (or register it in .mcp.json)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema, CallToolRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const require = createRequire(import.meta.url);
const { createWorkbench } = require("./tools.js");
const { RUN, brief, sources, glossaryMd, houseStyleMd } = require("./lib/config.js");

const RESOURCES = [
  { uri: "brief://review", name: "The review brief, points B1 to B4", text: () => brief },
  { uri: "glossary://terms", name: "The glossary, entries G01 to G30, with renderings to avoid", text: glossaryMd },
  { uri: "style://house", name: "The house style, rules H1 to H8", text: houseStyleMd },
].map((r) => ({ ...r, mimeType: "text/markdown" }));

const statePath = join(RUN, "state.json");
if (!existsSync(statePath)) {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ findings: [], coverage: {}, rechecks: [], conflicts: [] }, null, 1));
}
const workbench = createWorkbench({
  doc: JSON.parse(readFileSync(join(RUN, "document.json"), "utf8")),
  sources: sources(),
  store: { load: () => JSON.parse(readFileSync(statePath, "utf8")), save: (s) => writeFileSync(statePath, JSON.stringify(s, null, 1)) },
});

const server = new Server({ name: "chinese-translation-quality-check", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCES.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
}));
server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const r = RESOURCES.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  return { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text() }] };
});
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: workbench.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })),
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const ctx = { caller: typeof meta.caller === "string" ? meta.caller : "", assigned: Array.isArray(meta.assigned) ? meta.assigned.map(Number) : null };
  const result = workbench.call(req.params.name, req.params.arguments || {}, ctx);
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: result.ok === false };
});

await server.connect(new StdioServerTransport());
