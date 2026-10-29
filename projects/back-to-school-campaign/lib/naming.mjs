// Parents look for the item, not its code. From each price-list name this builds (1) the Bahasa Melayu name the
// writers are given, and (2) the term groups the hook requires near each other in the copy, so every featured
// product is named in words: garment, colour, sleeve, boys or girls, school level or co-curricular unit.

const COLOURS = [
  [/navy blue/i, "biru navy", "biru navy|biru tua|biru gelap|navy"],
  [/light blue/i, "biru muda", "biru muda"],
  [/olive green/i, "hijau zaitun", "hijau zaitun|hijau"],
  [/turquoise/i, "biru firus", "biru firus|firus|turquoise"],
  [/white/i, "putih", "putih"],
  [/black/i, "hitam", "hitam"],
  [/beige/i, "kuning air", "kuning air|beige"],
];
// Longest first: the first match is the garment.
const GARMENTS = [
  [/baju melayu top/i, "baju Melayu", "baju melayu"],
  [/baju melayu trousers/i, "seluar baju Melayu", "seluar"],
  [/baju kurung top/i, "baju kurung", "baju kurung"],
  [/baju kurung skirt/i, "kain baju kurung", "kain|skirt"],
  [/muslimah sports top/i, "baju sukan Muslimah", "baju sukan|muslimah"],
  [/pe t-shirt/i, "baju-T PJ", "baju[- ]?t|t-?shirt|baju pj|baju sukan"],
  [/track pants/i, "seluar trek", "seluar trek|track"],
  [/sports shorts/i, "seluar pendek sukan", "seluar pendek"],
  [/long trousers|trousers/i, "seluar panjang", "seluar"],
  [/shorts/i, "seluar pendek", "seluar pendek"],
  [/pinafore/i, "pinafore", "pinafore"],
  [/blazer/i, "blazer", "blazer"],
  [/vest/i, "vest", "vest|jaket"],
  [/songkok/i, "songkok", "songkok"],
  [/tudung/i, "tudung", "tudung"],
  [/blouse/i, "blaus", "blaus|baju"],
  [/dress/i, "gaun", "gaun|baju"],
  [/skirt/i, "skirt", "skirt|kain"],
  [/shirt/i, "kemeja", "kemeja|baju"],
  [/top/i, "baju", "baju"],
];
const UNITS = ["Pengakap", "Pandu Puteri Tunas", "Pandu Puteri", "TKRS", "KRS", "Puteri Islam", "BSMM"];
const LEVEL = { PB: ["lelaki", "sekolah rendah"], PG: ["perempuan", "sekolah rendah"], SB: ["lelaki", "sekolah menengah"], SG: ["perempuan", "sekolah menengah"] };

export function naming(sku, name) {
  const code = sku.slice(0, 2);
  const words = [];
  const groups = [];
  const g = GARMENTS.find(([re]) => re.test(name));
  const unit = UNITS.find((u) => name.includes(u));
  if (g) { words.push(g[1]); groups.push(g[2]); }
  const sleeve = /short-sleeve/i.test(name) ? "lengan pendek" : /long-sleeve/i.test(name) ? "lengan panjang" : null;
  const c = COLOURS.find(([re]) => re.test(name));
  if (c) { words.push(c[1]); groups.push(c[2]); }
  if (sleeve) { words.push(sleeve); groups.push(sleeve); }
  if (/prefect/i.test(name)) { words.push("pengawas"); groups.push("pengawas"); }
  if (/librarian/i.test(name)) { words.push("pustakawan"); groups.push("pustakawan"); }
  if (unit) { words.push(unit); groups.push(unit.split(" ")[0].toLowerCase()); }
  const gender = LEVEL[code]?.[0] || (/\bboys['’]/i.test(name) ? "lelaki" : /\bgirls['’]/i.test(name) ? "perempuan" : null);
  if (gender) { words.push(gender); groups.push(gender === "lelaki" ? "lelaki" : "perempuan"); }
  if (LEVEL[code]) { words.push(LEVEL[code][1]); groups.push(LEVEL[code][1]); }
  if (code === "RS") { words.push("sekolah agama"); groups.push("sekolah agama|agama"); }
  return { name_bm: words.join(" ").replace(/^./, (x) => x.toUpperCase()), terms: groups.map((x) => new RegExp(`\\b(?:${x})`, "i")) };
}

/** True when some stretch of the copy (one line, or about two sentences) names the product in words. */
export function namedInCopy(text, sku, name) {
  const { terms } = naming(sku, name);
  const parts = String(text).split(/\r?\n/).flatMap((line) => {
    const s = line.split(/(?<=[.!?])\s+/);
    return s.map((x, i) => x + " " + (s[i + 1] || ""));
  });
  return parts.some((p) => terms.every((re) => re.test(p)));
}
