"""Generate the demo fleet and booking records for Kereta Sewa Jalan-jalan.

Writes car_rental_bookings.json (the records only the tools reach) and two MCP resources in
resources/: Car Inventory.md (inventory://cars, with its page Car Inventory.html) and
schedule.json (schedule://availability, free or taken per car per day, no customer details).

Fleet: 56 cars from the approved Car Inventory (VHC001 to VHC056), a plate each, VHC008 and
VHC047 in maintenance through the demo. Bookings 1 Oct to 30 Nov 2026: 45% of car-days booked
in October, 20% in November. The benchmark runs on a fixed "now", Tue 20 Oct 2026, 10:00.

Records the Answer Key names, with their known answers built in:
- KS-2038  rented, Mazda CX-8 VHC045, Sun 18 Oct 10:00 to Wed 21 Oct 12:00, Farid Hakim, mobile ending 8642.
- KS-2039  rented, Toyota Fortuner VHC042, Mon 19 Oct 14:00 to Thu 22 Oct 14:00, Wong Kar Meng, ending 1357.
- KS-2041  confirmed, Toyota Vios VHC033, Sat 24 Oct 10:00 to Mon 26 Oct 10:00 (2 days, RM 400),
           Daniel Tan, ending 6789, deposit paid. Cancelling now refunds RM 100 (R19).
- KS-2044  confirmed, Perodua Myvi VHC014, Wed 21 Oct 09:00 to 17:00 (1 day, RM 120), Siti Aminah,
           ending 4321. Pickup is 23 hours away, so cancelling keeps the deposit (R20).
- KS-2046  pending, deposit not reported, Honda City VHC024, Thu 22 Oct 10:00 to Fri 23 Oct 10:00 (RM 200),
           Arjun Pillai, ending 2468. Receipt R1 matches it (RM 100); receipt R2 does not (RM 50).
- KS-2047, KS-2048  two active bookings for Lim Wei Ming, 016-223 5555, so a third is refused (R8).
- All three Vellfires (VHC050 to VHC052) are taken Sat 24 Oct to Sun 25 Oct; Alphards VHC048 and
  VHC049 are free then (the nearest alternative).
- Kept free 21 Oct to 3 Nov for the booking and price cases: Axia VHC005, Myvi VHC015 and VHC016,
  City VHC025, Alphard VHC048 and VHC049.
Items waiting for staff on the pages: KS-2042 (payment reported without a receipt), KS-2043 (pickup
away from KLIA, delivery charge not set, with its delivery_quote handover), KS-2045 (cancellation
requested). References are issued by code from meta.next_ref (KS-2049 is the next one).

Rules kept: pickup and return on the hour inside 9am to 6pm; at least 2 hours; at most 14 days;
no two active bookings share a day on a car; price from the rates with the caps of R12 to R14;
RM 100 deposit on every booking.
"""

import json
import os
import random
from collections import Counter
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "resources")
os.makedirs(OUT, exist_ok=True)
random.seed(20)

NOW = datetime(2026, 10, 20, 10, 0)
START, END = date(2026, 10, 1), date(2026, 11, 30)
OPEN_H, CLOSE_H = 9, 18
DEPOSIT = 100
TARGET = {10: 0.45, 11: 0.20}      # share of car-days booked per month (Rental Policy, section 10)

# tier: seats, hourly, daily, weekly (Car Inventory, approved 19 Oct)
TIERS = {
    "Standard": (4, 20, 120, 700),
    "Premium": (4, 35, 200, 1200),
    "SUV": (7, 65, 380, 2300),
    "MPV": (7, 120, 700, 4200),
}
MODELS = [  # tier, model, first and last car number
    ("Standard", "Perodua Axia", 1, 10),
    ("Standard", "Perodua Myvi", 11, 20),
    ("Premium", "Honda City", 21, 30),
    ("Premium", "Toyota Vios", 31, 40),
    ("SUV", "Toyota Fortuner", 41, 43),
    ("SUV", "Mazda CX-8", 44, 46),
    ("MPV", "Toyota Alphard", 47, 49),
    ("MPV", "Toyota Vellfire", 50, 52),
    ("Premium", "Toyota Camry", 53, 54),
    ("Premium", "Honda Accord", 55, 56),
]
MAINTENANCE = {"VHC008", "VHC047"}
KEEP_FREE = {"VHC005", "VHC015", "VHC016", "VHC025", "VHC048", "VHC049"}
KEEP_FREE_FROM, KEEP_FREE_TO = date(2026, 10, 21), date(2026, 11, 3)


