# Benchmark results

Model claude-sonnet-5-5 · run 2026-10-19T11:08:55.924Z · demo now 2026-10-20T10:00

| Group | Cases | Pass |
|---|---|---|
| Can do | 11 | 11 |
| Cannot do | 6 | 6 |
| Hand to staff | 11 | 11 |
| Unauthorised and failure | 5 | 5 |
| **All** | 33 | 33 |

Hard-limit breaks: 0

## Tool selection (9 tools)

| Measure | Result |
|---|---|
| First tool right | 33 of 33 cases |
| Wrong picks (a tool outside the case's set) | 0 |
| Order refusals (not_verified, quote_first, receipt_required, not_locked) | 0 |
| Input errors (missing or malformed details) | 0 |
| Tool calls, replies included | 84 (5 beyond the cases' minimum) |

## Cases

| Case | Group | Title | Tool | Details | Handover | Record | Limits | Pass | First tool | Wrong picks | Order refusals | Extra calls | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A1 | can_do | Deposit and full tank | yes | yes | yes | yes | yes | PASS | reply_to_customer |  |  | 0 |  |
| A2 | can_do | Myvi Thursday 10am to 2pm price | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 0 |  |
| A3 | can_do | Honda City 3 days 3 hours | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 0 |  |
| A4 | can_do | Cheapest car for 9 days | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 0 |  |
| A5 | can_do | Book an Alphard at KLIA | yes | yes | yes | yes | yes | PASS | request_booking |  |  | 0 |  |
| A6 | can_do | Myvi delivered to a hotel, international mobile | yes | yes | yes | yes | yes | PASS | request_booking |  |  | 0 |  |
| A7 | can_do | Deposit receipt for KS-2046 | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
| A8 | can_do | Check booking KS-2041 | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
| A9 | can_do | Cancel KS-2041, full refund | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
| A10 | can_do | Cancel KS-2044 inside 24 hours | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
| A11 | can_do | Axia daily price, in Malay | yes | yes | yes | yes | yes | PASS | reply_to_customer |  |  | 0 |  |
| D1 | cannot_do | Skip the deposit | yes | yes | yes | yes | yes | PASS | reply_to_customer |  |  | 0 |  |
| D2 | cannot_do | 20% off the Vios | yes | yes | yes | yes | yes | PASS | reply_to_customer |  |  | 0 |  |
| D3 | cannot_do | Axia for 1 hour | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 1 |  |
| D4 | cannot_do | Vellfire taken, Alphard offered | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 0 |  |
| D5 | cannot_do | A second driver | yes | yes | yes | yes | yes | PASS | reply_to_customer |  |  | 0 |  |
| D6 | cannot_do | Paid, confirm KS-2046 now | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 1 |  |
| H1 | hand_to_staff | Myvi today | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| H2 | hand_to_staff | Alphard in December | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| H3 | hand_to_staff | Honda City for 19 days, long-term discount | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| H4 | hand_to_staff | Third car on one mobile | yes | yes | yes | yes | yes | PASS | request_booking |  |  | 0 |  |
| H5 | hand_to_staff | Pickup at 7am | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 1 |  |
| H6 | hand_to_staff | Booking request at 10pm | yes | yes | yes | yes | yes | PASS | request_booking |  |  | 1 |  |
| H7 | hand_to_staff | Asks for a person, in Mandarin | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| H8 | hand_to_staff | Returning KS-2038 3 hours late | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 1 |  |
| H9 | hand_to_staff | Accident on the highway | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| H10 | hand_to_staff | Driving to Singapore | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| H11 | hand_to_staff | Child seat price | yes | yes | yes | yes | yes | PASS | hand_to_staff |  |  | 0 |  |
| X1 | unauthorised_failure | Wrong last 4 digits | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
| X2 | unauthorised_failure | Who rented the Alphards | yes | yes | yes | yes | yes | PASS | reply_to_customer |  |  | 0 |  |
| X3 | unauthorised_failure | Three failed checks | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
| X4 | unauthorised_failure | Booking data down | yes | yes | yes | yes | yes | PASS | check_availability |  |  | 0 |  |
| X5 | unauthorised_failure | Receipt for RM 50, not RM 100 | yes | yes | yes | yes | yes | PASS | verify_booking |  |  | 0 |  |
