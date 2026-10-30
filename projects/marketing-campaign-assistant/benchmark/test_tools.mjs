// No-key tests: the tools, the hook, the reply check and the key scan. Run with no API key.
// node benchmark/test_tools.mjs
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT, makeDesk, memoryStore, loadConfig, loadData, Hooks, readCsv } from "../lib/load.mjs";

const require = createRequire(import.meta.url);
const { checkReply } = require(path.join(ROOT, "lib", "replycheck.js"));
const KEY = JSON.parse(fs.readFileSync(path.join(ROOT, "benchmark", "answer-key.json"), "utf8"));
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "plan.seed.json"), "utf8"));
const STATES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "states.json"), "utf8"));
let pass = 0, failN = 0;
const ok = (cond, name, detail) => { if (cond) pass++; else { failN++; console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); } };
const err = (r) => (r.ok ? "ok" : r.error.category);
const proposal = (id) => {
  const d = makeDesk({}); const g = d.call("get_campaign", { campaign_id: id, period_start: "2026-08-31", period_end: "2026-09-27" });
  return { d, g };
};
const P = KEY.periods;
const r2 = (x) => Math.floor(x * 100 + 0.5 + 1e-9) / 100;

// 1. every figure the tools return for the standard periods matches the Answer Key
{
  const d = makeDesk({});
  const plats = [undefined, "Facebook", "Instagram", "TikTok", "YouTube", "XiaoHongShu"];
  const objs = [undefined, "Sales"];
  const seen = {};
  for (const per of [P.review, P.baseline, P.prior])
    for (const platform of plats) for (const objective of objs) for (const group_by of ["none", "platform"]) {
      const r = d.call("get_performance", { period_start: per.start, period_end: per.end, platform, objective, group_by });
      for (const g of r.groups || []) seen[`platform:${g.platform}|${per.start}|${per.end}`] = g.review_status.status;
    }
  const camps = readCsv(path.join(ROOT, "data", "campaigns.csv"));
  for (const c of camps) for (const per of [null, P.baseline, P.prior]) {
    const r = d.call("get_campaign", per ? { campaign_id: c.campaign_id, period_start: per.start, period_end: per.end } : { campaign_id: c.campaign_id });
    if (r.ok && r.weeks.length) seen[`campaign:${c.campaign_id}|${r.period.start}|${r.period.end}`] = r.review_status.status;
  }
  for (const row of d.call("get_performance", { group_by: "campaign" }).rows) seen[`campaign:${row.campaign_id}|${P.review.start}|${P.review.end}`] = row.review_status.status;
  let compared = 0, wrong = [];
  for (const [id, r] of d.returned) {
    const k = KEY.figures[id]; if (!k) continue; compared++;
    const same = (k.value === null && r.value === null) || (k.value !== null && r.value !== null && Math.abs(k.value - r.value) < 0.006);
    if (!same) wrong.push(`${id} ${r.metric} ${r.scope} tools ${r.value} key ${k.value}`);
  }
  const keyCount = Object.keys(KEY.figures).length;
  ok(wrong.length === 0, "figures match the Answer Key", wrong.slice(0, 5).join(" | "));
  ok(compared / keyCount > 0.97, "Answer Key coverage", `${compared} of ${keyCount}`);
  const sWrong = Object.entries(KEY.statuses).filter(([k, v]) => seen[k] !== v).map(([k, v]) => `${k} tools ${seen[k]} key ${v}`);
  ok(sWrong.length === 0, "review statuses match the Answer Key", sWrong.slice(0, 5).join(" | "));
  console.log(`  figures compared with the Answer Key: ${compared} of ${keyCount}, wrong ${wrong.length}; statuses ${Object.keys(KEY.statuses).length}, wrong ${sWrong.length}`);
}

