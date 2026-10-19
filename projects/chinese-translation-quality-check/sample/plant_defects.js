/**
 * Plants the defects of defects.json into a copy of the correct Chinese.
 * Usage: node sample/plant_defects.js
 * Writes sample/report_zh_defects.md and sample/defect_spans.json (where each defect sits in the
 * defect text). Refuses when a `find` is not in its target exactly once, or two defect spans overlap.
 */
const path = require("path");
const fs = require("fs");
const md = require("../lib/sample_md");

const dir = __dirname;
const items = md.parse(path.join(dir, "report_zh_correct.md"));
const { defects } = JSON.parse(fs.readFileSync(path.join(dir, "defects.json"), "utf8"));
const byKey = Object.fromEntries(items.filter((i) => i.type === "target").map((i) => [i.key, i]));

function fail(msg) { console.error("plant_defects: " + msg); process.exit(1); }

for (const d of defects) {
  const it = byKey[d.target];
  if (!it) fail(`${d.id}: no target ${d.target}`);
  const count = it.text.split(d.find).length - 1;
  if (count !== 1) fail(`${d.id}: "${d.find}" found ${count} times in ${d.target}`);
  it.text = it.text.replace(d.find, d.replace);
}

// Locate every span in the final text; an omission has no span and is located by where the text was.
const spans = [];
for (const d of defects) {
  const text = byKey[d.target].text;
  let start = -1, end = -1;
  if (d.span) {
    start = text.indexOf(d.span);
    if (start < 0) fail(`${d.id}: span "${d.span}" not in the final text of ${d.target}`);
    if (text.indexOf(d.span, start + 1) >= 0 && !d.partOf && !d.also) fail(`${d.id}: span "${d.span}" is not unique in ${d.target}`);
    end = start + d.span.length;
  }
  spans.push({ id: d.id, target: d.target, start, end, span: d.span });
}
for (const a of spans) for (const b of spans) {
  if (a.id >= b.id || a.target !== b.target || a.start < 0 || b.start < 0) continue;
  if (a.start < b.end && b.start < a.end) fail(`${a.id} and ${b.id} overlap in ${a.target}`);
}

items[0] = { type: "raw", text: "# 待审校：中文季度报告（虚构，含植入错误）" };
items[1] = { type: "raw", text: "<!-- 德拉斯物流有限公司为虚构公司，所有名称和数字均为本演示编写。本文件含20处植入错误，供审校演示使用。 -->" };
md.write(path.join(dir, "report_zh_defects.md"), items);
fs.writeFileSync(path.join(dir, "defect_spans.json"), JSON.stringify(spans, null, 1), "utf8");
console.log(`plant_defects: ${defects.length} changes planted, ${spans.filter((s) => s.start >= 0).length} spans located, no overlaps`);
