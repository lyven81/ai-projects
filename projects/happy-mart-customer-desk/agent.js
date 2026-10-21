/* Happy Mart routing agent: the agent loop, run for the router and, inside ask_specialist, for each
 * specialist as a sub-agent, and for the synthesis agent. Shared by the benchmark, the MCP server host
 * and the customer desk.
 *
 * Built on the FD loop (Messages API, raw fetch so the same file runs in Node and the browser). Sonnet 5.5
 * rejects a forced tool_choice, so the router and specialists run on "auto" with a send-back: a turn that
 * ends in plain text without its closing tool (send_reply, submit_answer) is sent back once. The synthesis
 * agent runs on Haiku 5.5 with thinking off and write_reply forced; a 400 on the forced choice falls back to
 * "auto". Assistant content goes back unchanged, thinking blocks included. A sub-agent sees only the
 * hand-off block the router passes; everything comes back through the router. A specialist that runs past
 * the 20-second limit is stopped (signal.aborted) and reported by ask_specialist as specialist_timeout.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./prompts.js"));
  else root.HMAgent = factory(root.HMPrompts);
})(typeof self !== "undefined" ? self : this, function (PR) {
  "use strict";

  const MODELS = { router: "claude-sonnet-5-5", specialist: "claude-sonnet-5-5", synthesis: "claude-haiku-5-5" };
  const EFFORT = { router: "medium", specialist: "low", synthesis: "low" };
  const LIMITS = { maxTokens: 4000, routerRounds: 12, specialistRounds: 8 };
  const FALLBACK = "Sorry, I could not finish that. Please try again in a moment.";
  const FORCED_REFUSED = new Set();
  const PRONOUN = /\b(he|she|him|her|his|hers)\b/i;
  const FIRST_PERSON = /\b(I|I'm|I've|I'll|I'd|me|my|mine|myself)\b/;

  /**
   * loop({ apiKey, model, effort, system, tools, messages, callTool, maxRounds, closing, sendBack, forced, thinkingOff,
   *        parallel, signal, usage }) -> { closed, calls }
   *   callTool(name, input) -> Promise<{ result }>; closing(name, result) -> true when the agent's work is done.
   */
  async function loop(a) {
    const tools = a.tools.map((t, i) => Object.assign({ name: t.name, description: t.description, input_schema: t.input_schema },
      i === a.tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}));
    const system = [{ type: "text", text: a.system, cache_control: { type: "ephemeral" } }];
    let sentBack = false, calls = 0;
    const request = (choice) => {
      const body = { model: a.model, max_tokens: LIMITS.maxTokens, system, tools, messages: a.messages,
        tool_choice: Object.assign({}, choice, { disable_parallel_tool_use: !a.parallel }) };
      if (a.thinkingOff) body.thinking = { type: "disabled" };
      if (a.effort) body.output_config = { effort: a.effort };
      return fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": a.apiKey, "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify(body),
      });
    };
    for (let round = 0; round < a.maxRounds; round++) {
      if (a.signal && a.signal.aborted) return { closed: false, calls, aborted: true };
      const want = a.forced && !FORCED_REFUSED.has(a.model) ? { type: "tool", name: a.forced } : { type: "auto" };
      let res = await request(want);
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 400 && /tool_choice/.test(body) && want.type === "tool") {
          FORCED_REFUSED.add(a.model);
          res = await request({ type: "auto" });
          if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
        } else throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      if (a.usage) for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) a.usage[k] = (a.usage[k] || 0) + ((data.usage && data.usage[k]) || 0);
      if (a.signal && a.signal.aborted) return { closed: false, calls, aborted: true };
      a.messages.push({ role: "assistant", content: data.content });
      const uses = data.content.filter((b) => b.type === "tool_use");
      if (!uses.length) {
        if (!sentBack && a.sendBack) {
          sentBack = true;
          a.messages.push({ role: "user", content: a.sendBack });
          continue;
        }
        return { closed: false, calls, text: data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n") };
      }
      // Consecutive ask_specialist calls run together; everything else in order.
      const results = new Array(uses.length);
      let closed = false;
      for (let i = 0; i < uses.length;) {
        let j = i + 1;
        if (uses[i].name === "ask_specialist") while (j < uses.length && uses[j].name === "ask_specialist") j++;
        const batch = await Promise.all(uses.slice(i, j).map((u) => a.callTool(u.name, u.input || {})));
        batch.forEach((out, k) => {
          const u = uses[i + k];
          calls++;
          results[i + k] = { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out.result), is_error: out.result.status !== "ok" };
          if (a.closing(u.name, out.result, u.input)) closed = true;
        });
        i = j;
      }
      a.messages.push({ role: "user", content: results });
      if (closed) return { closed: true, calls };
    }
    return { closed: false, calls, roundLimit: true };
  }

  /**
   * createAgents({ apiKey, desk, resources, models, effort }) -> { runTurn, runSpecialist, runSynthesis }
   *   resources: [{ for, text }] from tables.resources with their file text.
   *   The desk must be created with runSpecialist and runSynthesis from here (see wire()).
   */
  function createAgents(cfg) {
    const models = Object.assign({}, MODELS, cfg.models || {});
    const effort = Object.assign({}, EFFORT, cfg.effort || {});
    const usage = {};
    const routerSystem = PR.routerSystem(cfg.resources);
    const specialistSystems = {};

    async function runSpecialist(department, handoff, session, signal) {
      const desk = cfg.desk();
      const sys = specialistSystems[department] || (specialistSystems[department] = PR.specialistSystem(department, cfg.resources));
      let answer = null;
      const messages = [{ role: "user", content: PR.handoffText(department, handoff) }];
      await loop({ apiKey: cfg.apiKey, model: models.specialist, effort: effort.specialist, system: sys, tools: desk.toolsFor(department), messages,
        maxRounds: LIMITS.specialistRounds, signal, usage,
        callTool: (name, input) => (signal.aborted ? Promise.resolve({ result: { status: "error", error: { code: "aborted" } } }) : desk.call(session, department, name, input)),
        closing: (name, result, input) => { if (name === "submit_answer" && result.status === "ok") { answer = input; return true; } return false; },
        sendBack: "Finish with submit_answer: your points with clauses from your own policy, or status handover or error." });
      return { answer };
    }

    async function runSynthesis(content) {
      const desk = cfg.desk();
      let out = null;
      const messages = [{ role: "user", content: "Content for the reply:\n" + JSON.stringify(content, null, 1) }];
      await loop({ apiKey: cfg.apiKey, model: models.synthesis, effort: effort.synthesis, system: PR.SYNTHESIS_SYSTEM, tools: desk.toolsFor("synthesis"), messages,
        maxRounds: 3, forced: "write_reply", thinkingOff: true, usage,
        callTool: async (name, input) => { out = input; return { result: { status: "ok" } }; },
        closing: (name) => name === "write_reply", sendBack: "Call write_reply with the reply." });
      // The paragraphs are joined in code: one string per paragraph, so a paragraph is never split or merged by the writer.
      // Each string is matched to its question by the clause IDs it cites; strings for the same question are joined, a string
      // with no clause stays with the one before it, and the handover sentences are one last paragraph.
      const groups = (content.paragraphs || []).map((g) => new Set(g.points.flatMap((p) => p.clauses)));
      const join = (o) => {
        if (!o || !Array.isArray(o.paragraphs)) return o;
        const parts = o.paragraphs.map((x) => String(x).replace(/\s*\n+\s*/g, " ").trim()).filter(Boolean);
        const out = [], at = new Map();
        let last = null, tail = [];
        for (const t of parts) {
          if ((content.handover_sentences || []).some((h) => t.includes(h))) { tail.push(t); continue; }
          const ids = t.match(/\b(CS|FP|RP|FN|QP|MP)\d\b/g) || [];
          let gi = groups.findIndex((g) => ids.some((id) => g.has(id)));
          if (gi < 0) gi = last;
          if (gi === null || gi < 0) { if (out.length) out[out.length - 1].push(t); else out.push([t]); continue; }
          if (!at.has(gi)) { at.set(gi, out.length); out.push([]); }
          out[at.get(gi)].push(t);
          last = gi;
        }
        if (tail.length) out.push(tail);
        o.text = out.map((p) => p.join(" ")).join("\n\n");
        return o;
      };
      join(out);
      if (!out || typeof out.text !== "string") throw new Error("The synthesis agent returned no reply");
      // Staff are named by name or job title: a gendered pronoun outside the store manager's own sentence is sent back once (as FD).
      const own = (content.handover_sentences || []).reduce((t, h) => t.split(h).join(" "), out.text);
      // Happy Mart speaks as a company: I, me or my is sent back once too, to be written as we (founder, 21 Oct).
      if (PRONOUN.test(own) || FIRST_PERSON.test(own)) {
        messages.push({ role: "user", content: "Write the reply again: name staff by name or job title instead of he, she, him, her or his, and write as the company with we, us and our instead of I, me or my. Keep everything else the same. Call write_reply." });
        const first = out;
        await loop({ apiKey: cfg.apiKey, model: models.synthesis, effort: effort.synthesis, system: PR.SYNTHESIS_SYSTEM, tools: desk.toolsFor("synthesis"), messages,
          maxRounds: 2, forced: "write_reply", thinkingOff: true, usage,
          callTool: async (name, input) => { out = input; return { result: { status: "ok" } }; }, closing: (name) => name === "write_reply" });
        join(out);
        if (!out || typeof out.text !== "string") out = first;
      }
      return { text: out.text, clauses: Array.isArray(out.clauses) ? out.clauses : [] };
    }

    /** One customer message through the router. session.messages holds the router conversation across turns. */
    async function runTurn(session, message) {
      const desk = cfg.desk();
      const turn = desk.beginTurn(session, message);
      session.messages = session.messages || [];
      session.messages.push({ role: "user", content: message });
      const before = JSON.stringify(usage);
      const r = await loop({ apiKey: cfg.apiKey, model: models.router, effort: effort.router, system: routerSystem, tools: desk.toolsFor("router"),
        messages: session.messages, maxRounds: LIMITS.routerRounds, parallel: true, usage,
        callTool: (name, input) => desk.call(session, "router", name, input),
        closing: (name, result) => name === "send_reply" && (result.status === "ok" || result.status === "handover"),
        sendBack: "The customer has not had a reply. Finish through compose_reply and then send_reply." });
      if (r.closed) session.messages.push({ role: "assistant", content: [{ type: "text", text: "done" }] });
      turn.end = Date.now();
      return { reply: turn.reply || FALLBACK, sent: !!turn.reply, turn, usageBefore: JSON.parse(before), usage: JSON.parse(JSON.stringify(usage)),
        stoppedBy: r.closed ? "send_reply" : r.roundLimit ? "round_limit" : "text" };
    }

    return { runTurn, runSpecialist, runSynthesis, usage, models, effort };
  }

  return { loop, createAgents, MODELS, EFFORT, LIMITS, FALLBACK, PRONOUN, FIRST_PERSON };
});
