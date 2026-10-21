/* The pre-send check: the prevention step on send_reply (Step C, section 7).
 *
 * presend(text, ctx) -> { pass, blocks: [{ check, found }] }
 *   ctx.facts:      every value the tools returned this turn, already in RM and Malaysia time (strings and numbers)
 *   ctx.clauses:    the clause IDs cited this turn by a specialist, or by the router for CS1 to CS6
 *   ctx.handovers:  this turn's handovers, [{ contact_id, name, title }]
 *   ctx.tables:     policy_tables.json (fixed values, campaign days)
 * All in code, on the draft, against this turn's results: a reply carrying a claim the policies and records
 * do not support never reaches the customer. Each block names its check and what it found.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HMPresend = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const NEGATION = /\b(not|no|cannot|can't|never|unable|isn't|aren't|don't|doesn't|won't|without|nor)\b/i;

  // Claims the policies never make. [label, pattern]
  const BLOCKED_CLAIMS = [
    ["photos or videos", /\b(photo(graph)?s?|pictures?|images?|videos?)\b/i],
    ["receipt or proof of purchase", /\b(receipts?|proof of purchase)\b/i],
    ["claim form", /\b(claim form|fill (in|out) (a|the) form)\b/i],
    ["pickup", /\b(pick[- ]?up|collect(ed)? (it|the item|the parcel|from you))\b/i],
    ["return label", /\b(return|shipping|prepaid) labels?\b/i],
    ["store credit", /\b(store credit|vouchers?|credit note)\b/i],
    ["exchange or swap", /\b(exchang(e|ed|ing)|swap(ped|ping)?)\b/i],
    ["goodwill or case-by-case exception", /\b(goodwill|exceptions?|case[- ]by[- ]case)\b/i],
    ["express or next-day delivery", /\b(express|next[- ]day|same[- ]day) (delivery|shipping)\b/i],
    ["tracking link", /\btracking (link|number|code|page)\b/i],
    ["refund guaranteed", /\bguarantee(d|s)?\b/i],
  ];
  // Repair or replacement promised: a promise word, with no mention that the claims officer decides after inspection (QP4).
  const REPAIR = /\b(repair(ed)?|replac(e|ed|ement))\b/i;
  const PROMISE = /\b(will|shall|guarantee)\b/i;
  const DECIDES = /\b(decid(e|es|ed)|decision|inspect(ion|s|ed)?|may)\b/i;
  // CS7: an approval, waiver, credit or refund promise.
  const MONEY = [
    /\b(we|i)(?:'ll| will| can| shall| are able to| am able to)\s+(?:also\s+)?(?:issue\s+(?:you\s+)?(?:a\s+)?|give\s+(?:you\s+)?(?:a\s+)?)?(refund|waive|credit|reimburse|compensate)/i,
    /\bwaiv(e|ed|er|ing)\b/i,
    /\b(money back|back in your account)\b/i,
  ];

  function sentences(text) {
    return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  }
  const num = (s) => Number(String(s).replace(/,/g, ""));
  function monthIndex(word) { return MONTHS.indexOf(word.slice(0, 3).toLowerCase()); }
  function datesIn(text) {
    const out = [];
    const a = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}\\b`, "gi");
    const b = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi");
    let m;
    while ((m = a.exec(text))) out.push({ d: Number(m[1]), m: monthIndex(m[2]), raw: m[0] });
    while ((m = b.exec(text))) out.push({ d: Number(m[2]), m: monthIndex(m[1]), raw: m[0] });
    return out;
  }

  function presend(text, ctx) {
    const blocks = [];
    const block = (check, found) => blocks.push({ check, found });
    const V = ctx.tables.values;
    const factText = (ctx.facts || []).map(String).join(" | ");

    // ---- Fixed values: amounts
    const okAmounts = new Set(V.allowed_rm.map(Number));
    for (const m of factText.matchAll(/RM\s?([\d,]+(?:\.\d{1,2})?)/g)) okAmounts.add(num(m[1]));
    for (const m of text.matchAll(/RM\s?([\d,]+(?:\.\d{1,2})?)/gi)) {
      if (!okAmounts.has(num(m[1]))) block("Fixed values", `${m[0]} is not RM5, RM50, RM100 or an amount in this turn's records`);
    }
    // A threshold stated as inclusive: "above RM100" is the rule (MP1, MP3).
    for (const m of text.matchAll(/RM\s?(50|100)(?:\.00)?\s*(and above|or above|or more|and over|and more)/gi)) {
      block("Fixed values", `"${m[0]}": free delivery is for orders above the threshold, not at it`);
    }
    // ---- Fixed values: periods
    const factNums = new Set((ctx.facts || []).filter((x) => typeof x === "number").map(Number));
    const ranges = V.allowed_ranges.map((r) => r.join("-"));
    let rest = text;
    for (const m of text.matchAll(/(\d+)\s*(?:to|-|–|and)\s*(\d+)\s*(working days|business days|days|hours)/gi)) {
      if (!ranges.includes(`${m[1]}-${m[2]}`) || !/working|business/i.test(m[3])) block("Fixed values", `"${m[0]}" is not 3 to 5 or 5 to 7 working days`);
      rest = rest.replace(m[0], " ");
    }
    const periods = V.allowed_periods.map(([n, u]) => `${n} ${u}`);
    for (const m of rest.matchAll(/(\d+)[\s-]*(working days?|business days?|days?|hours?|weeks?|months?)\b/gi)) {
      const unit = m[2].toLowerCase().replace(/^business/, "working");
      const plural = unit.endsWith("s") ? unit : unit + "s";
      if (periods.includes(`${m[1]} ${plural}`)) continue;
      if (/^(days|hours)$/.test(plural) && factNums.has(Number(m[1]))) continue; // e.g. "17 days ago" from days_since_delivery
      block("Fixed values", `"${m[0]}" is not a period the policies set or a value in this turn's records`);
    }
    // ---- Dates
    const okDates = new Set(datesIn(factText).map((x) => `${x.d}-${x.m}`));
    for (const iso of Object.keys(ctx.tables.campaign_days)) okDates.add(`${Number(iso.slice(8, 10))}-${Number(iso.slice(5, 7)) - 1}`);
    for (const x of datesIn(text)) {
      if (!okDates.has(`${x.d}-${x.m}`)) block("Dates and amounts", `"${x.raw}" is not a date in this turn's records`);
    }
    // ---- Blocked claims and money, sentence by sentence (a negated sentence states a limit, not an offer)
    for (const s of sentences(text)) {
      const negated = NEGATION.test(s);
      for (const [label, re] of BLOCKED_CLAIMS) {
        const m = s.match(re);
        if (m && !negated) block("Blocked claims", `${label}: "${m[0]}"`);
      }
      if (REPAIR.test(s) && PROMISE.test(s) && !DECIDES.test(s) && !negated) block("Blocked claims", `repair or replacement promised: "${s}"`);
      for (const re of MONEY) {
        const m = s.match(re);
        if (m && !negated) block("Money", `"${m[0]}" (CS7: money is decided by staff)`);
      }
    }
    // ---- Handovers: every handover this turn stated with the person's name and job title
    for (const h of ctx.handovers || []) {
      if (h.contact_id === "store") {
        if (!/our store manager/i.test(text)) block("Handover", "the store manager sentence is missing (CS4)");
      } else if (!(text.toLowerCase().includes(h.name.toLowerCase()) && text.toLowerCase().includes(h.title.toLowerCase()))) {
        block("Handover", `the handover to ${h.name}, ${h.title}, is not stated with the name and job title`);
      }
    }
    // ---- Clauses: every clause in the reply was cited this turn
    const okClauses = new Set(ctx.clauses || []);
    for (const m of text.matchAll(/\b(CS|FP|RP|FN|QP|MP)\d\b/g)) {
      if (!okClauses.has(m[0])) block("Clauses", `${m[0]} was not cited this turn`);
    }
    return { pass: blocks.length === 0, blocks };
  }

  return { presend, BLOCKED_CLAIMS };
});
