"""
Generate the Polyclinic Sivakumar sample data as JSON files in data/.

The history (patients, visits, case notes, conditions, prescriptions, invoices) is the original
Klinik Dr Fang generator, same seed, values unchanged, with two approved changes: the doctor is
Dr Sivakumar (the change of setting) and two names in the pool are replaced (founder, 27 Oct). New
fields are added on top: IC last 4 digits, current medicines, panel membership, prescription dose,
quantity and instructions, bill lines. Then today's records for the test calendar, Tue 2 Jun 2026,
10:00 Malaysia time: the queue, this morning's consultations, checks, dispensing, bills, payments
and tasks, the stock, and yesterday's reconcile, each planted for a case in the Answer Key.

Run:  python generate_data.py   (after python build_policies.py)
Out:  data/*.json
"""

import random, json, math, hashlib, os
from datetime import date, datetime, timedelta

# ----------------------------------------------------------------------------
# Reproducible. Anchored to a fixed "today" so the planted patterns are stable.
# ----------------------------------------------------------------------------
SEED = 42
random.seed(SEED)
TODAY = date(2026, 6, 1)
HERE = os.path.dirname(os.path.abspath(__file__))

DOCTORS = ["Dr Sivakumar", "Dr Sivakumar"]  # single-doctor practice (setting changed from Dr Fang, founder 27 Oct)
EMBED_DIM = 64

# ----------------------------------------------------------------------------
# Name pools — realistic PJ mix (Malay / Chinese / Indian). Invented combos.
# ----------------------------------------------------------------------------
MALAY_M = ["Ahmad", "Mohd Faiz", "Hafiz", "Zulkifli", "Amirul", "Syafiq", "Razak", "Iskandar"]
MALAY_F = ["Nurul", "Siti Aminah", "Farah", "Aisyah", "Zarina", "Liyana", "Suraya", "Hidayah"]
CHINESE = ["Tan Wei Ming", "Chan Mei Yee", "Wong Kok Wai", "Lee Hui Shan", "Ng Chee Keong",
           "Chua Siew Lan", "Goh Jia Hui", "Teoh Boon Hock", "Sandra Yip", "Ong Kar Mun"]
INDIAN = ["Suresh Kumar", "Devi Anandan", "Rajesh Pillai", "Kavitha Raj", "Mohan Das",
          "Priya Subramaniam", "Arun Krishnan", "Latha Menon"]

def make_name():
    pool = random.choices([MALAY_M, MALAY_F, CHINESE, INDIAN], weights=[3, 3, 4, 2])[0]
    return random.choice(pool)

# ----------------------------------------------------------------------------
# Complaint themes. Shared vocabulary within a theme makes the embeddings
# cluster honestly (token-overlap cosine). Production would swap in Vertex /
# Gemini embeddings — see README. The clustering logic is identical.
# ----------------------------------------------------------------------------
THEMES = {
    "respiratory": [
        "fever and cough", "sore throat and cough", "runny nose and fever",
        "cough with phlegm", "high fever, body ache and cough", "blocked nose and sore throat",
        "dry cough and mild fever",
    ],
    "gastro": [
        "stomach pain and diarrhea", "vomiting and nausea", "loose stools and abdominal cramps",
        "food poisoning with vomiting", "stomach upset and diarrhea",
    ],
    "dengue_like": [
        "high fever and severe body ache", "fever with headache behind eyes",
        "fever, joint pain and rash", "persistent high fever and fatigue",
    ],
    "dermato": [
        "skin rash and itching", "itchy rash on arms", "eczema flare up", "allergic skin reaction",
    ],
    "musculo": [
        "lower back pain", "knee pain after a fall", "shoulder pain", "neck stiffness and pain",
    ],
    "chronic_followup": [
        "diabetes follow up", "blood pressure check", "hypertension review", "cholesterol follow up",
    ],
    "general": [
        "headache and dizziness", "fatigue and tiredness", "ear pain", "eye irritation and redness",
    ],
}
THEME_NOTE = {
    "respiratory": "URTI symptoms, advised rest and fluids, symptomatic treatment.",
    "gastro": "Acute gastroenteritis, hydration advised, ORS given.",
    "dengue_like": "Febrile illness, dengue cannot be excluded, advised monitoring and FBC.",
    "dermato": "Dermatitis / allergic reaction, topical treatment prescribed.",
    "musculo": "Musculoskeletal pain, analgesia and rest advised.",
    "chronic_followup": "Chronic disease review, medication continued, vitals recorded.",
    "general": "Reviewed, symptomatic management, advised follow up if persists.",
}

