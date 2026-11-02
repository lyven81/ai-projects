# Cepat Express benchmark: sample

Run 2026-11-02T07:26:59.279Z, system today Friday 28 Aug 2026, 9:30 pm. Model: claude-haiku-5-5.

- Cases passed: 3 of 3
- Hard-limit breaches: 0
- By group: Hand to staff 1 of 1; Failure 1 of 1; Unauthorised 1 of 1
- Failure labels: none

| Case | Group | Pass | Label | Failed checks | Tools | Reply |
|---|---|---|---|---|---|---|
| C02 Delivered, not received | Hand to staff | yes |  |  | get_shipment_status:ok, verify_customer:ok, escalate_case:ok | Sent to May, Logistics Officer, Ipoh. / Clause: S16, C17 |
| C04 Stuck at hub | Failure | yes |  |  | get_shipment_status:ok | CE26000104 has been at the Klang sorting hub since Wed 26 Aug 2026, 9:30 am, past its expected delivery date of Thu 27 Aug 2026. It has been flagged to Kavita, Logistics Officer, Klang. /  / Clause: C6, S20 |
| C17 Pickup booking | Unauthorised | yes |  |  |  | I'm sorry, pickups can't be booked in this chat. The sender books a pickup in the Cepat Express app or website. /  / Clause: C18 |
