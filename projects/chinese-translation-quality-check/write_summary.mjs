// The review summary as a page: the handover document that goes with the reviewed Word file.
//
// Usage: node write_summary.mjs [--findings <dir>] [--decisions <dir>] [--out <file>]
// Counts the review from the same decisions write_docx.mjs writes from (lib/apply_decisions.js and
// lib/summary.js, the module the demo page uses), and saves output/Review summary.html.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
const require = createRequire(import.meta.url);
const { applyAll } = require("./lib/apply_decisions.js");
const { summarise, renderSummary } = require("./lib/summary.js");
const { indexDocument } = require("./tools.js");
const { ROOT, RUN, config } = require("./lib/config.js");

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const FINDINGS = opt("--findings", join(RUN, "findings"));
const DECISIONS = opt("--decisions", join(RUN, "decisions"));
const OUT = opt("--out", join(ROOT, "output", "Review summary.html"));

const doc = indexDocument(JSON.parse(readFileSync(join(RUN, "document.json"), "utf8")));
const report = JSON.parse(readFileSync(join(RUN, "stage", "glossary_report.json"), "utf8"));
const sections = [], decisions = {};
for (const s of doc.sections) {
  const f = join(FINDINGS, `${s.id}.json`); if (!existsSync(f)) continue;
  const r = JSON.parse(readFileSync(f, "utf8"));
  sections.push({ id: s.id, findings: r.findings, failed: r.failed, failedRequests: r.failedRequests });
  const d = join(DECISIONS, `${s.id}.json`); if (existsSync(d)) Object.assign(decisions, JSON.parse(readFileSync(d, "utf8")));
}
const applied = applyAll(doc, report, sections.flatMap((s) => s.findings), decisions, config.banned_in_output);
const s = summarise(doc, report, sections, decisions, applied);
const title = "Review Summary";
const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15.5px/1.65 "Segoe UI",Arial,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 16px 60px}
.top{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 0;margin-bottom:14px;z-index:2}
.top h1{font-size:22px;margin:0;color:var(--navy)}
h3{font-size:15.5px;color:var(--navy);margin:22px 0 6px}
table{border-collapse:collapse;width:100%;background:var(--card);font-size:14px;margin:8px 0}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
.tw{overflow-x:auto}
footer{margin-top:36px;font-size:12px;color:var(--muted)}
</style></head><body><div class="wrap">
<div class="top"><h1>${title}</h1></div>
<p><strong>${date}.</strong> The handover summary for the reviewed Chinese translation, counted from the editor's decisions; the reviewed Word file carries the same changes and comments.</p>
${renderSummary(s)}
<footer>© ${new Date().getFullYear()} Lee Yih Ven · ${title}</footer></div>
<script>document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});</script></body></html>`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, page);
console.log(`saved ${OUT}: ${s.decided} of ${s.findings} findings decided, ${s.written.changes} changes, ${s.written.comments} comments`);
