"""
Build benchmark/cases.json from the 22 claim folders in cases/.

The expected results are the requirement. Each cases/<claim_no> .../expected.json
was written before the build and checked by an independent reviewer (judgement
only, 7 Nov 2026); this script only gathers them, in peril order, into the one
file the benchmark reads. It never edits an expected result.

Run:  python build/build_cases.py
"""

import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CASES = BASE / "cases"
OUT = BASE / "benchmark" / "cases.json"

# Governing clause, written as chunk code plus sub-reference (Build List, section 9).
GOVERNING = {
    "policy_period": "Operative clause, period of insurance",
    "base_insuring_clause": "Operative clause",
    "FP507B(a)": "FP507B, exclusion (a)",
    "FP503 Special Condition 1": "FP503, Special Condition 1",
    "Condition 6(b)": "Condition 6(b)",
    "Condition 9(a)": "Condition 9(a)",
    "Condition 9(b)": "Condition 9(b)",
    "Condition 9(d)": "Condition 9(d)",
    "peril_not_insured": "peril_not_insured",
}


def main():
    index = json.loads((CASES / "index.json").read_text(encoding="utf-8"))["cases"]
    out = []
    for row in sorted(index, key=lambda r: (r["peril"], r["claim_no"])):
        folder = CASES / row["folder"]
        e = json.loads((folder / "expected.json").read_text(encoding="utf-8"))
        cf = e.get("counterfactual") or {}
        out.append({
            "claim_no": e["claim_no"],
            "label": e["label"],
            "peril": row["peril"],
            "channel": row["channel"],
            "folder": row["folder"],
            "determination": e["determination"],
            "proximate_cause": e["proximate_cause"],
            "gates": [{"gate": g["gate"], "name": g["name"], "status": g["status"]} for g in e["gates"]],
            "governing_clause": GOVERNING.get(e["governing_clause"], e["governing_clause"]),
            "payable": e["payable"],
            "but_for": cf.get("amount") if cf.get("available") else None,
            "not_priced_reason": None if cf.get("available") or e["determination"] == "APPROVE" else cf.get("reason"),
            "quotes": [{"chunk_id": q["chunk_id"], "clause": q["clause"]} for q in e["quotes"]],
            "underwriting_flags": len(e.get("underwriting_flags") or []),
            "must_not_apply": [m["clause"] for m in (e.get("must_not_apply") or [])],
            "must_not_cite": [m["clause"] for m in (e.get("must_not_cite") or [])],
            "facts": e["facts"],
        })
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({
        "about": "The 22 founder-approved claims, sorted by peril then claim number. Built from cases/*/expected.json by build/build_cases.py. Exactly these claims, no more.",
        "count": len(out),
        "cases": out,
    }, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(out)} cases -> {OUT}")


if __name__ == "__main__":
    main()
