"""Happy Mart order data, seed 42.

Writes data/: catalogue.json, customers.json, orders.json, returns.json, refunds.json, and empty
requests.json, claims.json, handovers.json, call_log.json, plus meta.json (the test "today").
Money in sen, times as Unix seconds (UTC). Fees follow FP1, MP1, MP2 and MP3; sale marks follow MP4 and
MP5; delivery falls within FP2's window (by the 5th working day after the order date, couriers Monday to
Saturday). Then plants the named records HM-100101 to HM-100124 for the 25 use cases and asserts them.
Change the data here, never by hand, so a fresh run gives the same records.
"""
import datetime as dt
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data")
os.makedirs(OUT, exist_ok=True)
T = json.load(open(os.path.join(HERE, "resources", "policy_tables.json"), encoding="utf-8"))
V = T["values"]
NOW = T["now"]
MYT = dt.timezone(dt.timedelta(hours=8))
rng = random.Random(42)


def ts(y, m, d, h=0, mi=0):
    return int(dt.datetime(y, m, d, h, mi, tzinfo=MYT).timestamp())


def mdate(unix):
    return dt.datetime.fromtimestamp(unix, MYT).date()


def is_working(day):
    return day.weekday() < 5 and day.isoformat() not in T["holidays"]


def nth_working_day_after(day, n):
    d, k = day, 0
    while k < n:
        d += dt.timedelta(days=1)
        if is_working(d):
            k += 1
    return d


def fee_for(total_sen, order_unix):
    campaign = mdate(order_unix).isoformat() in T["campaign_days"]
    threshold = V["campaign_free_above_sen"] if campaign else V["free_above_sen"]
    return 0 if total_sen > threshold else V["standard_fee_sen"]


