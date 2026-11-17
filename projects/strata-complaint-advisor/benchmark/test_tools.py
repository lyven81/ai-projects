"""
No-key tests: every tool, every guard refusal, the intake and the scorer, run
with no API key before any paid run.

    python benchmark/test_tools.py
"""
import asyncio
import json
import os
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
sys.path.insert(0, str(BASE / "engine"))
sys.path.insert(0, str(BASE / "benchmark"))

import complaint_file  # noqa: E402
import intake  # noqa: E402
from mcp_server import EXHAUSTED, Desk  # noqa: E402
import run_benchmark as rb  # noqa: E402

DESK = Desk()
RESULTS = []


def test(fn):
    try:
        fn()
        RESULTS.append((fn.__name__, True, ""))
    except AssertionError as e:
        RESULTS.append((fn.__name__, False, str(e)))
    except Exception as e:
        RESULTS.append((fn.__name__, False, f"{type(e).__name__}: {e}"))
    return fn


def fresh(cid):
    DESK.read_intake(cid)
    return DESK.sessions[cid]


def good_guidance(**kw):
    g = {"complaint_type": "noise", "facts_known": ["Reported at 8.10 a.m."], "facts_missing": ["How long the music lasted"],
         "rules": [{"code": "BL-10(3)", "quote": "shall be kept at a low volume after 11.00 p.m.", "applies": "Quiet after 11 p.m."},
                   {"code": "HR-1", "quote": "", "applies": "Quiet hours 11 p.m. to 7 a.m."}],
         "conflict": None, "next_steps": [{"sop_step": "SOP-2", "action": "Ask for the time and duration."}],
         "draft_reply": "Dear Resident, thank you for your report. We will check it under by-law 10(3). Management Office, Amber Residences.",
         "handover": None}
    g.update(kw)
    return g


# ---------------------------------------------------------------- the tools
@test
def test_search_rules_returns_on_topic_rules():
    fresh("1")
    r = DESK.search_rules("1", "loud music late at night from the unit above", "noise")
    codes = [p["code"] for p in r["data"]["results"]]
    assert r["status"] == "ok" and r["tool"] == "search_rules", r
    assert "BL-10" in codes and "HR-1" in codes, codes
    assert "time" in " ".join(r["data"]["facts_to_collect"]), r["data"]["facts_to_collect"]
    assert set(r) >= {"tool", "status", "data", "error", "next_step"}


@test
def test_search_never_returns_draft_or_unapproved():
    fresh("2")
    r = DESK.search_rules("2", "wheel clamp release charge increased to RM 300", "parking")
    codes = [p["code"] for p in r["data"]["results"]]
    assert "HR-7" not in codes and "ABL-2" in codes, codes


@test
def test_search_empty_is_valid():
    fresh("1")
    r = DESK.search_rules("1", "recipe for chicken rice", "")
    assert r["status"] == "empty" and r["error"] is None and r["data"]["results"] == [], r


@test
def test_search_unavailable_is_retryable():
    os.environ["STRATA_SEARCH_DOWN"] = "1"
    try:
        d = Desk()
        d.read_intake("1")
        r = d.search_rules("1", "noise", "noise")
    finally:
        os.environ.pop("STRATA_SEARCH_DOWN")
    assert r["error"] == "search_unavailable" and r["retryable"] is True, r


@test
def test_precedence_act_before_bylaw_on_charges():
    fresh("14")
    r = DESK.search_rules("14", "sinking fund percentage of the maintenance charges", "charges")
    codes = [p["code"] for p in r["data"]["results"]]
    assert "ACT-s61" in codes and "ABL-8" in codes, codes
    assert codes.index("ACT-s61") < codes.index("ABL-8"), codes


@test
def test_get_rule_ok_and_unknown():
    fresh("1")
    r = DESK.get_rule("1", "BL-10(3)")
    assert r["status"] == "ok" and r["data"]["code"] == "BL-10" and r["data"]["page"] == "243", r
    assert "BL-10" in DESK.sessions["1"].retrieved
    assert DESK.get_rule("1", "BL-99")["error"] == "unknown_rule"
    assert DESK.get_rule("1", "HR-7")["error"] == "unknown_rule"          # draft, never citable


@test
def test_get_template_ok_unknown_not_approved():
    fresh("1")
    assert DESK.get_template("1", "request_facts")["status"] == "ok"
    assert DESK.get_template("1", "nonsense")["error"] == "unknown_template"
    assert DESK.get_template("1", "requested_fine_draft")["error"] == "template_not_approved"


@test
def test_unknown_complaint():
    assert DESK.search_rules("Z9", "noise", "noise")["error"] == "unknown_complaint"


