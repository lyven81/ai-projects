"""
Intake, before any AI call: mask personal numbers, check for an emergency.

    mask       MyKad numbers keep only their last four digits; phone numbers
               keep only their last four digits. The masked text is the only
               text the model, the log and the replay ever see.
    emergency  fixed words that mean danger now. A match hands the complaint
               to the building manager at once, with no AI call.
"""
import re

MYKAD = re.compile(r"\b(\d{6})[-\s]?(\d{2})[-\s]?(\d{4})\b")
PHONE = re.compile(r"(?<!\d)(?:\+?6?0)1\d[-\s]?\d{3,4}[-\s]?(\d{4})(?!\d)")

EMERGENCY = [
    (re.compile(r"\bgushing\b", re.I), "water gushing"),
    (re.compile(r"\bflood(?:ing|ed)?\b(?!\s+(?:risk|insurance))", re.I), "flooding"),
    (re.compile(r"\bburst(?:ing)?\s+(?:water\s+)?pipe", re.I), "burst pipe"),
    (re.compile(r"\bfire\b(?!\s*(?:escape|exit|door|extinguisher|hose|route|alarm test|drill))", re.I), "fire"),
    (re.compile(r"\bsmoke alarm\b", re.I), "smoke alarm"),
    (re.compile(r"\b(?:trapped|stuck)\s+in\s+(?:the\s+)?lift\b|\blift entrapment\b", re.I), "lift entrapment"),
    (re.compile(r"\bcollaps(?:e|ed|ing)\b", re.I), "collapse"),
    (re.compile(r"\bgas leak", re.I), "gas leak"),
    (re.compile(r"\belectric(?:al)? shock\b|\bsparking\b", re.I), "electrical danger"),
]


def mask(text):
    t = MYKAD.sub(lambda m: f"******-**-{m.group(3)}", str(text or ""))
    t = PHONE.sub(lambda m: f"***-*** {m.group(1)}", t)
    return t


def has_personal_numbers(text):
    return bool(MYKAD.search(str(text or "")) or PHONE.search(str(text or "")))


def emergency(text):
    """The emergency words found, in a fixed order; empty when none."""
    found = []
    for pat, name in EMERGENCY:
        if pat.search(str(text or "")) and name not in found:
            found.append(name)
    return found
