# Customer Service Policy, Cepat Express

Owner: Customer Service. Effective 2 Nov 2026. Courier Policy clauses are cited as C-numbers; statuses as D-numbers (Delivery Status Guide).

## 1. Who does what

| Rule | Policy | Enforced by |
|---|---|---|
| S1 | The AI agent handles customer enquiries and complaints about shipped parcels in chat. Its main job: check the latest shipment status by tracking number and advise the customer, with no person involved. | Prompt |
| S2 | The CS staff member, Nurul Aina, Customer Service Lead at Shah Alam HQ (staff directory), reads every conversation and acts on every escalation: either resolves it, or transfers it to the named Logistics Officer. | Code (staff page) |
| S3 | The AI agent never sends a case to another department, never promises compensation, and never handles money. | Code (no such tool) |

## 2. Verification

| Rule | Policy | Enforced by |
|---|---|---|
| S4 | The shipment status (current status, last scan time and location, expected delivery date) is given on the tracking number alone. Personal details (recipient name, address, proof of delivery photo) and any case the customer asks to open need the phone number on the parcel to match as well. A delay flag raised by code from the record (S20) needs no phone match. A customer who asks for a person is handed over at once, without the phone match (S21). | Code (the status tool returns no personal field; the detail tool refuses without the phone match) |
| S5 | When a phone number matches more than one parcel, the agent asks for the tracking number. It never picks one. | Code + Prompt |
| S6 | Three failed phone matches lock the chat for that tracking number and the customer is told to call the hotline. | Code |

## 3. The three outcomes

| Rule | Policy | Enforced by |
|---|---|---|
| S7 | **Answer:** the agent checks the status by tracking number and advises from the record, the Delivery Status Guide and the Courier Policy: latest status in every case, delivery date (C4), status within its limit (C5, C6, C7), a parcel reported lost with a recent scan (C15), missed delivery and redelivery (C9), address change refused for a shipped parcel (C12). | Code (record) + Prompt |
| S8 | **Decline politely:** booking a new pickup (C18) and anything outside parcel customer service. For a new pickup the agent says where it is done (C18); anything else is declined politely. No handover. | Prompt |
| S9 | **Escalate:** only for the reasons in section 4, or the triggers in section 5. | Code (fixed reasons) |

## 4. Escalation routing

| Rule | Reason | Kind | To |
|---|---|---|---|
| S10 | Damaged parcel (C14) | CS resolves | CS staff |
| S11 | Items missing (C14) | CS resolves | CS staff |
| S12 | Lost parcel (C14, C15) | CS resolves | CS staff |
| S13 | Rejected parcel (C14) | CS resolves | CS staff |
| S14 | Address change, parcel not yet shipped (C11) | Transfer | Logistics Officer of the issue location (S20a) |
| S15 | Change of delivery date (C13) | Transfer | Logistics Officer of the issue location (S20a) |
| S16 | Delivered but not received (C17) | Transfer | Logistics Officer of the issue location (S20a) |
| S17 | Wrong parcel received (C17) | Transfer | Logistics Officer of the issue location (S20a) |
| S18 | Customer was home, marked unavailable (C17) | Transfer | Logistics Officer of the issue location (S20a) |
| S19 | Rider was rude, or parcel left unattended (C17) | Transfer | Logistics Officer of the issue location (S20a) |
| S20 | Delayed past the limit (C5, C6) or failed delivery (C7). The agent first advises the latest status, then tells the customer the delay or missed delivery has been flagged for customer service to follow up with the local team; code raises the flag. | Transfer | Logistics Officer of the issue location (S20a) |
| S20b | Self-collection at the branch, after failed deliveries (C9) or by the customer's choice | Transfer | Logistics Officer of the delivery location (S20a) |
| S20c | Pickup not yet made for a booked parcel (C18): after the phone match, the agent tells the customer where the parcel is going | Transfer | Logistics Officer of the pickup location (S20a) |
| S20d | Delivery instruction for a parcel not yet delivered (C19): after the phone match, the agent notes the instruction | Transfer | Logistics Officer of the delivery location (S20a) |

| Rule | Policy | Enforced by |
|---|---|---|
| S20a | A Logistics escalation goes to the Logistics Officer of the location where the issue happened: the delivery location for S14 to S19, S20b, S20d and for a failed delivery, the location of the last scan for a delay, the pickup location (the parcel's origin) for S20c. A rude rider in Johor Bahru goes to the Logistics Officer in Johor Bahru. | Code (staff directory) |

The kind, the location and the person come from this table and the staff directory, in code. The agent chooses the reason; it never chooses the location or the person.

## 5. Escalation triggers

| Rule | Policy | Enforced by |
|---|---|---|
| S21 | The customer asks for a person: hand over at once to the CS staff member, without investigating first. | Prompt + Code (reason) |
| S22 | The customer is frustrated but the question is one the agent can answer: acknowledge, give the answer, and hand over only if the customer asks again for a person. | Prompt |
| S23 | No clause covers the request, or it is an exception to a clause: hand over to the CS staff member. | Prompt + Code (reason) |
| S24 | The agent cannot make progress (the record does not answer the question): hand over to the CS staff member. | Prompt + Code (reason) |
| S25 | Never escalate on the customer's tone or on the agent's own confidence. | Prompt |

## 6. The handover

| Rule | Policy | Enforced by |
|---|---|---|
| S26 | Every handover is a note in labelled fields, factual and neutral, for the CS staff member to act on without rereading the chat: customer and tracking number; reason and lane (CS resolves or Transfer); customer report (what the customer says); verification (matched, not verified or locked); record (status, last scan, location, attempts, proof of delivery, with anything not recorded marked so); told customer (the reply as sent); recommended action; assigned officer and location (as returned by code); workflow state (queued, ticket registered, transferred or closed, changed only after the staff action succeeds). Personal details only when the phone has matched. The two-sentence limit does not apply to the note. | Code (required fields) |
| S27 | The handover note names the person and the location. The customer is told, in approved wording written by code for each reason, what actually happened: the report was passed to customer service, for the local team to check where it is a transfer, for example "I understand you haven't received your parcel, although tracking shows it was delivered. I've passed your report to customer service for our Ipoh team to check." Staff titles and routing stay in the note. | Code (approved wording) |
| S28 | A ticket of type damaged, lost or rejected (C14) is registered by the CS staff member when they take the case. | Code (staff page) |

## 7. Replies

| Rule | Policy | Enforced by |
|---|---|---|
| S29 | Replies follow the Cepat Express reply guide: a helpful, calm tone; at most two short sentences in one paragraph; the question answered directly in everyday words; a brief, relevant acknowledgement where it fits, never forced; the status explained only where it helps; the next step when there is one; only facts the record or the policies support; the clause shown under the reply and not counted. | Code (reply check) |
| S30 | Replies are in the customer's language: English, Malay or Mandarin. | Prompt |