# ---------------------------------------------------------------- the guard
def submit(cid, g, retrieve=("BL-10", "HR-1")):
    s = fresh(cid)
    for c in retrieve:
        DESK.get_rule(cid, c)
    return DESK.submit_guidance(cid, g), s


@test
def test_guard_records_good_guidance():
    r, s = submit("1", good_guidance())
    assert r["status"] == "recorded", r
    assert s.guidance is not None


@test
def test_guard_rule_not_retrieved():
    r, _ = submit("1", good_guidance(), retrieve=("BL-10",))
    assert r["error"] == "rule_not_retrieved", r


@test
def test_guard_code_named_in_reply_not_retrieved():
    r, _ = submit("1", good_guidance(draft_reply="Under ABL-9 a fine may follow. Management Office, Amber Residences."))
    assert any(f["error"] == "rule_not_retrieved" and f["line"] == "draft_reply" for f in r["faults"]), r


@test
def test_guard_quote_mismatch():
    g = good_guidance(rules=[{"code": "BL-10", "quote": "music must stop at 10 p.m.", "applies": "x"}, {"code": "HR-1", "applies": "y"}])
    r, _ = submit("1", g)
    assert r["error"] == "quote_mismatch", r


@test
def test_guard_unsupported_penalty():
    g = good_guidance(draft_reply="We will fine the unit RM 1,000 for this. Management Office, Amber Residences.")
    r, _ = submit("1", g)
    assert any(f["error"] == "unsupported_penalty" for f in r["faults"]), r


@test
def test_guard_amount_pattern_ignores_words():
    import guard
    assert guard.amounts_in("in the form, of a notice; RM 1,000 and ringgit fifty") == {1000.0, 50.0}
    g = good_guidance(draft_reply="We will inform, refund-free, the office of your report.")
    r, _ = submit("1", g)
    assert r["status"] == "recorded" or all(f["error"] != "bad_arguments" for f in r.get("faults", [])), r


@test
def test_guard_supported_amount_passes():
    g = good_guidance(complaint_type="parking", facts_missing=[],
                      rules=[{"code": "ABL-2", "quote": "The charge for the release of a wheel clamp is RM 100", "applies": "x"}],
                      draft_reply="The clamp release charge is RM 100 under additional by-law 2, and no fine is decided yet. Management Office, Amber Residences.")
    r, _ = submit("2", g, retrieve=("ABL-2",))
    assert r["status"] == "recorded", r


@test
def test_guard_breach_before_facts():
    g = good_guidance(draft_reply="Your neighbour has breached by-law 10(3). Management Office, Amber Residences.")
    r, _ = submit("1", g)
    assert any(f["error"] == "breach_before_facts" for f in r["faults"]), r


@test
def test_guard_unknown_sop_step():
    r, _ = submit("1", good_guidance(next_steps=[{"sop_step": "SOP-12", "action": "Call the police."}]))
    assert r["error"] == "unknown_sop_step", r


@test
def test_guard_invalid_handover_reason():
    r, _ = submit("1", good_guidance(handover={"reason": "angry_resident", "summary": "x", "urgency": "today"}))
    assert r["error"] == "invalid_handover_reason", r


@test
def test_guard_precedence_conflict():
    base = dict(complaint_type="charges", facts_missing=[],
                rules=[{"code": "ACT-s61", "quote": "", "applies": "Not less than 10%."}, {"code": "ABL-8", "quote": "", "applies": "6%."}],
                draft_reply="Under section 61(3) of the Act the sinking fund is not less than 10% of the charges. Management Office, Amber Residences.")
    bad = good_guidance(conflict={"codes": ["ACT-s61", "ABL-8"], "governs": "ABL-8", "why": "x"}, **base)
    r, _ = submit("14", bad, retrieve=("ACT-s61", "ABL-8"))
    assert r["error"] == "precedence_mismatch", r
    ok = good_guidance(conflict={"codes": ["ACT-s61(3)", "ABL-8(2)"], "governs": "ACT-s61", "why": "The Act governs."}, **base)
    r, _ = submit("14", ok, retrieve=("ACT-s61", "ABL-8"))
    assert r["status"] == "recorded", r


@test
def test_guard_missing_field():
    r, _ = submit("1", good_guidance(complaint_type="gossip", draft_reply=""))
    assert r["error"] == "missing_field", r


