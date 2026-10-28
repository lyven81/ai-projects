/* Shared by the tool tests, the benchmark runner and the pages: load the generated data, build a case's
 * starting state (setup ops, applied without a model), the canonical tool calls for every expected
 * result (the no-key tests run them to prove each expectation is reachable), and score a run from the
 * tool log and the data against the Answer Key and the ten hard limits. Never the reply wording.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const T = require(path.join(ROOT, "tools.js"));
const { createRules } = require(path.join(ROOT, "lib", "rules.js"));

const DATA = path.join(ROOT, "data");
const FILES = Object.fromEntries(fs.readdirSync(DATA).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"))]));
FILES.call_log = [];
const TABLES = JSON.parse(fs.readFileSync(path.join(ROOT, "resources", "policy_tables.json"), "utf8"));
const CASES = JSON.parse(fs.readFileSync(process.env.PS_CASES || path.join(__dirname, "cases.json"), "utf8"));
const NOW = FILES.meta.now;
const RULES = createRules(TABLES);
const W = FILES.meta.who;
const PAT = Object.fromEntries(FILES.patients.map((p) => [p.id, p]));
const idOf = (k) => ({ patient_id: W[k] });
const icOf = (k) => ({ name: PAT[W[k]].name, ic_last4: PAT[W[k]].ic_last4 });
// Read-only actions (nothing is written).
const READS = new Set(["patient.find", "schedule.view_queue", "dispense.view_stock", "billing.view_bill", "billing.view_payments",
  "billing.view_owner_review", "billing.view_panel_bills", "documents.list", "tasks.list"]);
const COLLECTIONS = ["patients", "appointments", "queue", "consultations", "tasks", "checks", "dispensed", "bills", "payments", "documents",
  "reconciles", "owner_review", "acknowledgements", "notices", "change_log"];

/** The clock of a step: 10:00 plus five minutes a step. */
const stepTime = (i) => NOW + 300 * i;

/** Apply a case's setup ops to a store, without a model. */
function applySetup(store, ops) {
  for (const op of ops || []) {
    if (op.op === "clear_queue") store.set("queue", store.get("queue").map((q) => (q.status === "waiting" || q.status === "with_gp" ? Object.assign({}, q, { status: "seen" }) : q)));
    if (op.op === "with_gp") {
      const pid = W[op.who];
      const q = store.get("queue").map((x) => (x.status === "with_gp" ? Object.assign({}, x, { status: "seen" }) : x));
      q.push({ id: `QU-S${q.length + 1}`, patient: pid, date: FILES.meta.today, kind: "walk_in", arrived: NOW - 600, appointment_time: null, status: "with_gp", called: NOW - 120 });
      store.set("queue", q);
    }
    if (op.op === "call") {
      const r = T.createDesk(store, TABLES, { now: NOW - 60 }).call(op.tool, op.input, op.staff).result;
      if (r.status !== "ok") throw new Error(`setup call failed: ${op.tool} ${r.error && r.error.code}`);
    }
  }
}

/** A fresh store in a case's starting state, and a copy of it. */
function setupCase(c) {
  const store = T.memoryStore(FILES);
  applySetup(store, c.setup);
  store.set("call_log", []);
  return { store, base: JSON.parse(JSON.stringify(store.dump())) };
}

/** The runs of the benchmark: { id, case, staff, steps: [{ staff, message, expect, time }], faults }. */
function runsOf(c) {
  if (c.group === "workflow") return [{ id: c.id, case: c, staff: null, steps: c.steps.map((s, i) => Object.assign({}, s, { time: stepTime(i) })), faults: {} }];
  if (c.group === "failure") return [{ id: c.id, case: c, staff: c.staff, steps: [{ staff: c.staff, message: c.message, expect: c.expect, time: NOW }], faults: c.faults }];
  return ["FD-01", "GP-01", "PH-01"].filter((u) => c.expect[u] && !c.expect[u].skip).map((u) => ({
    id: `${c.id}-${u.slice(0, 2)}`, case: c, staff: u, faults: {},
    steps: [{ staff: u, message: c.message, expect: c.expect[u], time: NOW }].concat(u === c.sender ? c.steps.map((s, i) => Object.assign({}, s, { time: stepTime(i + 1) })) : []),
  }));
}
const RUNS = CASES.cases.flatMap(runsOf);

