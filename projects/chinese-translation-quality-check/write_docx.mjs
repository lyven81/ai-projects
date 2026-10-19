// Word writer: the reviewed translation.
//
// Usage: node write_docx.mjs [--findings <dir>] [--decisions <dir>] [--out <file>]
// Starts from the glossary stage's file (run/stage/), which already holds the glossary corrections as
// tracked changes, and adds every finding the editor accepted or edited, through lib/apply_decisions.js
// (the same gate and placement the summary and the demo page use):
//   - a tracked change for the suggested or edited Chinese, by the editor, with a short comment giving
//     the issue, the reason, the English it rests on and the source cited;
//   - a tracked deletion for an addition with no suggestion (the added words go);
//   - a comment only, for a point in a protected passage or any other finding with no suggestion.
// Positions are taken in the accepted view, so changes sit on top of the glossary stage. Changes in a
// target are written from the end backwards; a change that overlaps one already written is skipped and
// reported. Before saving, the output check runs (authors, wording, document properties); the file is
// not saved if it fails.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
const require = createRequire(import.meta.url);
const { Docx } = require("./lib/docx_writer.js");
const { docxTargets } = require("./lib/docx_targets.js");
const { checkOutputFile } = require("./lib/hooks.js");
const { applyAll } = require("./lib/apply_decisions.js");
const { indexDocument } = require("./tools.js");
const { ROOT, RUN, config, glossary, houseStyle } = require("./lib/config.js");

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const FINDINGS = opt("--findings", join(RUN, "findings"));
const DECISIONS = opt("--decisions", join(RUN, "decisions"));
const OUT = opt("--out", join(ROOT, "output", "Reviewed translation.docx"));

const doc = indexDocument(JSON.parse(readFileSync(join(RUN, "document.json"), "utf8")));
const report = JSON.parse(readFileSync(join(RUN, "stage", "glossary_report.json"), "utf8"));
const G = Object.fromEntries(glossary.entries.map((e) => [e.id, e]));
const H = Object.fromEntries(houseStyle.rules.map((r) => [r.id, r]));
const sourceLabel = (s) => G[s] ? `Glossary ${s}: ${G[s].en} = ${G[s].zh}` : H[s] ? `House style ${s}: ${H[s].rule}` : `Brief ${s}`;
function commentText(f, change) {
  if (f.flags) {   // one box, several flags: each flag on its own line, then the sources
    const lines = f.flags.map((x) => `[${x.specialist}, ${x.category}] ${x.issue}`);
    if (!change && f.suggestion) lines.push(`Suggested: ${f.suggestion}`);
    lines.push(`Source: ${[...new Set(f.flags.map((x) => x.source))].map(sourceLabel).join("; ")}`);
    return lines.join("\n");
  }
  const lines = [`[${f.category}] ${f.issue}`, `Reason: ${f.reason}`];
  if (["omission", "mistranslation", "addition"].includes(f.category)) lines.push(`English: ${f.en_span}`);
  if (!change && f.suggestion) lines.push(`Suggested: ${f.suggestion}`);
  lines.push(`Source: ${sourceLabel(f.source)}`);
  return lines.join("\n");
}

const findings = [], decisions = {};
for (const f of existsSync(FINDINGS) ? readdirSync(FINDINGS) : []) {
  if (!/^S\d\d\.json$/.test(f)) continue;
  findings.push(...JSON.parse(readFileSync(join(FINDINGS, f), "utf8")).findings);
  const d = join(DECISIONS, f); if (existsSync(d)) Object.assign(decisions, JSON.parse(readFileSync(d, "utf8")));
}
const applied = applyAll(doc, report, findings, decisions, config.banned_in_output);

const stageFile = join(RUN, "stage", "translation_glossary.docx");
const docx = await Docx.open(readFileSync(stageFile), config.editor_author);
const paraOf = Object.fromEntries(docxTargets(docx, Object.keys(config.front_matter)).map((t) => [t.key, t.p]));
const written = { changes: 0, comments: 0 }, failed = [];
for (const [key, items] of Object.entries(applied.plan.placed)) {
  const p = paraOf[key];
  for (const it of items) {   // already ordered from the end of the target backwards
    try {
      if (it.kind === "change") {
        docx.replace(p, it.start, it.end, it.f.text, it.f.zh_span);
        // A deletion leaves no new text to anchor on: the comment sits on the character before it.
        const [a, b] = it.f.text ? [it.start, it.start + it.f.text.length] : it.start > 0 ? [it.start - 1, it.start] : [0, 1];
        docx.comment(p, a, b, commentText(it.f, true));
        written.changes++;
      } else { docx.comment(p, it.start, it.end, commentText(it.f, false)); written.comments++; }
    } catch (e) { failed.push({ id: it.f.id, why: e.message }); }
  }
}

const buf = await docx.save();
const check = await checkOutputFile(buf, readFileSync(join(ROOT, config.target_docx)), config);
if (!check.ok) { console.log(`NOT SAVED: the output check failed: ${check.problems.join("; ")}`); process.exit(1); }
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, buf);
// The clean text of every target, for the writer check against Word's accept-all copy.
writeFileSync(join(RUN, "write_report.json"), JSON.stringify({ at: new Date().toISOString(), out: OUT, written, failed,
  skipped: applied.plan.skipped, refused: applied.gate.refused, undecided: applied.gate.undecided.length,
  clean: Object.fromEntries(Object.entries(applied.reviewed).map(([k, r]) => [k, r.clean])),
  original: Object.fromEntries(Object.entries(applied.reviewed).map(([k, r]) => [k, r.original])) }, null, 1));
console.log(`saved ${OUT}: ${written.changes} tracked changes with comments, ${written.comments} comments; ${applied.gate.undecided.length} undecided, ${applied.plan.skipped.length} skipped, ${failed.length} failed; output check passed`);
