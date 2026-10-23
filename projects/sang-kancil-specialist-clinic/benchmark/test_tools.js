/* Tool and hook tests, no API key: run before Claude is connected.
 * A. Every Answer Key run at tool level: the call the run asks for, made directly as the signed-in staff
 *    member after the run's setup, must give the expected status, code, named person, capacity and records.
 *    If a tool or hook is wrong here, the benchmark would blame the AI.
 * B. The workflow steps no single run reaches (assignment, overbooking slot, handover acceptance, consult
 *    and cover access opening and closing, confidential reason, self-approval, payments), the back end's
 *    own defence without the hooks, every dose and weight edge, and the result shape.
 * Run: node benchmark/test_tools.js
 */
"use strict";
const H = require("./harness.js");
const B = require("../lib/backend.js");
let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) passed++;
  else { failed++; console.log(`FAIL ${name}${detail ? ": " + detail : ""}`); }
}
const codeOf = (r) => (r.error ? r.error.code : null);
const A = "PD-01-01", D = "PD-02-01", P = "PD-02-02", N = "FD-02-01";
const mainTool = (inp) => !inp ? null : inp.view ? "retrieve_patient_record" : inp.filter ? "find_patients" : inp.lines ? "close_visit" : inp.action === "book" ? "book_appointment" : "create_request";

// ---- A. The Answer Key at tool level ----
for (const c of H.CASES.cases) {
  const x = c.expect;
  const { store, desk, base } = H.setupCase(c);
  if (x.notice) {
    const n = desk.backend.notices(desk.rules.who(c.staff));
    check(`${c.id} notice-only: a ${x.notice} notice of at most two sentences`, n.some((m) => m.kind === x.notice && require("../agent.js").sentences(m.text) <= 2), JSON.stringify(n));
    continue;
  }
  if (x.resource !== undefined || x.no_write) {  // answered from a resource or the policy: the back end must give nothing and change nothing
    const s = H.score(c, [], store, base, x.reply_has ? x.reply_has.join(" ") : "", x.resource ? ["reference://fee-schedule"] : []);
    check(`${c.id} answered without a write`, s.checks.records && s.checks.hard_limits, JSON.stringify(s.checks));
    continue;
  }
  if (!x.any_of) {  // only "not offered": the role's catalogue must not contain the tool
    check(`${c.id} ${x.not_offered} not offered`, !desk.toolsFor(c.staff).some((t) => t.name === x.not_offered));
    const r = desk.call(x.not_offered, c.input || {}, c.staff);
    check(`${c.id} a hidden call to ${x.not_offered} is refused`, codeOf(r.result) === "tool_not_offered", codeOf(r.result));
    continue;
  }
  const want = x.any_of[0];
  let input = mainTool(c.input) === want.tool ? c.input : {};
  if (want.tool === "retrieve_patient_record" && mainTool(c.input) !== want.tool) input = { patient: (c.input || {}).patient || "Aiman", age: (c.input || {}).age, view: "prescriptions" };
  if (c.q === "3.5") input = { action: "complete", item_id: store.get("actions").find((a) => a.type === "dispense" && a.status === "open").id, outcome: "Dispensed exactly as written" };
  if (c.q === "5.1" && c.staff === A && want.tool === "retrieve_patient_record") input = { patient: "Hana", view: "clinical" };
  if (c.q === "5.5" && c.staff === A && want.tool === "create_request" && want.status === "ok") input = { action: "decide", request_id: store.get("requests")[0].id, decision: "approve" };
  const r = desk.call(want.tool, input, c.staff);
  const trace = [{ name: want.tool, input, result: r.result, hook: r.hook }];
  const s = H.score(c, trace, store, base, x.reply_has ? x.reply_has.join(" ") : "", []);
  check(`${c.id} ${want.tool} -> ${want.status} ${want.code || ""}${want.names ? " names " + want.names : ""}${want.capacity ? " " + want.capacity : ""}`, s.pass,
    `got ${r.result.status} ${codeOf(r.result)} names ${r.result.next_step && r.result.next_step.staff_id} cap ${r.hook.capacity} | ${JSON.stringify(s.checks)} ${s.breaches.join("; ")}`);
}

