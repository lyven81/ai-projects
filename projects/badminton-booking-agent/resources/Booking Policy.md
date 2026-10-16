# Booking Policy

Subang Badminton Arena (fictional demo centre). Cite clauses by ID, e.g. B7.

## 1. Making a booking

- **B1** Bookings can be made for today and the next 7 days. A date further ahead is refused, with the date it opens for booking. *(Enforced by: Code)*
- **B2** A session starts on the hour and lasts 1, 2 or 3 hours, inside opening hours (Operation Policy O3). *(Enforced by: Code)*
- **B3** A booking must be made at least 2 hours before the session starts. Later than that, the player books at the counter. *(Enforced by: Code)*
- **B4** One booking is for one court. A player may hold up to 2 courts at the same time under one mobile number. *(Enforced by: Code)*
- **B5** The player gives a name and a Malaysian mobile number. No IC number is asked for or stored. *(Enforced by: Code)*
- **B6** A court that is held or confirmed for any part of the requested time cannot be booked. The assistant offers the nearest free courts or times instead. *(Enforced by: Code)*

## 2. Court fee and deposit

- **B7** Court fee, per court per hour: weekday RM 20, weekend RM 25. The weekend fee applies on Saturday, Sunday and public holidays. *(Enforced by: Code (fee table))*
- **B8** Every booking needs a deposit of RM 50, whatever its length. *(Enforced by: Code)*
- **B9** The player chooses when to pay the court fee: together with the deposit when booking, or at the counter after the session (Operation Policy O16). *(Enforced by: Code (amount shown by the tool))*
- **B10** After the session, the deposit is refunded. If the court fee was not paid at booking, the deposit can instead be deducted from it at the counter. *(Enforced by: Prompt)*

## 3. Hold

- **B11** A booking request gets a booking reference (e.g. BK-2041) and holds the court for 30 minutes. The assistant shows the DuitNow QR, the amount (RM 50, or RM 50 plus the court fee) and the reference. *(Enforced by: Code)*
- **B12** Payment is reported only by uploading the payment receipt in the chat within the 30 minutes. A message saying the payment was made, without a receipt, is not accepted. Once a receipt is uploaded, the hold continues until staff check it. *(Enforced by: Code (report needs a receipt))*
- **B13** If the payment is not reported within 30 minutes, the hold is marked expired on the staff dashboard. Staff release it, the court becomes available again, and the player receives an automatic message. Nothing is charged. *(Enforced by: Code (dashboard and fixed message))*

## 4. Confirmation

- **B14** A booking is confirmed only when staff find the payment in the centre's bank record and press Confirm. The assistant never confirms a booking. *(Enforced by: Code (no confirm tool))*
- **B15** On Confirm, the player receives an automatic message: court, date, time, amount paid, and the court fee due at the counter if not yet paid. *(Enforced by: Code (fixed message))*
- **B16** If staff cannot find the payment, they press Not received. The court is released and the player receives an automatic message. *(Enforced by: Code (fixed message))*

## 5. Checking a booking

- **B17** To see a booking, the player gives the booking reference and the last 4 digits of the mobile number on it. Both must match. The assistant then shares that booking only: court, date, time, amounts and status. *(Enforced by: Code)*
- **B18** After 3 failed checks in one conversation, the assistant stops checking and hands the enquiry to staff. *(Enforced by: Code)*

## 6. What the assistant does not handle

- **B19** Changing or moving a booking is not done in chat. The player cancels (Cancellation Policy) and books again, or asks staff. *(Enforced by: Code (no change tool))*
- **B20** These go to staff: weekly or recurring bookings, sessions longer than 3 hours, more than 2 courts, tournaments, events, coaching, corporate and school bookings. *(Enforced by: Prompt (handover reason))*
- **B21** Requests to skip the deposit, hold a court without a booking, or extend a hold are declined under B8 and B11 to B13. *(Enforced by: Code)*
- **B22** A player who asks for a person is handed to staff at once, with no further questions. The request appears on the staff dashboard for follow-up. *(Enforced by: Code (handover reason))*

## 7. Receipts

- **B23** The assistant reads the uploaded receipt: amount, reference, date and time, and recipient. The system compares them with the booking and shows staff the receipt with any difference (wrong amount, wrong reference, paid before the booking was made). *(Enforced by: Code (fixed fields, compared in code))*
- **B24** An image that is not a payment receipt, or cannot be read, is not accepted. The player is asked to upload the receipt again. *(Enforced by: Code)*
- **B25** A receipt does not confirm a booking. Staff confirm only after finding the payment in the bank record (B14). *(Enforced by: Code (no confirm tool))*

## 8. How the assistant uses this policy

- Covered by policy: answer from this policy and cite the clause.
- Contradicts policy: decline, state the rule, offer what the rule does allow. No exceptions in chat.
- Not covered by policy: do not guess. Hand to staff (reason not_in_policy).
- Policy neither says yes nor no: do not choose a reading. Hand to staff (reason policy_unclear), naming the clause that seemed to apply.
