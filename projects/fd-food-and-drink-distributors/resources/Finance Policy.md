# Finance Policy

FD Food and Drink Distributors (fictional demo wholesaler, Selangor). Credit, credit raises, payment routes and terms. Cite clauses by ID, e.g. FP-01.

## 1. Credit

- **FP-01** Each customer has a credit limit, a credit limit balance (the credit still available) and an outstanding balance. Credit limit balance = credit limit minus outstanding balance. It can be negative when the outstanding balance is above the limit. *(Enforced by: PostToolUse)*
- **FP-02** Credit is visible to Finance for every customer, to the assigned salesperson for their own customers, and to the sales manager for every customer. Warehouse does not see credit. *(Enforced by: Back end, PostToolUse)*
- **FP-03** Credit route: an order on credit always requires a credit limit balance at least equal to the order total. No approval from any department overrides this. *(Enforced by: PreToolUse, Back end)*
- **FP-04** Prepaid route: with the finance manager's recorded approval, an order is created as a separate prepaid order. It uses no credit, is held as awaiting payment, and is not dispatched until Finance confirms payment outside the assistant. A prepaid approval never turns a credit order into an allowed one. *(Enforced by: PreToolUse)*
- **FP-05** When a credit order exceeds the balance, the options are: a smaller order, the prepaid route (FP-04), or a credit raise by Finance (FP-06 to FP-08). *(Enforced by: PreToolUse (next_step))*

## 2. Credit raises

- **FP-06** A credit raise increases the customer's credit limit; the credit limit balance is then recalculated (FP-01). Finance Tier 02 may raise credit only when the current balance is above zero and the balance after the raise is at most RM 2,000. Example: a balance of RM 1,900 allows a Tier 02 raise of RM 100 at most. Any other raise by Finance Tier 02 is refused, naming the finance manager (raise_beyond_tier2 or raise_from_zero_or_negative). *(Enforced by: PreToolUse, PostToolUse)*
- **FP-07** The finance manager may approve any credit raise. A raise that takes the balance beyond RM 2,000, or any raise when the current balance is zero or negative, is decided by the finance manager only. *(Enforced by: PreToolUse)*
- **FP-08** No one outside Finance approves a credit raise, the sales manager included. *(Enforced by: PreToolUse, Back end)*

## 3. Terms and payments

- **FP-09** Payment terms are set per customer (30 days by default) and changed only by the finance manager, outside the assistant. *(Enforced by: Policy)*
- **FP-10** The assistant never takes, records or confirms a payment. *(Enforced by: Policy)*

## 4. Values (FP-06, FP-09)

| Value | Setting |
|---|---|
| Finance Tier 02 raise: highest balance after the raise | RM 2,000.00 |
| Default payment terms | 30 days |
