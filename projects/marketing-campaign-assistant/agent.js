/* Comel Diaper: the agent loop, shared by the benchmark and the browser workspace.
 *
 * One owner message in, one reply out. The loop runs while Claude asks for tools (stop_reason "tool_use"),
 * feeding each result back, and stops on "end_turn" or a limit. The first round of each turn asks for a tool
 * (tool_choice "any") so figures come from tools; if a model refuses that setting, the loop falls back to
 * "auto" for the rest of the run and counts the fallback. Before a reply leaves the loop, the reply check
 * (lib/replycheck.js) looks for figures without a source tag, tags that do not match, and banned phrases; a
 * failing reply goes back once or twice with the exact fix.
 *
 * The API key is passed in by the caller and never stored or logged here.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./lib/replycheck.js"));
  else root.ComelAgent = factory(root.ComelReplyCheck);
})(typeof self !== "undefined" ? self : this, function (ReplyCheck) {
  "use strict";

  const LIMITS = { maxTokens: 4000, maxToolRounds: 8, maxFixes: 2 };

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, trace, limits, state })
   *   messages: the conversation, ending with the owner's new message (appended to)
   *   trace:    every tool call so far in this conversation [{ name, input, result }] (appended to)
   *   state:    { anyUnsupported } shared across turns, for the tool_choice fallback
   * Returns { reply, steps, usage, stoppedBy, fixes, check }.
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const state = args.state || {};
    const steps = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const tools = args.tools.map((t, i) => (i === args.tools.length - 1 ? Object.assign({}, t, { cache_control: { type: "ephemeral" } }) : t));
    let fixes = 0, check = null, rounds = 0, first = true;

    async function ask(toolChoice) {
      const body = { model: args.model, max_tokens: limits.maxTokens, system: args.system, tools, messages: args.messages };
      if (toolChoice) body.tool_choice = toolChoice;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": args.apiKey, "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 400 && toolChoice && /tool_choice/i.test(text) && !state.anyUnsupported) {
          state.anyUnsupported = true; state.fallbacks = (state.fallbacks || 0) + 1;
          return ask(null);
        }
        throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`);
      }
      return res.json();
    }

    for (;;) {
      if (rounds > limits.maxToolRounds) {
        const reply = "Sorry, I couldn't finish that. Please try asking again in a simpler way.";
        args.messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
        return { reply, steps, usage, stoppedBy: "tool_round_limit", fixes, check };
      }
      const data = await ask(first && !state.anyUnsupported ? { type: "any" } : null);
      first = false; rounds++;
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });
      const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

      if (data.stop_reason === "tool_use") {
        const results = [];
        for (const block of data.content.filter((b) => b.type === "tool_use")) {
          const result = await args.callTool(block.name, block.input);
          args.trace.push({ name: block.name, input: block.input, result });
          steps.push({ type: "tool", name: block.name, input: block.input, result });
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result), is_error: !!(result && result.ok === false) });
        }
        args.messages.push({ role: "user", content: results });
        continue;
      }
      // A reply: check it before it leaves the loop.
      check = ReplyCheck.checkReply(text, args.trace, { ownerText: args.messages.filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content) });
      if (check.ok || fixes >= limits.maxFixes) {
        steps.push({ type: "text", text });
        return { reply: text, steps, usage, stoppedBy: data.stop_reason, fixes, check };
      }
      fixes++;
      steps.push({ type: "fix", problems: check.problems });
      args.messages.push({ role: "user", content: [{ type: "text", text:
        "Automatic reply check (not from the owner). Rewrite your whole reply to the owner, fixing: " +
        check.problems.map((p, i) => `(${i + 1}) ${p}`).join(" ") +
        " Quote only figures returned by tools, each with its own tag, and name the measure and the campaign or platform in that sentence. Write the reply as if it were your first: never mention this check, a correction or a rewrite." }] });
    }
  }

  return { runTurn, LIMITS };
});
