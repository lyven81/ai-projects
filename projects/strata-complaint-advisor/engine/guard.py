"""
The submit_guidance guard: the guidance is checked in code before it is shown.

    missing_field            complaint type, rules, next steps or draft reply absent or of the wrong shape
    rule_not_retrieved       a cited rule that search_rules or get_rule did not return for this complaint
    quote_mismatch           a quote that is not word for word in the passage it is cited to
    unsupported_penalty      a fine, penalty, payment or compensation amount in the reply or the next steps
                             that no retrieved passage contains
    breach_before_facts      breach wording ("has breached", "violated") while facts are still missing
    unknown_sop_step         a next step tied to no step of the complaint SOP
    invalid_handover_reason  a handover reason outside the fixed list
    precedence_mismatch      a conflict resolved in favour of a lower document than the one that governs

Each fault names the line that failed, so the retry fixes that line. Two
retries; a third rejection is retries_exhausted and no guidance is shown.

Built on the Fire Claim Examiner guard (quote and citation checks kept).
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
RULES = json.loads((BASE / "rules" / "sop_steps.json").read_text(encoding="utf-8"))
SOP_STEPS = set(RULES["steps"])
HANDOVER_REASONS = set(RULES["handover_reasons"])
MAX_RETRIES = 2
PRECEDENCE = {"act": 0, "regulations": 1, "third_schedule": 1, "building_bylaw": 2, "house_rule": 3}

from retrieval import COMPLAINT_TYPES  # noqa: E402

PENALTY_WORDS = re.compile(r"\b(fine[ds]?|fining|penalt\w*|compensat\w*|refund\w*|reimburs\w*|pay you|paid to you|"
                           r"damages|surcharge)\b", re.I)
AMOUNT = re.compile(r"\bRM\s?(\d[\d,]*(?:\.\d{1,2})?)")   # "RM 1,000", never the "rm" of "form,"
BREACH = re.compile(r"\b(has breached|have breached|breached|is in breach|are in breach|in breach of|violat\w+|"
                    r"guilty|offender|has broken|broke the rule)\b", re.I)
CODE_IN_TEXT = re.compile(r"\b(?:BL|ABL|HR|REG)-\d+\b|\bACT-(?:s\d+|SCH4)\b")
WORD_NUM = {"fifty": 50, "one hundred": 100, "two hundred": 200, "three hundred": 300, "one thousand": 1000,
            "two hundred and fifty thousand": 250000}


def norm(t):
    t = str(t or "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", t).strip().strip('"').strip()


def amounts_in(text):
    """Every ringgit amount a passage states, in figures or in words."""
    t = str(text)
    out = {float(m.group(1).replace(",", "")) for m in AMOUNT.finditer(t)}
    low = t.lower()
    for w, n in sorted(WORD_NUM.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{w} ringgit\b|\bringgit {w}\b", low):
            out.add(float(n))
    return out


def sentences(text):
    return [s for s in re.split(r"(?<=[.!?])\s+|\n+", str(text or "")) if s.strip()]


SIGN_OFF = "Management Office, Amber Residences"
PROMISE = re.compile(r"\b(?:will|shall|is going to|are going to|we'll)\s+(?:be\s+)?(?:fined?|penali[sz]ed|refund\w*|"
                     r"compensat\w*|reimburs\w*|pay you|pay for your|clamp\w*|tow\w*|evict\w*)\b", re.I)


def sign(reply):
    """The office's sign-off, added in code."""
    r = str(reply or "").rstrip()
    return r if r.rstrip(".").endswith(SIGN_OFF) else f"{r}\n\n{SIGN_OFF}"


