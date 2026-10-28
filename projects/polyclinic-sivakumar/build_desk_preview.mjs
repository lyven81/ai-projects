// Builds desk-preview.html (UI option D, working preview) from desk-preview.template.html: inlines the
// shared modules (format, rules, back end, both hooks, tools), the sample data, the policy tables, the
// Answer Key and the recorded sample run, so the page runs the same seven tools and hooks with no server.
// Run after generate_data.py and the sample: node build_desk_preview.mjs
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const HERE = dirname(fileURLToPath(import.meta.url));
const r = (p) => readFileSync(join(HERE, p), "utf8");
const MODULES = ["lib/format.js", "lib/rules.js", "lib/backend.js", "hooks/pre_tool_use.js", "hooks/post_tool_use.js", "tools.js"].map(r).join("\n");
const data = Object.fromEntries(readdirSync(join(HERE, "data")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(r(`data/${f}`))]));
data.call_log = [];
const sample = JSON.parse(r("benchmark/sample.json"));
for (const res of sample.results) for (const s of res.steps) s.trace = s.trace.map((t) => (t.type === "tool" ? { type: "tool", name: t.name, input: t.input } : t));
const H = createRequire(import.meta.url)("./benchmark/harness.js");
const RUNS = H.RUNS.map((r) => ({ id: r.id, case: r.case.id, group: r.case.group, title: r.case.title, sender: r.case.sender || null, staff: r.staff,
  setup: r.case.setup || [], faults: r.faults || {}, steps: r.steps.map((s) => ({ staff: s.staff, message: s.message, time: s.time })), canon: H.CANON[r.id] || [] }));
const safe = (o) => JSON.stringify(o).replace(/</g, "\u003c");
let page = r("desk-preview.template.html")
  .replace("/*__MODULES__*/", () => MODULES.replace(/<\/script/gi, "<\/script"))
  .replace("/*__DATA__*/null", () => safe(data))
  .replace("/*__TABLES__*/null", () => r("resources/policy_tables.json"))
  .replace("/*__SAMPLE__*/null", () => safe({ summary: sample.summary, results: sample.results }))
  .replace("/*__RUNS__*/null", () => safe(RUNS))
  .replace("/*__CASES__*/null", () => safe(JSON.parse(r("benchmark/cases.json"))));
writeFileSync(join(HERE, "desk-preview.html"), page);
console.log(`desk-preview.html ${(page.length / 1024).toFixed(0)} KB`);

// Layout 1, Side-by-side, adapted (founder, 27 Oct): the same engine and data, its own shell and render.
const L1_SHELL = `<main class="shell">
<div class="grid1"><aside id="left"></aside><section>
<div class="sample" style="flex-direction:column;align-items:stretch;margin-top:0;margin-bottom:12px">
 <h3 style="margin:0 0 2px">Test questions</h3><div class="cap" style="margin:0 0 8px">Pick a test question, then press Next step.</div>
 <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:12px">Question category</b>
  <select id="cat" onchange="pickCat(this.value)"><option value="own_job">A. Own job</option><option value="unauthorised">B. Unauthorised</option><option value="handover">C. Handover loop</option><option value="workflow">D. Workflow across the team</option><option value="failure">Failure runs</option></select>
  <button class="btn" id="stepBtn">Next step ▶</button><button class="btn secondary" id="resetBtn">Restart question</button><button class="btn secondary" onclick="clearRun();reset();render()">Free play</button></div>
 <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:10px"><b style="font-size:12px">Question</b><div class="runs" id="runs"></div></div>
 <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px" id="senderRow"><b style="font-size:12px">Sent as</b><div class="runs" id="senders"></div></div>
 <div class="now" id="now" style="margin-top:8px">Choose a category and a question, then press Next step.</div></div>
<div class="card" id="chat"></div>
</section><aside id="right"></aside></div>`;
const L1_CSS = `html,body{height:100%}body{display:flex;flex-direction:column;overflow:hidden}
.top{padding:8px 22px;flex:none}.top .sub{display:none}.brand{font-size:16px}
.meta{display:flex;align-items:center;gap:10px}.signwho{text-align:right;line-height:1.3}.signnote{font-size:10.5px;opacity:.75}
main.shell{flex:1;min-height:0;display:flex;flex-direction:column;max-width:none;padding:0 16px 4px}
.grid1{flex:1;min-height:0;margin-top:10px!important}.grid1>aside,.grid1>section{min-height:0;overflow:auto}
.grid1>section{display:flex;flex-direction:column;overflow:hidden}.grid1>aside{display:flex;flex-direction:column;overflow:hidden}.grid1>aside>.card{flex:1;min-height:0;overflow:auto;margin:0}.grid1 .sample{flex:none;padding:10px 14px}
#chat{flex:1;min-height:0;display:flex;flex-direction:column}#chat .chatlog.big{flex:1;min-height:0;max-height:none}
.footer{flex:none;padding:4px;font-size:10px}
@media(max-width:1200px){body{overflow:auto;height:auto}main.shell{display:block}.grid1>aside,.grid1>section{overflow:visible}#chat .chatlog.big{min-height:300px}}
.cap{font-size:12px;color:#5f7a74;margin:0 0 10px;line-height:1.4}.grid1{display:grid;grid-template-columns:270px minmax(420px,1fr) 430px;gap:14px;margin-top:14px}.row1{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap}
.chatlog.big{min-height:380px;max-height:520px;overflow:auto;background:#f8fbfa;border:1px solid #e6efeb;border-radius:10px;padding:10px}
.meta select{margin-left:10px;padding:6px 8px;border-radius:7px;border:0}
@media(max-width:1200px){.grid1{grid-template-columns:1fr}}`;
let l1 = page.replace("<title>Clinic Desk Option D</title>", "<title>Clinic Desk Layout 1</title>")
  .replace("</style></head>", L1_CSS + "</style></head>");
