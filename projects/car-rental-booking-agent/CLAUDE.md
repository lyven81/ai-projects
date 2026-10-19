# Kereta Sewa Jalan-jalan: car rental agent

A customer chat agent and a staff phone page for a fictional car rental company at KLIA (56 cars). The agent answers from the Rental Policy and the Car Inventory, prices rentals, takes booking requests that block a car, records deposit payments, and quotes and requests cancellations; staff confirm or reject requests, set delivery charges, confirm cancellations and act on handovers.

## Layout
- `build_policies.py` -> `resources/`: the Rental Policy (R1 to R48, approved 19 Oct 2026) as `Rental Policy.html` (people, each clause a link target), `Rental Policy.md` (Claude reads it as `policy://rental-policy`) and `clauses.json` (the citation check). Change a clause here, nowhere else.
- `generate_seed.py` -> `car_rental_bookings.json` (the records only the tools reach), `resources/Car Inventory.md` and `.html` (`inventory://cars`), `resources/schedule.json` (`schedule://availability`, free or taken per car per day, no customer details). 56 cars VHC001 to VHC056 (VHC008, VHC047 in maintenance), bookings 1 Oct to 30 Nov 2026 at 45% and 20% of car-days, the records the Answer Key names (KS-2038 to KS-2048), the items waiting for staff (HO-001, HO-002, PY-001, PY-002, CX-001). `meta.next_ref` issues KS-2049 next. The price function and its worked examples are asserted here and in `tools.js`.
- `tools.js`: the 9 tools, every hard rule, the pricing (R12 to R14), the 25 handover reasons, the staff actions (`STAFF`) with their fixed messages, and the page calendar (`stateForNow`), written once. Loaded by `mcp_server.mjs`, the tests, the benchmark and both pages.
- `prompt.js`: system prompt (written policy only, discretion to staff, verify first, prices from tools, three languages, one example per benchmark group) plus the policy and inventory, cached.
- `agent.js`: the tool-use loop on Sonnet 5.5. It asks for `tool_choice` "any" and falls back to "auto" for a model that refuses it (Sonnet 5.5 does); a plain-text ending is sent back once to go through `reply_to_customer`. 900 output tokens, 8 tool rounds.
- `mcp_server.mjs`, `.mcp.json`: MCP server over stdio. Resources `policy://rental-policy`, `inventory://cars`, `schedule://availability`; tools from `tools.js`. Env `KS_STATE`, `KS_NOW`, `KS_FAULTS`. Host context comes in the request `_meta`, never from the model: turn, uploads in this message, the customer's words, the chat contact.
- `make_demo_images.py` -> `images/`: receipts R1 (RM 100, KS-2046) and R2 (RM 50), a car photo, the seed receipt, the fictional DuitNow QR, all marked "Demo, not payable".
- `dashboard.template.html` -> `build_dashboard.py` -> `demo.html` (the staff phone: home screen, Inbox, Today, Fleet). `assistant.template.html` -> `build_assistant.mjs` -> `assistant.html` (the Gardener two-phone layout chosen 19 Oct: How it works, Replay of all 33 recorded cases into both phones, Live chat with the visitor's key; the right-hand phone is `demo.html?embed=1&store=<key>`). Shared state in localStorage: `kereta-sewa-v1` (live, moved to today's week) and `kereta-sewa-replay-v1` (replay, fixed clock), with the BroadcastChannel `kereta-sewa`. The build stamps the seed with `meta.seed_version`, so a rebuild never shows stale live data.
- `benchmark/`: `Answer Key.html` (approved 19 Oct, before the build), `cases.json` (33 cases in 4 groups), `test_tools.mjs` (93 tool tests, no key), `run_benchmark.mjs` (five checks plus the tool selection measure), `results.json`, `results.md`.
- Dates: the benchmark runs on a fixed clock, Tue 20 Oct 2026 10:00 (H6 at 22:00). The live pages move the seed by whole weeks to today.
- Outside this folder, in the working copy's `_old/`: the retired FastAPI and Gemini app (`app/`), the old showcase page, and page versions A and B.

## Rules that must hold (enforced in `tools.js`, checked by the tool tests and the benchmark)
- No tool confirms, cancels, changes, extends or refunds a booking, lists bookings or names a customer. Those are staff buttons, each sending a fixed message written in code.
- Pickup and return 9am to 6pm; at least 2 hours; at most 14 days; not today and not more than 30 days ahead (each refusal names its handover); maintenance and overlaps excluded and checked again at writing; at most 2 active bookings per mobile; price from the rates with the caps; references issued by code.
- A place away from KLIA records a `delivery_quote` handover; the agent quotes RM 1 per km and no figure; staff set the charge. Confirm does not wait for the charge (R11).
- Booking detail only after `verify_booking` (reference plus mobile last 4, compared as text); locked after 3 failures; `check_failed` only after the lock.
- A receipt needs an image uploaded in the same message and is compared with the booking in code; a payment by the customer's word is recorded as such; the booking stays pending either way.
- `request_cancellation` only after `quote_cancellation`, in a later message.
- Every handover is one of 25 reasons in eight fields; urgent is set by code from the reason.
- Every reply goes through `reply_to_customer`: unknown clause IDs, a handover claim without a handover this turn, and an RM amount no tool result or inventory rate gave are refused.

## After any change
1. `node benchmark/test_tools.mjs` (no key). All must pass.
2. `npm run benchmark` (needs `ANTHROPIC_API_KEY`; `--only A5,X3` for a partial run, `--rescore benchmark/results.json` to rescore without the API). Hard-limit breaks must stay 0, and the tool selection measure is read with the score. Read a sample of conversations from every group even after a perfect score. A scorer fix is checked with `--rescore`, never by loosening a case.
3. `python build_dashboard.py && node build_assistant.mjs`, then the showcase: `node _build/masterkit.js "<working copy>"` from the working copy root.
4. Do not edit `demo.html`, `assistant.html` or the showcase page by hand; they are build outputs. Check the pages through `python -m http.server`, both phones side by side.
