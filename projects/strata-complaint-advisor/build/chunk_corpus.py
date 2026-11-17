"""
Chunk the corpus into data/chunks.json: one chunk per section, regulation,
by-law, additional by-law, house rule, SOP step and reply template.

Every chunk carries building, tier, document, number, title, page, anchor,
approval status and effective date, so filtering by building, status and date
is code, not a prompt. Topics (the complaint types a chunk speaks to) are
metadata used by the precedence order in engine/retrieval.py.

    python build/chunk_corpus.py
"""
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CORPUS = BASE / "corpus"
OUT = BASE / "data" / "chunks.json"
BUILDING = "amber-residences"

# The complaint types each passage speaks to. A passage with no entry is
# general: it competes on relevance alone and is never promoted by tier.
TOPICS = {
    "BL-10": ["noise", "smoke_odour"], "HR-1": ["noise"],
    "BL-25": ["parking"], "ABL-2": ["parking"],
    "BL-14": ["pets"], "ABL-3": ["pets"],
    "BL-27": ["renovation", "damage_common_property"], "BL-29": ["renovation"], "ABL-4": ["renovation"],
    "ABL-5": ["renovation", "damage_common_property"], "BL-16": ["damage_common_property"],
    "REG-55": ["leakage"], "REG-56": ["leakage"], "REG-57": ["leakage"], "REG-58": ["leakage"],
    "REG-59": ["leakage"], "REG-60": ["leakage"], "REG-61": ["leakage"], "REG-62": ["leakage"],
    "REG-63": ["leakage"], "REG-64": ["leakage"],
    "BL-26": ["refuse"], "BL-9": ["refuse", "smoke_odour"], "HR-2": ["refuse"],
    "BL-20": ["obstruction", "facilities"], "BL-22": ["obstruction"], "ABL-7": ["obstruction"],
    "BL-4": ["facilities"], "HR-3": ["facilities"],
    "BL-17": ["visitors_access"], "HR-4": ["visitors_access"],
    "ABL-6": ["moving"], "HR-5": ["smoke_odour"],
    "ACT-s59": ["maintenance_repair"], "BL-3": ["maintenance_repair"], "HR-6": ["maintenance_repair"],
    "ACT-s60": ["charges"], "ACT-s61": ["charges"], "BL-6": ["charges"], "ABL-8": ["charges"],
    "BL-7": ["penalty_query"], "ABL-9": ["penalty_query"], "ACT-s70": ["penalty_query"],
    "ACT-s105": ["dispute"], "ACT-SCH4": ["dispute"],
}


def front(text):
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    meta = dict(l.split(": ", 1) for l in m.group(1).splitlines() if ": " in l)
    return meta, m.group(2).strip()


def chunk(meta, code, title, number, text, page=None, status=None):
    return {"chunk_id": code, "code": code, "building": BUILDING, "tier": meta["tier"],
            "document": meta["document"], "number": number, "title": title,
            "page": str(page if page is not None else meta.get("page", "")),
            "anchor": code.lower(), "approval_status": status or meta["approval_status"],
            "effective_date": meta["effective_date"], "topics": TOPICS.get(code, []), "text": text.strip()}


def legal():
    out = []
    for p in sorted((CORPUS / "legal").glob("*.md")):
        meta, body = front(p.read_text(encoding="utf-8"))
        out.append(chunk(meta, meta["code"], meta["title"], meta["number"], body))
    return out


def building(name, number_word):
    meta, body = front((CORPUS / "building" / name).read_text(encoding="utf-8"))
    out = []
    for m in re.finditer(r"^## ((?:ABL|HR|SOP|TPL)-[\w]+)\. (.+?)\n(.*?)(?=^## |\Z)", body, re.S | re.M):
        code, title, text = m.group(1), m.group(2).strip(), m.group(3)
        draft = "(draft, not approved)" in title
        if code.startswith("SOP"):
            text = text.split("\n## ")[0]
        out.append(chunk(meta, code, re.sub(r"\s*\(draft, not approved\)", "", title),
                         f"{number_word} {code.split('-', 1)[1]}", text, page="", status="draft" if draft else None))
    return out


def main():
    chunks = legal()
    chunks += building("additional-bylaws.md", "additional by-law")
    chunks += building("house-rules.md", "house rule")
    chunks += building("complaint-sop.md", "SOP step")
    chunks += building("reply-templates.md", "template")
    ids = [c["chunk_id"] for c in chunks]
    assert len(ids) == len(set(ids)), "duplicate chunk ids"
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"building": BUILDING, "chunks": chunks}, indent=1, ensure_ascii=False), encoding="utf-8")
    by = {}
    for c in chunks:
        by[c["tier"]] = by.get(c["tier"], 0) + 1
    print(len(chunks), "chunks", by, "drafts:", [c["code"] for c in chunks if c["approval_status"] != "approved" and c["approval_status"] != "in force"])


if __name__ == "__main__":
    main()
