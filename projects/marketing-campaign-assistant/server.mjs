// The single local back end (founder, 29 Oct). Serves the owner workspace and holds data/plan.json.
//   GET  /                      workspace.html
//   GET  /api/plan              the saved plan
//   POST /api/plan              save the plan written by the workspace (the workspace runs tools.js, the same
//                               functions the agent, the MCP server and the benchmark use)
// Run: node server.mjs  then open http://localhost:8765/
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { ROOT, fileStore } from "./lib/load.mjs";

const PORT = Number(process.env.PORT || 8765);
const store = fileStore(path.join(ROOT, "data", "plan.json"));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".md": "text/markdown; charset=utf-8", ".css": "text/css", ".png": "image/png", ".ico": "image/x-icon" };
const PUBLIC = new Set(["workspace.html", "benchmark/Answer Key.html"]);

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url === "/api/plan" && req.method === "GET") return send(res, 200, JSON.stringify(store.load()), ".json");
  if (url === "/api/plan" && req.method === "POST") {
    let body = ""; req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try { const p = JSON.parse(body); if (!Array.isArray(p.changes)) throw new Error("no changes"); store.save(p); send(res, 200, '{"ok":true}', ".json"); }
      catch (e) { send(res, 400, JSON.stringify({ ok: false, error: String(e.message) }), ".json"); }
    });
    return;
  }
  const rel = url === "/" ? "workspace.html" : url.replace(/^\/+/, "");
  if (!PUBLIC.has(rel)) return send(res, 404, "Not found", ".html");
  send(res, 200, fs.readFileSync(path.join(ROOT, rel)), path.extname(rel));
}).listen(PORT, () => console.log(`Comel Diaper workspace: http://localhost:${PORT}/`));

function send(res, code, body, ext) { res.writeHead(code, { "content-type": TYPES[ext] || "text/plain" }); res.end(body); }
