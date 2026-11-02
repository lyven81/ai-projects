/* Cepat Express Customer Service: the agent loop, shared by the benchmark and the demo page.
 *
 * One customer message in, one reply out, on Claude Haiku 5.5 (founder, step D). The AI's job is narrow: understand
 * the customer, pick the tool, write at most two short sentences. Messages API by raw fetch, so the same file runs in
 * Node and the browser.
 *
 * Fixed outcomes are written in code in the approved wording and shown as they are, with no further model call: a
 * handover (escalate_case, S27), the chat lock (S6), and the no-access reply when nothing else succeeded (S4). Every
 * model-written reply is checked in code against the reply guide (replyFixes: two short sentences in one paragraph
 * with the clause line excluded, sentence length, the flag sentence, the word "pending", gendered pronouns, tool talk,
 * staff titles and routing words, the clause line) and sent back at most twice with the exact fix. A turn that ends in plain text with no tool call while the customer gave a tracking number is sent back
 * once, so the status is read before any answer. Limits stop a runaway turn: 2000 output tokens per call, 8 rounds.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CXAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MODEL = "claude-haiku-5-5";
  const LIMITS = { maxTokens: 2000, maxRounds: 8 };  // 900 cut C11 off mid-reply in the first full run (stop_reason max_tokens)
  const FALLBACK = "Sorry, I couldn't finish that. Please try again in a moment.";
  const SEND_BACK = "The customer gave a tracking number. Call get_shipment_status first so the reply comes from the record; then reply.";
  const PRONOUN = /\b(he|she|him|her|his|hers)\b/i;
  const TOOL_TALK = /\b(tool|get_shipment_status|verify_customer|get_parcel_details|escalate_case|function call|API)\b/i;
  const TRACKING = /\bCE\d{8}\b/i;
  const CLAUSE_LINE = /\n\s*Clause:\s*([^\n]+)\s*$/;

  /** The reply body; the clause line is not counted. "9:00 pm", "1 Sep" and "RM 5.00" are not sentence ends. */
  const body = (text) => String(text).replace(CLAUSE_LINE, "").trim();
  const clauses = (text) => { const m = String(text).match(CLAUSE_LINE); return m ? m[1].split(/[,\s]+/).filter(Boolean) : []; };
  const sentences = (text) => {
    const b = body(text);
    if (/[㐀-鿿]/.test(b)) return (b.match(/[。！？]/g) || []).length || 1;
    return (b.match(/[.!?](?=\s|$)/g) || []).length;
  };
  const longest = (text) => Math.max(0, ...body(text).split(/[.!?。！？](?=\s|$)/).map((s) => s.trim().split(/\s+/).filter(Boolean).length));

  // Staff titles, routing codes and internal labels stay in the handover note (reply guide, founder 2 Nov).
  const INTERNAL = /\b(Logistics Officer|Customer Service Lead|CS Lead|LG-(IPH|JHB|KLG)|CS-01|escalat\w*|handover|lane|routing|flag reason)\b/i;

  /** The reply rule for this turn's tool calls (reply guide, S29): { max, must, text }. */
  function replyRule(calls) {
    const okd = calls.filter((c) => c.result && c.result.status === "ok");
    const flagged = okd.find((c) => c.name === "get_shipment_status" && c.result.data && c.result.data.flag);
    if (flagged) {
      const f = flagged.result.data.flag.sentence;
      return { max: 2, must: f, text: `two short sentences: the latest status in everyday words, then exactly "${f}"` };
    }
    return { max: 2, must: null, text: "at most two short sentences in one paragraph: answer the question directly, then the next step if there is one" };
  }

  /** What a reply must fix before it is shown; [] when it keeps the rules. */
  function replyFixes(text, calls) {
    const rule = replyRule(calls), f = [];
    const b = body(text);
    if (!clauses(text).length) f.push('end with one line "Clause: " and the clause and status IDs you used');
    if (!/[.!?)"。！？]$/.test(b)) f.push("finish the reply; it stopped mid-sentence");
    if (/\n/.test(b)) f.push("write one paragraph, with no line breaks before the clause line");
    if (rule.must && !b.includes(rule.must)) f.push(`include this sentence exactly as it is: "${rule.must}"`);
    if (sentences(text) > rule.max) f.push(`keep it to ${rule.text}, keeping the clause line`);
    if (longest(text) > 30) f.push("keep each sentence short, under 30 words");
    if (/\bpending\b/i.test(b)) f.push("do not use the word pending; say what happens next");
    if (PRONOUN.test(b)) f.push("name people by name instead of he, she, him, her or his");
    if (TOOL_TALK.test(b)) f.push("never mention tools or tool calls");
    if (INTERNAL.test(b)) f.push("keep staff titles, routing and internal words out of the reply; say customer service or our local team");
    return f;
  }

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits }) -> { reply, trace, usage, sentBack, reworded, stoppedBy }
   *   messages: the conversation so far, ending with the new customer message (mutated)
   *   callTool: async (name, input) -> { result }
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const model = args.model || MODEL;
    const trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const tools = args.tools.map((t, i) => {
      const x = { name: t.name, description: t.description, input_schema: t.input_schema };
      return i === args.tools.length - 1 ? Object.assign(x, { cache_control: { type: "ephemeral" } }) : x;
    });
    const system = [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }];
    const lastUser = args.messages[args.messages.length - 1];
    const customerText = typeof lastUser.content === "string" ? lastUser.content : "";
    let sentBack = false, reworded = 0;
    const done = () => trace.filter((x) => x.type === "tool");
    const finish = (reply, stoppedBy) => {
      trace.push({ type: "reply", text: reply });
      return { reply, trace, usage, sentBack, reworded, stoppedBy, model };
    };

    for (let round = 0; round < limits.maxRounds; round++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": args.apiKey, "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model, max_tokens: limits.maxTokens, system, tools,
          tool_choice: { type: "auto", disable_parallel_tool_use: true }, messages: args.messages }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });

      const uses = data.content.filter((b) => b.type === "tool_use");
      if (!uses.length) {
        const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (!done().length && !sentBack && TRACKING.test(customerText)) {
          sentBack = true;
          trace.push({ type: "note", text: "Plain-text ending before the status was read: sent back once." });
          args.messages.push({ role: "user", content: SEND_BACK });
          continue;
        }
        const fixes = text ? replyFixes(text, done()) : ["write the reply"];
        if (fixes.length && reworded < 2) {  // sent back at most twice
          reworded++;
          trace.push({ type: "note", text: `Reply sent back: ${fixes.join("; ")}.` });
          args.messages.push({ role: "user", content: `Please write the reply again: ${fixes.join("; ")}. Keep the facts the same.` });
          continue;
        }
        if (fixes.length) trace.push({ type: "note", text: `Reply shown after two send-backs, still to fix: ${fixes.join("; ")}.` });
        return finish(text || FALLBACK, data.stop_reason);
      }

      const results = [];
      for (const u of uses) {
        const out = await args.callTool(u.name, u.input || {});
        trace.push({ type: "tool", name: u.name, input: u.input || {}, result: out.result });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out.result), is_error: out.result.status !== "ok" });
      }
      args.messages.push({ role: "user", content: results });

      // Fixed outcomes, written in code and shown as they are.
      const calls = done();
      const last = calls[calls.length - 1];
      const say = last && last.result.next_step && last.result.next_step.say;
      const handover = last && last.name === "escalate_case" && last.result.status === "ok";
      const locked = last && last.result.error && last.result.error.code === "locked";
      const noAccess = last && last.result.error && last.result.error.code === "not_verified" && !calls.some((c) => c.result.status === "ok");
      if (say && (handover || locked || noAccess)) {
        args.messages.push({ role: "assistant", content: [{ type: "text", text: say }] });
        trace.push({ type: "note", text: `Reply written in code (${handover ? "handover" : locked ? "locked" : "no access"}).` });
        return finish(say, "fixed_reply");
      }
    }
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    return finish(FALLBACK, "round_limit");
  }

  return { runTurn, replyRule, replyFixes, sentences, clauses, body, INTERNAL, MODEL, LIMITS, FALLBACK };
});
