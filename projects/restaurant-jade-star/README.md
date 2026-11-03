# Jade Star Chinese Dining 吉星饭厅: Booking Desk

One booking system for people and AI agents. People book a private room by the website form or by chat with the restaurant assistant; a customer's own AI agent books through A2A. Every route calls the same booking module, every route ends in a room held for 15 minutes, and only the customer's own click with the 6-digit SMS code confirms the booking. Every booking, handover and confirmation notice lands on one owner dashboard. Sample data throughout.

## What the AI does, and what code controls

- **The AI (Claude Haiku 5.5)** greets the guest, chooses which of four tools to call, and writes at most two short sentences.
- **Code** holds every rule: December 2026 only, the four slots (10am, 1pm, 4pm, 7pm), the 2-hour cut-off, the room by party size with upsizing and never down, one booking per phone per slot on any route, the 15-minute hold and release, the RM 100 fee added at check-out. Refusals and handovers are fixed sentences written in code.
- **People** decide the rest: the customer confirms on their own phone; the restaurant manager takes every handover (11 fixed reasons) and every confirmation notice, and records the action taken on the owner dashboard.

## Layout

| Path | What it is |
|---|---|
| `lib/booking.js` | The booking module: availability, hold, release, confirm, the duplicate rule, handovers, manager actions. Written once for every route |
| `tools.js` | The four assistant tools: `check_availability`, `create_proposal`, `get_proposal_status`, `hand_to_manager` |
| `hooks/pre_tool_use.js`, `hooks/post_tool_use.js` | Only the four tools run; name, phone and route from the host; no code in arguments. The fixed sentences |
| `prompt.js`, `agent.js` | The system prompt; the tool-use loop with the reply check |
| `mcp_server.mjs`, `.mcp.json` | MCP server: resources R1 to R4, tools T1 to T4 |
| `a2a/server.mjs`, `a2a/customer_agent.mjs` | A2A server and Agent Card around the assistant (`@a2a-js/sdk` 1.3.0); the sample customer agent as an A2A client |
| `resources/` | Restaurant Policy (P1 to P14), Room and Table Guide, Booking Calendar, Handover Guide, as `.md` and `.html`; `restaurant.json` holds the same facts as numbers |
| `data/` | Seeded bookings, the sample customers, the A2A requests (`node generate_data.mjs`) |
| `benchmark/` | Answer Key (20 cases), `cases.json`, the runner and scorer, the no-key tests, the recorded runs and A2A message logs |
| `demo.html` | The Booking Desk and owner dashboard, built from `demo.template.html` by `node build_demo.mjs` |
| `_old/` | The original single-page Chinese New Year reservation page, its README and set menus |

## Run it

```
npm install
npm test                                   # the no-key tests: case list, booking module, tools over MCP, hooks and reply check, A2A
node mcp_server.mjs                        # the MCP server (test clock Mon 14 Dec 2026, 2:00pm)
node a2a/server.mjs                        # the A2A server on port 41241 (needs ANTHROPIC_API_KEY)
node benchmark/run_benchmark.mjs --sample  # cases 2, 13 and 8 on Claude Haiku 5.5 (needs ANTHROPIC_API_KEY)
node build_demo.mjs                        # rebuild demo.html
```

## Test results

The benchmark is exactly the 20 cases in `benchmark/Answer Key.html`, scored from the tool log, the A2A message log and the data, never from the reply wording. The published result (`benchmark/results-published.json`) passed 20 of 20 with no hard-limit breach: form 1 of 1, chat 11 of 11, A2A 3 of 3, confirmation 5 of 5. It is the final full run (`results-final.json`) with the four A2A cases (13, 14, 15, 18) from their rerun after the A2A wording fix (`results-a2a-fix2.json`), merged by `node benchmark/merge_results.mjs`.
