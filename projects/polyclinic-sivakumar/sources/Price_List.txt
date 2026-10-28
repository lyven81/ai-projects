POLYCLINIC SIVAKUMAR
PRICE LIST (PS-PL)
Version: 1.1 | Prepared: 27 October 2026 | Clauses: 5
Status: Demonstration price list written for this staff assistant; not an approved price list for clinical deployment.
MCP resource: reference://price-list

PURPOSE AND PRINCIPLES
One source for every amount on a bill for a patient who is not on a panel. Amounts are held in sen and shown in RM. The assistant never estimates, negotiates or changes a price.

SECTION A: PRICES

PS-PL-01. Services

| Service | Price |
|---|---|
| GP consultation | RM 35.00 |
| Nebuliser treatment | RM 20.00 |
| Wound dressing | RM 15.00 |
| Blood glucose test | RM 8.00 |
| Medical certificate | No charge |
| Referral letter | No charge |

Enforced by: The price list table read by billing prepare bill.

PS-PL-02. Medicines, per unit dispensed

| Medicine | Unit | Price per unit |
|---|---|---|
| Paracetamol 500 mg | tablet | RM 0.20 |
| Amoxicillin 500 mg | capsule | RM 0.80 |
| Metformin 500 mg | tablet | RM 0.30 |
| Amlodipine 5 mg | tablet | RM 0.50 |
| Cetirizine 10 mg | tablet | RM 0.50 |
| Salbutamol inhaler 100 mcg | inhaler | RM 18.00 |
| Omeprazole 20 mg | capsule | RM 0.60 |
| Atorvastatin 20 mg | tablet | RM 0.90 |
| Oral rehydration salts (ORS) | sachet | RM 1.00 |
| Vitamin C 500 mg | tablet | RM 0.40 |
| Ibuprofen 400 mg | tablet | RM 0.50 |
| Loratadine 10 mg | tablet | RM 0.60 |

A medicine line is the quantity Ms Yong marked dispensed times the unit price, so a substitute is priced as the medicine actually dispensed.
Enforced by: The price list table and the dispensed record read by billing prepare bill.

PS-PL-03. A missing price stops the bill
If any line on a bill has no price in this list (or, for a panel patient, in the Panel Price Schedule, PS-PN), the bill is not prepared. The assistant reports the missing price to Siti Kasim and never uses an estimate.
Enforced by: billing prepare bill returns missing_price.

SECTION B: PAYMENT

PS-PL-04. Payment methods
Cash, card and e-wallet. Siti Kasim collects the payment at the counter; the assistant records what Siti Kasim collected and never takes money itself. The amount recorded equals the patient's share of the bill; for cash, the change due is worked out in code. Each payment has one unique receipt number, and a settled bill takes no second payment. The visit closes when the patient's share is paid.
Enforced by: billing record payment with its amount, method, receipt and settled-bill checks.

PS-PL-05. End-of-day reconcile
At closing, Siti Kasim enters the cash counted in the drawer. The day's payments are totalled by method and compared with the count. Any difference is listed bill by bill and written to the owner review list for Dr Sivakumar, as owner, to read.
Enforced by: billing reconcile day and the owner review list.
