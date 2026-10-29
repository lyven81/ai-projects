# Kiddoz Back-to-School Campaign Team

One brief from the shop owner becomes campaign copy for WhatsApp, Instagram, email, a blog post and Google search, in Bahasa Melayu, checked against the shop's price list and ready for the owner to approve.

Kiddoz Uniform House is a school uniform niche shop in Bangi, Selangor. Its owner, Puan Zarina Ahmad, writes the back-to-school campaign across five channels, with no marketing staff. This team does the writing; code checks every price, discount and date; the owner approves every channel, and nothing is posted by the system.

## How it works
- **Coordinator** (the main `query()` agent on the Claude Agent SDK): reads the owner's request, runs `extract_facts`, starts the writers for the requested channels together in one response, sends the copy to the reviewer, redoes only a failing channel with its exact error or finding, asks the owner when a fact is missing or wrong, and delivers.
- **Five writers** (WhatsApp, Instagram, email, blog, SEO): each a subagent with one output tool, knowing only the facts and the goal in its task.
- **Reviewer**: an independent subagent that did not write the copy; it checks every channel against the facts and the owner's requirements, then compares all channels for the same offer, prices and dates.
- **Code**: the price list resource (100 campaign SKUs, 26 to 30 October 2026), the fact checks in `extract_facts`, a PostToolUse hook on every writer's tool that checks the copy text itself, the coverage check before review, the caps, and `deliver`, which accepts only the status the run record supports.

## Run it
```
npm install
node benchmark/test_tools.mjs && node benchmark/test_hook.mjs   # no API key needed
node run.mjs "Prepare WhatsApp and Instagram in Santai Bahasa Melayu for PB01 at its promotion price for 26 to 30 October."
```
A live run needs `ANTHROPIC_API_KEY` (or a line `ANTHROPIC_API_KEY=...` in `~/.env`) and is billed to that key. Use a key with a spending limit. Each run is recorded in `runs/`.

The replay page `demo.html` plays back every recorded benchmark run: the facts, the writers' start and finish times, each hook check, the reviewer's findings and every retry, with no key.

## Benchmark
The Answer Key (`benchmark/Answer Key.html`) fixes 16 scenarios in groups A (requested work), B (facts and owner questions), C (parallel work and refinement), D (linked steps) and F (failures), and ten hard limits. `node benchmark/run_benchmark.mjs` runs them, plus A1 in parallel three times and sequentially three times for the timing comparison, and writes `benchmark/results.json`.
