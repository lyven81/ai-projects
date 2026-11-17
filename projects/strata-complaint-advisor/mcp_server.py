"""
Strata Complaint Advisor: the MCP server.

Documents are resources; actions are tools.

    resources   complaint://{complaint_id}          the complaint as the advisor reads it (masked)
                complaint://{complaint_id}/intake   the intake record: masked text, units, emergency check
                sop://complaint                     the building's complaint SOP
                rule://{code}                       one passage, as a citation click opens it

    tools       search_rules      find the rules for this complaint, ordered by precedence
                get_rule          one passage by its code
                get_template      an approved reply template
                submit_guidance   records the guidance once the guard passes it

Every result has one shape: {tool, status, data, error, next_step}. No tool
sends anything to a resident or decides a complaint; the officer does.

Every call is logged to $STRATA_RUN_DIR/<complaint_id>.jsonl when that is set,
and the benchmark scores the run from that log.

Run:  python mcp_server.py      (stdio)
"""
import json
import os
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / "engine"))

import complaint_file  # noqa: E402
import guard  # noqa: E402
from rule_search import RuleSearch, SearchUnavailable, base_code  # noqa: E402

FACTS = json.loads((BASE / "rules" / "missing_facts.json").read_text(encoding="utf-8"))["facts_by_type"]
SOP_TEXT = (BASE / "corpus" / "building" / "complaint-sop.md").read_text(encoding="utf-8").split("---", 2)[2].strip()
TEMPLATES = {"acknowledge", "request_facts", "explain_rule", "refer_to_manager"}
EXHAUSTED = "This complaint could not be checked against the documents. Please refer it to the building manager."


class Session:
    def __init__(self, cid):
        self.cid = cid
        self.retrieved = {}
        self.attempts = 0
        self.guidance = None
        self.note = None


