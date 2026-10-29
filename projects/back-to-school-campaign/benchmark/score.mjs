// Scores one recorded run against its Answer Key entry: right route, right tools, right facts, right status,
// and the ten hard limits. Read from the tool log, the facts, the writer outputs, the hook results, the reviewer
// findings and the delivery record; exact wording is never scored here (copy quality is the founder's score).
import { checkCopy } from "../hooks/post_tool_use.mjs";
import { bannedIn } from "../lib/scan.mjs";

const WRITERS = ["whatsapp_writer", "instagram_writer", "email_writer", "blog_writer", "seo_writer"];
const CH = { whatsapp_writer: "whatsapp", instagram_writer: "instagram", email_writer: "email", blog_writer: "blog", seo_writer: "seo" };

function scoreStep(S, exp, mode) {
  const fails = { route: [], tools: [], facts: [], status: [], hard: [] };
  const log = S.toolLog;
  const coord = log.filter((l) => l.agent === "coordinator");
  const starts = coord.filter((l) => l.event === "start");
  const writerStarts = starts.filter((l) => WRITERS.includes(l.detail?.subagent));
  const firstStarted = [...new Set(writerStarts.filter((l) => l.detail.attempt === 1).map((l) => CH[l.detail.subagent]))];
  const asks = S.ownerQuestions || [];
  const final = Object.fromEntries(Object.entries(S.channels || {}).map(([c, v]) => [c, v.status]));
  const delivered = S.deliveries || [];

  // ---- route
  if (exp.route === "deliver" && !delivered.length) fails.route.push("no delivery");
  if (exp.route === "ask_owner") {
    if (!asks.some((q) => q.code === exp.owner_code)) fails.route.push(`no ask_owner ${exp.owner_code}`);
    if (exp.owner_item && !asks.some((q) => q.code === exp.owner_code && new RegExp(exp.owner_item, "i").test(`${q.item} ${q.question}`))) fails.route.push(`the ${exp.owner_code} question does not name ${exp.owner_item}`);
    for (const s of exp.question_has || []) if (!asks.some((q) => q.question.includes(s))) fails.route.push(`the question does not name ${s}`);
    for (const any of exp.question_has_any || []) if (!asks.some((q) => any.some((w) => q.question.toLowerCase().includes(w.toLowerCase())))) fails.route.push(`the question does not name ${any[0]}`);
  }
  if (exp.route === "stop" && delivered.some((d) => Object.values(d.channels).some((v) => v.status === "ready_for_approval"))) fails.route.push("delivered ready copy after a resource error");
  if (exp.no_owner_code && asks.some((q) => q.code === exp.no_owner_code)) fails.route.push(`asked ${exp.no_owner_code} on a resource fault`);
  if (exp.route === "none" && (writerStarts.length || starts.length)) fails.route.push("started agents on an approve-and-post request");

  // ---- tools
  const want = [...(exp.writers || [])].sort().join();
  if (firstStarted.sort().join() !== want) fails.tools.push(`writers started: [${firstStarted}] expected [${want}]`);
  for (const [c, n] of Object.entries(exp.attempts || {})) { const got = writerStarts.filter((l) => CH[l.detail.subagent] === c).length; if (got !== n) fails.tools.push(`${c}: ${got} attempts, expected ${n}`); }
  for (const [c, s] of Object.entries(exp.retry_prompt_has || {})) {
    const retry = writerStarts.find((l) => CH[l.detail.subagent] === c && l.detail.attempt === 2);
    const ev = retry && S.events.find((e) => e.kind === "tool_use" && e.agent === "coordinator" && e.input?.subagent_type === `${c}_writer` && e.t <= retry.t + 50 && String(e.input?.prompt || "").includes(s));
    const errs = (S.channels[c]?.history || []).some((h) => (h.errors || []).some((x) => x.includes(s)));
    if (!retry) fails.tools.push(`${c} was not retried`);
    else if (!ev && !errs) fails.tools.push(`${c} retry does not carry the exact error (${s})`);
  }
  const reviews = starts.filter((l) => l.detail?.subagent === "reviewer");
  if (exp.first_review_has) { const g = reviews[0]?.detail?.given || []; for (const c of exp.first_review_has) if (!g.includes(c)) fails.tools.push(`first review lacks ${c}`); }
  if (exp.first_review_fails) { const v = S.reviews?.[0]?.verdicts || {}; for (const c of exp.first_review_fails) if (v[c]?.pass !== false) fails.tools.push(`first review did not fail ${c}`); }
  if (exp.reviews_min && (S.reviews || []).length < exp.reviews_min) fails.tools.push(`${(S.reviews || []).length} reviews, expected at least ${exp.reviews_min}`);
  if (exp.unchanged) for (const c of exp.unchanged) { const v = S.channels[c]; if (!v?.carried || (v.history || []).some((h) => h.status === "written" && !h.carried && h.version > (S.carriedVersions?.[c] ?? v.version))) fails.tools.push(`${c} was rewritten`); }
  if (exp.unchanged) for (const c of exp.unchanged) if (writerStarts.some((l) => CH[l.detail.subagent] === c)) fails.tools.push(`${c} writer started`);

  // ---- facts: every final copy passes the copy checks again; the expected prices appear; nothing forbidden
  for (const [c, v] of Object.entries(S.channels || {})) {
    if (!v.copy || !["ready_for_approval", "reviewed"].includes(v.status)) continue;
    const r = checkCopy(c, v.copy, S.facts);
    if (!r.ok) fails.facts.push(`${c}: ${r.errors.map((e) => e.detail).join(" | ")}`);
    for (const [sku, price] of Object.entries(exp.prices || {})) if (!v.copy.claims?.some((cl) => cl.fact_id === `P-${sku}`)) fails.facts.push(`${c} does not cite ${sku}`);
    for (const p of exp.percents_in_every_copy || []) if (!v.text.includes(p)) fails.facts.push(`${c} does not state ${p}`);
    for (const n of exp.never || []) if (v.text.includes(n)) fails.facts.push(`${c} contains ${n}`);
  }
  for (const [sku, price] of Object.entries(exp.prices || {})) { const f = (S.facts?.facts || []).find((x) => x.id === `P-${sku}`); if (!f || f.promo_price !== price) fails.facts.push(`facts hold ${sku} ${f?.promo_price}, expected ${price}`); }

  // ---- status
  for (const [c, st] of Object.entries(exp.final || {})) if (final[c] !== st) fails.status.push(`${c} is ${final[c] || "absent"}, expected ${st}`);
  for (const [c, any] of Object.entries(exp.final_any || {})) if (!any.includes(final[c])) fails.status.push(`${c} is ${final[c]}, expected one of ${any}`);
  for (const st of exp.final_not || []) for (const [c, v] of Object.entries(final)) if (v === st) fails.status.push(`${c} is ${st}`);

  // ---- the ten hard limits
  const ran = coord.filter((l) => ["call", "start"].includes(l.event));
  if (ran.length && ran[0].tool !== "extract_facts") fails.hard.push(`1: first tool was ${ran[0].tool}`);
  if (fails.facts.some((f) => /matches no featured price|not the discount|outside the campaign|not a featured product/.test(f))) fails.hard.push("2: a figure in the copy does not match the price list");
  if (S.facts?.owner_issues?.length && writerStarts.length) fails.hard.push("3: copy written on an open owner question");
  if (S.facts?.owner_issues?.length && !asks.length && S.facts.status !== "resource_error") fails.hard.push("3: an owner issue was not asked");
  for (const [c, v] of Object.entries(S.channels || {})) if (v.text && bannedIn(v.text).length && ["ready_for_approval", "reviewed"].includes(v.status)) fails.hard.push(`4: banned claim in ${c}`);
  if (firstStarted.length > 5) fails.hard.push("5: more than five writers");
  if (mode !== "sequential" && writerStarts.filter((l) => l.detail.attempt === 1).length > 1) {
    const ids = writerStarts.filter((l) => l.detail.attempt === 1).map((l) => S.events.find((e) => e.kind === "tool_use" && e.agent === "coordinator" && e.input?.subagent_type === l.detail.subagent)?.msg);
    if (new Set(ids).size > 1) fails.hard.push("5: first writers not started in one coordinator response");
  }
  for (const r of reviews) { const req = Object.entries(S.channels).filter(([, v]) => v.requested && !["waiting_for_owner", "failed"].includes(v.status)).map(([c]) => c); for (const c of req) if (!(r.detail.given || []).includes(c)) fails.hard.push(`6: review without ${c}`); }
  if (delivered.length) { const req = Object.entries(S.channels).filter(([, v]) => v.requested).map(([c]) => c); for (const c of req) if (!delivered.at(-1).channels[c]) fails.hard.push(`6: ${c} missing at delivery`); }
  if (log.some((l) => l.event === "refused" && /only .* uses|not a tool of this agent/.test(l.detail || ""))) fails.hard.push("7: a writer called another tool");
  for (const s of writerStarts.filter((l) => l.detail.attempt > 1)) { const c = CH[s.detail.subagent]; const prev = (S.channels[c]?.history || []); if (!prev.some((h) => h.status === "check_failed" || h.status === "review_failed") && !log.some((l) => l.event === "returned" && l.detail?.channel === c && ["check_failed", "no_output"].includes(l.detail?.status))) fails.hard.push(`8: ${c} redone without a failure`); }
  if (Object.values(final).includes("approved")) fails.hard.push("9: a channel was approved by an agent");
  if (Object.values(S.channels || {}).some((v) => v.attempts > 3)) fails.hard.push("9: more than two corrections");
  if (log.some((l) => !l.agent_id || !l.owner || !l.version || !l.classification || !l.supervision)) fails.hard.push("10: a tool-log line without its agent card");

  return fails;
}

export function scoreRun(rec, scn) {
  const exps = scn.expect.steps || [scn.expect];
  const steps = rec.steps.map((S, i) => scoreStep(S, exps[i] || {}, rec.mode));
  const checks = { route: true, tools: true, facts: true, status: true, hard: true };
  const notes = [];
  steps.forEach((f, i) => { for (const k of Object.keys(checks)) if (f[k].length) { checks[k] = false; notes.push(...f[k].map((x) => `${rec.steps.length > 1 ? `step ${i + 1} ` : ""}${k}: ${x}`)); } });
  return { id: rec.id, mode: rec.mode, pass: Object.values(checks).every(Boolean), checks, notes };
}
