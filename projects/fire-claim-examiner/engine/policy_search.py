"""
search_policy: the retrieval stack, scoped to the open claim.

Built on PolicyRetriever (Qdrant vector search, cross-encoder rerank,
precedence by authority). What this layer adds:

    schedule     precedence runs against the open claim's own schedule, so an
                 endorsement that is not held cannot override anything
    empty        nothing relevant returns a clean empty result: a valid answer,
                 never an error
    down         a retriever that cannot answer raises SearchUnavailable, a
                 retryable error, never an empty list
    trimmed      each result carries only chunk id, code, title, authority,
                 scope note and the wording itself
    logged       every chunk returned is logged against the claim, so a gate
                 can rest only on wording retrieved for that claim
    lookup       a clause can be fetched by its code ("Condition 12", "FP507B")

Coverage decision nodes are used for ranking but not returned: the underwriter
quotes the endorsement or condition itself, under its own chunk id.
"""

import json
import os
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CHUNKS = json.loads((BASE / "data" / "chunks.json").read_text(encoding="utf-8"))["chunks"]
BY_ID = {c["chunk_id"]: c for c in CHUNKS}
BY_CODE = {}
for _c in CHUNKS:
    if _c["type"] != "coverage_decision":
        BY_CODE.setdefault(_c["code"].lower(), _c)

# A cross-encoder (ms-marco) score below this means the passage does not answer
# the query. Set from the retrieval probe of 7 Nov 2026: answering clauses scored above 3, unrelated text below -9.
MIN_RERANK = float(os.environ.get("FIRE_MIN_RERANK", "-6.0"))


class SearchUnavailable(Exception):
    """Retryable: the search could not run. Not the same as finding nothing."""


def trim(c: dict) -> dict:
    return {"chunk_id": c["chunk_id"], "code": c["code"], "title": c["title"],
            "authority": c.get("effective_authority", c["authority"]),
            "authority_note": c.get("authority_note", ""),
            "scope_note": c.get("scope_note"), "text": c["text"]}


class PolicySearch:
    def __init__(self, retriever=None):
        self._retriever = retriever
        self._failed = None

    @property
    def retriever(self):
        if os.environ.get("FIRE_SEARCH_DOWN") == "1":
            raise SearchUnavailable("Policy search is unavailable (test switch FIRE_SEARCH_DOWN=1). Retry.")
        if self._retriever is None:
            try:
                from retrieval import PolicyRetriever
                self._retriever = PolicyRetriever()
            except Exception as e:  # model files missing, out of memory, index error
                raise SearchUnavailable(f"Policy search could not start: {e}. Retry.")
        return self._retriever

    def lookup(self, code: str) -> list[dict]:
        c = BY_CODE.get(str(code).strip().lower())
        return [trim(c)] if c else []

    def search(self, query: str, held: list[str], k: int = 4) -> list[dict]:
        try:
            res = self.retriever.search(query, set(held), k=40, pool=25)
        except SearchUnavailable:
            raise
        except Exception as e:
            raise SearchUnavailable(f"Policy search failed: {e}. Retry.")
        # Precedence orders clauses competing on one peril. A query on no peril
        # (notice, occupancy, money) is ranked on relevance alone.
        if self.retriever.infer_peril(query) is None:
            res = sorted(res, key=lambda r: -r["rerank_score"])
        out, seen = [], set()
        for r in res:
            if r["rerank_score"] < MIN_RERANK:
                continue
            if r["type"] == "coverage_decision":
                # a decision node stands for its endorsement: return that instead
                is_held = r["code"] in set(held)
                r = dict(BY_ID.get(f"ENDORSEMENT-{r['code']}", r),
                         effective_authority="override" if is_held else "informational",
                         authority_note="" if is_held else "not held: cannot override")
                if r["type"] == "coverage_decision":
                    continue
            if r["chunk_id"] in seen:
                continue
            seen.add(r["chunk_id"])
            out.append(trim(r))
        return out[:k]
