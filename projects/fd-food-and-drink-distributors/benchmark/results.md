# Benchmark results

Model claude-sonnet-5-5, run 2026-10-20T15:30:51.172Z, 113 s. Test calendar: Thursday 1 October 2026, 10:00 Malaysia time.

**109 of 109 runs passed.** Hard-limit breaches: 0.

| Group | Passed |
|---|---|
| matrix | 105 of 105 |
| failure | 4 of 4 |

Tool selection (agent runs, 108): first tool right 108; calls outside the run's set 0; calls beyond the minimum 0. tool_choice fallbacks: 108. Plain-text endings sent back: 0.

Tokens: input 630700, output 26144, cache read 3648421, cache write 0.

| Run | Staff | Expected | Got | Pass |
|---|---|---|---|---|
| Q01-SL-01-01 | SL-01-01 | check_stock ok | check_stock ok | yes |
| Q01-SL-02-01 | SL-02-01 | check_stock ok | check_stock ok | yes |
| Q01-SL-02-02 | SL-02-02 | check_stock ok | check_stock ok | yes |
| Q01-FN-01-01 | FN-01-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q01-FN-02-01 | FN-02-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q01-WH-01-01 | WH-01-01 | check_stock ok | check_stock ok | yes |
| Q01-WH-02-01 | WH-02-01 | check_stock ok | check_stock ok | yes |
| Q02-SL-01-01 | SL-01-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q02-SL-02-01 | SL-02-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q02-SL-02-02 | SL-02-02 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q02-FN-01-01 | FN-01-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q02-FN-02-01 | FN-02-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q02-WH-01-01 | WH-01-01 | check_stock ok | check_stock ok | yes |
| Q02-WH-02-01 | WH-02-01 | check_stock ok | check_stock ok | yes |
| Q03-SL-01-01 | SL-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q03-SL-02-01 | SL-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q03-SL-02-02 | SL-02-02 | retrieve_customer_account refused customer_not_assigned | retrieve_customer_account refused customer_not_assigned | yes |
| Q03-FN-01-01 | FN-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q03-FN-02-01 | FN-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q03-WH-01-01 | WH-01-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q03-WH-02-01 | WH-02-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q04-SL-01-01 | SL-01-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q04-SL-02-01 | SL-02-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q04-SL-02-02 | SL-02-02 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q04-FN-01-01 | FN-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q04-FN-02-01 | FN-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q04-WH-01-01 | WH-01-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q04-WH-02-01 | WH-02-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q05-SL-01-01 | SL-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q05-SL-02-01 | SL-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q05-SL-02-02 | SL-02-02 | retrieve_customer_account refused customer_not_assigned | retrieve_customer_account refused customer_not_assigned | yes |
| Q05-FN-01-01 | FN-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q05-FN-02-01 | FN-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q05-WH-01-01 | WH-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q05-WH-02-01 | WH-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q06-SL-01-01 | SL-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q06-SL-02-01 | SL-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q06-SL-02-02 | SL-02-02 | retrieve_customer_account refused customer_not_assigned | retrieve_customer_account refused customer_not_assigned | yes |
| Q06-FN-01-01 | FN-01-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q06-FN-02-01 | FN-02-01 | retrieve_customer_account refused department_not_permitted | retrieve_customer_account refused department_not_permitted | yes |
| Q06-WH-01-01 | WH-01-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q06-WH-02-01 | WH-02-01 | retrieve_customer_account ok | retrieve_customer_account ok | yes |
| Q07-SL-01-01 | SL-01-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q07-SL-02-01 | SL-02-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q07-SL-02-02 | SL-02-02 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q07-FN-01-01 | FN-01-01 | raise_credit_limit ok | raise_credit_limit ok | yes |
| Q07-FN-02-01 | FN-02-01 | raise_credit_limit ok | raise_credit_limit ok | yes |
| Q07-WH-01-01 | WH-01-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q07-WH-02-01 | WH-02-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q08-SL-01-01 | SL-01-01 | check_stock ok | check_stock ok | yes |
| Q08-SL-02-01 | SL-02-01 | check_stock ok | check_stock ok | yes |
| Q08-SL-02-02 | SL-02-02 | check_stock ok | check_stock ok | yes |
| Q08-FN-01-01 | FN-01-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q08-FN-02-01 | FN-02-01 | check_stock refused department_not_permitted | check_stock refused department_not_permitted | yes |
| Q08-WH-01-01 | WH-01-01 | check_stock ok | check_stock ok | yes |
| Q08-WH-02-01 | WH-02-01 | check_stock ok | check_stock ok | yes |
| Q09-SL-01-01 | SL-01-01 | create_order refused tier_not_permitted | create_order refused tier_not_permitted | yes |
| Q09-SL-02-01 | SL-02-01 | create_order ok | create_order ok | yes |
| Q09-SL-02-02 | SL-02-02 | create_order refused customer_not_assigned | create_order refused customer_not_assigned | yes |
| Q09-FN-01-01 | FN-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q09-FN-02-01 | FN-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q09-WH-01-01 | WH-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q09-WH-02-01 | WH-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q10-SL-01-01 | SL-01-01 | create_order refused tier_not_permitted | create_order refused tier_not_permitted | yes |
| Q10-SL-02-01 | SL-02-01 | create_order ok | create_order ok | yes |
| Q10-SL-02-02 | SL-02-02 | create_order refused customer_not_assigned | create_order refused customer_not_assigned | yes |
| Q10-FN-01-01 | FN-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q10-FN-02-01 | FN-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q10-WH-01-01 | WH-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q10-WH-02-01 | WH-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q11-SL-01-01 | SL-01-01 | create_order refused tier_not_permitted | create_order refused tier_not_permitted | yes |
| Q11-SL-02-01 | SL-02-01 | create_order refused stock_short | create_order refused stock_short | yes |
| Q11-SL-02-02 | SL-02-02 | create_order refused customer_not_assigned | create_order refused customer_not_assigned | yes |
| Q11-FN-01-01 | FN-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q11-FN-02-01 | FN-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q11-WH-01-01 | WH-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q11-WH-02-01 | WH-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q12-SL-01-01 | SL-01-01 | create_order refused tier_not_permitted | create_order refused tier_not_permitted | yes |
| Q12-SL-02-01 | SL-02-01 | create_order refused discount_needs_approval | create_order refused discount_needs_approval | yes |
| Q12-SL-02-02 | SL-02-02 | create_order refused customer_not_assigned | create_order refused customer_not_assigned | yes |
| Q12-FN-01-01 | FN-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q12-FN-02-01 | FN-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q12-WH-01-01 | WH-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q12-WH-02-01 | WH-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q13-SL-01-01 | SL-01-01 | create_order refused tier_not_permitted | create_order refused tier_not_permitted | yes |
| Q13-SL-02-01 | SL-02-01 | create_order refused delivery_exception | create_order refused delivery_exception | yes |
| Q13-SL-02-02 | SL-02-02 | create_order refused customer_not_assigned | create_order refused customer_not_assigned | yes |
| Q13-FN-01-01 | FN-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q13-FN-02-01 | FN-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q13-WH-01-01 | WH-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q13-WH-02-01 | WH-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q14-SL-01-01 | SL-01-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q14-SL-02-01 | SL-02-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q14-SL-02-02 | SL-02-02 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q14-FN-01-01 | FN-01-01 | raise_credit_limit ok | raise_credit_limit ok | yes |
| Q14-FN-02-01 | FN-02-01 | raise_credit_limit refused raise_beyond_tier2 | raise_credit_limit refused raise_beyond_tier2 | yes |
| Q14-WH-01-01 | WH-01-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q14-WH-02-01 | WH-02-01 | raise_credit_limit refused department_not_permitted | raise_credit_limit refused department_not_permitted | yes |
| Q15-SL-01-01 | SL-01-01 | create_order refused tier_not_permitted | create_order refused tier_not_permitted | yes |
| Q15-SL-02-01 | SL-02-01 | create_order needs_reconciliation order_result_mismatch | create_order needs_reconciliation order_result_mismatch | yes |
| Q15-SL-02-02 | SL-02-02 | create_order refused customer_not_assigned | create_order refused customer_not_assigned | yes |
| Q15-FN-01-01 | FN-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q15-FN-02-01 | FN-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q15-WH-01-01 | WH-01-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| Q15-WH-02-01 | WH-02-01 | create_order refused department_not_permitted | create_order refused department_not_permitted | yes |
| F1 | FN-02-01 | raise_credit_limit needs_reconciliation raise_result_mismatch | raise_credit_limit needs_reconciliation raise_result_mismatch | yes |
| F2 | WH-02-01 | check_stock error data_missing | check_stock error data_missing | yes |
| F3 | FN-02-01 | retrieve_customer_account error data_missing | retrieve_customer_account error data_missing | yes |
| F4 | SL-02-01 | create_order refused credit_balance_exceeded | create_order ok; create_order refused credit_balance_exceeded | yes |
