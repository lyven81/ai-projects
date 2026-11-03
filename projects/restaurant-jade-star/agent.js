/* Jade Star Chinese Dining 吉星饭厅: the agent loop, shared by the benchmark, the A2A server and the demo page.
 *
 * One guest or customer-agent message in, one reply out, on Claude Haiku 5.5 (founder, step D). The AI only chooses
 * which tool to call and writes the reply; every rule is in the booking module and the tools.
 *
 * Fixed replies are written in code and shown as they are, with no further model call: when the turn's last tool
 * result carries next_step.end (a handover done, not available, already held, not found), the reply is the greeting
 * (first reply only), the held-room sentence if a room was held earlier in the same turn, and that fixed sentence.
 * A refusal that names a handover reason must be followed by hand_to_manager; a plain-text ending without it is sent
 * back once.
 *
 * Every model-written reply is checked in code (replyFixes): the greeting on the first reply, at most two short
 * sentences after it, each under 30 words, no clause or room ID, no fee other than RM 100 and no payment taken, no
 * availability that no tool returned this turn, no booking called confirmed that was not, no tool talk. A failing reply
 * is sent back at most twice with the exact fix. Limits stop a runaway turn: 1200 output tokens per call, 8 rounds.
 * Messages API by raw fetch, so the same file runs in Node and the browser.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./hooks/post_tool_use.js"));
  else root.JSAgent = factory(root.JSPostToolUse);
})(typeof self !== "undefined" ? self : this, function (POST) {
  "use strict";

  const MODEL = "claude-haiku-5-5";
  const LIMITS = { maxTokens: 1200, maxRounds: 8 };
  const FALLBACK = "Sorry, I couldn't finish that. Please try again in a moment.";
  const GREETING = POST.GREETING;

  const CLAUSE_ID = /\b([PGKH]\d{1,2}|R[1-4])\b|\bclause\b/i;
  const ROOM_ID = /\bR(6|8|10)-[12]\b/;
  const TOOL_TALK = /\b(tool|check_availability|create_proposal|get_proposal_status|hand_to_manager|function|API|system prompt|next_step)\b/i;
  const GREET = /\b(welcome|hello|hi|good (morning|afternoon|evening)|thank you for (contacting|choosing|reaching))\b/i;
  const PAYMENT = /\b(deposit (is|will be) (taken|required|charged)|pay (now|online|in advance)|payment (now|link|upfront)|bank transfer|credit card)\b/i;
  const CONFIRMED_CLAIM = /\b(booking|reservation|room|table)\s+(is|has been|was)\s+(now\s+)?(confirmed|booked|reserved|secured)\b|\b(you're|you are)\s+(all\s+)?(set|confirmed|booked)\b|\bI('ve| have)\s+(confirmed|booked|reserved)\b|\bconfirmed (your|the) (booking|reservation)\b/i;
  const NEGATED = /\b(not|never|isn't|is not|until|once|only after|unless)\b/i;
  // A claim about one room or slot. "A late room is held for 15 minutes" states the policy and is not a claim (full run 1, case 5).
  const AVAIL_CLAIM = /\b(is|are)\s+(still\s+)?(available|free)\b|\bwe have (a|an|one|two) (room|private room)\b|\bheld for you\b/i;

  /** The reply body split into sentences; "10am", "RM 100" and "吉星饭厅." count normally. */
  const sentenceList = (text) => String(text).trim().split(/(?<=[.!?。！？])\s+/).map((s) => s.trim()).filter(Boolean);
  const words = (s) => s.split(/\s+/).filter(Boolean).length;

  /** What a model-written reply must fix before it is shown; [] when it keeps the rules. */
  function replyFixes(text, ctx) {
    const f = [];
    const b = String(text || "").trim();
    const calls = (ctx && ctx.calls) || [];
    const first = !!(ctx && ctx.first);
    const a2a = !!(ctx && ctx.route === "A2A agent");
    if (!b) return ["write the reply"];
    const ss = sentenceList(b);
    const greets = first && GREET.test(ss[0] || "") && /Jade Star/.test(ss[0] || "");
    if (first && !greets) f.push('open with one warm greeting sentence from Jade Star Chinese Dining 吉星饭厅, for example "Welcome to Jade Star Chinese Dining 吉星饭厅."');
    if (!first && GREET.test(ss[0] || "") && /Jade Star/.test(ss[0] || "")) f.push("do not greet again; answer directly");
    const body = greets ? ss.slice(1) : ss;
    if (body.length > 2) f.push(`keep it to at most two short sentences${first ? " after the greeting" : ""}`);
    if (body.some((s) => words(s) > 30)) f.push("keep each sentence short, under 30 words");
    if (!/[.!?)"。！？]$/.test(b)) f.push("finish the reply; it stopped mid-sentence");
    if (/\n/.test(b)) f.push("write one paragraph, with no line breaks or lists");
    if (CLAUSE_ID.test(b)) f.push("never cite a clause or rule number");
    if (ROOM_ID.test(b)) f.push("name rooms by name, never by ID");
    if (TOOL_TALK.test(b)) f.push("never mention tools, systems or functions");
    if (a2a && /\byour (phone|bill)\b|\bheld for you\b|\bcall you\b/i.test(b)) f.push("you are writing to the person's agent: say the person's phone, the bill, held for the person");
    const fees = (b.match(/RM\s?(\d+(?:\.\d+)?)/gi) || []).map((x) => Number(x.replace(/[^\d.]/g, "")));
    if (fees.some((x) => x !== 100) || /[$€£]\s?\d/.test(b)) f.push("the only fee is the RM 100 booking fee; state no other amount");
    if (PAYMENT.test(b)) f.push("nothing is paid at booking; the RM 100 fee is added to the bill at check-out");
    const okd = calls.filter((c) => c.result && c.result.status === "ok");
    const confirmedSeen = okd.some((c) => c.name === "get_proposal_status" && c.result.data && c.result.data.status === "confirmed");
    if (!confirmedSeen && ss.some((s) => CONFIRMED_CLAIM.test(s) && !NEGATED.test(s))) f.push("never say the booking is confirmed: say the room is held and the code has gone to the guest's phone");
    const availSeen = okd.some((c) => ["check_availability", "create_proposal", "get_proposal_status"].includes(c.name));
    if (!availSeen && ss.some((s) => AVAIL_CLAIM.test(s) && !/\bnot\b|n't\b/i.test(s))) f.push("check availability before saying a room is free or held");
    return f;
  }

  /** The fixed reply for a turn that ended on a result with next_step.end. */
  function fixedReply(calls, first) {  // the sentences arrive already worded for the route (PostToolUse)
    const parts = [];
    if (first) parts.push(GREETING);
    const last = calls[calls.length - 1];
    const held = calls.slice(0, -1).filter((c) => c.name === "create_proposal" && c.result.status === "ok").slice(-1)[0];
    if (held && last.name === "hand_to_manager") parts.push(held.result.next_step.say);
    parts.push(last.result.next_step.say);
    return parts.join(" ");
  }

  /**
   * runTurn({ apiKey, model, system, tools, messages, callTool, first, limits, fetchImpl }) -> { reply, trace, usage, reworded, sentBack, stoppedBy, fixesLeft, model }
   *   messages: the conversation so far, ending with the new message (mutated)
   *   callTool: async (name, input) -> { result }
   *   first:    true when this is the first reply of the conversation (the greeting)
   */
  async function runTurn(args) {
    const limits = Object.assign({}, LIMITS, args.limits || {});
    const model = args.model || MODEL;
    const doFetch = args.fetchImpl || fetch;
    const trace = [];
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    const tools = args.tools.map((t, i) => {
      const x = { name: t.name, description: t.description, input_schema: t.input_schema };
      return i === args.tools.length - 1 ? Object.assign(x, { cache_control: { type: "ephemeral" } }) : x;
    });
    const system = [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }];
    const first = !!args.first;
    let reworded = 0, sentBack = false;
    const calls = () => trace.filter((x) => x.type === "tool");
    const finish = (reply, stoppedBy, fixesLeft) => {
      trace.push({ type: "reply", text: reply, by: stoppedBy === "fixed_reply" ? "code" : "model" });
      return { reply, trace, usage, reworded, sentBack, stoppedBy, fixesLeft: fixesLeft || [], model };
    };

    for (let round = 0; round < limits.maxRounds; round++) {
      const res = await doFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": args.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({ model, max_tokens: limits.maxTokens, system, tools, tool_choice: { type: "auto", disable_parallel_tool_use: true }, messages: args.messages }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      Object.keys(usage).forEach((k) => (usage[k] += (data.usage && data.usage[k]) || 0));
      args.messages.push({ role: "assistant", content: data.content });

      const uses = data.content.filter((b) => b.type === "tool_use");
      if (!uses.length) {
        const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        const pending = calls().slice(-1)[0];
        const need = pending && pending.result.next_step && pending.result.next_step.reason;
        if (need && !sentBack) {
          sentBack = true;
          trace.push({ type: "note", text: `Ended without the handover the refusal needs: sent back once (${need}).` });
          args.messages.push({ role: "user", content: `That refusal needs a person: call hand_to_manager with reason ${need} and a one-line summary now. Write no reply yourself.` });
          continue;
        }
        const fixes = replyFixes(text, { first, route: args.route, calls: calls().map((c) => ({ name: c.name, result: c.result })) });
        if (fixes.length && reworded < 2) {
          reworded++;
          trace.push({ type: "note", text: `Reply sent back: ${fixes.join("; ")}.` });
          args.messages.push({ role: "user", content: `Please write the reply again: ${fixes.join("; ")}. Keep the facts the same.` });
          continue;
        }
        if (fixes.length) trace.push({ type: "note", text: `Reply shown after two send-backs, still to fix: ${fixes.join("; ")}.` });
        return finish(text || FALLBACK, data.stop_reason, fixes);
      }

      const results = [];
      for (const u of uses) {
        const out = await args.callTool(u.name, u.input || {});
        trace.push({ type: "tool", name: u.name, input: u.input || {}, result: out.result });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out.result), is_error: out.result.status !== "ok" });
      }
      args.messages.push({ role: "user", content: results });

      const last = calls().slice(-1)[0];
      if (last && last.result.next_step && last.result.next_step.end) {
        const reply = fixedReply(calls().map((c) => ({ name: c.name, result: c.result })), first);
        args.messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
        trace.push({ type: "note", text: "Reply written in code (fixed sentence)." });
        return finish(reply, "fixed_reply");
      }
    }
    args.messages.push({ role: "assistant", content: [{ type: "text", text: FALLBACK }] });
    return finish(FALLBACK, "round_limit", ["round limit"]);
  }

  return { runTurn, replyFixes, fixedReply, sentenceList, MODEL, LIMITS, FALLBACK, GREETING };
});