class Desk:
    """All server state and behaviour, callable without MCP for the no-key tests."""

    def __init__(self, search=None):
        self.search = search or RuleSearch()
        self.sessions = {}

    def log(self, cid, kind, name, args, result):
        d = os.environ.get("STRATA_RUN_DIR")
        if not d or not cid:
            return
        Path(d).mkdir(parents=True, exist_ok=True)
        with open(Path(d) / f"{cid}.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps({"t": round(time.time(), 3), "kind": kind, "name": name, "args": args, "result": result},
                               ensure_ascii=False) + "\n")

    def session(self, cid):
        complaint_file.raw(cid)
        if cid not in self.sessions:
            self.sessions[cid] = Session(cid)
        return self.sessions[cid]

    # ---- resources --------------------------------------------------------
    def read_intake(self, cid):
        rec = complaint_file.intake_record(cid)
        self.sessions[cid] = Session(cid)           # opening the complaint starts a fresh session
        if rec["emergency"]:
            note = complaint_file.emergency_note(cid)
            self.sessions[cid].note = note
            rec["handover_note"] = note
        self.log(cid, "intake", "intake", {}, {"masked": rec["masked"], "emergency": rec["emergency"],
                                                 "handover_note": rec.get("handover_note")})
        return rec

    def read_complaint(self, cid):
        text = complaint_file.render(cid)
        self.log(cid, "resource", f"complaint://{cid}", {}, {"text": text})
        return text

    def read_rule(self, code):
        p = self.search.lookup(code, any_status=True)
        if not p:
            return f"No passage with code '{code}'."
        return f"{p['code']}: {p['title']} ({p['number']}, {p['document']}, page {p['page']}, in force from {p['effective_date']})\n\n{p['text']}"

    # ---- tools ------------------------------------------------------------
    def _wrap(self, cid, name, args, fn):
        try:
            out = fn()
        except complaint_file.UnknownCase:
            out = {"status": "error", "error": "unknown_complaint", "message": f"No complaint {cid}."}
        except SearchUnavailable as e:
            out = {"status": "error", "error": "search_unavailable", "retryable": True, "message": str(e)}
        except Exception as e:  # a malformed argument comes back as a result the model can act on
            out = {"status": "error", "error": "bad_arguments", "message": f"{type(e).__name__}: {e}"[:300]}
        out = {"tool": name, "status": out.pop("status"), "data": out.pop("data", None),
               "error": out.pop("error", None), "next_step": out.pop("next_step", None), **out}
        self.log(cid, "tool", name, args, out)
        return out

    def search_rules(self, cid, query, complaint_type=""):
        def run():
            s = self.session(cid)
            c = complaint_file.raw(cid)
            res = self.search.search(query, complaint_type, complaint_file.BUILDING, c["date"])
            for p in res:
                s.retrieved[p["code"]] = p
            facts = FACTS.get(complaint_type, [])
            if not res:
                return {"status": "empty", "data": {"results": [], "facts_to_collect": facts},
                        "next_step": "No provision in the building's documents answers this query. Say so; do not supply a rule."}
            return {"status": "ok", "data": {"results": res, "facts_to_collect": facts}}
        return self._wrap(cid, "search_rules", {"query": query, "complaint_type": complaint_type}, run)

    def get_rule(self, cid, code):
        def run():
            s = self.session(cid)
            c = complaint_file.raw(cid)
            p = self.search.lookup(code, complaint_file.BUILDING, c["date"])
            if not p:
                return {"status": "error", "error": "unknown_rule",
                        "message": f"No approved passage in force with code '{code}' for this building."}
            s.retrieved[p["code"]] = p
            return {"status": "ok", "data": p}
        return self._wrap(cid, "get_rule", {"code": code}, run)

    def get_template(self, cid, name):
        def run():
            self.session(cid)
            if not self.search.lookup(f"TPL-{name}", any_status=True):
                return {"status": "error", "error": "unknown_template",
                        "message": f"No template '{name}'. Templates: {', '.join(sorted(TEMPLATES))}."}
            p = self.search.lookup(f"TPL-{name}")          # approved only
            if not p:
                return {"status": "error", "error": "template_not_approved",
                        "message": f"Template '{name}' is not approved. Templates: {', '.join(sorted(TEMPLATES))}."}
            return {"status": "ok", "data": {"name": name, "text": p["text"]}}
        return self._wrap(cid, "get_template", {"name": name}, run)

    def submit_guidance(self, cid, guidance):
        def run():
            s = self.session(cid)
            if s.attempts > guard.MAX_RETRIES:
                return {"status": "rejected", "error": "retries_exhausted", "message": EXHAUSTED}
            faults = guard.check(guidance, s, complaint_file.raw(cid))
            if not faults:
                signed = dict(guidance, draft_reply=guard.sign(guidance["draft_reply"]))
                s.guidance = signed            # a follow-up resubmits the whole guidance, checked again
                s.attempts = 0
                s.note = complaint_file.handover_note(cid, signed, s.retrieved) if signed.get("handover") else None
                return {"status": "recorded", "data": {"handover_note": s.note, "draft_reply": signed["draft_reply"]},
                        "next_step": "Guidance recorded for the officer."}
            s.attempts += 1
            if s.attempts > guard.MAX_RETRIES:
                return {"status": "rejected", "error": "retries_exhausted", "faults": faults, "message": EXHAUSTED}
            return {"status": "rejected", "error": faults[0]["error"], "faults": faults,
                    "retries_left": guard.MAX_RETRIES - s.attempts + 1,
                    "next_step": "Fix each line named and submit again."}
        return self._wrap(cid, "submit_guidance", {"guidance": guidance}, run)


DESK = Desk()

