/* The PreToolUse hook: one shared hook in front of all eight tools.
 *
 * preToolUse(tool, input, staffId, env) -> { allow, checks, result, capacity }
 *   staffId: from the signed-in session (request _meta), never from the model (CP-01).
 *   checks:  every check run, in order: { check, clause, pass } (shown in the hook view).
 *   result:  when allow is false, the block in the shared result shape: the code, the clause, a
 *            one-line message, and a next_step naming the person who decides (D3).
 *   capacity: for Dr Aisyah, the capacity that allowed or refused the call (CP-03).
 * env: { rules, backend (read-only lookups here), store, now }.
 * The back end repeats the critical checks on its own; this hook is the first line, not the only one.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"), require("../lib/backend.js"));
  else root.SKPreToolUse = factory(root.SKFormat, root.SKBackend);
})(typeof self !== "undefined" ? self : this, function (F, B) {
  "use strict";

  const OFFER_OWNER = { book_appointment: B.CLERK, record_payment: B.CLERK };

  function preToolUse(tool, input, staffId, env) {
    const { rules, backend, store } = env;
    const checks = [];
    let capacity = null;
    const pass = (check, clause) => { checks.push({ check, clause, pass: true }); };
    const block = (check, code, message, opts) => {
      const o = opts || {};
      checks.push({ check, clause: o.clause || F.CODES[code].clause, pass: false });
      return { allow: false, checks, capacity, result: F.fail(tool, code, message, o) };
    };
    const allow = (extra) => Object.assign({ allow: true, checks, result: null, capacity }, extra || {});
    const staff = rules.who(staffId);

    if (!staff) return block("Signed-in staff ID from the session", "no_session", "No signed-in staff member.", { next_step: { action: "Sign in first." } });
    pass(`Signed in as ${staff.id} (${staff.name}, ${staff.title}); identity from the session, never the chat`, "CP-01");
    if (!B.OFFERED[staff.role].includes(tool)) {
      const owner = OFFER_OWNER[tool];
      return block(`${tool} is offered to ${staff.role === "clerk" ? "the clerk" : "doctors"}`, "tool_not_offered", `${tool} is not in the ${staff.role} tool catalogue.`,
        { clause: tool === "find_patients" ? "CP-10" : tool === "close_visit" ? "CL-06" : tool === "book_appointment" ? "OP-05" : "CP-11",
          next_step: owner ? rules.person(owner, "CP-11") : { action: "A doctor does this for their own patients." } });
    }
    pass(`${tool} is offered to ${staff.role === "clerk" ? "the clerk" : "doctors"}`, "CP-11");
    const patientOf = (ref) => {
      const r = backend.resolve(ref, input.age);
      if (r.error) return [null, block(`Patient ${ref || "(none)"} identified`, r.error.code, r.error.message, { next_step: r.error.next_step, clause: r.error.clause })];
      pass(`Patient identified: ${r.patient.id} (${r.patient.name})`, "CP-14");
      return [r.patient, null];
    };

    // ---------------------------------------------------------------- retrieve_patient_record
    if (tool === "retrieve_patient_record") {
      if (!B.VIEWS[input.view]) return block(`View ${input.view || "(none)"} exists`, "details_missing", "Choose a view.", { clause: "CP-04" });
      const [p, e] = patientOf(input.patient); if (e) return e;
      const a = backend.access(staff, p, input.view, input.reason);
      capacity = a.capacity;
      const label = `${staff.name} may open the ${input.view.replace("_", " ")} view of ${p.id}`;
      if (!a.allowed) return block(label, a.code, `The ${input.view.replace("_", " ")} view of ${p.name} is not open to ${staff.name}${a.code === "reason_required" ? " without a recorded reason" : ""}.`,
        { clause: a.clause, next_step: a.next_step });
      pass(`${label} (${a.via}${capacity ? `, ${capacity} capacity` : ""})`, { contact: "CP-04", clinical: "CP-05", prescriptions: "CP-05", appointments: "CP-06", vaccinations: "CP-06", confidential: "CP-08", billing: "CP-09", registration: "CP-04", handover_summary: "CL-02" }[input.view]);
      if (input.view === "confidential") pass(`Reason recorded and logged before release: "${input.reason}"`, "CP-08");
      return allow();
    }

    // ---------------------------------------------------------------- find_patients
    if (tool === "find_patients") {
      if (!["condition", "vaccine_overdue", "age_band", "no_visit_since"].includes(input.filter))
        return block("A fixed filter", "filter_not_permitted", "Only condition, vaccine overdue, age band and no visit since a date are offered.", { next_step: { action: "Use one fixed filter." } });
      const all = staff.id === B.LEAD && input.filter !== "vaccine_overdue";
      capacity = staff.id === B.LEAD ? (all ? "lead" : "specialist") : null;
      pass(`Filter ${input.filter}: ${all ? "every patient (lead capacity)" : "own patients only"}; list fields only`, "CP-10");
      return allow();
    }

    // ---------------------------------------------------------------- close_visit
    if (tool === "close_visit") {
      const [p, e] = patientOf(input.patient); if (e) return e;
      const rel = backend.relationship(staff, p);
      capacity = staff.id === B.LEAD ? (rel === "own" ? "specialist" : "lead") : null;
      if (rel !== "own" && rel !== "cover")
        return block(`${staff.name} is responsible for ${p.id} (own patient or approved active cover)`, "not_prescriber", `${p.name} is ${rules.who(p.doctor).name}'s patient; only the responsible doctor closes the visit.`,
          // Founder, 22 Oct: authority is checked first; a doctor without it is declined in two sentences, written here.
          { next_step: rules.person(p.doctor, "CL-06", { say: `I'm sorry, you can't prescribe for ${p.first}. Only ${p.first}'s attending doctor, ${rules.who(p.doctor).name}, can prescribe for ${p.first}.` }) });
      pass(`${staff.name} is responsible for ${p.id} (${rel})`, "CL-06");
      const visits = store.get("visits");
      const today = F.mytDate(env.now);
      const v = input.visit_id ? visits.find((x) => x.id === input.visit_id && x.patient === p.id) : visits.find((x) => x.patient === p.id && x.date === today && x.status === "open");
      if (!v || v.status !== "open") return block("An open visit today", v ? "visit_already_closed" : "no_open_visit", v ? `${v.id} is already closed.` : `No open visit today for ${p.name}; a new prescription needs a valid encounter.`,
        { next_step: rules.person(B.CLERK, "CL-06", { action: "A new prescription needs a booked encounter." }) });
      pass(`Open visit ${v.id} on ${F.dayLabel(v.date)}`, "CL-06");
      const ctx = { ageMonths: rules.ageAt(p.dob, today).months, weight: backend.weightOf(p), today, allergyStatus: p.allergy_status,
        allergies: store.get("allergies").filter((x) => x.patient === p.id), indication: v.indication, others: [] };
      if (!(input.lines || []).length) return block("At least one prescription line", "details_missing", "No prescription lines.", { clause: "CL-07" });
      for (const line of input.lines) {
        const c = rules.checkLine(line, ctx);
        if (!c.ok) return block(`${line.medicine} ${line.strength || ""}: formulary, weight, dose and allergy checks`, c.code, c.message,
          { data: c.values, next_step: rules.person(staff.id, F.CODES[c.code].clause, { action: "Returned to the prescribing doctor with the exact rule and value; correct the entry and call again. Nothing was recorded." }) });
        pass(`${c.presentation} under ${c.profile}: ${c.mg_per_dose !== null ? `${c.mg_per_dose} mg a dose, ${c.mg_per_day} mg a day; ` : ""}weight, frequency, duration, dose and allergy checks passed`, "CL-07, CL-08, CL-09");
        ctx.others.push(c.presentation);
      }
      return allow();
    }

    // ---------------------------------------------------------------- book_appointment
    if (tool === "book_appointment") {
      pass("Nurul Huda enters bookings", "OP-05");
      if ((input.action || "book") === "book") {
        const [, e] = patientOf(input.patient); if (e) return e;
        if (!rules.who(input.doctor) || rules.who(input.doctor).role !== "doctor") return block("A doctor named for the booking", "details_missing", "Name the doctor by staff ID.", { clause: "OP-05" });
        pass(`Doctor ${input.doctor} named`, "OP-05");
      } else if (input.action === "confirm" && input.guardian_agreed !== true) {
        return block("The registered guardian agreed to the doctor, day, date and time", "guardian_not_confirmed", "The booking stays pending until the guardian agrees.",
          { next_step: rules.person(B.CLERK, "OP-07", { action: "Contact the registered guardian; confirm only after they agree." }) });
      }
      return allow();
    }

    // ---------------------------------------------------------------- create_request
    if (tool === "create_request") {
      const act = input.action || "raise";
      if (act === "decide") {
        const r = store.get("requests").find((x) => x.id === input.request_id);
        if (!r) return block(`Request ${input.request_id} exists`, "data_missing", `No request ${input.request_id}.`, { clause: "CP-13" });
        capacity = staff.id === B.LEAD ? "lead" : null;
        if (r.owner !== staff.id) return block(`${staff.name} owns ${r.id}`, "not_owner", `${r.id} is decided by ${rules.who(r.owner).name}.`, { next_step: rules.person(r.owner, "CP-12", { request_id: r.id }) });
        if (r.raised_by === staff.id && staff.id === B.LEAD) return block("Not the lead's own request", "self_approval", "The lead does not approve her own request.", { next_step: { action: "Resolve it outside the assistant." } });
        pass(`${staff.name} is the named owner of ${r.id}`, "CP-12");
        return allow();
      }
      if (act === "complete") {
        const a = store.get("actions").find((x) => x.id === input.item_id);
        capacity = staff.id === B.LEAD ? "lead" : null;
        if (!a) return block(`Item ${input.item_id} exists`, "data_missing", `No pending item ${input.item_id}.`, { clause: "CP-13" });
        if (a.owner !== staff.id) return block(`${staff.name} owns ${a.id}`, "not_owner", `${a.id} is ${rules.who(a.owner).name}'s to complete.`, { clause: "CP-13", next_step: rules.person(a.owner, "CP-13") });
        pass(`${staff.name} owns ${a.id}`, "CP-13");
        return allow();
      }
      const spec = rules.tables.request_types[input.type];
      if (!spec) return block(`Request type ${input.type || "(none)"} exists`, "details_missing", "Choose a request type.", { clause: "CP-12" });
      const clerkTypes = ["fee_waiver", "doctor_assignment", "overbooking", "callback", "repeat_prescription"];
      const isClerk = staff.role === "clerk";
      const direct = input.type === "fee_waiver" && staff.id === B.LEAD;  // CP-12: the decider's own instruction
      if (direct) { capacity = "lead"; pass("Dr Aisyah Rahman decides fee waivers: her instruction is recorded as her decision", "CP-12, BP-07"); return allow(); }
      if (input.type !== "policy_question" && clerkTypes.includes(input.type) !== isClerk) {  // a policy question may come from anyone
        const who = isClerk ? null : B.CLERK;
        const next = input.type === "overbooking" ? null : who ? rules.person(who, spec.clause.split(", ")[0]) : { action: `A ${input.type.replace("_", " ")} request is raised by ${spec.raised_by}.` };
        if (input.type !== "overbooking" && next) {
          capacity = staff.id === B.LEAD ? "lead" : null;
          return block(`${staff.name} raises ${input.type.replace("_", " ")} requests`, "request_not_permitted", `A ${input.type.replace("_", " ")} request is raised by ${spec.raised_by}.`, { clause: spec.clause.split(", ")[0], next_step: next });
        }
      }
      if (staff.id === B.LEAD) {  // CP-03: her own patient's request is specialist work; anything else is lead work
        const r = input.patient ? backend.resolve(input.patient, input.age) : {};
        capacity = r.patient && r.patient.doctor === B.LEAD ? "specialist" : "lead";
      }
      pass(`Request type ${input.type}: raised by ${spec.raised_by}, decided by ${spec.decided_by}`, spec.clause);
      return allow();
    }

    if (tool === "record_payment") {
      if (!input.invoice_id || !input.receipt_ref || !input.method || !(Number(input.amount_rm) > 0))
        return block("Invoice, amount, method and receipt reference", "details_missing", "A payment needs the invoice, the amount, the method and the receipt reference.", { clause: "BP-04", next_step: { action: "Ask for the missing details; nothing was recorded." } });
      pass("Payment details complete; recording only, no money is taken", "BP-04, BP-05");
      return allow();
    }

    // CP-03: her action list carries clinic-wide approvals (lead); reading the rota is her own clinical work (specialist).
    if (tool === "list_my_actions") { if (staff.id === B.LEAD) capacity = "lead"; pass("Only the signed-in person's items, built in code", "CP-13"); return allow(); }
    if (tool === "check_schedule") { if (staff.id === B.LEAD) capacity = "specialist"; pass("Clinic Hours and Rota, read for every role", "OP-03"); return allow(); }
    return block(`Tool ${tool} exists`, "data_missing", `No tool named ${tool}.`, { clause: "CP-11" });
  }

  return { preToolUse };
});
