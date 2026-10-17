# Pak Razif The Gardener

A customer assistant for a two-person gardening service in Shah Alam (Pak Razif Garden, fictional data), with Pak Razif's own phone page beside it.

- **Problem:** Pak Razif is out on jobs most of the day, so enquiries about coverage, free site visits and prices wait hours for a reply, and customers move on.
- **Built:** Claude answers routine enquiries from six resources (103 numbered rules) and acts through six MCP tools. It checks coverage by postcode, offers the open site visit slots in his calendar, and confirms a visit the moment the slot is reserved. Prices, changes, complaints and anything unusual go to his inbox as a summary he can act on from his phone. The rules sit in the tools' code: coverage, the booking window, same-day requests, the slot re-check, one visit per address, photos forwarded unseen, and the duty number only after a reference check.
- **Evidence:** 86 tool tests and a 33-case benchmark written before the build (what it can do, what it cannot do, handovers, scenarios, edge cases, and Pak Razif's own calendar changes), each scored from the tool log and the data on four checks: right tool, right record, right handover, hard limits held. The recorded conversations play on the demo page, with each handover arriving on Pak Razif's phone as it happens.

## Run it

```bash
npm install
node benchmark/test_tools.mjs                 # tool tests, no key needed
ANTHROPIC_API_KEY=... npm run benchmark       # 33 cases through the MCP server
npm run build                                 # owner.html and assistant.html
python -m http.server                         # from the project folder, then open projects/pak-razif-the-gardener/assistant.html
```

The project layout and the rules that must hold are in `CLAUDE.md`.
