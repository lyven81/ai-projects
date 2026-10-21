/* Happy Mart routing agent: the 17 tools and the desk that runs every call through the hooks.
 *
 *   desk.call(session, agent, name, input) -> Promise<{ result, hook }>
 *     1. PreToolUse (hooks/pre_tool_use.js): blocks or allows, citing clauses.
 *     2. The tool: the back end (lib/backend.js), which repeats the critical checks; ask_specialist runs a
 *        specialist sub-agent and compose_reply the synthesis agent, through the runners the host passes in.
 *     3. PostToolUse (hooks/post_tool_use.js): converts, trims, computes, standardises.
 *   result is the shared shape (lib/format.js) and is all the agent sees; hook is the record shown in the
 *   routing panel: the calling agent, what was asked, the PreToolUse checks, what PostToolUse changed, the times.
 *
 * The session holds the verified order, the failed attempts and this turn's results: specialist answers,
 * clauses cited, the facts the tools returned, handovers, blocked drafts. No agent passes them; the calling
 * agent is set by the host, never by the model.
 * Loaded by mcp_server.mjs, the hook tests, the benchmark and the customer desk (window.HMTools).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./lib/format.js"), require("./lib/backend.js"), require("./hooks/pre_tool_use.js"), require("./hooks/post_tool_use.js"));
  else root.HMTools = factory(root.HMFormat, root.HMBackend, root.HMPreToolUse, root.HMPostToolUse);
})(typeof self !== "undefined" ? self : this, function (F, B, PRE, POST) {
  "use strict";

  const ORDER = { type: "string", description: "The verified order ID, e.g. HM-100101." };
  const LINE = { type: "string", description: "A line_id from the order lookup, e.g. L1." };
  const POINT = { type: "object", properties: { text: { type: "string" }, clauses: { type: "array", items: { type: "string" } } }, required: ["text", "clauses"] };
  const TOOLS = {
    // ---- router
    verify_order: { description: "Verify the customer's order with the order ID and the last 4 digits of the phone number on the order (CS1). Call it before asking any specialist. A failed match gives no hint which part was wrong.",
      input_schema: { type: "object", properties: { order_id: { type: "string", description: "HM- and six digits" }, phone_last4: { type: "string", description: "Exactly 4 digits" } }, required: ["order_id", "phone_last4"] } },
    ask_specialist: { description: "Send one part of the enquiry to the department that owns it: fulfilment, returns, finance, claims or marketing. The specialist looks up the verified order, applies its policy and returns its points with clauses, or a handover. Call it once per department the enquiry needs, and only those.",
      input_schema: { type: "object", properties: { department: { type: "string", enum: ["fulfilment", "returns", "finance", "claims", "marketing"] }, question: { type: "string", description: "The part of the enquiry for this department, in the customer's words, with any item they named." } }, required: ["department", "question"] } },
    compose_reply: { description: "Pass the content of the reply to the writer: the specialists' points with the clauses they cited, unchanged in meaning, each labelled with the customer's question it answers. Set decline_outside_business for a matter outside the business (CS3). Handover sentences are added by code. Returns the draft.",
      input_schema: { type: "object", properties: { points: { type: "array", items: { type: "object", properties: { text: { type: "string" }, clauses: { type: "array", items: { type: "string" } }, answers: { type: "string", description: "The customer's question this point answers, as you passed it to the specialist." } }, required: ["text", "clauses", "answers"] } }, decline_outside_business: { type: "boolean" }, fix_note: { type: "string", description: "Only after a blocked send: the block reasons, so the writer removes them." } }, required: ["points"] } },
    send_reply: { description: "Send the draft from compose_reply to the customer, exactly as returned. The pre-send check reads it first and blocks any claim the policies and this turn's records do not support.",
      input_schema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
    hand_to_staff: { description: "Hand the matter to the named contact for a fixed reason: customer_requested_person, policy_not_covered, policy_not_clear, specialist_timeout, verification_locked. The handover is pending with your summary.",
      input_schema: { type: "object", properties: { reason: { type: "string", enum: ["customer_requested_person", "policy_not_covered", "policy_not_clear", "specialist_timeout", "verification_locked"] }, contact_name: { type: "string" }, summary: { type: "string", description: "What the customer asked and what was found, in one or two sentences." } }, required: ["reason", "contact_name", "summary"] } },
    // ---- specialists
    get_delivery_info: { description: "Fulfilment: the order's status, order, dispatch and delivery times, delivery address, and the delivery window computed from the order date (FP2).",
      input_schema: { type: "object", properties: { order_id: ORDER }, required: ["order_id"] } },
    request_address_change: { description: "Fulfilment: prepare a pending address change for the fulfilment supervisor. Allowed only before dispatch (FP3); the code decides.",
      input_schema: { type: "object", properties: { order_id: ORDER, new_address: { type: "string" } }, required: ["order_id", "new_address"] } },
    request_cancellation: { description: "Fulfilment: prepare a pending cancellation for the fulfilment supervisor. Allowed only before dispatch (FP4); the code decides.",
      input_schema: { type: "object", properties: { order_id: ORDER, reason: { type: "string" } }, required: ["order_id"] } },
    get_return_info: { description: "Returns: the delivery date, days since delivery, and each item (line_id, product, variant, sale_item, return status).",
      input_schema: { type: "object", properties: { order_id: ORDER }, required: ["order_id"] } },
    request_return: { description: "Returns: prepare a pending return of one item for the returns lead. The code refuses it after 14 days (RP1) or for a sale item (RP3). Call it whenever the customer asks to return an item, so the check runs.",
      input_schema: { type: "object", properties: { order_id: ORDER, line_id: LINE, reason: { type: "string" } }, required: ["order_id", "line_id"] } },
    get_refund_status: { description: "Finance: the refund state, amount, approval date and paid date for the order.",
      input_schema: { type: "object", properties: { order_id: ORDER }, required: ["order_id"] } },
    get_claim_info: { description: "Claims: the delivery date and time, hours and days since delivery, and each item (line_id, product, variant).",
      input_schema: { type: "object", properties: { order_id: ORDER }, required: ["order_id"] } },
    file_damage_report: { description: "Claims: prepare a pending damaged or wrong item report for the claims officer. The code refuses it after 48 hours (QP1). Call it whenever the customer reports damage or a wrong item, so the check runs.",
      input_schema: { type: "object", properties: { order_id: ORDER, line_id: LINE, kind: { type: "string", enum: ["damaged", "wrong_item"] }, description: { type: "string" } }, required: ["order_id", "line_id", "kind"] } },
    file_warranty_claim: { description: "Claims: prepare a pending warranty claim for the claims officer. The code refuses it after 30 days (QP2).",
      input_schema: { type: "object", properties: { order_id: ORDER, line_id: LINE, description: { type: "string" } }, required: ["order_id", "line_id"] } },
    get_order_value: { description: "Marketing: the order date and total, the delivery fee charged, whether it was a campaign day, the threshold that applies and the fee due, computed in code (MP1, MP2, MP3).",
      input_schema: { type: "object", properties: { order_id: ORDER }, required: ["order_id"] } },
    submit_answer: { description: "Your answer to the router, always your last call. status answered, handover (a clause is silent: reason policy_not_clear) or error (a lookup failed after one retry). Every point cites clauses from your own policy.",
      input_schema: { type: "object", properties: {
        status: { type: "string", enum: ["answered", "handover", "error"] },
        points: { type: "array", items: POINT },
        handover: { type: "object", properties: { reason: { type: "string", enum: ["policy_not_clear"] } } },
        error: { type: "object", properties: { attempted: { type: "string" } } },
      }, required: ["status", "points"] } },
    // ---- synthesis
    write_reply: { description: "The reply to the customer, written only from the content given: one string per paragraph, and the clauses it uses.",
      input_schema: { type: "object", properties: { paragraphs: { type: "array", items: { type: "string" }, description: "One string per paragraph, in order; each a single paragraph with no line breaks." }, clauses: { type: "array", items: { type: "string" } } }, required: ["paragraphs", "clauses"] } },
  };
  const LOOKUPS = ["get_delivery_info", "get_return_info", "get_refund_status", "get_claim_info", "get_order_value"];

  /** The tool definitions an agent may call, in the API shape. */
  function toolsFor(tables, agent) {
    return tables.tool_owners[agent].map((name) => ({ name, description: TOOLS[name].description, input_schema: TOOLS[name].input_schema }));
  }

  function leaves(x, out) {
    if (x === null || x === undefined) return out;
    if (typeof x === "string" || typeof x === "number") out.push(x);
    else if (Array.isArray(x)) x.forEach((v) => leaves(v, out));
    else if (typeof x === "object") Object.values(x).forEach((v) => leaves(v, out));
    return out;
  }

  /**
   * createDesk(store, tables, clauses, opts)
   *   opts.now: Unix seconds (the test calendar). opts.faults: { tool: count } (benchmark).
   *   opts.runSpecialist(department, handoff, session, signal) -> Promise<{ answer }>   (agent.js)
   *   opts.runSynthesis(content, session) -> Promise<{ text, clauses }>                   (agent.js)
   *   opts.clock: () => ms (defaults to Date.now), for the stage times.
   */
  function createDesk(store, tables, clauses, opts) {
    const o = opts || {};
    const rules = B.createRules(tables);
    const backend = B.createBackend(store, rules, { now: o.now, faults: o.faults || {}, fieldSets: tables.field_sets });
    const env = { tables, clauses, store, rules, now: o.now };
    const clock = o.clock || (() => Date.now());
    const contact = (id) => tables.contacts.find((c) => c.id === id);
    const HOLD = "customer_service";

    function newSession() {
      return { verified: null, first_name: null, failed: 0, turns: 0, turn: null };
    }
    function beginTurn(session, message) {
      session.turns++;
      session.turn = { n: session.turns, message, start: clock(), events: [], specialists: [], cited: [], routerClauses: [], facts: [], factsBy: {},
        handovers: [], drafts: [], blocked: [], reply: null, done: false, verifiedThisTurn: false };
      return session.turn;
    }

    async function run(session, agent, name, input) {
      const turn = session.turn;
      const RUN = {
        verify_order: () => {
          const m = backend.verify(String(input.order_id), String(input.phone_last4));
          if (m) { session.verified = m.order_id; session.first_name = m.first_name; turn.verifiedThisTurn = true; turn.routerClauses.push("CS1"); }
          else { session.failed++; turn.routerClauses.push("CS1"); }
          return { match: m };
        },
        ask_specialist: async () => {
          const dept = input.department;
          const handoff = { order_id: session.verified, customer_first_name: session.first_name, enquiry_part: input.question,
            today: F.myt(o.now) };
          const signal = { aborted: false };
          let timer;
          const limit = new Promise((res) => { timer = setTimeout(() => res({ timedOut: true }), tables.values.specialist_limit_ms); });
          const out = await Promise.race([o.runSpecialist(dept, handoff, session, signal), limit]);
          clearTimeout(timer);
          if (out.timedOut) signal.aborted = true;
          return { answer: out.answer || null, timedOut: !!out.timedOut, facts: turn.factsBy[dept] || [] };
        },
        compose_reply: async () => {
          // One paragraph per customer question, grouped in code from each point's answers label, in the order asked.
          const paragraphs = [];
          for (const p of input.points || []) {
            const key = String(p.answers || "").trim().toLowerCase();
            let g = paragraphs.find((x) => x.key === key);
            if (!g) { g = { key, answers: p.answers || null, points: [] }; paragraphs.push(g); }
            g.points.push({ text: p.text, clauses: p.clauses });
          }
          const content = { first_name: session.first_name, paragraphs: paragraphs.map(({ answers, points }) => ({ answers, points })),
            decline_outside_business: !!input.decline_outside_business,
            handover_sentences: turn.handovers.map((h) => h.sentence), fix_note: input.fix_note || null };
          for (const p of input.points || []) for (const c of p.clauses || []) if (tables.router_clauses.includes(c)) turn.routerClauses.push(c);
          if (input.decline_outside_business) turn.routerClauses.push("CS3");
          const w = await o.runSynthesis(content, session);
          turn.drafts.push(w.text);
          return { text: w.text, clauses: w.clauses || [] };
        },
        send_reply: () => { turn.reply = String(input.text); turn.done = true; return { text: turn.reply, time: o.now }; },
        hand_to_staff: () => {
          const fixed = { customer_requested_person: HOLD, verification_locked: HOLD, policy_not_covered: "store" }[input.reason];
          const gave = turn.specialists.filter((s) => s.handover && s.handover.reason === input.reason);
          const named = String(input.contact_name || "").trim().toLowerCase();
          const cid = fixed || (gave.find((s) => contact(s.department).name.toLowerCase() === named) || gave[0]).department;
          const c = contact(cid);
          const sentence = tables.handover_sentences[cid];
          const h = tables.handovers.find((x) => x.reason === input.reason);
          turn.routerClauses.push(h.clause);
          turn.handovers.push({ reason: input.reason, contact_id: cid, name: c.name, title: c.title, sentence });
          return backend.handover({ reason: input.reason, contact_id: cid, contact_name: c.name, title: c.title, sentence, summary: input.summary,
            order_id: session.verified, first_name: session.first_name, said: turn.message });
        },
        get_delivery_info: () => backend.deliveryInfo(session.verified, input.order_id),
        request_address_change: () => backend.requestAddressChange(session.verified, input.order_id, input.new_address),
        request_cancellation: () => backend.requestCancellation(session.verified, input.order_id, input.reason),
        get_return_info: () => backend.returnInfo(session.verified, input.order_id),
        request_return: () => backend.requestReturn(session.verified, input.order_id, input.line_id, input.reason),
        get_refund_status: () => backend.refundStatus(session.verified, input.order_id),
        get_claim_info: () => backend.claimInfo(session.verified, input.order_id),
        file_damage_report: () => backend.fileDamageReport(session.verified, input.order_id, input.line_id, input.kind, input.description),
        file_warranty_claim: () => backend.fileWarrantyClaim(session.verified, input.order_id, input.line_id, input.description),
        get_order_value: () => backend.orderValue(session.verified, input.order_id),
        submit_answer: () => input,
        write_reply: () => input,
      };
      try {
        return await RUN[name]();
      } catch (e) {
        if (e.backend) return { backendRefusal: { code: e.code, message: e.message } };
        if (e.fault) return { fault: true };
        throw e;
      }
    }

    /** The second block on send_reply: the holding reply goes out, fixed in code, and the matter goes to Nurul Aina Rahim. */
    function holdingReply(session) {
      const c = contact(HOLD);
      const turn = session.turn;
      const sentence = tables.handover_sentences[HOLD];
      turn.handovers.push({ reason: "reply_blocked_twice", contact_id: HOLD, name: c.name, title: c.title, sentence });
      backend.handover({ reason: "reply_blocked_twice", contact_id: HOLD, contact_name: c.name, title: c.title, sentence,
        summary: "The pre-send check blocked the reply twice.", order_id: session.verified, first_name: session.first_name, said: turn.message });
      const text = `${session.first_name ? `Hi ${session.first_name}, thank you` : "Thank you"} for your message. ${sentence}`;
      turn.reply = text; turn.done = true; turn.holding = true;
      return text;
    }

    async function call(session, agent, name, input) {
      input = input || {};
      const turn = session.turn;
      const t0 = clock();
      if (!TOOLS[name]) {
        const result = F.fail(name, "tool_not_permitted", `No tool named ${name}.`, { next_step: "Use only your own tools." });
        const hook = { agent, tool: name, input, pre: { verdict: "block", checks: [] }, tool_ran: false, post: [], result, t_ms: t0 - turn.start, elapsed_ms: 0 };
        turn.events.push(hook);
        return { result, hook };
      }
      const p = PRE.preToolUse(name, input, agent, session, env);
      let hook, result;
      if (!p.allow) {
        result = p.result;
        if (name === "send_reply" && result.error.code === "reply_blocked") {
          turn.blocked.push({ text: String(input.text || ""), blocks: p.presend ? p.presend.blocks : [] });
          if (turn.blocked.length > tables.values.rewrites_after_block) {
            const text = holdingReply(session);
            result = F.fail(name, "reply_blocked", result.error.message, { status: "handover",
              data: { sent: text, holding: true, blocks: p.presend ? p.presend.blocks : [] },
              next_step: `Blocked twice: the holding reply was sent by code and the matter handed to ${contact(HOLD).name}. The turn is finished.` });
          }
        }
        hook = { agent, tool: name, input, pre: { verdict: "block", checks: p.checks, code: result.error.code, clause: result.error.clause }, tool_ran: false, post: [], result };
      } else {
        const raw = await run(session, agent, name, input);
        const post = POST.postToolUse(name, input, raw, agent, session, env);
        result = post.result;
        if (name === "ask_specialist" && post.answer) {
          turn.specialists.push({ department: input.department, status: post.answer.status, handover: post.answer.handover || null,
            points: post.answer.points || [] });
          if (result.status === "ok") turn.cited.push(...result.data.points.flatMap((x) => x.clauses));
        }
        if (LOOKUPS.includes(name) && result.status === "ok") {
          const vals = leaves(result.data, []);
          turn.facts.push(...vals);
          (turn.factsBy[agent] = turn.factsBy[agent] || []).push(...vals);
        }
        hook = { agent, tool: name, input, pre: { verdict: "allow", checks: p.checks }, tool_ran: true, post: post.changes, result };
      }
      result.elapsed_ms = clock() - t0;
      hook.t_ms = t0 - turn.start;
      hook.elapsed_ms = result.elapsed_ms;
      if (!F.isShape(result)) throw new Error(`Result for ${name} is not in the shared shape`);
      turn.events.push(hook);
      store.set("call_log", (store.get("call_log") || []).concat([{ turn: turn.n, agent, tool: name, input, status: result.status,
        code: result.error ? result.error.code : null, t_ms: hook.t_ms, elapsed_ms: hook.elapsed_ms }]));
      return { result, hook };
    }

    return { TOOLS, toolsFor: (agent) => toolsFor(tables, agent), call, newSession, beginTurn, rules, backend, env };
  }

  /** A store over plain objects (the desk page, the tests, the benchmark). */
  function memoryStore(files) {
    const data = JSON.parse(JSON.stringify(files));
    return { get: (n) => data[n], set: (n, v) => { data[n] = v; }, dump: () => data };
  }

  return { TOOLS, LOOKUPS, toolsFor, createDesk, memoryStore };
});