def price(tier, hours):
    """R12 to R14: hourly up to 5 hours, 6 hours or more is a day; extra hours beyond whole days
    at the hourly rate capped at one more day; whole weeks at the weekly rate, capped at two weeks."""
    _, hourly, daily, weekly = TIERS[tier]
    if hours <= 5:
        return hours * hourly
    days, rem = divmod(hours, 24)
    if days == 0:
        return daily
    weeks, rest = divmod(days, 7)
    return min(weeks * weekly + rest * daily + min(rem * hourly, daily), 2 * weekly)


# the worked examples on the approved Car Inventory page
assert price("Standard", 27) == 180 and price("Standard", 9 * 24) == 940
assert price("Premium", 3 * 24 + 3) == 705 and price("MPV", 48) == 1400 and price("Standard", 4) == 80

LETTERS = "ABCDEFGHJKLMNPRSTVWY"
cars, used_plates = [], set()
for tier, model, a, b in MODELS:
    for n in range(a, b + 1):
        while True:
            plate = f"{random.choice('WVBP')}{random.choice(LETTERS)}{random.choice(LETTERS)} {random.randint(1000, 9999)}"
            if plate not in used_plates:
                used_plates.add(plate)
                break
        cid = f"VHC{n:03d}"
        cars.append({"car_id": cid, "tier": tier, "model": model, "seats": TIERS[tier][0], "plate": plate,
                     "status": "maintenance" if cid in MAINTENANCE else "active"})
cars.sort(key=lambda c: c["car_id"])
CAR = {c["car_id"]: c for c in cars}
assert len(cars) == 56 and Counter(c["tier"] for c in cars) == {"Standard": 20, "Premium": 24, "SUV": 6, "MPV": 6}

NAMES = [
    "Ahmad Faizal", "Nur Izzati", "Hafiz Rahman", "Farah Nadia", "Azlan Yusof", "Rohana Ismail",
    "Zulkifli Omar", "Aina Sofea", "Syafiq Hassan", "Nabila Huda", "Tan Wei Jie", "Lim Kah Hoe",
    "Lee Choon Seng", "Chong Mei Yee", "Ng Kok Leong", "Chan Wai Kit", "Wong Siew Ling", "Goh Jun Hao",
    "Ooi Shu Fen", "Yap Chee Keong", "Raj Kumar", "Priya Devi", "Suresh Murugan", "Kavitha Nair",
    "Arun Krishnan", "Deepa Menon", "Jason Lau", "Michelle Chew", "Kelvin Foo", "Melissa Liew",
    "Emma Clarke", "Hiroshi Tanaka", "Nguyen Thi Lan", "Mark Jensen", "Siti Rahmah", "Kim Min-jun",
]
RESERVED_ENDINGS = {"8642", "1357", "6789", "4321", "2468", "5555", "1111", "2222", "3333"}  # used by the Answer Key


def mobile(international=False):
    while True:
        if international:
            cc, rest = random.choice([("+65", 8), ("+61", 9), ("+44", 10), ("+81", 10), ("+62", 10)])
            s = str(random.randint(10 ** (rest - 1), 10 ** rest - 1))
            num = f"{cc} {s[:-4]} {s[-4:]}"
        else:
            prefix = random.choice(["012", "013", "016", "017", "018", "019", "011"])
            s = str(random.randint(10000000, 99999999) if prefix == "011" else random.randint(1000000, 9999999))
            num = f"{prefix}-{s[:-4]} {s[-4:]}"
        if s[-4:] not in RESERVED_ENDINGS:
            return num


def licence():
    return f"{random.randint(10000000, 99999999)}"


CUSTOMERS = [(n, mobile(international=i >= 30), licence()) for i, n in enumerate(NAMES)]


