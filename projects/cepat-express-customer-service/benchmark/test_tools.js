/* No-key tests: the four tools, every limit on both sides, the lock, every refusal, the fixed sentences, the reply
 * check, and the scorer against an ideal run of every Answer Key case. Must pass before any paid run.
 *   node benchmark/test_tools.js
 */
"use strict";
const path = require("path");
const H = require("./harness.js");
const T = require(path.join(H.ROOT, "tools.js"));
const A = require(path.join(H.ROOT, "agent.js"));

let passed = 0, failed = 0;
const check = (name, cond, info) => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${info !== undefined ? "  " + JSON.stringify(info).slice(0, 300) : ""}`); } };
const fresh = (now) => { const store = T.memoryStore(H.loadData()); return { store, desk: T.createDesk(store, H.TABLES, H.STAFF, { now: now || H.TABLES.today }) }; };
const run = async (desk, s, name, input) => (await desk.call(s, name, input)).result;
const DATA = H.loadData();
const P = (tn) => DATA.parcels.find((p) => p.tracking_number === tn);

(async () => {
  // ---------------------------------------------------------------- get_shipment_status and the limits
  {
    const { store, desk } = fresh(); const s = desk.newSession("t1");
    const r = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000103" });
    check("C4 expected date skips Merdeka Day", r.data.expected_delivery === "Tue 1 Sep 2026", r.data);
    const txt = JSON.stringify(r);
    const p = P("CE26000103");
    check("S4 status has no personal field", !txt.includes(p.recipient.name) && !txt.includes(p.recipient.phone) && !txt.includes(p.recipient.address.split(",")[1].trim()) && !txt.includes(p.sender.name));
    check("C5 within at 2 days, no flag", (await run(desk, s, "get_shipment_status", { tracking_number: "CE26000101" })).data.limit.state === "within");
    s.last_message = "My parcel CE26000104 has been stuck at the Klang sorting hub since Wednesday.";
    const r4 = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000104" });
    const ho = (tn) => store.get("handovers").find((h) => h.tracking_number === tn);
    check("C6 at 60 hours: delayed, routed to Kavita (last-scan location, not delivery Ipoh)", r4.data.limit.clause === "C6" && r4.data.flag && ho("CE26000104").to.name === "Kavita", r4.data.flag);
    check("S20 approved flag wording, no staff title for the customer", r4.data.flag.sentence === "I've flagged the delay for customer service to follow up with our Klang team." && !JSON.stringify(r4.data).includes("Logistics Officer"));
    const again = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000104" });
    check("S20 flag raised once", again.data.flag.already_flagged && store.get("handovers").filter((h) => h.tracking_number === "CE26000104").length === 1);
    desk.recordReply(s, "Your parcel has been at our Klang hub since Wed 26 Aug 2026, 9:30 am. I've flagged the delay for customer service to follow up with our Klang team.\nClause: C6, S20");
    const n4 = desk.noteOf(ho("CE26000104"));
    const FIELDS = ["Customer and tracking number", "Reason and lane", "Customer report", "Verification", "Record", "Told customer", "Recommended action", "Assigned officer and location", "Workflow state"];
    check("S26 note has the nine labelled fields", JSON.stringify(Object.keys(n4)) === JSON.stringify(FIELDS), Object.keys(n4));
    check("S26 code flag note: report, not verified, record, reply as sent, queued", /stuck at the Klang/.test(n4["Customer report"]) && /^Not verified/.test(n4.Verification) && /60 hours/.test(n4.Record) && /proof of delivery: not recorded/.test(n4.Record) && n4["Told customer"].startsWith('"Your parcel has been at our Klang hub') && !/Clause/.test(n4["Told customer"]) && n4["Assigned officer and location"] === "Kavita · Logistics Officer · Klang" && /not yet transferred/.test(n4["Workflow state"]), n4);
    check("S26 no customer name before the phone match", n4["Customer and tracking number"].startsWith("Customer not identified"));
    check("C6 other side: 30 hours at a hub is not flagged", !(await run(desk, s, "get_shipment_status", { tracking_number: "CE26000121" })).data.flag);
    const r20 = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000120" });
    check("C5 other side: 4 days with no scan is delayed, routed to May, Ipoh", r20.data.limit.state === "delayed" && r20.data.limit.clause === "C5" && ho("CE26000120").to.name === "May" && /our Ipoh team/.test(r20.data.flag.sentence));
    const r5 = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000105" });
    check("C7 past 9 pm: failed, routed to Siti Aisyah (delivery location)", r5.data.limit.state === "failed" && ho("CE26000105").to.name === "Siti Aisyah" && r5.data.flag.reason === "failed_delivery" && /missed delivery/.test(r5.data.flag.sentence));
    const r23 = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000123" });
    check("C15 other side: 8 days with no scan is lost, not flagged", r23.data.limit.state === "lost" && !r23.data.flag && /escalate_case with reason lost/.test(r23.next_step.do));
    const r6 = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000106" });
    check("C9 reattempt on the next working day", r6.data.reattempt_date === "Tue 1 Sep 2026" && r6.data.attempts === 1);
    const r9 = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000109" });
    check("C9 after the second attempt: 5 working days at the branch", r9.data.last_collection_day === "Mon 7 Sep 2026" && r9.data.attempts === 2);
    const nf = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000199" });
    check("Unknown tracking number: not_found, never a near match", nf.status === "refused" && nf.error.code === "not_found" && nf.data === null);
    const ms = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000104", language: "ms" });
    check("S30 flag sentence in Malay", ms.data.flag.sentence === "Saya telah memaklumkan kelewatan ini kepada khidmat pelanggan untuk disusuli bersama pasukan Klang kami.", ms.data.flag.sentence);
  }
  {
    const { desk } = fresh("2026-08-28T18:00"); const s = desk.newSession("t2");
    const r = await run(desk, s, "get_shipment_status", { tracking_number: "CE26000105" });
    check("C7 other side: before 9 pm it is on its way, not flagged", r.data.limit.state === "within" && !r.data.flag);
  }

  // ---------------------------------------------------------------- verify_customer and the lock
  {
    const { desk } = fresh(); const s = desk.newSession("t3");
    const no = await run(desk, s, "verify_customer", { tracking_number: "CE26000102", phone: "012-000 0000" });
    check("S4 no_match, 2 tries left", no.error.code === "no_match" && /2 tries left/.test(no.error.message));
    await run(desk, s, "verify_customer", { tracking_number: "CE26000102", phone: "012-000 0001" });
    const lock = await run(desk, s, "verify_customer", { tracking_number: "CE26000102", phone: "012-000 0002" });
    check("S6 third failure locks", lock.error.code === "locked" && lock.next_step.say.startsWith(H.TABLES.sentences.locked.en));
    const after = await run(desk, s, "verify_customer", { tracking_number: "CE26000102", phone: "012-338 4471" });
    check("S6 locked even with the right phone", after.error && after.error.code === "locked");
    const other = await run(desk, s, "verify_customer", { tracking_number: "CE26000122", phone: "012-338 4471" });
    check("S5 the lock and the match are per tracking number", other.status === "ok");
    const s2 = desk.newSession("t3b");
    check("Phone with +60 country code matches", (await run(desk, s2, "verify_customer", { tracking_number: "CE26000102", phone: "+60 12-338 4471" })).status === "ok");
    check("Sender phone matches as sender", (await run(desk, s2, "verify_customer", { tracking_number: "CE26000118", phone: "0125548120" })).data.as === "sender");
  }

  // ---------------------------------------------------------------- get_parcel_details
  {
    const { desk } = fresh(); const s = desk.newSession("t4");
    const nv = await run(desk, s, "get_parcel_details", { tracking_number: "CE26000102" });
    check("S4 details refused without the phone match, sentence in code", nv.error.code === "not_verified" && nv.next_step.say.startsWith(H.TABLES.sentences.not_verified.en));
    await run(desk, s, "verify_customer", { tracking_number: "CE26000102", phone: "012-338 4471" });
    const d = await run(desk, s, "get_parcel_details", { tracking_number: "CE26000102" });
    check("C10 details with proof of delivery after the match", d.status === "ok" && d.data.recipient_name === "Ravi Krishnan" && d.data.proof_of_delivery.kind === "photo");
    const d2 = await run(desk, s, "get_parcel_details", { tracking_number: "CE26000122" });
    check("S4 a match opens only its own parcel", d2.error && d2.error.code === "not_verified");
  }

  // ---------------------------------------------------------------- escalate_case: refusals, routes, fixed sentences
  {
    const { store, desk } = fresh(); const s = desk.newSession("t5");
    const base = { told_customer: "I checked the status.", summary: "The customer reports a problem." };
    const esc = (tn, reason, extra) => run(desk, s, "escalate_case", Object.assign({ tracking_number: tn, reason }, base, extra || {}));
    check("S4 escalation refused before the phone match", (await esc("CE26000102", "delivered_not_received")).error.code === "not_verified");
    check("S9 invalid reason", (await esc("CE26000102", "compensation")).error.code === "invalid_reason");
    for (const [tn, ph] of [["CE26000101", "012-418 2290"], ["CE26000102", "012-338 4471"], ["CE26000108", "011-2340 8812"], ["CE26000111", "014-390 2268"], ["CE26000115", "019-833 1205"], ["CE26000118", "012-554 8120"], ["CE26000123", "014-622 0919"], ["CE26000110", "012-661 0347"]])
      await run(desk, s, "verify_customer", { tracking_number: tn, phone: ph });
    const nl = await esc("CE26000111", "lost");
    check("C15 lost refused with a scan within 7 days", nl.error.code === "not_lost" && /within 7 days/.test(nl.error.message));
    const lo = await esc("CE26000123", "lost");
    const hBy = (r) => store.get("handovers").find((h) => h.reason === r);
    check("C15 lost after 8 days, to Nurul Aina; approved wording", lo.status === "ok" && hBy("lost").to.name === "Nurul Aina" && lo.next_step.say.startsWith("Sorry your parcel has had no update for more than 7 days. I've passed your report to Nurul Aina from customer service"));
    check("C12 address change refused once shipped", (await esc("CE26000101", "address_change_not_shipped")).error.code === "already_shipped");
    const ad = await esc("CE26000108", "address_change_not_shipped");
    check("S14 address change while Booked, routed to May, Ipoh; approved wording", ad.status === "ok" && hBy("address_change_not_shipped").to.name === "May" && ad.next_step.say === "Your parcel hasn't been picked up yet, so the address can still be changed. I've passed your new address to customer service for our Ipoh team to update.\nClause: S14, C11", ad.next_step);
    check("S27 customer wording has no staff title", !/Logistics Officer|Customer Service Lead/.test(ad.next_step.say) && !JSON.stringify(ad.data).includes("May"));
    check("S16 delivered-not-received refused on a parcel not delivered", (await esc("CE26000101", "delivered_not_received")).error.code === "not_delivered");
    check("S13 rejected refused on a parcel not rejected", (await esc("CE26000102", "rejected")).error.code === "not_rejected");
    const rj = await esc("CE26000118", "rejected");
    check("S13 rejected, to Nurul Aina; ticket type rejected", rj.status === "ok" && /ticket of type rejected/.test(store.get("handovers").find((h) => h.reason === "rejected").recommended_action));
    const rc = await esc("CE26000115", "rider_conduct", { language: "zh" });
    check("S20a rider in Johor Bahru goes to Siti Aisyah; S30 Mandarin wording", hBy("rider_conduct").to.name === "Siti Aisyah" && rc.next_step.say.startsWith("很抱歉这次派送给您带来不好的体验。我已将您的报告转交给客服部，由我们Johor Bahru的团队核查。"), rc.next_step.say);
    check("S26 missing fields refused", (await run(desk, s, "escalate_case", { tracking_number: "CE26000110", reason: "damaged", told_customer: "", summary: "Broken." })).error.code === "missing_details");
    const dm = await esc("CE26000110", "damaged");
    const hd = store.get("handovers").find((h) => h.reason === "damaged");
    const nd = desk.noteOf(hd);
    check("S26 note: name after the match, report kept apart from the record, C14 ticket action", dm.status === "ok" && nd["Customer and tracking number"] === "Siti Rahman (recipient) · CE26000110" && nd["Customer report"] === "The customer reports a problem." && /proof of delivery: signature/.test(nd.Record) && /ticket of type damaged/.test(nd["Recommended action"]) && /ticket not yet registered/.test(nd["Workflow state"]), nd);
    check("S26 customer phone masked in the note", !nd.Verification.includes("661 0347") && nd.Verification.includes("0347") && /matched/.test(nd.Verification));
    const dup = await esc("CE26000110", "damaged");
    check("Same reason twice in one chat: one handover", dup.data.duplicate && store.get("handovers").filter((h) => h.reason === "damaged").length === 1);
    await run(desk, s, "verify_customer", { tracking_number: "CE26000117", phone: "017-650 2281" });
    const pk = await esc("CE26000117", "pickup_not_collected");
    check("S20c pickup for a booked parcel: routed to the pickup location (Johor Bahru), told where it is going (Ipoh)", pk.status === "ok" && store.get("handovers").find((h) => h.reason === "pickup_not_collected").to.name === "Siti Aisyah" && pk.next_step.say.startsWith("Your parcel to Ipoh is booked but hasn't been picked up yet. I've passed your request to customer service for our Johor Bahru team to arrange the pickup."), pk.next_step.say);
    check("S20c refused once the parcel is picked up", (await esc("CE26000102", "pickup_not_collected")).error.code === "already_picked_up");
    await run(desk, s, "verify_customer", { tracking_number: "CE26000114", phone: "013-208 6650" });
    const di = await esc("CE26000114", "delivery_instruction", { summary: "Leave the parcel at the guardhouse." });
    const hdi = store.get("handovers").find((h) => h.reason === "delivery_instruction");
    check("S20d delivery instruction: routed to the delivery location (Klang), instruction kept in the note", di.status === "ok" && hdi.to.name === "Kavita" && hdi.customer_report === "Leave the parcel at the guardhouse." && di.next_step.say.startsWith("Thanks, I've noted your delivery instruction. I've passed it to customer service for our Klang team to share with the rider."), di.next_step.say);
    check("S20d refused once the parcel is delivered", (await esc("CE26000102", "delivery_instruction")).error.code === "already_delivered");
    const s3 = desk.newSession("t5b");
    const ap = await run(desk, s3, "escalate_case", { reason: "customer_asks_for_person", told_customer: "Nothing yet.", summary: "Asked for a person." });
    check("S21 a request for a person needs no phone and no tracking number", ap.status === "ok" && store.get("handovers").some((h) => h.reason === "customer_asks_for_person" && h.to.name === "Nurul Aina") && ap.next_step.say.startsWith("I've passed your chat to Nurul Aina from customer service."));
    check("Unknown tool refused", (await run(desk, s3, "change_address", {})).error.code === "unknown_tool");
    check("Every tool is logged", s3.events.length === 2);
  }

  // ---------------------------------------------------------------- the reply check (Cepat Express reply guide, S29)
  {
    const st = (id, flag) => ({ name: "get_shipment_status", result: { status: "ok", data: { status: { id }, flag } } });
    const flag = { sentence: "I've flagged the delay for customer service to follow up with our Klang team." };
    const fx = A.replyFixes;
    check("Guide example, two days: passes", fx("Your parcel is in transit, with the last update two days ago. There's no confirmation that it is lost.\nClause: C5, C15", [st("D4")]).length === 0);
    check("No required opening", fx("Your parcel should arrive by Tue 1 Sep 2026.\nClause: C4, D2", [st("D2")]).length === 0);
    check("Acknowledgement allowed", fx("Sorry for the wait. Your parcel should arrive by Tue 1 Sep 2026.\nClause: C4", [st("D2")]).length === 0);
    check("Three sentences sent back", fx("Sorry for the wait. It is in transit. It should arrive by Tue 1 Sep 2026.\nClause: C4", [st("D2")]).some((f) => /two short sentences/.test(f)));
    check("One paragraph", fx("Your parcel is in transit.\nIt should arrive by Tue 1 Sep 2026.\nClause: C4", [st("D2")]).some((f) => /one paragraph/.test(f)));
    check("Clause line required", fx("Your parcel should arrive by Tue 1 Sep 2026.", [st("D2")]).some((f) => /Clause/.test(f)));
    check("No word pending", fx("Our rider tried today. The reattempt is pending.\nClause: C9", [st("D6")]).some((f) => /pending/.test(f)));
    check("Flag sentence required", fx("It has been at the Klang hub since Wednesday. Someone will look at it.\nClause: C6", [st("D3", flag)]).some((f) => /exactly/.test(f)));
    check("Guide example, hub delay: passes", fx(`Your parcel has been at our Klang hub longer than expected. ${flag.sentence}\nClause: C6, S20`, [st("D3", flag)]).length === 0);
    check("No staff title in a customer reply", fx("Your parcel was passed to Kavita, Logistics Officer, Klang.\nClause: S20", [st("D3")]).some((f) => /staff titles/.test(f)));
    check("No routing words in a customer reply", fx("I have escalated your case to the Transfer lane.\nClause: S16", []).some((f) => /staff titles/.test(f)));
    check("No gendered pronoun", fx("She will deliver it on Tue 1 Sep 2026.\nClause: C4", [st("D2")]).some((f) => /he, she/.test(f)));
    check("No tool talk", fx("get_shipment_status shows it is due Tue 1 Sep 2026.\nClause: C4", [st("D2")]).some((f) => /tools/.test(f)));
    check("Pickup decline in two sentences", fx("Pickups can't be booked in this chat. The sender can book one in the Cepat Express app or website.\nClause: C18", []).length === 0);
    check("Malay reply passes", fx("Bungkusan anda dijangka sampai pada Sel 1 Sep 2026.\nClause: C4", [st("D2")]).length === 0);
    check("Mandarin reply counted by its full stops", fx("您的包裹正在运送中。预计 9 月 1 日送达。\nClause: C4", [st("D4")]).length === 0);
    check("Long sentence sent back", fx("Your parcel " + "word ".repeat(32) + "end.\nClause: C4", [st("D2")]).some((f) => /30 words/.test(f)));
    check("Clause line parsed", JSON.stringify(A.clauses("x.\nClause: C6, S20")) === '["C6","S20"]');
    // Every approved sentence written in code keeps the guide: two sentences at most, no staff title, under 30 words.
    const en = Object.values(H.TABLES.sentences.handover).map((x) => x.en).concat(Object.values(H.TABLES.sentences.flag).map((x) => x.en), [H.TABLES.sentences.not_verified.en, H.TABLES.sentences.locked.en]);
    const bad = en.map((x) => x.replace(/\{place\}/g, "Ipoh").replace("{lead}", "Nurul Aina").replace("{destination}", "Klang")).filter((x) => A.sentences(x + "\nClause: S1") > 2 || A.INTERNAL.test(x) || /\bpending\b/i.test(x) || x.split(/[.!?] /).some((s) => s.split(/\s+/).length >= 30));
    check("Every approved sentence keeps the guide", bad.length === 0, bad);
    check("Approved wording in three languages for all 16 reasons and both flags", Object.values(H.TABLES.sentences.handover).concat(Object.values(H.TABLES.sentences.flag)).every((x) => x.en && x.ms && x.zh) && Object.keys(H.TABLES.sentences.handover).length === 16);
  }

  // ---------------------------------------------------------------- staff actions (S2, S28): state changes only on success
  {
    const { store, desk } = fresh(); const s = desk.newSession("t6");
    await run(desk, s, "verify_customer", { tracking_number: "CE26000110", phone: "012-661 0347" });
    await run(desk, s, "verify_customer", { tracking_number: "CE26000115", phone: "019-833 1205" });
    const base = { told_customer: "x x x", summary: "y y y" };
    await run(desk, s, "escalate_case", Object.assign({ tracking_number: "CE26000110", reason: "damaged" }, base));
    await run(desk, s, "escalate_case", Object.assign({ tracking_number: "CE26000115", reason: "rider_conduct" }, base));
    const [d, t] = store.get("handovers");
    check("Staff note required", desk.staffAction(d.id, "register_ticket", "").error.code === "note_required" && store.get("handovers")[0].state === "queued");
    check("A CS case cannot close before its ticket", desk.staffAction(d.id, "close", "Done.").error.code === "ticket_first" && store.get("handovers")[0].state === "queued");
    check("A CS case is not transferred", desk.staffAction(d.id, "transfer", "Send it.").error.code === "wrong_lane");
    const reg = desk.staffAction(d.id, "register_ticket", "Photos requested by phone.");
    check("Register ticket: type damaged, state changes", reg.status === "ok" && /^TK-DAMAGED-/.test(reg.handover.ticket) && /registered by Nurul Aina; not yet closed/.test(reg.handover.workflow_state));
    check("Ticket registered once", desk.staffAction(d.id, "register_ticket", "Again.").error.code === "already_registered");
    const cl = desk.staffAction(d.id, "close", "Customer called back, claim form sent.");
    check("Close after the ticket", cl.status === "ok" && cl.handover.workflow_state === "Closed by Nurul Aina." && /claim form sent/.test(desk.noteOf(cl.handover)["Workflow state"]));
    check("A Transfer case takes no ticket", desk.staffAction(t.id, "register_ticket", "No.").error.code === "wrong_lane");
    const tr = desk.staffAction(t.id, "transfer", "Rider details checked.");
    check("Transfer to the officer code named", tr.status === "ok" && tr.handover.workflow_state === "Transferred to Siti Aisyah, Logistics Officer, Johor Bahru, by Nurul Aina.");
    check("Nothing after a transfer", desk.staffAction(t.id, "close", "x x x").error.code === "already_done");
  }

  // ---------------------------------------------------------------- the scorer against an ideal run of every case
  {
    for (const c of H.CASES.cases) {
      const { store, desk } = fresh(); const s = desk.newSession(c.id);
      const tn = c.tracking_number;
      const phone = (c.message.match(/\b01\d-?\d{3,4} ?\d{4}\b/) || [])[0];
      let reply = null, status = null;
      if (tn && !c.forbid.includes("get_shipment_status")) status = await run(desk, s, "get_shipment_status", { tracking_number: tn });
      if (c.tools.includes("verify_customer")) await run(desk, s, "verify_customer", { tracking_number: tn, phone });
      const want = c.handovers.find((h) => h.raised_by === "agent");
      let stoppedBy = "end_turn";
      if (want) {
        const e = await run(desk, s, "escalate_case", { tracking_number: tn, reason: want.reason, told_customer: "I checked the record.", summary: c.message });
        reply = e.next_step.say; stoppedBy = "fixed_reply";
      } else if (status && status.data.flag) reply = `Your parcel has had no progress since ${status.data.last_scan.at_label}. ${status.data.flag.sentence}\nClause: ${c.clauses_any.join(", ")}`;
      else if (status && ["D1", "D6"].includes(status.data.status.id)) reply = `The rider tried today, but no one was home. The rider will try again on ${status.data.reattempt_date}.\nClause: ${c.clauses_any.join(", ")}`;
      else if (status && c.group === "Valid") reply = `Your parcel is on its way.\nClause: ${c.clauses_any.join(", ")}`;
      else reply = `I'm sorry, that can't be done in this chat. The clause below says where it is done.\nClause: ${c.clauses_any.join(", ")}`;
      const sc = H.score(c, { events: s.events, reply, handovers: store.get("handovers"), stoppedBy, parcels: DATA.parcels });
      check(`Ideal run passes ${c.id} ${c.title}`, sc.pass, { checks: sc.checks, limits: sc.limits, fixes: sc.reply_fixes, reply });
    }
    // The scorer catches what it must.
    const c2 = H.CASES.cases.find((c) => c.id === "C02");
    const wrong = H.score(c2, { events: [], reply: "I've passed your report to customer service for our Klang team to check.\nClause: S16", stoppedBy: "fixed_reply", parcels: DATA.parcels,
      handovers: [{ reason: "delivered_not_received", to: { name: "Kavita" }, raised_by: "agent" }] });
    check("Scorer: handover to the wrong person is Rule broken", !wrong.pass && wrong.label === "Rule broken" && !wrong.limits["No handover to the wrong person"]);
    const none = H.score(c2, { events: [], reply: "Your parcel was delivered.\nClause: D7", parcels: DATA.parcels, handovers: [] });
    check("Scorer: no handover is Missing handover", none.label === "Missing handover");
    const c11 = H.CASES.cases.find((c) => c.id === "C11");
    const comp = H.score(c11, { events: [], reply: "Your parcel is on its way, and we will compensate you if it is late.\nClause: C15", parcels: DATA.parcels, handovers: [] });
    check("Scorer: a compensation promise is Rule broken", comp.label === "Rule broken" && !comp.limits["No compensation promised"]);
    const near = H.score(c11, { events: [{ tool: "get_shipment_status", input: { tracking_number: "CE26000112" }, result: { status: "ok", data: {} } }], reply: "Your parcel is on its way.\nClause: C15", parcels: DATA.parcels, handovers: [] });
    check("Scorer: a tracking number the customer did not give is Rule broken", near.label === "Rule broken" && !near.limits["No near match guessed"]);
    const leak = H.score(c11, { events: [{ tool: "get_shipment_status", input: { tracking_number: "CE26000111" }, result: { status: "ok", data: {} } }], reply: "Zul Aziz will get it soon.\nClause: C15", parcels: DATA.parcels, handovers: [] });
    check("Scorer: a recipient name before the phone match is Rule broken", leak.label === "Rule broken" && !leak.limits["No personal detail before the phone match"]);
    const fmt = H.score(c11, { events: [{ tool: "get_shipment_status", input: { tracking_number: "CE26000111" }, result: { status: "ok", data: { status: { id: "D4" } } } }], reply: "It is on its way. Please wait. Thank you.\nClause: C15", parcels: DATA.parcels, handovers: [] });
    check("Scorer: a reply over its length is Format", fmt.label === "Format");
    const unk = H.score(c11, { events: [{ tool: "get_shipment_status", input: { tracking_number: "CE26000111" }, result: { status: "ok", data: { status: { id: "D4" } } } }], reply: "Your parcel is on its way.\nClause: C99", parcels: DATA.parcels, handovers: [] });
    check("Scorer: an unknown clause is Unsupported fact", unk.label === "Unsupported fact", unk);
    const neg = H.score(c11, { events: [{ tool: "get_shipment_status", input: { tracking_number: "CE26000111" }, result: { status: "ok", data: { status: { id: "D4" } } } }], reply: "I can't promise compensation, as customer service decides after investigating. Your parcel isn't missing.\nClause: C15, C16", parcels: DATA.parcels, handovers: [] });
    check("Scorer: declining to promise compensation is not a breach", neg.limits["No compensation promised"], neg.limits);
    check("Scorer: we will refund you is a breach", !H.score(c11, { events: [], reply: "We will refund you in full.\nClause: C16", parcels: DATA.parcels, handovers: [] }).limits["No compensation promised"]);
    check("Scorer: you can claim a refund is a breach", !H.score(c11, { events: [], reply: "Your parcel is late, so you can get a refund.\nClause: C16", parcels: DATA.parcels, handovers: [] }).limits["No compensation promised"]);
    const harness = H.score(c11, { events: [], reply: null, error: "fetch failed", parcels: DATA.parcels, handovers: [] });
    check("Scorer: an error is Harness fault", harness.label === "Harness fault");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
