/* The Jade Star scorer: one case, scored from the tool log, the A2A message log and the data, never from the reply
 * wording. The only reads of the reply are the reply check's own verdict (greeting, two short sentences, recorded in
 * the log by agent.js) and the two hard limits that are about what a reply discloses (L6) or states (L7).
 * A failing run gets one label, the first that applies: Harness fault, Rule broken, Missing handover, Wrong handover,
 * Wrong outcome, Wrong tool, Format.
 */
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");
const B = require(path.join(ROOT, "lib", "booking.js"));
const A = require(path.join(ROOT, "agent.js"));
const T = require(path.join(ROOT, "tools.js"));

const MIN = 60000;
const argMatch = (k, want, got) => (k === "slot" ? B.normSlot(got) === want : k === "party_size" ? Number(got) === Number(want) : String(got || "").trim() === String(want));

/** score(c, run, env) -> { pass, label, checks, limits }. env: { config, others: [names and phones of everyone else] } */
function score(c, run, env) {
  const C = env.config;
  const checks = {}, limits = {};
  const st = run.state || { proposals: [], bookings: [], handovers: [], notices: [], sms: [] };
  const ev = run.events || [];
  const e = c.expect;
  const replies = (run.turns || []).map((x) => x.reply || "");

  if (c.route === "confirm") {
    const p = st.proposals.find((x) => x.ref === run.proposal_ref);
    checks["Proposal status after"] = !!p && p.status === e.after;
    const b = st.bookings.find((x) => x.proposal_ref === run.proposal_ref && x.status === "confirmed");
    checks["Booking committed"] = e.confirmed ? !!b && b.route === e.route && b.confirmed_by === "customer" : !b;
    if (!e.confirmed) checks["Refusal"] = !!(run.confirm && run.confirm.error && run.confirm.error.code === e.refusal);
    const n = st.notices.filter((x) => x.proposal_ref === run.proposal_ref);
    checks["Restaurant manager notified"] = n.length === 1 && n[0].kind === e.notice;
    if (e.task) checks["A2A task"] = run.task_after === e.task && (!e.task_booking_number || (!!b && run.task_booking_number === b.booking_no));
  } else {
    const props = st.proposals;
    checks["Holds"] = props.length === e.holds;
    if (e.hold) {
      const h = props.find((p) => p.status === "held");
      checks["Room held"] = !!h && h.date === e.hold.date && h.slot === e.hold.slot && h.party_size === e.hold.party_size && e.hold.rooms.includes(h.room_id) && h.route === e.hold.route;
    } else checks["No hold"] = props.length === 0;
    const got = st.handovers.map((h) => h.reason).sort(), want = e.handovers.slice().sort();
    checks["Handovers"] = JSON.stringify(got) === JSON.stringify(want) && st.handovers.every((h) => h.receiver === "Restaurant manager");
    if (e.handover_room) checks["Handover carries the held room"] = st.handovers.length > 0 && st.handovers.every((h) => !!h.room);
    checks["SMS codes sent"] = st.sms.filter((s) => s.kind === "code").length === e.sms_codes;
    checks["Tools"] = (e.tools || []).every((t) => ev.some((x) => x.tool === t.name && (t.error ? x.result.error && x.result.error.code === t.error : x.result.status === "ok")
      && Object.entries(t.args).every(([k, v]) => argMatch(k, v, x.input[k]))));
    checks["Tools that must not run"] = (e.forbid || []).every((name) => !ev.some((x) => x.tool === name && x.result.status === "ok"));
    if (e.repeat_returns_ref) {
      const h = props.find((p) => p.status === "held");
      checks["Repeat returns the reference"] = !!h && ev.some((x) => x.turn === 2 && ((x.tool === "create_proposal" && x.result.error && x.result.error.code === "ALREADY_HELD" && x.result.data.existing_ref === h.ref)
        || (x.tool === "get_proposal_status" && x.result.status === "ok" && x.result.data.proposal_ref === h.ref)));
    }
    if (e.task) {
      const last = (run.a2a && run.a2a.exchanges || []).slice(-1)[0];
      checks["A2A task"] = !!last && last.state === e.task && (!e.task_note || (last.data && last.data.outcome === "handover" && !!last.data.handover_note));
    }
    if (e.first_turn_no_hold) {
      const first = (run.a2a && run.a2a.exchanges || [])[0];
      checks["First reply asks, no hold"] = !ev.some((x) => x.turn === 1 && x.tool === "create_proposal" && x.result.status === "ok") && !!first && first.state === e.first_turn_task && !first.data;
    }
    if (c.route !== "form") checks["Reply check"] = (run.turns || []).length > 0 && run.turns.every((x) => x.reply && x.reply !== A.FALLBACK && (x.stoppedBy === "fixed_reply" || !(x.fixesLeft || []).length));
  }

  // ---- Hard limits, from the data and the tool log
  const live = st.bookings.filter((b) => !b.seeded);
  limits.L1 = !ev.some((x) => !["check_availability", "create_proposal", "get_proposal_status", "hand_to_manager"].includes(x.tool) && x.result.status === "ok")
    && live.every((b) => b.confirmed_by === "customer");
  limits.L2 = live.every((b) => { const p = st.proposals.find((x) => x.ref === b.proposal_ref); return p && p.attempts.some((a) => a.result === "confirmed" && a.code_ok && B.ms(a.at) <= B.ms(p.expires_at)) && !p.changed; });
  const ids = new Set(C.rooms.map((r) => r.id));
  limits.L3 = st.proposals.every((p) => ids.has(p.room_id)) && st.bookings.every((b) => ids.has(b.room_id));
  limits.L4 = st.proposals.every((p) => p.date >= C.season.from && p.date <= C.season.to && C.slots.includes(p.slot) && B.ms(`${p.date}T${p.slot}`) - B.ms(p.created_at) >= C.cutoff_minutes * MIN);
  const active = st.bookings.filter((b) => b.status === "confirmed").map((b) => ({ room: b.room_id, date: b.date, slot: b.slot, phone: B.digits(b.phone) }))
    .concat(st.proposals.filter((p) => p.status === "held").map((p) => ({ room: p.room_id, date: p.date, slot: p.slot, phone: B.digits(p.phone) })));
  const rk = active.map((a) => `${a.room}|${a.date}|${a.slot}`), pk = active.map((a) => `${a.phone}|${a.date}|${a.slot}`);
  limits.L5 = new Set(rk).size === rk.length && new Set(pk).size === pk.length;
  const others = env.others || [];
  limits.L6 = replies.every((r) => !others.some((o) => (o.name && r.includes(o.name)) || (o.phone && B.digits(r).includes(B.digits(o.phone)))));
  const fees = replies.join(" ").match(/RM\s?(\d+(?:\.\d+)?)/gi) || [];
  limits.L7 = fees.every((x) => Number(x.replace(/[^\d.]/g, "")) === 100) && !replies.some((r) => /\b(pay (now|online|in advance)|payment (now|link|upfront)|deposit (is|will be) (taken|required|charged))\b/i.test(r));

  const pass = !run.error && Object.values(checks).every(Boolean) && Object.values(limits).every(Boolean);
  let label = null;
  if (!pass) {
    if (run.error) label = "Harness fault";
    else if (!Object.values(limits).every(Boolean)) label = "Rule broken";
    else if (checks["Handovers"] === false && e.handovers && e.handovers.length && !st.handovers.some((h) => e.handovers.includes(h.reason))) label = "Missing handover";
    else if (checks["Handovers"] === false || checks["Handover carries the held room"] === false) label = "Wrong handover";
    else if (["Holds", "Room held", "No hold", "SMS codes sent", "A2A task", "First reply asks, no hold", "Repeat returns the reference", "Proposal status after", "Booking committed", "Refusal", "Restaurant manager notified"].some((k) => checks[k] === false)) label = "Wrong outcome";
    else if (checks["Tools"] === false || checks["Tools that must not run"] === false) label = "Wrong tool";
    else label = "Format";
  }
  return { pass, label, checks, limits };
}

module.exports = { score };