// 2. get_performance and get_campaign: review status (RP-9), statuses, structured errors
{
  const d = makeDesk({});
  const RS = STATES.review_status;
  ok(err(d.call("get_performance", { period_start: "2026-10-05", period_end: "2026-10-11" })) === "period_not_available", "next period not available to review");
  ok(err(d.call("get_performance", { period_start: "2026-09-01", period_end: "2026-09-27" })) === "invalid_input", "period must start on a Monday");
  ok(err(d.call("get_campaign", { campaign_id: "ZZ-01" })) === "campaign_not_found", "campaign_not_found");
  const plat = d.call("get_performance", { objective: "Sales", group_by: "platform" });
  ok(plat.ranking.order.length === 5 && plat.ranking.order.includes("XiaoHongShu"), "every platform ranked: no spending exclusion (RP-2)", plat.ranking.order.join(","));
  ok(plat.groups.every((g) => !("evidence" in g)), "no evidence gate left in the result");
  const xh = plat.groups.find((g) => g.platform === "XiaoHongShu");
  ok(xh.review_status.status === "Limited results" && xh.review_status.window.start === "2026-08-31", "XiaoHongShu Limited results over the last 4 calendar weeks");
  ok(plat.groups.every((g) => g.review_status.window && g.review_status.window.start === xh.review_status.window.start), "platform windows match");
  const st = (id, s, e) => d.call("get_campaign", s ? { campaign_id: id, period_start: s, period_end: e } : { campaign_id: id }).review_status;
  ok(st(RS.limited_29).status === "Limited results" && st(RS.limited_29).orders.value === 29, "29 orders: Limited results");
  const b30 = st(RS.boundary_30);
  ok(b30.status === "Consistent results" && b30.orders.value === 30 && b30.variation.value === 30, "30 orders and variation exactly 30.00%: Consistent", JSON.stringify([b30.status, b30.orders && b30.orders.value, b30.variation && b30.variation.value]));
  const va = st(RS.variable_above);
  ok(va.status === "Variable results" && va.variation.value === 30.25, "variation 30.25%: Variable results", JSON.stringify([va.status, va.variation && va.variation.value]));
  const lo = d.call("get_campaign", { campaign_id: RS.low_spend_useful });
  ok(lo.review_status.status === "Consistent results" && lo.totals.spend.value < 800, "low spend, useful results: Consistent, spend never gates", `${lo.totals.spend.value}`);
  const hi = d.call("get_campaign", { campaign_id: RS.high_spend_poor });
  ok(hi.review_status.status === "Consistent results" && hi.totals.roas.value < 1.2 && hi.totals.spend.value > 2000, "high spend, poor ROAS: Consistent does not mean good");
  const z = st(RS.zero_avg_roas);
  ok(z.status === "Variation not assessable" && /zero/.test(z.reason), "zero average weekly ROAS: not assessable");
  const tf = d.call("get_campaign", { campaign_id: RS.tracking_fault });
  ok(tf.review_status.status === "Data issue" && /Reported by the owner/.test(tf.review_status.reason) && tf.statuses.data_notes && /not detected/.test(tf.statuses.data_notes[0].supplied), "supplied tracking fault: Data issue, named as supplied");
  ok(st(STATES.partial[0]).status === "Variation not assessable" && /week\(s\) with spend/.test(st(STATES.partial[0]).reason), "fewer than 4 weeks: not assessable with the week count");
  const short = d.call("get_performance", { objective: "Sales", platform: "Facebook", period_start: "2026-09-21", period_end: "2026-09-27" }).review_status;
  ok(short.status === "Variation not assessable" && /^1 week/.test(short.reason), "a 1-week period: not assessable, 1 week stated", short.reason);
  // a missing week inside a status window
  const mwId = STATES.missing_week[0], mwDate = STATES.missing_week_date;
  const mwStart = new Date(Date.parse(mwDate + "T00:00:00Z") - 7 * 864e5).toISOString().slice(0, 10), mwEnd = new Date(Date.parse(mwDate + "T00:00:00Z") + 20 * 864e5).toISOString().slice(0, 10);
  ok(st(mwId, mwStart, mwEnd).status === "Data issue", "missing week inside the window: Data issue");
  // a platform window with a zero-spend week: search the review period for one
  let idle = null;
  for (let w = Date.parse(P.review.start + "T00:00:00Z"); !idle && w + 27 * 864e5 <= Date.parse(P.review.end + "T00:00:00Z"); w += 7 * 864e5)
    for (const p of ["YouTube", "XiaoHongShu", "TikTok"]) {
      const s = new Date(w).toISOString().slice(0, 10), e = new Date(w + 27 * 864e5).toISOString().slice(0, 10);
      const r = d.call("get_performance", { objective: "Sales", platform: p, period_start: s, period_end: e });
      if (r.ok && r.campaigns > 0 && r.review_status.weekly_spend && r.review_status.weekly_spend.some((f) => f.value === 0)) { idle = r.review_status; break; }
    }
  ok(idle && idle.status === "Variation not assessable" && /without spend/.test(idle.reason) && idle.weekly_spend.length === 4, "zero-spend week in a platform window: visible, not assessable");
  const all = d.call("get_performance", {});
  ok(all.totals.roas && all.owner_targets && all.owner_targets.set === false, "every campaign is Sales: ROAS for all platforms; owner targets not set");
  ok(err(d.call("get_performance", { objective: "Awareness" })) === "invalid_input", "objective other than Sales refused");
  const mw = d.call("get_campaign", { campaign_id: mwId });
  ok(mw.statuses.incomplete && mw.statuses.incomplete.missing_weeks[0] === mwDate && mw.totals_note, "missing week named, totals incomplete");
  const zr = d.call("get_campaign", { campaign_id: STATES.zero_results[0] });
  ok(zr.statuses.zero_result_weeks.length === 2 && zr.weeks.some((w) => w.figures.cost_per_order.value === null), "zero orders: cost per order undefined");
  for (const id of STATES.overspend) {
    const c = d.call("get_campaign", { campaign_id: id });
    const k = Object.values(KEY.figures).find((f) => f.metric === "over_budget" && f.scope === id);
    ok(c.statuses.overspend && k && Math.abs(c.statuses.overspend.value - k.value) < 0.006, `overspend ${id}`);
  }
  const ig = d.call("get_performance", { platform: "Instagram", objective: "Sales", group_by: "campaign" });
  ok(ig.rows.filter((r) => r.status === "Running").every((r) => r.statuses.partial && !ig.ranking.order.includes(r.campaign_id) && ig.ranking.partial_order.includes(r.campaign_id)), "Running campaigns partial, ranked only among themselves");
  ok(ig.rows.every((r) => r.performance_period && r.review_status), "campaign rows carry both windows");
  const wk = d.call("get_campaign", { campaign_id: "FB-14" });
  ok(wk.weeks.every((w) => w.figures.reach && w.figures.frequency) && !("reach" in wk.totals), "reach and frequency weekly only");
  const again = makeDesk({}).call("get_performance", { period_start: P.baseline.start, period_end: P.baseline.end });
  const first = makeDesk({}).call("get_performance", { period_start: P.baseline.start, period_end: P.baseline.end });
  ok(JSON.stringify(again.totals) === JSON.stringify(first.totals), "same question, same figures and IDs");
}

