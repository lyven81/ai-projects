"""
DF Auto Parts Distributors: synthetic data for the staff assistant.

Forked from FD Food and Drink Distributors' generator (23 Oct 2026, Build List section 10): same seed (42),
the same order behaviour per kind of customer, Selangor locations, money in sen and times as Unix
seconds (UTC). Changed: an automotive spare parts catalogue of 60 SKUs (engine oil by the carton,
filters and batteries by the piece, brake pads by the set), 120 workshop and parts shop customers,
the seven DF staff, and the records the seven scenarios need. Reads resources/policy_tables.json (run
build_policies.py first). Writes data/*.json and resources/Product Catalogue.* and Customer Directory.*.

The named records the Answer Key needs (C-0001, C-0004, DF-EO-001, DF-OF-012, DF-BT-030, the open
order DF-SO-00248, DF-SO-00247 out today, the approval AP-0104 for another request) are planted first
and checked at the end, so a fresh run gives the same records.
"""
import json
import os
import random
from datetime import datetime, timedelta, timezone

SEED = 42
random.seed(SEED)
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
RES = os.path.join(HERE, "resources")
os.makedirs(DATA, exist_ok=True)
T = json.load(open(os.path.join(RES, "policy_tables.json"), encoding="utf-8"))
MYT = timezone(timedelta(hours=8))


def ts(s):
    """'2026-10-01 10:00' Malaysia time -> Unix seconds."""
    return int(datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=MYT).timestamp())


NOW = ts("2026-10-01 10:00")  # the test calendar: Thursday 1 October 2026, 10:00 Malaysia time

