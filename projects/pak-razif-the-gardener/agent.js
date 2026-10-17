/* Pak Razif Garden: the agent loop, shared by the benchmark and the demo page.
 *
 * One customer message in, one reply out. The loop runs while Claude asks for tools
 * (stop_reason "tool_use"), feeding each tool result back, and stops on "end_turn" or
 * when a limit is reached. Tool errors go back with is_error so Claude can follow the
 * error's category and message.
 *
 * Before a reply leaves, code checks its claims against this turn's tool results: a reply
 * that says a visit is booked, or that something was passed to Pak Razif, without the tool
 * that does it succeeding in this turn, is sent back once to be corrected (P9, P14, P33).
 * Limits stop a runaway turn: 700 output tokens per call, 8 tool rounds.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GardenAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { maxTokens: 700, maxToolRounds: 8 };
  const MODEL = "claude-sonnet-5-5";   // founder, 17 Oct: Sonnet 5.5
  const FALLBACK = "Sorry, I couldn't finish that. Please try again in a moment.";
  // "has been passed to Pak Razif", "I've forwarded your request to Pak Razif", "sent your photos to him".
  const FORWARD_CLAIM = /\b(I('ve| have)|has been|have been|was|were)\s+(\w+\s+){0,5}?(passed|forwarded|sent|handed)\b[^.?!]{0,60}\b(Pak Razif|him)\b/i;
  // "Your site visit is confirmed", "is booked for", "Your booking reference is".
  const BOOKING_CLAIM = /\b(visit|it|appointment)\s+(is|has been)\s+(now\s+)?(confirmed|booked)\b|\bbooking reference is\b/i;
  const CLOSES_CHAT = /I'll end the chat here/;

  function claimProblem(reply, calls) {
    const ok = (name) => calls.some((c) => c.name === name && c.result && c.result.ok);
    if (FORWARD_CLAIM.test(reply) && !ok("hand_to_pak_razif") && !ok("forward_photo"))
      return "Your reply says something was passed to Pak Razif, but neither hand_to_pak_razif nor forward_photo succeeded in this turn. If it should go to him, call the tool now; otherwise rewrite the reply without that claim.";
    if (BOOKING_CLAIM.test(reply) && !ok("book_site_visit"))
      return "Your reply says a visit is booked or confirmed, but book_site_visit did not succeed in this turn. Rewrite the reply without that claim.";
    return null;
  }

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits })
   *   messages: conversation so far, ending with the new user message (mutated: assistant and tool turns appended)
   *   callTool: async (name, input) -> result object ({ ok, ... })
   * Returns { reply, trace, usage, stoppedBy, endsChat }.
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const trace = [];
    const calls = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const tools = args.tools.map((t, i) =>
      i === args.tools.length - 1 ? Object.assign({}, t, { cache_control: { type: "ephemeral" } }) : t);
    let checked = false;

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
          model: args.model || MODEL, max_tokens: limits.maxTokens,
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

      if (data.stop_reason !== "tool_use") {
        const problem = claimProblem(text, calls);
        if (problem && !checked && round < limits.maxToolRounds) {
          // Sent back once; the customer never sees the unchecked reply.
          checked = true;
          trace.push({ type: "check", text: problem, draft: text });
          args.messages.push({ role: "user", content: `[Check by code, not from the customer] ${problem}` });
          continue;
        }
        const reply = problem ? FALLBACK : text;
        if (problem) { args.messages.pop(); args.messages.push({ role: "assistant", content: [{ type: "text", text: reply }] }); }
        trace.push({ type: "text", text: reply });
        return { reply, trace, usage, stoppedBy: problem ? "claim_check" : data.stop_reason, endsChat: CLOSES_CHAT.test(reply) };
      }
      if (text) trace.push({ type: "text", text });
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
        calls.push({ name: block.name, result });
        trace.push({ type: "tool", name: block.name, input: block.input, result });
        results.push({
          type: "tool_result", tool_use_id: block.id,
          content: JSON.stringify(result), is_error: result && result.ok === false,
        });
      }
      args.messages.push({ role: "user", content: results });
    }
    // Tool-round limit reached: answer safely instead of looping.
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    trace.push({ type: "text", text: FALLBACK });
    return { reply: FALLBACK, trace, usage, stoppedBy: "tool_round_limit", endsChat: false };
  }

  return { runTurn, LIMITS, MODEL, FORWARD_CLAIM, BOOKING_CLAIM, claimProblem };
});
