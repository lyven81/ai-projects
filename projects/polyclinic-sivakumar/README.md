# Polyclinic Sivakumar Clinic Desk

A clinic desk assistant designed for a one-doctor GP clinic, where one AI agent serves the clinic assistant, the GP and the pharmacist, each in their own chat and each with only their own work, while code carries each patient's visit from one person to the next.

## Who uses it

| Person | Role | What the desk does for them |
|---|---|---|
| Siti Kasim (FD-01) | Clinic assistant | Registration and contact details, bookings, check-in and the queue, bills after dispensing, payments and the end-of-day cash reconcile, MCs and referral letters prepared for the GP's signature, follow-up bookings, and patients' questions passed to the right person |
| Dr Sivakumar a/l Ramachandran (GP-01) | General practitioner and owner | The queue and calling the next patient, the consultation record (diagnosis, services, prescription, MC, referral, return date), prescription changes, answers to the pharmacist's queries and the front desk's handovers; as owner, bills, payments, the owner review list and panel bills read only, with an acknowledgement of each panel bill |
| Ms Yong (PH-01) | Pharmacist | Check and dispense in one step (the four checks: complete, allergy by drug class, dose within the formulary range, stock), queries to the GP on a concern of Ms Yong's own, counselling, stock, and answers to patients' questions on how to take a medicine |

## How the work moves

1. **Siti** checks the patient in, from a booking or as a walk-in.
2. **Dr Sivakumar** calls the patient and records the consultation. Code then writes the next people's tasks and notices: a check for Ms Yong when there is a prescription, otherwise the bill for Siti; an MC or referral letter to prepare; a follow-up to book.
3. **Ms Yong** checks and dispenses in one step. Code runs the four checks: when they pass, the medicine is dispensed and code creates Siti's bill task; when one fails, code holds the prescription and sends Dr Sivakumar a query with the reason the check found (allergy conflict, dose or unclear prescription, out of stock). A concern of Ms Yong's own goes to Dr Sivakumar the same way, as another concern. The prescription stays held until Dr Sivakumar changes it or answers to keep it.
4. **Siti** prepares the bill from the recorded services and the medicines actually dispensed, priced from the Price List or, for a panel patient, the Panel Price Schedule, and records the payment. MCs and referral letters are copied from Dr Sivakumar's consultation record, signed by Dr Sivakumar, then marked issued.
5. **Dr Sivakumar** reads the day's money and acknowledges each panel bill at the end of the day.

Work moves between people as tasks and notices written in code, and each person reads them at the top of their own chat. When a patient asks Siti something for a colleague, Siti passes the question on and code picks the colleague from the stage of the visit: Dr Sivakumar before the consultation or when the patient is unwell, Ms Yong after the medicine is dispensed.

## How it is built

- **The AI** (Claude Haiku 5.5) reads each message and picks one of the person's own tools: `patient`, `schedule`, `record_consultation`, `dispense`, `billing`, `documents`, `tasks`. Each person signs in to their own copy: five tools for the front desk, five for the GP, three for the pharmacist, each listing only that person's actions, with a prompt that describes only that person's job. Another person's action is not in the list.
- **Code** decides. One shared PreToolUse hook checks the signed-in person, the tool and the action for that role (the backstop if an action outside the list is ever called), who may see what, and the patient's identification. Handover and query reasons are set by code from the stage of the visit and the check, never by the model. The back end repeats the role check and enforces the order of the visit, the pharmacist's checks, prices, the panel split and payments. One shared PostToolUse hook converts money and times and filters every result by role: case notes reach the GP only, the pharmacist sees nothing about panels, prices or bills, and the front desk sees no prescription detail beyond the bill lines.
- **Replies** follow the access level of the person signed in. A read is one sentence opening "Here it is:"; other replies are at most two short sentences. A handover sent, an answer recorded and a refusal are written in code and shown as they are, for example "Sent to Dr Sivakumar a/l Ramachandran, general practitioner and owner." Code adds a Basis line (clause, record ID, data time) under every reply.
- **Policies:** five approved policy files (Hours and Services, Price List, Panel Price Schedule, After the Consultation, Roles and Privacy), served as MCP resources. The pharmacist is not served the Price List or the Panel Price Schedule.
- **MCP server:** `mcp_server.mjs` over stdio. The signed-in staff ID comes from the session (the request `_meta`), never from the model.

