# Clinic Formulary

CLINIC FORMULARY (CF)
Version: 1.0 | Prepared and source-checked: 22 October 2026
Status: Limited software test formulary. NOT FOR CLINICAL USE.
Owner: Dr Aisyah Rahman, lead paediatrician
Related policies: CL-06 to CL-11, CL-14; BP-02

## 1. Purpose and limits

Eight medicine presentations support realistic record lookup, dispensing, allergy checks and prescription-validation demonstrations. Selected published dosing references inform the test profiles; age cutoffs, review triggers, supported routes and duration limits marked DEMO are local software restrictions. This is not a complete prescribing reference, a treatment recommendation or clinical approval. Only the responsible doctor selects the medicine, indication, dose, frequency and duration.

Source verification means the cited material was consulted, not that a clinician has approved this file. Renal or hepatic impairment, relevant contraindications, uncertain allergies, interacting or duplicate treatment, or an unsupported indication require clinician review outside the automatic pass path. The assistant shall not guess adjustments or propose an alternative medicine.


## 2. Shared validation contract

Each line requires formulary_id, profile_id, route, amount_per_dose, dose_unit, times_per_day or explicit as-needed maximum, duration_days, dispensing_quantity and dispensing_unit. Where a topical amount or site is needed, record it explicitly. A medicine name alone cannot resolve a strength; request the exact presentation.

All new prescription lines require an authorised doctor and valid encounter. Weight-based lines require a positive recorded weight with age 0 to 30 days inclusive at the encounter date; 31 days, a future date or missing weight fails. Non-weight-based entries have weight_required=false; an absent weight is not by itself a failure for those entries.

Use decimal arithmetic and compare unrounded values. For liquids, mg_per_dose = mL_per_dose multiplied by mg_per_mL. Daily mg = mg_per_dose multiplied by maximum doses per day. Dose, frequency, duration, absolute maximum and any weight-based maximum must all pass. Do not treat a per-day range as a per-dose range.

Known allergies require structured ingredient/class mapping plus the actual product's excipient information. A free-text allergy, unknown status, missing required product mapping or an uncertain cross-reaction returns ALLERGY_REVIEW_REQUIRED. Ingredient matches and recorded penicillin-class allergy block amoxicillin. Cephalosporin or other beta-lactam allergy requires clinical review rather than a blanket claim of safety or universal cross-allergy. A 'no known allergies' record must be explicitly present; an empty list is not proof.

Other key errors: FORMULARY_NOT_FOUND, STRENGTH_AMBIGUOUS, PROFILE_NOT_SUPPORTED, WEIGHT_STALE, DOSE_OUTSIDE_PROFILE, FREQUENCY_INVALID, DURATION_INVALID, DUPLICATE_INGREDIENT and CLINICIAN_REVIEW_REQUIRED. Return the value, limit, source/profile and CL clause to the prescriber. A test-profile rejection means this assistant cannot record the line under that profile; it is not a declaration that every other regimen is clinically wrong.


## 3. Presentation register

| formulary_id | generic | form | strength | route | stocked presentation | allergy ingredient/class |
|---|---|---|---|---|---|---|
| MED-PAR120 | Paracetamol | oral liquid | 120 mg/5 mL = 24 mg/mL | oral | 60 mL | paracetamol |
| MED-PAR250 | Paracetamol | oral liquid | 250 mg/5 mL = 50 mg/mL | oral | 60 mL | paracetamol |
| MED-AMX125 | Amoxicillin | reconstituted suspension | 125 mg/5 mL = 25 mg/mL | oral | 100 mL | amoxicillin; penicillin |
| MED-AMX250 | Amoxicillin | reconstituted suspension | 250 mg/5 mL = 50 mg/mL | oral | 100 mL | amoxicillin; penicillin |
| MED-CET1 | Cetirizine hydrochloride | oral solution | 1 mg/mL = 5 mg/5 mL | oral | 60 mL | cetirizine; hydroxyzine/piperazine derivative review |
| MED-CET10 | Cetirizine hydrochloride | tablet | 10 mg/tablet | oral | whole tablets | cetirizine; hydroxyzine/piperazine derivative review |
| MED-SAL100 | Salbutamol | pressurised metered-dose inhaler | 100 micrograms/actuation | inhaled | 200 actuations | salbutamol |
| MED-HC1 | Hydrocortisone | cream | 1% w/w = 10 mg/g | topical | 15 g | hydrocortisone; corticosteroid allergy review |

