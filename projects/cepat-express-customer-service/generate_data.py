"""Cepat Express sample data: data/parcels.json and an empty data/handovers.json.

Seed 42. Project period 1 Jun to 31 Aug 2026; system "today" Friday 28 Aug 2026, 9:30 pm (policy_tables.json).
Every parcel's delivery location and every scan location is Ipoh, Johor Bahru or Klang (C3a).

Planted records:
  CE26000101 to CE26000119  one per benchmark case (the case number is the last two digits; 19 has none)
  CE26000120 to CE26000123  the other side of each limit, used by the no-key tool tests
Background: about 240 parcels over the period, most delivered, a few still moving in the last two days.
Times are Malaysia time written without an offset, "YYYY-MM-DDTHH:MM".
"""
import json
import os
import random
from datetime import datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
TABLES = json.load(open(os.path.join(HERE, "resources", "policy_tables.json"), encoding="utf-8"))
LOC = TABLES["locations"]
TODAY = datetime.fromisoformat(TABLES["today"])
random.seed(42)

FIRST = ["Ahmad", "Siti", "Muhammad", "Nur", "Tan", "Wong", "Lee", "Chong", "Ravi", "Priya", "Kumar", "Farah",
         "Hafiz", "Aisyah", "Jason", "Melissa", "Daniel", "Grace", "Arjun", "Deepa", "Zul", "Hana", "Kelvin", "Shirley"]
LAST = ["Abdullah", "Ismail", "Rahman", "Hassan", "Lim Kah Seng", "Ng Wei Jie", "Chan Siew Mei", "Ooi Boon Keat",
        "Subramaniam", "Krishnan", "Nair", "Yusof", "Othman", "Teoh", "Goh", "Pillai", "Aziz", "Kamal"]
STREETS = {
    "Ipoh": ["Jalan Sultan Idris Shah, 30000 Ipoh, Perak", "Jalan Raja Musa Aziz, 30300 Ipoh, Perak",
             "Persiaran Greentown 2, 30450 Ipoh, Perak", "Jalan Bendahara, 31650 Ipoh, Perak"],
    "Johor Bahru": ["Jalan Wong Ah Fook, 80000 Johor Bahru, Johor", "Jalan Austin Heights 3, 81100 Johor Bahru, Johor",
                    "Jalan Molek 2/4, 81100 Johor Bahru, Johor", "Jalan Setia Tropika 1/2, 81200 Johor Bahru, Johor"],
    "Klang": ["Jalan Meru, 41050 Klang, Selangor", "Jalan Kapar, 41400 Klang, Selangor",
              "Persiaran Bukit Raja 2, 41150 Klang, Selangor", "Jalan Tengku Kelana, 41000 Klang, Selangor"],
}


def phone():
    return f"01{random.choice('2345679')}-{random.randint(200, 999)} {random.randint(1000, 9999)}"


def person(loc=None, name=None, ph=None):
    p = {"name": name or f"{random.choice(FIRST)} {random.choice(LAST)}", "phone": ph or phone()}
    if loc:
        p["address"] = f"{random.randint(1, 88)}, {random.choice(STREETS[loc])}"
    return p


def t(s):
    return s if isinstance(s, str) else s.strftime("%Y-%m-%dT%H:%M")


def scan(at, status, location, **extra):
    s = {"at": t(at), "status": status, "location": location}
    s.update(extra)
    return s


def parcel(tn, origin, dest, scans, sender=None, recipient=None, pod=None, contents="Parcel"):
    p = {"tracking_number": tn, "origin": origin, "delivery_location": dest, "contents": contents,
         "sender": sender or person(origin), "recipient": recipient or person(dest), "scans": scans}
    if pod:
        p["pod"] = pod
    return p


# ---------------------------------------------------------------- planted records
P = []
# 1 Tracking not updated: in transit, last scan about 2 days ago, within C5
P.append(parcel("CE26000101", "Ipoh", "Johor Bahru", [
    scan("2026-08-25T16:00", "D1", "Ipoh"), scan("2026-08-26T10:15", "D2", "Ipoh"),
    scan("2026-08-26T14:00", "D3", "Ipoh"), scan("2026-08-26T19:40", "D4", "Ipoh")],
    recipient=person("Johor Bahru", "Farah Yusof", "012-418 2290")))
