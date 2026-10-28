/* Polyclinic Sivakumar: the seven tools and the desk that runs every call through the hooks.
 *
 *   desk.call(name, input, staffId) -> { result, hook }
 *     1. PreToolUse (hooks/pre_tool_use.js): the session, the tool and the action offered to the role,
 *        who may see what, the handover reason lists, identification given.
 *     2. The tool: the back end data layer (lib/backend.js), which repeats the role check and runs the
 *        record checks (workflow order, the pharmacist's four checks, prices and the panel split).
 *     3. PostToolUse (hooks/post_tool_use.js): converts, filters the fields by role, writes the Basis line
 *        and, for a fixed outcome, the reply written in code (next_step.say).
 *   result is the shared shape { tool, status, data, error, next_step } (lib/format.js) and is all the
 *   agent sees; hook is the record shown under the hood.
 *
 * Seven tools grouped by job, each with a small set of actions (founder, 27 Oct). Tools are offered by
 * role at sign-in (toolsFor): front desk 5, GP 5, pharmacist 3, each with only that person's own actions
 * (founder, 28 Oct), so another person's action is not in the list; the hooks still refuse it if called. The staff ID comes from the signed-in
 * session (the request _meta), never from a tool argument. The three pages call the same desk.
 * Loaded by mcp_server.mjs, the tool tests, the benchmark and the pages (window.PSTools).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./lib/format.js"), require("./lib/rules.js"), require("./lib/backend.js"),
      require("./hooks/pre_tool_use.js"), require("./hooks/post_tool_use.js"));
  else root.PSTools = factory(root.PSFormat, root.PSRules, root.PSBackend, root.PSPreToolUse, root.PSPostToolUse);
})(typeof self !== "undefined" ? self : this, function (F, R, B, PRE, POST) {
  "use strict";

  const WHO = {
    patient_id: { type: "string", description: "The patient ID (e.g. PS-P-0004) when it is shown in a task, the queue or an earlier result." },
    name: { type: "string", description: "The patient's full name exactly as the staff member gave it." },
    ic_last4: { type: "string", description: "The last 4 digits of the patient's IC, as given." },
    phone: { type: "string", description: "The patient's phone number, as given." },
  };
  const DATE = { type: "string", description: "YYYY-MM-DD" };
  const LINE = { type: "object", properties: {
    medicine: { type: "string", description: "The medicine as the GP named it, e.g. ibuprofen." },
    dose: { type: "number", description: "The amount per dose as the GP said it, in dose_unit." },
    dose_unit: { type: "string", enum: ["mg", "tablet", "capsule", "puff", "sachet"] },
    times_per_day: { type: "integer", minimum: 1 }, as_needed: { type: "boolean" }, days: { type: "integer", minimum: 1 },
    quantity: { type: "integer", minimum: 1, description: "Units to dispense, if the GP said it." },
    instructions: { type: "string", description: "The GP's instructions to the patient, if given." },
  }, required: ["medicine", "dose", "dose_unit", "times_per_day"] };

  /* Each tool: an intro, one line per action, and its properties. A property tagged with "for" is offered only
   * with those actions. toolsFor builds each person's copy: only the person's own actions in the action list
   * and the description, and only the properties those actions use (PS-RP-01). */
  const TOOLS = [
    {
      name: "patient",
      intro: "Patients.",
      actions: {
        find: "action find: open one patient's record, by the patient ID, or the full name with the IC last 4 digits or phone (a name alone is not enough; ask for one of the two).",
        register: "action register: a new patient (name, dob YYYY-MM-DD, phone, ic_last4, allergies, and panel with member_id when on a panel).",
        update_contact: "action update_contact: a new phone number (new_phone) for an identified patient.",
      },
      // Views are data, not another person's work: all three are listed for everyone, so a request for a view
      // the person may not open reaches the hook and gets the no-access reply written in code (PS-RP-02).
      views: "view summary (default), medicines (allergies, conditions, current medicines) or case_notes. Fields are filtered by who is signed in.",
      props: {
        view: { schema: { type: "string", enum: ["summary", "medicines", "case_notes"] }, for: ["find"] },
        dob: { schema: DATE, for: ["register"] }, allergies: { schema: { type: "array", items: { type: "string" } }, for: ["register"] },
        panel: { schema: { type: "string", enum: ["teratai", "cempaka"] }, for: ["register"] }, member_id: { schema: { type: "string" }, for: ["register"] },
        new_phone: { schema: { type: "string" }, for: ["update_contact"] },
      },
    },
    {
      name: "schedule",
      intro: "Bookings and the queue.",
      actions: {
        book: "action book (date, time HH:MM on a 15-minute slot).", change: "action change (appointment_id or the patient's one booking, to date and time).",
        cancel: "action cancel.", check_in: "action check_in (today's arrival: an appointment or a walk-in).",
        view_queue: "action view_queue.", call_next: "action call_next (call the next patient in queue order).",
      },
      props: {
        date: { schema: DATE, for: ["book", "change"] }, time: { schema: { type: "string", description: "HH:MM" }, for: ["book", "change"] },
        appointment_id: { schema: { type: "string" }, for: ["change", "cancel", "check_in"] },
      },
    },
    {
      name: "record_consultation",
      intro: "The consultation record (the consultation form calls the same tool).",
      actions: {
        record: "action record: for the patient with you now: the diagnosis, services (default GP consultation), the prescription lines exactly as said (never choose, convert or correct a dose), return_in_days, an MC (days and start_date, or declined true) and a referral (to, reason, urgency routine, soon or urgent, and the clinical summary), only when decided. Code creates the next people's tasks.",
        amend_prescription: "action amend_prescription: change today's prescription (replace_medicine, the medicine being replaced, and the new prescription lines); a new check replaces the old one.",
      },
      props: {
        diagnosis: { schema: { type: "string" }, for: ["record"] }, case_note: { schema: { type: "string" }, for: ["record"] },
        services: { schema: { type: "array", items: { type: "string", enum: ["gp-consultation", "nebuliser-treatment", "wound-dressing", "blood-glucose-test"] } }, for: ["record"] },
        prescription: { schema: { type: "array", items: LINE } }, replace_medicine: { schema: { type: "string" }, for: ["amend_prescription"] },
        return_in_days: { schema: { type: "integer", minimum: 1 }, for: ["record"] },
        mc: { schema: { type: "object", properties: { days: { type: "integer", minimum: 1 }, start_date: DATE, declined: { type: "boolean" } } }, for: ["record"] },
        referral: { schema: { type: "object", properties: { to: { type: "string", description: "The hospital or specialist named." }, reason: { type: "string" },
          urgency: { type: "string", enum: ["routine", "soon", "urgent"] }, summary: { type: "string", description: "The clinical summary, as given." } } }, for: ["record"] },
      },
    },
    {
      name: "dispense",
      intro: "The pharmacy.",
      actions: {
        check_and_dispense: "action check_and_dispense: one call for \"check and dispense\". Code runs the four checks on today's prescription (complete, allergy by drug class, dose within the formulary range, stock). When they pass, or Dr Sivakumar answered to keep it, it is dispensed, stock is reduced and the bill task is created. When a check fails, code holds the prescription and sends the query to Dr Sivakumar itself.",
        query_gp: "action query_gp: your own concern about a medicine on today's prescription, even when the checks pass, in your words (question). Code sends it to Dr Sivakumar and holds the prescription until Dr Sivakumar amends it or answers to keep it.",
        view_stock: "action view_stock: stock for one medicine or all (read only).",
      },
      props: { question: { schema: { type: "string" }, for: ["query_gp"] }, medicine: { schema: { type: "string" }, for: ["view_stock"] } },
    },
    {
      name: "billing",
      intro: "Money. Never pass a price or a total; code works them out.",
      actions: {
        prepare_bill: "action prepare_bill: the bill from the recorded services and the medicines actually dispensed, priced from the Price List or, for a panel patient, the Panel Price Schedule (panel bills need the full name with the IC last 4 digits or phone).",
        record_payment: "action record_payment: a payment collected (bill_id or the patient, amount_rm equal to the patient's share, method cash, card or e-wallet, tendered_rm for cash).",
        reconcile_day: "action reconcile_day: the cash counted (counted_cash_rm).",
        view_bill: "action view_bill.", view_payments: "action view_payments (a date, default today, with its reconcile result).",
        view_owner_review: "action view_owner_review.", view_panel_bills: "action view_panel_bills (a date).", acknowledge_panel_bill: "action acknowledge_panel_bill (bill_id or the patient).",
      },
      props: {
        bill_id: { schema: { type: "string" }, for: ["record_payment", "view_bill", "acknowledge_panel_bill"] },
        amount_rm: { schema: { type: "number" }, for: ["record_payment"] }, method: { schema: { type: "string", enum: ["cash", "card", "e-wallet"] }, for: ["record_payment"] },
        tendered_rm: { schema: { type: "number" }, for: ["record_payment"] }, counted_cash_rm: { schema: { type: "number" }, for: ["reconcile_day"] },
        date: { schema: DATE, for: ["view_payments", "view_panel_bills"] },
      },
    },
    {
      name: "documents",
      intro: "MCs and referral letters, prepared only from Dr Sivakumar's consultation record, copied exactly.",
      actions: {
        prepare: "action prepare (type mc or referral) for the patient: ready for Dr Sivakumar's signature, with one serial number.",
        mark_issued: "action mark_issued (document_id, or the patient and type) once Dr Sivakumar has signed the printed copy.", list: "action list.",
      },
      props: { type: { schema: { type: "string", enum: ["mc", "referral"] }, for: ["prepare", "mark_issued"] }, document_id: { schema: { type: "string" }, for: ["mark_issued"] } },
    },
    {
      name: "tasks",
      intro: "Work between people, carried by code.",
      actions: {
        list: "action list: your open tasks and latest notices.",
        hand_over: "action hand_over: a question or concern the patient raised, in your words (question), never staff work (checking, dispensing, prescribing, recording). Say the matter: unwell for a patient unwell while waiting, outside_policy for a clinical issue no policy covers (such as another doctor's prescription to supply), otherwise question. Code picks the colleague from the stage of the visit: Dr Sivakumar before the consultation or when the patient is unwell, Ms Yong after the medicine is dispensed.",
        answer: { gp: "action answer: answer an open handover or Ms Yong's query (task_id or the patient). Answering a query means keep the prescription as written; a change goes through record_consultation amend_prescription.",
                  pharmacist: "action answer: answer a medicine question Siti Kasim handed over (task_id or the patient)." },
      },
      props: {
        matter: { schema: { type: "string", enum: ["question", "unwell", "outside_policy"] }, for: ["hand_over"] },
        question: { schema: { type: "string" }, for: ["hand_over"] }, task_id: { schema: { type: "string" }, for: ["answer"] }, answer: { schema: { type: "string" }, for: ["answer"] },
      },
    },
  ];

  /** One person's copy of a tool: only that person's actions and the properties they use (PS-RP-01). */
  function toolForRole(t, role) {
    const acts = Object.keys(t.actions).filter((a) => R.ACTIONS[t.name][a].includes(role));
    const line = (a) => (typeof t.actions[a] === "string" ? t.actions[a] : t.actions[a][role]);
    const props = { action: { type: "string", enum: acts } };
    const usesPatient = !(t.name === "dispense" && acts.length === 1 && acts[0] === "view_stock");
    if (usesPatient) Object.assign(props, WHO);
    for (const [k, v] of Object.entries(t.props || {})) if (!v.for || v.for.some((a) => acts.includes(a))) props[k] = v.schema;
    const desc = [t.intro].concat(acts.map(line), t.views && acts.includes("find") ? [t.views] : [], ["The hooks check every call."]).join(" ");
    return { name: t.name, description: desc, input_schema: { type: "object", properties: props, required: ["action"] } };
  }

  /** The tools offered at sign-in for this staff member, each with only that person's actions (PS-RP-01). */
  function toolsFor(tables, staffId) {
    const s = tables.staff.find((x) => x.id === staffId);
    return s ? TOOLS.filter((t) => R.TOOLS_FOR[s.role].includes(t.name)).map((t) => toolForRole(t, s.role)) : [];
  }

  /** createDesk(store, tables, opts): opts.now (Unix seconds, the test calendar), opts.faults (benchmark). */
  function createDesk(store, tables, opts) {
    const o = opts || {};
    const rules = R.createRules(tables);
    const backend = B.createBackend(store, rules, { now: o.now, faults: o.faults || {} });
    const env = { rules, store, now: o.now };

    function log(entry) { store.set("call_log", (store.get("call_log") || []).concat([entry])); }

    function call(name, input, staffId) {
      input = Object.assign({}, input || {});
      const group = backend[name];
      if (!group || name === "identify" || name === "consultToday") {
        const result = F.fail(name, "data_missing", `No tool named ${name}.`, { clause: "PS-RP-01" });
        return { result, hook: { tool: name, input, staff: staffId, pre: { verdict: "block", checks: [] }, tool_ran: false, raw: null, post: [], result } };
      }
      const p = PRE.preToolUse(name, input, staffId, env);
      let hook;
      if (!p.allow) {
        hook = { tool: name, input, staff: staffId, pre: { verdict: "block", checks: p.checks, code: p.result.error.code, clause: p.result.error.clause }, tool_ran: false, raw: null, post: [], result: p.result };
      } else {
        let raw;
        try { raw = group[input.action](rules.who(staffId), input); }
        catch (e) { if (!e.backend) throw e; raw = { backendRefusal: { code: e.code, message: e.message, data: e.data } }; }
        const post = POST.postToolUse(name, input, raw, staffId, env);
        hook = { tool: name, input, staff: staffId, pre: { verdict: "allow", checks: p.checks }, tool_ran: true, raw, post: post.changes, result: post.result };
      }
      if (!F.isShape(hook.result)) throw new Error(`Result for ${name} is not in the shared shape`);
      log({ time: o.now, staff: staffId, tool: name, action: input.action || null, status: hook.result.status, code: hook.result.error ? hook.result.error.code : null });
      return { result: hook.result, hook };
    }

    const noticesFor = (staffId) => (store.get("notices") || []).filter((n) => n.to === staffId);
    return { tools: TOOLS, toolsFor: (id) => toolsFor(tables, id), call, noticesFor, rules, backend, env };
  }

  /** A store over plain objects (the pages, the tests). */
  function memoryStore(files) {
    const data = JSON.parse(JSON.stringify(files));
    return { get: (n) => data[n], set: (n, v) => { data[n] = v; }, dump: () => data };
  }

  return { TOOLS, toolsFor, createDesk, memoryStore };
});
