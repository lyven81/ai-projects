"""
Fire Claim Examiner: the deterministic calculator.

NO LANGUAGE MODEL TOUCHES THIS FILE. A figure an examiner puts on a claim file
cannot come from a token sampler. The model decides which rule applies; this
computes the number, in a fixed order, and prints its working.

Order of operations, and it is not negotiable:

    1. Exclusions          remove items the policy does not admit at all
    2. Condition of average applied PER SCHEDULE ITEM, never to the claim as a
                           whole (Condition 20: "Every item, if more than one,
                           of the Policy shall be separately subject to this
                           Condition")
    3. Excess              applied per endorsement group, after average
                           ("as ascertained after the application of any
                           condition of average")

Reversing steps 1 and 2 overstates the payable: on the bakery claim it gives
RM 70,875 on Item 2 instead of RM 57,000.
"""

from dataclasses import dataclass, field


@dataclass
class ExcessRule:
    """How an endorsement's excess resolves.

    lesser_of      : lesser of percent-of-sums-insured and a cash cap
                     (FP503 -> 1% or RM200; FP504 -> 1% or RM2,500)
    flat           : a flat first amount (FP507B -> RM1,000; FP513 -> RM250)
    lower_of       : lower of percent and cap (FP510 -> 5% or RM25,000)
    none           : no excess (base fire peril, where the Schedule states nil)
    """
    kind: str = "none"
    percent: float | None = None
    cap: float | None = None
    label: str = ""

    def compute(self, total_sums_insured: float) -> tuple[float, str]:
        if self.kind == "none":
            return 0.0, "No excess. Schedule states nil for this peril."
        if self.kind == "flat":
            return self.cap, f"Flat first RM {self.cap:,.2f} of each and every loss."
        pct_amount = (self.percent / 100.0) * total_sums_insured
        if self.kind == "lesser_of":
            chosen = min(pct_amount, self.cap)
            return chosen, (
                f"Lesser of (a) {self.percent}% of total sums insured "
                f"RM {total_sums_insured:,.2f} = RM {pct_amount:,.2f}, or "
                f"(b) RM {self.cap:,.2f}. Lesser = RM {chosen:,.2f}."
            )
        if self.kind == "lower_of":
            chosen = min(pct_amount, self.cap)
            return chosen, (
                f"Lower of {self.percent}% of sum insured RM {pct_amount:,.2f} "
                f"or RM {self.cap:,.2f}. Lower = RM {chosen:,.2f}."
            )
        raise ValueError(f"unknown excess rule: {self.kind}")


# Excess rules read from the policy wording, not inferred.
EXCESS = {
    "FP503": ExcessRule("lesser_of", 1.0, 200.0, "FP503 Excess Clause"),
    "FP504": ExcessRule("lesser_of", 1.0, 2500.0, "FP504 Excess Clause"),
    # FP506A: "the first RM50.00 of each and every claim under this endorsement
    # shall be borne by the Insured, as ascertained after the application of any
    # condition of average"
    "FP506A": ExcessRule("flat", None, 50.0, "FP506A proviso"),
    "FP507A": ExcessRule("flat", None, 1000.0, "FP507A exclusion (c)"),
    "FP507B": ExcessRule("flat", None, 1000.0, "FP507B exclusion (c)"),
    "FP510": ExcessRule("lower_of", 5.0, 25000.0, "FP510 (d)"),
    "FP513": ExcessRule("flat", None, 250.0, "FP513 proviso"),
    # FP512A and FP512B carry no excess clause. The RM500.00 in their wording is
    # the substituted Condition 8(c) limit on works of art, not an excess.
    "FP512A": ExcessRule("none", label="FP512A, no excess clause"),
    "FP512B": ExcessRule("none", label="FP512B, no excess clause"),
    "BASE": ExcessRule("none", label="Base fire peril"),
}


@dataclass
class LineItem:
    ref: int
    desc: str
    claimed: float
    schedule_item: int | None = None
    treatment: str = "covered"       # covered | excluded
    clause: str = "base"             # the clause that admits or excludes it
    group: str = "BASE"              # which excess group it falls in
    note: str = ""


@dataclass
class Result:
    payable: float
    claimed: float
    excluded_total: float
    groups: list = field(default_factory=list)
    working: list = field(default_factory=list)
    average_applied: dict = field(default_factory=dict)


