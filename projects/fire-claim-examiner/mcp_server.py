"""
Fire Policy Underwriter Advisor: the MCP server.

Documents are resources; actions are tools.

    resources   claim://{claim_no}/incident     the claimant's thread
                claim://{claim_no}/adjuster     the adjuster's report
                claim://{claim_no}/schedule     the policy schedule
                policy://clause/{code}          one clause of the wording

    tools       search_policy        find wording, ranked by authority for this claim
                check_gate           code applies the gate's test to the facts given
                calculate_payable    code computes the figure, after the gates
                submit_advice        records the advice once the guard passes it

Code sets every gate status and every figure. No tool decides the claim or
writes to the claim file; the claims examiner decides.

Every call is logged to $FIRE_RUN_DIR/<claim_no>.jsonl when that is set, and
the benchmark scores the run from that log.

Run:  python mcp_server.py      (stdio)
"""

import json
import os
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / "engine"))

from mcp.server.fastmcp import FastMCP  # noqa: E402

import claim_file  # noqa: E402
import guard  # noqa: E402
from gates import ClaimSession, GateError  # noqa: E402
from policy_search import PolicySearch, SearchUnavailable  # noqa: E402


class Desk:
    """All server state and behaviour, callable without MCP for the no-key tests."""

    def __init__(self, search: PolicySearch | None = None):
        self.search = search or PolicySearch()
        self.sessions: dict[str, ClaimSession] = {}
        self.attempts: dict[str, int] = {}
        self.advice: dict[str, dict] = {}

    # ---- log --------------------------------------------------------------
    def log(self, claim_no, kind, name, args, result):
        d = os.environ.get("FIRE_RUN_DIR")
        if not d or not claim_no:
            return
        Path(d).mkdir(parents=True, exist_ok=True)
        with open(Path(d) / f"{claim_no}.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"t": round(time.time(), 3), "kind": kind, "name": name,
                                "args": args, "result": result}, ensure_ascii=False) + "\n")

    def session(self, claim_no) -> ClaimSession:
        claim_file.folder(claim_no)          # raises UnknownCase
        if claim_no not in self.sessions:
            self.sessions[claim_no] = ClaimSession(claim_no)
        return self.sessions[claim_no]

    # ---- resources --------------------------------------------------------
    def read_claim(self, claim_no, doc):
        text = claim_file.read(claim_no, doc)
        if doc == "incident":
            # opening the claim file starts a fresh session for this claim
            self.sessions[claim_no] = ClaimSession(claim_no)
            self.attempts[claim_no] = 0
            self.advice.pop(claim_no, None)
        self.log(claim_no, "resource", f"claim://{claim_no}/{doc}", {}, {"chars": len(text)})
        return text

    # ---- tools ------------------------------------------------------------
    def _wrap(self, claim_no, name, args, fn):
        try:
            out = fn()
        except claim_file.UnknownCase:
            out = {"error": "unknown_case", "message": f"No claim file {claim_no}."}
        except GateError as e:
            out = e.to_dict()
        except SearchUnavailable as e:
            out = {"error": "search_unavailable", "retryable": True, "message": str(e)}
        self.log(claim_no, "tool", name, args, out)
        return out

    def search_policy(self, claim_no, query="", code=""):
        def run():
            s = self.session(claim_no)
            held = claim_file.held_codes(claim_no)
            if code:
                res = self.search.lookup(code)
                if not res:
                    return {"results": [], "message": f"No clause with code '{code}' in the policy wording."}
            else:
                res = self.search.search(query, held)
            s.log_retrieved(res)
            if not res:
                return {"results": [], "message": "Nothing in the policy wording answers this query."}
            return {"held_on_schedule": held, "results": res}
        return self._wrap(claim_no, "search_policy", {"query": query, "code": code}, run)

    def check_gate(self, claim_no, gate, facts, clauses=None):
        return self._wrap(claim_no, "check_gate", {"gate": gate, "facts": facts, "clauses": clauses or []},
                          lambda: self.session(claim_no).check_gate(int(gate), facts, clauses or []))

    def calculate_payable(self, claim_no, items, sums_insured, values_at_risk=None, endorsements_held=None):
        args = {"items": items, "sums_insured": sums_insured, "values_at_risk": values_at_risk,
                "endorsements_held": endorsements_held}
        return self._wrap(claim_no, "calculate_payable", args,
                          lambda: self.session(claim_no).calculate_payable(items, sums_insured,
                                                                           values_at_risk, endorsements_held))

    def submit_advice(self, claim_no, advice):
        def run():
            s = self.session(claim_no)
            faults = guard.check(advice, s)
            if not faults:
                self.advice[claim_no] = advice
                return {"recorded": True, "message": "Advice recorded for the claims examiner."}
            self.attempts[claim_no] = self.attempts.get(claim_no, 0) + 1
            left = guard.MAX_RETRIES - self.attempts[claim_no] + 1
            if left <= 0:
                return {"error": "rejected", "recorded": False, "faults": faults,
                        "message": "Advice rejected after two retries. Stop: the claim goes to the examiner without advice."}
            return {"error": faults[0]["error"], "recorded": False, "faults": faults,
                    "retries_left": left, "message": "Fix each line named and submit again."}
        return self._wrap(claim_no, "submit_advice", {"advice": advice}, run)


