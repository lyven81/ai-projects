"""
The Sang Kancil Specialist Clinic demo data, from one seed (42): about 120 synthetic patients across
the three doctor bands, six months of visits (a test sample, not the clinic's full volume), growth,
allergies, vaccinations by the Immunisation Schedule, prescriptions, confidential adolescent notes,
invoices and payments, guardians and the next three weeks of appointments. Test calendar:
Thursday 22 October 2026, 10:00 Malaysia time. Money in sen, times as Unix seconds UTC, dates as
YYYY-MM-DD in Malaysia time.

Plants the benchmark records and asserts them at the end (every benchmark question has its records):
  SK-P-0001 Aiman Hakim, 4 (Dr Daniel): 12.0 kg on 19 Oct; closed sick visit 19 Oct with a 14-day
            follow-up (Nurul Huda's booking action, target Mon 2 Nov); open visit today with a
            doctor-recorded confirmed GAS indication; no known allergies, explicitly recorded.
  SK-P-0002 Hana Lim, 15 (Dr Priya): mother Wong Pei San on the contact view; recurrent headaches;
            a confidential note; a verified HPV programme dose at 13.
  SK-P-0003 Tan Mei Xin, 6 (Dr Daniel): complete verified history, PCV booster not given; last weight
            20.0 kg on 15 Jun 2026.
  SK-P-0004 Ryan Lee, 7 (Dr Daniel): asthma, a routine salbutamol plan; vaccination history before he
            joined (Feb 2024) not on record.
  SK-P-0005 Adam Firdaus (Baby Adam), 11 months (Dr Aisyah): born 27 Oct 2025, MMR dose 2 target Tue 27 Oct.
  SK-P-0006 Arjun Kumar, 9 (Dr Daniel): penicillin allergy, asthma; one unpaid invoice of RM 185.00
            (FS-C04 RM 60.00, a spacer RM 55.00, two salbutamol inhalers RM 70.00).
  Dr Daniel's Tuesday 27 Oct morning session is fully booked; his Monday 2 Nov morning has 9:00am free.
  Asthma in the child and adolescent bands; vaccine-overdue patients in every band.
Change the data here, never by hand.
"""
import json
import os
import random
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)
T = json.load(open(os.path.join(HERE, "resources", "policy_tables.json"), encoding="utf-8"))
rnd = random.Random(42)

TODAY = date(2026, 10, 22)
NOW = int(datetime(2026, 10, 22, 2, 0, tzinfo=timezone.utc).timestamp())  # 10:00 Malaysia time
iso = lambda d: d.isoformat()
unix = lambda d, h=10, m=0: int(datetime(d.year, d.month, d.day, h - 8 if h >= 8 else h, m, tzinfo=timezone.utc).timestamp())
DOC = {"infant": "PD-01-01", "child": "PD-02-01", "adolescent": "PD-02-02"}


