"""
Strata Complaint Advisor: the retrieval stack.

    1. POOLS       vector search (Qdrant in memory, all-MiniLM-L6-v2) and BM25
    2. RERANK      a cross-encoder (ms-marco-MiniLM-L-6-v2) scores each candidate
    3. PRECEDENCE  candidates on the complaint's topic are ordered by legal
                   authority: the Act, then the Regulations and the Third
                   Schedule, then the building's additional by-laws, then the
                   house rules

Only passages of the selected building, approved or in force, and effective
on the complaint date are ever candidates. Precedence is an order, not a
weight: a by-law never outranks the Act it sits under, however the scores fall.

Built on the Fire Claim Examiner retrieval stack; the order is flipped (there
an endorsement outranked the base wording) and a complaint-type router
replaces the peril words.
"""
import json
import math
import re
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
CHUNKS = BASE / "data" / "chunks.json"

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
COLLECTION = "strata"

# Lower number wins.
PRECEDENCE = {"act": 0, "regulations": 1, "third_schedule": 1, "building_bylaw": 2, "house_rule": 3}
SEARCHABLE = set(PRECEDENCE)
IN_FORCE = {"approved", "in force"}

COMPLAINT_TYPES = ["noise", "parking", "pets", "renovation", "leakage", "refuse", "obstruction", "facilities",
                   "visitors_access", "moving", "smoke_odour", "damage_common_property", "maintenance_repair",
                   "charges", "penalty_query", "compensation", "dispute", "management_conduct"]


def load_chunks():
    return json.loads(CHUNKS.read_text(encoding="utf-8"))["chunks"]


def eligible(c, building, date):
    """Selected building, approved or in force, effective on the complaint date, a searchable tier."""
    return (c["building"] == building and c["approval_status"] in IN_FORCE
            and c["effective_date"] <= date and c["tier"] in SEARCHABLE)


class RuleRetriever:
    def __init__(self):
        from qdrant_client import QdrantClient
        from qdrant_client.models import Distance, PointStruct, VectorParams
        from sentence_transformers import CrossEncoder, SentenceTransformer

        self.chunks = [c for c in load_chunks() if c["tier"] in SEARCHABLE]
        self.by_id = {c["chunk_id"]: c for c in self.chunks}
        self.embedder = SentenceTransformer(EMBED_MODEL)
        self.reranker = CrossEncoder(RERANK_MODEL)
        self.client = QdrantClient(":memory:")
        texts = [f"{c['title']}\n{c['text']}" for c in self.chunks]
        vecs = self.embedder.encode(texts, batch_size=32, show_progress_bar=False)
        self.client.create_collection(COLLECTION, vectors_config=VectorParams(size=vecs.shape[1], distance=Distance.COSINE))
        self.client.upsert(COLLECTION, points=[PointStruct(id=i, vector=v.tolist(), payload={"chunk_id": c["chunk_id"]})
                                               for i, (c, v) in enumerate(zip(self.chunks, vecs))])
        self._lexical_index()

    # BM25 beside the vector pool: long by-laws embed as an average of many
    # sub-paragraphs, and a plain word score still reaches them.
    _WORD = re.compile(r"[a-z0-9]+")
    _STOP = set("the of and or to in a an by any for be is on as this that with which such from at its it shall his".split())

    def _tokens(self, text):
        return [w for w in self._WORD.findall(text.lower()) if w not in self._STOP and len(w) > 1]

    def _lexical_index(self):
        self._docs = [Counter(self._tokens(f"{c['title']} {c['text']}")) for c in self.chunks]
        self._lens = [sum(d.values()) for d in self._docs]
        self._avg = sum(self._lens) / len(self._lens)
        df = Counter(w for d in self._docs for w in d)
        n = len(self._docs)
        self._idf = {w: math.log(1 + (n - f + 0.5) / (f + 0.5)) for w, f in df.items()}

    def lexical(self, query, n=10, k1=1.4, b=0.75):
        q = self._tokens(query)
        scores = []
        for i, d in enumerate(self._docs):
            s = sum(self._idf[w] * d[w] * (k1 + 1) / (d[w] + k1 * (1 - b + b * self._lens[i] / self._avg))
                    for w in q if w in d)
            if s > 0:
                scores.append((s, i))
        return [self.chunks[i]["chunk_id"] for _, i in sorted(scores, reverse=True)[:n]]

    def search(self, query, complaint_type, building, date, pool=20, keep=8, k=5, min_rerank=-4.0):
        qv = self.embedder.encode(query).tolist()
        hits = self.client.query_points(COLLECTION, query=qv, limit=pool).points
        ids = [h.payload["chunk_id"] for h in hits]
        ids += [cid for cid in self.lexical(query) if cid not in ids]
        # the complaint-type router: every passage tagged with the type joins the pool, so a
        # by-law the words of the query miss ("drain" against "sewers, pipes") is still a candidate
        ids += [c["chunk_id"] for c in self.chunks if complaint_type in c["topics"] and c["chunk_id"] not in ids]
        cands = [dict(self.by_id[cid]) for cid in ids if eligible(self.by_id[cid], building, date)]
        if not cands:
            return []
        # A by-law holds several sub-paragraphs on different matters; the cross-encoder scores
        # each one with the title, and the passage takes its best paragraph's score.
        pairs, owner = [], []
        for i, c in enumerate(cands):
            for para in [p for p in c["text"].split("\n\n") if p.strip()] or [c["text"]]:
                pairs.append((query, f"{c['title']}. {para[:1500]}"))
                owner.append(i)
        best = [-99.0] * len(cands)
        for i, s in zip(owner, self.reranker.predict(pairs, batch_size=64)):
            best[i] = max(best[i], float(s))
        for c, s in zip(cands, best):
            c["rerank_score"] = round(s, 3)
        for c in cands:
            c["on_topic"] = complaint_type in c["topics"]
            c["precedence"] = PRECEDENCE[c["tier"]]
        # Statute text scores low on this cross-encoder even when it is the answer, so the score
        # gates only passages off the complaint's topic; a passage on the topic stays a candidate.
        on = [c for c in cands if c["on_topic"]]
        off = sorted([c for c in cands if not c["on_topic"] and c["rerank_score"] >= min_rerank],
                     key=lambda c: -c["rerank_score"])[:max(2, keep - len(on))]
        cands = on + off
        # precedence applies only among passages on the complaint's topic; the rest follow on relevance
        cands.sort(key=lambda c: (not c["on_topic"], c["precedence"] if c["on_topic"] else 0, -c["rerank_score"]))
        return cands[:k]
