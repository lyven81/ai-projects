# FD Food and Drink Distributors

A staff assistant for a fictional Selangor food and drink wholesaler, built so every business rule is held in a hook that runs on every request.

Staff of Sales, Finance and Warehouse sign in with their staff ID and ask the assistant about stock and where it is stored, a customer's location, delivery day, credit or invoices, prices, an order or a credit raise. The verified staff ID decides who can read what and who can decide what. The AI only chooses which of the five tools to call:

- **PreToolUse hook** (one shared file): checks department, tier, customer assignment, recorded approvals, prices, stock age and quantity, minimum order, discounts, credit, delivery terms and duplicates before the tool runs. Every refusal cites a policy clause, and a refusal a manager decides names that manager.
- **PostToolUse hook** (one shared file): applies policy to each result (the delivery day, overdue invoices, promotion prices, out-of-date stock figures), converts sen to RM and Unix time to Malaysia time, keeps only the fields of the view asked for, recomputes totals and balances, and returns `needs_reconciliation` (no retry, a named person reconciles) when an action's result does not match.
- **Back end**: repeats the critical checks on its own and reserves stock and credit together in one step.

The sales manager asking to raise a customer's credit is refused: credit raises sit with Finance.

## Run it
```
npm install
python build_policies.py && python generate_data.py && python build_cases.py
node benchmark/test_tools.js          # tool and hook tests, no key
node benchmark/test_mcp.mjs           # MCP round trip, no key
node benchmark/run_benchmark.js       # 109 runs on Claude Sonnet 5.5, needs ANTHROPIC_API_KEY
node build_staff.mjs                  # the staff page, replay and live
```
Register the MCP server in Claude Code with `.mcp.json` (`node mcp_server.mjs`); the staff ID is passed in each request's `_meta.staff`.

## Files
See `CLAUDE.md` for the layout and the rules that must hold. Policies: `resources/*.html`. Expected results: `benchmark/Answer Key.html`. Recorded results: `benchmark/results.md`.

All names, customers and figures are fictional.
