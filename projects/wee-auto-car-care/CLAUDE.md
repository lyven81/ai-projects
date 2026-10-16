# Wee Auto Car Care: customer assistant

A customer service assistant for a fictional independent car workshop, over the owner's booking dashboard.

## Layout
- `tools.js`: the five tools and every hard rule, written once. Loaded by `mcp_server.mjs` and inlined into `assistant.html`. Change a rule here, nowhere else.
- `prompt.js`: system prompt (rules, handover reasons, examples) plus the three resources. Shared by the benchmark and the browser.
- `agent.js`: the tool-use loop (stop_reason driven, 600 output tokens, 6 tool rounds).
- `mcp_server.mjs`: MCP server over stdio. Resources `workshop://policy-guide`, `workshop://faq`, `workshop://service-packages`; tools from `tools.js`. State file from `WEE_STATE`.
- `resources/`: policy guide, FAQ, service package prices (the only prices the assistant may quote).
- `benchmark/`: `cases.json` (30 cases in four groups), `run_benchmark.mjs`, results.
- `generate_seed.py` -> `workshop_bookings.json` -> `build_dashboard.py` -> `demo.html` (staff dashboard: the queue first, then schedule and bookings).
- `make_demo_queue.mjs` -> `demo_queue.json`: the 2 pending requests and 5 handovers a visitor first sees. Pages only; the benchmark runs on the plain seed.
- `assistant.template.html` -> `build_assistant.mjs` -> `assistant.html` (How it works, benchmark replay, live BYO-key chat).
- Dates: the seed is written for the fortnight from Mon 2 Mar 2026. Both pages move it by whole weeks to start on the Monday of the week they are opened (`calendar`, `stateForToday` in `tools.js`). The benchmark keeps the fixed dates. Both pages share localStorage key `wee-auto-bookings-v3`; bump it when the saved shape changes.

## Rules that must hold (enforced in `tools.js`, checked by the benchmark)
- No booking detail before `verify_customer` passes for that booking ID (booking ID plus phone last 4, compared as strings). Locked after 3 failures.
- `get_booking` returns one booking, safe fields only: no price, ready time, mechanic, or other customer.
- Writes are booking requests with status `pending`. No tool confirms, cancels, changes or deletes a booking.
- Prices only from `resources/service-packages.json`.
- No tool touches money.
- Booking and customer IDs are issued by code, never by the model.

## After any change
1. `npm run benchmark` (needs `ANTHROPIC_API_KEY`). Hard-limit breaks must stay 0.
2. `python build_dashboard.py && node build_assistant.mjs` (after `node make_demo_queue.mjs` if the seed or tools changed).
3. Do not edit `demo.html` or `assistant.html` by hand; they are build outputs.
