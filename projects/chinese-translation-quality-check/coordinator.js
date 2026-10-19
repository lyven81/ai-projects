/* Coordinator: routing in code, an agent step only where judgement is needed.
 *
 * For a section: build the requests (accuracy in halves of about 10 paragraphs with neighbours, one
 * section specialist request, register on all 20), run them together, merge the accepted findings,
 * check coverage, and find specialists that disagree on the same words. Gaps and failed requests are
 * re-delegated live once. Overlapping findings from different specialists are linked as conflicts
 * for the editor, both kept with their reasons; the coordinator never settles them.
 * Budget: stops before a real-run pass would pass $15, or all benchmark runs together $5.
 */
"use strict";
const { runRequest } = require("./lib/review.js");
const { sectionRequests } = require("./prompt.js");
const { ledger, pool } = require("./lib/claude.js");

const numbered = (section, fs) => fs.map((f, i) => ({ ...f, id: `${section.id}-F${String(i + 1).padStart(3, "0")}`, section: section.id }));

const CAPS = { real: 15, benchmark: 5 };

function conflicts(findings) {
  const out = [];
  for (let i = 0; i < findings.length; i++) for (let j = i + 1; j < findings.length; j++) {
    const a = findings[i], b = findings[j];
    if (a.target !== b.target || a.specialist === b.specialist) continue;
    const sa = [a.zh_start, a.zh_start + a.zh_span.length], sb = [b.zh_start, b.zh_start + b.zh_span.length];
    const ov = sa[0] < sb[1] && sb[0] < sa[1];
    if (ov && (a.suggestion || "") !== (b.suggestion || "")) out.push({ a: a.id, b: b.id, target: a.target, note: `${a.specialist} and ${b.specialist} disagree on the same words` });
  }
  return out;
}

/**
 * runSection(doc, sources, section, { mode, specialists, concurrency }) ->
 *   { findings, failed, failedRequests, coverage, conflicts, usd }
 */
async function runSection(doc, sources, section, opts = {}) {
  const mode = opts.mode || "real";
  const cap = CAPS[mode];
  const reqs = opts.requests || sectionRequests(doc, section, opts.specialists);
  const startUsd = ledger.usd;
  const results = await pool(reqs, opts.concurrency || 4, async (req) => {
    if (ledger.usd - startUsd > cap) return { req, ok: false, error: { category: "budget", message: `cap $${cap} reached` }, accepted: [], failed: [], done: [], gaps: [] };
    return runRequest(doc, sources, req, { labelPrefix: `${section.id}:` });
  });
  // Re-delegate once: failed requests in full, gaps as a request over the missing paragraphs only.
  const redo = [];
  for (const r of results) {
    if (!r.ok && r.error.category !== "budget") redo.push(r.req);
    else if (r.ok && r.gaps.length) redo.push({ ...r.req, custom_id: r.req.custom_id + "-gap", from: Math.min(...r.gaps), to: Math.max(...r.gaps), front: false });
  }
  const second = await pool(redo, opts.concurrency || 4, (req) => runRequest(doc, sources, req, { labelPrefix: `${section.id}:recheck:` }));
  const all = results.filter((r) => r.ok).concat(second.filter((r) => r.ok));
  const failedRequests = second.filter((r) => !r.ok).map((r) => ({ custom_id: r.req.custom_id, error: r.error }))
    .concat(results.filter((r) => !r.ok && r.error.category === "budget").map((r) => ({ custom_id: r.req.custom_id, error: r.error })));
  return { ...assemble(doc, section, all, failedRequests), usd: ledger.usd - startUsd };
}

/** Merge request results into one section record: findings with ids, failures, coverage, conflicts. */
function assemble(doc, section, all, failedRequests) {
  const raw = []; const seen = new Set();
  for (const r of all) for (const f of r.accepted) {
    const key = `${f.specialist}|${f.target}|${f.category}|${f.zh_span}`;
    if (seen.has(key)) continue; seen.add(key);
    raw.push(f);
  }
  const findings = numbered(section, raw);   // one box per fault comes after: consolidator.js
  const coverage = {};
  for (const r of all) { coverage[r.req.specialist] = coverage[r.req.specialist] || new Set(); r.done.forEach((n) => coverage[r.req.specialist].add(n)); }
  return {
    findings, failed: all.flatMap((r) => r.failed.map((x) => ({ custom_id: r.req.custom_id, ...x }))), failedRequests,
    coverage: Object.fromEntries(Object.entries(coverage).map(([k, v]) => [k, [...v].sort((a, b) => a - b)])),
    conflicts: conflicts(findings),
  };
}

module.exports = { runSection, assemble, conflicts, numbered, CAPS };
