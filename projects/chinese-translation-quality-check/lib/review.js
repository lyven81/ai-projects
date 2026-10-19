/* Running specialist requests and checking their answers, shared by the live path, the batch
 * collector and the benchmark.
 *
 * checkAnswer   validates every finding with tools.js validateFinding (the same rules as the
 *               record_finding tool), applies the punctuation hook, drops nothing silently
 * runRequest    one specialist request live; refused findings go back with their exact errors,
 *               up to 2 rounds, then are reported as failed (never dropped)
 */
"use strict";
const { callJSON } = require("./claude.js");
const { SETTINGS, answerSchema } = require("./settings.js");
const { systemPrompt, userMessage } = require("../prompt.js");
const { validateFinding, normalisePunctuation } = require("../tools.js");

const MAX_RETRY_ROUNDS = 2;

function checkAnswer(doc, sources, req, data) {
  const accepted = [], refused = [];
  for (const raw of data.findings || []) {
    const f = { ...raw, suggestion: normalisePunctuation(raw.suggestion) };
    const v = validateFinding(doc, sources, f, req.specialist);
    // A finding must target a paragraph of this request (or the front matter, when the request carries it).
    const inRange = v.ok && (v.finding.kind === "front" ? req.front : v.finding.n >= req.from && v.finding.n <= req.to);
    if (v.ok && inRange) accepted.push(v.finding);
    else refused.push({ finding: raw, error: v.ok ? { category: "not_assigned", retryable: true, message: `${v.finding.target} is outside P${req.from} to P${req.to}${req.front ? " and F1 to F4" : ""}` } : v.error });
  }
  const assigned = []; for (let n = req.from; n <= req.to; n++) assigned.push(n);
  const done = (data.done || []).filter((n) => assigned.includes(n));
  const gaps = assigned.filter((n) => !done.includes(n));
  return { accepted, refused, done, gaps };
}

function retryMessage(refused) {
  const lines = refused.map((r, i) => `${i + 1}. ${JSON.stringify(r.finding)}\n   Refused (${r.error.category}): ${r.error.message}`);
  return `These findings did not pass the checks in code. Fix each one as its refusal says and submit it again; drop any you cannot fix. Submit only these corrected findings, and list done as before.\n\n${lines.join("\n")}`;
}

/** One request live, with up to 2 retry rounds for refused findings. */
async function runRequest(doc, sources, req, opts = {}) {
  const s = SETTINGS[req.specialist];
  const base = { label: `${opts.labelPrefix || ""}${req.specialist}`, model: s.model, effort: s.effort, maxTokens: s.maxTokens,
                 system: systemPrompt(req.specialist), schema: answerSchema(req.specialist) };
  const user = userMessage(doc, req.specialist, req.from, req.to, req.front);
  let r = await callJSON({ ...base, user });
  if (!r.ok) {
    if (r.error.retryable) r = await callJSON({ ...base, user: `${user}\n\n(The last answer failed: ${r.error.message}. Answer again.)` });
    if (!r.ok) return { req, ok: false, error: r.error, accepted: [], failed: [], done: [], gaps: [], usd: r.usd };
  }
  const result = checkAnswer(doc, sources, req, r.data);
  const retry = await retryRefused(doc, sources, req, result, opts);
  return { req, ok: true, accepted: result.accepted, failed: retry.failed, done: result.done, gaps: result.gaps, usd: r.usd + retry.usd };
}

/** Send refused findings back with their exact errors, up to 2 rounds; what still fails is reported. */
async function retryRefused(doc, sources, req, result, opts = {}) {
  const s = SETTINGS[req.specialist];
  const user = userMessage(doc, req.specialist, req.from, req.to, req.front);
  let refused = result.refused, usd = 0;
  for (let round = 1; round <= MAX_RETRY_ROUNDS && refused.length; round++) {
    const rr = await callJSON({ label: `${opts.labelPrefix || ""}${req.specialist}:retry`, model: s.model, effort: s.effort, maxTokens: s.maxTokens,
                                system: systemPrompt(req.specialist), schema: answerSchema(req.specialist), user: `${user}\n\n${retryMessage(refused)}` });
    usd += rr.usd || 0;
    if (!rr.ok) break;
    const again = checkAnswer(doc, sources, req, rr.data);
    result.accepted.push(...again.accepted.filter((a) => !result.accepted.some((b) => b.target === a.target && b.zh_span === a.zh_span && b.category === a.category)));
    refused = again.refused;
  }
  return { failed: refused, usd };
}

module.exports = { checkAnswer, runRequest, retryRefused, retryMessage, MAX_RETRY_ROUNDS };
