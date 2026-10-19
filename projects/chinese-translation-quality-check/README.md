# Chinese Translation Quality Check

Checks the Chinese version of a document against its English original before release, and hands the editor every proposed change to accept, edit or reject. Only the editor's decisions reach the Word file, as tracked changes and comments.

The sample is the Chinese version of a fictional listed company's quarterly report (Teras Laluan Logistics Berhad, first quarter ended 31 March 2026), with 20 defects planted for the benchmark: wrong figures and conversions, a dropped negation, a missing risk sentence, an added forecast, promotional tone, broken punctuation and terms that disagree with the glossary.

## How it works

1. **Glossary stage (fixed rules).** Every rendering the glossary lists as one to avoid is replaced by the approved term, as a tracked change in a copy of the translator's Word file. No model is asked: the glossary already settled these.
2. **Specialists (AI).** A coordinator sends each section to three specialists with one narrow job each: accuracy (omissions, mistranslations, additions), section (wording, fluency, structure, punctuation, quotation marks) and register (tone).
3. **Checks in code.** Every finding is checked by `tools.js`: the target exists, both the English and Chinese spans are really in that target, the category is allowed for that specialist, the cited source exists, the suggestion uses full-width punctuation, and the protected sponsor statement only ever receives accuracy corrections, never a change of wording or tone. A refused finding goes back with the exact error, up to two rounds.
4. **One box per fault.** The specialists work independently, so one fault is often flagged two or three times from different angles. Overlapping flags become one box that keeps every flag and carries one correction: the shared fix when they agree, or one change written to cover every flag when they differ, checked in code like any finding.
5. **Grader (AI, fresh context).** A separate reviewer marks every correction sound, doubtful or wrong. It never removes one.
6. **The editor decides.** On the review page, every finding is accepted, edited or rejected. An edit is checked by the same rules.
7. **Word file and summary.** Decided findings become tracked changes and comments in the Word file; a review summary counts what was found and decided.

The full run can go through the Message Batches API: one batch per section, results matched by `custom_id`, failed or cut-off requests redone live, then the same checks and grader.

## Results

Recorded on 19 Oct 2026 against `benchmark/Answer Key.md`, which was built from `sample/defects.json` before any run (results in `benchmark/results/`).

| Run | Defects caught | Boxes | Must findings on clean paragraphs |
|---|---|---|---|
| Live | 20 of 20 | 18 | 0 |
| Message Batches | 20 of 20 | 18 | 0 |

- By stage: accuracy 8 of 8, register 3 of 3, section 6 of 6, glossary stage 3 of 3, in both runs. Parity held: no defect was caught by one run only.
- Each run left one should finding on a clean paragraph, for the editor to judge (live P43, graded wrong; batch P16, graded doubtful).
- Word's accept-all and reject-all copies match the decided text and the original on all 48 targets (`spike/`).
- `benchmark/test_tools.mjs`: 64 tests of every rule and refusal, no key needed.
- Cost of every benchmark run together: USD 2.54 of the USD 5 cap.

Before real users it still needs a security review (access control, the key on a server, handling of unreleased reports), a named owner for monitoring runs and costs, and the team's approval.

## Run it with your own key

Requires Node.js 22 and Python 3 with `python-docx`. Your API key is billed for every request; use a key with a spending limit.

```
npm install
node sample/plant_defects.js        # the defect Chinese from sample/defects.json
python -I sample/build_sample_docx.py
node glossary_stage.js
node build_document.js
node benchmark/build_answer_key.js
node benchmark/test_tools.mjs        # no key needed
```

Put `ANTHROPIC_API_KEY=...` in `.env`, then:

```
node benchmark/run_benchmark.mjs --mode live    # every section live
node benchmark/run_benchmark.mjs --mode batch   # one batch per section on the Message Batches API
node benchmark/run_benchmark.mjs --parity       # compare the two
node review_server.js --open --findings benchmark/results/batch/findings
node write_docx.mjs --findings benchmark/results/batch/findings
node write_summary.mjs --findings benchmark/results/batch/findings
```

The benchmark stops once all runs together reach USD 5.

## Files

| Path | Role |
|---|---|
| `config/document.json` | Every rule that changes per document |
| `resources/` | Brief, glossary, house style |
| `sample/` | English source, correct Chinese, planted defects, the translator's Word file builder |
| `tools.js` | The tools and every rule, shared by the server, the batch path, the tests and the demo |
| `prompt.js`, `coordinator.js`, `grader.js`, `lib/` | Specialists, routing, grading, batch path, Word writer, decision layer |
| `review.html`, `review_server.js`, `build_demo.mjs` | The review page, its local server, the static demo |
| `benchmark/` | Answer key, tool tests, benchmark runner, results |