@test
def test_guard_retries_exhausted_after_two_retries():
    s = fresh("1")
    bad = good_guidance(next_steps=[{"sop_step": "SOP-99", "action": "x"}])
    outs = [DESK.submit_guidance("1", bad) for _ in range(3)]
    assert outs[0]["retries_left"] == 2 and outs[1]["retries_left"] == 1, outs[:2]
    assert outs[2]["error"] == "retries_exhausted" and outs[2]["message"] == EXHAUSTED, outs[2]
    assert DESK.submit_guidance("1", good_guidance())["error"] == "retries_exhausted"
    assert s.guidance is None


@test
def test_follow_up_resubmission_checked_again():
    r, s = submit("1", good_guidance())
    assert r["status"] == "recorded"
    r2 = DESK.submit_guidance("1", good_guidance(answer="A fine of RM 500 will be imposed."))
    assert any(f["error"] == "unsupported_penalty" and f["line"] == "answer" for f in r2["faults"]), r2


@test
def test_guard_promised_outcome():
    r, _ = submit("1", good_guidance(draft_reply="Dear Resident, your neighbour will be fined for this."))
    assert any(f["error"] == "promised_outcome" for f in r["faults"]), r
    r, _ = submit("1", good_guidance(draft_reply="Dear Resident, we will refund you once checked."))
    assert any(f["error"] == "promised_outcome" for f in r["faults"]), r


@test
def test_guard_names_other_party():
    r, _ = submit("1", good_guidance(draft_reply="Dear Resident, we will speak to B-13-05 about the music."))
    assert any(f["error"] == "names_other_party" for f in r["faults"]), r


@test
def test_sign_off_added_in_code():
    r, s = submit("1", good_guidance(draft_reply="Dear Resident, thank you for your report."))
    assert r["status"] == "recorded" and s.guidance["draft_reply"].endswith("Management Office, Amber Residences"), s.guidance
    r, s = submit("1", good_guidance())
    assert s.guidance["draft_reply"].count("Management Office, Amber Residences") == 1, s.guidance


@test
def test_bad_arguments_come_back_as_result():
    fresh("1")
    r = DESK.submit_guidance("1", {"complaint_type": "noise", "rules": [{"code": "BL-10"}], "next_steps": [{"sop_step": "SOP-2", "action": "x"}],
                                   "draft_reply": "x", "conflict": "BL-10 versus HR-1"})
    assert r["status"] in ("rejected", "error") and r["error"], r


# ---------------------------------------------------------------- intake
@test
def test_masking_mykad_and_phone():
    for cid, raw_no in (("9", "580315-10-6634"), ("1", "012-345 6789"), ("H2", "019-876 5432")):
        rec = complaint_file.intake_record(cid)
        assert rec["masked"] and raw_no not in rec["text"] + rec["facts"], (cid, rec["text"])
        assert raw_no not in complaint_file.render(cid)
        assert not intake.has_personal_numbers(complaint_file.render(cid)), cid
    assert "6634" in complaint_file.intake_record("9")["text"]


@test
def test_emergency_only_on_h4():
    hits = {cid: complaint_file.intake_record(cid)["emergency"] for cid in complaint_file.ids()}
    assert hits["H4"], hits["H4"]
    assert not [c for c, v in hits.items() if v and c != "H4"], hits
    assert intake.emergency("Please do not block the fire escape") == []
    assert intake.emergency("my neighbour's unit is on fire") == ["fire"]


@test
def test_emergency_handover_note_written_in_code():
    rec = DESK.read_intake("H4")
    note = rec["handover_note"]
    assert note["reason"] == "emergency" and note["urgency"] == "now" and note["recipient"] == "building manager", note
    assert set(note) >= {"reason", "complaint_summary", "facts_collected", "facts_missing", "rules_cited", "steps_suggested", "urgency"}


@test
def test_handover_note_assembled_from_guidance():
    g = good_guidance(handover={"reason": "penalty_not_authorised", "summary": "Resident asks for a fine.", "urgency": "routine"})
    r, s = submit("H1", g)
    n = r["data"]["handover_note"]
    assert r["status"] == "recorded" and n["reason"] == "penalty_not_authorised", r
    assert n["facts_missing"] == g["facts_missing"] and n["steps_suggested"][0].startswith("SOP-2"), n
    assert n["rules_cited"][0].startswith("BL-10(3) (by-law 10"), n


@test
def test_emergency_makes_no_model_call():
    from agent import run_case

    class Content:
        def __init__(self, t):
            self.text = t

    class R:
        def __init__(self, t):
            self.contents = [Content(t)]

    class FakeMCP:
        async def read_resource(self, uri):
            cid = str(uri).split("//")[1].split("/")[0]
            return R(json.dumps(DESK.read_intake(cid)))

    class NoClient:
        class messages:
            @staticmethod
            async def create(**kw):
                raise AssertionError("a model was called on an emergency")

    res = asyncio.run(run_case(FakeMCP(), NoClient(), "claude-haiku-5-5", "H4", []))
    assert res["outcome"] == "emergency_handover" and res["model_calls"] == 0, res