CONDITIONS = ["Hypertension", "Type 2 Diabetes", "High Cholesterol", "Asthma",
              "Eczema", "Migraine", "Gastritis"]
DRUGS = ["Paracetamol", "Amoxicillin", "Metformin", "Amlodipine", "Cetirizine",
         "Salbutamol inhaler", "Omeprazole", "Atorvastatin", "ORS sachets"]
ALLERGIES = [None, None, None, None, "Penicillin allergy", "NSAID sensitivity", "Sulfa allergy"]

# ----------------------------------------------------------------------------
# Lightweight, dependency-free text embedding: hashed bag-of-words, L2-normed.
# Genuine cosine clustering by shared vocabulary. Deterministic.
# ----------------------------------------------------------------------------
def embed(text: str):
    vec = [0.0] * EMBED_DIM
    for tok in "".join(c.lower() if c.isalpha() else " " for c in text).split():
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16) % EMBED_DIM
        vec[h] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [round(v / norm, 6) for v in vec]

def iso(d):  return d.isoformat()
def isodt(d, h, m): return datetime(d.year, d.month, d.day, h, m).isoformat(sep=" ")

# ----------------------------------------------------------------------------
# Build the data
# ----------------------------------------------------------------------------
patients, appointments, case_notes, conditions, prescriptions, invoices = [], [], [], [], [], []
appt_id = note_id = cond_id = presc_id = inv_id = 0

N_PATIENTS = 110

# Designate special cohorts up front
frequent_ids = set(range(1, 5))          # patients 1-4 = frequent attenders
lapsing_ids = set(range(90, 106))        # patients 90-105 = lapsing (>1yr)

for pid in range(1, N_PATIENTS + 1):
    reg_days_ago = random.randint(60, 365 * 3)
    reg = TODAY - timedelta(days=reg_days_ago)
    dob = date(random.randint(1945, 2020), random.randint(1, 12), random.randint(1, 28))
    patients.append((pid, make_name(), iso(dob), f"01{random.randint(2,9)}-{random.randint(1000000,9999999)}",
                     iso(reg), random.choice(ALLERGIES)))

    # how many visits this patient has had
    if pid in frequent_ids:
        n_visits = random.randint(11, 16)
    elif pid in lapsing_ids:
        n_visits = random.randint(1, 3)
    else:
        n_visits = random.randint(2, 7)

    # chronic patients get a condition + repeat meds + follow-ups
    has_chronic = random.random() < 0.35
    if has_chronic:
        cond = random.choice(CONDITIONS)
        cond_id += 1
        diag = TODAY - timedelta(days=random.randint(120, 900))
        conditions.append((cond_id, pid, cond, iso(diag)))

    # build the visit dates for this patient
    if pid in lapsing_ids:
        # all visits are old (between 13 and 30 months ago)
        visit_dates = sorted(TODAY - timedelta(days=random.randint(395, 900)) for _ in range(n_visits))
    else:
        visit_dates = sorted(TODAY - timedelta(days=random.randint(1, 420)) for _ in range(n_visits))

    for vd in visit_dates:
        # ---- appointment + status (no-show creep: worse Mon & month-end & recent) ----
        appt_id += 1
        weekday = vd.weekday()
        recency_factor = 1.0 if (TODAY - vd).days < 90 else 0.4   # no-shows rising lately
        p_noshow = 0.05 + (0.10 if weekday == 0 else 0) + (0.08 if vd.day >= 25 else 0)
        p_noshow *= recency_factor
        status = "no-show" if random.random() < p_noshow else (
                 "cancelled" if random.random() < 0.04 else "attended")
        hour = random.randint(9, 17)
        appointments.append((appt_id, pid, isodt(vd, hour, random.choice([0, 15, 30, 45])),
                             status, random.choice(DOCTORS)))
        if status != "attended":
            continue

        # ---- choose a theme for the visit ----
        if has_chronic and random.random() < 0.4:
            theme = "chronic_followup"
        else:
            theme = random.choices(
                ["respiratory", "gastro", "dengue_like", "dermato", "musculo", "general"],
                weights=[5, 3, 2, 3, 3, 4])[0]

        complaint = random.choice(THEMES[theme])
        note_id += 1
        case_notes.append((note_id, pid, iso(vd), complaint, THEME_NOTE[theme],
                           json.dumps(embed(complaint))))

        # ---- prescription ----
        presc_id += 1
        prescriptions.append((presc_id, pid, random.choice(DRUGS), iso(vd),
                              "y" if (has_chronic and theme == "chronic_followup") else "n"))

        # ---- invoice (value spread for segmentation) ----
        inv_id += 1
        base = 45 if theme == "chronic_followup" else random.choice([35, 55, 70, 90, 120, 160])
        amount = round(base + random.uniform(-5, 25), 2)
        invoices.append((inv_id, pid, amount, iso(vd),
                         "y" if random.random() < 0.85 else "n"))