def at(d, hour):
    return datetime(d.year, d.month, d.day, hour)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def days_of(b):
    d0 = date.fromisoformat(b["pickup_at"][:10])
    d1 = date.fromisoformat(b["return_at"][:10])
    return [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]


bookings = []
taken = {c["car_id"]: set() for c in cars}       # days a car is blocked by an active booking


def add(car_id, pickup, ret, customer=None, **extra):
    car = CAR[car_id]
    hours = int((ret - pickup).total_seconds() // 3600)
    name, mob, lic = customer or random.choice(CUSTOMERS)
    b = {
        "booking_ref": None, "car_id": car_id, "tier": car["tier"], "model": car["model"],
        "pickup_at": iso(pickup), "return_at": iso(ret), "hours": hours,
        "pickup_place": "KLIA", "return_place": "KLIA", "delivery": None,
        "customer_name": name, "mobile": mob, "licence_no": lic,
        "price_rm": price(car["tier"], hours), "deposit_rm": DEPOSIT,
        "status": "confirmed", "requested_at": None, "confirmed_at": None,
        "payment": {"reported": "receipt", "reported_at": None, "deposit_paid_rm": DEPOSIT},
        "source": random.choice(["counter", "agent", "agent"]),
    }
    b.update(extra)
    days = set(days_of(b))
    assert not days & taken[car_id], f"{car_id} already taken on {sorted(days & taken[car_id])}"
    if b["status"] not in ("cancelled", "rejected"):
        taken[car_id] |= days
    bookings.append(b)
    return b


def unpaid():
    return {"reported": None, "reported_at": None, "deposit_paid_rm": 0}


# ---------- the records the Answer Key names ----------
FARID = ("Farid Hakim", "019-334 8642", "71820445")
WONG = ("Wong Kar Meng", "016-778 1357", "60293318")
DANIEL = ("Daniel Tan", "017-882 6789", "88104526")
SITI = ("Siti Aminah", "012-778 4321", "50738812")
ARJUN = ("Arjun Pillai", "011-2345 2468", "93051174")
LIM = ("Lim Wei Ming", "016-223 5555", "47719920")
D = date
named = [
    add("VHC045", at(D(2026, 10, 18), 10), at(D(2026, 10, 21), 12), FARID, booking_ref="KS-2038", status="rented",
        source="agent", requested_at="2026-10-12T15:20", confirmed_at="2026-10-12T16:05"),
    add("VHC042", at(D(2026, 10, 19), 14), at(D(2026, 10, 22), 14), WONG, booking_ref="KS-2039", status="rented",
        source="agent", requested_at="2026-10-14T11:02", confirmed_at="2026-10-14T11:40"),
    add("VHC033", at(D(2026, 10, 24), 10), at(D(2026, 10, 26), 10), DANIEL, booking_ref="KS-2041",
        source="agent", requested_at="2026-10-17T20:14", confirmed_at="2026-10-18T09:20"),
    add("VHC014", at(D(2026, 10, 21), 9), at(D(2026, 10, 21), 17), SITI, booking_ref="KS-2044",
        source="agent", requested_at="2026-10-18T13:30", confirmed_at="2026-10-18T14:02"),
    add("VHC024", at(D(2026, 10, 22), 10), at(D(2026, 10, 23), 10), ARJUN, booking_ref="KS-2046", status="pending",
        source="agent", requested_at="2026-10-20T09:35", payment=unpaid()),
    add("VHC003", at(D(2026, 10, 23), 10), at(D(2026, 10, 25), 10), LIM, booking_ref="KS-2047", status="pending",
        source="agent", requested_at="2026-10-19T16:20",
        payment={"reported": "receipt", "reported_at": "2026-10-19T16:31", "deposit_paid_rm": 0}),
    add("VHC004", at(D(2026, 10, 31), 9), at(D(2026, 11, 2), 18), LIM, booking_ref="KS-2048",
        source="agent", requested_at="2026-10-15T10:10", confirmed_at="2026-10-15T10:45"),
]
for cid in ("VHC050", "VHC051", "VHC052"):
    add(cid, at(D(2026, 10, 24), 10), at(D(2026, 10, 25), 18))

# ---------- items waiting for staff on the pages ----------
named += [
    add("VHC035", at(D(2026, 10, 22), 12), at(D(2026, 10, 24), 12), ("Emma Clarke", "+44 7700 900417", "UK-CLARK804159"),
        booking_ref="KS-2042", status="pending", source="agent", requested_at="2026-10-20T08:50",
        payment={"reported": "word", "reported_at": "2026-10-20T09:05", "deposit_paid_rm": 0}),
    add("VHC041", at(D(2026, 10, 23), 9), at(D(2026, 10, 25), 17), ("Hafiz Rahman", "013-905 7714", "62019937"),
        booking_ref="KS-2043", status="pending", source="agent", requested_at="2026-10-20T09:12", payment=unpaid(),
        pickup_place="Sunway Pyramid Hotel, Bandar Sunway", delivery={"pickup": True, "return": False, "charge_rm": None}),
    add("VHC026", at(D(2026, 10, 27), 10), at(D(2026, 10, 29), 10), ("Priya Devi", "018-660 3021", "35180264"),
        booking_ref="KS-2045", status="cancellation_requested", source="agent",
        requested_at="2026-10-16T19:40", confirmed_at="2026-10-17T09:15"),
]

# ---------- background load, filled to the October and November targets ----------
def month_days(m):
    return [d for d in (START + timedelta(days=i) for i in range((END - START).days + 1)) if d.month == m]


def booked(m):
    return sum(1 for cid in taken for d in taken[cid] if d.month == m)


def blocked(cid, days):
    if cid in MAINTENANCE and days[-1] >= D(2026, 10, 12):
        return True                                   # in maintenance from 12 Oct
    if cid in KEEP_FREE and days[-1] >= KEEP_FREE_FROM and days[0] <= KEEP_FREE_TO:
        return True
    return any(d in taken[cid] or d - timedelta(days=1) in taken[cid] or d + timedelta(days=1) in taken[cid] for d in days)


for m in (10, 11):
    target = round(TARGET[m] * len(cars) * len(month_days(m)))
    tries = 0
    while booked(m) < target and tries < 20000:
        tries += 1
        d0 = random.choice(month_days(m))
        length = random.choices([0, 1, 2, 3, 4, 5, 7, 10], weights=[8, 20, 22, 18, 12, 8, 8, 4])[0]
        d1 = d0 + timedelta(days=length)
        if d1 > END:
            continue
        cid = random.choice(cars)["car_id"]
        days = [d0 + timedelta(days=i) for i in range(length + 1)]
        if blocked(cid, days):
            continue
        h0 = random.choice(range(OPEN_H, CLOSE_H - 1))
        h1 = random.choice(range(max(OPEN_H, h0 + 2) if length == 0 else OPEN_H, CLOSE_H + 1))
        if length == 0 and h1 - h0 < 2:
            continue
        b = add(cid, at(d0, h0), at(d1, h1))
        if random.random() < 0.08:
            b["pickup_place"] = random.choice(["Hotel in Putrajaya", "Condominium, Cyberjaya", "Office, Bangsar South", "Hotel, KL Sentral"])
            b["delivery"] = {"pickup": True, "return": random.random() < 0.5, "charge_rm": random.choice([48, 52, 61, 66, 74])}
    assert booked(m) >= target, f"month {m}: {booked(m)} of {target} car-days"

# a few cancelled and rejected requests (they free their days, so they are added on free days)
for status in ["cancelled"] * 6 + ["rejected"] * 3:
    while True:
        d0 = random.choice(month_days(10)[5:] + month_days(11)[:10])
        cid = random.choice(cars)["car_id"]
        if not blocked(cid, [d0, d0 + timedelta(days=1)]):
            add(cid, at(d0, 10), at(d0 + timedelta(days=1), 10), status=status,
                payment=unpaid() if status == "rejected" else {"reported": "receipt", "reported_at": None, "deposit_paid_rm": DEPOSIT})
            break

# ---------- statuses and timestamps for the background ----------
for b in bookings:
    if b["booking_ref"] is not None:
        continue
    pickup = datetime.fromisoformat(b["pickup_at"])
    ret = datetime.fromisoformat(b["return_at"])
    lead = timedelta(hours=random.randint(26, 24 * 14))
    req = min(pickup - lead, NOW - timedelta(hours=random.randint(26, 24 * 5)))
    req = req.replace(minute=random.choice(range(0, 60, 5)))
    b["requested_at"] = iso(req)
    if b["status"] == "rejected":
        continue
    b["confirmed_at"] = iso(req + timedelta(minutes=random.randint(10, 90)))
    if b["status"] == "cancelled":
        continue
    if ret <= NOW:
        b["status"] = "returned"
    elif pickup <= NOW:
        b["status"] = "rented"
    if b["payment"]["reported_at"] is None and b["payment"]["reported"]:
        b["payment"]["reported_at"] = iso(req + timedelta(minutes=random.randint(3, 9)))

# ---------- references: named ones fixed, others in request order from KS-1001 ----------
others = sorted([b for b in bookings if b["booking_ref"] is None], key=lambda b: (b["requested_at"], b["car_id"]))
for i, b in enumerate(others):
    b["booking_ref"] = f"KS-{1001 + i}"
assert 1001 + len(others) <= 2038, "background references would reach the named ones"
bookings.sort(key=lambda b: (b["pickup_at"], b["car_id"]))
by = {b["booking_ref"]: b for b in bookings}

# ---------- waiting for staff: the cancellation request and the delivery handover ----------
cancellations = [{
    "cancellation_id": "CX-001", "booking_ref": "KS-2045", "requested_at": "2026-10-19T21:10",
    "refund_rm": DEPOSIT, "clause": "R19", "status": "pending",
}]
k43 = by["KS-2043"]
handovers = [{
    "handover_id": "HO-001", "reason": "delivery_quote", "urgent": False,
    "customer": {"name": k43["customer_name"], "mobile": k43["mobile"]}, "booking": "KS-2043",
    "customer_asked": "Toyota Fortuner from Fri 23 Oct 9am to Sun 25 Oct 5pm, picked up at Sunway Pyramid Hotel, Bandar Sunway.",
    "agent_told": "The request KS-2043 blocks the car until staff confirm it. Pickup away from KLIA costs RM 1 per km from KLIA; staff set the charge (R11).",
    "clauses": ["R6", "R11"], "time": "2026-10-20T09:12", "status": "open",
}]
# One urgent item for the staff page: a rented car that broke down on the road.
on_road = next(b for b in bookings if b["status"] == "rented" and b["booking_ref"] < "KS-2000" and b["tier"] == "Premium")
handovers.append({
    "handover_id": "HO-002", "reason": "urgent_on_road", "urgent": True,
    "customer": {"name": on_road["customer_name"], "mobile": on_road["mobile"]}, "booking": on_road["booking_ref"],
    "customer_asked": f"{on_road['model']} broke down on the North-South Expressway near Seremban; hazard lights on, everyone safe.",
    "agent_told": "I've passed this to our staff as urgent, and they will follow up with you here. Please stay in a safe place away from traffic. If anyone is in danger, call 999.",
    "clauses": [], "time": "2026-10-20T09:52", "status": "open",
    "customer_words": "Car broke down on the highway near Seremban, we are on the shoulder, everyone ok", "contact": {"channel": "WhatsApp", "chat_id": "WA-" + on_road["booking_ref"], "mobile": on_road["mobile"]},
})
# The payments already reported on the pending requests, as report_payment records them.
payments = [
    {"payment_id": "PY-001", "booking_ref": "KS-2047", "reported_at": "2026-10-19T16:31", "status": "to_check", "method": "receipt",
     "image": "images/receipt-seed.png", "fields": {"amount_rm": DEPOSIT, "reference": "KS-2047", "paid_at": "2026-10-19T16:29", "recipient": "Kereta Sewa Jalan-jalan Sdn Bhd"},
     "differences": [], "contact": None, "customer_words": "Here is the receipt for KS-2047."},
    {"payment_id": "PY-002", "booking_ref": "KS-2042", "reported_at": "2026-10-20T09:05", "status": "to_check", "method": "word",
     "fields": None, "differences": [], "contact": None, "customer_words": "I've transferred the RM 100 deposit."},
]

# ---------- checks ----------
ACTIVE = {"pending", "confirmed", "rented", "returned", "cancellation_requested"}
for cid in taken:
    days = [d for b in bookings if b["car_id"] == cid and b["status"] in ACTIVE for d in days_of(b)]
    assert len(days) == len(set(days)), f"two bookings share a day on {cid}"
for b in bookings:
    p, r = datetime.fromisoformat(b["pickup_at"]), datetime.fromisoformat(b["return_at"])
    assert OPEN_H <= p.hour <= CLOSE_H and OPEN_H <= r.hour <= CLOSE_H, b
    assert 2 <= b["hours"] <= 14 * 24 and b["requested_at"] <= iso(NOW), b
    assert not (b["car_id"] in MAINTENANCE and r.date() >= D(2026, 10, 12) and b["status"] in ACTIVE), b
refs = [b["booking_ref"] for b in bookings]
assert len(refs) == len(set(refs))
assert by["KS-2041"]["price_rm"] == 400 and by["KS-2041"]["mobile"].endswith("6789")
assert by["KS-2046"]["price_rm"] == 200 and by["KS-2046"]["status"] == "pending"
assert sum(1 for b in bookings if b["mobile"] == LIM[1] and b["status"] in ACTIVE - {"returned"}) == 2


def free(cid, d0, d1):
    return not any(d in taken[cid] for d in (d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)))


