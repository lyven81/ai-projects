// Text scanners shared by extract_facts (the owner's brief) and the PostToolUse hook (the copy itself):
// SKUs, RM amounts, percentages, dates and banned claims, in Bahasa Melayu and English.

export const SKU_RE = /\b(?!RM\d)([A-Z]{2,4}\d{2})\b/g; // RM18 is a price, not a SKU

export function skusIn(text) {
  return [...String(text).matchAll(SKU_RE)].map((m) => ({ sku: m[1], at: m.index }));
}

// "RM20", "RM 20.00", "RM29,75"
export function amountsIn(text) {
  return [...String(text).matchAll(/RM\s?(\d{1,4}(?:[.,]\d{1,2})?)(?![\d])/gi)].map((m) => ({ value: Number(m[1].replace(",", ".")), raw: m[0], at: m.index }));
}

export function percentsIn(text) {
  return [...String(text).matchAll(/(\d{1,3}(?:[.,]\d+)?)\s?(?:%|peratus\b|percent\b)/gi)].map((m) => ({ value: Number(m[1].replace(",", ".")), raw: m[0], at: m.index }));
}

const MONTHS = { jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mac: 3, march: 3, mar: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, june: 6, jul: 7, julai: 7, july: 7, ogos: 8, aug: 8, august: 8, ogo: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, dis: 12, disember: 12, dec: 12, december: 12 };
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

// Every day-and-month in the text, ranges expanded to both ends: "26 hingga 30 Oktober", "26-30 Okt 2026",
// "1 to 7 November 2026", "30 Oktober", "30/10/2026", "30.10".
export function datesIn(text) {
  const s = String(text);
  const out = [];
  const range = new RegExp(`\\b(\\d{1,2})\\s*(?:-|–|hingga|sehingga|sampai|to|until|dan|and)\\s*(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?\\b`, "gi");
  const covered = [];
  for (const m of s.matchAll(range)) {
    const mo = MONTHS[m[3].toLowerCase()]; const y = m[4] ? Number(m[4]) : null;
    out.push({ day: Number(m[1]), month: mo, year: y, raw: m[0], at: m.index }, { day: Number(m[2]), month: mo, year: y, raw: m[0], at: m.index });
    covered.push([m.index, m.index + m[0].length]);
  }
  const single = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?\\b`, "gi");
  for (const m of s.matchAll(single)) {
    if (covered.some(([a, b]) => m.index >= a && m.index < b)) continue;
    out.push({ day: Number(m[1]), month: MONTHS[m[2].toLowerCase()], year: m[3] ? Number(m[3]) : null, raw: m[0], at: m.index });
  }
  for (const m of s.matchAll(/\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/g)) {
    const mo = Number(m[2]); if (mo < 1 || mo > 12) continue;
    if (/RM\s?$/i.test(s.slice(Math.max(0, m.index - 3), m.index))) continue; // RM29.75 is a price, not a date
    if (!m[3] && /\d[.]\d\d$/.test(m[0]) && Number(m[2]) > 12) continue;
    out.push({ day: Number(m[1]), month: mo, year: m[3] ? Number(m[3].length === 2 ? "20" + m[3] : m[3]) : null, raw: m[0], at: m.index });
  }
  return out.filter((d) => d.day >= 1 && d.day <= 31);
}

export function dateInPeriod(d, period) {
  const y = d.year ?? Number(period.start.slice(0, 4));
  const iso = `${y}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
  return iso >= period.start && iso <= period.end;
}

