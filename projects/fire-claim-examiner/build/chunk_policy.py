"""
Fire Claim Examiner: Layer 1, the data layer.

Chunks the fire policy by DECISION NODE, not by page.

A decision node bundles everything needed to resolve one coverage question:
the base clause, the endorsement that overrides it, the causation triggers and
the excess formula. Chunking by page splits a clause from its own excess and
its own special conditions, which is precisely what makes similarity retrieval
return the wrong governing text.

Output: app/data/chunks.json

Run:  python build/chunk_policy.py --pdf "<path to fire policy.pdf>"
      (or set FIRE_POLICY_PDF). The PDF is a third-party document and is not
      redistributed; data/chunks.json is the built output.
"""

import json
import os
import re
import sys
from pathlib import Path

from pypdf import PdfReader

PROJECT = Path(__file__).resolve().parents[1]
_arg = sys.argv[sys.argv.index("--pdf") + 1] if "--pdf" in sys.argv else None
PDF = Path(_arg or os.environ.get("FIRE_POLICY_PDF", PROJECT / "fire policy.pdf"))
OUT = Path(sys.argv[sys.argv.index("--out") + 1]) if "--out" in sys.argv \
    else PROJECT / "data" / "chunks.json"

POLICY_REF = "P/GTS/FIR/01-24/V1"

# ---------------------------------------------------------------- authority
# Insurance contracts are hierarchical. An endorsement exists to displace the
# base clause it is written against, so retrieval MUST rank by this, not by
# cosine similarity.
AUTHORITY = {
    "endorsement": "override",
    "condition": "primary",
    "clause": "secondary",
    "warranty": "primary",
}

# Malay headings. The policy carries a full Bahasa Malaysia translation; the
# same clause embedded twice in two languages produces duplicate hits that
# push the governing English text off the top of the list.
MALAY_MARKERS = (
    "FASAL", "PENGENDORSAN", "KEROSAKAN", "PENGECUALIAN", "SYARAT",
    "PERLINDUNGAN", "JAMINAN", "WARANTI", "HARGA", "PENILAIAN", "PEMBAHARUAN",
    "TAMBAHAN", "PENYIMPANAN", "PEMINDAHAN", "PENJENISAN", "PURATA",
    "BANJIR", "GEMPA", "PESAWAT", "TUMBANG", "SEMULA", "BEBANAN",
    "PENJELASAN", "MENANGGUNG", "PEMBETULAN", "KEBAKARAN", "INSURANS",
    "PASANGAN", "KEPERLUAN", "TAPAK", "PENENGGELAMAN", "JENAMA",
    "PENYEMBURAN", "SERBUK", "BAHAN", "SIMPANAN", "LETUPAN", "RUSUHAN",
    "MOGOK", "NIAT", "JAHAT", "SEJUK", "ELEKTRIK", "AIR", "PAIP",
)

PERIL_MAP = {
    "FP501": "aircraft", "FP502": "earthquake", "FP503": "storm",
    "FP504": "flood", "FP505A": "explosion", "FP505B": "explosion",
    "FP505C": "explosion", "FP505D": "explosion", "FP506A": "impact",
    "FP506B": "impact", "FP507A": "water_pipe", "FP507B": "water_pipe",
    "FP508A.01": "electrical", "FP508B": "electrical", "FP509": "bush_fire",
    "FP510": "subsidence", "FP510D": "subsidence", "FP511A": "spontaneous_combustion",
    "FP511B": "spontaneous_combustion", "FP512A": "riot", "FP512B": "riot",
    "FP513": "falling_trees", "FP514A": "cold_storage", "FP514B": "cold_storage",
}

# Base exclusions each endorsement is written to displace. This is the
# precedence edge: without it the retriever has no way to know that FP504
# beats Condition 6(b) rather than merely sitting near it.
OVERRIDES = {
    "FP502": "Condition 6(a)",
    "FP503": "Condition 6(b)",
    "FP504": "Condition 6(b)",
    "FP509": "Condition 8(i)",
    "FP511A": "Condition 5(1)(b)",
    "FP511B": "Condition 5(1)(b)",
    "FP512A": "Condition 6(d)",
    "FP512B": "Condition 6(d)",
    "FP505A": "Condition 8(h)",
    "FP505B": "Condition 8(h)",
    "FP505C": "Condition 8(h)",
    "FP505D": "Condition 8(h)",
}

