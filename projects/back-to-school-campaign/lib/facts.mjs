// extract_facts: the coordinator's reading of the brief (channels, tone, SKUs, requirements) is checked in code
// against the owner's own message and the price list. Code, not the model, decides whether a price, discount,
// date, product or claim needs an owner question. Each fact has an ID and its source in its own field.
import { loadAll, rm, round2, ResourceError } from "./resources.mjs";
import { skusIn, amountsIn, percentsIn, datesIn, dateInPeriod, bannedIn } from "./scan.mjs";
import { naming } from "./naming.mjs";

export const CHANNELS = ["whatsapp", "instagram", "email", "blog", "seo"];
export const TONES = ["Santai", "Formal", "Campur"];
const KIND_WORDS = { cheapest: "a cheapest claim", guarantee: "a guarantee", gift: "a free gift", voucher: "a voucher",
  delivery: "free delivery", ranking: "a search ranking claim", whole_shop: "a whole-shop sale claim" };

// The amount or percentage belongs to the nearest SKU written before it, else to the only product.
function ownerOf(at, mentions, products) {
  const before = mentions.filter((m) => m.at < at).pop();
  if (before) return before.sku;
  return products.length === 1 ? products[0] : null;
}

/**
 * @param reading  the coordinator's input: { channels, tone, skus, requirements, urgency }
 * @param ownerMessage  the owner's current message, passed by the runner (never by the model)
 * @param carried  state the runner carries into a linked step: { skus, tone, channels }
 */
