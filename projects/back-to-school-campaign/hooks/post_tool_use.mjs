// The PostToolUse hook on each writer's output tool. It checks the copy text itself, not only the writer's
// claims list: every RM figure, percentage and date, every SKU, every banned phrase, and the channel's format
// rules. A failure is recorded with the exact errors; the runner hands them to the coordinator (hub and spoke).
import { skusIn, amountsIn, percentsIn, datesIn, dateInPeriod, bannedIn, words } from "../lib/scan.mjs";
import { namedInCopy } from "../lib/naming.mjs";

export const WRITER_TOOLS = { write_whatsapp: "whatsapp", write_instagram: "instagram", write_email: "email", write_blog: "blog", write_seo: "seo" };
const num = (s) => Number(String(s).replace(/^RM/, ""));

// The copy text a parent would read, per channel.
export function copyText(channel, c = {}) {
  switch (channel) {
    case "whatsapp": return String(c.message || "");
    case "instagram": return [c.caption || "", (c.hashtags || []).join(" ")].join("\n\n");
    case "email": return (c.emails || []).map((e) => `${e.subject || ""}\n${e.body || ""}`).join("\n\n");
    case "blog": return `${c.title || ""}\n\n${c.body || ""}`;
    case "seo": return `${c.paragraph || ""}\n\n${c.meta_description || ""}`;
    default: return "";
  }
}

const CTA = /(whatsapp|\bwa\b|kedai|singgah|datang|kunjungi|lawati|hubungi|mesej|balas|klik|tempah|dapatkan)/i;

