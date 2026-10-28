/* The tool tests: no API key, no model. Must pass before any paid run (the benchmark gate runs them).
 *
 * 1. Every run in the Answer Key, replayed with its canonical tool calls through the hooks: each step's
 *    expected tool, action, result and data check, and no hard-limit breach. Proves the key is reachable.
 * 2. Every refusal and rule on its own: each person's tools carrying only their own actions, an action not
 *    offered to the role, one call to check and dispense with the query raised by code, the receiver of a
 *    desk handover set by the stage of the visit, a name alone, case notes to the
 *    desk or the pharmacist, prescription detail to the desk, panel detail to the pharmacist, the allergy,
 *    dose and stock checks, the hold while a query is open, a bill before dispensing, the panel ID check,
 *    a visit outside the panel's period, the split, amount mismatch, a second payment, an MC with no GP
 *    record, issue before prepare, the acknowledgement by the GP only and changing nothing.
 * 3. Fault injection for the four failure cases: nothing changed.
 * 4. Every sentence written in code, and the reply check in agent.js.
 */
"use strict";
const path = require("path");
const H = require("./harness.js");
const F = require(path.join(H.ROOT, "lib", "format.js"));
const { replyFixes } = require(path.join(H.ROOT, "agent.js"));

let pass = 0, fail = 0;
const t = (name, cond, detail) => {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
};
const fresh = (setup, faults, now) => {
  const store = H.T.memoryStore(H.FILES);
  H.applySetup(store, setup || []);
  return { store, desk: H.T.createDesk(store, H.TABLES, { now: now || H.NOW, faults: faults || {} }) };
};
const W = H.W, P = H.PAT;
const ic = (k) => ({ name: P[W[k]].name, ic_last4: P[W[k]].ic_last4 });
const id = (k) => ({ patient_id: W[k] });

// ---------------------------------------------------------------- 1. the Answer Key, replayed
for (const run of H.RUNS) {
  const { store } = fresh(run.case.setup);
  store.set("call_log", []);
  const canon = H.CANON[run.id] || [];
  const all = [];
  run.steps.forEach((s, i) => {
    const desk = H.T.createDesk(store, H.TABLES, { now: s.time, faults: run.faults });
    const before = JSON.parse(JSON.stringify(store.dump()));
    const trace = (canon[i] || []).map(([name, input]) => Object.assign({ name, input, staff: s.staff }, desk.call(name, input, s.staff)));
    all.push(...trace);
    const after = store.dump();
    const sc = H.scoreStep(run.case.id, s, trace, before, after);
    t(`${run.id} step ${i + 1} (${s.staff})`, Object.values(sc).every(Boolean), JSON.stringify(sc) + " " + trace.map((x) => `${x.name}.${x.input.action} ${x.result.status} ${x.result.error ? x.result.error.code + " " + x.result.error.message : ""}`).join("; "));
  });
  const { store: s0 } = fresh(run.case.setup);
  const br = H.hardLimits(all, s0.dump(), store.dump());
  t(`${run.id} hard limits`, br.length === 0, br.join("; "));
}
t("27 runs", H.RUNS.length === 27, String(H.RUNS.length));

