// No-key tests of the PostToolUse hook on good and bad copy for every channel. Answer Key section 9: F4, F5, F6,
// plus every figure, date and banned-phrase check in the copy text. Run: node benchmark/test_hook.mjs
import { extractFacts } from "../lib/facts.mjs";
import { checkCopy } from "../hooks/post_tool_use.mjs";

let pass = 0, failed = 0;
const t = (name, cond, info) => { if (cond) pass++; else { failed++; console.log(`FAIL ${name}${info ? `\n     ${JSON.stringify(info).slice(0, 500)}` : ""}`); } };
const facts = extractFacts({ channels: ["whatsapp", "instagram", "email", "blog", "seo"], tone: "Santai", skus: ["PB01", "PG05", "CU01"] },
  "Prepare all five channels in Santai Bahasa Melayu for our 26 to 30 October campaign. Feature PB01, PG05 and CU01 at their listed promotion prices.");
const claims = [
  { text: "Kemeja putih lengan pendek RM20.00", fact_id: "P-PB01", sku: "PB01" },
  { text: "Pinafore biru gelap RM36.00", fact_id: "P-PG05", sku: "PG05" },
  { text: "Baju Pengakap RM36.00", fact_id: "P-CU01", sku: "CU01" },
  { text: "26 hingga 30 Oktober 2026", fact_id: "F-PERIOD" },
];
const filler = (n) => Array.from({ length: n }, (_, i) => ["Persediaan", "sekolah", "lebih", "mudah", "bila", "ibu", "bapa", "datang", "awal", "ke", "kedai", "kami"][i % 12]).join(" ");
const offer = "Kemeja putih lengan pendek lelaki sekolah rendah kini RM20.00. Pinafore biru navy perempuan sekolah rendah RM36.00. Kemeja lengan pendek Pengakap RM36.00, dari 26 hingga 30 Oktober 2026.";

const good = {
  whatsapp: { message: "Salam ibu bapa! Musim sekolah hampir tiba.\nKemeja putih lengan pendek lelaki sekolah rendah kini RM20.00 (asal RM25.00).\nPinafore biru navy perempuan sekolah rendah RM36.00, kemeja lengan pendek Pengakap RM36.00.\nTawaran 26 hingga 30 Oktober 2026 sahaja.\nSinggah kedai kami di Bangi atau WhatsApp [No. WhatsApp].", claims },
  instagram: { caption: "Sekolah dah dekat, anak dah sedia?\n\n" + offer + "\n\nJimat sehingga 20% untuk produk pilihan.\n\nSinggah Kiddoz di Bangi atau WhatsApp kami di [No. WhatsApp].", hashtags: ["#KiddozBangi", "#BajuSekolah", "#UniformSekolah", "#KembaliKeSekolah", "#IbuBapaBangi"], claims },
  email: { emails: [
    { label: "Teaser", subject: "Sesuatu untuk persediaan sekolah", body: "Salam [Nama], tawaran kami bermula 26 Oktober 2026." },
    { label: "Tawaran", subject: "Tawaran kini dibuka", body: "Salam [Nama], " + offer },
    { label: "Last Call", subject: "Hari terakhir 30 Oktober", body: "Salam [Nama], tawaran berakhir 30 Oktober 2026. Singgah kedai kami di Bangi." },
  ], claims },
  blog: { title: "Persediaan sekolah tanpa tergesa-gesa", body: offer + " " + filler(380) + " Singgah kedai kami di Bangi atau WhatsApp [No. WhatsApp].", claims },
  seo: { paragraph: "Kiddoz Uniform House di Bangi, Selangor. " + offer + " " + filler(140), meta_description: "Uniform sekolah di Bangi: kemeja RM20.00, pinafore RM36.00, 26 hingga 30 Oktober 2026.", claims },
};
const bad = (ch, patch) => ({ ...structuredClone(good[ch]), ...patch });
const has = (r, re) => r.errors.some((e) => re.test(`${e.clause} ${e.detail}`));

for (const ch of Object.keys(good)) { const r = checkCopy(ch, good[ch], facts); t(`good ${ch} copy passes`, r.ok, r.errors); }

// Figures in the copy text
{ const r = checkCopy("instagram", bad("instagram", { caption: good.instagram.caption.replace("RM20.00", "RM18.00") }), facts); t("C2: RM18.00 in the Instagram copy is rejected", has(r, /RM18\.00/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("RM36.00, kemeja", "RM30.00, kemeja") }), facts); t("PG05 at SB01-like price RM30.00 rejected", has(r, /RM30\.00/), r.errors); }
{ const r = checkCopy("instagram", bad("instagram", { caption: good.instagram.caption.replace("sehingga 20%", "sehingga 25%") }), facts); t("25% is over the 20% maximum", has(r, /over the 20%/), r.errors); }
{ const r = checkCopy("instagram", bad("instagram", { caption: good.instagram.caption.replace("sehingga 20%", "sehingga 15%") }), facts); t("15% is not a featured product's discount", has(r, /15%/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("26 hingga 30 Oktober 2026", "1 hingga 7 November 2026") }), facts); t("a November date is outside the campaign period", has(r, /outside the campaign period/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("Pinafore biru navy perempuan sekolah rendah RM36.00", "Pinafore biru navy perempuan sekolah rendah RM36.00, kemeja SB01 RM24.00") }), facts); t("SB01 is not a featured product (PB01 and SB01 kept apart)", has(r, /SB01/) && has(r, /RM24\.00/), r.errors); }

