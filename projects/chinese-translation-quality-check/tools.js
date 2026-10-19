/* Chinese Translation Quality Check: the tools and every rule, written once.
 *
 * Loaded by the MCP server (live path), the batch validator, the tool tests, the benchmark, the
 * review server and, in the browser, the demo page, so a finding or an edit passes or fails by the
 * same rule wherever it was made. Nothing here writes to the Word file; only an editor's decision
 * does (write_docx.mjs, behind the decision gate).
 *
 * Rules held in code, not in the prompt:
 *   - a finding targets a real paragraph (P1 to P44) or front-matter item (F1 to F4), and its English
 *     and Chinese spans exist in that target's own text
 *   - the category is on the fixed list and allowed for the calling specialist; severity is must or should
 *   - the cited source exists: a glossary entry (G01), a house style rule (H1) or a brief point (B1)
 *   - suggested Chinese uses full-width punctuation; a punctuation finding leaves no half-width mark in its sentence
 *   - inside a protected passage only an accuracy finding is allowed (a correction, never a change of wording or tone)
 *   - an addition with no suggestion deletes its span; any other finding with no suggestion is a comment
 *   - coverage, recheck and conflict tools are for the coordinator only
 * Every refusal: { ok: false, error: { category, retryable, message } }.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.QualityCheckTools = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CATEGORIES = ["omission", "mistranslation", "addition", "wording", "fluency", "structure", "register", "punctuation", "quotation"];
  const ALLOWED = {
    accuracy: ["omission", "mistranslation", "addition"],
    section: ["wording", "fluency", "structure", "punctuation", "quotation"],
    register: ["register"],
  };
  const ACCURACY = ALLOWED.accuracy;
  const SPECIALISTS = Object.keys(ALLOWED);
  // Half-width marks in Chinese text, except a comma or full stop between digits (8,642万令吉, 24.01%): H1.
  const HALF_WIDTH = /(?<!\d),|,(?!\d)|[;:!?()]/;
  const FULL = { ",": "，", ";": "；", ":": "：", "!": "！", "?": "？", "(": "（", ")": "）" };

  const err = (category, message, retryable = true) => ({ ok: false, error: { category, retryable, message } });
  const normSpace = (s) => String(s || "").replace(/\s+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();
  const overlap = (a, b) => a.start < b.end && b.start < a.end;

  /** The punctuation hook: half-width marks in suggested Chinese become full-width before saving;
   *  a comma between digits is a thousands separator and stays as it is. */
  function normalisePunctuation(s) {
    return String(s || "").replace(/[,;:!?()]/g, (c, i, str) => (c === "," && /\d/.test(str[i - 1] || "") && /\d/.test(str[i + 1] || "") ? c : FULL[c]));
  }

  /** Index a document once: byKey and byN for fast lookup. */
  function indexDocument(doc) {
    if (!doc.byKey) {
      Object.defineProperty(doc, "byKey", { value: Object.fromEntries(doc.targets.map((t) => [t.key, t])), enumerable: false });
      Object.defineProperty(doc, "byN", { value: Object.fromEntries(doc.targets.filter((t) => t.n).map((t) => [t.n, t])), enumerable: false });
    }
    return doc;
  }

  /** "P12", "p12", "12" or "F4" -> the target, or null. */
  function resolveTarget(doc, target) {
    const t = String(target || "").trim().toUpperCase();
    const key = /^\d+$/.test(t) ? `P${t}` : t;
    return doc.byKey[key] || null;
  }

  /** Does a cited source exist? Accepts G01, H1, B1. */
  function sourceExists(sources, cited) {
    const s = String(cited || "").trim();
    if (/^G\d{2}$/.test(s)) return sources.glossary.includes(s);
    if (/^H\d{1,2}$/.test(s)) return sources.style.includes(s);
    if (/^B\d$/.test(s)) return sources.brief.includes(s);
    return false;
  }

  /**
   * findingMode(doc, finding) -> "change" | "delete" | "comment"
   * What an accepted finding does to the text: a suggestion replaces the span; an addition with no
   * suggestion deletes the added words, except in a protected passage, where a deletion is never
   * guessed and it stays a comment; any other finding with no suggestion is a comment. (Only accuracy
   * findings reach a protected passage at all: validateFinding.) One rule for the gate, the Word writer
   * and the pages.
   */
  function findingMode(doc, f) {
    const t = doc.byKey[f.target];
    const span = { start: f.zh_start, end: f.zh_start + String(f.zh_span || "").length };
    if (f.suggestion) return "change";
    if (t && t.protected.some((s) => overlap(s, span))) return "comment";
    return f.category === "addition" || (f.flags || []).some((x) => x.category === "addition") ? "delete" : "comment";
  }

  /** Two marks side by side at the edges of a change (不可扣税。。, or a deletion between two marks)? */
  const MARK = /[。，；：！？、]/;
  function doubledMark(text, start, end, replacement) {
    const before = text[start - 1] || "", after = text[end] || "";
    const r = String(replacement || "");
    if (!r) return MARK.test(before) && MARK.test(after) ? before + after : null;
    if (MARK.test(r[r.length - 1]) && MARK.test(after)) return r[r.length - 1] + after;
    if (MARK.test(r[0]) && MARK.test(before)) return before + r[0];
    return null;
  }

  /** The target's text after this one finding alone is applied; null for a comment. */
  function resultText(doc, f) {
    const mode = findingMode(doc, f);
    if (mode === "comment") return null;
    const t = doc.byKey[f.target].zh;
    return t.slice(0, f.zh_start) + (mode === "delete" ? "" : f.suggestion) + t.slice(f.zh_start + f.zh_span.length);
  }

  /**
   * groupOverlapping(findings) -> [[finding, ...], ...]
   * Specialists work independently, so one fault is often flagged by several of them from different
   * angles (an added phrase that is also casual wording). Findings on the same target whose Chinese
   * spans overlap, directly or through another, form one group: one box for the editor, one change.
   * Groups keep the order of their first finding; within a group, specialist order (accuracy,
   * section, register).
   */
  function groupOverlapping(findings) {
    const rank = (f) => SPECIALISTS.indexOf(f.specialist);
    const ov = (a, b) => a.target === b.target && a.zh_start < b.zh_start + b.zh_span.length && b.zh_start < a.zh_start + a.zh_span.length;
    const groups = [], used = new Set();
    for (const f of findings) {
      if (used.has(f)) continue;
      const g = [f]; used.add(f);
      for (let i = 0; i < g.length; i++) for (const x of findings) if (!used.has(x) && ov(g[i], x)) { g.push(x); used.add(x); }
      groups.push(g.sort((a, b) => rank(a) - rank(b)));
    }
    return groups;
  }

  /**
   * checkCombined(doc, group, change, banned) -> { ok, box } | error
   * The one change for a group of flags: zh_span is in the target and covers every flagged span, the
   * suggestion uses full-width punctuation and no banned wording, and a protected passage only takes
   * it when every flag is an accuracy flag. The box keeps every flag; its category, specialist and
   * source are the first flag's, its severity the highest.
   */
  function checkCombined(doc, group, change, banned) {
    const t = doc.byKey[group[0].target];
    const lo = Math.min(...group.map((f) => f.zh_start)), hi = Math.max(...group.map((f) => f.zh_start + f.zh_span.length));
    const zhSpan = String(change.zh_span || "");
    let at = -1;
    for (let i = t.zh.indexOf(zhSpan); zhSpan && i >= 0; i = t.zh.indexOf(zhSpan, i + 1)) if (i <= lo && i + zhSpan.length >= hi) { at = i; break; }
    if (at < 0) return err("span_does_not_cover", `zh_span must be text from ${t.key} that covers every flagged span, from 「${t.zh.slice(lo, hi)}」 at least`);
    const suggestion = normalisePunctuation(change.suggestion);
    if (HALF_WIDTH.test(suggestion)) return err("half_width_punctuation", "the suggestion uses half-width punctuation; use full-width marks");
    const dbl = doubledMark(t.zh, at, at + zhSpan.length, suggestion);
    if (dbl) return err("doubled_punctuation", `the change would leave "${dbl}" in ${t.key}: the text around zh_span already has its own mark; drop the mark from the suggestion or take it into zh_span`);
    const w = bannedWording(suggestion + " " + (change.issue || ""), banned); if (w) return err("banned_wording", `wording not allowed in the output: ${w}`);
    if (!String(change.issue || "").trim()) return err("missing_field", "issue is required");
    const inProtected = t.protected.some((s) => s.start < at + zhSpan.length && at < s.end);
    if (inProtected && group.some((f) => !ACCURACY.includes(f.category))) return err("protected_passage", "only accuracy corrections in a protected passage", false);
    const lead = group[0];
    const box = { ...lead, zh_span: zhSpan, zh_start: at, suggestion, issue: String(change.issue).trim(), reason: String(change.reason || lead.reason).trim(),
                  severity: group.some((f) => f.severity === "must") ? "must" : "should", flags: group.map(flagOf) };
    delete box.grader;
    box.comment_only = findingMode(doc, box) === "comment";
    return { ok: true, box };
  }
  const flagOf = (f) => ({ specialist: f.specialist, category: f.category, severity: f.severity, en_span: f.en_span, zh_span: f.zh_span,
                           issue: f.issue, reason: f.reason, source: f.source, suggestion: f.suggestion });

  /**
   * validateFinding(doc, sources, finding, specialist) -> { ok, finding } | error
   * Shared by record_finding (live) and the batch validator.
   */
  function validateFinding(doc, sources, f, specialist) {
    if (!SPECIALISTS.includes(specialist)) return err("not_assigned", `unknown specialist ${specialist}`, false);
    const tgt = resolveTarget(doc, f.target);
    if (!tgt) return err("target_not_found", `target ${f.target} does not exist; use P1 to P${doc.paragraphs} or F1 to F${doc.targets.length - doc.paragraphs}`);
    if (!CATEGORIES.includes(f.category) || !ALLOWED[specialist].includes(f.category))
      return err("category_not_allowed", `category ${f.category} is not allowed for the ${specialist} specialist; allowed: ${ALLOWED[specialist].join(", ")}`);
    if (!["must", "should"].includes(f.severity)) return err("invalid_severity", "severity must be must or should; optional suggestions are not reported");
    const enSpan = String(f.en_span || "").trim();
    if (!enSpan || !normSpace(tgt.en).includes(normSpace(enSpan)))
      return err("span_not_in_english", `en_span is not in the English of ${tgt.key}; copy it exactly`);
    const zhSpan = String(f.zh_span || "");
    const at = zhSpan ? tgt.zh.indexOf(zhSpan) : -1;
    if (at < 0) return err("span_not_in_chinese", `zh_span is not in the Chinese of ${tgt.key}; copy it exactly`);
    if (!sourceExists(sources, f.source))
      return err("unknown_source", `source ${f.source} does not exist; cite a glossary entry (G01), a house style rule (H1) or a brief point (B1)`);
    const suggestion = String(f.suggestion || "");
    if (HALF_WIDTH.test(suggestion)) return err("half_width_punctuation", "suggested Chinese uses half-width punctuation; use full-width marks");
    if (!String(f.issue || "").trim() || !String(f.reason || "").trim()) return err("missing_field", "issue and reason are required");
    const span = { start: at, end: at + zhSpan.length };
    const dbl = (suggestion || f.category === "addition") && doubledMark(tgt.zh, span.start, span.end, suggestion);
    if (dbl) return err("doubled_punctuation", `the change would leave "${dbl}" in ${tgt.key}: the text around zh_span already has its own mark; drop the mark from the suggestion or take it into zh_span`);
    // A punctuation finding fixes the whole sentence: no half-width mark may be left outside its span.
    if (f.category === "punctuation") {
      const a = Math.max(tgt.zh.lastIndexOf("。", at - 1), tgt.zh.lastIndexOf("！", at - 1), tgt.zh.lastIndexOf("？", at - 1)) + 1;
      const ends = ["。", "！", "？"].map((c) => tgt.zh.indexOf(c, span.end)).filter((i) => i >= 0);
      const b = ends.length ? Math.min(...ends) + 1 : tgt.zh.length;
      const sentence = tgt.zh.slice(a, b), re = new RegExp(HALF_WIDTH.source, "g"); let m;
      while ((m = re.exec(sentence))) {
        const i = a + m.index;
        if (i < span.start || i >= span.end) return err("half_width_left", `another half-width mark "${m[0]}" is left in the same sentence at ${tgt.zh.slice(Math.max(a, i - 4), i + 5)}; widen zh_span to cover every wrong mark and correct them all`);
      }
    }
    const inProtected = tgt.protected.some((s) => overlap(s, span));
    if (inProtected && !ACCURACY.includes(f.category))
      return err("protected_passage", `${tgt.key}: the span is inside a protected passage; no ${f.category} edit there (only an accuracy correction)`, false);
    const finding = {
      target: tgt.key, n: tgt.n, kind: tgt.kind, specialist, category: f.category, severity: f.severity,
      en_span: enSpan, zh_span: zhSpan, zh_start: at, issue: String(f.issue).trim(), suggestion,
      reason: String(f.reason).trim(), source: String(f.source).trim(),
    };
    finding.comment_only = findingMode(doc, finding) === "comment";
    return { ok: true, finding };
  }

  /**
   * checkEdit(doc, finding, text, banned) -> { ok, text } | { ok: false, error }
   * The editor's own wording for a finding: full-width punctuation, not empty, the span still in the
   * text, no banned wording. Used by the review server and, in the browser, the demo page.
   */
  function checkEdit(doc, f, text, banned) {
    const t = normalisePunctuation(text);
    if (!t.trim()) return { ok: false, error: "the edited text is empty" };
    if (HALF_WIDTH.test(t)) return { ok: false, error: "use full-width punctuation" };
    const tgt = doc.byKey[f.target];
    if (!tgt || !tgt.zh.includes(f.zh_span)) return { ok: false, error: "the span is no longer in the text" };
    const w = bannedWording(t, banned); if (w) return { ok: false, error: `wording not allowed in the output: ${w}` };
    return { ok: true, text: t };
  }

  /** The output wording check: none of the configured words in text meant for the reader of the file. */
  function bannedWording(text, banned) {
    const s = String(text || "");
    for (const w of banned || []) {
      const re = /^[A-Za-z]+$/.test(w) ? new RegExp(`\\b${w}\\b`, "i") : null;
      if (re ? re.test(s) : s.includes(w)) return w;
    }
    return null;
  }

  // ---------- tool definitions (MCP and live) ----------
  const FINDING_PROPS = {
    target: { type: "string", description: "P1 to P44, or F1 to F4 for the front matter" },
    category: { type: "string", enum: CATEGORIES },
    en_span: { type: "string", description: "The English words the finding rests on, copied exactly" },
    zh_span: { type: "string", description: "The Chinese words at issue, copied exactly from the target" },
    issue: { type: "string" },
    suggestion: { type: "string", description: "Suggested Chinese replacing zh_span; empty for a comment only" },
    reason: { type: "string" },
    source: { type: "string", description: "A glossary entry G01, a house style rule H1, or a brief point B1" },
    severity: { type: "string", enum: ["must", "should"] },
  };
  const TOOL_DEFINITIONS = [
    { name: "get_pairs", description: "Paragraphs from..to with their English and Chinese, the paragraph before and after for context, and any protected passage marked. Front matter: from = 0, to = 0.",
      input_schema: { type: "object", additionalProperties: false, required: ["from", "to"], properties: { from: { type: "integer" }, to: { type: "integer" } } } },
    { name: "record_finding", description: "Record one finding. Checked in code; a refusal says exactly what to fix.",
      input_schema: { type: "object", additionalProperties: false, required: Object.keys(FINDING_PROPS), properties: FINDING_PROPS } },
    { name: "mark_done", description: "Record that the calling specialist finished a paragraph.",
      input_schema: { type: "object", additionalProperties: false, required: ["n"], properties: { n: { type: "integer" } } } },
    { name: "get_coverage", description: "Coordinator only: which paragraphs each specialist has done, and which requests failed.",
      input_schema: { type: "object", additionalProperties: false, required: [], properties: {} } },
    { name: "request_recheck", description: "Coordinator only: send a paragraph back to a specialist with a reason, once.",
      input_schema: { type: "object", additionalProperties: false, required: ["n", "specialist", "reason"],
        properties: { n: { type: "integer" }, specialist: { type: "string", enum: SPECIALISTS }, reason: { type: "string" } } } },
    { name: "flag_conflict", description: "Coordinator only: link two findings that disagree on the same words, for the editor. It never settles them.",
      input_schema: { type: "object", additionalProperties: false, required: ["a", "b", "note"],
        properties: { a: { type: "string" }, b: { type: "string" }, note: { type: "string" } } } },
  ];

  /**
   * createWorkbench({ doc, sources, store }) -> { tools, call(name, input, ctx) }
   *   sources: { glossary: [ids], style: [ids], brief: [ids] }
   *   store:   { load(): state, save(state) }; state = { findings, coverage, rechecks, conflicts }
   *   ctx:     { caller: "accuracy" | "section" | "register" | "coordinator", assigned: [n] }
   */
  function createWorkbench(opts) {
    const doc = indexDocument(opts.doc);
    const sources = opts.sources;
    const store = opts.store;
    const last = doc.paragraphs;

    function call(name, input, ctx) {
      const caller = (ctx && ctx.caller) || "";
      const state = store.load();
      state.findings = state.findings || []; state.coverage = state.coverage || {};
      state.rechecks = state.rechecks || []; state.conflicts = state.conflicts || [];
      const done = (result) => { store.save(state); return result; };
      const coordinatorOnly = () => caller !== "coordinator" ? err("coordinator_only", `${name} is for the coordinator only`, false) : null;
      const pair = (t, contextOnly) => ({ target: t.key, context_only: contextOnly, heading: t.heading_en || undefined, en: t.en, zh: t.zh,
                                          protected: t.protected.length ? t.protected.map((s) => t.zh.slice(s.start, s.end)) : undefined });

      switch (name) {
        case "get_pairs": {
          const from = Number(input.from), to = Number(input.to);
          if (from === 0 && to === 0) return { ok: true, paragraphs: doc.targets.filter((t) => !t.n).map((t) => pair(t, false)) };
          if (!(from >= 1 && to <= last && from <= to)) return err("target_not_found", `range must be inside 1 to ${last}`);
          const out = [];
          for (let n = Math.max(1, from - 1); n <= Math.min(last, to + 1); n++) out.push(pair(doc.byN[n], n < from || n > to));
          return { ok: true, paragraphs: out };
        }
        case "record_finding": {
          const f = Object.assign({}, input, { suggestion: normalisePunctuation(input.suggestion) });   // punctuation hook
          const v = validateFinding(doc, sources, f, caller);
          if (!v.ok) return v;
          if (ctx.assigned && v.finding.n && !ctx.assigned.includes(v.finding.n)) return err("not_assigned", `${v.finding.target} is not assigned to the ${caller} specialist in this request`);
          const dup = state.findings.find((x) => x.target === v.finding.target && x.category === v.finding.category && x.zh_span === v.finding.zh_span && x.specialist === caller);
          if (dup) return err("duplicate", `already recorded as ${dup.id}`, false);
          const id = `F${String(state.findings.length + 1).padStart(4, "0")}`;
          state.findings.push(Object.assign({ id, at: new Date().toISOString() }, v.finding));
          return done({ ok: true, id, comment_only: v.finding.comment_only });
        }
        case "mark_done": {
          const n = Number(input.n);
          if (!doc.byN[n]) return err("target_not_found", `paragraph ${n} does not exist`);
          if (!SPECIALISTS.includes(caller)) return err("not_assigned", "only a specialist marks paragraphs done", false);
          if (ctx.assigned && !ctx.assigned.includes(n)) return err("not_assigned", `paragraph ${n} is not assigned to the ${caller} specialist in this request`);
          (state.coverage[caller] = state.coverage[caller] || []).includes(n) || state.coverage[caller].push(n);
          return done({ ok: true });
        }
        case "get_coverage": {
          const c = coordinatorOnly(); if (c) return c;
          return { ok: true, coverage: Object.fromEntries(SPECIALISTS.map((s) => [s, (state.coverage[s] || []).slice().sort((a, b) => a - b)])),
                   failed: state.failed || [] };
        }
        case "request_recheck": {
          const c = coordinatorOnly(); if (c) return c;
          if (!doc.byN[Number(input.n)]) return err("target_not_found", `paragraph ${input.n} does not exist`);
          if (state.rechecks.some((r) => r.n === Number(input.n) && r.specialist === input.specialist)) return err("already_rechecked", "each paragraph goes back to a specialist once", false);
          state.rechecks.push({ n: Number(input.n), specialist: input.specialist, reason: String(input.reason || "") });
          return done({ ok: true });
        }
        case "flag_conflict": {
          const c = coordinatorOnly(); if (c) return c;
          const a = state.findings.find((x) => x.id === input.a), b = state.findings.find((x) => x.id === input.b);
          if (!a || !b) return err("finding_not_found", "both findings must exist");
          const sa = { start: a.zh_start, end: a.zh_start + a.zh_span.length }, sb = { start: b.zh_start, end: b.zh_start + b.zh_span.length };
          if (a.target !== b.target || !overlap(sa, sb)) return err("no_overlap", "the two findings are not on the same words", false);
          state.conflicts.push({ a: a.id, b: b.id, note: String(input.note || "") });
          return done({ ok: true });
        }
        default:
          return err("unknown_tool", `no tool named ${name}`, false);
      }
    }
    return { tools: TOOL_DEFINITIONS, call };
  }

  return { CATEGORIES, ALLOWED, SPECIALISTS, createWorkbench, validateFinding, findingMode, resultText, groupOverlapping, checkCombined, checkEdit, resolveTarget, sourceExists,
           normalisePunctuation, bannedWording, indexDocument, TOOL_DEFINITIONS };
});