// ---------------------------------------------------------------- 2. refusals and rules
{
  const { desk } = fresh();
  const r = (tool, input, who) => desk.call(tool, input, who).result;
  const x = r("patient", { action: "find", name: P[W.a2].name }, "FD-01");
  t("a name alone is refused", x.status === "refused" && x.error.code === "identifier_required");
  t("tools offered by role", desk.toolsFor("FD-01").length === 5 && desk.toolsFor("GP-01").length === 5 && desk.toolsFor("PH-01").length === 3);
  t("a tool not offered is refused", r("dispense", Object.assign({ action: "check_and_dispense" }, id("a5")), "FD-01").error.code === "not_offered");
  // each person's tools carry only that person's actions (PS-RP-01, 28 Oct)
  const acts = (who, tool) => { const x = desk.toolsFor(who).find((y) => y.name === tool); return x ? x.input_schema.properties.action.enum : []; };
  t("GP billing has no record_payment or prepare_bill", !acts("GP-01", "billing").includes("record_payment") && !acts("GP-01", "billing").includes("prepare_bill") && acts("GP-01", "billing").length === 5);
  t("desk billing has no owner actions", !acts("FD-01", "billing").includes("view_owner_review") && !acts("FD-01", "billing").includes("acknowledge_panel_bill"));
  t("only the desk has hand_over", acts("FD-01", "tasks").includes("hand_over") && !acts("GP-01", "tasks").includes("hand_over") && !acts("PH-01", "tasks").includes("hand_over"));
  t("the pharmacist has no billing tool", !desk.toolsFor("PH-01").some((x) => x.name === "billing"));
  t("each action list matches the role table", ["FD-01", "GP-01", "PH-01"].every((w) => desk.toolsFor(w).every((x) => x.input_schema.properties.action.enum.every((a) => H.RULES.offered(H.RULES.ROLE_OF[w], x.name, a)))));
  t("no tool asks the model for a reason", ["FD-01", "GP-01", "PH-01"].every((w) => desk.toolsFor(w).every((x) => !("reason" in x.input_schema.properties) || x.name === "record_consultation")));
  t("descriptions name no action outside the list", desk.toolsFor("GP-01").every((x) => !/record_payment|prepare_bill|hand_over|check_and_dispense/.test(x.description)));
  t("an action outside the list is still refused by the hook", r("billing", Object.assign({ action: "record_payment", amount_rm: 37, method: "cash" }, ic("a2")), "GP-01").error.code === "not_offered");
  const desk1 = r("patient", Object.assign({ action: "find" }, ic("c1")), "FD-01");
  t("desk view has no conditions or medicines", desk1.status === "ok" && !("conditions" in desk1.data) && !("current_medicines" in desk1.data) && !("case_notes" in desk1.data));
  const ph1 = r("patient", Object.assign({ action: "find" }, ic("d4")), "PH-01");
  t("pharmacist view has nothing about panels", ph1.status === "ok" && !JSON.stringify(ph1.data).toLowerCase().includes("panel"));
  t("desk medicines view refused", r("patient", Object.assign({ action: "find", view: "medicines" }, ic("c1")), "FD-01").error.code === "no_access");
  t("GP case notes allowed", r("patient", Object.assign({ action: "find", view: "case_notes" }, ic("c1")), "GP-01").status === "ok");
  // the pharmacist's step: one call; a failed check raises the query itself (PS-AC-02, PS-AC-03)
  const c1 = r("dispense", Object.assign({ action: "check_and_dispense" }, id("c1")), "PH-01");
  t("allergy by drug class: held, query P1 sent by code", c1.status === "ok" && c1.data.check === "failed" && c1.data.reason === "P1" && c1.data.failed.some((f) => f.reason === "P1"), JSON.stringify(c1.data));
  t("held reply written in code", c1.next_step.say === "The check failed on an allergy conflict, so the prescription is held. Sent to Dr Sivakumar a/l Ramachandran, general practitioner and owner.", c1.next_step.say);
  const gpN = desk.noticesFor("GP-01").pop().text;
  t("the GP's notice for a failed check: two sentences, no pronouns", (gpN.match(/[.!?](?=\s|$)/g) || []).length === 2 && !/\b(he|she|him|her|his|hers)\b/i.test(gpN) && gpN.includes("check"), gpN);
  t("nothing dispensed while held", !desk.env.store.get("dispensed").some((d) => d.patient === W.c1));
  t("held: a second call is refused while the query is open", r("dispense", Object.assign({ action: "check_and_dispense" }, id("c1")), "PH-01").error.code === "query_open");
  t("the GP answers keep", r("tasks", Object.assign({ action: "answer", answer: "keep it" }, id("c1")), "GP-01").status === "ok");
  const c1b = r("dispense", Object.assign({ action: "check_and_dispense" }, id("c1")), "PH-01");
  t("after keep, the same call dispenses", c1b.status === "ok" && !!c1b.data.dispensed, JSON.stringify(c1b.error || c1b.data));
  const c2 = r("dispense", Object.assign({ action: "check_and_dispense" }, id("c2")), "PH-01");
  t("out of stock: held, query P3 sent by code", c2.status === "ok" && c2.data.reason === "P3");
  const k2 = desk.call("tasks", Object.assign({ action: "answer", answer: "keep" }, id("c2")), "GP-01").result;
  t("keep refused when out of stock", k2.status === "refused" && k2.error.code === "keep_not_possible", JSON.stringify(k2.error));
  t("keep refusal written in code", k2.next_step.say === "I'm sorry, Cetirizine 10 mg is out of stock, so it can't be dispensed as written. Please change it with Amend prescription.", k2.next_step.say);
  t("the prescription stays held after a refused keep", r("dispense", Object.assign({ action: "check_and_dispense" }, id("c2")), "PH-01").error.code === "query_open");
  t("amend, then the same call dispenses", r("record_consultation", Object.assign({ action: "amend_prescription", replace_medicine: "cetirizine", prescription: [{ medicine: "loratadine", dose: 10, dose_unit: "mg", times_per_day: 1, days: 7, quantity: 7 }] }, id("c2")), "GP-01").status === "ok"
    && r("dispense", Object.assign({ action: "check_and_dispense" }, id("c2")), "PH-01").status === "ok");
  const q3 = r("dispense", Object.assign({ action: "query_gp", reason: "P1", question: "asthma" }, id("c3")), "PH-01");
  t("own concern: code sets P4 when the checks pass, a reason passed in is ignored", q3.status === "ok" && q3.data.reason === "P4", JSON.stringify(q3.data));
  t("held while a query is open", r("dispense", Object.assign({ action: "check_and_dispense" }, id("c3")), "PH-01").error.code === "query_open");
  t("a second query refused while one is open", r("dispense", Object.assign({ action: "query_gp", question: "again" }, id("c3")), "PH-01").error.code === "query_open");
  t("Ms Yong cannot answer a GP query", r("tasks", Object.assign({ action: "answer", answer: "keep" }, id("c3")), "PH-01").error.code === "no_open_task");
  t("Ms Yong cannot amend", r("record_consultation", Object.assign({ action: "amend_prescription", prescription: [] }, id("c3")), "PH-01").error.code === "not_offered");
  t("bill before dispensing refused", r("billing", Object.assign({ action: "prepare_bill" }, id("a5")), "FD-01").error.code === "not_dispensed");
  t("panel bill needs the ID verified", r("billing", Object.assign({ action: "prepare_bill" }, id("d4")), "FD-01").error.code === "identity_not_verified");
  t("GP cannot prepare a bill", r("billing", Object.assign({ action: "prepare_bill" }, ic("d4")), "GP-01").error.code === "not_offered");
  t("GP cannot acknowledge a bill that is not prepared", r("billing", Object.assign({ action: "acknowledge_panel_bill" }, id("d4")), "GP-01").error.code === "no_bill");
  const b4 = r("billing", Object.assign({ action: "prepare_bill" }, ic("d4")), "FD-01");
  t("panel split: covered RM 46.00, co-pay RM 5.00, panel RM 41.00, Vitamin C RM 4.00 to the patient, patient RM 9.00",
    b4.status === "ok" && b4.data.covered_items === "RM 46.00" && b4.data.co_pay === "RM 5.00" && b4.data.panel_share === "RM 41.00 awaiting claim" && b4.data.excluded_items === "RM 4.00" && b4.data.patient_share === "RM 9.00");
  t("Siti cannot acknowledge", r("billing", Object.assign({ action: "acknowledge_panel_bill" }, id("d4")), "FD-01").error.code === "not_offered");
  const before = JSON.stringify(desk.backend.billing.view_bill({ id: "GP-01", role: "gp" }, id("d4")).bill.lines);
  t("GP acknowledges", r("billing", Object.assign({ action: "acknowledge_panel_bill" }, id("d4")), "GP-01").status === "ok");
  t("acknowledging changes nothing on the bill", JSON.stringify(desk.backend.billing.view_bill({ id: "GP-01", role: "gp" }, id("d4")).bill.lines) === before);
  t("acknowledged once", r("billing", Object.assign({ action: "acknowledge_panel_bill" }, id("d4")), "GP-01").error.code === "already_acknowledged");
  t("amount must equal the patient's share", r("billing", Object.assign({ action: "record_payment", amount_rm: 10, method: "cash" }, ic("d4")), "FD-01").error.code === "amount_mismatch");
  t("method on the list", r("billing", Object.assign({ action: "record_payment", amount_rm: 9, method: "cheque" }, ic("d4")), "FD-01").error.code === "invalid_method");
  t("payment recorded", r("billing", Object.assign({ action: "record_payment", amount_rm: 9, method: "cash", tendered_rm: 20 }, ic("d4")), "FD-01").data.change_due === "RM 11.00");
  t("no second payment", r("billing", Object.assign({ action: "record_payment", amount_rm: 9, method: "cash" }, ic("d4")), "FD-01").error.code === "already_settled");
  t("MC with no GP record refused", r("documents", Object.assign({ action: "prepare", type: "mc" }, ic("b2")), "FD-01").error.code === "no_gp_record");
  t("issue before prepare refused", r("documents", Object.assign({ action: "mark_issued", type: "mc" }, ic("b2")), "FD-01").error.code === "no_gp_record");
  t("GP may not call next while... call next works", r("schedule", { action: "call_next" }, "GP-01").status === "ok");
  t("Siti cannot call next", r("schedule", { action: "call_next" }, "FD-01").error.code === "not_offered");
  const bk = r("schedule", Object.assign({ action: "book", date: "2026-06-04", time: "11:15" }, ic("q2")), "FD-01");
  t("booking on an open slot", bk.status === "ok" && /11:15/.test(bk.data.when), JSON.stringify(bk.error || bk.data));
  const ch = r("schedule", Object.assign({ action: "change", appointment_id: bk.data.appointment_id, date: "2026-06-04", time: "11:30" }, ic("q2")), "FD-01");
  t("booking changed, with the old time kept", ch.status === "ok" && /11:30/.test(ch.data.when) && /11:15/.test(ch.data.was || ""), JSON.stringify(ch.error || ch.data));
  const cn = r("schedule", Object.assign({ action: "cancel", appointment_id: bk.data.appointment_id }, ic("q2")), "FD-01");
  t("booking cancelled", cn.status === "ok" && cn.data.status === "cancelled", JSON.stringify(cn.error || cn.data));
  t("booking on a public holiday refused", r("schedule", Object.assign({ action: "book", date: "2026-06-01", time: "10:00" }, ic("q2")), "FD-01").error.code === "clinic_closed");
  t("booking off the 15-minute grid refused", r("schedule", Object.assign({ action: "book", date: "2026-06-04", time: "10:10" }, ic("q2")), "FD-01").error.code === "outside_hours");
  t("double booking refused", r("schedule", Object.assign({ action: "book", date: "2026-06-03", time: "10:30" }, ic("q2")), "FD-01").error.code === "slot_taken");
  t("registration needs unique IC", r("patient", { action: "register", name: "X Y", dob: "1990-01-01", phone: "011-0000 0000", ic_last4: P[W.a2].ic_last4 }, "FD-01").error.code === "already_registered");
}
{ // record and amend
  const { desk } = fresh([{ op: "with_gp", who: "d3" }]);
  const r = (tool, input, who) => desk.call(tool, input, who).result;
  t("GP records only the patient with the GP", r("record_consultation", Object.assign({ action: "record", diagnosis: "x" }, id("q2")), "GP-01").error.code === "not_called");
  t("MC start before the visit refused", r("record_consultation", Object.assign({ action: "record", diagnosis: "x", mc: { days: 2, start_date: "2026-06-01" } }, id("d3")), "GP-01").error.code === "invalid_mc");
  t("unknown medicine refused", r("record_consultation", Object.assign({ action: "record", diagnosis: "x", prescription: [{ medicine: "codeine", dose: 30, dose_unit: "mg", times_per_day: 3 }] }, id("d3")), "GP-01").error.code === "unknown_item");
  const ok = r("record_consultation", Object.assign({ action: "record", diagnosis: "x", prescription: [{ medicine: "paracetamol", dose: 2, dose_unit: "tablet", times_per_day: 4, days: 3 }], mc: { declined: true } }, id("d3")), "GP-01");
  t("2 tablets of 500 mg recorded as 1000 mg, quantity 24 worked out", ok.status === "ok" && ok.data.prescription[0].dose === "1000 mg" && ok.data.prescription[0].quantity === 24);
  t("a declined MC is recorded and cannot be prepared", r("documents", Object.assign({ action: "prepare", type: "mc" }, id("d3")), "FD-01").error.code === "mc_declined");
}
{ // the dose check: a dose above the formulary range holds the prescription with query P2 (PS-AC-02)
  const { desk } = fresh();
  const store = desk.env.store;
  store.set("consultations", store.get("consultations").map((c) => (c.patient === W.a5 ? Object.assign({}, c, { prescription: c.prescription.map((l, i) => (i === 0 ? Object.assign({}, l, { dose: l.dose * 10 }) : l)) }) : c)));
  const d = desk.call("dispense", Object.assign({ action: "check_and_dispense" }, id("a5")), "PH-01").result;
  t("dose outside the range: held, query P2 sent by code", d.status === "ok" && d.data.reason === "P2" && d.data.failed.some((f) => f.check === "dose"), JSON.stringify(d.data || d.error));
  t("nothing dispensed on a dose outside the range", !store.get("dispensed").some((x) => x.patient === W.a5 && x.at === H.NOW));
}
{ // a keep cannot override an incomplete prescription line (PS-AC-03)
  const { desk } = fresh();
  const store = desk.env.store;
  store.set("consultations", store.get("consultations").map((c) => (c.patient === W.c1 ? Object.assign({}, c, { prescription: c.prescription.map((l) => Object.assign({}, l, { quantity: undefined })) }) : c)));
  const held = desk.call("dispense", Object.assign({ action: "check_and_dispense" }, id("c1")), "PH-01").result;
  const keep = desk.call("tasks", Object.assign({ action: "answer", answer: "keep" }, id("c1")), "GP-01").result;
  t("keep refused when a line is incomplete", held.status === "ok" && keep.status === "refused" && keep.error.code === "keep_not_possible" && keep.next_step.say.includes("incomplete"), JSON.stringify(keep.error));
  t("nothing dispensed from an incomplete line", !store.get("dispensed").some((d) => d.patient === W.c1));
}
{ // a visit outside the panel's period
  const { desk } = fresh([], {}, F.unixOf("2027-04-02", "10:00"));
  const store = desk.env.store;
  store.set("consultations", store.get("consultations").map((c) => (c.patient === W.d4 ? Object.assign({}, c, { date: "2027-04-02" }) : c)));
  t("panel schedule expired", desk.call("billing", Object.assign({ action: "prepare_bill" }, ic("d4")), "FD-01").result.error.code === "panel_schedule_expired");
}