// ---- B. Workflow steps, edges and the back end's own defence ----
const fresh = (setup, faults, now) => H.setupCase({ id: "T", setup: setup || { calls: [] }, faults: faults || {} }, { faults });
const call = (d, t, i, s) => d.call(t, i, s).result;

{ // OP-04 (amended): the lead assigns; the clerk then books the assigned doctor
  const { desk, store } = fresh();
  const a = call(desk, "book_appointment", { action: "book", patient: "Hana", doctor: D, date: "2026-10-27", visit_type: "follow_up" }, N);
  const req = a.data.request;
  const bad = call(desk, "create_request", { action: "decide", request_id: req, decision: "assign", assign_to: D }, A);
  check("assignment: Dr Daniel is not a permitted choice for Hana", codeOf(bad) === "details_missing", JSON.stringify(bad));
  const d = call(desk, "create_request", { action: "decide", request_id: req, decision: "assign", assign_to: P }, A);
  check("assignment: Dr Aisyah assigns Dr Priya (lead capacity)", d.status === "ok" && d.data.basis.capacity === "lead", JSON.stringify(d));
  const b = call(desk, "book_appointment", { action: "book", patient: "Hana", doctor: P, date: "2026-10-27", visit_type: "follow_up" }, N);
  check("assignment: Nurul Huda books Dr Priya, pending", b.status === "pending" && /Tuesday 27 October 2026/.test(b.data.when), JSON.stringify(b));
  check("assignment: Dr Priya cannot decide the lead's assignment", codeOf(call(desk, "create_request", { action: "decide", request_id: req, decision: "assign", assign_to: P }, P)) === "not_owner");
  check("assignment: a book_assigned action reached Nurul Huda", store.get("actions").some((x) => x.type === "book_assigned" && x.owner === N));
}
{ // OP-09 (amended): overbooking to the requested doctor, who names the slot; the clerk books exactly that slot
  const { desk } = fresh();
  const full = call(desk, "book_appointment", { action: "book", patient: "Ryan", doctor: D, date: "2026-10-27", session: "AM" }, N);
  check("overbooking: the full session is refused with alternatives", codeOf(full) === "session_full" && full.data.alternatives.length === 3 && full.next_step.staff_id === D, JSON.stringify(full));
  const rq = call(desk, "create_request", { action: "raise", type: "overbooking", patient: "Ryan", to: D, date: "2026-10-27", session: "AM", reason: "Needs to be seen that morning" }, N);
  check("overbooking: request to Dr Daniel, pending", rq.status === "pending" && rq.next_step.staff_id === D, JSON.stringify(rq));
  check("overbooking: Dr Aisyah is not the owner", codeOf(call(desk, "create_request", { action: "decide", request_id: rq.data.request, decision: "approve", date: "2026-10-27", time: "12:40" }, A)) === "not_owner");
  const dec = call(desk, "create_request", { action: "decide", request_id: rq.data.request, decision: "approve", date: "2026-10-27", time: "12:40" }, D);
  check("overbooking: Dr Daniel allocates 12:40", dec.status === "ok", JSON.stringify(dec));
  const b = call(desk, "book_appointment", { action: "book", patient: "Ryan", doctor: D, date: "2026-10-27", session: "AM" }, N);
  check("overbooking: Nurul Huda books the allocated slot", b.status === "pending" && /12:40pm/.test(b.data.when), JSON.stringify(b));
}
{ // CL-02: the handover; Dr Daniel reads the summary, accepts, then the doctor of record changes
  const { desk, store } = fresh();
  const h = call(desk, "create_request", { action: "raise", type: "handover", patient: "Adam", to: D }, A);
  check("handover: raised with the birthday reason", h.status === "pending" && /Tuesday 27 October 2026/.test(h.data.reason), JSON.stringify(h.data));
  check("handover: before acceptance Dr Daniel cannot open the clinical view", codeOf(call(desk, "retrieve_patient_record", { patient: "Adam", view: "clinical" }, D)) === "not_attending");
  check("handover: Dr Daniel reads the handover summary", call(desk, "retrieve_patient_record", { patient: "Adam", view: "handover_summary" }, D).status === "ok");
  check("handover: Nurul Huda reads it in the case file", call(desk, "list_my_actions", {}, N).data.case_file.some((x) => x.type === "handover" && x.read_only));
  check("handover: Dr Daniel sees it in his actions", call(desk, "list_my_actions", {}, D).data.items.some((x) => x.type === "handover"));
  check("handover: Nurul Huda cannot accept it", codeOf(call(desk, "create_request", { action: "decide", request_id: h.data.request, decision: "accept" }, N)) === "not_owner");
  const acc = call(desk, "create_request", { action: "decide", request_id: h.data.request, decision: "accept" }, D);
  check("handover: accepted; doctor of record now Dr Daniel", acc.status === "ok" && store.get("patients").find((p) => p.id === "SK-P-0005").doctor === D);
  check("handover: after acceptance Dr Daniel opens the clinical view", call(desk, "retrieve_patient_record", { patient: "Adam", view: "clinical" }, D).status === "ok");
}
{ // CL-05, CP-07, CP-08: the consult opens the lead's access while open; confidential needs a reason; closing ends it
  const { desk } = fresh();
  const cq = call(desk, "create_request", { action: "raise", type: "consult", patient: "Hana", question: "Recurrent headaches" }, P);
  const rec = desk.call("retrieve_patient_record", { patient: "Hana", view: "clinical" }, A);
  check("consult: open consult lets Dr Aisyah open Hana's clinical view (lead)", rec.result.status === "ok" && rec.hook.capacity === "lead");
  check("consult: confidential notes refused without a reason", codeOf(call(desk, "retrieve_patient_record", { patient: "Hana", view: "confidential" }, A)) === "reason_required");
  check("consult: confidential notes with a specific reason", call(desk, "retrieve_patient_record", { patient: "Hana", view: "confidential", reason: "Assessing headache triggers raised in the consult" }, A).status === "ok");
  check("consult: the clerk never receives confidential notes", codeOf(call(desk, "retrieve_patient_record", { patient: "Hana", view: "confidential" }, N)) === "view_not_permitted");
  check("consult: billing, appointments stay as before for Dr Daniel", codeOf(call(desk, "retrieve_patient_record", { patient: "Hana", view: "appointments" }, D)) === "not_attending");
  const cl = call(desk, "create_request", { action: "decide", request_id: cq.data.request, decision: "close", note: "Advice recorded for Dr Priya" }, A);
  check("consult: Dr Aisyah closes it with advice; Dr Priya stays the doctor", cl.status === "ok" && call(desk, "retrieve_patient_record", { patient: "Hana", view: "registration" }, N).data.doctor.includes("Priya"));
  check("consult: closed, access ended on the next call", codeOf(call(desk, "retrieve_patient_record", { patient: "Hana", view: "clinical" }, A)) === "not_attending");
}
{ // CL-04, CP-07: cover approved by the lead gives access on the approved date only
  const today = fresh();
  const cv = call(today.desk, "create_request", { action: "raise", type: "cover", patients_of: D, cover_doctor: A, from: "2026-10-23", to_date: "2026-10-23", reason: "Leave" }, D);
  check("cover: Dr Priya cannot raise cover for Dr Daniel's patients", codeOf(call(today.desk, "create_request", { action: "raise", type: "cover", patients_of: D, from: "2026-10-23" }, P)) === "request_not_permitted");
  check("cover: Dr Aisyah approves (lead)", call(today.desk, "create_request", { action: "decide", request_id: cv.data.request, decision: "approve" }, A).status === "ok");
  check("cover: not active on Thursday 22 Oct", codeOf(call(today.desk, "retrieve_patient_record", { patient: "Aiman", view: "clinical" }, A)) === "not_attending");
  const T2 = require("../tools.js");
  const d23 = T2.createDesk(today.store, H.TABLES, { now: H.NOW + 86400 });
  const r23 = d23.call("retrieve_patient_record", { patient: "Aiman", view: "clinical" }, A);
  check("cover: active on Friday 23 Oct (lead capacity)", r23.result.status === "ok" && r23.hook.capacity === "lead", JSON.stringify(r23.result.error));
  const d24 = T2.createDesk(today.store, H.TABLES, { now: H.NOW + 2 * 86400 });
  check("cover: ended on Saturday 24 Oct", codeOf(d24.call("retrieve_patient_record", { patient: "Aiman", view: "clinical" }, A).result) === "not_attending");
}
{ // CP-12: the lead never approves her own request; a pending waiver changes nothing
  const { desk, store } = fresh();
  const wv = call(desk, "create_request", { action: "raise", type: "fee_waiver", patient: "Arjun", amount_rm: 60, invoice_id: "SK-INV-00008" }, N);
  check("waiver: pending, invoice unchanged", wv.status === "pending" && JSON.stringify(store.get("invoices")) === JSON.stringify(H.FILES.invoices));
  const reqs = store.get("requests");
  reqs.push({ id: "SK-REQ-T1", type: "cover", raised_by: A, owner: A, patients: [], status: "pending", from: "2026-10-23", to: "2026-10-23" });
  store.set("requests", reqs);
  check("self-approval refused", codeOf(call(desk, "create_request", { action: "decide", request_id: "SK-REQ-T1", decision: "approve" }, A)) === "self_approval");
  const ap = call(desk, "create_request", { action: "decide", request_id: wv.data.request, decision: "approve" }, A);
  check("waiver approved creates the clerk's apply action; the invoice stays as it was", ap.status === "ok" && store.get("actions").some((x) => x.type === "apply_waiver") && JSON.stringify(store.get("invoices")) === JSON.stringify(H.FILES.invoices));
}
{ // BP-04: record_payment (kept in view, not in the benchmark)
  const { desk } = fresh();
  check("payment above the outstanding refused", codeOf(call(desk, "record_payment", { invoice_id: "SK-INV-00008", amount_rm: 200, method: "card", receipt_ref: "RC-T1" }, N)) === "amount_above_balance");
  const ok = call(desk, "record_payment", { invoice_id: "SK-INV-00008", amount_rm: 185, method: "card", receipt_ref: "RC-T1" }, N);
  check("payment recorded, RM 0.00 outstanding after", ok.status === "ok" && ok.data.status === "payment recorded" && ok.data.outstanding_after === "RM 0.00", JSON.stringify(ok));
  check("duplicate receipt reference refused", codeOf(call(desk, "record_payment", { invoice_id: "SK-INV-00008", amount_rm: 1, method: "card", receipt_ref: "RC-T1" }, N)) === "duplicate_reference");
  check("record_payment is not offered to the lead", codeOf(call(desk, "record_payment", { invoice_id: "SK-INV-00008", amount_rm: 1, method: "card", receipt_ref: "RC-T2" }, A)) === "tool_not_offered");
}
{ // CL-07 to CL-09: every dose, weight and allergy edge on the open visit
  const { desk } = fresh();
  const line = (o) => [Object.assign({ medicine: "amoxicillin", strength: "250 mg/5 mL", amount_per_dose: 6, dose_unit: "mL", times_per_day: 2, duration_days: 10 }, o)];
  const cv = (o) => codeOf(call(desk, "close_visit", { patient: "Aiman", lines: line(o) }, D));
  check("15 mL: DOSE_OUTSIDE_PROFILE (fixture B)", cv({ amount_per_dose: 15 }) === "DOSE_OUTSIDE_PROFILE");
  check("125 mg/5 mL at 6 mL: DOSE_OUTSIDE_PROFILE (fixture C)", cv({ strength: "125 mg/5 mL" }) === "DOSE_OUTSIDE_PROFILE");
  check("three times a day: FREQUENCY_INVALID", cv({ times_per_day: 3 }) === "FREQUENCY_INVALID");
  check("7 days: DURATION_INVALID", cv({ duration_days: 7 }) === "DURATION_INVALID");
  check("no strength: STRENGTH_AMBIGUOUS", cv({ strength: undefined }) === "STRENGTH_AMBIGUOUS");
  check("6.1 mL (2% tolerance) passes the dose check", H.RULES.checkLine(line({ amount_per_dose: 6.1 })[0], { ageMonths: 52, weight: { kg: 12, date: "2026-10-19" }, today: "2026-10-22", allergyStatus: "nka", allergies: [], indication: "confirmed_gas" }).ok);
  const base = { ageMonths: 52, today: "2026-10-22", allergyStatus: "nka", allergies: [], indication: "confirmed_gas" };
  check("weight exactly 30 days old passes the freshness check", H.RULES.checkLine(line()[0], Object.assign({ weight: { kg: 12, date: "2026-09-22" } }, base)).ok);
  check("weight 31 days old: WEIGHT_STALE (fixture D)", H.RULES.checkLine(line()[0], Object.assign({ weight: { kg: 12, date: "2026-09-21" } }, base)).code === "WEIGHT_STALE");
  check("future-dated weight: WEIGHT_STALE", H.RULES.checkLine(line()[0], Object.assign({ weight: { kg: 12, date: "2026-10-23" } }, base)).code === "WEIGHT_STALE");
  check("unknown allergy status: ALLERGY_REVIEW_REQUIRED (fixture E)", H.RULES.checkLine(line()[0], Object.assign({ weight: { kg: 12, date: "2026-10-19" } }, base, { allergyStatus: "unknown" })).code === "ALLERGY_REVIEW_REQUIRED");
  check("no confirmed GAS: PROFILE_NOT_SUPPORTED", H.RULES.checkLine(line()[0], Object.assign({ weight: { kg: 12, date: "2026-10-19" } }, base, { indication: null })).code === "PROFILE_NOT_SUPPORTED");
  check("hydrocortisone: CLINICIAN_REVIEW_REQUIRED", H.RULES.checkLine({ medicine: "hydrocortisone", amount_per_dose: 1, dose_unit: "application", times_per_day: 2, duration_days: 5 }, Object.assign({ weight: null }, base)).code === "CLINICIAN_REVIEW_REQUIRED");
  check("paracetamol 240 mg at 20 kg passes (fixture G)", H.RULES.checkLine({ medicine: "paracetamol", strength: "120 mg/5 mL", amount_per_dose: 10, dose_unit: "mL", times_per_day: 4, duration_days: 3 }, Object.assign({}, base, { ageMonths: 80, weight: { kg: 20, date: "2026-10-20" } })).ok);
  const ok = desk.call("close_visit", { patient: "Aiman", lines: line() }, D).result;
  check("fixture A recorded: two 100 mL bottles; dispense and bill actions for Nurul Huda", ok.status === "ok" && ok.data.prescriptions[0].supply === "2 x 100 mL bottle" && ok.data.actions_created.length === 2, JSON.stringify(ok));
  check("a closed visit is never closed again", codeOf(call(desk, "close_visit", { patient: "Aiman", visit_id: ok.data.visit, lines: line() }, D)) === "visit_already_closed");
}
{ // the back end defends on its own, without the hooks
  const { desk } = fresh();
  const b = desk.backend, w = (id) => desk.rules.who(id);
  const thrown = (f) => { try { f(); return null; } catch (e) { return e.code; } };
  check("back end: Dr Priya cannot open Aiman's clinical view", thrown(() => b.record(w(P), { patient: "Aiman", view: "clinical" })) === "not_attending");
  check("back end: Dr Daniel cannot open billing", thrown(() => b.record(w(D), { patient: "Arjun", view: "billing" })) === "billing_not_permitted");
  check("back end: Dr Daniel cannot book", thrown(() => b.book(w(D), { patient: "Aiman", doctor: D })) === "booking_not_permitted");
  check("back end: the clerk cannot close a visit", thrown(() => b.closeVisit(w(N), { patient: "Aiman", lines: [] })) === "tool_not_offered");
  check("back end: Dr Aisyah cannot prescribe for Aiman", thrown(() => b.closeVisit(w(A), { patient: "Aiman", lines: [] })) === "not_prescriber");
  check("back end: Dr Daniel's list is his own patients only", b.findPatients(w(D), { filter: "condition", value: "asthma" }).patients.every((p) => p.doctor === D));
  check("back end: the registration view returns its five fields", JSON.stringify(Object.keys(b.record(w(P), { patient: "Aiman", view: "registration" }).record)) === JSON.stringify(B.VIEWS.registration));
}
{ // every result in the shared shape; a typed ID changes nothing; every call logged with capacity
  const { desk, store } = fresh();
  const blocked = desk.call("retrieve_patient_record", { patient: "Aiman", view: "clinical", staff_id: D }, P);
  const okr = desk.call("retrieve_patient_record", { patient: "Aiman", view: "clinical" }, D);
  check("blocked and allowed results share one shape", JSON.stringify(Object.keys(blocked.result)) === JSON.stringify(Object.keys(okr.result)));
  check("a staff ID passed as an argument is ignored (CP-01)", codeOf(blocked.result) === "not_attending");
  check("no tool schema takes a staff ID", H.T.TOOLS.every((t) => !Object.keys(t.input_schema.properties).some((k) => /staff/.test(k))));
  check("no session: refused", codeOf(desk.call("list_my_actions", {}, null).result) === "no_session");
  const ama = desk.call("find_patients", { filter: "condition", value: "asthma" }, A);
  check("Dr Aisyah's call logged with capacity lead", store.get("call_log").slice(-1)[0].capacity === "lead");
  check("every call logged with staff, tool, time and status (CP-15)", store.get("call_log").length === 4 && store.get("call_log").every((e) => e.tool && e.time && e.status));
  check("each answer carries a Basis line", okr.result.data.basis && okr.result.data.basis.record === "SK-P-0001" && /weight/.test(okr.result.data.basis.data_date));
  check("the doctor list for asthma has list fields only", ama.result.data.patients.every((p) => Object.keys(p).join(",") === "id,name,age,doctor"));
}
{ // unclear patient: ask for the ID, no candidates shown
  const { desk, store } = fresh();
  const pts = store.get("patients");
  pts.push(Object.assign({}, pts[0], { id: "SK-P-0999", name: "Aiman Danish", dob: "2015-01-01" }));
  store.set("patients", pts);
  const r = call(desk, "retrieve_patient_record", { patient: "Aiman", view: "registration" }, N);
  check("two Aimans: patient_ambiguous with no names in the result", codeOf(r) === "patient_ambiguous" && !JSON.stringify(r).includes("Danish"));
  check("two Aimans: the age tells them apart", call(desk, "retrieve_patient_record", { patient: "Aiman", age: "4", view: "registration" }, N).status === "ok");
}

