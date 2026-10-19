/* Map the paragraphs of a translated .docx to review targets, by order.
 *
 * Headings (any paragraph style whose name starts with Heading) and empty paragraphs are skipped.
 * The first paragraphs are the front matter, named by config front_matter (F1 to F4); the rest are
 * numbered paragraphs P1, P2, ... The English source must have the same targets in the same order;
 * build_document.js refuses when it does not.
 */
"use strict";
const { W } = require("./docx_writer.js");

function styleOf(p) {
  const pPr = Array.from(p.childNodes).find((n) => n.localName === "pPr");
  const ps = pPr && Array.from(pPr.childNodes).find((n) => n.localName === "pStyle");
  return ps ? ps.getAttributeNS(W, "val") || "" : "";
}

/** docxTargets(docx, frontKeys) -> [{ key, n, p, text, heading }] in document order; heading is the one just before, if any. */
function docxTargets(docx, frontKeys) {
  const out = []; let n = 0, heading = "";
  for (const p of docx.paragraphs()) {
    if (/^Heading/i.test(styleOf(p))) { heading = docx.textMap(p).text; continue; }
    const text = docx.textMap(p).text;
    if (!text.trim()) continue;
    if (out.length < frontKeys.length) out.push({ key: frontKeys[out.length], n: 0, p, text, heading });
    else { n += 1; out.push({ key: `P${n}`, n, p, text, heading }); }
    heading = "";
  }
  return out;
}

module.exports = { docxTargets, styleOf };
