POLYCLINIC SIVAKUMAR
HOURS AND SERVICES (PS-HS)
Version: 1.0 | Prepared: 27 October 2026 | Clauses: 7
Status: Demonstration policy written for this staff assistant; not an approved policy for clinical deployment.
MCP resource: clinic://hours-and-services

PURPOSE AND PRINCIPLES
Tell staff and the assistant when the clinic is open, what it offers, and how bookings and the walk-in queue run, so every booking, check-in and follow-up date is checked against one source.

SECTION A: HOURS

PS-HS-01. Opening hours
The clinic is open seven days a week, 09:00 to 18:00, with one doctor, Dr Sivakumar a/l Ramachandran. Appointment slots run from 09:00 to 17:45. Walk-ins are accepted until 17:30. The clinic is closed on public holidays.
Enforced by: The clinic hours table read by the schedule tool and the PreToolUse hook.

PS-HS-02. Public holidays
The clinic is closed on every public holiday in the clinic's holiday table. Monday 1 June 2026 (the Yang di-Pertuan Agong's birthday) is closed. No booking, check-in or follow-up date may fall on a closed day.
Enforced by: The holiday table and the slot check in the schedule tool.

SECTION B: SERVICES

PS-HS-03. Services offered
GP consultation; nebuliser treatment; wound dressing; blood glucose test; dispensing of prescribed medicines by the pharmacist, Ms Yong; medical certificates and referral letters decided by the GP during a consultation. Prices are in the Price List (PS-PL). A service not on this list is not offered and is not booked.
Enforced by: The services enum in record_consultation and the price list lookup in billing.

SECTION C: BOOKINGS AND THE QUEUE

PS-HS-04. Identify the patient first
Before any booking, change, cancellation or check-in, the patient is identified by full name plus the last 4 digits of the IC or the phone number on record. A name alone is not enough; the assistant asks for one of the two. One matching record is returned, never a list.
Enforced by: The patient find action and the identity check in the PreToolUse hook.

PS-HS-05. Booking, changing and cancelling
Siti Kasim books, changes and cancels appointments directly. A slot must be inside the appointment hours, on an open day, and free (no double booking). Every change records who made it, when, and the old and new slot. A follow-up uses the GP's "return in N days" from the consultation record; if that day is closed, the next open day is offered. The assistant never chooses a follow-up date itself.
Enforced by: The schedule tool's slot, holiday and double-booking checks and the change log.

PS-HS-06. Check-in and queue order
Siti Kasim checks the patient in on arrival. A patient already in the queue is not checked in twice. Queue order: appointments at their booked time, walk-ins by arrival time. Dr Sivakumar calls the next patient from the queue.
Enforced by: The schedule tool's check in and call next actions.

PS-HS-07. Registration
A new patient is registered with full name, date of birth, IC last 4 digits, phone number, declared allergies, and the panel and member ID where the patient is on a panel. The IC last 4 digits and the phone number are each unique to one patient. A contact detail is updated only after the patient is identified under PS-HS-04.
Enforced by: The patient register and update contact actions with their field and uniqueness checks.
