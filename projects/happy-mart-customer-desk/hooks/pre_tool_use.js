/* The PreToolUse hook: one shared hook in front of all 17 tools of all seven agents.
 *
 * preToolUse(tool, input, agent, session, env) -> { allow, checks, result }
 *   agent:   which agent is calling (router, a specialist, synthesis), set by the host, never by the model.
 *   session: the verified order, the failed attempts and this turn's results; no agent passes them.
 *   checks:  every check run, in order: { check, clause, pass } (shown in the routing panel).
 *   result:  when allow is false, the block in the shared result shape, with its code, clause and next_step.
 * env: { tables, clauses, store (read only here), rules, now }.
 * Identity before routing (CS1), the 3-attempt lock (CS2), the three-part access check on every lookup
 * and request, the windows (FP3, FP4, RP1, RP3, QP1, QP2), the handover reason and contact, the content
 * of a reply, and the pre-send check (lib/presend.js).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../lib/format.js"), require("../lib/presend.js"));
  else root.HMPreToolUse = factory(root.HMFormat, root.HMPresend);
})(typeof self !== "undefined" ? self : this, function (F, P) {
  "use strict";

  const ORDER_TOOLS = ["get_delivery_info", "request_address_change", "request_cancellation", "get_return_info", "request_return",
    "get_refund_status", "get_claim_info", "file_damage_report", "file_warranty_claim", "get_order_value"];
  const HANDOVER_CONTACT = { customer_requested_person: "customer_service", verification_locked: "customer_service",
    reply_blocked_twice: "customer_service", policy_not_covered: "store" };

  function preToolUse(tool, input, agent, session, env) {
    const { tables, clauses, store, rules, now } = env;
    const V = tables.values;
    const checks = [];
    const pass = (check, clause) => { checks.push({ check, clause, pass: true }); };
    const block = (check, code, message, opts) => {
      const o = opts || {};
      checks.push({ check, clause: o.clause || F.CODES[code].clause, pass: false });
      return { allow: false, checks, result: F.fail(tool, code, message, o) };
    };
    const allow = () => ({ allow: true, checks, result: null });
    const turn = session.turn;
    const contact = (id) => tables.contacts.find((c) => c.id === id);

    // ---- Every tool: the calling agent owns it (Section 3; the backstop behind each agent's own tool list).
    const owned = tables.tool_owners[agent] || [];
    if (!owned.includes(tool)) return block(`${agent} owns ${tool}`, "tool_not_permitted", `${tool} is not one of the ${agent}'s tools.`,
      { next_step: `Use only your own tools: ${owned.join(", ")}.` });
    pass(`${agent} owns ${tool}`, "Section 3");

    // ---- verify_order (CS1, CS2)
    if (tool === "verify_order") {
      if (session.failed >= V.verify_attempts) {
        const c = contact("customer_service");
        return block(`Fewer than ${V.verify_attempts} failed attempts (${session.failed})`, "verification_locked", `${session.failed} failed attempts in this conversation.`,
          { next_step: `Call hand_to_staff with reason verification_locked and contact ${c.name}, then compose_reply and send_reply.` });
      }
      pass(`Fewer than ${V.verify_attempts} failed attempts (${session.failed})`, "CS2");
      if (!/^HM-\d{6}$/.test(String(input.order_id || "")) || !/^\d{4}$/.test(String(input.phone_last4 || "")))
        return block("Order ID in the form HM-nnnnnn and 4 phone digits", "input_invalid", "The order ID or the phone digits are not in the right form.",
          { next_step: "Ask the customer for the order ID (HM- and six digits) and the last 4 digits of the phone number on the order (CS1)." });
      pass("Order ID in the form HM-nnnnnn and 4 phone digits", "CS1");
      return allow();
    }

    // ---- ask_specialist (CS1: identity before routing)
    if (tool === "ask_specialist") {
      if (!session.verified) return block("An order is verified in this session", "not_verified", "No order is verified yet.",
        { next_step: "Ask the customer for the order ID and the last 4 digits of the phone number, then call verify_order (CS1)." });
      pass(`Order ${session.verified} verified in this session`, "CS1");
      if (!tables.specialists.includes(input.department)) return block(`Department ${input.department} is one of the five`, "content_unsupported",
        `${input.department} is not a specialist department.`, { next_step: `Choose one of: ${tables.specialists.join(", ")}.` });
      pass(`Department ${input.department} is one of the five`, "Router workbook");
      return allow();
    }

    // ---- hand_to_staff: reason in the fixed list, the contact matches the reason and the department
    if (tool === "hand_to_staff") {
      const reasons = tables.handovers.map((h) => h.reason);
      if (!reasons.includes(input.reason)) return block(`Reason ${input.reason} is in the fixed list`, "handover_invalid", `${input.reason} is not a handover reason.`,
        { next_step: `Use one of: ${reasons.join(", ")}.` });
      pass(`Reason ${input.reason} is in the fixed list`, "CS5");
      let cid = HANDOVER_CONTACT[input.reason];
      if (!cid) {
        // policy_not_clear and specialist_timeout: a specialist result this turn gave it.
        const gave = turn.specialists.filter((s) => s.handover && s.handover.reason === input.reason);
        const named = String(input.contact_name || "").trim().toLowerCase();
        const from = gave.find((s) => contact(s.department).name.toLowerCase() === named) || gave[0];
        if (!from) return block(`A specialist this turn returned ${input.reason}`, "handover_invalid", `No specialist this turn returned ${input.reason}.`,
          { next_step: "Hand over for policy_not_clear or specialist_timeout only when a specialist's answer says so." });
        pass(`${from.department} returned ${input.reason} this turn`, "CS5");
        cid = from.department;
      }
      const c = contact(cid);
      if (String(input.contact_name || "").trim().toLowerCase() !== c.name.toLowerCase())
        return block(`Contact for ${input.reason} is ${c.name}`, "handover_invalid", `${input.reason} goes to ${c.name}, ${c.title}, not ${input.contact_name}.`,
          { next_step: `Call hand_to_staff again with contact ${c.name}.` });
      pass(`Contact for ${input.reason} is ${c.name}, ${c.title}`, "CS5");
      if (turn.handovers.some((h) => h.reason === input.reason && h.contact_id === cid))
        return block("Not already handed over this turn", "handover_invalid", `Already handed to ${c.name} this turn.`, { next_step: "Go on to compose_reply." });
      pass("Not already handed over this turn", "CS5");
      return allow();
    }

    // ---- compose_reply: every point from a specialist result this turn, or the router's own clauses
    if (tool === "compose_reply") {
      const ok = new Set(turn.cited.concat(tables.router_clauses));
      for (const p of input.points || []) {
        const cl = Array.isArray(p.clauses) ? p.clauses : [];
        if (!cl.length) return block("Every point carries a clause", "content_unsupported", `A point has no clause: "${String(p.text).slice(0, 80)}"`,
          { next_step: "Give every point the clause a specialist cited for it, or leave the point out." });
        const bad = cl.filter((c) => !ok.has(c));
        if (bad.length) return block("Every point's clause was cited this turn", "content_unsupported",
          `${bad.join(", ")} was not cited by a specialist this turn.`, { next_step: "Use only the points and clauses the specialists returned this turn." });
      }
      pass(`Every point's clause was cited this turn (${(input.points || []).length} points)`, "Router workbook");
      if (input.decline_outside_business && (turn.specialists.length || session.verifiedThisTurn))
        return block("A decline (CS3) only for a matter outside the business", "content_unsupported", "A verified Happy Mart matter is not declined.",
          { next_step: "Compose the specialists' answers instead." });
      if (!(input.points || []).length && !input.decline_outside_business && !turn.handovers.length)
        return block("The reply has content", "content_unsupported", "No points, no decline and no handover to state.",
          { next_step: "Ask the specialists first, or decline a matter outside the business (CS3), or hand over." });
      pass("The reply has content", "Router workbook");
      return allow();
    }

    // ---- send_reply: the pre-send check (Section 7)
    if (tool === "send_reply") {
      const r = P.presend(String(input.text || ""), {
        facts: turn.facts, clauses: turn.cited.concat(turn.routerClauses), handovers: turn.handovers, tables,
      });
      if (!r.pass) {
        const reasons = r.blocks.map((b) => `${b.check}: ${b.found}`);
        checks.push(...r.blocks.map((b) => ({ check: `${b.check}: ${b.found}`, clause: "Pre-send check", pass: false })));
        const res = F.fail(tool, "reply_blocked", `Blocked before sending: ${reasons.join("; ")}`,
          { data: { blocks: r.blocks }, next_step: "Call compose_reply once more with the same content and these reasons in fix_note, then send_reply." });
        return { allow: false, checks, result: res, presend: r };
      }
      ["Fixed values", "Dates and amounts", "Blocked claims", "Money", "Handover", "Clauses"].forEach((c) => pass(`${c}: nothing unsupported`, "Pre-send check"));
      return allow();
    }

    // ---- The three-part access check on every order lookup and request
    if (ORDER_TOOLS.includes(tool)) {
      if (!session.verified || input.order_id !== session.verified)
        return block(`Order ${input.order_id} is the verified order`, "order_not_verified", `${input.order_id} is not the order verified in this conversation.`,
          { next_step: `Use the verified order ${session.verified || "(none yet)"} only.` });
      pass(`Order ${input.order_id} is the verified order`, "CS1");
      const o = store.get("orders").find((x) => x.order_id === input.order_id);
      if ("line_id" in input || ["request_return", "file_damage_report", "file_warranty_claim"].includes(tool)) {
        if (!o.lines.some((l) => l.line_id === input.line_id))
          return block(`Item ${input.line_id} is a line of ${o.order_id}`, "item_not_in_order", `${input.line_id} is not an item in ${o.order_id}.`,
            { next_step: "Look the order up first and use a line_id from it. If the customer's item is not in this order, say so in your answer." });
        pass(`Item ${input.line_id} is a line of ${o.order_id}`, "CS1");
      }
      const handBack = (cl) => `Hand back: submit_answer with status handover, reason policy_not_clear (${cl} is silent after dispatch).`;
      if (tool === "request_address_change" || tool === "request_cancellation") {
        const cl = tool === "request_address_change" ? "FP3" : "FP4";
        // FP3 says the address cannot be changed after dispatch; FP4 is silent on a cancellation after dispatch.
        const next = cl === "FP3" ? "Answer with FP3: the order is already dispatched, so the delivery address cannot be changed. No handover." : handBack(cl);
        if (o.status !== "not_dispatched") return block(`${o.order_id} not dispatched`, "after_dispatch", `${o.order_id} is ${o.status.replace("_", " ")}.`,
          { clause: cl, next_step: next });
        pass(`${o.order_id} not dispatched`, cl);
      }
      if (tool === "request_return") {
        const days = o.delivery_time ? rules.daysBetween(o.delivery_time, now) : null;
        if (days === null || days > V.return_days) return block(`Within ${V.return_days} days of delivery (${days} days)`, "return_window_passed",
          `${days} days since delivery.`, { next_step: "Answer with RP1: the return window has passed. No exception or credit is offered (CS7)." });
        pass(`Within ${V.return_days} days of delivery (${days} days)`, "RP1");
        const l = o.lines.find((x) => x.line_id === input.line_id);
        if (l.sale) return block(`${l.product} is not a sale item`, "sale_item", `${l.product} was bought on sale.`,
          { next_step: "Answer with RP3: sale items cannot be returned. MP6: the 48-hour damage report and the 30-day warranty still apply." });
        pass(`${l.product} is not a sale item`, "RP3");
      }
      if (tool === "file_damage_report") {
        const hours = o.delivery_time ? Math.floor((now - o.delivery_time) / 3600) : null;
        if (hours === null || hours > V.report_hours) return block(`Within ${V.report_hours} hours of delivery (${hours} hours)`, "report_window_passed",
          `${hours} hours since delivery.`, { next_step: "Answer with QP1: the 48-hour report window has passed. Offer no review or exception." });
        pass(`Within ${V.report_hours} hours of delivery (${hours} hours)`, "QP1");
      }
      if (tool === "file_warranty_claim") {
        const days = o.delivery_time ? rules.daysBetween(o.delivery_time, now) : null;
        if (days === null || days > V.warranty_days) return block(`Within ${V.warranty_days} days of delivery (${days} days)`, "warranty_expired",
          `${days} days since delivery.`, { next_step: "Answer with QP2: the 30-day shop warranty has ended." });
        pass(`Within ${V.warranty_days} days of delivery (${days} days)`, "QP2");
      }
      return allow();
    }

    // ---- submit_answer: the answer shape and the department's own clauses
    if (tool === "submit_answer") {
      const problems = F.checkAnswer(input, agent, clauses);
      if (problems.length) return block("Answer in the standard shape, citing only this department's clauses", "specialist_output_invalid",
        problems.join("; "), { next_step: "Call submit_answer again: status answered, handover or error; every point with clauses from your own policy." });
      pass("Answer in the standard shape, citing only this department's clauses", "Section 5");
      return allow();
    }

    // ---- write_reply (synthesis): owner only
    return allow();
  }

  return { preToolUse, ORDER_TOOLS };
});