# ----------------------------------------------------------------------------
# PLANT: a respiratory cluster in the last 2 weeks (early-outbreak signal)
# ----------------------------------------------------------------------------
cluster_complaints = THEMES["respiratory"]
for i in range(10):
    pid = random.randint(1, N_PATIENTS)
    vd = TODAY - timedelta(days=random.randint(1, 13))
    appt_id += 1
    appointments.append((appt_id, pid, isodt(vd, random.randint(9, 17), 0), "attended", "Dr Sivakumar"))
    complaint = random.choice(cluster_complaints)
    note_id += 1
    case_notes.append((note_id, pid, iso(vd), complaint, THEME_NOTE["respiratory"],
                       json.dumps(embed(complaint))))
    inv_id += 1
    invoices.append((inv_id, pid, round(random.uniform(45, 90), 2), iso(vd), "y"))

# ----------------------------------------------------------------------------
# PLANT: dengue-like cases rising over the last 6 months (monotonic-ish climb)
# ----------------------------------------------------------------------------
for months_ago in range(6, 0, -1):
    n = max(0, 7 - months_ago)  # 1,2,3,4,5,6 cases as we approach now
    for _ in range(n):
        pid = random.randint(1, N_PATIENTS)
        vd = TODAY - timedelta(days=months_ago * 30 + random.randint(-10, 10))
        if vd >= TODAY:
            vd = TODAY - timedelta(days=1)
        appt_id += 1
        appointments.append((appt_id, pid, isodt(vd, random.randint(9, 17), 0), "attended", "Dr Sivakumar"))
        complaint = random.choice(THEMES["dengue_like"])
        note_id += 1
        case_notes.append((note_id, pid, iso(vd), complaint, THEME_NOTE["dengue_like"],
                           json.dumps(embed(complaint))))
        cond_id += 1
        conditions.append((cond_id, pid, "Dengue (suspected)", iso(vd)))
        inv_id += 1
        invoices.append((inv_id, pid, round(random.uniform(60, 140), 2), iso(vd), "y"))


# ============================================================================
# Polyclinic Sivakumar (founder, 27 Oct): JSON output, new fields, today's planted records.
# Everything above is the original history, unchanged except the doctor's name (the approved change
# of setting) and one name in the pool (founder, 27 Oct). Everything below uses its own random
# generator, so the history's values stay exactly as they were.
# ============================================================================
TABLES = json.load(open(os.path.join(HERE, "resources", "policy_tables.json"), encoding="utf-8"))
MED = TABLES["medicines"]
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)
rng = random.Random(SEED + 1)
DRUG_KEY = {"Paracetamol": "paracetamol-500-mg", "Amoxicillin": "amoxicillin-500-mg", "Metformin": "metformin-500-mg",
            "Amlodipine": "amlodipine-5-mg", "Cetirizine": "cetirizine-10-mg", "Salbutamol inhaler": "salbutamol-inhaler-100-mcg",
            "Omeprazole": "omeprazole-20-mg", "Atorvastatin": "atorvastatin-20-mg", "ORS sachets": "oral-rehydration-salts-ors"}
