"""
One complaint file per case: the masked complaint, the unit context from the
register, the emergency check, and the handover note written in code.

The sample complaints live in data/complaints.json. A complaint typed by the
officer in live mode is opened with open_custom() and gets the same intake.
"""
import json
import os
import re
from pathlib import Path

import intake

BASE = Path(__file__).resolve().parents[1]
BUILDING = "amber-residences"
_COMPLAINTS = {c["id"]: c for c in json.loads((BASE / "data" / "complaints.json").read_text(encoding="utf-8"))["complaints"]}
_UNITS = {u["unit"]: u for u in json.loads((BASE / "data" / "units.json").read_text(encoding="utf-8"))["units"]}
_CUSTOM = {}
REASON_LABEL = {"penalty_not_authorised": "Penalty not authorised by the documents",
                "money_or_compensation": "Money or compensation", "legal_dispute": "Legal dispute",
                "emergency": "Emergency", "complaint_about_management": "Complaint about management"}


class UnknownCase(Exception):
    pass


def raw(cid):
    c = _CUSTOM.get(cid) or _COMPLAINTS.get(str(cid))
    live = os.environ.get("STRATA_LIVE_DIR")
    if not c and live and re.fullmatch(r"LIVE-[A-Za-z0-9-]{1,40}", str(cid)):
        p = Path(live) / f"{cid}.json"          # a complaint the officer typed in live mode (serve.py)
        if p.exists():
            c = json.loads(p.read_text(encoding="utf-8"))
    if not c:
        raise UnknownCase(cid)
    return c


def ids():
    return list(_COMPLAINTS)


def open_custom(cid, unit, text, facts="", source_unit="", date="2026-11-16"):
    _CUSTOM[cid] = {"id": cid, "title": "Officer's complaint", "date": date, "unit": unit, "channel": "Officer",
                    "text": text, "facts": facts, "source_unit": source_unit}
    return cid


def unit_line(u, label):
    if not u:
        return f"{label}: not given"
    r = _UNITS.get(u)
    if not r:
        return f"{label}: {u} (not in the unit register)"
    occ = f"occupied, {r['occupant']}" if r["occupied"] else "vacant"
    return f"{label}: {u}, Block {r['block']}, floor {r['floor']}, {occ}, {r['share_units']} share units"


def intake_record(cid):
    """What code knows before any AI call: masked text, unit context and the emergency check."""
    c = raw(cid)
    text, facts = intake.mask(c["text"]), intake.mask(c["facts"])
    found = intake.emergency(c["text"] + " " + c["facts"])
    return {"id": cid, "building": BUILDING, "date": c["date"], "unit": c["unit"], "channel": c["channel"],
            "text": text, "facts": facts, "source_unit": c.get("source_unit") or "",
            "masked": text != c["text"] or facts != c["facts"], "emergency": found}


def render(cid):
    """The complaint as the advisor reads it (complaint://{id})."""
    r = intake_record(cid)
    src = r["source_unit"]
    return "\n".join([
        f"complaint_id: {cid}",
        f"Received {r['date']} by {r['channel']}, Amber Residences.",
        unit_line(r["unit"], "Complainant's unit"),
        unit_line(src, "Reported source unit (as reported by the resident, not verified)") if src else
        "Reported source unit: none given",
        "",
        "What was reported:",
        r["text"],
        "",
        "Known facts recorded by the officer:",
        r["facts"] or "none",
    ])


def emergency_note(cid):
    """The handover note for an emergency, written in code; no AI call is made."""
    r = intake_record(cid)
    return {"reason": "emergency", "reason_label": REASON_LABEL["emergency"], "recipient": "building manager",
            "complaint_summary": r["text"], "facts_collected": [f for f in [r["facts"], f"Unit {r['unit']}"] if f],
            "facts_missing": [], "rules_cited": [], "steps_suggested": [
                "Attend at once and make the area safe.",
                "Enter any parcel needed to stop the water or the danger: no notice is required in an emergency (Third Schedule by-law 8(3))."],
            "urgency": "now", "emergency_words": r["emergency"]}


def handover_note(cid, g, passages):
    """The handover note assembled in code from the accepted guidance fields."""
    h = g.get("handover") or {}
    r = intake_record(cid)
    from rule_search import base_code
    cited = []
    for x in g.get("rules") or []:
        p = passages.get(base_code(x.get("code")))
        cited.append(f"{x.get('code')}" + (f" ({p['number']}, {p['document']})" if p else ""))
    return {"reason": h.get("reason"), "reason_label": REASON_LABEL.get(h.get("reason"), h.get("reason")),
            "recipient": "building manager",
            "complaint_summary": h.get("summary") or r["text"],
            "facts_collected": list(g.get("facts_known") or []), "facts_missing": list(g.get("facts_missing") or []),
            "rules_cited": cited, "steps_suggested": [f"{s.get('sop_step')}: {s.get('action')}" for s in g.get("next_steps") or []
                                                      if isinstance(s, dict)],
            "urgency": h.get("urgency") or "routine"}
