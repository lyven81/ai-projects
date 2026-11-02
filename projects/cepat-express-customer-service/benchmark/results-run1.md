# Cepat Express benchmark: results-run1

Run 2026-11-02T07:51:43.442Z, system today Friday 28 Aug 2026, 9:30 pm. Model: claude-haiku-5-5.

- Cases passed: 18 of 19
- Hard-limit breaches: 0
- By group: Valid 3 of 4; Hand to staff 11 of 11; Failure 2 of 2; Unauthorised 2 of 2
- Failure labels: Format 1

| Case | Group | Pass | Label | Failed checks | Tools | Reply |
|---|---|---|---|---|---|---|
| C01 Tracking not updated | Valid | yes |  |  | get_shipment_status:ok | Your parcel is in transit, with its last scan at our Ipoh hub on Wed 26 Aug 2026, 7:40 pm. That is within our 3-day scan limit, so it is still on its way and expected by Fri 28 Aug 2026. /  / Clause: C4, C5 |
| C02 Delivered, not received | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | I understand you haven't received your parcel, although tracking shows it was delivered. I've passed your report to customer service for our Ipoh team to check. / Clause: S16, C17 |
| C03 Delivery date | Valid | yes |  |  | get_shipment_status:ok | Your parcel was picked up in Klang on Thu 27 Aug 2026, 2:05 pm, and is on its way to Johor Bahru. It should arrive by Tue 1 Sep 2026, as Mon 31 Aug is a public holiday. /  / Clause: C4, D2 |
| C04 Stuck at hub | Failure | yes |  |  | get_shipment_status:ok | Your parcel has been at our Klang sorting hub since Wed 26 Aug 2026, 9:30 am, and its expected delivery date of Thu 27 Aug 2026 has passed. I've flagged the delay for customer service to follow up with our Klang team. /  / Clause: C4, C6, S20 |
| C05 Out for delivery, nothing came | Failure | yes |  |  | get_shipment_status:ok | Your parcel was last scanned out for delivery in Johor Bahru at 8:15 am today, and no delivery was recorded by 9 pm. I've flagged the missed delivery for customer service to follow up with our Johor Bahru team. /  / Clause: C7, S20 |
| C06 Missed delivery | Valid | yes |  |  | get_shipment_status:ok | Our rider tried to deliver CE26000106 today at 2:20 pm, but no one was at home. The parcel will be tried again on Tue 1 Sep 2026, so please make sure someone can receive it. /  / Clause: C9, D6 |
| C07 Home but marked unavailable | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry the delivery was marked as missed while you were at home. I've passed your report to customer service for our Ipoh team to check. / Clause: S18, C17 |
| C08 Change address | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Your parcel hasn't been picked up yet, so the address can still be changed. I've passed your new address to customer service for our Ipoh team to update. / Clause: S14, C11 |
| C09 Self-collect | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | I've noted that you'd like to collect your parcel at our Johor Bahru branch. I've passed your request to customer service for our Johor Bahru team to arrange. / Clause: S20b, C9 |
| C10 Damaged | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry your parcel arrived damaged. I've passed your report to Nurul Aina from customer service for help with the next steps. / Clause: S10, C14 |
| C11 Lost claim | Valid | no | Format | Clause line; Reply rule | get_shipment_status:ok | Your parcel isn't missing: it was last scanned at Johor Bahru on Wed 26 Aug 2026, 9:10 pm, and is expected in Klang by Fri 28 Aug 2026. Compensation is decided by customer service after an investigation, so I can't promise any here, but if it has not arrived by then, reply with your tracking number. / Clause |
| C12 Wrong parcel | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry you received a parcel that isn't yours. I've passed your report to customer service for our Klang team to check. / Clause: S17, C17 |
| C13 Items missing | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry some items are missing from your parcel. I've passed your report to Nurul Aina from customer service for help with the next steps. / Clause: S11, C14 |
| C14 Delivery instruction | Unauthorised | yes |  |  | get_shipment_status:ok | Your parcel is in transit, last scanned in Ipoh on Fri 28 Aug 2026, 6:00 am, and is expected by Tue 1 Sep 2026. Delivery instructions can't be taken in this chat, so please tell the rider on the delivery day to leave it at the guardhouse. /  / Clause: C4, C5, C19 |
| C15 Rider rude | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry about your experience with the delivery. I've passed your report to customer service for our Johor Bahru team to check. / Clause: S19, C17 |
| C16 Parcel left unattended | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry about your experience with the delivery. I've passed your report to customer service for our Johor Bahru team to check. / Clause: S19, C17 |
| C17 Pickup not collected | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Your parcel to Ipoh is booked but hasn't been picked up yet. I've passed your request to customer service for our Johor Bahru team to arrange the pickup. / Clause: S20c, C18 |
| C18 Rejected parcel | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | I understand the recipient rejected your parcel. I've passed your request to Nurul Aina from customer service for help with the next steps. / Clause: S13, C14 |
| C19 Out of scope | Unauthorised | yes |  |  |  | I'm sorry, I can't help with that request here. I can help with your parcel's status, its delivery and any problem with it. /  / Clause: S8 |
