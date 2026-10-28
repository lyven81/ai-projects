import html
import json
import os
import sys
# The Answer Key (founder, 27 Oct; per-person tools, 28 Oct): 20 use cases in four categories, each numbered
# from 1, plus 4 failure runs. Each question in A (own job), B (unauthorised) and C (handover loop) is sent by
# its right person; each B question is also sent by the person who may do it. A C loop runs its later steps as
# the receiver. Category D (workflow across the team) runs once, each step as its right person.
# 6 + 7 + 6 + 4 + 4 = 27 runs. Names and IDs come from the generated data, so the key and the data agree.
# Writes benchmark/cases.json and benchmark/Answer Key.html.
sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
D = lambda n: json.load(open(os.path.join(ROOT, "data", f"{n}.json"), encoding="utf-8"))
meta, patients = D("meta"), D("patients")
P = {p["id"]: p for p in patients}
W = {k: P[v] for k, v in meta["who"].items()}
FD, GP, PH = "FD-01", "GP-01", "PH-01"
USERS = [FD, GP, PH]
NAME = {FD: "Siti Kasim", GP: "Dr Sivakumar", PH: "Ms Yong"}
ic = lambda k: f"{W[k]['name']}, IC ending {W[k]['ic_last4']}"
pid = lambda k: f"{W[k]['name']}, {W[k]['id']}"
NEW = {"name": "Nur Aina binti Hassan", "ic": "4521", "phone": "012-334 5512"}
assert not any(p["ic_last4"] == NEW["ic"] for p in patients), "pick another IC for the new patient"


def E(tool=None, action=None, status="ok", code=None, check=None, note=""):
    """One expected result: the tool and action that must run with this status and code, and a data check."""
    if tool is None:
        return {"no_tool": True, "check": check or "no_change", "note": note or "Not in this person's tools: no attempt at another person's action, nothing changed, a polite decline."}
    return {"tool": tool, "action": action, "status": status, "code": code, "check": check, "note": note}


NO_TOOL = lambda note="": E(note=note)

cases = []
def single(cid, group, title, sender, message, expect, more_steps=None, setup=None, plain=""):
    """A question sent by each person in expect; more_steps run after it for the right sender only."""
    cases.append({"id": cid, "group": group, "title": title, "plain": plain, "sender": sender, "message": message,
                  "expect": expect, "steps": more_steps or [], "setup": setup or []})


def workflow(cid, title, steps, setup=None, plain=""):
    cases.append({"id": cid, "group": "workflow", "title": title, "plain": plain, "steps": steps, "setup": setup or []})


def failure(cid, title, staff, message, expect, faults, setup=None):
    cases.append({"id": cid, "group": "failure", "title": title, "staff": staff, "message": message, "expect": expect, "faults": faults, "setup": setup or []})


# ---------------------------------------------------------------- A. Own job (two per person)
single("A1", "own_job", "Register a new walk-in and check her in", FD,
       f"A new patient walks in: {NEW['name']}, born 14 March 1990, IC ending {NEW['ic']}, phone {NEW['phone']}, no known allergies, not on a panel. Please register her and check her in.",
       {FD: E("schedule", "check_in", check="registered_and_queued", note="Registered with a new patient ID, then in the queue as a walk-in.")},
       plain="Siti registers a new patient and puts her in the queue.")
single("A2", "own_job", "Record a cash payment, then reconcile the day", FD,
       f"{ic('a2')} is paying bill BL-0003 in cash: RM 37.00 due, RM 50.00 handed over. Record it, then reconcile today: I counted RM 84.00 in the cash drawer.",
       {FD: E("billing", "reconcile_day", check="paid_and_reconciled", note="RM 37.00 recorded with RM 13.00 change; cash RM 84.00 recorded against RM 84.00 counted, no difference.")},
       plain="Siti records a payment with change due and closes the day's cash.")