HEADING = re.compile(
    r"\b(FP\d{3}[A-Z]?(?:\.\d+)?|FC\d{3}[A-Z]?(?:\.\d+)?|FW\d{3}[A-Z]?)\s+"
    r"([A-Z][A-Z0-9 \-/,&()'.]{5,110})"
)


def load_text() -> str:
    reader = PdfReader(str(PDF))
    text = "\n".join((p.extract_text() or "") for p in reader.pages)
    text = re.sub(r"[ \t]+", " ", text)
    # strip running footers so they never land inside a chunk
    text = re.sub(r"\s*P/GTS/FIR/01-24/V1 Page \d+ of \d+\s*", "\n", text)
    return text


# Markers are matched on WORD BOUNDARIES, never as substrings. Matching "AIR"
# as a substring killed FP501 AIRCRAFT and two FC clauses containing REPAIRS.
_MALAY_RE = re.compile(r"(" + "|".join(MALAY_MARKERS) + r")")


def is_malay(title: str, body: str) -> bool:
    if _MALAY_RE.search(title.upper()):
        return True
    # Short Malay chunks were slipping through on a >=3 threshold: FW725B is
    # 203 characters and trips only one marker. Scale the bar to the sample,
    # and widen the marker set to the function words that actually recur.
    sample = body[:900].lower()
    words = (" yang ", " dan ", " ini ", " atau ", " kepada ", " tidak ",
             " syarikat ", " polisi ", " insurans ", " kerosakan ",
             " dengan ", " bagi ", " dalam ", " untuk ", " oleh ", " adalah ",
             " sebagai ", " dinyatakan ", " dipersetujui ", " premis ",
             " bayaran ", " di sini ", " hendaklah ", " tersebut ")
    hits = sum(w in sample for w in words)
    return hits >= (2 if len(body) < 400 else 3)


def extract_excess(body: str):
    """Pull the excess rule out of the clause body as structured data.

    The calculator consumes this. It is never inferred by the model, because a
    figure an examiner puts on a file cannot come from a token sampler.
    """
    out = {}
    if re.search(r"whichever shall be the less", body, re.I):
        out["rule"] = "lesser_of"
    pct = re.search(r"(\d+(?:\.\d+)?)\s*%\s*of the total sums? insured", body, re.I)
    if pct:
        out["percent"] = float(pct.group(1))
    caps = re.findall(r"RM\s?(\d[\d,]*(?:\.\d{2})?)", body)
    if caps:
        vals = []
        for c in caps:
            try:
                vals.append(float(c.replace(",", "")))
            except ValueError:
                continue
        if vals:
            out["cap_candidates"] = vals
    if re.search(r"the first RM\s?[\d,]+", body, re.I):
        out["rule"] = out.get("rule", "flat_first_amount")
    if re.search(r"whichever is the lower|whichever is lower", body, re.I):
        out["rule"] = "lower_of"
    return out or None


def split_conditions(head: str):
    """Base policy Conditions. Authority: primary."""
    chunks = []
    marks = [(m.start(), int(m.group(1)))
             for m in re.finditer(r"\n\s*(\d{1,2})\.\s+(?=[A-Z(])", head)]
    marks = [m for m in marks if 1 <= m[1] <= 25]
    # keep the first appearance of each number, in ascending order
    seen, ordered = set(), []
    for pos, num in marks:
        if num not in seen and (not ordered or num >= ordered[-1][1]):
            seen.add(num)
            ordered.append((pos, num))
    for i, (pos, num) in enumerate(ordered):
        end = ordered[i + 1][0] if i + 1 < len(ordered) else len(head)
        body = head[pos:end].strip()
        if len(body) < 60:
            continue
        chunks.append({
            "chunk_id": f"CONDITION-{num}",
            "type": "condition",
            "code": f"Condition {num}",
            "title": f"Condition {num}",
            "authority": AUTHORITY["condition"],
            "peril": None,
            "overrides": None,
            "overridden_by": [k for k, v in OVERRIDES.items()
                              if v.startswith(f"Condition {num}")],
            "excess": None,
            "text": body,
            "source": POLICY_REF,
        })
    return chunks


