# Cepat Express benchmark: results-tighten

Run 2026-11-02T08:47:38.649Z, system today Friday 28 Aug 2026, 9:30 pm. Model: claude-haiku-5-5.

- Cases passed: 12 of 12
- Hard-limit breaches: 0
- By group: Hand to staff 12 of 12
- Failure labels: none

| Case | Group | Pass | Label | Failed checks | Tools | Reply |
|---|---|---|---|---|---|---|
| C02 Delivered, not received | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | I understand you haven't received your parcel, although tracking shows it was delivered. I've passed your report to customer service for our Ipoh team to check. / Clause: S16, C17 |
| C07 Home but marked unavailable | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry the delivery was marked as missed while you were at home. I've passed your report to customer service for our Ipoh team to check. / Clause: S18, C17 |
| C08 Change address | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Your parcel hasn't been picked up yet, so the address can still be changed. I've passed your new address to customer service for our Ipoh team to update. / Clause: S14, C11 |
| C09 Self-collect | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | I've noted that you'd like to collect your parcel at our Johor Bahru branch. I've passed your request to customer service for our Johor Bahru team to arrange. / Clause: S20b, C9 |
| C10 Damaged | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry your parcel arrived damaged. I've passed your report to Nurul Aina from customer service for help with the next steps. / Clause: S10, C14 |
| C12 Wrong parcel | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry you received a parcel that isn't yours. I've passed your report to customer service for our Klang team to check. / Clause: S17, C17 |
| C13 Items missing | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry some items are missing from your parcel. I've passed your report to Nurul Aina from customer service for help with the next steps. / Clause: S11, C14 |
| C14 Delivery instruction | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Thanks, I've noted your delivery instruction. I've passed it to customer service for our Klang team to share with the rider. / Clause: S20d, C19 |
| C15 Rider rude | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry about your experience with the delivery. I've passed your report to customer service for our Johor Bahru team to check. / Clause: S19, C17 |
| C16 Parcel left unattended | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sorry about your experience with the delivery. I've passed your report to customer service for our Johor Bahru team to check. / Clause: S19, C17 |
| C17 Pickup not collected | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Your parcel to Ipoh is booked but hasn't been picked up yet. I've passed your request to customer service for our Johor Bahru team to arrange the pickup. / Clause: S20c, C18 |
| C18 Rejected parcel | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | I understand the recipient rejected your parcel. I've passed your request to Nurul Aina from customer service for help with the next steps. / Clause: S13, C14 |
