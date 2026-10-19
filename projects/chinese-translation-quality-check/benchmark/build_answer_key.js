/* Build the answer key from the planted defects, before any run.
 *
 * Usage: node benchmark/build_answer_key.js   (after glossary_stage.js and build_document.js)
 * Reads sample/defects.json and run/document.json and writes benchmark/answer_key.json and
 * benchmark/Answer Key.md:
 *   review cases   D1 to D17: the target, the planted span located in the text the specialists read
 *                  (after the glossary stage), the stage expected to catch it, the categories that count,
 *                  and for D17 that its suggestion must restore the missing meaning (its key words). An omission has no span and is
 *                  scored by target and category.
 *   glossary cases D18 to D20: every planted occurrence must be changed to the approved rendering.
 *   clean targets  every target with no planted defect: a finding there counts as a false finding.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { defects } = JSON.parse(fs.readFileSync(path.join(ROOT, "sample", "defects.json"), "utf8"));
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, "run", "document.json"), "utf8"));
const byKey = Object.fromEntries(doc.targets.map((t) => [t.key, t]));
const keyOf = (t) => (/^\d+$/.test(t) ? `P${t}` : t);

const review = [], glossary = [];
for (const d of defects) {
  const key = keyOf(d.target);
  if (d.stage === "glossary") {
    const parent = d.partOf || d.id;
    let g = glossary.find((x) => x.id === parent);
    if (!g) glossary.push(g = { id: parent, what: d.what, occurrences: [] });
    g.occurrences.push({ target: key, from: d.span });
    continue;
  }
  const zh = byKey[key].zh;
  let span = null;
  if (d.span) {
    const start = zh.indexOf(d.span);
    if (start < 0) throw new Error(`${d.id}: span not found in ${key} after the glossary stage`);
    span = [start, start + d.span.length];
  }
  review.push({ id: d.id, target: key, stage: d.stage, categories: d.categories, span, span_text: d.span || null,
                ...(d.restore ? { suggestion_contains: d.restore } : {}), what: d.what });
}
const planted = new Set(defects.map((d) => keyOf(d.target)));
const clean = doc.targets.map((t) => t.key).filter((k) => !planted.has(k));
const key = { built: new Date().toISOString(), review, glossary, clean,
  pass_mark: "every review defect found with one of its listed categories, every glossary occurrence changed and no other glossary change, and at most 2 must findings on clean targets" };
fs.writeFileSync(path.join(__dirname, "answer_key.json"), JSON.stringify(key, null, 1));

const md = ["# Answer Key", "", "Written from `sample/defects.json` before any run. A finding catches a defect when it is on the right target, uses one of the listed categories, and its Chinese span overlaps the planted span (an omission: right target and category).", "",
  "## Review defects", "", "| Case | Target | Stage | Categories | Planted span | What |", "|---|---|---|---|---|---|",
  ...review.map((c) => `| ${c.id} | ${c.target} | ${c.stage} | ${c.categories.join(", ")} | ${c.span_text || "(omission)"} | ${c.what}${c.suggestion_contains ? ` (the suggestion must restore the meaning: ${c.suggestion_contains.join("、")})` : ""} |`), "",
  "## Glossary stage", "", "| Case | Occurrences | What |", "|---|---|---|",
  ...glossary.map((g) => `| ${g.id} | ${g.occurrences.map((o) => `${o.target} ${o.from}`).join("; ")} | ${g.what} |`), "",
  "## Clean targets", "", clean.join(", "), "", `Pass mark: ${key.pass_mark}.`, ""];
fs.writeFileSync(path.join(__dirname, "Answer Key.md"), md.join("\n"));
console.log(`answer key: ${review.length} review cases, ${glossary.length} glossary cases, ${clean.length} clean targets`);
