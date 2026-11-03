# Jade Star Booking Desk: rules for working in this project

Sample data. Read `README.md` for the layout. The plan lives in the run folder: `../../_plan/Build List.html` and `../../_plan/How the app is built.html`.

## Rules that must hold

- **One backend.** Every rule lives in `lib/booking.js` and `tools.js`. The form, the tools, the A2A server and `demo.html` all call them; never copy a rule into a page or a prompt.
- **Only the customer confirms.** No tool confirms, releases or closes. `confirm` is called only by the customer's phone screen; the release is the 15-minute timer; closing a handover is the restaurant manager's action on the dashboard.
- **Identity from the host.** Name, phone and route come from the session (the signed-in visitor, the form, the A2A message metadata `{ customer: { name, phone } }`), never from the model. PreToolUse strips them from arguments.
- **Fixed sentences in code.** Refusals and handovers are written in `hooks/post_tool_use.js` and shown as they are. Model replies pass the reply check in `agent.js` (greeting on the first reply, at most two short sentences, no clause or room ID, RM 100 only, no unconfirmed "confirmed").
- **Names for people, IDs for code.** Pages and replies show "Orchid Room 兰花厅"; room IDs stay in code, data and tool logs.
- **The benchmark is exactly cases 1 to 20.** Never add, split or vary a case; `benchmark/test_cases.js` and the runner refuse anything else. No-key tests are never counted as cases.
- **No em-dashes** in any page, resource or reply.

## Build and test

1. `npm test` before any paid run; every no-key test must pass.
2. Paid runs go through the benchmark gate: `--sample` first (cases 2, 13, 8), fixes rerun with `--only`, a full run only with the founder's approval. Write a new full run to its own `--out` file.
3. After a change to resources: `node build_pages.mjs`. After a change to the Answer Key: `node build_cases.mjs` (then `npm test`). After any engine or page change: `node build_demo.mjs`.