# ---- CATALOGUE (60 SKUs, 4 groups of 15) ----
# (sku, product name, brand, manufacturer part number, specification, selling unit, what one unit contains,
#  base price in sen per unit, the words for several units)
CATALOGUE = [
    # Engine oil, by the carton
    ("DF-EO-001", "5W-30 Engine Oil", "Lumba", "LB-5W30-4L", "Fully synthetic, API SP", "carton", "4 x 4L", 44000, "cartons of 5W-30 engine oil"),
    ("DF-EO-002", "0W-20 Engine Oil", "Lumba", "LB-0W20-4L", "Fully synthetic, API SP, ILSAC GF-6", "carton", "4 x 4L", 47600, "cartons of 0W-20 engine oil"),
    ("DF-EO-003", "10W-40 Engine Oil", "Lumba", "LB-10W40-4L", "Semi-synthetic, API SN", "carton", "4 x 4L", 31200, "cartons of 10W-40 engine oil"),
    ("DF-EO-004", "15W-40 Diesel Engine Oil", "Tenaga", "TG-15W40-6L", "Mineral, API CK-4", "carton", "4 x 6L", 38400, "cartons of 15W-40 diesel engine oil"),
    ("DF-EO-005", "5W-40 Engine Oil", "Tenaga", "TG-5W40-4L", "Fully synthetic, API SP", "carton", "4 x 4L", 45600, "cartons of 5W-40 engine oil"),
    ("DF-EO-006", "20W-50 Engine Oil", "Tenaga", "TG-20W50-4L", "Mineral, API SL", "carton", "4 x 4L", 25600, "cartons of 20W-50 engine oil"),
    ("DF-EO-007", "10W-30 Engine Oil", "Pantas", "PT-10W30-4L", "Semi-synthetic, API SN", "carton", "4 x 4L", 29600, "cartons of 10W-30 engine oil"),
    ("DF-EO-008", "0W-16 Hybrid Engine Oil", "Pantas", "PT-0W16-4L", "Fully synthetic, API SP", "carton", "4 x 4L", 51200, "cartons of 0W-16 hybrid engine oil"),
    ("DF-EO-009", "ATF Dexron VI", "Pantas", "PT-ATF6-1L", "Automatic transmission fluid", "carton", "12 x 1L", 33600, "cartons of ATF Dexron VI"),
    ("DF-EO-010", "CVT Fluid", "Lumba", "LB-CVT-4L", "Continuously variable transmission fluid", "carton", "4 x 4L", 41600, "cartons of CVT fluid"),
    ("DF-EO-011", "Gear Oil 75W-90", "Tenaga", "TG-7590-1L", "API GL-5", "carton", "12 x 1L", 30000, "cartons of 75W-90 gear oil"),
    ("DF-EO-012", "Brake Fluid DOT 4", "Pantas", "PT-DOT4-500", "DOT 4", "carton", "24 x 500ml", 26400, "cartons of DOT 4 brake fluid"),
    ("DF-EO-013", "Coolant, long life", "Sejuk", "SJ-LLC-4L", "Pre-mixed 50/50, green", "carton", "4 x 4L", 17600, "cartons of long-life coolant"),
    ("DF-EO-014", "Power Steering Fluid", "Pantas", "PT-PSF-1L", "Universal", "carton", "12 x 1L", 21600, "cartons of power steering fluid"),
    ("DF-EO-015", "Motorcycle Oil 10W-40", "Lumba", "LB-MC1040-1L", "Semi-synthetic, JASO MA2", "carton", "12 x 1L", 27600, "cartons of 10W-40 motorcycle oil"),
    # Filters, by the piece
    ("DF-OF-011", "Oil Filter, Proton Saga and Persona", "Saring", "SR-OF-PR01", "Spin-on, M20 x 1.5", "piece", "1 filter", 1600, "Proton oil filters"),
    ("DF-OF-012", "Oil Filter, Perodua and Toyota", "Saring", "SR-OF-PD02", "Spin-on, M20 x 1.5", "piece", "1 filter", 1800, "oil filters"),
    ("DF-OF-013", "Oil Filter, Honda", "Saring", "SR-OF-HD03", "Spin-on, M20 x 1.5", "piece", "1 filter", 2200, "Honda oil filters"),
    ("DF-OF-014", "Oil Filter, Nissan", "Saring", "SR-OF-NS04", "Spin-on, 3/4-16 UNF", "piece", "1 filter", 2000, "Nissan oil filters"),
    ("DF-OF-015", "Oil Filter, diesel pick-up", "Saring", "SR-OF-DP05", "Spin-on, M26 x 1.5", "piece", "1 filter", 3800, "diesel oil filters"),
    ("DF-OF-016", "Fuel Filter, diesel pick-up", "Saring", "SR-FF-DP06", "Inline, water separator", "piece", "1 filter", 5600, "diesel fuel filters"),
    ("DF-OF-017", "Cabin Air Filter, Perodua Myvi", "Udara", "UD-CF-PD07", "Activated carbon", "piece", "1 filter", 2400, "Myvi cabin filters"),
    ("DF-OF-018", "Cabin Air Filter, Honda City", "Udara", "UD-CF-HD08", "Activated carbon", "piece", "1 filter", 2800, "City cabin filters"),
    ("DF-OF-019", "Cabin Air Filter, Toyota Vios", "Udara", "UD-CF-TY09", "Activated carbon", "piece", "1 filter", 2600, "Vios cabin filters"),
    ("DF-OF-020", "Cabin Air Filter, Proton X50", "Udara", "UD-CF-PR10", "Activated carbon", "piece", "1 filter", 3200, "X50 cabin filters"),
    ("DF-OF-021", "Engine Air Filter, Perodua Axia and Bezza", "Udara", "UD-AF-PD11", "Panel, paper element", "piece", "1 filter", 2900, "Axia air filters"),
    ("DF-OF-022", "Engine Air Filter, Honda City and Jazz", "Udara", "UD-AF-HD12", "Panel, paper element", "piece", "1 filter", 3600, "City air filters"),
    ("DF-OF-023", "Engine Air Filter, Toyota Vios", "Udara", "UD-AF-TY13", "Panel, paper element", "piece", "1 filter", 3400, "Vios air filters"),
    ("DF-OF-024", "Engine Air Filter, Proton Saga", "Udara", "UD-AF-PR14", "Panel, paper element", "piece", "1 filter", 2500, "Saga air filters"),
    ("DF-OF-025", "Engine Air Filter, diesel pick-up", "Udara", "UD-AF-DP15", "Panel, heavy duty", "piece", "1 filter", 6400, "diesel air filters"),
    # Brake pads, by the set
    ("DF-BP-001", "Front Brake Pads, Perodua Myvi", "Cengkam", "CK-FP-PD01", "Semi-metallic", "set", "4 pads, one axle", 8800, "sets of Myvi front pads"),
    ("DF-BP-002", "Front Brake Pads, Proton Saga", "Cengkam", "CK-FP-PR02", "Semi-metallic", "set", "4 pads, one axle", 7800, "sets of Saga front pads"),
    ("DF-BP-003", "Front Brake Pads, Honda City", "Cengkam", "CK-FP-HD03", "Ceramic", "set", "4 pads, one axle", 13600, "sets of City front pads"),
    ("DF-BP-004", "Front Brake Pads, Toyota Vios", "Cengkam", "CK-FP-TY04", "Ceramic", "set", "4 pads, one axle", 12800, "sets of Vios front pads"),
    ("DF-BP-005", "Front Brake Pads, Perodua Axia and Bezza", "Cengkam", "CK-FP-PD05", "Semi-metallic", "set", "4 pads, one axle", 7600, "sets of Axia front pads"),
    ("DF-BP-006", "Front Brake Pads, Proton X50", "Cengkam", "CK-FP-PR06", "Ceramic", "set", "4 pads, one axle", 16800, "sets of X50 front pads"),
    ("DF-BP-007", "Front Brake Pads, Honda Civic", "Henti", "HT-FP-HD07", "Ceramic", "set", "4 pads, one axle", 18400, "sets of Civic front pads"),
    ("DF-BP-008", "Front Brake Pads, Toyota Hilux", "Henti", "HT-FP-TY08", "Semi-metallic, heavy duty", "set", "4 pads, one axle", 19600, "sets of Hilux front pads"),
    ("DF-BP-009", "Front Brake Pads, Nissan Almera", "Henti", "HT-FP-NS09", "Ceramic", "set", "4 pads, one axle", 12400, "sets of Almera front pads"),
    ("DF-BP-010", "Rear Brake Shoes, Perodua Myvi", "Cengkam", "CK-RS-PD10", "Drum, bonded", "set", "4 shoes, one axle", 7200, "sets of Myvi rear shoes"),
    ("DF-BP-011", "Rear Brake Shoes, Proton Saga", "Cengkam", "CK-RS-PR11", "Drum, bonded", "set", "4 shoes, one axle", 6800, "sets of Saga rear shoes"),
    ("DF-BP-012", "Rear Brake Pads, Honda Civic", "Henti", "HT-RP-HD12", "Ceramic", "set", "4 pads, one axle", 15600, "sets of Civic rear pads"),
    ("DF-BP-013", "Rear Brake Pads, Toyota Camry", "Henti", "HT-RP-TY13", "Ceramic", "set", "4 pads, one axle", 17200, "sets of Camry rear pads"),
    ("DF-BP-014", "Rear Brake Pads, Proton X70", "Henti", "HT-RP-PR14", "Ceramic", "set", "4 pads, one axle", 16400, "sets of X70 rear pads"),
    ("DF-BP-015", "Rear Brake Shoes, Toyota Hilux", "Henti", "HT-RS-TY15", "Drum, heavy duty", "set", "4 shoes, one axle", 14800, "sets of Hilux rear shoes"),
    # Batteries, by the piece
    ("DF-BT-021", "NS40 Battery", "Kuasa", "KS-NS40ZL", "12V 35Ah, maintenance free", "piece", "1 battery", 16500, "NS40 batteries"),
    ("DF-BT-022", "NS40 Battery, enhanced", "Kuasa", "KS-NS40ZL-E", "12V 38Ah, EFB", "piece", "1 battery", 21500, "enhanced NS40 batteries"),
    ("DF-BT-023", "NS50 Battery", "Kuasa", "KS-NS50L", "12V 40Ah, low maintenance", "piece", "1 battery", 17500, "NS50 batteries"),
    ("DF-BT-024", "NS70 Battery", "Kuasa", "KS-NS70L", "12V 65Ah, maintenance free", "piece", "1 battery", 28500, "NS70 batteries"),
    ("DF-BT-025", "N50Z Battery", "Kuasa", "KS-N50ZL", "12V 60Ah, maintenance free", "piece", "1 battery", 27000, "N50Z batteries"),
    ("DF-BT-026", "DIN55 Battery", "Arus", "AR-DIN55", "12V 55Ah, AGM", "piece", "1 battery", 42500, "DIN55 batteries"),
    ("DF-BT-027", "DIN65 Battery", "Arus", "AR-DIN65", "12V 65Ah, AGM", "piece", "1 battery", 46500, "DIN65 batteries"),
    ("DF-BT-028", "DIN75 Battery", "Arus", "AR-DIN75", "12V 75Ah, AGM", "piece", "1 battery", 52500, "DIN75 batteries"),
    ("DF-BT-029", "Q85 Start-Stop Battery", "Arus", "AR-Q85", "12V 65Ah, EFB start-stop", "piece", "1 battery", 39000, "Q85 batteries"),
    ("DF-BT-030", "NS60 Battery", "Kuasa", "KS-NS60LS", "12V 45Ah, maintenance free", "piece", "1 battery", 20500, "NS60 batteries"),
    ("DF-BT-031", "N70Z Battery, commercial", "Kuasa", "KS-N70ZL", "12V 75Ah, low maintenance", "piece", "1 battery", 31500, "N70Z batteries"),
    ("DF-BT-032", "N100 Battery, truck", "Kuasa", "KS-N100", "12V 100Ah, low maintenance", "piece", "1 battery", 45000, "N100 batteries"),
    ("DF-BT-033", "Motorcycle Battery 5Ah", "Arus", "AR-MC5", "12V 5Ah, sealed", "piece", "1 battery", 6800, "5Ah motorcycle batteries"),
    ("DF-BT-034", "Motorcycle Battery 7Ah", "Arus", "AR-MC7", "12V 7Ah, sealed", "piece", "1 battery", 8400, "7Ah motorcycle batteries"),
    ("DF-BT-035", "Hybrid Auxiliary Battery", "Arus", "AR-HAUX", "12V 35Ah, AGM", "piece", "1 battery", 58000, "hybrid auxiliary batteries"),
]
SKUS = [c[0] for c in CATALOGUE]
BASE = {c[0]: c[7] for c in CATALOGUE}
SCENARIO_SKUS = ("DF-EO-001", "DF-OF-012", "DF-BT-030")

