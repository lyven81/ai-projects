POLYCLINIC SIVAKUMAR
AFTER THE CONSULTATION (PS-AC)
Version: 1.1 | Prepared: 27 October 2026 | Clauses: 10
Status: Demonstration policy written for this staff assistant; not an approved policy for clinical deployment.
MCP resource: policy://after-consultation

PURPOSE AND PRINCIPLES
What happens once Dr Sivakumar records a consultation: Ms Yong checks and dispenses the prescription, Siti Kasim bills, and any medical certificate or referral letter the GP decided is prepared for Dr Sivakumar's signature. Each person works on their own speciality; the system carries the work between them. The assistant gives no clinical advice and never changes a drug or a dose.

SECTION A: THE PHARMACIST'S CHECK

PS-AC-01. The formulary

| Medicine | Drug class | Dose per administration | Most per day |
|---|---|---|---|
| Paracetamol 500 mg | analgesic | 500 to 1,000 mg | 4,000 mg |
| Amoxicillin 500 mg | penicillins | 250 to 500 mg, three times a day | 1,500 mg |
| Metformin 500 mg | biguanides | 500 to 1,000 mg | 2,000 mg |
| Amlodipine 5 mg | calcium channel blockers | 5 to 10 mg, once a day | 10 mg |
| Cetirizine 10 mg | antihistamines | 5 to 10 mg, once a day | 10 mg |
| Salbutamol inhaler 100 mcg | beta-2 agonists | 1 to 2 puffs | 8 puffs |
| Omeprazole 20 mg | proton pump inhibitors | 20 to 40 mg, once a day | 40 mg |
| Atorvastatin 20 mg | statins | 10 to 80 mg, once a day | 80 mg |
| Oral rehydration salts (ORS) | oral rehydration | 1 sachet after each loose stool | 8 sachets |
| Vitamin C 500 mg | vitamins | 500 to 1,000 mg | 1,000 mg |
| Ibuprofen 400 mg | NSAIDs | 200 to 400 mg, three times a day | 1,200 mg |
| Loratadine 10 mg | antihistamines | 10 mg, once a day | 10 mg |

Enforced by: The formulary table read by dispense check.

PS-AC-02. What Ms Yong checks before dispensing
A prescription is checked only after the GP has recorded the consultation, and only as the GP wrote it. Four checks: complete (drug, dose, frequency, quantity, instructions); allergy, by drug class through the fixed mapping (Penicillin allergy to penicillins, Sulfa allergy to sulfonamides, NSAID sensitivity to NSAIDs); dose within the formulary range per administration and per day; enough stock for the quantity.
Enforced by: dispense check.

PS-AC-03. A failed check or a concern goes to the GP
When a check fails, or Ms Yong has a professional concern about a medicine even when the checks pass, Ms Yong queries Dr Sivakumar with one reason from the pharmacist's fixed list: P1 allergy conflict; P2 dose outside the range, or prescription incomplete or unclear; P3 medicine out of stock (a substitute needs the GP); P4 another concern about a medicine. Only the GP's amend prescription action changes a prescription; the change is logged and a new check replaces the old one. The GP may also keep the prescription as written, with the answer recorded.
Enforced by: dispense query GP, tasks answer, and record_consultation amend prescription (GP only).

PS-AC-04. Dispensing and counselling
After a passed check, Ms Yong dispenses and counsels the patient on how to take each medicine. Marking it dispensed reduces stock by the quantity dispensed and creates Siti Kasim's bill task. Stock is viewed read only; ordering stock is not part of this assistant.
Enforced by: dispense mark dispensed and view stock.

PS-AC-05. Medicine use questions at the desk
A question at the desk about how to take a dispensed medicine or its side effects goes from Siti Kasim to Ms Yong (D5). Ms Yong answers and Siti Kasim relays the answer to the patient. A question about diagnosis or treatment goes to the GP (D1).
Enforced by: tasks hand_over with reason D5, and Ms Yong's tasks answer action.

SECTION B: BILLING ORDER

PS-AC-06. Bill after dispensing
When there is a prescription, the bill is prepared only after Ms Yong marks it dispensed, so a substitute is priced as dispensed. With no prescription, Siti Kasim's bill task is created straight from the consultation. Prices come from the Price List (PS-PL) or, for a panel patient, the Panel Price Schedule (PS-PN).
Enforced by: The workflow order check in billing prepare bill (not_dispensed applies only when there is a prescription).

SECTION C: MEDICAL CERTIFICATES AND REFERRAL LETTERS

PS-AC-07. Decided by the GP during the consultation only
A medical certificate (MC) or a referral letter is decided by Dr Sivakumar during the consultation and recorded in it. The GP's record instructs Siti Kasim to prepare the document. Neither is raised after the consultation session. An MC is for the patient's employer, school or whoever it concerns; a referral letter is for a specialist clinic or hospital, for further diagnosis and treatment. A declined MC is recorded too.
Enforced by: record_consultation (MC and referral fields) and documents prepare, which refuses without a GP record (no_gp_record).

PS-AC-08. Copied exactly
An MC copies the GP's days and start date; the start date is not before the visit date. A referral letter copies the GP's addressee (hospital or specialist), reason, urgency and clinical summary. The assistant never extends, backdates or rewords either document.
Enforced by: documents prepare, which fills the template only from the consultation record.

PS-AC-09. Signature, serial number and issue
A prepared document shows as "ready for Dr Sivakumar's signature". Siti Kasim marks it issued only after the GP has signed the printed copy. Each document has one serial number (MC-2026-nnnn or REF-2026-nnnn) and is issued once.
Enforced by: documents mark issued, with the prepared and serial checks.

PS-AC-10. A missing template stops the document
If the MC or referral letter template is missing, the document is not prepared and the assistant reports it to Siti Kasim. Nothing is improvised.
Enforced by: documents prepare returns template_missing.