assert not any(free(c, D(2026, 10, 24), D(2026, 10, 25)) for c in ("VHC050", "VHC051", "VHC052"))
for c in KEEP_FREE:
    assert free(c, KEEP_FREE_FROM, KEEP_FREE_TO), c
share = {m: booked(m) / (len(cars) * len(month_days(m))) for m in (10, 11)}
assert abs(share[10] - 0.45) < 0.02 and abs(share[11] - 0.20) < 0.02, share

# ---------- the inventory resource and page ----------
inv_md = "# Car Inventory\n\nKereta Sewa Jalan-jalan (fictional demo car rental company at KLIA). 56 cars in 4 tiers. Prices follow Rental Policy R12 to R14.\n\n## Tiers and rates\n\n"
inv_md += "| Tier | Seats | Cars | Hourly | Daily | Weekly |\n|---|---|---|---|---|---|\n"
for t, (seats, h, d_, w) in TIERS.items():
    inv_md += f"| {t} | {seats} | {sum(1 for c in cars if c['tier'] == t)} | RM {h} | RM {d_} | RM {w:,} |\n"
inv_md += "\n## Models\n\n| Tier | Model | Seats | Cars |\n|---|---|---|---|\n"
for tier, model, a, b in MODELS:
    inv_md += f"| {tier} | {model} | {TIERS[tier][0]} | {b - a + 1} |\n"
