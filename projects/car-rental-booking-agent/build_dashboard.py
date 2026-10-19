"""Build demo.html (the staff phone page, the Gardener phone layout chosen by the founder on 19 Oct)
from dashboard.template.html. The earlier versions A and B are kept in _old/version-a/ and _old/version-b/.

Inlines tools.js (the same staff actions and fixed messages the MCP server and the chat page
use), the seed (what a visitor first sees waiting for staff) and the clause list (for clause
links on handovers), so the page works on GitHub Pages with no server. The page (also
embedded as the staff phone in assistant.html) and assistant.html share the browser's saved state (localStorage key kereta-sewa-v1) and update
each other live.

Run after generate_seed.py: python build_dashboard.py
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
    """The state both pages start from, stamped with a version of the demo data: a browser
    holding data saved from an earlier build starts fresh."""
    seed = json.loads(read("car_rental_bookings.json"))
    seed["meta"]["seed_version"] = hashlib.sha1(json.dumps(seed, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    return seed


if __name__ == "__main__":
    for template, out in [("dashboard.template.html", "demo.html")]:
        html = read(template)
        for marker, value in [("/*__TOOLS_JS__*/", read("tools.js")),
                              ("/*__SEED_JSON__*/null", js(page_seed())),
                              ("/*__CLAUSES_JSON__*/null", js(json.loads(read("resources/clauses.json"))))]:
            assert marker in html, f"marker {marker} missing in {template}"
            html = html.replace(marker, value, 1)
        assert "—" not in html
        with open(os.path.join(HERE, out), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"Wrote {out} ({len(html):,} chars)")