# ---- CUSTOMERS (two kinds) ----
KINDS = [("workshop", 70), ("parts_shop", 50)]
BEHAVIOUR = {  # orders in September, lines per order, units per line
    "workshop": {"orders": (2, 4), "lines": (2, 5), "qty": (1, 6), "limit": (3000, 12000), "factor": 1.00},
    "parts_shop": {"orders": (2, 3), "lines": (5, 10), "qty": (2, 10), "limit": (8000, 25000), "factor": 0.97},
}
NAME_WORDS = ["Seri Mawar", "Bunga Raya", "Pelangi Jaya", "Sinar Pagi", "Harmoni", "Bintang Timur", "Cahaya",
              "Mutiara", "Damai", "Kenanga", "Melati", "Cempaka", "Teratai", "Delima", "Permata", "Sentosa",
              "Bahagia", "Gemilang", "Murni", "Indah", "Setia", "Makmur", "Sejahtera", "Mesra", "Ceria",
              "Wangi", "Nusa", "Puncak", "Tiara", "Suria", "Kasih", "Selasih", "Lestari", "Rimba", "Anggerik",
              "Seroja", "Kemboja", "Sakura", "Jasmin", "Orkid", "Ros", "Lily", "Ehsan", "Rezeki", "Berkat",
              "Aman", "Jaya Baru", "Sri Muda", "Taman Baru", "Lembah", "Kilat", "Laju", "Pantas", "Teguh"]
