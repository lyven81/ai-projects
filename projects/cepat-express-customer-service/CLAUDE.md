# Cepat Express Customer Service (frontline AI agent)

A single customer service agent for a courier serving Ipoh, Johor Bahru and Klang, modelled on a Customer Service Executive job description. Its main job: check the latest shipment status by tracking number and advise the customer, with no person involved. Personal details and customer-opened cases need the phone number on the parcel to match. Every limit, check, route and fixed sentence is in code; the AI chooses the tool and writes at most two short sentences. Nurul Aina, Customer Service Lead, reviews every handover before a Logistics Officer gets it.

## Layout
- `resources/`: the four MCP resources, the single source. `Courier Policy.md` (C1 to C19, C3a), `Customer Service Policy.md` (S1 to S30, S20a to S20d), `Delivery Status Guide.md` (D1 to D8), `staff-directory.json`. `policy_tables.json` holds the values code reads: system "today", public holidays, limits, the 16 handover reasons and their routes, the approved customer wording in English, Malay and Mandarin, the workflow states. `build_pages.py` writes the `.html` pages with a clause anchor per row.
- `generate_data.py` (seed 42) -> `data/parcels.json` (262 parcels, 1 Jun to 28 Aug 2026) and an empty `data/handovers.json`. Planted records CE26000101 to CE26000118 (one per case) and CE26000120 to CE26000123 (the other side of each limit).
- `build_cases.py` -> `benchmark/cases.json` and `benchmark/Answer Key.html`: 19 cases in four groups (valid 4, unauthorised 1, hand to staff 12, failure 2), written before the agent.
- `tools.js`: the 4 tools (`get_shipment_status`, `verify_customer`, `get_parcel_details`, `escalate_case`), the handover note (`noteOf`, nine labelled fields), `recordReply` (the reply as sent becomes "Told customer") and `staffAction` (register ticket, close, transfer; not offered to the AI). Runs in Node and the browser.
- `mcp_server.mjs`, `.mcp.json`: stdio server, 4 resources and 4 tools; the chat session arrives in `_meta.session`, never from the model. Env `CX_STATE`, `CX_NOW`.
- `prompt.js`: the rules and worked examples, with the four resources appended as they are. `agent.js`: the tool-use loop on Claude Haiku 5.5 (2000 output tokens, 8 rounds), fixed replies shown as they are, and the reply check (`replyFixes`) that sends a reply back at most twice.
- `benchmark/`: `harness.js` (scoring from the tool log and data, five hard limits, one failure label per failing case), `run_benchmark.js`, `test_tools.js`, `test_data.js`, `test_mcp.mjs`, `results.json` (19 of 19; C11 and the 12 hand-to-staff cases from reruns, see the `merged` note), `results-run1.json`, `results-c11.json`, `sample*.json`.
- `demo.template.html` -> `build_demo.mjs` -> `demo.html`: the founder's two-screen desk (customer chat left, the handover for that chat right), replay of the recorded runs and live chat with the visitor's own key. Layout from `_plan/cepat-express-ui.html`.
- `_from_courier/`: what was kept from Courier CS Quality Console (answer key, phrasings).
- Test calendar: Friday 28 Aug 2026, 9:30 pm Malaysia time. Mon 31 Aug is Merdeka Day.

## Rules that must hold
- Status on the tracking number alone (S4); the status result never carries a personal field. Never a near match for an unknown number.
- Personal details and every customer-opened case need the phone on the parcel (sender or recipient) to match in this chat (S4); three numbers that do not match lock that tracking number (S6). A request for a person needs no match (S21).
- Past a limit (C5 3 days with no scan, C6 48 hours at a hub, C7 out for delivery past 9 pm) code raises the flag once, to the officer of the last-scan location for a delay and the delivery location for a failed delivery. Over 7 days with no scan is lost (C15), handed to Customer Service after the match.
- The AI chooses only the reason; code chooses the lane, the location and the person (S20a). A pickup for a booked parcel goes to the officer of the pickup location (S20c); a delivery instruction to the officer of the delivery location (S20d).
- Customer replies follow `_plan/reply-writing-guide.md` (S29): at most two short sentences in one paragraph, the clause line under it, no staff titles or routing words, no promise of compensation (C16). Handover replies are the approved wording in `policy_tables.json`, written by code (S27).
- The handover note keeps the customer report apart from the record, names the customer only after the match, and changes its workflow state only when a staff action succeeds (S26, S28).

## After any change
1. `python generate_data.py && python build_cases.py && python build_pages.py` when a policy, the data or a case changes.
2. `node benchmark/test_tools.js && node benchmark/test_data.js && node benchmark/test_mcp.mjs` (no key). All must pass; the benchmark gate reruns them itself.
3. `node benchmark/run_benchmark.js --sample` or `--only C11` on a fix; one full run on the final build (the gate asks first). `--rescore` scores a saved results file with no API call. Key from `ANTHROPIC_API_KEY` or `~/.env`. Hard-limit breaches must stay 0; read the replies by eye against the reply guide.
4. `node build_demo.mjs`, then check `demo.html` through `python -m http.server` from the run folder root: replay, the handover screen per chat, staff actions, clause links, wide and narrow.
5. Do not edit `demo.html`, `data/`, `benchmark/cases.json`, `benchmark/Answer Key.html` or `resources/*.html` by hand; they are build outputs.
