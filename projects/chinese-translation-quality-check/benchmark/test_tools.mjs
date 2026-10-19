// Tool tests with no API key: every tool, every refusal, the glossary stage, the decision layer and
// the Word writer, on the sample.
// Usage: node benchmark/test_tools.mjs   (after glossary_stage.js and build_document.js)

import { createRequire } from "node:module";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const T = require("../tools.js");
const { glossaryMatches } = require("../glossary_stage.js");
const { applyAll } = require("../lib/apply_decisions.js");
const { summarise, renderSummary } = require("../lib/summary.js");
const { Docx } = require("../lib/docx_writer.js");
const { docxTargets } = require("../lib/docx_targets.js");
const { checkAnswer } = require("../lib/review.js");
const { ROOT, RUN, config, glossary, sources } = require("../lib/config.js");

const doc = T.indexDocument(JSON.parse(readFileSync(join(RUN, "document.json"), "utf8")));
const report = JSON.parse(readFileSync(join(RUN, "stage", "glossary_report.json"), "utf8"));
const S = sources();
let pass = 0, fail = 0;
const check = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log(`FAIL ${name}${extra ? ": " + extra : ""}`); } };
const refusal = (r, cat) => r && r.ok === false && r.error.category === cat;

// ---------- validateFinding ----------
const good = { target: "P5", category: "mistranslation", en_span: "There were no unusual items", zh_span: "出现影响", issue: "The negation is lost.", suggestion: "并无任何影响",
               reason: "The English says there were none.", source: "B1", severity: "must" };
const v = T.validateFinding(doc, S, good, "accuracy");
check("valid finding passes", v.ok, JSON.stringify(v.error));
check("finding keeps its offset", v.ok && doc.byKey.P5.zh.slice(v.finding.zh_start, v.finding.zh_start + 4) === "出现影响");
check("unknown target", refusal(T.validateFinding(doc, S, { ...good, target: "P99" }, "accuracy"), "target_not_found"));
check("category not allowed for the specialist", refusal(T.validateFinding(doc, S, { ...good, category: "register" }, "accuracy"), "category_not_allowed"));
check("unknown specialist", refusal(T.validateFinding(doc, S, good, "terminology"), "not_assigned"));
check("severity must or should", refusal(T.validateFinding(doc, S, { ...good, severity: "could" }, "accuracy"), "invalid_severity"));
check("English span must exist", refusal(T.validateFinding(doc, S, { ...good, en_span: "There were many unusual items" }, "accuracy"), "span_not_in_english"));
check("Chinese span must exist", refusal(T.validateFinding(doc, S, { ...good, zh_span: "出现了很多" }, "accuracy"), "span_not_in_chinese"));
check("unknown source", refusal(T.validateFinding(doc, S, { ...good, source: "G99" }, "accuracy"), "unknown_source"));
check("source must be an id", refusal(T.validateFinding(doc, S, { ...good, source: "common sense" }, "accuracy"), "unknown_source"));
check("half-width punctuation refused", refusal(T.validateFinding(doc, S, { ...good, suggestion: "并无任何影响,即" }, "accuracy"), "half_width_punctuation"));
check("issue and reason required", refusal(T.validateFinding(doc, S, { ...good, reason: " " }, "accuracy"), "missing_field"));
const f4 = { target: "F4", category: "wording", en_span: "The Sponsor has not reviewed the contents of this report", zh_span: "保荐人未审阅本报告内容", issue: "x", suggestion: "保荐人并未审阅本报告内容",
             reason: "y", source: "H7", severity: "should" };