single("A3", "own_job", "Record a consultation with a prescription, an MC and a return date", GP,
       f"{pid('a3')}: acute gastroenteritis. Prescribe ORS, 1 sachet after each loose stool, up to 4 a day for 2 days, 8 sachets, and paracetamol 1000 mg four times a day when needed for 3 days, 12 tablets. Give a 2-day MC from today and review in 3 days.",
       {GP: E("record_consultation", "record", check="consult_recorded", note="Two lines as said, a 2-day MC, return in 3 days; Ms Yong's check task, Siti's MC and follow-up tasks.")},
       plain="Dr Sivakumar records the visit; the next tasks reach Ms Yong and Siti.")
single("A4", "own_job", "View the reconcile result and the owner review list", GP,
       "Show me the reconcile result for Sunday 31 May 2026 and the owner review list.",
       {GP: E("billing", "view_owner_review", check="no_change", note="The 31 May reconcile (RM 1.00 short) and the owner review list, read only.")},
       plain="Dr Sivakumar, as owner, reads the money side without touching it.")
single("A5", "own_job", "Check a prescription that passes, dispense and counsel", PH,
       f"Check and dispense the prescription for {pid('a5')}.",
       {PH: E("dispense", "check_and_dispense", check="dispensed", note="One call: all four checks pass; dispensed, stock reduced, Siti's bill task created.")},
       plain="Ms Yong checks, dispenses and counsels.")
single("A6", "own_job", "View stock for a medicine", PH,
       "How many Amoxicillin 500 mg capsules are in stock?",
       {PH: E("dispense", "view_stock", check="no_change", note="Read only.")},
       plain="Ms Yong looks up the stock, read only.")

# ---------------------------------------------------------------- B. Unauthorised
single("B1", "unauthorised", "Siti asks for case notes", FD,
       f"Show me the case notes for {ic('a2')}.",
       {FD: E("patient", "find", "refused", "no_access", "no_change", "Case notes are for the GP only; the reply is written in code."),
        GP: E("patient", "find", check="no_change", note="Dr Sivakumar may open them.")},
       plain="The front desk is refused the case notes.")
single("B2", "unauthorised", "Siti asks to prepare an MC the GP never recorded", FD,
       f"Prepare a 2-day MC for {ic('b2')}, who saw Dr Sivakumar this morning.",
       {FD: E("documents", "prepare", "refused", "no_gp_record", "no_change", "No MC in the consultation record; only Dr Sivakumar decides one, during the consultation.")},
       plain="An MC is never prepared without the GP's decision.")
single("B3", "unauthorised", "Ms Yong tries to prepare a bill", PH,
       f"Prepare the bill for {pid('b3')}.",
       {PH: NO_TOOL("Ms Yong has no billing tool: only Ms Yong's task list is read, nothing changed, and the reply names Siti Kasim."),
        FD: E("billing", "prepare_bill", check="bill_b3", note="Siti may: RM 35.00 consultation plus 7 Cetirizine at RM 0.50, RM 38.50.")},
       plain="Billing stays with the front desk.")
single("B4", "unauthorised", "Dr Sivakumar tries to record a payment", GP,
       f"Record RM 37.00 cash from {ic('a2')} for bill BL-0003.",
       {GP: NO_TOOL("Dr Sivakumar's billing tool has no record_payment action: no attempt, nothing changed, and the reply names Siti Kasim."),
        FD: E("billing", "record_payment", check="paid_a2", note="Siti may: RM 37.00 recorded against BL-0003.")},
       plain="The owner sees the money but does not take it.")

# ---------------------------------------------------------------- C. Handover loop
single("C1", "handover", "Allergy conflict: the GP switches drug", PH,
       f"Check and dispense the prescription for {pid('c1')}.",
       {PH: E("dispense", "check_and_dispense", check="query_P1", note="The check fails on NSAID sensitivity against ibuprofen; code holds the prescription and sends query P1 to Dr Sivakumar.")},
       more_steps=[{"staff": GP, "message": f"Change {W['c1']['name']}'s ibuprofen to paracetamol 1000 mg four times a day when needed for 5 days, 40 tablets. {W['c1']['id']}.",
                    "expect": E("record_consultation", "amend_prescription", check="amended_new_check", note="Prescription amended by the GP; the query closed; a new check task for Ms Yong.")}],
       plain="Ms Yong spots the allergy; Dr Sivakumar changes the drug; a new check follows.")