def check(g, session, complaint=None):
    """g: the guidance; session: .retrieved {code: passage}; complaint: the raw complaint. Returns a list of faults."""
    from rule_search import base_code
    faults = []

    def fault(err, line, msg):
        faults.append({"error": err, "line": line, "message": msg})

    if not isinstance(g, dict):
        return [{"error": "missing_field", "line": "guidance", "message": "guidance must be an object."}]
    if g.get("complaint_type") not in COMPLAINT_TYPES:
        fault("missing_field", "complaint_type", f"complaint_type must be one of: {', '.join(COMPLAINT_TYPES)}.")
    if not str(g.get("draft_reply") or "").strip():
        fault("missing_field", "draft_reply", "Give the draft reply to the resident.")
    steps = g.get("next_steps")
    if not isinstance(steps, list) or not steps:
        fault("missing_field", "next_steps", "Give at least one next step, each with its sop_step.")
        steps = []
    rules = g.get("rules") if isinstance(g.get("rules"), list) else []
    if g.get("rules") is not None and not isinstance(g.get("rules"), list):
        fault("missing_field", "rules", "rules must be a list of {code, quote, applies}.")
    missing = g.get("facts_missing") or []

    # every cited rule retrieved for this complaint; every quote word for word
    for i, r in enumerate(rules):
        if not isinstance(r, dict) or not r.get("code"):
            fault("missing_field", f"rules[{i}]", "Each rule needs a code.")
            continue
        code = base_code(r["code"])
        p = session.retrieved.get(code)
        if not p:
            fault("rule_not_retrieved", f"rules[{i}].code",
                  f"{r['code']} was not returned by search_rules or get_rule for this complaint. Cite only rules retrieved for it.")
            continue
        q = norm(r.get("quote"))
        if q and q not in norm(p["text"]):
            holders = [c for c, x in session.retrieved.items() if q in norm(x["text"])]
            where = f" It is in {', '.join(holders)}." if holders else ""
            fault("quote_mismatch", f"rules[{i}].quote",
                  f"The quote is not word for word in {code}: \"{q[:80]}\".{where} Quote the passage exactly, or leave quote empty.")

    # no amount of fine, penalty or payment unless a retrieved passage states it
    known = set()
    for p in session.retrieved.values():
        known |= amounts_in(p["text"])
    texts = [("draft_reply", g.get("draft_reply")), ("answer", g.get("answer"))] + [(f"next_steps[{i}].action", (s or {}).get("action") if isinstance(s, dict) else s)
                                                       for i, s in enumerate(steps)]
    for line, text in texts:
        for s in sentences(text):
            if not PENALTY_WORDS.search(s):
                continue
            for m in AMOUNT.finditer(s):
                v = float(m.group(1).replace(",", ""))
                if v not in known:
                    fault("unsupported_penalty", line,
                          f"RM {m.group(1)} is named with a fine, penalty or payment, but no retrieved passage states it. "
                          "Name no amount the documents do not hold.")

    # a passage code named in the reply or the follow-up answer must be one retrieved for this complaint
    for line, text in texts[:2]:
        for m in CODE_IN_TEXT.finditer(str(text or "")):
            if base_code(m.group(0)) not in session.retrieved:
                fault("rule_not_retrieved", line,
                      f"{m.group(0)} is named but was not returned by search_rules or get_rule for this complaint.")

    # the reply promises no fine, payment or enforcement, and names no other resident's unit
    m = PROMISE.search(str(g.get("draft_reply") or ""))
    if m:
        fault("promised_outcome", "draft_reply",
              f"\"{m.group(0)}\" promises an outcome. The office decides enforcement and payment after verifying; "
              "say what will be checked instead.")
    src = (complaint or {}).get("source_unit")
    if src and src in str(g.get("draft_reply") or ""):
        fault("names_other_party", "draft_reply",
              f"The reply names the reported unit {src}. Describe the report without naming the other resident.")

    # no breach wording while facts are missing: a complaint is an allegation
    if missing:
        for line, text in texts:
            m = BREACH.search(str(text or ""))
            if m:
                fault("breach_before_facts", line,
                      f"\"{m.group(0)}\" treats the complaint as a proven breach while facts are still missing. "
                      "Describe what was reported and what will be checked.")

    for i, s in enumerate(steps):
        sop = (s or {}).get("sop_step") if isinstance(s, dict) else None
        if sop not in SOP_STEPS:
            fault("unknown_sop_step", f"next_steps[{i}].sop_step",
                  f"'{sop}' is not a step of the complaint SOP. Use one of {', '.join(sorted(SOP_STEPS))}.")

    h = g.get("handover")
    if h:
        if not isinstance(h, dict) or h.get("reason") not in HANDOVER_REASONS:
            reason = h.get("reason") if isinstance(h, dict) else h
            fault("invalid_handover_reason", "handover.reason",
                  f"'{reason}' is not a handover reason. Use one of {', '.join(sorted(HANDOVER_REASONS))}, or no handover.")

    c = g.get("conflict")
    if c:
        codes = [base_code(x) for x in (c.get("codes") or [])] if isinstance(c, dict) else []
        gov = base_code(c.get("governs")) if isinstance(c, dict) and c.get("governs") else None
        tiers = {x: session.retrieved[x]["tier"] for x in codes if x in session.retrieved}
        if len(codes) < 2 or not gov or gov not in codes or len(tiers) < len(codes):
            fault("precedence_mismatch", "conflict",
                  "A conflict names at least two retrieved codes and the one that governs, which must be among them.")
        else:
            top = min(PRECEDENCE.get(t, 9) for t in tiers.values())
            if PRECEDENCE.get(tiers[gov], 9) != top:
                want = [x for x, t in tiers.items() if PRECEDENCE.get(t, 9) == top]
                fault("precedence_mismatch", "conflict.governs",
                      f"{gov} cannot govern: {', '.join(want)} ranks higher (the Act, then the Regulations and the "
                      "Third Schedule, then the additional by-laws, then the house rules).")
    return faults