export function extractFacts(reading = {}, ownerMessage = "", { overrides = {}, carried = null } = {}) {
  let R;
  try { R = loadAll(overrides); }
  catch (e) {
    if (e instanceof ResourceError) return { status: "resource_error", error: { code: "resource_error", resource: e.uri, problems: e.problems }, facts: [], owner_issues: [] };
    throw e;
  }
  const { store, priceList: pl, guide } = R;
  const bySku = Object.fromEntries(pl.items.map((i) => [i.sku, i]));
  const issues = [];
  const msg = String(ownerMessage);

  // Products: SKUs in the owner's message, plus those the coordinator names, plus any carried into a linked step.
  const mentions = skusIn(msg);
  const named = [...new Set([...mentions.map((m) => m.sku), ...(reading.skus || []).map((s) => String(s).toUpperCase().trim()), ...((carried && !mentions.length && carried.skus) || [])])];
  const known = named.filter((s) => bySku[s]);
  for (const s of named.filter((s) => !bySku[s])) {
    issues.push({ code: "O2", item: s, detail: `${s} is not on the price list: not in this campaign.`,
      question_hint: `${s} is not on the campaign price list, so it is not in this campaign; should the copy feature a listed product instead?` });
  }

  // Prices and discounts the owner wrote must match the list (O4); a stated discount is recalculated.
  for (const a of amountsIn(msg)) {
    const sku = ownerOf(a.at, mentions, known);
    if (!sku || !bySku[sku]) continue;
    const it = bySku[sku];
    if (round2(a.value) !== it.normal_price && round2(a.value) !== it.promo_price) {
      issues.push({ code: "O4", item: sku, detail: `${a.raw} in the brief does not match ${sku}: normal ${rm(it.normal_price)}, promotion ${rm(it.promo_price)}.`,
        question_hint: `${sku} is listed at ${rm(it.promo_price)} for the campaign (normal ${rm(it.normal_price)}), but your brief says ${rm(a.value)}; should I use the listed ${rm(it.promo_price)}?` });
    }
  }
  for (const p of percentsIn(msg)) {
    const sku = ownerOf(p.at, mentions, known);
    if (!sku || !bySku[sku]) continue;
    const it = bySku[sku];
    if (p.value !== it.discount_pct) {
      issues.push({ code: "O4", item: sku, detail: `${p.raw} in the brief: ${sku} is ${rm(it.normal_price)} to ${rm(it.promo_price)}, which is ${it.discount_pct}%.`,
        question_hint: `${sku} goes from ${rm(it.normal_price)} to ${rm(it.promo_price)}, which is ${it.discount_pct}% off, not ${p.raw}; should I use ${it.discount_pct}%?` });
    }
  }

  // Dates: none in the brief means the period comes from the price list; dates outside it go to the owner (O4).
  const period = pl.campaign_period;
  const dates = datesIn(msg);
  const outside = dates.filter((d) => !dateInPeriod(d, period));
  if (outside.length) {
    issues.push({ code: "O4", item: "dates", detail: `The brief's dates (${[...new Set(outside.map((d) => d.raw))].join(", ")}) fall outside the campaign period, ${period.text}.`,
      question_hint: `The campaign prices are confirmed only for ${period.text}, but your brief says ${[...new Set(outside.map((d) => d.raw))].join(", ")}; should the copy use ${period.text}?` });
  }

  // Claims the channel guide does not allow (O3), named one by one.
  const banned = bannedIn(msg, { briefOnly: true });
  if (banned.length) {
    const list = banned.map((b) => KIND_WORDS[b.kind]).join(", ");
    issues.push({ code: "O3", item: banned.map((b) => b.kind).join(", "), detail: `The brief asks for claims clause G7 does not allow: ${banned.map((b) => `${b.kind} ("${b.phrase}")`).join(", ")}.`,
      question_hint: `The channel guide does not allow ${list}; may I go ahead with the listed offer only?` });
  }

  // Channels and tone. The coordinator's reading is kept; an unknown channel or tone is not guessed.
  const channels = [...new Set((reading.channels || (carried && carried.channels) || []).map((c) => String(c).toLowerCase().trim()))];
  const badCh = channels.filter((c) => !CHANNELS.includes(c));
  const goodCh = channels.filter((c) => CHANNELS.includes(c));
  if (!goodCh.length) issues.push({ code: "O1", item: "channels", detail: "No channel the team writes was requested.", question_hint: "Which channels should I prepare: WhatsApp, Instagram, email, blog or Google search?" });
  if (badCh.length) issues.push({ code: "O1", item: "channels", detail: `Unknown channel(s): ${badCh.join(", ")}.`, question_hint: `The team writes WhatsApp, Instagram, email, blog and Google search copy; which of these should replace ${badCh.join(", ")}?` });
  let tone = reading.tone ? TONES.find((t) => t.toLowerCase() === String(reading.tone).toLowerCase()) : null;
  let toneSource = "brief";
  if (reading.tone && !tone) issues.push({ code: "O1", item: "tone", detail: `Unknown tone ${reading.tone}.`, question_hint: "Which tone should the copy use: Santai, Formal or Campur?" });
  if (!reading.tone) { tone = (carried && carried.tone) || "Santai"; toneSource = carried && carried.tone ? "earlier step" : "channel-guide G6 (house tone)"; }
  if (!known.length && !issues.some((i) => i.code === "O2")) issues.push({ code: "O1", item: "products", detail: "No campaign product was named.", question_hint: "Which campaign products should the copy feature?" });

  // The facts, each with an ID and its source.
  const clause = (arr, id) => arr.find((c) => c.id === id).text;
  const facts = [
    { id: "F-SHOP", field: "shop", value: "Kiddoz Uniform House, a school uniform niche shop", source: "store-profile S1" },
    { id: "F-LOCATION", field: "location", value: "Bangi, Selangor", source: "store-profile S2" },
    { id: "F-OWNER", field: "owner", value: "Puan Zarina Ahmad, the owner, who may sign the copy", source: "store-profile S3" },
    { id: "F-BUY", field: "how_to_buy", value: clause(store.clauses, "S5"), source: "store-profile S5" },
    { id: "F-PERIOD", field: "campaign_period", value: period.text, start: period.start, end: period.end, source: dates.length && !outside.length ? "brief, matching price-list PL-PERIOD" : "price-list PL-PERIOD" },
    { id: "F-TONE", field: "tone", value: tone, source: toneSource },
  ];
  for (const sku of known) {
    const it = bySku[sku];
    facts.push({ id: `P-${sku}`, field: "product", sku, name: it.name, name_bm: naming(sku, it.name).name_bm, normal_price: rm(it.normal_price), promo_price: rm(it.promo_price),
      saving: rm(round2(it.normal_price - it.promo_price)), discount_pct: it.discount_pct, source: `price-list ${sku}` });
  }
  if (known.length) {
    const max = Math.max(...known.map((s) => bySku[s].discount_pct));
    const same = known.every((s) => bySku[s].discount_pct === max);
    facts.push({ id: "F-MAXDISC", field: "max_discount", value: same ? `${max}% on each featured product` : `up to ${max}% on the featured products (not every item)`, source: "price-list, recalculated" });
  }
  for (const c of pl.clauses) if (known.some((s) => c.applies_to.includes(s.slice(0, 2)))) facts.push({ id: c.id, field: "clause", value: c.text, source: `price-list ${c.id}` });
  (reading.requirements || []).forEach((r, i) => facts.push({ id: `R${i + 1}`, field: "owner_requirement", value: String(r), source: "brief" }));
  if (reading.urgency) facts.push({ id: "F-URGENCY", field: "urgency", value: `Urgency comes only from the campaign deadline, ${period.text.split(" to ")[1]}; no stock, scarcity or countdown claim.`, source: "brief, channel-guide G7" });

  return {
    status: issues.length ? "needs_owner" : "ok",
    channels: goodCh, tone, skus: known, facts, owner_issues: issues,
    channel_rules: guide.clauses.filter((g) => goodCh.includes(g.channel) || g.channel === "all").map((g) => ({ id: g.id, text: g.text })),
  };
}
