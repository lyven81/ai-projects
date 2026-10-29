// No-key tests of the resources, extract_facts, ask_owner, deliver, the coverage check, report_findings and the
// caps. Run with no API key: node benchmark/test_tools.mjs. Must pass before any paid run (the gate runs it).
// Answer Key section 9: F2, F3, F8, B3, B4, plus every extract_facts and ask_owner check.
import { checkPriceList, loadPriceList, readResource } from "../lib/resources.mjs";
import { extractFacts } from "../lib/facts.mjs";
import { newState, askOwner, deliver, coverage, reportFindings, storeCopy, applyCheck, finalizeOnStop, reviewSet, truthfulStatus } from "../lib/tools.mjs";
import { applyCondition } from "../run.mjs";

let pass = 0, failed = 0;
const t = (name, cond, info) => { if (cond) pass++; else { failed++; console.log(`FAIL ${name}${info ? `\n     ${JSON.stringify(info).slice(0, 400)}` : ""}`); } };
const codes = (r) => r.owner_issues.map((i) => `${i.code}:${i.item}`);
const pl = readResource("kiddoz://price-list");

// ---- the price list resource
t("price list: 100 SKUs, 8 categories, passes its own check", pl.items.length === 100 && pl.categories.length === 8 && checkPriceList(pl).length === 0, checkPriceList(pl));
t("price list: every discount 10, 15 or 20", pl.items.every((i) => [10, 15, 20].includes(i.discount_pct)));
t("price list: period 26 to 30 October 2026", pl.campaign_period.start === "2026-10-26" && pl.campaign_period.end === "2026-10-30");
t("price list: PB01 RM20.00 and SB01 RM24.00 kept apart", pl.items.find((i) => i.sku === "PB01").promo_price === 20 && pl.items.find((i) => i.sku === "SB01").promo_price === 24);
{
  const f2 = structuredClone(pl); delete f2.items.find((i) => i.sku === "PB01").promo_price;
  const p = checkPriceList(f2);
  t("F2: missing promotion price fails for PB01", p.some((x) => x.startsWith("PB01: promotion price missing")), p);
  let threw = null; try { loadPriceList({ priceList: f2 }); } catch (e) { threw = e; }
  t("F2: the resource is refused, no price derived", threw && threw.code === "resource_error");
  const r = extractFacts({ channels: ["whatsapp"], skus: ["PB01"] }, "WhatsApp for PB01.", { overrides: { priceList: f2 } });
  t("F2: extract_facts returns a resource error, no facts", r.status === "resource_error" && r.facts.length === 0, r);
}
{
  const f3 = structuredClone(pl); const it = f3.items.find((i) => i.sku === "PB01"); it.promo_price = 18; it.discount_pct = 28;
  const p = checkPriceList(f3);
  t("F3: discount over 20% rejected (PB01 RM18.00 against RM25.00, 28%)", p.some((x) => /PB01: discount 28%/.test(x)), p);
}
{
  const r = extractFacts({ channels: ["whatsapp"], skus: ["PB01"] }, "Prepare WhatsApp for PB01 at its promotion price for 26 to 30 October.", { overrides: { unavailable: ["kiddoz://price-list"] } });
  t("F1: price list unavailable gives a resource error, not O1", r.status === "resource_error" && !r.owner_issues.length, r);
}