check("no wording edit in the protected passage", refusal(T.validateFinding(doc, S, f4, "section"), "protected_passage"));
const f4acc = T.validateFinding(doc, S, { ...f4, category: "omission", suggestion: "保荐人未审阅本报告内容，对其准确性或完整性不承担任何责任" }, "accuracy");
check("accuracy correction in the protected passage is a change", f4acc.ok && f4acc.finding.comment_only === false && T.findingMode(doc, f4acc.finding) === "change");
check("finding with no suggestion is a comment", T.validateFinding(doc, S, { ...good, suggestion: "" }, "accuracy").finding.comment_only === true);
check("front matter resolves", T.resolveTarget(doc, "f2") && T.resolveTarget(doc, "17").key === "P17");
check("a punctuation finding must cover every half-width mark in its sentence", refusal(T.validateFinding(doc, S, { ...good, target: "P32", category: "punctuation", en_span: "for the current quarter", zh_span: "盈利保证,因此", suggestion: "盈利保证，因此" }, "section"), "half_width_left") && T.validateFinding(doc, S, { ...good, target: "P32", category: "punctuation", en_span: "for the current quarter", zh_span: "盈利保证,因此,不列示", suggestion: "盈利保证，因此，不列示" }, "section").ok);
check("punctuation hook", T.normalisePunctuation("因此,不(列)示:") === "因此，不（列）示：");
check("punctuation hook keeps a thousands separator", T.normalisePunctuation("增加1,507万令吉,即") === "增加1,507万令吉，即");
check("a figure with a thousands separator is not half-width punctuation", T.validateFinding(doc, S, { ...good, target: "P17", en_span: "RM86.42 million", zh_span: "8,462万令吉", suggestion: "8,642万令吉" }, "accuracy").ok);
check("a half-width comma after a figure is refused", refusal(T.validateFinding(doc, S, { ...good, suggestion: "并无任何影响1,即" }, "accuracy"), "half_width_punctuation"));

// ---------- the tools ----------
let state = {};
const wb = T.createWorkbench({ doc, sources: S, store: { load: () => JSON.parse(JSON.stringify(state)), save: (s) => { state = s; } } });
const ctx = { caller: "accuracy", assigned: [1, 2, 3, 4, 5] };
const pairs = wb.call("get_pairs", { from: 2, to: 3 }, ctx);
check("get_pairs returns the range with one neighbour each side", pairs.ok && pairs.paragraphs.map((p) => p.target).join() === "P1,P2,P3,P4" && pairs.paragraphs[0].context_only);
check("get_pairs front matter", wb.call("get_pairs", { from: 0, to: 0 }, ctx).paragraphs.length === 4);
check("get_pairs marks the protected passage", wb.call("get_pairs", { from: 0, to: 0 }, ctx).paragraphs[3].protected.length === 1);
check("get_pairs out of range", refusal(wb.call("get_pairs", { from: 40, to: 60 }, ctx), "target_not_found"));
const rec = wb.call("record_finding", good, ctx);
check("record_finding", rec.ok && rec.id === "F0001");
check("record_finding refuses a duplicate", refusal(wb.call("record_finding", good, ctx), "duplicate"));
check("record_finding outside the assignment", refusal(wb.call("record_finding", { ...good, target: "P23", en_span: "immediate preceding quarter", zh_span: "去年同期" }, ctx), "not_assigned"));
check("record_finding applies the punctuation hook", wb.call("record_finding", { ...good, zh_span: "影响", suggestion: "影响,即" }, ctx).ok && state.findings[1].suggestion === "影响，即");
check("mark_done", wb.call("mark_done", { n: 5 }, ctx).ok && state.coverage.accuracy.includes(5));
check("mark_done outside the assignment", refusal(wb.call("mark_done", { n: 9 }, ctx), "not_assigned"));
check("coordinator tools refused to a specialist", ["get_coverage", "request_recheck", "flag_conflict"].every((n) => refusal(wb.call(n, { n: 5, specialist: "accuracy", reason: "x", a: "F0001", b: "F0002", note: "x" }, ctx), "coordinator_only")));
const co = { caller: "coordinator" };
check("get_coverage", wb.call("get_coverage", {}, co).coverage.accuracy.includes(5));
check("request_recheck once", wb.call("request_recheck", { n: 5, specialist: "section", reason: "x" }, co).ok && refusal(wb.call("request_recheck", { n: 5, specialist: "section", reason: "x" }, co), "already_rechecked"));
check("flag_conflict on overlapping findings", wb.call("flag_conflict", { a: "F0001", b: "F0002", note: "x" }, co).ok);
check("unknown tool", refusal(wb.call("rewrite_paragraph", {}, ctx), "unknown_tool"));

// ---------- checkAnswer (batch validator) ----------
const ans = checkAnswer(doc, S, { specialist: "accuracy", from: 1, to: 10, front: true }, { findings: [good, { ...good, target: "P23" }], done: [1, 2, 3, 5] });
check("checkAnswer keeps valid, refuses out of range, finds gaps", ans.accepted.length === 1 && ans.refused.length === 1 && ans.gaps.join() === "4,6,7,8,9,10");

