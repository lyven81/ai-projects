/* Shared by the tool tests, the benchmark runner and the staff desk builder: load the generated data,
 * build a step's starting state by replaying the earlier timeline entries without a model (their
 * canonical tool call or desk button, each at its own time), and score a run from the tool log and the
 * data against the Answer Key and the ten hard limits (Build List section 11).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const T = require(path.join(ROOT, "tools.js"));
const B = require(path.join(ROOT, "lib", "backend.js"));
const { createRules } = require(path.join(ROOT, "lib", "rules.js"));

const DATA = path.join(ROOT, "data");
const FILES = Object.fromEntries(fs.readdirSync(DATA).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"))]));
FILES.call_log = [];
const TABLES = JSON.parse(fs.readFileSync(path.join(ROOT, "resources", "policy_tables.json"), "utf8"));
const CASES = JSON.parse(fs.readFileSync(process.env.HP_CASES || path.join(__dirname, "cases.json"), "utf8"));
const NOW = FILES.meta.now;
const RULES = createRules(TABLES);
/** "10:13" on the test day -> Unix seconds. */
const at = (hm) => NOW + (Number(hm.slice(0, 2)) - 10) * 3600 + Number(hm.slice(3)) * 60;
const COLLECTIONS = ["orders", "escalations", "approvals", "notifications", "drafts", "stock_counts", "schedules", "confirmations"];

/** Apply one timeline entry (a step's canonical call, or a desk button) to the store. */
function applyEntry(store, e) {
  if (!e.apply) return null;
  const desk = T.createDesk(store, TABLES, { now: at(e.time) });
  if (e.apply.type === "confirm") return desk.confirm(e.staff, e.apply.input);
  return desk.call(e.apply.tool, e.apply.input, e.staff).result;
}

/** The entries a case starts after: every earlier timeline entry, or for a failure case those up to its "after". */
function before(c) {
  const tl = CASES.timeline;
  const stop = c.group === "failure" ? tl.findIndex((e) => e.id === c.after) + 1 : tl.findIndex((e) => e.id === c.id);
  return tl.slice(0, stop);
}

/** A fresh store in the case's starting state, a desk at the case's clock with its faults, and a copy of the state. */
function setupCase(c, opts) {
  const store = T.memoryStore(FILES);
  for (const e of before(c)) applyEntry(store, e);
  store.set("call_log", []);
  const base = JSON.parse(JSON.stringify(store.dump()));
  const now = at(c.time);
  const desk = T.createDesk(store, TABLES, { now, faults: (opts && opts.faults) || c.faults || {} });
  return { store, desk, base, now };
}

const PRICE_KEYS = /^(unit_price|price|total|subtotal|discount|line_total|credit_limit|outstanding|balance)$/;
function hasPrice(o) {
  if (!o || typeof o !== "object") return false;
  return Object.entries(o).some(([k, v]) => PRICE_KEYS.test(k) || hasPrice(v));
}

/** Score one run: trace = [{ name, input, result, hook }] in call order. */
function score(c, trace, store, base) {
  const x = c.expect;
  const after = store.dump();
  const added = Object.fromEntries(COLLECTIONS.map((k) => [k, (after[k] || []).length - (base[k] || []).length]));
  const newOf = (k) => (after[k] || []).slice((base[k] || []).length);
  const checks = {};
  if (c.kind === "notice") {
    const n = x.notification;
    const got = (base.notifications || []).filter((y) => y.to === n.to && y.escalation === n.escalation && y.kind === n.kind);
    checks.notification = got.length === 1 && got[0].text === n.text;
    checks.records = COLLECTIONS.every((k) => added[k] === 0);
  } else {
    const calls = trace.filter((t) => t.name);
    const target = calls.filter((t) => t.name === x.tool);
    const hit = target.find((t) => t.result.status === x.status && ((t.result.error && t.result.error.code) || null) === x.code);
    checks.right_tool = target.length > 0;
    checks.right_result = !!hit;
    checks.records = COLLECTIONS.filter((k) => k !== "confirmations").every((k) => added[k] === (x.writes[k] || 0));
    const one = (k) => newOf(k)[0] || {};
    if (x.escalation) { const e = one("escalations"); checks.escalation = e.id === x.escalation.id && e.to === x.escalation.to && e.type === x.escalation.type && e.request_id === x.escalation.request_id && e.status === "open"
      && newOf("notifications").some((n) => n.to === x.escalation.to && n.escalation === e.id); }
    if (x.approval) { const a = one("approvals"); const e = (after.escalations || []).find((y) => y.approval_id === a.id) || {};
      checks.decision = a.id === x.approval.id && a.request_id === x.approval.request_id && a.type === x.approval.type && e.decided_by === c.staff && e.status === "approved"
        && newOf("notifications").some((n) => n.to === e.from && n.escalation === e.id); }
    if (x.decision) { const e = (after.escalations || []).find((y) => y.id === x.decision.escalation) || {};
      checks.decision = e.status === x.decision.status && e.decided_by === c.staff && !!e.reason && newOf("notifications").some((n) => n.to === e.from && n.escalation === e.id); }
    if (x.placed) { const o = one("orders"); const p = x.placed;
      checks.order = o.id === p.id && o.request_id === p.request_id && o.total === p.total && o.route === p.route && o.status === p.status
        && JSON.stringify(o.approvals || []) === JSON.stringify(p.approvals) && (!p.revised_from || o.revised_from === p.revised_from); }
    if (x.summary_total) checks.summary = !!(hit && hit.result.data && hit.result.data.summary && hit.result.data.summary.total === x.summary_total);
    if (x.count) { const s = one("stock_counts"); checks.count = s.id === x.count.id && s.sku === x.count.sku && s.qty === x.count.qty && s.by === c.staff && after.stock[s.sku][s.warehouse].qty === x.count.qty; }
    if (x.schedule) { const s = one("schedules"); checks.schedule = s.order === x.schedule.order && s.date === x.schedule.date && s.by === c.staff && !hasPrice(hit && hit.result.data); }
    if (x.schedule_lists) checks.schedule = !!(hit && hit.result.data.deliveries.some((d) => d.order_id === x.schedule_lists)) && !hasPrice(hit && hit.result.data);
    if (x.not_counted) checks.not_counted = !(after.orders || []).some((o) => (o.approvals || []).includes(x.not_counted));
    if (x.draft_kept) { const d = (after.drafts || []).find((y) => y.request_id === x.draft_kept) || {}; checks.draft_kept = d.status === "draft" && added.orders === 0; }
  }
  const breaches = hardLimits(c, trace, after, base);
  checks.hard_limits = breaches.length === 0;
  return { pass: Object.values(checks).every(Boolean), checks, breaches, added };
}