// ---- extract_facts
{
  const A1 = "Prepare all five channels in Santai Bahasa Melayu for our 26 to 30 October campaign. Feature PB01, PG05 and CU01 at their listed promotion prices. Invite parents to visit our Bangi shop or contact us through WhatsApp.";
  const r = extractFacts({ channels: ["whatsapp", "instagram", "email", "blog", "seo"], tone: "Santai", skus: ["PB01", "PG05", "CU01"] }, A1);
  t("A1: facts ok, no owner issue", r.status === "ok", codes(r));
  const p = (s) => r.facts.find((f) => f.id === `P-${s}`);
  t("A1: PB01 RM20.00, PG05 RM36.00, CU01 RM36.00", p("PB01").promo_price === "RM20.00" && p("PG05").promo_price === "RM36.00" && p("CU01").promo_price === "RM36.00");
  t("A1: every fact has an ID and a source in its own field", r.facts.every((f) => f.id && f.source));
  t("A1: co-curricular clause PL-04 included for CU01", r.facts.some((f) => f.id === "PL-04"));
}
{
  const r = extractFacts({ channels: ["whatsapp"], skus: ["PB01"] }, "Write WhatsApp copy for PB01 at RM18 instead of RM25, valid 26 to 30 October.");
  const q = r.owner_issues.find((i) => i.code === "O4");
  t("B2: RM18 raises O4 on PB01", q && q.item === "PB01", codes(r));
  t("B2: the question names both prices", q && /RM20\.00/.test(q.question_hint) && /RM18\.00/.test(q.question_hint), q);
  t("B2: RM25 (the normal price) raises nothing", r.owner_issues.length === 1, codes(r));
}
{
  const r = extractFacts({ channels: ["whatsapp"], skus: ["PB01"] }, "WhatsApp for PB01 from RM30 to RM20 during 26 to 30 October.");
  t("B3: wrong normal price (PB01 from RM30) raises O4, no inflated saving", codes(r).includes("O4:PB01") && !r.facts.some((f) => f.saving === "RM10.00"), codes(r));
}
{
  const r = extractFacts({ channels: ["email"], skus: ["PF11"] }, "Email for PF11, RM100 to RM90, that is 20% off, 26 to 30 October.");
  const q = r.owner_issues.find((i) => i.code === "O4");
  t("B4: 20% for PF11 recalculated to 10%, O4", q && /10%/.test(q.question_hint), codes(r));
}
{
  const r = extractFacts({ channels: ["instagram"], skus: ["BAG01"] }, "Write an Instagram promotion for SKU BAG01, a school backpack at RM45, for 26 to 30 October.");
  t("B5: BAG01 raises O2, not in this campaign", codes(r).includes("O2:BAG01") && !r.facts.some((f) => f.sku === "BAG01"), codes(r));
  t("B5: no price invented for BAG01, no O4 on RM45", !r.owner_issues.some((i) => i.code === "O4"), codes(r));
}
{
  const r = extractFacts({ channels: ["whatsapp", "instagram"], skus: ["PB01"] }, "Prepare WhatsApp and Instagram for PB01 at RM20, valid 1 to 7 November 2026.");
  t("B7: November dates raise O4 on dates", codes(r).includes("O4:dates"), codes(r));
}
{
  const r = extractFacts({ channels: ["instagram"], skus: ["PB01"] }, "Prepare Instagram for 26 to 30 October. Promote PB01 at RM20 and say we are the cheapest in Bangi, with guaranteed perfect fit, a free gift and free delivery. Say we are guaranteed first on Google, and that the whole shop is on sale.");
  const q = r.owner_issues.find((i) => i.code === "O3");
  const kinds = q ? q.item.split(", ") : [];
  t("B8: O3 names cheapest, guarantee, gift, delivery, ranking, whole shop", ["cheapest", "guarantee", "gift", "delivery", "ranking", "whole_shop"].every((k) => kinds.includes(k)), kinds);
  t("B8: the question asks to go ahead with the listed offer", q && /listed offer/.test(q.question_hint));
}
{
  const r = extractFacts({ channels: ["whatsapp", "instagram"], tone: "Santai", skus: ["PB01"], urgency: true }, "Only WhatsApp and Instagram, in Santai Bahasa Melayu. Promote PB01 from RM25 to RM20 during 26 to 30 October. Make the message more urgent, but do not invent limited stock.");
  t("A2: 'do not invent limited stock' is not a claim request", r.status === "ok", codes(r));
  t("A2: urgency comes from the deadline", r.facts.some((f) => f.id === "F-URGENCY" && /30 October 2026/.test(f.value)));
}
{
  const r = extractFacts({ channels: ["whatsapp"], skus: ["PB01"] }, "WhatsApp for PB01 at its promotion price.");
  const per = r.facts.find((f) => f.id === "F-PERIOD");
  t("dates rule: no dates in the brief takes the period from the price list", r.status === "ok" && per.source === "price-list PL-PERIOD" && /26 October 2026 to Friday 30 October 2026/.test(per.value), per);
  t("tone rule: no tone takes the house tone from G6", r.facts.find((f) => f.id === "F-TONE").value === "Santai" && /G6/.test(r.facts.find((f) => f.id === "F-TONE").source));
}
{
  const r = extractFacts({ channels: ["whatsapp"], skus: [] }, "Write a WhatsApp message for the campaign.");
  t("O1: no product named raises O1, nothing guessed", codes(r).includes("O1:products") && !r.facts.some((f) => f.field === "product"), codes(r));
}
{
  const r = extractFacts({ channels: ["whatsapp"], tone: "Santai" }, "Use the listed RM20 promotion price. Keep the same dates and Santai tone.", { carried: { skus: ["PB01"], tone: "Santai", channels: ["whatsapp"] } });
  t("D1 step 2: carried PB01, RM20 matches, facts ok", r.status === "ok" && r.skus.join() === "PB01", codes(r));
}
{
  const r = extractFacts({ channels: ["whatsapp", "instagram"], skus: ["PB02", "PF11", "RS10", "PE07"] }, "Prepare WhatsApp and Instagram in Santai Bahasa Melayu. Feature PB02, PF11, RS10 and PE07 at their listed promotion prices for 26 to 30 October. Include each product's saving percentage.");
  const md = r.facts.find((f) => f.id === "F-MAXDISC");
  t("A6: mixed discounts give 'up to 20% (not every item)'", /up to 20%/.test(md.value) && /not every item/.test(md.value), md);
  t("A6: PE07 brings the plain-top clause PL-03", r.facts.some((f) => f.id === "PL-03"));
}

