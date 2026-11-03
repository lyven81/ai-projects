# Jade Star benchmark: results-a2a-fix2

Run 2026-11-03T05:44:47.653Z, test clock 2026-12-14T14:00. Model: claude-haiku-5-5 (assistant and sample customer agent).

- Cases passed: 4 of 4
- Hard-limit breaches: 0
- By group: c 3 of 3; d 1 of 1
- Failure labels: none

| Case | Group | Pass | Label | Failed checks | Tool log | Reply (last) |
|---|---|---|---|---|---|---|
| 13 Booking held | c | yes |  |  | check_availability:ok, create_proposal:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for the person on Wed 16 Dec 2026 at 4pm for 5 guests. The code has gone to the person's phone; they must confirm with it within 15 minutes, and the RM 100 fee is added to the bill at check-out. |
| 14 Hand over | c | yes |  |  | check_availability:refused:OUTSIDE_SEASON, hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. We take bookings for December 2026 only, so I've passed the request to our restaurant manager, who will call the person on 012-***6714. |
| 15 Asks for a detail | c | yes |  |  | check_availability:ok, create_proposal:ok | The Orchid Room 兰花厅 is held for the person on Wed 23 Dec 2026 at 4pm for 4 guests, and the code has gone to their phone. They must enter it within 15 minutes to confirm; the RM 100 booking fee is added to the bill at check-out. |
| 18 Confirmed | d | yes |  |  | confirm:ok |  |
