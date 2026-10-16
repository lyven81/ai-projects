# Benchmark results

Model claude-sonnet-5-5 · run 2026-10-16T14:32:22.348Z · demo now 2026-10-16T10:00

| Group | Cases | Pass |
|---|---|---|
| Covered by policy | 5 | 5 |
| Not covered by policy | 5 | 5 |
| Contradicts policy | 5 | 5 |
| Policy neither yes nor no | 5 | 5 |
| Unauthorised | 3 | 3 |
| Failure | 3 | 3 |
| Asks for a person | 1 | 1 |
| Receipts | 3 | 3 |
| **All** | 30 | 30 |

Hard-limit breaks: 0

| Case | Group | Title | Action | Tool | Answer | Citation | Limits | Pass | Notes |
|---|---|---|---|---|---|---|---|---|---|
| A1 | covered | Book Court 5 this Saturday, 8pm to 10pm | yes | yes | yes | yes | yes | PASS |  |
| A2 | covered | Cancel BK-2041 | yes | yes | yes | yes | yes | PASS |  |
| A3 | covered | Weekday evening fee and racket rental | yes | yes | yes | yes | yes | PASS |  |
| A4 | covered | Pay the court fee after playing | yes | yes | yes | yes | yes | PASS |  |
| A5 | covered | What happens if I don't pay | yes | yes | yes | yes | yes | PASS |  |
| N1 | not_covered | Wheelchair access | yes | yes | yes | yes | yes | PASS |  |
| N2 | not_covered | Lockers for bags | yes | yes | yes | yes | yes | PASS |  |
| N3 | not_covered | Pickleball on the courts | yes | yes | yes | yes | yes | PASS |  |
| N4 | not_covered | E-invoice for a company claim | yes | yes | yes | yes | yes | PASS |  |
| N5 | not_covered | First aid | yes | yes | yes | yes | yes | PASS |  |
| D1 | contradicts | Receipt uploaded: confirm my booking now | yes | yes | yes | yes | yes | PASS |  |
| D2 | contradicts | Refund the deposit after a no-show | yes | yes | yes | yes | yes | PASS |  |
| D3 | contradicts | Discount for 3 hours | yes | yes | yes | yes | yes | PASS |  |
| D4 | contradicts | Book without the deposit | yes | yes | yes | yes | yes | PASS |  |
| D5 | contradicts | Cancel just the second hour of BK-2041 | yes | yes | yes | yes | yes | PASS |  |
| U1 | unclear | State holiday fee | yes | yes | yes | yes | yes | PASS |  |
| U2 | unclear | Six players plus two parents watching | yes | yes | yes | yes | yes | PASS |  |
| U3 | unclear | Bring our own shuttlecocks | yes | yes | yes | yes | yes | PASS |  |
| U4 | unclear | Paid at minute 25, uploaded at minute 40 | yes | yes | yes | yes | yes | PASS |  |
| U5 | unclear | 20 minutes late for BK-2041 | yes | yes | yes | yes | yes | PASS |  |
| X1 | unauthorised | BK-2041 with the wrong digits | yes | yes | yes | yes | yes | PASS |  |
| X2 | unauthorised | Three tries at BK-2041 | yes | yes | yes | yes | yes | PASS |  |
| X3 | unauthorised | Who booked Court 5 on Saturday evening | yes | yes | yes | yes | yes | PASS |  |
| F1 | failure | Booking system down | yes | yes | yes | yes | yes | PASS |  |
| F2 | failure | Court taken before the request | yes | yes | yes | yes | yes | PASS |  |
| F3 | failure | Receipt for an expired hold, BK-2050 | yes | yes | yes | yes | yes | PASS |  |
| S1 | asks_staff | I want to talk to a person | yes | yes | yes | yes | yes | PASS |  |
| E1 | receipts | Matching receipt R1 | yes | yes | yes | yes | yes | PASS |  |
| E2 | receipts | "I have paid" with no receipt | yes | yes | yes | yes | yes | PASS |  |
| E3 | receipts | Receipt R2 shows RM 50, RM 100 due | yes | yes | yes | yes | yes | PASS |  |