DESK = Desk()
mcp = FastMCP("fire-underwriter", log_level="WARNING")


@mcp.resource("claim://{claim_no}/incident", mime_type="text/markdown")
def incident(claim_no: str) -> str:
    """The claimant's incident report: the WhatsApp or email thread, as received. Reading it opens the claim."""
    return DESK.read_claim(claim_no, "incident")


@mcp.resource("claim://{claim_no}/adjuster", mime_type="text/markdown")
def adjuster(claim_no: str) -> str:
    """The loss adjuster's report: investigation, findings and measurement. Its findings are the investigation."""
    return DESK.read_claim(claim_no, "adjuster")


@mcp.resource("claim://{claim_no}/schedule", mime_type="text/markdown")
def schedule(claim_no: str) -> str:
    """The policy schedule: period, construction, sums insured, endorsements and clauses held, warranties."""
    return DESK.read_claim(claim_no, "schedule")


@mcp.resource("policy://clause/{code}", mime_type="text/plain")
def clause(code: str) -> str:
    """One clause, condition, endorsement or warranty of the policy wording, with its scope note."""
    res = DESK.search.lookup(code)
    if not res:
        return f"No clause with code '{code}'."
    c = res[0]
    note = f"\n\nScope note: {c['scope_note']}" if c.get("scope_note") else ""
    return f"{c['code']}: {c['title']}\n\n{c['text']}{note}"


@mcp.tool()
def search_policy(claim_no: str, query: str = "", code: str = "") -> dict:
    """Find policy wording for this claim. Give a plain-words query, or a code ("Condition 12", "FP507B",
    "Operative clause") to fetch that clause. Results are ranked by authority against this claim's schedule:
    an endorsement not on the schedule cannot override. Returns chunk_id, code, authority, scope note and the
    wording. Ranks wording; does not decide cover. An empty result means nothing in the wording answers the
    query; search_unavailable is retryable. Only wording returned here may be quoted or relied on at a gate."""
    return DESK.search_policy(claim_no, query, code)


