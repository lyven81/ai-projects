/* Consolidator: one box per fault, one correction per box.
 *
 * The specialists work independently, so one fault is often flagged two or three times from different
 * angles. After a section is assembled, flags on the same target whose spans overlap are grouped
 * (tools.js groupOverlapping). A group becomes one box that keeps every flag and carries one change:
 *   - every flag's fix leaves the same text: that fix, no call made;
 *   - the fixes differ: one request asks for a single change that corrects every flagged fault and
 *     nothing else. It is checked in code (tools.js checkCombined: covers every flagged span,
 *     full-width punctuation, protected passage, banned wording) and sent back with the exact error up
 *     to 2 times. If it still fails, the box takes the first flag's fix and the failure is listed.
 * The grader then grades the box's single change. Boxes are numbered again (S01-F001, ...).
 */
"use strict";
const { callJSON } = require("./lib/claude.js");
const { SETTINGS, COMBINE_SCHEMA } = require("./lib/settings.js");
const { groupOverlapping, checkCombined, resultText, indexDocument } = require("./tools.js");
const { numbered, conflicts } = require("./coordinator.js");
const { config } = require("./lib/config.js");

const SYSTEM = `You combine findings on the Chinese version of a listed company's quarterly report. Independent specialists flagged faults in the same words of one paragraph and proposed different fixes. Write ONE change that corrects every flagged fault at once and changes nothing else:
- zh_span: Chinese copied exactly from the paragraph; it must cover every flagged span (it may be longer, never shorter).
- suggestion: the corrected Chinese that replaces zh_span, in full-width punctuation (a comma inside a figure stays as it is). Follow the English. Empty only if the right fix is to delete zh_span.
- issue: one English sentence naming every fault the change corrects. reason: one English sentence.
Keep the measured tone of a regulatory disclosure.`;

function userMessage(t, group) {
  const flags = group.map((f, i) => `${i + 1}. ${f.specialist}/${f.category}: 「${f.zh_span}」 → 「${f.suggestion}」 ${f.issue}`).join("\n");
  return `[${t.key}]\nEN: ${t.en}\nZH: ${t.zh}\n\nFlags:\n${flags}`;
}

async function combine(doc, group, opts) {
  const t = doc.byKey[group[0].target];
  const s = SETTINGS.consolidator;
  let user = userMessage(t, group), usd = 0, last = null;
  for (let round = 0; round <= 2; round++) {
    const r = await callJSON({ label: `${opts.labelPrefix || ""}consolidator`, model: s.model, effort: s.effort, maxTokens: s.maxTokens, system: SYSTEM, schema: COMBINE_SCHEMA, user });
    usd += r.usd || 0;
    if (!r.ok) { last = r.error; continue; }
    const c = checkCombined(doc, group, r.data, config.banned_in_output);
    if (c.ok) return { box: { ...c.box, change_by: "consolidator" }, usd };
    last = c.error;
    user = `${userMessage(t, group)}\n\nYour last change was refused (${c.error.category}): ${c.error.message}\n${JSON.stringify(r.data)}`;
  }
  return { failed: last, usd };
}

/** consolidate(doc, section, rec) replaces rec.findings with one box per fault; returns a short record. */
async function consolidate(doc, section, rec, opts = {}) {
  indexDocument(doc);
  const out = [], failed = []; let usd = 0, combined = 0, same = 0;
  for (const g of groupOverlapping(rec.findings)) {
    if (g.length === 1) { out.push(g[0]); continue; }
    const results = new Set(g.map((f) => resultText(doc, f)));
    if (results.size === 1) {
      // Every flag leaves the same text: the widest span carries the change.
      const widest = g.reduce((a, b) => (b.zh_span.length > a.zh_span.length ? b : a));
      const c = checkCombined(doc, g, widest, config.banned_in_output);
      if (c.ok) { out.push({ ...c.box, change_by: "same" }); same++; continue; }
    }
    const r = await combine(doc, g, opts);
    usd += r.usd;
    if (r.box) { out.push(r.box); combined++; }
    else {
      const c = checkCombined(doc, g, g[0], config.banned_in_output);
      out.push(c.ok ? { ...c.box, change_by: "first flag" } : g[0]);
      failed.push({ target: g[0].target, flags: g.map((f) => f.id), error: r.failed });
    }
  }
  rec.findings = numbered(section, out);
  rec.conflicts = conflicts(rec.findings);
  rec.failed = (rec.failed || []).concat(failed.map((x) => ({ custom_id: `${section.id}-consolidate-${x.target}`, finding: { target: x.target, flags: x.flags }, error: x.error || { category: "consolidation_failed", message: "no valid single change" } })));
  return { boxes: rec.findings.length, same, combined, failed: failed.length, usd };
}

module.exports = { consolidate, combine };