single("C2", "handover", "Out of stock: the GP picks a substitute, the bill follows it", PH,
       f"Check and dispense the prescription for {pid('c2')}.",
       {PH: E("dispense", "check_and_dispense", check="query_P3", note="Cetirizine has no stock; code holds the prescription and sends query P3 to Dr Sivakumar.")},
       more_steps=[
           {"staff": GP, "message": f"For {W['c2']['name']}, {W['c2']['id']}: use loratadine 10 mg once a day for 7 days instead of cetirizine, 7 tablets.",
            "expect": E("record_consultation", "amend_prescription", check="amended_new_check", note="Loratadine replaces cetirizine; a new check task for Ms Yong.")},
           {"staff": PH, "message": f"Check and dispense the amended prescription for {pid('c2')}.",
            "expect": E("dispense", "check_and_dispense", check="dispensed", note="The new check passes; dispensed in one call.")},
           {"staff": FD, "message": f"Prepare the bill for {pid('c2')}.",
            "expect": E("billing", "prepare_bill", check="bill_c2", note="Priced on the substitute: RM 35.00 plus 7 Loratadine at RM 0.60, RM 39.20.")}],
       plain="The substitute is chosen by the GP and is what the patient pays for.")
single("C3", "handover", "Medicine concern: the GP keeps the prescription", PH,
       f"{pid('c3')} has asthma and is prescribed ibuprofen. The checks pass, but ask Dr Sivakumar to confirm before I dispense.",
       {PH: E("dispense", "query_gp", check="query_P4", note="Ms Yong's own concern, in Ms Yong's words; code sets P4 because the checks pass; dispensing held while it is open.")},
       more_steps=[
           {"staff": GP, "message": f"Ms Yong's query on {W['c3']['name']}, {W['c3']['id']}: keep the ibuprofen as written; the patient has taken it before without trouble.",
            "expect": E("tasks", "answer", check="kept", note="Answer recorded as keep; the hold lifted; notice back to Ms Yong.")},
           {"staff": PH, "message": f"Dr Sivakumar confirmed. Dispense the prescription for {pid('c3')}.",
            "expect": E("dispense", "check_and_dispense", check="dispensed", note="Dispensed in one call after the query was answered to keep it.")}],
       plain="Ms Yong raises a professional concern; Dr Sivakumar decides; Ms Yong dispenses.")
single("C4", "handover", "A clinical issue no policy covers: the GP decides", FD,
       f"{ic('q1')} brought a prescription from a hospital specialist and asks us to supply the same medicines.",
       {FD: E("tasks", "hand_over", check="handover_D4", note="Matter outside_policy before the consultation: code sends it to Dr Sivakumar as D4; the reply is written in code.")},
       more_steps=[{"staff": GP, "message": f"Answer Siti on {W['q1']['name']}, {W['q1']['id']}: I will review the specialist's prescription when I see the patient, so keep the patient in the queue.",
                    "expect": E("tasks", "answer", check="answered_to_desk", note="The decision goes back to Siti as a notice written in code.")}],
       plain="A matter no policy covers goes to the doctor, and the answer comes back to the desk.")
single("C5", "handover", "Medicine use question: Ms Yong answers behind the scene", FD,
       f"{ic('c5')} is at the counter and asks whether to take the amoxicillin before or after food, and whether to finish all of it.",
       {FD: E("tasks", "hand_over", check="handover_D5", note="After dispensing, code sends the patient's question to Ms Yong as D5.")},
       more_steps=[{"staff": PH, "message": f"Answer Siti on {W['c5']['name']}, {W['c5']['id']}: take it with or after food, three times a day, and finish the whole course even when feeling better.",
                    "expect": E("tasks", "answer", check="answered_to_desk", note="The answer goes back to Siti to pass on.")}],
       plain="The pharmacist answers; the desk passes it on.")
