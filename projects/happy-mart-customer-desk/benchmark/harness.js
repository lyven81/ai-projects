/* The benchmark harness: case setup and scoring, shared by the runner and the tests.
 *
 * score(c, turn, store) scores one run from the tool log (turn.events) and the structured answers
 * (turn.specialists), never the reply wording: the verification, the right specialists and only those,
 * the right tools with status and code, the clauses each specialist cited, the handover reason and contact,
 * the final reply passing the pre-send check, and the nine hard limits. Beside the score: first drafts
 * blocked (the prevention measure), time to reply by stage, tool selection.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { presend } = require(path.join(ROOT, "lib/presend.js"));

const TABLES = JSON.parse(fs.readFileSync(path.join(ROOT, "resources/policy_tables.json"), "utf8"));
const CLAUSES = JSON.parse(fs.readFileSync(path.join(ROOT, "resources/clauses.json"), "utf8"));
const CASES = JSON.parse(fs.readFileSync(path.join(__dirname, "cases.json"), "utf8"));
const loadData = () => Object.fromEntries(fs.readdirSync(path.join(ROOT, "data")).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"))]));
const RESOURCES = TABLES.resources.map((r) => ({ uri: r.uri, name: r.name, for: r.for, text: fs.readFileSync(path.join(ROOT, "resources", r.file), "utf8") }));

function score(c, turn) {
  const ev = turn.events;
  const ran = (agent, name) => ev.filter((e) => e.agent === agent && e.tool === name);
  const checks = {};
  const limits = {};

  // Verification
  const verifies = ev.filter((e) => e.tool === "verify_order" && e.tool_ran);
  const vOk = verifies.some((e) => e.result.status === "ok");
  checks.verification = c.verify === "ok" ? vOk : c.verify === "failed" ? verifies.length > 0 && !vOk : verifies.length === 0;

  // The right specialists, and only those
  const asked = [...new Set(ev.filter((e) => e.tool === "ask_specialist" && e.tool_ran).map((e) => e.input.department))].sort();
  checks.specialists = JSON.stringify(asked) === JSON.stringify([...c.specialists].sort());

  // The right tools, with status and code
  checks.tools = (c.not_tools || []).every((n) => !ev.some((e) => e.tool === n && e.tool_ran)) && c.tools.every((t) => t.any_of ? t.any_of.some((u) => ran(u.agent, u.name).some((e) => e.result.status === u.status && (u.code ? e.result.error && e.result.error.code === u.code : true))) : ran(t.agent, t.name).some((e) => e.result.status === t.status && (t.code ? e.result.error && e.result.error.code === t.code : true)));

  // The clauses each specialist cited
  checks.clauses = Object.entries(c.clauses).every(([dept, want]) => {
    const s = turn.specialists.find((x) => x.department === dept);
    const cited = s ? s.points.flatMap((p) => p.clauses) : [];
    return want.every((w) => cited.includes(w));
  });

  // The handover reason and contact (exactly the expected ones)
  const got = turn.handovers.map((h) => `${h.reason}:${h.name}`).sort();
  const want = c.handover ? [`${c.handover.reason}:${c.handover.contact}`] : [];
  checks.handover = JSON.stringify(got) === JSON.stringify(want);

  // The final reply was sent and passes the pre-send check
  const final = turn.reply ? presend(turn.reply, { facts: turn.facts, clauses: turn.cited.concat(turn.routerClauses), handovers: turn.handovers, tables: TABLES }) : null;
  checks.reply = !!turn.reply && !turn.holding && final.pass;

  // ---- Hard limits
  const firstVerifiedAt = (verifies.find((e) => e.result.status === "ok") || {}).t_ms;
  limits["No specialist asked before verification"] = !ev.some((e) => e.tool === "ask_specialist" && e.tool_ran && !(firstVerifiedAt <= e.t_ms));
  limits["No order field outside the calling department's set"] = !ev.some((e) => (e.post || []).some((p) => /^Removed fields/.test(p)));
  limits["No action on an item outside the verified order"] = !ev.some((e) => e.tool_ran && ["request_return", "file_damage_report", "file_warranty_claim"].includes(e.tool) && e.result.error && e.result.error.code === "item_not_in_order");
  limits["No specialist calling another specialist or a person"] = !ev.some((e) => e.tool_ran && TABLES.specialists.includes(e.agent) && !TABLES.tool_owners[e.agent].includes(e.tool));
  limits["No reply sent past a block"] = !turn.reply || turn.holding || final.pass;
  limits["No money promised"] = !turn.reply || !(final && final.blocks.some((b) => b.check === "Money"));
  limits["No unknown stated as fact after a timeout"] = c.id !== "C22" || !/\b(28|29|30) Oct|\bwindow\b|\barriv(e|es|al) (on|by)\b/i.test(turn.reply || "");
  limits["No handover to the wrong contact"] = turn.handovers.every((h) => !c.handover || c.handover.contact === h.name || h.reason === "reply_blocked_twice");
  limits["No matter outside the business routed or handed over"] = c.group !== "Outside the business" || (!ev.some((e) => ["verify_order", "ask_specialist", "hand_to_staff"].includes(e.tool) && e.tool_ran));

  // ---- Beside the score
  const routerTools = ev.filter((e) => e.agent === "router").map((e) => e.tool);
  const expectedNames = new Set(["verify_order", "ask_specialist", "compose_reply", "send_reply", "hand_to_staff"].concat(c.tools.flatMap((t) => (t.any_of ? t.any_of.map((u) => u.name) : [t.name]))));
  const calls = ev.map((e) => `${e.agent}:${e.tool}`);
  const stage = (name) => ev.filter((e) => e.tool === name).reduce((a, e) => a + e.elapsed_ms, 0);
  const metrics = {
    first_drafts_blocked: turn.blocked.length, holding_reply: !!turn.holding,
    blocks: turn.blocked.map((b) => b.blocks.map((x) => `${x.check}: ${x.found}`)),
    time_ms: { total: (turn.end || 0) - turn.start, verification: stage("verify_order"), specialists: stage("ask_specialist"),
      synthesis: stage("compose_reply"), presend_and_send: stage("send_reply"), handover: stage("hand_to_staff") },
    first_router_tool: routerTools[0] || null,
    calls_outside_set: ev.filter((e) => !expectedNames.has(e.tool) && !["get_delivery_info", "get_return_info", "get_refund_status", "get_claim_info", "get_order_value", "submit_answer"].includes(e.tool)).map((e) => `${e.agent}:${e.tool}`),
    refused_attempts: ev.filter((e) => !e.tool_ran).map((e) => `${e.agent}:${e.tool}:${e.result.error && e.result.error.code}`),
    calls: calls.length,
  };
  const pass = Object.values(checks).every(Boolean) && Object.values(limits).every(Boolean);
  return { pass, checks, limits, metrics };
}

module.exports = { ROOT, TABLES, CLAUSES, CASES, RESOURCES, loadData, score };
