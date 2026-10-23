# Sang Kancil Specialist Clinic staff assistant

A staff assistant for a fictional private paediatric clinic in Selangor: four staff (Dr Aisyah Rahman PD-01-01, lead paediatrician and infants under 1; Dr Daniel Ong PD-02-01, ages 1 to 12; Dr Priya Nair PD-02-02, ages 13 to 17; Nurul Huda FD-02-01, clinic clerk), about 120 patients. The agent (Claude Haiku 5.5) only chooses which of eight tools to call. One shared PreToolUse hook decides before every tool runs, one shared PostToolUse hook applies policy to every result, and the back end repeats the critical checks. The verified staff ID decides who can read what and who can decide what. The founder's seven policy and schedule files in the working copy root are the source; where anything else disagrees, they win.

## Layout
- `sources/` copies of the seven founder files. `build_policies.py` -> `resources/`: Clinic (CP-01 to CP-15), Clinical (CL), Operations (OP) and Billing (BP) policies, Fee Schedule, Clinic Formulary, Immunisation Schedule, Clinic Hours and Rota, as `.md` (MCP resources `policy://clinic|clinical|operations|billing`, `reference://fee-schedule|formulary|immunisation-schedule|clinic-hours-and-rota`) and `.html`; `clauses.json`; `policy_tables.json` (staff, age bands, sessions, rota, Selangor holidays, request types including policy_question, fees, formulary profiles). Change a clause or a table in the founder file, then rebuild; nowhere else.
- `generate_data.py` (seed 42) -> `data/*.json`. Money in sen, times as Unix seconds UTC. Plants and asserts Aiman SK-P-0001, Hana SK-P-0002, Mei Xin SK-P-0003, Ryan SK-P-0004, Adam SK-P-0005, Arjun SK-P-0006 (invoice SK-INV-00008, RM 185).
- `build_cases.py` -> `benchmark/cases.json` and `benchmark/Answer Key.html`: 22 questions in 7 categories (3 each, 4 in Policy gaps), each as all 4 staff, plus 4 failure runs: 92 runs. Run IDs read `Q<question>-<staff ID>` (for example `Q6.4-PD-01-01`). Notice-only runs (questions 3.1, 3.4, 5.1, 5.3, 5.5 and 7.1 for the person the work goes to) check the code-written notice with no model call.
- `lib/format.js`: the one result shape `{ tool, status, data, error, next_step }` (status ok, refused, error or pending; `next_step` names person, job title, staff ID, clause, request ID, and `say`, a code-written reply), RM and Malaysia-time conversions. `lib/rules.js`: staff lookup, bands, rota, prescription checks (formulary, weight, dose, allergy). `lib/backend.js`: the data layer (access by view and patient with the decline sentence, requests and their owners, actions, notices, policy questions, the lead's direct waiver, fault injection).
- `hooks/pre_tool_use.js`, `hooks/post_tool_use.js`: the two shared hooks. Dr Aisyah's capacity (specialist or lead) is recorded on every call (CP-03).
- `tools.js`: the eight tools offered by role (CP-11) and `createDesk`. Loaded by the MCP server, the tests, the benchmark and the pages.
- `mcp_server.mjs`, `.mcp.json`: stdio server, 8 resources and 8 tools. The staff ID arrives in `_meta.staff`, never from the model. The Fee Schedule is listed and served only to FD-02-01 and PD-01-01 (as lead). Env `SK_STATE`, `SK_NOW`, `SK_FAULTS`.
- `prompt.js`, `agent.js`: the prompt (reply rules a to f with one example per level; notices for the signed-in person) and the loop (`tool_choice` "any" first round, "auto" fallback counted; `next_step.say` shown as is; `replyFixes` checks the reply and sends it back at most twice; `FIXED` holds the founder's booking-decline sentence).
- Pages (build outputs): `staff-desk.template.html` -> `node build_assistant.mjs --template staff-desk.template.html --out staff-desk.html` (the founder's desk layout, the live demo: left-menu categories replay the questions, Chat / Under the hood toggle); `staff.template.html` -> `build_staff.mjs` -> `staff.html` (replay of all 92 runs, Live with the visitor's key); `assistant.template.html` -> `build_assistant.mjs` -> `assistant.html` (superseded two-phone layout, not linked).
- `benchmark/`: `harness.js` (case setup, scoring from the tool log and the data, nine hard limits in `hard_limits.json`), `test_tools.js`, `test_mcp.mjs`, `run_benchmark.js`, `results.json` and `results.md` (final run 92 of 92, 0 breaches), `sample*.json`.
- Test calendar: Thursday 22 October 2026, 10:00 Malaysia time (`data/meta.json`), for every run and for live chat.

## Who can read what (CP-04 to CP-10, checked in PreToolUse and the back end)
Rows by patient: own patients; an approved active cover; for Dr Aisyah, an open consult to her. Columns by role:
| View | Doctors | Clerk |
|---|---|---|
| Registration (ID, name, age, doctor, guardian name) | every patient | every patient |
| Contact (phone, email, address, MyKid or IC) | own, cover, lead's consult | every patient |
| Clinical, prescription | own, cover, lead's consult | every patient |
| Appointment, vaccination | own; the lead also consult or cover | every patient |
| Confidential adolescent notes | Dr Priya own; Dr Aisyah consult or cover with a recorded reason | never |
| Billing | Dr Aisyah as lead only | yes |
| Fee Schedule resource | Dr Aisyah as lead only | yes |
| Patient lists (`find_patients`, fixed filters, ID, name, age, doctor) | own panel; the lead clinic-wide except vaccine overdue | not offered |

## Who decides what
- Prescribing: the attending (or covering) doctor only; authority is checked first, then formulary, weight, dose and allergy. The clerk carries out the instruction (dispense, bill).
- Bookings and payments: the clerk only (`book_appointment`, `record_payment`). A doctor asking to book gets the founder's sentence and the booking goes to the clerk.
- Fee waivers, doctor assignment (OP-04), consults, cover: Dr Aisyah. Overbooking: the requested doctor (OP-09). Handovers: the receiving doctor. Callbacks and repeat prescriptions: the patient's own doctor.
- Dr Aisyah never approves her own request. Her own instruction to waive a fee is recorded as her decision and carried out (CP-12 as amended), never referred back.
- Policy gaps: a billing question is referred by the clerk, a service or disclosure question by the attending doctor, to Dr Aisyah as policy owner; a clinical matter stays the attending doctor's own decision.
- Decisions count only when recorded through a tool transition (CP-13).

## Reply rules (founder, 22 Oct; `~/.claude/rules/access-level-chat-replies.md`)
Read only: one sentence opening "Here it is:". Read and follow up: two sentences, no "pending". Escalation: "Sent to <name>, <job title>." No access: two sentences, decline then who has access. No authority: "I'm sorry, you can't ... Only <name>, <title>, can ...". Decider's instruction: "OK. ..." and carried out. The person work is sent to receives only the code-written two-sentence notice as the first message. Never "he" or "she"; never name the signed-in person.

## After any change
1. `python build_policies.py && python generate_data.py && python build_cases.py` when a policy, the data or a case changes.
2. `node benchmark/test_tools.js` (188 checks) and `node benchmark/test_mcp.mjs` (no key). All must pass; the benchmark gate hook blocks a paid run otherwise.
3. `node benchmark/run_benchmark.js` (key from `ANTHROPIC_API_KEY` or `~/.env`; `--sample` for the first question of each category; `--only Q6.4-PD-01-01` with `--out partial`; `--rescore` without the API). Hard-limit breaches must stay 0. Read the replies against the reply rules even after a perfect score. Log the spend in `_data/api-spend.json`.
4. Rebuild the pages (`build_staff.mjs`, `build_assistant.mjs --template staff-desk.template.html --out staff-desk.html`), then check them through `python -m http.server` from the working copy root, replay and live, wide and narrow.
5. Do not edit `staff.html`, `staff-desk.html`, `assistant.html`, `data/` or `resources/` by hand; they are build outputs.
