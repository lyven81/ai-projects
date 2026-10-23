/* The back end data layer: the second line behind the hooks.
 *
 * Critical checks run here too, on their own, so a hook fault or a direct call cannot get past them:
 *   the access rule by view and by patient (CP-04 to CP-09): rows by patient (own patient, an approved
 *   active cover, an open consult for the lead), columns by role, stripped before any data leaves;
 *   the lead's two capacities (CP-03); the prescriber and the prescription checks (CL-06 to CL-09);
 *   clerk-only bookings and the slot recheck (OP-05, OP-06); request owners and transitions, the lead
 *   never approving her own request (CP-12, CP-13); payments recorded only by the clerk (BP-04).
 * Raw values leave in sen and as ISO dates; PostToolUse converts them. A refusal is thrown as
 * { backend: true, code, message, data, next_step }.
 *
 * store: { get(name), set(name, value) } over the data files.
 * opts: { now (Unix seconds), faults (benchmark: { <tool>: "unavailable", rota: "missing" }) }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.SKBackend = factory(root.SKFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  const VIEWS = {
    registration: ["id", "name", "age", "doctor", "guardian"],
    contact: ["id", "name", "guardian", "mykid"],
    clinical: ["id", "name", "age", "doctor", "conditions", "allergy_status", "allergies", "weight", "visits", "band_change"],
    prescriptions: ["id", "name", "age", "doctor", "allergy_status", "allergies", "prescriptions"],
    appointments: ["id", "name", "doctor", "appointments"],
    vaccinations: ["id", "name", "age", "doctor", "dob", "history_complete", "administrations"],
    confidential: ["id", "name", "age", "doctor", "confidential_notes"],
    billing: ["id", "name", "invoices"],
    handover_summary: ["id", "name", "age", "dob", "doctor", "handover", "conditions", "allergy_status", "allergies"],
  };
  const LEAD = "PD-01-01", CLERK = "FD-02-01";
  const OFFERED = {  // CP-11: the tool catalogue by role at sign-in
    doctor: ["retrieve_patient_record", "check_schedule", "close_visit", "create_request", "find_patients", "list_my_actions"],
    clerk: ["retrieve_patient_record", "check_schedule", "book_appointment", "create_request", "record_payment", "list_my_actions"],
  };

  function refuse(code, message, extra) {
    const e = new Error(message);
    Object.assign(e, { backend: true, code, data: (extra && extra.data) || null, next_step: (extra && extra.next_step) || null, clause: extra && extra.clause });
    return e;
  }

  function createBackend(store, rules, opts) {
    const o = opts || {};
    const faults = o.faults || {};
    const today = () => F.mytDate(o.now);
    const T = rules.tables;
    const get = (n) => store.get(n) || [];
    const unavailable = (tool) => { if (faults[tool] === "unavailable") throw refuse("system_unavailable", "The clinic system did not respond; nothing was changed or returned.", { next_step: rules.person(CLERK, "CP-14", { action: "Try again shortly; Nurul Huda checks the clinic system if it stays down." }) }); };

    // ---------------------------------------------------------------- patients
    /** CP-14, OP-01: a patient ID, or a name with an optional age; an unclear match asks for the ID. */
    function resolve(ref, ageHint) {
      const all = get("patients");
      const s = String(ref || "").trim();
      if (!s) return { error: refuse("details_missing", "No patient named.", { clause: "CP-14" }) };
      const byId = all.find((p) => p.id.toLowerCase() === s.toLowerCase());
      if (byId) return { patient: byId };
      const q = s.toLowerCase().replace(/^baby\s+/, "").replace(/,?\s*\d+\s*(months?|years?)?\s*$/, "").trim();
      let hits = all.filter((p) => p.name.toLowerCase() === q || p.name.toLowerCase().includes(q) || p.first.toLowerCase() === q);
      if (ageHint !== undefined && ageHint !== null && hits.length > 1) hits = hits.filter((p) => rules.ageLabel(p.dob, today()) === String(ageHint));
      if (hits.length === 1) return { patient: hits[0] };
      if (!hits.length) return { error: refuse("patient_not_found", `No registered patient matches "${s}".`, { next_step: rules.person(CLERK, "OP-01", { action: "Check the registration in the clinic system." }) }) };
      return { error: refuse("patient_ambiguous", `More than one patient matches "${s}"; give the patient ID.`, { next_step: { action: "Ask for the patient ID; no candidates are shown." } }) };
    }

    // ---------------------------------------------------------------- relationships and the access rule
    const active = (r) => r.status === "approved" && r.from <= today() && today() <= r.to;
    function relationship(staff, p) {
      if (staff.role !== "doctor") return null;
      if (p.doctor === staff.id) return "own";
      const reqs = get("requests");
      if (reqs.some((r) => r.type === "cover" && r.cover_doctor === staff.id && active(r) && (r.patients || []).includes(p.id))) return "cover";
      if (staff.id === LEAD && reqs.some((r) => r.type === "consult" && r.patient === p.id && r.status === "open")) return "consult";
      if (reqs.some((r) => r.type === "handover" && r.patient === p.id && r.to === staff.id && r.status === "pending")) return "handover_receiving";
      return null;
    }
    /**
     * The founder's access rule by view (CP-04 to CP-09, CL-02). Returns { allowed, capacity, via, code, clause, next_step }.
     * capacity is recorded for every call by Dr Aisyah (CP-03): specialist for her own patients, lead otherwise.
     */
    function access(staff, p, view, reason) {
      const rel = relationship(staff, p);
      const cap = (c) => (staff.id === LEAD ? c : null);
      const doctorOf = rules.person(p.doctor);
      const allow = (via, capacity) => ({ allowed: true, via, capacity: capacity !== undefined ? capacity : cap(via === "own" ? "specialist" : "lead") });
      // Founder, 22 Oct: a refusal to see data is two short sentences, written here from the record: decline politely,
      // then name who has access. The agent shows next_step.say as the reply.
      const LABEL = { contact: "guardian contact details", clinical: "clinical record", prescriptions: "prescriptions", appointments: "appointments",
        vaccinations: "vaccination record", confidential: "confidential notes", billing: "billing record", handover_summary: "handover summary" };
      const plural = /s$/.test(LABEL[view] || "") && !/record|summary/.test(LABEL[view] || "");
      const who = view === "billing" ? "the clinic clerk, Nurul Huda, and Dr Aisyah Rahman as lead"
        : view === "confidential" ? `${p.first}'s attending doctor, ${rules.who(p.doctor).name}`
        : `${p.first}'s attending doctor, ${rules.who(p.doctor).name}, and the clinic clerk`;
      const say = `I'm sorry, ${p.first}'s ${LABEL[view] || "record"} ${plural ? "aren't" : "isn't"} open to you. Only ${who} can access ${plural ? "them" : "it"}.`;
      const deny = (code, clause, next) => ({ allowed: false, code, clause, capacity: cap(rel === "own" ? "specialist" : "lead"), next_step: Object.assign({}, next || Object.assign({}, doctorOf, { clause }), { say }) });
      const isClerk = staff.role === "clerk";
      switch (view) {
        case "registration": return allow(isClerk ? "clerk" : rel || "registration");
        case "contact":
          if (isClerk) return allow("clerk");
          if (rel === "own" || rel === "cover" || rel === "consult") return allow(rel);
          return deny("not_attending", "CP-04");
        case "clinical": case "prescriptions":
          if (isClerk) return allow("clerk");
          if (rel === "own" || rel === "cover" || rel === "consult") return allow(rel);
          return deny("not_attending", "CP-05");
        case "appointments": case "vaccinations":
          if (isClerk) return allow("clerk");
          if (rel === "own" || (staff.id === LEAD && (rel === "consult" || rel === "cover"))) return allow(rel);
          return deny("not_attending", "CP-06");
        case "confidential": {
          const adolescent = rules.band(p.dob, today()) === "adolescent";
          if (staff.id === "PD-02-02" && rel === "own" && adolescent) return allow("own");
          if (staff.id === LEAD && (rel === "consult" || rel === "cover")) {
            if (!reason || String(reason).trim().length < 8) return { allowed: false, code: "reason_required", clause: "CP-08", capacity: "lead",
              next_step: rules.person(LEAD, "CP-08", { action: "Record the specific reason for opening the confidential notes, then ask again; it is logged before release." }) };
            return allow(rel, "lead");
          }
          return deny("view_not_permitted", "CP-08");
        }
        case "billing":
          if (isClerk) return allow("clerk");
          if (staff.id === LEAD) return allow("billing", "lead");
          return deny("billing_not_permitted", "CP-09", rules.person(CLERK, "CP-09", { action: "Nurul Huda, or Dr Aisyah Rahman as lead, handles billing." }));
        case "handover_summary":
          if (rel === "handover_receiving" || rel === "own") return allow(rel === "own" ? "own" : "handover_receiving");
          return deny("not_attending", "CL-02");
        default:
          return { allowed: false, code: "details_missing", clause: "CP-14", capacity: null, next_step: null };
      }
    }

    // ---------------------------------------------------------------- views (raw: sen, ISO dates)
    function weightOf(p) {
      const g = get("growth").filter((x) => x.patient === p.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      return g ? { kg: g.weight_kg, date: g.date } : null;
    }
    function full(p) {
      const g = get("guardians").find((x) => x.id === p.guardian);
      return {
        id: p.id, name: p.name, age: rules.ageLabel(p.dob, today()), dob: p.dob, doctor: p.doctor,
        guardian: g ? { name: g.name, relationship: g.relationship, phone: g.phone, email: g.email, address: g.address } : null,
        mykid: p.mykid, conditions: p.conditions, allergy_status: p.allergy_status,
        allergies: get("allergies").filter((a) => a.patient === p.id).map((a) => ({ substance: a.substance, class: a.class, reaction: a.reaction })),
        weight: weightOf(p), band_change: rules.bandChange(p.dob, today()),
        visits: get("visits").filter((v) => v.patient === p.id).map((v) => ({ id: v.id, date: v.date, doctor: v.doctor, type: v.type, diagnosis: v.diagnosis, status: v.status, follow_up_days: v.follow_up_days })),
        prescriptions: get("prescriptions").filter((x) => x.patient === p.id),
        appointments: get("appointments").filter((a) => a.patient === p.id && a.date >= today()),
        history_complete: p.history_complete,
        administrations: get("vaccinations").filter((v) => v.patient === p.id),
        confidential_notes: get("confidential_notes").filter((n) => n.patient === p.id),
        invoices: get("invoices").filter((i) => i.patient === p.id).map((i) => Object.assign({}, i, rules.invoiceBalance(i, get("payments")),
          { payments: get("payments").filter((x) => x.invoice === i.id) })),
        handover: get("requests").find((r) => r.type === "handover" && r.patient === p.id && r.status === "pending") || null,
      };
    }

    function record(staff, input) {
      unavailable("retrieve_patient_record");
      const { patient, error } = resolve(input.patient, input.age);
      if (error) throw error;
      const view = input.view;
      if (!VIEWS[view]) throw refuse("details_missing", `No view ${view}.`, { clause: "CP-14" });
      const a = access(staff, patient, view, input.reason);
      if (!a.allowed) throw refuse(a.code, `Back end: the ${view} view of ${patient.id} is not open to ${staff.id}.`, { next_step: a.next_step, clause: a.clause });
      const f = full(patient);
      const out = {};
      for (const k of VIEWS[view]) out[k] = f[k];  // only the fields of this view (columns by role)
      if (view === "confidential") {
        const log = get("confidential_log");
        store.set("confidential_log", log.concat([{ staff: staff.id, patient: patient.id, reason: input.reason || null, time: o.now }]));
      }
      return { view, patient: patient.id, capacity: a.capacity, via: a.via, record: out };
    }

    // ---------------------------------------------------------------- lists (CP-10)
    function findPatients(staff, input) {
      unavailable("find_patients");
      if (staff.role !== "doctor") throw refuse("tool_not_offered", "Back end: find_patients is for doctors.", { clause: "CP-10" });
      const f = input.filter;
      const allClinic = staff.id === LEAD && f !== "vaccine_overdue";
      let rows = get("patients").filter((p) => allClinic || p.doctor === staff.id);
      if (f === "condition") rows = rows.filter((p) => p.conditions.some((c) => c.toLowerCase().includes(String(input.value || "").toLowerCase())));
      else if (f === "age_band") rows = rows.filter((p) => rules.band(p.dob, today()) === input.value);
      else if (f === "no_visit_since") rows = rows.filter((p) => !get("visits").some((v) => v.patient === p.id && v.date >= input.value));
      else if (f === "vaccine_overdue") rows = rows.filter((p) => rules.overdue(rules.vaccineStatus(p, get("vaccinations").filter((v) => v.patient === p.id), today())).length);
      else throw refuse("filter_not_permitted", "Back end: only the fixed filters are offered.", { clause: "CP-10" });
      return { filter: f, value: input.value || null, scope: allClinic ? "every patient" : "own patients",
        capacity: staff.id === LEAD ? (allClinic ? "lead" : "specialist") : null,
        patients: rows.map((p) => ({ id: p.id, name: p.name, age: rules.ageLabel(p.dob, today()), doctor: p.doctor })) };
    }

    // ---------------------------------------------------------------- schedule (OP-03)
    function rotaMissing(iso) { return faults.rota === "missing" || iso < T.rota_valid[0] || iso > T.rota_valid[1]; }
    function schedule(staff, input) {
      unavailable("check_schedule");
      const len = T.slot_minutes[input.visit_type || "follow_up"] || 20;
      const appts = get("appointments");
      const doctors = input.doctor ? [input.doctor] : T.staff.filter((s) => s.role === "doctor").map((s) => s.id);
      const from = input.date || today();
      if (rotaMissing(from)) throw refuse("rota_unavailable", `The Clinic Hours and Rota does not cover ${from}.`, { next_step: rules.person(CLERK, "OP-03", { action: "Nurul Huda checks the rota in the clinic system." }) });
      const out = [];
      for (const d of doctors) {
        if (input.date) {
          for (const s of input.session ? [input.session] : ["AM", "PM"]) {
            const si = rules.session(input.date, s);
            out.push({ doctor: d, date: input.date, session: s, open: si.open && si.doctors.includes(d), reason: si.open ? (si.doctors.includes(d) ? null : "not working this session") : si.reason,
              free: rules.freeStarts(d, input.date, s, len, appts) });
          }
        }
        out.push({ doctor: d, next: rules.nextSessions(d, input.date ? rules.addDays(input.date, 1) : today(), len, appts, 3) });
      }
      return { visit_type: input.visit_type || "follow_up", minutes: len, sessions: out };
    }

    // ---------------------------------------------------------------- bookings (OP-04 to OP-09)
    function lastEncounter(p) {
      const v = get("visits").filter((x) => x.patient === p.id && x.status === "closed").sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      return v ? v.date : null;
    }
    function nextId(table, prefix) {
      const meta = store.get("meta");
      meta.next = meta.next || {};
      meta.next[table] = (meta.next[table] || get(table).length) + 1;
      store.set("meta", meta);
      return `${prefix}-${String(meta.next[table]).padStart(5, "0")}`;
    }
    function addAction(a) {
      const all = get("actions");
      const dup = all.find((x) => x.status === "open" && x.type === a.type && x.patient === a.patient && x.ref === a.ref);
      if (dup) return dup;  // idempotent: repeated calls never duplicate actions (CL-11)
      const rec = Object.assign({ id: nextId("actions", "SK-ACT"), status: "open", created: o.now }, a);
      store.set("actions", all.concat([rec]));
      return rec;
    }
    function addRequest(r) {
      const all = get("requests");
      const dup = all.find((x) => ["pending", "open"].includes(x.status) && x.type === r.type && x.patient === r.patient && x.raised_by === r.raised_by && x.owner === r.owner);
      if (dup) return Object.assign({ existing: true }, dup);
      const rec = Object.assign({ id: nextId("requests", "SK-REQ"), created: o.now }, r);
      store.set("requests", all.concat([rec]));
      return rec;
    }
    function eligible(p, doctor) {
      const b = rules.band(p.dob, today());
      return doctor === LEAD || doctor === rules.bandDoctor(b);
    }

    function book(staff, input) {
      unavailable("book_appointment");
      if (staff.id !== CLERK) throw refuse("booking_not_permitted", "Back end: only Nurul Huda enters bookings.", { next_step: rules.person(CLERK, "OP-05") });
      const action = input.action || "book";
      const appts = get("appointments");
      if (action === "confirm" || action === "release") {
        const a = appts.find((x) => x.id === input.appointment_id);
        if (!a) throw refuse("data_missing", `No appointment ${input.appointment_id}.`, { clause: "OP-07" });
        if (action === "confirm") {
          if (input.guardian_agreed !== true) throw refuse("guardian_not_confirmed", `${a.id} stays pending until the registered guardian agrees to the doctor, day, date and time.`,
            { next_step: rules.person(CLERK, "OP-07", { action: "Contact the registered guardian; confirm only after they agree." }) });
          a.status = "confirmed";
          get("actions").forEach((x) => { if (x.type === "confirm_booking" && x.ref === a.id) x.status = "done"; });
        } else {
          a.status = "withdrawn";
          get("actions").forEach((x) => { if (x.type === "confirm_booking" && x.ref === a.id) x.status = "done"; });
        }
        store.set("appointments", appts);
        store.set("actions", get("actions"));
        return { action, appointment: a };
      }
      const { patient: p, error } = resolve(input.patient, input.age);
      if (error) throw error;
      const doctor = input.doctor;
      if (!rules.who(doctor) || rules.who(doctor).role !== "doctor") throw refuse("details_missing", "Name the doctor for the booking.", { clause: "OP-05" });
      if (!eligible(p, doctor)) {
        // OP-04 (founder, 22 Oct): the clerk's request for a doctor outside the band rule goes to the lead, who assigns.
        const req = addRequest({ type: "doctor_assignment", raised_by: CLERK, owner: LEAD, patient: p.id, status: "pending", clause: "OP-04",
          details: { requested_doctor: doctor, permitted: [rules.bandDoctor(rules.band(p.dob, today())), LEAD], date: input.date || null } });
        return { action, assignment_request: req, refused_doctor: doctor };
      }
      const len = T.slot_minutes[input.visit_type || "follow_up"] || 20;
      let date = input.date;
      if (!date && input.in_days) {
        const enc = lastEncounter(p);
        if (!enc) throw refuse("details_missing", "No recorded encounter to count from; give the date.", { clause: "OP-08" });
        date = rules.addDays(enc, Number(input.in_days));
      }
      if (!date) date = today();
      if (rotaMissing(date)) throw refuse("rota_unavailable", `The Clinic Hours and Rota does not cover ${date}.`, { next_step: rules.person(CLERK, "OP-03") });
      const sessions = input.session ? [input.session] : ["AM", "PM"];
      const alternatives = () => rules.nextSessions(doctor, rules.addDays(date, 1), len, appts, 3);
      const open = sessions.filter((s) => { const si = rules.session(date, s); return si.open && si.doctors.includes(doctor); });
      if (!open.length) {
        const si = rules.session(date, sessions[0]);
        throw refuse("session_closed", `${rules.who(doctor).name} has no ${input.session ? (input.session === "AM" ? "morning" : "afternoon") + " " : ""}session on ${F.dayLabel(date)}${si.open ? "" : ` (${si.reason})`}.`,
          { data: { alternatives: alternatives() }, next_step: rules.person(CLERK, "OP-03", { action: "Offer the next available session." }) });
      }
      // An approved overbooking decision names the exact slot the doctor allocated (OP-09).
      const ob = get("requests").find((r) => r.type === "overbooking" && r.status === "approved" && r.patient === p.id && r.owner === doctor && r.decision && r.decision.date === date);
      let start = null, session = null;
      if (ob) { start = ob.decision.time; session = ob.decision.session; }
      else {
        for (const s of open) {
          const free = rules.freeStarts(doctor, date, s, len, appts);
          const want = input.time ? free.find((t) => t === input.time) : free[0];
          if (want) { start = want; session = s; break; }
        }
      }
      if (!start) throw refuse("session_full", `${rules.who(doctor).name}'s ${open.map((s) => (s === "AM" ? "morning" : "afternoon")).join(" and ")} on ${F.dayLabel(date)} ${open.length > 1 ? "are" : "is"} full.`,
        { data: { alternatives: alternatives(), requested: { doctor, date, session: input.session || null } },
          next_step: rules.person(doctor, "OP-09", { action: `Offer the next available session; if the patient must be seen in this session, Nurul Huda raises an overbooking request to ${rules.who(doctor).name}, who decides the slot.` }) });
      const rec = { id: nextId("appointments", "SK-APT"), patient: p.id, doctor, date, start, minutes: len, visit_type: input.visit_type || "follow_up",
        status: "pending", channel: input.channel || "phone", guardian: p.guardian, created_by: staff.id, overbooking: ob ? ob.id : null, created: o.now };
      store.set("appointments", appts.concat([rec]));
      const conf = addAction({ type: "confirm_booking", owner: CLERK, patient: p.id, ref: rec.id, doctor, clause: "OP-07",
        text: `Confirm ${rec.id} with the registered guardian: ${rules.who(doctor).name}, ${F.when(date, start)}` });
      // Booking the follow-up closes the visit chain's booking action (OP-11).
      store.set("actions", get("actions").map((x) => (x.type === "book_follow_up" && x.patient === p.id && x.status === "open" && x.doctor === doctor ? Object.assign({}, x, { status: "done", outcome: `booked ${rec.id}` }) : x)));
      return { action, appointment: rec, confirm_action: conf.id, counted_from: input.in_days ? lastEncounter(p) : null };
    }

    // ---------------------------------------------------------------- visits and prescriptions (CL-06 to CL-11)
    function closeVisit(staff, input) {
      unavailable("close_visit");
      if (staff.role !== "doctor") throw refuse("tool_not_offered", "Back end: close_visit is for doctors.", { clause: "CL-06" });
      const { patient: p, error } = resolve(input.patient, input.age);
      if (error) throw error;
      const rel = relationship(staff, p);
      if (rel !== "own" && rel !== "cover") throw refuse("not_prescriber", `Back end: ${staff.id} is not responsible for ${p.id}.`, { next_step: rules.person(p.doctor, "CL-06", { say: `I'm sorry, you can't prescribe for ${p.first}. Only ${p.first}'s attending doctor, ${rules.who(p.doctor).name}, can prescribe for ${p.first}.` }) });
      const visits = get("visits");
      const v = input.visit_id ? visits.find((x) => x.id === input.visit_id && x.patient === p.id) : visits.find((x) => x.patient === p.id && x.date === today() && x.status === "open");
      if (!v) throw refuse("no_open_visit", `No open visit today for ${p.id}; a prescription needs a valid encounter.`, { next_step: rules.person(CLERK, "CL-06", { action: "A new prescription needs a booked encounter." }) });
      if (v.status === "closed") throw refuse("visit_already_closed", `${v.id} is already closed; a closed visit is never overwritten.`, { clause: "CL-06" });
      const checked = [];
      const ctx = { ageMonths: rules.ageAt(p.dob, today()).months, weight: weightOf(p), today: today(), allergyStatus: p.allergy_status,
        allergies: get("allergies").filter((a) => a.patient === p.id), indication: v.indication, others: [] };
      for (const line of input.lines || []) {
        const c = rules.checkLine(line, ctx);
        if (!c.ok) throw refuse(c.code, `Back end: ${c.message}`, { data: c.values, next_step: rules.person(staff.id, null, { action: "Returned to the prescribing doctor to correct and call again; nothing was recorded." }) });
        ctx.others.push(c.presentation);
        checked.push(Object.assign({}, line, c));
      }
      // Append the closure, the prescriptions and the clerk's actions in one step (CL-06, CL-11).
      v.status = "closed"; v.closed_at = o.now; v.closed_by = staff.id; v.follow_up_days = input.follow_up_days || null; v.follow_up_reason = input.follow_up_reason || null;
      store.set("visits", visits);
      const rx = get("prescriptions");
      const written = checked.map((c) => ({ id: nextId("prescriptions", "SK-RX"), patient: p.id, visit: v.id, doctor: staff.id, date: today(), presentation: c.presentation, profile: c.profile,
        amount_per_dose: Number(c.amount_per_dose), dose_unit: T.presentations[c.presentation].dose_unit, times_per_day: Number(c.times_per_day), as_needed: !!c.as_needed,
        duration_days: c.duration_days ? Number(c.duration_days) : null, supply_qty: c.supply.qty, supply_unit: c.supply.unit, mg_per_dose: c.mg_per_dose }));
      store.set("prescriptions", rx.concat(written));
      const made = [];
      for (const w of written) made.push(addAction({ type: "dispense", owner: CLERK, patient: p.id, ref: w.id, doctor: staff.id, clause: "CL-11",
        text: `Dispense exactly as written: ${T.presentations[w.presentation].generic} ${T.presentations[w.presentation].strength.split(" = ")[0]}, ${w.amount_per_dose} ${w.dose_unit} ${w.times_per_day} times a day${w.duration_days ? ` for ${w.duration_days} days` : ""}; supply ${w.supply_qty} x ${w.supply_unit}` }));
      made.push(addAction({ type: "prepare_bill", owner: CLERK, patient: p.id, ref: v.id, doctor: staff.id, clause: "BP-02", text: `Prepare the bill for ${v.id} from the Fee Schedule` }));
      if (input.follow_up_days) made.push(addAction({ type: "book_follow_up", owner: CLERK, patient: p.id, ref: v.id, doctor: staff.id, clause: "OP-11",
        target_date: rules.addDays(today(), Number(input.follow_up_days)), text: `Book ${staff.name}'s ${input.follow_up_days}-day follow-up` }));
      return { visit: v.id, patient: p.id, prescriptions: written, actions: made.map((a) => ({ id: a.id, type: a.type, owner: a.owner, text: a.text })), via: rel };
    }

    // ---------------------------------------------------------------- requests and completions (CP-12, CP-13)
    function raise(staff, input) {
      const type = input.type;
      const spec = T.request_types[type];
      if (!spec) throw refuse("details_missing", `No request type ${type}.`, { clause: "CP-12" });
      const isClerk = staff.role === "clerk";
      let p = null;
      if ((type !== "cover" && type !== "policy_question") || input.patient) {
        const r = resolve(input.patient, input.age);
        if (r.error) throw r.error;
        p = r.patient;
      }
      const rel = p ? relationship(staff, p) : null;
      const notPermitted = (who, clause) => refuse("request_not_permitted", `Back end: a ${type.replace("_", " ")} request is raised by ${spec.raised_by}.`, { next_step: rules.person(who, clause || "CP-12") });
      const base = { type, raised_by: staff.id, patient: p ? p.id : null, clause: spec.clause.split(", ")[0] };
      switch (type) {
        case "consult":
          if (staff.role !== "doctor" || staff.id === LEAD) throw notPermitted(LEAD, "CL-05");
          if (rel !== "own") throw notPermitted(p.doctor, "CL-05");
          return addRequest(Object.assign(base, { owner: LEAD, status: "open", question: input.question || input.reason || null }));
        case "cover": {
          if (staff.role !== "doctor") throw notPermitted(staff.id, "CL-04");
          const whose = input.patients_of || staff.id;  // CL-04: a doctor requests cover for their own patients only
          if (whose !== staff.id) throw notPermitted(whose, "CL-04");
          const own = get("patients").filter((x) => x.doctor === staff.id).map((x) => x.id);
          const pts = p ? [p.id] : own;
          if (pts.some((x) => !own.includes(x))) throw notPermitted(get("patients").find((x) => x.id === pts[0]).doctor, "CL-04");
          if (!input.from) throw refuse("details_missing", "A cover request names the dates.", { clause: "CL-04" });
          return addRequest(Object.assign(base, { owner: LEAD, status: "pending", cover_doctor: input.cover_doctor || LEAD, patients: pts, from: input.from, to: input.to_date || input.from, reason: input.reason || null }));
        }
        case "handover": {
          if (staff.role !== "doctor" || rel !== "own") throw notPermitted(p.doctor, "CL-02");
          const bc = rules.bandChange(p.dob, today());
          const to = input.to || (bc ? rules.bandDoctor(bc.to) : null);
          if (!to || !rules.who(to) || rules.who(to).role !== "doctor") throw refuse("details_missing", "A handover names the receiving band doctor.", { clause: "CL-02" });
          return addRequest(Object.assign(base, { owner: to, to, status: "pending", reason: input.reason || (bc ? `age band change: turns ${bc.to === "child" ? 1 : 13} on ${F.dayLabel(bc.on)}` : null), birthday: bc ? bc.on : null }));
        }
        case "fee_waiver": case "doctor_assignment":
          // CP-12 (founder, 22 Oct): the lead's own instruction to waive a fee is her decision, recorded and carried out.
          if (type === "fee_waiver" && staff.id === LEAD) {
            if (!input.amount_rm) throw refuse("details_missing", "A fee waiver names the charge and the amount.", { clause: "BP-07" });
            const rec = addRequest(Object.assign(base, { owner: LEAD, status: "approved", direct: true, decided_by: LEAD, decided_at: o.now, clause: "CP-12",
              amount: Math.round(Number(input.amount_rm) * 100), invoice: input.invoice_id || null, reason: input.reason || "decided by Dr Aisyah Rahman as lead" }));
            addAction({ type: "apply_waiver", owner: CLERK, patient: rec.patient, ref: rec.id, doctor: LEAD, clause: "BP-07", text: `Apply the approved adjustment of ${F.rm(rec.amount)} in the billing system` });
            return Object.assign(rec, { capacity: "lead" });
          }
          if (!isClerk) throw notPermitted(CLERK, type === "fee_waiver" ? "BP-07" : "OP-04");
          if (type === "fee_waiver" && !input.amount_rm) throw refuse("details_missing", "A fee waiver names the invoice or charge and the amount.", { clause: "BP-07" });
          return addRequest(Object.assign(base, { owner: LEAD, status: "pending", amount: input.amount_rm ? Math.round(Number(input.amount_rm) * 100) : null, invoice: input.invoice_id || null,
            reason: input.reason || (type === "fee_waiver" ? "not stated by the clerk" : null) }));
        case "overbooking": {
          if (!isClerk) throw refuse("request_not_permitted", "Back end: Nurul Huda raises overbooking requests; the requested doctor decides.", { next_step: rules.person(input.to || p.doctor, "OP-09", { action: "Nurul Huda raises the overbooking request; the requested doctor decides the slot." }) });
          const to = input.to || p.doctor;
          return addRequest(Object.assign(base, { owner: to, status: "pending", session: { date: input.date || null, session: input.session || null }, reason: input.reason || null }));
        }
        case "callback": case "repeat_prescription":
          if (!isClerk) throw notPermitted(CLERK, "CL-10");
          return addRequest(Object.assign(base, { owner: p.doctor, status: "pending", question: input.question || input.reason || null }));
        case "policy_question": {  // founder, 22 Oct: no rule covers it; the policy owner decides
          if (staff.id === LEAD) throw refuse("request_not_permitted", "Back end: Dr Aisyah Rahman is the policy owner; the question is hers to settle.", { clause: "CP-12",
            next_step: rules.person(LEAD, "CP-12", { say: "No rule covers this yet, and nothing was changed. As policy owner, you set the rule outside the assistant." }) });
          // Who may refer it (founder's authority lines, 22 Oct): billing, the clerk; a new service or a disclosure question,
          // the patient's attending doctor; a clinical matter is the attending doctor's own decision, not a referral.
          const topic = input.topic || "clinical";
          const owner = topic === "billing" ? CLERK : p ? p.doctor : null;
          const ownerOk = topic === "billing" ? isClerk : (rel === "own" || rel === "cover");
          if (topic === "clinical" && ownerOk) throw refuse("request_not_permitted", "Back end: a clinical matter is the attending doctor's own decision.", { clause: "CL-14",
            next_step: rules.person(staff.id, "CL-14", { say: "No rule covers this yet, and nothing was changed. The clinical decision is yours to make outside the assistant." }) });
          if (!ownerOk) {
            const o = rules.who(owner || LEAD);
            throw refuse("request_not_permitted", `Back end: a ${topic} question is referred by ${o.name}.`, { clause: "CP-12",
              next_step: rules.person(o.id, "CP-12", { say: `I'm sorry, you can't refer this question. Only ${p && topic !== "billing" ? p.first + "'s attending doctor, " : ""}${o.name}${p && topic !== "billing" ? "" : ", " + o.title.toLowerCase()}, can refer it.` }) });
          }
        }
          return addRequest(Object.assign(base, { owner: LEAD, status: "pending", question: input.question || input.reason || null }));
        case "external_referral":
          if (staff.role !== "doctor" || (rel !== "own" && rel !== "cover")) throw notPermitted(p.doctor, "CL-12");
          if (!input.destination) throw refuse("details_missing", "The doctor names the referral destination.", { clause: "CL-12" });
          return addRequest(Object.assign(base, { owner: CLERK, status: "pending", destination: input.destination, reason: input.reason || null }));
      }
      throw refuse("details_missing", `No request type ${type}.`);
    }

    const DECISIONS = { consult: ["close"], cover: ["approve", "decline"], handover: ["accept", "decline"], fee_waiver: ["approve", "decline"],
      doctor_assignment: ["assign", "decline"], overbooking: ["approve", "decline"], callback: ["close"], repeat_prescription: ["approve", "decline"], external_referral: ["close"], policy_question: ["close"] };
    function decide(staff, input) {
      const reqs = get("requests");
      const r = reqs.find((x) => x.id === input.request_id);
      if (!r) throw refuse("data_missing", `No request ${input.request_id}.`, { clause: "CP-13" });
      if (r.owner !== staff.id) throw refuse("not_owner", `Back end: ${r.id} is decided by ${r.owner}.`, { next_step: rules.person(r.owner, "CP-12", { request_id: r.id }) });
      if (r.raised_by === staff.id && staff.id === LEAD) throw refuse("self_approval", "Back end: the lead does not approve her own request.", { clause: "CP-12" });
      if (!["pending", "open"].includes(r.status)) throw refuse("request_closed", `${r.id} is already ${r.status}.`, { clause: "CP-13" });
      const d = input.decision;
      if (!DECISIONS[r.type].includes(d)) throw refuse("details_missing", `A ${r.type} request takes ${DECISIONS[r.type].join(" or ")}.`, { clause: "CP-13" });
      // Validate everything before any change, so a refused decision leaves the request as it was.
      if (r.type === "doctor_assignment" && d === "assign" && !r.details.permitted.includes(input.assign_to))
        throw refuse("details_missing", `Assign one of ${r.details.permitted.join(" or ")}.`, { clause: "OP-04" });
      if (r.type === "overbooking" && d === "approve" && (!input.date || !input.time)) throw refuse("details_missing", "Name the slot you can allocate: date and time.", { clause: "OP-09" });
      r.status = { close: "closed", approve: "approved", decline: "declined", accept: "accepted", assign: "approved" }[d];
      r.decided_by = staff.id; r.decided_at = o.now; r.note = input.note || null;
      if (r.type === "doctor_assignment" && d === "assign") r.decision = { assign_to: input.assign_to };
      if (r.type === "overbooking" && d === "approve") r.decision = { date: input.date, time: input.time, session: input.time < "13:00" ? "AM" : "PM" };
      if (r.type === "consult") r.advice = input.note || null;
      if (r.type === "handover" && d === "accept") {  // CL-02: one logged transaction changes the doctor of record
        const pts = get("patients");
        const p = pts.find((x) => x.id === r.patient);
        r.previous_doctor = p.doctor;
        p.doctor = r.to;
        store.set("patients", pts);
      }
      store.set("requests", reqs);
      const next = [];
      if (r.type === "fee_waiver" && d === "approve") next.push(addAction({ type: "apply_waiver", owner: CLERK, patient: r.patient, ref: r.id, clause: "BP-07", text: `Apply the approved adjustment of ${F.rm(r.amount)} in the billing system` }));
      if (r.type === "doctor_assignment" && d === "assign") next.push(addAction({ type: "book_assigned", owner: CLERK, patient: r.patient, ref: r.id, doctor: input.assign_to, clause: "OP-04", text: `Book the assigned doctor, ${rules.who(input.assign_to).name}` }));
      if (r.type === "overbooking" && d === "approve") next.push(addAction({ type: "book_overbooking", owner: CLERK, patient: r.patient, ref: r.id, doctor: r.owner, clause: "OP-09", text: `Book the allocated slot, ${F.when(input.date, input.time)}` }));
      return { request: r, capacity: staff.id === LEAD ? (["consult", "cover", "fee_waiver", "doctor_assignment"].includes(r.type) ? "lead" : "specialist") : null, next_actions: next.map((a) => a.id) };
    }

    function complete(staff, input) {
      const acts = get("actions");
      const a = acts.find((x) => x.id === input.item_id);
      if (!a) throw refuse("data_missing", `No pending item ${input.item_id}.`, { clause: "CP-13" });
      if (a.owner !== staff.id) throw refuse("not_owner", `Back end: ${a.id} is ${rules.who(a.owner).name}'s to complete.`, { clause: "CP-13", next_step: rules.person(a.owner, "CP-13") });
      if (a.status !== "open") throw refuse("request_closed", `${a.id} is already ${a.status}.`, { clause: "CP-13" });
      if (!input.outcome) throw refuse("details_missing", "Record the outcome.", { clause: "CP-13" });
      a.status = "done"; a.outcome = input.outcome; a.completed_at = o.now; a.completed_by = staff.id;
      store.set("actions", acts);
      return { action: a };
    }

    function request(staff, input) {
      unavailable("create_request");
      const act = input.action || "raise";
      if (act === "raise") return { action: "raise", request: raise(staff, input) };
      if (act === "decide") return Object.assign({ action: "decide" }, decide(staff, input));
      if (act === "complete") return Object.assign({ action: "complete" }, complete(staff, input));
      throw refuse("details_missing", `No action ${act}.`, { clause: "CP-13" });
    }

    // ---------------------------------------------------------------- payments (BP-04)
    function payment(staff, input) {
      unavailable("record_payment");
      if (staff.id !== CLERK) throw refuse("tool_not_offered", "Back end: only Nurul Huda records payments.", { clause: "BP-04" });
      const inv = get("invoices").find((x) => x.id === input.invoice_id);
      if (!inv) throw refuse("invoice_not_found", `No invoice ${input.invoice_id}.`, { next_step: rules.person(CLERK, "BP-03") });
      const pays = get("payments");
      if (!input.receipt_ref || !input.method || !(Number(input.amount_rm) > 0)) throw refuse("details_missing", "A payment needs the amount, the method and the receipt reference.", { clause: "BP-04" });
      if (pays.some((x) => x.ref === input.receipt_ref)) throw refuse("duplicate_reference", `Receipt ${input.receipt_ref} is already recorded.`);
      const sen = Math.round(Number(input.amount_rm) * 100);
      const bal = rules.invoiceBalance(inv, pays).outstanding;
      if (sen > bal) throw refuse("amount_above_balance", `${F.rm(sen)} is above the ${F.rm(bal)} outstanding on ${inv.id}.`, { next_step: rules.person(CLERK, "BP-04", { action: "Check the amount received against the invoice." }) });
      const rec = { id: nextId("payments", "SK-PAY"), invoice: inv.id, sen, method: input.method, ref: input.receipt_ref, time: o.now, recorded_by: staff.id };
      store.set("payments", pays.concat([rec]));
      return { payment: rec, invoice: inv.id, outstanding_after: bal - sen };
    }

    // ---------------------------------------------------------------- notices at sign-in (founder, 22 Oct)
    // What someone else has sent the signed-in person today, written here as one short sentence each; shown as the first
    // messages of their chat and given to the assistant as context. A doctor's prescription reaches the clerk as one notice.
    const LABEL_REQ = { consult: "a consult", cover: "a cover request", handover: "a handover", fee_waiver: "a fee-waiver request", doctor_assignment: "a doctor-assignment request",
      overbooking: "an overbooking request", callback: "a callback request", repeat_prescription: "a repeat-prescription request", external_referral: "a referral to arrange", policy_question: "a policy question" };
    const NEXT = { consult: (f) => `${f}'s clinical record is open to you while the consult is open.`, cover: () => "Approve or decline it in your actions.",
      handover: (f) => `Read ${f}'s handover summary, then accept or decline it.`, repeat_prescription: () => "Decide it in your actions; nothing is issued until you do.",
      callback: () => "Return the call and record the outcome.", external_referral: () => "Arrange it and record the outcome.", policy_question: () => "No rule covers it yet; set the rule or reply in your actions.", fee_waiver: () => "Approve or decline it in your actions.",
      doctor_assignment: () => "Assign the doctor in your actions.", overbooking: () => "Name the slot you can allocate, or decline, in your actions." };
    const WORD = ["no", "one", "two", "three", "four", "five", "six"];
    const qty = (n, unit) => `${WORD[n] || n} ${unit}${n === 1 ? "" : "s"}`;
    function notices(staff) {
      const start = o.now - (o.now + 8 * 3600) % 86400;  // midnight Malaysia time
      const pts = Object.fromEntries(get("patients").map((p) => [p.id, p]));
      const pt = (id) => (pts[id] ? `${pts[id].first}, ${rules.ageLabel(pts[id].dob, today())}` : null);
      const out = [];
      for (const r of get("requests").filter((x) => x.owner === staff.id && x.raised_by !== staff.id && ["pending", "open"].includes(x.status) && x.created >= start)) {
        const who = rules.who(r.raised_by).name;
        const about = r.question ? `, about ${r.question}` : r.reason ? ` (${r.reason.charAt(0).toLowerCase() + r.reason.slice(1)})` : "";
        out.push({ ids: [r.id], kind: r.type, text: r.type === "cover"
          ? `${who} has asked you to cover ${r.patients.length} patients on ${F.dayLabel(r.from)}${r.to !== r.from ? " to " + F.dayLabel(r.to) : ""}.`
          : `${who} has sent you ${LABEL_REQ[r.type] || "a request"}${r.patient ? " on " + pt(r.patient) : ""}${about}.` });
        const last = out[out.length - 1], f = r.patient && pts[r.patient] ? pts[r.patient].first : "";
        if (NEXT[r.type]) last.text += " " + NEXT[r.type](f);
      }
      const rx = Object.fromEntries(get("prescriptions").map((x) => [x.id, x]));
      const mine = get("actions").filter((a) => a.owner === staff.id && a.status === "open" && a.created >= start && a.doctor && a.doctor !== staff.id);
      const byVisit = {};
      for (const a of mine) { const v = a.type === "dispense" ? (rx[a.ref] || {}).visit : a.ref; (byVisit[v] = byVisit[v] || []).push(a); }
      for (const [, acts] of Object.entries(byVisit)) {
        const d = acts.filter((a) => a.type === "dispense").map((a) => rx[a.ref]).filter(Boolean);
        const who = rules.who(acts[0].doctor).name;
        if (d.length) {
          const meds = d.map((x) => { const p = T.presentations[x.presentation]; return `${p.generic.split(" ")[0].toLowerCase()} ${p.strength.split(" = ")[0]}, ${x.amount_per_dose} ${x.dose_unit} ${x.times_per_day === 2 ? "twice" : x.times_per_day + " times"} daily${x.duration_days ? " for " + x.duration_days + " days" : ""}`; }).join(" and ");
          const supply = d.map((x) => qty(x.supply_qty, x.supply_unit)).join(" and ");
          const bill = acts.some((a) => a.type === "prepare_bill") ? ", then prepare the bill" : "";
          out.push({ ids: acts.map((a) => a.id), kind: "dispense", text: `${who} has prescribed ${meds} for ${pt(acts[0].patient)}. Please dispense ${supply} exactly as written${bill}.` });
        } else for (const a of acts) out.push({ ids: [a.id], kind: a.type, text: `${who}: ${a.text}.` });
      }
      return out;
    }

    // ---------------------------------------------------------------- action lists, built in code (CP-13)
    function myActions(staff) {
      unavailable("list_my_actions");
      const pts = Object.fromEntries(get("patients").map((p) => [p.id, p]));
      const name = (id) => (pts[id] ? `${pts[id].name}, ${rules.ageLabel(pts[id].dob, today())}` : null);
      const items = [];
      for (const a of get("actions").filter((x) => x.owner === staff.id && x.status === "open"))
        items.push({ id: a.id, kind: "action", type: a.type, patient: a.patient, patient_name: name(a.patient), text: a.text, target_date: a.target_date || null, clause: a.clause, created: a.created });
      for (const r of get("requests").filter((x) => x.owner === staff.id && ["pending", "open"].includes(x.status)))
        items.push({ id: r.id, kind: "request", type: r.type, patient: r.patient, patient_name: name(r.patient), raised_by: r.raised_by, status: r.status, clause: r.clause, created: r.created,
          detail: r.question || r.reason || (r.details ? `requested ${r.details.requested_doctor}` : null), dates: r.from ? { from: r.from, to: r.to } : null, patients_covered: r.patients ? r.patients.length : null });
      if (staff.role === "doctor") {
        for (const p of Object.values(pts).filter((x) => x.doctor === staff.id)) {
          const bc = rules.bandChange(p.dob, today());
          const sent = get("requests").some((r) => r.type === "handover" && r.patient === p.id && ["pending", "accepted"].includes(r.status));
          if (bc && bc.days <= 30 && !sent) items.push({ id: `FLAG-${p.id}`, kind: "flag", type: bc.to === "adult" ? "turning_18" : "handover_due", patient: p.id, patient_name: name(p.id),
            text: bc.to === "adult" ? `Turns 18 on ${F.dayLabel(bc.on)}: review onward care (CL-03)` : `Moves to the ${T.bands[bc.to].label} band on ${F.dayLabel(bc.on)}: send the handover (CL-01, CL-02)`, clause: bc.to === "adult" ? "CL-03" : "CL-02" });
        }
      }
      const out = { staff: staff.id, items, raised_by_me: get("requests").filter((r) => r.raised_by === staff.id).map((r) => ({ id: r.id, type: r.type, patient: r.patient, owner: r.owner, status: r.status })) };
      if (staff.role === "clerk") {
        out.pending_confirmations = get("appointments").filter((a) => a.status === "pending" && a.date >= today()).length;
        out.vaccine_recalls = Object.values(pts).map((p) => ({ p, rows: rules.vaccineStatus(p, get("vaccinations").filter((v) => v.patient === p.id), today()) }))
          .filter((x) => x.rows.some((r) => ["PAST_TARGET_REVIEW", "DUE_TODAY", "HISTORY_UNVERIFIED"].includes(r.status)))
          .map((x) => ({ patient: x.p.id, name: x.p.name, age: rules.ageLabel(x.p.dob, today()), doctor: x.p.doctor,
            status: x.rows.some((r) => r.status === "PAST_TARGET_REVIEW") ? "PAST_TARGET_REVIEW" : x.rows.some((r) => r.status === "DUE_TODAY") ? "DUE_TODAY" : "HISTORY_UNVERIFIED",
            schedule_ids: x.rows.filter((r) => ["PAST_TARGET_REVIEW", "DUE_TODAY"].includes(r.status)).map((r) => r.schedule_id) }));
        out.payment_reminders = get("invoices").map((i) => Object.assign({ id: i.id, patient: i.patient }, rules.invoiceBalance(i, get("payments")))).filter((i) => i.outstanding > 0).length;
        // CP-13 (founder, 22 Oct): handover and cover requests for case and file management, read only.
        out.case_file = get("requests").filter((r) => ["handover", "cover"].includes(r.type)).map((r) => ({ id: r.id, type: r.type, patient: r.patient, patient_name: name(r.patient),
          raised_by: r.raised_by, owner: r.owner, status: r.status, dates: r.from ? { from: r.from, to: r.to } : null, reason: r.reason || null, read_only: true }));
      }
      return out;
    }

    return { resolve, relationship, access, record, findPatients, schedule, book, closeVisit, request, payment, myActions, notices, full, weightOf, VIEWS, OFFERED };
  }

  return { createBackend, VIEWS, OFFERED, LEAD, CLERK };
});
