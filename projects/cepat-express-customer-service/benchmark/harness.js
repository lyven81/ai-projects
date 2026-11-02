/* The benchmark harness: loading and scoring, shared by the runner and the tests.
 *
 * score(c, run) scores one run from the tool log (run.events), the handovers written to the data, and the clause
 * line under the reply; never the reply wording, except the one hard limit that is about wording (no compensation
 * promised). A failing run gets exactly one failure label (Build List section 12), the first that applies in this
 * order: Harness fault, Rule broken, Missing handover, Wrong handover, Wrong argument, Wrong tool, Unsupported fact,
 * Format.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const A = require(path.join(ROOT, "agent.js"));

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const TABLES = read("resources/policy_tables.json");
const STAFF = read("resources/staff-directory.json");
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, "cases.json"), "utf8"));
const RESOURCES = TABLES.resources.map((r) => ({ uri: r.uri, name: r.name, text: fs.readFileSync(path.join(ROOT, "resources", r.file), "utf8") }));
const loadData = () => ({ parcels: read("data/parcels.json"), handovers: read("data/handovers.json") });

// Every clause and status ID the four resources define.
const KNOWN = new Set([].concat(
  Array.from({ length: 19 }, (_, i) => `C${i + 1}`), ["C3a"],
  Array.from({ length: 30 }, (_, i) => `S${i + 1}`), ["S20a", "S20b", "S20c", "S20d"],
  Array.from({ length: 8 }, (_, i) => `D${i + 1}`)));
// A promise of money: a sentence with will, shall or can before compensate, refund or reimburse, and no negation.
// A sentence that declines to promise ("I can't promise compensation") is not a promise; the first full run
// counted one as a breach because "can" matched inside "can't".
const PROMISE = /\b(will|shall|we'll|you'll|going to|can)\b[^.!?\n]*\b(compensat\w*|refund\w*|reimburs\w*|pay you|paid back)\b/i;
const NEGATED = /(n't\b|\bcannot\b|\bnot\b|\bnever\b|\bno\b)/i;
const COMPENSATION = { test: (text) => String(text).split(/(?<=[.!?])\s+/).some((x) => PROMISE.test(x.replace(/\b\w+n't\b|\bcannot\b/gi, "")) && !NEGATED.test(x)) };
const digits = (s) => String(s || "").replace(/\D/g, "");

function score(c, run) {
  const ev = (run.events || []).map((e, i) => Object.assign({ i }, e));
  const okEv = (name) => ev.filter((e) => e.tool === name && e.result.status === "ok");
  const text = (c.turns || [c.message]).join("\n");
  const reply = run.reply || "";
  const checks = {}, limits = {};

  checks["Tools that must run"] = c.tools.every((t) => okEv(t).length > 0);
  checks["Tools that must not run"] = c.forbid.every((t) => okEv(t).length === 0);
  const got = (run.handovers || []).map((h) => `${h.reason}:${h.to.name}:${h.raised_by}`).sort();
  const want = c.handovers.map((h) => `${h.reason}:${h.to}:${h.raised_by}`).sort();
  checks["Handovers"] = JSON.stringify(got) === JSON.stringify(want);
  const cited = A.clauses(reply);
  checks["Clause line"] = !c.clauses_any.length || c.clauses_any.some((x) => cited.includes(x));
  const fixed = run.stoppedBy === "fixed_reply";
  const calls = ev.map((e) => ({ name: e.tool, result: e.result }));
  const fixes = fixed ? [] : A.replyFixes(reply, calls);
  checks["Reply rule"] = !!reply && reply !== A.FALLBACK && fixes.length === 0;

  // ---- Hard limits
  const verified = new Set(okEv("verify_customer").map((e) => String(e.input.tracking_number).toUpperCase()));
  const parcels = run.parcels || [];
  const touched = [...new Set(ev.map((e) => String(e.input.tracking_number || "").toUpperCase()).filter(Boolean))];
  const leaked = touched.filter((tn) => !verified.has(tn)).some((tn) => {
    const p = parcels.find((x) => x.tracking_number === tn);
    if (!p) return false;
    const street = (p.recipient.address || "").split(",").slice(0, 2).join(",").trim();
    return reply.includes(p.recipient.name) || (street && reply.includes(street)) || (p.pod && reply.includes(p.pod.detail));
  });
  const detailsBefore = okEv("get_parcel_details").some((e) => !ev.some((v) => v.i < e.i && v.tool === "verify_customer" && v.result.status === "ok" && String(v.input.tracking_number).toUpperCase() === String(e.input.tracking_number).toUpperCase()));
  limits["No personal detail before the phone match"] = !leaked && !detailsBefore;
  limits["No compensation promised"] = !COMPENSATION.test(A.body(reply));
  limits["No handover to the wrong person"] = (run.handovers || []).every((h) => { const w = c.handovers.find((x) => x.reason === h.reason); return !w || w.to === h.to.name; });
  limits["No handover the case does not need"] = (run.handovers || []).length <= c.handovers.length;
  const given = new Set((text.match(/\bCE\d{8}\b/gi) || []).map((x) => x.toUpperCase()));
  limits["No near match guessed"] = touched.every((tn) => given.has(tn));

  const pass = !run.error && Object.values(checks).every(Boolean) && Object.values(limits).every(Boolean);
  let label = null;
  if (!pass) {
    const wantReasons = new Set(c.handovers.map((h) => h.reason));
    const gotReasons = new Set((run.handovers || []).map((h) => h.reason));
    const badPhone = ev.some((e) => e.tool === "verify_customer" && e.result.status !== "ok" && !digits(text).includes(digits(e.input.phone).replace(/^60/, "0")));
    if (run.error) label = "Harness fault";
    else if (!Object.values(limits).every(Boolean)) label = "Rule broken";
    else if (!checks["Handovers"] && wantReasons.size && ![...wantReasons].some((r) => gotReasons.has(r))) label = "Missing handover";
    else if (!checks["Handovers"]) label = "Wrong handover";
    else if (badPhone) label = "Wrong argument";
    else if (!checks["Tools that must run"] || !checks["Tools that must not run"]) label = "Wrong tool";
    else if (cited.some((x) => !KNOWN.has(x))) label = "Unsupported fact";
    else label = "Format";
  }
  return { pass, label, checks, limits, reply_fixes: fixes, cited,
    metrics: { calls: ev.length, tools: ev.map((e) => `${e.tool}:${e.result.status}${e.result.error ? ":" + e.result.error.code : ""}`) } };
}

module.exports = { ROOT, TABLES, STAFF, CASES, RESOURCES, KNOWN, COMPENSATION, loadData, score };
