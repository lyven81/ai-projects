/* The PostToolUse hook: one shared hook after all seven tools.
 *
 * postToolUse(tool, input, raw, staffId, env) -> { result, changes }
 *   raw:     what the back end returned (sen, Unix seconds, stored keys), or { backendRefusal }.
 *   result:  the shared result shape: amounts in RM, times in Malaysia time, medicine names, only the
 *            fields the signed-in role may see (PS-RP-02 to PS-RP-04), next_step with the Basis line and,
 *            for a fixed outcome, the reply written in code (say): a handover sent, an answer recorded,
 *            no access, no authority.
 *   changes: one line per thing converted, filtered or written (shown under the hood).
 * The field filter is the last line of the privacy rules: case notes reach only the GP; the
 * pharmacist sees nothing about panels, prices or bills; the desk sees no prescription detail beyond
 * the bill lines.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"));
  else root.PSPostToolUse = factory(root.PSFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  function postToolUse(tool, input, raw, staffId, env) {
    const R = env.rules;
    const now = env.now;
    const today = F.mytDate(now);
    const staff = R.who(staffId);
    const role = staff.role;
    const changes = [];
    const did = (s) => changes.push(s);
    const key = `${tool}.${input.action}`;
    const ok = (data, next) => ({ result: F.ok(tool, data, next), changes });
    const med = (k) => R.itemName(k);
    const rx = (lines) => (lines || []).map((l) => ({ medicine: med(l.medicine), dose: `${l.dose} ${l.dose_unit}`, times_per_day: l.times_per_day, as_needed: !!l.as_needed,
      days: l.days, quantity: l.quantity, instructions: l.instructions }));
    const ageOf = (p) => F.age(p.dob, today);
    const withGpNote = "Dr Sivakumar a/l Ramachandran, general practitioner and owner";

    if (raw && raw.backendRefusal) {
      const e = raw.backendRefusal;
      did(`Back end refused on its own: ${e.code}`);
      let next = { text: "Nothing was changed.", basis: F.CODES[e.code] ? F.CODES[e.code].clause : null };
      if (e.code === "no_gp_record" && e.data) next = { text: "Only Dr Sivakumar decides an MC or a referral, during the consultation (PS-AC-07).", person: "GP-01", say: R.say.noGpRecord(e.data.patient, e.data.type), basis: "PS-AC-07" };
      if (e.code === "wrong_stage" && e.data) next = { text: "A desk handover follows the visit: to Dr Sivakumar before the consultation, to Ms Yong after dispensing, an unwell patient to Dr Sivakumar at any time (PS-RP-06).", say: R.say.wrongStage(e.data.patient, e.data.stage, e.data.reason), basis: "PS-RP-06" };
      if (e.code === "keep_not_possible" && e.data) next = { text: "Only an amended prescription can go ahead (PS-AC-03); the prescription stays held.", person: "GP-01",
        say: e.data.stock.length ? `I'm sorry, ${e.data.stock.join(" and ")} ${e.data.stock.length > 1 ? "are" : "is"} out of stock, so it can't be dispensed as written. Please change it with Amend prescription.`
          : `I'm sorry, ${e.data.patient}'s prescription is incomplete, so it can't be dispensed as written. Please complete it with Amend prescription.`, basis: "PS-AC-03" };
      if (e.code === "mc_declined") next = { text: "Dr Sivakumar declined the MC in the consultation (PS-AC-07); nothing was prepared.", person: "GP-01", basis: "PS-AC-07" };
      if (e.code === "identifier_required" || e.code === "identity_not_verified") next = { text: "Ask for the full name with the IC last 4 digits or the phone number.", basis: F.CODES[e.code].clause };
      if (e.code === "panel_schedule_expired") next = { text: "No rule covers a visit outside the panel's period yet, and nothing changed. Dr Sivakumar, as owner, decides.", person: "GP-01", basis: "PS-PN-05" };
      const data = e.data && e.data.patient_share !== undefined ? { patient_share: F.rm(e.data.patient_share) } : e.data && e.data.patient ? null : e.data;
      return { result: F.fail(tool, e.code, e.message, { data, next_step: next }), changes };
    }

    // ---------------------------------------------------------------- patient
    if (tool === "patient") {
      const p = raw.patient;
      const base = { patient_id: p.id, name: p.name, age: ageOf(p) };
      let data;
      if (role === "desk") {
        data = Object.assign(base, { date_of_birth: p.dob, phone: p.phone, ic_last4: p.ic_last4, allergy_flags: p.allergies.length ? p.allergies : ["none recorded"],
          panel: p.panel ? `${R.tables.panels[p.panel.panel].name}, member ${p.panel.member_id}` : "not on a panel" });
        did("Desk view: contact, panel and allergy flags; no conditions, medicines or case notes (PS-RP-04)");
      } else if (role === "pharmacist") {
        data = Object.assign(base, { allergies: p.allergies.length ? p.allergies : ["none recorded"], conditions: p.conditions, current_medicines: p.current_medicines.map(med) });
        did("Pharmacist view: allergies, conditions, current medicines; nothing about panels, prices or bills (PS-RP-03)");
      } else {
        data = Object.assign(base, { allergies: p.allergies.length ? p.allergies : ["none recorded"], conditions: p.conditions, current_medicines: p.current_medicines.map(med),
          panel: p.panel ? R.tables.panels[p.panel.panel].name : "not on a panel", last_visits: raw.last_visits });
        if (raw.notes) { data.case_notes = raw.notes; did("Case notes included: GP only (PS-RP-02)"); }
      }
      if (raw.queue && key === "patient.find") data.today = raw.queue.status === "with_gp" ? "with the GP now" : raw.queue.status === "waiting" ? "waiting in the queue" : "seen today";
      if (raw.bookings && raw.bookings.length && role !== "pharmacist") data.bookings = raw.bookings.map((a) => `${a.id} ${F.dayLabel(a.start.slice(0, 10))} ${a.start.slice(11, 16)}`);
      if (key === "patient.register") return ok(data, { text: `${p.name} is registered as ${p.id}. Check the patient in when ready.`, basis: `PS-HS-07 · ${p.id} registered ${F.dayLabel(today)}` });
      if (key === "patient.update_contact") return ok(data, { text: "Contact updated and logged.", basis: `PS-HS-07 · ${p.id}` });
      return ok(data, { basis: `PS-HS-04 · ${p.id}, data at ${F.myt(now)}` });
    }

    // ---------------------------------------------------------------- schedule
    if (tool === "schedule") {
      if (key === "schedule.view_queue") {
        const w = raw.waiting.map((q, i) => { const p = env.store.get("patients").find((x) => x.id === q.patient); return { position: i + 1, patient_id: p.id, name: p.name, age: ageOf(p), kind: q.kind.replace("_", "-"), arrived: F.hhmm(q.arrived), appointment_time: q.appointment_time }; });
        const g = raw.with_gp ? env.store.get("patients").find((x) => x.id === raw.with_gp.patient) : null;
        return ok({ with_gp: g ? `${g.name} (${g.id})` : "nobody", waiting: w, bookings_today: raw.bookings.map((a) => `${a.id} ${a.start.slice(11, 16)}`) }, { basis: `PS-HS-06 · queue at ${F.hhmm(now)}` });
      }
      if (key === "schedule.call_next") {
        const p = raw.patient;
        return ok({ called: `${p.name} (${p.id}, ${ageOf(p)})`, allergies: p.allergies.length ? p.allergies : ["none recorded"], still_waiting: raw.still_waiting },
          { text: `${p.name} is with you now.`, basis: `PS-HS-06 · ${raw.called.id}` });
      }
      if (key === "schedule.check_in") {
        const p = raw.patient;
        return ok({ patient_id: p.id, name: p.name, kind: raw.entry.kind.replace("_", "-"), arrived: F.hhmm(raw.entry.arrived), ahead_in_queue: raw.ahead },
          { text: `${p.name} is in the queue for Dr Sivakumar.`, basis: `PS-HS-06 · ${raw.entry.id}` });
      }
      const a = raw.appointment;
      const data = { appointment_id: a.id, patient: `${raw.patient.name} (${raw.patient.id})`, when: `${F.dayWords(a.start.slice(0, 10))}, ${a.start.slice(11, 16)}`, status: a.status };
      if (raw.before) data.was = `${F.dayWords(raw.before.slice(0, 10))}, ${raw.before.slice(11, 16)}`;
      did("Change logged with who and when (PS-HS-05)");
      return ok(data, { text: key === "schedule.cancel" ? "Booking cancelled." : "Please tell the patient the time.", basis: `PS-HS-05 · ${a.id}` });
    }

    // ---------------------------------------------------------------- record_consultation (GP only)
    if (tool === "record_consultation") {
      const c = raw.consultation, p = raw.patient;
      if (key === "record_consultation.amend_prescription") {
        did("Old check replaced; a new check task for Ms Yong; the query closed by the amendment (PS-AC-03)");
        return ok({ patient: `${p.name} (${p.id})`, prescription_now: rx(c.prescription), prescription_before: rx(raw.before), next: "Ms Yong checks it again before dispensing" },
          { text: "Ms Yong checks the amended prescription before dispensing.", person: "PH-01", basis: `PS-AC-03 · ${c.id} amended ${F.hhmm(now)}` });
      }
      const data = { consultation_id: c.id, patient: `${p.name} (${p.id})`, diagnosis: c.diagnosis, services: c.services.map(med), prescription: rx(c.prescription),
        mc: c.mc ? (c.mc.declined ? "declined" : `${c.mc.days} day${c.mc.days > 1 ? "s" : ""} from ${F.dayWords(c.mc.start_date)}`) : "none",
        referral: c.referral ? `${c.referral.urgency} to ${c.referral.to}` : "none",
        return: c.return_in_days ? `in ${c.return_in_days} days` : "none",
        sent_to: raw.tasks.map((t) => `${R.nameOf(t.to)}: ${t.text}`) };
      did("Tasks and notices written in code for the next people (PS-RP-06)");
      return ok(data, { text: c.prescription.length ? "Ms Yong checks and dispenses the prescription; Siti Kasim bills after dispensing." : "Siti Kasim prepares the bill.", basis: `PS-AC-07 · ${c.id}, ${F.myt(c.at)}` });
    }

    // ---------------------------------------------------------------- dispense (pharmacist only)
    if (tool === "dispense") {
      if (key === "dispense.view_stock") {
        const items = Object.entries(raw.items).map(([k, s]) => ({ medicine: med(k), unit: R.MED[k].unit, in_stock: s.qty, updated: F.myt(s.updated) }));
        return ok({ items }, { basis: `PS-AC-04 · stock at ${F.myt(now)}` });
      }
      const p = raw.patient;
      if (key === "dispense.check_and_dispense") {
        const ck = raw.check;
        const failed = ck.failed.map((f) => ({ reason: f.reason, check: f.check, medicine: med(f.medicine), detail: f.detail }));
        const base = { patient: `${p.name} (${p.id}, ${ageOf(p)})`, allergies: p.allergies.length ? p.allergies : ["none recorded"], prescription: rx(raw.prescription), check: ck.result, failed };
        if (raw.held) {
          const words = R.tables.reasons[raw.task.reason].words;
          const say = `The check failed on ${words}, so the prescription is held. Sent to ${R.person("GP-01")}.`;
          did(`Check failed: the query (${raw.task.reason}) and the notice for Dr Sivakumar written in code; dispensing held (PS-AC-03)`);
          return ok(Object.assign(base, { query_id: raw.task.id, reason: raw.task.reason, status: "held, with Dr Sivakumar" }),
            { text: "Dr Sivakumar amends the prescription or answers to keep it.", person: "GP-01", say, basis: `PS-AC-02, PS-AC-03 · ${ck.id} · ${raw.task.id}` });
        }
        did("Four checks passed (or kept by Dr Sivakumar); stock reduced; Siti Kasim's bill task created (PS-AC-04)");
        return ok(Object.assign(base, { dispensed: rx(raw.dispensed.lines), counsel: raw.dispensed.lines.map((l) => `${med(l.medicine)}: ${l.instructions}`) }),
          { text: "Counsel the patient on each medicine; Siti Kasim prepares the bill.", person: "FD-01", basis: `PS-AC-04 · ${ck.id} · dispensed ${F.hhmm(raw.dispensed.at)}` });
      }
      if (key === "dispense.query_gp") {
        did("Query task and the two-sentence notice for Dr Sivakumar written in code; dispensing held (PS-AC-03)");
        return ok({ query_id: raw.task.id, patient: `${p.name} (${p.id})`, reason: raw.task.reason, status: "with Dr Sivakumar" },
          { text: "Dr Sivakumar amends the prescription or answers to keep it.", person: "GP-01", say: R.say.sent("GP-01"), basis: `PS-AC-03 · ${raw.task.id}` });
      }
    }

    // ---------------------------------------------------------------- billing (Siti prepares; the GP views)
    if (tool === "billing") {
      const billData = (b, p) => {
        const d = { bill_id: b.id, patient: p ? `${p.name} (${p.id})` : b.patient, lines: b.lines.map((l) => ({ item: l.name, qty: l.qty, unit_price: F.rm(l.unit), amount: F.rm(l.amount), ...(b.panel ? { covered_by_panel: l.covered } : {}) })),
          total: F.rm(b.total), patient_share: F.rm(b.patient_share), status: b.status };
        if (b.panel) Object.assign(d, { panel: `${b.panel.name}, member ${b.panel.member_id}`, covered_items: F.rm(b.panel.covered), excluded_items: F.rm(b.panel.excluded), co_pay: F.rm(b.panel.co_pay),
          panel_share: `${F.rm(b.panel_share)} awaiting claim`, acknowledged: b.panel.acknowledged ? `by ${R.nameOf(b.panel.acknowledged.by)} at ${F.hhmm(b.panel.acknowledged.at)}` : "not yet" });
        return d;
      };
      if (key === "billing.prepare_bill") {
        const b = raw.bill;
        did(b.panel ? "Priced from the Panel Price Schedule; split in code; filed for Dr Sivakumar to acknowledge (PS-PN-03, PS-PN-06)" : "Priced from the Price List (PS-PL-01, PS-PL-02)");
        return ok(billData(b, raw.patient), { text: b.patient_share ? `Collect ${F.rm(b.patient_share)} from ${raw.patient.name} and record it.` : "Nothing to collect; the panel covers it all.", basis: `${b.panel ? "PS-PN-03" : "PS-PL-02"} · ${b.id}` });
      }
      if (key === "billing.record_payment") {
        const x = raw.payment;
        return ok({ receipt: x.id, bill_id: x.bill, patient: `${raw.patient.name} (${raw.patient.id})`, amount: F.rm(x.amount), method: x.method, tendered: x.tendered === null ? null : F.rm(x.tendered), change_due: F.rm(x.change), visit: "closed" },
          { text: x.change ? `Give ${F.rm(x.change)} change and the receipt.` : "Give the receipt.", basis: `PS-PL-04 · ${x.id}, ${F.hhmm(x.at)}` });
      }
      if (key === "billing.reconcile_day") {
        const r = raw.reconcile;
        return ok({ date: F.dayLabel(r.date), cash: F.rm(r.by_method.cash), card: F.rm(r.by_method.card), e_wallet: F.rm(r.by_method["e-wallet"]), cash_counted: F.rm(r.counted_cash),
          difference: r.difference === 0 ? "none" : `${F.rm(Math.abs(r.difference))} ${r.difference < 0 ? "short" : "over"}`, payments: raw.payments.length },
          { text: r.difference === 0 ? "The cash matches; the day is reconciled." : "The difference is on the owner review list for Dr Sivakumar.", basis: `PS-PL-05 · ${r.id}` });
      }
      if (key === "billing.view_bill") return ok(Object.assign(billData(raw.bill, raw.patient), raw.payment ? { receipt: raw.payment.id, paid: F.rm(raw.payment.amount), method: raw.payment.method } : {}), { basis: `PS-PL-04 · ${raw.bill.id}` });
      if (key === "billing.view_payments") {
        const r = raw.reconcile;
        return ok({ date: F.dayLabel(raw.date), payments: raw.payments.map((x) => ({ receipt: x.id, bill: x.bill, amount: F.rm(x.amount), method: x.method, time: F.hhmm(x.at) })).concat(raw.history.map((h) => ({ invoice: h.id, amount: F.rm(h.amount) }))),
          reconcile: r ? { cash_recorded: F.rm(r.expected_cash), cash_counted: F.rm(r.counted_cash), difference: r.difference === 0 ? "none" : `${F.rm(Math.abs(r.difference))} ${r.difference < 0 ? "short" : "over"}`, by: R.nameOf(r.by), at: F.myt(r.at) } : "not reconciled yet" },
          { basis: `PS-PL-05 · ${F.dayLabel(raw.date)}` });
      }
      if (key === "billing.view_owner_review") return ok({ items: raw.items.map((x) => ({ id: x.id, date: F.dayLabel(x.date), kind: x.kind.replace("_", " "), text: x.text })) }, { basis: `PS-PL-05 · owner review list, ${raw.items.length} item${raw.items.length === 1 ? "" : "s"}` });
      if (key === "billing.view_panel_bills") {
        const P = env.store.get("patients");
        return ok({ date: F.dayLabel(raw.date), panel_bills: raw.bills.map((b) => billData(b, P.find((x) => x.id === b.patient))) }, { basis: `PS-PN-06 · panel bills ${F.dayLabel(raw.date)}` });
      }
      if (key === "billing.acknowledge_panel_bill") {
        did("Acknowledgement recorded with who and when; the bill unchanged (PS-PN-06)");
        return ok(billData(raw.bill, raw.patient), { text: "Acknowledged; nothing on the bill changed.", basis: `PS-PN-06 · ${raw.bill.id} acknowledged ${F.hhmm(now)}` });
      }
    }

    // ---------------------------------------------------------------- documents (desk)
    if (tool === "documents") {
      if (key === "documents.list") return ok({ documents: raw.documents.map((d) => ({ id: d.id, type: d.type, patient: d.patient, status: d.status.replace(/_/g, " ") })), to_prepare: raw.to_prepare.map((t) => ({ patient: t.patient, document: t.document })) }, { basis: "PS-AC-09 · documents today" });
      const d = raw.document;
      const content = d.type === "mc" ? { patient: d.content.patient, visit: F.dayLabel(d.content.visit_date), unfit_for_work: `${d.content.days} day${d.content.days > 1 ? "s" : ""}, ${F.dayLabel(d.content.start_date)} to ${F.dayLabel(d.content.end_date)}`, addressee: d.content.addressee }
        : { patient: d.content.patient, visit: F.dayLabel(d.content.visit_date), to: d.content.to, reason: d.content.reason, urgency: d.content.urgency, clinical_summary: d.content.summary };
      if (key === "documents.prepare") {
        did("Copied exactly from Dr Sivakumar's consultation record; one serial number (PS-AC-08, PS-AC-09)");
        return ok({ serial: d.id, type: d.type === "mc" ? "MC" : "referral letter", status: "ready for Dr Sivakumar's signature", content }, { text: "Print it for Dr Sivakumar to sign, then mark it issued.", person: "GP-01", basis: `PS-AC-09 · ${d.id}` });
      }
      return ok({ serial: d.id, type: d.type === "mc" ? "MC" : "referral letter", status: "issued", issued: F.hhmm(d.issued_at) }, { text: "Hand it to the patient.", basis: `PS-AC-09 · ${d.id} issued` });
    }

    // ---------------------------------------------------------------- tasks
    if (tool === "tasks") {
      const P = env.store.get("patients");
      const nm = (id) => { const p = P.find((x) => x.id === id); return p ? `${p.name} (${p.id})` : id; };
      if (key === "tasks.list") return ok({ tasks: raw.tasks.map((t) => ({ task_id: t.id, kind: t.kind, patient: nm(t.patient), reason: t.reason || null, text: t.text, since: F.hhmm(t.created) })), notices: raw.notices.map((n) => n.text) }, { basis: `PS-RP-06 · ${staff.first}'s list at ${F.hhmm(now)}` });
      if (key === "tasks.hand_over") {
        did(`Receiver set by code from the stage of the visit (${raw.task.stage.replace(/_/g, " ")}): ${R.nameOf(raw.task.to)}, reason ${raw.task.reason}; task and notice written in code (PS-RP-06)`);
        return ok({ handover_id: raw.task.id, patient: nm(raw.task.patient), reason: raw.task.reason, to: R.nameOf(raw.task.to) },
          { text: `${R.nameOf(raw.task.to)} answers; the answer comes back to you.`, person: raw.task.to, say: R.say.sent(raw.task.to), basis: `PS-RP-06 · ${raw.task.id}` });
      }
      if (key === "tasks.answer") {
        const t = raw.task;
        const p = raw.patient;
        const say = t.kind === "query" ? `OK. Ms Yong can now dispense ${p.name}'s prescription as written.` : `OK. Your answer is sent to Siti Kasim to pass on to ${p.name}.`;
        did(`Answer recorded; the notice back to ${R.nameOf(t.from)} written in code (PS-RP-06)`);
        return ok({ task_id: t.id, patient: nm(t.patient), decision: t.decision, answer: t.answer, sent_to: R.nameOf(t.from) }, { text: say, person: t.from, say, basis: `PS-RP-06 · ${t.id} answered ${F.hhmm(now)}` });
      }
    }
    throw new Error(`PostToolUse has no format for ${key}`);
  }

  return { postToolUse };
});
