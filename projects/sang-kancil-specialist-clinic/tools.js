/* Sang Kancil Specialist Clinic: the eight tools and the desk that runs every call through the hooks.
 *
 *   desk.call(name, input, staffId) -> { result, hook }
 *     1. PreToolUse (hooks/pre_tool_use.js): blocks or allows, citing clauses; records Dr Aisyah's capacity.
 *     2. The tool: the back end data layer (lib/backend.js), which repeats the critical checks.
 *     3. PostToolUse (hooks/post_tool_use.js): checks fields again, works out, converts, adds the Basis.
 *   result is the shared shape { tool, status, data, error, next_step } (lib/format.js) and is all the
 *   agent sees; hook is the record shown in the hook view.
 *
 * The staff ID comes from the signed-in session (the request _meta), never from a tool argument (CP-01):
 * no tool takes a staff ID. Tools are offered by role at sign-in (CP-11): toolsFor(staffId).
 * Loaded by mcp_server.mjs, the tool tests, the benchmark and the staff page (window.SKTools).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./lib/format.js"), require("./lib/rules.js"), require("./lib/backend.js"),
      require("./hooks/pre_tool_use.js"), require("./hooks/post_tool_use.js"));
  else root.SKTools = factory(root.SKFormat, root.SKRules, root.SKBackend, root.SKPreToolUse, root.SKPostToolUse);
})(typeof self !== "undefined" ? self : this, function (F, R, B, PRE, POST) {
  "use strict";

  const PATIENT = { type: "string", description: "The patient ID (e.g. SK-P-0001) or the name as the staff member gave it (e.g. \"Aiman\"). Never guess between patients." };
  const AGE = { type: "string", description: "The age the staff member gave, as written (e.g. \"4\" or \"11 months\"); used only to tell patients apart." };
  const DOCTOR = { type: "string", enum: ["PD-01-01", "PD-02-01", "PD-02-02"], description: "PD-01-01 Dr Aisyah Rahman (lead, infants), PD-02-01 Dr Daniel Ong (1 to 12), PD-02-02 Dr Priya Nair (13 to 17)." };
  const DATE = { type: "string", description: "YYYY-MM-DD" };
  const TOOLS = [
    {
      name: "retrieve_patient_record",
      description: "Open one view of one patient's record. registration: ID, name, age, doctor of record, guardian name. contact: guardian phone, email, address, MyKid. clinical: conditions, allergies, latest weight with its date, visits. prescriptions. appointments. vaccinations: status per schedule row worked out in code. confidential: adolescent confidential notes; pass the specific reason when one is given. billing: invoices, payments and amounts outstanding. handover_summary: the summary a receiving doctor reads before accepting a handover. Opens one patient, never a list. Call it for every such question, whoever is signed in; the hook decides who may open which view.",
      input_schema: { type: "object", properties: { patient: PATIENT, age: AGE, view: { type: "string", enum: Object.keys(B.VIEWS) }, reason: { type: "string", description: "The specific reason the staff member gives (confidential view only)." } }, required: ["patient", "view"] },
    },
    {
      name: "check_schedule",
      description: "Free slots by doctor, date and visit type from the Clinic Hours and Rota, written as day, date and time. Without a date: each doctor's next three sessions with a free slot. Does not book.",
      input_schema: { type: "object", properties: { doctor: DOCTOR, date: DATE, session: { type: "string", enum: ["AM", "PM"] }, visit_type: { type: "string", enum: ["vaccination", "follow_up", "new_patient", "sick_visit"] } } },
    },
    {
      name: "close_visit",
      description: "Close today's open visit for a patient and record the doctor's prescription lines and any follow-up interval, after the formulary, weight, dose and allergy checks in code. Pass exactly what the doctor said: the medicine, the strength as stated (leave it out if not stated; never infer it from the volume), the amount per dose with its unit, times a day, as needed or not, and days. Never choose, convert or correct a dose. Creates the clerk's dispense, billing and follow-up actions. Never books.",
      input_schema: {
        type: "object",
        properties: {
          patient: PATIENT, age: AGE, visit_id: { type: "string" },
          lines: { type: "array", minItems: 1, items: { type: "object", properties: {
            medicine: { type: "string", description: "Generic name, e.g. amoxicillin." },
            strength: { type: "string", description: "Exactly as the doctor stated it, e.g. \"250 mg/5 mL\". Omit when not stated." },
            amount_per_dose: { type: "number", exclusiveMinimum: 0 }, dose_unit: { type: "string", enum: ["mL", "mg", "tablet", "puff", "application"] },
            times_per_day: { type: "integer", minimum: 1 }, as_needed: { type: "boolean" }, duration_days: { type: "integer", minimum: 1 },
            supply_quantity: { type: "number" }, plan_reference: { type: "string" }, review_date: DATE,
          }, required: ["medicine", "amount_per_dose", "dose_unit", "times_per_day"] } },
          follow_up_days: { type: "integer", minimum: 1 }, follow_up_reason: { type: "string", enum: ["review_response", "review_result", "routine_review", "vaccination", "other"] },
        },
        required: ["patient", "lines"],
      },
    },
    {
      name: "book_appointment",
      description: "action book: enter a booking as pending guardian confirmation (date, or in_days counted in code from the patient's last recorded encounter; session; visit type; the channel the request came by). action confirm: mark a pending booking confirmed, only when the staff member says the registered guardian agreed (guardian_agreed true). action release: withdraw a pending booking. A full or closed session returns the next available sessions.",
      input_schema: { type: "object", properties: {
        action: { type: "string", enum: ["book", "confirm", "release"] }, patient: PATIENT, age: AGE, doctor: DOCTOR, date: DATE,
        in_days: { type: "integer", minimum: 1, description: "For 'in N days' or 'in N weeks' (as days), counted from the recorded encounter." },
        session: { type: "string", enum: ["AM", "PM"] }, time: { type: "string", description: "HH:MM, only if the staff member asked for a time." },
        visit_type: { type: "string", enum: ["vaccination", "follow_up", "new_patient", "sick_visit"] }, channel: { type: "string", enum: ["phone", "walk-in", "WhatsApp", "online form"] },
        appointment_id: { type: "string" }, guardian_agreed: { type: "boolean" } } },
    },
    {
      name: "create_request",
      description: "action raise: raise one request to the person who decides it: consult (associate to Dr Aisyah, with the clinical question), cover (patients_of the doctor whose patients need cover, from and to_date, and the reason, to Dr Aisyah), handover (attending doctor to the receiving band doctor, with the reason), fee_waiver (clerk to Dr Aisyah: invoice, amount, reason), doctor_assignment (clerk to Dr Aisyah), overbooking (clerk to the requested doctor: date and session), callback and repeat_prescription (clerk to the patient's own doctor, with the guardian's question), external_referral (doctor to the clerk, with the destination the doctor names), policy_question (to Dr Aisyah as policy owner, only when no tool and no rule covers a request, with the topic and the question; never for a price, prescribing, booking or opening a record, which have their own tools or resources). action decide: the named owner records a decision on request_id. action complete: the owner records the outcome of one of their own pending items (item_id), e.g. medicine dispensed exactly as written. Call it on every attempt; the hooks decide who may raise or decide what.",
      input_schema: { type: "object", properties: {
        action: { type: "string", enum: ["raise", "decide", "complete"] },
        type: { type: "string", enum: ["consult", "cover", "handover", "fee_waiver", "doctor_assignment", "overbooking", "callback", "repeat_prescription", "external_referral", "policy_question"] },
        patient: PATIENT, age: AGE, to: DOCTOR, cover_doctor: DOCTOR, patients_of: Object.assign({}, DOCTOR, { description: "Cover: the doctor whose patients are to be covered, as the staff member said." }), from: DATE, to_date: DATE, date: DATE, session: { type: "string", enum: ["AM", "PM"] },
        question: { type: "string" }, reason: { type: "string" }, invoice_id: { type: "string" }, amount_rm: { type: "number" }, destination: { type: "string" }, topic: { type: "string", enum: ["billing", "service", "disclosure", "clinical"], description: "policy_question only: billing (an unusual payment arrangement), service (a service the clinic does not offer yet, such as video consultation), disclosure (who may see a record), clinical." },
        request_id: { type: "string" }, decision: { type: "string", enum: ["approve", "decline", "accept", "close", "assign"] }, assign_to: DOCTOR, time: { type: "string", description: "HH:MM, the slot a doctor allocates." }, note: { type: "string" },
        item_id: { type: "string" }, outcome: { type: "string" } } },
    },
    {
      name: "find_patients",
      description: "A patient list from one fixed filter: condition (value e.g. asthma), vaccine_overdue, age_band (infant, child, adolescent) or no_visit_since (value YYYY-MM-DD). Returns patient ID, name, age and doctor only. Scope is set in code by who is signed in.",
      input_schema: { type: "object", properties: { filter: { type: "string", enum: ["condition", "vaccine_overdue", "age_band", "no_visit_since"] }, value: { type: "string" } }, required: ["filter"] },
    },
    {
      name: "record_payment",
      description: "Record a payment already received at the counter against one invoice: amount, method and the unique receipt reference. Recording only: it never charges, collects, refunds or reverses money.",
      input_schema: { type: "object", properties: { invoice_id: { type: "string" }, amount_rm: { type: "number", exclusiveMinimum: 0 }, method: { type: "string", enum: ["cash", "card", "duitnow", "transfer"] }, receipt_ref: { type: "string" } }, required: ["invoice_id", "amount_rm", "method", "receipt_ref"] },
    },
    {
      name: "list_my_actions",
      description: "The signed-in person's own action list, built in code from the records: pending items with their owner and clause, requests waiting on them, and requests they raised. For the clerk also: bookings to confirm, vaccine recalls, payment reminders, and the handover and cover case file (read only).",
      input_schema: { type: "object", properties: {} },
    },
  ];

  /** CP-11: the tools offered at sign-in for this staff member. */
  function toolsFor(tables, staffId) {
    const s = tables.staff.find((x) => x.id === staffId);
    return s ? TOOLS.filter((t) => B.OFFERED[s.role].includes(t.name)) : [];
  }

  /**
   * createDesk(store, tables, opts): opts.now (Unix seconds, the test calendar), opts.faults (benchmark).
   * store: { get(name), set(name, value) }.
   */
  function createDesk(store, tables, opts) {
    const o = opts || {};
    const rules = R.createRules(tables);
    const backend = B.createBackend(store, rules, { now: o.now, faults: o.faults || {} });
    const env = { rules, backend, store, now: o.now };
    const RUN = {
      retrieve_patient_record: (s, i) => backend.record(s, i),
      check_schedule: (s, i) => backend.schedule(s, i),
      close_visit: (s, i) => backend.closeVisit(s, i),
      book_appointment: (s, i) => backend.book(s, i),
      create_request: (s, i) => backend.request(s, i),
      find_patients: (s, i) => backend.findPatients(s, i),
      record_payment: (s, i) => backend.payment(s, i),
      list_my_actions: (s) => backend.myActions(s),
    };

    function log(entry) { store.set("call_log", (store.get("call_log") || []).concat([entry])); }

    function call(name, input, staffId) {
      input = Object.assign({}, input || {});
      if (!RUN[name]) {
        const result = F.fail(name, "data_missing", `No tool named ${name}.`, { clause: "CP-11" });
        return { result, hook: { tool: name, input, staff: staffId, pre: { verdict: "block", checks: [] }, tool_ran: false, raw: null, post: [], result } };
      }
      const p = PRE.preToolUse(name, input, staffId, env);
      let hook;
      if (!p.allow) {
        hook = { tool: name, input, staff: staffId, capacity: p.capacity, pre: { verdict: "block", checks: p.checks, code: p.result.error.code, clause: p.result.error.clause },
                 tool_ran: false, raw: null, post: [], result: p.result };
      } else {
        let raw;
        try { raw = RUN[name](rules.who(staffId), input); }
        catch (e) { if (!e.backend) throw e; raw = { backendRefusal: { code: e.code, message: e.message, data: e.data, next_step: e.next_step, clause: e.clause } }; }
        const post = POST.postToolUse(name, input, raw, staffId, env, p);
        const cap = p.capacity || (raw && raw.capacity) || null;
        hook = { tool: name, input, staff: staffId, capacity: cap, pre: { verdict: "allow", checks: p.checks }, tool_ran: true, raw, post: post.changes, result: post.result };
      }
      if (!F.isShape(hook.result)) throw new Error(`Result for ${name} is not in the shared shape`);
      // CP-15: every attempt logged with staff ID, capacity, tool, target, time, outcome and clause; no confidential content.
      log({ time: o.now, staff: staffId, capacity: hook.capacity || null, tool: name, target: input.patient || input.request_id || input.item_id || input.invoice_id || null,
            view: input.view || null, status: hook.result.status, code: hook.result.error ? hook.result.error.code : null, clause: hook.result.error ? hook.result.error.clause : null });
      return { result: hook.result, hook };
    }

    return { tools: TOOLS, toolsFor: (id) => toolsFor(tables, id), call, rules, backend };
  }

  /** A store over plain objects (the staff page, the tests). */
  function memoryStore(files) {
    const data = JSON.parse(JSON.stringify(files));
    return { get: (n) => data[n], set: (n, v) => { data[n] = v; }, dump: () => data };
  }

  return { TOOLS, toolsFor, createDesk, memoryStore };
});
