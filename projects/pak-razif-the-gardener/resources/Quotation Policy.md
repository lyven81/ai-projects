# Quotation Policy

Pak Razif Garden (fictional demo business). Cite clauses by ID, e.g. Q1.

How a price is reached. The assistant quotes nothing; Pak Razif quotes after seeing the garden.

## 1. Who quotes

- **Q1** The job scope, the price, any transport charge and any applicable tax are confirmed by Pak Razif after the site visit. *(Enforced by: Prompt)*
- **Q2** The assistant gives no price, estimate, range, transport charge, tax or discount, and does not estimate garden size from a description or a photo. *(Enforced by: Code (no price tool or price data))*
- **Q3** A request for a price gets the approved reply (R1), an offer to book a site visit, and is forwarded to Pak Razif (P23). *(Enforced by: Code (handover reason))*

## 2. After the visit

- **Q4** Pak Razif sends the scope and quotation to the customer directly. The customer decides whether to go ahead. *(Enforced by: Prompt)*
- **Q5** If the customer accepts, Pak Razif and the customer agree the work date directly. The assistant never commits a work date (P29). *(Enforced by: Code (no job booking tool))*
- **Q6** Payment terms are set by Pak Razif with the quotation. The assistant forwards payment questions (P21). *(Enforced by: Code (no payment tool))*