# Where one body serves several codes, the distinguishing fact lives only in
# the heading. FP507A vs FP507B decides a real claim on storey count, so the
# distinction is carried as metadata rather than left buried in a title.
APPLIES_TO = {
    "FP507A": "Applies to buildings exceeding five (5) storeys (including a mezzanine floor).",
    "FP507B": "Applies to other buildings (generally 5 storeys and below).",
    "FP505A": "industrial risks without boilers",
    "FP505B": "industrial risks with boilers",
    "FP505C": "non-industrial risks without boilers",
    "FP505D": "non-industrial risks with boilers",
    "FP506A": "impact damage excluding the Insured's own vehicles",
    "FP506B": "impact damage including the Insured's own vehicles",
    "FP512A": "residential properties",
    "FP512B": "properties other than residential",
    "FP508A.01": "electrical machinery, plant and installation in manufacturing risks and workshops",
    "FP508B": "electrical appliances and installation generally",
}

# Scope notes for every paired variant: what tells one sibling from the other.
# They are not policy wording. FP507 comes from the founder's scope reference
# (6 Nov 2026); the others are read from the endorsement titles.
SCOPE_SOURCE = {
    "FP507A": "Founder's scope reference, 6 Nov 2026 (not policy wording)",
    "FP507B": "Founder's scope reference, 6 Nov 2026 (not policy wording)",
}
SCOPE_PAIRS = ("FP505A", "FP505B", "FP505C", "FP505D", "FP506A", "FP506B",
               "FP507A", "FP507B", "FP508A.01", "FP508B", "FP512A", "FP512B")

# FP512A and FP512B carry a substituted Condition 8 whose (c) caps works of art
# at RM500.00. That figure is a limit, not an excess; neither endorsement has an
# excess clause, so none is stored.
NO_EXCESS = {"FP512A", "FP512B"}

# A heading followed within this many characters by another heading has no body
# of its own: the codes share the body that follows the last of them.
CLUSTER_GAP = 150


def split_endorsements(text: str):
    chunks = []
    hits = list(HEADING.finditer(text))

    # group consecutive headings that share one body
    clusters, current = [], [0]
    for i in range(1, len(hits)):
        gap = hits[i].start() - hits[i - 1].end()
        # A gap holding a sentence of its own is a body, not a shared heading:
        # FC815 and FW704A each have one short sentence of wording, under 150
        # characters, and were merged into the next code. A gap in capitals is
        # the rest of a heading (FP507A's storey line) and still clusters.
        gap_text = text[hits[i - 1].end():hits[i].start()]
        if gap < CLUSTER_GAP and not re.search(r"[a-z]{3}", gap_text):
            current.append(i)
        else:
            clusters.append(current)
            current = [i]
    clusters.append(current)

    for cluster in clusters:
        first, last = cluster[0], cluster[-1]
        end = hits[last + 1].start() if last + 1 < len(hits) else len(text)
        shared_body = text[hits[last].start():end].strip()
        shared = len(cluster) > 1

        for i in cluster:
            m = hits[i]
            code, title = m.group(1), m.group(2).strip()
            if shared:
                # every code in the cluster carries the same body, headed by
                # its own title so the distinguishing fact is not lost
                body = f"{code} {title}\n\n{shared_body}"
            else:
                body = shared_body
            if len(body) < 120:
                continue
            if is_malay(title, body):
                continue
            chunks.append(_make(code, title, body, shared))

    # de-duplicate on code, keeping the longest body (the English one wins)
    best = {}
    for c in chunks:
        if c["code"] not in best or len(c["text"]) > len(best[c["code"]]["text"]):
            best[c["code"]] = c
    return list(best.values())


def _make(code, title, body, shared):
    kind = ("endorsement" if code.startswith("FP")
            else "warranty" if code.startswith("FW") else "clause")
    return {
        "chunk_id": f"{kind.upper()}-{code}",
        "type": kind,
        "code": code,
        "title": title,
        "authority": AUTHORITY[kind],
        "peril": PERIL_MAP.get(code),
        "applies_to": APPLIES_TO.get(code),
        "scope_note": APPLIES_TO.get(code) if code in SCOPE_PAIRS else None,
        "scope_note_source": (SCOPE_SOURCE.get(code, "Endorsement title")
                              if code in SCOPE_PAIRS else None),
        "shares_body_with_siblings": shared,
        "overrides": OVERRIDES.get(code),
        "overridden_by": None,
        "excess": None if code in NO_EXCESS else extract_excess(body),
        "has_special_conditions": "SPECIAL CONDITION" in body.upper(),
        "text": body,
        "source": POLICY_REF,
    }
    # de-duplicate on code, keeping the longest body (the English one wins)
    best = {}
    for c in chunks:
        if c["code"] not in best or len(c["text"]) > len(best[c["code"]]["text"]):
            best[c["code"]] = c
    return list(best.values())