# ---------------------------------------------------------------- catalogue
LINES = {
    "phones and tablets": [("Smartphone", 59900, 199900, ["128GB", "256GB"]), ("Tablet", 49900, 189900, ["64GB", "128GB"]),
                           ("Phone Case", 2000, 8900, ["Black", "Clear", "Blue"]), ("Screen Protector", 2000, 4900, ["Standard"])],
    "laptops and computer accessories": [("Wireless Mouse", 3900, 15900, ["Black", "White"]), ("Mechanical Keyboard", 15900, 45900, ["Red switch", "Brown switch"]),
                                         ("Monitor", 39900, 159900, ["24-inch", "27-inch"]), ("Laptop Sleeve", 3900, 9900, ["13-inch", "15-inch"]),
                                         ("USB-C Hub", 6900, 22900, ["6-in-1", "8-in-1"])],
    "audio and wearables": [("Wireless Earbuds", 9900, 59900, ["Black", "White"]), ("Headphones", 14900, 89900, ["Black", "Silver"]),
                            ("Bluetooth Speaker", 7900, 39900, ["Black", "Blue"]), ("Smartwatch", 19900, 129900, ["40mm", "44mm"]),
                            ("Smart Band", 9900, 25900, ["Black", "Pink"])],
    "power and cables": [("USB-C Charger", 2900, 15900, ["20W", "65W"]), ("Power Bank", 5900, 22900, ["10,000 mAh", "20,000 mAh"]),
                         ("USB-C Cable", 2000, 6900, ["1m", "2m"]), ("Car Charger", 2000, 7900, ["Dual port"]), ("Wireless Charger", 4900, 15900, ["15W"])],
}
BRANDS = ["Lumo", "Nexa", "Orbit", "Kairo", "Velta", "Zentro", "Avia", "Prism", "Tera", "Solace", "Quill", "Brio"]
catalogue = []
pid = 1
while len(catalogue) < 1200:
    line = rng.choice(list(LINES))
    kind, lo, hi, variants = rng.choice(LINES[line])
    price = rng.randrange(lo // 100, hi // 100 + 1) * 100 - 100 + 90 if hi > 5000 else rng.randrange(lo // 100, hi // 100 + 1) * 100
    price = max(2000, min(200000, price))
    catalogue.append({"product_id": f"P-{pid:04d}", "name": f"{rng.choice(BRANDS)} {kind} {rng.choice(['S', 'X', 'Pro', 'Lite', 'Max', 'Air'])}{rng.randint(1, 9)}",
                      "line": line, "variants": variants, "price": price})
    pid += 1
# The selected 20% for payday sales (MP5).
payday_selected = set(p["product_id"] for p in rng.sample(catalogue, 240))

# ---------------------------------------------------------------- customers
FIRST = ["Aisyah", "Farid", "Jia Hui", "Ravi", "Nadia", "Wei Jie", "Kavitha", "Hafiz", "Mei Xin", "Arjun", "Syafiq", "Li Ting", "Daniel", "Nurul", "Kumar",
         "Siew Lan", "Amir", "Pei Shan", "Deepa", "Irfan", "Hui Min", "Zul", "Shanti", "Ken", "Liyana", "Boon Keat", "Suresh", "Ain", "Chloe", "Haziq"]
customers = []
for i in range(1, 1501):
    customers.append({"customer_id": f"C-{i:05d}", "first_name": rng.choice(FIRST),
                      "phone": f"01{rng.choice('234679')}-{rng.randint(100, 999)} {rng.randint(1000, 9999)}"})
STREETS = ["Jalan Kristal 7/62", "Jalan Plumbum 26/1", "Jalan SS 15/4", "Jalan Kenari 5", "Jalan Damai 3", "Jalan Bukit Raja 11", "Persiaran Kayangan", "Jalan Setia Prima"]
TOWNS = ["40000 Shah Alam, Selangor", "47500 Subang Jaya, Selangor", "47301 Petaling Jaya, Selangor", "43000 Kajang, Selangor", "50450 Kuala Lumpur", "41200 Klang, Selangor"]


def address():
    return f"No. {rng.randint(1, 120)}, {rng.choice(STREETS)}, {rng.choice(TOWNS)}"


# ---------------------------------------------------------------- orders
orders, returns, refunds = [], [], []
oid = 200001
day = dt.date(2026, 9, 1)
while day <= mdate(NOW):
    count = 120 if day.isoformat() in T["campaign_days"] else 40
    for _ in range(count):
        h, mi = rng.randint(0, 23), rng.randint(0, 59)
        t = int(dt.datetime(day.year, day.month, day.day, h, mi, tzinfo=MYT).timestamp())
        if t >= NOW:
            continue
        c = rng.choice(customers)
        kind = T["campaign_days"].get(day.isoformat())
        lines = []
        for n in range(rng.choice([1, 1, 1, 2, 2, 3])):
            p = rng.choice(catalogue)
            sale = kind == "storewide" or (kind == "payday" and p["product_id"] in payday_selected)
            lines.append({"line_id": f"L{n + 1}", "product_id": p["product_id"], "product": p["name"], "variant": rng.choice(p["variants"]),
                          "price": p["price"], "sale": sale})
        total = sum(x["price"] for x in lines)
        # Dispatch on the next working day or the one after; delivery between the 3rd and 5th working day.
        dispatch_day = nth_working_day_after(day, rng.choice([1, 1, 2]))
        deliver_day = nth_working_day_after(day, rng.choice([3, 4, 5]))
        dispatch = int(dt.datetime(dispatch_day.year, dispatch_day.month, dispatch_day.day, 9 + rng.randint(0, 6), rng.randint(0, 59), tzinfo=MYT).timestamp())
        deliver = int(dt.datetime(deliver_day.year, deliver_day.month, deliver_day.day, 10 + rng.randint(0, 8), rng.randint(0, 59), tzinfo=MYT).timestamp())
        status = "delivered" if deliver <= NOW else ("dispatched" if dispatch <= NOW else "not_dispatched")
        if rng.random() < 0.02 and status == "not_dispatched" or rng.random() < 0.005:
            status = "cancelled"
        o = {"order_id": f"HM-{oid}", "customer_id": c["customer_id"], "first_name": c["first_name"], "phone": c["phone"], "order_time": t,
             "lines": lines, "order_total": total, "delivery_fee": fee_for(total, t), "status": status,
             "dispatch_time": dispatch if status in ("dispatched", "delivered") else None,
             "delivery_time": deliver if status == "delivered" else None, "delivery_address": address()}
        orders.append(o)
        if status == "cancelled":
            refunds.append({"order_id": o["order_id"], "source": "cancellation", "state": "paid", "amount": total + o["delivery_fee"],
                            "approval_time": t + 86400, "paid_time": t + 6 * 86400})
        elif status == "delivered" and rng.random() < 0.03:
            ln = rng.choice(lines)
            if not ln["sale"]:
                req = deliver + rng.randint(1, 10) * 86400
                if req < NOW:
                    st = rng.choice(["requested", "in_transit", "received", "approved", "rejected"])
                    r = {"order_id": o["order_id"], "line_id": ln["line_id"], "state": st, "requested_time": req,
                         "received_time": req + 4 * 86400 if st in ("received", "approved", "rejected") else None,
                         "decision_time": req + 6 * 86400 if st in ("approved", "rejected") else None}
                    returns.append(r)
                    if st == "received":
                        refunds.append({"order_id": o["order_id"], "source": "return", "state": "awaiting_approval", "amount": ln["price"], "approval_time": None, "paid_time": None})
                    if st == "approved":
                        refunds.append({"order_id": o["order_id"], "source": "return", "state": rng.choice(["approved", "paid"]), "amount": ln["price"],
                                        "approval_time": r["decision_time"], "paid_time": None})
                        if refunds[-1]["state"] == "paid":
                            refunds[-1]["paid_time"] = r["decision_time"] + 6 * 86400
        oid += 1
    day += dt.timedelta(days=1)
# Times that would fall after "today" are not yet known.
for r in returns:
    for k in ("received_time", "decision_time"):
        if r[k] and r[k] > NOW:
            r[k] = None
for f in refunds:
    if f["paid_time"] and f["paid_time"] > NOW:
        f["paid_time"], f["state"] = None, "approved"

# ---------------------------------------------------------------- seeded records (Step C, data page, section 3)
SEEDED_PRODUCTS = {}


def sp(key, name, line, variant, price):
    pid_ = f"P-S{len(SEEDED_PRODUCTS) + 1:02d}"
    SEEDED_PRODUCTS[key] = {"product_id": pid_, "name": name, "line": line, "variants": [variant], "price": price}
    catalogue.append(SEEDED_PRODUCTS[key])
    return SEEDED_PRODUCTS[key]


def line(n, prod, sale=False):
    return {"line_id": f"L{n}", "product_id": prod["product_id"], "product": prod["name"], "variant": prod["variants"][0], "price": prod["price"], "sale": sale}


P = {
    "cable1": sp("cable1", "Lumo USB-C to Lightning Cable", "power and cables", "1m", 2900),
    "ch20": sp("ch20", "Nexa USB-C Charger 20W", "power and cables", "20W", 5900),
    "mouse": sp("mouse", "Orbit Wireless Mouse M3", "laptops and computer accessories", "Black", 7900),
    "tablet": sp("tablet", "Kairo Tab 10.4", "phones and tablets", "64GB", 89900),
    "ch65": sp("ch65", "Velta 65W USB-C Charger", "power and cables", "65W", 11900),
    "speaker": sp("speaker", "Zentro Bluetooth Speaker Go", "audio and wearables", "Blue", 14900),
    "earbuds": sp("earbuds", "Avia Wireless Earbuds A2", "audio and wearables", "Black", 19900),
    "band": sp("band", "Prism Smart Band 5", "audio and wearables", "Black", 15900),
    "pb10": sp("pb10", "Tera Power Bank 10,000 mAh", "power and cables", "10,000 mAh", 12900),
    "phones": sp("phones", "Solace Headphones H7", "audio and wearables", "Silver", 24900),
    "monitor": sp("monitor", "Quill 27-inch Monitor Q27", "laptops and computer accessories", "27-inch", 89900),
    "pb20": sp("pb20", "Brio Power Bank 20,000 mAh", "power and cables", "20,000 mAh", 15900),
    "keyboard": sp("keyboard", "Kairo Mechanical Keyboard K8", "laptops and computer accessories", "Brown switch", 28900),
    "cable2": sp("cable2", "Nexa Braided USB-C Cable", "power and cables", "2m", 3500),
    "carch": sp("carch", "Orbit Car Charger Duo", "power and cables", "Dual port", 2500),
    "hub": sp("hub", "Lumo USB-C Hub 8-in-1", "laptops and computer accessories", "8-in-1", 12000),
    "wch": sp("wch", "Velta Wireless Charger 15W", "power and cables", "15W", 5000),
    "sleeve": sp("sleeve", "Avia Laptop Sleeve", "laptops and computer accessories", "13-inch", 10000),
    "watch": sp("watch", "Zentro Smartwatch Z4", "audio and wearables", "44mm", 39900),
    "case": sp("case", "Prism Phone Case Clear", "phones and tablets", "Clear", 4500),
    "protector": sp("protector", "Prism Screen Protector", "phones and tablets", "Standard", 3900),
    "earbuds2": sp("earbuds2", "Tera Wireless Earbuds T1", "audio and wearables", "White", 12900),
    "speaker2": sp("speaker2", "Brio Bluetooth Speaker Mini", "audio and wearables", "Black", 7900),
    "earphones": sp("earphones", "Lumo Wired Earphones E3", "audio and wearables", "Black", 4900),
}

SEED = [
    # id, first name, phone, order time, lines, status, dispatch, delivery
    ("HM-100101", "Aisyah", "012-418 4417", ts(2026, 10, 22, 14, 20), [line(1, P["cable1"]), line(2, P["ch20"])], "dispatched", ts(2026, 10, 26, 11, 0), None),
    ("HM-100102", "Farid", "013-552 2081", ts(2026, 10, 26, 16, 5), [line(1, P["mouse"])], "not_dispatched", None, None),
    ("HM-100103", "Jia Hui", "016-730 6623", ts(2026, 10, 27, 8, 40), [line(1, P["tablet"])], "not_dispatched", None, None),
    ("HM-100104", "Ravi", "017-244 9035", ts(2026, 10, 5, 13, 10), [line(1, P["ch65"])], "delivered", ts(2026, 10, 6, 10, 0), ts(2026, 10, 10, 12, 30)),
    ("HM-100105", "Nadia", "019-381 5512", ts(2026, 10, 10, 11, 25), [line(1, P["speaker"], sale=True)], "delivered", ts(2026, 10, 12, 10, 0), ts(2026, 10, 15, 15, 10)),
    ("HM-100106", "Wei Jie", "012-907 3348", ts(2026, 10, 19, 9, 50), [line(1, P["earbuds"])], "delivered", ts(2026, 10, 20, 10, 0), ts(2026, 10, 23, 14, 0)),
    ("HM-100107", "Kavitha", "014-625 7710", ts(2026, 10, 6, 20, 15), [line(1, P["band"])], "delivered", ts(2026, 10, 7, 10, 0), ts(2026, 10, 9, 13, 0)),
    ("HM-100108", "Hafiz", "011-2093 8846", ts(2026, 10, 1, 12, 0), [line(1, P["pb10"])], "delivered", ts(2026, 10, 2, 10, 0), ts(2026, 10, 6, 11, 40)),
    ("HM-100109", "Mei Xin", "016-448 1907", ts(2026, 10, 15, 18, 35), [line(1, P["phones"])], "delivered", ts(2026, 10, 16, 10, 0), ts(2026, 10, 20, 16, 0)),
    ("HM-100110", "Arjun", "017-860 4452", ts(2026, 10, 20, 10, 5), [line(1, P["monitor"])], "delivered", ts(2026, 10, 21, 10, 0), ts(2026, 10, 26, 15, 0)),
    ("HM-100111", "Syafiq", "019-772 3069", ts(2026, 10, 1, 15, 45), [line(1, P["pb20"])], "delivered", ts(2026, 10, 2, 11, 0), ts(2026, 10, 6, 14, 20)),
    ("HM-100112", "Li Ting", "012-315 8820", ts(2026, 10, 20, 21, 10), [line(1, P["keyboard"])], "delivered", ts(2026, 10, 21, 10, 0), ts(2026, 10, 24, 14, 0)),
    ("HM-100113", "Daniel", "013-694 5571", ts(2026, 10, 10, 9, 15), [line(1, P["cable2"], sale=True), line(2, P["carch"], sale=True)], "delivered", ts(2026, 10, 12, 10, 0), ts(2026, 10, 15, 11, 0)),
    ("HM-100114", "Nurul", "018-209 6634", ts(2026, 10, 14, 13, 30), [line(1, P["hub"])], "delivered", ts(2026, 10, 15, 10, 0), ts(2026, 10, 19, 12, 0)),
    ("HM-100115", "Kumar", "012-581 0947", ts(2026, 10, 25, 20, 40), [line(1, P["wch"])], "dispatched", ts(2026, 10, 27, 9, 0), None),
    ("HM-100116", "Siew Lan", "016-902 3381", ts(2026, 10, 20, 11, 0), [line(1, P["sleeve"])], "delivered", ts(2026, 10, 21, 10, 0), ts(2026, 10, 23, 15, 30)),
    ("HM-100117", "Amir", "017-433 2295", ts(2026, 10, 19, 14, 30), [line(1, P["watch"])], "delivered", ts(2026, 10, 20, 10, 0), ts(2026, 10, 22, 13, 0)),
    ("HM-100118", "Pei Shan", "019-650 7718", ts(2026, 10, 26, 19, 20), [line(1, P["case"]), line(2, P["protector"])], "not_dispatched", None, None),
    ("HM-100121", "Deepa", "012-774 6158", ts(2026, 10, 12, 10, 10), [line(1, P["earbuds2"])], "delivered", ts(2026, 10, 13, 10, 0), ts(2026, 10, 16, 12, 0)),
    ("HM-100122", "Irfan", "013-208 9934", ts(2026, 10, 23, 16, 0), [line(1, P["speaker2"])], "dispatched", ts(2026, 10, 27, 9, 30), None),
    ("HM-100124", "Hui Min", "016-519 4470", ts(2026, 10, 23, 12, 30), [line(1, P["mouse"])], "dispatched", ts(2026, 10, 26, 10, 0), None),
    ("HM-100126", "Chloe", "017-305 6612", ts(2026, 10, 19, 11, 15), [line(1, P["earphones"])], "delivered", ts(2026, 10, 20, 10, 0), ts(2026, 10, 22, 16, 0)),
]
for oid_, first, phone, t, lines, status, disp, deliv in SEED:
    total = sum(x["price"] for x in lines)
    orders.append({"order_id": oid_, "customer_id": f"C-S{oid_[-3:]}", "first_name": first, "phone": phone, "order_time": t, "lines": lines,
                   "order_total": total, "delivery_fee": fee_for(total, t), "status": status, "dispatch_time": disp, "delivery_time": deliv,
                   "delivery_address": address()})
    customers.append({"customer_id": f"C-S{oid_[-3:]}", "first_name": first, "phone": phone})

# Returns and refunds for cases 7, 8, 9.
returns += [
    {"order_id": "HM-100107", "line_id": "L1", "state": "approved", "requested_time": ts(2026, 10, 12, 9, 0), "received_time": ts(2026, 10, 21, 11, 0), "decision_time": ts(2026, 10, 23, 15, 0)},
    {"order_id": "HM-100108", "line_id": "L1", "state": "approved", "requested_time": ts(2026, 10, 8, 10, 0), "received_time": ts(2026, 10, 10, 12, 0), "decision_time": ts(2026, 10, 12, 11, 0)},
    {"order_id": "HM-100109", "line_id": "L1", "state": "received", "requested_time": ts(2026, 10, 21, 18, 0), "received_time": ts(2026, 10, 26, 14, 0), "decision_time": None},
]
refunds += [
    {"order_id": "HM-100107", "source": "return", "state": "approved", "amount": 15900, "approval_time": ts(2026, 10, 23, 15, 0), "paid_time": None},
    {"order_id": "HM-100108", "source": "return", "state": "paid", "amount": 12900, "approval_time": ts(2026, 10, 12, 11, 0), "paid_time": ts(2026, 10, 20, 10, 0)},
    {"order_id": "HM-100109", "source": "return", "state": "awaiting_approval", "amount": 24900, "approval_time": None, "paid_time": None},
]

# ---------------------------------------------------------------- checks
by_id = {o["order_id"]: o for o in orders}
assert len(by_id) == len(orders), "duplicate order IDs"
for o in orders:
    assert o["delivery_fee"] == fee_for(o["order_total"], o["order_time"]), o["order_id"]
    kind = T["campaign_days"].get(mdate(o["order_time"]).isoformat())
    for ln in o["lines"]:
        if kind == "storewide":
            assert ln["sale"], (o["order_id"], "MP4: every line on a storewide day is sale")
        if not kind:
            assert not ln["sale"], (o["order_id"], "no sale mark outside a campaign day")
    if o["delivery_time"]:
        assert mdate(o["delivery_time"]) <= nth_working_day_after(mdate(o["order_time"]), 5), (o["order_id"], "FP2 window")
        assert dt.datetime.fromtimestamp(o["delivery_time"], MYT).weekday() < 6, (o["order_id"], "couriers Monday to Saturday")
H = 3600


def days_since(unix):
    """Calendar days in Malaysia time, as RP1, QP2 and the case table count them."""
    return (mdate(NOW) - mdate(unix)).days


expect = {
    "HM-100101": lambda o: o["status"] == "dispatched" and mdate(o["dispatch_time"]) == dt.date(2026, 10, 26),
    "HM-100102": lambda o: o["status"] == "not_dispatched",
    "HM-100103": lambda o: o["status"] == "not_dispatched",
    "HM-100104": lambda o: days_since(o["delivery_time"]) == 17 and not o["lines"][0]["sale"],
    "HM-100105": lambda o: days_since(o["delivery_time"]) == 12 and o["lines"][0]["sale"],
    "HM-100106": lambda o: days_since(o["delivery_time"]) == 4,
    "HM-100110": lambda o: (NOW - o["delivery_time"]) // H == 19,
    "HM-100111": lambda o: days_since(o["delivery_time"]) == 21,
    "HM-100112": lambda o: (NOW - o["delivery_time"]) // H == 68,
    "HM-100113": lambda o: o["order_total"] == 6000 and o["delivery_fee"] == 0,
    "HM-100114": lambda o: o["order_total"] == 12000 and o["delivery_fee"] == 0,
    "HM-100115": lambda o: o["order_total"] == 5000 and o["delivery_fee"] == 500,
    "HM-100116": lambda o: o["order_total"] == 10000 and o["delivery_fee"] == 500,
    "HM-100117": lambda o: days_since(o["delivery_time"]) == 5 and not o["lines"][0]["sale"],
    "HM-100118": lambda o: o["status"] == "not_dispatched" and not any(f["order_id"] == "HM-100118" for f in refunds),
    "HM-100121": lambda o: o["status"] == "delivered",
    "HM-100122": lambda o: o["status"] == "dispatched",
    "HM-100124": lambda o: o["status"] == "dispatched" and mdate(o["dispatch_time"]) == dt.date(2026, 10, 26),
    "HM-100126": lambda o: days_since(o["delivery_time"]) == 5 and o["delivery_fee"] == 500 and not o["lines"][0]["sale"],
}
for k, f in expect.items():
    assert f(by_id[k]), f"seeded record {k} does not match its case"
assert nth_working_day_after(dt.date(2026, 10, 22), 3) == dt.date(2026, 10, 28), "FP2 window start for case 1 (26 Oct is a holiday)"

# ---------------------------------------------------------------- write
files = {"catalogue": catalogue, "customers": customers, "orders": orders, "returns": returns, "refunds": refunds,
         "requests": [], "claims": [], "handovers": [], "call_log": [],
         "meta": {"now": NOW, "now_label": "Tue 27 Oct 2026, 10:00 MYT", "seed": 42, "orders": len(orders)}}
for name, value in files.items():
    with open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False)
print(f"{len(catalogue)} products, {len(customers)} customers, {len(orders)} orders, {len(returns)} returns, {len(refunds)} refunds; seeded records checked")
