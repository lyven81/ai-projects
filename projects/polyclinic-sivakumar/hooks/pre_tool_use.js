/* The PreToolUse hook: one shared hook in front of all seven tools.
 *
 * preToolUse(tool, input, staffId, env) -> { allow, checks, result }
 *   staffId: from the signed-in session (request _meta), never from the model (PS-RP-01).
 *   checks:  every check run, in order: { check, clause, pass } (shown under the hood).
 *   result:  when allow is false, the block in the shared result shape: the code, the clause, a
 *            one-line message, and next_step with the reply written in code (say) for a refusal about
 *            who is asking.
 * It checks the action as well as the tool: a tool offered to a role may still hold actions that are
 * not (billing: Dr Sivakumar views and acknowledges, Siti Kasim prepares and records). The back end
 * repeats the role check and runs the record checks itself.
 * env: { rules, store (read only here), now }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"));
  else root.PSPreToolUse = factory(root.PSFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  function preToolUse(tool, input, staffId, env) {
    const R = env.rules;
    const checks = [];
    const pass = (check, clause) => { checks.push({ check, clause, pass: true }); };
    const block = (check, code, message, opts) => {
      const o = opts || {};
      checks.push({ check, clause: o.clause || F.CODES[code].clause, pass: false });
      return { allow: false, checks, result: F.fail(tool, code, message, o) };
    };
    const staff = R.who(staffId);
    if (!staff) return block("Signed-in staff ID", "not_offered", "No signed-in staff member.", { next_step: "Sign in first." });
    pass(`Signed in as ${staff.id}, ${R.person(staff.id)}`, "PS-RP-01");

    if (!R.TOOLS_FOR[staff.role].includes(tool))
      return block(`${tool} is offered to ${staff.first}`, "not_offered", `${tool} is not offered to ${staff.name}.`,
        { next_step: { text: `${tool} is not one of ${staff.first}'s tools (PS-RP-01).`, say: R.say.noAuthority(tool, Object.keys(R.ACTIONS[tool] || {})[0]), basis: "PS-RP-01" } });
    pass(`${tool} is offered to ${staff.first}`, "PS-RP-01");

    const action = input.action;
    if (!action || !R.ACTIONS[tool][action])
      return block(`Action ${action || "(none)"} exists`, "invalid_fields", `Choose one of: ${Object.keys(R.ACTIONS[tool]).join(", ")}.`, { clause: "PS-RP-01" });
    if (!R.offered(staff.role, tool, action)) {
      const owners = R.ownersOf(tool, action);
      return block(`${staff.first} may ${tool} ${action}`, "not_offered", `${tool} ${action} is for ${owners.map(R.nameOf).join(" and ")}.`,
        { clause: tool === "billing" ? "PS-RP-05" : "PS-RP-01", next_step: { text: `${owners.map(R.nameOf).join(" and ")} does this (PS-RP-01).`, person: owners[0], say: R.say.noAuthority(tool, action), basis: tool === "billing" ? "PS-RP-05" : "PS-RP-01" } });
    }
    pass(`${staff.first} may ${tool} ${action}`, tool === "billing" ? "PS-RP-05" : "PS-RP-01");

    // Who may see what (PS-RP-02, PS-RP-03): checked before any record is opened.
    if (tool === "patient" && action === "find") {
      const view = input.view || "summary";
      if (!["summary", "medicines", "case_notes"].includes(view)) return block(`View ${view} exists`, "invalid_fields", "Choose the summary, medicines or case_notes view.", { clause: "PS-RP-02" });
      if (view === "case_notes" && staff.role !== "gp")
        return block(`${staff.first} may open case notes`, "no_access", "Case notes are for the GP only.",
          { clause: "PS-RP-02", next_step: { text: "Case notes are seen only by Dr Sivakumar (PS-RP-02).", person: "GP-01", say: R.say.noAccess(`${input.name || "the patient"}'s case notes`, ["GP-01"], true), basis: "PS-RP-02" } });
      if (view === "medicines" && staff.role === "desk")
        return block(`${staff.first} may open the medicines view`, "no_access", "Allergies, conditions and current medicines in detail are for the GP and the pharmacist.",
          { clause: "PS-RP-04", next_step: { text: "The medicines view is for Dr Sivakumar and Ms Yong (PS-RP-03, PS-RP-04).", say: R.say.noAccess(`${input.name || "the patient"}'s medicines record`, ["GP-01", "PH-01"]), basis: "PS-RP-04" } });
      pass(`${staff.first} may open the ${view} view`, view === "case_notes" ? "PS-RP-02" : "PS-RP-03");
    }

    // Handover and query reasons are set by code from the stage of the visit and the check (PS-RP-06,
    // PS-AC-03), never by the model: a reason passed in the call is ignored.
    if ((tool === "dispense" && action === "query_gp") || (tool === "tasks" && action === "hand_over")) {
      if ("reason" in input) delete input.reason;
      if (tool === "tasks" && input.matter && !["question", "unwell", "outside_policy"].includes(input.matter))
        return block("Matter is question, unwell or outside_policy", "invalid_fields", "Choose the matter: question, unwell or outside_policy.", { clause: "PS-RP-06" });
      pass(tool === "tasks" ? "Receiver set by code from the stage of the visit" : "Reason set by code from the check", tool === "tasks" ? "PS-RP-06" : "PS-AC-03");
    }

    // Identification is required for every action on one patient (PS-HS-04); the back end matches it.
    const NO_PATIENT = new Set(["schedule.view_queue", "schedule.call_next", "dispense.view_stock", "billing.reconcile_day", "billing.view_payments",
      "billing.view_owner_review", "billing.view_panel_bills", "documents.list", "tasks.list", "patient.register"]);
    const key = `${tool}.${action}`;
    if (!NO_PATIENT.has(key) && !input.patient_id && !input.bill_id && !input.document_id && !input.task_id) {
      if (!input.name) return block("Patient identified", "identifier_required", "Give the patient's full name with the IC last 4 digits or the phone number.", { next_step: "Ask for the patient's full name and the IC last 4 digits or phone." });
      if (!input.ic_last4 && !input.phone) return block("Patient identified", "identifier_required", `A name alone is not enough to find ${input.name}.`, { next_step: `Ask for ${input.name}'s IC last 4 digits or phone number.` });
    }
    if (!NO_PATIENT.has(key)) pass("Patient identification given", "PS-HS-04");
    return { allow: true, checks, result: null };
  }

  return { preToolUse };
});