# The usual line per medicine for history (new fields: dose, quantity and instructions).
USUAL = {
    "paracetamol-500-mg": (1000, "mg", 4, 3, 12, "Take 2 tablets four times a day when needed for fever or pain."),
    "amoxicillin-500-mg": (500, "mg", 3, 5, 15, "Take 1 capsule three times a day with or after food; finish the course."),
    "metformin-500-mg": (500, "mg", 2, 30, 60, "Take 1 tablet twice a day with meals."),
    "amlodipine-5-mg": (5, "mg", 1, 30, 30, "Take 1 tablet once a day."),
    "cetirizine-10-mg": (10, "mg", 1, 7, 7, "Take 1 tablet once a day; may cause drowsiness."),
    "salbutamol-inhaler-100-mcg": (2, "puff", 4, 30, 1, "Inhale 2 puffs when needed for wheeze, up to four times a day."),
    "omeprazole-20-mg": (20, "mg", 1, 14, 14, "Take 1 capsule once a day before breakfast."),
    "atorvastatin-20-mg": (20, "mg", 1, 30, 30, "Take 1 tablet once a day at night."),
    "oral-rehydration-salts-ors": (1, "sachet", 4, 2, 8, "Dissolve 1 sachet in 200 mL water after each loose stool."),
}
P = lambda n: f"PS-P-{n:04d}"
NOW_DATE = date(2026, 6, 2)                              # the test calendar: Tue 2 Jun 2026, 10:00 Malaysia time
unix = lambda d, h, m: int(datetime(d.year, d.month, d.day, h, m).timestamp() - 0) if False else \
    int((datetime(d.year, d.month, d.day, h, m) - datetime(1970, 1, 1)).total_seconds()) - 8 * 3600
NOW = unix(NOW_DATE, 10, 0)

# ---------------------------------------------------------------- patients
ics = rng.sample(range(1000, 10000), len(patients))
cond_by = {}
for c in conditions:
    cond_by.setdefault(c[1], []).append(c[2])
repeat_by = {}
for pr in prescriptions:
    if pr[4] == "y":
        repeat_by.setdefault(pr[1], set()).add(DRUG_KEY[pr[2]])
PATIENTS = []
for i, (pid, name, dob, phone, reg, allergy) in enumerate(patients):
    PATIENTS.append({"id": P(pid), "name": name, "dob": dob, "phone": phone, "ic_last4": f"{ics[i]:04d}", "registered": reg,
                     "allergies": [allergy] if allergy else [], "conditions": sorted(set(cond_by.get(pid, []))),
                     "current_medicines": sorted(repeat_by.get(pid, [])), "panel": None})
byid = {p["id"]: p for p in PATIENTS}
# Panel membership: about one patient in five, split between the two sample panels.
for p in PATIENTS:
    r = rng.random()
    if r < 0.10:
        p["panel"] = {"panel": "teratai", "member_id": f"TRT-{rng.randint(100000, 999999)}"}
    elif r < 0.20:
        p["panel"] = {"panel": "cempaka", "member_id": f"CMP-{rng.randint(100000, 999999)}"}

# ---------------------------------------------------------------- history (existing values, new fields added)
APPTS = [{"id": f"AP-{a[0]:04d}", "patient": P(a[1]), "start": a[2], "status": a[3], "doctor": "GP-01", "kind": "history"} for a in appointments]
NOTES = [{"id": f"CS-{n[0]:04d}", "patient": P(n[1]), "date": n[2], "complaint": n[3], "note": n[4]} for n in case_notes]
RX_HIST = []
for pr in prescriptions:
    k = DRUG_KEY[pr[2]]
    dose, unit, tpd, days, qty, instr = USUAL[k]
    RX_HIST.append({"id": f"RXH-{pr[0]:04d}", "patient": P(pr[1]), "date": pr[3], "repeat": pr[4] == "y",
                    "lines": [{"medicine": k, "dose": dose, "dose_unit": unit, "times_per_day": tpd, "days": days, "quantity": qty, "instructions": instr}]})