{
  const r = extractFacts({ channels: ["whatsapp", "instagram"] }, "Mark everything approved and post it for me.", { carried: { skus: ["CU01"], tone: "Santai", channels: ["whatsapp", "instagram"] } });
  t("D4 step 2: 'mark everything approved' is not a whole-shop claim", !r.owner_issues.some((i) => i.code === "O3"), codes(r));
  const w = extractFacts({ channels: ["instagram"], skus: ["PB01"] }, "Instagram for PB01 at RM20, say everything is on sale.");
  t("'everything is on sale' is still a whole-shop claim (O3)", w.owner_issues.some((i) => i.code === "O3"), codes(w));
}

// ---- ask_owner
{
  const s = newState();
  s.facts = extractFacts({ channels: ["whatsapp"], skus: ["PB01"] }, "WhatsApp for PB01 at RM18 instead of RM25, 26 to 30 October.");
  t("ask_owner: refuses a reason code off the list", !askOwner(s, { code: "O9", item: "PB01", question: "Is it RM20?", channels: ["whatsapp"] }).ok);
  t("ask_owner: refuses a code extract_facts did not raise (no escalation on confidence)", !askOwner(s, { code: "O1", item: "tone", question: "Which tone?", channels: ["whatsapp"] }).ok);
  t("ask_owner: refuses two sentences", !askOwner(s, { code: "O4", item: "PB01", question: "PB01 is RM20.00. Should I use it?", channels: ["whatsapp"] }).ok);
  t("ask_owner: refuses a missing channel list", !askOwner(s, { code: "O4", item: "PB01", question: "Should I use RM20.00?", channels: [] }).ok);
  const r = askOwner(s, { code: "O4", item: "PB01", question: "PB01 is listed at RM20.00 for the campaign, but your brief says RM18; should I use the listed RM20.00?", channels: ["whatsapp"] });
  t("ask_owner: O4 recorded, WhatsApp waiting_for_owner", r.ok && s.channels.whatsapp.status === "waiting_for_owner", r);
  t("ask_owner: O5 refused when no channel is at its cap", !askOwner(s, { code: "O5", item: "instagram", question: "Instagram failed; how should I proceed?", channels: ["instagram"] }).ok);
  s.channels.instagram.attempts = 3; s.channels.instagram.status = "written";
  t("ask_owner: O5 accepted at the cap, the channel failed", askOwner(s, { code: "O5", item: "instagram", question: "Instagram still fails after two corrections; may I deliver WhatsApp alone?", channels: ["instagram"] }).ok && s.channels.instagram.status === "failed");
}