def add_months(d, n):
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    last = (date(y + (m // 12), m % 12 + 1, 1) - timedelta(days=1)).day
    return date(y, m, min(d.day, last))


def age(dob, on=TODAY):
    months = (on.year - dob.year) * 12 + (on.month - dob.month) - (1 if on.day < dob.day else 0)
    return months // 12, months


def band(dob):
    y, _ = age(dob)
    return "infant" if y < 1 else "child" if y <= 12 else "adolescent"


PLANTED_FIRST = {"Aiman", "Hana", "Mei Xin", "Ryan", "Adam", "Arjun"}
MALAY_M = ["Danial", "Haziq", "Irfan", "Luqman", "Faris", "Zafran", "Iman", "Rayyan", "Harith", "Qayyum", "Amsyar", "Naufal"]
MALAY_F = ["Aisyah", "Nur Alya", "Damia", "Hannah Sofea", "Insyirah", "Qistina", "Auni", "Medina", "Sumayyah", "Iris"]
CHINESE_M = ["Jun Hao", "Wei Jie", "Zi Xuan", "Kai Wen", "Yu Heng", "Jia Le", "Hao Ran"]
CHINESE_F = ["Xin Yi", "Hui Min", "Jia Xin", "Yi Ting", "Wen Qi", "Zi Ying", "Kai Xin"]
CHINESE_SUR = ["Tan", "Wong", "Lee", "Chong", "Ng", "Ong", "Teoh", "Goh", "Chan", "Yap"]
INDIAN_M = ["Kavin", "Rishi", "Dinesh", "Vikram", "Aaron", "Nikhil", "Pranav"]
INDIAN_F = ["Ananya", "Divya", "Meera", "Shalini", "Tanisha", "Kavya", "Nisha"]
INDIAN_SUR = ["Raj", "Kumar", "Pillai", "Nair", "Menon", "Subramaniam", "Krishnan"]
MALAY_FATHER = ["Ahmad", "Hafiz", "Rosli", "Azman", "Faizal", "Zulkifli", "Kamal", "Shahrul", "Ridzuan", "Hakim"]
GUARD_F = ["Nor Azlina", "Siti Aminah", "Farah", "Nurul Izzah", "Rohana", "Liyana"]
GUARD_C = ["Pei San", "Siew Lan", "Hui Ling", "Bee Leng", "Mei Fong", "Swee Lin"]
GUARD_I = ["Kalpana", "Sangeetha", "Revathi", "Priyanka", "Deepa", "Vasanthi"]
AREAS = ["Kota Damansara, 47810 Petaling Jaya", "Mutiara Damansara, 47820 Petaling Jaya", "Sunway Damansara, 47810 Petaling Jaya",
         "Bandar Utama, 47800 Petaling Jaya", "Damansara Damai, 47830 Petaling Jaya", "Sungai Buloh, 47000 Selangor"]

patients, guardians, visits, growth, allergies, vaccinations, prescriptions = [], [], [], [], [], [], []
notes, invoices, payments, appointments, actions, requests = [], [], [], [], [], []
used_names = set()


def make_guardian(pid, culture, surname, mother=True, name=None):
    gid = f"SK-G-{len(guardians) + 1:04d}"
    if name is None:
        if culture == "malay":
            name = rnd.choice(GUARD_F) + " binti " + rnd.choice(MALAY_FATHER) if mother else rnd.choice(MALAY_FATHER) + " bin " + rnd.choice(MALAY_FATHER)
        elif culture == "chinese":
            name = f"{rnd.choice(CHINESE_SUR)} {rnd.choice(GUARD_C)}" if mother else f"{surname} {rnd.choice(CHINESE_M)}"
        else:
            name = f"{rnd.choice(GUARD_I)} {surname}" if mother else f"{rnd.choice(INDIAN_M)} {surname}"
    phone = f"+60 1{rnd.choice('2367')}-{rnd.randint(200, 999)} {rnd.randint(1000, 9999)}"
    email = name.lower().replace(" binti ", ".").replace(" bin ", ".").replace(" ", ".")[:18] + "@mail.example.my"
    guardians.append(dict(id=gid, patients=[pid], name=name, relationship="mother" if mother else "father",
                          phone=phone, email=email, address=f"{rnd.randint(1, 60)}, Jalan PJU {rnd.randint(1, 9)}/{rnd.randint(1, 40)}, {rnd.choice(AREAS)}"))
    return gid


def new_patient(pid, name, first, dob, sex, culture, surname, **kw):
    b = band(dob)
    p = dict(id=pid, name=name, first=first, dob=iso(dob), sex=sex, doctor=DOC[b], region="Selangor",
             registered=kw.get("registered", iso(max(dob, date(2023, 1, 9)))), conditions=kw.get("conditions", []),
             allergy_status=kw.get("allergy_status", "nka"), history_complete=kw.get("history_complete", True),
             mykid=f"{dob.strftime('%y%m%d')}-10-{rnd.randint(1000, 9999)}")
    p["guardian"] = make_guardian(pid, culture, surname, name=kw.get("guardian"))
    patients.append(p)
    used_names.add(name)
    return p


def weight_for(dob, on):
    y, m = age(dob, on)
    if y < 1:
        return round(3.4 + 0.6 * min(m, 6) + 0.35 * max(0, m - 6), 1)
    return round(2 * y + 8 + rnd.uniform(-1.5, 2.5), 1)


def give_vaccines(p, gaps=(), complete_from=None):
    """Verified administrations for every routine row whose target is on or before today, except gaps."""
    dob = date.fromisoformat(p["dob"])
    y, _ = age(dob)
    for row in T["immunisation"]:
        if "programme only" in row["channel"] or row["id"] in gaps:
            continue
        if row["target"] == "birth":
            when, src = dob, "external"
        elif row["target"].endswith("months"):
            when = add_months(dob, int(row["target"].split()[0])) + timedelta(days=rnd.randint(0, 6))
            src = "clinic" if when >= date.fromisoformat(p["registered"]) else "external"
        else:
            cohort = int(row["target"].split("age ")[1].split()[0])
            if "girls" in row["target"] and p["sex"] != "F":
                continue
            if y <= cohort or (row["id"] == "IS-HPV-SCHOOL" and y < 13):
                continue
            when, src = add_months(dob, cohort * 12) + timedelta(days=rnd.randint(30, 200)), "external"
        if when > TODAY or (complete_from and when < complete_from):
            continue
        vac = row["vaccine"]
        vaccinations.append(dict(id=f"SK-V-{len(vaccinations) + 1:05d}", patient=p["id"], schedule_id=row["id"], vaccine=vac,
                                 date=iso(when), source=src, verified=True, batch=f"B{rnd.randint(10000, 99999)}" if src == "clinic" else None))


FEES = T["fees"]


def invoice(p, d, lines, paid=True, visit=None):
    iid = f"SK-INV-{len(invoices) + 1:05d}"
    invoices.append(dict(id=iid, patient=p["id"], visit=visit, date=iso(d), lines=[dict(fee_id=f, qty=q, sen=FEES[f]["sen"], label=FEES[f]["label"]) for f, q in lines],
                         adjustments=[], fee_version="FS 1.0"))
    total = sum(FEES[f]["sen"] * q for f, q in lines)
    if paid and total:
        payments.append(dict(id=f"SK-PAY-{len(payments) + 1:05d}", invoice=iid, sen=total, method=rnd.choice(["cash", "card", "duitnow"]),
                             ref=f"RC-{rnd.randint(100000, 999999)}", time=unix(d, 12, rnd.randint(0, 59)), recorded_by="FD-02-01"))
    return iid


DIAG = {
    "infant": ["Well-baby review", "Viral upper respiratory infection", "Infant colic", "Mild eczema", "Vaccination visit", "Bronchiolitis, mild"],
    "child": ["Viral upper respiratory infection", "Acute gastroenteritis", "Hand, foot and mouth disease", "Allergic rhinitis", "Asthma review", "Fever, viral", "Otitis media"],
    "adolescent": ["Acne review", "Allergic rhinitis", "Asthma review", "Viral fever", "Sports injury review", "Headache review"],
}


def visit(p, d, diag, follow=None, status="closed", indication=None, vtype="follow_up", fee=True, paid=True):
    vid = f"SK-VIS-{len(visits) + 1:05d}"
    visits.append(dict(id=vid, patient=p["id"], doctor=p["doctor"], date=iso(d), type=vtype, diagnosis=diag, indication=indication,
                       status=status, follow_up_days=follow, closed_at=unix(d, 11) if status == "closed" else None,
                       closed_by=p["doctor"] if status == "closed" else None))
    if status == "closed":
        growth.append(dict(patient=p["id"], date=iso(d), weight_kg=weight_for(date.fromisoformat(p["dob"]), d)))
        if fee:
            lead = p["doctor"] == "PD-01-01"
            invoice(p, d, [("FS-C02" if lead else "FS-C04", 1)], paid=paid, visit=vid)
    return vid


# ---------------------------------------------------------------- planted patients
aiman = new_patient("SK-P-0001", "Aiman Hakim bin Rosli", "Aiman", date(2022, 6, 8), "M", "malay", "Rosli",
                    guardian="Nor Azlina binti Ismail", registered="2023-03-14")
hana = new_patient("SK-P-0002", "Hana Lim", "Hana", date(2011, 5, 14), "F", "chinese", "Lim",
                   guardian="Wong Pei San", conditions=["recurrent headaches"], registered="2023-01-16")
meixin = new_patient("SK-P-0003", "Tan Mei Xin", "Mei Xin", date(2020, 2, 10), "F", "chinese", "Tan", registered="2023-02-06")
ryan = new_patient("SK-P-0004", "Ryan Lee", "Ryan", date(2019, 3, 3), "M", "chinese", "Lee",
                   conditions=["asthma"], history_complete=False, registered="2024-02-12")
adam = new_patient("SK-P-0005", "Adam Firdaus bin Hafiz", "Adam", date(2025, 10, 27), "M", "malay", "Hafiz", registered="2025-10-29")
arjun = new_patient("SK-P-0006", "Arjun Kumar", "Arjun", date(2017, 4, 12), "M", "indian", "Kumar",
                    conditions=["asthma"], allergy_status="recorded", registered="2023-05-22")

# Aiman: sick visit Mon 19 Oct (closed, 14-day follow-up), open visit today with a confirmed GAS indication.
v19 = visit(aiman, date(2026, 10, 19), "Acute sore throat; throat swab sent", follow=14, vtype="sick_visit", paid=True)
growth[-1]["weight_kg"] = 12.0
prescriptions.append(dict(id="SK-RX-00001", patient=aiman["id"], visit=v19, doctor="PD-02-01", date="2026-10-19", presentation="MED-PAR120",
                          profile="CF-PAR-01", amount_per_dose=5, dose_unit="mL", times_per_day=4, as_needed=True, duration_days=3,
                          supply_qty=1, supply_unit="60 mL bottle"))
actions.append(dict(id="SK-ACT-00001", type="book_follow_up", owner="FD-02-01", patient=aiman["id"], ref=v19, doctor="PD-02-01",
                    target_date="2026-11-02", status="open", created=unix(date(2026, 10, 19), 11), clause="OP-11",
                    text="Book Dr Daniel's 14-day follow-up from the Monday 19 October 2026 visit"))
v22 = visit(aiman, TODAY, "Group A streptococcal tonsillopharyngitis, throat swab positive", status="open", indication="confirmed_gas", fee=False)
appointments.append(dict(id="SK-APT-00001", patient=aiman["id"], doctor="PD-02-01", date=iso(TODAY), start="09:40", minutes=20,
                         visit_type="follow_up", status="confirmed", channel="phone", guardian=aiman["guardian"], created_by="FD-02-01"))
give_vaccines(aiman)

# Hana: headaches, a confidential note, HPV at 13 verified.
for d, dg in [(date(2026, 7, 8), "Headache review"), (date(2026, 9, 30), "Headache review")]:
    visit(hana, d, dg)
notes.append(dict(id="SK-CN-00001", patient=hana["id"], author="PD-02-02", date="2026-09-30",
                  note="HEADSS conversation recorded. Stressors discussed privately with the patient; follow-up planned with the patient's agreement."))
give_vaccines(hana)
assert any(v["patient"] == hana["id"] and v["schedule_id"] == "IS-HPV-SCHOOL" for v in vaccinations)
for v in vaccinations:
    if v["patient"] == hana["id"] and v["schedule_id"] == "IS-HPV-SCHOOL":
        v["date"] = "2024-08-20"

# Mei Xin: complete history, PCV booster not given; weight older than 30 days.
visit(meixin, date(2026, 6, 15), "Viral upper respiratory infection")
growth[-1]["weight_kg"] = 20.0
give_vaccines(meixin, gaps=("IS-PCV-B",))

# Ryan: asthma, routine salbutamol plan; vaccinations from before he joined not on record.
vr = visit(ryan, date(2026, 9, 15), "Asthma review")
prescriptions.append(dict(id="SK-RX-00002", patient=ryan["id"], visit=vr, doctor="PD-02-01", date="2026-09-15", presentation="MED-SAL100",
                          profile="CF-SAL-ROUTINE", amount_per_dose=2, dose_unit="puff", times_per_day=4, as_needed=True, duration_days=None,
                          supply_qty=1, supply_unit="200-actuation inhaler", plan_reference="SK-AAP-0004", review_date="2026-10-15"))
give_vaccines(ryan, complete_from=date(2024, 2, 12))

# Baby Adam: complete infant history; MMR dose 2 target Tue 27 Oct 2026.
visit(adam, date(2026, 7, 28), "Vaccination visit", vtype="vaccination")
visit(adam, date(2026, 10, 12), "Well-baby review")
growth[-1]["weight_kg"] = 9.1
give_vaccines(adam)

# Arjun: penicillin allergy, asthma; one unpaid invoice of RM 185.00.
allergies.append(dict(patient=arjun["id"], substance="penicillin", **{"class": "penicillin"}, reaction="urticaria", recorded="2023-05-22"))
va = visit(arjun, date(2026, 10, 5), "Asthma review", fee=False)
invoice(arjun, date(2026, 10, 5), [("FS-C04", 1), ("FS-E01", 1), ("FS-M07", 2)], paid=False, visit=va)
give_vaccines(arjun)

# ---------------------------------------------------------------- generated patients
COUNTS = {"infant": 21, "child": 63, "adolescent": 30}
planted_ids = {p["id"] for p in patients}
OVERDUE_PLANT = {"infant": ["IS-PCV-2", "IS-HEX-3"], "child": ["IS-MMR-2", "IS-HEX-B"], "adolescent": ["IS-MMR-2"]}
plant_left = {k: list(v) for k, v in OVERDUE_PLANT.items()}
ASTHMA_LEFT = {"child": 4, "adolescent": 3}
n = len(patients)
for b, count in COUNTS.items():
    for i in range(count):
        n += 1
        pid = f"SK-P-{n:04d}"
        if b == "infant":
            dob = TODAY - timedelta(days=rnd.randint(40, 360))
        elif b == "child":
            dob = TODAY - timedelta(days=rnd.randint(366, 12 * 365 + 360))
        else:
            dob = TODAY - timedelta(days=rnd.randint(13 * 365 + 5, 17 * 365 + 360))
        culture = rnd.choice(["malay", "malay", "chinese", "indian"])
        sex = rnd.choice("MF")
        while True:
            if culture == "malay":
                first = rnd.choice(MALAY_M if sex == "M" else MALAY_F)
                name = f"{first} {'bin' if sex == 'M' else 'binti'} {rnd.choice(MALAY_FATHER)}"
                sur = None
            elif culture == "chinese":
                first, sur = rnd.choice(CHINESE_M if sex == "M" else CHINESE_F), rnd.choice(CHINESE_SUR)
                name = f"{sur} {first}"
            else:
                first, sur = rnd.choice(INDIAN_M if sex == "M" else INDIAN_F), rnd.choice(INDIAN_SUR)
                name = f"{first} {sur}"
            if name not in used_names and first not in PLANTED_FIRST and "Mei Ling" not in name:
                break
        kw = dict(registered=iso(max(dob + timedelta(days=rnd.randint(1, 30)), date(2023, 1, 9))))
        if b in ASTHMA_LEFT and ASTHMA_LEFT[b] > 0:
            kw["conditions"] = ["asthma"]
            ASTHMA_LEFT[b] -= 1
        elif b != "infant" and rnd.random() < 0.15:
            kw["conditions"] = [rnd.choice(["allergic rhinitis", "eczema"])]
        r = rnd.random()
        kw["allergy_status"] = "nka" if r < 0.75 else "recorded" if r < 0.95 else "unknown"
        gaps = ()
        if plant_left.get(b):  # only where the row's target has passed, so the gap is a confirmed past-target dose
            row = next(r for r in T["immunisation"] if r["id"] == plant_left[b][0])
            if add_months(dob, int(row["target"].split()[0])) < TODAY - timedelta(days=14):
                gaps = (plant_left[b].pop(0),)
        p = new_patient(pid, name, first, dob, sex, culture, sur or "", **kw)
        if p["allergy_status"] == "recorded":
            a = rnd.choice([("penicillin", "penicillin"), ("peanut", "food"), ("house dust mite", "environmental")])
            allergies.append(dict(patient=pid, substance=a[0], **{"class": a[1]}, reaction=rnd.choice(["rash", "urticaria", "sneezing"]), recorded=p["registered"]))
        for _ in range(rnd.randint(1, 3)):
            d = TODAY - timedelta(days=rnd.randint(3, 180))
            if d < date.fromisoformat(p["registered"]):
                continue
            visit(p, d, rnd.choice(DIAG[b]), follow=rnd.choice([None, None, 7, 14]) if d > TODAY - timedelta(days=20) else None,
                  paid=rnd.random() > 0.08)
        give_vaccines(p, gaps=gaps)

# Confidential notes for some adolescents (Dr Priya's patients).
for p in [x for x in patients if band(date.fromisoformat(x["dob"])) == "adolescent" and x["id"] != hana["id"]][:6]:
    notes.append(dict(id=f"SK-CN-{len(notes) + 1:05d}", patient=p["id"], author="PD-02-02", date=iso(TODAY - timedelta(days=rnd.randint(10, 150))),
                      note="HEADSS conversation recorded; details kept in the confidential view."))

# Follow-up actions for recent closed visits with an interval (OP-11), except Aiman's (planted above).
for v in visits:
    if v["follow_up_days"] and v["status"] == "closed" and v["patient"] != aiman["id"]:
        tgt = date.fromisoformat(v["date"]) + timedelta(days=v["follow_up_days"])
        if tgt >= TODAY:
            actions.append(dict(id=f"SK-ACT-{len(actions) + 1:05d}", type="book_follow_up", owner="FD-02-01", patient=v["patient"], ref=v["id"],
                                doctor=v["doctor"], target_date=iso(tgt), status="open", created=v["closed_at"], clause="OP-11",
                                text=f"Book the {v['follow_up_days']}-day follow-up from the {v['date']} visit"))

# ---------------------------------------------------------------- appointments, next three weeks
SL = T["slot_minutes"]
WEEKLY, SAT = T["weekly"], T["saturday_rota"]
by_doc = {d: [p for p in patients if p["doctor"] == d] for d in DOC.values()}


def session_doctors(d, s):
    k = iso(d)
    if k in T["holidays"] or d.weekday() == 6:
        return []
    if d.weekday() == 5:
        return [SAT[k]] if s == "AM" and k in SAT else []
    return WEEKLY[["Mon", "Tue", "Wed", "Thu", "Fri"][d.weekday()]][s]


def book(p, doc, d, start, length, vtype, status):
    appointments.append(dict(id=f"SK-APT-{len(appointments) + 1:05d}", patient=p["id"], doctor=doc, date=iso(d), start=start, minutes=length,
                             visit_type=vtype, status=status, channel=rnd.choice(["phone", "walk-in", "WhatsApp", "online form"]), guardian=p["guardian"],
                             created_by="FD-02-01"))


FULL = ("PD-02-01", date(2026, 10, 27), "AM")
for k in range(0, 22):
    d = TODAY + timedelta(days=k)
    for s in ("AM", "PM"):
        for doc in session_doctors(d, s):
            start, end = (9 * 60, 13 * 60) if s == "AM" else (14 * 60, 17 * 60)
            if (doc, d, s) == FULL:
                t = start
                while t + 20 <= end:
                    book(rnd.choice(by_doc[doc]), doc, d, f"{t // 60:02d}:{t % 60:02d}", 20, "follow_up", "confirmed")
                    t += 20
                continue
            t = start + 10 * rnd.randint(0, 3)
            if doc == "PD-02-01" and d == date(2026, 11, 2) and s == "AM":
                t = 9 * 60 + 40  # 9:00am stays free for Aiman's follow-up
            for _ in range(rnd.randint(2, 6)):
                vt = rnd.choice(["follow_up", "follow_up", "sick_visit", "vaccination"])
                ln = SL[vt]
                if t + ln > end:
                    break
                if d == TODAY and doc == "PD-02-01" and t < 10 * 60:
                    t = 10 * 60
                book(rnd.choice(by_doc[doc]), doc, d, f"{t // 60:02d}:{t % 60:02d}", ln, vt, "confirmed" if k < 2 or rnd.random() < 0.7 else "pending")
                t += ln + 10 * rnd.randint(1, 4)

meta = dict(now=NOW, today=iso(TODAY), now_label=T["values"]["demo_now_label"], seed=42)
files = dict(patients=patients, guardians=guardians, visits=visits, growth=growth, allergies=allergies, vaccinations=vaccinations,
             prescriptions=prescriptions, confidential_notes=notes, invoices=invoices, payments=payments, appointments=appointments,
             requests=requests, actions=actions, meta=meta)

# ---------------------------------------------------------------- assertions: every benchmark question has its records
P = {p["id"]: p for p in patients}
assert len(patients) == 120, len(patients)
assert age(date(2022, 6, 8))[0] == 4 and age(date(2011, 5, 14))[0] == 15 and age(date(2020, 2, 10))[0] == 6
assert age(date(2019, 3, 3))[0] == 7 and age(date(2025, 10, 27)) == (0, 11) and age(date(2017, 4, 12))[0] == 9
assert [g for g in growth if g["patient"] == "SK-P-0001"][-1] == dict(patient="SK-P-0001", date="2026-10-19", weight_kg=12.0)
assert [v for v in visits if v["patient"] == "SK-P-0001" and v["status"] == "open"][0]["indication"] == "confirmed_gas"
assert max(g["date"] for g in growth if g["patient"] == "SK-P-0003") == "2026-06-15"
assert not any(v["patient"] == "SK-P-0003" and v["schedule_id"] == "IS-PCV-B" for v in vaccinations)
assert not any(v["patient"] == "SK-P-0004" and v["date"] < "2024-02-12" for v in vaccinations) and not ryan["history_complete"]
inv = [i for i in invoices if i["patient"] == "SK-P-0006"]
assert len(inv) == 1 and sum(l["sen"] * l["qty"] for l in inv[0]["lines"]) == 18500 and not any(x["invoice"] == inv[0]["id"] for x in payments)
assert sum(1 for a in appointments if a["doctor"] == "PD-02-01" and a["date"] == "2026-10-27" and a["start"] < "13:00") == 12
assert not any(a["doctor"] == "PD-02-01" and a["date"] == "2026-11-02" and a["start"] < "09:40" for a in appointments)
assert all(any("asthma" in p["conditions"] and p["doctor"] == d for p in patients) for d in ("PD-02-01", "PD-02-02"))
assert not any("asthma" in p["conditions"] and p["doctor"] == "PD-01-01" for p in patients)
assert all(not v for v in plant_left.values()), plant_left
assert len({p["name"] for p in patients}) == 120
assert sum(1 for p in patients if p["first"] in PLANTED_FIRST) == 6
for name, value in files.items():
    json.dump(value, open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8"), indent=1)
print(f"done: {len(patients)} patients, {len(visits)} visits, {len(vaccinations)} vaccinations, {len(invoices)} invoices, "
      f"{len(appointments)} appointments, {len(actions)} actions")
