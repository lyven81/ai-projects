/* The PostToolUse hook: one shared hook after all eight tools.
 *
 * postToolUse(tool, input, raw, staffId, env, pre) -> { result, changes }
 *   raw:     what the tool returned (sen, ISO dates, stored values), or { backendRefusal } when the
 *            back end refused on its own.
 *   result:  the shared result shape: only the fields the role may see (checked again), ages, the
 *            vaccination status worked out in code, amounts in RM, dates and times written as day,
 *            date and time in Malaysia time, and the Basis (record, clause, data date) (CP-15, CL-14).
 *   changes: one line per thing checked, converted or worked out (the hook view).
 * PostToolUse reports; it cannot undo what the tool did.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"), require("../lib/backend.js"));
  else root.SKPostToolUse = factory(root.SKFormat, root.SKBackend);
})(typeof self !== "undefined" ? self : this, function (F, B) {
  "use strict";

  const STATUS_TEXT = {
    COMPLETED_RECORDED: "completed as recorded", NOT_YET_DUE: "not yet due", DUE_TODAY: "due today",
    PAST_TARGET_REVIEW: "past routine target; clinician to confirm catch-up", HISTORY_UNVERIFIED: "history unverified; record check needed, not counted as overdue",
    SCHOOL_PROGRAMME_REVIEW: "school programme: confirm with the school or public clinic", PROGRAMME_REVIEW_REQUIRED: "programme review required",
    DEFERRED_BY_CLINICIAN: "deferred by clinician", NOT_APPLICABLE: "not applicable",
  };

  function postToolUse(tool, input, raw, staffId, env, pre) {
    const { rules, now, store } = env;
    const T = rules.tables;
    const today = F.mytDate(now);
    const changes = [];
    const did = (s) => changes.push(s);
    const nm = (id) => (rules.who(id) ? rules.who(id).name : id);
    const pname = (id) => { const p = store.get("patients").find((x) => x.id === id); return p ? `${p.name}, ${rules.ageLabel(p.dob, today)}` : id; };
    const med = (pid) => { const p = T.presentations[pid]; return p ? `${p.generic} ${p.strength.split(" = ")[0]} ${p.form}` : pid; };

    if (raw && raw.backendRefusal) {
      const e = raw.backendRefusal;
      did(`Back end refused on its own: ${e.code}`);
      const data = e.data && e.data.alternatives ? Object.assign({}, e.data, { alternatives: e.data.alternatives.map((a) => Object.assign({}, a, { doctor: undefined })) }) : e.data;
      return { result: F.fail(tool, e.code, e.message.replace(/^Back end: /, ""), { data, next_step: e.next_step, clause: e.clause }), changes };
    }

    // ---------------------------------------------------------------- retrieve_patient_record
    if (tool === "retrieve_patient_record") {
      const allowed = B.VIEWS[raw.view];
      const extra = Object.keys(raw.record).filter((k) => !allowed.includes(k));
      const d = {};
      for (const k of allowed) if (k in raw.record) d[k] = raw.record[k];
      did(extra.length ? `Removed fields outside the ${raw.view} view: ${extra.join(", ")}` : `Checked: only the ${raw.view} view's fields are present (CP-04 to CP-09)`);
      if (d.doctor) d.doctor = `${nm(d.doctor)} (${d.doctor})`;
      let dataDate = null;
      if (d.weight) {
        const days = rules.daysBetween(d.weight.date, today);
        d.weight = { kg: d.weight.kg, weighed: F.dayLabel(d.weight.date), days_old: days, within_30_days: days >= 0 && days <= rules.V.weight_max_days };
        dataDate = `weight ${d.weight.weighed}`;
        did(`Weight dated and aged in code: ${days} days old (CL-08)`);
      }
      if (d.visits) d.visits = d.visits.sort((a, b) => (a.date < b.date ? 1 : -1)).map((v) => Object.assign({}, v, { date: F.dayLabel(v.date), doctor: nm(v.doctor) }));
      if (d.band_change) d.band_change = { on: F.dayLabel(d.band_change.on), moves_to: d.band_change.to === "adult" ? "turns 18: onward-care review (CL-03)" : `${T.bands[d.band_change.to].label} band, ${nm(rules.bandDoctor(d.band_change.to))}`, in_days: d.band_change.days };
      if (d.prescriptions) {
        d.prescriptions = d.prescriptions.sort((a, b) => (a.date < b.date ? 1 : -1)).map((x) => ({ id: x.id, date: F.dayLabel(x.date), medicine: med(x.presentation),
          dose: `${x.amount_per_dose} ${x.dose_unit}${x.mg_per_dose ? ` (${x.mg_per_dose} mg)` : ""}`, frequency: `${x.as_needed ? "up to " : ""}${x.times_per_day} times a day${x.as_needed ? " as needed" : ""}`,
          duration: x.duration_days ? `${x.duration_days} days` : null, supply: `${x.supply_qty} x ${x.supply_unit}`, prescriber: nm(x.doctor), label: T.presentations[x.presentation] ? "Not for clinical use (demo formulary)" : null }));
        if (d.prescriptions[0]) dataDate = `latest prescription ${d.prescriptions[0].date}`;
        did("Prescriptions written out from the formulary register: medicine, strength, dose, frequency, duration, supply");
      }
      if (d.appointments) {
        d.appointments = d.appointments.map((a) => ({ id: a.id, doctor: nm(a.doctor), when: F.when(a.date, a.start), visit_type: a.visit_type.replace("_", " "), status: a.status }));
        did("Appointments written as day, date and time, Malaysia time (OP-08)");
      }
      if (d.administrations) {
        const p = store.get("patients").find((x) => x.id === raw.patient);
        const rows = rules.vaccineStatus(p, d.administrations, today);
        d.vaccination_status = rows.filter((r) => r.status !== "NOT_APPLICABLE").map((r) => ({ schedule_id: r.schedule_id, vaccine: r.vaccine, dose: r.dose,
          target: r.target ? F.dayLabel(r.target) : r.cohort || null, status: r.status, meaning: STATUS_TEXT[r.status], given: r.given ? F.dayLabel(r.given) : undefined }));
        d.overdue = rows.filter((r) => r.status === "PAST_TARGET_REVIEW").map((r) => r.schedule_id);
        const last = d.administrations.map((a) => a.date).sort().pop();
        dataDate = last ? `last vaccine recorded ${F.dayLabel(last)}` : "no vaccines recorded";
        delete d.administrations;
        did(`Vaccination status worked out in code from the Immunisation Schedule v1.0: ${d.overdue.length} past routine target (CL-13, IS section 7)`);
        if (!d.history_complete) did("History incomplete: rows marked history unverified, not counted as overdue (IS section 7)");
        delete d.dob;
      }
      if (d.invoices) {
        d.invoices = d.invoices.map((i) => ({ id: i.id, date: F.dayLabel(i.date), lines: i.lines.map((l) => ({ fee_id: l.fee_id, item: l.label, qty: l.qty, amount: F.rm(l.sen * l.qty) })),
          charges: F.rm(i.charges), adjustments: F.rm(i.adjustments), paid: F.rm(i.paid), outstanding: F.rm(i.outstanding) }));
        const tot = raw.record.invoices.reduce((a, i) => a + i.outstanding, 0);
        d.total_outstanding = F.rm(tot);
        d.data_time = F.myt(now);
        dataDate = `billing records as at ${F.myt(now)}`;
        did(`Outstanding worked out in code per invoice (charges less adjustments and payments), sen to RM: ${F.rm(tot)} (BP-03)`);
      }
      if (d.confidential_notes) { d.confidential_notes = d.confidential_notes.map((n) => ({ date: F.dayLabel(n.date), author: nm(n.author), note: n.note })); did("Confidential release logged with the reason (CP-08, CP-15)"); }
      if (d.handover) d.handover = { id: d.handover.id, from: nm(d.handover.raised_by), to: nm(d.handover.to), reason: d.handover.reason, status: d.handover.status };
      if (d.guardian && raw.view === "registration") d.guardian = d.guardian.name;
      if ("dob" in d && raw.view === "handover_summary") d.dob = F.dayLabel(d.dob);
      const clause = { registration: "CP-04", contact: "CP-04", clinical: "CP-05", prescriptions: "CP-05", appointments: "CP-06", vaccinations: "CL-13", confidential: "CP-08", billing: "BP-03", handover_summary: "CL-02" }[raw.view];
      d.basis = { record: raw.patient, view: raw.view, clause, data_date: dataDate || "not applicable", capacity: raw.capacity || undefined };
      did(`Basis added: ${raw.patient}, ${clause}, ${dataDate || "no dated data"} (CP-15)`);
      return { result: F.ok(tool, d), changes };
    }

    if (tool === "find_patients") {
      const ok = raw.patients.every((r) => Object.keys(r).join(",") === "id,name,age,doctor");
      did(ok ? "Checked: list fields only, patient ID, name, age and doctor (CP-10)" : "List fields trimmed to patient ID, name, age and doctor (CP-10)");
      const data = { filter: raw.filter, value: raw.value, scope: raw.scope, count: raw.patients.length,
        patients: raw.patients.map((r) => ({ id: r.id, name: r.name, age: r.age, doctor: nm(r.doctor) })),
        basis: { record: "patient register", clause: "CP-10", data_date: F.myt(now), capacity: raw.capacity || undefined } };
      return { result: F.ok(tool, data), changes };
    }

    if (tool === "check_schedule") {
      const s = raw.sessions.map((x) => x.next ? { doctor: nm(x.doctor), next_available: x.next.map((n) => n.label) }
        : { doctor: nm(x.doctor), date: F.dayLabel(x.date), session: x.session === "AM" ? "morning" : "afternoon", open: x.open, reason: x.reason || undefined, free: x.free.map(F.clock) });
      did("Sessions from the Clinic Hours and Rota; times written as day, date and time (OP-03, OP-08)");
      return { result: F.ok(tool, { visit_type: raw.visit_type, minutes: raw.minutes, sessions: s, basis: { record: "Clinic Hours and Rota", clause: "OP-03", data_date: F.myt(now) } }), changes };
    }

    if (tool === "book_appointment") {
      if (raw.assignment_request) {
        const r = raw.assignment_request;
        did(`${nm(raw.refused_doctor)} is outside the band rule: a doctor-assignment request ${r.id} created for Dr Aisyah Rahman (OP-04)`);
        return { result: F.pending(tool, { request: r.id, patient: pname(r.patient), refused_doctor: nm(raw.refused_doctor), permitted: r.details.permitted.map(nm), status: "pending: Dr Aisyah assigns the doctor; no booking yet" },
          rules.person(B.LEAD, "OP-04", { request_id: r.id, action: "Dr Aisyah Rahman assigns the band doctor or herself; Nurul Huda then books the assigned doctor.", say: "Sent to Dr Aisyah Rahman, lead paediatrician." }),
          "doctor_assignment_requested", `${nm(raw.refused_doctor)} does not see patients of this age; the doctor is assigned by Dr Aisyah Rahman.`), changes };
      }
      const a = raw.appointment;
      did(`Written as ${F.when(a.date, a.start)}, Malaysia time, with the doctor and the status (OP-08)`);
      if (raw.action === "book") {
        if (raw.counted_from) did(`"In N days" counted from the recorded encounter, ${F.dayLabel(raw.counted_from)} (OP-08)`);
        return { result: F.pending(tool, { appointment: a.id, patient: pname(a.patient), doctor: nm(a.doctor), when: F.when(a.date, a.start), visit_type: a.visit_type.replace("_", " "),
          status: "booked; confirm with the registered guardian", counted_from: raw.counted_from ? F.dayLabel(raw.counted_from) : undefined, confirm_action: raw.confirm_action,
          basis: { record: a.id, clause: "OP-07", data_date: F.myt(now) } }, rules.person(B.CLERK, "OP-07", { action: "Confirm the day and time with the registered guardian; the booking is confirmed once they agree." })), changes };
      }
      return { result: F.ok(tool, { appointment: a.id, patient: pname(a.patient), doctor: nm(a.doctor), when: F.when(a.date, a.start), status: a.status }), changes };
    }

    if (tool === "close_visit") {
      did(`Visit ${raw.visit} closed by appending a closure record; ${raw.prescriptions.length} prescription line(s) recorded after the checks (CL-06 to CL-09)`);
      did(`Clerk's actions created in code: ${raw.actions.map((a) => a.type).join(", ")} (CL-11, OP-11)`);
      return { result: F.ok(tool, { visit: raw.visit, patient: pname(raw.patient),
        prescriptions: raw.prescriptions.map((x) => ({ id: x.id, medicine: med(x.presentation), dose: `${x.amount_per_dose} ${x.dose_unit}${x.mg_per_dose ? ` (${x.mg_per_dose} mg)` : ""}`,
          frequency: `${x.times_per_day} times a day`, duration: x.duration_days ? `${x.duration_days} days` : null, supply: `${x.supply_qty} x ${x.supply_unit}`, profile: x.profile, label: "Not for clinical use (demo formulary)" })),
        actions_created: raw.actions, basis: { record: raw.visit, clause: "CL-06", data_date: F.myt(now) } },
        rules.person(B.CLERK, "CL-11", { action: "Nurul Huda dispenses exactly as written and prepares the bill." })), changes };
    }

    if (tool === "create_request") {
      if (raw.action === "raise") {
        const r = raw.request;
        did(r.existing ? `The same request is already pending as ${r.id}; no duplicate created` : `Request ${r.id} recorded: ${r.type}, owner ${r.owner}, status ${r.status} (CP-13)`);
        const data = { request: r.id, type: r.type, patient: r.patient ? pname(r.patient) : undefined, owner: nm(r.owner), status: r.status, existing: r.existing || undefined,
          dates: r.from ? `${F.dayLabel(r.from)}${r.to !== r.from ? ` to ${F.dayLabel(r.to)}` : ""}` : undefined, patients_covered: r.patients ? r.patients.length : undefined,
          reason: r.reason || undefined, question: r.question || undefined, birthday: r.birthday ? F.dayLabel(r.birthday) : undefined };
        if (r.direct) {  // CP-12 (founder, 22 Oct): the decider's instruction, recorded and carried out
          did(`${r.id}: Dr Aisyah's instruction recorded as her decision (approved); the clerk's apply action created (CP-12, BP-07)`);
          const pt = r.patient ? pname(r.patient).split(",")[0].split(" ")[0] : "the";
          return { result: F.ok(tool, Object.assign(data, { status: "approved", decided_by: nm(r.decided_by) }),
            rules.person(B.CLERK, "BP-07", { request_id: r.id, action: "Nurul Huda applies the approved adjustment in the billing system.",
              say: `OK. ${pt}'s ${F.rm(r.amount)} waiver is approved, and Nurul Huda will apply it.` })), changes };
        }
        // Founder, 22 Oct: an escalation to another person is one short sentence, written here.
        const to = rules.who(r.owner);
        const say = r.owner !== staffId ? `Sent to ${to.name}, ${to.title.toLowerCase()}.` : undefined;
        return { result: F.pending(tool, data, rules.person(r.owner, r.clause, { request_id: r.id, action: `${nm(r.owner)} decides; it appears in their action list.`, say })), changes };
      }
      if (raw.action === "decide") {
        const r = raw.request;
        did(`${r.id} ${r.status} by ${r.decided_by}${r.type === "handover" && r.status === "accepted" ? `; doctor of record changed to ${r.to} in one logged transaction (CL-02)` : ""}`);
        return { result: F.ok(tool, { request: r.id, type: r.type, status: r.status, decided_by: nm(r.decided_by), decision: r.decision || undefined, next_actions: raw.next_actions,
          basis: { record: r.id, clause: r.clause, data_date: F.myt(now), capacity: raw.capacity || undefined } }), changes };
      }
      const a = raw.action;
      did(`${a.id} completed by ${a.completed_by} with the outcome recorded (CP-13)`);
      return { result: F.ok(tool, { item: a.id, type: a.type, status: a.status, outcome: a.outcome, basis: { record: a.id, clause: a.clause, data_date: F.myt(now) } }), changes };
    }

    if (tool === "record_payment") {
      did(`Payment entry ${raw.payment.id} written with its receipt reference; balance rechecked (BP-04)`);
      return { result: F.ok(tool, { status: "payment recorded", payment: raw.payment.id, invoice: raw.invoice, amount: F.rm(raw.payment.sen), outstanding_after: F.rm(raw.outstanding_after), time: F.myt(raw.payment.time) }), changes };
    }

    if (tool === "list_my_actions") {
      const items = raw.items.map((i) => Object.assign({}, i, { created: i.created ? F.myt(i.created) : undefined, target_date: i.target_date ? F.dayLabel(i.target_date) : undefined,
        raised_by: i.raised_by ? nm(i.raised_by) : undefined, dates: i.dates ? `${F.dayLabel(i.dates.from)}${i.dates.to !== i.dates.from ? ` to ${F.dayLabel(i.dates.to)}` : ""}` : undefined }));
      const data = { staff: nm(raw.staff), items, raised_by_me: raw.raised_by_me.map((r) => Object.assign({}, r, { owner: nm(r.owner) })) };
      if (raw.case_file) {
        data.pending_confirmations = raw.pending_confirmations;
        data.vaccine_recalls = raw.vaccine_recalls.map((r) => Object.assign({}, r, { doctor: nm(r.doctor) }));
        data.payment_reminders = raw.payment_reminders;
        data.case_file = raw.case_file.map((r) => Object.assign({}, r, { raised_by: nm(r.raised_by), owner: nm(r.owner), dates: r.dates ? `${F.dayLabel(r.dates.from)}${r.dates.to !== r.dates.from ? ` to ${F.dayLabel(r.dates.to)}` : ""}` : null }));
        did("Clerk's list: open actions, pending confirmations, vaccine recalls from the schedule (list fields only), payment reminders, and the handover and cover case file read only (CP-13, OP-11)");
      } else did("Only the signed-in person's items, from stored records (CP-13)");
      data.basis = { record: "action and request stores", clause: "CP-13", data_date: F.myt(now) };
      return { result: F.ok(tool, data), changes };
    }

    return { result: F.fail(tool, "data_missing", `No tool named ${tool}.`), changes };
  }

  return { postToolUse };
});
