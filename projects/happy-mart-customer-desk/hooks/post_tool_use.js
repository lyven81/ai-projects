/* The PostToolUse hook: one shared hook after all 17 tools.
 *
 * postToolUse(tool, input, raw, agent, session, env) -> { result, changes }
 *   raw:     what the tool returned (sen, Unix seconds, stored codes), or { backendRefusal } / { fault }.
 *   result:  the shared result shape: amounts in RM, times in Malaysia time, statuses named, only the
 *            department's fields, the delivery window and fee due computed, a specialist's answer in the
 *            standard shape with its clauses checked.
 *   changes: one line per thing converted, trimmed, computed or checked (the routing panel).
 * PostToolUse reports and standardises; it cannot undo what a tool did.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"));
  else root.HMPostToolUse = factory(root.HMFormat);
})(typeof self !== "undefined" ? self : this, function (F) {
  "use strict";

  const STATUS = { not_dispatched: "not dispatched", dispatched: "dispatched", delivered: "delivered", cancelled: "cancelled" };
  const REFUND = { none: "no refund on record", awaiting_approval: "awaiting approval", approved: "approved, not yet paid", paid: "paid" };
  const RETURN = { none: "no return", requested: "return requested", in_transit: "return in transit", received: "returned item received, not yet checked",
    approved: "return approved", rejected: "return rejected" };
  const NEXT_REFUSED = {
    order_not_verified: "Use the verified order only.",
    item_not_in_order: "Look the order up and use a line_id from it. If the customer's item is not in this order, say so.",
    after_dispatch: "An address change: answer with FP3, the address cannot be changed after dispatch. A cancellation: hand back with status handover, reason policy_not_clear (FP4 is silent after dispatch).",
    return_window_passed: "Answer with RP1: the return window has passed. No exception or credit is offered (CS7).",
    sale_item: "Answer with RP3: sale items cannot be returned.",
    report_window_passed: "Answer with QP1: the 48-hour report window has passed.",
    warranty_expired: "Answer with QP2: the 30-day shop warranty has ended.",
  };

  function postToolUse(tool, input, raw, agent, session, env) {
    const { tables, clauses } = env;
    const changes = [];
    const did = (s) => changes.push(s);
    const contact = (id) => tables.contacts.find((c) => c.id === id);

    if (raw && raw.backendRefusal) {
      const e = raw.backendRefusal;
      did(`Back end refused on its own: ${e.code}`);
      return { result: F.fail(tool, e.code, e.message, { next_step: NEXT_REFUSED[e.code] }), changes };
    }
    if (raw && raw.fault) {
      did("The order system did not answer: lookup_timeout, retryable once");
      return { result: F.fail(tool, "lookup_timeout", "The order system did not answer in time. Nothing was changed.",
        { next_step: "Retry this lookup once. If it fails again, submit_answer with status error saying what you attempted." }), changes };
    }
    const trim = (data) => {
      const allowed = tables.field_sets[tool];
      if (!allowed) return data;
      const extra = Object.keys(data).filter((k) => !allowed.includes(k));
      if (extra.length) { did(`Removed fields outside the department's set: ${extra.join(", ")}`); extra.forEach((k) => delete data[k]); }
      else did(`Only ${agent}'s fields present (${allowed.length} allowed)`);
      return data;
    };

    if (tool === "verify_order") {
      if (!raw.match) {
        did("No match: no hint whether the order ID exists (CS1)");
        const left = tables.values.verify_attempts - session.failed;
        const next = left > 0
          ? `Ask the customer to check the order ID and the last 4 digits of the phone number and try again. Do not say which part did not match. ${left} attempt(s) left.`
          : `That was the 3rd failed attempt. Call hand_to_staff with reason verification_locked and contact ${contact("customer_service").name}.`;
        return { result: F.fail(tool, "verification_failed", "The order ID and phone digits do not match an order.", { next_step: next }), changes };
      }
      did("Verified: the session holds the order ID; the router sees only verified and the first name");
      return { result: F.ok(tool, { verified: true, order_id: raw.match.order_id, first_name: raw.match.first_name },
        "Ask only the specialists the enquiry needs (ask_specialist)."), changes };
    }

    if (tool === "get_delivery_info") {
      const d = trim(Object.assign({}, raw));
      const w = d.delivery_window;
      const out = { order_id: d.order_id, status: STATUS[d.status], order_time: F.myt(d.order_time), dispatch_time: F.myt(d.dispatch_time),
        delivery_time: F.myt(d.delivery_time), delivery_address: d.delivery_address,
        delivery_window: `${F.dayLabel(w.from)} to ${F.dayLabel(w.to)}` };
      did(`Status ${d.status} named "${STATUS[d.status]}"; times to Malaysia time`);
      did(`Delivery window computed in code: the 3rd to the 5th working day after the order date, skipping weekends and Selangor holidays (FP2): ${out.delivery_window}`);
      return { result: F.ok(tool, out), changes };
    }
    if (tool === "get_return_info") {
      const d = trim(Object.assign({}, raw));
      const out = { order_id: d.order_id, delivery_time: F.myt(d.delivery_time), days_since_delivery: d.days_since_delivery,
        within_14_day_window: d.days_since_delivery !== null && d.days_since_delivery <= tables.values.return_days,
        items: d.items.map((i) => ({ line_id: i.line_id, product: i.product, variant: i.variant, sale_item: i.sale, return_status: RETURN[i.return_status] })) };
      did(`Days since delivery computed in code: ${d.days_since_delivery}; return statuses named`);
      return { result: F.ok(tool, out), changes };
    }
    if (tool === "get_refund_status") {
      const d = trim(Object.assign({}, raw));
      const out = { order_id: d.order_id, state: REFUND[d.state], amount: F.rm(d.amount), approval_date: F.myt(d.approval_date), paid_date: F.myt(d.paid_date) };
      did(`Refund state ${d.state} named "${REFUND[d.state]}"; amount to RM; dates to Malaysia time`);
      return { result: F.ok(tool, out), changes };
    }
    if (tool === "get_claim_info") {
      const d = trim(Object.assign({}, raw));
      const out = { order_id: d.order_id, delivery_time: F.myt(d.delivery_time), hours_since_delivery: d.hours_since_delivery,
        days_since_delivery: d.days_since_delivery,
        within_48_hour_report_window: d.hours_since_delivery !== null && d.hours_since_delivery <= tables.values.report_hours,
        within_30_day_warranty: d.days_since_delivery !== null && d.days_since_delivery <= tables.values.warranty_days, items: d.items };
      did(`Hours (${d.hours_since_delivery}) and days (${d.days_since_delivery}) since delivery computed in code (QP1, QP2)`);
      return { result: F.ok(tool, out), changes };
    }
    if (tool === "get_order_value") {
      const d = trim(Object.assign({}, raw));
      const out = { order_id: d.order_id, order_time: F.myt(d.order_time), order_total: F.rm(d.order_total), delivery_fee_charged: F.rm(d.delivery_fee_charged),
        campaign_day: d.campaign_day ? `yes, a ${d.campaign_day} sale day` : "no", free_delivery_rule: d.campaign_day ? "MP3: free above RM50" : "MP1: free above RM100",
        threshold: F.rm(d.threshold), fee_due: F.rm(d.fee_due) };
      did(`Campaign day, threshold and fee due computed in code: ${out.campaign_day}; ${out.free_delivery_rule}; fee due ${out.fee_due}`);
      return { result: F.ok(tool, out), changes };
    }
    if (["request_address_change", "request_cancellation", "request_return", "file_damage_report", "file_warranty_claim"].includes(tool)) {
      const id = raw.request_id || raw.claim_id;
      did(`Pending ${raw.type.replace("_", " ")} ${id} written for ${raw.for}; nothing is approved by the assistant`);
      return { result: F.ok(tool, { reference: id, type: raw.type.replace("_", " "), status: "pending", for: raw.for },
        "Tell the customer it is prepared for staff to review; promise no outcome."), changes };
    }

    if (tool === "submit_answer") {
      did("Answer accepted in the standard shape");
      return { result: F.ok(tool, { received: true }), changes };
    }
    if (tool === "write_reply") {
      did("Reply text received from the synthesis agent");
      return { result: F.ok(tool, { received: true }), changes };
    }

    if (tool === "ask_specialist") {
      const dept = input.department;
      const c = contact(dept);
      if (raw.timedOut || (raw.answer && raw.answer.status === "error") || !raw.answer) {
        const why = raw.timedOut ? `no answer within ${tables.values.specialist_limit_ms / 1000} seconds` : raw.answer ? "lookup failed after one retry" : "no answer";
        did(`${dept}: ${why}; nothing unknown is stated as fact`);
        const res = F.fail(tool, "specialist_timeout", `The ${dept} specialist could not answer: ${why}.`,
          { data: { department: dept, attempted: raw.answer && raw.answer.error ? raw.answer.error : null },
            next_step: `Call hand_to_staff with reason specialist_timeout and contact ${c.name}. Say nothing about the order you do not know.` });
        return { result: res, changes, answer: { department: dept, status: "handover", points: [], handover: { reason: "specialist_timeout" } } };
      }
      const a = raw.answer;
      const problems = F.checkAnswer(a, dept, clauses);
      if (problems.length) {
        did(`Answer outside the shape or the department's clauses: ${problems.join("; ")}`);
        return { result: F.fail(tool, "specialist_output_invalid", problems.join("; "), { next_step: `Ask the ${dept} specialist once more.` }), changes };
      }
      const cited = [...new Set(a.points.flatMap((p) => p.clauses))];
      did(`Answer in the standard shape; ${a.points.length} points; clauses ${cited.join(", ") || "none"}, all ${dept}'s`);
      const out = { department: dept, status: a.status, points: a.points.map((p) => ({ text: p.text, clauses: p.clauses })), facts: raw.facts || [] };
      if (a.status === "handover") {
        out.handover = { reason: a.handover.reason, contact: c.name, title: c.title };
        did(`Hand back: ${a.handover.reason}, contact ${c.name}, ${c.title}`);
      }
      return { result: F.ok(tool, out, a.status === "handover" ? `Call hand_to_staff with reason ${a.handover.reason} and contact ${c.name}.` : null), changes, answer: a };
    }

    if (tool === "hand_to_staff") {
      did(`Handover ${raw.handover_id} written as pending for ${raw.contact_name}, with the summary`);
      return { result: F.ok(tool, { reference: raw.handover_id, contact: raw.contact_name, title: raw.title, sentence: raw.sentence },
        "Go on to compose_reply; the sentence is added to the reply by code."), changes };
    }
    if (tool === "compose_reply") {
      did(`Draft written by the synthesis agent (${raw.text.length} characters), clauses ${raw.clauses.join(", ") || "none"}`);
      return { result: F.ok(tool, { draft: raw.text, clauses: raw.clauses }, "Call send_reply with this draft exactly."), changes };
    }
    if (tool === "send_reply") {
      did(raw.holding ? "Holding reply sent by code after a second block" : "Sent to the customer");
      return { result: F.ok(tool, { sent: raw.text, time: F.myt(raw.time) }, "The turn is finished."), changes };
    }
    return { result: F.ok(tool, raw), changes };
  }

  return { postToolUse };
});