## Run it

```
npm install
python build_policies.py                    # policies -> resources/ and policies.html
python generate_data.py                     # sample data -> data/
python benchmark/build_cases.py             # Answer Key -> benchmark/cases.json
node benchmark/test_tools.js                # 176 checks, no API key
node benchmark/test_mcp.mjs                 # 15 checks, no API key
node benchmark/run_benchmark.js --sample    # 4 runs, needs ANTHROPIC_API_KEY
node benchmark/run_benchmark.js             # all 27 runs
node build_desk_preview.mjs                 # clinic-desk.html
python benchmark/build_sample_page.py       # benchmark/Sample Questions.html
```

**MCP server.** `node mcp_server.mjs`, or register it in Claude Code through `.mcp.json` (server `polyclinic-sivakumar-desk`). Send the staff ID in each request's `_meta.staff` (`FD-01`, `GP-01` or `PH-01`). `PS_STATE` sets the data folder, `PS_NOW` the clock.

**The clinic desk page.** `clinic-desk.html` is one page for all three people, with the signed-in person chosen in the header. It runs the same tools, hooks and data in the browser, with no server. Open it in a browser, or serve the folder with `python -m http.server`.
- **Replay** steps through the recorded benchmark run, question by question, with each step's scores and the tool calls under the hood.
- **Live** sends your own messages to Claude Haiku 5.5 with your own Anthropic API key, from the chosen question's starting state. Calls are billed to the key's owner, so use a key you can revoke with a low spend limit. The key stays in the tab's session storage and goes only to `api.anthropic.com`; a public service would keep its key on a server.

## Benchmark

The Answer Key (`benchmark/Answer Key.html`) holds 20 use cases in four categories, each numbered from 1, plus four failure runs:

| Category | What it tests | Cases |
|---|---|---|
| A. Own job | One person doing their own work alone | A1 to A6 |
| B. Unauthorised | A person asking for something outside their role: refused, or not in their tools at all | B1 to B4 |
| C. Handover loop | The sender needs someone else to decide; the work waits on the receiver's answer, which decides the next step; code sets each reason (P1, P3, P4, D1, D4, D5) and the receiver. C6 sends the same question twice: to the GP before the consultation, to the pharmacist after dispensing | C1 to C6 |
| D. Workflow across the team | Each person does their own part of one process in order; nobody waits on another's decision | D1 to D4 |
| Failure runs | A missing price, a missing template, a missing stock record, a data fault when recording a consultation: nothing changes | F1 to F4 |

**C versus D.** A handover waits on the receiver's decision: Ms Yong's query holds the prescription until Dr Sivakumar answers. A workflow is each person doing their part in order: panel billing (D4) is in D, because Siti bills fully from the fixed schedule and Dr Sivakumar's acknowledgement records who and when without changing the bill.

**Method.** Each question in A, B and C is sent by its right person, and each B question also by the person who may do it; a handover's later steps run as the receiver. Category D runs once, each step as its right person. That is 19 + 4 + 4 = 27 runs and 49 scored steps. A request outside a person's tools passes only when the agent reads nothing but that person's own records and attempts no other person's action. Every run starts from a fresh copy of the data; every step starts a fresh MCP server with the signed-in staff ID in `_meta`. Each step is scored from the tool log and the data, never the reply wording: right tool, right action, right result, and a data check. Ten hard limits are checked across each run, among them case notes reaching anyone but the GP, price data reaching the pharmacist, a medicine dispensed without a passed check, a bill before dispensing, and two payments on one bill.

**Result.** The final run on Claude Haiku 5.5 passed 27 of 27 runs and 49 of 49 steps with 0 hard-limit breaches and 0 calls outside a person's own actions (`benchmark/results.json`, `benchmark/results.md`).

## Data

Sample data at the test calendar, Tuesday 2 June 2026, 10:00 Malaysia time: 110 patients with visit history, today's queue, morning consultations, checks, dispensing, bills and payments, stock for a 12-medicine formulary, and two sample panels, Panel Teratai and Panel Cempaka. The prices, panels and formulary are sample figures for the demonstration. Money is stored in sen and times as Unix seconds; the hooks convert them to RM and Malaysia time.
