/* The glossary stage: settled terms are corrected in code before any specialist reads the text.
 *
 * Usage: node glossary_stage.js
 * Opens the translator's .docx (config target_docx), finds every rendering the glossary lists under
 * `avoid` (for a fixed name: its second spellings), and replaces it with the approved rendering as a
 * tracked change by the editor, in a copy. The translator's file is never modified. The editor's
 * standing decision covers these changes: the glossary already settled them, so no model is asked
 * and nothing waits on the review page. Matches inside a protected passage are not changed; they are
 * listed for the editor instead. Longer avoided renderings win over shorter ones at the same place.
 * Writes run/stage/translation_glossary.docx and run/stage/glossary_report.json (before and after
 * text per target, and every change with its glossary entry), which the Terms view reads.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Docx } = require("./lib/docx_writer.js");
const { docxTargets } = require("./lib/docx_targets.js");
const { ROOT, RUN, config, glossary } = require("./lib/config.js");

const STAGE = path.join(RUN, "stage");

/** Every avoided rendering in a text: [{ start, end, from, to, entry }], longest first at a place, no overlaps. */
function glossaryMatches(text, entries) {
  const hits = [];
  for (const e of entries) for (const bad of e.avoid) {
    for (let i = text.indexOf(bad); i >= 0; i = text.indexOf(bad, i + 1)) hits.push({ start: i, end: i + bad.length, from: bad, to: e.zh, entry: e.id });
  }
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const kept = [];
  for (const h of hits) if (!kept.some((k) => h.start < k.end && k.start < h.end)) kept.push(h);
  return kept;
}

async function run() {
  const src = path.join(ROOT, config.target_docx);
  const docx = await Docx.open(fs.readFileSync(src), config.editor_author);
  const targets = docxTargets(docx, Object.keys(config.front_matter));
  const protectedKeys = new Set(config.protected.map((x) => x.target));
  const report = { at: new Date().toISOString(), source: config.target_docx, changes: [], left_for_editor: [], before: {}, after: {} };
  for (const t of targets) {
    report.before[t.key] = t.text;
    const hits = glossaryMatches(t.text, glossary.entries);
    if (protectedKeys.has(t.key)) { for (const h of hits) report.left_for_editor.push({ target: t.key, ...h, why: "protected passage" }); }
    else {
      // From the end backwards, so earlier offsets stay valid.
      for (const h of hits.slice().reverse()) docx.replace(t.p, h.start, h.end, h.to, h.from);
      for (const h of hits) report.changes.push({ target: t.key, ...h });
    }
    report.after[t.key] = docx.textMap(t.p).text;
  }
  fs.mkdirSync(STAGE, { recursive: true });
  fs.writeFileSync(path.join(STAGE, "translation_glossary.docx"), await docx.save());
  fs.writeFileSync(path.join(STAGE, "glossary_report.json"), JSON.stringify(report, null, 1));
  return report;
}

if (require.main === module) {
  run().then((r) => console.log(`glossary_stage: ${r.changes.length} changes in ${new Set(r.changes.map((c) => c.target)).size} targets, ${r.left_for_editor.length} left for the editor`))
    .catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { glossaryMatches, run };