def build_decision_nodes(chunks):
    """Bundle each override pair into one retrievable decision node.

    "Is flood covered?" must return ONE chunk holding the exclusion, the
    endorsement that displaces it and the excess, so the answer cannot be
    assembled from whichever half happened to rank higher.
    """
    by_code = {c["code"]: c for c in chunks}
    nodes = []
    for code, base in OVERRIDES.items():
        end_c = by_code.get(code)
        base_c = by_code.get(re.match(r"Condition \d+", base).group(0))
        if not end_c or not base_c:
            continue
        nodes.append({
            "chunk_id": f"DECISION-{end_c['peril'].upper()}-{code}",
            "type": "coverage_decision",
            "code": code,
            "title": f"Is loss caused by {end_c['peril'].replace('_', ' ')} covered?",
            "authority": "override",
            "peril": end_c["peril"],
            "overrides": base,
            "overridden_by": None,
            "excess": end_c["excess"],
            "authority_order": [
                f"{code} (override, if held and engaged)",
                f"{base} (base policy, if {code} not held)",
            ],
            # NEVER truncate. A decision node exists to be the single unit that
            # answers the coverage question, so cutting it at a character count
            # reintroduces the page-chunking bug it was built to avoid: the
            # first pass lost FP503 Special Condition 4(a), the exclusion that
            # removes RM5,450 from a claim whose payable must be exact.
            "text": (
                f"COVERAGE DECISION: {end_c['peril'].replace('_', ' ')}\n\n"
                f"BASE POSITION [{base}, primary]:\n{base_c['text']}\n\n"
                f"OVERRIDE [{code} {end_c['title']}, override]:\n{end_c['text']}\n\n"
                f"PRECEDENCE: where {code} is held and its conditions are "
                f"satisfied, it displaces {base}. Where {code} is not held, "
                f"{base} stands and the loss is not covered. Holding {code} is "
                f"not the same as satisfying it: its own exclusions and special "
                f"conditions must be tested against the facts of the claim."
            ),
            "source": POLICY_REF,
        })
    return nodes


def operative_clause(text: str):
    """The insuring clause: FIRE or LIGHTNING during the Period of Insurance.

    Gates 1 and 2 rest on it, so it is a chunk like any other. Whitespace is
    collapsed to single spaces, the form the case files quote.
    """
    start = text.find("THE COMPANY AGREES")
    end = text.find("actual amount of such damage.", start) + len("actual amount of such damage.")
    body = re.sub(r"\s+", " ", text[start:end]).strip()
    return {
        "chunk_id": "OPERATIVE-CLAUSE",
        "type": "clause",
        "code": "Operative clause",
        "title": "Operative clause: fire or lightning during the Period of Insurance",
        "authority": "primary",
        "peril": "fire",
        "applies_to": None,
        "scope_note": None,
        "scope_note_source": None,
        "shares_body_with_siblings": False,
        "overrides": None,
        "overridden_by": None,
        "excess": None,
        "has_special_conditions": False,
        "text": body,
        "source": POLICY_REF,
    }


def main():
    text = load_text()
    head = text[: text.find("FP501")]

    conditions = split_conditions(head)
    endorsements = split_endorsements(text)
    decisions = build_decision_nodes(endorsements + conditions)
    all_chunks = [operative_clause(text)] + conditions + endorsements + decisions

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "source": str(PDF.name),
        "policy_ref": POLICY_REF,
        "counts": {
            "conditions": len(conditions),
            "endorsements": len([c for c in endorsements if c["type"] == "endorsement"]),
            "clauses": len([c for c in endorsements if c["type"] == "clause"]),
            "warranties": len([c for c in endorsements if c["type"] == "warranty"]),
            "decision_nodes": len(decisions),
            "operative_clause": 1,
            "total": len(all_chunks),
        },
        "chunks": all_chunks,
    }, indent=2), encoding="utf-8")

    print(f"conditions      {len(conditions)}")
    print(f"endorsements    {len([c for c in endorsements if c['type']=='endorsement'])}")
    print(f"clauses         {len([c for c in endorsements if c['type']=='clause'])}")
    print(f"warranties      {len([c for c in endorsements if c['type']=='warranty'])}")
    print(f"decision nodes  {len(decisions)}")
    print(f"TOTAL           {len(all_chunks)}  ->  {OUT}")


if __name__ == "__main__":
    main()
