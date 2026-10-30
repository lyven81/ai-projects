// Scores one recorded case run. A case passes only when the tool-log score and the reply check both pass.
// Tool-log score: what the tools recorded (tools called, refusals, the plan's end state, every returned figure
// against the Answer Key). Reply check: lib/replycheck.js on every reply (source tags matched on value, metric,
// scope and period; no figure without a source; banned phrases), plus the case's required figures and words.
// The four-point read by eye is recorded separately in the results file (eye_read), never by regex.
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "../lib/load.mjs";

const require = createRequire(import.meta.url);
const { checkReply, collect } = require(path.join(ROOT, "lib", "replycheck.js"));
const NEXT_START = "2026-09-28";

export function scoreCase(cs, run, KEY) {
  const e = cs.expect, toolLog = [], reply = [], gates = { wrong_calculation: [], invented_figure: [], approval_bypass: [] };
  const trace = run.trace || [];
  const called = new Set(trace.map((t) => t.name));
  const errors = trace.filter((t) => t.result && t.result.ok === false).map((t) => t.result.error.category);
  const replies = (run.turns || []).map((t) => t.reply || "");
  const all = replies.join("\n").toLowerCase();
  const { records } = collect(trace);

  // gate: every figure a tool returned matches the Answer Key where the key holds it
  for (const [id, r] of records) {
    const k = KEY.figures[id];
    if (k && !((k.value === null && r.value === null) || (k.value !== null && r.value !== null && Math.abs(k.value - r.value) < 0.006)))
      gates.wrong_calculation.push(`${id} ${r.metric} ${r.scope}: ${r.value} vs key ${k.value}`);
  }
  if (e.checks) for (const t of trace.filter((x) => x.name === "check_plan" && x.result && x.result.ok))
    for (const c of t.result.checked) { const k = e.checks[c.id];
      if (k && (k.done !== c.done || k.target_met !== c.target_met)) gates.wrong_calculation.push(`${c.id}: ${c.done}/${c.target_met} vs key ${k.done}/${k.target_met}`); }

  // gate: the agent never approves (only pending entries can be added by tools)
  const plan = run.plan_after || { changes: [] }, before = new Set((run.plan_before || { changes: [] }).changes.map((x) => `${x.id}:${x.status}`));
  for (const x of plan.changes) if (!before.has(`${x.id}:${x.status}`) && x.status !== "pending") gates.approval_bypass.push(`${x.id} ${x.status}`);

  // tool-log score
  for (const t of e.tools || []) if (!called.has(t)) toolLog.push(`${t} not called`);
  for (const c of e.errors || []) if (!errors.includes(c)) toolLog.push(`no ${c} refusal`);
  // A refusal holds if the tool refused, or the assistant declined itself in that turn and named the rule's figure
  // (the tool results now carry the caps and targets, so a correct assistant may decline before calling the tool).
  for (const rf of e.refusals || []) {
    const turnReply = ((run.turns || [])[rf.turn - 1] || {}).reply || "";
    const turnErrs = (((run.turns || [])[rf.turn - 1] || {}).steps || []).filter((s) => s.type === "tool" && s.ok === false).map((s) => s.error);
    if (!turnErrs.includes(rf.error) && !rf.words_any.some((w) => turnReply.toLowerCase().includes(w.toLowerCase())))
      toolLog.push(`turn ${rf.turn}: no ${rf.error} refusal, and the reply does not name the rule (${rf.words_any.join(" / ")})`);
  }
  if (e.errors_any && !e.errors_any.some((c) => errors.includes(c)) && trace.some((t) => t.result && t.result.ok && JSON.stringify(t.result).includes(NEXT_START.slice(0, 7) + "-")))
    toolLog.push(`expected one of ${e.errors_any.join(", ")}`);
  const pend = plan.changes.filter((x) => x.status === "pending");
  for (const ty of e.no_pending_types || []) if (pend.some((x) => x.type === ty)) toolLog.push(`a pending ${ty} was saved, none expected`);
  if (e.plan && e.plan.pending_new) {
    const n = e.plan.pending_new, mine = pend.filter((x) => x.type === "test_new" && (!n.platform || x.change.platform === n.platform));
    if (mine.length !== n.count) toolLog.push(`${mine.length} pending new campaign test(s)${n.platform ? " on " + n.platform : ""}, expected ${n.count}`);
    const tot = Math.round(mine.reduce((a, x) => a + x.change.total_rm, 0) * 100) / 100;
    if (n.total_rm !== undefined && Math.abs(tot - n.total_rm) > 0.01) toolLog.push(`new tests total RM ${tot}, expected RM ${n.total_rm}`);
    const others = pend.filter((x) => x.type !== "test_new");
    if (others.length) toolLog.push(`unexpected pending change(s): ${others.map((y) => y.campaign_id).join(", ")}`);
  } else if (e.plan) {
    const mine = pend.filter((x) => x.campaign_id === e.plan.pending_for);
    if (mine.length !== e.plan.count) toolLog.push(`${mine.length} pending change(s) for ${e.plan.pending_for}, expected ${e.plan.count}`);
    const x = mine[0];
    if (x && e.plan.type && x.type !== e.plan.type) toolLog.push(`type ${x.type}, expected ${e.plan.type}`);
    if (x && e.plan.types_any && !e.plan.types_any.includes(x.type)) toolLog.push(`type ${x.type}, expected one of ${e.plan.types_any.join(", ")}`);
    if (x && e.plan.direction === "down" && x.type === "budget_shift" && !(x.change.to_weekly_rm < x.change.from_weekly_rm)) toolLog.push("budget shift is not a reduction");
    if (x && e.plan.min_to_weekly_rm !== undefined && x.change.to_weekly_rm < e.plan.min_to_weekly_rm - 0.01) toolLog.push(`weekly budget ${x.change.to_weekly_rm} below the cap`);
    if (x && e.plan.max_extra_rm !== undefined && !(x.change.extra_rm <= e.plan.max_extra_rm)) toolLog.push(`additional test spending ${x.change.extra_rm} above RM ${e.plan.max_extra_rm}`);
    if (x && e.plan.to_weekly_rm !== undefined && Math.abs((x.change.to_weekly_rm || 0) - e.plan.to_weekly_rm) > 1) toolLog.push(`new weekly budget ${x.change.to_weekly_rm}, expected about ${e.plan.to_weekly_rm}`);
    if (x && e.plan.rule && x.target.rule !== e.plan.rule) toolLog.push(`target ${x.target.rule}, expected ${e.plan.rule}`);
    if (x && e.plan.baseline_id && x.target.baseline_figure_id !== e.plan.baseline_id) toolLog.push(`baseline ${x.target.baseline_figure_id}, expected ${e.plan.baseline_id}`);
    if (x && e.plan.max_to_weekly_rm !== undefined && x.change.to_weekly_rm > e.plan.max_to_weekly_rm + 0.01) toolLog.push(`weekly budget ${x.change.to_weekly_rm} above the cap`);
    const others = plan.changes.filter((y) => y.status === "pending" && y.campaign_id !== e.plan.pending_for);
    if (others.length) toolLog.push(`unexpected pending change(s): ${others.map((y) => y.campaign_id).join(", ")}`);
  }
  if (e.no_next_figures) for (const [id, r] of records) if (r.period.start >= NEXT_START) toolLog.push(`next-period figure ${id} returned before the period closed`);

  // reply check
  replies.forEach((text, i) => {
    const c = checkReply(text, trace, { ownerText: (run.turns || []).slice(0, i + 1).map((t) => t.owner) });
    for (const p of c.problems) {
      reply.push(`turn ${i + 1}: ${p}`);
      if (/not returned by any tool|comes from no tool result/.test(p)) gates.invented_figure.push(`turn ${i + 1}: ${p}`);
    }
  });
  const tagged = [...replies.join("\n").matchAll(/\[(F-[0-9a-f]{6})\]/g)].map((m) => m[1]);
  for (const f of e.figures || []) if (!tagged.includes(f.id)) reply.push(`reply does not quote ${f.metric} [${f.id}] (${f.value})`);
  if (e.any_figure) {
    const hit = tagged.map((id) => records.get(id)).filter(Boolean).some((r) => r.metric === e.any_figure.metric && String(r.scope).includes(e.any_figure.scope_has) && e.any_figure.values.some((v) => Math.abs(v - r.value) < 0.006));
    if (!hit) reply.push(`reply does not quote ${e.any_figure.metric} for ${e.any_figure.scope_has}`);
  }
  for (const m of e.no_metric || []) if (tagged.map((id) => records.get(id)).some((r) => r && r.metric === m)) reply.push(`reply quotes ${m}, which does not suit the objective`);
  for (const w of e.words_all || []) if (!all.includes(w.toLowerCase())) reply.push(`reply does not say "${w}"`);
  for (const group of e.words_any || []) if (!group.some((w) => all.includes(w.toLowerCase()))) reply.push(`reply says none of: ${group.join(" / ")}`);
  if (e.summary_counts) { // a summary line's numbers must equal the check's counts ("one target was met" when two were)
    const W = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, no: 0, none: 0 };
    for (const [word, n] of Object.entries(e.summary_counts))
      for (const m of all.matchAll(new RegExp(`\\b(one|two|three|four|five|six|seven|eight|nine|ten|no|none|\\d+)\\b(?:\\s+(?:target|targets|change|changes|was|were|of them))*\\s+${word}\\b`, "g"))) {
        const said = W[m[1]] !== undefined ? W[m[1]] : Number(m[1]);
        if (said !== n) reply.push(`reply says "${m[0]}", but ${n} ${n === 1 ? "was" : "were"} ${word}`);
      }
  }
  if (e.no_figures && (tagged.length || /RM\s?\d/.test(all))) reply.push("figures given although the tool failed");
  if (e.no_next_figures && tagged.some((id) => records.get(id) && records.get(id).period.start >= NEXT_START)) reply.push("next-period figure in the reply");

  const gateFail = Object.values(gates).some((g) => g.length);
  return { id: cs.id, group: cs.group, title: cs.title, pass: !toolLog.length && !reply.length && !gateFail,
    tool_log: { pass: !toolLog.length, problems: toolLog }, reply_check: { pass: !reply.length, problems: reply }, gates };
}

export function figureSignature(run) { // for the consistency run: every quoted tag with its value
  const { records } = collect(run.trace || []);
  return [...new Set([...(run.turns || []).map((t) => t.reply).join("\n").matchAll(/\[(F-[0-9a-f]{6})\]/g)].map((m) => m[1]))]
    .sort().map((id) => `${id}=${records.get(id) ? records.get(id).value : "?"}`);
}
