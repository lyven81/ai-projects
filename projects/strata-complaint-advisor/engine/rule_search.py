"""
search_rules and get_rule: the retrieval stack, scoped to the open complaint.

    scoped     the complaint's building, approved documents in force on the
               complaint date
    empty      nothing relevant is a clean empty result, never an error
    down       a retriever that cannot run raises SearchUnavailable, retryable
    lookup     a passage by its code ("BL-10", "ABL-2", "ACT-s61")
"""
import os

from retrieval import COMPLAINT_TYPES, IN_FORCE, eligible, load_chunks

CHUNKS = load_chunks()
BY_CODE = {c["code"].lower(): c for c in CHUNKS}
MIN_RERANK = float(os.environ.get("STRATA_MIN_RERANK", "-4.0"))


class SearchUnavailable(Exception):
    """Retryable: the search could not run. Not the same as finding nothing."""


def trim(c):
    return {"code": c["code"], "tier": c["tier"], "document": c["document"], "number": c["number"],
            "title": c["title"], "page": c["page"], "effective_date": c["effective_date"], "text": c["text"]}


def base_code(code):
    """'BL-10(3)' and 'bl-10' are the passage BL-10."""
    s = str(code).strip()
    s = s.split("(")[0].strip()
    c = BY_CODE.get(s.lower())
    return c["code"] if c else s


class RuleSearch:
    def __init__(self, retriever=None):
        self._retriever = retriever

    @property
    def retriever(self):
        if os.environ.get("STRATA_SEARCH_DOWN") == "1":
            raise SearchUnavailable("Rule search is unavailable (test switch STRATA_SEARCH_DOWN=1). Retry.")
        if self._retriever is None:
            try:
                from retrieval import RuleRetriever
                self._retriever = RuleRetriever()
            except Exception as e:
                raise SearchUnavailable(f"Rule search could not start: {e}. Retry.")
        return self._retriever

    def lookup(self, code, building=None, date=None, any_status=False):
        c = BY_CODE.get(base_code(code).lower())
        if not c:
            return None
        if building and c["building"] != building:
            return None
        if not any_status and (c["approval_status"] not in IN_FORCE or (date and c["effective_date"] > date)):
            return None
        return trim(c)

    def search(self, query, complaint_type, building, date, k=5):
        if complaint_type not in COMPLAINT_TYPES:
            complaint_type = None
        try:
            res = self.retriever.search(query, complaint_type, building, date, k=k, min_rerank=MIN_RERANK)
        except SearchUnavailable:
            raise
        except Exception as e:
            raise SearchUnavailable(f"Rule search failed: {e}. Retry.")
        return [trim(c) for c in res if eligible(c, building, date)]
