// Build the static demo page from the review page.
//
// Usage: node build_demo.mjs [--from batch|live]   (default batch: the run made on the Message Batches API)
// Writes demo.html: review.html with tools.js, lib/apply_decisions.js and lib/summary.js inlined, the
// recorded run built in (the document, the glossary and its stage report, every section's findings with
// the grader's notes, failures and conflicts), the breadcrumb and favicon for the published repo, and
// an intro for the visitor. Every finding starts undecided; the visitor's decisions stay in their browser.
// No server, no key: the edit checks run in the page with the same tools.js.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ROOT = dirname(fileURLToPath(import.meta.url));
const { RUN, config, glossary } = require("./lib/config.js");

const argv = process.argv.slice(2);
const from = argv.includes("--from") ? argv[argv.indexOf("--from") + 1] : "batch";
const SLUG = "chinese-translation-quality-check";
const TITLE = "Chinese Translation Quality Check";

const doc = JSON.parse(readFileSync(join(RUN, "document.json"), "utf8"));
const glossaryReport = JSON.parse(readFileSync(join(RUN, "stage", "glossary_report.json"), "utf8"));
const dir = join(ROOT, "benchmark", "results", from, "findings");
const sections = doc.sections.map((s) => {
  const f = join(dir, `${s.id}.json`);
  if (!existsSync(f)) throw new Error(`no ${from} findings for ${s.id}; run the benchmark first`);
  const r = JSON.parse(readFileSync(f, "utf8"));
  return { id: s.id, collected: true, findings: r.findings, failed: r.failed, failedRequests: r.failedRequests, conflicts: r.conflicts };
});
const n = sections.reduce((a, s) => a + s.findings.length, 0);
const flags = sections.reduce((a, s) => a + s.findings.reduce((b, f) => b + (f.flags ? f.flags.length : 1), 0), 0);
const data = {
  doc, glossary_report: glossaryReport, glossary, sections, decisions: {}, banned: config.banned_in_output,
  intro: `This is the Chinese version of a fictional company's quarterly report, checked against its English original. The glossary stage has already corrected the settled terms; three specialists then raised ${flags} flags, each checked in code. Flags on the same words share one box with one correction, giving ${n} boxes, and a separate grader annotated each one.`,
  run_note: from === "batch" ? "The findings come from one recorded run on the Message Batches API." : "The findings come from one recorded live run.",
};

const inline = (file) => `<script>\n${readFileSync(join(ROOT, file), "utf8")}\n</script>`;
const json = JSON.stringify(data).replace(/</g, "\\u003c");
let html = readFileSync(join(ROOT, "review.html"), "utf8");
const swaps = [
  ['<script src="tools.js"></script>', inline("tools.js")],
  ['<script src="lib/apply_decisions.js"></script>', inline("lib/apply_decisions.js")],
  ['<script src="lib/summary.js"></script>', inline("lib/summary.js")],
  ["<!--DATA-->", `<script>window.CTQC_DATA = ${json};</script>`],
  ["<!--FAVICON-->", '<link rel="icon" href="../../favicon.ico" sizes="any">\n<link rel="icon" href="../../favicon.svg" type="image/svg+xml">'],
  ["<!--CRUMBS-->", `<div class="crumbs"><a href="../../index.html">AI Projects</a> / <a href="../../${SLUG}.html">${TITLE}</a></div>`],
  ["<title>Translation Review</title>", `<title>Translation Review: ${TITLE}</title>`],
];
for (const [a, b] of swaps) {
  if (!html.includes(a)) throw new Error(`review.html has no ${a}`);
  html = html.replace(a, () => b);
}
writeFileSync(join(ROOT, "demo.html"), html);
console.log(`build_demo: demo.html from the ${from} run, ${n} findings in ${sections.length} sections, ${(html.length / 1024).toFixed(0)} KB`);