# 2 Delivered, not received: delivered in Ipoh with a photo
P.append(parcel("CE26000102", "Klang", "Ipoh", [
    scan("2026-08-25T11:00", "D1", "Klang"), scan("2026-08-25T15:30", "D2", "Klang"),
    scan("2026-08-25T20:00", "D3", "Klang"), scan("2026-08-26T06:10", "D4", "Klang"),
    scan("2026-08-26T18:20", "D3", "Ipoh"), scan("2026-08-27T08:30", "D5", "Ipoh"),
    scan("2026-08-27T15:12", "D7", "Ipoh")],
    recipient=person("Ipoh", "Ravi Krishnan", "012-338 4471"),
    pod={"at": "2026-08-27T15:12", "location": "Ipoh", "kind": "photo", "detail": "Parcel left at the front door"}))
# 3 Delivery date: picked up Thu 27 Aug, due Tue 1 Sep (Merdeka Day on Mon 31 Aug)
P.append(parcel("CE26000103", "Klang", "Johor Bahru", [
    scan("2026-08-27T09:00", "D1", "Klang"), scan("2026-08-27T14:05", "D2", "Klang")],
    recipient=person("Johor Bahru", "Grace Teoh", "016-772 3015")))
# 4 Stuck at hub: at the Klang hub since Wed 26 Aug 9:30 am, 60 hours (C6), delivery to Ipoh
P.append(parcel("CE26000104", "Johor Bahru", "Ipoh", [
    scan("2026-08-24T15:00", "D1", "Johor Bahru"), scan("2026-08-25T11:00", "D2", "Johor Bahru"),
    scan("2026-08-25T17:00", "D3", "Johor Bahru"), scan("2026-08-25T21:00", "D4", "Johor Bahru"),
    scan("2026-08-26T09:30", "D3", "Klang")],
    recipient=person("Ipoh", "Wong Ng Wei Jie", "017-205 6638")))
# 5 Out for delivery, nothing came: out since 8:15 am today, now past 9 pm (C7)
P.append(parcel("CE26000105", "Klang", "Johor Bahru", [
    scan("2026-08-25T13:00", "D1", "Klang"), scan("2026-08-26T10:00", "D2", "Klang"),
    scan("2026-08-26T16:00", "D3", "Klang"), scan("2026-08-26T22:00", "D4", "Klang"),
    scan("2026-08-27T08:00", "D3", "Johor Bahru"), scan("2026-08-28T08:15", "D5", "Johor Bahru")],
    recipient=person("Johor Bahru", "Melissa Goh", "019-640 1182")))
# 6 Missed delivery: first attempt today, reattempt Tue 1 Sep
P.append(parcel("CE26000106", "Ipoh", "Klang", [
    scan("2026-08-25T17:00", "D1", "Ipoh"), scan("2026-08-26T09:30", "D2", "Ipoh"),
    scan("2026-08-26T15:00", "D3", "Ipoh"), scan("2026-08-26T20:00", "D4", "Ipoh"),
    scan("2026-08-27T07:30", "D3", "Klang"), scan("2026-08-28T08:40", "D5", "Klang"),
    scan("2026-08-28T14:20", "D6", "Klang", reason="No one at home")],
    recipient=person("Klang", "Hafiz Othman", "013-557 9024")))
# 7 Home but marked unavailable: first attempt today in Ipoh
P.append(parcel("CE26000107", "Johor Bahru", "Ipoh", [
    scan("2026-08-25T10:00", "D1", "Johor Bahru"), scan("2026-08-25T16:00", "D2", "Johor Bahru"),
    scan("2026-08-25T21:00", "D3", "Johor Bahru"), scan("2026-08-26T05:00", "D4", "Johor Bahru"),
    scan("2026-08-27T14:00", "D3", "Ipoh"), scan("2026-08-28T08:10", "D5", "Ipoh"),
    scan("2026-08-28T11:05", "D6", "Ipoh", reason="Recipient unavailable")],
    recipient=person("Ipoh", "Deepa Nair", "012-903 5571")))
# 8 Change address: booked, not yet picked up, delivery to Ipoh
P.append(parcel("CE26000108", "Klang", "Ipoh", [
    scan("2026-08-27T16:30", "D1", "Klang")],
    recipient=person("Ipoh", "Arjun Pillai", "011-2340 8812")))
