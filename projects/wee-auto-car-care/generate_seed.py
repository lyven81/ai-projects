"""Generate 12-day demo booking seed for Wee Auto Car Care.

Rules enforced:
- 1-hour slots, 10:00-18:00, Mon-Sat, 2 Mar - 14 Mar 2026 (Sundays skipped).
- 3 bays: BAY1 (tyre), BAY2 (general), BAY3 (alignment).
- 3 mechanics: Shamsul (senior), Vishnu (general), Albert (junior).
- Multi-slot: service duration > 60 min books consecutive slots on same bay + mechanic.
- No day 100% booked, at least 1 slot has a free mechanic.
- Each mechanic keeps at least 2 free slots per day.
- Ready time vs next-bookable time kept separate (hour-aligned next bookable).
"""

import json
import math
import os
import random
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))

random.seed(7)

SERVICES = [
    # name, duration_min, price_rm, skill, bay
    ("Tyre Replacement (4 wheels)", 45, 60, "tyre", "BAY1"),
    ("Tyre Replacement (1 wheel)",  20, 20, "tyre", "BAY1"),
    ("Puncture Repair",             30, 25, "tyre", "BAY1"),
    ("Tyre Rotation",               30, 30, "rotation", "BAY1"),
    ("Wheel Balancing",             30, 40, "balancing", "BAY1"),
    ("Hunter Alignment",            60, 80, "alignment", "BAY3"),
    ("Engine Oil Change",           30, 120, "oil", "BAY2"),
    ("Spark Plug Replacement",      45, 90, "spark_plug", "BAY2"),
    ("Engine Diagnostic",           45, 100, "diagnostic", "BAY2"),
    ("Timing Belt Replacement",     180, 450, "timing_belt", "BAY2"),
    ("AC Gas Top-up",               30, 80, "ac_topup", "BAY2"),
    ("AC Service",                  75, 180, "ac_service", "BAY2"),
    ("AC Compressor Repair",        180, 650, "ac_compressor", "BAY2"),
    ("Battery Test",                10, 20, "battery", "BAY2"),
    ("Battery Replacement",         20, 250, "battery", "BAY1"),
]

# Weights: favor bread-and-butter jobs. Rare complex jobs appear 1-2 times.
SERVICE_WEIGHTS = [15, 8, 10, 6, 6, 10, 20, 4, 5, 1, 8, 5, 1, 3, 6]

MECHANICS = {
    "Shamsul": ["oil", "spark_plug", "diagnostic", "timing_belt",
                "ac_topup", "ac_service", "ac_compressor", "battery",
                "tyre", "rotation", "balancing"],
    "Vishnu":  ["tyre", "rotation", "balancing", "alignment",
                "oil", "spark_plug", "ac_topup", "battery"],
    "Albert":  ["tyre", "rotation", "oil", "battery"],
}

SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]

NAMES = [
    "Ahmad Faizal", "Siti Nurhaliza", "Muhammad Danial", "Nur Aisyah",
    "Ismail bin Hussein", "Fatimah binti Abdullah", "Azman Yusof",
    "Rohana Abdul Rahman", "Zainab binti Omar", "Hakim bin Razak",
    "Noraini Ibrahim", "Syafiq Hassan", "Tan Mei Ling", "Lim Boon Keng",
    "Lee Choon Hock", "Chong Ah Fook", "Ng Chee Ming", "Chan Wai Kit",
    "Sarah Wong", "David Lee", "Jessica Tan", "Kenneth Ooi", "Ivy Goh",
    "Melvin Chua", "Raj Kumar", "Ramesh a/l Singh", "Priya Devi",
    "Suresh a/l Murugan", "Anitha Kumari", "Vijay Kumar",
    "Deepa a/p Nair", "Arun Krishnan",
]


def random_plate():
    if random.random() < 0.08:
        return f"WWE {random.randint(100, 999)}"
    prefix = random.choices(["B", "W", "J", "P", "V", "K"],
                            weights=[40, 25, 10, 8, 10, 7])[0]
    letters = "".join(
        random.choices("ABCDEFGHJKLMNPQRSTUVWXYZ",
                       k=random.choice([1, 2, 3]))
    )
    number = random.randint(100, 9999)
    return f"{prefix}{letters} {number}"


def random_phone():
    return (f"01{random.choice([0,1,2,3,6,7,8,9])}-"
            f"{random.randint(100,999)} {random.randint(1000,9999)}")


def slot_hour(slot):
    return int(slot.split(":")[0])


def ready_time(start_slot, duration_min):
    total = slot_hour(start_slot) * 60 + duration_min
    return f"{total // 60:02d}:{total % 60:02d}"


def next_bookable(start_slot, n_slots):
    h = slot_hour(start_slot) + n_slots
    return f"{h:02d}:00"


def slots_needed(duration_min):
    return max(1, math.ceil(duration_min / 60))


def eligible_mechanics(skill):
    return [m for m, skills in MECHANICS.items() if skill in skills]


