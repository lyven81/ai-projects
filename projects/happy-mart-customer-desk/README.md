# Happy Mart Customer Desk

A customer service agent for Happy Mart, a fictional online electronics store in Shah Alam, Selangor. A customer writes about an order; the agent verifies it, asks only the departments the question needs, and sends one reply that answers what was asked.

## How it works
- **Router (Customer Service):** verifies the order with the order ID and the last 4 phone digits, then sends each part of the enquiry to the team that owns it: delivery, returns, finance, claims or marketing.
- **Five specialists:** each reads only its own policy and its own slice of the order, calls its tools, and answers with points that cite their clause.
- **Writer:** turns the answers into one short reply, one paragraph per question.
- **Hooks in code:** check identity, order access, the item, the date windows and the handover contact before any tool runs, and read every reply before it is sent. A reply with an unsupported claim (photos, a refund date, a promised repair) is blocked.
- **Staff:** anything the agent may not decide is written as pending for a named person: a return, a damage report, a warranty claim, a cancellation, a handover.

## Run it
```
npm install
node benchmark/test_hooks.js          # hook and tool tests, no key
node benchmark/test_mcp.mjs           # MCP server test, no key
node benchmark/run_benchmark.js       # 26 cases x 3 runs, needs ANTHROPIC_API_KEY
node build_assistant.mjs              # builds assistant.html
python -m http.server                 # from the folder above, then open assistant.html
```
The demo page replays the recorded benchmark runs with no key, or runs live with your own Anthropic API key (held in the browser session only; your account is billed).

## Files
`resources/` the policies and contacts · `data/` the generated orders · `lib/` back end, result shape, pre-send check · `hooks/` the two shared hooks · `tools.js` the 17 tools · `agent.js`, `prompts.js` the agents · `mcp_server.mjs` the MCP server · `benchmark/` cases, Answer Key, tests, results.

All names and data are fictional.
