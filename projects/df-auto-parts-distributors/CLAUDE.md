# DF Auto Parts Distributors staff assistant

A staff assistant for an automotive spare parts distributor in Selangor (7 staff in Sales, Finance and Warehouse; 120 workshops and parts shops; 60 SKUs). It shows how staff coordinate inside one system: a salesperson starts a piece of work, the manager who owns the decision receives it with the data to decide, and code or a named person carries it out. The agent (Claude Haiku 5.5) only chooses which of seven tools to call. One shared PreToolUse hook decides before every tool runs (and turns a rule a manager decides into an escalation), one shared PostToolUse hook applies policy to every result, and the back end repeats the critical checks. Forked from FD Food and Drink Distributors on 23 Oct 2026; FD's files are never edited. The plan is `../../_plan/` (Build List, How the app is built, mock-up E).

## Layout
- `build_policies.py` -> `resources/`: Management (MP-01 to MP-16), Sales (SP-01 to SP-13), Finance (FP-01 to FP-10) and Warehouse (WP-01 to WP-11) policies as `.md` (MCP resources `policy://management|sales|finance|warehouse`) and `.html`; `clauses.json`; `policy_tables.json` (staff, approval types and owners, promotions, locations, warehouses, holidays, values incl. `draft_lapse_days` 90). MP-16 is the escalation and notification rule; SP-13 the order drafts. Change a clause or a table here, nowhere else.
- `generate_data.py` (seed 42) -> `data/*.json` and the `Product Catalogue` and `Customer Directory` resources. Money in sen, times as Unix seconds UTC. Plants and asserts: C-0001 Bengkel Seri Mawar Auto (Chloe's, RM 5,200.00 available, DF-INV-00001 overdue 12 days, DF-INV-00002, open order DF-SO-00248), C-0004 Bengkel Gemilang Motor (Daniel's, RM 2,000.00 available), DF-EO-001 RM 440.00 a carton (WH-A 60, WH-B 48), DF-OF-012 RM 18.00, DF-BT-030 30 hours old at WH-A, DF-SO-00247 out today, next order DF-SO-00249, AP-0104 for another request (failure F3). New data files: `escalations`, `drafts`, `notifications`, `stock_counts`, `schedules`.
- `build_cases.py` -> `benchmark/cases.json` and `benchmark/Answer Key.html`: the seven scenarios as one day (Thursday 1 October 2026, 10:00 to 11:16): 31 steps and 3 desk button presses in time order, plus 5 failure cases. Each step carries its canonical tool call (`apply`), used by the harness to build later steps' state without a model, and by the tool tests.
- `lib/format.js`: the result shape `{ tool, status, data, error, next_step }`; status adds `escalated`; `next_step` is `{ text, person, say, basis }` (`say` the reply written in code, `basis` the Basis line). `lib/rules.js`: staff lookup, prices, summary, delivery terms, credit balance, the four rules a manager decides in order (`unmetRule`), the draft lapse, and every code-written sentence (`say`). `lib/backend.js`: the data layer (drafts, escalations with data filtered for the decider, notifications, decisions and approvals by request ID, placing once, schedules, counts, fault injection).
- `hooks/pre_tool_use.js`, `hooks/post_tool_use.js`: the two shared hooks. PreToolUse returns a plan for create_order: `escalate` (the first unmet rule, routed by code to its manager) or `place`.
- `tools.js`: the seven tools, `createDesk`, and the desk buttons (`confirm`, `decide`: the same action and checks as the chat). Loaded by the MCP server, the tests, the benchmark and the desk.
- `mcp_server.mjs`, `.mcp.json`: stdio server, 6 resources and 7 tools. The staff ID arrives in `_meta.staff`, never from the model. Env `HP_STATE`, `HP_NOW` (the step's clock), `HP_FAULTS`.
- `prompt.js`, `agent.js`: the prompt (call the tool every time; orders, terms for a draft, placing a confirmed summary; a one-word decision refers to the latest notification shown, which the prompt carries) and the loop on Haiku 5.5 (`next_step.say` shown as is; `replyFixes` sends a model reply back at most twice; code adds the Basis line).
- `staff-desk.template.html` + `staff-desk.content.json` -> `node build_staff.mjs` -> `staff-desk.html`: mock-up E (brown) on the engine. Seven scenario tabs, steps, Replay of the recorded run on the state the earlier steps left, Live from that state with the visitor's key; Your access always, Next step and the record card only on Read and follow up; Approve, Decline with reason and Confirm summary call the desk actions; Under the hood shows Who decides (AI, CODE, HUMAN) above the trace.
- `benchmark/`: `harness.js` (timeline setup, scoring from the tool log and data, ten hard limits), `test_tools.js` (101 checks), `test_mcp.mjs`, `run_benchmark.js` (`--sample` = 1.1, 2.3, 4.3; `--only`; `--rescore`), `results.json` and `results.md` (final run 36 of 36, 0 breaches), `sample.json`.

## Who can read what (MP-07, checked in PreToolUse and the back end)
| View | Sales Tier 02 (own customers) | Sales manager | Finance | Warehouse |
|---|---|---|---|---|
| Stock quantity | yes | yes | no | yes |
| Stock storage, delivery schedule | no | no | no | yes |
| Customer location | yes | yes | yes | yes |
| Customer delivery | yes | yes | no | yes |
| Customer credit | yes | yes | yes | no |
| Customer payments (invoices) | no | no | yes | no |
| Prices | yes | yes | no | no |
| Escalation record | own requests | addressed to them | addressed to them | addressed to them, no prices or credit |

## Who decides what
- Orders: Sales Tier 02, for their own customers, after Confirm summary. A request that needs a manager becomes a draft and an escalation; it is placed once, only when every approval is recorded for its request ID (MP-09, SP-13). A terms-only request joins the customer's open draft. A draft lapses after 90 days.
- Discounts (up to 15%) and below-minimum orders: Farid Iskandar, sales manager. Same-day or early delivery and stock counts: Azlan Yusof, warehouse manager. The prepaid route: Nadia Zulkifli, finance manager. Scheduling within the terms: Warehouse.
- One rule at a time, in the order discount, minimum, delivery date, prepaid (MP-16). Asking again while one is open: "This is still with <name>, <job title>." An escalation is decided once, only by the person it is addressed to.

## Reply rules (`~/.claude/rules/access-level-chat-replies.md`)
Read only: one sentence opening "Here it is:". Read and follow up: two sentences, no "pending". Escalation: "Sent to <name>, <job title>." No access and no authority: the two code-written sentences. A manager's decision and a stock count: "OK. ..." written in code. The manager receives the code-written notification as the first message and decides with "Approved." or "Declined. <reason>". Never "he" or "she"; never name the signed-in person.

## After any change
1. `python build_policies.py && python generate_data.py && python build_cases.py` when a policy, the data or a case changes.
2. `node benchmark/test_tools.js` and `node benchmark/test_mcp.mjs` (no key). All must pass; the benchmark gate hook blocks a paid run otherwise.
3. `node benchmark/run_benchmark.js` (key from `ANTHROPIC_API_KEY` or `~/.env`; `--only 2.3,F1 --out partial` for a fix). Hard-limit breaches must stay 0. Read every reply against the reply rules even after a perfect score.
4. `node build_staff.mjs`, then check `staff-desk.html` through `python -m http.server` from the working copy root (`df-auto-parts-distributors/`), replay and live, wide and narrow.
5. Do not edit `staff-desk.html`, `data/`, `resources/` or `benchmark/cases.json` by hand; they are build outputs.