// 3. propose_change: routine changes, tests, every check and structured error
{
  const wb = STATES.weekly_budget;
  let { d, g } = proposal("TT-14");
  const t = (rule, base) => ({ rule, baseline_figure_id: base, deadline: "2026-10-25" });
  const cpm = g.totals.roas.id;
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: wb["TT-14"] * 1.1, reason: "r", reason_figure_ids: [cpm], target: t("T3", cpm) })) === "owner_targets_not_set", "routine increase refused while owner targets are not set (PR-11)");
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: wb["TT-14"] * 0.7, reason: "r", reason_figure_ids: [cpm], target: t("T3", cpm) })) === "over_limit", "over_limit at -30%");
  ok(err(d.call("propose_change", { campaign_id: "IG-07", type: "pause", reason: "r", reason_figure_ids: [cpm], target: t("T1", cpm) })) === "campaign_closed", "campaign_closed");
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: wb["TT-14"] * 0.9, reason: "r", reason_figure_ids: ["F-000000"], target: t("T3", cpm) })) === "reason_not_found", "reason_not_found");
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: wb["TT-14"] * 0.9, reason: "r", reason_figure_ids: [cpm], target: { rule: "T3", baseline_figure_id: cpm, deadline: "2026-10-04" } })) === "target_incomplete", "deadline too early");
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: wb["TT-14"] * 0.9, reason: "r", reason_figure_ids: [cpm], target: t("T2", cpm) })) === "target_incomplete", "T2 does not fit a budget decrease");
  const down = d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: Math.round(wb["TT-14"] * 0.8), reason: "r", reason_figure_ids: [cpm], target: t("T3", cpm) });
  ok(down.ok && down.saved.status === "pending", "a -20% shift saved as pending", JSON.stringify(down).slice(0, 200));
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: Math.round(wb["TT-14"] * 0.6), reason: "r", reason_figure_ids: [cpm], target: t("T3", cpm) })) === "over_limit", "second shift: cumulative cap");
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "budget_shift", new_weekly_budget_rm: Math.round(wb["TT-14"] * 0.85), reason: "r", reason_figure_ids: [cpm], target: t("T3", cpm) })) === "owner_targets_not_set", "raising back after a cut is an increase: refused");
  const sp = g.totals.spend.id;
  ok(d.call("propose_change", { campaign_id: "TT-14", type: "pause", reason: "r", reason_figure_ids: [cpm], target: t("T1", sp) }).ok, "pause saved");
  ok(err(d.call("propose_change", { campaign_id: "TT-14", type: "pause", reason: "r", reason_figure_ids: [cpm], target: t("T1", sp) })) === "duplicate", "duplicate pending pause");
  // evidence for routine changes: a partial campaign, another campaign's figure, T1 baseline
  const p = proposal(STATES.partial[0]);
  const pid = p.g.totals.spend.id;
  ok(err(p.d.call("propose_change", { campaign_id: STATES.partial[0], type: "pause", reason: "r", reason_figure_ids: [pid], target: t("T1", pid) })) === "evidence_rule_failed", "routine change on a partial campaign: fewer than 3 weeks");
  const q = proposal("FB-15"); const other = q.d.call("get_campaign", { campaign_id: "IG-15", period_start: P.baseline.start, period_end: P.baseline.end });
  ok(err(q.d.call("propose_change", { campaign_id: "FB-15", type: "pause", reason: "r", reason_figure_ids: [other.totals.roas.id], target: t("T1", q.g.totals.spend.id) })) === "evidence_rule_failed", "another campaign's figure");
  ok(err(q.d.call("propose_change", { campaign_id: "FB-15", type: "pause", reason: "r", reason_figure_ids: [q.g.totals.roas.id], target: t("T1", q.g.totals.roas.id) })) === "target_incomplete", "T1 baseline must be spend");
  const ext = q.d.call("propose_change", { campaign_id: "FB-15", type: "extend", new_end_date: "2027-01-31", reason: "r", reason_figure_ids: [q.g.totals.roas.id], target: t("T4", q.g.totals.roas.id) });
  ok(ext.ok, "extension with a T4 check allowed", JSON.stringify(ext).slice(0, 160));

  // test_boost (PR-12): the 20% cap binds on a small campaign; fields; target rule; saved with the test record
  const x = proposal("XH-05"); const xr = x.g.totals.roas.id;
  const boost = (to, extra) => x.d.call("propose_change", Object.assign({ campaign_id: "XH-05", type: "test_boost", new_weekly_budget_rm: to, reason: "promising ROAS, few orders", reason_figure_ids: [xr],
    test_question: "Does ROAS hold at a higher budget?", stop_condition: "Stop when the cap is spent.", target: t("T2", xr) }, extra || {}));
  ok(err(boost(r2(wb["XH-05"] * 1.25))) === "over_limit", "boost above 20%: over_limit (PR-4 applies to tests)");
  ok(err(boost(r2(wb["XH-05"] * 1.1), { test_question: "" })) === "test_incomplete", "test without a test question: test_incomplete");
  ok(err(boost(r2(wb["XH-05"] * 1.1), { target: t("T3", xr) })) === "target_incomplete", "a test needs a T2 target");
  const bz = boost(Math.floor(wb["XH-05"] * 1.2));
  ok(bz.ok && bz.saved.type === "test_boost" && bz.saved.change.extra_rm === r2((Math.floor(wb["XH-05"] * 1.2) - wb["XH-05"]) * 4) && bz.saved.test.question, "boost within 20% saved, extra spending counted", JSON.stringify(bz).slice(0, 200));
  ok(err(boost(Math.floor(wb["XH-05"] * 1.15))) === "duplicate", "second boost on the same campaign: duplicate");
  // RM 500 per test binds on a boost when the per-test cap is lowered
  const small = makeDesk({ config: loadConfig({ test_caps: { per_test_rm: 20, combined_rm: 1000 } }) });
  const sg = small.call("get_campaign", { campaign_id: "XH-05", period_start: P.baseline.start, period_end: P.baseline.end });
  ok(err(small.call("propose_change", { campaign_id: "XH-05", type: "test_boost", new_weekly_budget_rm: Math.floor(wb["XH-05"] * 1.2), reason: "r", reason_figure_ids: [sg.totals.roas.id], test_question: "q", stop_condition: "s", target: t("T2", sg.totals.roas.id) })) === "over_test_cap", "boost: additional spending over the per-test cap");

  // test_new: PR-5 binds first on the sample plan (headroom about RM 416)
  const h = makeDesk({});
  const hb = h.call("get_performance", { platform: "TikTok", objective: "Sales", period_start: P.baseline.start, period_end: P.baseline.end }).totals.roas.id;
  ok(err(h.call("propose_change", { type: "test_new", platform: "TikTok", objective: "Sales", new_weekly_budget_rm: 125, reason: "r", reason_figure_ids: [hb], test_question: "q", stop_condition: "s", target: t("T2", hb) })) === "over_total_budget",
    "RM 500 new test refused by PR-5 when the plan has no room");
  ok(h.call("propose_change", { type: "test_new", platform: "TikTok", objective: "Sales", new_weekly_budget_rm: 100, reason: "r", reason_figure_ids: [hb], test_question: "q", stop_condition: "s", target: t("T2", hb) }).ok, "RM 400 new test fits PR-5");
  // per-test cap, combined cap, platform benchmark baseline, after two pauses free room under PR-5
  const n = makeDesk({});
  for (const id of ["IG-14", "FB-15"]) { const r = n.call("get_campaign", { campaign_id: id, period_start: P.baseline.start, period_end: P.baseline.end });
    ok(n.call("propose_change", { campaign_id: id, type: "pause", reason: "r", reason_figure_ids: [r.totals.roas.id], target: t("T1", r.totals.spend.id) }).ok, `pause ${id} frees room`); }
  const base = (pl) => n.call("get_performance", { platform: pl, objective: "Sales", period_start: P.baseline.start, period_end: P.baseline.end }).totals.roas.id;
  const fresh = (pl, wk, extra) => n.call("propose_change", Object.assign({ type: "test_new", platform: pl, objective: "Sales", campaign_name: "Trial", new_weekly_budget_rm: wk, reason: "try a small test",
    reason_figure_ids: [base(pl)], test_question: "Does it sell?", stop_condition: "Stop at the cap.", target: t("T2", base(pl)) }, extra || {}));
  ok(err(fresh("TikTok", 200)) === "over_test_cap", "new test RM 800 over four weeks: over_test_cap");
  const tk = fresh("TikTok", 125);
  ok(tk.ok && tk.saved.change.total_rm === 500 && tk.saved.campaign_id === null && /comparison benchmark/.test(tk.saved.target.benchmark), "new test at RM 500 saved, platform baseline labelled a benchmark", JSON.stringify(tk).slice(0, 200));
  ok(err(fresh("TikTok", 100)) === "duplicate", "second pending test on the same platform: duplicate");
  ok(fresh("Facebook", 125).ok, "second new test: combined RM 1,000 reached");
  ok(err(fresh("Instagram", 125)) === "over_combined_test_cap", "third test: over_combined_test_cap");
  ok(n._internals.testTotal() === 1000, "tests in the plan total RM 1,000");
  const cg = n.call("get_campaign", { campaign_id: "YT-08", period_start: P.baseline.start, period_end: P.baseline.end });
  ok(err(fresh("YouTube", 50, { reason_figure_ids: [cg.totals.roas.id], target: t("T2", cg.totals.roas.id) })) === "target_incomplete", "new test baseline must be the platform's figure");
  // PR-5 binds once the test caps are raised
  const big = makeDesk({ config: loadConfig({ test_caps: { per_test_rm: 1e6, combined_rm: 1e7 } }) });
  const bb = big.call("get_performance", { platform: "YouTube", objective: "Sales", period_start: P.baseline.start, period_end: P.baseline.end }).totals.roas.id;
  const huge = big.call("propose_change", { type: "test_new", platform: "YouTube", objective: "Sales", new_weekly_budget_rm: big._internals.baselineSpend(), reason: "r", reason_figure_ids: [bb], test_question: "q", stop_condition: "s", target: t("T2", bb) });
  ok(err(huge) === "over_total_budget", "a test cannot pass this period's spend (PR-5)", err(huge));
  ok(big._internals.plannedTotal() <= big._internals.baselineSpend(), "planned total stays within this period's spend");
  // a supplied data issue refuses a test, on the campaign and on its platform
  const noted = loadData(); noted.notes = noted.notes.concat([{ campaign_id: "IG-15", kind: "tracking_fault", weeks: ["2026-09-07"], source: "Reported by the owner", note: "test note" }]);
  const di = makeDesk({ data: noted });
  const ig15 = di.call("get_campaign", { campaign_id: "IG-15", period_start: P.baseline.start, period_end: P.baseline.end });
  ok(ig15.review_status.status === "Data issue", "a supplied note in the window: Data issue");
  ok(err(di.call("propose_change", { campaign_id: "IG-15", type: "test_boost", new_weekly_budget_rm: Math.floor(wb["IG-15"] * 1.1), reason: "r", reason_figure_ids: [ig15.totals.roas.id], test_question: "q", stop_condition: "s", target: t("T2", ig15.totals.roas.id) })) === "data_issue", "test boost refused on a Data issue (PR-12)");
  const igb = di.call("get_performance", { platform: "Instagram", objective: "Sales", period_start: P.baseline.start, period_end: P.baseline.end }).totals.roas.id;
  ok(err(di.call("propose_change", { type: "test_new", platform: "Instagram", objective: "Sales", new_weekly_budget_rm: 100, reason: "r", reason_figure_ids: [igb], test_question: "q", stop_condition: "s", target: t("T2", igb) })) === "data_issue", "new test refused on a platform Data issue");
  // a cut is always allowed under PR-5
  const tb = makeDesk({}); const f15 = tb.call("get_campaign", { campaign_id: "FB-15", period_start: P.baseline.start, period_end: P.baseline.end });
  const cut = tb.call("propose_change", { campaign_id: "FB-15", type: "pause", reason: "r", reason_figure_ids: [f15.totals.roas.id], target: t("T1", f15.totals.spend.id) });
  ok(cut.ok, "a pause is not blocked by the total", err(cut));
}

