/* FD Food and Drink Distributors: the agent loop, shared by the benchmark and the staff page.
 *
 * One staff message in, one reply out, on Claude Sonnet 5.5. The first call of a turn asks for
 * tool_choice "any", so a request a tool covers reaches its hook; a model that refuses "any"
 * (Sonnet 5.5 does) falls back to "auto"; the refusal is remembered per model, so later turns go
 * straight to "auto", and every turn that runs on "auto" is counted. A turn that ends in plain text without any tool call is sent
 * back once: call the tool if one covers the request, otherwise answer from the policy.
 * Tool results go back with is_error when the status is not ok, so Claude follows next_step.
 * Limits stop a runaway turn: 900 output tokens per call, 8 tool rounds.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FDAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { maxTokens: 900, maxToolRounds: 8 };
  const FALLBACK = "Sorry, I couldn't finish that. Please try again, or ask your manager.";
  const SEND_BACK = "If one of the five tools covers this request, call it now so its checks run; never decide the outcome yourself. If no tool covers it, answer from the policy, citing the clause and naming who does it.";
  const AUTO_ONLY = new Set();
  const ACCESS = new Set(["department_not_permitted", "tier_not_permitted", "customer_not_assigned"]);
  const SHORTEN = "Please say that again in one sentence: the greeting, what is not open to them, and that nothing was placed or changed. Nothing more.";
  // Replies name people by first name or role; a gendered pronoun sends the reply back once to be reworded.
  const PRONOUN = /\b(he|she|him|her|his|hers)\b/i;
  const REWORD = "Please say that again using people's first names or roles instead of he, she, him, her, his or hers. Keep everything else the same.";

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits })
   *   messages: the conversation so far, ending with the new staff message (mutated)
   *   callTool: async (name, input) -> { result, hook }
   * Returns { reply, trace, usage, fallbacks, sentBack, reworded, shortened, stoppedBy }.
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const allowed = new Set(args.tools.map((t) => t.name));
    const tools = args.tools.map((t, i) => {
      const x = { name: t.name, description: t.description, input_schema: t.input_schema };
      return i === args.tools.length - 1 ? Object.assign(x, { cache_control: { type: "ephemeral" } }) : x;
    });
    let fallbacks = 0, sentBack = false, calledAny = false, reworded = 0, shortened = 0;

    const call = (choice) => fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: args.model, max_tokens: limits.maxTokens, system: args.system,
        tools, tool_choice: { type: choice, disable_parallel_tool_use: true }, messages: args.messages,
      }),
    });

    for (let round = 0; round < limits.maxToolRounds; round++) {
      const want = round === 0 && !AUTO_ONLY.has(args.model) ? "any" : "auto";
      let res = await call(want);
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 400 && /tool_choice/.test(body) && want === "any") {
          AUTO_ONLY.add(args.model);
          fallbacks++;
          res = await call("auto");
          if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
        } else throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      } else if (round === 0 && AUTO_ONLY.has(args.model)) fallbacks++;
      const data = await res.json();
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });

      const calls = data.content.filter((b) => b.type === "tool_use");
      if (!calls.length) {
        const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!calledAny && !sentBack) {
          // A plain-text ending with no tool call: sent back once, so a covered request reaches its hook.
          sentBack = true;
          trace.push({ type: "note", text: "Plain-text ending with no tool call: sent back once." });
          args.messages.push({ role: "user", content: SEND_BACK });
          continue;
        }
        if (text && PRONOUN.test(text) && !reworded) {
          reworded = 1;
          trace.push({ type: "note", text: "Reply used he or she: sent back once to name people instead." });
          args.messages.push({ role: "user", content: REWORD });
          continue;
        }
        // A refusal about who is asking is one sentence: a longer reply is sent back once to be shortened.
        const lastTool = trace.filter((t) => t.type === "tool").pop();
        const lastCode = lastTool && lastTool.result && lastTool.result.error ? lastTool.result.error.code : null;
        if (text && ACCESS.has(lastCode) && (text.match(/[.!?](\s|$)/g) || []).length > 1 && !shortened) {
          shortened = 1;
          trace.push({ type: "note", text: "A refusal about who is asking ran past one sentence: sent back once to be shortened." });
          args.messages.push({ role: "user", content: SHORTEN });
          continue;
        }
        const reply = text || FALLBACK;
        trace.push({ type: "reply", text: reply });
        return { reply, trace, usage, fallbacks, sentBack, reworded, shortened, stoppedBy: data.stop_reason };
      }
      const results = [];
      for (const block of calls) {
        calledAny = true;
        const out = allowed.has(block.name)
          ? await args.callTool(block.name, block.input)
          : { result: { tool: block.name, status: "error", data: null, error: { code: "data_missing", clause: "MP-10", message: `No tool named ${block.name}.` }, next_step: null }, hook: null };
        trace.push({ type: "tool", name: block.name, input: block.input, result: out.result, hook: out.hook });
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result), is_error: out.result.status !== "ok" });
      }
      args.messages.push({ role: "user", content: results });
    }
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    trace.push({ type: "reply", text: FALLBACK });
    return { reply: FALLBACK, trace, usage, fallbacks, sentBack, reworded, shortened, stoppedBy: "tool_round_limit" };
  }

  return { runTurn, LIMITS };
});
