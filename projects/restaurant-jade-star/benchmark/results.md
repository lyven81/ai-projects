# Jade Star benchmark: results

Run 2026-11-03T04:59:54.451Z, test clock 2026-12-14T14:00. Model: claude-haiku-5-5 (assistant and sample customer agent).

- Cases passed: 17 of 20
- Hard-limit breaches: 0
- By group: a 1 of 1; b 8 of 11; c 3 of 3; d 5 of 5
- Failure labels: Wrong outcome 1; Format 1; Wrong tool 1

| Case | Group | Pass | Label | Failed checks | Tool log | Reply (last) |
|---|---|---|---|---|---|---|
| 1 Booking held | a | yes |  |  | form:held |  |
| 2 Booking held | b | yes |  |  | create_proposal:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. The Tulip Room 郁金香厅 is held for you on Sat 19 Dec at 1pm for 8 guests, and a 6-digit code has gone to your phone. Please enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out. |
| 3 Booking held | b | no | Wrong outcome | Repeat returns the reference | check_availability:ok, create_proposal:ok | The Orchid Room 兰花厅 is held for you on Tue 22 Dec at 1pm for 6 guests, and a 6-digit code has gone to your phone. Enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out. |
| 4 Booking held | b | yes |  |  | create_proposal:ok, hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. Orchid Room 兰花厅 is held for you on Sun 20 Dec 2026 at 1pm for 6 guests. A 6-digit code has gone to your phone, so please enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out. I've passed your special request to our restaurant manager, who will call you on 012-***6704 to arrange it. |
| 5 Answer questions | b | no | Format | Reply check |  | Welcome to Jade Star Chinese Dining 吉星饭厅. The booking fee is RM 100, added to your bill at check-out with the meal, and a late room is held for 15 minutes after the slot starts. The hall tables in Jasmine, Lily and Daisy Court are walk-in only and cannot be booked. |
| 6 Not available | b | yes |  |  | check_availability:refused:INVALID_SLOT | Welcome to Jade Star Chinese Dining 吉星饭厅. Sorry, that time is outside our booking times of 10am, 1pm, 4pm and 7pm. On Fri 18 Dec 2026 you can still book 10am, 1pm, 4pm or 7pm. |
| 7 Not available | b | no | Wrong tool | Tools | create_proposal:refused:NO_ROOM | Welcome to Jade Star Chinese Dining 吉星饭厅. Sorry, every room for 8 guests is fully booked at 7pm on Sat 26 Dec 2026. That day you can still book 10am, 1pm or 4pm. |
| 8 Hand over | b | yes |  |  | check_availability:refused:PARTY_TOO_LARGE, hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. Our private rooms seat up to 10 guests, so I've passed your booking to our restaurant manager, who will call you on 012-***6708 to arrange it. |
| 9 Hand over | b | yes |  |  | check_availability:refused:TOO_SOON, hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. Bookings close 2 hours before the slot starts, so I've passed your request to our restaurant manager, who will call you on 012-***6709 shortly. |
| 10 Hand over | b | yes |  |  | hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. Changes to a confirmed booking are handled by our restaurant manager, who will call you on 012-***6710 shortly. |
| 11 Hand over | b | yes |  |  | create_proposal:ok, hand_to_manager:ok | I've passed the new party size to our restaurant manager, who will call you on 012-***6711; your current hold stays in place until then. |
| 12 Hand over | b | yes |  |  | check_availability:refused:SERVICE_DOWN, hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. Our booking system is not available right now, so I've passed your request to our restaurant manager, who will call you on 012-***6712 shortly. |
| 13 Booking held | c | yes |  |  | check_availability:ok, create_proposal:ok | The Tulip Room 郁金香厅 is held for you on Wed 16 Dec 2026 at 4pm for 5 guests, and a 6-digit code has gone to your phone. Enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out. |
| 14 Hand over | c | yes |  |  | hand_to_manager:ok | Welcome to Jade Star Chinese Dining 吉星饭厅. We take bookings for December 2026 only, so I've passed your request to our restaurant manager, who will call you on 012-***6714. |
| 15 Asks for a detail | c | yes |  |  | create_proposal:ok | Orchid Room 兰花厅 is held for you on Wed 23 Dec 2026 at 4pm for 4 guests, and a 6-digit code has gone to your phone. Enter it within 15 minutes to confirm; the RM 100 booking fee is added to your bill at check-out. |
| 16 Confirmed | d | yes |  |  | confirm:ok |  |
| 17 Confirmed | d | yes |  |  | confirm:ok |  |
| 18 Confirmed | d | yes |  |  | confirm:ok |  |
| 19 Not confirmed | d | yes |  |  | confirm:WRONG_CODE |  |
| 20 Not confirmed | d | yes |  |  | confirm:EXPIRED |  |