// ---------- glossary stage ----------
check("glossary stage: six changes, the planted ones", report.changes.map((c) => `${c.target}:${c.from}`).join() === "P9:营业额,P11:最后一公里配送,P17:营业额,P20:最后一公里配送,P27:特拉斯,P41:特拉斯");
check("longest avoided rendering wins", glossaryMatches("最后一公里配送", glossary.entries).length === 1);
const correct = require("../lib/sample_md.js").targets(require("../lib/sample_md.js").parse(join(ROOT, "sample", "report_zh_correct.md")));
check("glossary stage changes nothing in the correct translation", Object.values(correct).every((t) => glossaryMatches(t, glossary.entries).length === 0));

// ---------- decisions, summary ----------
const fx = (id, target, zh_span, suggestion, extra = {}) => { const t = doc.byKey[target]; return { id, target, n: t.n, kind: t.kind, specialist: "accuracy", category: "mistranslation", severity: "must", en_span: "x", zh_span, zh_start: t.zh.indexOf(zh_span), issue: "i", reason: "r", source: "B1", suggestion, comment_only: !suggestion, ...extra }; };
const F = [fx("S01-F001", "P17", "8,462万令吉", "8,642万令吉"), fx("S01-F002", "P17", "大幅飙升", "增加"), fx("S01-F003", "P17", "收入8,462", "收入8,000"),
           fx("S01-F004", "F4", "保荐人未审阅本报告内容。", "保荐人未审阅本报告内容，对其准确性或完整性不承担任何责任。", { category: "omission" }), fx("S01-F005", "P5", "出现影响", "并无任何影响"), fx("S01-F006", "P10", "生意很火，", ""),
           fx("S02-F001", "P31", "预计全年盈利将增长三成。", "", { category: "addition", comment_only: false })];
const D = { "S01-F001": { decision: "accept" }, "S01-F002": { decision: "edit", text: "增加" }, "S01-F003": { decision: "accept" }, "S01-F004": { decision: "accept" },
            "S01-F005": { decision: "reject" }, "S01-F006": { decision: "edit", text: "AI 说" }, "S02-F001": { decision: "accept" } };
const A = applyAll(doc, report, F, D, config.banned_in_output);
check("gate: rejected, banned wording refused", A.gate.rejected.includes("S01-F005") && A.gate.refused.some((r) => r.id === "S01-F006" && /banned|not allowed/.test(r.why)));
check("plan: overlapping change skipped", A.plan.skipped.map((s) => s.id).join() === "S01-F003");
check("reviewed P17 clean text", A.reviewed.P17.clean === doc.byKey.P17.zh.replace("8,462万令吉", "8,642万令吉").replace("大幅飙升", "增加"), A.reviewed.P17.clean);
check("reviewed P17 original is the translator's text", A.reviewed.P17.original === report.before.P17, A.reviewed.P17.original);
check("reviewed P17 shows the glossary change", A.reviewed.P17.runs.some((r) => r.st === "gdel" && r.text === "营业额") && A.reviewed.P17.runs.some((r) => r.st === "gins" && r.text === "收入"));
check("reviewed F4: the missing words restored", A.reviewed.F4.clean.endsWith("保荐人未审阅本报告内容，对其准确性或完整性不承担任何责任。"));
check("reviewed P5 unchanged after a reject", A.reviewed.P5.clean === doc.byKey.P5.zh);
check("an accepted addition with no suggestion deletes the words", A.reviewed.P31.clean === doc.byKey.P31.zh.replace("预计全年盈利将增长三成。", "") && A.reviewed.P31.runs.some((r) => r.st === "edel" && r.notes.includes("S02-F001")));
check("finding modes", T.findingMode(doc, F[6]) === "delete" && T.findingMode(doc, F[3]) === "change" && T.findingMode(doc, F[5]) === "comment" && T.findingMode(doc, F[0]) === "change");
check("an addition with no suggestion in the protected passage stays a comment", T.findingMode(doc, { ...F[3], category: "addition", suggestion: "" }) === "comment");
const sm = summarise(doc, report, [{ id: "S01", findings: F, failed: [], failedRequests: [] }], D, A);
check("summary counts", sm.findings === 7 && sm.decided === 7 && sm.written.changes === 4 && sm.written.comments === 0 && sm.glossary.length === 6, JSON.stringify(sm.written));
check("summary renders", /Glossary stage/.test(renderSummary(sm)) && !/—/.test(renderSummary(sm)));
check("edit check refuses half-width and empty", !T.checkEdit(doc, F[0], " ", []).ok && T.checkEdit(doc, F[0], "8,642万令吉", []).ok);

