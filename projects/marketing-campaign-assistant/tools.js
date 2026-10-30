/* Comel Diaper Marketing Campaign Assistant: metrics, the four tools, every rule, the owner functions.
 *
 * Written once. Loaded by server.mjs, mcp_server.mjs, the benchmark and the browser workspace.
 * Rules live here, not in the prompt (resources/ hold the same rules in words, with their IDs).
 *
 *   createDesk({ data, store, config, readNext, log })
 *     data:     { campaigns: [...], weekly: [...], notes: [...] }   review period only; notes are owner-reported data issues
 *     readNext: () -> next-period rows; supplied by hooks/guards.js, which refuses before the period closes
 *     store:    { load() -> plan, save(plan) }            plan.json, shared with the owner's workspace
 *     config:   { today, review_period, next_period, action_window, baseline_window, owner_targets, test_caps }
 *   desk.tools          tool definitions for the model
 *   desk.call(name, input)  -> { ok: true, ... } or { ok: false, error: { category, message, retryable, ... } }
 *   desk.owner.list() / approve(id) / reject(id) / recordAction(id, { action, date, new_setting })
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ComelDesk = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- rule values (resources/*.md)
  const RULES = {
    pilot: { weeks: 4, minOrders: 30, maxVariationPct: 30 },                                    // RP-9 (unvalidated pilot settings)
    capPct: 20,                                                                                 // PR-4
    proposalMinWeeks: 3,                                                                        // PR-3
    targets: { T1: ["pause", "end"], T2: ["budget_shift_up", "test_boost", "test_new"], T3: ["budget_shift_down"], T4: ["extend"] }, // PR-6
    mainMeasure: { Sales: "roas" },                                                             // PR-6
    suits: {                                                                                    // MD-12: every campaign is a Sales campaign
      Sales: ["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "orders", "revenue", "roas", "cost_per_order", "conversion_rate"],
    },
  };
  const STATUS = { data: "Data issue", na: "Variation not assessable", limited: "Limited results", variable: "Variable results",
    consistent: "Consistent results" };                                                         // RP-9
  const TARGET = { both: "Meets both targets", one: "Meets one target", neither: "Meets neither target" }; // RP-11
  const TEST_TYPES = ["test_boost", "test_new"];
  const COST_MEASURES = ["cpm", "cpc", "cost_per_lead", "cost_per_order"];
  const SETTINGS = ["budget", "weekly_budget", "over_budget"];
  const LABEL = {
    spend: "spend", revenue: "attributed revenue", impressions: "impressions", clicks: "clicks", engagements: "engagements",
    leads: "leads", orders: "orders", ctr: "CTR", cpc: "CPC", cpm: "CPM", engagement_rate: "engagement rate",
    cost_per_lead: "cost per lead", cost_per_order: "cost per order", conversion_rate: "conversion rate", roas: "ROAS",
    reach: "weekly reach", frequency: "weekly frequency", over_budget: "amount over budget", budget: "budget",
    weekly_budget: "weekly budget", baseline_spend: "this period's spend", planned_budget: "planned next-period budget",
    roas_variation: "weekly ROAS variation",
  };
  const UNIT = {
    spend: "RM", revenue: "RM", cpc: "RM", cpm: "RM", cost_per_lead: "RM", cost_per_order: "RM", over_budget: "RM",
    budget: "RM", weekly_budget: "RM", baseline_spend: "RM", planned_budget: "RM",
    ctr: "%", engagement_rate: "%", conversion_rate: "%", roas: "x", roas_variation: "%",
  };

  // ---------------------------------------------------------------- small helpers
  const r2 = (x) => Math.floor(x * 100 + 0.5 + 1e-9) / 100; // half-up to 2 decimals (MD-13), the same rule as the Answer Key
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = (iso) => new Date(iso + "T00:00:00Z").getUTCDay(); // 0 Sunday, 1 Monday
  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T00:00:00Z"));
  const fail = (category, message, extra) => ({ ok: false, error: Object.assign({ category, message, retryable: false }, extra || {}) });
  const rm = (v) => "RM " + r2(v).toFixed(2);

  // FNV-1a 64-bit, as hex: stable figure IDs, the same in Node and the browser (MD-1).
  function figureId(metric, scope, start, end) {
    let h = 0xcbf29ce484222325n;
    const s = `${metric}|${scope}|${start}|${end}`;
    for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
    return "F-" + h.toString(16).padStart(16, "0").slice(0, 6);
  }

  function sums(rows) {
    const t = { spend: 0, revenue: 0, impressions: 0, clicks: 0, engagements: 0, leads: 0, orders: 0 };
    for (const r of rows) {
      t.spend += r.spend_rm; t.revenue += r.revenue_rm; t.impressions += r.impressions; t.clicks += r.clicks;
      t.engagements += r.engagements; t.leads += r.leads; t.orders += r.orders;
    }
    t.spend = r2(t.spend); t.revenue = r2(t.revenue);
    return t;
  }
  // MD-3 to MD-8. A ratio with a zero denominator is undefined (null), never a division by zero.
  function ratios(t) {
    const div = (a, b, k) => (b > 0 ? r2((a / b) * k) : null);
    return {
      ctr: div(t.clicks, t.impressions, 100), cpc: div(t.spend, t.clicks, 1), cpm: div(t.spend, t.impressions, 1000),
      engagement_rate: div(t.engagements, t.impressions, 100), cost_per_lead: div(t.spend, t.leads, 1),
      cost_per_order: div(t.spend, t.orders, 1), conversion_rate: div(t.orders, t.clicks, 100), roas: div(t.revenue, t.spend, 1),
    };
  }
  // MD-14: population standard deviation of the weekly ROAS values / their mean x 100. Undefined if a week has
  // no ROAS or the mean is zero. The same arithmetic, in the same order, as the Answer Key.
  function variation(values) {
    if (!values.length || values.some((v) => v === null)) return null;
    const mean = values.reduce((a, v) => a + v, 0) / values.length;
    if (mean === 0) return null;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length);
    return r2((sd / mean) * 100);
  }
  // The metrics every scope shows (MD-12): all campaigns are Sales campaigns.
  function metricsFor() { return RULES.suits.Sales; }

  function createDesk(opts) {
    const { data, store, config, readNext } = opts;
    const log = opts.log || (() => {});
    const C = {}; for (const c of data.campaigns) C[c.campaign_id] = c;
    const byCampaign = {}; for (const r of data.weekly) (byCampaign[r.campaign_id] = byCampaign[r.campaign_id] || []).push(r);
    const notes = data.notes || [];                    // RP-10: supplied by the owner, never detected here
    const returned = new Map(); // figure ID -> record, figures returned in this conversation (PR-3)
    const RP = config.review_period, NP = config.next_period, BW = config.baseline_window, AW = config.action_window;
    const CAPS = config.test_caps || { per_test_rm: 500, combined_rm: 1000 };
    const TARGETS = config.owner_targets || { min_roas: null, max_cost_per_order: null };
    const isNum = (v) => typeof v === "number" && isFinite(v) && v > 0;
    const targetsSet = isNum(TARGETS.min_roas) && isNum(TARGETS.max_cost_per_order);

    function rec(metric, value, scope, scopeLabel, start, end, extra) {
      const f = Object.assign({ id: figureId(metric, scope, start, end), metric, label: LABEL[metric] || metric, value,
        unit: UNIT[metric] || "", scope: scopeLabel, period: { start, end } }, extra || {});
      if (value === null) f.note = metric === "roas_variation" ? "undefined: a week has no ROAS, or average weekly ROAS is zero" : "undefined: no results to divide by";
      returned.set(f.id, f);
      return f;
    }
    const weeksIn = (cid, s, e) => (byCampaign[cid] || []).filter((r) => r.week_start >= s && r.week_start <= e);
    function scheduledWeeks(c, s, e) {
      const out = []; const end = c.end_date < e ? c.end_date : e;
      for (let w = c.start_date > s ? c.start_date : s; w <= end; w = addDays(w, 7)) if (w >= c.start_date && w <= RP.end) out.push(w);
      return out;
    }
    function weeklyBudget(c) { // planned weekly budget: campaign budget over its scheduled weeks
      let n = 0; for (let w = c.start_date; w <= c.end_date; w = addDays(w, 7)) n++;
      return r2(c.budget_rm / n);
    }
    function statuses(c, s, e) {
      const rows = weeksIn(c.campaign_id, s, e);
      const have = new Set(rows.map((r) => r.week_start));
      const missing = scheduledWeeks(c, s, e).filter((w) => !have.has(w));
      const st = {};
      if (c.status === "Running") st.partial = true;                                           // RP-5
      if (missing.length) st.incomplete = { missing_weeks: missing };                          // RP-6
      const zero = rows.filter((r) => r.spend_rm > 0 && r.orders === 0 && c.objective === "Sales").map((r) => r.week_start);
      if (zero.length) st.zero_result_weeks = zero;                                            // RP-8
      const ns = notesFor([c.campaign_id], s, addDays(e, 0));
      if (ns.length) st.data_notes = ns;                                                       // RP-10
      return { rows, st, missing };
    }
    function notesFor(ids, s, e) { // supplied notes whose weeks fall inside s..e
      return notes.filter((n) => ids.includes(n.campaign_id) && n.weeks.some((w) => w >= s && w <= e))
        .map((n) => ({ campaign_id: n.campaign_id, kind: n.kind, weeks: n.weeks, source: n.source, note: n.note,
          supplied: "Supplied information, reported by the owner; not detected by the assistant." }));
    }

    // ---------------------------------------------------------------- RP-9 review status
    const PILOT = "Pilot settings (4 weeks, 30 orders, 30% variation), not validated thresholds. Consistent does not mean profitable.";
    function grade(base, orders, varRec, extraNa) { // steps 2 to 5, once the window is known and has no data issue
      if (extraNa) return Object.assign(base, { status: STATUS.na, reason: extraNa });
      if (!varRec || varRec.value === null) return Object.assign(base, { status: STATUS.na, reason: "Average weekly ROAS is zero, so variation cannot be measured" });
      if (orders.value < RULES.pilot.minOrders) return Object.assign(base, { status: STATUS.limited, reason: `${orders.value} orders in 4 weeks, below ${RULES.pilot.minOrders}` });
      if (varRec.value > RULES.pilot.maxVariationPct) return Object.assign(base, { status: STATUS.variable, reason: `${orders.value} orders; weekly ROAS variation ${varRec.value.toFixed(2)}% is above ${RULES.pilot.maxVariationPct}%` });
      return Object.assign(base, { status: STATUS.consistent, reason: `${orders.value} orders in 4 weeks; weekly ROAS variation ${varRec.value.toFixed(2)}%` });
    }
    function targetCheck(rows, scope, label, ws, we) { // RP-11, only when the owner has entered both targets
      const rt = ratios(sums(rows));
      const roas = rec("roas", rt.roas, scope, label, ws, we), cpo = rec("cost_per_order", rt.cost_per_order, scope, label, ws, we);
      const okR = roas.value !== null && roas.value >= TARGETS.min_roas, okC = cpo.value !== null && cpo.value <= TARGETS.max_cost_per_order;
      return { result: okR && okC ? TARGET.both : okR || okC ? TARGET.one : TARGET.neither, rule: "RP-11",
        roas: { figure: roas, min: TARGETS.min_roas, met: okR }, cost_per_order: { figure: cpo, max: TARGETS.max_cost_per_order, met: okC },
        note: "The owner's own targets, judged beside the review status; not proof of profit." };
    }
    function campaignStatus(c, s, e) {
      const scope = `campaign:${c.campaign_id}`;
      const active = weeksIn(c.campaign_id, s, e).filter((r) => r.spend_rm > 0);
      const win = active.slice(-RULES.pilot.weeks);
      const base = { rule: "RP-9", basis: "campaign: its final 4 active weeks in the period", pilot: PILOT, weeks_available: win.length };
      if (!win.length) return Object.assign(base, { status: STATUS.na, reason: "No week with spend in the period" });
      const ws = win[0].week_start, we = addDays(win[win.length - 1].week_start, 6);
      base.window = { start: ws, end: we, weeks: win.map((r) => r.week_start) };
      const have = new Set(weeksIn(c.campaign_id, ws, we).map((r) => r.week_start));
      const missing = scheduledWeeks(c, ws, we).filter((w) => !have.has(w));
      const ns = notesFor([c.campaign_id], ws, we);
      if (missing.length || ns.length) return Object.assign(base, { status: STATUS.data, data_issue: { missing_weeks: missing, notes: ns },
        reason: missing.length ? `Week of ${missing.join(", ")} missing` : `${ns[0].source}: ${ns[0].note}` });
      base.weekly_roas = win.map((r) => rec("roas", ratios(sums([r])).roas, scope, c.campaign_id, r.week_start, addDays(r.week_start, 6)));
      if (targetsSet) base.target_check = targetCheck(win, scope, c.campaign_id, ws, we);
      if (win.length < RULES.pilot.weeks) return Object.assign(base, { status: STATUS.na, reason: `${win.length} week(s) with spend in the period; 4 are needed` });
      base.orders = rec("orders", sums(win).orders, scope, c.campaign_id, ws, we);
      base.variation = rec("roas_variation", variation(base.weekly_roas.map((f) => f.value)), scope, c.campaign_id, ws, we);
      return grade(base, base.orders, base.variation, null);
    }
    function platformStatus(p, s, e) {
      const weeks = []; for (let w = s; w <= e; w = addDays(w, 7)) weeks.push(w);
      const base = { rule: "RP-9", basis: "platform: the last 4 calendar weeks of the period, the same weeks for every platform", pilot: PILOT };
      if (weeks.length < RULES.pilot.weeks) return Object.assign(base, { status: STATUS.na, weeks_available: weeks.length, reason: `${weeks.length} week(s) in the period; 4 are needed` });
      const win = weeks.slice(-RULES.pilot.weeks), ws = win[0], we = addDays(win[3], 6);
      const scope = `platform:${p};objective:Sales`, label = `Sales campaigns on ${p}`;
      const cs = data.campaigns.filter((c) => c.platform === p && c.objective === "Sales");
      base.window = { start: ws, end: we, weeks: win }; base.weeks_available = 4;
      const missing = cs.flatMap((c) => { const have = new Set(weeksIn(c.campaign_id, ws, we).map((r) => r.week_start));
        return scheduledWeeks(c, ws, we).filter((w) => !have.has(w)).map((w) => `${c.campaign_id} ${w}`); });
      const ns = notesFor(cs.map((c) => c.campaign_id), ws, we);
      if (missing.length || ns.length) return Object.assign(base, { status: STATUS.data, data_issue: { missing_weeks: missing, notes: ns },
        reason: missing.length ? `Week missing: ${missing.join(", ")}` : `${ns[0].source}: ${ns[0].note}` });
      const rowsOf = (w) => cs.flatMap((c) => weeksIn(c.campaign_id, w, w));
      base.weekly_roas = win.map((w) => rec("roas", ratios(sums(rowsOf(w))).roas, scope, label, w, addDays(w, 6)));
      base.weekly_spend = win.map((w) => rec("spend", sums(rowsOf(w)).spend, scope, label, w, addDays(w, 6)));
      base.orders = rec("orders", sums(win.flatMap(rowsOf)).orders, scope, label, ws, we);
      if (targetsSet) base.target_check = targetCheck(win.flatMap(rowsOf), scope, label, ws, we);
      const idle = base.weekly_spend.filter((f) => !(f.value > 0)).length;
      base.variation = rec("roas_variation", variation(base.weekly_roas.map((f) => f.value)), scope, label, ws, we);
      return grade(base, base.orders, base.variation, idle ? `${idle} week(s) without spend in the 4-week window` : null);
    }

    function median(vals) {
      const a = vals.filter((v) => v !== null).sort((x, y) => x - y), n = a.length;
      return !n ? null : n % 2 ? a[(n - 1) / 2] : r2((a[n / 2 - 1] + a[n / 2]) / 2);
    }
    function proposedTargets() { // BP-8: comparison benchmarks the owner may accept or replace; never targets on their own
      const done = data.campaigns.filter((c) => c.status === "Completed").map((c) => ratios(sums(weeksIn(c.campaign_id, RP.start, RP.end))));
      return { min_roas: median(done.map((r) => r.roas)), max_cost_per_order: median(done.map((r) => r.cost_per_order)),
        basis: `Median of the ${done.length} Completed Sales campaigns, ${RP.start} to ${RP.end}` };
    }
    const ownerTargets = () => ({ set: targetsSet, min_roas: targetsSet ? TARGETS.min_roas : null, max_cost_per_order: targetsSet ? TARGETS.max_cost_per_order : null,
      proposed: proposedTargets(), rule: "BP-8",
      note: targetsSet ? "Set by the owner. A routine increase needs Consistent results and both targets met (PR-11)." : "Not set. Routine increases are not allowed; every increase is a capped test (PR-11)." });

    const limits = () => ({ test_cap_per_test_rm: CAPS.per_test_rm, test_cap_all_tests_rm: CAPS.combined_rm, campaign_change_pct: RULES.capPct,
      total_limit: `next-period plan within this period's spend (${BW.start} to ${BW.end})`, rule: "PR-4, PR-5, PR-12" });

    function periodCheck(s, e) {
      if (!isDate(s) || !isDate(e)) return fail("invalid_input", "period_start and period_end must be dates YYYY-MM-DD.");
      if (s > e) return fail("invalid_input", "period_start is after period_end.");
      if (e > RP.end || s < RP.start)
        return fail("period_not_available", `Results are available from ${RP.start} to ${RP.end}. The next period (${NP.start} to ${NP.end}) is read only by check_plan, after it closes.`);
      if (dow(s) !== 1 || dow(e) !== 0) return fail("invalid_input", "Periods run Monday to Sunday: period_start a Monday, period_end a Sunday.");
      return null;
    }
    function figuresFor(t, metrics, scope, label, s, e) {
      const rt = ratios(t); const out = {};
      for (const m of metrics) out[m] = rec(m, m in t ? t[m] : rt[m], scope, label, s, e);
      return out;
    }
    const byMeasure = (mm, get) => (a, b) => COST_MEASURES.includes(mm) ? get(a) - get(b) : get(b) - get(a);

    // ---------------------------------------------------------------- tool 1: get_performance
    function get_performance(input) {
      const s = input.period_start || RP.start, e = input.period_end || RP.end;
      const bad = periodCheck(s, e); if (bad) return bad;
      const platform = input.platform || null, objective = "Sales";
      if (input.objective && input.objective !== "Sales") return fail("invalid_input", "Every campaign is a Sales campaign; objective can only be Sales.");
      const groupBy = input.group_by || "none";
      const list = data.campaigns.filter((c) => (!platform || c.platform === platform) && (!objective || c.objective === objective)
        && weeksIn(c.campaign_id, s, e).length > 0);
      if (platform && !data.campaigns.some((c) => c.platform === platform))
        return fail("invalid_input", "platform must be Facebook, Instagram, TikTok, YouTube or XiaoHongShu.");
      const scopeOf = (p, o) => `platform:${p || "all"};objective:${o || "all"}`;
      const labelOf = (p, o) => `${o ? o + " campaigns" : "All campaigns"}${p ? " on " + p : " on all platforms"}`;
      const metrics = metricsFor(objective);
      const allRows = list.flatMap((c) => weeksIn(c.campaign_id, s, e));
      const res = { ok: true, period: { start: s, end: e }, scope: labelOf(platform, objective), campaigns: list.length,
        totals: figuresFor(sums(allRows), metrics, scopeOf(platform, objective), labelOf(platform, objective), s, e) };
      res.owner_targets = ownerTargets(); res.limits = limits();
      if (platform) res.review_status = platformStatus(platform, s, e);

      if (groupBy === "platform") {
        const plats = [...new Set(list.map((c) => c.platform))];
        res.groups = plats.map((p) => {
          const cs = list.filter((c) => c.platform === p);
          const done = cs.filter((c) => c.status === "Completed").length;
          const g = { platform: p, campaigns: cs.length, completed_campaigns: done, running_campaigns: cs.length - done,
            figures: figuresFor(sums(cs.flatMap((c) => weeksIn(c.campaign_id, s, e))), metrics, scopeOf(p, objective), labelOf(p, objective), s, e) };
          g.review_status = platformStatus(p, s, e);
          return g;
        });
        {
          const mm = RULES.mainMeasure[objective];
          const ok = res.groups.filter((g) => g.figures[mm].value !== null).sort(byMeasure(mm, (g) => g.figures[mm].value));
          res.ranking = { measure: LABEL[mm], order: ok.map((g) => g.platform), period: { start: s, end: e }, rule: "RP-2",
            basis: "Descriptive: observed results over the period, every campaign's weeks counted. Not proof of future performance; review status is separate." };
        }
      }
      if (groupBy === "campaign") {
        res.rows = list.map((c) => {
          const { rows, st } = statuses(c, s, e);
          const row = { campaign_id: c.campaign_id, name: c.campaign_name, platform: c.platform, objective: c.objective, status: c.status,
            performance_period: { start: rows[0].week_start, end: addDays(rows[rows.length - 1].week_start, 6) },
            figures: figuresFor(sums(rows), metricsFor(c.objective), `campaign:${c.campaign_id}`, c.campaign_id, s, e), statuses: st,
            review_status: campaignStatus(c, s, e) };
          const allT = sums(byCampaign[c.campaign_id] || []);
          if (allT.spend > c.budget_rm) row.statuses.overspend = rec("over_budget", r2(allT.spend - c.budget_rm), `campaign:${c.campaign_id}`, c.campaign_id, c.start_date, c.end_date); // RP-7
          return row;
        });
        {
          const mm = RULES.mainMeasure[objective];
          const val = (r) => r.figures[mm].value;
          const done = res.rows.filter((r) => r.status === "Completed" && val(r) !== null).sort(byMeasure(mm, val));
          const part = res.rows.filter((r) => r.status === "Running" && val(r) !== null).sort(byMeasure(mm, val));
          res.ranking = { measure: LABEL[mm], order: done.map((r) => r.campaign_id), partial_order: part.map((r) => r.campaign_id), rule: "RP-1",
            basis: "Descriptive: campaigns ran on different dates, so this is not a like-for-like verdict. Running campaigns are partial and ranked only among themselves (RP-5)." };
        }
      }
      return res;
    }

    // ---------------------------------------------------------------- tool 2: get_campaign
    function get_campaign(input) {
      const c = C[input.campaign_id];
      if (!c) return fail("campaign_not_found", `No campaign ${input.campaign_id}. IDs look like FB-03, IG-14, TT-02, YT-07, XH-05.`);
      // Default period: the campaign's whole run inside the review period.
      const s2 = input.period_start || (c.start_date > RP.start ? c.start_date : RP.start);
      const e = input.period_end || (c.end_date < RP.end ? c.end_date : RP.end);
      const bad = periodCheck(s2, e); if (bad) return bad;
      const scope = `campaign:${c.campaign_id}`;
      const { rows, st } = statuses(c, s2, e);
      const res = { ok: true, campaign: { campaign_id: c.campaign_id, name: c.campaign_name, platform: c.platform, objective: c.objective,
          format: c.format, audience: c.audience, start_date: c.start_date, end_date: c.end_date, status: c.status,
          budget: rec("budget", c.budget_rm, scope, c.campaign_id, c.start_date, c.end_date),
          weekly_budget: rec("weekly_budget", weeklyBudget(c), scope, c.campaign_id, c.start_date, c.end_date) },
        period: { start: s2, end: e }, judged_on: RULES.suits[c.objective].filter((m) => m !== "spend"),
        totals: figuresFor(sums(rows), metricsFor(c.objective), scope, c.campaign_id, s2, e), statuses: st,
        review_status: campaignStatus(c, s2, e), owner_targets: ownerTargets(), limits: limits() };
      if (st.incomplete) res.totals_note = "Totals are incomplete: a week is missing and is not filled in.";
      const allT = sums(byCampaign[c.campaign_id] || []);
      if (allT.spend > c.budget_rm) res.statuses.overspend = rec("over_budget", r2(allT.spend - c.budget_rm), scope, c.campaign_id, c.start_date, c.end_date);
      res.weeks = rows.map((r) => {
        const we = addDays(r.week_start, 6); const t = sums([r]);
        const w = { week_start: r.week_start, figures: figuresFor(t, metricsFor(c.objective), scope, c.campaign_id, r.week_start, we) };
        w.figures.reach = rec("reach", r.reach, scope, c.campaign_id, r.week_start, we);
        w.figures.frequency = rec("frequency", r.reach > 0 ? r2(r.impressions / r.reach) : null, scope, c.campaign_id, r.week_start, we);
        return w;
      });
      return res;
    }

    // ---------------------------------------------------------------- plan helpers (PR-4, PR-5, PR-12)
    const load = () => store.load() || { changes: [] };
    const live = (plan) => plan.changes.filter((x) => x.status === "pending" || x.status === "approved");
    function effectiveWeekly(c, plan) {
      let wb = weeklyBudget(c);
      for (const x of live(plan).filter((x) => x.campaign_id === c.campaign_id)) {
        if (x.type === "pause" || x.type === "end") return 0;
        if (x.type === "budget_shift" || x.type === "test_boost") wb = x.change.to_weekly_rm;
      }
      return wb;
    }
    function baselineSpend() { // PR-5: Running campaigns' spend over the baseline window
      return r2(data.campaigns.filter((c) => c.status === "Running").reduce((a, c) => a + sums(weeksIn(c.campaign_id, BW.start, BW.end)).spend, 0));
    }
    function plannedTotal(plan) {
      const running = data.campaigns.filter((c) => c.status === "Running").reduce((a, c) => a + effectiveWeekly(c, plan) * 4, 0);
      const fresh = live(plan).filter((x) => x.type === "test_new").reduce((a, x) => a + x.change.weekly_rm * 4, 0);
      return r2(running + fresh);
    }
    const testSpend = (x) => (x.type === "test_boost" ? x.change.extra_rm : x.type === "test_new" ? x.change.total_rm : 0);
    const testTotal = (plan) => r2(live(plan).reduce((a, x) => a + testSpend(x), 0));

    // PR-3: cited figures. Routine: the campaign's own, suiting its objective, 3+ complete weeks. Test: the campaign's or its platform's.
    function citedProblems(ids, ok) {
      if (!ids.length) return { err: fail("reason_not_found", "A proposal needs a reason and reason_figure_ids from figures returned earlier in this conversation (PR-3).") };
      const unknown = ids.filter((id) => !returned.has(id));
      if (unknown.length) return { err: fail("reason_not_found", `These figure IDs were not returned in this conversation: ${unknown.join(", ")}. Look the figures up first (PR-3).`, { figure_ids: unknown }) };
      const cited = ids.map((id) => returned.get(id));
      const probs = cited.map(ok).filter(Boolean);
      if (!cited.some((f) => !SETTINGS.includes(f.metric))) probs.push("cite at least one performance figure, not only budget settings");
      return { probs };
    }
    // PR-6 target. base must be a figure returned in this conversation, of the measure, over the baseline window.
    function checkTarget(t, kind, wantScope, mm) {
      const tprobs = [];
      const allowed = RULES.targets[t.rule];
      if (!allowed) tprobs.push("target.rule must be T1, T2, T3 or T4");
      else if (!allowed.includes(kind)) tprobs.push(`${t.rule} does not fit a ${kind.replace(/_/g, " ")} (T1 pause or end, T2 a test, T3 budget down, T4 extend)`);
      const base = returned.get(t.baseline_figure_id);
      if (!base) tprobs.push("target.baseline_figure_id must be a figure returned in this conversation");
      else {
        if (base.scope !== wantScope) tprobs.push(`the baseline is for ${base.scope}, not ${wantScope}`);
        if (base.metric !== mm) tprobs.push(`the baseline must be the ${LABEL[mm]}`);
        if (base.period.start !== BW.start || base.period.end !== BW.end) tprobs.push(`the baseline period must be ${BW.start} to ${BW.end}`);
        if (base.value === null) tprobs.push("the baseline is undefined (no results)");
      }
      const dl = t.deadline;
      const minDl = addDays(AW.end, 9); // first full week after the last action day ends on this Sunday
      if (!isDate(dl) || dow(dl) !== 0 || dl < minDl || dl > NP.end) tprobs.push(`target.deadline must be a Sunday from ${minDl} to ${NP.end}`);
      if (tprobs.length) return { err: fail("target_incomplete", `The target is incomplete (PR-6): ${tprobs.join("; ")}.`, { problems: tprobs }) };
      let threshold;
      if (t.rule === "T1") threshold = { measure: "weekly spend", op: "=", value: 0, unit: "RM" };
      else {
        const k = t.rule === "T3" ? 1 : COST_MEASURES.includes(mm) ? 1.1 : 0.9;
        threshold = { measure: LABEL[mm], op: COST_MEASURES.includes(mm) ? "<=" : ">=", value: r2(base.value * k), unit: UNIT[mm] };
      }
      return { base, threshold };
    }
    function testFields(input) { // PR-12
      const missing = [];
      if (!input.reason) missing.push("reason (the business reason)");
      if (!input.test_question) missing.push("test_question");
      if (!input.stop_condition) missing.push("stop_condition");
      return missing.length ? fail("test_incomplete", `A test needs ${missing.join(", ")} (PR-12), plus a T2 target for the success measure and review date.`, { missing }) : null;
    }
    function capChecks(plan, trial, spend, what) { // PR-12 caps, then PR-5
      if (spend > CAPS.per_test_rm)
        return fail("over_test_cap", `${what} would be ${rm(spend)} over the four weeks; the cap is ${rm(CAPS.per_test_rm)} per test (PR-12).`, { test_rm: spend, cap_rm: CAPS.per_test_rm });
      const used = testTotal(plan);
      if (r2(used + spend) > CAPS.combined_rm)
        return fail("over_combined_test_cap", `Tests already in the plan use ${rm(used)}; adding ${rm(spend)} would pass the ${rm(CAPS.combined_rm)} combined test cap (PR-12). ${rm(Math.max(0, CAPS.combined_rm - used))} is left.`, { used_rm: used, test_rm: spend, cap_rm: CAPS.combined_rm });
      const after = plannedTotal(trial), cap = baselineSpend();
      if (after > plannedTotal(plan) && after > cap)
        return fail("over_total_budget", `The planned next-period budget would be ${rm(after)}, above this period's spend of ${rm(cap)} (PR-5).`, { planned_rm: after, limit_rm: cap });
      return null;
    }
    function save(plan, entry, extra) {
      entry.id = "P-" + String(100 + plan.changes.length + 1).slice(1).padStart(2, "0");
      Object.assign(entry, { status: "pending", proposed_on: config.today, decided: null, action: null });
      plan.changes.push(entry); store.save(plan);
      return Object.assign({ ok: true, saved: entry, message: "Saved as pending. Only the owner can approve or reject it, on the Approve & Record tab.",
        planned_next_period: { planned_rm: plannedTotal(plan), limit_rm: baselineSpend() }, tests_in_plan: { used_rm: testTotal(plan), cap_rm: CAPS.combined_rm } }, extra || {});
    }

    // ---------------------------------------------------------------- tool 3: propose_change
    function propose_change(input) {
      const type = input.type;
      if (!["pause", "budget_shift", "extend", "end", "test_boost", "test_new"].includes(type))
        return fail("invalid_input", "type must be pause, budget_shift, extend, end, test_boost or test_new.");
      const plan = load();
      if (type === "test_new") return proposeNew(input, plan);
      const c = C[input.campaign_id];
      if (!c) return fail("campaign_not_found", `No campaign ${input.campaign_id}.`);
      if (c.status !== "Running") return fail("campaign_closed", `${c.campaign_id} is Completed (ended ${c.end_date}). Only Running campaigns can be changed (PR-1).`);
      const original = weeklyBudget(c), current = effectiveWeekly(c, plan);
      const ids = Array.isArray(input.reason_figure_ids) ? input.reason_figure_ids : [];
      const t = input.target || {};
      const mm = t.rule === "T1" ? "spend" : RULES.mainMeasure[c.objective];
      if (type === "test_boost") return proposeBoost(input, plan, c, original, current, ids, t);
      let kind = type, change = {};
      if (type === "budget_shift") {
        const to = Number(input.new_weekly_budget_rm);
        if (!(to > 0)) return fail("invalid_input", "budget_shift needs new_weekly_budget_rm, a positive number.");
        if (current === 0) return fail("invalid_input", `${c.campaign_id} already has a pause or end change in the plan.`);
        if (r2(to) === r2(current)) return fail("invalid_input", "The new weekly budget equals the current one.");
        kind = to > current ? "budget_shift_up" : "budget_shift_down";
        if (kind === "budget_shift_up") { // PR-11
          if (!targetsSet)
            return fail("owner_targets_not_set", `Routine budget increases need owner targets (a minimum ROAS and a maximum cost per order, BP-8), and they are not set (PR-11). A capped test can be proposed instead: type test_boost, up to ${rm(CAPS.per_test_rm)} of additional spending over the four weeks, inside the 20% campaign cap (PR-12).`,
              { owner_targets: ownerTargets() });
          const st = campaignStatus(c, BW.start, BW.end);
          if (st.status !== STATUS.consistent)
            return fail("not_eligible", `${c.campaign_id}'s review status over ${BW.start} to ${BW.end} is ${st.status} (${st.reason}). A routine increase needs Consistent results and both owner targets met (PR-11). A capped test can be proposed instead (PR-12).`, { review_status: st.status });
          if (st.target_check.result !== TARGET.both)
            return fail("not_eligible", `${c.campaign_id} ${st.target_check.result.toLowerCase()} over ${BW.start} to ${BW.end} (ROAS ${st.target_check.roas.figure.value} against a minimum of ${TARGETS.min_roas}; cost per order ${st.target_check.cost_per_order.figure.value === null ? "undefined" : rm(st.target_check.cost_per_order.figure.value)} against a maximum of ${rm(TARGETS.max_cost_per_order)}). A routine increase needs both targets met (PR-11).`, { target_check: st.target_check.result });
        }
        change = { from_weekly_rm: current, to_weekly_rm: r2(to) };
      } else if (type === "extend" || type === "end") {
        const d = input.new_end_date;
        if (!isDate(d) || dow(d) !== 0) return fail("invalid_input", "new_end_date must be a Sunday, YYYY-MM-DD.");
        if (type === "extend" && d <= c.end_date) return fail("invalid_input", `extend needs a date after ${c.end_date}.`);
        if (type === "end" && (d >= c.end_date || d < NP.start)) return fail("invalid_input", `end needs a Sunday from ${NP.start} and before ${c.end_date}.`);
        change = { to_end_date: d };
      }
      // PR-3 supported proposal (routine)
      if (!input.reason) return fail("reason_not_found", "A proposal needs a reason and reason_figure_ids from figures returned earlier in this conversation (PR-3).");
      const cp = citedProblems(ids, (f) => {
        if (f.scope !== c.campaign_id) return `${f.id} is for ${f.scope}, not ${c.campaign_id}`;
        if (SETTINGS.includes(f.metric)) return null;
        const n = weeksIn(c.campaign_id, f.period.start, f.period.end).length;
        const sched = scheduledWeeks(c, f.period.start, f.period.end).length;
        if (n < RULES.proposalMinWeeks) return `${f.id} covers ${n} week(s) of results; at least ${RULES.proposalMinWeeks} complete weeks are needed`;
        if (n < sched) return `${f.id} covers a period with a missing week`;
        return null;
      });
      if (cp.err) return cp.err;
      if (cp.probs.length) return fail("evidence_rule_failed", `The cited figures do not support a change (PR-3): ${cp.probs.join("; ")}.`, { problems: cp.probs });
      const tg = checkTarget(t, kind, c.campaign_id, mm); if (tg.err) return tg.err;
      // PR-4 cap, cumulative over pending and approved shifts
      if (type === "budget_shift") {
        const pct = r2(((change.to_weekly_rm - original) / original) * 100);
        if (Math.abs(pct) > RULES.capPct)
          return fail("over_limit", `That moves ${c.campaign_id}'s weekly budget ${pct > 0 ? "+" : ""}${pct}% from ${rm(original)}, counting changes already in the plan. The limit is plus or minus ${RULES.capPct}% per period (PR-4): ${rm(original * 0.8)} to ${rm(original * 1.2)} a week.`,
            { original_weekly_rm: original, current_weekly_rm: current, cumulative_pct: pct });
      }
      if (plan.changes.some((x) => x.status === "pending" && x.campaign_id === c.campaign_id && x.type === type))
        return fail("duplicate", `${c.campaign_id} already has a pending ${type} proposal.`);
      return save(plan, { campaign_id: c.campaign_id, type, change, reason: String(input.reason).slice(0, 400), reason_figure_ids: ids,
        target: { rule: t.rule, baseline_figure_id: tg.base.id, baseline: tg.base.value, deadline: t.deadline, objective: c.objective, threshold: tg.threshold } });
    }

    function proposeBoost(input, plan, c, original, current, ids, t) { // PR-12, test on an existing Running campaign
      const to = Number(input.new_weekly_budget_rm);
      if (live(plan).some((x) => x.campaign_id === c.campaign_id && ["pause", "end", "budget_shift", "test_boost"].includes(x.type)))
        return fail("duplicate", `${c.campaign_id} already has a budget, pause or end change in the plan.`);
      if (!(to > current)) return fail("invalid_input", `test_boost needs new_weekly_budget_rm above ${c.campaign_id}'s current ${rm(current)} a week.`);
      const tf = testFields(input); if (tf) return tf;
      const st = campaignStatus(c, BW.start, BW.end);
      if (st.status === STATUS.data) return fail("data_issue", `${c.campaign_id} has a data issue over ${BW.start} to ${BW.end} (${st.reason}). Investigate it before a test (PR-12).`, { review_status: st.status });
      const cp = citedProblems(ids, (f) => (f.scope === c.campaign_id || String(f.scope).endsWith(` on ${c.platform}`) ? null : `${f.id} is for ${f.scope}, not ${c.campaign_id} or ${c.platform}`));
      if (cp.err) return cp.err;
      if (cp.probs.length) return fail("evidence_rule_failed", `The cited figures do not support a test (PR-3): ${cp.probs.join("; ")}.`, { problems: cp.probs });
      const tg = checkTarget(t, "test_boost", c.campaign_id, RULES.mainMeasure[c.objective]); if (tg.err) return tg.err;
      const pct = r2(((to - original) / original) * 100);
      if (pct > RULES.capPct)
        return fail("over_limit", `That raises ${c.campaign_id}'s weekly budget +${pct}% from ${rm(original)}. A test boost stays inside the ${RULES.capPct}% campaign cap (PR-4): at most ${rm(original * 1.2)} a week.`, { original_weekly_rm: original, cumulative_pct: pct });
      const change = { from_weekly_rm: current, to_weekly_rm: r2(to), extra_rm: r2((to - current) * 4) };
      const entry = { campaign_id: c.campaign_id, type: "test_boost", change };
      const cap = capChecks(plan, { changes: plan.changes.concat([Object.assign({ status: "pending" }, entry)]) }, change.extra_rm, `The additional test spending for ${c.campaign_id}`);
      if (cap) return cap;
      return save(plan, Object.assign(entry, { reason: String(input.reason).slice(0, 400), reason_figure_ids: ids,
        test: { question: String(input.test_question).slice(0, 200), stop_condition: String(input.stop_condition).slice(0, 200), duration: `${NP.start} to ${NP.end}`,
          cap_rm: CAPS.per_test_rm, combined_cap_rm: CAPS.combined_rm },
        target: { rule: t.rule, baseline_figure_id: tg.base.id, baseline: tg.base.value, deadline: t.deadline, objective: c.objective, threshold: tg.threshold } }));
    }

    function proposeNew(input, plan) { // PR-12, a new campaign test on a platform
      const p = input.platform, o = "Sales";
      if (!["Facebook", "Instagram", "TikTok", "YouTube", "XiaoHongShu"].includes(p)) return fail("invalid_input", "test_new needs platform: Facebook, Instagram, TikTok, YouTube or XiaoHongShu.");
      const wk = Number(input.new_weekly_budget_rm);
      if (!(wk > 0)) return fail("invalid_input", "test_new needs new_weekly_budget_rm, a positive number.");
      const tf = testFields(input); if (tf) return tf;
      const st = platformStatus(p, BW.start, BW.end);
      if (st.status === STATUS.data) return fail("data_issue", `${o} campaigns on ${p} have a data issue over ${BW.start} to ${BW.end} (${st.reason}). Investigate it before a test (PR-12).`, { review_status: st.status });
      const ids = Array.isArray(input.reason_figure_ids) ? input.reason_figure_ids : [];
      const cp = citedProblems(ids, (f) => (String(f.scope).endsWith(` on ${p}`) || (C[f.scope] && C[f.scope].platform === p) ? null : `${f.id} is for ${f.scope}, not ${p}`));
      if (cp.err) return cp.err;
      if (cp.probs.length) return fail("evidence_rule_failed", `The cited figures do not support a test (PR-3): ${cp.probs.join("; ")}.`, { problems: cp.probs });
      const t = input.target || {};
      const tg = checkTarget(t, "test_new", `${o} campaigns on ${p}`, RULES.mainMeasure[o]); if (tg.err) return tg.err;
      if (plan.changes.some((x) => x.status === "pending" && x.type === "test_new" && x.change.platform === p && x.change.objective === o))
        return fail("duplicate", `There is already a pending ${o} test on ${p}.`);
      const change = { platform: p, objective: o, campaign_name: String(input.campaign_name || `${o} test`).slice(0, 60), weekly_rm: r2(wk), total_rm: r2(wk * 4) };
      const entry = { campaign_id: null, type: "test_new", change };
      const cap = capChecks(plan, { changes: plan.changes.concat([Object.assign({ status: "pending" }, entry)]) }, change.total_rm, `A new ${o} test on ${p}`);
      if (cap) return cap;
      return save(plan, Object.assign(entry, { reason: String(input.reason).slice(0, 400), reason_figure_ids: ids,
        test: { question: String(input.test_question).slice(0, 200), stop_condition: String(input.stop_condition).slice(0, 200), duration: `${NP.start} to ${NP.end}`,
          cap_rm: CAPS.per_test_rm, combined_cap_rm: CAPS.combined_rm },
        target: { rule: t.rule, baseline_figure_id: tg.base.id, baseline: tg.base.value, benchmark: `comparison benchmark: ${tg.base.scope}, ${BW.start} to ${BW.end}`,
          deadline: t.deadline, objective: o, threshold: tg.threshold } }),
        { note: "A new campaign has no rows in the sample data, so its follow-up will read test results unavailable." });
    }

    // ---------------------------------------------------------------- tool 4: check_plan
    function check_plan() {
      if (config.today <= NP.end)
        return fail("period_not_closed", `The next period runs ${NP.start} to ${NP.end}. Its results can be checked from ${addDays(NP.end, 1)} (PR-10).`);
      const plan = load();
      const approved = plan.changes.filter((x) => x.status === "approved");
      if (!approved.length) return fail("no_approved_plan", "There is no approved change to check.");
      const next = readNext(); // guarded by hooks/guards.js
      const out = approved.map((x) => {
        const res = { id: x.id, campaign_id: x.campaign_id, type: x.type, change: x.change, target_rule: x.target.rule };
        if (x.type === "test_new") { // PR-9: no rows exist for a campaign that did not exist when the data was written
          res.done = x.action ? "reported done" : "not reported";
          if (x.action) res.action = x.action;
          res.target_met = "test results unavailable";
          res.why = `No campaign rows in the sample data for the new ${x.change.objective} test on ${x.change.platform}. The next-period data was written in advance, and no results are generated in response to an approval.`;
          return res;
        }
        const c = C[x.campaign_id]; const scope = `campaign:${c.campaign_id}`;
        const rows = next.filter((r) => r.campaign_id === c.campaign_id);
        if (x.type === "test_boost") res.note = "The next-period sample rows were written in advance; they do not respond to this change.";
        // PR-8 Status (field done)
        let window = [];
        if (!x.action) { res.done = "not reported"; }
        else {
          const first = (() => { let d = addDays(x.action.date, 1); while (dow(d) !== 1) d = addDays(d, 1); return d; })(); // PR-7
          window = rows.filter((r) => r.week_start >= first && addDays(r.week_start, 6) <= x.target.deadline);
          const stopped = x.type === "pause" || x.type === "end";
          res.done = stopped && window.some((r) => r.spend_rm > 0) ? "conflict" : "reported done";
          res.action = x.action;
          res.counted_weeks = window.map((r) => r.week_start);
        }
        // PR-9 Target met?
        if (!x.action || !window.length) { res.target_met = "not yet assessable"; res.why = !x.action ? "no action record, so no counted weeks" : "no full week after the action"; return res; }
        const s = window[0].week_start, e = addDays(window[window.length - 1].week_start, 6);
        if (x.target.rule === "T1") {
          const weekly = window.map((r) => rec("spend", r2(r.spend_rm), scope, c.campaign_id, r.week_start, addDays(r.week_start, 6)));
          res.observed = weekly;
          res.threshold = { measure: "weekly spend", op: "=", value: 0, unit: "RM" };
          res.target_met = weekly.every((f) => f.value === 0) ? "met" : "missed";
          return res;
        }
        const mm = RULES.mainMeasure[c.objective];
        let base = x.target.baseline;
        if (base === undefined || base === null) base = ratios(sums(weeksIn(c.campaign_id, BW.start, BW.end)))[mm];
        const k = x.target.rule === "T3" ? 1 : COST_MEASURES.includes(mm) ? 1.1 : 0.9;
        const thr = r2(base * k);
        const obs = ratios(sums(window))[mm];
        res.baseline = rec(mm, base, scope, c.campaign_id, BW.start, BW.end);
        res.observed = rec(mm, obs, scope, c.campaign_id, s, e);
        res.threshold = { measure: LABEL[mm], op: COST_MEASURES.includes(mm) ? "<=" : ">=", value: thr, unit: UNIT[mm] };
        if (obs === null) { res.target_met = "not yet assessable"; res.why = `${LABEL[mm]} is undefined: no results in the counted weeks`; }
        else res.target_met = (COST_MEASURES.includes(mm) ? obs <= thr : obs >= thr) ? "met" : "missed";
        return res;
      });
      const counts = { changes: out.length }; // counted in code, so a summary line never miscounts
      for (const x of out) counts[x.target_met] = (counts[x.target_met] || 0) + 1;
      for (const x of out) counts["done: " + x.done] = (counts["done: " + x.done] || 0) + 1;
      return { ok: true, period: { start: NP.start, end: NP.end }, counts, checked: out,
        not_scored: plan.changes.filter((x) => x.status !== "approved").map((x) => ({ id: x.id, campaign_id: x.campaign_id, type: x.type, status: x.status })),
        note: "Status (done) is the owner's reported action (never verified). Target met? is separate: a follow-up measure, never proof of profit or that the change caused the result." };
    }

    // ---------------------------------------------------------------- owner functions (workspace only; not agent tools)
    const owner = {
      list: () => load(),
      approve: (id) => decide(id, "approved"),
      reject: (id) => decide(id, "rejected"),
      recordAction(id, a) {
        const plan = load(); const x = plan.changes.find((y) => y.id === id);
        if (!x) return fail("not_found", `No change ${id}.`);
        if (x.status !== "approved") return fail("not_approved", "Record an action only for an approved change.");
        if (!a || !a.action || !isDate(a.date) || a.date < AW.start || a.date > AW.end || a.date > config.today)
          return fail("invalid_input", `The action date must be from ${AW.start} to ${AW.end}, and not after today.`);
        x.action = { action: String(a.action).slice(0, 120), date: a.date, new_setting: String(a.new_setting || "").slice(0, 120) };
        store.save(plan); return { ok: true, change: x };
      },
    };
    function decide(id, status) {
      const plan = load(); const x = plan.changes.find((y) => y.id === id);
      if (!x) return fail("not_found", `No change ${id}.`);
      if (x.status !== "pending") return fail("not_pending", `${id} is already ${x.status}.`);
      x.status = status; x.decided = { by: "Owner", at: config.today };
      store.save(plan); return { ok: true, change: x };
    }

    // ---------------------------------------------------------------- tool definitions
    const P = { type: "string", description: "Monday, YYYY-MM-DD" }, E = { type: "string", description: "Sunday, YYYY-MM-DD" };
    const tools = [
      { name: "get_performance", description:
          "Review figures for a period (Monday to Sunday, inside the review period 2025-09-29 to 2026-09-27). Every campaign is a Sales campaign. Filter by platform; group_by 'platform' compares platforms (every campaign's weeks in the period, a descriptive ROAS ranking, a review status over the last 4 calendar weeks), group_by 'campaign' lists each campaign with its statuses (partial, incomplete, zero results, overspend, supplied data notes) and its review status over its final 4 active weeks. Results carry owner_targets (set or not, the proposed figures) and, when set, a target check. Every figure comes back as a record with an id; quote it with its tag.",
        input_schema: { type: "object", properties: { period_start: P, period_end: E,
          platform: { type: "string", enum: ["Facebook", "Instagram", "TikTok", "YouTube", "XiaoHongShu"] },
          group_by: { type: "string", enum: ["none", "platform", "campaign"] } } } },
      { name: "get_campaign", description:
          "One campaign: settings (budget, weekly budget), totals for the period (default: its whole run in the review period), weekly figures with weekly reach and frequency, statuses, supplied data notes, the review status, owner_targets and, when set, the target check. Use period 2026-08-31 to 2026-09-27 for a proposal's baseline.",
        input_schema: { type: "object", properties: { campaign_id: { type: "string" }, period_start: P, period_end: E }, required: ["campaign_id"] } },
      { name: "propose_change", description:
          "Save one proposed change as pending, for the owner to approve. Routine types for a Running campaign: pause, end, extend, budget_shift (a decrease; an increase only when owner targets are set, the review status over 2026-08-31 to 2026-09-27 is Consistent results and both targets are met, target T2). Tests (T2 target): test_boost (more weekly budget on a Running campaign: the extra spend over 4 weeks at most RM 500, inside the 20% cap) and test_new (a new campaign on a platform: weekly budget x 4 at most RM 500). All tests together at most RM 1,000. A test needs reason, test_question and stop_condition. Every proposal needs reason_figure_ids from figures returned in this conversation and a target: rule (T1 pause or end, T2 test, T3 budget down, T4 extend), baseline_figure_id (over 2026-08-31 to 2026-09-27: spend for T1; otherwise the campaign's ROAS, or for test_new the platform's ROAS) and deadline (a Sunday from 2026-10-11 to 2026-10-25).",
        input_schema: { type: "object", properties: {
          campaign_id: { type: "string", description: "Running campaign (not for test_new)" },
          type: { type: "string", enum: ["pause", "budget_shift", "extend", "end", "test_boost", "test_new"] },
          new_weekly_budget_rm: { type: "number" }, new_end_date: { type: "string", description: "Sunday, YYYY-MM-DD (extend or end)" },
          platform: { type: "string", enum: ["Facebook", "Instagram", "TikTok", "YouTube", "XiaoHongShu"], description: "test_new only" },
          campaign_name: { type: "string", description: "test_new only" },
          test_question: { type: "string" }, stop_condition: { type: "string" },
          reason: { type: "string" }, reason_figure_ids: { type: "array", items: { type: "string" } },
          target: { type: "object", properties: { rule: { type: "string", enum: ["T1", "T2", "T3", "T4"] },
            baseline_figure_id: { type: "string" }, deadline: { type: "string" } }, required: ["rule", "baseline_figure_id", "deadline"] } },
          required: ["type", "reason", "reason_figure_ids", "target"] } },
      { name: "check_plan", description:
          "After the next period closes (from 2026-10-26), check each approved change: Status (field done: reported done, not reported, conflict) and Target met? (met, missed, not yet assessable, or test results unavailable for a new campaign test), reported separately.",
        input_schema: { type: "object", properties: {} } },
    ];

    function call(name, input) {
      const fn = { get_performance, get_campaign, propose_change, check_plan }[name];
      let result;
      try { result = fn ? fn(input || {}) : fail("unknown_tool", `No tool ${name}.`); }
      catch (e) { result = fail("tool_error", String(e && e.message || e), { retryable: true }); }
      log({ tool: name, input: input || {}, ok: result.ok, error: result.ok ? null : result.error.category });
      return result;
    }
    return { tools, call, owner, returned, _internals: { baselineSpend, plannedTotal: () => plannedTotal(load()), testTotal: () => testTotal(load()),
      weeklyBudget: (id) => weeklyBudget(C[id]), campaignStatus: (id, s, e) => campaignStatus(C[id], s, e), platformStatus, caps: CAPS, ownerTargets, proposedTargets } };
  }

  return { createDesk, figureId, RULES, STATUS, TARGET, LABEL, UNIT, ratios, sums, variation };
});