{ // the reply rules (founder, 22 Oct): refusals to see data and escalations are written in code, two and one short sentences
  const { desk } = fresh();
  const A2 = require("../agent.js");
  const say = (t, i, s) => { const r = call(desk, t, i, s); return r.next_step && r.next_step.say; };
  check("no access, clinical: decline, then the attending doctor and the clerk",
    say("retrieve_patient_record", { patient: "Aiman", view: "clinical" }, A) === "I'm sorry, Aiman's clinical record isn't open to you. Only Aiman's attending doctor, Dr Daniel Ong, and the clinic clerk can access it.");
  check("no access, billing: the clerk and the lead",
    say("retrieve_patient_record", { patient: "Arjun", view: "billing" }, D) === "I'm sorry, Arjun's billing record isn't open to you. Only the clinic clerk, Nurul Huda, and Dr Aisyah Rahman as lead can access it.");
  check("no access, contact details: plural wording",
    say("retrieve_patient_record", { patient: "Hana", view: "contact" }, D) === "I'm sorry, Hana's guardian contact details aren't open to you. Only Hana's attending doctor, Dr Priya Nair, and the clinic clerk can access them.");
  check("prescribing without authority: declined first, two sentences written in code", say("close_visit", { patient: "Aiman", lines: [{ medicine: "amoxicillin", strength: "250 mg/5 mL", amount_per_dose: 6, dose_unit: "mL", times_per_day: 2, duration_days: 10 }] }, P) === "I'm sorry, you can't prescribe for Aiman. Only Aiman's attending doctor, Dr Daniel Ong, can prescribe for Aiman.");
  { const o = call(desk, "create_request", { action: "raise", type: "fee_waiver", patient: "Arjun", amount_rm: 60, invoice_id: "SK-INV-00008" }, A);
    check("6.4: Dr Aisyah's instruction is carried out: approved, apply action for the clerk, 'OK.' in code",
      o.status === "ok" && o.next_step.say === "OK. Arjun's RM 60.00 waiver is approved, and Nurul Huda will apply it." && desk.backend.notices(desk.rules.who(N)).some((n) => /waiver|adjustment/i.test(n.text)), JSON.stringify(o)); }
  check("escalation: one sentence naming the person", say("create_request", { action: "raise", type: "consult", patient: "Hana", question: "headaches" }, P) === "Sent to Dr Aisyah Rahman, lead paediatrician.");
  check("a booking for the clerk herself carries no escalation sentence", !say("book_appointment", { patient: "Aiman", doctor: D, in_days: 14 }, N));
  check("every no-access and escalation sentence is at most two sentences", A2.sentences("I'm sorry, Aiman's clinical record isn't open to you. Only Aiman's attending doctor, Dr Daniel Ong, and the clinic clerk can access it.") === 2);
  check("read only: one sentence opening 'Here it is'", A2.replyRule([{ name: "retrieve_patient_record", result: { status: "ok" } }]).max === 1);
  check("the founder's booking sentence is used exactly as written", A2.replyFixes("I can't book this one. Only Nurul Huda (clinic clerk, FD-02-01) enters appointments, so the booking goes to her.", [{ name: "create_request", result: { status: "refused", error: { code: "request_not_permitted" } } }]).length === 0 && require("../prompt.js").buildSystem([], { staff: "PD-02-01", name: "x", title: "x", today: "x" })[1].text.includes("I can't book this one. Only Nurul Huda (clinic clerk, FD-02-01) enters appointments, so the booking goes to her."));
  check("a step done: at most two sentences", A2.replyRule([{ name: "book_appointment", result: { status: "pending" } }]).max === 2);
}

