/* PreToolUse for the restaurant assistant. Runs before every tool call, in code, so what the model must never decide
 * is out of its hands before the tool runs:
 *   - only T1 to T4 may run (no confirm, release or close: those are the customer's screen, the timer and the manager)
 *   - name, phone and route come from the host context (the signed-in visitor, the form, or the A2A message's fixed
 *     customer metadata), never from the model: any such argument is removed and noted
 *   - no argument may carry a confirmation code (a 6-digit number): the call is blocked
 * Runs in Node and the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.JSPreToolUse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const ALLOWED = ["check_availability", "create_proposal", "get_proposal_status", "hand_to_manager"];
  const IDENTITY = ["name", "phone", "route", "customer", "customer_name", "customer_phone", "contact", "conversation"];
  const CODE = /(^|\D)\d{6}(\D|$)/;

  /** preToolUse(name, input, session) -> { allow, input, notes, error? } */
  function preToolUse(name, input, session) {
    const notes = [];
    if (!ALLOWED.includes(name)) {
      return { allow: false, input, notes, error: { code: "TOOL_NOT_ALLOWED", retryable: false, alternatives: ALLOWED, clause: "P11", message: `Only ${ALLOWED.join(", ")} may run. Confirming, releasing and closing are not assistant actions.` } };
    }
    if (!session || !session.name || !session.phone || !session.route) {
      return { allow: false, input, notes, error: { code: "NO_HOST_CONTEXT", retryable: false, alternatives: [], clause: "P9", message: "The customer's name, phone and route come from the host and are missing." } };
    }
    const clean = {};
    for (const [k, v] of Object.entries(input || {})) {
      if (IDENTITY.includes(k)) { notes.push(`Argument "${k}" removed: it comes from the host context.`); continue; }
      clean[k] = v;
    }
    const strings = Object.values(clean).filter((v) => typeof v === "string" || typeof v === "number").map(String);
    if (strings.some((s) => CODE.test(s.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "").replace(/\b0\d{1,2}-?\d{7,8}\b/g, "")))) {
      return { allow: false, input: clean, notes, error: { code: "CODE_IN_ARGUMENT", retryable: false, alternatives: [], clause: "P11", message: "A confirmation code never goes through the assistant. Only the customer enters it on their own phone." } };
    }
    return { allow: true, input: clean, notes };
  }
  return { preToolUse, ALLOWED };
});
