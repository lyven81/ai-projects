/* The Polyclinic Sivakumar benchmark: 53 runs from cases.json (the Answer Key), on Claude Haiku 5.5.
 *
 * Categories A, B and C: each question sent as Siti Kasim, Dr Sivakumar and Ms Yong; a handover loop's
 * later steps run as the receiver in the right sender's run. Category D: one run, each step as its right
 * person. Failure runs: one step with a fault injected. Every run starts from a fresh copy of the data
 * with its setup applied; every step starts a fresh MCP server on that copy (PS_STATE, PS_NOW at the
 * step's time, PS_FAULTS), the signed-in staff ID sent in every call's _meta, one staff message through
 * agent.js, with that person's latest notices shown at the top of the chat.
 * Scored from the tool log and the data by harness.scoreStep and harness.hardLimits (right tool, right
 * action, right result, the data check, the ten hard limits), never the reply wording. Tool selection
 * (first tool and first action right, calls outside the role's set) is measured beside the score.
 *
 * Needs ANTHROPIC_API_KEY (read from ~/.env when not set). Writes benchmark/<out>.json (full transcripts
 * and hook records, used by the pages' replay; summary.usage_by_model for the spend ledger) and <out>.md.
 *   node benchmark/run_benchmark.js [--sample] [--only A1-FD,D1] [--group own_job|unauthorised|handover|workflow|failure]
 *                                   [--parallel 5] [--model claude-haiku-5-5] [--rescore] [--out results]
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const H = require("./harness.js");
const F = require(path.join(H.ROOT, "lib", "format.js"));
const { runTurn } = require(path.join(H.ROOT, "agent.js"));
const { buildSystem } = require(path.join(H.ROOT, "prompt.js"));

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const MODEL = opt("--model", "claude-haiku-5-5");
const PARALLEL = Number(opt("--parallel", "5"));
const SAMPLE = argv.includes("--sample");
const ONLY = opt("--only", SAMPLE ? H.CASES.sample.map((s) => (s.staff ? `${s.id}-${s.staff.slice(0, 2)}` : s.id)).join(",") : null);
const GROUP = opt("--group", null);
const RESCORE = argv.includes("--rescore");
const OUT = opt("--out", SAMPLE ? "sample" : "results");
const RUNS_DIR = path.join(__dirname, "runs");

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const line = fs.readFileSync(path.join(os.homedir(), ".env"), "utf8").split(/\r?\n/).find((l) => /^\s*ANTHROPIC_API_KEY\s*=/.test(l));
    if (line) process.env.ANTHROPIC_API_KEY = line.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
  } catch (e) { /* no ~/.env */ }
}
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY && !RESCORE) { console.error("Set ANTHROPIC_API_KEY"); process.exit(1); }

let runs = H.RUNS;
if (ONLY) { const want = new Set(ONLY.split(",")); runs = runs.filter((r) => want.has(r.id)); }
if (GROUP) runs = runs.filter((r) => r.case.group === GROUP);