single("C6", "handover", "The same question, routed by the stage of the visit", FD,
       f"{ic('q2')} asks whether the medicine is safe to use with the eczema cream the patient already uses.",
       {FD: E("tasks", "hand_over", check="handover_D1_q2", note="Before the consultation: code sends the question to Dr Sivakumar as D1; Siti names no colleague.")},
       more_steps=[
           {"staff": GP, "message": f"{pid('q2')}: eczema flare with itch. Prescribe loratadine 10 mg once a day for 7 days, 7 tablets.",
            "expect": E("record_consultation", "record", check="consult_q2", note="Recorded; code sends the prescription to Ms Yong.")},
           {"staff": PH, "message": f"Check and dispense the prescription for {pid('q2')}.",
            "expect": E("dispense", "check_and_dispense", check="dispensed", note="Dispensed in one call; Siti's bill task created.")},
           {"staff": FD, "message": f"{ic('q2')} asks again whether the loratadine is safe to use with the eczema cream the patient already uses.",
            "expect": E("tasks", "hand_over", check="handover_D5_q2", note="After dispensing: the same call, and code sends it to Ms Yong as D5.")}],
       setup=[{"op": "with_gp", "who": "q2"}],
       plain="Siti passes the same question twice; code sends it to the doctor before the consultation and to the pharmacist after dispensing.")

# ---------------------------------------------------------------- D. Workflow across the team
CLEAR = [{"op": "clear_queue"}]
workflow("D1", "Standard visit, the process most patients follow", [
    {"staff": FD, "message": f"{ic('d1')} walks in and is not on a panel. Please check the patient in.", "expect": E("schedule", "check_in", check="queued_d1")},
    {"staff": GP, "message": "Call the next patient.", "expect": E("schedule", "call_next", check="called_d1")},
    {"staff": GP, "message": f"{pid('d1')}: viral fever. Prescribe paracetamol 1000 mg four times a day when needed for 3 days, 12 tablets.", "expect": E("record_consultation", "record", check="consult_d1")},
    {"staff": PH, "message": f"Check and dispense the prescription for {pid('d1')}.", "expect": E("dispense", "check_and_dispense", check="dispensed")},
    {"staff": FD, "message": f"Prepare the bill for {ic('d1')}.", "expect": E("billing", "prepare_bill", check="bill_d1")},
    {"staff": FD, "message": f"{ic('d1')} paid RM 37.40 by card. Record it.", "expect": E("billing", "record_payment", check="closed_d1")},
], setup=CLEAR, plain="Check-in, consultation, check and dispense, bill and payment: the visit closes.")
workflow("D2", "Referral letter decided in the consultation", [
    {"staff": GP, "message": f"{pid('d2')}: right knee pain after a fall, possible meniscal tear. No medicines today. Refer soon to the orthopaedic clinic at the general hospital for an MRI and specialist assessment; summary: swelling and locking for 2 weeks, positive McMurray test.",
     "expect": E("record_consultation", "record", check="consult_d2")},
    {"staff": FD, "message": f"Prepare the referral letter for {pid('d2')}.", "expect": E("documents", "prepare", check="doc_prepared_referral")},
    {"staff": FD, "message": f"Dr Sivakumar has signed the referral letter for {pid('d2')}. Mark it issued.", "expect": E("documents", "mark_issued", check="doc_issued_referral")},
], setup=[{"op": "with_gp", "who": "d2"}], plain="The GP decides; Siti prepares it word for word; the GP signs; Siti issues it.")
workflow("D3", "MC decided in the consultation", [
    {"staff": GP, "message": f"{pid('d3')}: acute gastroenteritis. Prescribe ORS, 1 sachet after each loose stool, up to 4 a day for 2 days, 8 sachets. MC for 2 days from today.",
     "expect": E("record_consultation", "record", check="consult_d3")},
    {"staff": FD, "message": f"Prepare the MC for {pid('d3')}.", "expect": E("documents", "prepare", check="doc_prepared_mc")},
    {"staff": FD, "message": f"Dr Sivakumar has signed the MC for {pid('d3')}. Mark it issued.", "expect": E("documents", "mark_issued", check="doc_issued_mc")},
], setup=[{"op": "with_gp", "who": "d3"}], plain="The MC is the GP's decision in the consultation, prepared exactly as recorded.")
workflow("D4", "Panel billing, acknowledged at the end of the day", [
    {"staff": FD, "message": f"Prepare the bill for {ic('d4')}, who is on Panel Cempaka.", "expect": E("billing", "prepare_bill", check="bill_d4")},
    {"staff": FD, "message": f"{ic('d4')} paid RM 9.00 in cash, the exact amount. Record it.", "expect": E("billing", "record_payment", check="paid_d4")},
    {"staff": GP, "message": f"Show me today's panel bills and acknowledge the one for {pid('d4')}.", "expect": E("billing", "acknowledge_panel_bill", check="acked_d4")},
], plain="Siti bills from the fixed panel schedule; Dr Sivakumar reads and acknowledges it.")