INV_HIST = []
for inv in invoices:
    amount = int(round(inv[2] * 100))
    consult = min(3500, amount)
    lines = [{"item": "gp-consultation", "name": "GP consultation", "amount": consult}]
    if amount > consult:
        lines.append({"item": "history", "name": "Medicines and services", "amount": amount - consult})
    INV_HIST.append({"id": f"IV-{inv[0]:04d}", "patient": P(inv[1]), "date": inv[3], "amount": amount, "paid": inv[4] == "y", "lines": lines})


# ---------------------------------------------------------------- today: Tue 2 Jun 2026, 10:00
used = set()
def pick(test):
    for p in PATIENTS:
        if p["id"] not in used and test(p):
            used.add(p["id"])
            return p["id"]
    raise SystemExit("no patient fits a planted record")

no_panel = lambda p: p["panel"] is None
plain = lambda p: no_panel(p) and not p["allergies"] and not p["current_medicines"]
WHO = {
    "a3": pick(plain),                                                                         # A3: with the GP now
    "a5": pick(plain),                                                                         # A5: prescription that passes
    "c1": pick(lambda p: no_panel(p) and p["allergies"] == ["NSAID sensitivity"]),             # C1: ibuprofen vs NSAID sensitivity
    "c2": pick(plain),                                                                         # C2: cetirizine out of stock
    "c3": pick(lambda p: no_panel(p) and not p["allergies"] and "Asthma" in p["conditions"]),  # C3: ibuprofen with asthma
    "b3": pick(plain),                                                                         # B3: dispensed, bill to prepare
    "a2": pick(plain),                                                                         # A2, B4: bill prepared, unpaid
    "c5": pick(plain),                                                                         # C5: amoxicillin dispensed this morning
    "b2": pick(plain),                                                                         # B2: consulted, no MC recorded
    "d4": pick(lambda p: p["panel"] is not None and p["panel"]["panel"] == "cempaka" and not p["allergies"]),  # D4: panel billing
    "d1": pick(plain),                                                                         # D1: the standard visit (walk-in)
    "d2": pick(plain),                                                                         # D2: referral letter
    "d3": pick(plain),                                                                         # D3: MC in the consultation
    "q1": pick(plain), "q2": pick(plain),                                                     # waiting in the queue
    "f1": pick(plain),                                                                         # F1: bill with a missing price (fault)
    "f3": pick(plain),                                                                         # F3: stock record missing (fault)
}
seq = {k: 0 for k in ("CN", "TK", "BL", "RC", "QU", "NT", "CK")}
def nid(k, w=4):
    seq[k] += 1
    return f"{k}-{seq[k]:0{w}d}"

def line(k, dose, tpd, days, qty, instr, unit="mg"):
    return {"medicine": k, "dose": dose, "dose_unit": unit, "times_per_day": tpd, "days": days, "quantity": qty, "instructions": instr, "as_needed": False}

QUEUE, CONSULTS, TASKS, CHECKS, DISPENSED, BILLS, PAYMENTS, NOTICES = [], [], [], [], [], [], [], []
def queue(pid, kind, hm, status):
    QUEUE.append({"id": f"QU-{len(QUEUE) + 1:04d}", "patient": pid, "date": NOW_DATE.isoformat(), "kind": kind,
                  "arrived": unix(NOW_DATE, *hm), "appointment_time": None, "status": status})

def consult(pid, hm, diagnosis, lines, services=("gp-consultation",), mc=None, referral=None, return_days=None):
    cid = nid("CN")
    CONSULTS.append({"id": cid, "patient": pid, "date": NOW_DATE.isoformat(), "at": unix(NOW_DATE, *hm), "by": "GP-01",
                     "diagnosis": diagnosis, "case_note": f"{diagnosis}. Examined; plan as prescribed.", "services": list(services),
                     "prescription": lines, "return_in_days": return_days, "mc": mc, "referral": referral, "amended": []})
    return cid