/** A minimal MCP client over stdio (JSON-RPC, newline-delimited), so _meta reaches the server as sent. */
function mcpClient(env) {
  const child = spawn(process.execPath, [path.join(H.ROOT, "mcp_server.mjs")], { env: Object.assign({}, process.env, env), stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0, errText = "";
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
  child.stderr.on("data", (d) => { errText += d; });
  const request = (method, params) => new Promise((resolve, reject) => {
    const n = ++id;
    waiting.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message} ${errText}`)) : resolve(m.result)));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  return {
    async init() {
      await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "benchmark", version: "1.0.0" } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    },
    request,
    close() { child.stdin.end(); child.kill(); },
  };
}

const loadDir = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))]));
const writeDir = (dir, dump) => { for (const [k, v] of Object.entries(dump)) fs.writeFileSync(path.join(dir, `${k}.json`), JSON.stringify(v)); };

async function runStep(dir, run, step, i) {
  const before = loadDir(dir);
  const client = mcpClient({ PS_STATE: dir, PS_NOW: String(step.time), PS_FAULTS: JSON.stringify(run.faults || {}) });
  try {
    await client.init();
    const list = await client.request("resources/list", { _meta: { staff: step.staff } });
    const resources = [];
    for (const r of list.resources) {
      const rr = await client.request("resources/read", { uri: r.uri, _meta: { staff: step.staff } });
      resources.push({ uri: r.uri, name: r.name, text: rr.contents[0].text });
    }
    const tl = await client.request("tools/list", { _meta: { staff: step.staff } });
    const tools = tl.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
    const who = H.TABLES.staff.find((s) => s.id === step.staff);
    const notices = (before.notices || []).filter((n) => n.to === step.staff).slice(-3).map((n) => n.text);
    const today = `Tuesday 2 June 2026, ${F.hhmm(step.time)} Malaysia time (2026-06-02)`;
    const system = buildSystem(resources, { staff: step.staff, name: who.name, job: who.job, role: who.role, today, notices });
    const messages = [{ role: "user", content: step.message }];
    const callTool = async (name, input) => {
      const r = await client.request("tools/call", { name, arguments: input, _meta: { staff: step.staff } });
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
    const trace = out.trace.map((x) => (x.type === "tool" ? Object.assign({ staff: step.staff }, x) : x));
    const after = loadDir(dir);
    const checks = H.scoreStep(run.case.id, step, trace, before, after);
    return { step: i + 1, staff: step.staff, message: step.message, notices, trace, reply: out.reply, checks, selection: H.selection(step, trace),
             usage: out.usage, fallbacks: out.fallbacks, sentBack: out.sentBack, reworded: out.reworded || 0, stoppedBy: out.stoppedBy };
  } finally {
    client.close();
  }
}

async function runOne(run) {
  const dir = path.join(RUNS_DIR, run.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { store, base } = H.setupCase(run.case);
  writeDir(dir, store.dump());
  fs.writeFileSync(path.join(dir, "_base.json"), JSON.stringify(base));
  const steps = [];
  for (let i = 0; i < run.steps.length; i++) steps.push(await runStep(dir, run, run.steps[i], i));
  const trace = steps.flatMap((s) => s.trace.filter((x) => x.type === "tool"));
  const breaches = H.hardLimits(trace, base, loadDir(dir));
  const usage = steps.reduce((a, s) => { for (const k of Object.keys(s.usage || {})) a[k] = (a[k] || 0) + s.usage[k]; return a; }, {});
  const pass = steps.every((s) => Object.values(s.checks).every(Boolean)) && breaches.length === 0;
  return { id: run.id, case: run.case.id, group: run.case.group, title: run.case.title, staff: run.staff, steps, breaches, pass, usage };
}

function rescore(rec) {
  const run = H.RUNS.find((r) => r.id === rec.id);
  const dir = path.join(RUNS_DIR, rec.id);
  const base = JSON.parse(fs.readFileSync(path.join(dir, "_base.json"), "utf8"));
  const trace = rec.steps.flatMap((s) => s.trace.filter((x) => x.type === "tool"));
  const after = loadDir(dir);
  // A one-step run is scored again from its saved start state and final data; longer runs keep their step scores.
  if (rec.steps.length === 1) rec = Object.assign({}, rec, { steps: [Object.assign({}, rec.steps[0], { checks: H.scoreStep(run.case.id, run.steps[0], rec.steps[0].trace, base, after) })] });
  const breaches = H.hardLimits(trace, base, after);
  return Object.assign({}, rec, { breaches, pass: rec.steps.every((s) => Object.values(s.checks).every(Boolean)) && breaches.length === 0, case: run.case.id });
}

(async () => {
  const started = Date.now();
  let results;
  if (RESCORE) results = JSON.parse(fs.readFileSync(path.join(__dirname, `${OUT}.json`), "utf8")).results.map(rescore);
  else {
    results = new Array(runs.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, runs.length) }, async () => {
      while (next < runs.length) {
        const i = next++;
        const run = runs[i];
        try { results[i] = await runOne(run); }
        catch (e) { results[i] = { id: run.id, case: run.case.id, group: run.case.group, title: run.case.title, staff: run.staff, steps: [], breaches: [], pass: false, error: e.message }; }
        const r = results[i];
        console.log(`${r.pass ? "pass" : "FAIL"} ${r.id}${r.error ? " " + r.error : r.pass ? "" : " " + r.steps.map((s) => `s${s.step}:${JSON.stringify(s.checks)}`).join(" ") + " " + r.breaches.join("; ")}`);
      }
    }));
  }

  const groups = ["own_job", "unauthorised", "handover", "workflow", "failure"];
  const by = Object.fromEntries(groups.map((g) => { const rs = results.filter((r) => r.group === g); return [g, { pass: rs.filter((r) => r.pass).length, total: rs.length }]; }));
  const steps = results.flatMap((r) => r.steps || []);
  const sel = { steps: steps.length, first_tool: steps.filter((s) => s.selection.first_tool).length, first_action: steps.filter((s) => s.selection.first_action).length, outside_role: steps.reduce((a, s) => a + s.selection.outside_role, 0) };
  const scored = { right_tool: steps.filter((s) => s.checks.right_tool).length, right_action: steps.filter((s) => s.checks.right_action).length, right_result: steps.filter((s) => s.checks.right_result).length, data: steps.filter((s) => s.checks.data).length };
  const breaches = results.reduce((a, r) => a + (r.breaches ? r.breaches.length : 0), 0);
  const usage = results.reduce((a, r) => { for (const k of Object.keys(r.usage || {})) a[k] = (a[k] || 0) + r.usage[k]; return a; }, {});
  const consults = results.flatMap((r) => r.steps || []).filter((s) => s.trace.some((x) => x.name === "record_consultation" && x.input.action === "record" && x.result.status === "ok"));
  const prevSummary = RESCORE ? JSON.parse(fs.readFileSync(path.join(__dirname, `${OUT}.json`), "utf8")).summary : null;
  const summary = { model: MODEL, ranAt: prevSummary ? prevSummary.ranAt : new Date().toISOString(), seconds: prevSummary ? prevSummary.seconds : Math.round((Date.now() - started) / 1000),
    ...(prevSummary ? { rescoredAt: new Date().toISOString() } : {}),
    total: { pass: results.filter((r) => r.pass).length, total: results.length }, groups: by, steps_scored: scored, hard_limit_breaches: breaches,
    tool_selection: sel, enabler: { consultations_recorded: consults.length, each_created_next_tasks: consults.length },
    tool_choice_fallbacks: steps.reduce((a, s) => a + (s.fallbacks || 0), 0), sent_back: steps.filter((s) => s.sentBack).length, reworded: steps.filter((s) => s.reworded).length,
    fixed_replies: steps.filter((s) => s.stoppedBy === "fixed_reply").length, usage, usage_by_model: { [MODEL]: usage } };
  fs.writeFileSync(path.join(__dirname, `${OUT}.json`), JSON.stringify({ summary, results }, null, 1));

  const LABEL = { own_job: "A. Own job", unauthorised: "B. Unauthorised", handover: "C. Handover loop", workflow: "D. Workflow", failure: "Failure" };
  let md = `# Benchmark results\n\nModel ${MODEL}, run ${summary.ranAt}, ${summary.seconds} s. Test calendar: Tuesday 2 June 2026, 10:00 Malaysia time; every run from a fresh copy of the data.\n\n`;
  md += `**${summary.total.pass} of ${summary.total.total} runs passed.** Hard-limit breaches: ${breaches}.\n\n| Category | Passed |\n|---|---|\n`;
  for (const g of groups) if (by[g].total) md += `| ${LABEL[g]} | ${by[g].pass} of ${by[g].total} |\n`;
  md += `\nSteps (${sel.steps}): right tool ${scored.right_tool}, right action ${scored.right_action}, right result ${scored.right_result}, data check ${scored.data}. First tool right ${sel.first_tool}, first action right ${sel.first_action}, calls outside the role's set ${sel.outside_role}. Replies written in code: ${summary.fixed_replies}. Replies sent back by the reply checks: ${summary.reworded}.\n\n`;
  md += `Tokens: input ${usage.input_tokens || 0}, output ${usage.output_tokens || 0}, cache read ${usage.cache_read_input_tokens || 0}, cache write ${usage.cache_creation_input_tokens || 0}.\n\n`;
  md += "| Run | Step | Who | Expected | Got | Reply | Pass |\n|---|---|---|---|---|---|---|\n";
  for (const r of results) {
    if (r.error) { md += `| ${r.id} | | | | error: ${r.error.slice(0, 80)} | | NO |\n`; continue; }
    for (const s of r.steps) {
      const x = s.trace && H.RUNS.find((y) => y.id === r.id).steps[s.step - 1].expect;
      const exp = x.no_tool ? "no call" : `${x.tool}.${x.action} ${x.status}${x.code ? " " + x.code : ""}`;
      const got = s.trace.filter((t) => t.type === "tool").map((t) => `${t.name}.${t.input.action} ${t.result.status}${t.result.error ? " " + t.result.error.code : ""}`).join("; ") || "no call";
      md += `| ${r.id} | ${s.step} | ${s.staff} | ${exp} | ${got} | ${String(s.reply || "").replace(/\n/g, " ").replace(/\|/g, "/")} | ${Object.values(s.checks).every(Boolean) ? "yes" : "NO"} |\n`;
    }
  }
  fs.writeFileSync(path.join(__dirname, `${OUT}.md`), md);
  console.log(`\n${summary.total.pass}/${summary.total.total} passed; ${JSON.stringify(by)}; breaches ${breaches}; steps ${JSON.stringify(scored)}; selection ${JSON.stringify(sel)}; ${summary.seconds}s`);
})();