function formatErrors(channel, c) {
  const e = [];
  const add = (clause, detail) => e.push({ check: "format", clause, detail });
  if (channel === "whatsapp") {
    const lines = String(c.message || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 4 || lines.length > 6) add("G1", `WhatsApp has ${lines.length} lines; it needs 4 to 6.`);
    if (!lines.length || !CTA.test(lines[lines.length - 1])) add("G1", "The last WhatsApp line is not a call to action (visit the shop or WhatsApp Kiddoz).");
  } else if (channel === "instagram") {
    const paras = String(c.caption || "").split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter((p) => p && !/^(#\S+\s*)+$/.test(p));
    if (paras.length < 3 || paras.length > 5) add("G2", `The caption has ${paras.length} paragraphs (hook included); it needs 3 to 5, separated by blank lines.`);
    const tags = c.hashtags || [];
    if (tags.length < 5 || tags.length > 8) add("G2", `There are ${tags.length} hashtags; it needs 5 to 8.`);
    const bad = tags.filter((t) => !/^#[\p{L}\p{N}_]+$/u.test(String(t)));
    if (bad.length) add("G2", `Hashtags must be one word starting with #: ${bad.join(", ")}.`);
    if (/#\S/.test(String(c.caption || ""))) add("G2", "Hashtags go in the hashtags list, not in the caption.");
  } else if (channel === "email") {
    const em = c.emails || [];
    const labels = em.map((x) => x.label);
    if (em.length !== 3 || labels.join("|") !== "Teaser|Tawaran|Last Call") add("G3", `The emails are [${labels.join(", ")}]; they must be exactly Teaser, Tawaran, Last Call, in that order.`);
    em.forEach((x) => {
      if (!String(x.subject || "").trim()) add("G3", `The ${x.label || "unlabelled"} email has no subject line.`);
      if (!String(x.body || "").includes("[Nama]")) add("G3", `The ${x.label || "unlabelled"} email does not greet the reader with [Nama].`);
    });
  } else if (channel === "blog") {
    if (!String(c.title || "").trim()) add("G4", "The blog post has no title.");
    const n = words(c.body || "");
    if (n < 300 || n > 500) add("G4", `The blog body has ${n} words; it needs 300 to 500.`);
  } else if (channel === "seo") {
    const n = words(c.paragraph || "");
    if (n < 150 || n > 200) add("G5", `The search paragraph has ${n} words; it needs 150 to 200.`);
    const md = String(c.meta_description || "").trim();
    if (!md) add("G5", "There is no meta description.");
    else if (md.length > 160) add("G5", `The meta description has ${md.length} characters; at most 160.`);
  }
  return e;
}

/** Checks one writer's output against the facts from extract_facts. Returns { ok, errors }. */
export function checkCopy(channel, input, factsResult) {
  const errors = [];
  const facts = factsResult?.facts || [];
  const ids = new Set(facts.map((f) => f.id));
  const products = facts.filter((f) => f.field === "product");
  const period = facts.find((f) => f.id === "F-PERIOD");
  const text = copyText(channel, input);

  // Claims list: every claim cites a real fact ID; every featured product is cited by its SKU.
  const claims = Array.isArray(input?.claims) ? input.claims : [];
  if (!claims.length) errors.push({ check: "claims", clause: "claims", detail: "The claims list is empty; each claim must cite a fact ID." });
  for (const cl of claims) {
    if (!ids.has(cl.fact_id)) errors.push({ check: "claims", clause: "facts", detail: `Claim "${String(cl.text || "").slice(0, 60)}" cites ${cl.fact_id || "no fact ID"}, which is not in the facts.` });
    else if (cl.sku && String(cl.fact_id).startsWith("P-") && cl.fact_id !== `P-${cl.sku}`) errors.push({ check: "claims", clause: "facts", detail: `Claim cites ${cl.fact_id} but names SKU ${cl.sku}.` });
  }
  for (const p of products) if (!claims.some((cl) => cl.fact_id === p.id)) errors.push({ check: "claims", clause: p.id, detail: `${p.sku} is a featured product but no claim cites ${p.id}.` });

  // Parents look for the item, not its code: a SKU belongs in the claims list, never in the copy text.
  for (const s of new Set(skusIn(text).map((m) => m.sku))) {
    if (!products.some((p) => p.sku === s)) errors.push({ check: "figures", clause: "price-list", detail: `${s} appears in the copy but is not a featured product in the facts.` });
    else errors.push({ check: "sku_in_copy", clause: "claims", detail: `The SKU code ${s} is written in the copy; name the item in words for parents and cite ${s} in the claims list only.` });
  }

  // Every featured product is named in words a parent would look for (garment, colour, sleeve, boys or girls,
  // school level or unit), together in one line or about two sentences.
  for (const p of products) if (!namedInCopy(text, p.sku, p.name)) errors.push({ check: "product_name", clause: p.id, detail: `${p.sku} is not named in words in the copy; name it as "${p.name_bm}" (the fabric may be added).` });

  // Every RM figure must be a featured product's normal price, promotion price or saving.
  const allowed = new Set(products.flatMap((p) => [num(p.normal_price), num(p.promo_price), num(p.saving)]));
  for (const a of amountsIn(text)) if (!allowed.has(Math.round(a.value * 100) / 100)) {
    errors.push({ check: "figures", clause: "price-list", detail: `${a.raw} in the copy matches no featured price; the listed figures are ${products.map((p) => `${p.sku} ${p.normal_price} to ${p.promo_price}`).join(", ")}.` });
  }
  // Every percentage must be a featured product's recalculated discount, at most 20%.
  const discs = new Set(products.map((p) => p.discount_pct));
  for (const p of percentsIn(text)) {
    if (p.value > 20) errors.push({ check: "figures", clause: "G7", detail: `${p.raw} is over the 20% maximum discount.` });
    else if (!discs.has(p.value)) errors.push({ check: "figures", clause: "price-list", detail: `${p.raw} is not the discount of any featured product (${products.map((x) => `${x.sku} ${x.discount_pct}%`).join(", ")}).` });
  }
  // Promotion prices are quoted only for the campaign period.
  if (period) for (const d of datesIn(text)) if (!dateInPeriod(d, period)) errors.push({ check: "dates", clause: "PL-PERIOD", detail: `"${d.raw}" is outside the campaign period, ${period.value}.` });

  // Banned phrases in the copy text, whether or not the claims list names them.
  for (const b of bannedIn(text)) errors.push({ check: "banned", clause: b.clause, detail: `"${b.phrase}" is a ${b.kind.replace("_", " ")} claim, not allowed (${b.clause}).` });

  errors.push(...formatErrors(channel, input || {}));
  return { ok: errors.length === 0, errors };
}
