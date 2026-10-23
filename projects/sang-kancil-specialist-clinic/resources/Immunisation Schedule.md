# Immunisation Schedule

IMMUNISATION SCHEDULE (IS)
Version: 1.0 | Prepared and source-checked: 22 October 2026
Demo location: Kota Damansara, Selangor, Malaysia
Status: Source-backed recall reference for a fictional software demonstration; not authority to administer vaccines.
Owner: Dr Aisyah Rahman, lead paediatrician
Related policies: CP-06, CP-10, OP-11, CL-13

## 1. Basis and scope

The baseline is the Malaysian MOH National Immunisation Schedule poster updated August 2023, visually checked against the full-size official poster. The HPV routine age is updated by the official 2026 circular included in S2. This file supports record completeness and recall flags, not vaccine selection, catch-up prescribing, minimum-interval validation or contraindication decisions. It is not a claim that no later local or product-specific instructions exist.

The national baseline, regional exceptions, school programme and optional private services must remain distinguishable. Use calendar months and years, not 30-day months or 365-day years. Historical administrations may follow an earlier valid schedule and require cohort-aware review rather than automatic rejection.


## 2. Routine baseline for selangor

| schedule_id | vaccine_id | vaccine | dose label | target age | service channel |
|---|---|---|---|---|---|
| IS-BCG-0 | VAC-BCG | BCG | single birth dose | birth | maternity/public service; external history |
| IS-HB-0 | VAC-HEPB | Hepatitis B | birth dose | birth | maternity/public service; external history |
| IS-HEX-1 | VAC-HEX | DTaP-IPV-HepB-Hib, six-in-one | primary dose 1 | 2 months | infant clinic |
| IS-HEX-2 | VAC-HEX | DTaP-IPV-HepB-Hib, six-in-one | primary dose 2 | 3 months | infant clinic |
| IS-PCV-1 | VAC-PCV | Pneumococcal conjugate | primary dose 1 | 4 months | infant clinic |
| IS-HEX-3 | VAC-HEX | DTaP-IPV-HepB-Hib, six-in-one | primary dose 3 | 5 months | infant clinic |
| IS-PCV-2 | VAC-PCV | Pneumococcal conjugate | primary dose 2 | 6 months | infant clinic |
| IS-MMR-1 | VAC-MMR | Measles, mumps, rubella | dose 1 | 9 months | infant clinic |
| IS-MMR-2 | VAC-MMR | Measles, mumps, rubella | dose 2 | 12 months | infant clinic |
| IS-PCV-B | VAC-PCV | Pneumococcal conjugate | booster | 15 months | infant clinic |
| IS-HEX-B | VAC-HEX | DTaP-IPV-HepB-Hib, six-in-one | booster | 18 months | infant clinic |
| IS-DT-SCHOOL | VAC-DT | Diphtheria and tetanus | school booster | age 7 / Year 1 | school health service |
| IS-HPV-SCHOOL | VAC-HPV | Human papillomavirus | one routine programme dose | girls age 12 / Year 6, from 1 January 2026 | school health service |
| IS-TT-SCHOOL | VAC-TT | Tetanus toxoid | school booster | age 15 / Form 3 | school health service |

The six-in-one product contains hepatitis B antigen; do not add separate routine hepatitis B doses at ages 1 and 6 months to this baseline. The baseline contains no universal appointment at 8 months, 21 months, age 6 or age 13. Empty ages are not missing doses. The former routine school MR dose is not included; S3 reports its discontinuation from July 2022. Do not automatically schedule MR at age 7 from an older chart.

Age labels for school services identify a school cohort, not an automatic birthday injection date. Verify school enrolment and the programme's invitation or appointment. Historical HPV at age 13 before the 2026 age change remains valid history; never create another dose solely because the current target age is 12.


## 3. Regional exceptions, off by default in selangor

