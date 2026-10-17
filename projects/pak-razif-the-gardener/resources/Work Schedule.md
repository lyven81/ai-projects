# Work Schedule

Pak Razif Garden (fictional demo business). Cite clauses by ID, e.g. W1.

The site visit slots the assistant may book. Which slots are open on a given day comes from Pak Razif's calendar, read live through the availability tool, never from this page.

## 1. Visit days

- **W1** Monday to Saturday. Sunday is a rest day. *(Enforced by: Code (slot list))*
- **W2** Closed on Selangor public holidays. The dates are blocked in the calendar. *(Enforced by: Code (calendar))*

## 2. Site visit slots

- **W3** Visit slots: 08:00 and 10:00 in the morning, 14:00 and 16:00 in the afternoon. *(Enforced by: Code (slot list))*
- **W4** Midday rest: no visits or field work from 12:00 to 14:00, outside the hottest hours. *(Enforced by: Code (slot list))*
- **W5** Each visit takes about 30 minutes, with a 30-minute travel buffer before the next slot. *(Enforced by: Code (slot list))*
- **W6** The time window given to the customer is the slot start plus 30 minutes, for example 08:00 to 08:30. *(Enforced by: Code (confirmation text))*
- **W7** At most 4 visits a day. *(Enforced by: Code (slot list))*
- **W8** Booking window: from the day after the customer's first contact up to the same date in the following month (the last day of that month if it is shorter). First contact on 30 Oct allows bookings up to 30 Nov. The date of first contact stays fixed if the customer returns later. A request beyond the window is forwarded to Pak Razif without booking (P10). *(Enforced by: Code (booking tool))*
- **W9** Same-day requests: a visit on the day of the enquiry is forwarded to Pak Razif, even if a slot later that day is open. The assistant does not reserve the slot (R11). *(Enforced by: Code (booking tool))*

## 3. Availability and booking

- **W10** Open slots come from Pak Razif's calendar. He blocks any slot he cannot keep and can open any blocked slot (P38). *(Enforced by: Code (availability tool))*
- **W11** The slot is reserved before the visit is confirmed. Two customers cannot take the same slot: the booking tool checks again when it reserves. *(Enforced by: Code (booking tool))*
- **W12** If no open slot suits the customer, the assistant offers open slots on nearby days, or forwards the request without booking (P27). *(Enforced by: Code (handover reason))*
- **W13** Pak Razif's field work (gardening jobs agreed after quotations) sits in the same calendar. A visit slot that clashes with field work is blocked, so it is not offered unless Pak Razif opens it. *(Enforced by: Code (calendar))*
