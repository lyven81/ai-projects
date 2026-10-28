// The published clinic desk (steps 15 to 17, founder-approved Layout 1): on top of the shared engine and the
// Layout 1 overrides, it replays the full recorded benchmark run with its scores, and runs Live with the
// visitor's own Anthropic API key through the same agent loop, prompt, tools and hooks as the benchmark.
const MODEL = "claude-haiku-5-5";
const MAX_LIVE = 12;
const KEY_SLOT = "ps-desk-key";
let mode = "replay", liveKey = "", liveBusy = false;
const live = { "FD-01": [], "GP-01": [], "PH-01": [] };
const NOT_FOR_PHARMACIST = new Set(["reference://price-list", "policy://panel"]);
const resourcesFor = (id) => RESOURCES.filter((r) => !(id === "PH-01" && NOT_FOR_PHARMACIST.has(r.uri)));
function readKey() { try { return sessionStorage.getItem(KEY_SLOT) || ""; } catch (e) { return ""; } }
function saveKey(v) { try { if (v) sessionStorage.setItem(KEY_SLOT, v); else sessionStorage.removeItem(KEY_SLOT); } catch (e) { /* memory only */ } }
liveKey = readKey();

/** Clause IDs in a Basis line open the clause on the policy page. */
const linkClauses = (s) => esc(s).replace(/\b(PS-[A-Z]{2}-\d{2})\b/g, '<a href="policies.html#$1" target="_blank" rel="noopener">$1</a>');

/** The scores of the run being replayed, as badges. */
function badges(run, upto) {
  const rec = REC[run.id];
  if (!rec) return "";
  const steps = rec.steps.slice(0, upto);
  const all = steps.every((s) => Object.values(s.checks).every(Boolean));
  const name = { right_tool: "right tool", right_action: "right action", right_result: "right result", data: "data check" };
  const b = Object.keys(name).map((k) => `<span class="badge ${steps.every((s) => s.checks[k]) ? "ok" : "no"}">${name[k]}</span>`).join("");
  return ` <span class="badge ${all ? "ok" : "no"}">${all ? "pass" : "check"}</span>${b}${upto === rec.steps.length ? `<span class="badge ${rec.breaches.length ? "no" : "ok"}">hard limits</span>` : ""}`;
}

