// Sang Kancil Specialist Clinic staff desk: MCP server (stdio).
//
// Resources: policy://clinic, policy://clinical, policy://operations, policy://billing,
//            reference://fee-schedule (restricted), reference://formulary, reference://immunisation-schedule,
//            reference://clinic-hours-and-rota. No patient directory: patient data only through the tools.
// Tools:     the eight tools in tools.js, offered by role (CP-11); every call through the shared
//            PreToolUse and PostToolUse hooks.
//
// Host context comes in the request's _meta, never from the model: { staff } is the staff ID chosen at
// sign-in (CP-01). The Fee Schedule is listed and read only for Nurul Huda and Dr Aisyah (lead capacity)
// (Fee Schedule section 5). The hook record, with Dr Aisyah's capacity, goes back in the result's _meta.
//
// Env: SK_STATE (data folder, default ./data; written through on every change), SK_NOW (Unix seconds,
// default the test calendar in meta.json), SK_FAULTS (JSON, benchmark fault injection).
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

const dir = process.env.SK_STATE || join(HERE, "data");
const cache = {};
for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) cache[f.slice(0, -5)] = JSON.parse(readFileSync(join(dir, f), "utf8"));
if (!cache.call_log) cache.call_log = [];
const store = {
  get: (n) => cache[n],
  set: (n, v) => { cache[n] = v; writeFileSync(join(dir, `${n}.json`), JSON.stringify(v, null, 1)); },
};
const tables = JSON.parse(readFileSync(join(HERE, "resources", "policy_tables.json"), "utf8"));
const faults = process.env.SK_FAULTS ? JSON.parse(process.env.SK_FAULTS) : {};
const desk = createDesk(store, tables, { now: Number(process.env.SK_NOW) || cache.meta.now, faults });
const RESOURCES = tables.resources.filter((r) => !(faults.resource_missing && r.name === faults.resource_missing));
const resourceText = Object.fromEntries(RESOURCES.map((r) => [r.uri, readFileSync(join(HERE, "resources", r.file), "utf8")]));

/** Fee Schedule section 5: a restricted resource is served only to the roles it names. */
function mayRead(r, staff) {
  if (!r.restricted) return true;
  return r.restricted.some((x) => x.split(":")[0] === staff);  // "PD-01-01:lead": Dr Aisyah's read is recorded as lead capacity
}

const server = new Server(
  { name: "sang-kancil-staff-desk", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListResourcesRequestSchema, async (req) => {
  const staff = (req.params && req.params._meta && req.params._meta.staff) || null;
  return { resources: RESOURCES.filter((r) => mayRead(r, staff)).map(({ uri, name }) => ({ uri, name, mimeType: "text/markdown" })) };
});

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const staff = (req.params._meta && req.params._meta.staff) || null;
  const r = RESOURCES.find((x) => x.uri === req.params.uri);
  if (!r) throw new Error(`Unknown resource ${req.params.uri}`);
  if (!mayRead(r, staff)) throw new Error(`${r.name} is restricted to Nurul Huda and Dr Aisyah Rahman as lead (Fee Schedule section 5).`);
  store.set("resource_log", (store.get("resource_log") || []).concat([{ staff, uri: r.uri, capacity: staff === "PD-01-01" && r.restricted ? "lead" : null, time: desk.rules ? cache.meta.now : null }]));
  return { contents: [{ uri: r.uri, mimeType: "text/markdown", text: resourceText[r.uri] }] };
});

server.setRequestHandler(ListToolsRequestSchema, async (req) => {
  const staff = (req.params && req.params._meta && req.params._meta.staff) || null;
  return { tools: desk.toolsFor(staff).map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema })) };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const meta = req.params._meta || {};
  const staff = typeof meta.staff === "string" ? meta.staff : null;  // the session, never the model
  const { result, hook } = desk.call(req.params.name, req.params.arguments || {}, staff);
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: result.status === "refused" || result.status === "error",
    _meta: { hook },
  };
});

await server.connect(new StdioServerTransport());