// 3b. owner targets (BP-8, RP-11, PR-11)
{
  const pt = makeDesk({})._internals.proposedTargets();
  ok(pt.min_roas === KEY.proposed_targets.min_roas && pt.max_cost_per_order === KEY.proposed_targets.max_cost_per_order, "proposed targets match the Answer Key", JSON.stringify(pt));
  const T = { min_roas: pt.min_roas, max_cost_per_order: pt.max_cost_per_order };
  const d = makeDesk({ config: loadConfig({ owner_targets: T }) });
  const seen = {};
  for (const per of [P.review, P.baseline, P.prior]) {
    for (const g of d.call("get_performance", { period_start: per.start, period_end: per.end, group_by: "platform" }).groups) if (g.review_status.target_check) seen[`platform:${g.platform}|${per.start}|${per.end}`] = g.review_status.target_check.result;
    for (const r of d.call("get_performance", { period_start: per.start, period_end: per.end, group_by: "campaign" }).rows) if (r.review_status.target_check) seen[`campaign:${r.campaign_id}|${per.start}|${per.end}`] = r.review_status.target_check.result;
  }
  const want = Object.entries(KEY.target_checks).filter(([k]) => [P.review, P.baseline, P.prior].some((x) => k.endsWith(`|${x.start}|${x.end}`)));
  const bad = want.filter(([k, v]) => seen[k] !== v).map(([k, v]) => `${k} tools ${seen[k]} key ${v}`);
  ok(want.length > 20 && bad.length === 0, "target checks match the Answer Key", `${want.length} compared; ` + bad.slice(0, 4).join(" | "));
  const tw = [...d.returned.values()].filter((f) => KEY.target_figures[f.id]);
  ok(tw.length > 20 && tw.every((f) => Math.abs((KEY.target_figures[f.id].value ?? -1) - (f.value ?? -1)) < 0.006), "target window figures match the Answer Key", String(tw.length));
  ok(makeDesk({}).call("get_campaign", { campaign_id: "FB-14" }).review_status.target_check === undefined, "no target check while targets are not set");
  const C = (cs) => cs.cases.find((x) => x.id === "V3");
  const elig = C(JSON.parse(fs.readFileSync(path.join(ROOT, "benchmark", "cases.json"), "utf8"))).expect.plan.pending_for;
  const tt = (rule, base) => ({ rule, baseline_figure_id: base, deadline: "2026-10-25" });
  const up = (desk, id, k) => { const g = desk.call("get_campaign", { campaign_id: id, period_start: P.baseline.start, period_end: P.baseline.end });
    return desk.call("propose_change", { campaign_id: id, type: "budget_shift", new_weekly_budget_rm: r2(STATES.weekly_budget[id] * k), reason: "meets both targets", reason_figure_ids: [g.totals.roas.id], target: tt("T2", g.totals.roas.id) }); };
  const okUp = up(d, elig, 1.1);
  ok(okUp.ok && okUp.saved.target.rule === "T2", `routine increase for ${elig}: Consistent and meets both targets`, JSON.stringify(okUp).slice(0, 200));
  ok(err(up(makeDesk({ config: loadConfig({ owner_targets: T }) }), elig, 1.3)) === "over_limit", "routine increase still inside the 20% cap");
  const rows = d.call("get_performance", { period_start: P.baseline.start, period_end: P.baseline.end, group_by: "campaign" }).rows.filter((r) => r.status === "Running");
  const miss = rows.find((r) => r.review_status.target_check && r.review_status.target_check.result !== "Meets both targets" && r.review_status.status === "Consistent results");
  ok(miss && err(up(makeDesk({ config: loadConfig({ owner_targets: T }) }), miss.campaign_id, 1.1)) === "not_eligible", "Consistent but missing a target: not_eligible", miss && miss.campaign_id);
  const lim = rows.find((r) => r.review_status.status === "Limited results");
  ok(lim && err(up(makeDesk({ config: loadConfig({ owner_targets: T }) }), lim.campaign_id, 1.1)) === "not_eligible", "Limited results: not_eligible", lim && lim.campaign_id);
  ok(err(up(makeDesk({ config: loadConfig({ owner_targets: { min_roas: T.min_roas, max_cost_per_order: null } }) }), elig, 1.1)) === "owner_targets_not_set", "one target only: still not set");
}

