/* The review summary, written once: counted from the same decisions the Word file is written from.
 *
 * summarise(doc, glossaryReport, sections, decisions, applied) -> plain object
 * renderSummary(summary) -> an HTML fragment (tables and short paragraphs), used by
 *   write_summary.mjs inside a full page and by the demo page inside its Summary view.
 * Replaces client-specific deliverables with one general handover document: what was found, what
 * the editor decided, what the glossary stage changed, what failed the checks.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReviewSummary = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /** sections: [{ id, findings, failed, failedRequests }]; applied: lib/apply_decisions applyAll result. */
  function summarise(doc, glossaryReport, sections, decisions, applied) {
    const findings = sections.flatMap((s) => s.findings);
    const by = (keyFn) => {
      const m = {};
      for (const f of findings) {
        const k = keyFn(f), d = decisions[f.id];
        const x = m[k] = m[k] || { total: 0, accept: 0, edit: 0, reject: 0, undecided: 0 };
        x.total++; x[d ? d.decision : "undecided"]++;
      }
      return m;
    };
    const verdicts = {};
    for (const f of findings) {
      const v = (f.grader && f.grader.verdict) || "not graded", d = decisions[f.id];
      const x = verdicts[v] = verdicts[v] || { total: 0, accept: 0, edit: 0, reject: 0, undecided: 0 };
      x.total++; x[d ? d.decision : "undecided"]++;
    }
    const g = applied.gate;
    const changed = Object.entries(applied.reviewed).filter(([k, r]) => r.runs.some((x) => x.st === "eins" || x.st === "edel")).map(([k]) => k);
    return {
      title: doc.title, targets: doc.targets.length, paragraphs: doc.paragraphs,
      findings: findings.length,
      decided: findings.filter((f) => decisions[f.id]).length,
      bySpecialist: by((f) => f.specialist), byCategory: by((f) => f.category), byVerdict: verdicts,
      written: { changes: g.changes.length - applied.plan.skipped.length, comments: g.comments.length, skipped: applied.plan.skipped, refused: g.refused },
      changedTargets: changed,
      protectedComments: g.comments.filter((f) => (doc.byKey[f.target].protected || []).length).map((f) => ({ id: f.id, target: f.target, issue: f.issue })),
      glossary: (glossaryReport.changes || []).map((c) => ({ target: c.target, from: c.from, to: c.to, entry: c.entry })),
      glossaryLeft: glossaryReport.left_for_editor || [],
      failed: sections.reduce((n, s) => n + (s.failed || []).length, 0),
      failedRequests: sections.reduce((n, s) => n + (s.failedRequests || []).length, 0),
    };
  }

  function table(head, rows) {
    return `<table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  }
  const decisionRows = (m) => Object.entries(m).map(([k, x]) => [esc(k), x.total, x.accept, x.edit, x.reject, x.undecided]);
  const DH = ["", "Findings", "Accepted", "Edited", "Rejected", "Undecided"];

  function renderSummary(s) {
    const pct = s.findings ? Math.round((100 * s.decided) / s.findings) : 0;
    return [
      `<p><strong>Document:</strong> ${esc(s.title)}. ${s.targets} targets checked (${s.paragraphs} paragraphs and the front matter).</p>`,
      `<p><strong>Decided:</strong> ${s.decided} of ${s.findings} findings (${pct}%). Written to the reviewed report: ${plural(s.written.changes, "tracked change")} and ${plural(s.written.comments, "comment")}, in ${plural(s.changedTargets.length, "target")}.` +
        `${s.written.skipped.length ? ` ${s.written.skipped.length} accepted change(s) overlapped another and were not written: ${s.written.skipped.map((x) => esc(x.id)).join(", ")}.` : ""}` +
        `${s.written.refused.length ? ` ${s.written.refused.length} decision(s) refused by the checks: ${s.written.refused.map((x) => `${esc(x.id)} (${esc(x.why)})`).join("; ")}.` : ""}</p>`,
      `<h3>By specialist</h3>`, table(["Specialist", ...DH.slice(1)], decisionRows(s.bySpecialist)),
      `<h3>By category</h3>`, table(["Category", ...DH.slice(1)], decisionRows(s.byCategory)),
      `<h3>Grader's verdict against the editor's decision</h3>`, table(["Verdict", ...DH.slice(1)], decisionRows(s.byVerdict)),
      `<h3>Glossary stage</h3>`,
      s.glossary.length ? table(["Target", "Changed", "To", "Glossary entry"], s.glossary.map((c) => [esc(c.target), esc(c.from), esc(c.to), esc(c.entry)])) : `<p>No glossary changes.</p>`,
      `<p>Applied by the editor's standing decision before the review.${s.glossaryLeft.length ? ` ${s.glossaryLeft.length} match(es) inside a protected passage were left for the editor.` : ""}</p>`,
      `<h3>Protected passage</h3>`,
      s.protectedComments.length ? table(["Finding", "Target", "Comment"], s.protectedComments.map((c) => [esc(c.id), esc(c.target), esc(c.issue)])) : `<p>No accepted comments on the protected passage.</p>`,
      `<h3>Checks in code</h3>`,
      `<p>${s.failed} finding(s) still failed the checks after two retry rounds and ${s.failedRequests} request(s) failed; ${s.failed + s.failedRequests ? "they are listed under Failed checks" : "nothing is outstanding"}.</p>`,
    ].join("\n");
  }

  return { summarise, renderSummary };
});
