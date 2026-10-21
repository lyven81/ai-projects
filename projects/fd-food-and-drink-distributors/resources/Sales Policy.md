# Sales Policy

FD Food and Drink Distributors (fictional demo wholesaler, Selangor). Orders, prices, discounts and promotions. Cite clauses by ID, e.g. SP-01.

## 1. Orders

- **SP-01** Orders are created by Sales Tier 02 only, for their own assigned customers (MP-06). The sales manager does not create orders; the sales manager approves the team's requests and may read any order summary. *(Enforced by: PreToolUse, Back end)*
- **SP-02** An order lists catalogue SKUs in their ordering unit, in whole units. *(Enforced by: PreToolUse)*
- **SP-03** Minimum order value RM 300. A smaller order needs the sales manager's recorded approval. *(Enforced by: PreToolUse)*
- **SP-04** Prices are the customer's own price list, held in the back end and served only by retrieve_customer_prices. An SKU with no price on that list cannot be ordered until the sales manager sets one. *(Enforced by: PostToolUse, PreToolUse)*
- **SP-05** Promotions apply only between their start and end dates, as listed in the promotion calendar (SP-12). A promotion is a published price and applies without approval. *(Enforced by: PostToolUse, PreToolUse)*
- **SP-06** Every discount needs the sales manager's recorded approval, up to 15%; nothing above 15%. Sales Tier 02 staff cannot give a discount on their own. *(Enforced by: PreToolUse)*
- **SP-07** The staff member confirms the full order summary on the staff page before the order is created: customer, SKUs and quantities, prices, discount, total, payment route and delivery date. A change to any of these needs a new confirmation. *(Enforced by: PreToolUse)*
- **SP-08** Every order request carries a unique request ID. A retry with the same request ID returns the order already created and never creates a second one. The same applies to a credit raise. *(Enforced by: PreToolUse, Back end)*
- **SP-09** Separately, the same order for the same customer (same SKUs and quantities) under a new request ID within 30 minutes is treated as a likely duplicate and not created; the staff member is asked. *(Enforced by: PreToolUse)*
- **SP-10** A confirmed order may be cancelled before dispatch by the sales manager only, outside the assistant. After dispatch it cannot be cancelled. *(Enforced by: Policy)*
- **SP-11** Order confirmations to customers are sent outside the assistant, only to an approved contact stored against the customer, with text taken from the saved order. The assistant has no tool for them. *(Enforced by: Policy)*
- **SP-12** The promotion calendar is the table below: promotion, SKUs, discount, start and end date. Its promotion prices are published prices, not discounts under SP-06. *(Enforced by: PostToolUse)*

## 2. Promotion calendar (SP-12)

| Promotion | Name | SKUs | Off the list price | From | To |
|---|---|---|---|---|---|
| PR-01 | Malaysia Day drinks | FD-DR-001, FD-DR-002 | 8% | 2026-09-10 | 2026-09-20 |
| PR-02 | October noodles | FD-PF-003, FD-PF-004 | 10% | 2026-09-25 | 2026-10-15 |
| PR-03 | Deepavali cooking oil and ghee | FD-CI-001, FD-CI-005 | 12% | 2026-10-20 | 2026-11-08 |

## 3. Values (SP-03, SP-06, SP-09)

| Value | Setting |
|---|---|
| Minimum order value | RM 300.00 |
| Maximum discount, with the sales manager's approval | 15% |
| Likely-duplicate window | 30 minutes |