KIND_NAME = {"workshop": ["Bengkel {} Auto", "Bengkel {} Motor", "{} Auto Service"], "parts_shop": ["{} Auto Parts", "Kedai Alat Ganti {}"]}
TOWNS = list(T["locations"])
SALES = ["SL-02-01", "SL-02-02"]

customers, price_lists = [], {}
names_used = set()


def phone():
    return f"+60 1{random.choice('2369')}-{random.randint(200, 999)} {random.randint(1000, 9999)}"


def new_name(kind):
    while True:
        n = random.choice(KIND_NAME[kind]).format(random.choice(NAME_WORDS))
        if n not in names_used:
            names_used.add(n)
            return n


def make_prices(cid, kind, missing=0.02):
    f = BEHAVIOUR[kind]["factor"]
    p = {}
    for s in SKUS:
        if random.random() < missing:
            continue  # a few prices missing on purpose (SP-04)
        p[s] = int(round(BASE[s] * f * random.uniform(0.98, 1.02) / 10)) * 10
    price_lists[cid] = p


# Named records first: C-0001 (Chloe's, Orders B and C), C-0002 (zero balance), C-0003 (incomplete
# credit record), C-0004 (Daniel's, Order A).
NAMED = {
    "C-0001": dict(name="Bengkel Seri Mawar Auto", kind="workshop", location="Shah Alam", assigned_to="SL-02-01",
                   credit_limit=1500000, outstanding=980000, terms=30,
                   contacts=[dict(id="CT-0001-1", name="Encik Hafizi", channel="whatsapp", value="+60 12-418 7702", approved=True),
                             dict(id="CT-0001-2", name="Accounts", channel="email", value="accounts@serimawarauto.example", approved=False)]),
    "C-0002": dict(name="Bunga Raya Auto Parts", kind="parts_shop", location="Klang", assigned_to="SL-02-02",
                   credit_limit=800000, outstanding=800000, terms=30,
                   contacts=[dict(id="CT-0002-1", name="Mr Ravi", channel="whatsapp", value="+60 13-552 0914", approved=True)]),
    "C-0003": dict(name="Pelangi Jaya Auto Service", kind="workshop", location="Puchong", assigned_to="SL-02-02",
                   credit_limit=None, outstanding=420000, terms=30,
                   contacts=[dict(id="CT-0003-1", name="Ms Wong", channel="whatsapp", value="+60 16-730 2281", approved=True)]),
    "C-0004": dict(name="Bengkel Gemilang Motor", kind="workshop", location="Sepang", assigned_to="SL-02-02",
                   credit_limit=600000, outstanding=400000, terms=30,
                   contacts=[dict(id="CT-0004-1", name="Encik Azmi", channel="whatsapp", value="+60 19-260 4418", approved=True)]),
}
for cid, c in NAMED.items():
    names_used.add(c["name"])
    customers.append(dict(id=cid, **c))
    make_prices(cid, c["kind"], missing=0)
