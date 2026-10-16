# Badminton Court Booking Agent

A court booking assistant for a 12-court badminton centre (Subang Badminton Arena, fictional data), with a staff dashboard beside it.

- **Problem:** players book courts, pay deposits and ask about rules by chat, and staff answer the same questions while checking payments by hand.
- **Built:** Claude answers only from three policies (59 numbered clauses) and acts through nine MCP tools. Rules sit in the tools' code: booking window, 30-minute hold, deposit, receipt checks, cancellation refunds. Confirming, releasing and refunding stay with staff, one click each, and every click sends a fixed message into the player's chat.
- **Evidence:** 69 tool tests and a 30-case benchmark written before the build (covered, not covered, contradicts, unclear, unauthorised, failure, asks for a person, receipts), each scored on action, tool, answer, citation and hard limits. The recorded conversations are on the demo's replay tab.

## Run it

```bash
npm install
node benchmark/test_tools.mjs                 # tool tests, no key needed
ANTHROPIC_API_KEY=... npm run benchmark       # 30 cases through the MCP server
python -m http.server                         # then open demo.html and assistant.html
```

The project layout and the rules that must hold are in `CLAUDE.md`.
