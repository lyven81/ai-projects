"""
Build the advisor screen (demo.html) and the document page (documents.html).

The screen follows the founder's UI (_plan/Screen UI - 17 Nov 26.html): three
panels, Building context, Complaint, Case guidance. In replay it shows one
recorded benchmark run per sample complaint, exactly as the guard accepted it,
with no key. Served by serve.py on the officer's own machine it runs live with
the visitor's own key.

Only masked complaint text is ever written into the page.

    python build/build_demo.py --run <run_id> [--repeat 1]
"""
import argparse
import html
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE / "engine"))
import complaint_file  # noqa: E402
import intake  # noqa: E402

RUNS = BASE / "benchmark" / "runs"
TIER = {"act": "Act", "regulations": "Regulations", "third_schedule": "Third Schedule",
        "building_bylaw": "Additional by-law", "house_rule": "House rule", "sop": "SOP", "template": "Template"}


def esc(s):
    return html.escape(str(s), quote=True)


def load(p):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def steps_from_log(log):
    """The steps of one run, read from its tool log, and the guidance the guard accepted."""
    steps, guidance, note, reply = [], None, None, None
    for x in log:
        if x["kind"] == "intake":
            r = x["result"]
            steps.append({"what": "intake", "detail": ("masked personal numbers" if r["masked"] else "no personal numbers")
                          + ("; emergency words: " + ", ".join(r["emergency"]) if r["emergency"] else "; no emergency words")})
            if r.get("handover_note"):
                note = r["handover_note"]
        if x["kind"] != "tool":
            continue
        r = x["result"]
        if x["name"] == "search_rules":
            codes = [p["code"] for p in (r.get("data") or {}).get("results", [])]
            steps.append({"what": "search_rules", "detail": f"\"{x['args'].get('query')}\" ({x['args'].get('complaint_type') or 'no type'}): "
                          + (", ".join(codes) if codes else str(r.get("status") or r.get("error")))})
        elif x["name"] == "get_rule":
            steps.append({"what": "get_rule", "detail": f"{x['args'].get('code')}: {r.get('status')}" + (f" ({r['error']})" if r.get("error") else "")})
        elif x["name"] == "get_template":
            steps.append({"what": "get_template", "detail": f"{x['args'].get('name')}: {r.get('status')}"})
        elif x["name"] == "submit_guidance":
            if r.get("status") == "recorded":
                guidance = x["args"]["guidance"]
                note = (r.get("data") or {}).get("handover_note")
                reply = (r.get("data") or {}).get("draft_reply")
                steps.append({"what": "guard", "detail": "passed: guidance recorded"})
            else:
                faults = r.get("faults") or [{"error": r.get("error"), "line": "", "message": ""}]
                steps.append({"what": "guard", "detail": "rejected: " + "; ".join(f"{f['error']} at {f['line']}" for f in faults)})
    return steps, guidance, note, reply


def replay_for(run_id, repeat):
    run = load(RUNS / run_id / "run.json")
    out = {}
    for e in run["results"]:
        if e["repeat"] != repeat:
            continue
        lines = (RUNS / run_id / "logs" / f"{e['id']}-r{repeat}.jsonl").read_text(encoding="utf-8").splitlines()
        steps, guidance, note, reply = steps_from_log([json.loads(l) for l in lines])
        if guidance and reply:
            guidance = dict(guidance, draft_reply=reply)
        out[e["id"]] = {"guidance": guidance, "note": note, "steps": steps, "model": e["model"] if e["model_calls"] else None,
                        "turns": e["turns"], "tool_calls": e["tool_calls"], "cost_usd": e["cost_usd"], "pass": e["score"]["pass"],
                        "outcome": e["outcome"]}
    return run["run_id"], out


def complaints():
    out = []
    for cid in complaint_file.ids():
        c = complaint_file.raw(cid)
        r = complaint_file.intake_record(cid)
        out.append({"id": cid, "title": c["title"], "date": c["date"], "unit": c["unit"], "channel": c["channel"],
                    "text": r["text"], "facts": r["facts"], "source_unit": c.get("source_unit") or ""})
    assert not any(intake.has_personal_numbers(x["text"] + x["facts"]) for x in out)
    return out


def passages():
    chunks = load(BASE / "data" / "chunks.json")["chunks"]
    return {c["code"]: {"code": c["code"], "tier": TIER[c["tier"]], "title": c["title"], "number": c["number"],
                        "document": c["document"], "page": c["page"], "effective": c["effective_date"],
                        "status": c["approval_status"], "text": c["text"]} for c in chunks}


def units():
    return {u["unit"]: [1 if u["occupied"] else 0, (u["occupant"] or "")[:1]] for u in load(BASE / "data" / "units.json")["units"]}


def build_demo(run_id, replay):
    tpl = (BASE / "build" / "demo_template.html").read_text(encoding="utf-8")
    data = {"run": run_id, "complaints": complaints(), "replay": replay, "passages": passages(), "units": units()}
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return tpl.replace("/*DATA*/null", blob)


def build_documents():
    chunks = load(BASE / "data" / "chunks.json")["chunks"]
    order = ["act", "regulations", "third_schedule", "building_bylaw", "house_rule", "sop", "template"]
    heads = {"act": "Strata Management Act 2013 (Act 757)", "regulations": "Strata Management (Maintenance and Management) Regulations 2015",
             "third_schedule": "Third Schedule By-laws", "building_bylaw": "Amber Residences Additional By-laws",
             "house_rule": "Amber Residences House Rules", "sop": "Amber Residences Complaint Handling SOP",
             "template": "Amber Residences Reply Templates"}
    secs = []
    for t in order:
        items = [c for c in chunks if c["tier"] == t]
        if not items:
            continue
        rows = []
        for c in items:
            paras = "".join(f"<p>{esc(p)}</p>" for p in c["text"].split("\n\n") if p.strip())
            status = "In force" if c["approval_status"] in ("in force", "approved") else "Draft, not approved: never returned or cited"
            rows.append(f'<div class="item" id="{esc(c["code"])}"><h3><span class="code">{esc(c["code"])}</span> {esc(c["title"])}</h3>'
                        f'<p class="meta">{esc(TIER[t])} · {esc(c["number"])}'
                        + (f' · page {esc(c["page"])}' if c["page"] else "")
                        + f' · effective {esc(c["effective_date"])} · {esc(status)}</p>{paras}</div>')
        secs.append(f"<h2>{esc(heads[t])}</h2>" + "".join(rows))
    tpl = (BASE / "build" / "documents_template.html").read_text(encoding="utf-8")
    return tpl.replace("<!--SECTIONS-->", "\n".join(secs))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--repeat", type=int, default=1)
    a = ap.parse_args()
    run_id, replay = replay_for(a.run, a.repeat)
    (BASE / "demo.html").write_text(build_demo(run_id, replay), encoding="utf-8")
    (BASE / "documents.html").write_text(build_documents(), encoding="utf-8")
    print("demo.html and documents.html from", run_id, "repeat", a.repeat, "-", len(replay), "cases")


if __name__ == "__main__":
    main()
