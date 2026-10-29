// The query() runner. It owns the caps, the hooks and the record: the coordinator and the subagents decide
// what to write and whom to start; the runner decides what is allowed and writes down everything that happened.
//
// Hooks (all in code):
//   PreToolUse, coordinator: extract_facts first; no writer while an owner question is open; at most two
//     corrections per channel; the coverage check before the reviewer; the facts (and on a correction the exact
//     errors) added to each writer's task, the facts and every channel's current copy added to the reviewer's.
//   PreToolUse, subagent: each writer only its own tool, once; the controlled test conditions (C2, C3, C4, C6).
//   PostToolUse, writer tool: the copy checks (hooks/post_tool_use.mjs).
//   PostToolUse, coordinator Task: the runner's record of that channel handed to the coordinator.
// Every tool-log line carries the acting agent's card.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { makeServer, mcp } from "./mcp_server.mjs";
import { AGENTS, COORDINATOR_PROMPT, CARDS, MODEL, WRITER_OF, CHANNEL_OF } from "./agents.mjs";
import { checkCopy, WRITER_TOOLS, copyText } from "./hooks/post_tool_use.mjs";
import { newState, applyCheck, coverage, reviewSet, finalizeOnStop, requested, DEFAULT_CAPS } from "./lib/tools.mjs";
import { readResource } from "./lib/resources.mjs";
import { CHANNELS } from "./lib/facts.mjs";

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TASK = /^(Agent|Task)$/;
const short = (n) => String(n).replace(/^mcp__kiddoz__/, "");

export function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return true;
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch { /* no ~/.env */ }
  return !!process.env.ANTHROPIC_API_KEY;
}

// ------------------------------------------------------------------ the controlled test conditions
// Set by the benchmark harness only; a normal run has none. Each alters one writer attempt in a known way.
export function applyCondition(cond, channel, attempt, input) {
  if (!cond || cond.channel !== channel || (cond.attempts && !cond.attempts.includes(attempt))) return null;
  const c = structuredClone(input);
  if (cond.kind === "wrong_price") {           // C2, C6: the copy quotes RM18.00 for PB01
    const swap = (t) => (/RM\s?20(?:\.00)?\b/.test(t) ? t.replace(/RM\s?20(?:\.00)?\b/g, "RM18.00") : `${t}\n\nKini RM18.00 sahaja!`);
    if (channel === "instagram") c.caption = swap(String(c.caption || ""));
    if (channel === "whatsapp") c.message = swap(String(c.message || ""));
    return c;
  }
  if (cond.kind === "drop_whatsapp_cta") {    // C4: Instagram invites parents only to visit the shop
    const fix = (t) => String(t).split(/\r?\n/).map((l) => (/whatsapp|\bwa\b|\[No\. WhatsApp\]/i.test(l) ? "Jom singgah ke kedai kami di Bangi." : l)).join("\n");
    c.caption = fix(c.caption || "");
    c.hashtags = (c.hashtags || []).filter((h) => !/whatsapp/i.test(h));
    while (c.hashtags.length < 5) c.hashtags.push(["#KiddozBangi", "#BajuSekolahBangi", "#PersediaanSekolah", "#UniformSekolah", "#KembaliKeSekolah"][c.hashtags.length]);
    c.claims = (c.claims || []).filter((x) => !/whatsapp/i.test(String(x.text)));
    return c;
  }
  return null;
}

