/* The Sang Kancil Specialist Clinic benchmark: 92 runs from cases.json (the Answer Key), on Claude Haiku 5.5.
 *
 * Each run: a fresh copy of the data with the case's setup, a fresh MCP server (SK_STATE, SK_FAULTS), the
 * signed-in staff ID sent in every call's _meta (the tools and resources listed for that session only), one
 * staff message through agent.js. About 5 runs at a time. Scored from the tool log and the data by
 * harness.score (right tool, right status and code, the person next_step names, Dr Aisyah's capacity,
 * the records written, the nine hard limits); the reply is checked only where no tool carries the answer.
 *
 * Needs ANTHROPIC_API_KEY (read from ~/.env when not set). Writes benchmark/<out>.json (full transcripts
 * and hook records, used by the staff page replay) and benchmark/<out>.md, with summary.usage_by_model.
 *   node benchmark/run_benchmark.js [--sample] [--only Q1.1-PD-02-01,F2] [--group matrix|failure]
 *                                   [--parallel 5] [--model claude-haiku-5-5] [--rescore] [--out results]
 *   --sample: the first selected question of each category, 28 runs, written to sample.json and sample.md.
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
const ONLY = opt("--only", null);
const GROUP = opt("--group", null);
const SAMPLE = argv.includes("--sample");
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
if (SAMPLE) cases = cases.filter((c) => c.sample);
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

const served0 = (resources) => resources.map((x) => x.uri);
function loadDir(dir) {
  return Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]));
}
const dumpStore = (dump) => ({ dump: () => dump });

async function runCase(c) {
  const { store, base } = H.setupCase(c);
  const dir = path.join(RUNS, c.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [k, v] of Object.entries(store.dump())) fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v));
  fs.writeFileSync(path.join(dir, "_base.json"), JSON.stringify(base));
  const client = mcpClient({ SK_STATE: dir, SK_FAULTS: JSON.stringify(c.faults || {}) });
  try {
    await client.init();
    const meta = { _meta: { staff: c.staff } };
    const list = await client.request("resources/list", meta);
    const resources = [];
    for (const r of list.resources) {
      const rr = await client.request("resources/read", Object.assign({ uri: r.uri }, meta));
      resources.push({ uri: r.uri, name: r.name, text: rr.contents[0].text });
    }
    const tl = await client.request("tools/list", meta);
    const tools = tl.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    const who = H.TABLES.staff.find((s) => s.id === c.staff);
    const notices = H.T.createDesk(store, H.TABLES, { now: H.NOW }).backend.notices(H.RULES.who(c.staff));  // shown at sign-in (founder, 22 Oct)
    const system = buildSystem(resources, { staff: c.staff, name: who.name, title: who.title, today: "Thursday 22 October 2026, 10:00am Malaysia time (2026-10-22)", notices });
    if (c.expect.notice) {
      const s = H.score(c, [], dumpStore(loadDir(dir)), base, "", served0(resources));
      return { id: c.id, group: c.group, q: c.q, category: c.category, staff: c.staff, message: null, notices, trace: [], reply: notices.map((n) => n.text).join(" "),
        served: served0(resources), score: s, selection: null, fallbacks: 0, sentBack: false, reworded: 0, usage: null, stoppedBy: "notice_only" };
    }
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
    const trace = out.trace.filter((t) => t.type === "tool").map((t) => ({ name: t.name, input: t.input, result: t.result, hook: t.hook }));
    const served = resources.map((r) => r.uri);
    const s = H.score(c, trace, dumpStore(after), base, out.reply, served);
    return { id: c.id, group: c.group, q: c.q, category: c.category, staff: c.staff, message: c.message, notices, trace: out.trace, reply: out.reply, served,
      score: s, selection: H.selection(c, trace), fallbacks: out.fallbacks, sentBack: out.sentBack, reworded: out.reworded || 0, usage: out.usage, stoppedBy: out.stoppedBy };
  } finally {
    client.close();
  }
}

function rescore(rec) {
  const c = H.CASES.cases.find((x) => x.id === rec.id);
  const dir = path.join(RUNS, c.id);
  const after = loadDir(dir);
  const base = JSON.parse(fs.readFileSync(path.join(dir, "_base.json"), "utf8"));
  const trace = rec.trace.filter((t) => t.type === "tool").map((t) => ({ name: t.name, input: t.input, result: t.result, hook: t.hook }));
  return Object.assign({}, rec, { score: H.score(c, trace, dumpStore(after), base, rec.reply, rec.served), selection: H.selection(c, trace) });
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
        catch (e) { results[i] = { id: c.id, group: c.group, q: c.q, staff: c.staff, message: c.message, error: e.message, score: { pass: false, checks: {}, breaches: [] } }; }
        const r = results[i];
        console.log(`${r.score.pass ? "pass" : "FAIL"} ${c.id}${r.error ? " " + r.error : r.score.pass ? "" : " " + JSON.stringify(r.score.checks) + " " + r.score.breaches.join("; ")}`);
      }
    }));
  }

  const groups = ["matrix", "failure"];
  const by = Object.fromEntries(groups.map((g) => { const rs = results.filter((r) => r.group === g); return [g, { pass: rs.filter((r) => r.score.pass).length, total: rs.length }]; }));
  const agentRuns = results.filter((r) => r.selection);
  const sel = { first_right: agentRuns.filter((r) => r.selection.first_right).length, beyond_minimum: agentRuns.reduce((a, r) => a + r.selection.beyond_minimum, 0), runs: agentRuns.length };
  const breaches = results.reduce((a, r) => a + (r.score.breaches ? r.score.breaches.length : 0), 0);
  const usage = results.reduce((a, r) => { if (r.usage) for (const k of Object.keys(r.usage)) a[k] = (a[k] || 0) + r.usage[k]; return a; }, {});
  const fallbacks = results.reduce((a, r) => a + (r.fallbacks || 0), 0);
  const summary = { model: MODEL, sample: SAMPLE, ranAt: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000),
    total: { pass: results.filter((r) => r.score.pass).length, total: results.length }, groups: by, hard_limit_breaches: breaches,
    tool_selection: sel, tool_choice_fallbacks: fallbacks, sent_back: results.filter((r) => r.sentBack).length, reworded: results.filter((r) => r.reworded).length,
    usage, usage_by_model: { [MODEL]: usage } };
  fs.writeFileSync(path.join(__dirname, `${OUT}.json`), JSON.stringify({ summary, results }, null, 1));

  let md = `# Benchmark ${SAMPLE ? "sample" : "results"}\n\nModel ${MODEL}, run ${summary.ranAt}, ${summary.seconds} s. Test calendar: Thursday 22 October 2026, 10:00am Malaysia time.\n\n`;
  md += `**${summary.total.pass} of ${summary.total.total} runs passed.** Hard-limit breaches: ${breaches}.\n\n| Group | Passed |\n|---|---|\n`;
  for (const g of groups) if (by[g].total) md += `| ${g} | ${by[g].pass} of ${by[g].total} |\n`;
  md += `\nTool selection (${sel.runs} runs): first tool right ${sel.first_right}; calls beyond the minimum ${sel.beyond_minimum}. tool_choice fallbacks: ${fallbacks}. Plain-text endings sent back: ${summary.sent_back}.\n\n`;
  md += `Tokens: input ${usage.input_tokens || 0}, output ${usage.output_tokens || 0}, cache read ${usage.cache_read_input_tokens || 0}, cache write ${usage.cache_creation_input_tokens || 0}.\n\n`;
  md += "| Run | Staff | Tools called | Pass | Failed checks |\n|---|---|---|---|---|\n";
  for (const r of results) {
    const got = r.error ? `error: ${r.error.slice(0, 60)}` : (r.trace || []).filter((t) => t.type === "tool").map((t) => `${t.name} ${t.result.status}${t.result.error ? " " + t.result.error.code : ""}`).join("; ") || "no tool";
    const bad = Object.entries(r.score.checks || {}).filter(([, v]) => !v).map(([k]) => k).concat(r.score.breaches || []).join(", ");
    md += `| ${r.id} | ${r.staff} | ${got} | ${r.score.pass ? "yes" : "NO"} | ${bad} |\n`;
  }
  fs.writeFileSync(path.join(__dirname, `${OUT}.md`), md);
  console.log(`\n${summary.total.pass}/${summary.total.total} passed; ${JSON.stringify(by)}; breaches ${breaches}; selection ${JSON.stringify(sel)}; fallbacks ${fallbacks}; ${summary.seconds}s`);
})();
