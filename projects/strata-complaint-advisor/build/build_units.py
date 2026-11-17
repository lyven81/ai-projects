"""
The unit register of Amber Residences, sample data: data/units.json.

Four blocks (A to D), 19 floors, 8 units a floor: 01 to 04 left of the lift
lobby, 05 to 08 right. Occupied units per block (decision 19): A 122, B 106,
C 122, D 114 (464 of 608). Every parcel carries equal share units. Units named
in the 20 sample complaints are occupied; the rest are drawn with a fixed seed.

    python build/build_units.py
"""
import json
import random
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
OCCUPIED = {"A": 122, "B": 106, "C": 122, "D": 114}
SHARE_UNITS = 10


def main():
    complaints = json.loads((BASE / "data" / "complaints.json").read_text(encoding="utf-8"))["complaints"]
    named = {c["unit"] for c in complaints} | {c["source_unit"] for c in complaints if c["source_unit"]}
    named |= {"B-09-04"}                      # the unit above case 5
    rng = random.Random(757)
    units = []
    for b, n_occ in OCCUPIED.items():
        ids = [f"{b}-{f:02d}-{u:02d}" for f in range(1, 20) for u in range(1, 9)]
        forced = [i for i in ids if i in named]
        rest = [i for i in ids if i not in named]
        occ = set(forced) | set(rng.sample(rest, n_occ - len(forced)))
        for i in ids:
            o = i in occ
            units.append({"unit": i, "block": b, "floor": int(i[2:4]), "number": int(i[5:7]),
                          "side": "left" if int(i[5:7]) <= 4 else "right",
                          "occupied": o, "occupant": (("owner" if rng.random() < 0.62 else "tenant") if o else None),
                          "share_units": SHARE_UNITS})
    out = {"building": "amber-residences", "note": "Sample unit register.", "units": units,
           "totals": {b: sum(u["occupied"] for u in units if u["block"] == b) for b in OCCUPIED}}
    (BASE / "data" / "units.json").write_text(json.dumps(out, indent=0), encoding="utf-8")
    print(out["totals"], sum(out["totals"].values()), "of", len(units))


if __name__ == "__main__":
    main()