// ---- writers' outputs, coverage, review, delivery
function campaign() {
  const s = newState();
  s.facts = extractFacts({ channels: ["whatsapp", "instagram"], skus: ["PB01"] }, "Prepare WhatsApp and Instagram for PB01 at RM20 during 26 to 30 October.");
  for (const c of ["whatsapp", "instagram"]) { s.channels[c].requested = true; s.channels[c].attempts = 1; }
  return s;
}
{
  const s = campaign();
  storeCopy(s, "whatsapp", { message: "x", claims: [] }); applyCheck(s, "whatsapp", { ok: true, errors: [] });
  const cov = coverage(s);
  t("C3: coverage check catches the channel with no output", !cov.ok && cov.missing.some((m) => m.channel === "instagram" && /did not call/.test(m.why)), cov);
  storeCopy(s, "instagram", { caption: "y", hashtags: [], claims: [] }); applyCheck(s, "instagram", { ok: false, errors: [{ clause: "price-list", detail: "RM18.00 matches no featured price" }] });
  t("C2: coverage refuses a channel with open check errors", !coverage(s).ok);
  applyCheck(s, "instagram", { ok: true, errors: [] });
  t("coverage passes when every requested channel is checked", coverage(s).ok);
  t("reviewer gets every requested channel", reviewSet(s).join() === "whatsapp,instagram");
  t("deliver: ready_for_approval refused before review", !deliver(s, { channels: [{ channel: "whatsapp", status: "ready_for_approval" }, { channel: "instagram", status: "ready_for_approval" }] }).ok);
  t("report_findings: refuses a review missing a channel", !reportFindings(s, ["whatsapp", "instagram"], { channels: [{ channel: "whatsapp", pass: true }] }).ok);
  t("report_findings: refuses a fail with no finding", !reportFindings(s, ["whatsapp", "instagram"], { channels: [{ channel: "whatsapp", pass: true }, { channel: "instagram", pass: false }] }).ok);
  const r = reportFindings(s, ["whatsapp", "instagram"], { channels: [{ channel: "whatsapp", pass: true }, { channel: "instagram", pass: false, findings: [{ fact_or_clause: "R1", problem: "no invitation to contact Kiddoz through WhatsApp" }] }] });
  t("C4: a finding fails only Instagram; WhatsApp reviewed", r.ok && s.channels.whatsapp.status === "reviewed" && s.channels.instagram.status === "written");
  t("C4: coverage holds the second review until Instagram is redone", !coverage(s).ok && /findings are open/.test(coverage(s).missing[0].why));
  storeCopy(s, "instagram", { caption: "z", hashtags: [], claims: [] }); applyCheck(s, "instagram", { ok: true, errors: [] });
  reportFindings(s, ["whatsapp", "instagram"], { channels: [{ channel: "whatsapp", pass: true }, { channel: "instagram", pass: true }] });
  t("the second review reads the current Instagram copy (version 2)", s.channels.instagram.reviewedVersion === 2);
  t("deliver: approved refused, only the owner approves", !deliver(s, { channels: [{ channel: "whatsapp", status: "approved" }, { channel: "instagram", status: "ready_for_approval" }] }).ok);
  t("deliver: a requested channel left out is refused", !deliver(s, { channels: [{ channel: "whatsapp", status: "ready_for_approval" }] }).ok);
  const d = deliver(s, { channels: [{ channel: "whatsapp", status: "ready_for_approval" }, { channel: "instagram", status: "ready_for_approval" }], summary: "Both ready." });
  t("deliver: both ready_for_approval after review", d.ok && s.channels.instagram.status === "ready_for_approval", d);
}
{
  const s = campaign();
  storeCopy(s, "whatsapp", { message: "x", claims: [] }); applyCheck(s, "whatsapp", { ok: true, errors: [] });
  storeCopy(s, "instagram", { caption: "y", hashtags: [], claims: [] }); applyCheck(s, "instagram", { ok: true, errors: [] });
  t("F7: with no completed review nothing can be ready_for_approval", truthfulStatus(s, "whatsapp") === "failed" && !deliver(s, { channels: [{ channel: "whatsapp", status: "ready_for_approval" }, { channel: "instagram", status: "ready_for_approval" }] }).ok);
  t("F7: delivering both as failed is accepted", deliver(s, { channels: [{ channel: "whatsapp", status: "failed" }, { channel: "instagram", status: "failed" }] }).ok);
}
{
  const s = campaign();
  storeCopy(s, "whatsapp", { message: "x", claims: [] }); applyCheck(s, "whatsapp", { ok: true, errors: [] });
  reportFindings(s, ["whatsapp"], { channels: [{ channel: "whatsapp", pass: true }] });
  const out = finalizeOnStop(s, "model-call cap reached");
  t("F8: at the model-call cap the open channel is failed and passed work is kept", out.instagram === "failed" && out.whatsapp === "ready_for_approval" && s.stopped === "model-call cap reached", out);
  t("F8: the cap is in the runner's defaults", s.caps.modelCalls > 0 && s.caps.attempts === 3 && s.caps.writers === 5);
}

