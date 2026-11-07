"""
The submit_advice guard: the advice is checked in code before it is recorded.

    quote_not_retrieved   a quote that no chunk retrieved for this claim contains
    clause_mismatch       a quote found in a retrieved chunk, but cited to another
    status_mismatch       a gate status that differs from what check_gate set
    missing_gate          a gate missing from the advice
    clause_mismatch       also a governing clause other than the one the deciding gate rests on
    figure_mismatch       a figure that differs from calculate_payable, or no
                          figure computed at all

Each fault names the line that failed, so the retry fixes that line. The
underwriter gets two retries; a third rejection is recorded as a failure.
"""

import re

MAX_RETRIES = 2


def _norm(t: str) -> str:
    return re.sub(r"\s+", " ", str(t)).strip().strip('"').strip()


_CODE = re.compile(r"(operative clause|peril_not_insured|condition \d+(?:\([a-z]\))?|f[pcw]\d{3}[a-z]?(?:\.\d+)?)", re.I)
_SUB = re.compile(r"\s*,?\s*(?:exclusion\s*\(([a-z])\)|special condition (\d+)|\(([a-z])\))", re.I)


def _key(text):
    """The first clause code named and its sub-reference: 'FP507B, exclusion (a)' and
    'FP507B exclusion (a)' are the same clause; 'FP507B, Special Condition 3' is not."""
    t = str(text).lower()
    m = _CODE.search(t)
    if not m:
        return (t.strip(), None)
    code = m.group(1)
    sub = _SUB.match(t[m.end():])          # only a sub-reference written right after the code
    return (code, (sub.group(1) or sub.group(2) or sub.group(3)) if sub else None)


def check(advice: dict, session) -> list[dict]:
    faults = []
    gates = {g.get("gate"): g for g in advice.get("gates", []) if isinstance(g, dict)}
    for n in range(1, 7):
        if n not in gates:
            faults.append({"error": "missing_gate", "line": f"gates[{n}]",
                           "message": f"Gate {n} is missing. Give all six gates; a gate after a failure is not_reached."})
            continue
        expected = session.status_of(n) or "not_reached"
        got = gates[n].get("status")
        if got != expected:
            faults.append({"error": "status_mismatch", "line": f"gates[{n}].status",
                           "message": f"Gate {n} status is '{got}', but check_gate set '{expected}'. Use the status check_gate returned."})
        for i, q in enumerate(gates[n].get("quotes") or []):
            text, cid = _norm(q.get("text", "")), q.get("chunk_id")
            if not text:
                continue
            holders = [c for c, ch in session.retrieved.items() if text in _norm(ch["text"])]
            if not holders:
                faults.append({"error": "quote_not_retrieved", "line": f"gates[{n}].quotes[{i}]",
                               "message": f"This quote is not in any wording retrieved for this claim: \"{text[:80]}\". Quote retrieved wording exactly, or search for it first."})
            elif cid not in holders:
                faults.append({"error": "clause_mismatch", "line": f"gates[{n}].quotes[{i}]",
                               "message": f"The quote is from {', '.join(holders)}, not {cid}. Cite the chunk it came from."})
    if len(session.results) == 6 or session.stopped_at() is not None:
        want = session.governing_clause()
        got = str(advice.get("governing_clause") or "")
        if _key(got) != _key(want):
            faults.append({"error": "clause_mismatch", "line": "governing_clause",
                           "message": f"The governing clause is '{got}', but the result rests on '{want}' "
                                      "(the clause check_gate returned at the deciding gate). Name that clause; "
                                      "mention other grounds in the advice text."})
    p = session.payable
    fig = advice.get("figure") or {}
    if p is None:
        faults.append({"error": "figure_mismatch", "line": "figure",
                       "message": "No figure was computed. Call calculate_payable after the gates, then submit."})
    else:
        if round(float(fig.get("payable") or 0), 2) != round(p["payable"], 2):
            faults.append({"error": "figure_mismatch", "line": "figure.payable",
                           "message": f"Payable is {fig.get('payable')}, but calculate_payable returned {p['payable']}."})
        want_bf = p.get("but_for")
        got_bf = fig.get("but_for")
        if (want_bf is None) != (got_bf is None) or (want_bf is not None and round(float(got_bf), 2) != round(want_bf, 2)):
            faults.append({"error": "figure_mismatch", "line": "figure.but_for",
                           "message": f"But-for figure is {got_bf}, but calculate_payable returned {want_bf}."})
    return faults