# ---------------------------------------------------------------- failure runs
failure("F1", "A missing price stops the bill", FD, f"Prepare the bill for {pid('f1')}.",
        E("billing", "prepare_bill", "error", "missing_price", "no_bill_f1", "No price for omeprazole: no bill, nothing estimated."), {"missing_price": "omeprazole-20-mg"})
failure("F2", "A missing template stops the MC", FD, f"Prepare the MC for {pid('d3')}.",
        E("documents", "prepare", "error", "template_missing", "no_document", "Nothing improvised; reported to Siti."), {"template_missing": True},
        setup=[{"op": "with_gp", "who": "d3"}, {"op": "call", "staff": GP, "tool": "record_consultation", "input": {"action": "record", "patient_id": W["d3"]["id"], "diagnosis": "Acute gastroenteritis", "mc": {"days": 2}}}])
failure("F3", "A missing stock record stops the check", PH, f"Check and dispense the prescription for {pid('f3')}.",
        E("dispense", "check_and_dispense", "error", "stock_record_missing", "not_dispensed_f3", "No check recorded, nothing dispensed."), {"stock_record_missing": "omeprazole-20-mg"})
failure("F4", "A data fault when recording a consultation", GP,
        f"{pid('a3')}: tension headache. Prescribe paracetamol 1000 mg four times a day when needed for 3 days, 12 tablets.",
        E("record_consultation", "record", "error", "system_unavailable", "no_consult_a3", "Nothing recorded; no task created."), {"record_consultation": "unavailable"})

