"""Generate the demo booking records for Subang Badminton Arena.

Writes badminton_bookings.json: 12 courts, bookings from Mon 12 Oct to Mon 26 Oct 2026,
in every status (held, held with a receipt uploaded, expired hold, confirmed, cancellation
pending, completed, no-show, cancelled, released). The benchmark runs on this file with
demo "now" fixed at Fri 16 Oct 2026, 10:00. The pages move it to the week they are opened,
so the seed runs a few days either side of the 8-day booking window (Booking Policy B1).

Records the Answer Key names, with their known answers built in:
- BK-2041  confirmed, Court 3, Sun 18 Oct, 10:00 to 12:00, Daniel Tan, mobile ending 6789,
           deposit RM 50 paid, court fee RM 50 due after the session.
- BK-2032  Court 7, Thu 15 Oct, 20:00 to 21:00, Daniel Tan, not checked in (no-show).
- BK-2050  held and expired: Court 2, Sat 17 Oct, 09:00 to 10:00, Mei Ling, mobile ending
           4321, requested 09:00 today, hold expired 09:30, no payment reported.
- Court 5 on Sat 17 Oct is free from 18:00 to 23:00 and taken either side.
- Courts 9 and 11 are free on Sat 17 Oct from 19:00 to 23:00 (the alternatives for F2).
Booking references are issued by code from meta.next_ref (BK-2051 is the next one).

Rules kept: sessions start on the hour, 1 to 3 hours, inside 07:00 to 01:00 (hour 24 is the
00:00 start, hour 25 is 01:00); no two active bookings overlap on a court; fees from the
fee table (RM 20 weekday, RM 25 weekend per court per hour); RM 50 deposit on every booking.
"""

import json
import os
import random
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
random.seed(16)

NOW = datetime(2026, 10, 16, 10, 0)
TODAY = NOW.date()
START, END = date(2026, 10, 12), date(2026, 10, 26)
COURTS = list(range(1, 13))
OPEN_H, CLOSE_H = 7, 25           # 07:00 to 01:00
HOLIDAYS = []                     # public holidays in the seed period: none (12 to 26 Oct 2026)
RATE_WEEKDAY, RATE_WEEKEND, DEPOSIT = 20, 25, 50
HOLD_MIN = 30

NAMES = [
    "Ahmad Faizal", "Siti Aminah", "Muhammad Danial", "Nur Izzati", "Hafiz Rahman", "Farah Nadia",
    "Azlan Yusof", "Rohana Ismail", "Zulkifli Omar", "Aina Sofea", "Syafiq Hassan", "Nabila Huda",
    "Tan Wei Jie", "Lim Kah Hoe", "Lee Choon Seng", "Chong Mei Yee", "Ng Kok Leong", "Chan Wai Kit",
    "Wong Siew Ling", "Goh Jun Hao", "Ooi Shu Fen", "Yap Chee Keong", "Teoh Li Ying", "Koh Zhi Wei",
    "Raj Kumar", "Priya Devi", "Suresh Murugan", "Kavitha Nair", "Arun Krishnan", "Deepa Menon",
    "Vijay Ramasamy", "Anitha Subramaniam", "Jason Lau", "Michelle Chew", "Kelvin Foo", "Melissa Liew",
]
RESERVED_ENDINGS = {"6789", "4321", "1111", "2222", "3333"}   # used by the Answer Key cases


def mobile():
    while True:
        prefix = random.choice(["012", "013", "016", "017", "018", "019", "011"])
        rest = random.randint(1000000, 9999999) if prefix != "011" else random.randint(10000000, 99999999)
        s = str(rest)
        if s[-4:] in RESERVED_ENDINGS:
            continue
        return f"{prefix}-{s[:-4]} {s[-4:]}"


PLAYERS = [(n, mobile()) for n in NAMES]


def is_weekend(d):
    return d.weekday() >= 5 or d.isoformat() in HOLIDAYS


def fee(d, hours):
    return hours * (RATE_WEEKEND if is_weekend(d) else RATE_WEEKDAY)


def at(d, hour, minute=0):
    return datetime(d.year, d.month, d.day) + timedelta(hours=hour, minutes=minute)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M")