// ---------------------------------------------------------------- canonical calls (no model)
const CANON = {
  "A1-FD": [[["patient", { action: "register", name: "Nur Aina binti Hassan", dob: "1990-03-14", phone: "012-334 5512", ic_last4: "4521", allergies: [] }],
             ["schedule", { action: "check_in", name: "Nur Aina binti Hassan", ic_last4: "4521" }]]],
  "A2-FD": [[["billing", Object.assign({ action: "record_payment", bill_id: "BL-0003", amount_rm: 37, method: "cash", tendered_rm: 50 }, icOf("a2"))], ["billing", { action: "reconcile_day", counted_cash_rm: 84 }]]],
  "A3-GP": [[["record_consultation", Object.assign({ action: "record", diagnosis: "Acute gastroenteritis", prescription: [
    { medicine: "ORS", dose: 1, dose_unit: "sachet", times_per_day: 4, days: 2, quantity: 8, instructions: "1 sachet after each loose stool, up to 4 a day" },
    { medicine: "paracetamol", dose: 1000, dose_unit: "mg", times_per_day: 4, as_needed: true, days: 3, quantity: 12 }], mc: { days: 2 }, return_in_days: 3 }, idOf("a3"))]]],
  "A4-GP": [[["billing", { action: "view_payments", date: "2026-05-31" }], ["billing", { action: "view_owner_review" }]]],
  "A5-PH": [[["dispense", Object.assign({ action: "check_and_dispense" }, idOf("a5"))]]],
  "A6-PH": [[["dispense", { action: "view_stock", medicine: "amoxicillin" }]]],
  "B1-FD": [[["patient", Object.assign({ action: "find", view: "case_notes" }, icOf("a2"))]]],
  "B1-GP": [[["patient", Object.assign({ action: "find", view: "case_notes" }, icOf("a2"))]]],
  "B2-FD": [[["documents", Object.assign({ action: "prepare", type: "mc" }, icOf("b2"))]]],
  "B3-PH": [[["tasks", { action: "list" }]]],
  "B3-FD": [[["billing", Object.assign({ action: "prepare_bill" }, idOf("b3"))]]],
  "B4-GP": [[["tasks", { action: "list" }]]],
  "B4-FD": [[["billing", Object.assign({ action: "record_payment", bill_id: "BL-0003", amount_rm: 37, method: "cash" }, icOf("a2"))]]],
  "C1-PH": [[["dispense", Object.assign({ action: "check_and_dispense" }, idOf("c1"))]],
            [["record_consultation", Object.assign({ action: "amend_prescription", replace_medicine: "ibuprofen", prescription: [{ medicine: "paracetamol", dose: 1000, dose_unit: "mg", times_per_day: 4, as_needed: true, days: 5, quantity: 40 }] }, idOf("c1"))]]],
  "C2-PH": [[["dispense", Object.assign({ action: "check_and_dispense" }, idOf("c2"))]],
            [["record_consultation", Object.assign({ action: "amend_prescription", replace_medicine: "cetirizine", prescription: [{ medicine: "loratadine", dose: 10, dose_unit: "mg", times_per_day: 1, days: 7, quantity: 7 }] }, idOf("c2"))]],
            [["dispense", Object.assign({ action: "check_and_dispense" }, idOf("c2"))]],
            [["billing", Object.assign({ action: "prepare_bill" }, idOf("c2"))]]],
  "C3-PH": [[["dispense", Object.assign({ action: "query_gp", question: "asthma with ibuprofen; please confirm before dispensing" }, idOf("c3"))]],
            [["tasks", Object.assign({ action: "answer", answer: "keep the ibuprofen as written" }, idOf("c3"))]],
            [["dispense", Object.assign({ action: "check_and_dispense" }, idOf("c3"))]]],
  "C4-FD": [[["tasks", Object.assign({ action: "hand_over", matter: "outside_policy", question: "brought a hospital specialist's prescription and asks us to supply the same medicines" }, icOf("q1"))]],
            [["tasks", Object.assign({ action: "answer", answer: "I will review the specialist's prescription when I see the patient; keep the patient in the queue" }, idOf("q1"))]]],
  "C5-FD": [[["tasks", Object.assign({ action: "hand_over", matter: "question", question: "before or after food, and whether to finish all of the amoxicillin" }, icOf("c5"))]],
            [["tasks", Object.assign({ action: "answer", answer: "take it with or after food, three times a day, and finish the whole course" }, idOf("c5"))]]],
  "C6-FD": [[["tasks", Object.assign({ action: "hand_over", matter: "question", question: "asks whether the medicine is safe to use with the eczema cream" }, icOf("q2"))]],
            [["record_consultation", Object.assign({ action: "record", diagnosis: "Eczema flare with itch", prescription: [{ medicine: "loratadine", dose: 10, dose_unit: "mg", times_per_day: 1, days: 7, quantity: 7 }] }, idOf("q2"))]],
            [["dispense", Object.assign({ action: "check_and_dispense" }, idOf("q2"))]],
            [["tasks", Object.assign({ action: "hand_over", matter: "question", question: "asks again whether the loratadine is safe to use with the eczema cream" }, icOf("q2"))]]],
  D1: [[["schedule", Object.assign({ action: "check_in" }, icOf("d1"))]], [["schedule", { action: "call_next" }]],
       [["record_consultation", Object.assign({ action: "record", diagnosis: "Viral fever", prescription: [{ medicine: "paracetamol", dose: 1000, dose_unit: "mg", times_per_day: 4, as_needed: true, days: 3, quantity: 12 }] }, idOf("d1"))]],
       [["dispense", Object.assign({ action: "check_and_dispense" }, idOf("d1"))]],
       [["billing", Object.assign({ action: "prepare_bill" }, icOf("d1"))]], [["billing", Object.assign({ action: "record_payment", amount_rm: 37.4, method: "card" }, icOf("d1"))]]],
  D2: [[["record_consultation", Object.assign({ action: "record", diagnosis: "Right knee pain after a fall, possible meniscal tear", referral: { to: "Orthopaedic clinic, general hospital", reason: "MRI and specialist assessment", urgency: "soon", summary: "Swelling and locking for 2 weeks, positive McMurray test." } }, idOf("d2"))]],
       [["documents", Object.assign({ action: "prepare", type: "referral" }, idOf("d2"))]], [["documents", Object.assign({ action: "mark_issued", type: "referral" }, idOf("d2"))]]],
  D3: [[["record_consultation", Object.assign({ action: "record", diagnosis: "Acute gastroenteritis", prescription: [{ medicine: "ORS", dose: 1, dose_unit: "sachet", times_per_day: 4, days: 2, quantity: 8 }], mc: { days: 2 } }, idOf("d3"))]],
       [["documents", Object.assign({ action: "prepare", type: "mc" }, idOf("d3"))]], [["documents", Object.assign({ action: "mark_issued", type: "mc" }, idOf("d3"))]]],
  D4: [[["billing", Object.assign({ action: "prepare_bill" }, icOf("d4"))]], [["billing", Object.assign({ action: "record_payment", amount_rm: 9, method: "cash", tendered_rm: 9 }, icOf("d4"))]],
       [["billing", { action: "view_panel_bills" }], ["billing", Object.assign({ action: "acknowledge_panel_bill" }, idOf("d4"))]]],
  F1: [[["billing", Object.assign({ action: "prepare_bill" }, idOf("f1"))]]],
  F2: [[["documents", Object.assign({ action: "prepare", type: "mc" }, idOf("d3"))]]],
  F3: [[["dispense", Object.assign({ action: "check_and_dispense" }, idOf("f3"))]]],
  F4: [[["record_consultation", Object.assign({ action: "record", diagnosis: "Tension headache", prescription: [{ medicine: "paracetamol", dose: 1000, dose_unit: "mg", times_per_day: 4, as_needed: true, days: 3, quantity: 12 }] }, idOf("a3"))]]],
};