// ---------- Word writer round trip (no Word needed: accepted view read back) ----------
const dir = mkdtempSync(join(tmpdir(), "ctqc-"));
mkdirSync(join(dir, "findings")); mkdirSync(join(dir, "decisions"));
writeFileSync(join(dir, "findings", "S01.json"), JSON.stringify({ findings: F.filter((f) => f.id.startsWith("S01")) }));
writeFileSync(join(dir, "findings", "S02.json"), JSON.stringify({ findings: F.filter((f) => f.id.startsWith("S02")) }));
writeFileSync(join(dir, "decisions", "S01.json"), JSON.stringify(D));
writeFileSync(join(dir, "decisions", "S02.json"), JSON.stringify(D));
const out = join(dir, "reviewed.docx");
execFileSync(process.execPath, [join(ROOT, "write_docx.mjs"), "--findings", join(dir, "findings"), "--decisions", join(dir, "decisions"), "--out", out], { cwd: ROOT });
const back = await Docx.open(readFileSync(out));
const texts = Object.fromEntries(docxTargets(back, Object.keys(config.front_matter)).map((t) => [t.key, t.text]));
check("Word file: accepted view of P17 matches the clean text", texts.P17 === A.reviewed.P17.clean, texts.P17);
check("Word file: the deletion in P31 is applied", texts.P31 === A.reviewed.P31.clean, texts.P31);
check("Word file: original view of P17 is the translator's text", back.originalText(docxTargets(back, Object.keys(config.front_matter)).find((t) => t.key === "P17").p) === report.before.P17);
const xml = await (await require("jszip").loadAsync(readFileSync(out))).file("word/comments.xml").async("string");
check("Word file: comments by the editor", /w:author="Editor"/.test(xml) && !/w:author="(?!Editor)/.test(xml));

// ---------- one box per fault ----------
const p10 = (id, specialist, category, zh_span, suggestion) => ({ ...fx(id, "P10", zh_span, suggestion), specialist, category });
const G = [p10("A", "register", "register", "生意很火，", ""), p10("B", "accuracy", "addition", "货运代理生意很火，仍是最大分部", "货运代理仍是最大分部"), fx("C", "P5", "出现影响", "并无任何影响")];
const groups = T.groupOverlapping(G);
check("overlapping flags group, accuracy first", groups.length === 2 && groups[0].map((f) => f.id).join() === "B,A");
const narrow = T.checkCombined(doc, groups[0], { zh_span: "生意很火", suggestion: "", issue: "x", reason: "y" }, []);
check("a combined change must cover every flagged span", refusal(narrow, "span_does_not_cover"));
const box = T.checkCombined(doc, groups[0], { zh_span: "货运代理生意很火，仍是最大分部", suggestion: "货运代理仍是最大分部", issue: "x", reason: "y" }, []);
check("a combined change keeps every flag", box.ok && box.box.flags.length === 2 && box.box.flags[1].specialist === "register" && T.findingMode(doc, box.box) === "change");
check("a change may not leave two marks side by side", refusal(T.checkCombined(doc, [fx("Q", "P33", "不可扣税所以实际税率为24.01%略高于24%的法定税率", "x")], { zh_span: "不可扣税所以实际税率为24.01%略高于24%的法定税率", suggestion: "不可扣税。", issue: "x", reason: "y" }, []), "doubled_punctuation"));
check("a finding may not leave two marks side by side", refusal(T.validateFinding(doc, S, { ...good, target: "P8", en_span: "No dividend was paid", zh_span: "并无派发股息", suggestion: "并未派发股息。" }, "accuracy"), "doubled_punctuation") && T.validateFinding(doc, S, { ...good, target: "P8", en_span: "No dividend was paid", zh_span: "并无派发股息", suggestion: "并未派发股息" }, "accuracy").ok);
check("a combined change goes through the punctuation hook", T.checkCombined(doc, groups[0], { zh_span: "货运代理生意很火，仍是最大分部", suggestion: "货运代理;仍是", issue: "x", reason: "y" }, []).box.suggestion === "货运代理；仍是");
check("a combined change refuses banned wording", refusal(T.checkCombined(doc, groups[0], { zh_span: "货运代理生意很火，仍是最大分部", suggestion: "货运代理仍是最大分部", issue: "AI fix", reason: "y" }, ["AI"]), "banned_wording"));

console.log(`test_tools: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