# The scenario prices: fixed on the two named customers' lists.
price_lists["C-0001"].update({"DF-EO-001": 44000, "DF-OF-012": 1800, "DF-BT-030": 20500})
price_lists["C-0004"].update({"DF-EO-001": 44000})

kinds = [k for k, n in KINDS for _ in range(n)]
for k in ("workshop", "parts_shop", "workshop", "workshop"):
    kinds.remove(k)  # the four named ones
random.shuffle(kinds)
for i, kind in enumerate(kinds, start=5):
    cid = f"C-{i:04d}"
    b = BEHAVIOUR[kind]
    limit = random.randint(*b["limit"]) // 100 * 10000
    used = random.uniform(0.15, 0.9) if random.random() > 0.05 else random.uniform(1.0, 1.15)  # a few above the limit
    cs = [dict(id=f"CT-{i:04d}-1", name=random.choice(["Owner", "Manager", "Workshop manager", "Purchasing"]),
               channel="whatsapp", value=phone(), approved=True)]
    if random.random() < 0.4:
        cs.append(dict(id=f"CT-{i:04d}-2", name="Accounts", channel="email",
                       value=f"accounts{i}@workshop.example", approved=random.random() < 0.7))
    customers.append(dict(id=cid, name=new_name(kind), kind=kind, location=random.choice(TOWNS),
                          assigned_to=random.choice(SALES), credit_limit=limit,
                          outstanding=int(limit * used) // 100 * 100,
                          terms=random.choice([30, 30, 30, 14, 45]), contacts=cs))
    make_prices(cid, kind)
for c in customers:
    c["warehouse"] = T["locations"][c["location"]]["warehouse"]  # WP-01, WP-08
customers.sort(key=lambda c: c["id"])

# ---- STOCK: per SKU per warehouse, last updated within 24 hours unless planted otherwise ----
stock = {}
for s in SKUS:
    stock[s] = {}
    for wh in ("WH-A", "WH-B"):
        stock[s][wh] = dict(qty=random.randint(30, 300), updated=NOW - random.randint(2, 20) * 3600)
for s in random.sample([x for x in SKUS if x not in SCENARIO_SKUS], 5):
    stock[s]["WH-B"]["updated"] = NOW - random.randint(26, 50) * 3600  # some figures out of date on purpose
for s in random.sample([x for x in SKUS if x not in SCENARIO_SKUS], 3):
    stock[s]["WH-B"]["qty"] = random.randint(0, 4)  # some SKUs short on purpose