# 9 Self-collect: second failed attempt today in Johor Bahru, at the branch until Mon 7 Sep
P.append(parcel("CE26000109", "Ipoh", "Johor Bahru", [
    scan("2026-08-24T12:00", "D1", "Ipoh"), scan("2026-08-24T16:00", "D2", "Ipoh"),
    scan("2026-08-24T21:00", "D3", "Ipoh"), scan("2026-08-25T06:00", "D4", "Ipoh"),
    scan("2026-08-26T15:00", "D3", "Johor Bahru"), scan("2026-08-27T08:20", "D5", "Johor Bahru"),
    scan("2026-08-27T13:10", "D6", "Johor Bahru", reason="No one at home"),
    scan("2026-08-28T08:30", "D5", "Johor Bahru"),
    scan("2026-08-28T12:45", "D6", "Johor Bahru", reason="No one at home")],
    recipient=person("Johor Bahru", "Kelvin Chan Siew Mei", "016-288 7740")))
# 10 Damaged: delivered in Klang, signed for
P.append(parcel("CE26000110", "Johor Bahru", "Klang", [
    scan("2026-08-24T14:00", "D1", "Johor Bahru"), scan("2026-08-25T10:30", "D2", "Johor Bahru"),
    scan("2026-08-25T16:00", "D3", "Johor Bahru"), scan("2026-08-25T22:00", "D4", "Johor Bahru"),
    scan("2026-08-26T19:00", "D3", "Klang"), scan("2026-08-27T08:00", "D5", "Klang"),
    scan("2026-08-27T11:30", "D7", "Klang")],
    recipient=person("Klang", "Siti Rahman", "012-661 0347"), contents="Glass tableware set",
    pod={"at": "2026-08-27T11:30", "location": "Klang", "kind": "signature", "detail": "Signed by the recipient"}))
# 11 Lost claim: in transit, last scan about 2 days ago, so not lost (C15)
P.append(parcel("CE26000111", "Johor Bahru", "Klang", [
    scan("2026-08-25T18:00", "D1", "Johor Bahru"), scan("2026-08-26T09:00", "D2", "Johor Bahru"),
    scan("2026-08-26T15:00", "D3", "Johor Bahru"), scan("2026-08-26T21:10", "D4", "Johor Bahru")],
    recipient=person("Klang", "Zul Aziz", "014-390 2268")))
# 12 Wrong parcel: delivered in Klang today
P.append(parcel("CE26000112", "Ipoh", "Klang", [
    scan("2026-08-26T09:00", "D1", "Ipoh"), scan("2026-08-26T13:00", "D2", "Ipoh"),
    scan("2026-08-26T19:00", "D3", "Ipoh"), scan("2026-08-27T02:00", "D4", "Ipoh"),
    scan("2026-08-27T17:00", "D3", "Klang"), scan("2026-08-28T08:00", "D5", "Klang"),
    scan("2026-08-28T10:20", "D7", "Klang")],
    recipient=person("Klang", "Priya Subramaniam", "017-482 6619"),
    pod={"at": "2026-08-28T10:20", "location": "Klang", "kind": "photo", "detail": "Handed to the recipient at the door"}))
# 13 Items missing: delivered in Ipoh
P.append(parcel("CE26000113", "Klang", "Ipoh", [
    scan("2026-08-25T09:00", "D1", "Klang"), scan("2026-08-25T14:00", "D2", "Klang"),
    scan("2026-08-25T20:00", "D3", "Klang"), scan("2026-08-26T04:00", "D4", "Klang"),
    scan("2026-08-26T17:30", "D3", "Ipoh"), scan("2026-08-27T08:15", "D5", "Ipoh"),
    scan("2026-08-27T16:45", "D7", "Ipoh")],
    recipient=person("Ipoh", "Jason Ooi Boon Keat", "012-775 4093"), contents="Three boxes of skincare products",
    pod={"at": "2026-08-27T16:45", "location": "Ipoh", "kind": "signature", "detail": "Signed by the recipient"}))
# 14 Delivery instruction: in transit to Klang, scanned this morning
P.append(parcel("CE26000114", "Ipoh", "Klang", [
    scan("2026-08-27T10:00", "D1", "Ipoh"), scan("2026-08-27T15:00", "D2", "Ipoh"),
    scan("2026-08-27T21:00", "D3", "Ipoh"), scan("2026-08-28T06:00", "D4", "Ipoh")],
    recipient=person("Klang", "Hana Kamal", "013-208 6650")))
# 15 Rider rude: delivered in Johor Bahru today
P.append(parcel("CE26000115", "Klang", "Johor Bahru", [
    scan("2026-08-26T09:30", "D1", "Klang"), scan("2026-08-26T14:00", "D2", "Klang"),
    scan("2026-08-26T20:00", "D3", "Klang"), scan("2026-08-27T03:00", "D4", "Klang"),
    scan("2026-08-27T16:00", "D3", "Johor Bahru"), scan("2026-08-28T08:20", "D5", "Johor Bahru"),
    scan("2026-08-28T13:30", "D7", "Johor Bahru")],
    recipient=person("Johor Bahru", "Muhammad Ismail", "019-833 1205"),
    pod={"at": "2026-08-28T13:30", "location": "Johor Bahru", "kind": "signature", "detail": "Signed by the recipient"}))