The generic register does not establish a brand's current Malaysian registration, excipients, stability or pack size. Those are product-specific fields to verify before real use. No medicine-price columns belong in this resource; billing joins by formulary_id through the restricted Fee Schedule.


## 4. Supported test profiles

CF-PAR-01: Paracetamol oral liquid

Presentations: MED-PAR120 or MED-PAR250, never both in the same encounter prescription.

Demo scope: age 3 months to under 18 years; weight up to 40 kg. Other ages or weights require a clinician-approved profile outside this limited demo.

Published reference basis: S3 gives 10 to 15 mg/kg per dose, every 6 hours, maximum 60 mg/kg/day for non-neonatal children in its symptomatic-care context. This demo uses only that limited pattern, not the source's other regimens.

Validation: 10 to 15 mg/kg/dose inclusive; maximum 4 doses in 24 hours, at least 6 hours apart; maximum 60 mg/kg/day. As-needed entries must specify that maximum. Demo duration: 1 to 3 days. Reject duplicate paracetamol ingredients, including a declared combination product; uncertainty about other medicines requires review.

weight_required=true. Age scope, 40 kg scope and duration limit are DEMO restrictions, not universal treatment limits. Return unsupported clinical circumstances to the doctor.

CF-AMX-GAS-BID: Amoxicillin, doctor-confirmed GAS tonsillopharyngitis

Presentations: MED-AMX125 or MED-AMX250.

Demo scope: age 3 years to under 18 years, a doctor-recorded confirmed GAS indication, and no identified adjustment or allergy-review trigger. A generic 'sore throat' or 'tonsillitis' label alone does not satisfy the profile.

Published reference basis: S1 specifies 50 mg/kg/day in one or two doses, maximum 1,000 mg/day, for 10 days. S2 specifies the twice-daily alternative as 25 mg/kg/dose, capped at 500 mg/dose.

Validation: expected per-dose amount = min(25 multiplied by weight_kg, 500) mg; exactly 2 doses/day; exactly 10 days; maximum 500 mg/dose and 1,000 mg/day. DEMO measurement tolerance: actual amount may differ from expected by at most 2%, but may not exceed either absolute cap. Tolerance is a test rounding rule, not a source recommendation. Do not accept every amount below the maximum as an effective dose.

weight_required=true. No automatic once-daily, sinusitis, otitis, prophylaxis, neonatal or renal-adjusted regimen is supported here; those return PROFILE_NOT_SUPPORTED. No antibiotic is selected by the assistant.

CF-CET-2TO5: Cetirizine oral solution, ages 2 to under 6

Presentation: MED-CET1 only.

Reference basis: S4 gives 2.5 mg twice daily for ages 2 to 5.

Validation: 2.5 mg = 2.5 mL per dose; 2 doses/day; maximum 5 mg/day. DEMO duration: 1 to 14 days. A proposed different regimen or ongoing maintenance beyond that window goes to the doctor for a separately reviewed profile.

weight_required=false. Renal impairment, unknown allergy mapping or an unsupported indication prevents an automatic pass.

CF-CET-6TO11: Cetirizine oral solution, ages 6 to under 12

Presentation: MED-CET1 only.

Reference basis: S4 gives 5 mg twice daily for ages 6 to 11.

Validation: 5 mg = 5 mL per dose; 2 doses/day; maximum 10 mg/day. DEMO duration: 1 to 14 days. Tablets and tablet splitting are not enabled for this age profile in the demo.

weight_required=false. The same review triggers apply.

CF-CET-12TO17: Cetirizine, ages 12 to under 18

Presentations: MED-CET1 or MED-CET10, not both together.

Reference basis: S4 gives 10 mg once daily for ages 12 and over.

Validation: 10 mg once daily, supplied as 10 mL solution or one 10 mg tablet; maximum 10 mg/day. DEMO duration: 1 to 14 days. The doctor must record that the patient can use the chosen form; do not substitute automatically.

weight_required=false. The same review triggers apply.

CF-SAL-ROUTINE: Existing routine salbutamol plan, ages 6 to under 18

Presentation: MED-SAL100.

Reference basis: S5 describes routine use as 1 or 2 puffs as needed, at most four occasions in 24 hours; S6 verifies the 100 microgram/actuation presentation in a Malaysian registered-product listing.

Validation: 1 or 2 whole puffs per occasion, explicit as-needed maximum of 4 occasions/24 hours and no more than 8 puffs/24 hours. A doctor-recorded plan reference, review date and intended supply quantity are required. DEMO administrative review interval: no more than 30 days from this encounter; this does not mean the inhaler must be used for 30 days or discarded then.

