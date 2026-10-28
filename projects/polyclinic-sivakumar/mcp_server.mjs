// Polyclinic Sivakumar clinic desk: MCP server (stdio).
//
// Resources: clinic://hours-and-services, reference://price-list, policy://panel, policy://after-consultation,
//            policy://roles-and-privacy (the five approved policies). The pharmacist is not served the Price
//            List or the Panel Price Schedule (PS-RP-03): she sees nothing about panels, prices or bills.
//            No patient directory: patient data only through the tools.
// Tools:     the seven tools in tools.js, offered by role (PS-RP-01); every call through the shared
//            PreToolUse and PostToolUse hooks.
//
// Host context comes in the request's _meta, never from the model: { staff } is the staff ID chosen at
// sign-in. The hook record goes back in the result's _meta.
//
// Env: PS_STATE (data folder, default ./data; written through on every change), PS_NOW (Unix seconds,
// default the test calendar in meta.json), PS_FAULTS (JSON, benchmark fault injection).
// Run: node mcp_server.mjs   (or register it in .mcp.json for Claude Code)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createDesk } = require("./tools.js");

const dir = process.env.PS_STATE || join(HERE, "data");
const cache = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json") && !x.startsWith("_"))) cache[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf8"));
if (!cache.call_log) cache.call_log = [];
const store = {
  get: (n) => cache[n],
  set: (n, v) => { cache[n] = v; writeFileSync(join(dir, `${n}.json`), JSON.stringify(v, null, 1)); },
};
const tables = JSON.parse(readFileSync(join(HERE, "resources", "policy_tables.json"), "utf8"));
const faults = process.env.PS_FAULTS ? JSON.parse(process.env.PS_FAULTS) : {};
const desk = createDesk(store, tables, { now: Number(process.env.PS_NOW) || cache.meta.now, faults });
const text = Object.fromEntries(tables.resources.map((r) => [r.uri, readFileSync(join(HERE, "resources", r.file), "utf8")]));
const NOT_FOR_PHARMACIST = new Set(["reference://price-list", "policy://panel"]);
const mayRead = (uri, staff) => !(staff === "PH-01" && NOT_FOR_PHARMACIST.has(uri));

const server = new Server({ name: "polyclinic-sivakumar-desk", version: "1.0.0" }, { capabilities: { tools: {}, resources: {} } });

server.setRequestHandler(ListResourcesRequestSchema, async (req) => {
  const staff = (req.params && req.params._meta && req.params._meta.staff) || null;
  return { resources: tables.resources.filter((r) => mayRead(r.uri, staff)).map(({ uri, name }) => ({ uri, name, mimeType: "text/markdown" })) };
});

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const staff = (req.params._meta && req.params._meta.staff) || null;
  const r = tables.resources.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  if (!mayRead(r.uri, staff)) throw new Error(`${r.name} is not open to the pharmacist (PS-RP-03).`);
  return { contents: [{ uri: r.uri, mimeType: "text/markdown", text: text[r.uri] }] };
});

server.setRequestHandler(ListToolsRequestSchema, async (req) => {
  const staff = (req.params && req.params._meta && req.params._meta.staff) || null;
  return { tools: desk.toolsFor(staff).map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const staff = typeof meta.staff === "string" ? meta.staff : null;  // the session, never the model
  const { result, hook } = desk.call(req.params.name, req.params.arguments || {}, staff);
  return { content: [{ type: "text", text: JSON.stringify(result) }], isError: result.status === "refused" || result.status === "error", _meta: { hook } };
});

await server.connect(new StdioServerTransport());
