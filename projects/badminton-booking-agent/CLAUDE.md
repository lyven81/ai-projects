# Subang Badminton Arena: court booking assistant

A player chat assistant and a staff dashboard for a fictional 12-court badminton centre. The assistant answers only from three policies, takes held booking requests, records payment receipts, and quotes and submits cancellations; staff confirm, release, approve and answer handovers.

## Layout
- `build_policies.py` -> `resources/`: the three policies from one source: `Operation Policy`, `Booking Policy`, `Cancellation Policy` as `.html` (people, each clause a link target) and `.md` (Claude reads them as MCP resources), plus `clauses.json` (59 clauses, the citation check). Change a policy here, nowhere else.
- `tools.js`: the 9 tools, every hard rule, the staff actions with their fixed messages, and the page calendar, written once. Loaded by `mcp_server.mjs`, the benchmark and both pages.
- `prompt.js`: system prompt (four-way rule, handover reasons, one example per kind of enquiry) plus the three policies.
- `agent.js`: the tool-use loop. `tool_choice` "any" (falls back to "auto" for models that refuse it); the turn ends at `reply_to_player`; 700 output tokens, 8 tool rounds.
- `mcp_server.mjs`, `.mcp.json`: MCP server over stdio. Resources `policy://operation`, `policy://booking`, `policy://cancellation`; tools from `tools.js`. Env `BB_STATE`, `BB_NOW`, `BB_FAULTS`. Host context (turn number, images uploaded this message) comes in the request `_meta`, never from the model.
- `generate_seed.py` -> `badminton_bookings.json`: 12 courts, 12 to 26 Oct 2026, every status, the records the Answer Key names (BK-2041, BK-2032, BK-2050, Court 5 free Saturday 18:00 to 23:00). `meta.next_ref` issues BK-2051 next.
- `make_demo_images.py` -> `images/`: receipts R1 to R5 and the seed and queue receipts, all marked "Demo, not payable".
- `make_demo_queue.mjs` -> `demo_queue.json`: what a visitor first sees waiting for staff, made through the real tools. Pages only.
- `dashboard.template.html` -> `build_dashboard.py` -> `demo.html` (staff dashboard). `assistant.template.html` -> `build_assistant.mjs` -> `assistant.html` (How it works, benchmark replay, live chat). Both share localStorage key `subang-badminton-v1` and a BroadcastChannel, so staff clicks reach the chat live. The build stamps the demo data with `meta.seed_version`; a browser holding data saved from another build starts fresh, so a rebuild never shows stale data.
- `benchmark/`: `Answer Key.html` (written before the build), `cases.json` (30 cases in 8 groups), `test_tools.mjs` (tool tests, no key), `run_benchmark.mjs`, results.
- Dates: the benchmark runs on a fixed "now", Fri 16 Oct 2026 10:00. The pages move the seed by whole weeks to today and keep the age of recent activity (holds, receipts, handovers) relative to the moment they open.
- `_old/`: the retired FastAPI and Gemini build (`main.py`, `Dockerfile`, `requirements.txt`, the old `demo.html`).

## Rules that must hold (enforced in `tools.js`, checked by the tool tests and the benchmark)
- No tool confirms, cancels, releases, refunds or changes a booking, and none lists bookings or names a player. Those are staff buttons (`STAFF`), each sending a fixed message written in code.
- Booking window today plus 7 days, opening hours 07:00 to 01:00, 1 to 3 hours, 2 hours ahead, up to 2 courts at once per mobile, conflict re-checked at writing. Fee and deposit from the fee table; references issued by code.
- Booking detail only after `verify_booking` (reference plus mobile last 4, compared as text); locked after 3 failures.
- A payment is reported only with an image uploaded in the same message (`_meta.uploads`); expired holds refuse receipts; receipt fields are compared with the booking in code.
- `request_cancellation` only after `quote_cancellation`, in a later message than the quote.
- Every handover is a structured summary for staff who cannot see the chat: root cause, clauses checked, amount, recommended action from Claude; the player's words, chat contact, what the player was told and (check_failed) the 3 checks tried from code. `check_failed` is refused unless the check has locked.
- Every reply goes through `reply_to_player` with a `policy_case`; `not_covered` and `unclear` are refused without the matching handover in the same turn, as is any reply that says staff will follow up, says the policy does not settle it, or offers to pass the question on. Citations are built from `clauses.json`; unknown IDs are dropped.

## After any change
1. `node benchmark/test_tools.mjs` (no key). All must pass.
2. `npm run benchmark` (needs `ANTHROPIC_API_KEY`; Sonnet 5.5 is the recorded model, `--model claude-haiku-5-5` to compare). Hard-limit breaks must stay 0; read a sample of conversations from every group even after a perfect score. A scorer fix is checked with `--rescore` on a recorded run, never by loosening a case to pass a wrong reply.
3. `node make_demo_queue.mjs` if the seed or tools changed, then `python build_dashboard.py && node build_assistant.mjs`.
4. Do not edit `demo.html` or `assistant.html` by hand; they are build outputs. Check both through `python -m http.server`, side by side.