// ------------------------------------------------------------------ the blocks the runner adds to a task
function factsBlock(state) {
  const f = state.facts;
  return { facts: f.facts, tone: f.tone, channels: f.channels, owner_requirements: f.facts.filter((x) => x.field === "owner_requirement"), channel_rules: f.channel_rules };
}
function writerBlock(state, channel) {
  const ch = state.channels[channel];
  const fb = factsBlock(state);
  const fix = ch.attempts > 1 || ch.carried ? {
    correction: ch.attempts > 1 || ch.findings.length || ch.errors.length,
    open_errors: ch.errors.map((e) => `${e.clause}: ${e.detail}`),
    open_findings: ch.findings.map((x) => `${x.fact_or_clause}: ${x.problem}`),
  } : null;
  return `\n\n--- Runner record (checked facts for this task) ---\n${JSON.stringify({ channel, ...fb, channel_rules: fb.channel_rules.filter((r) => r.id === { whatsapp: "G1", instagram: "G2", email: "G3", blog: "G4", seo: "G5" }[channel] || r.id === "G6" || r.id === "G7"), ...(fix && fix.correction ? { fix } : {}) }, null, 1)}`;
}
function reviewerBlock(state, given) {
  const copy = Object.fromEntries(given.map((c) => [c, { version: state.channels[c].version, copy: state.channels[c].copy }]));
  // On a later review: what the previous review decided for each channel, so a pass on unchanged copy stands.
  const last = state.reviews.at(-1);
  const previous_review = last ? Object.fromEntries(given.map((c) => {
    const ch = state.channels[c]; const v = last.verdicts[c];
    return [c, !v ? "not in the previous review" : v.pass ? (ch.reviewedVersion === ch.version ? `passed, version ${ch.version} unchanged` : "passed, since rewritten") : { failed_on: v.findings, rewritten_to_version: ch.version }];
  })) : null;
  return `\n\n--- Runner record (facts, owner requirements and the full current copy of every channel) ---\n${JSON.stringify({ ...factsBlock(state), copy, ...(previous_review ? { previous_review } : {}) }, null, 1)}`;
}
function channelRecord(state, channel) {
  const ch = state.channels[channel];
  return { channel, attempt: ch.attempts, corrections_left: Math.max(0, state.caps.attempts - ch.attempts), status: ch.status === "written" ? (ch.copy ? "check_failed" : "no_output") : ch.status,
    errors: ch.errors.map((e) => `${e.clause}: ${e.detail}`), has_copy: !!ch.copy };
}

