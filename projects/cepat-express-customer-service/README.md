# Cepat Express Customer Service

A frontline AI customer service agent for Cepat Express, a courier serving Ipoh, Johor Bahru and Klang. A customer gives a tracking number and the agent checks the latest status and advises them, with no person involved. Delays, missed deliveries and problems with a parcel go to the Customer Service Lead as a structured handover, routed in code to the right local Logistics Officer.

## What it does

- **Answers from the record.** The latest status, the expected delivery date (2 working days, public holidays skipped), a missed delivery and its reattempt date, and a parcel reported lost that is in fact still moving.
- **Keeps personal details behind a phone match.** The status needs only the tracking number; the recipient, address, proof of delivery and any case the customer opens need the phone number on the parcel. Three numbers that do not match lock the chat for that parcel.
- **Flags a parcel past its limit, in code.** 3 days with no scan, 48 hours at a hub, or out for delivery past 9 pm: the customer hears the latest status and that customer service will follow up with the local team.
- **Hands over on fixed reasons only.** Damaged, missing items, lost, rejected, address or date changes, delivered but not received, wrong parcel, rider conduct, self-collection, a pickup not yet made, a delivery instruction for the rider, or a request for a person. The AI picks the reason; code picks the person and writes the reply.
- **Gives staff one note to act on.** Each handover lists the customer report, verification, the record, what the customer was told, the recommended action, the assigned officer and the workflow state. The Customer Service Lead registers a ticket and closes, or transfers to the officer.

## How it is built

- Claude Haiku 5.5 in a tool-use loop (`agent.js`), with every reply checked in code before it is shown.
- Four tools with the rules in code (`tools.js`), served by an MCP server (`mcp_server.mjs`) with the four policies as resources.
- The policies in `resources/` are the single source for the prompt, the tools, the pages and the Answer Key.

## Run it

```
npm install
node benchmark/test_tools.js && node benchmark/test_data.js && node benchmark/test_mcp.mjs   # no API key needed
node benchmark/run_benchmark.js --sample                                                     # needs ANTHROPIC_API_KEY
node build_demo.mjs                                                                          # writes demo.html
```

Open `demo.html` to replay the 19 benchmark conversations, act on the handovers, or chat live with your own API key (billed to your Anthropic account).

## Tests

- 173 no-key tests: every limit on both sides, the phone lock, every refusal, the approved wording in three languages, the reply check, the staff actions, the data, and the MCP server.
- The benchmark: 19 customer questions from an answer key written before the agent, scored from the tool log and the data, never the reply wording. Results in `benchmark/results.md`.