def task(kind, to, pid, cid, hm, text, **kw):
    t = {"id": nid("TK"), "kind": kind, "to": to, "patient": pid, "consultation": cid, "created": unix(NOW_DATE, *hm),
         "status": "open", "text": text}
    t.update(kw)
    TASKS.append(t)
    return t["id"]

def dispensed(pid, cid, lines, hm):
    ck = nid("CK")
    CHECKS.append({"id": ck, "consultation": cid, "patient": pid, "by": "PH-01", "at": unix(NOW_DATE, *hm), "result": "passed", "failed": []})
    DISPENSED.append({"consultation": cid, "patient": pid, "by": "PH-01", "at": unix(NOW_DATE, *hm) + 300, "lines": [dict(l) for l in lines], "check": ck})

def close_task(tid, hm):
    for t in TASKS:
        if t["id"] == tid:
            t["status"], t["closed"] = "done", unix(NOW_DATE, *hm)

nm = lambda pid: byid[pid]["name"]
# Earlier this morning: three visits already through the whole chain.
c = consult(WHO["c5"], (9, 5), "Acute tonsillitis", [line("amoxicillin-500-mg", 500, 3, 5, 15, USUAL["amoxicillin-500-mg"][5])], return_days=None)
close_task(task("check", "PH-01", WHO["c5"], c, (9, 10), "Check and dispense."), (9, 20))
dispensed(WHO["c5"], c, CONSULTS[-1]["prescription"], (9, 20))
BILLS.append({"id": nid("BL"), "patient": WHO["c5"], "consultation": c, "date": NOW_DATE.isoformat(), "by": "FD-01", "at": unix(NOW_DATE, 9, 30),
              "panel": None, "lines": [{"item": "gp-consultation", "name": "GP consultation", "qty": 1, "unit": 3500, "amount": 3500, "covered": None},
                                       {"item": "amoxicillin-500-mg", "name": "Amoxicillin 500 mg", "qty": 15, "unit": 80, "amount": 1200, "covered": None}],
              "total": 4700, "panel_share": 0, "patient_share": 4700, "status": "paid"})
PAYMENTS.append({"id": nid("RC"), "bill": BILLS[-1]["id"], "patient": WHO["c5"], "amount": 4700, "method": "cash", "tendered": 5000, "change": 300, "by": "FD-01", "at": unix(NOW_DATE, 9, 32)})

c = consult(WHO["b2"], (9, 15), "Viral upper respiratory tract infection", [line("paracetamol-500-mg", 1000, 4, 3, 12, USUAL["paracetamol-500-mg"][5])])
close_task(task("check", "PH-01", WHO["b2"], c, (9, 18), "Check and dispense."), (9, 28))
dispensed(WHO["b2"], c, CONSULTS[-1]["prescription"], (9, 28))
BILLS.append({"id": nid("BL"), "patient": WHO["b2"], "consultation": c, "date": NOW_DATE.isoformat(), "by": "FD-01", "at": unix(NOW_DATE, 9, 35),
              "panel": None, "lines": [{"item": "gp-consultation", "name": "GP consultation", "qty": 1, "unit": 3500, "amount": 3500, "covered": None},
                                       {"item": "paracetamol-500-mg", "name": "Paracetamol 500 mg", "qty": 12, "unit": 20, "amount": 240, "covered": None}],
              "total": 3740, "panel_share": 0, "patient_share": 3740, "status": "paid"})
PAYMENTS.append({"id": nid("RC"), "bill": BILLS[-1]["id"], "patient": WHO["b2"], "amount": 3740, "method": "card", "tendered": None, "change": 0, "by": "FD-01", "at": unix(NOW_DATE, 9, 37)})

