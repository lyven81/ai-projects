# Warehouse Policy

FD Food and Drink Distributors (fictional demo wholesaler, Selangor). Stock, warehouses, delivery terms and the delivery address cut-off. Cite clauses by ID, e.g. WP-01.

## 1. Stock

- **WP-01** Two warehouses, WH-A Shah Alam and WH-B Puchong. Each customer is served from the warehouse for its location, as set in the location table (WP-08). *(Enforced by: Back end)*
- **WP-02** Stock is checked per warehouse. Sales and Warehouse may check stock; Finance may not (MP-07). *(Enforced by: PreToolUse, Back end)*
- **WP-03** 24 hours is the maximum age of a stock figure. A figure within 24 hours is recent enough to quote, not proof that the stock is still there. A figure older than 24 hours is out of date: no order is created on it until the warehouse manager confirms it by a manual count. *(Enforced by: PostToolUse, PreToolUse)*
- **WP-04** Stock is rechecked and reserved by the back end when the order is created, together with the credit. *(Enforced by: Back end)*
- **WP-05** When stock is short, the salesperson decides whether to order the quantity available, with a new confirmation of the summary. There are no back orders. The warehouse delivers what Sales has ordered. *(Enforced by: PreToolUse)*
- **WP-06** Transfers between the two warehouses are decided by the warehouse manager only, outside the assistant. *(Enforced by: Policy)*

## 2. Delivery

- **WP-07** Delivery terms, in Malaysia time (UTC+8): an order confirmed before 3 pm on a working day is delivered the next working day; an order confirmed at or after 3 pm, or on a non-working day, is delivered on the second working day. Working days are Monday to Saturday, except Selangor public holidays listed in WP-09. An earlier or special delivery date needs the warehouse manager's recorded approval. *(Enforced by: PreToolUse)*
- **WP-08** The location table below: each customer location and the warehouse that serves it. *(Enforced by: Back end)*
- **WP-09** The public holiday table below: the Selangor public holidays for the period the demo covers, September to December 2026. *(Enforced by: PreToolUse)*
- **WP-10** Warehouse staff check stock and schedule deliveries within the terms. They do not create orders or see credit. *(Enforced by: PreToolUse, Back end)*
- **WP-11** An order's delivery address cannot be changed after 3 pm Malaysia time on the working day before delivery, when routes are planned. Before that, an address change is made by the sales manager on the customer record (MP-13). After it, the order is delivered as planned, or cancelled and placed again (SP-10). No tool changes an order's address; the assistant answers such a request from this clause. *(Enforced by: Policy)*

## 3. Warehouses (WP-01)

| Warehouse | Place |
|---|---|
| WH-A | Shah Alam |
| WH-B | Puchong |

## 4. Location table (WP-08)

| Location | District | Served from |
|---|---|---|
| Shah Alam | Petaling | WH-A |
| Petaling Jaya | Petaling | WH-A |
| Subang Jaya | Petaling | WH-A |
| Klang | Klang | WH-A |
| Rawang | Gombak | WH-A |
| Selayang | Gombak | WH-A |
| Kuala Selangor | Kuala Selangor | WH-A |
| Puchong | Petaling | WH-B |
| Seri Kembangan | Petaling | WH-B |
| Kajang | Hulu Langat | WH-B |
| Bangi | Hulu Langat | WH-B |
| Cyberjaya | Sepang | WH-B |
| Sepang | Sepang | WH-B |
| Banting | Kuala Langat | WH-B |

## 5. Public holiday table (WP-09)

| Date | Holiday |
|---|---|
| 2026-09-01 | Selangor public holiday |
| 2026-09-16 | Malaysia Day |
| 2026-10-26 | Silver Jubilee of the Sultan of Selangor (replacement for Sunday 25 October) |
| 2026-11-08 | Deepavali |
| 2026-11-09 | Deepavali (replacement) |
| 2026-12-11 | Birthday of the Sultan of Selangor |
| 2026-12-25 | Christmas Day |