stock["DF-EO-001"]["WH-A"] = dict(qty=60, updated=ts("2026-10-01 06:00"))   # 4 hours old (Order B)
stock["DF-EO-001"]["WH-B"] = dict(qty=48, updated=ts("2026-09-30 18:00"))   # 16 hours old (Order A)
stock["DF-OF-012"]["WH-A"] = dict(qty=140, updated=ts("2026-10-01 06:00"))  # Order C
stock["DF-BT-030"]["WH-A"] = dict(qty=24, updated=ts("2026-09-30 04:00"))   # 30 hours old (the stock task)

# ---- STORAGE: bin location and last manual count per SKU per warehouse (Warehouse only, MP-07).
rx = random.Random(SEED + 1)
storage = {}
for s in SKUS:
    storage[s] = {}
    for wh in ("WH-A", "WH-B"):
        storage[s][wh] = dict(bin=f"{rx.choice('ABCDEF')}-{rx.randint(1, 12):02d}-{rx.randint(1, 4)}",
                              last_count=NOW - rx.randint(3, 40) * 86400 - rx.randint(0, 8) * 3600)
storage["DF-BT-030"]["WH-A"] = dict(bin="D-04-2", last_count=ts("2026-09-30 04:00"))

# ---- ORDERS: September 2026 history (246 orders, all delivered), one out today, C-0001's open order ----
orders = []
sept_days = [datetime(2026, 9, d, tzinfo=MYT) for d in range(1, 31)]
work_days = [d for d in sept_days if d.weekday() < 6 and d.strftime("%Y-%m-%d") not in T["holidays"]]


def next_working(day, n=1):
    d = day
    while n:
        d += timedelta(days=1)
        if d.weekday() < 6 and d.strftime("%Y-%m-%d") not in T["holidays"]:
            n -= 1
    return d


history = []
for c in customers:
    b = BEHAVIOUR[c["kind"]]
    plist = price_lists[c["id"]]
    for _ in range(random.randint(*b["orders"])):
        day = random.choice(work_days[:-1])
        at = day.replace(hour=random.randint(9, 17), minute=random.choice([0, 15, 30, 45]))
        chosen = random.sample([s for s in SKUS if s in plist], random.randint(*b["lines"]))
        lines = [dict(sku=s, qty=random.randint(*b["qty"]), unit_price=plist[s]) for s in chosen]
        total = sum(l["qty"] * l["unit_price"] for l in lines)
        deliver = next_working(at, 1 if at.hour < 15 else 2)
        history.append(dict(customer=c["id"], created_by=c["assigned_to"], created_at=int(at.timestamp()),
                            lines=lines, discount_pct=0, total=total, route="credit",
                            delivery_date=deliver.strftime("%Y-%m-%d"), status="delivered", warehouse=c["warehouse"]))
history = sorted(rx.sample(history, 246), key=lambda o: o["created_at"])  # 246, so the next order is DF-SO-00249
for n, o in enumerate(history, start=1):
    orders.append(dict(id=f"DF-SO-{n:05d}", request_id=f"RQ-H{n:05d}", **o))
# DF-SO-00247: a WH-A delivery already out today (the same-day check in scenario 5).
c247 = next(c for c in customers if c["warehouse"] == "WH-A" and c["id"] not in NAMED)
orders.append(dict(id="DF-SO-00247", request_id="RQ-H00247", customer=c247["id"], created_by=c247["assigned_to"],
                   created_at=ts("2026-09-30 11:20"), lines=[dict(sku="DF-EO-003", qty=4, unit_price=price_lists[c247["id"]].get("DF-EO-003", 31200))],
                   discount_pct=0, total=4 * price_lists[c247["id"]].get("DF-EO-003", 31200), route="credit",
                   delivery_date="2026-10-01", status="out_for_delivery", warehouse="WH-A"))
# DF-SO-00248: C-0001's open order, not yet invoiced (outstanding = unpaid invoices + this order).
orders.append(dict(id="DF-SO-00248", request_id="RQ-H00248", customer="C-0001", created_by="SL-02-01",
                   created_at=ts("2026-09-30 16:10"),
                   lines=[dict(sku="DF-EO-001", qty=5, unit_price=44000), dict(sku="DF-BT-030", qty=10, unit_price=20500)],
                   discount_pct=0, total=425000, route="credit", delivery_date="2026-10-02",
                   status="pending_dispatch", warehouse="WH-A"))
for o in orders:
    o.setdefault("approvals", [])