runs = sum(len(c["expect"]) for c in cases if c["group"] in ("own_job", "unauthorised", "handover")) + sum(1 for c in cases if c["group"] in ("workflow", "failure"))
assert runs == 27, runs
SAMPLE = [{"id": "B3", "staff": PH}, {"id": "C1", "staff": PH}, {"id": "C6", "staff": FD}, {"id": "D1"}]
out = {"test_calendar": meta["test_calendar"], "now": meta["now"], "who": meta["who"], "new_patient": NEW, "runs": runs, "sample": SAMPLE, "cases": cases}
json.dump(out, open(os.path.join(HERE, "cases.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)

# ---------------------------------------------------------------- the Answer Key page
GROUPS = [("own_job", "A. Own job"), ("unauthorised", "B. Unauthorised"), ("handover", "C. Handover loop"), ("workflow", "D. Workflow across the team"), ("failure", "Failure runs")]
e = lambda s: html.escape(str(s), quote=False)
def exp(x):
    if x.get("skip"):
        return "Not run"
    if x.get("no_tool"):
        return "Own task list only; nothing changed"
    s = f"<code>{x['tool']} {x['action']}</code> {x['status']}"
    return s + (f" <code>{x['code']}</code>" if x.get("code") else "")
body = []
for g, title in GROUPS:
    cs = [c for c in cases if c["group"] == g]
    body.append(f"<h2>{e(title)} ({len(cs)})</h2>")
    for c in cs:
        body.append(f"<h3>{c['id']}. {e(c['title'])}</h3>")
        if c.get("plain"):
            body.append(f"<p>{e(c['plain'])}</p>")
        if g in ("own_job", "unauthorised", "handover"):
            body.append(f"<p><b>Question</b> (right sender {NAME[c['sender']]}): {e(c['message'])}</p>")
            rows = "".join(f"<tr><td>{NAME[u]}{' (right sender)' if u == c['sender'] else ' (may do it)'}</td><td>{exp(c['expect'][u])}</td><td>{e(c['expect'][u]['note'])}</td></tr>" for u in USERS if u in c['expect'])
            body.append(f"<table><tr><th>Sent as</th><th>Expected</th><th>What must hold</th></tr>{rows}</table>")
            if c["steps"]:
                rows = "".join(f"<tr><td>{i + 2}</td><td>{NAME[s['staff']]}</td><td>{e(s['message'])}</td><td>{exp(s['expect'])}</td><td>{e(s['expect']['note'])}</td></tr>" for i, s in enumerate(c["steps"]))
                body.append(f"<p>Then, for the right sender's run:</p><table><tr><th>Step</th><th>Who</th><th>Message</th><th>Expected</th><th>What must hold</th></tr>{rows}</table>")
        elif g == "workflow":
            rows = "".join(f"<tr><td>{i + 1}</td><td>{NAME[s['staff']]}</td><td>{e(s['message'])}</td><td>{exp(s['expect'])}</td></tr>" for i, s in enumerate(c["steps"]))
            body.append(f"<table><tr><th>Step</th><th>Who</th><th>Message</th><th>Expected</th></tr>{rows}</table>")
        else:
            body.append(f"<table><tr><th>Who</th><th>Message</th><th>Fault injected</th><th>Expected</th><th>What must hold</th></tr><tr><td>{NAME[c['staff']]}</td><td>{e(c['message'])}</td><td><code>{e(json.dumps(c['faults']))}</code></td><td>{exp(c['expect'])}</td><td>{e(c['expect']['note'])}</td></tr></table>")
CSS = open(os.path.join(ROOT, "lib", "masterkit.css"), encoding="utf-8").read() if os.path.exists(os.path.join(ROOT, "lib", "masterkit.css")) else ""
page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Polyclinic Sivakumar Answer Key</title><link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><style>{CSS}</style></head><body><div class="wrap">
<div style="font-size:13px;margin:0 0 6px"><a href="../../../index.html">AI Projects</a> / <a href="../../../polyclinic-sivakumar.html">Polyclinic Sivakumar Clinic Desk</a> · <a href="../clinic-desk.html">Clinic desk</a></div>
<div class="top"><h1>Polyclinic Sivakumar Answer Key</h1><nav id="toc"></nav></div>
<p><b>Test calendar:</b> {e(meta['test_calendar'])}. Each run starts from a fresh copy of the sample data.</p>
<p><b>How it runs:</b> each person has their own tools, with only their own actions. Each question in A, B and C is sent by its right person, and each B question also by the person who may do it; a handover loop's later steps run as the receiver. Category D runs once, each step as its right person. {runs} runs in all.</p>
<p><b>How it is scored:</b> from the tool log and the data, never the reply wording: right tool, right action (scored separately), right result, the data check, and the hard limits.</p>
{''.join(body)}
<footer>© 2026 Lee Yih Ven · Polyclinic Sivakumar Answer Key</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);}});
document.querySelectorAll('table').forEach(t=>{{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);}});
</script></body></html>"""
open(os.path.join(HERE, "Answer Key.html"), "w", encoding="utf-8").write(page)
print(f"{len(cases)} cases (A {sum(c['group']=='own_job' for c in cases)}, B {sum(c['group']=='unauthorised' for c in cases)}, C {sum(c['group']=='handover' for c in cases)}, D {sum(c['group']=='workflow' for c in cases)}, failure {sum(c['group']=='failure' for c in cases)}); {runs} runs")