// Banned claims (channel guide G7 and the price list clauses). Each rule names the clause it enforces.
// `brief: true` marks the claim types the owner may ask for, which extract_facts turns into an O3 question.
export const BANNED = [
  { kind: "cheapest", clause: "G7", brief: true, re: /\b(paling murah|termurah|harga (?:paling )?rendah|harga terendah|terendah di|cheapest|lowest price|harga terbaik di|tiada tandingan)\b/i },
  { kind: "guarantee", clause: "G7", brief: true, re: /\b(dijamin|jaminan|menjamin|jamin|guaranteed?|guarantees|pasti muat|muat sempurna|perfect fit)\b/i },
  { kind: "gift", clause: "G7", brief: true, re: /\b(hadiah|cenderahati|percuma|free gift|gifts?|freebies?)\b/i },
  { kind: "voucher", clause: "G7", brief: true, re: /\b(baucar|vouchers?|kupon|coupons?|kod diskaun|cashback|rebat)\b/i },
  { kind: "delivery", clause: "G7", brief: true, re: /\b(penghantaran|dihantar|hantar ke rumah|free delivery|delivery|pos laju|kurier|courier|shipping)\b/i },
  { kind: "ranking", clause: "G7", brief: true, re: /(first on google|pertama di google|nombor (?:1|satu) di google|top of (?:google|search)|kedudukan (?:pertama|teratas)|ranking|carian (?:pertama|teratas)|\bno\.?\s?1\b|#1\b)/i },
  { kind: "whole_shop", clause: "G7", brief: true, re: /(whole shop|entire shop|everything (?:is )?(?:on sale|discounted|\d+% off)|storewide|all uniforms|all items|seluruh kedai|semua barang|semua item|semua produk|semua pakaian seragam|semua uniform|semua baju|satu kedai|20% (?:off )?(?:untuk |bagi )?semua|semua (?:\w+ )?(?:diskaun|potongan) 20%)/i },
  { kind: "stock", clause: "G7", brief: false, re: /\b(stok|stock|terhad|limited|hampir habis|cepat habis|sold out|habis dijual|kuantiti|selagi ada|while stocks? last|siapa cepat|first come|tinggal \d+|hanya \d+ (?:helai|unit|pasang))\b/i },
  { kind: "countdown", clause: "G7", brief: false, re: /\b(kiraan detik|countdown|jam lagi|hours left|minit lagi)\b/i },
  { kind: "school_match", clause: "PL-01", brief: false, re: /(padan dengan (?:uniform|pakaian|reka bentuk) sekolah|sepadan dengan sekolah|sama seperti (?:uniform )?sekolah anda|ikut spesifikasi sekolah anda|matches your school)/i },
  { kind: "logo_print", clause: "PL-03", brief: false, re: /\b(logo|bercetak|cetakan|printing|printed|sulaman|bersulam)\b/i },
  { kind: "accessories", clause: "PL-04", brief: false, re: /\b(lencana|skarf|selendang|beret|aksesori|set lengkap|full set|badges?)\b/i },
  { kind: "phone_number", clause: "S5", brief: false, re: /(\+?6?01\d[-\s]?\d{3,4}[-\s]?\d{4}|wa\.me\/\d+)/i },
];

// A negated mention states a clause accurately ("tanpa logo", "tidak termasuk lencana", "tiada penghantaran")
// and is allowed for these kinds only.
const NEGATABLE = new Set(["logo_print", "accessories", "delivery", "gift", "voucher"]);
const NEG_AFTER = /^[^.!?\n]{0,45}?(tidak termasuk|tidak disertakan|dijual berasingan|tidak ditawarkan|not included|sold separately|excluded)/i;
const NEG_BEFORE = /(tanpa|tiada|tidak termasuk|tidak disertakan|tidak ditawarkan|bukan|kecuali|no|without|not included|excluding|excludes?)\s+(?:\S+\s+){0,2}$/i;

export function bannedIn(text, { briefOnly = false } = {}) {
  const s = String(text);
  const hits = [];
  for (const b of BANNED) {
    if (briefOnly && !b.brief) continue;
    const re = new RegExp(b.re.source, b.re.flags.includes("g") ? b.re.flags : b.re.flags + "g");
    for (const m of s.matchAll(re)) {
      if (NEGATABLE.has(b.kind) && (NEG_BEFORE.test(s.slice(Math.max(0, m.index - 40), m.index)) || NEG_AFTER.test(s.slice(m.index + m[0].length, m.index + m[0].length + 60)))) continue;
      hits.push({ kind: b.kind, clause: b.clause, phrase: m[0] });
      break;
    }
  }
  return hits;
}

export const words = (t) => String(t).trim().split(/\s+/).filter(Boolean).length;
