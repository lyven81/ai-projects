// Builds demo.html from demo.template.html: the two-screen desk (customer chat on the left, Nurul Aina's handover
// queue on the right), with the engine (tools.js, agent.js, prompt.js), the sample data, the four resources, every
// clause's text and the recorded benchmark runs inlined, so the page works as one file with no server.
// Replays come from benchmark/results.json when it exists, otherwise benchmark/sample.json.
//   node build_demo.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(HERE, p), "utf8");
const json = (p) => JSON.parse(read(p));

const tables = json("resources/policy_tables.json");
const staff = json("resources/staff-directory.json");
const resources = tables.resources.map((r) => ({ uri: r.uri, name: r.name, text: read(join("resources", r.file)) }));

// Every clause and status ID with its text, from the policy tables (the single source).
const clauses = {};
for (const r of resources.filter((x) => x.uri.startsWith("policy://"))) {
  for (const line of r.text.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 2) continue;
    if (/^(C\d+a?|S\d+[abcd]?)$/.test(cells[0])) {
      // Rule rows are | ID | Policy | Enforced by |; routing rows (S10 to S20b) are | ID | Reason | Kind | To |.
      const text = cells.length === 4 ? `${cells[1]}. ${cells[2]}, to ${cells[3]}.` : cells[1];
      clauses[cells[0]] = { source: r.name, text: text.replace(/\*\*/g, "") };
    } else if (/^D\d$/.test(cells[1] || "")) {
      clauses[cells[1]] = { source: r.name, text: `${cells[0]}. ${cells[2]} Limit: ${cells[3]}. What the agent advises: ${cells[4]}` };
    }
  }
}

const file = existsSync(join(HERE, "benchmark/results.json")) ? "results.json" : "sample.json";
const run = json(join("benchmark", file));
const caseFile = json("benchmark/cases.json");
const cases = Object.fromEntries(caseFile.cases.map((c) => [c.id, { outcome: c.outcome, group: c.group }]));
const groups = caseFile.groups;
const replay = run.results.map((r) => ({ id: r.id, title: r.title, group: r.group, message: r.message, turns: r.turns, events: r.events, handovers: r.handovers, score: r.score }));

const DATA = { tables, staff, parcels: json("data/parcels.json"), resources, clauses, cases, groups, replay, replay_source: `${file.replace(".json", "")} run of ${run.summary.date.slice(0, 10)}, ${run.summary.passed} of ${run.summary.runs} passed` };
const safe = (s) => s.replace(/<\/(script)/gi, "<\\/$1");
const engine = ["tools.js", "prompt.js", "agent.js"].map((f) => `/* ${f} */\n` + read(f)).join("\n");
const html = read("demo.template.html")
  .replace("/*__ENGINE__*/", () => safe(engine))
  .replace("/*__DATA__*/", () => safe(JSON.stringify(DATA)));
if (html.includes("\u2014")) throw new Error("em-dash in demo.html");
writeFileSync(join(HERE, "demo.html"), html);
console.log(`Wrote demo.html: ${replay.length} replayed chats from ${file}, ${Object.keys(clauses).length} clauses, ${(html.length / 1024).toFixed(0)} KB`);
