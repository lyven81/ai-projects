/* Wee Auto Car Care: the agent loop, shared by the benchmark and the browser demo.
 *
 * One customer message in, one reply out. The loop runs while Claude asks for
 * tools (stop_reason "tool_use"), feeding each tool result back, and stops on
 * "end_turn" or when a limit is reached. Tool errors go back with is_error so
 * Claude can follow the error's category and message.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WeeAutoAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { maxTokens: 600, maxToolRounds: 6 };

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits })
   *   messages: conversation so far, ending with the new user message (mutated: assistant and tool turns appended)
   *   callTool: async (name, input) -> result object ({ ok, ... })
   * Returns { reply, trace, usage, stoppedBy }.
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const tools = args.tools.map((t, i) =>
      i === args.tools.length - 1 ? Object.assign({}, t, { cache_control: { type: "ephemeral" } }) : t);

    for (let round = 0; round <= limits.maxToolRounds; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": args.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: args.model, max_tokens: limits.maxTokens,
          system: args.system, tools, messages: args.messages,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });

      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      if (text) trace.push({ type: "text", text });

      if (data.stop_reason !== "tool_use") {
        return { reply: text, trace, usage, stoppedBy: data.stop_reason };
      }
      const results = [];
      if (round === limits.maxToolRounds) {
        // Close every open tool call so the conversation stays valid, then stop.
        for (const block of data.content.filter((b) => b.type === "tool_use"))
          results.push({ type: "tool_result", tool_use_id: block.id, is_error: true,
            content: JSON.stringify({ ok: false, error: { category: "limit", retryable: false, message: "Tool-round limit reached." } }) });
        args.messages.push({ role: "user", content: results });
        break;
      }
      for (const block of data.content.filter((b) => b.type === "tool_use")) {
        const result = await args.callTool(block.name, block.input);
        trace.push({ type: "tool", name: block.name, input: block.input, result });
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: JSON.stringify(result), is_error: result && result.ok === false,
        });
      }
      args.messages.push({ role: "user", content: results });
    }
    // Tool-round limit reached: answer safely instead of looping.
    const reply = "Sorry, I couldn't finish that. Please try again, or ask to speak to our staff.";
    args.messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
    trace.push({ type: "text", text: reply });
    return { reply, trace, usage, stoppedBy: "tool_round_limit" };
  }

  return { runTurn, LIMITS };
});