{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("Kemeja putih lengan pendek lelaki sekolah rendah kini", "Kemeja putih lengan pendek lelaki sekolah rendah (PB01) kini") }), facts); t("a featured SKU code written in the copy is rejected (parents look for the item)", has(r, /SKU code PB01/), r.errors); }

{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("Pinafore biru navy perempuan sekolah rendah RM36.00", "Pinafore RM36.00") }), facts); t("a featured product not named in words (colour, level missing) is rejected", has(r, /PG05 is not named in words/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("Pinafore biru navy perempuan sekolah rendah", "Pinafore biru tua perempuan sekolah rendah") }), facts); t("an accepted colour word (biru tua for navy) passes the name check", !has(r, /not named in words/), r.errors); }

// F4, F5: claims list and the copy text
{ const r = checkCopy("whatsapp", bad("whatsapp", { claims: [...claims, { text: "Tawaran istimewa", fact_id: "P-XX99" }] }), facts); t("F4: a claim citing a nonexistent fact ID is rejected", has(r, /P-XX99/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { claims: claims.filter((c) => c.sku !== "CU01") }), facts); t("a featured product not cited by its SKU is rejected", has(r, /CU01 is a featured product/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("sahaja.", "sahaja, stok tinggal 10 helai.") }), facts); t("F5: 'stok tinggal 10 helai' in the copy only is rejected", has(r, /stock/), r.errors); }

// Banned claims and clauses
for (const [phrase, re] of [["Harga paling murah di Bangi!", /cheapest/], ["Dijamin muat!", /guarantee/], ["Hadiah percuma untuk setiap pembelian.", /gift/], ["Penghantaran ke rumah tersedia.", /delivery/], ["Kami nombor 1 di Google.", /ranking/], ["Seluruh kedai diskaun!", /whole shop/], ["Guna baucar KIDDOZ.", /voucher/], ["Hubungi 012-345 6789.", /phone number/], ["Siap dengan logo sekolah.", /logo print/], ["Termasuk lencana dan skarf Pengakap.", /accessories/]]) {
  const r = checkCopy("instagram", bad("instagram", { caption: good.instagram.caption.replace("Jimat sehingga 20% untuk produk pilihan.", phrase) }), facts);
  t(`banned: "${phrase}"`, has(r, re), r.errors);
}
{ const r = checkCopy("instagram", bad("instagram", { caption: good.instagram.caption.replace("Jimat sehingga 20% untuk produk pilihan.", "Baju PE kosong tanpa logo; lencana tidak termasuk.") }), facts); t("accurate negated clauses ('tanpa logo', 'tidak termasuk') pass", !has(r, /logo|accessories/), r.errors); }

{ const r = checkCopy("instagram", bad("instagram", { caption: good.instagram.caption.replace("Jimat sehingga 20% untuk produk pilihan.", "Lencana dan skarf Pengakap tidak termasuk dalam promosi.") }), facts); t("accurate clause with the negation after ('lencana ... tidak termasuk') passes", !has(r, /accessories/), r.errors); }

// F6: the five format rules, one malformed fixture each
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: "Salam!\nKemeja RM20.00.\nSinggah kedai." }), facts); t("F6 WhatsApp: 3 lines rejected", has(r, /G1.*3 lines/), r.errors); }
{ const r = checkCopy("whatsapp", bad("whatsapp", { message: good.whatsapp.message.replace("\nSinggah kedai kami di Bangi atau WhatsApp [No. WhatsApp].", "\nTerima kasih.") }), facts); t("F6 WhatsApp: no call to action on the last line", has(r, /call to action/), r.errors); }
{ const r = checkCopy("instagram", bad("instagram", { hashtags: ["#a", "#b", "#c"] }), facts); t("F6 Instagram: 3 hashtags rejected", has(r, /3 hashtags/), r.errors); }
{ const r = checkCopy("instagram", bad("instagram", { caption: "Satu perenggan sahaja dengan RM20.00 dan RM36.00." }), facts); t("F6 Instagram: one paragraph rejected", has(r, /1 paragraphs/), r.errors); }
{ const r = checkCopy("email", bad("email", { emails: good.email.emails.slice(0, 2) }), facts); t("F6 email: two emails rejected", has(r, /Teaser, Tawaran, Last Call/), r.errors); }
{ const e = structuredClone(good.email.emails); e[1].body = e[1].body.replace("[Nama]", "Puan"); const r = checkCopy("email", bad("email", { emails: e }), facts); t("F6 email: Tawaran without [Nama] rejected", has(r, /Tawaran email does not greet/), r.errors); }
{ const r = checkCopy("blog", bad("blog", { body: offer + " " + filler(150) }), facts); t("F6 blog: under 300 words rejected", has(r, /G4.*words/), r.errors); }
{ const r = checkCopy("seo", bad("seo", { paragraph: offer + " " + filler(40) }), facts); t("F6 SEO: under 150 words rejected", has(r, /G5.*words/), r.errors); }
{ const r = checkCopy("seo", bad("seo", { meta_description: "x".repeat(170) }), facts); t("F6 SEO: meta description over 160 characters rejected", has(r, /160/), r.errors); }

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