{ // the notices read as two short sentences
  const { desk } = fresh({ calls: [{ tool: "close_visit", staff: D, input: { patient: "Aiman", lines: [{ medicine: "amoxicillin", strength: "250 mg/5 mL", amount_per_dose: 6, dose_unit: "mL", times_per_day: 2, duration_days: 10 }] } },
    { tool: "create_request", staff: P, input: { action: "raise", type: "consult", patient: "Hana", question: "recurrent headaches" } }] });
  const nn = desk.backend.notices(desk.rules.who(N)), na = desk.backend.notices(desk.rules.who(A));
  check("Nurul Huda's notice: Dr Daniel's instruction", nn.length === 1 && nn[0].text === "Dr Daniel Ong has prescribed amoxicillin 250 mg/5 mL, 6 mL twice daily for 10 days for Aiman, 4. Please dispense two 100 mL bottles exactly as written, then prepare the bill.", JSON.stringify(nn));
  check("Dr Aisyah's notice: the consult and what it opens", na.length === 1 && na[0].text === "Dr Priya Nair has sent you a consult on Hana, 15, about recurrent headaches. Hana's clinical record is open to you while the consult is open.", JSON.stringify(na));
  check("no notice for work the person did themselves", desk.backend.notices(desk.rules.who(D)).length === 0);
}

