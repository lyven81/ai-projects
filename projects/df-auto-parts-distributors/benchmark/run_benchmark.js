/* The DF Auto Parts Distributors benchmark: 36 runs from cases.json (the Answer Key), on Claude Haiku 5.5.
 *
 * The seven scenarios run as one day: each step starts from the state the earlier steps leave, built by
 * harness.setupCase without a model, on a fresh copy of the data with a fresh MCP server (HP_STATE, HP_NOW
 * at the step's time, HP_FAULTS), the signed-in staff ID sent in every call's _meta, one staff message
 * through agent.js. Notice steps check the notification written by code, with no model call. Scored from
 * the tool log and the data by harness.score (right tool, status and code, escalation, decision, order,
 * records, the ten hard limits), never the reply wording. Tool selection is measured beside the score.
 *
 * Needs ANTHROPIC_API_KEY (read from ~/.env when not set). Writes benchmark/<out>.json (full transcripts
 * and hook records, used by the staff desk replay; summary.usage_by_model for the spend ledger) and <out>.md.
 *   node benchmark/run_benchmark.js [--sample] [--only 2.3,F1] [--group valid|escalation|unauthorised|failure]
 *                                   [--parallel 5] [--model claude-haiku-5-5] [--rescore] [--out results]
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const H = require("./harness.js");
const { runTurn } = require(path.join(H.ROOT, "agent.js"));
const { buildSystem } = require(path.join(H.ROOT, "prompt.js"));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt("--model", "claude-haiku-5-5");
const PARALLEL = Number(opt("--parallel", "5"));
const SAMPLE = argv.includes("--sample");
const ONLY = opt("--only", SAMPLE ? "1.1,2.3,4.3" : null);
const GROUP = opt("--group", null);
const RESCORE = argv.includes("--rescore");
const OUT = opt("--out", SAMPLE ? "sample" : "results");
const RUNS = path.join(__dirname, "runs");

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch (e) { /* no ~/.env */ }
}
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !RESCORE) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

let cases = H.CASES.cases;
if (ONLY) { const want = new Set(ONLY.split(",")); cases = cases.filter((c) => want.has(c.id)); }
if (GROUP) cases = cases.filter((c) => c.group === GROUP);