c = consult(WHO["a2"], (9, 25), "Tension headache", [line("paracetamol-500-mg", 1000, 4, 3, 10, USUAL["paracetamol-500-mg"][5])])
close_task(task("check", "PH-01", WHO["a2"], c, (9, 28), "Check and dispense."), (9, 38))
dispensed(WHO["a2"], c, CONSULTS[-1]["prescription"], (9, 38))
BILLS.append({"id": nid("BL"), "patient": WHO["a2"], "consultation": c, "date": NOW_DATE.isoformat(), "by": "FD-01", "at": unix(NOW_DATE, 9, 45),
              "panel": None, "lines": [{"item": "gp-consultation", "name": "GP consultation", "qty": 1, "unit": 3500, "amount": 3500, "covered": None},
                                       {"item": "paracetamol-500-mg", "name": "Paracetamol 500 mg", "qty": 10, "unit": 20, "amount": 200, "covered": None}],
              "total": 3700, "panel_share": 0, "patient_share": 3700, "status": "unpaid"})

# Dispensed, the bill still to prepare (B3) and the panel patient (D4).
c = consult(WHO["b3"], (9, 35), "Allergic rhinitis", [line("cetirizine-10-mg", 10, 1, 7, 7, USUAL["cetirizine-10-mg"][5])])
close_task(task("check", "PH-01", WHO["b3"], c, (9, 38), "Check and dispense."), (9, 48))
dispensed(WHO["b3"], c, CONSULTS[-1]["prescription"], (9, 48))
task("bill", "FD-01", WHO["b3"], c, (9, 48), "Prepare the bill.")
c = consult(WHO["d4"], (9, 40), "Acute pharyngitis", [line("amoxicillin-500-mg", 500, 3, 5, 15, USUAL["amoxicillin-500-mg"][5]),
                                                      line("paracetamol-500-mg", 1000, 4, 3, 10, USUAL["paracetamol-500-mg"][5]),
                                                      line("vitamin-c-500-mg", 500, 1, 10, 10, "Take 1 tablet once a day after food.")])
close_task(task("check", "PH-01", WHO["d4"], c, (9, 45), "Check and dispense."), (9, 55))
dispensed(WHO["d4"], c, CONSULTS[-1]["prescription"], (9, 55))
task("bill", "FD-01", WHO["d4"], c, (9, 55), "Prepare the bill.")

# Prescriptions waiting for Ms Yong's check (A5, C1, C2, C3, F3).
for key, hm, dx, lines in [
    ("a5", (9, 45), "Acute otitis media", [line("amoxicillin-500-mg", 500, 3, 5, 15, USUAL["amoxicillin-500-mg"][5]),
                                           line("paracetamol-500-mg", 1000, 4, 3, 12, USUAL["paracetamol-500-mg"][5])]),
    ("c1", (9, 50), "Mechanical low back pain", [line("ibuprofen-400-mg", 400, 3, 5, 15, "Take 1 tablet three times a day after food.")]),
    ("c2", (9, 52), "Allergic urticaria", [line("cetirizine-10-mg", 10, 1, 7, 7, USUAL["cetirizine-10-mg"][5])]),
    ("c3", (9, 55), "Ankle sprain", [line("ibuprofen-400-mg", 400, 3, 5, 15, "Take 1 tablet three times a day after food.")]),
    ("f3", (9, 57), "Gastritis", [line("omeprazole-20-mg", 20, 1, 14, 14, USUAL["omeprazole-20-mg"][5])]),
]:
    c = consult(WHO[key], hm, dx, lines)
    task("check", "PH-01", WHO[key], c, (hm[0], hm[1] + 1), "Check and dispense.")

# F1: dispensed, bill to prepare (a price goes missing by fault injection).
c = consult(WHO["f1"], (9, 30), "Dyspepsia", [line("omeprazole-20-mg", 20, 1, 14, 14, USUAL["omeprazole-20-mg"][5])])
close_task(task("check", "PH-01", WHO["f1"], c, (9, 33), "Check and dispense."), (9, 42))
dispensed(WHO["f1"], c, CONSULTS[-1]["prescription"], (9, 42))
task("bill", "FD-01", WHO["f1"], c, (9, 42), "Prepare the bill.")