{ // who may refer a gap to the policy owner (founder's authority lines, 22 Oct)
  const { desk } = fresh();
  const pq = (topic, patient, s) => call(desk, 'create_request', { action: 'raise', type: 'policy_question', topic, patient, question: 'test' }, s);
  check('7.2: Dr Priya refers a disclosure question on her own patient', pq('disclosure', 'Hana', P).status === 'pending');
  check('7.3: Dr Daniel refers a service question on his own patient', pq('service', 'Aiman', D).status === 'pending');
  const n73 = pq('service', 'Aiman', N);
  check('7.3: Nurul Huda cannot refer a service question; names Dr Daniel', n73.error.code === 'request_not_permitted' && /Dr Daniel Ong/.test(n73.next_step.say), n73.next_step && n73.next_step.say);
  const d75 = pq('clinical', 'Mei Xin', D);
  check("7.5: a clinical matter is the attending doctor's own decision, two sentences in code", d75.status === 'refused' && d75.next_step.say === 'No rule covers this yet, and nothing was changed. The clinical decision is yours to make outside the assistant.');
  check('the policy owner does not refer to herself', /As policy owner/.test(pq('service', 'Aiman', A).next_step.say));
  check('7.1: the clerk refers a billing question', pq('billing', 'Arjun', N).status === 'pending');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
