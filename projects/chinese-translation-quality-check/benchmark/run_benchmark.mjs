// Benchmark: the whole pipeline on the sample, scored against the answer key.
//
// Usage: node benchmark/run_benchmark.mjs --mode live          every section live (coordinator + grader)
//        node benchmark/run_benchmark.mjs --mode batch         one batch per section on the Message Batches
//                                                              API, waited for, collected by custom_id
//        node benchmark/run_benchmark.mjs --rescore live|batch score saved findings again, no API calls
//        node benchmark/run_benchmark.mjs --parity             compare the live and batch results
// Needs run/document.json (glossary_stage.js, build_document.js) and benchmark/answer_key.json.
// Results: benchmark/results/<mode>/findings/S01.json ... and benchmark/results/results-<mode>.json/.md.
// Every run's cost is added to benchmark/results/usage.json; a run refuses to start once all runs
// together have spent the cap (coordinator CAPS.benchmark, USD 5), and a live run stops at it.

import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "results");
const { indexDocument } = require("../tools.js");
const { runSection, CAPS } = require("../coordinator.js");
const { consolidate } = require("../consolidator.js");
const { gradeSection } = require("../grader.js");
const { submit, collect, loadRun } = require("../lib/batch.js");
const { ledger, getClient } = require("../lib/claude.js");
const { RUN, sources } = require("../lib/config.js");
const { score } = require("./score.js");

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const doc = indexDocument(JSON.parse(readFileSync(join(RUN, "document.json"), "utf8")));
const glossaryReport = JSON.parse(readFileSync(join(RUN, "stage", "glossary_report.json"), "utf8"));
const key = JSON.parse(readFileSync(join(HERE, "answer_key.json"), "utf8"));
const S = sources();
const usageFile = join(OUT, "usage.json");
const usage = existsSync(usageFile) ? JSON.parse(readFileSync(usageFile, "utf8")) : [];
const spent = usage.reduce((a, u) => a + u.usd, 0);

function readSections(mode) {
  const dir = join(OUT, mode, "findings");
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^S\d\d\.json$/.test(f)).sort().map((f) => ({ id: f.slice(0, 3), ...JSON.parse(readFileSync(join(dir, f), "utf8")) })) : [];
}
function saveSection(mode) {
  return async (id, rec) => { const dir = join(OUT, mode, "findings"); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${id}.json`), JSON.stringify(rec, null, 1)); };
}
function writeResults(mode, sections, usd) {
  const findings = sections.flatMap((s) => s.findings);
  const r = score(key, findings, glossaryReport);
  const graded = findings.filter((f) => f.grader).length;
  const res = { mode, at: new Date().toISOString(), usd, findings: findings.length, graded,
    failed: sections.reduce((n, s) => n + s.failed.length, 0), failedRequests: sections.reduce((n, s) => n + s.failedRequests.length, 0), ...r };
  writeFileSync(join(OUT, `results-${mode}.json`), JSON.stringify(res, null, 1));
  const md = [`# Benchmark results (${mode}), ${res.at.slice(0, 16).replace("T", " ")}`, "",
    `${res.found} of ${res.total} planted defects caught; pass mark ${res.passMark ? "met" : "not met"}. ${res.findings} findings (${graded} graded), ${res.falseFindings.length} on clean targets (${res.falseMust} must), ${res.unplanned.length} unplanned on planted targets; ${res.failed} findings failed the checks after retries, ${res.failedRequests} requests failed. Cost of this run $${usd.toFixed(2)}.`, "",
    "| Stage | Caught | Cases |", "|---|---|---|", ...Object.entries(res.groups).map(([k, v]) => `| ${k} | ${v.pass} | ${v.total} |`), "",
    "| Case | Target | Result | Caught by | What |", "|---|---|---|---|---|",
    ...res.cases.map((c) => `| ${c.id} | ${c.target} | ${c.pass ? "caught" : "MISSED"} | ${c.by.join("; ")} | ${c.what} |`), "",
    "## Findings on clean targets", "", ...(res.falseFindings.length ? res.falseFindings.map((f) => `- ${f.id} ${f.target} ${f.specialist}/${f.category} (${f.severity}, grader ${f.grader || "none"}): 「${f.zh_span}」 → 「${f.suggestion}」 ${f.issue}`) : ["None."]), "",
    "## Unplanned findings on planted targets", "", ...(res.unplanned.length ? res.unplanned.map((f) => `- ${f.id} ${f.target} ${f.specialist}/${f.category} (${f.severity}, grader ${f.grader || "none"}): 「${f.zh_span}」 → 「${f.suggestion}」 ${f.issue}`) : ["None."]), ""];
  writeFileSync(join(OUT, `results-${mode}.md`), md.join("\n"));
  return res;
}
function logUsage(mode) {
  usage.push({ at: new Date().toISOString(), mode, usd: Number(ledger.usd.toFixed(4)), by: ledger.byLabel });
  mkdirSync(OUT, { recursive: true }); writeFileSync(usageFile, JSON.stringify(usage, null, 1));
}
const report = (r) => console.log(`${r.mode}: ${r.found}/${r.total} caught (${Object.entries(r.groups).map(([k, v]) => `${k} ${v.pass}/${v.total}`).join(", ")}); ` +
  `${r.findings} findings, ${r.falseFindings.length} on clean targets (${r.falseMust} must), ${r.unplanned.length} unplanned; pass mark ${r.passMark ? "MET" : "not met"}; $${r.usd.toFixed(2)}`);