def generate_open_days():
    out = []
    d = date(2026, 3, 2)
    end = date(2026, 3, 14)
    while d <= end:
        if d.weekday() != 6:  # not Sunday
            out.append(d)
        d += timedelta(days=1)
    return out


# Daily target slot-units (capacity = 24/day). Busier Saturdays.
TARGET = {
    "2026-03-02": 15,  # Mon
    "2026-03-03": 12,  # Tue
    "2026-03-04": 10,  # Wed
    "2026-03-05": 13,  # Thu
    "2026-03-06": 15,  # Fri
    "2026-03-07": 17,  # Sat (busy)
    "2026-03-09": 13,  # Mon
    "2026-03-10": 11,  # Tue
    "2026-03-11": 10,  # Wed
    "2026-03-12": 12,  # Thu
    "2026-03-13": 16,  # Fri
    "2026-03-14": 18,  # Sat (busiest — near max 18)
}


def generate_repeat_customers(n=8):
    return [
        {"name": random.choice(NAMES),
         "plate": random_plate(),
         "phone": random_phone()}
        for _ in range(n)
    ]


def main():
    repeat_customers = generate_repeat_customers()
    bookings = []
    bid = 1

    def make_customer():
        if random.random() < 0.15:
            return dict(random.choice(repeat_customers))
        return {"name": random.choice(NAMES),
                "plate": random_plate(),
                "phone": random_phone()}

    # Multi-slot anchor bookings: hand-placed so the demo clearly shows
    # 2-slot and 3-slot patterns. Date -> list of (start_slot, service_name).
    ANCHORS = {
        "2026-03-02": [("15:00", "Timing Belt Replacement")],         # 3 slots: 15-18
        "2026-03-04": [("10:00", "AC Service")],                      # 2 slots: 10-12
        "2026-03-05": [("13:00", "AC Compressor Repair")],            # 3 slots: 13-16
        "2026-03-06": [("14:00", "AC Service")],                      # 2 slots: 14-16
        "2026-03-07": [("11:00", "Timing Belt Replacement")],         # 3 slots: 11-14
        "2026-03-10": [("10:00", "AC Service")],                      # 2 slots: 10-12
        "2026-03-11": [("13:00", "AC Compressor Repair")],            # 3 slots: 13-16
        "2026-03-13": [("15:00", "AC Service")],                      # 2 slots: 15-17
        "2026-03-14": [("10:00", "Timing Belt Replacement")],         # 3 slots: 10-13
    }

    svc_by_name = {s[0]: s for s in SERVICES}

    for day in generate_open_days():
        date_str = day.isoformat()
        schedule = {"BAY1": [None] * 8, "BAY2": [None] * 8, "BAY3": [None] * 8}
        mech_busy = {m: [False] * 8 for m in MECHANICS}
        placed = 0
        target = TARGET[date_str]
        attempts = 0

        # Phase 1: place anchor multi-slot bookings first.
        for start_slot, svc_name in ANCHORS.get(date_str, []):
            svc = svc_by_name[svc_name]
            name, dur, price, skill, bay = svc
            n = slots_needed(dur)
            start_idx = SLOTS.index(start_slot)
            if any(schedule[bay][start_idx + i] is not None for i in range(n)):
                continue
            eligibles = eligible_mechanics(skill)
            chosen = None
            for m in eligibles:
                if all(not mech_busy[m][start_idx + i] for i in range(n)):
                    chosen = m
                    break
            if not chosen:
                continue
            cust = make_customer()
            booking = {
                "booking_id": f"SVC{bid:03d}",
                "date": date_str,
                "start_slot": SLOTS[start_idx],
                "slots_occupied": n,
                "slot_list": [SLOTS[start_idx + i] for i in range(n)],
                "bay": bay,
                "mechanic": chosen,
                "service": name,
                "duration_minutes": dur,
                "ready_at": ready_time(SLOTS[start_idx], dur),
                "next_bookable_at": next_bookable(SLOTS[start_idx], n),
                "customer_name": cust["name"],
                "plate": cust["plate"],
                "phone": cust["phone"],
                "price_rm": price,
                "status": "confirmed",
            }
            bookings.append(booking)
            bid += 1
            for i in range(n):
                schedule[bay][start_idx + i] = booking["booking_id"]
                mech_busy[chosen][start_idx + i] = True
            placed += n

        # Phase 2: random fill until target reached.
        while placed < target and attempts < 800:
            attempts += 1
            svc = random.choices(SERVICES, weights=SERVICE_WEIGHTS)[0]
            name, dur, price, skill, bay = svc
            n = slots_needed(dur)
            if n > 3:
                continue
            max_start = 8 - n
            start_idx = random.randint(0, max_start)

            # Bay must be free across all occupied slots.
            if any(schedule[bay][start_idx + i] is not None for i in range(n)):
                continue

            # Pick a mechanic with the skill, free across all slots.
            eligibles = eligible_mechanics(skill)
            random.shuffle(eligibles)
            chosen = None
            for m in eligibles:
                if all(not mech_busy[m][start_idx + i] for i in range(n)):
                    chosen = m
                    break
            if not chosen:
                continue

            # Constraint: mechanic retains at least 2 free slots across the day.
            busy_after = sum(mech_busy[chosen]) + n
            if busy_after > 6:
                continue

            cust = make_customer()
            booking = {
                "booking_id": f"SVC{bid:03d}",
                "date": date_str,
                "start_slot": SLOTS[start_idx],
                "slots_occupied": n,
                "slot_list": [SLOTS[start_idx + i] for i in range(n)],
                "bay": bay,
                "mechanic": chosen,
                "service": name,
                "duration_minutes": dur,
                "ready_at": ready_time(SLOTS[start_idx], dur),
                "next_bookable_at": next_bookable(SLOTS[start_idx], n),
                "customer_name": cust["name"],
                "plate": cust["plate"],
                "phone": cust["phone"],
                "price_rm": price,
                "status": "confirmed",
            }
            bookings.append(booking)
            bid += 1
            for i in range(n):
                schedule[bay][start_idx + i] = booking["booking_id"]
                mech_busy[chosen][start_idx + i] = True
            placed += n

    # Stats
    total_units = sum(b["slots_occupied"] for b in bookings)
    capacity = 12 * 8 * 3
    density = round(total_units / capacity * 100, 1)

    # Per-day stats for verification
    day_stats = {}
    for day in generate_open_days():
        ds = day.isoformat()
        day_bookings = [b for b in bookings if b["date"] == ds]
        units = sum(b["slots_occupied"] for b in day_bookings)
        per_mech = {m: 0 for m in MECHANICS}
        slots_full_all_bays = 0
        bay_slot = {"BAY1": [0]*8, "BAY2": [0]*8, "BAY3": [0]*8}
        mech_slot = {m: [0]*8 for m in MECHANICS}
        for b in day_bookings:
            per_mech[b["mechanic"]] += b["slots_occupied"]
            idx = SLOTS.index(b["start_slot"])
            for i in range(b["slots_occupied"]):
                bay_slot[b["bay"]][idx+i] = 1
                mech_slot[b["mechanic"]][idx+i] = 1
        for s in range(8):
            if sum(bay_slot[bb][s] for bb in bay_slot) == 3:
                slots_full_all_bays += 1
        day_stats[ds] = {
            "bookings": len(day_bookings),
            "slot_units": units,
            "pct": round(units / 24 * 100, 1),
            "shamsul_slots": per_mech["Shamsul"],
            "vishnu_slots": per_mech["Vishnu"],
            "albert_slots": per_mech["Albert"],
            "slots_all_3_bays_full": slots_full_all_bays,
        }

    # Customer IDs (16 Oct rebuild): one per distinct phone, in booking order.
    # A booking ID identifies one visit; a customer ID identifies the person
    # across visits. No random draws here, so the seed is unchanged.
    customer_ids = {}
    for b in bookings:
        if b["phone"] not in customer_ids:
            customer_ids[b["phone"]] = f"CUS{len(customer_ids) + 1:03d}"
        b["customer_id"] = customer_ids[b["phone"]]

    result = {
        "meta": {
            "business_name": "Wee Auto Car Care",
            "demo_period_start": "2026-03-02",
            "demo_period_end": "2026-03-14",
            "closed_days": ["2026-03-01 (Sunday)", "2026-03-08 (Sunday)"],
            "operating_hours": "10:00-18:00",
            "slot_duration_minutes": 60,
            "slots_per_day": 8,
            "bays": {
                "BAY1": "Tyre bay (lift, tyre changer, balancer)",
                "BAY2": "General bay (lift, AC machine, OBD scanner)",
                "BAY3": "Alignment bay (Hunter alignment rack)",
            },
            "mechanics": list(MECHANICS.keys()),
            "total_bookings": len(bookings),
            "total_slot_units": total_units,
            "capacity_slot_units": capacity,
            "overall_density_pct": density,
            "day_stats": day_stats,
            "total_customers": len(customer_ids),
        },
        "bookings": bookings,
        # Enquiries the assistant hands to staff (filled at run time).
        "handovers": [],
    }

    out_path = os.path.join(HERE, "workshop_bookings.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Wrote {out_path}")
    print(f"Bookings: {len(bookings)} | Slot-units: {total_units} / {capacity} "
          f"({density}%)")
    for ds, stats in day_stats.items():
        print(f"  {ds}: {stats['bookings']} bookings, "
              f"{stats['slot_units']}/24 ({stats['pct']}%), "
              f"Shamsul={stats['shamsul_slots']} Vishnu={stats['vishnu_slots']} "
              f"Albert={stats['albert_slots']}, "
              f"slots-all-bays-full={stats['slots_all_3_bays_full']}")


if __name__ == "__main__":
    main()