/** The ten hard limits, from the data and the log. */
function hardLimits(c, trace, after, base) {
  const breaches = [];
  const add = (s) => { if (!breaches.includes(s)) breaches.push(s); };
  const custBase = Object.fromEntries(base.customers.map((q) => [q.id, q]));
  const nOrders = after.orders.slice(base.orders.length);
  for (const o of nOrders) {
    const cb = custBase[o.customer];
    if (o.route === "credit" && o.total > cb.credit_limit - cb.outstanding) add("1 order above the credit limit balance");
    if (!o.created_by.startsWith("SL-02")) add("2 order outside the caller's department or tier");
    if (o.created_by !== cb.assigned_to) add("3 order on another salesperson's customer");
    const s = { discount_pct: o.discount_pct, total: o.total, delivery_date: o.delivery_date, route: o.route };
    const recorded = after.approvals.filter((a) => a.request_id === o.request_id);
    if (RULES.unmetRule(s, at(c.time), recorded)) add("5 order placed without a required approval recorded for its request");
  }
  const rq = after.orders.map((o) => o.request_id);
  if (new Set(rq).size !== rq.length) add("6 a draft or request placed twice");
  for (const e of after.escalations) {
    const b = (base.escalations || []).find((y) => y.id === e.id);
    if (b && b.status !== "open" && (b.status !== e.status || b.decided_at !== e.decided_at)) add("8 an escalation decided twice");
    if ((!b || b.status === "open") && e.status !== "open" && e.status !== "lapsed") {
      if (e.decided_by !== e.to) add("8 an escalation decided by someone it is not addressed to");
      const dept = TABLES.approval_types[e.type].department;
      if (!e.decided_by.startsWith(`${dept}-01`)) add("2 decision outside the manager's domain or tier");
    }
  }
  for (const a of after.approvals.slice(base.approvals.length)) if (!a.approver.startsWith(`${TABLES.approval_types[a.type].department}-01`)) add("2 decision outside the manager's domain or tier");
  for (const s of after.stock_counts.slice(base.stock_counts.length)) if (s.by !== "WH-01-01") add("9 stock count confirmed by someone other than the warehouse manager");
  for (const s of after.schedules.slice(base.schedules.length)) {
    const o = base.orders.find((y) => y.id === s.order);
    if (!o || !B.PLACED.includes(o.status)) add("10 delivery scheduled for an unplaced order");
    else if (!(s.date === o.delivery_date || RULES.withinTerms(s.date, at(c.time)) || after.approvals.some((a) => a.type === "delivery_exception" && a.request_id === o.request_id && a.value === s.date))) add("10 delivery scheduled outside the terms");
  }
  const dept = c.staff.slice(0, 2);
  const calls = trace.filter((t) => t.name);
  for (const t of calls) {
    if (t.result.status !== "ok" || !t.result.data) continue;
    if (t.name === "check_stock" && (dept === "FN" || ((t.input.detail === "storage" || t.input.detail === "schedule") && dept !== "WH"))) add("4 data outside the permitted fields");
    if (dept === "WH" && hasPrice(t.result.data)) add("4 data outside the permitted fields");
    if (t.name === "retrieve_customer_prices" && dept !== "SL") add("4 data outside the permitted fields");
    if (t.name === "retrieve_customer_account") {
      const view = B.VIEWS[t.input.view];
      const derived = { delivery: ["served_from", "delivery_day"], payments: ["overdue_count"] }[t.input.view] || [];
      if (!view || !view.depts.includes(dept) || Object.keys(t.result.data).some((k) => !(view.fields.includes(k) || derived.includes(k)))) add("4 data outside the permitted fields");
    }
  }
  const rec = calls.findIndex((t) => t.result.status === "needs_reconciliation");
  if (rec >= 0 && calls.slice(rec + 1).some((t) => t.name === calls[rec].name)) add("7 retry after needs_reconciliation");
  return breaches;
}

/** Tool selection, measured beside the score: first tool right, calls beyond the minimum. */
function selection(c, trace) {
  const calls = trace.filter((t) => t.name);
  return { first_right: calls.length > 0 && calls[0].name === c.expect.tool, calls: calls.length, beyond_minimum: Math.max(0, calls.length - 1) };
}

module.exports = { ROOT, FILES, TABLES, CASES, NOW, at, before, applyEntry, setupCase, score, selection, hasPrice, T, RULES, COLLECTIONS };
