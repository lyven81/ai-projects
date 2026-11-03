/* No-key test: the benchmark holds exactly the founder's 20 cases (3 Nov 2026), IDs 1 to 20, nothing more.
 * Fails on a missing, extra, duplicate or renumbered case, a wrong group, or a sample outside the list.
 * Run: node benchmark/test_cases.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, "cases.json"), "utf8"));
const ids = doc.cases.map((c) => c.id);
const want = Array.from({ length: 20 }, (_, i) => i + 1);
const groups = { a: [1], b: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], c: [13, 14, 15], d: [16, 17, 18, 19, 20] };
let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.log("FAIL " + msg); } };
check(JSON.stringify(ids) === JSON.stringify(want), `cases.json must hold exactly IDs 1 to 20 in order, got ${JSON.stringify(ids)}`);
check(new Set(ids).size === ids.length, "duplicate case IDs");
for (const [g, list] of Object.entries(groups)) check(JSON.stringify(doc.cases.filter((c) => c.group === g).map((c) => c.id)) === JSON.stringify(list), `group ${g} must be ${list}`);
check(JSON.stringify(doc.sample) === JSON.stringify([2, 13, 8]), "the 3-case sample must be cases 2, 13 and 8");
const key = fs.readFileSync(path.join(__dirname, "Answer Key.html"), "utf8");
const rows = (key.match(/<tr id="case-(\d+)"/g) || []).map((x) => Number(x.match(/\d+/)[0]));
check(JSON.stringify(rows) === JSON.stringify(want), `Answer Key.html must show exactly cases 1 to 20, got ${JSON.stringify(rows)}`);
const deps = { 16: 1, 17: 2, 18: 13, 19: 3, 20: 4 };
for (const [id, dep] of Object.entries(deps)) check(doc.cases.find((c) => c.id === Number(id)).depends_on === dep, `case ${id} must start from case ${dep}`);
console.log(`test_cases: ${failed ? 0 : 1} passed, ${failed} failed (IDs ${ids.join(",")})`);
process.exit(failed ? 1 : 0);