const a = l1.indexOf('<main class="shell">'), z = l1.indexOf('<div id="screen"></div>') + '<div id="screen"></div>'.length;
l1 = l1.slice(0, a) + L1_SHELL + l1.slice(z);
l1 = l1.replace('reset(); pickCat("own_job");', () => r("desk-layout1.overrides.js") + '\nreset(); pickCat("own_job");');
writeFileSync(join(HERE, "desk-layout1.html"), l1);
console.log(`desk-layout1.html ${(l1.length / 1024).toFixed(0)} KB`);

// The published clinic desk (steps 15 to 17): Layout 1 with the demo-page header, the full recorded run as the
// replay with its scores, and Live with the visitor's own key. Written to clinic-desk.html.
const results = JSON.parse(r("benchmark/results.json"));
for (const res of results.results) for (const s of res.steps) s.trace = s.trace.map((t) => (t.type === "tool" ? { type: "tool", name: t.name, input: t.input } : t));
const tablesJson = JSON.parse(r("resources/policy_tables.json"));
const RESOURCES = tablesJson.resources.map((x) => ({ uri: x.uri, name: x.name, text: r(`resources/${x.file}`) }));
const PROD_HEAD = `<header class="top"><div><div class="crumb"><a href="../../index.html">AI Projects</a> / <a href="../../polyclinic-sivakumar.html">Polyclinic Sivakumar Clinic Desk</a></div><div class="brand">✚ &nbsp; Polyclinic Sivakumar</div>
<div class="links"><a href="policies.html" target="_blank" rel="noopener">Policies</a> · <a href="benchmark/Answer%20Key.html" target="_blank" rel="noopener">Answer Key</a> · <a href="benchmark/Sample%20Questions.html" target="_blank" rel="noopener">Sample questions</a></div></div><div class="meta" id="signed"></div></header>`;
const PROD_CSS = `.crumb{font-size:11px;opacity:.85;margin-bottom:2px}.crumb a,.links a{color:#cfeee2;text-decoration:none}.crumb a:hover,.links a:hover{text-decoration:underline}
.links{font-size:11px;margin-top:2px}.top{padding:6px 22px}
.badge{display:inline-block;font-size:10.5px;border-radius:10px;padding:1px 7px;margin:2px 3px 0 0;border:1px solid #d7e6e0}.badge.ok{background:#e6f4ec;color:#1f6b45}.badge.no{background:#fbe9e5;color:#9a3b26}
.liveline{display:flex;gap:6px;margin-top:8px}.liveline input{flex:1}.warnline{font-size:11px;color:#936021;background:#fff5e7;border:1px solid #f6dfbd;border-radius:7px;padding:6px 9px;margin-top:6px}
.askline{display:flex;gap:6px;margin-top:8px;align-items:stretch}.askline textarea{flex:1;border:1px solid #dbe6e2;border-radius:7px;padding:7px;font:13px Arial,sans-serif;resize:none}
.msg .basis a{color:inherit}`;
let prod = l1.replace("<title>Clinic Desk Layout 1</title>", '<title>Polyclinic Sivakumar Clinic Desk</title>\n<link rel="icon" href="../../favicon.ico" sizes="any"><link rel="icon" href="../../favicon.svg" type="image/svg+xml">')
  .replace("</style></head>", PROD_CSS + "</style></head>");
const h0 = prod.indexOf('<header class="top">'), h1 = prod.indexOf("</header>", h0) + "</header>".length;
prod = prod.slice(0, h0) + PROD_HEAD + prod.slice(h1);
const f0 = prod.indexOf('<div class="footer">'), f1 = prod.indexOf("</div>", f0) + "</div>".length;
prod = prod.slice(0, f0) + '<div class="footer">© 2026 Lee Yih Ven · Polyclinic Sivakumar Clinic Desk · Sample data at the test calendar, Tuesday 2 June 2026 · Replay is the recorded benchmark run; Live uses your own API key</div>' + prod.slice(f1);
const s0 = prod.indexOf("const SAMPLE = "), s1 = prod.indexOf("const CASES = ", s0);
prod = prod.slice(0, s0) + "const SAMPLE = " + safe({ summary: results.summary, results: results.results }) + ";\nconst RESOURCES = " + safe(RESOURCES) + ";\n" + prod.slice(s1);
prod = prod.replace("<script>/*", () => "<script>" + r("agent.js").replace(/<\/script/gi, "<\\/script") + "\n" + r("prompt.js").replace(/<\/script/gi, "<\\/script") + "\n/*");
prod = prod.replace('reset(); pickCat("own_job");', () => r("desk.prod.js") + '\nreset(); pickCat("own_job");');
prod = prod.replace('<option value="failure">Failure runs</option>', '<option value="failure">Failure runs</option>');
writeFileSync(join(HERE, "clinic-desk.html"), prod);
console.log(`clinic-desk.html ${(prod.length / 1024).toFixed(0)} KB`);
