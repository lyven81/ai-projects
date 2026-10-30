# Marketing Campaign Assistant (Comel Diaper)

A single-agent assistant for the owner of Comel Diaper, a baby diaper retailer advertising on Facebook, Instagram, TikTok, YouTube and XiaoHongShu. It runs one loop: Review, Propose, Approve (owner), Record action (owner), Check. The plan is in `../../_plan/Build List.html` and `../../_plan/How the app is built.html`; change the Build List first if a decision changes.

## Layout
- `resources/`: business profile, metric definitions, review policy, planning rules. Written before the data; the values are held again in `tools.js` where a rule is checked.
- `generate_data.py` (fixed seed) writes `data/campaigns.csv`, `data/weekly_results.csv`, `data/weekly_results_next.csv`, `data/plan.seed.json`, `data/states.json` and `data/data_notes.json` (the owner-reported tracking fault). Sample data, called "sample".
- `config.json`: the demo clock (`today`), model IDs, period dates, owner targets (not set) and test caps. Tools never read the system time.
- `tools.js`: metric functions, figure records, the four tools, every rule and structured error, the owner functions (approve, reject, record action). Written once; loaded by `server.mjs`, `mcp_server.mjs`, the benchmark and the browser.
- `hooks/`: the next-period read guard and the tool log.
- `prompt.js`, `agent.js`, `lib/replycheck.js`: system prompt, the tool-use loop, and the reply check (tags, unsourced figures, banned phrases, mechanism talk), shared with the scorer.
- `server.mjs`: the single local back end (plan, data, owner API, static pages). `mcp_server.mjs` + `.mcp.json`: the same tools for Claude Code.
- `workspace.html` (built by `build_workspace.mjs`): the owner workspace, three tabs plus the side-panel chat. Replays the newest full run, with any later rerun winning for its case. The chat shows messages and replies only, never tool calls.
- `benchmark/`: `make_answer_key.py` (independent of `tools.js`), `answer-key.json`, `Answer Key.html`, `cases.json` (24 cases and R1), `run_benchmark.mjs`, `score.mjs`, `test_*.mjs` (no key). Final run: `results-full-2026-10-30T00-22-43.json`, 23 of 24. Superseded runs in `benchmark/_old/`.
- `README.md`: what it is, how to run it, the benchmark.

## Rules that must hold (in `tools.js`, proven by the no-key tests)
- Every figure is computed in code and returned as a figure record: ID, value, metric, scope, period. The agent quotes it with its tag `[F-xxxxxx]`.
- ROAS is never called profit.
- Reach and frequency are weekly only; never summed across weeks.
- No spending gate anywhere (changed 30 Oct; `_plan/Feedback decisions - 30 Oct 26.html`). Every campaign and platform gets a review status in code (RP-9): Data issue, Variation not assessable, Limited results, Variable results, Consistent results, on pilot settings 4 weeks, 30 orders, 30%. Rankings are descriptive; Running campaigns are partial and never ranked with Completed.
- Owner-reported data issues live in `data/data_notes.json`; they are supplied information, never presented as detected.
- Proposals are always `pending`. The agent cannot approve, reject or record an action.
- Every campaign is a Sales campaign (founder, 30 Oct).
- Owner targets are not set in `config.json` (BP-8); the owner can enter them on the workspace (browser only), with proposed figures from the data. Set: a target check beside each review status (RP-11), and a routine increase only for Consistent results meeting both targets (PR-11). Not set: no routine increase. Tests `test_boost` and `test_new`: RM 500 per test, RM 1,000 combined; a Data issue refuses a test.
- Budget: within plus or minus 20% per campaign per period, shifts and boosts together; total next-period budget (new tests included) no higher than the Running campaigns' spend Mon 31 Aug to Sun 27 Sep 2026.
- No change to a Completed campaign; no duplicate pending change.
- The next period is unreadable until it closes (after Sun 25 Oct 2026 on the demo clock).
- The check counts only full Monday to Sunday weeks starting after the recorded action date. Status (what the owner recorded; field `done`) and Target met? are separate. Owner records are "reported", never "verified". A new campaign test reads "test results unavailable"; nothing is generated in response to an approval.
- No causal claim in a reply, no talk of tools, attempts or corrections, and never "Done?" (it is Status). The owner's own figures count as sourced; a figure worked out from them does not. The API key comes from the environment only and is never saved.

## Build and test
1. `python generate_data.py` (only when the rules change; same seed, same data).
2. `python benchmark/make_answer_key.py`.
3. `node benchmark/test_tools.mjs` and the other `test_*.mjs` (no key) must pass before any paid run.
4. Benchmark through the gate (the hook runs the no-key tests first): `--sample` first, then one full run; `--only=ID` after a fix; `--rescore=FILE` after a scoring fix, keeping a copy of the first scoring in `benchmark/_old/`.
5. `node build_workspace.mjs`. Never edit `workspace.html` by hand.
