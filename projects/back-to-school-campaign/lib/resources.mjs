// The three MCP resources and their checks. The price list is the only source of prices: every SKU, price,
// discount and date the system uses is read from it here, and a resource that fails its own check is refused
// rather than repaired (no price is ever derived from a discount or from another SKU).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = { "kiddoz://store-profile": "store_profile.json", "kiddoz://price-list": "price_list.json", "kiddoz://channel-guide": "channel_guide.json" };
export const URIS = Object.keys(FILES);

export class ResourceError extends Error {
  constructor(uri, problems) { super(`${uri}: ${problems.join("; ")}`); this.uri = uri; this.problems = problems; this.code = "resource_error"; }
}

// overrides: { unavailable: [uri], priceList: <object> } lets the tests and the F1 fault replace a resource.
export function readResource(uri, overrides = {}) {
  if ((overrides.unavailable || []).includes(uri)) throw new ResourceError(uri, ["the resource could not be loaded"]);
  if (uri === "kiddoz://price-list" && overrides.priceList) return structuredClone(overrides.priceList);
  if (!FILES[uri]) throw new ResourceError(uri, ["unknown resource"]);
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "resources", FILES[uri]), "utf8")); }
  catch (e) { throw new ResourceError(uri, ["the resource could not be loaded"]); }
}

export const round2 = (n) => Math.round(n * 100) / 100;
export const rm = (n) => `RM${Number(n).toFixed(2)}`;

// F2, F3: every item carries a normal price, a promotion price and a discount that recalculates, at most 20%.
export function checkPriceList(pl) {
  const problems = [];
  if (!pl || !Array.isArray(pl.items)) return ["no items"];
  const p = pl.campaign_period || {};
  if (!/^\d{4}-\d\d-\d\d$/.test(p.start || "") || !/^\d{4}-\d\d-\d\d$/.test(p.end || "")) problems.push("campaign period missing");
  const max = pl.max_discount_pct ?? 20;
  const seen = new Set();
  for (const it of pl.items) {
    if (seen.has(it.sku)) problems.push(`${it.sku}: duplicate SKU`);
    seen.add(it.sku);
    if (typeof it.normal_price !== "number" || it.normal_price <= 0) { problems.push(`${it.sku}: normal price missing`); continue; }
    if (typeof it.promo_price !== "number" || it.promo_price <= 0) { problems.push(`${it.sku}: promotion price missing`); continue; }
    const recalc = Math.round((1 - it.promo_price / it.normal_price) * 100);
    if (recalc > max) problems.push(`${it.sku}: discount ${recalc}% (${rm(it.promo_price)} against ${rm(it.normal_price)}) is over ${max}%`);
    if (it.discount_pct !== recalc) problems.push(`${it.sku}: listed discount ${it.discount_pct}% does not match the prices (${recalc}%)`);
  }
  return problems;
}

export function loadPriceList(overrides = {}) {
  const pl = readResource("kiddoz://price-list", overrides);
  const problems = checkPriceList(pl);
  if (problems.length) throw new ResourceError("kiddoz://price-list", problems);
  return pl;
}

export function loadAll(overrides = {}) {
  return {
    store: readResource("kiddoz://store-profile", overrides),
    priceList: loadPriceList(overrides),
    guide: readResource("kiddoz://channel-guide", overrides),
  };
}