// ------------------------------------------------------------------ one step of a run
async function runStep({ step, stepIndex, state, cond, mode, rec, overrides, carried, prior }) {
  const t0 = Date.now();
  const at = () => Date.now() - t0;
  const S = { toolLog: [], events: [], timeline: [], spans: {}, subOf: {}, agentWrites: {}, reviewFaults: 0, writers: 0, msgIds: new Set(), denied: [] };
  rec.steps.push(S);
  S.message = step.message;
  const abort = new AbortController();
  const card = (agent) => ({ agent, ...(CARDS[agent] || CARDS.coordinator) });
  const logLine = (agent, event, tool, detail) => S.toolLog.push({ t: at(), ...card(agent), event, tool: short(tool), ...(detail ? { detail } : {}) });
  const deny = (agent, tool, reason) => { logLine(agent, "refused", tool, reason); S.denied.push({ agent, tool: short(tool), reason }); return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }; };
  const allowWith = (input) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: input } });

  const ctx = { state, ownerMessage: step.message, overrides, carried, onFacts: (r) => { state.facts = r; state.factsOk = r.status !== "resource_error"; S.facts = r; } };
  state.factsCalled = false;
  for (const c of CHANNELS) state.channels[c].attempts = 0;
  let seqChain = Promise.resolve();

  const pre = async (input) => {
    const name = input.tool_name; const tin = input.tool_input || {};
    // ---- inside a subagent
    if (input.agent_id) {
      const agent = input.agent_type; const sn = short(name);
      if (WRITER_TOOLS[sn]) {
        const channel = WRITER_TOOLS[sn];
        if (CHANNEL_OF[agent] !== channel) return deny(agent, name, `only ${WRITER_OF[channel]} uses ${sn}`);
        if (S.agentWrites[input.agent_id]) return deny(agent, name, "one output per writer: your copy is recorded; end now and reply done");
        const ch = state.channels[channel];
        if (cond && cond.kind === "no_tool_call" && cond.channel === channel && cond.attempts.includes(ch.attempts)) {
          S.agentWrites[input.agent_id] = "blocked";
          return deny(agent, name, `${sn} is unavailable for this attempt; end now and reply with your copy as text`);
        }
        const altered = applyCondition(cond, channel, ch.attempts, tin);
        logLine(agent, "call", name, { attempt: ch.attempts, ...(altered ? { test_condition: cond.kind } : {}) });
        return altered ? allowWith(altered) : {};
      }
      if (sn === "report_findings") {
        if (agent !== "reviewer") return deny(agent, name, "only the reviewer reports findings");
        if (S.agentWrites[input.agent_id]) return deny(agent, name, "one report per review: your report is recorded; end now and reply done");
        logLine(agent, "call", name);
        return {};
      }
      return deny(agent, name, "not a tool of this agent");
    }
    // ---- the coordinator
    if (state.modelCalls >= state.caps.modelCalls) { abort.abort(); return deny("coordinator", name, "model-call cap reached: the run stops"); }
    const sn = short(name);
    if (sn === "extract_facts") { state.factsCalled = true; logLine("coordinator", "call", name, tin); return {}; }
    if (!state.factsCalled) return deny("coordinator", name, "extract_facts runs first, on the owner's message");
    if (state.facts && state.facts.status === "resource_error" && sn !== "deliver") return deny("coordinator", name, "a resource could not be loaded: stop and deliver the channels as failed");
    if (sn === "ask_owner" || sn === "deliver") { logLine("coordinator", "call", name, tin); return {}; }
    if (TASK.test(name)) {
      const st = tin.subagent_type;
      if (CHANNEL_OF[st]) {
        const channel = CHANNEL_OF[st]; const ch = state.channels[channel];
        if (!state.facts) return deny("coordinator", name, "no facts yet");
        if (state.facts.status === "needs_owner") return deny("coordinator", name, `the facts have open owner questions (${state.facts.owner_issues.map((i) => `${i.code} ${i.item}`).join("; ")}): ask the owner with ask_owner; no copy is written on them`);
        if (!state.facts.channels.includes(channel)) return deny("coordinator", name, `${channel} was not requested in this message`);
        if (["waiting_for_owner", "failed"].includes(ch.status)) return deny("coordinator", name, `${channel} is ${ch.status}`);
        if (ch.attempts > 0 && ["checked", "reviewed"].includes(ch.status)) return deny("coordinator", name, `${channel} passed; redo only failing channels`);
        if (ch.attempts >= state.caps.attempts) return deny("coordinator", name, `${channel} has had the first attempt and two corrections: ask the owner with O5`);
        if (ch.attempts === 0 && requested(state).filter((c) => state.channels[c].attempts > 0).length >= state.caps.writers) return deny("coordinator", name, "at most five writers per run");
        ch.attempts += 1; ch.requested = true; ch.status = "writing";
        S.writers += 1;
        const startedPrompt = String(tin.prompt || "");
        const added = writerBlock(state, channel);
        if (mode === "sequential") { const prev = seqChain; let release; seqChain = new Promise((r) => (release = r)); S.spans[input.tool_use_id] = { release }; await prev; }
        S.spans[input.tool_use_id] = { ...(S.spans[input.tool_use_id] || {}), agent: st, channel, attempt: ch.attempts, start: at(), version0: ch.version };
        logLine("coordinator", "start", name, { subagent: st, attempt: ch.attempts, coordinator_prompt: startedPrompt });
        return allowWith({ ...tin, run_in_background: false, prompt: startedPrompt + added });
      }
      if (st === "reviewer") {
        if (cond && cond.kind === "reviewer_down") { S.reviewFaults += 1; return deny("coordinator", name, "the reviewer could not be reached (service error 503)"); }
        const cov = coverage(state);
        if (!cov.ok) return deny("coordinator", name, `coverage check: ${cov.missing.map((m) => `${m.channel}, ${m.why}`).join("; ")}`);
        if (state.reviews.length >= state.caps.reviews) return deny("coordinator", name, "review cap reached");
        const given = reviewSet(state);
        state.reviewing = given;
        S.spans[input.tool_use_id] = { agent: "reviewer", start: at(), reviews0: state.reviews.length, given };
        logLine("coordinator", "start", name, { subagent: "reviewer", given, versions: Object.fromEntries(given.map((c) => [c, state.channels[c].version])), coordinator_prompt: String(tin.prompt || "") });
        return allowWith({ ...tin, run_in_background: false, prompt: String(tin.prompt || "") + reviewerBlock(state, given) });
      }
      return deny("coordinator", name, `unknown subagent ${st}`);
    }
    return deny("coordinator", name, "not a tool of the coordinator");
  };

  const post = async (input) => {
    const name = input.tool_name; const sn = short(name);
    if (input.agent_id && WRITER_TOOLS[sn]) {
      const channel = WRITER_TOOLS[sn];
      S.agentWrites[input.agent_id] = true; // an output was recorded: this instance is done
      const r = checkCopy(channel, input.tool_input || {}, state.facts);
      applyCheck(state, channel, r);
      logLine(input.agent_type, "checked", name, { ok: r.ok, errors: r.errors.map((e) => `${e.clause}: ${e.detail}`), version: state.channels[channel].version });
      return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "Your copy is recorded and checked by the runner. End now: reply with one word, done." } };
    }
    if (input.agent_id && sn === "report_findings") { if (/"ok":true/.test(flat(input.tool_response?.content ?? input.tool_response))) S.agentWrites[input.agent_id] = true; logLine("reviewer", "reported", name, { verdicts: state.reviews.at(-1)?.verdicts || null }); return {}; }
    if (!input.agent_id && TASK.test(name)) {
      const sp = S.spans[input.tool_use_id] || {};
      sp.end = at();
      if (sp.release) sp.release();
      if (sp.channel) {
        const ch = state.channels[sp.channel];
        if (ch.version === sp.version0) { ch.status = "written"; ch.errors = [{ clause: "coverage", detail: "the writer returned without calling its output tool; a prose reply is not an output" }]; }
        const rec2 = channelRecord(state, sp.channel);
        S.timeline.push({ agent: sp.agent, channel: sp.channel, attempt: sp.attempt, start: sp.start, end: sp.end, status: rec2.status });
        logLine("coordinator", "returned", name, rec2);
        return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `RUNNER RECORD ${JSON.stringify(rec2)}` } };
      }
      if (sp.agent === "reviewer") {
        const done = state.reviews.length > sp.reviews0;
        const rr = done ? { review: "complete", verdicts: state.reviews.at(-1).verdicts } : { review: "incomplete", note: "the reviewer returned without report_findings; nothing is reviewed" };
        S.timeline.push({ agent: "reviewer", start: sp.start, end: sp.end, status: rr.review });
        logLine("coordinator", "returned", name, rr);
        return { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: `RUNNER RECORD ${JSON.stringify(rr)}` } };
      }
    }
    if (!input.agent_id) logLine("coordinator", "result", name, safeParse(input.tool_response));
    return {};
  };

  const prompt = prior
    ? `Runner record of this conversation so far (subagents know none of it unless you tell them):\n${JSON.stringify(prior, null, 1)}\n\nNew message from Puan Zarina (Wednesday 28 October 2026, 10:00 Malaysia time):\n"${step.message}"`
    : `Message from Puan Zarina (Wednesday 28 October 2026, 10:00 Malaysia time):\n"${step.message}"`;
  S.prompt = prompt;
  const server = makeServer(ctx);
  let result = null;
  try {
    for await (const m of query({ prompt, options: {
      model: MODEL, systemPrompt: COORDINATOR_PROMPT, settingSources: [], tools: ["Task"], cwd: ROOT, persistSession: false,
      allowedTools: ["Task", ...["extract_facts", "ask_owner", "deliver", "write_whatsapp", "write_instagram", "write_email", "write_blog", "write_seo", "report_findings"].map(mcp)],
      permissionMode: "dontAsk", mcpServers: { kiddoz: server }, agents: AGENTS, maxTurns: 40, abortController: abort,
      hooks: { PreToolUse: [{ hooks: [pre], timeout: 900 }], PostToolUse: [{ hooks: [post], timeout: 120 }] },
    } })) {
      if (m.type === "assistant") {
        const id = m.message.id; if (id && !S.msgIds.has(id)) { S.msgIds.add(id); state.modelCalls += 1; }
        const agent = m.parent_tool_use_id ? (S.subOf[m.parent_tool_use_id] || "subagent") : "coordinator";
        for (const b of m.message.content || []) {
          if (b.type === "tool_use") { if (TASK.test(b.name)) S.subOf[b.id] = b.input?.subagent_type; S.events.push({ t: at(), agent, kind: "tool_use", msg: id, id: b.id, name: short(b.name), input: b.input }); }
          else if (b.type === "text" && b.text.trim()) S.events.push({ t: at(), agent, kind: "text", msg: id, text: b.text });
        }
      } else if (m.type === "user") {
        const agent = m.parent_tool_use_id ? (S.subOf[m.parent_tool_use_id] || "subagent") : "coordinator";
        for (const b of m.message?.content || []) if (b.type === "tool_result") S.events.push({ t: at(), agent, kind: "tool_result", id: b.tool_use_id, error: !!b.is_error, text: flat(b.content).slice(0, 4000) });
      } else if (m.type === "system" && /^task_(started|notification)$/.test(m.subtype)) {
        S.events.push({ t: at(), agent: "runner", kind: m.subtype, task: m.task_id, text: String(m.description || m.summary || "").slice(0, 200) });
      } else if (m.type === "result") {
        result = { subtype: m.subtype, text: m.result || "", usage: m.usage, modelUsage: m.modelUsage, cost: m.total_cost_usd, duration_ms: m.duration_ms, num_turns: m.num_turns };
      }
    }
  } catch (e) {
    S.error = String(e && e.message || e);
  }
  if (abort.signal.aborted) S.stop = finalizeOnStop(state, "model-call cap reached");
  else if (!state.deliveries.length && !result) S.stop = finalizeOnStop(state, S.error || "the run ended without a result");
  S.result = result;
  S.ms = at();
  S.writing = writingPhase(S.timeline);
  S.channels = snapshot(state);
  S.ownerQuestions = structuredClone(state.ownerQuestions);
  S.reviews = structuredClone(state.reviews);
  S.deliveries = structuredClone(state.deliveries);
  S.modelCalls = state.modelCalls;
  return S;
}

