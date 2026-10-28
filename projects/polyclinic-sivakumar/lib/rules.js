/* Policy calculations written once and used by the back end, both hooks, the pages and the tests:
 * who a staff ID is and what each role is offered (PS-RP-01), the medicine lookup, the pharmacist's
 * four checks (PS-AC-02), prices and the panel split (PS-PL, PS-PN-03), clinic days and slots
 * (PS-HS-01 to PS-HS-05), and the sentences written in code for fixed outcomes (access-level reply
 * rule): "Sent to ...", no access, no authority, and the two-sentence notices a receiver reads.
 * Reads the tables in resources/policy_tables.json, never a copy.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.PSRules = factory(root.PSFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  // PS-RP-01: the tools each role is offered at sign-in, and the actions inside each tool by role. A tool is
  // offered with only the role's own actions (tools.js toolsFor), so another person's action is not in the list.
  const TOOLS_FOR = {
    desk: ["patient", "schedule", "billing", "documents", "tasks"],
    gp: ["patient", "schedule", "record_consultation", "billing", "tasks"],
    pharmacist: ["patient", "dispense", "tasks"],
  };
  const ACTIONS = {
    patient: { find: ["desk", "gp", "pharmacist"], register: ["desk"], update_contact: ["desk"] },
    schedule: { book: ["desk"], change: ["desk"], cancel: ["desk"], check_in: ["desk"], view_queue: ["desk", "gp"], call_next: ["gp"] },
    record_consultation: { record: ["gp"], amend_prescription: ["gp"] },
    dispense: { check_and_dispense: ["pharmacist"], query_gp: ["pharmacist"], view_stock: ["pharmacist"] },
    billing: { prepare_bill: ["desk"], record_payment: ["desk"], reconcile_day: ["desk"], view_bill: ["desk", "gp"], view_payments: ["desk", "gp"],
               view_owner_review: ["gp"], view_panel_bills: ["gp"], acknowledge_panel_bill: ["gp"] },
    documents: { prepare: ["desk"], mark_issued: ["desk"], list: ["desk"] },
    tasks: { list: ["desk", "gp", "pharmacist"], hand_over: ["desk"], answer: ["gp", "pharmacist"] },
  };
  // The words of a refusal: "I'm sorry, you can't <cant>. Only <person>, can <can>."
  const WORDS = {
    "patient.register": ["register patients", "register a patient"],
    "patient.update_contact": ["update contact details", "update a patient's contact details"],
    "schedule.book": ["book appointments", "book an appointment"], "schedule.change": ["change appointments", "change an appointment"],
    "schedule.cancel": ["cancel appointments", "cancel an appointment"], "schedule.check_in": ["check patients in", "check a patient in"],
    "schedule.view_queue": ["see the queue", "see the queue"], "schedule.call_next": ["call the next patient", "call the next patient"],
    "record_consultation.record": ["record consultations", "record a consultation"],
    "record_consultation.amend_prescription": ["change a prescription", "change a prescription"],
    "dispense.check_and_dispense": ["check or dispense prescriptions", "check and dispense them"], "dispense.query_gp": ["query a prescription", "query a prescription"],
    "dispense.view_stock": ["see the stock", "see the stock"],
    "billing.prepare_bill": ["prepare bills", "prepare a bill"], "billing.record_payment": ["record payments", "record a payment"],
    "billing.reconcile_day": ["reconcile the day", "reconcile the day"], "billing.view_bill": ["see bills", "see a bill"],
    "billing.view_payments": ["see payments", "see the day's payments"], "billing.view_owner_review": ["see the owner review list", "see the owner review list"],
    "billing.view_panel_bills": ["see the panel bills", "see the panel bills"], "billing.acknowledge_panel_bill": ["acknowledge panel bills", "acknowledge a panel bill"],
    "documents.prepare": ["prepare MCs or referral letters", "prepare an MC or a referral letter"],
    "documents.mark_issued": ["issue MCs or referral letters", "issue an MC or a referral letter"], "documents.list": ["see the documents list", "see the documents list"],
    "tasks.hand_over": ["hand over a patient's question", "hand one over"], "tasks.answer": ["answer that", "answer it"],
  };
  const ROLE_OF = { "FD-01": "desk", "GP-01": "gp", "PH-01": "pharmacist" };
  const ID_OF = { desk: "FD-01", gp: "GP-01", pharmacist: "PH-01" };

  function createRules(tables) {
    const staffById = Object.fromEntries(tables.staff.map((s) => [s.id, s]));
    const MED = tables.medicines;
    const SVC = tables.services;

    function who(id) {
      const s = staffById[id];
      return s ? { id, name: s.name, first: s.first, role: s.role, job: s.job } : null;
    }
    const nameOf = (id) => (staffById[id] ? staffById[id].name : id);
    const firstOf = (id) => (staffById[id] ? staffById[id].first : id);
    /** "Siti Kasim, clinic assistant" */
    const person = (id) => `${nameOf(id)}, ${staffById[id].job.charAt(0).toLowerCase()}${staffById[id].job.slice(1)}`;
    const offered = (role, tool, action) => !!(ACTIONS[tool] && ACTIONS[tool][action] && ACTIONS[tool][action].includes(role));
    const ownersOf = (tool, action) => ((ACTIONS[tool] && ACTIONS[tool][action]) || []).map((r) => ID_OF[r]);

    // ---- medicines and services ----
    /** "Ibuprofen", "ibuprofen 400 mg", "ibuprofen-400-mg" -> the formulary key, or null. */
    function medicineKey(text) {
      if (!text) return null;
      const t = String(text).toLowerCase().trim();
      if (MED[t]) return t;
      const first = t.replace(/[^a-z ]/g, " ").trim().split(/\s+/)[0];
      const hits = Object.keys(MED).filter((k) => MED[k].name.toLowerCase().split(/\s+/)[0].replace(/[^a-z]/g, "") === first
        || (first === "ors" && k === "oral-rehydration-salts-ors"));
      return hits.length === 1 ? hits[0] : null;
    }
    function serviceKey(text) {
      if (!text) return null;
      const t = String(text).toLowerCase().trim();
      if (SVC[t]) return t;
      const hits = Object.keys(SVC).filter((k) => SVC[k].name.toLowerCase() === t || SVC[k].name.toLowerCase().includes(t) || t.includes(SVC[k].name.toLowerCase()));
      if (/consult/.test(t)) return "gp-consultation";
      return hits.length === 1 ? hits[0] : null;
    }
    const itemName = (k) => (MED[k] ? MED[k].name : SVC[k] ? SVC[k].name : k);

    // ---- PS-AC-02: the pharmacist's four checks ----
    /** One prescription line complete? Returns the missing fields. */
    function missingFields(l) {
      const need = ["medicine", "dose", "dose_unit", "times_per_day", "quantity", "instructions"];
      return need.filter((k) => l[k] === undefined || l[k] === null || l[k] === "");
    }
    function check(patient, lines, stock) {
      const failed = [];
      for (const l of lines) {
        const m = MED[l.medicine];
        const miss = missingFields(l);
        if (!m || miss.length) { failed.push({ reason: "P2", check: "complete", medicine: l.medicine, detail: `missing ${miss.join(", ") || "a known medicine"}` }); continue; }
        for (const a of patient.allergies || []) {
          const cls = tables.allergy_map[a];
          if (cls && m.drug_class === cls) failed.push({ reason: "P1", check: "allergy", medicine: l.medicine, detail: `${a} on record; ${m.name} is in the ${cls} class` });
        }
        const daily = Number(l.dose) * Number(l.times_per_day);
        if (l.dose_unit !== m.dose_unit || Number(l.dose) < m.dose_min || Number(l.dose) > m.dose_max || daily > m.day_max)
          failed.push({ reason: "P2", check: "dose", medicine: l.medicine, detail: `${l.dose} ${l.dose_unit} ${l.times_per_day} times a day against ${m.dose_min} to ${m.dose_max} ${m.dose_unit}, at most ${m.day_max} a day` });
        const s = stock[l.medicine];
        if (s === undefined || s === null) failed.push({ reason: "stock_record_missing", check: "stock", medicine: l.medicine, detail: "no stock record" });
        else if (s.qty < Number(l.quantity)) failed.push({ reason: "P3", check: "stock", medicine: l.medicine, detail: `${s.qty} in stock, ${l.quantity} needed` });
      }
      return failed;
    }

    // ---- PS-PL, PS-PN-03: prices and the panel split ----
    /** The bill lines and the split. panel: the panel row or null. Returns { lines, missing, total, covered, excluded, panel_share, patient_share }. */
    function bill(services, dispensedLines, panel, priceFault) {
      const lines = [], missing = [];
      const priceOf = (k, isMed) => {
        if (priceFault === k) return null;
        if (panel && !isMed && panel.services[k] !== undefined) return panel.services[k];
        return isMed ? (MED[k] ? MED[k].price : null) : (SVC[k] ? SVC[k].price : null);
      };
      for (const s of services) {
        const unit = priceOf(s, false);
        if (unit === null || unit === undefined) { missing.push(itemName(s)); continue; }
        if (unit === 0) continue;
        lines.push({ item: s, name: itemName(s), qty: 1, unit, amount: unit, covered: panel ? !panel.excluded.includes(s) : null });
      }
      for (const l of dispensedLines) {
        const unit = priceOf(l.medicine, true);
        if (unit === null || unit === undefined) { missing.push(itemName(l.medicine)); continue; }
        lines.push({ item: l.medicine, name: itemName(l.medicine), qty: Number(l.quantity), unit, amount: unit * Number(l.quantity), covered: panel ? !panel.excluded.includes(l.medicine) : null });
      }
      const total = lines.reduce((a, l) => a + l.amount, 0);
      if (!panel) return { lines, missing, total, covered: null, excluded: null, panel_share: 0, patient_share: total };
      const covered = lines.filter((l) => l.covered).reduce((a, l) => a + l.amount, 0);
      const excluded = total - covered;
      const panelShare = Math.min(Math.max(covered - panel.co_pay, 0), panel.limit);
      return { lines, missing, total, covered, excluded, co_pay: Math.min(panel.co_pay, covered), panel_share: panelShare, patient_share: total - panelShare };
    }
    const panelOf = (patient) => (patient && patient.panel ? tables.panels[patient.panel.panel] || null : null);
    const panelValid = (panel, iso) => panel.valid_from <= iso && iso <= panel.valid_to;

    // ---- PS-HS-01 to PS-HS-05: days and slots ----
    const H = tables.hours;
    const isOpen = (iso) => !(iso in tables.holidays);
    function nextOpen(iso) { let d = iso; while (!isOpen(d)) d = F.addDays(d, 1); return d; }
    const mins = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
    function slotProblem(iso, hm) {
      if (!isOpen(iso)) return "clinic_closed";
      if (!/^\d\d:\d\d$/.test(hm || "") || mins(hm) < mins(H.first_slot) || mins(hm) > mins(H.last_slot) || mins(hm) % H.slot_minutes) return "outside_hours";
      return null;
    }

    // ---- sentences written in code (access-level reply rule) ----
    const people = (ids) => ids.map(person).join(", and ");
    const say = {
      sent: (to) => `Sent to ${person(to)}.`,
      noAuthority: (tool, action) => {
        const w = WORDS[`${tool}.${action}`] || [`do that`, `do that`];
        return `I'm sorry, you can't ${w[0]}. Only ${people(ownersOf(tool, action))}, can ${w[1]}.`;
      },
      noAccess: (what, ids, plural) => `I'm sorry, ${what} ${plural ? "aren't" : "isn't"} open to you. Only ${people(ids)}, can access ${plural ? "them" : "it"}.`,
      wrongStage: (patientName, stage, reason) => stage === "pharmacy"
        ? `I'm sorry, that can't be handed over now. ${patientName}'s prescription is with ${person("PH-01")}, who raises any medicine concern with Dr Sivakumar.`
        : reason === "D5" ? `I'm sorry, that can't be handed over now. ${person("PH-01")}, answers medicine questions once the medicine is dispensed.`
        : `I'm sorry, that can't be handed over now. ${patientName}'s consultation is already recorded, so check the patient in again to see Dr Sivakumar.`,
      noGpRecord: (patientName, type) => `I'm sorry, there's no ${type === "referral" ? "referral" : "MC"} in Dr Sivakumar's record for ${patientName}. Only ${person("GP-01")}, can decide ${type === "referral" ? "a referral" : "an MC"}, during the consultation.`,
    };
    /** The two-sentence notice the receiver reads first (PS-RP-06), written in code. */
    /** A clause from a staff member's words, without its closing punctuation, so the notice ends once. */
    const clause = (s) => String(s || "").trim().replace(/[.!?;,\s]+$/, "");
    function handoverNotice(task, patient, todayIso) {
      const r = tables.reasons[task.reason];
      const who = `${patient.name} (${patient.id}, ${F.age(patient.dob, todayIso)})`;
      if (task.reason.startsWith("P") && task.auto) return `Ms Yong's check of the prescription for ${who} failed on ${r.words}: ${clause(task.question)}. The prescription is held until you amend it or answer to keep it.`;
      if (task.reason.startsWith("P")) return `Ms Yong has queried the prescription for ${who}: ${r.words}, ${clause(task.question)}. The prescription is held until you amend it or answer to keep it.`;
      if (task.to === "PH-01") return `Siti Kasim has handed over a question from ${who} to you: ${clause(task.question)}. Your answer goes back to Siti Kasim to pass on.`;
      return `Siti Kasim has handed ${who} over to you: ${r.words}, ${clause(task.question)}. Your answer goes back to Siti Kasim.`;
    }
    function answerNotice(task, patient, answer, fromId) {
      const pn = patient.name;
      answer = clause(answer);
      if (task.reason && task.reason.startsWith("P")) return `${nameOf(fromId)} has answered your query on ${pn}'s prescription: ${answer}. ${task.decision === "keep" ? "The hold is lifted, so you can dispense it as written." : "Check the prescription again before dispensing."}`;
      return `${nameOf(fromId)} has answered your handover on ${pn}: ${answer}. Please pass this on to ${pn}.`;
    }

    return { tables, MED, SVC, who, nameOf, firstOf, person, offered, ownersOf, medicineKey, serviceKey, itemName, missingFields, check, bill,
      panelOf, panelValid, isOpen, nextOpen, slotProblem, say, handoverNotice, answerNotice, TOOLS_FOR, ACTIONS, ROLE_OF, ID_OF };
  }

  return { createRules, TOOLS_FOR, ACTIONS, WORDS, ROLE_OF, ID_OF };
});