| schedule_id | vaccine_id | vaccine | dose label | target age | applicability |
|---|---|---|---|---|---|
| IS-MEASLES-SBH | VAC-MEASLES | Measles, additional early dose | regional early dose | 6 months | Sabah programme only |
| IS-JE-SWK-1 | VAC-JE | Japanese encephalitis | dose 1 | 9 months | Sarawak programme only |
| IS-JE-SWK-B | VAC-JE | Japanese encephalitis | booster | 21 months | Sarawak programme only |

Record regional administrations if documented, but do not apply these rows to every Selangor patient. A child moving between states requires a clinician-reviewed applicable schedule. The Sabah early measles dose must not automatically replace the later MMR doses; an antigen overlap alone does not establish equivalence. Do not infer a BCG repeat from absence of a scar.


## 4. Hpv change and private-product separation

S2 contains the MOH letter dated 19 November 2025, reference KKM.600-29/4/16 Jld.2 (38), and implementation details reducing routine HPV age from 13 to 12 effective 1 January 2026. It describes one programme dose and catch-up access for specified older groups. This demo activates only the routine Year 6/girls age-12 flag; older unvaccinated girls receive PROGRAMME_REVIEW_REQUIRED rather than an invented catch-up appointment.

The programme one-dose rule shall not be treated as a universal product-label schedule for every private HPV product, sex, age, immune status or previous series. Record the product, prior administrations and programme context. VAC-HPV is the programme tracking antigen; VAC-HPV9 is a specific private billing category in the Fee Schedule. A clinician decides whether a recorded HPV9 dose satisfies programme history; do not automatically generate a multi-dose course from the price entry.


## 5. Optional private services

Influenza is available as a fictional priced private service in the Fee Schedule, but is not an automatic overdue item under this NIP baseline. Varicella, rotavirus, hepatitis A, travel vaccines and other optional services are outside the current demo catalogue. If a doctor later approves one, add a separate versioned product-specific schedule; do not invent ages, dose counts or prices. A booking or a paid vaccine invoice is not evidence that vaccination occurred.


## 6. Data required for status calculation

Patient fields: patient_id, date_of_birth, recorded sex/programme eligibility where required, applicable region, schedule/cohort context and history completeness flag.

Administration fields: administration_id, patient_id, actual product and antigen code, documented dose label, administration date, provider/source, verification status, and batch where available. Mark verified outside-clinic doses as external, not absent. Missing batch information alone does not mean a documented dose was never given; eligibility and record adequacy remain a clinician decision.

Recall fields: schedule_id, status, target_date if applicable, actual programme appointment if known, days_past_target, basis/source, review reason, assigned doctor and clerk action ID. Confidential clinical details shall not be copied into the recall summary.


## 7. Status rules for the demo engine

COMPLETED_RECORDED: A verified administration is explicitly mapped to this required dose. This means recorded completion, not a guarantee of immunological protection or independently validated minimum intervals.

NOT_YET_DUE: For a supported routine infant row, its target age is later than the demo date and there is no contrary clinician plan.

DUE_TODAY: A supported routine infant row reaches its nominal target date today and history explicitly establishes the dose is not given.

PAST_TARGET_REVIEW: A nominal infant target date has passed and complete verified history establishes no mapped dose. Display 'past routine target; clinician to confirm catch-up', not 'give now'. This is the demo's overdue flag for benchmark filtering; it is not a catch-up schedule.

HISTORY_UNVERIFIED: Records are absent, incomplete or contradictory, or a possible equivalent/older-schedule dose is not mapped. Create a record-check action; do not label the patient definitively unvaccinated or count this as confirmed overdue.

SCHOOL_PROGRAMME_REVIEW: The patient belongs to a school-vaccine cohort, but no verified administration or programme appointment is recorded. Request school/public-clinic confirmation; a birthday alone does not establish a missed school visit.

PROGRAMME_REVIEW_REQUIRED: Older HPV catch-up eligibility, regional transfer, immune-status exception or another unsupported programme decision requires clinician/public-service review.

DEFERRED_BY_CLINICIAN: An authorised clinician records a deferral reason and review date. Keep the original target and incomplete status, but follow the recorded review date for contacts; do not describe the dose as completed.

NOT_APPLICABLE: The row does not apply to the patient's verified region or programme group.