/** A minimal MCP client over stdio (JSON-RPC, newline-delimited), so _meta reaches the server as sent. */
function mcpClient(env) {
  const child = spawn(process.execPath, [path.join(H.ROOT, "mcp_server.mjs")], { env: Object.assign({}, process.env, env), stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0;
  const waiting = new Map();
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
    }
  });
  let errText = "";
  child.stderr.on("data", (d) => { errText += d; });
  const request = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message} ${errText}`)) : resolve(m.result)));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  const notify = (method, params) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  return {
    async init() {
      await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "benchmark", version: "1.0.0" } });
      notify("notifications/initialized", {});
    },
    request,
    close() { child.stdin.end(); child.kill(); },
  };
}

function loadDir(dir) {
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]));
}
const dumpStore = (dump) => ({ dump: () => dump });
const DAY = "Thursday 1 October 2026";

async function runCase(c) {
  const head = { id: c.id, group: c.group, tab: c.tab, order: c.order, time: c.time, staff: c.staff, kind: c.kind, title: c.title, message: c.message };
  const { store, base } = H.setupCase(c);
  if (c.kind === "notice") {
    const n = (base.notifications || []).find((y) => y.to === c.staff && y.escalation === c.expect.notification.escalation && y.kind === c.expect.notification.kind);
    return Object.assign(head, { trace: [], reply: null, notice: n ? n.text : null, score: H.score(c, [], store, base), selection: null, usage: null });
  }
  const dir = path.join(RUNS, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(store.dump())) fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v));
  fs.writeFileSync(path.join(dir, "_base.json"), JSON.stringify(base));
  const client = mcpClient({ HP_STATE: dir, HP_NOW: String(H.at(c.time)), HP_FAULTS: JSON.stringify(c.faults || {}) });
  try {
    await client.init();
    const list = await client.request("resources/list", {});
    const resources = [];
    for (const r of list.resources) {
      const rr = await client.request("resources/read", { uri: r.uri });
      resources.push({ uri: r.uri, name: r.name, text: rr.contents[0].text });
    }
    const tl = await client.request("tools/list", {});
    const tools = tl.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    const who = H.TABLES.staff.find((s) => s.id === c.staff);
    const notices = (base.notifications || []).filter((n) => n.to === c.staff).slice(-3).map((n) => n.text);  // shown at the top of the chat
    const system = buildSystem(resources, { staff: c.staff, name: who.name, role: who.role, today: `${DAY}, ${c.time} Malaysia time (2026-10-01)`, date: "2026-10-01", notices });
    const messages = [{ role: "user", content: c.message }];
    const callTool = async (name, input) => {
      const r = await client.request("tools/call", { name, arguments: input, _meta: { staff: c.staff } });
      return { result: JSON.parse(r.content[0].text), hook: r._meta && r._meta.hook };
    };
    let out, attempt = 0;
    for (;;) {
      try { out = await runTurn({ apiKey: API_KEY, model: MODEL, system, tools, messages, callTool, self: who.name }); break; }
      catch (e) {
        if (++attempt > 3 || !/ (429|500|502|503|529):/.test(e.message)) throw e;
        await new Promise((r) => setTimeout(r, 4000 * attempt));
      }
    }
    const after = loadDir(dir);
    const s = H.score(c, out.trace, dumpStore(after), base);
    return Object.assign(head, { trace: out.trace, reply: out.reply, score: s, selection: H.selection(c, out.trace), fallbacks: out.fallbacks,
      sentBack: out.sentBack, reworded: out.reworded || 0, usage: out.usage, stoppedBy: out.stoppedBy });
  } finally {
    client.close();
  }
}

function rescore(rec) {
  const c = H.CASES.cases.find((x) => x.id === rec.id);
  if (c.kind === "notice") { const { store, base } = H.setupCase(c); return Object.assign({}, rec, { score: H.score(c, [], store, base) }); }
  const dir = path.join(RUNS, c.id);
  const base = JSON.parse(fs.readFileSync(path.join(dir, "_base.json"), "utf8"));
  return Object.assign({}, rec, { score: H.score(c, rec.trace, dumpStore(loadDir(dir)), base), selection: H.selection(c, rec.trace) });
}

(async () => {
  const started = Date.now();
  let results;
  if (RESCORE) {
    const prev = JSON.parse(fs.readFileSync(path.join(__dirname, `${OUT}.json`), "utf8"));
    results = prev.results.map(rescore);
  } else {
    results = new Array(cases.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, cases.length) }, async () => {
      while (next < cases.length) {
        const i = next++;
        const c = cases[i];
        try { results[i] = await runCase(c); }
        catch (e) { results[i] = { id: c.id, group: c.group, staff: c.staff, title: c.title, message: c.message, error: e.message, score: { pass: false, checks: {}, breaches: [] } }; }
        const r = results[i];
        console.log(`${r.score.pass ? "pass" : "FAIL"} ${c.id}${r.error ? " " + r.error : r.score.pass ? "" : " " + JSON.stringify(r.score.checks) + " " + r.score.breaches.join("; ")}`);
      }
    }));
  }

  const groups = ["valid", "escalation", "unauthorised", "failure"];
  const by = Object.fromEntries(groups.map((g) => { const rs = results.filter((r) => r.group === g); return [g, { pass: rs.filter((r) => r.score.pass).length, total: rs.length }]; }));
  const agentRuns = results.filter((r) => r.selection);
  const sel = { first_right: agentRuns.filter((r) => r.selection.first_right).length, beyond_minimum: agentRuns.reduce((a, r) => a + r.selection.beyond_minimum, 0), runs: agentRuns.length };
  const breaches = results.reduce((a, r) => a + (r.score.breaches ? r.score.breaches.length : 0), 0);
  const usage = results.reduce((a, r) => { if (r.usage) for (const k of Object.keys(r.usage)) a[k] = (a[k] || 0) + r.usage[k]; return a; }, {});
  const fallbacks = results.reduce((a, r) => a + (r.fallbacks || 0), 0);
  const summary = { model: MODEL, ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000),
    total: { pass: results.filter((r) => r.score.pass).length, total: results.length }, groups: by, hard_limit_breaches: breaches,
    tool_selection: sel, tool_choice_fallbacks: fallbacks, sent_back: results.filter((r) => r.sentBack).length, reworded: results.filter((r) => r.reworded).length,
    fixed_replies: results.filter((r) => r.stoppedBy === "fixed_reply").length, usage, usage_by_model: { [MODEL]: usage } };
  fs.writeFileSync(path.join(__dirname, `${OUT}.json`), JSON.stringify({ summary, results }, null, 1));

  let md = `# Benchmark results\n\nModel ${MODEL}, run ${summary.ranAt}, ${summary.seconds} s. The test day: ${DAY}, 10:00 to 11:16 Malaysia time, each step on the state the earlier steps leave.\n\n`;
  md += `**${summary.total.pass} of ${summary.total.total} runs passed.** Hard-limit breaches: ${breaches}.\n\n| Group | Passed |\n|---|---|\n`;
  for (const g of groups) if (by[g].total) md += `| ${g} | ${by[g].pass} of ${by[g].total} |\n`;
  md += `\nTool selection (agent runs, ${sel.runs}): first tool right ${sel.first_right}; calls beyond the minimum ${sel.beyond_minimum}. tool_choice fallbacks: ${fallbacks}. Replies written in code: ${summary.fixed_replies}. Replies sent back by the reply checks: ${summary.reworded}.\n\n`;
  md += `Tokens: input ${usage.input_tokens || 0}, output ${usage.output_tokens || 0}, cache read ${usage.cache_read_input_tokens || 0}, cache write ${usage.cache_creation_input_tokens || 0}.\n\n`;
  md += "| Step | Staff | Expected | Got | Reply | Pass |\n|---|---|---|---|---|---|\n";
  for (const r of results) {
    const c = H.CASES.cases.find((x) => x.id === r.id);
    const exp = c.kind === "notice" ? "notice" : `${c.expect.tool} ${c.expect.status}${c.expect.code ? " " + c.expect.code : ""}`;
    const got = r.error ? `error: ${r.error.slice(0, 60)}` : c.kind === "notice" ? "notice" : (r.trace || []).filter((t) => t.type === "tool").map((t) => `${t.name} ${t.result.status}${t.result.error ? " " + t.result.error.code : ""}`).join("; ") || "no tool";
    md += `| ${r.id} | ${r.staff} | ${exp} | ${got} | ${String(r.reply || r.notice || "").replace(/\n/g, " ").replace(/\|/g, "/")} | ${r.score.pass ? "yes" : "NO"} |\n`;
  }
  fs.writeFileSync(path.join(__dirname, `${OUT}.md`), md);
  console.log(`\n${summary.total.pass}/${summary.total.total} passed; ${JSON.stringify(by)}; breaches ${breaches}; selection ${JSON.stringify(sel)}; fallbacks ${fallbacks}; ${summary.seconds}s`);
})();
