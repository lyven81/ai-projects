/* DF Auto Parts Distributors: the seven tools and the desk that runs every call through the hooks.
 *
 *   desk.call(name, input, staffId) -> { result, hook }
 *     1. PreToolUse (hooks/pre_tool_use.js): blocks or allows, citing clauses; for create_order it decides
 *        whether the request is placed or escalated to the manager who owns the rule (MP-16).
 *     2. The tool: the back end data layer (lib/backend.js), which repeats the critical checks.
 *     3. PostToolUse (hooks/post_tool_use.js): converts, trims, flags, reconciles, writes the Basis line and,
 *        for a fixed outcome, the reply written in code (next_step.say).
 *   result is the shared shape { tool, status, data, error, next_step } (lib/format.js) and is all the
 *   agent sees; hook is the record shown under the hood: what was asked, the PreToolUse verdict and
 *   checks, what the tool returned, what PostToolUse changed.
 *
 * The staff ID comes from the signed-in session (the request _meta), never from a tool argument
 * (MP-08): no tool takes a staff ID or free text to send. The desk buttons (Confirm summary, Approve,
 * Decline with reason) call the same actions with the same checks as the chat (note 05).
 * Loaded by mcp_server.mjs, the tool tests, the benchmark and the staff desk (window.DFTools).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./lib/format.js"), require("./lib/rules.js"), require("./lib/backend.js"),
      require("./hooks/pre_tool_use.js"), require("./hooks/post_tool_use.js"));
  else root.DFTools = factory(root.DFFormat, root.DFRules, root.DFBackend, root.DFPreToolUse, root.DFPostToolUse);
})(typeof self !== "undefined" ? self : this, function (F, R, B, PRE, POST) {
  "use strict";

  const SKU = { type: "string", description: "A catalogue SKU, e.g. DF-EO-001." };
  const LINES = { type: "array", minItems: 1, items: { type: "object", properties: { sku: SKU, qty: { type: "integer", minimum: 1 } }, required: ["sku", "qty"] } };
  const TOOLS = [
    {
      name: "check_stock",
      description: "Check stock at one warehouse (WH-A Shah Alam or WH-B Puchong). detail quantity (default): quantity per SKU in selling units, when each figure was last updated, and an out_of_date flag over 24 hours. detail storage: the bin location and the last manual count. detail schedule: the deliveries due from that warehouse on a date (YYYY-MM-DD), with items and who scheduled them; no SKUs needed. Call it for every stock or delivery schedule question, whoever is signed in; the hook decides who may see what.",
      input_schema: { type: "object", properties: { skus: { type: "array", items: SKU }, warehouse: { type: "string", enum: ["WH-A", "WH-B"] }, detail: { type: "string", enum: ["quantity", "storage", "schedule"] }, date: { type: "string", description: "YYYY-MM-DD, for detail schedule" } }, required: ["warehouse"] },
    },
    {
      name: "retrieve_customer_account",
      description: "Open one view of a customer's account. view location: where the customer is. view delivery: the warehouse that serves the customer and the delivery day for an order confirmed now. view credit: credit limit, outstanding, available credit and payment terms. view payments: unpaid invoices with due dates, overdue ones flagged. Call it for every such question, whoever is signed in; the hook decides who may open which view.",
      input_schema: { type: "object", properties: { customer_id: { type: "string", description: "e.g. C-0001" }, view: { type: "string", enum: ["location", "delivery", "credit", "payments"] } }, required: ["customer_id", "view"] },
    },
    {
      name: "retrieve_customer_prices",
      description: "Open a customer's own price list for some SKUs (or all when skus is empty), per selling unit in RM. A calendar promotion is applied by today's date; a SKU with no price is flagged price_missing.",
      input_schema: { type: "object", properties: { customer_id: { type: "string" }, skus: { type: "array", items: SKU } }, required: ["customer_id"] },
    },
    {
      name: "create_order",
      description: "Order for a customer: one tool for every step. Pass what the staff member asked for: the lines, a discount in percent, the payment route, the delivery date (YYYY-MM-DD). The hooks then build the summary for the staff member to confirm, or, when a rule needs a manager (a discount, an order below RM 300, a delivery date earlier than the terms, the prepaid route), send it to that manager as an escalation and keep the order as a draft. A later request that adds only a term for a customer with an open draft (\"its order\", \"now needs it today\", \"wants to pay first\"): pass only the customer and the new term, no lines. After the staff member confirms on screen, pass the request ID and confirmation ID they give, with the customer. Never pass prices, totals or approval IDs; code finds the approvals recorded for the request. Call it on every order attempt; the hooks decide.",
      input_schema: {
        type: "object",
        properties: {
          customer_id: { type: "string" },
          lines: Object.assign({ description: "Leave out when only a term is added to the customer's open draft, or when placing a confirmed summary." }, LINES),
          discount_pct: { type: "number", minimum: 0, description: "Discount in percent. Leave out when none was asked. Promotions are not discounts." },
          payment_route: { type: "string", enum: ["credit", "prepaid"], description: "prepaid when the customer pays before dispatch. Leave out when not mentioned." },
          delivery_date: { type: "string", description: "YYYY-MM-DD. Leave out when not mentioned." },
          request_id: { type: "string", description: "The request ID the staff page issued with the confirmation, e.g. RQ-0001. Only after the staff member confirmed." },
          confirmation_id: { type: "string", description: "The confirmation ID from the staff page, e.g. CF-0001. Only after the staff member confirmed." },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "decide_escalation",
      description: "Record a manager's decision on an escalation sent to them: approve, or decline with the reason they give. type: discount, minimum_order (an order below RM 300), delivery_exception (a delivery date outside the terms, such as same-day), or prepaid (the prepaid route). Call it whenever someone says to approve or decline such a request, whoever is signed in; the hook checks the escalation is addressed to them and in their domain.",
      input_schema: { type: "object", properties: { customer_id: { type: "string" }, type: { type: "string", enum: ["discount", "minimum_order", "delivery_exception", "prepaid"] }, decision: { type: "string", enum: ["approve", "decline"] }, reason: { type: "string", description: "The reason the manager gives, in their words. Leave out when none." } }, required: ["customer_id", "type", "decision"] },
    },
    {
      name: "schedule_delivery",
      description: "Schedule a placed order for delivery from its warehouse on a date (YYYY-MM-DD). Give the order ID when the staff member names it; otherwise the customer, and code finds the customer's placed order. Returns the schedule with items and quantities. Call it for every scheduling request, whoever is signed in; the hooks decide.",
      input_schema: { type: "object", properties: { order_id: { type: "string", description: "e.g. DF-SO-00249" }, customer_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } }, required: ["date"] },
    },
    {
      name: "confirm_stock_count",
      description: "Confirm a manual stock count: resets one SKU's figure at one warehouse to the counted quantity and time, and records who counted. Call it whenever someone gives a counted figure to confirm, whoever is signed in; the hook decides who may confirm.",
      input_schema: { type: "object", properties: { sku: SKU, warehouse: { type: "string", enum: ["WH-A", "WH-B"] }, qty: { type: "integer", minimum: 0 } }, required: ["sku", "warehouse", "qty"] },
    },
  ];

  const RESOURCE_LIST = [
    { uri: "policy://management", name: "Management Policy", file: "Management Policy.md", mimeType: "text/markdown" },
    { uri: "policy://sales", name: "Sales Policy", file: "Sales Policy.md", mimeType: "text/markdown" },
    { uri: "policy://finance", name: "Finance Policy", file: "Finance Policy.md", mimeType: "text/markdown" },
    { uri: "policy://warehouse", name: "Warehouse Policy", file: "Warehouse Policy.md", mimeType: "text/markdown" },
    { uri: "catalogue://products", name: "Product Catalogue", file: "Product Catalogue.md", mimeType: "text/markdown" },
    { uri: "directory://customers", name: "Customer Directory", file: "Customer Directory.md", mimeType: "text/markdown" },
  ];

  /**
   * createDesk(store, tables, opts): opts.now (Unix seconds, the step's clock), opts.faults (benchmark).
   * store: { get(name), set(name, value) }.
   */
  function createDesk(store, tables, opts) {
    const o = opts || {};
    const rules = R.createRules(tables);
    const backend = B.createBackend(store, rules, { now: o.now, faults: o.faults || {} });
    const env = { rules, store, now: o.now };
    const RUN = {
      check_stock: (s, i) => backend.stock(s, i.skus || [], i.warehouse, i.detail, i.date),
      retrieve_customer_account: (s, i) => backend.account(s, i.customer_id, i.view),
      retrieve_customer_prices: (s, i) => backend.prices(s, i.customer_id, i.skus),
      create_order: (s, i, p) => (p.mode === "escalate"
        ? backend.escalate(s, { customer_id: i.customer_id, summary: p.summary, rule: p.rule, request_id: p.request_id })
        : backend.createOrder(s, { customer_id: i.customer_id, request_id: p.request_id || i.request_id, confirmation_id: p.confirmation_id, summary: p.summary })),
      decide_escalation: (s, i, p) => backend.decide(s, { escalation_id: p.escalation.id, decision: i.decision, reason: i.reason }),
      schedule_delivery: (s, i, p) => backend.schedule(s, { order_id: p.order.id, date: p.date }),
      confirm_stock_count: (s, i) => backend.confirmCount(s, i),
    };

    function log(entry) { store.set("call_log", (store.get("call_log") || []).concat([entry])); }

    function call(name, input, staffId) {
      input = input || {};
      if (!RUN[name]) {
        const result = F.fail(name, "data_missing", `No tool named ${name}.`, { clause: "MP-10" });
        return { result, hook: { tool: name, input, staff: staffId, pre: { verdict: "block", checks: [] }, tool_ran: false, raw: null, post: [], result } };
      }
      const p = PRE.preToolUse(name, input, staffId, env);
      let hook;
      if (!p.allow) {
        hook = { tool: name, input, staff: staffId, pre: { verdict: "block", checks: p.checks, code: p.result.error.code, clause: p.result.error.clause },
                 tool_ran: false, raw: null, post: [], result: p.result };
      } else {
        const staff = rules.who(staffId);
        let raw;
        try { raw = RUN[name](staff, input, p); }
        catch (e) { if (!e.backend) throw e; raw = { backendRefusal: { code: e.code, message: e.message, data: e.data } }; }
        const post = POST.postToolUse(name, input, raw, staffId, env, p);
        hook = { tool: name, input, staff: staffId, pre: { verdict: "allow", checks: p.checks, plan: p.mode || null }, tool_ran: true, raw, post: post.changes, result: post.result };
      }
      if (!F.isShape(hook.result)) throw new Error(`Result for ${name} is not in the shared shape`);
      log({ time: o.now, staff: staffId, tool: name, input, status: hook.result.status, code: hook.result.error ? hook.result.error.code : null });
      return { result: hook.result, hook };
    }

    /** Desk button: Confirm summary (Sales Tier 02). Throws a back-end refusal for anyone else. */
    function confirm(staffId, input) { return backend.confirm(rules.who(staffId), input); }
    /** Desk buttons: Approve and Decline with reason, through the same tool, hooks and checks as the chat. */
    function decide(staffId, escalationId, decision, reason) {
      const e = (store.get("escalations") || []).find((x) => x.id === escalationId);
      return call("decide_escalation", { escalation_id: escalationId, customer_id: e ? e.customer : undefined, type: e ? e.type : undefined, decision, reason }, staffId);
    }
    /** The desk's views of the signed-in person's own records. */
    const notificationsFor = (staffId) => backend.notificationsFor(staffId);
    const escalationsFor = (staffId) => backend.escalationsFor(staffId);
    const draftsFor = (staffId) => (store.get("drafts") || []).filter((d) => d.created_by === staffId);

    return { tools: TOOLS, call, confirm, decide, notificationsFor, escalationsFor, draftsFor, rules, backend, env };
  }

  /** A store over plain objects (the staff desk, the tests). */
  function memoryStore(files) {
    const data = JSON.parse(JSON.stringify(files));
    return { get: (n) => data[n], set: (n, v) => { data[n] = v; }, dump: () => data };
  }

  return { TOOLS, RESOURCE_LIST, createDesk, memoryStore };
});
