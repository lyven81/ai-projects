POLYCLINIC SIVAKUMAR
PANEL PRICE SCHEDULE (PS-PN)
Version: 1.0 | Prepared: 27 October 2026 | Clauses: 6
Status: Demonstration schedule written for this staff assistant, with sample panels; not an approved panel agreement.
MCP resource: policy://panel

PURPOSE AND PRINCIPLES
Panel prices are fixed for a stated period, so Siti Kasim bills a panel patient straight from this schedule and never sets or asks for a panel price. Ms Yong, the pharmacist, is not involved in panel billing and sees nothing about panels, prices or bills. Dr Sivakumar, as owner, reads and acknowledges each panel bill later in the day.

SECTION A: THE SCHEDULE

PS-PN-01. The two sample panels

| | Panel Teratai (sample corporate staff panel) | Panel Cempaka (sample insurer outpatient panel) |
|---|---|---|
| Valid from | 1 January 2026 | 1 April 2026 |
| Valid to | 31 December 2026 | 31 March 2027 |
| GP consultation | RM 30.00 | RM 32.00 |
| Nebuliser treatment | RM 18.00 | RM 20.00 |
| Wound dressing | RM 12.00 | RM 15.00 |
| Blood glucose test | RM 8.00 | Excluded |
| Medicines | Price List unit prices (PS-PL-02), fixed for the period | Price List unit prices (PS-PL-02), fixed for the period |
| Limit per visit | RM 80.00 | RM 60.00 |
| Co-pay per visit | None | RM 5.00 |
| Excluded items | Vitamin C 500 mg | Vitamin C 500 mg; blood glucose test |

Enforced by: The panel schedule table read by billing prepare bill.

PS-PN-02. Verify the patient's ID before a panel bill
A panel bill is prepared only after the patient is identified (full name plus IC last 4 digits or phone, PS-HS-04) and that record shows an active membership of the panel on the visit date, with the member ID. Without both, the bill is not prepared on panel prices.
Enforced by: The identity and membership check in billing prepare bill and the PreToolUse hook.

SECTION B: THE SPLIT

PS-PN-03. How a panel bill is split
Each line is priced from the patient's panel column. Covered lines are added up; excluded items are charged in full to the patient. The panel share is the covered total minus the co-pay, up to the panel's limit per visit. The patient's share is the co-pay, plus any covered amount above the limit, plus the excluded items. All amounts are worked out in code, in sen.
Enforced by: The split calculation in billing prepare bill.

PS-PN-04. The panel share awaits claim
The panel share is recorded at billing as awaiting claim. The visit closes when the patient's share is paid. Submitting claims to the panel is not part of this assistant.
Enforced by: The bill status set by billing prepare bill and record payment.

PS-PN-05. Outside the schedule's period
If the visit date is outside the panel's valid period, the bill is not prepared on panel prices (panel_schedule_expired). The assistant gives the no-rule reply naming Dr Sivakumar as the owner who decides. This is not a handover.
Enforced by: The period check in billing prepare bill.

SECTION C: THE OWNER'S READ

PS-PN-06. Every panel bill is filed and acknowledged
Every panel bill Siti Kasim prepares is filed to the owner money tab with the patient, panel, covered and excluded items, panel share awaiting claim and patient's share paid. Dr Sivakumar reads and acknowledges each one at the end of the working day. The acknowledgement records who and when and changes nothing on the bill. Only Dr Sivakumar may acknowledge; an unacknowledged bill stays on the list. No notice is sent and nothing is handed over.
Enforced by: billing acknowledge panel bill (GP only) and the owner money tab.
