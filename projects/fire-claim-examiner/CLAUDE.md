# Fire Policy Underwriter Advisor

One AI agent, the underwriter, advises a claims examiner on fire insurance claims through an MCP server. Code sets every gate status and every figure; the agent reads the claim file, finds the wording and explains it; the examiner decides. Rebuilt from Fire Claim Examiner, 7 Nov 2026.

## Layout

| Path | Role |
|---|---|
| `cases/<claim_no> <label>/` | 22 claim files: `incident.md`, `adjuster.md`, `schedule.md`, `expected.json`; `index.json` |
| `data/chunks.json` | 117 policy chunks, operative clause and scope notes included. Built by `build/chunk_policy.py --pdf <fire policy.pdf>` (the PDF is not redistributed) |
| `rules/condition_tests.json` | The gate tests as data: causes, variant scopes, gate 5 tests, item categories |
| `engine/gates.py` | `ClaimSession`: the six gates in order, the item rules, calculate_payable |
| `engine/calculator.py` | Exclusions, then Condition 20 average per item, then excess after average |
| `engine/retrieval.py`, `engine/policy_search.py` | Vector plus keyword pool, cross-encoder rerank, precedence against the claim's schedule |
| `engine/guard.py` | submit_advice guard: quotes, statuses, figure; two retries |
| `mcp_server.py` | Resources `claim://{claim_no}/incident|adjuster|schedule`, `policy://clause/{code}`; tools `search_policy`, `check_gate`, `calculate_payable`, `submit_advice` |
| `prompt.py`, `agent.py` | The underwriter's prompt and the tool loop on the Anthropic SDK |
| `benchmark/` | `cases.json`, `gold_facts.json`, `test_tools.py` (no key), `run_benchmark.py`, `runs/`, `results/` (ledger, baseline) |
| `build/` | `build_cases.py`, `build_demo.py` with `hood.py` (the Under the hood tab), `build_answer_key.py`, `chunk_policy.py` |
| `_old/` | The original Fire Claim Examiner files: demo, answer key, README, system prompt, lodgement records (`claim case/`), eval harness, adjudicator, regex parser, clause library, ground truth. Nothing in the rebuild uses them; the baseline has its own copy in `../fire-claim-examiner-baseline/` |
| `README.md` | The GitHub readme, with the claim flow as a Mermaid diagram (founder's sample, 7 Nov) |

## Rules that must hold

- The agent never sets a status or computes a figure. `check_gate` and `calculate_payable` do.
- A gate rests only on wording `search_policy` returned for that claim. Quotes are checked word for word by the guard.
- Gates run 1 to 6; the first failure decides; later gates are not reached.
- Gate 2 runs on proximate cause and fails only when the cause is insured nowhere in the policy.
- A building that does not fit the variant held is `pass_flagged` at gate 4, never a fail. A loss after the period with FC815 held, premium paid and no Company receipt is `pass_flagged` at gate 1.
- `benchmark/cases.json` holds exactly the 22 founder-approved claims. Expected results change only by founder decision, in `cases/*/expected.json`, then `python build/build_cases.py`.

## Build steps

```bash
python benchmark/test_tools.py                 # no key; must pass before any paid run
python benchmark/run_benchmark.py --sample     # 3 claims on Haiku 5.5
python benchmark/run_benchmark.py              # all 22 on Haiku 5.5, once
python benchmark/run_benchmark.py --model claude-sonnet-5-5 --only <failed claims>
python build/build_demo.py --run <run_id>      # demo.html from the frozen run
python build/build_answer_key.py
```

The runner keeps a USD 2 ledger in `benchmark/results/ledger.json` and stops at the cap.
