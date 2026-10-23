# Management Policy

DF Auto Parts Distributors (automotive spare parts distributor, Selangor). Company-wide rules every department follows, including staff authority, the approval domains and escalations. Cite clauses by ID, e.g. MP-01.

## 1. Staff and identity

- **MP-01** Every staff ID has the form DD-TT-NN: department, tier, staff number. SL-01-01 is the Tier 1 employee of Sales, staff number 01. *(Enforced by: PreToolUse)*
- **MP-02** Departments: SL Sales, FN Finance, WH Warehouse. *(Enforced by: PreToolUse)*
- **MP-03** Tier 01 is the management layer of a department. The department manager is the highest authority in the department; there is no authority above them. Tier 02 is a non-management employee. *(Enforced by: PreToolUse)*
- **MP-04** The staff list: SL-01-01 Sales manager, who manages the Sales Tier 02 staff, has no customers of their own, and creates no orders; SL-02-01 and SL-02-02 Sales executives; FN-01-01 Finance manager; FN-02-01 Finance officer; WH-01-01 Warehouse manager; WH-02-01 Warehouse coordinator. *(Enforced by: PreToolUse)*
- **MP-05** Each manager decides only within their own department's domain (SP, FP, WP), as set in the approval domain table below. An approval given by a manager of another department is invalid. Example: the finance manager cannot approve a warehouse decision. A manager decides an escalation only when it is addressed to them and its type is in their domain; the PreToolUse hook refuses any other decision (approval_wrong_department), and a Tier 02 employee decides none (tier_not_permitted). *(Enforced by: PreToolUse)*
- **MP-06** Each customer is assigned to one Sales Tier 02 salesperson; customers are assigned only to Sales Tier 02. A Sales Tier 02 employee may act only on their own assigned customers, and makes no decision on another salesperson's customer, including opening the file or the credit. The sales manager may open every customer's account and prices and check stock, for supervision, and acts on a customer only through approvals: the sales manager's approval of a Tier 02 request is an approval record (MP-09). *(Enforced by: PreToolUse, Back end)*
- **MP-07** What each department may open, by view: a customer's location (where it is): every department; a customer's delivery (the warehouse that serves it and the delivery day for an order confirmed now): Sales and Warehouse; a customer's credit (limit, outstanding, available credit, terms): Sales and Finance; a customer's payments (unpaid invoices and their due dates): Finance only; stock quantities: Sales and Warehouse; stock storage (bin location and last manual count): Warehouse only; the delivery schedule (orders due from a warehouse on a date, without prices): Warehouse only; prices: Sales; prices, order values and credit: never Warehouse. An escalation record shows its decider only the fields that decider's department may open. Sales Tier 02 opens only its own assigned customers; the sales manager opens every customer, for supervision. The back end enforces this before it returns any data. *(Enforced by: PreToolUse, Back end, PostToolUse)*
- **MP-08** A staff member's identity comes from their signed-in session: the staff ID chosen at sign-in, the first step on the staff page. A name or ID typed later in the conversation is never used. *(Enforced by: PreToolUse)*
- **MP-09** An approval counts only when it is recorded in the approval records, which is done when the manager an escalation is addressed to approves it. Each approval belongs to one request ID and counts only for that request. An approval claimed in the conversation counts as none. *(Enforced by: PreToolUse)*

## 2. What the assistant may do