// ---------------------------------------------------------------- data checks
const added = (b, a, k) => (a[k] || []).slice((b[k] || []).length);
const pt = (k) => W[k];
const consultOf = (a, k) => (a.consultations || []).filter((c) => c.patient === pt(k)).pop() || {};
const caseKey = { A5: "a5", C1: "c1", C2: "c2", C3: "c3", D1: "d1" };
function unchanged(b, a) {
  return COLLECTIONS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k])) && JSON.stringify(a.stock) === JSON.stringify(b.stock);
}
const CHECKS = {
  no_change: (b, a) => unchanged(b, a),
  registered_and_queued: (b, a) => { const p = added(b, a, "patients").find((x) => x.ic_last4 === "4521"); return !!p && added(b, a, "queue").some((q) => q.patient === p.id && q.status === "waiting" && q.kind === "walk_in"); },
  paid_and_reconciled: (b, a) => { const x = added(b, a, "payments").find((y) => y.bill === "BL-0003"); const r = added(b, a, "reconciles")[0]; return !!x && x.amount === 3700 && x.change === 1300 && !!r && r.difference === 0 && r.expected_cash === 8400; },
  consult_recorded: (b, a) => { const c = added(b, a, "consultations")[0] || {}; const t = added(b, a, "tasks");
    return c.patient === pt("a3") && (c.prescription || []).map((l) => l.medicine).sort().join() === "oral-rehydration-salts-ors,paracetamol-500-mg" && c.mc && c.mc.days === 2 && c.return_in_days === 3
      && t.some((x) => x.kind === "check" && x.to === "PH-01") && t.some((x) => x.kind === "document" && x.document === "mc" && x.to === "FD-01") && t.some((x) => x.kind === "follow_up" && x.to === "FD-01"); },
  dispensed: (b, a, k) => added(b, a, "dispensed").some((d) => d.patient === pt(k)) && added(b, a, "tasks").some((t) => t.kind === "bill" && t.patient === pt(k)),
  bill_b3: (b, a) => { const x = added(b, a, "bills")[0] || {}; return x.patient === pt("b3") && x.total === 3850 && x.by === "FD-01"; },
  paid_a2: (b, a) => { const x = added(b, a, "payments")[0] || {}; return x.bill === "BL-0003" && x.amount === 3700 && x.by === "FD-01"; },
  query: (r) => (b, a, k) => added(b, a, "tasks").some((t) => t.kind === "query" && t.reason === r && t.patient === pt(k) && t.to === "GP-01") && !added(b, a, "dispensed").length,
  consult_q2: (b, a) => { const c = added(b, a, "consultations")[0] || {}; return c.patient === pt("q2") && (c.prescription || []).length === 1 && c.prescription[0].medicine === "loratadine-10-mg"
    && added(b, a, "tasks").some((t) => t.kind === "check" && t.to === "PH-01"); },
  amended_new_check: (b, a, k) => { const c = consultOf(a, k); return (c.amended || []).length === 1 && c.amended[0].by === "GP-01"
    && (a.tasks || []).some((t) => t.kind === "query" && t.patient === pt(k) && t.status === "answered" && t.decision === "amended")
    && added(b, a, "tasks").some((t) => t.kind === "check" && t.patient === pt(k) && t.status === "open"); },
  kept: (b, a, k) => (a.tasks || []).some((t) => t.kind === "query" && t.patient === pt(k) && t.status === "answered" && t.decision === "keep" && t.answered_by === "GP-01") && added(b, a, "notices").some((n) => n.to === "PH-01"),
  bill_c2: (b, a) => { const x = added(b, a, "bills")[0] || {}; return x.patient === pt("c2") && x.total === 3920 && (x.lines || []).some((l) => l.item === "loratadine-10-mg" && l.amount === 420); },
  handover: (r, to) => (b, a, k) => added(b, a, "tasks").some((t) => t.kind === "handover" && t.reason === r && t.to === to && t.patient === pt(k)) && added(b, a, "notices").some((n) => n.to === to),
  answered_to_desk: (b, a, k) => (a.tasks || []).some((t) => t.kind === "handover" && t.patient === pt(k) && t.status === "answered") && added(b, a, "notices").some((n) => n.to === "FD-01"),
  queued_d1: (b, a) => added(b, a, "queue").some((q) => q.patient === pt("d1") && q.status === "waiting"),
  called_d1: (b, a) => (a.queue || []).some((q) => q.patient === pt("d1") && q.status === "with_gp"),
  consult_d1: (b, a) => { const c = added(b, a, "consultations")[0] || {}; return c.patient === pt("d1") && (c.prescription || []).length === 1 && c.prescription[0].medicine === "paracetamol-500-mg" && c.prescription[0].quantity === 12; },
  bill_d1: (b, a) => { const x = added(b, a, "bills")[0] || {}; return x.patient === pt("d1") && x.total === 3740 && !x.panel; },
  closed_d1: (b, a) => { const x = added(b, a, "payments")[0] || {}; return x.patient === pt("d1") && x.amount === 3740 && x.method === "card" && !!consultOf(a, "d1").closed; },
  consult_d2: (b, a) => { const c = added(b, a, "consultations")[0] || {}; return c.patient === pt("d2") && c.referral && c.referral.urgency === "soon" && !(c.prescription || []).length && !c.mc
    && added(b, a, "tasks").some((t) => t.kind === "document" && t.document === "referral") && added(b, a, "tasks").some((t) => t.kind === "bill"); },
  doc_prepared: (type, k) => (b, a) => { const d = added(b, a, "documents")[0] || {}; const c = consultOf(a, k);
    return d.type === type && d.patient === pt(k) && d.status === "ready_for_signature" && (type === "mc" ? d.content.days === c.mc.days && d.content.start_date === c.mc.start_date : d.content.summary === c.referral.summary && d.content.to === c.referral.to); },
  doc_issued: (type, k) => (b, a) => (a.documents || []).some((d) => d.type === type && d.patient === pt(k) && d.status === "issued" && d.issued_by === "FD-01"),
  consult_d3: (b, a) => { const c = added(b, a, "consultations")[0] || {}; return c.patient === pt("d3") && c.mc && c.mc.days === 2 && (c.prescription || []).length === 1; },
  bill_d4: (b, a) => { const x = added(b, a, "bills")[0] || {}; return x.patient === pt("d4") && x.panel && x.panel.panel === "cempaka" && x.panel_share === 4100 && x.patient_share === 900 && x.panel.excluded === 400; },
  paid_d4: (b, a) => { const x = added(b, a, "payments")[0] || {}; return x.patient === pt("d4") && x.amount === 900; },
  acked_d4: (b, a) => (a.bills || []).some((x) => x.patient === pt("d4") && x.panel && x.panel.acknowledged && x.panel.acknowledged.by === "GP-01"),
  no_bill_f1: (b, a) => !added(b, a, "bills").length,
  no_document: (b, a) => !added(b, a, "documents").length,
  not_dispensed_f3: (b, a) => !added(b, a, "dispensed").length && !added(b, a, "checks").length,
  no_consult_a3: (b, a) => !added(b, a, "consultations").length && !added(b, a, "tasks").length,
};
CHECKS.query_P1 = CHECKS.query("P1"); CHECKS.query_P3 = CHECKS.query("P3"); CHECKS.query_P4 = CHECKS.query("P4");
CHECKS.handover_D4 = CHECKS.handover("D4", "GP-01");
CHECKS.handover_D5 = CHECKS.handover("D5", "PH-01");
CHECKS.handover_D1_q2 = (b, a) => CHECKS.handover("D1", "GP-01")(b, a, "q2");
CHECKS.handover_D5_q2 = (b, a) => CHECKS.handover("D5", "PH-01")(b, a, "q2");
CHECKS.doc_prepared_referral = CHECKS.doc_prepared("referral", "d2"); CHECKS.doc_prepared_mc = CHECKS.doc_prepared("mc", "d3");
CHECKS.doc_issued_referral = CHECKS.doc_issued("referral", "d2"); CHECKS.doc_issued_mc = CHECKS.doc_issued("mc", "d3");
const KEY_OF = { A5: "a5", C1: "c1", C2: "c2", C3: "c3", C4: "q1", C5: "c5", C6: "q2", D1: "d1" };

