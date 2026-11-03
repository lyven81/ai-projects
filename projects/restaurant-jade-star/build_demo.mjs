// Builds demo.html from demo.template.html: the Booking Desk (Form, Chat, Customer agent A2A) on the left, the owner
// dashboard with the seating map on the right, the customer's phone and the Under the hood dialog. The engine
// (lib/booking.js, the two hooks, tools.js, prompt.js, agent.js), the sample data, the four resources, every
// clause's text and the final recorded benchmark run are inlined, so the page works as one file with no server.
// The form runs live with no key, chat runs live with the visitor's own key, A2A replays the recorded runs.
//   node build_demo.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (p) => JSON.parse(read(p));

const config = json("resources/restaurant.json");
const resources = config.resources.map((r) => ({ id: r.id, uri: r.uri, name: r.name, text: read(join("resources", r.file)) }));

// Every clause with its text, from the four .md resources (the single source).
const clauses = {};
for (const r of config.resources) {
  const file = r.file.replace(/\.md$/, ".html");
  const lines = read(join("resources", r.file)).split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^## ([A-Z]\d+) (.+)$/);
    if (h) { const body = []; for (let j = i + 1; j < lines.length && !lines[j].startsWith("## "); j++) if (lines[j].trim() && !lines[j].startsWith("|")) body.push(lines[j].trim()); clauses[h[1]] = { source: r.name, file, title: h[2], text: body.join(" ") }; }
    const t = lines[i].match(/^\|\s*(H\d+)\s*\|\s*(\w+)\s*\|\s*(.+?)\s*\|$/);
    if (t) clauses[t[1]] = { source: r.name, file, title: t[3], text: `Handover reason ${t[2]}: ${t[3]}. Goes to the restaurant manager.` };
  }
}

const file = ["results-published.json", "results-final.json", "results.json", "sample.json"].find((f) => existsSync(join(HERE, "benchmark", f)));
const run = json(join("benchmark", file));
const doc = json("benchmark/cases.json");
const slimTrace = (tr) => (tr || []).map((x) => (x.type === "tool" ? { type: "tool", name: x.name, input: x.input, result: x.result } : { type: x.type, text: x.text }));
const replay = {};
for (const r of run.results) {
  replay[r.id] = { pass: r.score.pass, clock: r.clock, at: r.at, state: r.state, form: r.form, confirm: r.confirm, code_entered: r.code_entered, proposal_ref: r.proposal_ref,
    task_after: r.task_after, task_booking_number: r.task_booking_number, events: (r.events || []).map((e) => ({ at: e.at, tool: e.tool })),
    turns: (r.turns || []).map((t) => ({ message: t.message, reply: t.reply, stoppedBy: t.stoppedBy, trace: slimTrace(t.trace) })), a2a_log: r.a2a_log };
}
const labels = json("demo_labels.json"); // the dropdown text: one short question per case, 10 words or fewer
const DATA = { config, labels, seed: json("data/state.json"), cases: doc.cases, groups: doc.groups, a2a: json("data/a2a_requests.json"), resources, clauses, replay,
  replay_source: `Recorded runs: the final benchmark run of ${run.summary.date.slice(0, 10)}, ${run.summary.passed} of ${run.summary.runs} passed, Claude Haiku 5.5. Form live with no key; chat live with your own key; A2A replayed.` };
const safe = (s) => s.replace(/<\/(script)/gi, "<\/$1");
const engine = ["lib/booking.js", "hooks/pre_tool_use.js", "hooks/post_tool_use.js", "tools.js", "prompt.js", "agent.js"].map((f) => `/* ${f} */\n` + read(f)).join("\n");
const html = read("demo.template.html").replace("/*__ENGINE__*/", () => safe(engine)).replace("/*__DATA__*/", () => safe(JSON.stringify(DATA)));
if (html.includes("—")) throw new Error("em-dash in demo.html");
writeFileSync(join(HERE, "demo.html"), html);
console.log(`Wrote demo.html: ${Object.keys(replay).length} recorded cases from ${file}, ${Object.keys(clauses).length} clauses, ${(html.length / 1024).toFixed(0)} KB`);