function writingPhase(tl) {
  const first = tl.filter((x) => x.channel && x.attempt === 1);
  if (!first.length) return null;
  const start = Math.min(...first.map((x) => x.start)), end = Math.max(...first.map((x) => x.end));
  const sum = first.reduce((a, x) => a + (x.end - x.start), 0);
  let overlap = false;
  for (const a of first) for (const b of first) if (a !== b && a.start < b.end && b.start < a.end) overlap = true;
  return { writers: first.length, start, end, ms: end - start, sum_ms: sum, overlap };
}
function snapshot(state) {
  return Object.fromEntries(CHANNELS.filter((c) => state.channels[c].requested || state.channels[c].carried || state.channels[c].copy).map((c) => {
    const ch = state.channels[c];
    return [c, { requested: ch.requested, carried: !!ch.carried, status: ch.status, attempts: ch.attempts, version: ch.version, copy: ch.copy, text: ch.copy ? copyText(c, ch.copy) : null, errors: ch.errors, findings: ch.findings, history: ch.history }];
  }));
}
const flat = (c) => (typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => x.text ?? JSON.stringify(x)).join("\n") : JSON.stringify(c));
function safeParse(r) { const t = flat(r?.content ?? r); try { return JSON.parse(t); } catch { return t.slice(0, 1500); } }

