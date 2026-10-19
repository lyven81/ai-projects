# AI Projects · Lee Yih Ven

I build practical AI applications that help businesses answer customers, process documents, research and route work. Each project starts from an operational problem and decides what the AI should and should not do. Each one is tested before it is shown, and you can try it yourself.

Live site: https://lyven81.github.io/ai-projects/

**Total published AI projects: 5**

## All Projects (newest first)

| # | Added | Project | Page |
|---|---|---|---|
| 5 | 2026-10-19 | Kereta Sewa Jalan-jalan Car Rental Agent | [page](https://lyven81.github.io/ai-projects/car-rental-booking-agent.html) |
| 4 | 2026-10-19 | Chinese Translation Quality Check | [page](https://lyven81.github.io/ai-projects/chinese-translation-quality-check.html) |
| 3 | 2026-10-17 | Pak Razif The Gardener | [page](https://lyven81.github.io/ai-projects/pak-razif-the-gardener.html) |
| 2 | 2026-10-16 | Badminton Court Booking Agent | [page](https://lyven81.github.io/ai-projects/badminton-booking-agent.html) |
| 1 | 2026-10-16 | Wee Auto Car Care | [page](https://lyven81.github.io/ai-projects/wee-auto-car-care.html) |

## Projects by Problem Type

### Document processing

#### Chinese Translation Quality Check
- **What it does:** A translation review where Claude specialists check the Chinese against the English, and an editor decides every change.
- **How it's built:** A glossary stage corrects settled terms in code; a coordinator routes each section to three Claude specialists (accuracy, section, register); rules in one tools.js, also served as six MCP tools, check every finding; overlapping flags become one box; a fresh grader annotates each box; the editor's decisions become tracked changes and comments in Word. Runs live or on the Message Batches API, with failed requests redone live.
- **Problem solved:** The Chinese version of a quarterly report must say exactly what the English says before release. The review finds wrong figures, dropped negations, added claims, promotional tone and broken punctuation, and the editor decides every change.
- **Page:** [Open](https://lyven81.github.io/ai-projects/chinese-translation-quality-check.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/chinese-translation-quality-check/demo.html)
- **Rebuilt:** 2026-10-19

### Customer service

#### Kereta Sewa Jalan-jalan Car Rental Agent
- **What it does:** A car rental agent that prices, books and records deposits from the written policy, with confirmations, delivery charges and refunds kept for staff.
- **How it's built:** Claude with an MCP server (Node.js) offering the Rental Policy (48 numbered clauses), the car inventory and nine tools; hours, the 2-hour minimum, pricing, the identity check, receipts and cancellation refunds are enforced in the tools' code; confirmations, delivery charges and 25 kinds of handover wait for staff on their phone.
- **Problem solved:** A car rental company at KLIA answers the same price and policy questions all day, in three languages, and checks every payment by hand. The assistant quotes from the policy, prepares bookings and records receipts, and passes the rest to staff with a summary they can act on.
- **Page:** [Open](https://lyven81.github.io/ai-projects/car-rental-booking-agent.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/car-rental-booking-agent/assistant.html)
- **Rebuilt:** 2026-10-19

#### Pak Razif The Gardener
- **What it does:** A gardener's own assistant that answers enquiries and books free site visits while he works, with prices and decisions kept for him.
- **How it's built:** Claude with an MCP server (Node.js) offering six resources with 103 numbered rules and six tools; coverage, the booking window, open slots, photos and the duty number check are enforced in the tools' code; prices, changes and complaints go to his phone inbox, and he can open or block any slot himself.
- **Problem solved:** A two-person gardening service misses enquiries while working in customers' gardens. The assistant answers routine questions, confirms free site visits into his open slots, and passes the rest to him with a summary he can act on.
- **Page:** [Open](https://lyven81.github.io/ai-projects/pak-razif-the-gardener.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/pak-razif-the-gardener/assistant.html)
- **Rebuilt:** 2026-10-17

#### Badminton Court Booking Agent
- **What it does:** A court booking assistant that answers only from the centre's policies, with staff in control of payments.
- **How it's built:** Claude with an MCP server (Node.js) offering three policies with 59 numbered clauses and nine tools; the booking, hold, deposit and receipt rules are checked in the tools' code; payments, holds, cancellations and handovers wait for staff on a dashboard.
- **Problem solved:** A badminton centre answers the same rule questions all day and checks every deposit screenshot by hand. The assistant answers from the policies, reads receipts against the booking, and passes the rest to staff with a summary they can act on.
- **Page:** [Open](https://lyven81.github.io/ai-projects/badminton-booking-agent.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/badminton-booking-agent/assistant.html)
- **Rebuilt:** 2026-10-16

#### Wee Auto Car Care
- **What it does:** A customer service assistant for a car workshop, with staff in control.
- **How it's built:** Claude with an MCP server (Node.js) offering three resources and five tools; the key rules are checked in the tools' code; booking requests and handovers wait for staff on a dashboard.
- **Problem solved:** A workshop owner answers the same customer questions all day from the booking dashboard. The assistant answers routine questions from the workshop's own information and passes the rest to staff.
- **Page:** [Open](https://lyven81.github.io/ai-projects/wee-auto-car-care.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/wee-auto-car-care/assistant.html)
- **Rebuilt:** 2026-10-16
