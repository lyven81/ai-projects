/* The writer check with Word itself: after spike/word_accept_reject.ps1 saved Word's accept-all and
 * reject-all copies of a reviewed .docx, the accepted copy must read as the clean text of every target
 * and the rejected copy as the translator's original text (run/write_report.json, written by
 * write_docx.mjs from lib/apply_decisions.js).
 * Usage: node spike/check_writer.js <reviewed.docx>
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Docx } = require("../lib/docx_writer.js");
const { docxTargets } = require("../lib/docx_targets.js");
const { RUN, config } = require("../lib/config.js");

(async () => {
  const file = process.argv[2];
  const base = file.replace(/\.docx$/i, "");
  const report = JSON.parse(fs.readFileSync(path.join(RUN, "write_report.json"), "utf8"));
  const read = async (f) => Object.fromEntries(docxTargets(await Docx.open(fs.readFileSync(f)), Object.keys(config.front_matter)).map((t) => [t.key, t.text]));
  const acc = await read(base + "_accepted.docx"), rej = await read(base + "_rejected.docx");
  let bad = 0;
  for (const k of Object.keys(report.clean)) {
    if (acc[k] !== report.clean[k]) { bad++; console.log(`${k}: accepted copy differs\n  Word: ${acc[k]}\n  want: ${report.clean[k]}`); }
    if (rej[k] !== report.original[k]) { bad++; console.log(`${k}: rejected copy differs\n  Word: ${rej[k]}\n  want: ${report.original[k]}`); }
  }
  console.log(`check_writer: ${Object.keys(report.clean).length} targets, ${bad} differences`);
  process.exit(bad ? 1 : 0);
})();
