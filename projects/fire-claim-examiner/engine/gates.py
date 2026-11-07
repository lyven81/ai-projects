"""
Fire Policy Underwriter Advisor: the six gates, in code.

The underwriter (the AI agent) reads the claim file and supplies FACTS, each
with the document and section it came from. This module applies the condition
tests held as data in rules/condition_tests.json to those facts and sets every
gate status. The agent never sets a status and never computes a figure.

What is enforced here, not asked for in the prompt:

    order        gate n runs only after gates 1 to n-1 passed (or passed, flagged)
    stop         after a failed gate, later gates are not reached
    retrieval    a clause the gate relies on must have been returned by
                 search_policy for this claim
    facts        every fact a test needs is given, each with its source

One ClaimSession per open claim. Opening the claim file (reading its incident
report) starts a fresh session.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from calculator import LineItem, compute

BASE = Path(__file__).resolve().parents[1]
RULES = json.loads((BASE / "rules" / "condition_tests.json").read_text(encoding="utf-8"))
NAMES = {int(k): v for k, v in RULES["gate_names"].items()}


class GateError(Exception):
    """A structured refusal. `code` is stable; `message` says what to fix."""

    def __init__(self, code: str, message: str, **extra):
        super().__init__(message)
        self.code, self.message, self.extra = code, message, extra

    def to_dict(self):
        return {"error": self.code, "message": self.message, **self.extra}


# ------------------------------------------------------------------- helpers
def _date(v, name):
    try:
        return date.fromisoformat(str(v))
    except ValueError:
        raise GateError("missing_fact", f"Fact '{name}' must be a date as YYYY-MM-DD, got {v!r}.",
                        fact=name)


def _d(d: date) -> str:
    """14 August 2025, never 01 August."""
    return f"{d.day} {d:%B %Y}"


def _cmp(left, op, right):
    if left is None:
        return False
    return {"==": left == right, "!=": left != right, ">": left > right,
            ">=": left >= right, "<": left < right, "<=": left <= right}[op]


def _eval(expr, facts):
    if "all" in expr:
        return all(_eval(e, facts) for e in expr["all"])
    if "any" in expr:
        return any(_eval(e, facts) for e in expr["any"])
    return _cmp(facts.get(expr["fact"]), expr["op"], expr["value"])


def _values(raw: dict, required: list[str]) -> dict:
    """Unwrap {"name": {"value": v, "source": "..."}} and refuse any gap."""
    if not isinstance(raw, dict):
        raise GateError("missing_fact", "facts must be an object of {name: {value, source}}.")
    out = {}
    for name, f in raw.items():
        if not isinstance(f, dict) or "value" not in f:
            raise GateError("missing_fact", f"Fact '{name}' needs a value and a source.", fact=name)
        if not str(f.get("source", "")).strip():
            raise GateError("missing_fact",
                            f"Fact '{name}' has no source. Name the document and section it came from.",
                            fact=name)
        out[name] = f["value"]
    for name in required:
        if name not in out:
            raise GateError("missing_fact", f"Gate needs the fact '{name}', with its source.",
                            fact=name)
    return out


@dataclass
class GateResult:
    gate: int
    status: str                 # pass | pass_flagged | fail
    clause: str                 # the clause the status rests on
    reason: str
    tests: list = field(default_factory=list)
    also: list = field(default_factory=list)
    flags: list = field(default_factory=list)
    facts: dict = field(default_factory=dict)

    def to_dict(self):
        nxt = None
        if self.status != "fail":
            nxt = f"gate {self.gate + 1}" if self.gate < 6 else "calculate_payable"
        else:
            nxt = "calculate_payable (the chain has stopped; later gates are not reached)"
        return {"gate": self.gate, "name": NAMES[self.gate], "status": self.status,
                "clause": self.clause, "reason": self.reason, "tests": self.tests,
                "also_failing": self.also, "flags": self.flags, "next": nxt}


# ------------------------------------------------------------------- session
class ClaimSession:
    def __init__(self, claim_no: str):
        self.claim_no = claim_no
        self.retrieved: dict[str, dict] = {}     # chunk_id -> chunk returned by search
        self.results: dict[int, GateResult] = {}
        self.cause: str | None = None
        self.answer: str | None = None           # clause answering the cause: BASE or a code
        self.held: list[str] = []
        self.payable: dict | None = None

    # ---- retrieval log --------------------------------------------------
    def log_retrieved(self, chunks: list[dict]):
        for c in chunks:
            self.retrieved[c["chunk_id"]] = c

    def _need(self, chunk_ids):
        missing = [c for c in chunk_ids if c and c not in self.retrieved]
        if missing:
            raise GateError("clause_not_retrieved",
                            "Search the policy for " + ", ".join(missing) +
                            " before this gate; a gate rests only on wording retrieved for this claim.",
                            missing=missing)

    # ---- order ----------------------------------------------------------
    def _order(self, gate: int):
        if gate not in NAMES:
            raise GateError("gate_out_of_order", f"There is no gate {gate}; gates run 1 to 6.")
        for g in range(1, gate):
            r = self.results.get(g)
            if r is None:
                raise GateError("gate_out_of_order",
                                f"Gate {g} ({NAMES[g]}) must be checked before gate {gate}.",
                                next_gate=g)
            if r.status == "fail":
                raise GateError("chain_stopped",
                                f"Gate {g} failed; gates after it are not reached. "
                                "Call calculate_payable, then submit_advice.", failed_gate=g)
        # re-checking a gate discards everything after it
        for g in [k for k in self.results if k >= gate]:
            del self.results[g]
        self.payable = None

    def status_of(self, gate):
        r = self.results.get(gate)
        if r:
            return r.status
        stopped = [g for g, x in self.results.items() if x.status == "fail"]
        return "not_reached" if stopped and gate > min(stopped) else None

    def governing_clause(self):
        """The clause the result rests on, set by code: the deciding gate's clause on a decline,
        otherwise the clause that answers the cause."""
        stopped = self.stopped_at()
        if stopped is not None:
            return self.results[stopped].clause
        if self.answer and self.answer != "BASE":
            return self.answer
        return "Operative clause"

    def stopped_at(self):
        fails = [g for g, r in self.results.items() if r.status == "fail"]
        return min(fails) if fails else None

    # ---- the gates ------------------------------------------------------
    def check_gate(self, gate: int, facts: dict, clauses: list[str] | None = None) -> dict:
        self._order(gate)
        self._need(clauses or [])
        res = getattr(self, f"_gate_{gate}")(facts)
        res.facts = facts
        self.results[gate] = res
        return res.to_dict()

    def _gate_1(self, raw):
        R = RULES["gate_1"]
        f = _values(raw, R["required_facts"])
        dol = _date(f["date_of_loss"], "date_of_loss")
        start = _date(f["period_start"], "period_start")
        end = _date(f["period_end"], "period_end")
        self._need([R["chunk_id"]])
        if start <= dol <= end:
            return GateResult(1, "pass", "Operative clause",
                              f"Loss on {_d(dol)} falls inside {_d(start)} to {_d(end)}.")
        if dol < start:
            return GateResult(1, "fail", "Operative clause (period of insurance)",
                              f"Loss on {_d(dol)} falls before the period starts on {_d(start)}.")
        ren = R["renewal"]
        rf = {k: f.get(k) for k in ren["facts"]}
        if rf["auto_renewal_clause_held"] is True and rf["premium_paid_to_date_of_loss"] is True:
            if rf["company_receipt_produced"] is True:
                self._need([ren["chunk_id"]])
                return GateResult(1, "pass", "FC815",
                                  f"Loss on {_d(dol)} falls after the period on the schedule; FC815 renewed "
                                  "the policy and a receipt signed by the Company was produced.")
            self._need([ren["chunk_id"], ren["receipt_chunk_id"]])
            return GateResult(1, "pass_flagged", "FC815",
                              f"Loss on {_d(dol)} falls after the period on the schedule ({_d(start)} to "
                              f"{_d(end)}). FC815 is held and the premium was paid up to the date of loss, "
                              "but no receipt signed by the Company was produced (Condition 2). "
                              "Flagged for the claims examiner.",
                              flags=["Renewal not proven by receipt: FC815 held and premium paid, no receipt "
                                     "signed by the Company under Condition 2."])
        return GateResult(1, "fail", "Operative clause (period of insurance)",
                          f"Loss on {_d(dol)} falls after the period on the schedule ends on {_d(end)}, "
                          "and no renewal is shown.")

    def _gate_2(self, raw):
        R = RULES["gate_2"]
        f = _values(raw, R["required_facts"])
        cause = str(f["proximate_cause"]).strip().lower()
        if cause not in R["causes"]:
            raise GateError("no_test_for_clause",
                            f"Unknown proximate cause '{cause}'. Use one of: " + ", ".join(R["causes"]) + ".",
                            allowed=list(R["causes"]))
        spec = R["causes"][cause]
        self.cause = cause
        self._need([R["base_chunk_id"]])
        if spec["base"]:
            self.answer = "BASE"
            return GateResult(2, "pass", "Operative clause",
                              f"Proximate cause: {cause.replace('_', ' ')}, a base insured peril (fire or lightning).")
        if not spec["insured_by"]:
            note = spec.get("note", "")
            held = [str(c) for c in (f.get("endorsements_held") or [])]
            gov = next((c for c in spec.get("governing_if_held", []) if c in held), "peril_not_insured")
            if gov != "peril_not_insured":
                self._need([f"ENDORSEMENT-{gov}"])
            return GateResult(2, "fail", gov,
                              f"Proximate cause: {cause.replace('_', ' ')}. It is insured nowhere in the policy, "
                              f"base cover or any endorsement. {note}".strip())
        # the cause is insured somewhere: at least one endorsement that brings it in must be retrieved
        ids = [f"ENDORSEMENT-{c}" for c in spec["insured_by"]]
        if not any(i in self.retrieved for i in ids):
            raise GateError("clause_not_retrieved",
                            f"Search the policy for the endorsement that brings in {cause.replace('_', ' ')} "
                            f"({', '.join(spec['insured_by'])}) before gate 2.", missing=ids)
        return GateResult(2, "pass", " or ".join(spec["insured_by"]),
                          f"Proximate cause: {cause.replace('_', ' ')}. Not a base peril; "
                          f"{' or '.join(spec['insured_by'])} brings it in. Whether it is held is gate 4.")

    def _gate_3(self, raw):
        R = RULES["gate_3"]
        f = _values(raw, R["required_facts"])
        dol = _date(f["date_of_loss"], "date_of_loss")
        wc = _date(f["written_claim_date"], "written_claim_date")
        ext = _date(f["extension_until"], "extension_until") if f["extension_until"] else None
        self._need([R["notice"]["chunk_id"]])
        day = (wc - dol).days
        in_time = day <= R["notice"]["days"] or (ext is not None and wc <= ext)
        if not in_time:
            return GateResult(3, "fail", "Condition 12",
                              f"Written claim on {_d(wc)}, day {day} against {R['notice']['days']}, with no "
                              "further time allowed in writing. No claim is payable unless Condition 12 is complied "
                              "with. The Company may still allow further time in writing.")
        if f["false_declaration_or_fraud"] is True:
            self._need([R["fraud"]["chunk_id"]])
            return GateResult(3, "fail", "Condition 15",
                              f"Written claim on day {day} is in time, but a false declaration or fraud was used in "
                              "support of the claim. All benefit under the policy is forfeited.")
        timing = (f"day {day} of {R['notice']['days']}" if day <= R["notice"]["days"]
                  else f"day {day}, within the further time allowed in writing to {_d(ext)}")
        return GateResult(3, "pass", "Condition 12",
                          f"Written claim delivered {_d(wc)}, {timing}. No fraud or false declaration.")

    def _gate_4(self, raw):
        R = RULES["gate_4"]
        f = _values(raw, R["required_facts"])
        held = [str(c).strip() for c in (f["endorsements_held"] or [])]
        self.held = held
        spec = RULES["gate_2"]["causes"][self.cause]
        if spec["base"]:
            self.answer = "BASE"
            return GateResult(4, "pass", "Operative clause",
                              "No endorsement is required for a base peril.")
        cands = [c for c in spec["insured_by"] if c in held]
        if not cands:
            self.answer = None
            base_ex = spec.get("base_exclusion")
            return GateResult(4, "fail", base_ex or f"{' or '.join(spec['insured_by'])} not held",
                              f"{' or '.join(spec['insured_by'])} is not on the schedule"
                              + (f", so {base_ex} stands" if base_ex else "")
                              + ". The loss is not covered.")
        variants = R["variants"]
        fitting = [c for c in cands if c not in variants or self._fits(c, f)]
        chosen = fitting[0] if fitting else cands[0]
        self.answer = chosen
        self._need([f"ENDORSEMENT-{chosen}"])
        if chosen in variants and not self._fits(chosen, f):
            other = [v for v in variants if v[:-1] == chosen[:-1] and v != chosen]
            flag = (f"Building class mismatch: {chosen} is held, but the building does not fit its scope. "
                    f"The variant that fits is {other[0] if other else 'another variant'}.")
            return GateResult(4, "pass_flagged", chosen,
                              f"{chosen} is on the schedule and responds on its wording. {flag} "
                              "Flagged for the claims examiner to decide.", flags=[flag])
        return GateResult(4, "pass", chosen, f"{chosen} is on the schedule and answers the cause.")

    def _fits(self, code, f):
        v = RULES["gate_4"]["variants"][code]
        if v["fact"] not in f:
            raise GateError("missing_fact",
                            f"{code} has a paired variant; gate 4 needs the fact '{v['fact']}', with its source.",
                            fact=v["fact"])
        return _eval(v["fits"], f)

    def _gate_5(self, raw):
        R = RULES["gate_5"]
        required = list(R["required_facts"])
        tests = []
        if self.answer and self.answer != "BASE":
            if self.answer not in R["endorsement_tests"]:
                raise GateError("no_test_for_clause",
                                f"No gate 5 test is held for {self.answer}.", clause=self.answer)
            for t in R["endorsement_tests"][self.answer]:
                if t.get("only_for_cause") and t["only_for_cause"] != self.cause:
                    continue
                tests.append(t)
                required += [x for x in t["facts"] if x not in required]
        f = _values(raw, required)
        need = ["CONDITION-9"] + ([f"ENDORSEMENT-{self.answer}"] if self.answer not in (None, "BASE") else [])
        tests = tests + [R["warranty_test"]] + R["condition_9"]
        c4 = R["condition_4"]
        if f.get(c4["optional_fact"]) is True:
            _values(raw, c4["facts"])
            tests.append(c4)
            need.append(c4["chunk_id"])
        self._need(need)
        out, failing = [], []
        for t in tests:
            failed = _eval(t["fails_when"], f)
            out.append({"test": t["id"], "result": "fail" if failed else "pass"})
            if failed:
                failing.append(t)
        if failing:
            first = failing[0]
            return GateResult(5, "fail", first["id"], first["reason"], tests=out,
                              also=[t["id"] for t in failing[1:]])
        label = self.answer if self.answer != "BASE" else "Condition 9"
        return GateResult(5, "pass", label,
                          "Every test for the clause that answers the cause is met; no warranty breached; "
                          "Condition 9 not engaged.", tests=out)

    def _gate_6(self, raw):
        f = _values(raw, ["items"])
        lines = self.classify(f["items"])
        need = sorted({l["chunk_id"] for l in lines if l["treatment"] == "excluded" and l["chunk_id"]})
        self._need(need)
        admitted = [l for l in lines if l["treatment"] == "covered"]
        flags = [l["flag"] for l in lines if l.get("flag")]
        tests = [{"ref": l["ref"], "result": "admitted" if l["treatment"] == "covered" else "excluded",
                  "clause": l["clause"]} for l in lines]
        if not admitted:
            clauses = sorted({l["clause"] for l in lines})
            return GateResult(6, "fail", clauses[0] if len(clauses) == 1 else "; ".join(clauses),
                              "No item is admitted: every item claimed is excluded.", tests=tests)
        return GateResult(6, "pass", self.answer if self.answer != "BASE" else "Operative clause",
                          f"{len(admitted)} of {len(lines)} items admitted.", tests=tests, flags=flags)

    # ---- items ----------------------------------------------------------
    def classify(self, items):
        cats = RULES["gate_6"]["categories"]
        answer = self.answer or "BASE"
        out = []
        if not isinstance(items, list) or not items:
            raise GateError("invalid_items", "items must be a non-empty list.")
        for it in items:
            for k in ("ref", "assessed", "category"):
                if k not in it:
                    raise GateError("invalid_items", f"Each item needs '{k}'.", item=it)
            cat = it["category"]
            if cat not in cats:
                raise GateError("invalid_items", f"Unknown item category '{cat}'. Use one of: "
                                + ", ".join(cats) + ".", allowed=list(cats))
            spec = cats[cat]
            rule = spec
            if "by_answer" in spec:
                rule = spec["by_answer"].get(answer) or spec["by_answer"].get("default")
            if "by_held" in spec:
                hit = [k for k in spec["by_held"] if k in self.held]
                rule = spec["by_held"][hit[0]] if hit else spec["by_held"]["default"]
            treatment = rule.get("treatment", spec.get("treatment"))
            clause = rule.get("clause", "")
            chunk = rule.get("chunk_id")
            if clause and "{answer}" in clause:
                clause = clause.replace("{answer}", "Operative clause" if answer == "BASE" else answer)
                chunk = "OPERATIVE-CLAUSE" if answer == "BASE" else f"ENDORSEMENT-{answer}"
            group = RULES["payable"]["excess_group_by_answer"].get(answer, "BASE")
            if spec.get("group"):
                if spec.get("requires_held") and spec["requires_held"] not in self.held:
                    treatment, clause = "excluded", f"{spec['requires_held']} not held"
                    chunk = None
                else:
                    group = spec["group"]
            ref = int(it["ref"]) if str(it["ref"]).isdigit() else it["ref"]
            out.append({"ref": ref, "desc": it.get("description", ""),
                        "schedule_item": it.get("schedule_item"), "assessed": float(it["assessed"]),
                        "category": cat, "treatment": treatment,
                        "clause": clause or (answer if answer != "BASE" else "Operative clause"),
                        "chunk_id": chunk, "group": group, "flag": spec.get("flag")})
        return out

    # ---- payable ----------------------------------------------------------
    def calculate_payable(self, items, sums_insured, values_at_risk=None,
                          endorsements_held=None) -> dict:
        stopped = self.stopped_at()
        if stopped is None and len(self.results) < 6:
            raise GateError("gates_incomplete",
                            "Check every gate in order (or until one fails) before calculate_payable.",
                            done=sorted(self.results))
        if stopped is not None and str(stopped) in RULES["payable"]["not_priced_after_gate"]:
            self.payable = {"payable": 0.0, "priced": False, "but_for": None,
                            "label": "not priced",
                            "reason": RULES["payable"]["not_priced_after_gate"][str(stopped)],
                            "working": []}
            return self.payable
        try:
            si = {int(k): float(v) for k, v in sums_insured.items()}
            var = {int(k): float(v) for k, v in (values_at_risk or {}).items()}
        except (ValueError, AttributeError):
            raise GateError("invalid_items", "sums_insured and values_at_risk map schedule item numbers to amounts.")
        if self.answer is None and self.cause:
            # declined at gate 3, before gate 4 named the endorsement: price under
            # the held endorsement that answers the cause
            self.held = [str(c) for c in (endorsements_held or [])]
            spec = RULES["gate_2"]["causes"][self.cause]
            hit = [c for c in spec["insured_by"] if c in self.held]
            self.answer = "BASE" if spec["base"] else (hit[0] if hit else None)
            if self.answer is None:
                raise GateError("missing_fact", "Give endorsements_held from the schedule so the figure is "
                                "priced under the endorsement that answers the cause.", fact="endorsements_held")
        lines = self.classify(items)
        if stopped == 6:
            # but for the clause that excluded every item
            block = self.results[6].clause
            for l in lines:
                if l["clause"] in block:
                    l["treatment"] = "covered"
        res = compute([LineItem(ref=l["ref"], desc=l["desc"], claimed=l["assessed"],
                                schedule_item=l["schedule_item"], treatment=l["treatment"],
                                clause=l["clause"], group=l["group"]) for l in lines], si, var)
        if stopped is None:
            self.payable = {"payable": res.payable, "priced": True, "but_for": None,
                            "label": "payable", "working": res.working}
        else:
            working = [l.replace("RECOMMENDED PAYABLE", "BUT-FOR, NOT PAYABLE") for l in res.working]
            self.payable = {"payable": 0.0, "priced": True, "but_for": res.payable,
                            "label": "not payable",
                            "reason": f"Declined at gate {stopped} on {self.results[stopped].clause}. "
                                      "The figure is what the policy would have paid but for that ground.",
                            "working": working}
        return self.payable
