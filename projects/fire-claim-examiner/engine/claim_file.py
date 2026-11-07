"""
The claim file: the three documents a claims examiner reads, per claim.

    incident.md   the claimant's WhatsApp or email thread
    adjuster.md   the loss adjuster's investigation and findings
    schedule.md   the policy schedule: period, sums insured, endorsements held

Only the endorsement list is parsed here, so retrieval can rank against the
open claim's own schedule. Everything else is read by the underwriter.
"""

import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CASES = BASE / "cases"
DOCS = {"incident": "incident.md", "adjuster": "adjuster.md", "schedule": "schedule.md"}


class UnknownCase(Exception):
    pass


def folder(claim_no: str) -> Path:
    claim_no = str(claim_no).strip()
    hits = [p for p in CASES.iterdir() if p.is_dir() and p.name.split(" ")[0] == claim_no]
    if not hits:
        raise UnknownCase(claim_no)
    return hits[0]


def claim_numbers() -> list[str]:
    return sorted(p.name.split(" ")[0] for p in CASES.iterdir() if p.is_dir())


def read(claim_no: str, doc: str) -> str:
    if doc not in DOCS:
        raise UnknownCase(f"{claim_no}/{doc}")
    return (folder(claim_no) / DOCS[doc]).read_text(encoding="utf-8")


def held_codes(claim_no: str) -> list[str]:
    """Codes in the schedule's 'Endorsements and clauses' table."""
    text = read(claim_no, "schedule")
    part = text.split("## Endorsements and clauses", 1)[-1]
    codes = []
    for line in part.splitlines():
        m = re.match(r"\|\s*(F[PCW]\d{3}[A-Z]?(?:\.\d+)?)\s*\|", line)
        if m:
            codes.append(m.group(1))
    return codes
