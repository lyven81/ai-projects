/* Sang Kancil Specialist Clinic: the agent loop, shared by the benchmark and the staff page.
 *
 * One staff message in, one reply out, on Claude Haiku 5.5 (founder, D1). The first call of a turn asks for
 * tool_choice "any", so a request a tool covers reaches its hook; a model that refuses "any"
 * falls back to "auto"; the refusal is remembered per model, so later turns go
 * straight to "auto", and every turn that runs on "auto" is counted. A turn that ends in plain text without any tool call is sent
 * back once: call the tool if one covers the request, otherwise answer from the policy.
 * Tool results go back with is_error when the status is refused or error, so Claude follows next_step.
 * Limits stop a runaway turn: 900 output tokens per call, 8 tool rounds.
 * Reply length (founder, 22 Oct): a refusal to see data and an escalation are written in code (next_step.say) and
 * shown as they are, with no further model call. A read-only answer is one short sentence opening "Here it is";
 * any other reply is at most two short sentences. A reply over its limit, or using he or she, is sent back once.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SKAgent = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const LIMITS = { maxTokens: 900, maxToolRounds: 8 };
  const FALLBACK = "Sorry, I couldn't finish that. Please try again, or ask Nurul Huda.";
  const SEND_BACK = "If one of your tools covers this request, call it now so its checks run; never decide the outcome yourself. If no tool covers it, answer from the policy, citing the clause and naming who decides.";
  const AUTO_ONLY = new Set();
  // Replies name people by first name or role; a gendered pronoun sends the reply back once to be reworded.
  const PRONOUN = /\b(he|she|him|her|his|hers)\b/i;
  const REWORD = "use people's first names or roles instead of he, she, him, her, his or hers";
  // Reads that answer a question; the action list is not one of them (an item there is a follow-up).
  const AUTHORITY = new Set(["request_not_permitted", "not_prescriber", "not_owner", "booking_not_permitted", "tool_not_offered", "self_approval"]);
  const READS = new Set(["retrieve_patient_record", "find_patients", "check_schedule"]);
  /** The reply body; the Basis line is not counted. "RM 185.00" and "9:00am" are not sentence ends. */
  const body = (text) => String(text).split(/\n*\s*Basis:/)[0].trim();
  const sentences = (text) => (body(text).match(/[.!?](?=\s|$)/g) || []).length;
  const longest = (text) => Math.max(0, ...body(text).split(/[.!?](?=\s|$)/).map((s) => s.trim().split(/\s+/).filter(Boolean).length));
  /** The founder's reply rules for this turn's tool calls: { max sentences, required opening, wording }. */
  function replyRule(calls) {
    const ok = calls.filter((t) => t.result && (t.result.status === "ok" || t.result.status === "pending"));
    // Only a refusal about authority (who may do it) takes the decline-then-who form.
    if (!ok.length && calls.some((t) => t.result && t.result.status === "refused" && t.result.error && AUTHORITY.has(t.result.error.code)))
      return { max: 2, start: /^I'm sorry\b/, text: "two short sentences: \"I'm sorry, you can't ...\" naming what was asked, then \"Only <name>, <job title>, can ...\"; do not mention any tool call" };
    const readOnly = ok.length > 0 && calls.every((t) => READS.has(t.name) && t.result.status === "ok");
    return readOnly ? { max: 1, start: /^Here it is\b/, text: "one short sentence that opens with \"Here it is:\" and answers the question directly" }
      : { max: 2, start: null, text: "at most two short sentences: what was done or found, then the next step" };
  }
  // The founder's own wording for a recurring refusal, used exactly as written and not checked (22 Oct).
  const FIXED = new Set(["I can't book this one. Only Nurul Huda (clinic clerk, FD-02-01) enters appointments, so the booking goes to her."]);
  /** What a reply must fix before it is shown; [] when it keeps the rules. */
  function replyFixes(text, calls, self) {
    if (FIXED.has(body(text))) return [];
    const rule = replyRule(calls), f = [];
    if (self && body(text).includes(self.replace(/^Dr /, ""))) f.push("speak to the signed-in person as you; never name them");
    if (!/[.!?)"]$/.test(body(text))) f.push("finish the reply; it stopped mid-sentence");
    if (PRONOUN.test(text)) f.push(REWORD);
    if (sentences(text) > rule.max || (rule.start && !rule.start.test(text))) f.push(`keep it to ${rule.text}, keeping the Basis line as it is`);
    if (longest(text) > 30) f.push("keep each sentence short, under 30 words");
    if (/\bpending\b/i.test(body(text))) f.push("do not use the word pending; say what happens next");
    return f;
  }

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, limits, self })   self: the signed-in person's name
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
    let fallbacks = 0, sentBack = false, calledAny = false, reworded = 0;

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
        const fixes = text ? replyFixes(text, trace.filter((x) => x.type === "tool"), args.self) : [];
        if (fixes.length && reworded < 2) {  // sent back at most twice
          reworded++;
          trace.push({ type: "note", text: `Reply sent back once: ${fixes.join("; ")}.` });
          args.messages.push({ role: "user", content: `Please say that again: ${fixes.join("; ")}. Keep the facts the same.` });
          continue;
        }
        const reply = text || FALLBACK;
        trace.push({ type: "reply", text: reply });
        return { reply, trace, usage, fallbacks, sentBack, reworded, stoppedBy: data.stop_reason };
      }
      const results = [];
      for (const block of calls) {
        calledAny = true;
        const out = allowed.has(block.name)
          ? await args.callTool(block.name, block.input)
          : { result: { tool: block.name, status: "error", data: null, error: { code: "tool_not_offered", clause: "CP-11", message: `${block.name} is not offered on this sign-in.` }, next_step: null }, hook: null };
        trace.push({ type: "tool", name: block.name, input: block.input, result: out.result, hook: out.hook });
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out.result), is_error: out.result.status === "refused" || out.result.status === "error" });
      }
      args.messages.push({ role: "user", content: results });
      // A refusal to see data, or an escalation to another person, has its reply written in code: shown as it is.
      const done = trace.filter((x) => x.type === "tool");
      const last = done[done.length - 1];
      const say = last && last.result && last.result.next_step && last.result.next_step.say;
      // An escalation's sentence is used even after a read; a refusal's only when nothing else succeeded.
      if (say && (last.result.status === "pending" || last.result.status === "ok" || !done.some((x) => x.result && x.result.status === "ok"))) {
        args.messages.push({ role: "assistant", content: [{ type: "text", text: say }] });
        trace.push({ type: "note", text: `Reply written in code (${last.result.status === "pending" ? "escalation" : last.result.status === "ok" ? "instruction carried out" : "no access"}).` });
        trace.push({ type: "reply", text: say });
        return { reply: say, trace, usage, fallbacks, sentBack, reworded, stoppedBy: "fixed_reply" };
      }
    }
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    trace.push({ type: "reply", text: FALLBACK });
    return { reply: FALLBACK, trace, usage, fallbacks, sentBack, reworded, stoppedBy: "tool_round_limit" };
  }

  return { runTurn, LIMITS, sentences, replyRule, replyFixes, FIXED };
});
