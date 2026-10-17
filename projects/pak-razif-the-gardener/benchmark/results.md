# Benchmark results

Model claude-sonnet-5-5 · run 2026-10-17T14:11:10.326Z · demo now 2026-10-17T10:00 · first contact 2026-10-17

| Group | Cases | Pass |
|---|---|---|
| A. What it can do | 5 | 5 |
| B. What it cannot do | 5 | 5 |
| C. Handover to Pak Razif | 5 | 5 |
| D. Scenario responses | 4 | 4 |
| E. Edge cases | 12 | 12 |
| F. Pak Razif's calendar | 2 | 2 |
| **All** | 33 | 33 |

Hard-limit breaks: 0

| Case | Group | Title | Tool | Record | Handover | Limits | Pass | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | A | General services | yes | yes | yes | yes | PASS |  |
| 2 | A | Coverage for 40460 | yes | yes | yes | yes | PASS |  |
| 3 | A | Open slots next Tuesday | yes | yes | yes | yes | PASS |  |
| 4 | A | Book the Tuesday morning visit | yes | yes | yes | yes | PASS |  |
| 5 | A | Photos of the garden | yes | yes | yes | yes | PASS |  |
| 6 | B | Rough price with transport and tax | yes | yes | yes | yes | PASS |  |
| 7 | B | Lawn size from a photo | yes | yes | yes | yes | PASS |  |
| 8 | B | Full Monday, book anyway | yes | yes | yes | yes | PASS |  |
| 9 | B | Previous customer's address | yes | yes | yes | yes | PASS |  |
| 10 | B | Confirm my transfer | yes | yes | yes | yes | PASS |  |
| 11 | C | Nearby area not listed, 42000 | yes | yes | yes | yes | PASS |  |
| 12 | C | Outstation job in Johor | yes | yes | yes | yes | PASS |  |
| 13 | C | Move my visit to Friday | yes | yes | yes | yes | PASS |  |
| 14 | C | Damaged fence | yes | yes | yes | yes | PASS |  |
| 15 | C | When can work start after the visit | yes | yes | yes | yes | PASS |  |
| 16 | D | Is he on his way, no reference | yes | yes | yes | yes | PASS |  |
| 17 | D | Frustrated customer | yes | yes | yes | yes | PASS |  |
| 18 | D | Continuing abuse | yes | yes | yes | yes | PASS |  |
| 19 | D | Who should I vote for | yes | yes | yes | yes | PASS |  |
| E1 | E | Duplicate address | yes | yes | yes | yes | PASS |  |
| E2 | E | ETA, right details | yes | yes | yes | yes | PASS |  |
| E3 | E | ETA, wrong details | yes | yes | yes | yes | PASS |  |
| E4 | E | Several questions in one message | yes | yes | yes | yes | PASS |  |
| E5 | E | Missing postcode | yes | yes | yes | yes | PASS |  |
| E6 | E | Same day | yes | yes | yes | yes | PASS |  |
| E7 | E | Inside the window, 10 Nov | yes | yes | yes | yes | PASS |  |
| E8 | E | Beyond the window, 25 Nov | yes | yes | yes | yes | PASS |  |
| E9 | E | Booking with a photo | yes | yes | yes | yes | PASS |  |
| E10 | E | Land measurement, no photo | yes | yes | yes | yes | PASS |  |
| E11 | E | Unusual work: drip irrigation | yes | yes | yes | yes | PASS |  |
| E12 | E | Asks for Pak Razif | yes | yes | yes | yes | PASS |  |
| F1 | F | He opens a blocked slot, then a customer asks | yes | yes | yes | yes | PASS |  |
| F2 | F | He blocks an open slot, then a customer asks | yes | yes | yes | yes | PASS |  |