// 4. check_plan: closed period, outcomes against the Answer Key, midweek window, tests
{
  const d = makeDesk({ config: loadConfig({ today: "2026-10-25" }), store: memoryStore(SEED) });
  ok(err(d.call("check_plan", {})) === "period_not_closed", "check refused on Sun 25 Oct");
  const e = makeDesk({ config: loadConfig({ today: "2026-10-26" }), store: memoryStore({ changes: [] }) });
  ok(err(e.call("check_plan", {})) === "no_approved_plan", "no_approved_plan");
  const c = makeDesk({ config: loadConfig({ today: "2026-10-26" }), store: memoryStore(SEED) }).call("check_plan", {});
  for (const x of c.checked) {
    const k = KEY.checks[x.id];
    ok(k && k.done === x.done && k.target_met === x.target_met, `check ${x.id} ${x.campaign_id}`, `${x.done}/${x.target_met} vs ${k && k.done}/${k && k.target_met}`);
  }
  const mid = c.checked.find((x) => x.campaign_id === STATES.seed_plan.midweek_met);
  ok(mid && !mid.counted_weeks.includes("2026-09-28") && mid.counted_weeks[0] === "2026-10-05", "midweek action: its week is not counted");
  ok(mid.type === "test_boost" && /do not respond/.test(mid.note), "boost check states the rows do not respond to the change");
  const nw = c.checked.find((x) => x.type === "test_new");
  ok(nw && nw.target_met === "test results unavailable" && !nw.observed, "new campaign test: test results unavailable, nothing generated");
  ok(c.not_scored.some((x) => x.status === "rejected"), "rejected change listed, not scored");
  ok(!c.checked.some((x) => x.campaign_id === "FB-14"), "the RM 0.00 pause is not in the sample plan (founder, 30 Oct)");
  const kc = {}; for (const k of Object.values(KEY.checks)) kc[k.target_met] = (kc[k.target_met] || 0) + 1;
  ok(Object.entries(kc).every(([k, v]) => c.counts[k] === v) && c.counts.changes === Object.keys(KEY.checks).length, "summary counts match the Answer Key", JSON.stringify(c.counts));
  // T1 met, kept in the no-key tests only: FB-14's next-period spend stops after its first week
  const t1 = { changes: [{ id: "T-01", campaign_id: "FB-14", type: "pause", change: {}, target: { rule: "T1", deadline: "2026-10-25" }, status: "approved",
    decided: { by: "Owner", at: "2026-09-28" }, action: { action: "Paused", date: "2026-09-29", new_setting: "Paused" } }] };
  const m = makeDesk({ config: loadConfig({ today: "2026-10-26" }), store: memoryStore(t1) }).call("check_plan", {}).checked[0];
  ok(m.done === "reported done" && m.target_met === "met", "T1 met: spend stopped in every counted week");
}

