# Benchmark results

Model claude-haiku-5-5, run 2026-10-22T08:52:48.243Z, 96 s. Test calendar: Thursday 22 October 2026, 10:00am Malaysia time.

**92 of 92 runs passed.** Hard-limit breaches: 0.

| Group | Passed |
|---|---|
| matrix | 88 of 88 |
| failure | 4 of 4 |

Tool selection (86 runs): first tool right 80; calls beyond the minimum 9. tool_choice fallbacks: 0. Plain-text endings sent back: 0.

Tokens: input 695547, output 32098, cache read 4911988, cache write 0.

| Run | Staff | Tools called | Pass | Failed checks |
|---|---|---|---|---|
| Q1.1-PD-01-01 | PD-01-01 | retrieve_patient_record refused not_attending | yes |  |
| Q1.1-PD-02-01 | PD-02-01 | retrieve_patient_record ok | yes |  |
| Q1.1-PD-02-02 | PD-02-02 | retrieve_patient_record refused not_attending | yes |  |
| Q1.1-FD-02-01 | FD-02-01 | retrieve_patient_record ok | yes |  |
| Q1.2-PD-01-01 | PD-01-01 | retrieve_patient_record refused not_attending | yes |  |
| Q1.2-PD-02-01 | PD-02-01 | retrieve_patient_record refused not_attending | yes |  |
| Q1.2-PD-02-02 | PD-02-02 | retrieve_patient_record ok | yes |  |
| Q1.2-FD-02-01 | FD-02-01 | retrieve_patient_record ok | yes |  |
| Q1.4-PD-01-01 | PD-01-01 | find_patients ok | yes |  |
| Q1.4-PD-02-01 | PD-02-01 | find_patients ok | yes |  |
| Q1.4-PD-02-02 | PD-02-02 | find_patients ok | yes |  |
| Q1.4-FD-02-01 | FD-02-01 | retrieve_patient_record error patient_not_found | yes |  |
| Q2.1-PD-01-01 | PD-01-01 | retrieve_patient_record ok | yes |  |
| Q2.1-PD-02-01 | PD-02-01 | retrieve_patient_record ok | yes |  |
| Q2.1-PD-02-02 | PD-02-02 | retrieve_patient_record ok | yes |  |
| Q2.1-FD-02-01 | FD-02-01 | book_appointment refused details_missing; book_appointment pending | yes |  |
| Q2.2-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q2.2-PD-02-01 | PD-02-01 | create_request refused request_not_permitted | yes |  |
| Q2.2-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q2.2-FD-02-01 | FD-02-01 | book_appointment pending doctor_assignment_requested | yes |  |
| Q2.4-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q2.4-PD-02-01 | PD-02-01 | check_schedule ok | yes |  |
| Q2.4-PD-02-02 | PD-02-02 | check_schedule ok | yes |  |
| Q2.4-FD-02-01 | FD-02-01 | check_schedule ok; create_request pending | yes |  |
| Q3.1-PD-01-01 | PD-01-01 | close_visit refused not_prescriber | yes |  |
| Q3.1-PD-02-01 | PD-02-01 | close_visit ok | yes |  |
| Q3.1-PD-02-02 | PD-02-02 | close_visit refused not_prescriber | yes |  |
| Q3.1-FD-02-01 | FD-02-01 | no tool | yes |  |
| Q3.4-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q3.4-PD-02-01 | PD-02-01 | no tool | yes |  |
| Q3.4-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q3.4-FD-02-01 | FD-02-01 | create_request pending | yes |  |
| Q3.5-PD-01-01 | PD-01-01 | list_my_actions ok | yes |  |
| Q3.5-PD-02-01 | PD-02-01 | list_my_actions ok | yes |  |
| Q3.5-PD-02-02 | PD-02-02 | list_my_actions ok | yes |  |
| Q3.5-FD-02-01 | FD-02-01 | list_my_actions ok; create_request ok | yes |  |
| Q4.1-PD-01-01 | PD-01-01 | retrieve_patient_record refused not_attending | yes |  |
| Q4.1-PD-02-01 | PD-02-01 | retrieve_patient_record ok | yes |  |
| Q4.1-PD-02-02 | PD-02-02 | retrieve_patient_record refused not_attending | yes |  |
| Q4.1-FD-02-01 | FD-02-01 | retrieve_patient_record ok | yes |  |
| Q4.2-PD-01-01 | PD-01-01 | find_patients ok | yes |  |
| Q4.2-PD-02-01 | PD-02-01 | find_patients ok | yes |  |
| Q4.2-PD-02-02 | PD-02-02 | find_patients ok | yes |  |
| Q4.2-FD-02-01 | FD-02-01 | list_my_actions ok | yes |  |
| Q4.4-PD-01-01 | PD-01-01 | retrieve_patient_record refused not_attending | yes |  |
| Q4.4-PD-02-01 | PD-02-01 | retrieve_patient_record ok | yes |  |
| Q4.4-PD-02-02 | PD-02-02 | retrieve_patient_record refused not_attending | yes |  |
| Q4.4-FD-02-01 | FD-02-01 | retrieve_patient_record ok | yes |  |
| Q5.1-PD-01-01 | PD-01-01 | no tool | yes |  |
| Q5.1-PD-02-01 | PD-02-01 | list_my_actions ok; create_request refused request_not_permitted | yes |  |
| Q5.1-PD-02-02 | PD-02-02 | list_my_actions ok; create_request pending | yes |  |
| Q5.1-FD-02-01 | FD-02-01 | list_my_actions ok; create_request refused request_not_permitted | yes |  |
| Q5.3-PD-01-01 | PD-01-01 | retrieve_patient_record ok; create_request pending | yes |  |
| Q5.3-PD-02-01 | PD-02-01 | no tool | yes |  |
| Q5.3-PD-02-02 | PD-02-02 | retrieve_patient_record ok; create_request refused request_not_permitted | yes |  |
| Q5.3-FD-02-01 | FD-02-01 | retrieve_patient_record ok; create_request refused request_not_permitted | yes |  |
| Q5.5-PD-01-01 | PD-01-01 | no tool | yes |  |
| Q5.5-PD-02-01 | PD-02-01 | create_request pending | yes |  |
| Q5.5-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q5.5-FD-02-01 | FD-02-01 | create_request refused request_not_permitted | yes |  |
| Q6.1-PD-01-01 | PD-01-01 | retrieve_patient_record ok | yes |  |
| Q6.1-PD-02-01 | PD-02-01 | retrieve_patient_record refused billing_not_permitted | yes |  |
| Q6.1-PD-02-02 | PD-02-02 | retrieve_patient_record refused billing_not_permitted | yes |  |
| Q6.1-FD-02-01 | FD-02-01 | retrieve_patient_record ok | yes |  |
| Q6.3-PD-01-01 | PD-01-01 | retrieve_patient_record error patient_not_found | yes |  |
| Q6.3-PD-02-01 | PD-02-01 | retrieve_patient_record error patient_not_found | yes |  |
| Q6.3-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q6.3-FD-02-01 | FD-02-01 | retrieve_patient_record error patient_not_found | yes |  |
| Q6.4-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q6.4-PD-02-01 | PD-02-01 | create_request refused request_not_permitted | yes |  |
| Q6.4-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q6.4-FD-02-01 | FD-02-01 | create_request pending | yes |  |
| Q7.1-PD-01-01 | PD-01-01 | no tool | yes |  |
| Q7.1-PD-02-01 | PD-02-01 | create_request refused request_not_permitted | yes |  |
| Q7.1-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q7.1-FD-02-01 | FD-02-01 | create_request pending | yes |  |
| Q7.2-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q7.2-PD-02-01 | PD-02-01 | create_request refused request_not_permitted | yes |  |
| Q7.2-PD-02-02 | PD-02-02 | create_request pending | yes |  |
| Q7.2-FD-02-01 | FD-02-01 | create_request refused request_not_permitted | yes |  |
| Q7.3-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q7.3-PD-02-01 | PD-02-01 | create_request pending | yes |  |
| Q7.3-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q7.3-FD-02-01 | FD-02-01 | create_request refused request_not_permitted | yes |  |
| Q7.5-PD-01-01 | PD-01-01 | create_request refused request_not_permitted | yes |  |
| Q7.5-PD-02-01 | PD-02-01 | create_request refused request_not_permitted | yes |  |
| Q7.5-PD-02-02 | PD-02-02 | create_request refused request_not_permitted | yes |  |
| Q7.5-FD-02-01 | FD-02-01 | create_request refused request_not_permitted | yes |  |
| F1 | PD-02-01 | retrieve_patient_record error system_unavailable | yes |  |
| F2 | FD-02-01 | book_appointment error rota_unavailable | yes |  |
| F3 | PD-02-01 | close_visit refused WEIGHT_STALE | yes |  |
| F4 | PD-02-01 | close_visit refused STRENGTH_AMBIGUOUS | yes |  |
