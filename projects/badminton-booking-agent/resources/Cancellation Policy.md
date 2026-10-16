# Cancellation Policy

Subang Badminton Arena (fictional demo centre). Cite clauses by ID, e.g. C3.

## 1. Who can cancel

- **C1** Only the player who made the booking, verified by booking reference and the last 4 digits of the mobile number (Booking Policy B17). *(Enforced by: Code)*
- **C2** A held booking whose payment is not reported within 30 minutes is released by staff (Booking Policy B13). Nothing is charged. *(Enforced by: Code)*

## 2. Refund

- **C3** A confirmed booking can be cancelled at any time before the session starts. The RM 50 deposit is refunded in full once the player is verified, with no notice period. A court fee paid at booking is refunded with it. *(Enforced by: Code (outcome calculated))*
- **C4** Refunds go to the account that paid, within 3 working days of staff approval. *(Enforced by: Prompt)*
- **C5** Only a no-show forfeits the deposit: the player neither cancels before the session starts nor checks in. A court fee paid at booking is refunded. *(Enforced by: Code (outcome calculated))*
- **C6** Part of a booking cannot be cancelled. To play fewer hours, the player cancels the booking and books again. *(Enforced by: Code)*

## 3. How a cancellation is processed

- **C7** The assistant tells the player the refund amount before submitting, and submits only when the player agrees. *(Enforced by: Code (outcome returned by the tool))*
- **C8** The request appears on the staff dashboard as a pending cancellation. The booking stays in place until staff approve. *(Enforced by: Code)*
- **C9** On Approve, the court is released and the player receives an automatic message stating the deposit refunded (and the court fee, if paid at booking). *(Enforced by: Code (fixed message))*
- **C10** Refunds are paid by staff outside the chat. The assistant never refunds, waives or reduces an amount. *(Enforced by: Code (no refund tool))*

## 4. Outside this policy

- **C11** Requests to refund a no-show deposit are declined in chat with C5 stated. No exception is made by the assistant. *(Enforced by: Prompt)*
- **C12** A session the centre cancels (power failure, court repair, an event) is handled by staff, who offer a full refund or another slot. The assistant hands these to staff. *(Enforced by: Prompt (handover reason))*
- **C13** Complaints, disputes about a refund, and refunds not received after 3 working days go to staff. *(Enforced by: Prompt (handover reason))*

## 5. How the assistant uses this policy

- Covered by policy: answer from this policy and cite the clause.
- Contradicts policy: decline, state the rule, offer what the rule does allow. No exceptions in chat.
- Not covered by policy: do not guess. Hand to staff (reason not_in_policy).
- Policy neither says yes nor no: do not choose a reading. Hand to staff (reason policy_unclear), naming the clause that seemed to apply.
