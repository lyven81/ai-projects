// The run state and the coordinator's and reviewer's tools, as plain functions so the no-key tests call them
// directly. Status names: written, checked, reviewed, ready_for_approval, waiting_for_owner, failed, approved.
// No function here can set approved: only the owner approves, on the page, and approval never posts.
import { CHANNELS } from "./facts.mjs";

export const OWNER_CODES = { O1: "A fact the copy needs is missing from the brief", O2: "A product is not on the price list: not in this campaign",
  O3: "The brief asks for a claim the channel guide does not allow", O4: "The brief contradicts itself or the price list", O5: "A channel still fails after the first attempt and two corrections" };
export const MAX_ATTEMPTS = 3; // the first attempt plus at most two corrections
export const DEFAULT_CAPS = { writers: 5, attempts: MAX_ATTEMPTS, modelCalls: 60, reviews: 4 };

export function newChannel() {
  return { requested: false, status: "not_started", attempts: 0, version: 0, copy: null, errors: [], findings: [], reviewedVersion: null, history: [] };
}

export function newState({ caps = DEFAULT_CAPS, carried = null } = {}) {
  const s = { caps: { ...DEFAULT_CAPS, ...caps }, facts: null, factsOk: false, channels: {}, ownerQuestions: [], reviews: [], deliveries: [], modelCalls: 0, stopped: null };
  for (const c of CHANNELS) s.channels[c] = newChannel();
  if (carried) for (const [c, v] of Object.entries(carried.channels || {})) if (v.copy) s.channels[c] = { ...structuredClone(v), requested: false, carried: true };
  return s;
}

