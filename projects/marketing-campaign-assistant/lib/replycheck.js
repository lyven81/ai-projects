/* Reply check, used by the agent loop (to send a reply back with the exact fix) and by the benchmark scorer.
 *
 * checkReply(text, trace, opts) -> { ok, problems: [...], tags: [...] }
 *   trace: the conversation's tool calls [{ name, input, result }]
 *   opts.allowedPeriods: optional list of [start, end]; a tagged figure outside them is a problem (scorer only)
 *
 * 1. Every tag [F-xxxxxx] names a figure record returned in this conversation, and its sentence carries the
 *    record's value, metric and scope (MD-1). The number alone is not enough.
 * 2. A number that equals a figure record's value must carry its tag. Any other money, percentage or ratio must
 *    come from a tool result or a written rule; otherwise it has no source.
 * 3. Banned phrases: causal wording, ROAS called profit, owner records called verified, a reported data issue
 *    claimed as detected. A floor, not the whole
 *    check: the benchmark also reads every reply.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ComelReplyCheck = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ALIAS = {
    spend: ["spend", "spent", "spending"], revenue: ["revenue", "sales value", "attributed"], impressions: ["impression"],
    clicks: ["click"], engagements: ["engagement"], leads: ["lead"], orders: ["order"], ctr: ["ctr", "click-through", "click through"],
    cpc: ["cpc", "cost per click"], cpm: ["cpm", "per thousand", "per 1,000", "per 1000"], engagement_rate: ["engagement rate"],
    cost_per_lead: ["cost per lead", "cpl", "per lead"], cost_per_order: ["cost per order", "cpo", "per order"],
    conversion_rate: ["conversion"], roas: ["roas", "return on ad spend"], reach: ["reach"], frequency: ["frequency"],
    over_budget: ["over", "above", "overspen", "exceed"], budget: ["budget"], weekly_budget: ["budget", "a week", "weekly", "per week"],
    baseline_spend: ["spend"], planned_budget: ["budget", "plan"],
    roas_variation: ["variation", "vary", "varied", "swing", "steady", "stable", "consistent"],
  };
  const RULE_CONSTANTS = [20, 10, 0, 0.9, 1.1, 4, 3, 7, 30, 500, 1000]; // PR-4, PR-6, RP-9 pilot settings, PR-12 caps
  const NUM_TOKEN = /(RM\s?-?[\d,]+(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?\s?%|-?\d+(?:\.\d+)?\s?[x×](?![a-z]))/gi;
  const TAG = /\[(F-[0-9a-f]{6})\]/g;
  const CAUSAL = /\b(caused|causing|led to|leads to|resulted in|results in|drove|driven by|thanks to (the|this|that|your) (change|cut|increase|pause|trim|shift)|because (of )?(the|this|that|your) (change|cut|increase|pause|trim|shift))\b/i;
  const NEG = /\b(not|never|isn't|is not|doesn't|does not|before|no)\b|n't/i;

  const num = (s) => Number(String(s).replace(/RM|%|x|×|,|\s/gi, ""));
  const near = (a, b) => a !== null && b !== null && Math.abs(a - b) < 0.006;

  function sentences(text) {
    const out = []; let start = 0;
    const re = /(?<=[.!?])\s+(?=[A-Z(*\-|"'])|\n+/g; let m;
    while ((m = re.exec(text))) { out.push([start, m.index]); start = m.index + m[0].length; }
    out.push([start, text.length]);
    return out.map(([s, e]) => ({ s, e, t: text.slice(s, e) }));
  }

  function collect(trace) {
    const records = new Map(); const values = [];
    const walk = (v, inRecord) => {
      if (Array.isArray(v)) return v.forEach((x) => walk(x, inRecord));
      if (v && typeof v === "object") {
        const isRec = typeof v.id === "string" && /^F-[0-9a-f]{6}$/.test(v.id) && "value" in v;
        if (isRec) records.set(v.id, v);
        for (const [k, x] of Object.entries(v)) if (!(isRec && k === "value")) walk(x, inRecord || isRec);
        return;
      }
      if (typeof v === "number") values.push(v);
      if (typeof v === "string") (v.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).forEach((s) => values.push(num(s)));
    };
    for (const step of trace || []) if (step && step.result) walk(step.result, false);
    return { records, values };
  }

  function checkReply(text, trace, opts) {
    opts = opts || {};
    const problems = []; const tags = [];
    const { records, values } = collect(trace);
    for (const t of opts.ownerText || []) (String(t).match(/-?\d[\d,]*(?:\.\d+)?/g) || []).forEach((x) => values.push(num(x))); // the owner's own figures are sourced
    const recValues = [...records.values()].map((r) => r.value).filter((v) => v !== null);
    const sents = sentences(text);
    const sentOf = (i) => sents.find((x) => i >= x.s && i <= x.e) || { s: 0, e: text.length, t: text };

    // 1. tags (one ID per bracket, straight after its figure)
    for (const g of text.matchAll(/\[(F-[0-9a-f]{6}(?:\s*[,;]\s*F-[0-9a-f]{6})+)\]/g))
      problems.push(`[${g[1]}] puts several figure IDs in one bracket; give each figure its own tag straight after it`);
    for (const g of text.matchAll(/\[([^\]]*\bF-[0-9a-f]{6}\b[^\]]*)\]/g))
      if (!/^F-[0-9a-f]{6}$/.test(g[1]) && !/^F-[0-9a-f]{6}(\s*[,;]\s*F-[0-9a-f]{6})+$/.test(g[1]))
        problems.push(`[${g[1]}] has words inside the bracket; write the tag alone, [F-xxxxxx], straight after its figure`);
    let m; TAG.lastIndex = 0;
    while ((m = TAG.exec(text))) {
      const id = m[1]; const r = records.get(id); const st = sentOf(m.index);
      tags.push(id);
      if (!r) { problems.push(`[${id}] was not returned by any tool in this conversation`); continue; }
      const before = text.slice(st.s, m.index);
      // the number nearest the tag, money and plain counts alike ("RM 933.73 [..] and 45 orders [..]": 45 for the second tag)
      const plain = before.replace(/\[[^\]]*\]/g, (t) => " ".repeat(t.length)); // earlier tags are not figures
      const near_ = [...plain.matchAll(/RM\s?-?[\d,]+(?:\.\d+)?|-?\d[\d,]*(?:\.\d+)?/g)];
      const last = near_.length ? num(near_[near_.length - 1][0]) : null;
      if (r.value === 0 && /\b(zero|no)\b[^\d\[]{0,30}$/i.test(before)) { /* "zero orders [tag]" quotes 0 in words */ }
      else if (r.value === null) {
        if (last !== null && !/undefined|no (orders|leads|results)|zero/i.test(before)) problems.push(`[${id}] is undefined (no results) but a number is quoted`);
      } else if (!near(last, r.value)) problems.push(`[${id}] is ${r.label} ${r.value}${r.unit === "RM" ? " RM" : r.unit} but the sentence quotes ${last === null ? "no number" : last}`);
      const ctx = text.slice(Math.max(0, st.s - 300), st.e).toLowerCase();
      if (!(ALIAS[r.metric] || [r.metric]).some((a) => st.t.toLowerCase().includes(a)) &&
          !(ALIAS[r.metric] || [r.metric]).some((a) => ctx.includes(a)))
        problems.push(`[${id}] is ${r.label}; its sentence does not name that measure`);
      const scope = String(r.scope).toLowerCase();
      const scopeWords = scope.startsWith("all campaigns on all platforms") || /on all platforms/.test(scope)
        ? ["all platforms", "across", "overall", "total", "combined", "account", "every platform", "all campaigns", scope.split(" ")[0]]
        : [...scope.matchAll(/(fb|ig|tt|yt|xh)-\d\d|facebook|instagram|tiktok|youtube|xiaohongshu/g)].map((x) => x[0]);
      if (scopeWords.length && !scopeWords.some((w) => ctx.includes(w))) problems.push(`[${id}] is for ${r.scope}; the reply does not name it near the figure`);
      if (opts.allowedPeriods && !opts.allowedPeriods.some(([s, e]) => r.period.start >= s && r.period.end <= e))
        problems.push(`[${id}] covers ${r.period.start} to ${r.period.end}, outside the period asked about`);
    }

    // 2. numbers without a source
    NUM_TOKEN.lastIndex = 0;
    while ((m = NUM_TOKEN.exec(text))) {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 30);
      if (/^\s*[^\n]{0,20}?\[F-[0-9a-f]{6}\]/.test(after)) continue;
      const v = num(m[0]);
      const isRecordValue = recValues.some((x) => near(x, v));
      const fromTool = values.some((x) => near(x, v));
      const isConst = RULE_CONSTANTS.some((x) => near(x, Math.abs(v)));
      if (isRecordValue && !fromTool && !isConst) problems.push(`"${m[0]}" is a figure quoted without its source tag`);
      else if (!isRecordValue && !fromTool && !isConst) problems.push(`"${m[0]}" comes from no tool result`);
    }

    // 3. banned phrases
    for (const st of sents) {
      // a metric's definition ("impressions that led to a click") is not a causal claim about a change
      if (CAUSAL.test(st.t.replace(/\b(that|which) (led|lead|leads) to (a |an )?(clicks?|orders?|purchases?)\b/gi, "")) && !NEG.test(st.t)) problems.push(`causal wording: "${st.t.trim().slice(0, 90)}"`);
      if (/profit/i.test(st.t) && !NEG.test(st.t)) problems.push(`ROAS or revenue called profit: "${st.t.trim().slice(0, 90)}"`);
      if (/\bverified\b/i.test(st.t) && !NEG.test(st.t)) problems.push(`an owner record called verified: "${st.t.trim().slice(0, 90)}"`);
      if (/\b(tools?|corrected reply|rewrit\w*|resubmit\w*|my (first|earlier|previous) attempt|was refused|got refused)\b/i.test(st.t))
        problems.push(`mechanism talk (a tool, an attempt, a refusal or a correction) in the reply to the owner: "${st.t.trim().slice(0, 90)}"`);
      if (/\bI (detected|spotted|noticed|found|discovered)\b[^.]*\btracking\b/i.test(st.t)) problems.push(`a data issue the owner reported is presented as detected by the assistant: "${st.t.trim().slice(0, 90)}"`);
    }
    return { ok: problems.length === 0, problems, tags };
  }

  return { checkReply, collect, ALIAS };
});
