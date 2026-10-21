/* Hook and tool tests, without the agent (Step C data page, section 5; build step 10).
 *
 * H1: the 15 seeded answers, rewritten for 3C, through the pre-send check: 10 faulty blocked with the right
 *     check, 5 clean passed. H2 to H8: the access checks, the lock, the answer shape, the window edges.
 * Then a test per tool for each code it can return on the seeded records. No API key needed.
 *   node benchmark/test_hooks.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { presend } = require(path.join(ROOT, "lib/presend.js"));
const { createDesk, memoryStore } = require(path.join(ROOT, "tools.js"));
const F = require(path.join(ROOT, "lib/format.js"));

const tables = JSON.parse(fs.readFileSync(path.join(ROOT, "resources/policy_tables.json"), "utf8"));
const clauses = JSON.parse(fs.readFileSync(path.join(ROOT, "resources/clauses.json"), "utf8"));
const DATA = Object.fromEntries(fs.readdirSync(path.join(ROOT, "data")).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"))]));

let passed = 0, failed = 0;
const lines = [];
function check(name, cond, detail) {
  if (cond) passed++; else failed++;
  lines.push(`${cond ? "PASS" : "FAIL"}  ${name}${cond || !detail ? "" : `  -> ${detail}`}`);
}

// Stub runners: no model. A specialist "answers" with what the test hands it.
function desk(extra) {
  const store = memoryStore(Object.assign({}, DATA, extra || {}));
  let answer = null;
  const d = createDesk(store, tables, clauses, { now: tables.now,
    runSpecialist: async () => ({ answer }), runSynthesis: async (c) => ({ text: c.paragraphs.map((g) => g.points.map((p) => p.text).join(" ")).join("\n\n"), clauses: [] }) });
  const s = d.newSession();
  d.beginTurn(s, "test");
  return { d, s, store, setAnswer: (a) => { answer = a; } };
}

(async () => {
  // ---------------------------------------------------------------- H1
  const seeded = JSON.parse(fs.readFileSync(path.join(__dirname, "seeded_answers_3c.json"), "utf8")).seeded;
  let faultyBlocked = 0, cleanPassed = 0;
  for (const s of seeded) {
    const cited = [...s.text.matchAll(/\b(CS|FP|RP|FN|QP|MP)\d\b/g)].map((m) => m[0]);
    const r = presend(s.text, { facts: s.facts, clauses: cited, handovers: [], tables });
    if (s.expect) {
      const right = !r.pass && r.blocks.some((b) => b.check === s.expect);
      if (right) faultyBlocked++;
      check(`H1 ${s.id} (${s.fault}) blocked by ${s.expect}`, right, JSON.stringify(r.blocks));
    } else {
      if (r.pass) cleanPassed++;
      check(`H1 ${s.id} (clean) passed`, r.pass, JSON.stringify(r.blocks));
    }
  }
  check(`H1 summary: ${faultyBlocked} of 10 faulty blocked, ${cleanPassed} of 5 clean passed`, faultyBlocked === 10 && cleanPassed === 5);

  // ---------------------------------------------------------------- H2 to H7
  {
    const { d, s } = desk();
    let r = await d.call(s, "router", "verify_order", { order_id: "HM-100104", phone_last4: "9035" });
    check("verify_order HM-100104 with the right digits: ok", r.result.status === "ok" && s.verified === "HM-100104", JSON.stringify(r.result));
    r = await d.call(s, "returns", "request_return", { order_id: "HM-100104", line_id: "L9" });
    check("H2 a line ID from another order: item_not_in_order", r.result.error && r.result.error.code === "item_not_in_order", JSON.stringify(r.result));
    r = await d.call(s, "returns", "get_return_info", { order_id: "HM-100105" });
    check("H3 a lookup naming another order: order_not_verified", r.result.error && r.result.error.code === "order_not_verified", JSON.stringify(r.result));
    r = await d.call(s, "finance", "get_delivery_info", { order_id: "HM-100104" });
    check("H4 Finance calling get_delivery_info: tool_not_permitted", r.result.error && r.result.error.code === "tool_not_permitted", JSON.stringify(r.result));
    r = await d.call(s, "returns", "submit_answer", { status: "answered", points: [{ text: "Refunds take 5 to 7 working days.", clauses: ["FN1"] }] });
    check("H7 a specialist answer citing another department's clause: specialist_output_invalid", r.result.error && r.result.error.code === "specialist_output_invalid", JSON.stringify(r.result));
  }
  {
    const { d, s } = desk();
    const r = await d.call(s, "router", "ask_specialist", { department: "fulfilment", question: "Where is my order?" });
    check("H5 ask_specialist before verification: not_verified", r.result.error && r.result.error.code === "not_verified", JSON.stringify(r.result));
  }
  {
    const { d, s } = desk();
    let r;
    for (let i = 0; i < 3; i++) r = await d.call(s, "router", "verify_order", { order_id: "HM-100121", phone_last4: "0000" });
    check("3 failed attempts: verification_failed, no hint", r.result.error.code === "verification_failed" && !/exist|wrong digits|order id is/i.test(r.result.error.message), JSON.stringify(r.result));
    r = await d.call(s, "router", "verify_order", { order_id: "HM-100121", phone_last4: "6158" });
    check("H6 a fourth attempt after 3 failures: verification_locked", r.result.error && r.result.error.code === "verification_locked", JSON.stringify(r.result));
    r = await d.call(s, "router", "hand_to_staff", { reason: "verification_locked", contact_name: "Terrance Ngadan", summary: "x" });
    check("hand_to_staff to the wrong contact: handover_invalid", r.result.error && r.result.error.code === "handover_invalid", JSON.stringify(r.result));
    r = await d.call(s, "router", "hand_to_staff", { reason: "verification_locked", contact_name: "Nurul Aina Rahim", summary: "3 failed attempts" });
    check("hand_to_staff verification_locked to Nurul Aina Rahim: ok", r.result.status === "ok" && s.turn.handovers[0].name === "Nurul Aina Rahim", JSON.stringify(r.result));
  }
  {
    // H7 at the router: a specialist returns an answer citing another department's clause.
    const { d, s, setAnswer } = desk();
    await d.call(s, "router", "verify_order", { order_id: "HM-100107", phone_last4: "7710" });
    setAnswer({ status: "answered", points: [{ text: "Your return was approved.", clauses: ["RP1"] }] });
    const r = await d.call(s, "router", "ask_specialist", { department: "finance", question: "When do I get my money?" });
    check("H7 ask_specialist with an answer citing RP1 from Finance: specialist_output_invalid", r.result.error && r.result.error.code === "specialist_output_invalid", JSON.stringify(r.result));
  }

  // ---------------------------------------------------------------- H8: window edges
  {
    const NOW = tables.now;
    const mk = (id, deliveredAgoSec, sale) => ({ order_id: id, customer_id: "C-T", first_name: "Test", phone: "012-000 0000", order_time: NOW - 40 * 86400,
      lines: [{ line_id: "L1", product_id: "P-T", product: "Test Cable", variant: "1m", price: 2000, sale: !!sale }], order_total: 2000, delivery_fee: 500,
      status: "delivered", dispatch_time: NOW - 39 * 86400, delivery_time: NOW - deliveredAgoSec, delivery_address: "x" });
    const DAY = 86400, HR = 3600;
    const orders = DATA.orders.concat([
      mk("HM-900001", 14 * DAY), mk("HM-900002", 15 * DAY),            // RP1: day 14 in, day 15 out (calendar days, 10:00 to 10:00)
      mk("HM-900003", 48 * HR), mk("HM-900004", 48 * HR + 60),         // QP1: 48 hours to the minute
      mk("HM-900005", 30 * DAY), mk("HM-900006", 31 * DAY),            // QP2: day 30 in, day 31 out
    ]);
    const run = async (id, agent, tool, input) => {
      const { d, s } = desk({ orders });
      s.verified = id; s.first_name = "Test";
      return (await d.call(s, agent, tool, Object.assign({ order_id: id, line_id: "L1" }, input || {}))).result;
    };
    check("H8 return at exactly 14 days: allowed", (await run("HM-900001", "returns", "request_return")).status === "ok");
    check("H8 return at 15 days: return_window_passed", (await run("HM-900002", "returns", "request_return")).error.code === "return_window_passed");
    check("H8 damage report at exactly 48 hours: allowed", (await run("HM-900003", "claims", "file_damage_report", { kind: "damaged" })).status === "ok");
    check("H8 damage report at 48 hours and 1 minute: report_window_passed", (await run("HM-900004", "claims", "file_damage_report", { kind: "damaged" })).error.code === "report_window_passed");
    check("H8 warranty at exactly 30 days: allowed", (await run("HM-900005", "claims", "file_warranty_claim")).status === "ok");
    check("H8 warranty at 31 days: warranty_expired", (await run("HM-900006", "claims", "file_warranty_claim")).error.code === "warranty_expired");
    const { d } = desk();
    const camp = Date.parse("2026-10-25T12:00:00+08:00") / 1000, ord = Date.parse("2026-10-20T12:00:00+08:00") / 1000;
    check("H8 RM50.00 on a campaign day: RM5 due (MP3)", d.rules.feeRule(camp, 5000).fee_due === 500);
    check("H8 RM50.01 on a campaign day: free (MP3)", d.rules.feeRule(camp, 5001).fee_due === 0);
    check("H8 RM100.00 on an ordinary day: RM5 due (MP1)", d.rules.feeRule(ord, 10000).fee_due === 500);
    check("H8 RM100.01 on an ordinary day: free (MP1)", d.rules.feeRule(ord, 10001).fee_due === 0);
    check("H8 RM60.00 on 10 Oct (campaign): free (MP3)", d.rules.feeRule(Date.parse("2026-10-10T09:15:00+08:00") / 1000, 6000).fee_due === 0);
  }

  // ---------------------------------------------------------------- per tool, on the seeded records
  {
    const t = async (id, last4, agent, tool, input) => {
      const { d, s } = desk();
      const v = await d.call(s, "router", "verify_order", { order_id: id, phone_last4: last4 });
      if (v.result.status !== "ok") return v.result;
      return (await d.call(s, agent, tool, Object.assign({ order_id: id }, input || {}))).result;
    };
    let r = await t("HM-100101", "4417", "fulfilment", "get_delivery_info");
    check("case 1: delivery window Wed 28 Oct to Fri 30 Oct (26 Oct is a Selangor holiday)", r.data && r.data.delivery_window === "Wed 28 Oct 2026 to Fri 30 Oct 2026", JSON.stringify(r.data));
    r = await t("HM-100102", "2081", "fulfilment", "request_address_change", { new_address: "No. 8, Jalan Damai 3, 40000 Shah Alam" });
    check("case 2: address change before dispatch: pending", r.status === "ok" && r.data.status === "pending", JSON.stringify(r));
    r = await t("HM-100103", "6623", "fulfilment", "request_cancellation");
    check("case 3: cancellation before dispatch: pending", r.status === "ok", JSON.stringify(r));
    r = await t("HM-100124", "4470", "fulfilment", "request_address_change", { new_address: "x" });
    check("case 24: address change after dispatch: after_dispatch, answered with FP3, no handover", r.error && r.error.code === "after_dispatch" && r.error.clause === "FP3" && /cannot be changed/.test(r.next_step) && !/policy_not_clear/.test(r.next_step), JSON.stringify(r));
    r = await t("HM-100104", "9035", "returns", "request_return", { line_id: "L1" });
    check("case 4: return after 17 days: return_window_passed", r.error && r.error.code === "return_window_passed", JSON.stringify(r));
    r = await t("HM-100105", "5512", "returns", "request_return", { line_id: "L1" });
    check("case 5: sale item within 14 days: sale_item", r.error && r.error.code === "sale_item", JSON.stringify(r));
    r = await t("HM-100107", "7710", "finance", "get_refund_status");
    check("case 7: refund approved, not yet paid", r.data && r.data.state === "approved, not yet paid", JSON.stringify(r.data));
    r = await t("HM-100108", "8846", "finance", "get_refund_status");
    check("case 8: refund paid, RM 129.00, Tue 20 Oct", r.data && r.data.state === "paid" && r.data.amount === "RM 129.00" && /Tue 20 Oct/.test(r.data.paid_date), JSON.stringify(r.data));
    r = await t("HM-100109", "1907", "finance", "get_refund_status");
    check("case 9: refund awaiting approval", r.data && r.data.state === "awaiting approval", JSON.stringify(r.data));
    r = await t("HM-100110", "4452", "claims", "file_damage_report", { line_id: "L1", kind: "damaged" });
    check("case 10: damage report at 19 hours: pending", r.status === "ok", JSON.stringify(r));
    r = await t("HM-100111", "3069", "claims", "file_warranty_claim", { line_id: "L1" });
    check("case 11: warranty claim at 21 days: pending", r.status === "ok", JSON.stringify(r));
    r = await t("HM-100112", "8820", "claims", "file_damage_report", { line_id: "L1", kind: "damaged" });
    check("case 12: damage report at 68 hours: report_window_passed", r.error && r.error.code === "report_window_passed", JSON.stringify(r));
    for (const [c, id, l4, due, camp] of [[13, "HM-100113", "5571", "RM 0.00", true], [14, "HM-100114", "6634", "RM 0.00", false], [15, "HM-100115", "0947", "RM 5.00", true], [16, "HM-100116", "3381", "RM 5.00", false]]) {
      r = await t(id, l4, "marketing", "get_order_value");
      check(`case ${c}: fee due ${due}, campaign ${camp}`, r.data && r.data.fee_due === due && (r.data.campaign_day !== "no") === camp, JSON.stringify(r.data));
    }
    r = await t("HM-100121", "1234", "router", "verify_order");
    check("case 21: wrong digits on a real order: verification_failed", r.error && r.error.code === "verification_failed", JSON.stringify(r));
  }
  {
    // Lookup fault (case 22) and the field set.
    const store = memoryStore(DATA);
    const d = createDesk(store, tables, clauses, { now: tables.now, faults: { get_delivery_info: 2 }, runSpecialist: async () => ({}), runSynthesis: async () => ({}) });
    const s = d.newSession(); d.beginTurn(s, "t");
    await d.call(s, "router", "verify_order", { order_id: "HM-100122", phone_last4: "9934" });
    const a = await d.call(s, "fulfilment", "get_delivery_info", { order_id: "HM-100122" });
    const b = await d.call(s, "fulfilment", "get_delivery_info", { order_id: "HM-100122" });
    check("case 22: the lookup times out twice: lookup_timeout, retryable", a.result.error.code === "lookup_timeout" && a.result.error.isRetryable && b.result.error.code === "lookup_timeout");
    const c = await d.call(s, "fulfilment", "get_delivery_info", { order_id: "HM-100122" });
    check("field set: get_delivery_info returns only Fulfilment's fields", Object.keys(c.result.data).every((k) => tables.field_sets.get_delivery_info.includes(k)) && !("phone" in c.result.data), JSON.stringify(c.result.data));
  }
  {
    // Two teams both hand back (policy_not_clear): each handover goes to its own team's contact; any other contact is refused.
    const store = memoryStore(DATA);
    const answers = { returns: { status: "handover", points: [{ text: "RP5 is silent.", clauses: ["RP5"] }], handover: { reason: "policy_not_clear" } },
      finance: { status: "handover", points: [{ text: "FN1 is silent.", clauses: ["FN1"] }], handover: { reason: "policy_not_clear" } } };
    const d = createDesk(store, tables, clauses, { now: tables.now, runSpecialist: async (dept) => ({ answer: answers[dept] }), runSynthesis: async () => ({ text: "", clauses: [] }) });
    const s = d.newSession(); d.beginTurn(s, "t");
    await d.call(s, "router", "verify_order", { order_id: "HM-100126", phone_last4: "6612" });
    await d.call(s, "router", "ask_specialist", { department: "returns", question: "q" });
    await d.call(s, "router", "ask_specialist", { department: "finance", question: "q" });
    const a = await d.call(s, "router", "hand_to_staff", { reason: "policy_not_clear", contact_name: "Siti Hajar Kamal", summary: "x" });
    const b = await d.call(s, "router", "hand_to_staff", { reason: "policy_not_clear", contact_name: "Priya Ramasamy", summary: "x" });
    const c = await d.call(s, "router", "hand_to_staff", { reason: "policy_not_clear", contact_name: "Faizal Hamid", summary: "x" });
    check("two teams hand back: each to its own contact, any other contact refused", a.result.status === "ok" && b.result.status === "ok" && c.result.error && c.result.error.code === "handover_invalid");
  }
  {
    // compose_reply and send_reply: a clause not cited this turn; a reply blocked twice goes out as the holding reply.
    const { d, s } = desk();
    await d.call(s, "router", "verify_order", { order_id: "HM-100110", phone_last4: "4452" });
    let r = await d.call(s, "router", "compose_reply", { points: [{ text: "Please send photos.", clauses: ["QP1"] }] });
    check("compose_reply with a clause no specialist cited: content_unsupported", r.result.error && r.result.error.code === "content_unsupported", JSON.stringify(r.result));
    r = await d.call(s, "router", "send_reply", { text: "Please send photos of the damage." });
    check("send_reply with photos: reply_blocked", r.result.error && r.result.error.code === "reply_blocked" && r.result.status === "refused");
    r = await d.call(s, "router", "send_reply", { text: "Please send a video of the damage." });
    check("second block: holding reply sent, handed to Nurul Aina Rahim", r.result.status === "handover" && s.turn.holding && /Nurul Aina Rahim, our customer service manager/.test(s.turn.reply), s.turn.reply);
  }

  {
    // The writer's send-back checks: he or she, and I, me or my (Happy Mart writes as we). Word boundaries must hold.
    const A = require(path.join(ROOT, "agent.js"));
    check("writer check: he or she found, inside a word not", A.PRONOUN.test("She will review it") && !A.PRONOUN.test("there is the order"));
    check("writer check: I, me or my found, we and words like Item not", A.FIRST_PERSON.test("I have prepared it") && A.FIRST_PERSON.test("my order") && !A.FIRST_PERSON.test("We have prepared the Item"));
  }
  console.log(lines.join("\n"));
  console.log(`\n${passed} passed, ${failed} failed`);
  fs.writeFileSync(path.join(__dirname, "hook_tests.txt"), lines.join("\n") + `\n\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
