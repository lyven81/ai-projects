# Courier Policy, Cepat Express

Owner: Operations. Effective 2 Nov 2026.

The Courier Policy says what a parcel status means and what Cepat Express does about it. The Customer Service Policy says what the AI agent and the CS staff do; it cites these clause IDs and never restates them.

## 1. Parcel status

| Rule | Policy | Enforced by |
|---|---|---|
| C1 | A parcel has one status at a time: Booked (not yet shipped), Picked up, At sorting hub, In transit, Out for delivery, Delivery attempted, Delivered, Rejected by recipient. | Code (data) |
| C2 | A parcel is shipped from the moment it is Picked up. Before that it is Booked. | Code |
| C3 | Every status change is a scan, with date, time and location. The last scan is the current status. | Code (data) |
| C3a | Cepat Express serves three locations: Ipoh, Johor Bahru and Klang, each with a sorting hub and a Logistics Officer. Every parcel's delivery location and every scan location is one of the three. | Code (data check) |

## 2. Delivery standards and limits

| Rule | Policy | Enforced by |
|---|---|---|
| C4 | Delivery standard: 2 working days throughout Peninsular Malaysia, counted from pickup. | Code (date shown by the tool) |
| C5 | No new scan for more than 3 days counts as delayed. | Code |
| C6 | A parcel at a sorting hub for more than 48 hours counts as delayed. | Code |
| C7 | A parcel Out for delivery is delivered by 9 pm the same day. After 9 pm with no delivery scan, the delivery has failed. | Code |

## 3. Delivery attempts

| Rule | Policy | Enforced by |
|---|---|---|
| C8 | When no one receives the parcel, the rider records a Delivery attempted scan with the reason. | Code (data) |
| C9 | A missed delivery is attempted again on the next working day, once. After a second failed attempt the parcel waits at the branch for 5 working days for self-collection, then returns to the sender. | Prompt (information) |
| C10 | A Delivered scan carries proof of delivery: time, location and photo or signature. | Code (data) |

## 4. Changes after booking

| Rule | Policy | Enforced by |
|---|---|---|
| C11 | The delivery address can be changed only while the parcel is Booked. The change is made by Logistics. | Code |
| C12 | Once a parcel is shipped (C2), the address cannot be changed. | Code |
| C13 | A change of delivery date for a shipped parcel is arranged by Logistics. | Prompt (routing in S-policy) |

## 5. Problems with a parcel

| Rule | Policy | Enforced by |
|---|---|---|
| C14 | Damaged parcel, items missing, lost parcel and rejected parcel are registered as a ticket of type damaged, lost or rejected. Items missing is registered as damaged. | Code |
| C15 | Days with no new scan decide the outcome, one rule: 0 to 3 days, on its way (C5); over 3 to 7 days, delayed (C5); over 7 days, lost. When a customer reports a parcel lost but the tracking record shows a scan within 7 days, the agent politely advises that the parcel is not missing and is on its way, with its last scan. | Code |
| C16 | Compensation is decided by Customer Service after investigation. No compensation is promised before that. | Prompt |
| C17 | Delivered but not received, a wrong parcel, a missed delivery while the customer was home, and rider conduct are investigated by the Logistics Officer of the location where the issue happened. | Code (routing in S-policy, S20a) |

## 6. Outside customer service

| Rule | Policy | Enforced by |
|---|---|---|
| C18 | A new pickup is booked by the sender through the Cepat Express app or website. A parcel already booked but not yet picked up (Booked, C2) has its pickup arranged by the Logistics Officer of the pickup location, the parcel's origin (S20c). | Prompt + Code (routing in S-policy) |
| C19 | A special delivery instruction (guardhouse, neighbour) for a parcel not yet delivered is passed to the Logistics Officer of the delivery location, who passes it to the rider (S20d). | Prompt + Code (routing in S-policy) |