def start_prob(d, h):
    if is_weekend(d):
        return 0.30 if h < 12 else 0.26 if h < 17 else 0.45 if h < 23 else 0.12
    return 0.12 if h < 9 else 0.06 if h < 17 else 0.28 if h < 19 else 0.48 if h < 23 else 0.12


bookings = []


def add(court, d, h, hours, player=None, **extra):
    name, mob = player or random.choice(PLAYERS)
    b = {
        "booking_ref": None, "court": court, "date": d.isoformat(), "start_hour": h, "hours": hours,
        "player_name": name, "mobile": mob, "court_fee_rm": fee(d, hours), "deposit_rm": DEPOSIT,
        "pay_fee_now": False, "amount_due_now_rm": DEPOSIT, "status": "confirmed",
        "requested_at": None, "hold_expires_at": None, "confirmed_at": None,
        "paid": {"deposit_rm": DEPOSIT, "court_fee_rm": 0}, "source": random.choice(["counter", "assistant", "assistant"]),
    }
    b.update(extra)
    if b["pay_fee_now"]:
        b["amount_due_now_rm"] = DEPOSIT + b["court_fee_rm"]
        if b["status"] != "held":
            b["paid"] = {"deposit_rm": DEPOSIT, "court_fee_rm": b["court_fee_rm"]}
    bookings.append(b)
    return b


# ---------- background load ----------
d = START
while d <= END:
    for c in COURTS:
        h = OPEN_H
        while h < CLOSE_H:
            if random.random() < start_prob(d, h):
                hours = random.choices([1, 2, 3], weights=[45, 40, 15])[0]
                hours = min(hours, CLOSE_H - h)
                add(c, d, h, hours, pay_fee_now=random.random() < 0.35)
                h += hours
            else:
                h += 1
    d += timedelta(days=1)


def clear(court, d, h0, h1):
    """Remove background bookings on a court overlapping [h0, h1)."""
    global bookings
    ds = d.isoformat()
    bookings = [b for b in bookings if not (b["booking_ref"] is None and b["court"] == court and b["date"] == ds
                                            and b["start_hour"] < h1 and h0 < b["start_hour"] + b["hours"])]


SAT, SUN = date(2026, 10, 17), date(2026, 10, 18)
DANIEL = ("Daniel Tan", "017-882 6789")

# ---------- the records the Answer Key names ----------
clear(5, SAT, OPEN_H, CLOSE_H)
add(5, SAT, 8, 2)
add(5, SAT, 16, 2)                      # 16:00 to 18:00
add(5, SAT, 23, 2)                      # 23:00 to 01:00; free 18:00 to 23:00
for c in (9, 11):
    clear(c, SAT, 19, 23)

clear(3, SUN, 10, 12)
named = [
    add(3, SUN, 10, 2, DANIEL, booking_ref="BK-2041", source="assistant",
        requested_at="2026-10-14T21:12", confirmed_at="2026-10-14T21:40"),
]
clear(7, date(2026, 10, 15), 20, 21)
named.append(add(7, date(2026, 10, 15), 20, 1, DANIEL, booking_ref="BK-2032", status="no_show", source="assistant",
                 requested_at="2026-10-13T19:05", confirmed_at="2026-10-13T19:31"))
clear(2, SAT, 9, 10)
named.append(add(2, SAT, 9, 1, ("Mei Ling", "012-778 4321"), booking_ref="BK-2050", status="held", source="assistant",
                 requested_at="2026-10-16T09:00", hold_expires_at="2026-10-16T09:30", paid={"deposit_rm": 0, "court_fee_rm": 0}))