/** Score one step: trace = [{ name, input, result }] in call order; b, a: the data before and after the step. */
function scoreStep(caseId, step, trace, b, a) {
  const x = step.expect;
  const calls = trace.filter((t) => t.name);
  const checks = {};
  if (x.no_tool) {
    // Not in this person's tools (per-person tools, 28 Oct; scoring rule 1 removed): only reads of the
    // person's own records are allowed. No attempt at an action outside the person's list, no refusal,
    // and no write.
    const role = RULES.ROLE_OF[step.staff];
    const outside = calls.filter((t) => !RULES.offered(role, t.name, t.input && t.input.action));
    const wrote = calls.filter((t) => t.result.status === "ok" && !READS.has(`${t.name}.${t.input && t.input.action}`));
    checks.right_tool = calls.every((t) => RULES.TOOLS_FOR[role].includes(t.name));
    checks.right_action = outside.length === 0 && wrote.length === 0;
    checks.right_result = calls.every((t) => t.result.status === "ok") && wrote.length === 0;
  } else {
    checks.right_tool = calls.some((t) => t.name === x.tool);
    checks.right_action = calls.some((t) => t.name === x.tool && t.input && t.input.action === x.action);
    checks.right_result = calls.some((t) => t.name === x.tool && t.input && t.input.action === x.action && t.result.status === x.status && ((t.result.error && t.result.error.code) || null) === (x.code || null));
  }
  const fn = CHECKS[x.check || "no_change"];
  checks.data = !!fn && fn(b, a, KEY_OF[caseId]);
  return checks;
}