function chatCard() {
  const hoodOn = (hoodMode[role] || "chat") === "hood";
  const s = TABLES.staff.find((x) => x.id === role);
  const log = (chats[role] || []).map((m) => `<div class="msg ${m.who}">${esc(m.text).replace(/\n/g, "<br>")}${m.basis ? `<span class="basis">Basis: ${linkClauses(m.basis)}</span>` : ""}</div>`).join("");
  const h = hood.filter((x) => x.staff === role).slice(0, 5).map((x) => `<div class="label">${x.tool} · ${x.input.action} · ${x.hook.result.status}${x.hook.result.error ? " " + x.hook.result.error.code : ""}</div>${(x.hook.pre.checks || []).map((c) => `<div class="check ${c.pass ? "ok" : "no"}">${esc(c.check)} (${c.clause})</div>`).join("")}${(x.hook.post || []).map((c) => `<div class="small">PostToolUse: ${esc(c)}</div>`).join("")}<pre>${esc(JSON.stringify(x.hook.result, null, 1))}</pre>`).join("");
  const greet = mode === "live"
    ? `<div class="msg ai">Hello ${esc(s.first)}. Ask anything your role covers, or press Use this question.</div>`
    : `<div class="msg ai">Hello ${esc(s.first)}. Choose a question above and press Next step.</div>`;
  const liveBar = mode !== "live" ? "" : `<div class="liveline"><input type="password" id="apikey" placeholder="Your Anthropic API key (sk-ant-...)" value="${liveKey ? "••••••••••••" : ""}" onchange="liveKey=this.value.trim();saveKey(liveKey)">
      <button class="btn secondary" onclick="liveKey='';saveKey('');render()">Forget key</button></div>
    <div class="warnline"><b>Calls are billed to the key's owner.</b> Use a key you can revoke, with a low spend limit. The key stays in this tab's session storage and goes only to api.anthropic.com. A public service would keep its key on a server.</div>
    <div class="askline"><textarea id="ask" rows="2" placeholder="Type a message as ${esc(s.first)}" ${liveBusy ? "disabled" : ""}></textarea><button class="btn" onclick="liveSend()" ${liveBusy ? "disabled" : ""}>${liveBusy ? "Thinking..." : "Send"}</button></div>`;
  return `<div class="row1"><div><h3 style="margin:0 0 2px">Clinic assistant</h3><div class="cap" style="margin:0">The staff message and the assistant's reply appear here.</div></div>
    <div class="toggle"><button class="${!hoodOn ? "active" : ""}" onclick="setHood('chat')">Chat</button><button class="${hoodOn ? "active" : ""}" onclick="setHood('hood')">Under the hood</button>
    <span style="width:8px"></span><button class="${mode === "replay" ? "active" : ""}" onclick="setMode('replay')">Replay</button><button class="${mode === "live" ? "active" : ""}" onclick="setMode('live')">Live</button></div></div>
    <div class="chatlog big">${hoodOn ? (h || '<div class="small">No tool calls yet for this person.</div>') : (log || greet)}</div>${liveBar}`;
}
function setMode(m) {
  mode = m;
  document.getElementById("stepBtn").textContent = m === "live" ? "Use this question" : "Next step ▶";
  render();
}
/** Live: the step's message goes into the box, as that step's person, from the question's starting state. */
function useQuestion() {
  const run = RUNS.find((r) => r.id === runId) || runOf();
  const s = run.steps[Math.min(stepIdx, run.steps.length - 1)];
  role = s.staff; now = s.time; view = "work"; render();
  const box = document.getElementById("ask"); if (box) { box.value = s.message; box.focus(); }
}
async function liveSend() {
  const box = document.getElementById("ask");
  const text = box ? box.value.trim() : "";
  if (liveBusy || !text) return;
  if (!liveKey) { chats[role].push({ who: "ai", text: "Paste your Anthropic API key above first." }); render(); return; }
  if (live[role].length >= MAX_LIVE * 2) { chats[role].push({ who: "ai", text: "This chat is full. Press Restart question to start again." }); render(); return; }
  const id = role, s = TABLES.staff.find((x) => x.id === id);
  chats[id].push({ who: "me", text }); live[id].push({ role: "user", content: text });
  liveBusy = true; render();
  const session = { staff: id, name: s.name, job: s.job, role: s.role, today: `Tuesday 2 June 2026, ${F.hhmm(now)} Malaysia time (2026-06-02)`,
                    notices: store.get("notices").filter((n) => n.to === id).slice(-3).map((n) => n.text) };
  try {
    const out = await PSAgent.runTurn({ apiKey: liveKey, model: MODEL, system: PSPrompt.buildSystem(resourcesFor(id), session),
      tools: PSTools.createDesk(store, TABLES, { now, faults }).toolsFor(id), messages: live[id], self: s.name,
      callTool: async (name, input) => {
        const o = PSTools.createDesk(store, TABLES, { now, faults }).call(name, input, id);
        hood.unshift({ staff: id, tool: name, input, hook: o.hook });
        const pid = input.patient_id || (o.result.data && o.result.data.patient_id);
        if (pid) selected[id] = pid;
        return o;
      } });
    const [t, basis] = out.reply.split(/\nBasis: /);
    chats[id].push({ who: "ai", text: t, basis });
  } catch (e) {
    live[id].pop();
    chats[id].push({ who: "ai", text: "The assistant could not reply: " + (e && e.message ? e.message : String(e)) + " Check the key, or press Restart question." });
  } finally { liveBusy = false; render(); }
}
// Replay steps keep their scores in the status line; Live turns Next step into Use this question.
const replayStep = nextStep;
nextStep = function () {
  if (mode === "live") return useQuestion();
  replayStep();
  const run = RUNS.find((r) => r.id === runId);
  if (run && REC[run.id]) document.getElementById("now").innerHTML += badges(run, stepIdx);
};
const restart = startRun;
startRun = function () { restart(); for (const k of Object.keys(live)) live[k] = []; };
document.getElementById("stepBtn").onclick = () => nextStep();