# ---------- one of each other status the dashboard shows ----------
TUE, MON = date(2026, 10, 20), date(2026, 10, 19)
specials = [
    # fresh hold, no payment yet (expires 10:20)
    (8, SAT, 14, 1, dict(status="held", source="assistant", requested_at="2026-10-16T09:50", hold_expires_at="2026-10-16T10:20",
                         paid={"deposit_rm": 0, "court_fee_rm": 0})),
    # hold with a receipt uploaded, waiting for staff (receipt in state.receipts)
    (4, SUN, 15, 2, dict(status="held", pay_fee_now=True, source="assistant", requested_at="2026-10-16T09:40",
                         hold_expires_at="2026-10-16T10:10", paid={"deposit_rm": 0, "court_fee_rm": 0}, _receipt=True)),
    # a second expired hold
    (10, MON, 20, 2, dict(status="held", source="assistant", requested_at="2026-10-16T08:30", hold_expires_at="2026-10-16T09:00",
                          paid={"deposit_rm": 0, "court_fee_rm": 0})),
    # confirmed, cancellation pending (in state.cancellations)
    (6, TUE, 21, 1, dict(source="assistant", requested_at="2026-10-15T12:10", confirmed_at="2026-10-15T12:35", _cancel=True)),
    # cancelled and released, both earlier this week
    (1, date(2026, 10, 19), 19, 2, dict(status="cancelled", source="assistant", requested_at="2026-10-13T10:00", confirmed_at="2026-10-13T10:20")),
    (12, date(2026, 10, 18), 18, 1, dict(status="released", source="assistant", requested_at="2026-10-15T17:00",
                                         hold_expires_at="2026-10-15T17:30", paid={"deposit_rm": 0, "court_fee_rm": 0})),
    # a second no-show
    (11, date(2026, 10, 14), 21, 1, dict(status="no_show", source="counter")),
]
special_bookings = []
for court, dd, h, hours, extra in specials:
    clear(court, dd, h, h + hours)
    flags = {k: extra.pop(k) for k in list(extra) if k.startswith("_")}
    b = add(court, dd, h, hours, **extra)
    b.update(flags)
    special_bookings.append(b)

# ---------- statuses and timestamps for the background ----------
for b in bookings:
    dd = date.fromisoformat(b["date"])
    start = at(dd, b["start_hour"])
    end = start + timedelta(hours=b["hours"])
    if b["requested_at"] is None:
        lead = timedelta(hours=random.randint(3, 96))
        req = min(start - lead, NOW - timedelta(minutes=random.randint(60, 600)))
        req = req.replace(minute=random.choice([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]))
        b["requested_at"] = iso(req)
        b["confirmed_at"] = iso(req + timedelta(minutes=random.randint(5, 28)))
    if b["status"] == "confirmed" and end <= NOW:
        b["status"] = "completed"
        if not b["pay_fee_now"]:
            b["paid"]["court_fee_rm"] = b["court_fee_rm"]

# ---------- references: named ones fixed, others in request order from BK-1001 ----------
others = sorted([b for b in bookings if b["booking_ref"] is None], key=lambda b: (b["requested_at"], b["date"], b["court"]))
for i, b in enumerate(others):
    b["booking_ref"] = f"BK-{1001 + i}"
assert 1001 + len(others) <= 2032, "background references would reach the named ones"

receipts, cancellations = [], []
for b in special_bookings:
    if b.pop("_receipt", False):
        receipts.append({
            "receipt_id": "RC-001", "booking_ref": b["booking_ref"], "image": "images/receipt-seed.png",
            "uploaded_at": "2026-10-16T09:48",
            "fields": {"document_type": "payment_receipt", "amount_rm": b["amount_due_now_rm"], "reference": b["booking_ref"],
                       "paid_at": "2026-10-16T09:46", "recipient": "Subang Badminton Arena"},
            "differences": [], "status": "to_check",
        })
    if b.pop("_cancel", False):
        cancellations.append({
            "cancellation_id": "CX-001", "booking_ref": b["booking_ref"], "requested_at": "2026-10-16T08:40",
            "refund": {"deposit_rm": DEPOSIT, "court_fee_rm": b["paid"]["court_fee_rm"], "total_rm": DEPOSIT + b["paid"]["court_fee_rm"]},
            "status": "pending",
        })

bookings.sort(key=lambda b: (b["date"], b["court"], b["start_hour"]))

# ---------- what staff see in Follow up for the seed's own items ----------
# Staff cannot see the chat, so each item carries the chat contact, the player's words and what
# the player was told, as the tools record them for live conversations.
def chat_of(b):
    return {"channel": "WhatsApp", "chat_id": "WA-" + b["booking_ref"], "mobile": b["mobile"]}
