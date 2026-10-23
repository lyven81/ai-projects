# DF Auto Parts Distributors staff assistant

An order approval assistant designed for an automotive spare parts distributor in Selangor, where staff would otherwise chase approvals through calls and messages. Seven staff across Sales, Finance and Warehouse use one desk: a salesperson starts a request, code sends anything a manager must decide to that manager with the facts attached, the manager approves or declines, and the requester is told and carries it out.

- **The AI** (Claude Haiku 5.5) reads each request and picks one of seven tools.
- **Code** checks who is asking, what they may see and do, prices, stock, credit and delivery terms; turns a discount, an order below RM 300, a same-day delivery or the prepaid route into an escalation to the right manager; writes the notifications; and places an order once, only when every approval is recorded.
- **People** decide: the sales manager, the warehouse manager and the finance manager each in their own domain.

Seven scenarios on three orders and a stock task, tested as one day: 36 runs (8 valid, 15 escalation, 8 unauthorised, 5 failure), 36 passed, 0 hard-limit breaches.

```
npm install
python build_policies.py && python generate_data.py && python build_cases.py
node benchmark/test_tools.js && node benchmark/test_mcp.mjs     # no API key
node benchmark/run_benchmark.js --sample                         # ANTHROPIC_API_KEY
node build_staff.mjs                                             # staff-desk.html
```

Before real users, Version 1 still needs a security review, a named owner for monitoring and incidents, a rollback plan, server-side identity in place of the demo's identity dropdown, and dispatch held until Finance verifies payment.