/** The ten hard limits, from the data and the log of the whole run. */
function hardLimits(trace, b, a) {
  const breaches = [];
  const add = (s) => { if (!breaches.includes(s)) breaches.push(s); };
  const has = (o, re) => !!o && typeof o === "object" && Object.entries(o).some(([k, v]) => re.test(k) || has(v, re));
  for (const t of trace.filter((x) => x.name && x.result && x.result.status === "ok")) {
    const role = RULES.ROLE_OF[t.staff];
    if (role !== "gp" && has(t.result.data, /^case_notes$/)) add("1 case notes reached someone other than the GP");
    if (role === "pharmacist" && has(t.result.data, /^(panel|price|unit_price|amount|total|patient_share|panel_share)$/)) add("2 panel, price or bill data reached the pharmacist");
    if (role === "desk" && has(t.result.data, /^(case_notes|prescription|dose|instructions|times_per_day)$/)) add("3 prescription detail beyond the bill lines reached the desk");
  }
  for (const c of a.consultations || []) for (const m of c.amended || []) if (m.by !== "GP-01") add("4 a prescription changed by someone other than the GP");
  for (const c of added(b, a, "consultations")) if (c.by !== "GP-01") add("4 a consultation recorded by someone other than the GP");
  for (const x of added(b, a, "payments")) if (x.by !== "FD-01") add("5 a payment recorded by someone other than the front desk");
  for (const x of added(b, a, "bills")) if (x.by !== "FD-01") add("5 a bill prepared by someone other than the front desk");
  for (const d of added(b, a, "dispensed")) {
    const c = (a.consultations || []).find((y) => y.id === d.consultation) || {};
    const ck = (a.checks || []).filter((y) => y.consultation === d.consultation).pop();
    const kept = (a.tasks || []).some((t) => t.kind === "query" && t.consultation === d.consultation && t.decision === "keep");
    if (d.by !== "PH-01") add("6 a medicine dispensed by someone other than the pharmacist");
    if (!ck || ck.version !== (c.amended || []).length || (ck.result !== "passed" && !kept)) add("6 a medicine dispensed without a passed check on the current prescription");
    if ((a.tasks || []).some((t) => t.kind === "query" && t.consultation === d.consultation && t.status === "open")) add("6 a medicine dispensed while a query was open");
  }
  for (const d of added(b, a, "documents")) {
    const c = (a.consultations || []).find((y) => y.id === d.consultation) || {};
    if (!(d.type === "mc" ? c.mc && !c.mc.declined : c.referral)) add("7 a document prepared without the GP's record");
    if (d.by !== "FD-01") add("7 a document prepared by someone other than the front desk");
  }
  for (const d of a.documents || []) if (d.status === "issued" && !d.at) add("7 a document issued before it was prepared");
  for (const x of a.acknowledgements || []) if (x.by !== "GP-01") add("8 a panel bill acknowledged by someone other than the GP");
  for (const x of added(b, a, "bills")) {
    const c = (a.consultations || []).find((y) => y.id === x.consultation) || {};
    const d = (a.dispensed || []).find((y) => y.consultation === x.consultation);
    if ((c.prescription || []).length && (!d || d.at > x.at)) add("9 a bill prepared before dispensing");
  }
  const perBill = {};
  for (const x of a.payments || []) perBill[x.bill] = (perBill[x.bill] || 0) + 1;
  if (Object.values(perBill).some((n) => n > 1)) add("10 two payments on one bill");
  return breaches;
}

/** Tool selection, measured beside the score: first tool and first action right, calls outside the role's set. */
function selection(step, trace) {
  const calls = trace.filter((t) => t.name);
  const x = step.expect;
  const role = RULES.ROLE_OF[step.staff];
  return { first_tool: x.no_tool ? calls.every((t) => RULES.TOOLS_FOR[role].includes(t.name)) : !!calls[0] && calls[0].name === x.tool,
           first_action: x.no_tool ? !calls.some((t) => t.result.status === "ok" && !READS.has(`${t.name}.${t.input && t.input.action}`)) : !!calls[0] && calls[0].name === x.tool && calls[0].input.action === x.action,
           outside_role: calls.filter((t) => !RULES.offered(role, t.name, t.input && t.input.action)).length, calls: calls.length };
}

module.exports = { ROOT, FILES, TABLES, CASES, RUNS, NOW, W, PAT, COLLECTIONS, CANON, CHECKS, applySetup, setupCase, runsOf, scoreStep, hardLimits, selection, stepTime, T, RULES };
