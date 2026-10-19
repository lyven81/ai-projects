/* Apply the editor's decisions to the text, written once.
 *
 * Used by write_docx.mjs (the Word file), write_summary.mjs (the review summary) and, in the
 * browser, the demo page (the reviewed report), so the three can never disagree.
 *
 * gate(doc, findings, decisions, banned)
 *   Only findings the editor accepted or edited go further. An edit is re-checked (tools.js
 *   checkEdit). A finding in a protected passage or with no suggestion becomes a comment, never a
 *   change; an addition with no suggestion is a deletion (tools.js findingMode). Banned wording in the
 *   text, issue or reason is refused.
 * plan(doc, gateResult)
 *   Per target, from the end backwards; a change that overlaps one already placed in the same
 *   target is skipped and reported, as the Word writer does.
 * reviewed(doc, glossaryReport, planResult)
 *   Per target, the text as characters, each marked: kept, deleted or inserted by the glossary stage,
 *   deleted or inserted by the editor, with the comments on it. From that: the clean text (every
 *   change accepted), the original text (every change rejected) and runs for a tracked-changes view.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../tools.js"));
  else root.ApplyDecisions = factory(root.QualityCheckTools);
})(typeof self !== "undefined" ? self : this, function (tools) {
  "use strict";

  function gate(doc, findings, decisions, banned) {
    tools.indexDocument(doc);
    const changes = [], comments = [], refused = [], undecided = [], rejected = [];
    for (const f of findings) {
      const d = decisions[f.id];
      if (!d) { undecided.push(f.id); continue; }
      if (d.decision === "reject") { rejected.push(f.id); continue; }
      if (!["accept", "edit"].includes(d.decision)) { refused.push({ id: f.id, why: `unknown decision ${d.decision}` }); continue; }
      let text = f.suggestion;
      if (d.decision === "edit") {
        const c = tools.checkEdit(doc, f, d.text, banned);
        if (!c.ok) { refused.push({ id: f.id, why: c.error }); continue; }
        text = c.text;
      }
      const t = doc.byKey[f.target];
      if (!t || t.zh.slice(f.zh_start, f.zh_start + f.zh_span.length) !== f.zh_span) { refused.push({ id: f.id, why: "span no longer in the text" }); continue; }
      const w = tools.bannedWording(text, banned) || tools.bannedWording(f.issue, banned) || tools.bannedWording(f.reason, banned);
      if (w) { refused.push({ id: f.id, why: `banned wording: ${w}` }); continue; }
      const mode = tools.findingMode(doc, { ...f, suggestion: text });
      if (mode === "comment") comments.push({ ...f, decided: d });
      else changes.push({ ...f, text: mode === "delete" ? "" : text, decided: d });
    }
    return { changes, comments, refused, undecided, rejected };
  }

  function plan(doc, g) {
    const byTarget = {};
    const add = (kind, f) => (byTarget[f.target] = byTarget[f.target] || []).push({ kind, f, start: f.zh_start, end: f.zh_start + f.zh_span.length });
    g.changes.forEach((f) => add("change", f)); g.comments.forEach((f) => add("comment", f));
    const placed = {}, skipped = [];
    for (const [key, items] of Object.entries(byTarget)) {
      const done = [];
      for (const it of items.sort((a, b) => b.start - a.start || (a.kind === "comment") - (b.kind === "comment"))) {
        if (it.kind === "change" && done.some((d) => d.kind === "change" && it.start < d.end && d.start < it.end)) {
          skipped.push({ id: it.f.id, target: key, why: "overlaps a change already placed in this target" }); continue;
        }
        done.push(it);
      }
      placed[key] = done;   // end first: safe to apply in this order
    }
    return { placed, skipped };
  }

  /** Characters of the glossary stage's file: the translator's text with the glossary changes tracked. */
  function baseChars(before, changes) {
    const chars = []; let i = 0;
    const cs = changes.slice().sort((a, b) => a.start - b.start);
    for (const c of cs) {
      for (; i < c.start; i++) chars.push({ ch: before[i], st: "keep", notes: [] });
      for (const ch of c.from) chars.push({ ch, st: "gdel", notes: [], glossary: c.entry });
      for (const ch of c.to) chars.push({ ch, st: "gins", notes: [], glossary: c.entry });
      i = c.end;
    }
    for (; i < before.length; i++) chars.push({ ch: before[i], st: "keep", notes: [] });
    return chars;
  }
  const visible = (c) => c.st === "keep" || c.st === "gins" || c.st === "eins";

  /** Index of the k-th visible character (accepted view); k = count gives the position after the last. */
  function at(chars, k) {
    let seen = 0;
    for (let i = 0; i < chars.length; i++) if (visible(chars[i])) { if (seen === k) return i; seen++; }
    return chars.length;
  }

  function reviewed(doc, glossaryReport, p) {
    tools.indexDocument(doc);
    const out = {};
    for (const t of doc.targets) {
      const before = (glossaryReport.before && glossaryReport.before[t.key]) || t.zh;
      const chars = baseChars(before, (glossaryReport.changes || []).filter((c) => c.target === t.key));
      for (const it of p.placed[t.key] || []) {
        const a = at(chars, it.start), b = at(chars, it.end);
        const span = [];
        for (let i = a; i < b; i++) if (visible(chars[i])) span.push(i);
        if (it.kind === "change") {
          for (const i of span) { chars[i].st = chars[i].st === "gins" ? "gins-edel" : "edel"; chars[i].notes.push(it.f.id); }
          const last = span.length ? span[span.length - 1] + 1 : a;
          const ins = Array.from(it.f.text).map((ch) => ({ ch, st: "eins", notes: [it.f.id] }));
          chars.splice(last, 0, ...ins);
        } else {
          for (const i of span) chars[i].notes.push(it.f.id);
        }
      }
      // A glossary insertion the editor then deleted is shown as an editor deletion.
      for (const c of chars) if (c.st === "gins-edel") c.st = "edel";
      const runs = [];
      for (const c of chars) {
        const key = c.st + "|" + c.notes.join(",");
        const lastRun = runs[runs.length - 1];
        if (lastRun && lastRun.key === key) lastRun.text += c.ch;
        else runs.push({ key, st: c.st, notes: c.notes.slice(), text: c.ch });
      }
      runs.forEach((r) => delete r.key);
      out[t.key] = {
        clean: chars.filter(visible).map((c) => c.ch).join(""),
        original: chars.filter((c) => c.st === "keep" || c.st === "gdel" || c.st === "edel" && !c.glossary).map((c) => c.ch).join(""),
        runs,
      };
    }
    return out;
  }

  /** Everything at once: { gate, plan, reviewed }. */
  function applyAll(doc, glossaryReport, findings, decisions, banned) {
    const g = gate(doc, findings, decisions, banned);
    const p = plan(doc, g);
    return { gate: g, plan: p, reviewed: reviewed(doc, glossaryReport, p) };
  }

  return { gate, plan, reviewed, applyAll };
});
