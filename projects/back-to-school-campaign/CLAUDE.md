# Kiddoz Back-to-School Campaign Team

A coordinator and six subagents on the Claude Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.312, Node 22, Haiku 5.5 `claude-haiku-5-5` for all seven agents) write a back-to-school campaign in Bahasa Melayu for Kiddoz Uniform House, a school uniform niche shop in Bangi, Selangor. The owner, Puan Zarina Ahmad, sends each request and approves every channel; nothing is posted by the system. The campaign runs Monday 26 October 2026 to Friday 30 October 2026 on 100 campaign SKUs. The plan and the founder's decisions are in `../../_plan/` (Build List, How the app is built, the mockup); the Answer Key is `benchmark/Answer Key.html`.

## Layout
- `resources/`: the three MCP resources. `price_list.json` (`kiddoz://price-list`, built by `build_price_list.py` from `_plan/price list.txt`): 100 SKUs in 8 categories with normal price, promotion price and discount (10, 15 or 20%), the period `PL-PERIOD`, and the clauses PL-01 to PL-04. `store_profile.json` (`kiddoz://store-profile`, S1 to S6). `channel_guide.json` (`kiddoz://channel-guide`, G1 to G5 per channel, G6 tones and the house tone Santai, G7 banned claims). The price list is the only source of prices.
- `lib/resources.mjs`: loads and checks the resources. A price list with a missing promotion price, a discount over 20% or a discount that does not recalculate is refused, never repaired.
- `lib/scan.mjs`: the scanners shared by `extract_facts` and the hook: SKUs, RM amounts, percentages, dates (BM and English), banned claims with the clause each enforces, and the negations that state a clause accurately ("tanpa logo", "lencana ... tidak termasuk").
- `lib/facts.mjs`: `extractFacts(reading, ownerMessage, { overrides, carried })`. The coordinator gives its reading (channels, tone, SKUs, requirements, urgency); code checks it against the owner's own message, passed by the runner, and the price list. Returns facts with an ID and a source each, and `owner_issues` with codes O1 to O4 and a question hint.
- `lib/tools.mjs`: the run state and the plain functions behind `ask_owner`, `deliver`, `report_findings`, the writer store, the coverage check and the stop rule. No function can set `approved`.
- `hooks/post_tool_use.mjs`: `checkCopy(channel, input, facts)`, the writer checks on the copy text itself: claims cite real fact IDs and every featured SKU; every RM figure, percentage and date matches the facts; banned phrases; the G1 to G5 format rules.
- `mcp_server.mjs`: the in-process server (`createSdkMcpServer`, `tool()`), one per run, bound to the run's state: `extract_facts`, `ask_owner`, `deliver`, `write_whatsapp`, `write_instagram`, `write_email`, `write_blog`, `write_seo`, `report_findings`, and the three resources registered on its instance.
- `agents.mjs`: six AgentDefinitions (description, prompt, one tool, model), the coordinator prompt (goals and quality bar, not a procedure) and the seven agent cards from `config/agent_cards.json`.
- `run.mjs`: the `query()` runner. Coordinator tools `["Task"]` plus the MCP tools; `settingSources: []`; the hooks below; the tool log with the agent card on every line; the record of every run. `node run.mjs "<message>"` runs one live campaign from the command line.
- `build_demo_data.mjs` -> `demo-data.js`, read by `demo.html`, the replay page (design A, the Campaign desk).
- `benchmark/`: `Answer Key.html` (approved 28 Oct), `merge_results.mjs` (builds the final `results.json`), `scenarios.json` (16 paid scenarios with what must hold and the controlled conditions), `score.mjs` (route, tools, facts, status and the ten hard limits, from the tool log and the state), `run_benchmark.mjs`, `test_tools.mjs` and `test_hook.mjs` (no key), `step0*.mjs` and their results (the SDK checks of 29 Oct), `runs/` (every run in full), `sample.json`, `results.json`.
- `lib/naming.mjs`: the Bahasa Melayu name of each product (`name_bm` on its fact) and the words the hook requires in the copy, so parents read the item, never its SKU code.
- Final recorded run (29 Oct, `benchmark/results.json`, built by `benchmark/merge_results.mjs`): 16 of 16 scenarios and 21 of 21 runs passed on Haiku 5.5. The 16 runs that write copy are from `results-final-copy.json` (C3 from `results-c3.json`, D3 from `results-d3.json`); B2, B5, B7, B8 and F1, which stop before any copy is written, are from the first full run, `results-full-1.json`. Timing (A1, medians of three each): writing phase 40.8 s in parallel against 120.7 s sequential, 2.96 times faster; total 166.8 s against 203.2 s, 17.9% shorter. Founder copy quality score on A1: 5 of 5 on all four dimensions for all five channels (`benchmark/copy-quality-score.json`). Recorded runs cost USD 0.5261; project spend USD 1.61 (ledger `Income Sprint - 12 Nov 26/_data/api-spend.json`).
- `_old/`: the earlier one-prompt build (`demo.html`, `system-prompt.txt`), not loaded by anything.

