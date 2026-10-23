# AI Projects · Lee Yih Ven

I build practical AI applications that help businesses answer customers, process documents, research and route work. Each project starts from an operational problem and decides what the AI should and should not do. Each one is tested before it is shown, and you can try it yourself.

Live site: https://lyven81.github.io/ai-projects/

**Total published AI projects: 8**

## All Projects (newest first)

| # | Added | Project | Page |
|---|---|---|---|
| 8 | 2026-10-23 | Sang Kancil Specialist Clinic | [page](https://lyven81.github.io/ai-projects/sang-kancil-specialist-clinic.html) |
| 7 | 2026-10-21 | Happy Mart Customer Desk | [page](https://lyven81.github.io/ai-projects/happy-mart-customer-desk.html) |
| 6 | 2026-10-21 | FD Food and Drink Distributors | [page](https://lyven81.github.io/ai-projects/fd-food-and-drink-distributors.html) |
| 5 | 2026-10-19 | Kereta Sewa Jalan-jalan Car Rental Agent | [page](https://lyven81.github.io/ai-projects/car-rental-booking-agent.html) |
| 4 | 2026-10-19 | Chinese Translation Quality Check | [page](https://lyven81.github.io/ai-projects/chinese-translation-quality-check.html) |
| 3 | 2026-10-17 | Pak Razif The Gardener | [page](https://lyven81.github.io/ai-projects/pak-razif-the-gardener.html) |
| 2 | 2026-10-16 | Badminton Court Booking Agent | [page](https://lyven81.github.io/ai-projects/badminton-booking-agent.html) |
| 1 | 2026-10-16 | Wee Auto Car Care | [page](https://lyven81.github.io/ai-projects/wee-auto-car-care.html) |

## Projects by Problem Type

### Triage and routing

#### Happy Mart Customer Desk
- **What it does:** A customer service desk for an online electronics store where a router sends each question to the department team that owns it, and code checks every reply before the customer sees it.
- **How it's built:** A Claude router with five department teams as sub-agents and a writer, behind an MCP server (Node.js) offering 13 resources (six policies with 28 clauses, the router workbook, five role sheets, the contact list) and 17 tools; one shared PreToolUse hook checks identity, order access, tool ownership and every date window before a tool runs, one shared PostToolUse hook trims each lookup to its department's fields, and a pre-send check in code reads every reply before it goes out.
- **Problem solved:** An online electronics store answers the same order questions every day, and each answer belongs to a different department. The desk routes each question to the team that owns it, answers from the store's policies and the customer's own order, and prepares every request for a named person.
- **Page:** [Open](https://lyven81.github.io/ai-projects/happy-mart-customer-desk.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/happy-mart-customer-desk/assistant.html)
- **Rebuilt:** 2026-10-21

### Business workflow

#### Sang Kancil Specialist Clinic
- **What it does:** A staff assistant for a paediatric clinic where Claude chooses the tool and shared hooks apply who may see and do what, sending each decision to the named person.
- **How it's built:** Claude with an MCP server (Node.js) offering the clinic's four policies, fee schedule, formulary, immunisation schedule and rota as resources, and eight tools offered by role; one shared PreToolUse hook checks who is asking, which patient and every prescription line before a tool runs, one shared PostToolUse hook keeps only the fields that person may see, and the back end checks the critical rules again. Four staff sign in by ID.
- **Problem solved:** In a children's clinic, three doctors and a clerk each have different rights over records, prescriptions, bookings and bills. The assistant applies those rights on every request and sends work that needs a person to that named person as a notice.
- **Page:** [Open](https://lyven81.github.io/ai-projects/sang-kancil-specialist-clinic.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/sang-kancil-specialist-clinic/staff-desk.html)
- **Rebuilt:** 2026-10-23

#### FD Food and Drink Distributors
- **What it does:** A staff assistant for a food and drink wholesaler where Claude chooses the tool and two shared hooks apply the written policy, naming the person on every decision that is theirs.
- **How it's built:** Claude with an MCP server (Node.js) offering four policies (48 numbered clauses), two directories and five tools; one shared PreToolUse hook checks department, tier, own customer and the request's rules before any tool runs, and one shared PostToolUse hook applies policy to every result; the back end checks the critical rules again. Seven staff sign in by ID.
- **Problem solved:** A wholesaler's Sales, Finance and Warehouse staff each have different authority over orders, prices, stock, credit and invoices. The assistant applies each rule on every request and names the person who decides when the decision is theirs.
- **Page:** [Open](https://lyven81.github.io/ai-projects/fd-food-and-drink-distributors.html) · **Demo:** [Try it](https://lyven81.github.io/ai-projects/projects/fd-food-and-drink-distributors/staff.html)
- **Rebuilt:** 2026-10-21

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