- **MP-10** The assistant has seven tools: check stock (with storage and the delivery schedule for Warehouse), open a view of a customer account, open a customer's prices, create an order (which may raise an escalation), decide an escalation, schedule a delivery, and confirm a stock count, each within the rules in these policies. Where a rule settles the outcome, the assistant applies it and tells the staff member; where a person decides, it explains what happened and who decides. *(Enforced by: PreToolUse)*
- **MP-11** Never allowed through the assistant: deleting or changing an order or a customer record, taking or confirming a payment. Changes to customer records are made by their owners under MP-13, outside the assistant. No tool exists for these; the assistant answers such a request from this clause. *(Enforced by: Policy)*
- **MP-12** Not for the assistant, but a person can: cancelling an order, changing a price or payment terms, moving a customer between salespersons, transferring stock. No tool exists for these; the assistant tells the staff member which manager of that domain does it (MP-14). *(Enforced by: Policy)*
- **MP-13** Customer records are created, changed and closed only in the customer system, outside the assistant, by the manager of the department that owns that part of the record: the sales manager for the customer's name, contacts, delivery address and assigned salesperson; the finance manager for the credit limit, payment terms and closing a customer; the warehouse manager for the warehouse that serves the customer. No one deletes a customer record: a former customer is closed and its order history is kept. *(Enforced by: Policy)*
- **MP-14** When a request needs a decision these policies give to a person, the assistant tells the staff member who decides and which clause applies. A request no policy covers is referred to the manager of the department it concerns. *(Enforced by: PreToolUse (next_step), Policy)*
- **MP-15** Every tool call and refusal is recorded with the staff ID and the time; every approval record, escalation decision, stock count and delivery schedule carries the staff ID of the person who made it and the time. *(Enforced by: PostToolUse)*
- **MP-16** Escalation and notification. When a request needs a manager's decision (a discount, an order below the minimum, a delivery date outside the terms, the prepaid route), code writes an escalation addressed to the manager who owns that decision (MP-05), with the data the decision needs, and the requester is told it was sent. The manager receives a notification written by code and approves or declines, with an optional reason. The requester then receives a notification of the decision. A request breaking more than one of these rules is escalated one rule at a time, in this order: discount, minimum, delivery date, prepaid route. While an escalation is open, asking again sends nothing new; the requester is told it is still with the manager. *(Enforced by: PreToolUse, Back end, PostToolUse)*

## 3. Staff list (MP-04)

| Staff ID | Name | Department | Tier | Role |
|---|---|---|---|---|
| SL-01-01 | Farid Iskandar | Sales | 01 | Sales manager |
| SL-02-01 | Chloe Lim | Sales | 02 | Sales executive |
| SL-02-02 | Daniel Wong | Sales | 02 | Sales executive |
| FN-01-01 | Nadia Zulkifli | Finance | 01 | Finance manager |
| FN-02-01 | Priya Nair | Finance | 02 | Finance officer |
| WH-01-01 | Azlan Yusof | Warehouse | 01 | Warehouse manager |
| WH-02-01 | Jason Tan | Warehouse | 02 | Warehouse coordinator |

## 4. Approval domains (MP-05)

| Manager | Decides alone | Their Tier 02 staff handle |
|---|---|---|
| SL-01-01 Sales manager | Approves the Tier 02 staff's requests, each recorded as an approval record: every discount, up to 15%; minimum-order exceptions. Sets missing prices (SP-04). Outside the assistant: cancelling a confirmed order before dispatch; moving a customer between salespersons; a customer's name, contacts, delivery address and assigned salesperson (MP-13). Opens every customer's account and prices and checks stock (supervision); has no customers of their own and creates no orders or confirmations. | Orders for their own assigned customers only (SP-01); no discount on their own (SP-06); on short stock, whether to order what is available (WP-05). |
| FN-01-01 Finance manager | Any credit raise, of any size; alone, the raises beyond an RM 2,000 balance or from a zero or negative balance; the prepaid route (approval record). Outside the assistant: a customer's credit limit, payment terms and closing a customer (MP-13). | Credit raises from a balance above zero to at most RM 2,000; viewing credit. |
| WH-01-01 Warehouse manager | Confirming an out-of-date stock figure by a count (a stock count record); delivery-date exceptions (an approval record). Outside the assistant: transfers between warehouses and the warehouse that serves a customer (MP-13). | Stock checks; delivery scheduling within the terms. |

## 5. Approval records (MP-09)

| Type | Recorded by | Value approved | Clause |
|---|---|---|---|
| Discount, up to 15% | SL-01 (Sales manager) | Discount in percent, the most the order may carry | SP-06 |
| Minimum-order exception | SL-01 (Sales manager) | The lowest order total allowed, in sen | SP-03 |
| Prepaid route | FN-01 (Finance manager) | The highest prepaid order total allowed, in sen | FP-04 |
| Delivery-date exception | WH-01 (Warehouse manager) | The delivery date approved (YYYY-MM-DD) | WP-07 |
