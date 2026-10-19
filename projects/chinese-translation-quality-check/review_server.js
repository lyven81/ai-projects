/* The editor's review page server: local only, port 8765.
 *
 * Usage: node review_server.js [--open] [--findings <dir>]   (Start review.bat runs it with --open after
 *        collecting; --findings points at another set, such as benchmark/results/batch/findings)
 * Serves review.html, the three shared scripts it loads (tools.js, lib/apply_decisions.js,
 * lib/summary.js) and a small JSON API:
 *   GET  /api/all        the document, the glossary and its stage report, every collected section's
 *                        findings, failures and conflicts, and the decisions so far
 *   POST /api/decision   { id, decision: accept | edit | reject | undo, text? }; an edit is checked in code
 *                        (tools.js checkEdit) before it is saved
 * Each decision is saved as it is clicked, to run/decisions/S01.json. Bound to 127.0.0.1.
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { indexDocument, checkEdit } = require("./tools.js");
const { ROOT, RUN, config, glossary } = require("./lib/config.js");

const PORT = Number(process.env.CTQC_PORT || 8765);
const argv = process.argv.slice(2);
const FINDINGS = argv.includes("--findings") ? path.resolve(argv[argv.indexOf("--findings") + 1]) : path.join(RUN, "findings");
const DECISIONS = path.join(RUN, "decisions");
const doc = indexDocument(JSON.parse(fs.readFileSync(path.join(RUN, "document.json"), "utf8")));
const glossaryReport = JSON.parse(fs.readFileSync(path.join(RUN, "stage", "glossary_report.json"), "utf8"));
const readJSON = (f, d) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d);
const sectionsData = () => doc.sections.map((s) => {
  const r = readJSON(path.join(FINDINGS, `${s.id}.json`), null);
  return { id: s.id, collected: !!r, findings: r ? r.findings : [], failed: r ? r.failed : [], failedRequests: r ? r.failedRequests : [], conflicts: r ? r.conflicts : [] };
});
const decisionsAll = () => Object.assign({}, ...doc.sections.map((s) => readJSON(path.join(DECISIONS, `${s.id}.json`), {})));
const STATIC = { "/review.html": "review.html", "/tools.js": "tools.js", "/lib/apply_decisions.js": "lib/apply_decisions.js", "/lib/summary.js": "lib/summary.js" };

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function saveDecision(body) {
  const sec = String(body.id || "").split("-")[0];
  const f = sectionsData().flatMap((s) => s.findings).find((x) => x.id === body.id);
  if (!f) return { ok: false, error: "finding not found" };
  if (!["accept", "edit", "reject", "undo"].includes(body.decision)) return { ok: false, error: "decision must be accept, edit or reject" };
  const file = path.join(DECISIONS, `${sec}.json`);
  const d = readJSON(file, {});
  if (body.decision === "undo") delete d[f.id];
  else {
    const entry = { decision: body.decision, by: config.editor_author, at: new Date().toISOString() };
    if (body.decision === "edit") {
      const c = checkEdit(doc, f, body.text, config.banned_in_output);
      if (!c.ok) return { ok: false, error: c.error };
      entry.text = c.text;
    }
    d[f.id] = entry;
  }
  fs.mkdirSync(DECISIONS, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(d, null, 1));
  return { ok: true, decision: d[f.id] || null };
}

const server = http.createServer((req, res) => {
  const p = new URL(req.url, `http://127.0.0.1:${PORT}`).pathname;
  if (p === "/") return send(res, 200, fs.readFileSync(path.join(ROOT, "review.html"), "utf8"), "text/html; charset=utf-8");
  if (STATIC[p]) return send(res, 200, fs.readFileSync(path.join(ROOT, STATIC[p]), "utf8"), p.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8");
  if (p === "/api/all") return send(res, 200, { doc: { ...doc, byKey: undefined }, glossary_report: glossaryReport, glossary, sections: sectionsData(), decisions: decisionsAll(), banned: config.banned_in_output });
  if (p === "/api/decision" && req.method === "POST") {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => { try { send(res, 200, saveDecision(JSON.parse(body))); } catch (e) { send(res, 400, { ok: false, error: e.message }); } });
    return;
  }
  send(res, 404, { error: "not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  const url = `http://localhost:${PORT}/review.html`;
  console.log(`review page: ${url}${FINDINGS !== path.join(RUN, "findings") ? ` (findings from ${FINDINGS})` : ""}`);
  if (argv.includes("--open")) require("child_process").exec(`start "" "${url}"`);
});
module.exports = { server };