def _average_factors(sums_insured: dict, assessed_values: dict) -> dict:
    """Condition 20, applied item by item.

    A factor below 1.0 means that Schedule item is underinsured and the Insured
    bears a rateable proportion. An item with no valuation in evidence is not
    averaged: underinsurance has to be shown, not assumed.
    """
    factors = {}
    for item, si in sums_insured.items():
        value = assessed_values.get(item)
        amount = si["sum_insured"] if isinstance(si, dict) else si
        if not value or value <= amount:
            factors[item] = 1.0
        else:
            factors[item] = round(amount / value, 10)
    return factors


def compute(items: list[LineItem],
            sums_insured: dict,
            assessed_values: dict | None = None) -> Result:
    assessed_values = assessed_values or {}
    working = []

    total_si = sum(v["sum_insured"] if isinstance(v, dict) else v
                   for v in sums_insured.values())
    factors = _average_factors(sums_insured, assessed_values)

    # ---- step 1: exclusions -------------------------------------------------
    excluded = [i for i in items if i.treatment == "excluded"]
    covered = [i for i in items if i.treatment != "excluded"]
    excluded_total = sum(i.claimed for i in excluded)
    if excluded:
        working.append("STEP 1  EXCLUSIONS")
        for i in excluded:
            working.append(f"  ref {i.ref}  RM {i.claimed:>12,.2f}  "
                           f"EXCLUDED by {i.clause}  ({i.desc[:44]})")
        working.append(f"  excluded total       RM {excluded_total:>12,.2f}")

    # ---- step 2: average, per Schedule item, on what remains ----------------
    if assessed_values:
        working.append("")
        working.append("STEP 2  CONDITION 20 AVERAGE, PER SCHEDULE ITEM")
        for item in sorted(factors):
            si = sums_insured.get(item)
            amount = si["sum_insured"] if isinstance(si, dict) else si
            val = assessed_values.get(item)
            if factors[item] == 1.0:
                shown = f"RM {val:,.2f}" if val else "not in evidence"
                working.append(
                    f"  Item {item}  SI RM {amount:>11,.2f}  value {shown:>16}"
                    f"  factor 1.0  no average")
            else:
                working.append(
                    f"  Item {item}  SI RM {amount:>11,.2f}  value RM {val:>11,.2f}"
                    f"  factor {factors[item]:.4f}  UNDERINSURED")

    # ---- step 3: group, average, then excess -------------------------------
    groups = {}
    for i in covered:
        groups.setdefault(i.group, []).append(i)

    working.append("")
    working.append("STEP 3  GROUPS, AVERAGE APPLIED THEN EXCESS")
    payable = 0.0
    out_groups = []
    for name, members in groups.items():
        subtotal = sum(m.claimed for m in members)
        after_avg = 0.0
        for m in members:
            f = factors.get(m.schedule_item, 1.0)
            after_avg += m.claimed * f
        after_avg = round(after_avg, 2)

        rule = EXCESS.get(name, EXCESS["BASE"])
        excess, basis = rule.compute(total_si)
        net = round(max(after_avg - excess, 0.0), 2)
        payable += net

        working.append(f"  [{name}] refs {[m.ref for m in members]}")
        working.append(f"     subtotal          RM {subtotal:>12,.2f}")
        if abs(after_avg - subtotal) > 0.004:
            working.append(f"     after average     RM {after_avg:>12,.2f}")
        working.append(f"     excess            RM {excess:>12,.2f}   {basis}")
        working.append(f"     net               RM {net:>12,.2f}")

        out_groups.append({
            "group": name, "refs": [m.ref for m in members],
            "subtotal": round(subtotal, 2), "after_average": after_avg,
            "excess": excess, "excess_basis": basis, "net": net,
        })

    payable = round(payable, 2)
    claimed = round(sum(i.claimed for i in items), 2)
    working.append("")
    working.append(f"  CLAIMED             RM {claimed:>12,.2f}")
    working.append(f"  RECOMMENDED PAYABLE RM {payable:>12,.2f}")

    return Result(payable=payable, claimed=claimed,
                  excluded_total=round(excluded_total, 2),
                  groups=out_groups, working=working,
                  average_applied={k: v for k, v in factors.items() if v != 1.0})
