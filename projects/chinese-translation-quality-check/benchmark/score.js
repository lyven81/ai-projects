/* Score a run against the answer key. Shared by run_benchmark.mjs (live, batch, rescore, parity).
 *
 * A review case is caught by a finding on its target that uses one of its categories and whose
 * Chinese span overlaps the planted span (two characters either side); an omission needs only the
 * target and category; D17's suggestion must also restore the missing meaning (its key words). A glossary case needs every planted
 * occurrence changed, and the stage may make no other change. A finding on a clean target is a false
 * finding. Findings on a planted target that match no case are listed as unplanned, for reading.
 */
"use strict";

function score(key, findings, glossaryReport) {
  const cases = [];
  const used = new Set();
  for (const c of key.review) {
    const hits = findings.filter((f) => f.target === c.target && [f.category, ...(f.flags || []).map((a) => a.category)].some((x) => c.categories.includes(x)) &&
      (!c.span || (f.zh_start < c.span[1] + 2 && c.span[0] - 2 < f.zh_start + f.zh_span.length)) && (!c.suggestion_contains || c.suggestion_contains.every((w) => (f.suggestion || "").includes(w))));
    hits.forEach((f) => used.add(f.id));
    cases.push({ id: c.id, target: c.target, stage: c.stage, pass: hits.length > 0, by: hits.map((f) => `${f.id} ${f.specialist}/${f.category}`), what: c.what });
  }
  const changes = (glossaryReport.changes || []).map((x) => `${x.target}|${x.from}`);
  const planted = new Set(key.glossary.flatMap((g) => g.occurrences.map((o) => `${o.target}|${o.from}`)));
  for (const g of key.glossary) {
    const missing = g.occurrences.filter((o) => !changes.includes(`${o.target}|${o.from}`));
    cases.push({ id: g.id, target: g.occurrences.map((o) => o.target).join(" "), stage: "glossary", pass: missing.length === 0, by: missing.length ? [`missed ${missing.map((o) => o.target).join(", ")}`] : ["glossary stage"], what: g.what });
  }
  const extraGlossary = changes.filter((c) => !planted.has(c));
  const clean = new Set(key.clean);
  const falseFindings = findings.filter((f) => clean.has(f.target));
  const unplanned = findings.filter((f) => !clean.has(f.target) && !used.has(f.id));
  const groups = {};
  for (const c of cases) { const g = groups[c.stage] = groups[c.stage] || { pass: 0, total: 0 }; g.total++; if (c.pass) g.pass++; }
  const falseMust = falseFindings.filter((f) => f.severity === "must").length;
  return {
    cases, groups, found: cases.filter((c) => c.pass).length, total: cases.length,
    extraGlossary, falseFindings: falseFindings.map(brief), falseMust, unplanned: unplanned.map(brief),
    passMark: cases.every((c) => c.pass) && extraGlossary.length === 0 && falseMust <= 2,
  };
}
const brief = (f) => ({ id: f.id, target: f.target, specialist: f.specialist, category: f.category, severity: f.severity, zh_span: f.zh_span, suggestion: f.suggestion, issue: f.issue, grader: f.grader && f.grader.verdict });

module.exports = { score };