export const requested = (s) => CHANNELS.filter((c) => s.channels[c].requested);
const sentences = (q) => String(q).trim().split(/(?<=[.?!])\s+(?=[A-Z0-9"'(])/).filter(Boolean).length;

/** ask_owner: on the fixed reasons only. O1 to O4 must match an issue extract_facts raised; O5 a channel at its cap. */
export function askOwner(s, { code, item, question, channels } = {}) {
  const errs = [];
  if (!OWNER_CODES[code]) errs.push(`reason code must be one of ${Object.keys(OWNER_CODES).join(", ")}`);
  if (!String(item || "").trim()) errs.push("item is required");
  if (!String(question || "").trim()) errs.push("question is required");
  else if (sentences(question) !== 1 || !/\?\s*$/.test(question)) errs.push("the question must be one sentence ending with a question mark");
  const chs = Array.isArray(channels) ? channels.map((c) => String(c).toLowerCase()) : [];
  if (!chs.length) errs.push("name the waiting channels");
  const unknown = chs.filter((c) => !CHANNELS.includes(c));
  if (unknown.length) errs.push(`unknown channel(s): ${unknown.join(", ")}`);
  if (OWNER_CODES[code] && code !== "O5") {
    const open = (s.facts?.owner_issues || []).filter((i) => i.code === code);
    if (!open.length) errs.push(`extract_facts raised no ${code} issue; escalation is on the fixed reasons only`);
  }
  if (code === "O5") {
    const atCap = chs.filter((c) => s.channels[c]?.attempts >= s.caps.attempts && s.channels[c]?.status !== "reviewed" && s.channels[c]?.status !== "checked");
    if (!atCap.length) errs.push("O5 needs a channel that still fails after the first attempt and two corrections");
  }
  if (errs.length) return { ok: false, error: errs.join("; ") };
  const status = code === "O5" ? "failed" : "waiting_for_owner";
  for (const c of chs) { const ch = s.channels[c]; ch.requested = ch.requested || !!s.facts?.channels?.includes(c); ch.status = status; ch.history.push({ status, code }); }
  const rec = { code, reason: OWNER_CODES[code], item: String(item), question: String(question).trim(), channels: chs, status };
  s.ownerQuestions.push(rec);
  return { ok: true, recorded: rec };
}

/** Store a writer's output. Status written; the PostToolUse hook then sets checked or keeps the errors. */
export function storeCopy(s, channel, input) {
  const ch = s.channels[channel];
  ch.version += 1; ch.copy = structuredClone(input); ch.status = "written"; ch.errors = [];
  ch.history.push({ status: "written", attempt: ch.attempts, version: ch.version });
  return { ok: true, channel, version: ch.version };
}

export function applyCheck(s, channel, result) {
  const ch = s.channels[channel];
  ch.errors = result.errors; ch.status = result.ok ? "checked" : "written";
  ch.history.push({ status: result.ok ? "checked" : "check_failed", attempt: ch.attempts, version: ch.version, errors: result.errors.map((e) => e.detail) });
}

/** Which channels the reviewer must receive: every requested channel plus any carried copy, all at their current version. */
export function reviewSet(s) {
  return CHANNELS.filter((c) => (s.channels[c].requested || s.channels[c].carried) && s.channels[c].copy && !["waiting_for_owner", "failed"].includes(s.channels[c].status));
}

/** Coverage check before the reviewer: every requested channel that is not held or failed has checked copy. */
export function coverage(s) {
  const missing = [];
  for (const c of requested(s)) {
    const ch = s.channels[c];
    if (["waiting_for_owner", "failed"].includes(ch.status)) continue;
    if (ch.status === "writing") missing.push({ channel: c, why: "its writer is still working; wait for it to return" });
    else if (!ch.copy) missing.push({ channel: c, why: "no output: the writer did not call its tool" });
    else if (ch.status === "written" && ch.findings.length) missing.push({ channel: c, why: `the reviewer's findings are open; redo this channel first: ${ch.findings.map((f) => `${f.fact_or_clause}: ${f.problem}`).join(" | ")}` });
    else if (ch.status === "written") missing.push({ channel: c, why: `the copy has open check errors: ${ch.errors.map((e) => e.detail).join(" | ")}` });
  }
  return { ok: missing.length === 0, missing };
}

/** report_findings: every channel given to the reviewer gets a verdict; a failing verdict names the fact or clause. */
export function reportFindings(s, given, { channels = [], cross_channel = [] } = {}) {
  const errs = [];
  const byCh = Object.fromEntries(channels.map((v) => [String(v.channel).toLowerCase(), v]));
  for (const c of given) if (!byCh[c]) errs.push(`no verdict for ${c}`);
  for (const [c, v] of Object.entries(byCh)) {
    if (!given.includes(c)) errs.push(`${c} was not in the copy given for review`);
    if (v.pass === false && !(v.findings || []).length) errs.push(`${c} fails but names no finding`);
    for (const f of v.findings || []) if (!String(f.fact_or_clause || "").trim() || !String(f.problem || "").trim()) errs.push(`each finding on ${c} names the fact or clause and what is wrong`);
  }
  for (const f of cross_channel) if (!(f.channels || []).length || !String(f.problem || "").trim()) errs.push("each cross-channel finding names its channels and what is wrong");
  if (errs.length) return { ok: false, error: errs.join("; ") };
  const failing = new Set(Object.entries(byCh).filter(([, v]) => v.pass === false).map(([c]) => c));
  for (const f of cross_channel) for (const c of f.channels) failing.add(String(c).toLowerCase());
  const out = {};
  for (const c of given) {
    const ch = s.channels[c];
    const fs = [...(byCh[c]?.findings || []), ...cross_channel.filter((f) => f.channels.map((x) => String(x).toLowerCase()).includes(c)).map((f) => ({ fact_or_clause: f.fact_or_clause || "cross-channel", problem: f.problem }))];
    if (failing.has(c)) { ch.findings = fs; ch.status = "written"; ch.reviewedVersion = null; ch.history.push({ status: "review_failed", version: ch.version, findings: fs }); out[c] = { pass: false, findings: fs }; }
    else { ch.findings = []; ch.status = "reviewed"; ch.reviewedVersion = ch.version; ch.history.push({ status: "reviewed", version: ch.version }); out[c] = { pass: true }; }
  }
  s.reviews.push({ given, verdicts: out });
  return { ok: true, verdicts: out };
}

/** The status each channel can truthfully end with, from the run state alone. */
export function truthfulStatus(s, c) {
  const ch = s.channels[c];
  if (ch.status === "waiting_for_owner") return "waiting_for_owner";
  if (["reviewed", "ready_for_approval"].includes(ch.status) && ch.reviewedVersion === ch.version) return "ready_for_approval";
  return "failed";
}

/** deliver: every requested channel with its status; a status the state does not support is refused. */
export function deliver(s, { channels = [], summary = "" } = {}) {
  const errs = [];
  const got = Object.fromEntries(channels.map((v) => [String(v.channel).toLowerCase(), v]));
  const need = requested(s).length ? requested(s) : (s.facts?.channels || []);
  for (const c of need) if (!got[c]) errs.push(`${c} was requested and is missing from the delivery`);
  for (const [c, v] of Object.entries(got)) {
    if (!CHANNELS.includes(c)) { errs.push(`unknown channel ${c}`); continue; }
    if (v.status === "approved") { errs.push(`${c}: only the owner sets approved`); continue; }
    if (!["ready_for_approval", "waiting_for_owner", "failed"].includes(v.status)) { errs.push(`${c}: status must be ready_for_approval, waiting_for_owner or failed`); continue; }
    const truth = truthfulStatus(s, c);
    if (v.status !== truth) errs.push(`${c} cannot be ${v.status}; the run record supports ${truth}`);
  }
  if (errs.length) return { ok: false, error: errs.join("; ") };
  const rec = { channels: Object.fromEntries(Object.entries(got).map(([c, v]) => [c, { status: v.status, note: v.note || "" }])), summary: String(summary) };
  for (const [c, v] of Object.entries(rec.channels)) { s.channels[c].status = v.status; s.channels[c].history.push({ status: v.status, delivered: true }); }
  s.deliveries.push(rec);
  return { ok: true, delivered: rec };
}

/** When the run stops on a cap or an error: passed work is kept, every open channel is failed. */
export function finalizeOnStop(s, reason) {
  s.stopped = reason;
  const out = {};
  for (const c of [...new Set([...requested(s), ...reviewSet(s)])]) {
    const ch = s.channels[c];
    const st = s.deliveries.length ? ch.status : truthfulStatus(s, c);
    if (st !== ch.status) { ch.status = st; ch.history.push({ status: st, stopped: reason }); }
    out[c] = ch.status;
  }
  return out;
}
