/* The back end data layer: the second line behind the hooks.
 *
 * Critical checks run here too, on their own, so a hook fault or a direct call cannot get past them:
 * the role for every action (PS-RP-01), identification (PS-HS-04), the workflow order (check and
 * dispense only after a recorded consultation, dispense only after a passed check (or the GP's keep)
 * and with no open query, a failed check raising the query itself, bill only after dispensing when there is a prescription, issue only after prepare), the
 * pharmacist's four checks (PS-AC-02), prices and the panel split (PS-PL, PS-PN), a payment equal to
 * the patient's share, one receipt and one payment per bill (PS-PL-04), and documents copied exactly
 * from the GP's record (PS-AC-07, PS-AC-08). Work moves between people as tasks and notices written
 * in code (PS-RP-06). Raw values leave in sen and Unix seconds; PostToolUse converts and filters them.
 * A refusal is thrown as { backend: true, code, message, data }.
 *
 * opts.faults (benchmark only): { record_consultation: "unavailable", missing_price: "<item key>",
 * template_missing: true, stock_record_missing: "<medicine key>" }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./format.js"));
  else root.PSBackend = factory(root.PSFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  function refuse(code, message, data) {
    const e = new Error(message);
    Object.assign(e, { backend: true, code, data: data === undefined ? null : data });
    return e;
  }

  function createBackend(store, R, opts) {
    const o = opts || {};
    const faults = o.faults || {};
    const now = () => o.now;
    const today = () => F.mytDate(now());
    const T = R.tables;

    const all = (n) => store.get(n) || [];
    const save = (n, v) => store.set(n, v);
    const push = (n, rec) => store.set(n, all(n).concat([rec]));
    const update = (n, id, patch) => save(n, all(n).map((x) => (x.id === id ? Object.assign({}, x, patch) : x)));
    function nextId(key, prefix, width) {
      const meta = store.get("meta");
      const id = `${prefix}${String(meta.next[key]).padStart(width || 4, "0")}`;
      meta.next[key] += 1;
      store.set("meta", meta);
      return id;
    }
    const mustBe = (staff, tool, action) => {
      if (!staff || !R.offered(staff.role, tool, action)) throw refuse("not_offered", `Back end: ${tool} ${action} is not open to this role.`);
    };
    const patient = (id) => all("patients").find((p) => p.id === id) || null;
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const digits = (s) => String(s || "").replace(/\D/g, "");

    /** PS-HS-04: the patient ID, or the full name plus IC last 4 digits or phone. verified: name plus IC or phone matched. */
    function identify(input) {
      const i = input || {};
      if (i.patient_id) {
        const p = patient(String(i.patient_id).trim().toUpperCase());
        if (!p) throw refuse("no_match", `No patient ${i.patient_id}.`);
        if (i.name && norm(i.name) !== norm(p.name)) throw refuse("no_match", `${i.patient_id} is not ${i.name}.`);
        const ic = digits(i.ic_last4), ph = digits(i.phone);
        const verified = !!i.name && ((ic && ic === p.ic_last4) || (ph && ph === digits(p.phone)));
        if ((ic && ic !== p.ic_last4) || (ph && ph !== digits(p.phone))) throw refuse("no_match", `The IC or phone given does not match ${p.id}.`);
        return { p, verified };
      }
      if (!i.name) throw refuse("identifier_required", "Give the patient's full name with the last 4 digits of the IC or the phone number.");
      const ic = digits(i.ic_last4), ph = digits(i.phone);
      if (!ic && !ph) throw refuse("identifier_required", `A name alone is not enough to find ${i.name}: give the last 4 digits of the IC or the phone number.`);
      const hits = all("patients").filter((p) => norm(p.name) === norm(i.name) && ((ic && p.ic_last4 === ic) || (ph && digits(p.phone) === ph)));
      if (hits.length !== 1) throw refuse("no_match", `No single patient matches ${i.name} with that ${ic ? "IC" : "phone"}.`);
      return { p: hits[0], verified: true };
    }
    const consultToday = (pid) => all("consultations").filter((c) => c.patient === pid && c.date === today()).pop() || null;
    const dispensedFor = (cid) => all("dispensed").find((d) => d.consultation === cid) || null;
    const billFor = (cid) => all("bills").find((b) => b.consultation === cid) || null;
    const openQueries = (cid) => all("tasks").filter((t) => t.kind === "query" && t.consultation === cid && t.status === "open");
    const queueToday = (pid) => all("queue").filter((q) => q.patient === pid && q.date === today()).pop() || null;
    function closeTasks(test, how) {
      save("tasks", all("tasks").map((t) => (t.status === "open" && test(t) ? Object.assign({}, t, { status: how || "done", closed: now() }) : t)));
    }
    function task(kind, to, p, cid, text, extra) {
      const t = Object.assign({ id: nextId("TK", "TK-"), kind, to, patient: p.id, consultation: cid, created: now(), status: "open", text }, extra || {});
      push("tasks", t);
      return t;
    }
    function notice(to, text, ref) {
      const n = { id: nextId("NT", "NT-"), to, text, ref: ref || null, at: now() };
      push("notices", n);
      return n;
    }
    const logChange = (staff, what, ref, before, after) => push("change_log", { by: staff.id, at: now(), what, ref, before: before || null, after: after || null });

    // ---------------------------------------------------------------- patient
    function patientFind(staff, input) {
      mustBe(staff, "patient", "find");
      const { p, verified } = identify(input);
      const view = input.view || "summary";
      if (view === "case_notes" && staff.role !== "gp") throw refuse("no_access", "Back end: case notes are for the GP only.");
      if (view === "medicines" && staff.role === "desk") throw refuse("no_access", "Back end: medicines detail is for the GP and the pharmacist.");
      const notes = view === "case_notes"
        ? all("case_notes").filter((n) => n.patient === p.id).slice(-3).concat(all("consultations").filter((c) => c.patient === p.id).map((c) => ({ date: c.date, complaint: c.diagnosis, note: c.case_note })))
        : null;
      return { patient: p, verified, view, queue: queueToday(p.id), bookings: all("appointments").filter((a) => a.patient === p.id && a.status === "booked" && a.start.slice(0, 10) >= today()),
               last_visits: all("case_notes").filter((n) => n.patient === p.id).slice(-3).map((n) => ({ date: n.date, complaint: n.complaint })), notes };
    }
    function patientRegister(staff, input) {
      mustBe(staff, "patient", "register");
      const need = ["name", "dob", "phone", "ic_last4"].filter((k) => !input[k]);
      if (need.length) throw refuse("invalid_fields", `Missing: ${need.join(", ")}.`);
      if (!/^\d{4}$/.test(digits(input.ic_last4)) || digits(input.ic_last4).length !== 4) throw refuse("invalid_fields", "The IC last 4 digits must be 4 digits.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dob) || input.dob > today()) throw refuse("invalid_fields", "The date of birth must be YYYY-MM-DD, not in the future.");
      if (digits(input.phone).length < 9) throw refuse("invalid_fields", "The phone number looks incomplete.");
      const dup = all("patients").find((p) => p.ic_last4 === digits(input.ic_last4) || digits(p.phone) === digits(input.phone));
      if (dup) throw refuse("already_registered", `A patient with that ${dup.ic_last4 === digits(input.ic_last4) ? "IC last 4 digits" : "phone number"} is already registered as ${dup.id}.`, { patient_id: dup.id });
      let panel = null;
      if (input.panel) {
        const pid = String(input.panel).toLowerCase().replace(/^panel\s+/, "");
        if (!T.panels[pid] || !input.member_id) throw refuse("invalid_fields", "A panel needs a known panel name and the member ID.");
        panel = { panel: pid, member_id: input.member_id };
      }
      const allergies = (input.allergies || []).filter((a) => a && !/^(none|nil|no known|nkda|no allerg)/i.test(String(a).trim()));
      const p = { id: nextId("P", "PS-P-"), name: input.name.trim(), dob: input.dob, phone: input.phone, ic_last4: digits(input.ic_last4), registered: today(),
                  allergies, conditions: [], current_medicines: [], panel };
      push("patients", p);
      logChange(staff, "register", p.id, null, { name: p.name });
      return { patient: p, registered: true };
    }
    function patientUpdate(staff, input) {
      mustBe(staff, "patient", "update_contact");
      const { p } = identify(input);
      if (!input.new_phone) throw refuse("invalid_fields", "Give the new phone number.");
      if (all("patients").some((x) => x.id !== p.id && digits(x.phone) === digits(input.new_phone))) throw refuse("already_registered", "That phone number belongs to another patient.");
      update("patients", p.id, { phone: input.new_phone });
      logChange(staff, "update_contact", p.id, { phone: p.phone }, { phone: input.new_phone });
      return { patient: Object.assign({}, p, { phone: input.new_phone }), updated: true };
    }

    // ---------------------------------------------------------------- schedule
    function book(staff, input) {
      mustBe(staff, "schedule", "book");
      const { p } = identify(input);
      const prob = R.slotProblem(input.date, input.time);
      if (prob) throw refuse(prob, prob === "clinic_closed" ? `The clinic is closed on ${F.dayWords(input.date)}.` : "Choose a 15-minute slot from 09:00 to 17:45.", { next_open: R.nextOpen(input.date || today()) });
      if (input.date < today()) throw refuse("outside_hours", "That date has passed.");
      const start = `${input.date} ${input.time}:00`;
      if (all("appointments").some((a) => a.start === start && a.status === "booked")) throw refuse("slot_taken", `${F.dayLabel(input.date)} ${input.time} is already booked.`);
      const a = { id: nextId("AP", "AP-"), patient: p.id, start, status: "booked", doctor: "GP-01", kind: "appointment", booked_by: staff.id, booked_at: now() };
      push("appointments", a);
      logChange(staff, "book", a.id, null, { start });
      closeTasks((t) => t.kind === "follow_up" && t.patient === p.id);
      return { appointment: a, patient: p };
    }
    function findBooking(p, input) {
      const list = all("appointments").filter((a) => a.patient === p.id && a.status === "booked" && a.start.slice(0, 10) >= today());
      const a = input.appointment_id ? list.find((x) => x.id === input.appointment_id) : list.length === 1 ? list[0] : null;
      if (!a) throw refuse("no_appointment", list.length ? "More than one booking: name the appointment ID." : `${p.name} has no upcoming booking.`, { bookings: list.map((x) => x.id) });
      return a;
    }
    function change(staff, input) {
      mustBe(staff, "schedule", "change");
      const { p } = identify(input);
      const a = findBooking(p, input);
      const prob = R.slotProblem(input.date, input.time);
      if (prob) throw refuse(prob, prob === "clinic_closed" ? `The clinic is closed on ${F.dayWords(input.date)}.` : "Choose a 15-minute slot from 09:00 to 17:45.");
      const start = `${input.date} ${input.time}:00`;
      if (all("appointments").some((x) => x.start === start && x.status === "booked" && x.id !== a.id)) throw refuse("slot_taken", `${F.dayLabel(input.date)} ${input.time} is already booked.`);
      update("appointments", a.id, { start });
      logChange(staff, "change", a.id, { start: a.start }, { start });
      return { appointment: Object.assign({}, a, { start }), patient: p, before: a.start };
    }
    function cancel(staff, input) {
      mustBe(staff, "schedule", "cancel");
      const { p } = identify(input);
      const a = findBooking(p, input);
      update("appointments", a.id, { status: "cancelled" });
      logChange(staff, "cancel", a.id, { status: "booked" }, { status: "cancelled" });
      return { appointment: Object.assign({}, a, { status: "cancelled" }), patient: p };
    }
    function checkIn(staff, input) {
      mustBe(staff, "schedule", "check_in");
      const { p } = identify(input);
      const q = queueToday(p.id);
      if (q && (q.status === "waiting" || q.status === "with_gp")) throw refuse("already_in_queue", `${p.name} is already in today's queue.`);
      if (!R.isOpen(today())) throw refuse("clinic_closed", "The clinic is closed today.");
      const appt = all("appointments").find((a) => a.patient === p.id && a.status === "booked" && a.start.slice(0, 10) === today());
      const hm = F.hhmm(now());
      if (!appt && hm > T.hours.walk_in_until) throw refuse("outside_hours", "Walk-ins are accepted until 17:30.");
      const e = { id: nextId("QU", "QU-"), patient: p.id, date: today(), kind: appt ? "appointment" : "walk_in", arrived: now(),
                  appointment_time: appt ? appt.start.slice(11, 16) : null, status: "waiting", by: staff.id };
      push("queue", e);
      if (appt) update("appointments", appt.id, { status: "arrived" });
      return { entry: e, patient: p, ahead: waiting().findIndex((x) => x.id === e.id) };
    }
    /** PS-HS-06: appointments at their booked time, walk-ins by arrival. */
    function waiting() {
      const w = all("queue").filter((q) => q.date === today() && q.status === "waiting");
      const due = (q) => q.kind === "appointment" && q.appointment_time <= F.hhmm(now());
      return w.filter(due).sort((a, b) => a.appointment_time.localeCompare(b.appointment_time))
        .concat(w.filter((q) => !due(q)).sort((a, b) => a.arrived - b.arrived));
    }
    function viewQueue(staff) {
      mustBe(staff, "schedule", "view_queue");
      const withGp = all("queue").find((q) => q.date === today() && q.status === "with_gp") || null;
      return { with_gp: withGp, waiting: waiting(), bookings: all("appointments").filter((a) => a.start.slice(0, 10) === today() && a.status === "booked") };
    }
    function callNext(staff) {
      mustBe(staff, "schedule", "call_next");
      const next = waiting()[0];
      if (!next) throw refuse("queue_empty", "Nobody is waiting.");
      save("queue", all("queue").map((q) => (q.date === today() && q.status === "with_gp" ? Object.assign({}, q, { status: "seen" }) : q.id === next.id ? Object.assign({}, q, { status: "with_gp", called: now() }) : q)));
      return { called: Object.assign({}, next, { status: "with_gp" }), patient: patient(next.patient), still_waiting: waiting().length };
    }

    // ---------------------------------------------------------------- record_consultation
    function prescriptionLines(lines) {
      return (lines || []).map((l) => {
        const k = R.medicineKey(l.medicine);
        if (!k) throw refuse("unknown_item", `${l.medicine} is not in the clinic formulary.`);
        const m = R.MED[k];
        let dose = l.dose === undefined || l.dose === null ? null : Number(l.dose), unit = l.dose_unit || m.dose_unit;
        // "2 tablets" of a 500 mg tablet is 1000 mg: the formulary checks the dose in its own unit.
        if (/^(tablet|capsule|tab|cap)s?$/i.test(unit) && m.mg_per_unit && dose !== null) { dose *= m.mg_per_unit; unit = "mg"; }
        if (/^puffs?$/i.test(unit)) unit = "puff";
        if (/^sachets?$/i.test(unit)) unit = "sachet";
        const out = { medicine: k, dose, dose_unit: unit, times_per_day: l.times_per_day === undefined ? null : Number(l.times_per_day),
                      days: l.days === undefined ? null : Number(l.days), quantity: l.quantity === undefined ? null : Number(l.quantity), as_needed: !!l.as_needed, instructions: l.instructions || null };
        if (out.quantity === null && out.dose && out.times_per_day && out.days) {
          const per = m.mg_per_unit ? out.dose / m.mg_per_unit : m.unit === "inhaler" ? null : out.dose;
          out.quantity = per === null ? 1 : Math.ceil(per * out.times_per_day * out.days);
        }
        if (!out.instructions && out.dose && out.times_per_day)
          out.instructions = `Take ${out.dose} ${out.dose_unit} ${out.times_per_day === 1 ? "once" : out.times_per_day === 2 ? "twice" : `${out.times_per_day} times`} a day${out.as_needed ? " when needed" : ""}${out.days ? ` for ${out.days} days` : ""}.`;
        const miss = R.missingFields(out);
        if (miss.length) throw refuse("prescription_incomplete", `${m.name}: missing ${miss.join(", ")}.`);
        return out;
      });
    }
    function rxWords(lines) {
      return lines.map((l) => `${R.MED[l.medicine].name} ${l.dose} ${l.dose_unit} ${l.times_per_day === 1 ? "once" : l.times_per_day === 2 ? "twice" : `${l.times_per_day} times`} a day${l.days ? ` for ${l.days} days` : ""} (${l.quantity})`).join("; ");
    }
    function record(staff, input) {
      mustBe(staff, "record_consultation", "record");
      if (faults.record_consultation === "unavailable") throw refuse("system_unavailable", "The records system did not respond; nothing was recorded.");
      const { p } = identify(input);
      const q = queueToday(p.id);
      if (!q || q.status !== "with_gp") throw refuse("not_called", `${p.name} is not with the GP now: call the patient from the queue first.`);
      if (!input.diagnosis) throw refuse("invalid_fields", "Give the diagnosis.");
      const services = (input.services && input.services.length ? input.services : ["gp-consultation"]).map((s) => {
        const k = R.serviceKey(s);
        if (!k) throw refuse("unknown_item", `${s} is not a service the clinic offers.`);
        return k;
      });
      if (!services.includes("gp-consultation")) services.unshift("gp-consultation");
      const lines = prescriptionLines(input.prescription);
      let mc = null, referral = null;
      if (input.mc) {
        if (input.mc.declined) mc = { declined: true };
        else {
          const days = Number(input.mc.days), start = input.mc.start_date || today();
          if (!Number.isInteger(days) || days < 1 || !/^\d{4}-\d{2}-\d{2}$/.test(start) || start < today()) throw refuse("invalid_mc", "An MC needs whole days and a start date not before today's visit.");
          mc = { days, start_date: start, end_date: F.addDays(start, days - 1) };
        }
      }
      if (input.referral) {
        const r = input.referral, miss = ["to", "reason", "urgency", "summary"].filter((k) => !r[k]);
        if (miss.length || !["routine", "soon", "urgent"].includes(r.urgency)) throw refuse("invalid_referral", `A referral needs ${miss.length ? miss.join(", ") : "an urgency of routine, soon or urgent"}.`);
        referral = { to: r.to, reason: r.reason, urgency: r.urgency, summary: r.summary };
      }
      const ret = input.return_in_days ? Number(input.return_in_days) : null;
      const c = { id: nextId("CN", "CN-"), patient: p.id, date: today(), at: now(), by: staff.id, diagnosis: input.diagnosis, case_note: input.case_note || `${input.diagnosis}.`,
                  services, prescription: lines, return_in_days: ret, mc, referral, amended: [] };
      push("consultations", c);
      update("queue", q.id, { status: "seen" });
      const created = [];
      if (lines.length) {
        created.push(task("check", "PH-01", p, c.id, "Check and dispense the prescription."));
        notice("PH-01", `Dr Sivakumar has prescribed ${rxWords(lines)} for ${p.name} (${p.id}). Please check and dispense it exactly as written.`, c.id);
      } else {
        created.push(task("bill", "FD-01", p, c.id, "Prepare the bill."));
        notice("FD-01", `Dr Sivakumar has seen ${p.name} (${p.id}) with no prescription. The bill is ready to prepare.`, c.id);
      }
      if (mc && !mc.declined) {
        created.push(task("document", "FD-01", p, c.id, "Prepare the MC for Dr Sivakumar's signature.", { document: "mc" }));
        notice("FD-01", `Dr Sivakumar has recorded a ${mc.days}-day MC for ${p.name} (${p.id}) from ${F.dayWords(mc.start_date)}. Please prepare it for Dr Sivakumar's signature.`, c.id);
      }
      if (referral) {
        created.push(task("document", "FD-01", p, c.id, "Prepare the referral letter for Dr Sivakumar's signature.", { document: "referral" }));
        notice("FD-01", `Dr Sivakumar has recorded a ${referral.urgency} referral for ${p.name} (${p.id}) to ${referral.to}. Please prepare the letter for Dr Sivakumar's signature.`, c.id);
      }
      if (ret) {
        const d = R.nextOpen(F.addDays(today(), ret));
        created.push(task("follow_up", "FD-01", p, c.id, `Book the follow-up on ${F.dayWords(d)}.`, { date: d }));
      }
      return { consultation: c, patient: p, tasks: created };
    }
    function amend(staff, input) {
      mustBe(staff, "record_consultation", "amend_prescription");
      const { p } = identify(input);
      const c = consultToday(p.id);
      if (!c || !c.prescription.length) throw refuse("no_consultation", `${p.name} has no prescription today to change.`);
      if (dispensedFor(c.id)) throw refuse("already_dispensed", "The prescription was already dispensed.");
      const newLines = prescriptionLines(input.prescription);
      if (!newLines.length) throw refuse("prescription_incomplete", "Give the new prescription line.");
      const oldKey = input.replace_medicine ? R.medicineKey(input.replace_medicine) : null;
      let lines;
      if (oldKey) {
        if (!c.prescription.some((l) => l.medicine === oldKey)) throw refuse("unknown_item", `${input.replace_medicine} is not on today's prescription.`);
        lines = c.prescription.filter((l) => l.medicine !== oldKey).concat(newLines);
      } else {
        const keys = new Set(newLines.map((l) => l.medicine));
        lines = c.prescription.length === 1 || c.prescription.every((l) => keys.has(l.medicine)) ? newLines
          : c.prescription.filter((l) => !keys.has(l.medicine)).concat(newLines);
      }
      const before = c.prescription;
      update("consultations", c.id, { prescription: lines, amended: c.amended.concat([{ at: now(), by: staff.id, before, after: lines }]) });
      logChange(staff, "amend_prescription", c.id, before, lines);
      const queries = openQueries(c.id);
      closeTasks((t) => t.kind === "query" && t.consultation === c.id, "answered");
      save("tasks", all("tasks").map((t) => (queries.some((q) => q.id === t.id) ? Object.assign({}, t, { decision: "amended", answer: rxWords(lines) }) : t)));
      closeTasks((t) => t.kind === "check" && t.consultation === c.id, "replaced");
      const t = task("check", "PH-01", p, c.id, "Check the amended prescription.");
      notice("PH-01", `Dr Sivakumar has amended ${p.name}'s prescription to ${rxWords(lines)}. Please check it again before dispensing.`, c.id);
      return { consultation: Object.assign({}, c, { prescription: lines }), patient: p, before, task: t, answered: queries.map((q) => q.id) };
    }

    // ---------------------------------------------------------------- dispense
    function stockView() {
      const s = JSON.parse(JSON.stringify(store.get("stock") || {}));
      if (faults.stock_record_missing) delete s[faults.stock_record_missing];
      return s;
    }
    /** The first failed check decides the query reason, in this order (PS-AC-03). */
    const REASON_ORDER = ["P1", "P2", "P3"];
    const firstReason = (failed) => REASON_ORDER.find((r) => failed.some((f) => f.reason === r)) || null;
    /** Failed checks a "keep" cannot override: the medicine is out of stock or the line is incomplete. A keep
     * overrides a clinical judgement (an allergy, a dose outside the range), never a fact that stops dispensing. */
    const blocksKeep = (failed) => failed.filter((f) => f.check === "stock" || f.check === "complete");
    /** The GP answered a query on this version of the prescription with "keep". */
    const keptFor = (c) => all("tasks").some((t) => t.kind === "query" && t.consultation === c.id && t.decision === "keep"
      && t.closed >= ((c.amended[c.amended.length - 1] || {}).at || 0));
    function rxFor(staff, input) {
      const { p } = identify(input);
      const c = consultToday(p.id);
      if (!c || !c.prescription.length) throw refuse("no_consultation", `${p.name} has no prescription recorded today.`);
      if (dispensedFor(c.id)) throw refuse("already_dispensed", `${p.name}'s prescription was already dispensed.`);
      return { p, c };
    }
    function runCheck(staff, p, c) {
      const failed = R.check(p, c.prescription, stockView());
      const missing = failed.filter((f) => f.reason === "stock_record_missing");
      if (missing.length) throw refuse("stock_record_missing", `No stock record for ${missing.map((f) => R.itemName(f.medicine)).join(", ")}; the check was not recorded.`);
      return failed;
    }
    function raiseQuery(staff, p, c, reason, question, auto) {
      const t = task("query", "GP-01", p, c.id, `Query from Ms Yong: ${question}`, { reason, question, from: staff.id, auto: !!auto });
      const n = notice("GP-01", R.handoverNotice(t, p, today()), t.id);
      return { t, n };
    }
    /** One action for the pharmacist's step (PS-AC-02 to PS-AC-04): the four checks, then dispense when they
     * pass (or when Dr Sivakumar answered to keep this version), or hold the prescription and raise the
     * query to Dr Sivakumar with the reason the failed check gives. Code decides which; the model never does. */
    function checkAndDispense(staff, input) {
      mustBe(staff, "dispense", "check_and_dispense");
      const { p, c } = rxFor(staff, input);
      if (openQueries(c.id).length) throw refuse("query_open", "The prescription is held while the query is with Dr Sivakumar.");
      const failed = runCheck(staff, p, c);
      const kept = keptFor(c);
      const blocking = blocksKeep(failed);
      if (failed.length && kept && blocking.length) throw refuse("check_not_passed", `${blocking.map((f) => `${R.itemName(f.medicine)}: ${f.detail}`).join("; ")}; Dr Sivakumar must amend the prescription.`);
      const ck = { id: nextId("CK", "CK-"), consultation: c.id, patient: p.id, by: staff.id, at: now(), result: failed.length ? "failed" : "passed", failed, version: c.amended.length };
      push("checks", ck);
      if (failed.length && !kept) {
        const reason = firstReason(failed);
        const question = failed.filter((f) => f.reason === reason).map((f) => `${R.itemName(f.medicine)}, ${f.detail}`).join("; ");
        const { t, n } = raiseQuery(staff, p, c, reason, question, true);
        return { check: ck, patient: p, prescription: c.prescription, held: true, task: t, notice: n };
      }
      const stock = store.get("stock");
      for (const l of c.prescription) stock[l.medicine] = { qty: stock[l.medicine].qty - l.quantity, updated: now() };
      store.set("stock", stock);
      const d = { consultation: c.id, patient: p.id, by: staff.id, at: now(), lines: c.prescription, check: ck.id };
      push("dispensed", d);
      closeTasks((t) => t.kind === "check" && t.consultation === c.id);
      const bt = task("bill", "FD-01", p, c.id, "Prepare the bill.");
      notice("FD-01", `Ms Yong has dispensed ${p.name}'s medicines (${p.id}). The bill is ready to prepare.`, c.id);
      return { check: ck, patient: p, prescription: c.prescription, held: false, dispensed: d, bill_task: bt };
    }
    /** Ms Yong's own concern (PS-AC-03). Code picks the reason: the failed check's, else P4 another concern. */
    function queryGp(staff, input) {
      mustBe(staff, "dispense", "query_gp");
      if (!input.question) throw refuse("missing_details", "Say what the concern is.");
      const { p, c } = rxFor(staff, input);
      if (openQueries(c.id).length) throw refuse("query_open", "A query on this prescription is already with Dr Sivakumar.");
      const reason = firstReason(runCheck(staff, p, c)) || "P4";
      const { t, n } = raiseQuery(staff, p, c, reason, input.question, false);
      return { task: t, patient: p, notice: n };
    }
    function viewStock(staff, input) {
      mustBe(staff, "dispense", "view_stock");
      const s = stockView();
      if (input.medicine) {
        const k = R.medicineKey(input.medicine);
        if (!k) throw refuse("unknown_item", `${input.medicine} is not in the clinic formulary.`);
        if (!s[k]) throw refuse("stock_record_missing", `No stock record for ${R.itemName(k)}.`);
        return { items: { [k]: s[k] } };
      }
      return { items: s };
    }

    // ---------------------------------------------------------------- billing
    function prepareBill(staff, input) {
      mustBe(staff, "billing", "prepare_bill");
      const { p, verified } = identify(input);
      const c = consultToday(p.id);
      if (!c) throw refuse("no_consultation", `${p.name} has no consultation recorded today.`);
      if (billFor(c.id)) throw refuse("already_billed", `${p.name}'s bill is already prepared.`, { bill_id: billFor(c.id).id });
      const d = dispensedFor(c.id);
      if (c.prescription.length && !d) throw refuse("not_dispensed", `${p.name}'s prescription is not dispensed yet; the bill follows dispensing.`);
      const panel = R.panelOf(p);
      if (panel) {
        if (!verified) throw refuse("identity_not_verified", `${p.name} is on ${panel.name}: verify the full name with the IC last 4 digits or phone before a panel bill.`);
        if (!R.panelValid(panel, today())) throw refuse("panel_schedule_expired", `${panel.name}'s prices run ${panel.valid_from} to ${panel.valid_to}; today is outside that period.`);
      }
      const b = R.bill(c.services, d ? d.lines : [], panel, faults.missing_price);
      if (b.missing.length) throw refuse("missing_price", `No price for ${b.missing.join(", ")}; the bill was not prepared.`);
      const bill = { id: nextId("BL", "BL-"), patient: p.id, consultation: c.id, date: today(), by: staff.id, at: now(),
                     panel: panel ? { panel: panel.id, name: panel.name, member_id: p.panel.member_id, co_pay: b.co_pay, covered: b.covered, excluded: b.excluded, claim_status: "awaiting claim", acknowledged: null } : null,
                     lines: b.lines, total: b.total, panel_share: b.panel_share, patient_share: b.patient_share, status: b.patient_share === 0 ? "paid" : "unpaid" };
      push("bills", bill);
      closeTasks((t) => t.kind === "bill" && t.consultation === c.id);
      return { bill, patient: p };
    }
    function findBill(p, input) {
      if (input.bill_id) {
        const b = all("bills").find((x) => x.id === String(input.bill_id).toUpperCase());
        if (!b || (p && b.patient !== p.id)) throw refuse("no_bill", `No bill ${input.bill_id}${p ? ` for ${p.name}` : ""}.`);
        return b;
      }
      const b = all("bills").filter((x) => x.patient === p.id && x.date === today()).pop();
      if (!b) throw refuse("no_bill", `${p.name} has no bill today.`);
      return b;
    }
    function recordPayment(staff, input) {
      mustBe(staff, "billing", "record_payment");
      const p = input.bill_id && !input.name && !input.patient_id ? null : identify(input).p;
      const b = findBill(p, input);
      if (b.status === "paid") throw refuse("already_settled", `${b.id} is already paid.`);
      const amount = F.toSen(input.amount_rm);
      if (amount !== b.patient_share) throw refuse("amount_mismatch", `The patient's share on ${b.id} is ${F.rm(b.patient_share)}; ${amount === null ? "no amount was given" : `${F.rm(amount)} does not match`}.`, { patient_share: b.patient_share });
      if (!["cash", "card", "e-wallet"].includes(input.method)) throw refuse("invalid_method", "The method is cash, card or e-wallet.");
      const tendered = input.method === "cash" && input.tendered_rm !== undefined ? F.toSen(input.tendered_rm) : null;
      if (tendered !== null && tendered < amount) throw refuse("amount_mismatch", `RM tendered is less than the ${F.rm(amount)} due.`);
      const pay = { id: nextId("RC", "RC-"), bill: b.id, patient: b.patient, amount, method: input.method, tendered, change: tendered === null ? 0 : tendered - amount, by: staff.id, at: now() };
      push("payments", pay);
      update("bills", b.id, { status: "paid" });
      update("consultations", b.consultation, { closed: now() });
      return { payment: pay, bill: Object.assign({}, b, { status: "paid" }), patient: patient(b.patient) };
    }
    function reconcile(staff, input) {
      mustBe(staff, "billing", "reconcile_day");
      const counted = F.toSen(input.counted_cash_rm);
      if (counted === null || counted < 0) throw refuse("invalid_count", "Give the cash counted in the drawer, in RM.");
      if (all("reconciles").some((r) => r.date === today())) throw refuse("already_reconciled", "Today is already reconciled.");
      const pays = all("payments").filter((x) => F.mytDate(x.at) === today());
      const by = { cash: 0, card: 0, "e-wallet": 0 };
      for (const x of pays) by[x.method] += x.amount;
      const r = { id: `RCN-${today()}`, date: today(), by: staff.id, at: now(), by_method: by, expected_cash: by.cash, counted_cash: counted, difference: counted - by.cash,
                  bills: pays.map((x) => x.bill) };
      push("reconciles", r);
      if (r.difference !== 0)
        push("owner_review", { id: `OR-${String(all("owner_review").length + 1).padStart(4, "0")}`, date: today(), kind: "cash_difference", amount: r.difference, reconcile: r.id,
                               text: `Cash counted ${F.rm(counted)} against ${F.rm(by.cash)} recorded: ${F.rm(Math.abs(r.difference))} ${r.difference < 0 ? "short" : "over"}.`, bills: r.bills });
      return { reconcile: r, payments: pays };
    }
    function viewBill(staff, input) {
      mustBe(staff, "billing", "view_bill");
      const p = input.bill_id && !input.name && !input.patient_id ? null : identify(input).p;
      const b = findBill(p, input);
      return { bill: b, patient: patient(b.patient), payment: all("payments").find((x) => x.bill === b.id) || null };
    }
    function viewPayments(staff, input) {
      mustBe(staff, "billing", "view_payments");
      const d = input.date || today();
      const pays = all("payments").filter((x) => F.mytDate(x.at) === d);
      return { date: d, payments: pays, reconcile: all("reconciles").find((r) => r.date === d) || null,
               history: all("invoices_history").filter((i) => i.date === d && i.paid).map((i) => ({ id: i.id, amount: i.amount })) };
    }
    function viewOwner(staff) {
      mustBe(staff, "billing", "view_owner_review");
      return { items: all("owner_review") };
    }
    function viewPanel(staff, input) {
      mustBe(staff, "billing", "view_panel_bills");
      const d = input.date || today();
      return { date: d, bills: all("bills").filter((b) => b.panel && b.date === d) };
    }
    function acknowledge(staff, input) {
      mustBe(staff, "billing", "acknowledge_panel_bill");
      const p = input.bill_id && !input.name && !input.patient_id ? null : identify(input).p;
      const b = findBill(p, input);
      if (!b.panel) throw refuse("not_panel_bill", `${b.id} is not a panel bill.`);
      if (b.panel.acknowledged) throw refuse("already_acknowledged", `${b.id} was acknowledged at ${F.hhmm(b.panel.acknowledged.at)}.`);
      const ack = { by: staff.id, at: now() };
      update("bills", b.id, { panel: Object.assign({}, b.panel, { acknowledged: ack }) });
      push("acknowledgements", { bill: b.id, by: staff.id, at: now() });
      return { bill: Object.assign({}, b, { panel: Object.assign({}, b.panel, { acknowledged: ack }) }), patient: patient(b.patient) };
    }

    // ---------------------------------------------------------------- documents
    function docType(t) { return /ref/i.test(String(t || "")) ? "referral" : /mc|medical|cert|sick/i.test(String(t || "")) ? "mc" : null; }
    function prepareDoc(staff, input) {
      mustBe(staff, "documents", "prepare");
      const { p } = identify(input);
      const type = docType(input.type);
      if (!type) throw refuse("invalid_fields", "Say whether it is an MC or a referral letter.");
      const c = consultToday(p.id);
      const decided = c && (type === "mc" ? c.mc : c.referral);
      if (!decided) throw refuse("no_gp_record", `There is no ${type === "mc" ? "MC" : "referral"} in Dr Sivakumar's record for ${p.name} today.`, { patient: p.name, type });
      if (type === "mc" && decided.declined) throw refuse("mc_declined", `Dr Sivakumar declined an MC for ${p.name} in today's consultation.`, { patient: p.name, type });
      if (all("documents").some((x) => x.consultation === c.id && x.type === type)) throw refuse("already_prepared", `${p.name}'s ${type === "mc" ? "MC" : "referral letter"} is already prepared.`);
      if (faults.template_missing) throw refuse("template_missing", `The ${type === "mc" ? "MC" : "referral letter"} template is missing; nothing was prepared.`);
      const serial = type === "mc" ? nextId("MC", T.templates.mc) : nextId("REF", T.templates.referral);
      const doc = { id: serial, type, patient: p.id, consultation: c.id, by: staff.id, at: now(), status: "ready_for_signature",
                    content: type === "mc" ? { patient: p.name, ic_last4: p.ic_last4, visit_date: c.date, days: decided.days, start_date: decided.start_date, end_date: decided.end_date, addressee: "To whom it may concern" }
                      : { patient: p.name, ic_last4: p.ic_last4, visit_date: c.date, to: decided.to, reason: decided.reason, urgency: decided.urgency, summary: decided.summary } };
      push("documents", doc);
      closeTasks((t) => t.kind === "document" && t.consultation === c.id && t.document === type);
      return { document: doc, patient: p };
    }
    function markIssued(staff, input) {
      mustBe(staff, "documents", "mark_issued");
      let d;
      if (input.document_id) d = all("documents").find((x) => x.id === String(input.document_id).toUpperCase());
      else {
        const { p } = identify(input);
        const type = docType(input.type);
        d = all("documents").filter((x) => x.patient === p.id && (!type || x.type === type) && x.at && F.mytDate(x.at) === today()).pop();
        if (!d) {
          const c = consultToday(p.id);
          if (c && (type === "referral" ? c.referral : c.mc)) throw refuse("not_prepared", `${p.name}'s ${type === "referral" ? "referral letter" : "MC"} is not prepared yet.`);
          throw refuse("no_gp_record", `There is no ${type === "referral" ? "referral" : "MC"} in Dr Sivakumar's record for ${p.name} today.`, { patient: p.name, type: type || "mc" });
        }
      }
      if (!d) throw refuse("not_prepared", `No document ${input.document_id}.`);
      if (d.status === "issued") throw refuse("already_issued", `${d.id} was already issued.`);
      update("documents", d.id, { status: "issued", issued_by: staff.id, issued_at: now() });
      return { document: Object.assign({}, d, { status: "issued", issued_at: now() }), patient: patient(d.patient) };
    }
    function listDocs(staff) {
      mustBe(staff, "documents", "list");
      return { documents: all("documents").filter((d) => F.mytDate(d.at) === today()), to_prepare: all("tasks").filter((t) => t.kind === "document" && t.status === "open") };
    }

    // ---------------------------------------------------------------- tasks
    function listTasks(staff) {
      mustBe(staff, "tasks", "list");
      return { tasks: all("tasks").filter((t) => t.to === staff.id && t.status === "open"), notices: all("notices").filter((n) => n.to === staff.id).slice(-5) };
    }
    /** PS-RP-06: Siti hands over a patient's matter; code picks the reason and the receiver from the matter and
     * the stage of the visit (Siti, Dr Sivakumar, Ms Yong, Siti), so the model never names a person or a reason.
     * unwell: D2 to Dr Sivakumar at any stage. outside_policy: D4 to Dr Sivakumar before the consultation.
     * question: D1 to Dr Sivakumar before the consultation, D5 to Ms Yong after the medicine is dispensed.
     * While a prescription is with Ms Yong, a medicine matter is hers to raise, so the desk hands nothing over. */
    const MATTERS = ["question", "unwell", "outside_policy"];
    function handOver(staff, input) {
      mustBe(staff, "tasks", "hand_over");
      const matter = input.matter || "question";
      if (!MATTERS.includes(matter)) throw refuse("invalid_fields", "Choose the matter: question, unwell or outside_policy.");
      if (!input.question) throw refuse("missing_details", "Say what the patient asked or what you see.");
      const { p } = identify(input);
      const c = consultToday(p.id);
      const atPharmacy = !!(c && c.prescription.length && !dispensedFor(c.id));
      const dispensed = !!(c && dispensedFor(c.id));
      const stage = !c ? "before_consultation" : atPharmacy ? "pharmacy" : dispensed ? "after_dispensing" : "after_consultation";
      const reason = matter === "unwell" ? "D2" : matter === "outside_policy" ? "D4" : dispensed ? "D5" : "D1";
      if (reason !== "D2" && atPharmacy) throw refuse("wrong_stage", `${p.name}'s prescription is with Ms Yong.`, { patient: p.name, stage: "pharmacy", reason });
      if ((reason === "D1" || reason === "D4") && c) throw refuse("wrong_stage", `${p.name}'s consultation is already recorded.`, { patient: p.name, stage, reason });
      const to = T.reasons[reason].to;
      const t = task("handover", to, p, c ? c.id : null, `Handover from Siti Kasim: ${input.question}`, { reason, matter, stage, question: input.question, from: staff.id });
      const n = notice(to, R.handoverNotice(t, p, today()), t.id);
      return { task: t, patient: p, notice: n };
    }
    function answer(staff, input) {
      mustBe(staff, "tasks", "answer");
      if (!input.answer) throw refuse("missing_details", "Give the answer.");
      let open = all("tasks").filter((t) => t.status === "open" && t.to === staff.id && (t.kind === "query" || t.kind === "handover"));
      if (staff.role === "pharmacist") open = open.filter((t) => t.reason === "D5");
      let t;
      if (input.task_id) t = open.find((x) => x.id === String(input.task_id).toUpperCase());
      else {
        const { p } = identify(input);
        const mine = open.filter((x) => x.patient === p.id);
        t = mine[mine.length - 1];
      }
      if (!t) throw refuse("no_open_task", "No open handover or query for you on that patient.");
      const decision = t.kind === "query" ? "keep" : "answered";
      if (t.kind === "query") {
        // A keep is refused when dispensing as written is impossible (PS-AC-03): out of stock, or incomplete.
        const c = all("consultations").find((x) => x.id === t.consultation);
        const qp = patient(t.patient);
        const blocking = c ? blocksKeep(R.check(qp, c.prescription, stockView())) : [];
        if (blocking.length) {
          const stock = blocking.filter((f) => f.check === "stock").map((f) => R.itemName(f.medicine));
          const incomplete = blocking.filter((f) => f.check === "complete").map((f) => R.itemName(f.medicine));
          throw refuse("keep_not_possible", `${qp.name}'s prescription cannot be dispensed as written: ${blocking.map((f) => `${R.itemName(f.medicine)}, ${f.detail}`).join("; ")}.`,
            { patient: qp.name, stock, incomplete });
        }
      }
      save("tasks", all("tasks").map((x) => (x.id === t.id ? Object.assign({}, x, { status: "answered", closed: now(), answer: input.answer, decision, answered_by: staff.id }) : x)));
      const p = patient(t.patient);
      const n = notice(t.from, R.answerNotice(Object.assign({}, t, { decision }), p, input.answer, staff.id), t.id);
      return { task: Object.assign({}, t, { status: "answered", answer: input.answer, decision }), patient: p, notice: n };
    }

    return {
      identify, consultToday,
      patient: { find: patientFind, register: patientRegister, update_contact: patientUpdate },
      schedule: { book, change, cancel, check_in: checkIn, view_queue: viewQueue, call_next: callNext },
      record_consultation: { record, amend_prescription: amend },
      dispense: { check_and_dispense: checkAndDispense, query_gp: queryGp, view_stock: viewStock },
      billing: { prepare_bill: prepareBill, record_payment: recordPayment, reconcile_day: reconcile, view_bill: viewBill, view_payments: viewPayments,
                 view_owner_review: viewOwner, view_panel_bills: viewPanel, acknowledge_panel_bill: acknowledge },
      documents: { prepare: prepareDoc, mark_issued: markIssued, list: listDocs },
      tasks: { list: listTasks, hand_over: handOver, answer },
    };
  }

  return { createBackend, refuse };
});
