/* Subang Badminton Arena: the agent loop, shared by the benchmark and the player chat page.
 *
 * One player message in, one reply out. Claude must call a tool on every step
 * (tool_choice "any"); the turn ends when it calls reply_to_player, whose result
 * (the message plus the citation line built by code) is the reply the player sees.
 * Tool errors go back with is_error so Claude can follow the error's category and message.
 * Limits stop a runaway turn: 700 output tokens per call, 8 tool rounds.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BadmintonAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { maxTokens: 700, maxToolRounds: 8 };
  const FALLBACK = "Sorry, I couldn't finish that. Please try again, or ask to speak to our staff.";
  const USE_REPLY_TOOL = "Send that reply through reply_to_player (with policy_case and clause_ids), as every reply must.";
  // Models that refuse a forced tool choice run on "auto"; a plain-text ending is then sent back once.
  const AUTO_ONLY = new Set();

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits })
   *   messages: conversation so far, ending with the new user message (mutated: assistant and tool turns appended)
   *   callTool: async (name, input) -> result object ({ ok, ... })
   * Returns { reply, citationLine, citations, trace, usage, stoppedBy }.
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const allowed = new Set(args.tools.map((t) => t.name));
    const tools = args.tools.map((t, i) =>
      i === args.tools.length - 1 ? Object.assign({}, t, { cache_control: { type: "ephemeral" } }) : t);

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
    let nudged = false;
    for (let round = 0; round < limits.maxToolRounds; round++) {
      let res = await call(AUTO_ONLY.has(args.model) ? "auto" : "any");
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 400 && /tool_choice/.test(body) && !AUTO_ONLY.has(args.model)) {
          AUTO_ONLY.add(args.model);
          res = await call("auto");
          if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
        } else throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });

      const calls = data.content.filter((b) => b.type === "tool_use");
      if (!calls.length) {
        // A plain-text ending (possible on "auto"): send it back once to go through reply_to_player.
        if (!nudged) {
          nudged = true;
          trace.push({ type: "note", text: "Plain-text ending sent back: replies go through reply_to_player." });
          args.messages.push({ role: "user", content: USE_REPLY_TOOL });
          continue;
        }
        args.messages.push({ role: "user", content: "Continue." });
        args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
        trace.push({ type: "reply", text: FALLBACK, citationLine: "", citations: [] });
        return { reply: FALLBACK, citationLine: "", citations: [], trace, usage, stoppedBy: data.stop_reason };
      }
      const results = [];
      let final = null;
      for (const block of calls) {
        const result = allowed.has(block.name)
          ? await args.callTool(block.name, block.input)
          : { ok: false, error: { category: "unknown_tool", retryable: false, message: `No tool named ${block.name}.` } };
        trace.push({ type: "tool", name: block.name, input: block.input, result });
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result), is_error: result && result.ok === false });
        if (block.name === "reply_to_player" && result.ok) final = result;
      }
      args.messages.push({ role: "user", content: results });
      if (final) {
        // The reply the player sees is the tool's output; record it as the assistant's turn.
        const shown = final.reply + (final.citation_line ? "\n\n" + final.citation_line : "");
        args.messages.push({ role: "assistant", content: [{ type: "text", text: shown }] });
        trace.push({ type: "reply", text: final.reply, citationLine: final.citation_line, citations: final.citations, notCovered: final.not_covered });
        return { reply: final.reply, citationLine: final.citation_line, citations: final.citations, trace, usage, stoppedBy: "reply_to_player" };
      }
    }
    // Limit reached without a reply: answer safely instead of looping.
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    trace.push({ type: "reply", text: FALLBACK, citationLine: "", citations: [] });
    return { reply: FALLBACK, citationLine: "", citations: [], trace, usage, stoppedBy: "tool_round_limit" };
  }

  return { runTurn, LIMITS };
});