@mcp.tool()
def check_gate(claim_no: str, gate: int, facts: dict, clauses: list[str] | None = None) -> dict:
    """Code applies the gate's test to the facts you give and returns the status: pass, fail or pass_flagged,
    with the reason. Gates run in order 1 to 6; after a fail, later gates are not reached. facts is an object of
    {name: {"value": ..., "source": "<document>, <section>"}}; a missing fact is refused and named. clauses lists
    the chunk_ids you rely on; each must have been returned by search_policy for this claim. You never set a
    status yourself.
    Gate 1 facts: date_of_loss, period_start, period_end (YYYY-MM-DD); where the loss is after the period, also
      auto_renewal_clause_held, premium_paid_to_date_of_loss, company_receipt_produced (true/false).
    Gate 2 facts: proximate_cause (one of: fire, lightning, storm, flood, earthquake, aircraft, explosion, impact,
      burst_pipe, bush_fire, subsidence_or_landslip, spontaneous_combustion, riot, malicious_damage, falling_tree,
      electrical_fault, mechanical_breakdown, burglary_or_theft), intervening_event ("none" or the event);
      optional endorsements_held.
    Gate 3 facts: date_of_loss, written_claim_date, extension_until (date or null), false_declaration_or_fraud.
    Gate 4 facts: endorsements_held (codes on the schedule); for burst_pipe also storeys_including_mezzanine;
      for riot or malicious_damage also residential.
    Gate 5 facts: warranty_breached, occupation_changed_increasing_risk, unoccupied_days,
      interest_passed_not_by_will_or_law, sanction_endorsed; plus the endorsement's own facts, named by the
      error if missing (FP503: water_or_rain_damage_claimed, wind_damaged_roof_or_walls_first; FP507A/B:
      premises_untenanted, sprinkler_leakage, defect_notified_not_remedied; FP513:
      tree_or_branch_struck_insured_property; FP512A/B: popular_rising_or_terrorism and, for malicious_damage,
      in_course_of_housebreaking_or_theft; FP506A: vehicle_belongs_to_insured; FP510: coastal_or_river_erosion,
      demolition_or_structural_works, defective_foundations). Where the building fell or was displaced, also
      fall_or_displacement, displacement_caused_by_insured_peril, displaced_part_isolated.
    Gate 6 facts: items, a list of {ref, description, schedule_item (number or null), assessed, category} from
      the adjuster's measurement. category is one of: insured_damage, mitigation_expense, falling_tree_damage,
      not_property_insured, not_caused_by_event, consequential_loss, money_or_documents, stolen_property,
      outdoor_fixture, subsidence_or_landslip_damage, electrical_machine_where_fault_began,
      electrical_damage_by_lightning."""
    return DESK.check_gate(claim_no, gate, facts, clauses)


@mcp.tool()
def calculate_payable(claim_no: str, items: list[dict], sums_insured: dict, values_at_risk: dict | None = None,
                      endorsements_held: list[str] | None = None) -> dict:
    """Code computes the figure after the gates: exclusions first, then Condition 20 average per schedule item,
    then the excess after average. items as for gate 6, using the adjuster's assessed amounts; sums_insured and
    values_at_risk map schedule item numbers to amounts. Runs only once the gates are complete or one has failed.
    A declined claim is priced as a but-for figure labelled not payable; where there is no cover to price at
    any figure it returns not priced with the reason. Give endorsements_held when the chain stopped before gate 4.
    You never compute a figure yourself; explain the working it returns."""
    return DESK.calculate_payable(claim_no, items, sums_insured, values_at_risk, endorsements_held)


@mcp.tool()
def submit_advice(claim_no: str, advice: dict) -> dict:
    """Record the six-gate advice for the claims examiner. advice: {"proximate_cause": {"cause", "sequence",
    "intervening_event"}, "gates": [{"gate", "status", "quotes": [{"chunk_id", "text"}], "application",
    "facts_relied_on": [{"fact", "source"}]}, ... all six], "conflicts": [{"claimant_account",
    "adjuster_finding", "finding_applied"}] or [], "flags": [...], "governing_clause", "advice",
    "figure": {"payable", "but_for", "label"}}. The guard checks every quote against retrieved wording, every
    status against check_gate and the figure against calculate_payable, and names any line that fails. Two
    retries. It does not decide the claim and does not write to the claim file."""
    return DESK.submit_advice(claim_no, advice)


if __name__ == "__main__":
    # Load the embedding and rerank models before serving. Loading them lazily
    # inside the first tool call hung the stdio server on Windows.
    if os.environ.get("FIRE_SEARCH_DOWN") != "1":
        try:
            DESK.search.retriever
        except SearchUnavailable as e:
            print(f"search not loaded: {e}", file=sys.stderr)
    mcp.run()