## The hooks (run.mjs)
- **PreToolUse, coordinator:** `extract_facts` runs first on every new owner message (`query()` has no forced tool choice, so every other tool is refused until it has run). No writer starts while the facts hold an owner issue. A writer only for a requested channel; a channel that passed is never redone; at most the first attempt plus two corrections per channel; at most five writers. The runner adds the checked facts, the channel rule and, on a correction, the exact open errors or findings to each writer's Task prompt. Before the reviewer: the coverage check (every requested channel has checked copy) and the facts, the owner's requirements and every channel's current copy added to its Task prompt. Every Task call runs in the foreground (`run_in_background: false`).
- **PreToolUse, subagent:** each writer only its own tool and only one recorded output; the reviewer only `report_findings`. The benchmark's controlled conditions (C2, C3, C4, C6) are applied here and named in the tool log.
- **PostToolUse, writer tool:** `checkCopy`, including the product-name check (every featured product named in words, no SKU code in the copy); the result is stored as `checked` or kept as errors.
- **PostToolUse, coordinator Task:** the runner's record of that channel (status, the exact errors, corrections left) or of the review, given to the coordinator as additional context. Step 0 showed a hook's message reaches the agent that made the call, so this is how the coordinator learns a writer's check result (hub and spoke).

## Rules that must hold
- The price list is the only source of prices, discounts and the period; a product not on it is not in this campaign (O2).
- Owner questions on the fixed reasons only: O1 missing fact, O2 not on the price list, O3 claim not allowed, O4 contradiction with the price list (price, discount or dates), O5 still failing after two corrections. Never on confidence. A brief with no dates takes the period from the price list; no tone takes the house tone Santai from G6.
- Banned in any copy: cheapest, guarantee, gift, voucher, delivery, stock or scarcity, countdown, search ranking, whole shop on sale, an invented phone number (`[No. WhatsApp]` instead), and anything against PL-01 to PL-04.
- Status names: written, checked, reviewed, ready_for_approval, waiting_for_owner, failed, approved. `deliver` accepts only the status the run record supports; only the owner sets approved, on the page, and approval never posts.
- Subagents get context only from their Task prompt. Linked steps (D1, D3, D4) get their state from the runner in the coordinator's prompt.

## Build and test, in order
```
npm install
python build_price_list.py                         # resources/price_list.json, after a change in _plan/price list.txt
node benchmark/test_tools.mjs                      # no key
node benchmark/test_hook.mjs                       # no key
node benchmark/run_benchmark.mjs --smoke           # B2
node benchmark/run_benchmark.mjs --sample          # A1, C2, B2 -> sample.json
node benchmark/run_benchmark.mjs --only=C4,A1-SEQ  # named scenarios -> rerun-*.json
node benchmark/run_benchmark.mjs                   # full run, about 21 runs -> results.json
node build_demo_data.mjs                           # demo-data.js for demo.html
```
Paid runs go through the benchmark gate hook (no-key tests first, Haiku trial recorded, founder asked before the first full run, USD 2 cap). The key is read from `ANTHROPIC_API_KEY` or `~/.env`.
