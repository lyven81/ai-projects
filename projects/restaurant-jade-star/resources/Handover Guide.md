# Handover Guide (R4)

Jade Star Chinese Dining 吉星饭厅. Sample data. Every handover goes to one receiver: the restaurant manager.

## The reasons
| # | Code | Reason |
|---|---|---|
| H1 | party_over_10 | Party over 10 |
| H2 | too_soon | Less than 2 hours before the slot |
| H3 | after_booking | Change or cancellation of a confirmed booking |
| H4 | special_request | Special request: cake, decoration, high chair, microphone |
| H5 | outside_season | Date outside December 2026 |
| H6 | party_changed | Party size changed after the code was sent |
| H7 | service_down | Booking service down |
| H8 | confirmation_failed | Confirmation failed: wrong code or code expired (written by the confirmation screen, never by the assistant) |
| H9 | duplicate_conflict | Same phone and slot sent again with different details |
| H10 | complaint | Complaint |
| H11 | asks_for_person | Customer asks for a person: handed over at once, with no questions first |

## H12 The note
Every note carries: the reason, the receiver (restaurant manager), the customer's name and phone, the date, the slot, the party size, the room if one is held, the route (Form, Chat or A2A agent), the customer's words and a one-line summary. Name, phone, route and the held room are filled in by the system; the assistant writes only the reason and the summary. Each note reads on its own, without the conversation.

## H13 What the guest is told
The guest is told the request has gone to the restaurant manager, who will call them on the phone number they gave.
