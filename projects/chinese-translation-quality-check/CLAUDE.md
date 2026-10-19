# Chinese Translation Quality Check

Checks the Chinese version of a document against its English original before release. A glossary stage corrects settled terms in code; three routed specialists (accuracy, section, register) propose findings; rules held in code check every finding; a fresh grader annotates them; an editor accepts, edits or rejects each one; only decided findings reach the Word file, as tracked changes and comments. Runs live or on the Message Batches API. Sample: a fictional logistics company's quarterly report (Teras Laluan Logistics Berhad, 1Q FYE2026), with a Chinese translation carrying 20 planted defects.

Status: built 19 Oct 2026. Local notes in `CLAUDE.local.md` (not tracked).

## The sample
- The sample company, its sponsor and every name are fictional, and every figure is invented.

## Layout
- `config/document.json`: every rule that changes per document (front-matter names, the protected passage F4, sections S01 to S03, the editor's name, words banned from the output). `lib/config.js` reads it with `resources/` (brief B1 to B4, glossary G01 to G30 with renderings to avoid, house style H1 to H8).
- `sample/`: `report_en.md` (source), `report_zh_correct.md` (answer reference, never reviewed), `defects.json` (the 20 defects) → `plant_defects.js` → `report_zh_defects.md` → `build_sample_docx.py` → `report_zh.docx` (the translator's file; not tracked, rebuilt).
- `glossary_stage.js`: avoided renderings replaced by the approved term as tracked changes in a copy of the docx → `run/stage/`. `build_document.js` pairs English and Chinese target by target (F1 to F4, P1 to P44; paragraphs mapped by order, headings skipped) → `run/document.json`.
- `tools.js`: the 6 tools and every rule, written once (target exists, both spans in the target's own text, category allowed per specialist, must or should, cited source exists, full-width punctuation except a comma between digits, protected passage accuracy corrections only, coordinator-only tools, edit check, banned wording). Loaded by `mcp_server.mjs`, the batch validator, the tests, the benchmark, the review server and the demo page.
- `prompt.js` (one frozen English prompt per specialist; findings in English, suggestions in Chinese), `lib/settings.js` (accuracy and section Sonnet 5.5 high; register and grader Opus 5.5 medium), `lib/claude.js`, `lib/review.js` (check, retry refused findings with the exact error up to 2 rounds), `coordinator.js` (live section run, gaps and failed requests re-delegated once, conflicts linked), `consolidator.js` (one box per fault: overlapping flags from several specialists grouped, every flag kept, one correction; the same fix taken as it is, different fixes combined into one change checked by tools.js checkCombined; founder, 19 Oct), `grader.js` (every box: sound, doubtful or wrong; never drops one).
- `lib/batch.js` + `batch/`: one batch per section, collected by custom_id; errored, expired, refused and cut-off requests redone live; then grader, coverage, conflicts.
- `lib/apply_decisions.js`: the decision gate, placement (end backwards, overlapping changes skipped) and the reviewed text at character level. One module for `write_docx.mjs`, `write_summary.mjs` (`lib/summary.js`) and the demo's Reviewed report, so they cannot disagree.
- `review.html`: the editor's page (Review, Reviewed report, Review summary, Terms, Failed checks, Accept rate). Served by `review_server.js` (decisions to `run/decisions/`), or built by `build_demo.mjs` into `demo.html` with the recorded batch run inlined and the visitor's decisions in their browser.
- `benchmark/`: `build_answer_key.js` (answer key from the defects, before any run), `test_tools.mjs` (no key), `run_benchmark.mjs` (live, batch, rescore, parity; USD 5 cap across all runs, `results/usage.json`), `score.js`; results in `benchmark/results/`.
- `spike/word_accept_reject.ps1` + `spike/check_writer.js`: Word's accept-all and reject-all copies must equal the clean and original text of every target.
- Launchers: `Prepare document.bat`, `Start batch.bat`, `Start review.bat`, `Open review.bat`.

## Rules that must hold
- A change reaches the Word file only with an editor's decision (accept or edit); a glossary correction counts as decided by the editor's standing decision.
- Inside the protected passage only an accuracy correction is allowed (founder, 19 Oct: a missing part is restored as a tracked change); never a change of wording or tone.
- The prompts and resources never name a planted defect or its wording; the benchmark measures the engine, not hints.

## After any change
1. `node glossary_stage.js && node build_document.js && node benchmark/test_tools.mjs` (no key). All must pass.
2. After a prompt or rule change: `node benchmark/run_benchmark.mjs --mode live` (key in `.env`), read sample findings even after a full score; never loosen a case to pass a wrong finding.
3. Any change to the writer or `lib/apply_decisions.js`: run `write_docx.mjs`, then `spike/word_accept_reject.ps1` on the output and `node spike/check_writer.js <file>`.
4. `node build_demo.mjs` after any change to `review.html`, the shared scripts or the results.
5. Commit: `git status`, stage files by name (never `git add .`), check nothing under `_plan/` is staged, commit. The pre-push hook runs the scan.