{ // desk handovers: code picks the receiver from the matter and the stage of the visit (PS-RP-06)
  const { desk } = fresh();
  const r = (input) => desk.call("tasks", Object.assign({ action: "hand_over", question: "a concern" }, input), "FD-01").result;
  const pharm = r(Object.assign({ matter: "question" }, ic("c3")));
  t("no desk handover while the prescription is with Ms Yong", pharm.error && pharm.error.code === "wrong_stage" && pharm.next_step.say.startsWith("I'm sorry, that can't be handed over now."), JSON.stringify(pharm.error));
  t("the stage sentence has no pronoun", !/\b(he|she|him|her|his|hers)\b/i.test(pharm.next_step.say), pharm.next_step.say);
  t("outside_policy refused after the consultation", r(Object.assign({ matter: "outside_policy" }, ic("b2"))).error.code === "wrong_stage");
  const before = r(Object.assign({ matter: "question", reason: "D5" }, ic("q2")));
  t("a question before the consultation goes to Dr Sivakumar as D1; a reason passed in is ignored", before.status === "ok" && before.data.reason === "D1" && before.data.to.startsWith("Dr Sivakumar"), JSON.stringify(before.data));
  const after = r(Object.assign({ matter: "question" }, ic("b2")));
  t("the same question after dispensing goes to Ms Yong as D5", after.status === "ok" && after.data.reason === "D5" && after.data.to === "Ms Yong", JSON.stringify(after.data || after.error));
  const unwell = r(Object.assign({ matter: "unwell" }, ic("c3")));
  t("an unwell patient goes to Dr Sivakumar at any stage", unwell.status === "ok" && unwell.data.reason === "D2" && unwell.data.to.startsWith("Dr Sivakumar"));
  t("outside_policy before the consultation goes to Dr Sivakumar as D4", r(Object.assign({ matter: "outside_policy" }, ic("q1"))).data.reason === "D4");
  t("an unknown matter is refused", r(Object.assign({ matter: "billing" }, ic("q1"))).error.code === "invalid_fields");
  t("the default matter is question", r(ic("d2")).status === "ok");
}