// ------------------------------------------------------------------ a whole scenario (one or more linked steps)
export async function runScenario(scn, { mode = "parallel" } = {}) {
  const rec = { id: scn.id, group: scn.group, title: scn.title, mode, model: MODEL, started: new Date().toISOString(), steps: [] };
  const overrides = scn.fault?.kind === "price_list_unavailable" ? { unavailable: ["kiddoz://price-list"] } : {};
  let carried = null, state = null, prior = null;
  for (let i = 0; i < scn.steps.length; i++) {
    state = newState({ carried });
    const cond = scn.fault && (scn.fault.step ?? 0) === i ? scn.fault : null;
    await runStep({ step: scn.steps[i], stepIndex: i, state, cond, mode, rec, overrides, carried: carried && { skus: carried.skus, tone: carried.tone, channels: carried.channelList }, prior });
    // The runner carries a linked step's state explicitly: the facts held, the questions asked and each
    // channel's copy. Subagents never inherit it; the coordinator reads it in the next step's prompt.
    const f = state.facts || {};
    const chState = {};
    for (const c of CHANNELS) if (state.channels[c].copy) chState[c] = { ...structuredClone(state.channels[c]), attempts: 0 };
    carried = { skus: f.skus || carried?.skus || [], tone: f.tone || carried?.tone, channelList: f.channels || carried?.channelList || [], channels: chState };
    prior = {
      earlier_messages: scn.steps.slice(0, i + 1).map((s) => s.message),
      facts_held: { skus: carried.skus, tone: carried.tone, campaign_period: (f.facts || []).find((x) => x.id === "F-PERIOD")?.value },
      owner_questions_asked: state.ownerQuestions.map((q) => ({ code: q.code, item: q.item, question: q.question })),
      channels: Object.fromEntries(Object.entries(chState).map(([c, v]) => [c, { status: v.status, version: v.version }])),
    };
  }
  rec.ms = rec.steps.reduce((a, s) => a + s.ms, 0);
  const by = {};
  let cost = 0;
  for (const s of rec.steps) {
    cost += s.result?.cost || 0;
    for (const [m, u] of Object.entries(s.result?.modelUsage || {})) {
      const b = (by[m] = by[m] || { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
      b.input_tokens += u.inputTokens || 0; b.output_tokens += u.outputTokens || 0; b.cache_read_input_tokens += u.cacheReadInputTokens || 0; b.cache_creation_input_tokens += u.cacheCreationInputTokens || 0;
    }
  }
  rec.usage_by_model = by; rec.cost_usd = cost;
  rec.final = Object.fromEntries(Object.entries(rec.steps.at(-1).channels).map(([c, v]) => [c, v.status]));
  return rec;
}

// CLI: node run.mjs "<owner message>"   one live run from the command line, recorded to runs/
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const msg = process.argv.slice(2).join(" ").trim();
  if (!msg) { console.error('Usage: node run.mjs "<message from the owner>"'); process.exit(1); }
  if (!loadKey()) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }
  const rec = await runScenario({ id: "live", group: "live", title: "Live run", steps: [{ message: msg }] });
  fs.mkdirSync(path.join(ROOT, "runs"), { recursive: true });
  const out = path.join(ROOT, "runs", `live-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(rec, null, 1));
  for (const [c, v] of Object.entries(rec.steps.at(-1).channels)) console.log(`\n== ${c}: ${v.status}\n${v.text || ""}`);
  console.log(`\n${rec.steps.at(-1).result?.text || ""}\n\nRecorded: ${out}  Cost: USD ${rec.cost_usd.toFixed(4)}`);
}