weight_required=false. This is not an acute-attack protocol; urgent symptoms or a proposed higher-use plan leave this automatic profile for immediate clinician review. A repeat-inhaler request still becomes a request to the own doctor and never issues medicine automatically. Record spacer instructions only as supplied by the doctor.

CF-HC-MANUAL: Hydrocortisone cream, clinician-reviewed entry only

Presentation: MED-HC1.

Reference basis: S7 identifies hydrocortisone as a topical steroid and requires medical or pharmacist advice for children under 10.

No automatic dose-range pass is defined. Record the doctor's site, amount/instructions, frequency, duration, quantity and clinical-review reference; without a verified approved profile, return CLINICIAN_REVIEW_REQUIRED before prescription write. Do not invent a mg/kg rule for a topical medicine or mark the line safe because a numeric field is positive.

weight_required=false. The item can appear in synthetic historical records and billing tests, but new close_visit prescriptions remain blocked until a clinician-approved profile is configured. This deliberate limitation tests correct escalation.


## 5. Demo fixtures and expected outcomes

A. Synthetic Aiman, 4, has weight 12.0 kg measured on 19 October 2026; encounter date 22 October 2026. The responsible doctor explicitly selects the confirmed-GAS BID profile. MED-AMX250 at 6 mL = 300 mg/dose = 25 mg/kg/dose; twice daily = 600 mg/day = 50 mg/kg/day; 10 days. Dose arithmetic passes if all other checks pass. The 12 kg weight is a proposed synthetic test value, not a clinical interpretation of the child.

B. Same fixture, 15 mL = 750 mg/dose; twice daily = 1,500 mg/day. It fails the weight target, 500 mg/dose cap and 1,000 mg/day cap. Return to Dr Daniel, do not silently change 15 mL to 6 mL.

C. Change the entered strength to MED-AMX125 while leaving 6 mL: 150 mg/dose, below the configured target. It fails; the strength must never be guessed from volume alone.

D. Same prescription with a weight measured 31 days earlier: WEIGHT_STALE. Exactly 30 days passes only the freshness check.

E. Penicillin allergy recorded: block amoxicillin; an unknown allergy status triggers review even with an arithmetically valid dose.

F. Ryan, 7, asks through Nurul Huda for another inhaler: create a repeat-prescription request to Dr Daniel; do not issue it using the old plan.

G. Paracetamol for a 20 kg synthetic patient: 240 mg = 10 mg/kg/dose, four times/day = 48 mg/kg/day. Arithmetic passes the profile; 240 mg equals 10 mL of MED-PAR120 but 4.8 mL of MED-PAR250. The doctor supplies the dose; the assistant reports validation only.


## 6. Sources and review record

All sources consulted 22 October 2026. Only the specific reference facts described above were adopted; the restrictive software profiles and fixtures are author-created.

S1. Ministry of Health Malaysia, National Antimicrobial Guideline, B9: Otorhinolaryngology infections, section 1.

https://sites.google.com/moh.gov.my/nag/contents/section-b-paediatrics/b9-otorhinolaryngology-infections

S2. US CDC, Clinical Guidance for Group A Streptococcal Pharyngitis, dated 18 November 2025.

https://www.cdc.gov/group-a-strep/hcp/clinical-guidance/strep-throat.html

S3. WHO, Clinical management and infection prevention and control for mpox: living guideline, Annex 2, symptomatic-care paracetamol reference. Used as a bounded numerical cross-check, not a general Malaysian clinic protocol.

https://www.ncbi.nlm.nih.gov/sites/books/NBK616030/

S4. NHS, How and when to take cetirizine.

https://www.nhs.uk/medicines/cetirizine/how-and-when-to-take-cetirizine/

S5. NHS, How and when to use salbutamol inhalers; page reviewed 13 February 2025. Routine-use facts only; UK emergency-service instructions are not imported into this resource.

https://www.nhs.uk/medicines/salbutamol-inhaler/how-and-when-to-use-salbutamol-inhalers/

S6. Malaysia NPRA QUEST3+, SAL 100 product listing, registration shown as MAL12030002AZ. A listing does not validate the demo's pack size or patient-specific use.

https://quest3plus.bpfk.gov.my/pmo2/detail.php?id=MAL12030002A&type=product

S7. NHS, Hydrocortisone for skin.

https://www.nhs.uk/medicines/hydrocortisone-for-skin/

Before real deployment, a Malaysian paediatrician and pharmacist must approve product-specific references, contraindications, interactions, adjustment rules, formulations and all profiles. Until then, every screen and exported formulary must retain NOT FOR CLINICAL USE.

