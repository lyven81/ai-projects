// Layout 1, Side-by-side (founder's mockup), adapted: the shared engine of the option D preview with
// a task sidebar on the left, the conversation in the centre with the question picker docked under it,
// and Current work on the right (the visit strip and the role's view of the patient). One screen: the page never scrolls; a long column scrolls inside its card.
function handovers() {
  const T = store.get("tasks").filter((t) => (t.kind === "query" || t.kind === "handover") && (t.to === role || t.from === role));
  const row = (t, dir) => { const p = pat(t.patient); const fresh = dir === "in" ? t.status === "open" : t.status === "answered";
    return `<div class="task" onclick="pick('${t.patient}')"><span class="tag ${fresh ? "ready" : ""}">${dir === "in" ? (t.status === "open" ? "NEW · TO ANSWER" : "ANSWERED") : (t.status === "answered" ? "ANSWER BACK" : "WITH " + NAMES[t.to].toUpperCase())}</span>
      <strong>${esc(p.name)} · ${t.reason}</strong><div class="small">${esc(dir === "in" ? t.question : (t.answer || t.question))}</div></div>`; };
  const inn = T.filter((t) => t.to === role).reverse().map((t) => row(t, "in")).join("");
  const out = T.filter((t) => t.from === role).reverse().map((t) => row(t, "out")).join("");
  return `<div class="label">Handovers · received</div>${inn || '<div class="small">None yet.</div>'}<div class="label">Handovers · sent</div>${out || '<div class="small">None yet.</div>'}`;
}
function sidebar() {
  const q = role !== "PH-01" ? store.get("queue").filter((x) => x.date === today() && (x.status === "waiting" || x.status === "with_gp")).map((x) => { const p = pat(x.patient);
    return `<div class="item" onclick="pick('${x.patient}')"><b>${esc(p.name)}</b> <span class="pill ${x.status === "with_gp" ? "" : "grey"}">${x.status === "with_gp" ? "With the GP" : "Waiting"}</span></div>`; }).join("") : "";
  const WORD = { check: "Prescription to check", bill: "Bill to prepare", document: "Document to prepare", follow_up: "Follow-up to book" };
  const tasks = store.get("tasks").filter((t) => t.to === role && t.status === "open" && WORD[t.kind]).reverse().map((t) => { const p = pat(t.patient);
    const held = t.kind === "check" && store.get("tasks").some((x) => x.kind === "query" && x.consultation === t.consultation && x.status === "open");
    return `<div class="item" onclick="pick('${t.patient}')"><b>${WORD[t.kind]}${t.document ? " · " + (t.document === "mc" ? "MC" : "referral") : ""}</b><div class="small">${esc(p.name)} · ${F.hhmm(t.created)}${held ? " · held" : ""}</div></div>`; }).join("");
  return `<div class="card"><h3 style="margin-bottom:2px">My workspace</h3><div class="cap">Your queue, tasks and handovers from other staff.</div>
    <div class="subtabs" style="margin:0 0 6px"><button class="${view === "work" ? "active" : ""}" onclick="view='work';render()">Patients</button><button class="${view === "day" ? "active" : ""}" onclick="view='day';render()">${STAFF[role].view2}</button></div>
    ${role === "FD-01" ? `<div class="label">Today's bookings</div>${store.get("appointments").filter((a) => a.start.slice(0, 10) === today() && a.status !== "cancelled").map((a) => { const p = pat(a.patient); return `<div class="item" onclick="pick('${a.patient}')"><b>${a.start.slice(11, 16)} ${esc(p.name)}</b> <span class="pill grey">${a.status}</span></div>`; }).join("") || '<div class="small">No bookings today.</div>'}` : ""}
    ${role !== "PH-01" ? `<div class="label">Queue</div>${q || '<div class="small">Nobody waiting.</div>'}${role === "GP-01" ? `<button class="btn" onclick="act('schedule',{action:'call_next'})">Call next</button>` : ""}` : ""}
    <div class="label">My tasks</div>${tasks || '<div class="small">Nothing waiting on you.</div>'}${handovers()}</div>`;
}
function chatCard() {
  const mode = hoodMode[role] || "chat";
  const log = (chats[role] || []).map((m) => `<div class="msg ${m.who}">${esc(m.text).replace(/\n/g, "<br>")}${m.basis ? `<span class="basis">Basis: ${esc(m.basis)}</span>` : ""}</div>`).join("");
  const h = hood.filter((x) => x.staff === role).slice(0, 4).map((x) => `<div class="label">${x.tool} · ${x.input.action} · ${x.hook.result.status}${x.hook.result.error ? " " + x.hook.result.error.code : ""}</div>${(x.hook.pre.checks || []).map((c) => `<div class="check ${c.pass ? "ok" : "no"}">${esc(c.check)} (${c.clause})</div>`).join("")}${(x.hook.post || []).map((c) => `<div class="small">PostToolUse: ${esc(c)}</div>`).join("")}<pre>${esc(JSON.stringify(x.hook.result, null, 1))}</pre>`).join("");
  const s = TABLES.staff.find((x) => x.id === role);
  return `<div class="row1"><div><h3 style="margin:0">Clinic assistant</h3><div class="cap">The staff message and the assistant's reply appear here.</div></div>
    <div class="toggle"><button class="${mode === "chat" ? "active" : ""}" onclick="setHood('chat')">Chat</button><button class="${mode === "hood" ? "active" : ""}" onclick="setHood('hood')">Under the hood</button><span class="pill">Replay</span></div></div>
    <div class="chatlog big">${mode === "chat" ? (log || `<div class="msg ai">Hello ${esc(s.first)}. Choose a question above and press Next step. This is a replay on the real tools.</div>`) : (h || '<div class="small">No tool calls yet for this person.</div>')}</div>`;
}
function currentWork() {
  if (view === "day") { const cap = { "FD-01": "Today's payments, then close the cash drawer.", "GP-01": "Money and panel bills, for the owner to review.", "PH-01": "Medicine stock levels, view only." }[role];
    return dayView().replace(/<h3>(.*?)<\/h3>/, (m, h) => `<h3 style="margin-bottom:2px">${h}</h3><div class="cap">${cap}</div>`); }
  return centre().replace('<div class="card">', '<div class="card"><h3 style="margin-bottom:2px">Current work</h3><div class="cap">Where this visit is, and the patient\'s details.</div>');
}
function render() {
  const s = TABLES.staff.find((x) => x.id === role);
  document.getElementById("signed").innerHTML = `<div class="signwho">${esc(s.name)} · ${esc(s.job)}<div class="signnote">Nothing typed in the chat changes who is signed in.</div></div><select onchange="setRole(this.value)">${["FD-01", "GP-01", "PH-01"].map((u) => `<option value="${u}" ${u === role ? "selected" : ""}>${NAMES[u]} · ${STAFF[u].tab}</option>`).join("")}</select>`;
  document.getElementById("left").innerHTML = sidebar();
  document.getElementById("chat").innerHTML = chatCard();
  document.getElementById("right").innerHTML = currentWork();
  const log = document.querySelector(".chatlog.big"); if (log) log.scrollTop = log.scrollHeight;
}