def held_told(b):
    return (f"Court {b['court']} is held for you, not confirmed yet. Booking reference {b['booking_ref']}. Please pay RM {b['amount_due_now_rm']} "
            f"by DuitNow QR with {b['booking_ref']} as the payment reference, and upload the receipt here by {b['hold_expires_at'][11:]}. "
            "Staff confirm once they find the payment.\nBooking Policy, Clause B11 · Booking Policy, Clause B12")
by_ref = {b["booking_ref"]: b for b in bookings}
for b in [by_ref["BK-2050"]] + [x for x in special_bookings if x["status"] == "held"]:
    b["contact"] = chat_of(b)
    b["question"] = f"Can I book Court {b['court']} on {date.fromisoformat(b['date']).strftime('%a %d %b')} at {b['start_hour'] % 24:02d}:00 for {b['hours']} hour{'s' if b['hours'] > 1 else ''}? Name {b['player_name']}, {b['mobile']}."
    b["told_player"] = held_told(b)
for r in receipts:
    b = by_ref[r["booking_ref"]]
    r.update(contact=chat_of(b), question="Here is my payment receipt.",
             told_player="Thanks, I've recorded your receipt for staff to check. Your court stays held until they find the payment, and you'll get a message here when it's confirmed.\nBooking Policy, Clause B12 · Booking Policy, Clause B23")
for c in cancellations:
    b = by_ref[c["booking_ref"]]
    c.update(contact=chat_of(b), question="Yes, please go ahead and cancel.",
             told_player=f"I've submitted your cancellation request for {b['booking_ref']}. It's pending staff approval, and the booking stays in place until they approve it. You'll get a message here once they do.\nCancellation Policy, Clause C3 · Cancellation Policy, Clause C8")

# ---------- checks ----------
ACTIVE = {"held", "confirmed", "completed", "no_show"}
for c in COURTS:
    for ds in {b["date"] for b in bookings}:
        hours = []
        for b in bookings:
            if b["court"] == c and b["date"] == ds and b["status"] in ACTIVE:
                hours += list(range(b["start_hour"], b["start_hour"] + b["hours"]))
        assert len(hours) == len(set(hours)), f"overlap on court {c} {ds}"
for b in bookings:
    assert 1 <= b["hours"] <= 3 and OPEN_H <= b["start_hour"] and b["start_hour"] + b["hours"] <= CLOSE_H
    assert b["requested_at"] <= iso(NOW), b
refs = [b["booking_ref"] for b in bookings]
assert len(refs) == len(set(refs))
by = {b["booking_ref"]: b for b in bookings}
assert by["BK-2041"]["court_fee_rm"] == 50 and by["BK-2041"]["mobile"].endswith("6789")
assert by["BK-2050"]["status"] == "held" and by["BK-2050"]["hold_expires_at"] == "2026-10-16T09:30"
sat5 = [h for b in bookings if b["court"] == 5 and b["date"] == "2026-10-17" and b["status"] in ACTIVE
        for h in range(b["start_hour"], b["start_hour"] + b["hours"])]
assert not set(range(18, 23)) & set(sat5) and 17 in sat5 and 23 in sat5

state = {
    "meta": {
        "centre": "Subang Badminton Arena", "courts": COURTS, "open_hour": OPEN_H, "close_hour": CLOSE_H,
        "rates_rm": {"weekday": RATE_WEEKDAY, "weekend": RATE_WEEKEND}, "deposit_rm": DEPOSIT, "hold_minutes": HOLD_MIN,
        "public_holidays": HOLIDAYS, "seed_now": iso(NOW), "seed_start": START.isoformat(), "seed_end": END.isoformat(),
        "next_ref": 2051,
    },
    "bookings": bookings, "receipts": receipts, "cancellations": cancellations,
    "handovers": [], "uploads": [], "messages": [],
}
with open(os.path.join(HERE, "badminton_bookings.json"), "w", encoding="utf-8") as f:
    json.dump(state, f, indent=1)

from collections import Counter
print(f"Wrote badminton_bookings.json: {len(bookings)} bookings, {len(receipts)} receipt, {len(cancellations)} cancellation")
print(dict(Counter(b["status"] for b in bookings)))
