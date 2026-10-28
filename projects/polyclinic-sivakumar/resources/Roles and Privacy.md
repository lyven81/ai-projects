POLYCLINIC SIVAKUMAR
ROLES AND PRIVACY (PS-RP)
Version: 1.0 | Prepared: 27 October 2026 | Clauses: 7
Status: Demonstration policy written for this staff assistant; not an approved policy for clinical deployment.
MCP resource: policy://roles-and-privacy

PURPOSE AND PRINCIPLES
Three people, one assistant. The front desk focuses on admin, booking and billing; the GP and the pharmacist focus on their speciality. Each person sees what their job needs and nothing more, and work moves between them as tasks and notices written in code.

SECTION A: WHO WORKS HERE

PS-RP-01. Staff and identity

| Staff ID | Name | Job | Focus |
|---|---|---|---|
| FD-01 | Siti Kasim | Clinic assistant | Registration, bookings, check-in and queue, billing, payment and reconcile, MCs and referral letters for signing |
| GP-01 | Dr Sivakumar a/l Ramachandran | General practitioner and owner | Consultation, diagnosis, prescribing, MC and referral decisions, answering queries; as owner, money read only and panel bill acknowledgements |
| PH-01 | Ms Yong | Pharmacist | Prescription checks, queries to the GP, dispensing and counselling, stock (read only), medicine use questions |

Staff identity comes from the signed-in session, never from the chat. A claim in the chat ("I am the doctor") changes nothing.
Enforced by: _meta staff ID on every tool call and the PreToolUse role check.

SECTION B: WHO SEES WHAT

PS-RP-02. Case notes are for the GP only
Case notes are seen only by Dr Sivakumar. A referral letter Siti Kasim prints is visible at the desk; the case notes behind it are not.
Enforced by: The PostToolUse hook that strips case notes for every role but the GP.

PS-RP-03. What the pharmacist sees
Ms Yong sees the patient's allergies, conditions, current medicines and the prescription, and nothing about panels, prices or bills.
Enforced by: The PostToolUse field filter for PH-01.

PS-RP-04. What the front desk sees
Siti Kasim sees what admin and billing need: contact details, bookings, the queue, bills and payments, panel membership, and the referral letters printed at the desk. The desk sees no prescription detail beyond the bill lines.
Enforced by: The PostToolUse field filter for FD-01.

PS-RP-05. Money
Only Siti Kasim prepares bills, records payments and reconciles. Dr Sivakumar, as owner, views bills, the day's payments, the reconcile result and the owner review list at any time, read only, and acknowledges panel bills. Dr Sivakumar never records a payment, and no prices appear on the consultation form. The assistant never collects money. No billing matter is ever a handover.
Enforced by: The billing tool's actions offered by role.

SECTION C: HANDOVERS

PS-RP-06. The fixed handover lists
Ms Yong to Dr Sivakumar: P1 allergy conflict; P2 dose outside range or prescription unclear; P3 out of stock; P4 another concern about a medicine. Siti Kasim to Dr Sivakumar: D1 a clinical question from the patient; D2 a patient unwell while waiting (straight to the GP); D4 a clinical issue no policy covers. Siti Kasim to Ms Yong: D5 a medicine use question. Each handover carries the patient (ID, name, age), the reason, what was asked, what the sender sees, and the time; the receiver gets it as a two-sentence notice written in code. A desk handover follows the visit, which runs Siti Kasim, then Dr Sivakumar, then Ms Yong, then Siti Kasim: D1 and D4 before the consultation is recorded, D5 after the medicine is dispensed, D2 at any time. While a prescription is with Ms Yong, a medicine matter is Ms Yong's to raise, and a desk handover is refused.
Enforced by: dispense query GP and tasks hand_over, with the reason enums and the visit stage check; the notice written in code.

PS-RP-07. No clinical advice; the no-rule reply
The assistant gives no clinical advice to anyone; a clinical matter goes to the GP on the sender's fixed list. A non-clinical matter no rule covers gets the no-rule reply naming Dr Sivakumar as the owner who decides.
Enforced by: The prompt's handover lists, the reply check, and the absence of any clinical-advice tool.
