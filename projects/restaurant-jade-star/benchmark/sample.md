# Jade Star benchmark: sample

Run 2026-11-03T04:47:30.656Z, test clock 2026-12-14T14:00. Model: claude-haiku-5-5 (assistant and sample customer agent).

- Cases passed: 3 of 3
- Hard-limit breaches: 0
- By group: b 2 of 2; c 1 of 1
- Failure labels: none

| Case | Group | Pass | Label | Failed checks | Tool log | Reply (last) |
|---|---|---|---|---|---|---|
| 2 Booking held | b | yes |  |  | create_proposal:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for you on Sat 19 Dec at 1pm for 8 guests, and a 6-digit code has gone to your phone. Please enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out. |
| 8 Hand over | b | yes |  |  | check_availability:refused:PARTY_TOO_LARGE, hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. Our private rooms seat up to 10 guests, so I've passed your booking to our restaurant manager, who will call you on 012-***6708 to arrange it. |
| 13 Booking held | c | yes |  |  | create_proposal:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for 5 guests on Wed 16 Dec 2026 at 4pm, and a 6-digit code has gone to your phone. Please enter it within 15 minutes to confirm; the RM 100 booking fee is added to the bill at check-out. |
