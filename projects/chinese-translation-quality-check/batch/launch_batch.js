/* The evening launcher behind Start batch.bat (build step 20).
 *
 * Shows each section's state, asks which sections to send (for example S01, or S02-S03, or Enter for
 * every section not yet sent), shows the cost estimate, asks once to confirm, submits one batch per
 * section and saves the batch IDs. After that the laptop can be off overnight.
 */
"use strict";
const path = require("path");
const readline = require("readline");
const { RUN, load } = require("./common.js");
const { submit, estimate, loadRun } = require("../lib/batch.js");
const { sectionRequests } = require("../prompt.js");
const { CAPS } = require("../coordinator.js");

const runFile = path.join(RUN, "batch_run.json");
const ask = (rl, q) => new Promise((r) => rl.question(q, r));

function parseChoice(input, doc, notSent) {
  const v = input.trim().toUpperCase();
  if (!v) return notSent;
  const ids = [];
  for (const part of v.split(/[,\s]+/)) {
    const m = part.match(/^S(\d\d)(?:-S?(\d\d))?$/);
    if (!m) return null;
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    for (let i = a; i <= b; i++) ids.push(`S${String(i).padStart(2, "0")}`);
  }
  return ids.filter((id) => doc.sections.some((s) => s.id === id));
}

(async () => {
  const { doc } = load();
  const run = loadRun(runFile);
  const sent = new Set(run.batches.map((b) => b.section));
  console.log("\nSections:");
  for (const s of doc.sections) {
    const b = run.batches.filter((x) => x.section === s.id).pop();
    console.log(`  ${s.id}  P${s.from} to P${s.to}  ${b ? (b.collected ? "collected" : "sent " + b.submitted.slice(0, 16).replace("T", " ")) : "not sent"}`);
  }
  const notSent = doc.sections.filter((s) => !sent.has(s.id)).map((s) => s.id);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const choice = parseChoice(await ask(rl, `\nWhich sections? (e.g. S01, or S02-S03; Enter = all not sent: ${notSent.join(" ") || "none"}) `), doc, notSent);
  if (!choice || !choice.length) { console.log("Nothing chosen."); rl.close(); return; }
  const again = choice.filter((id) => sent.has(id));
  const reqs = doc.sections.filter((s) => choice.includes(s.id)).flatMap((s) => sectionRequests(doc, s));
  console.log(`\nChecking the cost of ${reqs.length} requests...`);
  const est = await estimate(doc, reqs);
  console.log(`Estimate: $${est.usd.toFixed(2)} at batch prices (cap $${CAPS.real}).${again.length ? `  Already sent before: ${again.join(" ")}.` : ""}`);
  if (est.usd > CAPS.real) { console.log("Over the cap: nothing is sent."); rl.close(); return; }
  const yes = (await ask(rl, `Send ${choice.join(" ")} now? (y/n) `)).trim().toLowerCase() === "y";
  rl.close();
  if (!yes) { console.log("Not sent."); return; }
  const r = await submit(doc, choice, runFile, CAPS.real);
  console.log(r.ok ? `\nSent ${r.batches} batch(es). Batch IDs saved. You can turn the laptop off; run Start review.bat in the morning.` : r.error);
})().catch((e) => { console.error(`\nSomething went wrong: ${e.message}`); process.exit(1); });