For infant dates, add calendar months to date of birth, clamping to the last day of the target month where necessary. Birth doses use the date of birth as the nominal record target. This calculation does not set a clinical grace period or minimum interval. A local reminder may start on the target date; there is no invented 30-day medical grace window. Where a school appointment is explicitly recorded, a missed-appointment flag may be calculated from that date, separately from birthday-based eligibility.


## 8. Recall workflow and access

Use a unique action key patient_id + schedule_id + active review episode to prevent duplicate recalls. Nurul Huda verifies history and contacts the registered guardian; the attending doctor decides catch-up, deferral or other clinical matters. Keep unsuccessful contacts open with a named owner. Recording a booking or closing a recall shall not fabricate an administration; only a verified source record may change vaccination completion.

The clerk may open individual vaccination views for all patients. Each doctor's vaccine-overdue list is limited to their own panel, including Dr Aisyah's infant panel even when she uses lead capacity, under CP-10. Return list fields only: patient ID, name, age and doctor. Details come from an authorised patient view.

The historical eight-tool scope has no vaccination-administration write tool. Actual administrations and history corrections occur in the source clinic system and are then read back; do not add an unapproved write path merely because this reference lists the required fields.


## 9. Benchmark fixtures at thursday, 22 october 2026

A. Mei Xin, 6, proposed DOB 10 February 2020: routine infant PCV booster target 10 May 2021. Seed a verified complete history explicitly showing that booster was not given. Result: PAST_TARGET_REVIEW, requiring Dr Daniel's catch-up assessment; do not recommend an automatic infant booster at age 6. Her school DT is not yet due by age, and there is no universal NIP age-6 booster.

B. Synthetic infant born 22 January 2026: MMR dose-1 target 22 October 2026. With complete history and dose not given, DUE_TODAY; a booking still awaits clinical assessment and guardian confirmation.

C. Baby Adam, DOB 27 October 2025, turns 1 on 27 October 2026: MMR dose-2 target 27 October 2026, so NOT_YET_DUE on 22 October. Doctor-of-record handover follows CL-02 independently of vaccination status.

D. Hana, 15, has a verified historical HPV programme administration at age 13: COMPLETED_RECORDED. Do not recall her for another routine dose because the new cohort age is 12. If her record is missing, route to programme/history review rather than inventing a dose count.

E. A Selangor child with no Sarawak history is NOT_APPLICABLE for the JE rows. A documented Sarawak transfer requires clinician review of that child's regional history.

These dates and history states are proposed synthetic fixtures to support the build, not facts already present in the user's patient database. Old cohorts need clinician mapping where the historical product schedule differs.


## 10. Official sources and update control

S1. MOH Health Education Division, Jadual Imunisasi Kebangsaan, updated August 2023. Full poster visually reviewed; routine infant ages, DT, TT, one-dose HPV baseline and regional exceptions transcribed. HPV age is superseded for the routine 2026 cohort by S2.

https://infosihat.moh.gov.my/penerbitan-multimedia/infografik/item/jadual-imunisasi-kebangsaan-kemaskini-ogos-2023.html

S2. Official 2026 school circular packet hosted by Johor State Education Department, including MOH age-change letter and implementation details. The MOH change concerns the national programme, not a Johor-only vaccine rule. Pages 2 to 3 and 5 were visually checked.

https://jpnjohor.moe.gov.my/images/VAKSIN_HPV_2026.pdf

S3. MOH Annual Report 2022, school-health programme report: routine Year 1 MR administration discontinued from July 2022.

https://www.moh.gov.my/images/04-penerbitan/laporan-tahunan/3a._Laporan_Tahunan_2022_KKM_BM_FINAL.pdf

All sources checked 22 October 2026. Status names, date arithmetic, recall routing and demo fixtures are local design choices, not wording or clinical rules prescribed by MOH. Keep each calculated result linked to this version and its source. Before production use or a new-year cohort, a responsible Malaysian clinician must confirm the applicable national circulars, school programme, catch-up guidance and product-specific requirements. Do not silently apply a new version to historical administrations.

