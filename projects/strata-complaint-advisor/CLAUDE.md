# Strata Complaint Advisor

One AI agent advises the admin officer of Amber Residences, a sample condominium of four blocks under one management corporation, on each resident complaint before the officer acts. Code masks personal numbers, catches emergencies, ranks the rules by precedence and checks every piece of guidance; the AI retrieves the rules, says how they apply and drafts the reply; the officer and the building manager decide. Built 17 Nov 2026 on the Fire Claim Examiner RAG engine.

## Layout

| Path | Role |
|---|---|
| `corpus/legal/` | The English Act 757 sections, Regulations Part XV and Third Schedule by-laws the cases need, one file per passage with its page. Built by `build/extract_legal.py` from `../../_build/Act.txt` and `Regs.txt` (the PNMB PDFs stay out of the repo) |
| `corpus/building/` | The building's documents (sample): additional by-laws (ABL), house rules (HR, HR-7 a draft never adopted), complaint SOP (the prompt resource), reply templates |
| `data/chunks.json` | 75 chunks with building, tier, number, page, approval status, effective date, topics. `build/chunk_corpus.py` |
| `data/units.json`, `data/complaints.json` | The unit register (608 units, 464 occupied; `build/build_units.py`) and the 20 sample complaints |
| `rules/sop_steps.json`, `rules/missing_facts.json` | SOP steps, handover reasons and facts to collect per type, from the SOP |
| `engine/retrieval.py`, `engine/rule_search.py` | Vector plus BM25 pool, a complaint-type router, paragraph-level cross-encoder rerank, precedence order |
| `engine/intake.py`, `engine/complaint_file.py` | Masking and the emergency check before any AI call; the complaint file and the handover note written in code |
| `engine/guard.py` | The submit_guidance guard and the sign-off |
| `mcp_server.py` | Resources `complaint://{id}`, `complaint://{id}/intake`, `sop://complaint`, `rule://{code}`; tools `search_rules`, `get_rule`, `get_template`, `submit_guidance` |
| `prompt.py`, `agent.py` | The advisor's prompt and the tool loop on the Anthropic SDK |
| `benchmark/` | `cases.json` (the Answer Key as data), `test_tools.py` and `test_mcp.py` (no key), `run_benchmark.py`, `bench-kit.json`, `founder-reading.md`, `runs/`, `results/` |
| `build/` | The builders above, plus `build_demo.py` (demo.html, documents.html), `build_answer_key.py` |
| `serve.py` | Live mode on the visitor's own machine with their own key |

## Rules that must hold

- Only approved passages in force on the complaint date are searched or cited. HR-7 and the draft template never are.
- Precedence: the Act, then the Regulations and the Third Schedule, then the additional by-laws, then the house rules. A conflict is resolved in that order, checked by the guard.
- Every cited rule was retrieved for that complaint; every quote is word for word; no fine, penalty or payment amount the documents do not hold; no breach wording while facts are missing; no promised outcome; the reply never names the reported unit; every next step names an SOP step; handover reasons only from the five.
- MyKad and phone numbers are masked before the model, the log or the replay sees them. Emergency words hand over with no model call.
- `benchmark/cases.json` holds exactly the 20 cases; expected results change only by founder decision.
- Runs: 2 + 1. All cases twice, then one run of the cases that failed in either; what still fails goes to the founder.

## Build steps

```bash
python build/extract_legal.py && python build/chunk_corpus.py && python build/build_units.py
python benchmark/test_tools.py && python benchmark/test_mcp.py      # no key
python benchmark/run_benchmark.py --sample                          # 3 cases on Haiku 5.5
python benchmark/run_benchmark.py --only <all ids> --repeat 2        # runs 1 and 2
python benchmark/run_benchmark.py --only <failed ids>                # run 3
python build/build_demo.py --run <run_id> --repeat 1
python build/build_answer_key.py --pair <run_id> --third <run_id>
```

The runner keeps a USD 2 ledger in `benchmark/results/ledger.json` and stops at the cap.