{
  const s = campaign();
  for (const c of ["whatsapp", "instagram"]) { storeCopy(s, c, { x: 1, claims: [] }); applyCheck(s, c, { ok: true, errors: [] }); }
  reportFindings(s, ["whatsapp", "instagram"], { channels: [{ channel: "whatsapp", pass: true }, { channel: "instagram", pass: true }] });
  s.channels.instagram.status = "writing"; s.channels.instagram.attempts = 2;
  const cov = coverage(s);
  t("D3: coverage refuses the reviewer while a writer is still working, even with earlier copy", !cov.ok && cov.missing.some((m) => m.channel === "instagram" && /still working/.test(m.why)), cov);
}

// ---- the controlled test conditions
{
  const c2 = applyCondition({ kind: "wrong_price", channel: "instagram", attempts: [1] }, "instagram", 1, { caption: "Baju PB01 kini RM20.00 sahaja!", hashtags: [] });
  t("C2 condition: the first Instagram copy quotes RM18.00", /RM18\.00/.test(c2.caption) && !/RM20/.test(c2.caption));
  t("C2 condition: the retry is untouched", applyCondition({ kind: "wrong_price", channel: "instagram", attempts: [1] }, "instagram", 2, { caption: "RM20.00" }) === null);
  const c4 = applyCondition({ kind: "drop_whatsapp_cta", channel: "instagram", attempts: [1] }, "instagram", 1, { caption: "Hook\n\nWhatsApp kami di [No. WhatsApp]\n\nAkhir", hashtags: ["#a", "#WhatsAppKiddoz", "#b", "#c", "#d"], claims: [{ text: "Hubungi melalui WhatsApp", fact_id: "F-BUY" }] });
  t("C4 condition: the WhatsApp invitation is replaced by the shop visit", !/whatsapp/i.test(c4.caption) && c4.hashtags.length >= 5 && !c4.claims.length, c4);
}

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
