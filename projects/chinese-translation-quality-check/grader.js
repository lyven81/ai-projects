/* Grader: a fresh reviewer that did not write the findings.
 *
 * Runs on every finding of a section, one request per section, before the editor sees them. It
 * annotates each finding sound, doubtful or wrong with a short note. It never adds or drops a
 * finding: code keeps every finding and only attaches the note; a note for an unknown id is ignored.
 */
"use strict";
const { callJSON } = require("./lib/claude.js");
const { SETTINGS, GRADE_SCHEMA } = require("./lib/settings.js");
const { brief, houseStyleMd } = require("./lib/config.js");

const SYSTEM = `You check findings on the Chinese version of a listed company's quarterly report. Someone else wrote these findings; you did not. Judge each one against the English and the Chinese:
- sound: the finding is right and the suggestion fixes it.
- doubtful: the finding may be right, but the suggestion needs thought or the grounds are thin.
- wrong: the finding is not a real problem, or the suggestion would introduce a new one (a changed figure, a rewrite of the protected passage, casual wording in a formal filing).
Write the note in one or two English sentences. You only annotate: add no findings, drop none, and give a verdict for every finding.

${brief}

${houseStyleMd()}`;

async function gradeSection(doc, section, findings, opts = {}) {
  const targets = findings.filter((f) => section.keys.includes(f.target));
  if (!targets.length) return { graded: 0, eligible: 0, usd: 0 };
  const keys = [...new Set(targets.map((f) => f.target))];
  const paras = keys.map((k) => `[${k}]\nEN: ${doc.byKey[k].en}\nZH: ${doc.byKey[k].zh}`).join("\n\n");
  const list = targets.map((f) => JSON.stringify({ id: f.id, target: f.target, category: f.category, zh_span: f.zh_span, suggestion: f.suggestion, issue: f.issue, reason: f.reason })).join("\n");
  const s = SETTINGS.grader;
  const r = await callJSON({ label: `${opts.labelPrefix || ""}grader`, model: s.model, effort: s.effort, maxTokens: s.maxTokens, system: SYSTEM, schema: GRADE_SCHEMA,
                             user: `Targets:\n\n${paras}\n\nFindings (one per line):\n${list}` });
  if (!r.ok) return { graded: 0, eligible: targets.length, usd: r.usd, error: r.error };
  const byId = Object.fromEntries(findings.map((f) => [f.id, f]));
  let graded = 0;
  for (const n of r.data.notes) if (byId[n.id] && targets.includes(byId[n.id])) { byId[n.id].grader = { verdict: n.verdict, note: n.note }; graded++; }
  return { graded, eligible: targets.length, usd: r.usd };
}

module.exports = { gradeSection };