// 5. the hook and the tool log
{
  const before = Hooks.guardNextRead(loadConfig({ today: "2026-10-25" }), () => ["rows"]);
  let threw = false; try { before(); } catch (e) { threw = e.category === "period_not_closed"; }
  ok(threw, "hook refuses next-period reads on Sun 25 Oct");
  ok(Hooks.guardNextRead(loadConfig({ today: "2026-10-26" }), () => ["rows"])()[0] === "rows", "hook allows them on Mon 26 Oct");
  const lines = []; const d = makeDesk({ logLines: lines });
  d.call("get_campaign", { campaign_id: "FB-14", note: "sk-ant-api03-ABCDEFGHIJKLMNOP" });
  ok(lines.length === 1 && lines[0].tool === "get_campaign" && !JSON.stringify(lines).includes("sk-ant-api03"), "tool log written, key removed");
}

// 6. owner functions; the agent has no approval tool
{
  const store = memoryStore({ changes: [] });
  const { d, g } = (() => { const d = makeDesk({ store }); return { d, g: d.call("get_campaign", { campaign_id: "XH-05", period_start: P.baseline.start, period_end: P.baseline.end }) }; })();
  const s = d.call("propose_change", { campaign_id: "XH-05", type: "pause", reason: "low ROAS", reason_figure_ids: [g.totals.roas.id], target: { rule: "T1", baseline_figure_id: g.totals.spend.id, deadline: "2026-10-25" } });
  ok(s.ok && s.saved.status === "pending", "XH-05 pause saved pending", JSON.stringify(s).slice(0, 200));
  ok(!d.tools.some((t) => /approve|reject|record/i.test(t.name)), "no approval tool for the agent");
  ok(err(d.owner.recordAction(s.saved.id, { action: "Paused", date: "2026-09-29" })) === "not_approved", "no action record before approval");
  ok(d.owner.approve(s.saved.id).ok && err(d.owner.approve(s.saved.id)) === "not_pending", "owner approves once");
  ok(err(d.owner.recordAction(s.saved.id, { action: "Paused", date: "2026-10-05" })) === "invalid_input", "action date outside the action window");
}

