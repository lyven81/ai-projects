# FD Food and Drink Distributors staff assistant

A staff assistant for a fictional Selangor food and drink wholesaler (7 staff in Sales, Finance and Warehouse; 120 customers; 60 SKUs). The agent only chooses which of five tools to call. One shared PreToolUse hook decides before every tool runs, one shared PostToolUse hook applies policy to every result, and the back end repeats the critical checks. The verified staff ID decides who can read what and who can decide what. Headline: the sales manager cannot raise a customer's credit; only Finance can.

## Layout
- `build_policies.py` -> `resources/`: the Management (MP-01 to MP-15), Sales (SP-01 to SP-12), Finance (FP-01 to FP-10) and Warehouse (WP-01 to WP-11) policies as `.md` (MCP resources `policy://management|sales|finance|warehouse`) and `.html`; `clauses.json`; `policy_tables.json` (staff, approval types, promotion calendar, location table, Selangor holidays Sep to Dec 2026, values). MP-07 holds the access rules by view. Change a clause or a table here, nowhere else.
- `generate_data.py` (forked from Hoo Tim Biscuits, seed 42) -> `data/*.json` and the `Product Catalogue` and `Customer Directory` resources. Money in sen, times as Unix seconds UTC. Storage bins and invoices come from a second random stream (seed 43), so earlier records keep their values. Plants the named records and asserts them: C-0001 (SL-02-01's, available credit RM 1,900, invoices FD-INV-00001 overdue and FD-INV-00002, open order RM 550), C-0002 (zero balance), C-0003 (incomplete credit), FD-PF-010 30 hours old at WH-A, FD-DR-012 8 cartons at WH-A, FD-CI-014 missing at WH-A, FD-DR-003 in bin A-01-1.
- `build_cases.py` -> `benchmark/cases.json` and `benchmark/Answer Key.html`: 15 questions, each as all 7 staff (105 runs, kinds read 1 to 5, policy 6 to 10, decide 11 to 15) plus 4 failure runs, 109 in all. Each case carries the tool call it asks for (`input`), used by the tool tests.
- `lib/format.js`: the one result shape `{ tool, status, data, error, next_step }`, the codes, RM and Malaysia-time conversions. `lib/rules.js`: staff lookup, promotion price by date, the order summary, working days and delivery terms, credit limit balance. `lib/backend.js`: the data layer (account views and their departments, storage for Warehouse only, assignment, tier, atomic stock and credit reserve, request IDs, fault injection).
- `hooks/pre_tool_use.js`, `hooks/post_tool_use.js`: the two shared hooks.
- `tools.js`: the five tools and `createDesk` (PreToolUse, tool, PostToolUse, call log). Loaded by the MCP server, the tests, the benchmark and the staff page.
- `mcp_server.mjs`, `.mcp.json`: stdio server, 6 resources and 5 tools. The staff ID arrives in `_meta.staff`, never from the model; the hook record goes back in `_meta.hook`. Env `HP_STATE`, `HP_NOW`, `HP_FAULTS`.
- `prompt.js`, `agent.js`: the prompt (call the tool on every attempt; warm, first-name replies; a refusal about who is asking is one sentence; short stock is the salesperson's call) and the loop on Sonnet 5.5 (`tool_choice` "any" on the first call, "auto" fallback counted, a plain-text ending with no tool call sent back once, a reply using he or she sent back once to name people, a refusal about who is asking that runs past one sentence sent back once to be shortened).
- `staff-desk.template.html` -> `node build_staff.mjs --template staff-desk.template.html --out staff-desk.html`: the staff desk (founder, 23 Oct), the Sang Kancil desk layout in FD's navy colours and the live demo the showcase page links. Left menu (or the area dropdown on a phone) by area, the Question dropdown numbered within the area, the identity dropdown; Chat or Under the hood; Replay or Live. YOUR ACCESS shows the level read from the run's last result by one mapping, `levelOf` (data returned: Read only; own action done or left with a next step: Read and follow up; view or customer not open: No access; another role's, tier's or manager's action: No authority), which matches all 105 recorded runs. NEXT STEP and the ORDER SUMMARY (Confirm) show only on Read and follow up; managers see their approval records.
- `staff.template.html` -> `build_staff.mjs` -> `staff.html`: sign-in, chat left, hook view right; Replay (pick the question, then the staff ID) and Live with the visitor's key; Confirm for Sales Tier 02 (including the short-stock summary); the sales manager sees an order summary read-only; managers see the approval records they made; Full screen.
- `benchmark/`: `harness.js` (case setup, scoring, eight hard limits, tool selection), `test_tools.js`, `test_mcp.mjs`, `run_benchmark.js`, `results.json`, `results.md`.
- Test calendar: Thursday 1 October 2026, 10:00 Malaysia time, for every run and for live chat.

## Who can read what (MP-07, checked in PreToolUse and the back end)
| View or detail | Sales Tier 02 (own customers) | Sales manager | Finance | Warehouse |
|---|---|---|---|---|
| Stock quantity | yes | yes | no | yes |
| Stock storage (bin, last count) | no | no | no | yes |
| Customer location | yes | yes | yes | yes |
| Customer delivery (warehouse, delivery day) | yes | yes | no | yes |
| Customer credit | yes | yes | yes | no |
| Customer payments (invoices) | no | no | yes | no |
| Prices | yes | yes | no | no |

## Who decides what
- Orders: Sales Tier 02, for their own customers, after Confirm on the staff page. The sales manager sees the summary read-only.
- Short stock: the salesperson decides whether to order what is available (WP-05).
- Discounts and small orders: the sales manager. Same-day or early delivery and stock counts: the warehouse manager. Prepaid route and raises beyond Tier 02: the finance manager. Raises up to an RM 2,000 balance: Finance Tier 02.
- Approvals count only when recorded (MP-09).

## After any change
1. `python build_policies.py && python generate_data.py && python build_cases.py` when a policy, the data or a case changes.
2. `node benchmark/test_tools.js` and `node benchmark/test_mcp.mjs` (no key). All must pass.
3. `node benchmark/run_benchmark.js` (key from `ANTHROPIC_API_KEY` or `~/.env`; `--only Q04-FN-01-01` or `--group failure` with `--out partial`; `--rescore` without the API). Hard-limit breaches must stay 0. Read a sample of conversations from every kind even after a perfect score.
4. `node build_staff.mjs` and `node build_staff.mjs --template staff-desk.template.html --out staff-desk.html`, then check `staff-desk.html` and `staff.html` through `python -m http.server` from the working copy root, replay and live, wide and narrow.
5. Do not edit `staff.html`, `staff-desk.html`, `data/` or `resources/` by hand; they are build outputs.