if __name__ == "__main__":
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("strata-complaint-advisor", log_level="WARNING")

    @mcp.resource("complaint://{complaint_id}/intake", mime_type="application/json")
    def intake(complaint_id: str) -> str:
        """The intake record, read by the host before any AI call: masked text, unit, emergency words."""
        return json.dumps(DESK.read_intake(complaint_id), ensure_ascii=False)

    @mcp.resource("complaint://{complaint_id}", mime_type="text/plain")
    def complaint(complaint_id: str) -> str:
        """The complaint as received, masked, with the units from the register. A reported source unit is unverified."""
        return DESK.read_complaint(complaint_id)

    @mcp.resource("sop://complaint", mime_type="text/markdown")
    def sop() -> str:
        """The building's complaint SOP: the steps, the handover reasons and the facts to collect by complaint type."""
        return SOP_TEXT

    @mcp.resource("rule://{code}", mime_type="text/plain")
    def rule(code: str) -> str:
        """One passage, with its document, number, page and effective date."""
        return DESK.read_rule(code)

    @mcp.tool()
    def search_rules(complaint_id: str, query: str, complaint_type: str = "") -> dict:
        """Search the building's documents for this complaint: the Strata Management Act 2013, the 2015 Regulations
        and their Third Schedule by-laws, the building's additional by-laws and house rules. Only approved documents
        in force on the complaint date are searched. Passages on the complaint type come first, in precedence order
        (Act, Regulations and Third Schedule, additional by-laws, house rules). Returns code, tier, document, number,
        title, page and text, plus the facts the SOP asks to collect for that complaint type. complaint_type is one of:
        noise, parking, pets, renovation, leakage, refuse, obstruction, facilities, visitors_access, moving,
        smoke_odour, damage_common_property, maintenance_repair, charges, penalty_query, compensation, dispute,
        management_conduct. status "empty" means no provision answers the query: a valid answer. search_unavailable
        is retryable. Only passages returned here or by get_rule may be cited."""
        return DESK.search_rules(complaint_id, query, complaint_type)

    @mcp.tool()
    def get_rule(complaint_id: str, code: str) -> dict:
        """Fetch one passage by its code, for example "BL-10", "ABL-2", "HR-1", "REG-57", "ACT-s61". Returns it
        with document, number, page and effective date, and makes it citable for this complaint. unknown_rule when
        no approved passage in force has that code."""
        return DESK.get_rule(complaint_id, code)

    @mcp.tool()
    def get_template(complaint_id: str, name: str) -> dict:
        """An approved reply template: acknowledge, request_facts, explain_rule or refer_to_manager. Returns its text
        with [placeholders] to fill."""
        return DESK.get_template(complaint_id, name)

    @mcp.tool()
    def submit_guidance(complaint_id: str, guidance: dict | str) -> dict:
        """Record the guidance for the admin officer. guidance: {"complaint_type", "facts_known": [..],
        "facts_missing": [..], "rules": [{"code", "quote" (word for word from the passage, or ""), "applies"}] (only
        the rules that apply to this complaint; a passage retrieved that does not apply is left out),
        "conflict": null or {"codes": [..], "governs", "why"}, "next_steps": [{"sop_step": "SOP-n", "action"}],
        "draft_reply": "...", "handover": null or {"reason", "summary", "urgency": "routine" | "today" | "now"},
        "answer": the answer to the officer's follow-up question, only when there is one}. A follow-up question is
        answered by submitting the whole guidance again with answer set. The office's sign-off is added in code.
        The guard checks every cited rule was retrieved for this complaint, every quote is word for word, no fine,
        penalty or payment amount the documents do not hold, no breach wording while facts are missing, each next
        step names an SOP step, the handover reason is from the list, and a conflict is resolved by precedence. It
        names each line that fails; two retries. The handover note is assembled in code from these fields."""
        if isinstance(guidance, str):
            try:
                guidance = json.loads(guidance)
            except json.JSONDecodeError as e:
                return {"tool": "submit_guidance", "status": "rejected", "data": None, "error": "missing_field",
                        "next_step": f"guidance must be a JSON object; it did not parse ({e.msg} at character {e.pos})."}
        return DESK.submit_guidance(complaint_id, guidance)

    # Load the embedding and rerank models before serving: loading them inside the
    # first tool call hung the stdio server on Windows (Fire Claim, 7 Nov 2026).
    if os.environ.get("STRATA_SEARCH_DOWN") != "1":
        try:
            DESK.search.retriever
        except SearchUnavailable as e:
            print(f"search not loaded: {e}", file=sys.stderr)
    mcp.run()
