# Benchmark results

Model claude-haiku-5-5, run 2026-10-23T08:36:48.642Z, 4 s. The test day: Thursday 1 October 2026, 10:00 to 11:16 Malaysia time, each step on the state the earlier steps leave.

**3 of 3 runs passed.** Hard-limit breaches: 0.

| Group | Passed |
|---|---|
| valid | 1 of 1 |
| escalation | 1 of 1 |
| unauthorised | 1 of 1 |

Tool selection (agent runs, 3): first tool right 3; calls beyond the minimum 0. tool_choice fallbacks: 0. Replies written in code: 2. Replies sent back by the reply checks: 0.

Tokens: input 11081, output 554, cache read 19551, cache write 58653.

| Step | Staff | Expected | Got | Reply | Pass |
|---|---|---|---|---|---|
| 1.1 | SL-02-02 | create_order refused confirmation_missing | create_order refused confirmation_missing | The summary for C-0004 is ready: 3 cartons of 5W-30 engine oil at RM 440.00 each, total RM 1,320.00 on credit, delivery Friday 2 October 2026. Please check it on the staff page and press Confirm summary. Basis: SP-07 · C-0004 price list · WH-B 48 cartons, updated 16 hours ago | yes |
| 2.3 | SL-01-01 | decide_escalation ok | decide_escalation ok | OK. Chloe's 10% discount on C-0001's order RQ-0002 is approved as AP-0105, and Chloe will place the order. Basis: SP-06, MP-05, MP-09 · AP-0105 recorded by SL-01-01, 10:13 | yes |
| 4.3 | FN-01-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | I'm sorry, stock figures aren't open to you. Only Sales and Warehouse staff can access them. Basis: MP-07, WP-02 | yes |
