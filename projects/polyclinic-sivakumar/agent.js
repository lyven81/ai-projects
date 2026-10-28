/* Polyclinic Sivakumar: the agent loop, shared by the benchmark and the three pages.
 *
 * One staff message in, one reply out, on Claude Haiku 5.5 (founder decisions, final check 8). The first call of a
 * turn asks for tool_choice "any", so a request a tool covers reaches its hook; a model that refuses
 * "any" falls back to "auto"; the refusal is remembered per model, and every turn on "auto" is counted.
 * A turn that ends in plain text without any tool call is sent back once.
 * Tool results go back with is_error when the status is refused or error, so Claude follows next_step.
 * Limits stop a runaway turn: 900 output tokens per call, 8 tool rounds.
 * Replies (access-level reply rule, founder 22 Oct): a handover sent, an answer recorded and a refusal
 * about who is asking have their reply written in code (next_step.say) and shown as they are, with no
 * further model call. A read-only answer is one short sentence opening "Here it is";
 * any other reply is at most two short sentences; the checks send a reply back at most twice with the
 * exact fix. Code adds the Basis line under every reply, from the last result that carries one.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PSAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { maxTokens: 900, maxToolRounds: 8 };
  const FALLBACK = "Sorry, I couldn't finish that. Please try again, or ask Dr Sivakumar.";
  const SEND_BACK = "If one of your tools covers this request, call it now so its checks run; never decide the outcome yourself. If no tool covers it, answer from the policy, naming who does it.";
  const AUTO_ONLY = new Set();
  const PRONOUN = /\b(he|she|him|her|his|hers)\b/i;
  // Read-only actions: the reply is one sentence opening "Here it is:".
  const READS = new Set(["patient.find", "schedule.view_queue", "dispense.view_stock", "billing.view_bill", "billing.view_payments",
    "billing.view_owner_review", "billing.view_panel_bills", "documents.list", "tasks.list"]);
  /** The reply body; the Basis line is not counted. "RM 3,960.00" and "10:30" are not sentence ends. */
  const body = (text) => String(text).split(/\n*\s*Basis:/)[0].trim();
  const sentences = (text) => (body(text).match(/[.!?](?=\s|$)/g) || []).length;
  const longest = (text) => Math.max(0, ...body(text).split(/[.!?](?=\s|$)/).map((s) => s.trim().split(/\s+/).filter(Boolean).length));
  /** The reply rule for this turn's tool calls: { max sentences, required opening, wording }. */
  function replyRule(calls) {
    const ok = calls.filter((t) => t.result && t.result.status === "ok");
    const readOnly = ok.length > 0 && calls.every((t) => READS.has(`${t.name}.${t.input && t.input.action}`) && t.result.status === "ok");
    return readOnly ? { max: 1, start: /^Here it is\b/, text: "one short sentence that opens with \"Here it is:\" and answers the question directly" }
      : { max: 2, start: null, text: "at most two short sentences: what was done or found, then the next step" };
  }
  /** What a reply must fix before it is shown; [] when it keeps the rules. */
  function replyFixes(text, calls, self) {
    const rule = replyRule(calls), f = [], b = body(text);
    // The full name or its first two words ("Dr Sivakumar", "Ms Yong", "Siti Kasim").
    if (self && (b.includes(self) || b.includes(self.split(" ").slice(0, 2).join(" ")))) f.push("speak to the signed-in person as you; never name them");
    if (!/[.!?)"]$/.test(b)) f.push("finish the reply; it stopped mid-sentence");
    if (PRONOUN.test(b)) f.push("use people's first names or roles instead of he, she, him, her, his or hers");
    const decline = /^I'm sorry\b/.test(b);
    if (decline ? sentences(text) > 2 : sentences(text) > rule.max || (rule.start && !rule.start.test(b))) f.push(`keep it to ${decline ? "at most two short sentences" : rule.text}`);
    if (longest(text) > 30) f.push("keep each sentence short, under 30 words");
    if (/\bpending\b/i.test(b)) f.push("do not use the word pending; say what happens next");
    if (/\bBasis:/.test(text)) f.push("leave out the Basis line; code adds it");
    return f;
  }
  const withBasis = (text, calls) => {
    const last = calls.filter((t) => t.result && t.result.next_step && t.result.next_step.basis).pop();
    return last ? `${text}\nBasis: ${last.result.next_step.basis}` : text;
  };

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits, self })   self: the signed-in person's full name
   *   messages: the conversation so far, ending with the new staff message (mutated)
   *   callTool: async (name, input) -> { result, hook }
   * Returns { reply, trace, usage, fallbacks, sentBack, reworded, stoppedBy }.
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
    let fallbacks = 0, sentBack = false, calledAny = false, reworded = 0, cutOff = false;

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
        const b = await res.text();
        if (res.status === 400 && /tool_choice/.test(b) && want === "any") {
          AUTO_ONLY.add(args.model);
          fallbacks++;
          res = await call("auto");
          if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
        } else throw new Error(`Anthropic API ${res.status}: ${b.slice(0, 300)}`);
      } else if (round === 0 && AUTO_ONLY.has(args.model)) fallbacks++;
      const data = await res.json();
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });

      const calls = data.content.filter((b) => b.type === "tool_use");
      // A reply cut off by the output limit, with no tool call: sent back once to say it again briefly.
      if (!calls.length && data.stop_reason === "max_tokens" && !cutOff) {
        cutOff = true;
        trace.push({ type: "note", text: "Reply cut off by the output limit: sent back once." });
        args.messages.push({ role: "user", content: "Your reply was cut off. Say it again in at most two short sentences." });
        continue;
      }
      if (!calls.length) {
        const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!calledAny && !sentBack) {
          sentBack = true;
          trace.push({ type: "note", text: "Plain-text ending with no tool call: sent back once." });
          args.messages.push({ role: "user", content: SEND_BACK });
          continue;
        }
        const done = trace.filter((x) => x.type === "tool");
        const fixes = text ? replyFixes(text, done, args.self) : [];
        if (fixes.length && reworded < 2) {  // sent back at most twice
          reworded++;
          trace.push({ type: "note", text: `Reply sent back: ${fixes.join("; ")}.` });
          args.messages.push({ role: "user", content: `Please say that again: ${fixes.join("; ")}. Keep the facts the same.` });
          continue;
        }
        const reply = withBasis(body(text || FALLBACK), done);
        trace.push({ type: "reply", text: reply });
        return { reply, trace, usage, fallbacks, sentBack, reworded, stoppedBy: data.stop_reason };
      }
      const results = [];
      for (const block of calls) {
        calledAny = true;
        const out = allowed.has(block.name)
          ? await args.callTool(block.name, block.input)
          : { result: { tool: block.name, status: "error", data: null, error: { code: "data_missing", clause: "PS-RP-01", message: `No tool named ${block.name}.` }, next_step: null }, hook: null };
        trace.push({ type: "tool", name: block.name, input: block.input, result: out.result, hook: out.hook });
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result), is_error: out.result.status === "refused" || out.result.status === "error" });
      }
      args.messages.push({ role: "user", content: results });
      // A fixed outcome has its reply written in code: shown as it is, with no further model call.
      const done = trace.filter((x) => x.type === "tool");
      const last = done[done.length - 1];
      const say = last && last.result && last.result.next_step && last.result.next_step.say;
      if (say && (last.result.status !== "refused" || !done.some((x) => x.result && x.result.status === "ok"))) {
        const reply = `${say}\nBasis: ${last.result.next_step.basis}`;
        args.messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
        trace.push({ type: "note", text: `Reply written in code (${last.result.status === "ok" ? "handover sent or answer recorded" : "refusal about who is asking"}).` });
        trace.push({ type: "reply", text: reply });
        return { reply, trace, usage, fallbacks, sentBack, reworded, stoppedBy: "fixed_reply" };
      }
    }
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    trace.push({ type: "reply", text: FALLBACK });
    return { reply: FALLBACK, trace, usage, fallbacks, sentBack, reworded, stoppedBy: "tool_round_limit" };
  }

  return { runTurn, LIMITS, sentences, replyRule, replyFixes, body };
});
