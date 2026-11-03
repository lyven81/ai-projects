# Jade Star benchmark: results-fix1

Run 2026-11-03T05:01:33.401Z, test clock 2026-12-14T14:00. Model: claude-haiku-5-5 (assistant and sample customer agent).

- Cases passed: 3 of 3
- Hard-limit breaches: 0
- By group: b 3 of 3
- Failure labels: none

| Case | Group | Pass | Label | Failed checks | Tool log | Reply (last) |
|---|---|---|---|---|---|---|
| 3 Booking held | b | yes |  |  | check_availability:ok, create_proposal:ok, check_availability:ok, create_proposal:refused:ALREADY_HELD | Orchid Room 兰花厅 is already held for you on Tue 22 Dec 2026 at 1pm, reference JS-H1001. The code is on your phone and works for 15 more minutes. |
| 5 Answer questions | b | yes |  |  |  | Welcome to Jade Star Chinese Dining 吉星饭厅. The booking fee is RM 100, added to your bill at check-out, and the room is held for 15 minutes after the slot starts before it is released. The hall tables are walk-in only and cannot be booked. |
| 7 Not available | b | yes |  |  | check_availability:refused:NO_ROOM | Welcome to Jade Star Chinese Dining 吉星饭厅. Sorry, every room for 8 guests is fully booked at 7pm on Sat 26 Dec 2026. That day you can still book 10am, 1pm or 4pm. |