# ---- APPROVAL RECORDS: three from September, and AP-0104 recorded for another C-0001 request
# (failure case F3: an approval counts only for the request it was recorded for, MP-09).
approvals = [
    dict(id="AP-0091", approver="SL-01-01", type="minimum_order", request_id="RQ-H00012", value=22000, time=ts("2026-09-02 11:20")),
    dict(id="AP-0092", approver="WH-01-01", type="delivery_exception", request_id="RQ-H00040", value="2026-09-05", time=ts("2026-09-04 10:05")),
    dict(id="AP-0093", approver="FN-01-01", type="prepaid", request_id="RQ-H00088", value=180000, time=ts("2026-09-10 15:40")),
    dict(id="AP-0104", approver="SL-01-01", type="discount", customer="C-0001", request_id="RQ-H00200", value=10, time=ts("2026-09-28 15:00")),
]
for a in approvals[:3]:
    a["customer"] = next(o["customer"] for o in orders if o["request_id"] == a["request_id"])

# ---- INVOICES: the unpaid invoices behind each outstanding balance (Finance only, MP-07).
# Outstanding = unpaid invoices + open orders on credit, so the figures agree. Due date = issue date + terms.
def due_of(issued, days):
    return (datetime.strptime(issued, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")


invoices, inv_n = [], 0
for c in customers:
    open_total = sum(o["total"] for o in orders if o["customer"] == c["id"] and o["status"] != "delivered" and o["route"] == "credit")
    unpaid = c["outstanding"] - open_total
    if c["id"] == "C-0001":
        parts = [("2026-08-20", 245000), ("2026-09-15", 310000)]  # one 12 days overdue, one due 15 Oct
        assert sum(x for _, x in parts) == unpaid
    elif unpaid <= 0:
        continue
    else:
        older = unpaid * rx.randint(35, 65) // 100
        parts = [(f"2026-08-{rx.randint(5, 28):02d}", older), (f"2026-09-{rx.randint(8, 29):02d}", unpaid - older)]
    for issued, amount in parts:
        inv_n += 1
        invoices.append(dict(id=f"DF-INV-{inv_n:05d}", customer=c["id"], issued=issued, due=due_of(issued, c["terms"]),
                             amount=amount, paid=False))

staff = T["staff"]
meta = dict(seed=SEED, now=NOW, now_label="Thursday 1 October 2026, 10:00 Malaysia time",
            next_order=len(orders) + 1, next_request=1, next_approval=105,
            named={"C-0001": "Chloe's workshop", "C-0004": "Daniel's workshop", "credit_incomplete": "C-0003",
                   "stock_30h": ["DF-BT-030", "WH-A"], "out_today": "DF-SO-00247", "open_order": "DF-SO-00248"})

catalogue = [dict(sku=c[0], name=c[1], brand=c[2], part_no=c[3], spec=c[4], unit=c[5], contains=c[6], plural=c[8]) for c in CATALOGUE]

# ---- Checks: every record the Answer Key names is present and as stated ----
cust = {c["id"]: c for c in customers}
assert cust["C-0001"]["credit_limit"] - cust["C-0001"]["outstanding"] == 520000 and cust["C-0001"]["warehouse"] == "WH-A"
assert cust["C-0004"]["credit_limit"] - cust["C-0004"]["outstanding"] == 200000 and cust["C-0004"]["warehouse"] == "WH-B"
assert cust["C-0004"]["assigned_to"] == "SL-02-02" and cust["C-0001"]["assigned_to"] == "SL-02-01"
assert cust["C-0002"]["credit_limit"] - cust["C-0002"]["outstanding"] == 0 and cust["C-0003"]["credit_limit"] is None
assert NOW - stock["DF-BT-030"]["WH-A"]["updated"] == 30 * 3600 and stock["DF-BT-030"]["WH-A"]["qty"] == 24
assert NOW - stock["DF-EO-001"]["WH-B"]["updated"] == 16 * 3600 and stock["DF-EO-001"]["WH-B"]["qty"] == 48
assert stock["DF-EO-001"]["WH-A"]["qty"] == 60 and stock["DF-OF-012"]["WH-A"]["qty"] == 140
for p in T["promotions"]:
    assert all(s in SKUS for s in p["skus"]), p["id"]
    assert not set(p["skus"]) & set(SCENARIO_SKUS), f"no promotion on the scenario SKUs ({p['id']})"
assert len(catalogue) == 60 and len(customers) == 120 and len(set(SKUS)) == 60
assert all(c["assigned_to"] in SALES for c in customers)
assert meta["next_order"] == 249, meta["next_order"]
ca_inv = [i for i in invoices if i["customer"] == "C-0001"]
assert [i["due"] for i in ca_inv] == ["2026-09-19", "2026-10-15"] and [i["id"] for i in ca_inv] == ["DF-INV-00001", "DF-INV-00002"]

files = {"catalogue": catalogue, "customers": customers, "price_lists": price_lists, "stock": stock,
         "orders": orders, "staff": staff, "approvals": approvals, "confirmations": [], "storage": storage,
         "invoices": invoices, "escalations": [], "drafts": [], "notifications": [], "stock_counts": [],
         "schedules": [], "meta": meta}
for name, obj in files.items():
    with open(os.path.join(DATA, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1)

# ---- Resources: product catalogue and customer directory (ID, name, salesperson, location) ----
staff_name = {s["id"]: s["name"] for s in staff}
cat_md = "# Product Catalogue\n\nDF Auto Parts Distributors, 60 SKUs. Order in whole selling units (SP-02): engine oil by the carton, filters and batteries by the piece, brake pads by the set. Prices come only from retrieve_customer_prices (SP-04).\n\n| SKU | Product | Brand | Part number | Specification | Selling unit | One unit contains |\n|---|---|---|---|---|---|---|\n"
cat_md += "".join(f"| {c['sku']} | {c['name']} | {c['brand']} | {c['part_no']} | {c['spec']} | {c['unit']} | {c['contains']} |\n" for c in catalogue)
dir_md = "# Customer Directory\n\nDF Auto Parts Distributors, 120 workshops and spare parts shops. ID, name, assigned salesperson and location only; delivery, credit and payments come through views of retrieve_customer_account after the hook checks department and assignment (MP-06, MP-07).\n\n| Customer | Name | Assigned salesperson | Location |\n|---|---|---|---|\n"
dir_md += "".join(f"| {c['id']} | {c['name']} | {c['assigned_to']} ({staff_name[c['assigned_to']]}) | {c['location']} |\n" for c in customers)


def page(title, intro, head, rows):
    css = open(os.path.join(RES, "Sales Policy.html"), encoding="utf-8").read().split("<style>")[1].split("</style>")[0]
    js = "<script>" + open(os.path.join(RES, "Sales Policy.html"), encoding="utf-8").read().split("<script>")[1]
    trs = "".join("<tr>" + "".join(f"<td>{v}</td>" for v in r) + "</tr>\n" for r in rows)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><style>{css}</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../df-auto-parts-distributors.html" style="color:inherit;text-decoration:none">DF Auto Parts Distributors</a></div><h1>{title}</h1><nav id="toc"></nav></div>
<p>{intro}</p>
<h2>1. {title}</h2>
<table class="cl"><tr>{''.join(f'<th>{h}</th>' for h in head)}</tr>
{trs}</table>
<footer>&copy; 2026 Lee Yih Ven &middot; {title}</footer></div>
{js}"""


open(os.path.join(RES, "Product Catalogue.md"), "w", encoding="utf-8").write(cat_md)
open(os.path.join(RES, "Customer Directory.md"), "w", encoding="utf-8").write(dir_md)
open(os.path.join(RES, "Product Catalogue.html"), "w", encoding="utf-8").write(page(
    "Product Catalogue", "60 SKUs in whole selling units: engine oil by the carton, filters and batteries by the piece, brake pads by the set. Prices are per customer and come only through the hooked price tool.",
    ["SKU", "Product", "Brand", "Part number", "Specification", "Selling unit", "One unit contains"],
    [(c["sku"], c["name"], c["brand"], c["part_no"], c["spec"], c["unit"], c["contains"]) for c in catalogue]))
open(os.path.join(RES, "Customer Directory.html"), "w", encoding="utf-8").write(page(
    "Customer Directory", "120 workshops and spare parts shops: ID, name, assigned salesperson and location only. Delivery, credit and payments sit behind the hooked account tool, by view.",
    ["Customer", "Name", "Assigned salesperson", "Location"],
    [(c["id"], c["name"], f"{c['assigned_to']} ({staff_name[c['assigned_to']]})", c["location"]) for c in customers]))
print(f"done: {len(catalogue)} SKUs, {len(customers)} customers, {len(orders)} orders (next DF-SO-{meta['next_order']:05d}), {len(approvals)} approvals, {len(invoices)} invoices")
