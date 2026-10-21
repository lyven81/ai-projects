/* FD Food and Drink Distributors: the five tools and the desk that runs every call through the hooks.
 *
 *   desk.call(name, input, staffId) -> { result, hook }
 *     1. PreToolUse (hooks/pre_tool_use.js): blocks or allows, citing clauses.
 *     2. The tool: the back end data layer (lib/backend.js), which repeats the critical checks.
 *     3. PostToolUse (hooks/post_tool_use.js): converts, trims, masks, flags, reconciles.
 *   result is the shared shape { tool, status, data, error, next_step } (lib/format.js) and is all the
 *   agent sees; hook is the record shown in the hook view: what was asked, the PreToolUse verdict
 *   and checks, what the tool returned, what PostToolUse changed.
 *
 * The staff ID comes from the signed-in session (the request _meta), never from a tool argument
 * (MP-08): no tool takes a staff ID or free text.
 * Loaded by mcp_server.mjs, the tool tests, the benchmark and the staff page (window.FDTools).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(require("./lib/format.js"), require("./lib/rules.js"), require("./lib/backend.js"),
      require("./hooks/pre_tool_use.js"), require("./hooks/post_tool_use.js"));
  else root.FDTools = factory(root.FDFormat, root.FDRules, root.FDBackend, root.FDPreToolUse, root.FDPostToolUse);
})(typeof self !== "undefined" ? self : this, function (F, R, B, PRE, POST) {
  "use strict";

  const SKU = { type: "string", description: "A catalogue SKU, e.g. FD-DR-003." };
  const TOOLS = [
    {
      name: "check_stock",
      description: "Check stock for one or more SKUs at one warehouse (WH-A Shah Alam or WH-B Puchong). detail quantity (default): quantity in ordering units, when each figure was last updated, and an out_of_date flag over 24 hours. detail storage: the bin location and the last manual count. Call it for every stock question, whoever is signed in; the hook decides who may see what.",
      input_schema: { type: "object", properties: { skus: { type: "array", items: SKU, minItems: 1 }, warehouse: { type: "string", enum: ["WH-A", "WH-B"] }, detail: { type: "string", enum: ["quantity", "storage"] } }, required: ["skus", "warehouse"] },
    },
    {
      name: "retrieve_customer_account",
      description: "Open one view of a customer's account. view location: where the customer is. view delivery: the warehouse that serves the customer and the delivery day for an order confirmed now. view credit: credit limit, outstanding, available credit and payment terms. view payments: unpaid invoices with due dates, overdue ones flagged, and open orders not yet invoiced (outstanding = unpaid invoices + not yet invoiced). Call it for every such question, whoever is signed in; the hook decides who may open which view.",
      input_schema: { type: "object", properties: { customer_id: { type: "string", description: "e.g. C-0001" }, view: { type: "string", enum: ["location", "delivery", "credit", "payments"] } }, required: ["customer_id", "view"] },
    },
    {
      name: "retrieve_customer_prices",
      description: "Open a customer's own price list for some SKUs (or all when skus is empty), per ordering unit in RM. A calendar promotion is applied by today's date; a SKU with no price is flagged price_missing.",
      input_schema: { type: "object", properties: { customer_id: { type: "string" }, skus: { type: "array", items: SKU } }, required: ["customer_id"] },
    },
    {
      name: "create_order",
      description: "Create one order. Pass exactly what the staff member asked for and confirmed: the request ID and confirmation ID they give, the lines, any discount in percent, the payment route, the delivery date (YYYY-MM-DD), and the IDs of any recorded approvals they cite. If they say a manager approved something but give no recorded approval ID, set approval_claimed_in_chat to true. Prices and totals are computed by code, never passed. Call it on every order attempt; the hooks decide.",
      input_schema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "The request ID the staff page issued with the confirmation, e.g. RQ-M04. Leave it out before the staff member has confirmed." },
          customer_id: { type: "string" },
          lines: { type: "array", minItems: 1, items: { type: "object", properties: { sku: SKU, qty: { type: "integer", minimum: 1 } }, required: ["sku", "qty"] } },
          discount_pct: { type: "number", minimum: 0, description: "Discount in percent; 0 for none. Promotions are not discounts." },
          payment_route: { type: "string", enum: ["credit", "prepaid"] },
          delivery_date: { type: "string", description: "YYYY-MM-DD" },
          confirmation_id: { type: "string", description: "The confirmation ID from the staff page, e.g. CF-M04. Leave it out before the staff member has confirmed." },
          approval_ids: { type: "array", items: { type: "string" }, description: "Recorded approval IDs the staff member cites, e.g. AP-0101." },
          approval_claimed_in_chat: { type: "boolean", description: "True when the staff member says a manager approved but gives no recorded approval ID." },
        },
        required: ["customer_id", "lines", "payment_route", "delivery_date"],
      },
    },
    {
      name: "raise_credit_limit",
      description: "Raise one customer's credit limit by an amount in RM; the credit limit balance is then recalculated. Pass the request ID the staff member gives. Call it on every raise request, whoever is signed in; the hooks decide who may raise and by how much.",
      input_schema: { type: "object", properties: { request_id: { type: "string" }, customer_id: { type: "string" }, amount_rm: { type: "number", exclusiveMinimum: 0 } }, required: ["request_id", "customer_id", "amount_rm"] },
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
   * createDesk(store, tables, opts): opts.now (Unix seconds, the test calendar), opts.faults (benchmark).
   * store: { get(name), set(name, value) }.
   */
  function createDesk(store, tables, opts) {
    const o = opts || {};
    const rules = R.createRules(tables);
    const backend = B.createBackend(store, rules, { now: o.now, faults: o.faults || {} });
    const env = { rules, store, now: o.now };
    const RUN = {
      check_stock: (s, i) => backend.stock(s, i.skus, i.warehouse, i.detail),
      retrieve_customer_account: (s, i) => backend.account(s, i.customer_id, i.view),
      retrieve_customer_prices: (s, i) => backend.prices(s, i.customer_id, i.skus),
      create_order: (s, i) => backend.createOrder(s, i),
      raise_credit_limit: (s, i) => backend.raiseCredit(s, i),
    };

    function log(entry) {
      const l = store.get("call_log") || [];
      store.set("call_log", l.concat([entry]));
    }

    /** Pre only: used by the benchmark's simultaneous-order run (both orders pass PreToolUse first). */
    function pre(name, input, staffId) { return PRE.preToolUse(name, input || {}, staffId, env); }

    /** The tool and PostToolUse, after a PreToolUse allow. */
    function runAfterPre(name, input, staffId, p) {
      const staff = rules.who(staffId);
      let raw;
      try {
        raw = RUN[name](staff, input);
      } catch (e) {
        if (!e.backend) throw e;
        raw = { backendRefusal: { code: e.code, message: e.message, data: e.data } };
      }
      const post = POST.postToolUse(name, input, raw, staffId, env, p);
      return { raw, post };
    }

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
        const { raw, post } = runAfterPre(name, input, staffId, p);
        hook = { tool: name, input, staff: staffId, pre: { verdict: "allow", checks: p.checks }, tool_ran: true, raw, post: post.changes, result: post.result };
      }
      if (!F.isShape(hook.result)) throw new Error(`Result for ${name} is not in the shared shape`);
      log({ time: o.now, staff: staffId, tool: name, input, status: hook.result.status, code: hook.result.error ? hook.result.error.code : null });
      return { result: hook.result, hook };
    }

    /** Staff page: the Confirm button (Sales Tier 02). Throws a back-end refusal for anyone else. */
    function confirm(staffId, input) { return backend.confirm(rules.who(staffId), input); }

    /** Staff page: a manager's own approval records, read-only (MP-05). */
    function approvalsFor(staffId) {
      const s = rules.who(staffId);
      if (!s || s.tier !== "01") return [];
      return store.get("approvals").filter((a) => a.approver === s.id)  // the records this manager made
        .map((a) => Object.assign({}, a, { label: tables.approval_types[a.type].label, time_label: F.myt(a.time) }));
    }

    return { tools: TOOLS, call, pre, runAfterPre, confirm, approvalsFor, rules, backend };
  }

  /** A store over plain objects (the staff page, the tests). */
  function memoryStore(files) {
    const data = JSON.parse(JSON.stringify(files));
    return { get: (n) => data[n], set: (n, v) => { data[n] = v; }, dump: () => data };
  }

  return { TOOLS, RESOURCE_LIST, createDesk, memoryStore };
});