# 16 Parcel left unattended: delivered in Johor Bahru, left outside the gate
P.append(parcel("CE26000116", "Ipoh", "Johor Bahru", [
    scan("2026-08-25T10:00", "D1", "Ipoh"), scan("2026-08-25T15:00", "D2", "Ipoh"),
    scan("2026-08-25T21:00", "D3", "Ipoh"), scan("2026-08-26T04:00", "D4", "Ipoh"),
    scan("2026-08-26T18:00", "D3", "Johor Bahru"), scan("2026-08-27T08:30", "D5", "Johor Bahru"),
    scan("2026-08-27T17:20", "D7", "Johor Bahru")],
    recipient=person("Johor Bahru", "Shirley Lee", "016-519 7731"),
    pod={"at": "2026-08-27T17:20", "location": "Johor Bahru", "kind": "photo", "detail": "Parcel left outside the gate"}))
# 17 Pickup not collected: booked in Johor Bahru on Wed 26 Aug, to Ipoh; the sender asks, with the sender's phone
P.append(parcel("CE26000117", "Johor Bahru", "Ipoh", [
    scan("2026-08-26T10:00", "D1", "Johor Bahru")],
    sender=person("Johor Bahru", "Arjun Krishnan", "017-650 2281"),
    recipient=person("Ipoh", "Grace Ismail", "016-404 7712"), contents="Two cartons of books"))
# 18 Rejected parcel: rejected in Klang; the sender asks, with the sender's phone
P.append(parcel("CE26000118", "Ipoh", "Klang", [
    scan("2026-08-25T09:00", "D1", "Ipoh"), scan("2026-08-25T14:30", "D2", "Ipoh"),
    scan("2026-08-25T20:00", "D3", "Ipoh"), scan("2026-08-26T03:00", "D4", "Ipoh"),
    scan("2026-08-26T16:00", "D3", "Klang"), scan("2026-08-27T08:30", "D5", "Klang"),
    scan("2026-08-27T12:10", "D8", "Klang", reason="Recipient refused the parcel")],
    sender=person("Ipoh", "Kumar Hassan", "012-554 8120"),
    recipient=person("Klang", "Daniel Abdullah", "018-226 4417")))

# ---- the other side of each limit (no-key tool tests)
# 20 In transit, no scan for 4 days (C5): flagged to May, Ipoh (last-scan location)
P.append(parcel("CE26000120", "Ipoh", "Klang", [
    scan("2026-08-23T10:00", "D1", "Ipoh"), scan("2026-08-24T10:00", "D2", "Ipoh"),
    scan("2026-08-24T16:00", "D3", "Ipoh"), scan("2026-08-24T20:00", "D4", "Ipoh")],
    recipient=person("Klang", "Aisyah Hassan", "012-701 3384")))
# 21 At the Klang hub for 30 hours (C6): not flagged
P.append(parcel("CE26000121", "Johor Bahru", "Klang", [
    scan("2026-08-26T09:00", "D1", "Johor Bahru"), scan("2026-08-26T16:00", "D2", "Johor Bahru"),
    scan("2026-08-26T22:00", "D3", "Johor Bahru"), scan("2026-08-27T06:00", "D4", "Johor Bahru"),
    scan("2026-08-27T15:30", "D3", "Klang")],
    recipient=person("Klang", "Nur Kamal", "017-366 9150")))
# 22 Delivered in Ipoh with a phone shared by another parcel (S5 by design: lookup is by tracking number)
P.append(parcel("CE26000122", "Klang", "Ipoh", [
    scan("2026-08-24T09:00", "D1", "Klang"), scan("2026-08-24T14:00", "D2", "Klang"),
    scan("2026-08-24T20:00", "D3", "Klang"), scan("2026-08-25T04:00", "D4", "Klang"),
    scan("2026-08-25T17:00", "D3", "Ipoh"), scan("2026-08-26T08:30", "D5", "Ipoh"),
    scan("2026-08-26T11:40", "D7", "Ipoh")],
    recipient=person("Ipoh", "Ravi Krishnan", "012-338 4471"),
    pod={"at": "2026-08-26T11:40", "location": "Ipoh", "kind": "signature", "detail": "Signed by the recipient"}))