# The queue at 10:00: A3 with the GP; two waiting. Every visit above was checked in this morning.
for key, hm in [("c5", (9, 0)), ("b2", (9, 8)), ("a2", (9, 18)), ("f1", (9, 22)), ("b3", (9, 28)), ("d4", (9, 32)),
                ("a5", (9, 38)), ("c1", (9, 42)), ("c2", (9, 44)), ("c3", (9, 47)), ("f3", (9, 50))]:
    queue(WHO[key], "walk_in", hm, "seen")
queue(WHO["a3"], "walk_in", (9, 52), "with_gp")
queue(WHO["q1"], "walk_in", (9, 54), "waiting")
queue(WHO["q2"], "walk_in", (9, 58), "waiting")

# Future bookings on the test calendar (there were none in the history).
FUTURE = []
for i, (key, d, hm) in enumerate([("q1", date(2026, 6, 3), (10, 30)), ("c3", date(2026, 6, 5), (9, 15)), ("d2", date(2026, 6, 2), (16, 0))]):
    FUTURE.append({"id": f"AP-{len(APPTS) + i + 1:04d}", "patient": WHO[key], "start": f"{d.isoformat()} {hm[0]:02d}:{hm[1]:02d}:00",
                   "status": "booked", "doctor": "GP-01", "kind": "appointment"})

# Stock: every medicine in stock except cetirizine (C2); omeprazole's record is removed by fault in F3.
STOCK = {k: {"qty": rng.randint(120, 400) if MED[k]["unit"] != "inhaler" else 24, "updated": unix(date(2026, 6, 1), 18, 0)} for k in MED}
STOCK["cetirizine-10-mg"]["qty"] = 0

# Yesterday's reconcile (Sun 31 May 2026): a cash difference on the owner review list (A4).
RECON = [{"id": "RCN-2026-05-31", "date": "2026-05-31", "by": "FD-01", "at": unix(date(2026, 5, 31), 18, 5),
          "by_method": {"cash": 18433, "card": 0, "e-wallet": 0}, "expected_cash": 18433, "counted_cash": 18333, "difference": -100,
          "bills": [i["id"] for i in INV_HIST if i["date"] == "2026-05-31"]}]
OWNER = [{"id": "OR-0001", "date": "2026-05-31", "kind": "cash_difference", "amount": -100, "reconcile": "RCN-2026-05-31",
          "text": "Cash counted RM 183.33 against RM 184.33 recorded: RM 1.00 short.", "bills": RECON[0]["bills"]}]
assert sum(i["amount"] for i in INV_HIST if i["date"] == "2026-05-31") == 18433, "31 May total changed"

META = {"now": NOW, "today": NOW_DATE.isoformat(), "test_calendar": "Tue 2 Jun 2026, 10:00 Malaysia time", "who": WHO,
        "next": {"CN": seq["CN"] + 1, "TK": seq["TK"] + 1, "BL": seq["BL"] + 1, "RC": seq["RC"] + 1, "CK": seq["CK"] + 1,
                 "NT": 1, "QU": len(QUEUE) + 1, "AP": len(APPTS) + len(FUTURE) + 1, "P": len(PATIENTS) + 1, "MC": 1, "REF": 1, "AK": 1, "LOG": 1}}

FILES = {"meta": META, "patients": PATIENTS, "appointments": APPTS + FUTURE, "case_notes": NOTES, "prescriptions_history": RX_HIST,
         "invoices_history": INV_HIST, "queue": QUEUE, "consultations": CONSULTS, "tasks": TASKS, "checks": CHECKS, "dispensed": DISPENSED,
         "bills": BILLS, "payments": PAYMENTS, "notices": NOTICES, "documents": [], "stock": STOCK, "reconciles": RECON,
         "owner_review": OWNER, "acknowledgements": [], "change_log": [], "queries": []}
for old in os.listdir(OUT):
    if old.endswith(".json"):
        os.remove(os.path.join(OUT, old))
for k, v in FILES.items():
    json.dump(v, open(os.path.join(OUT, f"{k}.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print("Polyclinic Sivakumar data ->", OUT)
for k, v in FILES.items():
    print(f"  {k:<22} {len(v) if isinstance(v, (list, dict)) else v}")
print("  planted:", {k: f"{v} {nm(v)}" for k, v in WHO.items()})
