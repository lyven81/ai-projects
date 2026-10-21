# Happy Mart Customer Desk (routing agent)

A customer service agent for a fictional online 3C store in Shah Alam, Selangor (about 1,200 products in four lines, about 2,600 orders from 1 Sep to 27 Oct 2026). A router verifies the order, sends each part of an enquiry to the department specialist that owns it, and only those, and a writer turns their answers into one reply. One shared PreToolUse hook and one shared PostToolUse hook sit around all 17 tools of all seven agents; the back end repeats the critical checks. Headline: a reply that would ask for photos of a damaged item, or promise what the policies do not, is blocked before the customer sees it.

## Layout
- `build_policies.py` -> `resources/`: the six department policies (CS1 to CS7, FP1 to FP4, RP1 to RP5, FN1, QP1 to QP5, MP1 to MP6) as `.md` (MCP resources) and `.html` (with how the assistant keeps each clause), the router workbook, five role sheets, the contact list (`.md` and `.html`), the campaign calendar page, `clauses.json`, `policy_tables.json` (contacts, handover sentences, tool owners, field sets per lookup, values, campaign days, Selangor holidays Sep to Dec 2026, the test "today"). Change a clause, a contact or a value here, nowhere else.
- `generate_data.py` (seed 42) -> `data/*.json`: catalogue, customers, orders, returns, refunds, and empty requests, claims, handovers, call_log. Money in sen, times as Unix seconds UTC. Fees follow FP1, MP1 to MP3; sale marks MP4 and MP5; delivery within FP2. Plants HM-100101 to HM-100124 for the cases and asserts them.
- `build_cases.py` -> `benchmark/cases.json` and `benchmark/Answer Key.html`: 26 cases in 8 groups, each with the message, the expected verification, the specialists (and no others), the tools with status and code, the clauses each specialist must cite, the handover, tools that must not run, and faults. `sample` lists one case per group.
- `lib/format.js`: the one result shape `{ tool, status, data, error, next_step, elapsed_ms }`, the codes, the specialist answer check, RM and Malaysia-time conversions. `lib/backend.js`: working days and windows, campaign and fee rules, the field set per lookup, the access and item checks repeated, pending writes, fault injection. `lib/presend.js`: the pre-send check (fixed values, dates and amounts, blocked claims, money, handovers, clauses).
- `hooks/pre_tool_use.js`, `hooks/post_tool_use.js`: the two shared hooks.
- `tools.js`: the 17 tools and `createDesk` (session, PreToolUse, tool, PostToolUse, call log); `compose_reply` groups the points into one paragraph per customer question.
- `mcp_server.mjs`, `.mcp.json`: stdio server, 13 resources and 17 tools. The session and the calling agent arrive in `_meta`, never from the model; the hook record goes back in `_meta.hook`. Env `HM_STATE`, `HM_NOW`, `HM_FAULTS`, `ANTHROPIC_API_KEY` (for the sub-agents).
- `prompts.js`, `agent.js`: the router (Sonnet 5.5, effort medium), five specialists as sub-agents (Sonnet 5.5, effort low, 20-second limit), the writer (Haiku 5.5, thinking off, write_reply forced). Sonnet 5.5 refuses a forced tool choice, so the router and specialists run on auto with one send-back. The writer returns one string per paragraph; code joins them by clause, so one question is never split.
- `assistant.template.html` -> `build_assistant.mjs` -> `assistant.html`: the founder's demo page. Two phones (customer, staff), replay with Play, Step, Restart and Full screen, live with the visitor's key, and the step log with a box per team: what the order record says, what the system worked out or checked, the store rule it followed.
- `desk.template.html` -> `build_desk.mjs` -> `desk.html`: the detailed two-panel view (chat and every hook record). Kept, not the founder's demo page.
- `benchmark/`: `harness.js` (scoring from the tool log, nine hard limits), `test_hooks.js` (H1 to H8 and a test per tool, no key), `test_mcp.mjs`, `run_benchmark.js`, `seeded_answers_3c.json` (H1), `results.json`, `results.md`, `sample.json`.
- Test calendar: Tuesday 27 October 2026, 10:00 Malaysia time, for every run and for live chat. Mon 26 Oct is a Selangor holiday.

## Rules that must hold
- No specialist is asked before the order is verified (CS1); 3 failed attempts lock verification (CS2).
- A lookup or request acts only on the verified order and an item in it; each lookup returns only its department's fields.
- No reply is sent past the pre-send check; a second block sends the holding reply and hands to Nurul Aina Rahim.
- The assistant never promises money (CS7), asks for evidence the policy does not ask for, or states an unknown as fact.
- Every handover names the person and the job title, by fixed reason, to the right contact.
- The reply answers only what the customer asked: one paragraph per question.
- Staff are named by name or job title, never he or she (the store manager sentence is the founder's own wording); replies are written as the company, we, never I. The writer is sent back once for either, by `PRONOUN` and `FIRST_PERSON` in `agent.js` (tested in `test_hooks.js`).

## After any change
1. `python build_policies.py && python generate_data.py && python build_cases.py` when a policy, the data or a case changes.
2. `node benchmark/test_hooks.js` and `node benchmark/test_mcp.mjs` (no key). All must pass.
3. `node benchmark/run_benchmark.js` (key from `ANTHROPIC_API_KEY` or `~/.env`; `--sample`, `--only C01,C16`, `--runs 3`, `--out name`). Hard-limit breaches must stay 0. Read a sample of conversations from every group even after a perfect score.
4. `node build_assistant.mjs` (and `node build_desk.mjs`), then check `assistant.html` through `python -m http.server` from the run folder root, replay and live, wide and narrow, full screen.
5. Do not edit `assistant.html`, `desk.html`, `data/` or `resources/` by hand; they are build outputs.