// ---------- parity ----------
if (argv.includes("--parity")) {
  const L = JSON.parse(readFileSync(join(OUT, "results-live.json"), "utf8")), B = JSON.parse(readFileSync(join(OUT, "results-batch.json"), "utf8"));
  const caught = (r) => new Set(r.cases.filter((c) => c.pass).map((c) => c.id));
  const lc = caught(L), bc = caught(B);
  const onlyLive = [...lc].filter((x) => !bc.has(x)), onlyBatch = [...bc].filter((x) => !lc.has(x));
  const res = { at: new Date().toISOString(), live: { caught: lc.size, findings: L.findings, falseFindings: L.falseFindings.length, usd: L.usd },
                batch: { caught: bc.size, findings: B.findings, falseFindings: B.falseFindings.length, usd: B.usd }, onlyLive, onlyBatch,
                parity: onlyLive.length === 0 && onlyBatch.length === 0 };
  writeFileSync(join(OUT, "parity.json"), JSON.stringify(res, null, 1));
  console.log(`parity: live caught ${lc.size}, batch caught ${bc.size}; only live: ${onlyLive.join(", ") || "none"}; only batch: ${onlyBatch.join(", ") || "none"}; ${res.parity ? "PARITY HOLDS" : "parity does not hold"}; cost live $${L.usd.toFixed(2)}, batch $${B.usd.toFixed(2)}`);
  process.exit(0);
}

// ---------- rescore ----------
if (argv.includes("--rescore")) {
  const mode = opt("--rescore");
  const prev = existsSync(join(OUT, `results-${mode}.json`)) ? JSON.parse(readFileSync(join(OUT, `results-${mode}.json`), "utf8")).usd : 0;
  report(writeResults(mode, readSections(mode), prev));
  process.exit(0);
}

// ---------- run ----------
const mode = opt("--mode", "live");
if (spent >= CAPS.benchmark) { console.log(`The benchmark cap of $${CAPS.benchmark} is spent ($${spent.toFixed(2)} so far); nothing runs.`); process.exit(2); }
const left = CAPS.benchmark - spent;
console.log(`${mode} run; $${spent.toFixed(2)} spent so far, $${left.toFixed(2)} left under the cap`);

if (mode === "live") {
  for (const section of doc.sections) {
    const rec = await runSection(doc, S, section, { mode: "benchmark" });
    if (!rec.findings) { console.log(`${section.id}: stopped`); break; }
    rec.consolidated = await consolidate(doc, section, rec, { labelPrefix: `${section.id}:` });
    rec.grader = await gradeSection(doc, section, rec.findings, { labelPrefix: `${section.id}:` });
    rec.collected = new Date().toISOString();
    await saveSection("live")(section.id, rec);
    console.log(`${section.id}: ${rec.findings.length} findings, ${rec.failed.length} failed checks, ${rec.failedRequests.length} failed requests; $${ledger.usd.toFixed(2)} so far`);
    if (ledger.usd > left) { console.log("cap reached; stopping"); break; }
  }
} else if (mode === "batch") {
  const runFile = join(OUT, "batch", "batch_run.json");
  if (!loadRun(runFile).batches.length) {
    const r = await submit(doc, doc.sections.map((s) => s.id), runFile, left);
    if (!r.ok) { console.log(r.error); process.exit(2); }
    console.log(`submitted ${r.batches} batches, ${r.estimate.requests} requests, estimate $${r.estimate.usd.toFixed(2)}`);
  } else console.log("batches already submitted; waiting and collecting");
  const c = getClient();
  for (;;) {
    const run = loadRun(runFile);
    const open = run.batches.filter((b) => !b.collected);
    if (!open.length) break;
    const st = await Promise.all(open.map((b) => c.messages.batches.retrieve(b.id).catch((e) => ({ processing_status: `error ${e.message}` }))));
    console.log(`  ${new Date().toISOString().slice(11, 19)} ${open.map((b, i) => `${b.section} ${st[i].processing_status}`).join(", ")}`);
    if (st.some((s) => s.processing_status === "ended")) {
      const rep = await collect(doc, S, runFile, saveSection("batch"));
      for (const x of rep.filter((y) => y.status === "collected")) console.log(`  ${x.section}: collected, ${x.findings} findings, ${x.redone} redone live`);
    } else await new Promise((r) => setTimeout(r, 30000));
  }
} else { console.log("mode must be live or batch"); process.exit(2); }

logUsage(mode);
report(writeResults(mode, readSections(mode), ledger.usd));
