# Pak Razif Garden: site visit assistant

A customer chat assistant and a phone page for the owner of a fictional two-person gardening service in Shah Alam. The assistant answers routine enquiries from six resources, checks coverage, offers open site visit slots and confirms a visit once the slot is reserved; Pak Razif decides scope and quotation after visiting, and answers everything forwarded to him by phone or WhatsApp himself.

## Layout
- `build_resources.py` -> `resources/`: the six resources from one source: Operation Policy (P1 to P38, approved replies R1 to R12), Work Schedule (W1 to W13), Quotation Policy (Q1 to Q6), Service Area (A1 to A6), Site Visit Guide (V1 to V9), FAQ (F1 to F19), as `.html` (people, each rule a link target) and `.md` (Claude reads them as MCP resources), plus `clauses.json` (103 rules). The build stops on an em-dash or on a rule ID that is cited but not defined. Change a rule here, nowhere else.
- `generate_calendar.py` -> `calendar.json`, `calendar.html`: Oct and Nov 2026, field work, seed 17, the fixed demo days the Answer Key names, 44 bookings HG-1001 to HG-1044 (`next_ref` 1045), empty `inbox` and `uploads`, `demo_photos` P1 to P4, duty number 012-555 0188.
- `tools.js`: the 6 tools and every hard rule, Pak Razif's two actions (`OWNER.done`, `OWNER.toggleSlot`), written once. Loaded by `mcp_server.mjs`, the tests, the benchmark and both pages.
- `prompt.js`: system prompt (what it does and never does, the nine handover reasons, the closing line after continuing abuse) plus the six resources, cached.
- `agent.js`: the tool-use loop on Sonnet 5.5 (stop_reason driven, 700 output tokens, 8 tool rounds). Before a reply leaves, code checks it: a reply that says a visit is booked or that something was passed to Pak Razif, without the tool succeeding in that turn, is sent back once, then replaced by a safe fallback. `endsChat` when the closing line is sent.
- `mcp_server.mjs`, `.mcp.json`: MCP server over stdio. Resources `resource://operation`, `resource://work-schedule`, `resource://quotation`, `resource://service-area`, `resource://site-visit`, `resource://faq`; tools from `tools.js`. Env `HG_STATE` (default `calendar.state.json`, copied from `calendar.json`, so the seed is never written) and `HG_NOW`. Host context comes in the request `_meta`, never from the model: turn, photo IDs attached, the customer's words and earlier messages, the chat contact, the first-contact date.
- `make_demo_state.mjs` -> `demo_state.json`: what a visitor first sees on both pages, eight inbox items taken from the recorded benchmark run. Pages only.
- `owner.template.html` -> `build_owner.mjs` -> `owner.html` (Pak Razif's phone page, layout D: Inbox, Today, Calendar). `assistant.template.html` -> `build_assistant.mjs` -> `assistant.html` (design E: How it works, Replay of all 33 recorded cases, Live chat with the visitor's key; the right-hand phone is `owner.html?embed=1&store=<key>`). Shared state in localStorage (`pak-razif-the-gardener-live-v1`, `pak-razif-the-gardener-replay-v1`) and the BroadcastChannel `pak-razif-the-gardener`.
- `benchmark/`: `Answer Key.html` (written and approved before the build), `cases.json` (33 cases, groups A to F; F plays Pak Razif's calendar taps first, `owner_actions`), `test_tools.mjs` (tool tests, no key), `run_benchmark.mjs`, `results.json`, `results.md`.
- Dates: everything runs on a fixed clock, Sat 17 Oct 2026 10:00, first contact 17 Oct (window 18 Oct to 17 Nov).
- The retired Streamlit and Llama 3 app is kept outside the published folder, in the working copy's `_old/app/`; nothing in this project uses it.

## Rules that must hold (enforced in `tools.js`, checked by the tool tests and the benchmark)
- No tool quotes a price, changes or cancels a visit, books field work, lists bookings, reads a location or takes a payment.
- Coverage by 5-digit postcode only (A1 to A3); other postcodes are nearby or outstation, forwarded, never booked.
- Bookable dates run from the day after first contact to the same date next month; today is refused as `same_day`; Sundays and holidays closed. Only open slots are offered; the slot is re-checked when saving; one upcoming visit per normalised address; references issued by code; the confirmation text (R3) built from the tool result.
- Photos are forwarded by ID; the image never reaches the model. Only photos attached in this conversation, once each.
- The duty number is returned only when the reference and the last 4 phone digits both match a confirmed visit today or later; the same `no_match` otherwise.
- Every handover has a reason from the fixed nine and the model's summary fields; code adds the customer's words, contact, photos and time.

## After any change
1. `node benchmark/test_tools.mjs` (no key). All must pass.
2. `npm run benchmark` (needs `ANTHROPIC_API_KEY`; `--group B` or `--only 4,E9` for a partial run, `--rescore benchmark/results.json` to rescore without the API). Hard-limit breaks must stay 0; read a sample of replies from every group against `reply_must` even after a perfect score. Never loosen a case to pass a wrong reply.
3. `node make_demo_state.mjs`, then `npm run build`.
4. Do not edit `owner.html` or `assistant.html` by hand; they are build outputs. Check both through `python -m http.server` from the project folder.