// ---------------------------------------------------------------- 3. faults: nothing changed
for (const fid of ["F1", "F2", "F3", "F4"]) {
  const run = H.RUNS.find((x) => x.id === fid);
  const { store } = fresh(run.case.setup);
  const desk = H.T.createDesk(store, H.TABLES, { now: H.NOW, faults: run.faults });
  const before = JSON.parse(JSON.stringify(store.dump()));
  const [[name, input]] = H.CANON[fid][0];
  const res = desk.call(name, input, run.staff).result;
  t(`${fid} fault returns an error`, res.status === "error" && res.error.code === run.steps[0].expect.code, JSON.stringify(res.error));
  t(`${fid} nothing changed`, H.COLLECTIONS.every((k) => JSON.stringify(store.get(k)) === JSON.stringify(before[k])) && JSON.stringify(store.get("stock")) === JSON.stringify(before.stock));
}

// ---------------------------------------------------------------- 4. sentences written in code, and the reply check
{
  const { desk } = fresh();
  const say = (tool, input, who) => desk.call(tool, input, who).result.next_step.say;
  t("no authority sentence", say("billing", Object.assign({ action: "record_payment", amount_rm: 37, method: "cash" }, ic("a2")), "GP-01") === "I'm sorry, you can't record payments. Only Siti Kasim, clinic assistant, can record a payment.");
  t("no access sentence", say("patient", Object.assign({ action: "find", view: "case_notes" }, ic("a2")), "FD-01") === `I'm sorry, ${P[W.a2].name}'s case notes aren't open to you. Only Dr Sivakumar a/l Ramachandran, general practitioner and owner, can access them.`);
  t("no GP record sentence", say("documents", Object.assign({ action: "prepare", type: "mc" }, ic("b2")), "FD-01") === `I'm sorry, there's no MC in Dr Sivakumar's record for ${P[W.b2].name}. Only Dr Sivakumar a/l Ramachandran, general practitioner and owner, can decide an MC, during the consultation.`);
  t("sent to GP", say("tasks", Object.assign({ action: "hand_over", matter: "outside_policy", question: "specialist's prescription" }, ic("q1")), "FD-01") === "Sent to Dr Sivakumar a/l Ramachandran, general practitioner and owner.");
  t("sent to pharmacist", say("tasks", Object.assign({ action: "hand_over", matter: "question", question: "with food?" }, ic("c5")), "FD-01") === "Sent to Ms Yong, pharmacist.");
  const n = desk.noticesFor("PH-01").pop().text;
  t("notice to the pharmacist: two sentences, no pronouns, ends once", (n.match(/[.!?](?=\s|$)/g) || []).length === 2 && !/\b(he|she|him|her|his|hers)\b/i.test(n) && !/\?\./.test(n), n);
  t("answer recorded sentence", say("tasks", Object.assign({ action: "answer", answer: "with food." }, id("c5")), "PH-01") === `OK. Your answer is sent to Siti Kasim to pass on to ${P[W.c5].name}.`);
  const fd = desk.noticesFor("FD-01").pop().text;
  t("notice back to the desk", fd === `Ms Yong has answered your handover on ${P[W.c5].name}: with food. Please pass this on to ${P[W.c5].name}.`, fd);
  // every say and notice: no pronouns, at most two sentences, no em-dash
  const texts = desk.env.store.get("notices").map((x) => x.text);
  t("notices: no pronouns, no em-dash", texts.every((s) => !/\b(he|she|him|her|his|hers)\b/i.test(s) && !s.includes("—")), texts.join(" | "));
  const read = [{ name: "dispense", input: { action: "view_stock" }, result: { status: "ok" } }];
  t("reply check: read-only opening", replyFixes("There are 131 capsules.", read).length > 0 && replyFixes("Here it is: 131 capsules in stock.", read).length === 0);
  t("reply check: a decline after a read may open I'm sorry", replyFixes("I'm sorry, you can't see the stock. Only Ms Yong, pharmacist, can see the stock.", read).length === 0);
  t("reply check: pronoun", replyFixes("Here it is: she has 131 capsules.", read).some((f) => /first names/.test(f)));
  t("reply check: pending", replyFixes("The bill is pending. Please wait.", [{ name: "billing", input: { action: "prepare_bill" }, result: { status: "ok" } }]).some((f) => /pending/.test(f)));
  t("reply check: three sentences", replyFixes("One. Two. Three.", [{ name: "billing", input: { action: "prepare_bill" }, result: { status: "ok" } }]).length > 0);
  t("reply check: self named by the short name", replyFixes("Ms Yong checks it next. Give Dr Sivakumar's answer to send back.", [{ name: "record_consultation", input: { action: "record" }, result: { status: "ok" } }], "Dr Sivakumar a/l Ramachandran").some((f) => /speak to/.test(f)));
  t("reply check: self named",replyFixes("Siti Kasim recorded it. Give the receipt.", [{ name: "billing", input: { action: "record_payment" }, result: { status: "ok" } }], "Siti Kasim").length > 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
