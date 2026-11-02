# Taken from Courier CS Quality Console (2 Nov 2026)

Source: `ai-project/projects/courier-cs-quality-console/` (left untouched).

Kept, as input to the Cepat Express policies and Answer Key:
- `ground-truth-key.json`: 20 contact reasons plus out of scope, the correct action per reason, the `escalate_if` triggers, the reply checklists and the bad reply examples.
- `generate_log.py`: only its `PHRASING` block is used (two customer questions per reason, 42 in all).

Left out, with the reason (step B, 2 Nov):
- `analyze.py`: keyword classifier and reply scoring by substring match. The model reads intent; scoring comes from the tool log, never reply wording.
- `recover.py`, `recovery.json`: grades a scorer against truth; the rebuild's Answer Key is the truth.
- `results.json`, `data/*.csv`: manager metrics (containment, CSAT, handle time, Pareto) on a simulated log.
- `build_console.py`, `build_assistant.py`, templates, `demo.html`: the manager console and fixed-answer page.