# ---------------------------------------------------------------- the scorer
CASES = {c["id"]: c for c in json.loads((BASE / "benchmark" / "cases.json").read_text(encoding="utf-8"))["cases"]}


def log_with(guidance, tools=("search_rules", "submit_guidance"), intake_rec=None):
    log = [{"kind": "intake", "result": intake_rec or {"masked": False, "emergency": []}}]
    for t in tools:
        r = {"status": "ok"}
        if t == "submit_guidance":
            r = {"status": "recorded"}
        log.append({"kind": "tool", "name": t, "args": {"guidance": guidance} if t == "submit_guidance" else {}, "result": r})
    return log


@test
def test_score_tools():
    exp = CASES["1"]["expect"]
    assert rb.score_tools(exp, rb.replay(log_with({})))
    assert not rb.score_tools(exp, rb.replay(log_with({}, tools=("submit_guidance",))))


@test
def test_score_recorded():
    exp = CASES["1"]["expect"]
    assert rb.score_recorded(exp, rb.replay(log_with(good_guidance())))
    assert not rb.score_recorded(exp, rb.replay(log_with(good_guidance(), tools=("search_rules",))))


@test
def test_score_type():
    assert rb.score_type(CASES["1"]["expect"], rb.replay(log_with(good_guidance())))
    assert not rb.score_type(CASES["1"]["expect"], rb.replay(log_with(good_guidance(complaint_type="pets"))))


@test
def test_score_rules():
    exp = CASES["1"]["expect"]
    assert rb.score_rules(exp, rb.replay(log_with(good_guidance())))
    assert not rb.score_rules(exp, rb.replay(log_with(good_guidance(rules=[{"code": "BL-10"}]))))


@test
def test_score_not_cited():
    exp = CASES["2"]["expect"]
    assert not rb.score_not_cited(exp, rb.replay(log_with(good_guidance(rules=[{"code": "HR-7"}]))))
    assert rb.score_not_cited(exp, rb.replay(log_with(good_guidance())))


@test
def test_score_handover():
    exp = CASES["H1"]["expect"]
    assert rb.score_handover(exp, rb.replay(log_with(good_guidance(handover={"reason": "penalty_not_authorised"}))))
    assert not rb.score_handover(exp, rb.replay(log_with(good_guidance())))
    assert rb.score_handover(CASES["1"]["expect"], rb.replay(log_with(good_guidance())))
    h4 = rb.replay(log_with(None, tools=(), intake_rec={"masked": False, "emergency": ["water gushing"]}))
    assert rb.score_handover(CASES["H4"]["expect"], h4)


@test
def test_score_facts_missing():
    exp = CASES["5"]["expect"]
    assert rb.score_facts_missing(exp, rb.replay(log_with(good_guidance())))
    assert not rb.score_facts_missing(exp, rb.replay(log_with(good_guidance(facts_missing=[]))))


@test
def test_score_conflict():
    exp = CASES["14"]["expect"]
    assert rb.score_conflict(exp, rb.replay(log_with(good_guidance(conflict={"codes": ["ACT-s61", "ABL-8"], "governs": "ACT-s61(3)"}))))
    assert not rb.score_conflict(exp, rb.replay(log_with(good_guidance(conflict=None))))


@test
def test_score_masking():
    exp = CASES["9"]["expect"]
    assert rb.score_masking(exp, log_with(good_guidance()))
    assert not rb.score_masking(exp, log_with(good_guidance(facts_known=["IC 580315-10-6634"])))


@test
def test_score_no_model_call():
    exp = CASES["H4"]["expect"]
    assert rb.score_no_model_call(exp, {"model_calls": 0})
    assert not rb.score_no_model_call(exp, {"model_calls": 1})


@test
def test_score_case_pass_overall():
    s = rb.score_case(CASES["1"], log_with(good_guidance()), {"model_calls": 3})
    assert s["pass"], s


if __name__ == "__main__":
    ok = sum(1 for _, p, _ in RESULTS if p)
    for name, p, msg in RESULTS:
        print(("PASS " if p else "FAIL ") + name + ("" if p else f"  {msg[:300]}"))
    print(f"\n{ok} passed, {len(RESULTS) - ok} failed")
    out = BASE / "benchmark" / "results" / "no_key_tests.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps([{"test": n, "pass": p, "message": m} for n, p, m in RESULTS], indent=1), encoding="utf-8")
    sys.exit(0 if ok == len(RESULTS) else 1)
