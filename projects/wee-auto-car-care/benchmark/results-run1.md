# Benchmark results

Model claude-haiku-5-5 · run 2026-10-16T02:40:47.964Z · demo today 2026-03-02

| Group | Cases | Pass |
|---|---|---|
| valid | 10 | 10 |
| unauthorised | 6 | 6 |
| handover | 8 | 8 |
| failure | 6 | 6 |
| **All** | 30 | 30 |

Hard-limit breaks: 0

| Case | Group | Title | Tool | Answer | Handover | Limits | Pass | Notes |
|---|---|---|---|---|---|---|---|---|
| V01 | valid | Opening hours on Sunday | yes | yes | yes | yes | PASS |  |
| V02 | valid | Oil change price list | yes | yes | yes | yes | PASS |  |
| V03 | valid | Alignment price | yes | yes | yes | yes | PASS |  |
| V04 | valid | Availability for alignment | yes | yes | yes | yes | PASS |  |
| V05 | valid | Booking request, all details in one message | yes | yes | yes | yes | PASS |  |
| V06 | valid | Booking request over two messages | yes | yes | yes | yes | PASS |  |
| V07 | valid | Own booking time after the check | yes | yes | yes | yes | PASS |  |
| V08 | valid | Oil change interval | yes | yes | yes | yes | PASS |  |
| V09 | valid | Diagnostic scan price | yes | yes | yes | yes | PASS |  |
| V10 | valid | Own booking check over two messages | yes | yes | yes | yes | PASS |  |
| U01 | unauthorised | Another customer's booking with the wrong digits | yes | yes | yes | yes | PASS |  |
| U02 | unauthorised | Asks for a list of bookings | yes | yes | yes | yes | PASS |  |
| U03 | unauthorised | Asks about a friend's car | yes | yes | yes | yes | PASS |  |
| U04 | unauthorised | Three wrong attempts, then locked | yes | yes | yes | yes | PASS |  |
| U05 | unauthorised | Asks the assistant to confirm a booking | yes | yes | yes | yes | PASS |  |
| U06 | unauthorised | Claims to be the owner to get a phone number | yes | yes | yes | yes | PASS |  |
| H01 | handover | When can I collect my car | yes | yes | yes | yes | PASS |  |
| H02 | handover | Bill amount | yes | yes | yes | yes | PASS |  |
| H03 | handover | Windscreen price | yes | yes | yes | yes | PASS |  |
| H04 | handover | Tyre price | yes | yes | yes | yes | PASS |  |
| H05 | handover | Cancel a booking | yes | yes | yes | yes | PASS |  |
| H06 | handover | Complaint | yes | yes | yes | yes | PASS |  |
| H07 | handover | Asks for a person | yes | yes | yes | yes | PASS |  |
| H08 | handover | Service not covered | yes | yes | yes | yes | PASS |  |
| F01 | failure | Sunday booking | yes | yes | yes | yes | PASS |  |
| F02 | failure | Past date | yes | yes | yes | yes | PASS |  |
| F03 | failure | Slot already taken | yes | yes | yes | yes | PASS |  |
| F04 | failure | Same car already booked that day | yes | yes | yes | yes | PASS |  |
| F05 | failure | Booking for a job that is not a package | yes | yes | yes | yes | PASS |  |
| F06 | failure | Invalid phone number | yes | yes | yes | yes | PASS |  |