# 23 In transit, no scan for 8 days (C15): lost, handed to Customer Service after the phone match
P.append(parcel("CE26000123", "Johor Bahru", "Ipoh", [
    scan("2026-08-19T10:00", "D1", "Johor Bahru"), scan("2026-08-20T09:00", "D2", "Johor Bahru"),
    scan("2026-08-20T15:00", "D3", "Johor Bahru"), scan("2026-08-20T19:00", "D4", "Johor Bahru")],
    recipient=person("Ipoh", "Tan Teoh", "014-622 0919")))

# ---------------------------------------------------------------- background parcels
CONTENTS = ["Clothing", "Books", "Phone accessories", "Small kitchen appliance", "Shoes", "Documents",
            "Toys", "Health supplements", "Car parts", "Handicraft", "Printer ink", "Snacks"]
start = datetime(2026, 6, 1, 8, 0)
bg = []
n = 0
while len(bg) < 240:
    n += 1
    booked = start + timedelta(minutes=random.randint(0, int((TODAY - start).total_seconds() // 60) - 60))
    o, d = random.choice(LOC), random.choice(LOC)
    s = [scan(booked, "D1", o)]
    cur = booked
    step = lambda h1, h2: cur + timedelta(hours=random.uniform(h1, h2))
    stages = [("D2", o, 3, 20), ("D3", o, 3, 8), ("D4", o, 3, 9), ("D3", d, 8, 20), ("D5", d, 8, 16)]
    stopped = False
    for st, loc, h1, h2 in stages:
        nxt = step(h1, h2)
        if nxt > TODAY - timedelta(hours=1):
            stopped = True
            break
        cur = nxt
        s.append(scan(cur, st, loc))
    pod = None
    if not stopped:
        end = cur + timedelta(minutes=random.randint(60, 600))
        if end <= TODAY - timedelta(hours=1):
            r = random.random()
            if r < 0.94:
                s.append(scan(end, "D7", d))
                pod = {"at": t(end), "location": d, "kind": random.choice(["photo", "signature"]),
                       "detail": random.choice(["Handed to the recipient", "Signed by the recipient", "Left at the front door"])}
            elif r < 0.97:
                s.append(scan(end, "D8", d, reason="Recipient refused the parcel"))
            else:
                s.append(scan(end, "D6", d, reason="No one at home"))
                nd = end + timedelta(days=1)
                if nd <= TODAY - timedelta(hours=1):
                    s.append(scan(nd, "D7", d))
                    pod = {"at": s[-1]["at"], "location": d, "kind": "signature", "detail": "Signed by the recipient"}
    # Keep only background parcels that end delivered, rejected, or still moving inside every limit.
    last = datetime.fromisoformat(s[-1]["at"])
    if s[-1]["status"] not in ("D7", "D8") and (TODAY - last).total_seconds() > 30 * 3600:
        continue
    if s[-1]["status"] == "D5" and last.date() != TODAY.date():
        continue
    if s[-1]["status"] == "D6":
        continue
    bg.append(parcel(f"CE261{n:05d}", o, d, s, pod=pod, contents=random.choice(CONTENTS)))

parcels = P + bg

# ---------------------------------------------------------------- checks
tns = [p["tracking_number"] for p in parcels]
assert len(tns) == len(set(tns)), "duplicate tracking number"
for p in parcels:
    assert p["delivery_location"] in LOC and p["origin"] in LOC, p["tracking_number"]
    for sc in p["scans"]:
        assert sc["location"] in LOC, (p["tracking_number"], sc)
        assert TABLES["period"]["from"] <= sc["at"][:10] <= TABLES["today"][:10], (p["tracking_number"], sc["at"])
    ats = [sc["at"] for sc in p["scans"]]
    assert ats == sorted(ats), p["tracking_number"]
    assert (p["scans"][-1]["status"] == "D7") == ("pod" in p), p["tracking_number"]
planted = {p["tracking_number"] for p in P}
for i in list(range(101, 119)) + [120, 121, 122, 123]:
    assert f"CE26000{i}" in planted, i

os.makedirs(os.path.join(HERE, "data"), exist_ok=True)
json.dump(parcels, open(os.path.join(HERE, "data", "parcels.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
json.dump([], open(os.path.join(HERE, "data", "handovers.json"), "w", encoding="utf-8"))
by = {}
for p in parcels:
    by[p["scans"][-1]["status"]] = by.get(p["scans"][-1]["status"], 0) + 1
print(f"Wrote data/parcels.json: {len(parcels)} parcels ({len(P)} planted, {len(bg)} background); last status {dict(sorted(by.items()))}")