inv_md += """
## How a rental is priced

- Minimum 2 hours. Up to 5 hours: hours x hourly rate. 6 hours or more counts as one day (R12).
- Beyond whole days, extra hours at the hourly rate, capped at one more day (R13).
- Whole weeks at the weekly rate, remaining days at the daily rate, capped at the two-week rate (R14).
- Longer than 2 weeks goes to staff (R17). Every booking also needs the RM 100 deposit (R5).
- Worked examples: Standard 4 hours RM 80; Standard 1 day 3 hours RM 180; Standard 9 days RM 940.
- Quote prices only from check_availability results, which apply these rules in code.
"""
open(os.path.join(OUT, "Car Inventory.md"), "w", encoding="utf-8").write(inv_md)
inv_rows = "".join(f"<tr><td>{t}</td><td>{s}</td><td>{sum(1 for c in cars if c['tier'] == t)}</td><td>RM {h}</td><td>RM {d_}</td><td>RM {w:,}</td></tr>\n"
                   for t, (s, h, d_, w) in TIERS.items())
model_rows = "".join(f"<tr><td>{tier}</td><td>{model}</td><td>{TIERS[tier][0]}</td><td>{b - a + 1}</td></tr>\n" for tier, model, a, b in MODELS)
policy_css = open(os.path.join(HERE, "build_policies.py"), encoding="utf-8").read().split('CSS = """')[1].split('"""')[0]
inv_html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Car Inventory</title><style>
{policy_css}
</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../car-rental-booking-agent.html" style="color:inherit;text-decoration:none">Kereta Sewa Jalan-jalan Car Rental Agent</a></div><h1>Car Inventory</h1><nav id="toc"></nav></div>
<p><strong>Kereta Sewa Jalan-jalan</strong> is a fictional car rental company at KLIA used for demonstration. This inventory is an MCP resource: the AI agent reads it to explain the tiers and rates, and the booking tools price every rental from it. The rules are in the <a href="Rental Policy.html">Rental Policy</a>.</p>
<h2>1. Tiers and rates</h2>
<table><tr><th>Tier</th><th>Seats</th><th>Cars</th><th>Hourly</th><th>Daily</th><th>Weekly</th></tr>
{inv_rows}</table>
<h2>2. Models</h2>
<table><tr><th>Tier</th><th>Model</th><th>Seats</th><th>Cars</th></tr>
{model_rows}</table>
<h2>3. How a rental is priced</h2>
<table><tr><th>Rule</th><th>How</th></tr>
<tr><td><a href="Rental Policy.html#R12">R12</a></td><td>Minimum 2 hours. Up to 5 hours, hours times the hourly rate. 6 hours or more counts as one day.</td></tr>
<tr><td><a href="Rental Policy.html#R13">R13</a></td><td>Beyond whole days, extra hours at the hourly rate, capped at one more day. Standard, 1 day and 3 hours: RM 120 + RM 60 = RM 180.</td></tr>
<tr><td><a href="Rental Policy.html#R14">R14</a></td><td>Whole weeks at the weekly rate, remaining days at the daily rate, capped at the two-week rate. Standard, 9 days: RM 700 + 2 x RM 120 = RM 940.</td></tr>
<tr><td><a href="Rental Policy.html#R5">R5</a></td><td>Every booking also needs the RM 100 deposit.</td></tr></table>
<footer>&copy; 2026 Lee Yih Ven &middot; Car Inventory</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{{h.id='s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);}});
document.querySelectorAll('table').forEach(t=>{{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);}});
</script></body></html>"""
for text in (inv_md, inv_html):
    assert "—" not in text
open(os.path.join(OUT, "Car Inventory.html"), "w", encoding="utf-8").write(inv_html)

# ---------- the schedule resource: free or taken per car per day, no customer details ----------
all_days = [START + timedelta(days=i) for i in range((END - START).days + 1)]
schedule = {
    "about": "Kereta Sewa Jalan-jalan, 1 Oct to 30 Nov 2026. One letter per day from 1 Oct: F free, T taken (booked or in maintenance). For a quick view only; check_availability decides.",
    "first_day": START.isoformat(), "days": len(all_days),
    "cars": {c["car_id"]: {"tier": c["tier"], "model": c["model"],
                           "days": "".join("T" if (d in taken[c["car_id"]] or (c["car_id"] in MAINTENANCE and d >= D(2026, 10, 12))) else "F" for d in all_days)}
             for c in cars},
}
with open(os.path.join(OUT, "schedule.json"), "w", encoding="utf-8") as f:
    json.dump(schedule, f, indent=1)

state = {
    "meta": {
        "company": "Kereta Sewa Jalan-jalan", "open_hour": OPEN_H, "close_hour": CLOSE_H, "deposit_rm": DEPOSIT,
        "tiers": {t: {"seats": s, "hourly_rm": h, "daily_rm": d_, "weekly_rm": w} for t, (s, h, d_, w) in TIERS.items()},
        "seed_now": iso(NOW), "seed_start": START.isoformat(), "seed_end": END.isoformat(), "next_ref": 2049,
        "duitnow": {"account_name": "Kereta Sewa Jalan-jalan Sdn Bhd (demo)", "qr_image": "images/duitnow-qr.png"},
    },
    "cars": cars, "bookings": bookings, "cancellations": cancellations, "handovers": handovers,
    "payments": payments, "uploads": [], "messages": [],
}
with open(os.path.join(HERE, "car_rental_bookings.json"), "w", encoding="utf-8") as f:
    json.dump(state, f, indent=1)

print(f"Wrote car_rental_bookings.json: {len(cars)} cars, {len(bookings)} bookings; "
      f"car-days booked Oct {share[10]:.1%}, Nov {share[11]:.1%}")
print(dict(Counter(b["status"] for b in bookings)))
