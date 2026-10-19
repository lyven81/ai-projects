/* Build the document the specialists read.
 *
 * Usage: node build_document.js   (after glossary_stage.js)
 * Reads the English source (config source_file) and the glossary stage's .docx, pairs them target by
 * target, and writes run/document.json:
 *   targets   F1 to F4 (front matter, named by config) and P1 to P44: en, zh (after the glossary
 *             stage), zh_original where the stage changed it, the heading before it (English and
 *             Chinese), and protected spans (config protected: the whole passage)
 *   sections  from config (S01 = front matter and P1 to P20, ...)
 * Refuses when the two files do not have the same targets in the same order.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Docx } = require("./lib/docx_writer.js");
const { docxTargets } = require("./lib/docx_targets.js");
const md = require("./lib/sample_md.js");
const { ROOT, RUN, config } = require("./lib/config.js");

async function run() {
  const stageDocx = path.join(RUN, "stage", "translation_glossary.docx");
  const report = JSON.parse(fs.readFileSync(path.join(RUN, "stage", "glossary_report.json"), "utf8"));
  const docx = await Docx.open(fs.readFileSync(stageDocx), config.editor_author);
  const zh = docxTargets(docx, Object.keys(config.front_matter));

  // English: targets and the heading before each, from the source file
  const enItems = md.parse(path.join(ROOT, config.source_file));
  const en = []; let heading = "";
  for (const it of enItems) {
    if (it.type === "heading") heading = it.text;
    if (it.type !== "target") continue;
    en.push({ key: /^\d+$/.test(it.key) ? `P${it.key}` : it.key, text: it.text, heading }); heading = "";
  }
  if (en.length !== zh.length || en.some((e, i) => e.key !== zh[i].key))
    throw new Error(`targets differ: English ${en.length} (${en.map((e) => e.key).join(" ")}), Chinese ${zh.length} (${zh.map((z) => z.key).join(" ")})`);

  const protectedKeys = Object.fromEntries(config.protected.map((x) => [x.target, x.why]));
  const targets = zh.map((z, i) => {
    const t = { key: z.key, n: z.n, kind: z.n ? "paragraph" : "front", en: en[i].text, zh: z.text,
                heading_en: en[i].heading, heading_zh: z.heading };
    if (!z.n) t.name = config.front_matter[z.key];
    if (report.before[z.key] !== z.text) t.zh_original = report.before[z.key];
    t.protected = protectedKeys[z.key] ? [{ start: 0, end: z.text.length, why: protectedKeys[z.key] }] : [];
    return t;
  });
  const sections = config.sections.map((s) => ({ ...s, keys: [...(s.front_matter ? Object.keys(config.front_matter) : []),
    ...targets.filter((t) => t.n >= s.from && t.n <= s.to).map((t) => t.key)] }));
  const doc = { built: new Date().toISOString(), title: config.title, paragraphs: targets.filter((t) => t.n).length, targets, sections };
  fs.mkdirSync(RUN, { recursive: true });
  fs.writeFileSync(path.join(RUN, "document.json"), JSON.stringify(doc, null, 1));
  return doc;
}

if (require.main === module) {
  run().then((d) => console.log(`build_document: ${d.targets.length} targets (${d.paragraphs} paragraphs), ${d.sections.length} sections, ` +
    `${d.targets.filter((t) => t.zh_original).length} changed by the glossary stage, ${d.targets.filter((t) => t.protected.length).length} protected`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { run };
