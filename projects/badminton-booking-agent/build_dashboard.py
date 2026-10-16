"""Build demo.html (the staff dashboard) from dashboard.template.html.

Inlines tools.js (the same staff actions and fixed messages the MCP server and the chat page
use), the seed plus the demo queue (what a visitor first sees waiting for staff), and the
clause list (for clause links on handovers), so the page works on GitHub Pages with no server.
The page and assistant.html share the browser's saved state (localStorage key
subang-badminton-v1) and update each other live.

Run after generate_seed.py and make_demo_queue.mjs: python build_dashboard.py
"""

import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def read(p):
    with open(os.path.join(HERE, p), encoding="utf-8") as f:
        return f.read()


def js(o):
    return json.dumps(o, separators=(",", ":")).replace("<", "\\u003c")  # safe inside <script>


def page_seed():
    """The seed plus the demo queue: the state both pages start from."""
    seed = json.loads(read("badminton_bookings.json"))
    queue = json.loads(read("demo_queue.json"))
    seed["bookings"] += queue["bookings"]
    seed["receipts"] += queue["receipts"]
    seed["cancellations"] += queue["cancellations"]
    seed["handovers"] = queue["handovers"]
    seed["uploads"] = queue["uploads"]
    seed["meta"]["next_ref"] = queue["next_ref"]
    # A version stamp of the demo data: a browser holding data saved from an earlier build starts fresh.
    seed["meta"]["seed_version"] = hashlib.sha1(json.dumps(seed, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    return seed


if __name__ == "__main__":
    html = read("dashboard.template.html")
    for marker, value in [("/*__TOOLS_JS__*/", read("tools.js")),
                          ("/*__SEED_JSON__*/null", js(page_seed())),
                          ("/*__CLAUSES_JSON__*/null", js(json.loads(read("resources/clauses.json"))))]:
        assert marker in html, f"marker {marker} missing"
        html = html.replace(marker, value, 1)
    assert "—" not in html
    with open(os.path.join(HERE, "demo.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote demo.html ({len(html):,} chars)")