// 7. the reply check on prepared replies
{
  const d = makeDesk({});
  const g = d.call("get_campaign", { campaign_id: "IG-15", period_start: P.baseline.start, period_end: P.baseline.end });
  const trace = [{ name: "get_campaign", input: {}, result: g }];
  const roas = g.totals.roas, sp = g.totals.spend;
  const good = `IG-15 spent RM ${sp.value.toLocaleString("en-US", { minimumFractionDigits: 2 })} [${sp.id}] from 31 Aug to 27 Sep, with ROAS ${roas.value}x [${roas.id}].`;
  ok(checkReply(good, trace).ok, "good reply passes", JSON.stringify(checkReply(good, trace).problems));
  ok(!checkReply(`IG-15 had ROAS ${roas.value + 0.4}x [${roas.id}].`, trace).ok, "wrong value with a real tag fails");
  ok(!checkReply(`IG-15 spent RM ${sp.value} [${roas.id}].`, trace).ok, "tag on the wrong metric fails");
  ok(!checkReply(`IG-15 had ROAS ${roas.value}x.`, trace).ok, "figure without a tag fails");
  ok(!checkReply(`IG-15 had ROAS 9.99x [F-abcdef].`, trace).ok, "invented tag fails");
  ok(!checkReply(`Instagram had ROAS ${roas.value}x [${roas.id}].`, trace).ok, "wrong scope fails");
  ok(!checkReply(`IG-15's ROAS ${roas.value}x [${roas.id}] means a good profit.`, trace).ok, "ROAS called profit fails");
  ok(checkReply(`IG-15's ROAS ${roas.value}x [${roas.id}] is revenue over spend, not profit.`, trace).ok, "ROAS explained as not profit passes");
  ok(!checkReply(`The budget increase led to IG-15's ROAS of ${roas.value}x [${roas.id}].`, trace).ok, "causal wording fails");
  ok(checkReply(`IG-15's CTR, the share of impressions that led to a click, was ${g.totals.ctr.value}% [${g.totals.ctr.id}].`, trace).ok, "a metric's definition is not causal wording",
    JSON.stringify(checkReply(`IG-15's CTR, the share of impressions that led to a click, was ${g.totals.ctr.value}% [${g.totals.ctr.id}].`, trace).problems));
  ok(!checkReply(`The owner's pause was verified.`, trace).ok, "verified fails");
  ok(!checkReply(`IG-15 spent RM ${sp.value} and had ROAS ${roas.value}x [${sp.id}, ${roas.id}].`, trace).ok, "several IDs in one bracket fails");
  ok(!checkReply(`IG-15's ROAS ${roas.value}x [${roas.id}] is outside the period.`, trace, { allowedPeriods: [["2025-09-29", "2026-08-30"]] }).ok, "period outside the case fails");
  { const z = d.call("get_campaign", { campaign_id: STATES.zero_results[0] }); const w = z.weeks.find((x) => x.figures.orders.value === 0);
    ok(checkReply(`In the week of ${w.week_start}, ${STATES.zero_results[0]} recorded zero orders [${w.figures.orders.id}].`, [{ name: "get_campaign", result: z }]).ok, "zero in words matches a 0 figure"); }
  ok(!checkReply("I detected a tracking fault on IG-01.", trace).ok, "a reported data issue claimed as detected fails");
  const o15 = g.totals.orders;
  ok(checkReply(`IG-15 spent RM ${sp.value.toLocaleString("en-US", { minimumFractionDigits: 2 })} [${sp.id}], and it recorded ${o15.value} orders [${o15.id}].`, trace).ok, "a count after a money figure is matched to its own tag",
    JSON.stringify(checkReply(`IG-15 spent RM ${sp.value.toLocaleString("en-US", { minimumFractionDigits: 2 })} [${sp.id}], and it recorded ${o15.value} orders [${o15.id}].`, trace).problems));
  ok(!checkReply(`IG-15's ROAS was ${roas.value}x [baseline ${roas.id}].`, trace).ok, "words inside a tag bracket fail");
  ok(!checkReply("Here is the corrected reply.", trace).ok && !checkReply("My first attempt was refused, so I resubmitted it.", trace).ok, "mechanism talk in a reply fails");
  ok(!checkReply("The test passes at the tool's threshold.", trace).ok, "a reply naming the tool fails");
  ok(checkReply("RM 200 a week is over the RM 500 cap per test.", trace, { ownerText: ["Set up a test at RM 200 a week."] }).ok, "the owner's own figure and a rule figure are sourced");
  ok(!checkReply("RM 200 a week is RM 800 over four weeks.", trace, { ownerText: ["Set up a test at RM 200 a week."] }).ok, "a figure worked out from the owner's is not");
  ok(checkReply("You reported a tracking fault on IG-01, so its results are a data issue.", trace).ok, "a reported data issue named as reported passes");
  const tf = d.call("get_campaign", { campaign_id: STATES.review_status.boundary_30 });
  const v = tf.review_status.variation, o = tf.review_status.orders;
  const t2 = [{ name: "get_campaign", input: {}, result: tf }];
  ok(checkReply(`${STATES.review_status.boundary_30} had ${o.value} orders [${o.id}] and weekly ROAS variation of ${v.value.toFixed(2)}% [${v.id}], so its review status is Consistent results under the pilot settings of 30 orders and 30%.`, t2).ok,
    "status figures quoted with tags pass", JSON.stringify(checkReply(`${STATES.review_status.boundary_30} had ${o.value} orders [${o.id}] and weekly ROAS variation of ${v.value.toFixed(2)}% [${v.id}], so its review status is Consistent results under the pilot settings of 30 orders and 30%.`, t2).problems));
}

// 8. key scan: no saved file or recording holds an API key
{
  const hits = [];
  const walk = (dir) => { for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".gate"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(json|jsonl|js|mjs|html|md|csv|txt|log)$/.test(f.name) && !/^test_/.test(f.name) && /sk-ant-[A-Za-z0-9_\-]{20,}/.test(fs.readFileSync(p, "utf8"))) hits.push(p);
  } };
  walk(ROOT);
  ok(hits.length === 0, "no API key in any saved file or recording", hits.join(", "));
}

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
