# Comel Diaper Marketing Campaign Assistant

A campaign review and planning assistant for the owner of a baby diaper retailer who runs the advertising alone on Facebook, Instagram, TikTok, YouTube and XiaoHongShu. It reviews how the Sales campaigns did, prepares changes for the owner to approve, and checks the approved changes once the next period closes.

Comel Diaper sells diapers, pants and wipes online and through WhatsApp orders. The owner decides every change and makes it on the platforms. The assistant explains and proposes; code computes every figure and enforces every rule; nothing is approved or posted by the system.

## How it works
- **The assistant** (one Claude agent, `agent.js`, with the prompt in `prompt.js`): answers the owner in short plain sentences, quotes every figure with its source tag, and saves proposals through one tool. Every proposal is pending until the owner decides.
- **Code** (`tools.js`, the same functions for the agent, the MCP server, the benchmark and the browser): four tools (`get_performance`, `get_campaign`, `propose_change`, `check_plan`); every figure as a record with an ID, value, metric, scope and period; the review status (Data issue, Variation not assessable, Limited results, Variable results, Consistent results) on pilot settings of 4 weeks, 30 orders and 30% weekly ROAS variation; the owner's target check; the 20% campaign cap, the total budget limit and the test caps (RM 500 per test, RM 1,000 for all tests); the follow-up check, with what the owner reported kept apart from what the results show.
- **The reply check** (`lib/replycheck.js`): before a reply leaves the loop, every tag must match its figure's value, measure and scope; a figure without a source, causal wording, ROAS called profit, an owner record called verified, a reported data issue claimed as detected, and talk of tools or corrections are sent back with the exact fix.
- **The owner** (the workspace): approves or rejects each proposal, records what was done on the platform, and may enter a minimum ROAS and a maximum cost per order (proposed figures from the data are shown beside the boxes).
- **Resources** (`resources/`): the business profile, metric definitions, review policy and planning rules, written before the data. A rule that must hold is in code; the files hold the same rules in words, with their IDs.

## Run it
```
npm install
node benchmark/test_tools.mjs && node benchmark/test_mcp.mjs   # no API key needed
node server.mjs                                                 # then open http://localhost:8765/
```
The workspace (`workspace.html`, built by `node build_workspace.mjs`) has three tabs: Review & Propose, Approve & Record, and Check Results, with the demo date switch for Mon 28 Sep 2026 (review and propose) and Mon 26 Oct 2026 (check results). Its chat replays every recorded benchmark run with no key. Live chat uses your own Anthropic API key, held in the page's memory only and billed to your account; use a key with a spending limit.

For Claude Code, `.mcp.json` starts `mcp_server.mjs` with the same tools and the four resources.

## Data
`generate_data.py` (fixed seed) writes the sample data: 60 Sales campaigns with weekly results for the review period (29 Sep 2025 to 27 Sep 2026), the next period's results (28 Sep to 25 Oct 2026, read only by the check after it closes), the seeded plan, the seeded states and one owner-reported tracking fault in `data/data_notes.json`.

## Benchmark
`benchmark/make_answer_key.py` computes every figure, status and expected outcome from the raw data and the written rules, independently of `tools.js`, and writes `benchmark/Answer Key.html`. The 24 cases are grouped Valid (11), Unauthorised (5), Flag to the owner (4) and Failure (4), plus a consistency run. `node benchmark/run_benchmark.mjs --sample` runs three cases; without a flag it runs the full set, and the gate asks first. A case passes only when the tool log and every reply pass. The final run (`benchmark/results-full-2026-10-30T00-22-43.json`, Claude Haiku 5.5): 23 of 24, consistency passed, no wrong figure, no invented figure and no approval bypass.

## Before real use
This is a prototype on sample data. A launch would still need a security review, a named owner for monitoring and incidents, a rollback plan, and validation of the pilot settings against real campaign periods.
