/* The batch path on the Message Batches API: half price, results within 24 hours.
 *
 * One batch per section, so a section can be collected as soon as its batch ends. Every request
 * carries a custom_id (section, specialist, paragraph range, round) and results are matched by it,
 * never by position. The request body is the same one the live path sends (lib/claude.js requestBody).
 * The batch does not use the MCP tool loop; findings are checked after collection with the same
 * tools.js rules. Only failed requests are redone, live: errored, expired and canceled requests in
 * full, refusals with the server-side fallback, a cut-off answer split in two, refused findings with
 * their exact errors (up to 2 rounds), gaps in coverage. Then the grader, conflicts and coverage.
 * The run file records what was submitted and what was collected, so a restart resumes and nothing
 * is collected twice.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { getClient, requestBody, parseAnswer, record, PRICE, pool } = require("./claude.js");
const { SETTINGS, answerSchema } = require("./settings.js");
const { systemPrompt, userMessage, sectionRequests } = require("../prompt.js");
const { checkAnswer, runRequest, retryRefused } = require("./review.js");
const { assemble } = require("../coordinator.js");
const { gradeSection } = require("../grader.js");
const { consolidate } = require("../consolidator.js");

const OUT_TOKENS_ESTIMATE = 8000;   // observed about 7,800 per request with adaptive thinking

function bodyFor(doc, req) {
  const s = SETTINGS[req.specialist];
  return requestBody({ model: s.model, effort: s.effort, maxTokens: s.maxTokens, system: systemPrompt(req.specialist),
                       schema: answerSchema(req.specialist), user: userMessage(doc, req.specialist, req.from, req.to, req.front) });
}

/** Count input tokens (free endpoint) and estimate the batch cost, before anything is submitted. */
async function estimate(doc, reqs) {
  const c = getClient(); let usd = 0, input = 0;
  const counted = await pool(reqs, 4, async (req) => {
    const b = bodyFor(doc, req);
    const n = await c.messages.countTokens({ model: b.model, system: b.system, messages: b.messages });
    return { model: b.model, input: n.input_tokens };
  });
  for (const x of counted) { input += x.input; usd += (x.input * PRICE[x.model].in + OUT_TOKENS_ESTIMATE * PRICE[x.model].out) / 1e6 / 2; }
  return { requests: reqs.length, input_tokens: input, usd };
}

function loadRun(runFile) { return fs.existsSync(runFile) ? JSON.parse(fs.readFileSync(runFile, "utf8")) : { batches: [] }; }
function saveRun(runFile, run) { fs.mkdirSync(path.dirname(runFile), { recursive: true }); fs.writeFileSync(runFile, JSON.stringify(run, null, 1)); }

/** Submit one batch per section; refuses if the estimate passes the cap. */
async function submit(doc, sectionIds, runFile, cap, reqsFor = (s) => sectionRequests(doc, s)) {
  const sections = doc.sections.filter((s) => sectionIds.includes(s.id));
  const plan = sections.map((s) => ({ section: s, reqs: reqsFor(s) }));
  const est = await estimate(doc, plan.flatMap((p) => p.reqs));
  if (est.usd > cap) return { ok: false, estimate: est, error: `estimate $${est.usd.toFixed(2)} passes the cap of $${cap}; nothing submitted` };
  const run = loadRun(runFile);
  const c = getClient();
  for (const p of plan) {
    const batch = await c.messages.batches.create({ requests: p.reqs.map((r) => ({ custom_id: r.custom_id, params: bodyFor(doc, r) })) });
    run.batches.push({ section: p.section.id, id: batch.id, submitted: new Date().toISOString(), requests: p.reqs, collected: false });
    saveRun(runFile, run);   // saved after each batch, so a failure mid-way loses nothing
  }
  return { ok: true, estimate: est, batches: plan.length };
}

/** Collect every ended batch not yet collected; returns per-section records. */
async function collect(doc, sources, runFile, saveSection, opts = {}) {
  const run = loadRun(runFile);
  const c = getClient();
  const report = [];
  for (const b of run.batches.filter((x) => !x.collected)) {
    const status = await c.messages.batches.retrieve(b.id);
    if (status.processing_status !== "ended") { report.push({ section: b.section, status: status.processing_status, counts: status.request_counts }); continue; }
    const byId = Object.fromEntries(b.requests.map((r) => [r.custom_id, r]));
    const ok = [], redo = [];
    for await (const res of await c.messages.batches.results(b.id)) {
      const req = byId[res.custom_id]; if (!req) continue;
      const t = res.result.type;
      if (t !== "succeeded") { redo.push({ req, why: t }); continue; }   // errored, expired, canceled
      const msg = res.result.message;
      record(`${b.section}:${req.specialist}:batch`, msg.model, msg.usage, true);
      const a = parseAnswer(msg);
      if (!a.ok && a.error.category === "max_tokens" && req.to > req.from) {   // split the range and redo live
        const mid = Math.floor((req.from + req.to) / 2);
        redo.push({ req: { ...req, custom_id: req.custom_id + "-a", to: mid }, why: "max_tokens" }, { req: { ...req, custom_id: req.custom_id + "-b", from: mid + 1, front: false }, why: "max_tokens" });
        continue;
      }
      if (!a.ok) { redo.push({ req, why: a.error.category }); continue; }   // refusal (live call uses the fallback) or invalid JSON
      const checked = checkAnswer(doc, sources, req, a.data);
      const retry = await retryRefused(doc, sources, req, checked, { labelPrefix: `${b.section}:` });
      ok.push({ req, ok: true, accepted: checked.accepted, failed: retry.failed, done: checked.done, gaps: checked.gaps });
    }
    for (const r of ok) if (r.gaps.length) redo.push({ req: { ...r.req, custom_id: r.req.custom_id + "-gap", from: Math.min(...r.gaps), to: Math.max(...r.gaps), front: false }, why: "gap" });
    const live = await pool(redo, 4, (x) => runRequest(doc, sources, x.req, { labelPrefix: `${b.section}:retry:` }));
    const all = ok.concat(live.filter((r) => r.ok));
    const failedRequests = live.filter((r) => !r.ok).map((r) => ({ custom_id: r.req.custom_id, error: r.error }));
    const section = doc.sections.find((s) => s.id === b.section);
    const rec = assemble(doc, section, all, failedRequests);
    rec.consolidated = await consolidate(doc, section, rec, { labelPrefix: `${b.section}:` });
    if (!opts.noGrader) { const g = await gradeSection(doc, section, rec.findings, { labelPrefix: `${b.section}:` }); rec.grader = g; }
    rec.redone = redo.map((x) => ({ custom_id: x.req.custom_id, why: x.why }));
    rec.collected = new Date().toISOString();
    await saveSection(b.section, rec);
    b.collected = true; b.collected_at = rec.collected; saveRun(runFile, run);
    report.push({ section: b.section, status: "collected", findings: rec.findings.length, redone: redo.length, failed: rec.failed.length, failedRequests: failedRequests.length });
  }
  return report;
}

module.exports = { bodyFor, estimate, submit, collect, loadRun };
