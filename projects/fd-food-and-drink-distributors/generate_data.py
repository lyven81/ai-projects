"""
FD Food and Drink Distributors: synthetic data for the staff assistant.

Forked from ai-project/projects/hoo tim biscuits/generate_dataset.py: same seed (42), the same
order behaviour per kind of customer (orders a month, lines per order, cartons per line), Selangor
locations. Changed: the business, a 60-SKU ambient catalogue, 120 customers of three kinds with
fictional names, credit, contacts, price lists, stock, staff and the seeded approval records.
Money in sen, times as Unix seconds (UTC). Reads resources/policy_tables.json (run
build_policies.py first). Writes data/*.json and resources/Product Catalogue.* and
Customer Directory.*. Hoo Tim's own data is not touched.

The named records the Answer Key needs (C-A = C-0001, C-Z = C-0002, the failure-case records,
the seeded approvals) are planted first and checked at the end, so a fresh run gives the same records.
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
# (sku, product name, brand, pack size, ordering unit, base price in sen per unit)
CATALOGUE = [
    # Drinks
    ("FD-DR-001", "Chrysanthemum Tea Drink", "Taman Segar", "24 x 250 ml", "carton", 2640),
    ("FD-DR-002", "Soya Bean Drink", "Taman Segar", "24 x 250 ml", "carton", 2520),
    ("FD-DR-003", "Mineral Water", "Air Bukit", "12 x 1.5 L", "carton", 4000),
    ("FD-DR-004", "Sparkling Orange", "Kilau", "24 x 325 ml", "carton", 3360),
    ("FD-DR-005", "Isotonic Drink", "Lari Laju", "24 x 500 ml", "carton", 5280),
    ("FD-DR-006", "Teh Tarik 3 in 1", "Warung Pagi", "20 x 10 sachets", "case", 7800),
    ("FD-DR-007", "White Coffee 3 in 1", "Warung Pagi", "20 x 15 sachets", "case", 9600),
    ("FD-DR-008", "Malt Chocolate Drink", "Kuat Pagi", "12 x 1 kg", "carton", 18600),
    ("FD-DR-009", "Lychee Juice", "Buah Manis", "24 x 300 ml", "carton", 3120),
    ("FD-DR-010", "Guava Juice", "Buah Manis", "24 x 300 ml", "carton", 3120),
    ("FD-DR-011", "Green Tea Drink", "Daun Hijau", "24 x 480 ml", "carton", 4320),
    ("FD-DR-012", "Coconut Water", "Pantai Timur", "24 x 300 ml", "carton", 4560),
    ("FD-DR-013", "Cola", "Kilau", "24 x 325 ml", "carton", 3240),
    ("FD-DR-014", "Sweetened Condensed Creamer", "Lembu Emas", "48 x 500 g", "carton", 15360),
    ("FD-DR-015", "Evaporated Creamer", "Lembu Emas", "48 x 390 g", "carton", 12960),
    # Packaged food
    ("FD-PF-001", "Cream Crackers", "Rangup", "12 x 400 g", "carton", 7200),
    ("FD-PF-002", "Marie Biscuits", "Rangup", "12 x 400 g", "carton", 6600),
    ("FD-PF-003", "Instant Noodles Curry", "Mee Senang", "30 x 5 packs", "carton", 5000),
    ("FD-PF-004", "Instant Noodles Chicken", "Mee Senang", "30 x 5 packs", "carton", 4800),
    ("FD-PF-005", "Rice Vermicelli", "Bihun Jaya", "30 x 400 g", "carton", 5400),
    ("FD-PF-006", "Canned Sardines in Tomato Sauce", "Laut Biru", "24 x 425 g", "carton", 9120),
    ("FD-PF-007", "Canned Tuna Chunks", "Laut Biru", "48 x 185 g", "carton", 14400),
    ("FD-PF-008", "Canned Baked Beans", "Kebun Ria", "24 x 425 g", "carton", 7680),
    ("FD-PF-009", "Canned Button Mushrooms", "Kebun Ria", "24 x 425 g", "carton", 8640),
    ("FD-PF-010", "Corned Beef", "Ladang Utara", "24 x 340 g", "carton", 3600),
    ("FD-PF-011", "Kaya Spread", "Pandan Wangi", "24 x 400 g", "carton", 8160),
    ("FD-PF-012", "Peanut Butter", "Kacang Emas", "12 x 510 g", "carton", 9360),
    ("FD-PF-013", "Wafer Rolls", "Rangup", "12 x 300 g", "carton", 6240),
    ("FD-PF-014", "Prawn Crackers", "Keropok Ria", "20 x 200 g", "bag", 5600),
    ("FD-PF-015", "Oat Cereal", "Pagi Sihat", "12 x 800 g", "carton", 13200),
    # Sauces
    ("FD-SC-001", "Chilli Sauce", "Api Merah", "12 x 1 kg", "carton", 6000),
    ("FD-SC-002", "Tomato Ketchup", "Api Merah", "12 x 1 kg", "carton", 2500),
    ("FD-SC-003", "Light Soy Sauce", "Kicap Tua", "12 x 640 ml", "carton", 5280),
    ("FD-SC-004", "Dark Soy Sauce", "Kicap Tua", "12 x 640 ml", "carton", 5520),
    ("FD-SC-005", "Sweet Soy Sauce", "Kicap Manis Bonda", "12 x 620 ml", "carton", 5040),
    ("FD-SC-006", "Oyster Sauce", "Tiram Mas", "12 x 770 g", "carton", 8400),
    ("FD-SC-007", "Fish Sauce", "Laut Biru", "12 x 700 ml", "carton", 4320),
    ("FD-SC-008", "Chilli Paste", "Api Merah", "24 x 230 g", "carton", 7680),
    ("FD-SC-009", "Sambal Belacan", "Dapur Bonda", "24 x 200 g", "carton", 8160),
    ("FD-SC-010", "Mayonnaise", "Kebun Ria", "12 x 1 L", "carton", 10800),
    ("FD-SC-011", "Black Pepper Sauce", "Tiram Mas", "12 x 500 g", "carton", 7200),
    ("FD-SC-012", "Satay Peanut Sauce", "Dapur Bonda", "24 x 300 g", "carton", 9600),
    ("FD-SC-013", "Vinegar", "Kicap Tua", "12 x 1 L", "carton", 3360),
    ("FD-SC-014", "Sesame Oil", "Bijan Emas", "12 x 320 ml", "carton", 9360),
    ("FD-SC-015", "Curry Paste", "Dapur Bonda", "24 x 250 g", "carton", 8640),
    # Cooking ingredients
    ("FD-CI-001", "Cooking Oil", "Sawit Murni", "6 x 5 kg", "carton", 13800),
    ("FD-CI-002", "Rice, local white", "Padi Utara", "1 x 10 kg", "bag", 3100),
    ("FD-CI-003", "Rice, fragrant", "Padi Utara", "1 x 10 kg", "bag", 4200),
    ("FD-CI-004", "Wheat Flour", "Gandum Jaya", "1 x 25 kg", "bag", 5600),
    ("FD-CI-005", "Ghee", "Lembu Emas", "12 x 800 g", "tin", 22800),
    ("FD-CI-006", "Coarse Sugar", "Tebu Manis", "1 x 25 kg", "bag", 7400),
    ("FD-CI-007", "Fine Salt", "Garam Laut", "24 x 500 g", "carton", 2880),
    ("FD-CI-008", "Curry Powder, meat", "Rempah Bonda", "20 x 250 g", "carton", 9000),
    ("FD-CI-009", "Chilli Powder", "Rempah Bonda", "20 x 250 g", "carton", 8400),
    ("FD-CI-010", "Turmeric Powder", "Rempah Bonda", "20 x 250 g", "carton", 6000),
    ("FD-CI-011", "Coconut Milk", "Santan Segar", "24 x 200 ml", "carton", 5760),
    ("FD-CI-012", "Cornflour", "Gandum Jaya", "24 x 400 g", "carton", 5280),
    ("FD-CI-013", "Anchovies, dried", "Laut Biru", "10 x 500 g", "bag", 16500),
    ("FD-CI-014", "Belacan Block", "Dapur Bonda", "40 x 250 g", "carton", 12000),
    ("FD-CI-015", "Palm Sugar", "Tebu Manis", "20 x 500 g", "carton", 7000),
]
SKUS = [c[0] for c in CATALOGUE]
BASE = {c[0]: c[5] for c in CATALOGUE}

# ---- CUSTOMERS (Hoo Tim order behaviour, three kinds) ----
KINDS = [("sundry", 50), ("minimarket", 40), ("restaurant", 30)]
BEHAVIOUR = {  # orders in September, lines per order, units per line (from Hoo Tim's channels)
    "sundry": {"orders": (1, 2), "lines": (3, 6), "qty": (1, 2), "limit": (2000, 6000), "factor": 1.02},
    "minimarket": {"orders": (1, 3), "lines": (7, 12), "qty": (1, 5), "limit": (6000, 15000), "factor": 0.97},
    "restaurant": {"orders": (2, 4), "lines": (4, 8), "qty": (2, 6), "limit": (3000, 9000), "factor": 1.00},
}
NAME_WORDS = ["Seri Mawar", "Bunga Raya", "Pelangi Jaya", "Sinar Pagi", "Harmoni", "Bintang Timur", "Cahaya",
              "Mutiara", "Damai", "Kenanga", "Melati", "Cempaka", "Teratai", "Delima", "Permata", "Sentosa",
              "Bahagia", "Gemilang", "Murni", "Indah", "Setia", "Makmur", "Sejahtera", "Mesra", "Ceria",
              "Wangi", "Nusa", "Puncak", "Tiara", "Suria", "Kasih", "Selasih", "Lestari", "Rimba", "Anggerik",
              "Seroja", "Kemboja", "Sakura", "Jasmin", "Orkid", "Ros", "Lily", "Ehsan", "Rezeki", "Berkat",
              "Aman", "Jaya Baru", "Sri Muda", "Taman Baru", "Lembah"]
KIND_NAME = {"sundry": "Kedai Runcit {}", "minimarket": "{} Mini Mart", "restaurant": "Restoran {}"}
TOWNS = list(T["locations"])
SALES = ["SL-02-01", "SL-02-02"]

customers, price_lists, contacts_seq = [], {}, 0
names_used = set()


def phone():
    return f"+60 1{random.choice('2369')}-{random.randint(200, 999)} {random.randint(1000, 9999)}"


def new_name(kind):
    while True:
        n = KIND_NAME[kind].format(random.choice(NAME_WORDS))
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


# Named records first (the Answer Key's C-A, C-Z and the incomplete credit record).
NAMED = {
    "C-0001": dict(name="Kedai Runcit Seri Mawar", kind="sundry", location="Shah Alam", assigned_to="SL-02-01",
                   credit_limit=500000, outstanding=310000, terms=30,
                   contacts=[dict(id="CT-0001-1", name="Puan Zarina", channel="whatsapp", value="+60 12-418 7702", approved=True),
                             dict(id="CT-0001-2", name="Accounts", channel="email", value="accounts@serimawar.example", approved=False)]),
    "C-0002": dict(name="Restoran Bunga Raya", kind="restaurant", location="Klang", assigned_to="SL-02-02",
                   credit_limit=300000, outstanding=300000, terms=30,
                   contacts=[dict(id="CT-0002-1", name="Encik Faizal", channel="whatsapp", value="+60 13-552 0914", approved=True)]),
    "C-0003": dict(name="Pelangi Jaya Mini Mart", kind="minimarket", location="Puchong", assigned_to="SL-02-02",
                   credit_limit=None, outstanding=420000, terms=30,
                   contacts=[dict(id="CT-0003-1", name="Ms Lim", channel="whatsapp", value="+60 16-730 2281", approved=True)]),
}
for cid, c in NAMED.items():
    names_used.add(c["name"])
    customers.append(dict(id=cid, **c))
    make_prices(cid, c["kind"], missing=0)
# C-A: fixed prices for the SKUs the cases use, and FD-SC-007 missing from its list (row 14).
price_lists["C-0001"].update({"FD-DR-003": 4000, "FD-SC-002": 2500, "FD-PF-003": 5000, "FD-PF-010": 3600, "FD-DR-012": 4560})
del price_lists["C-0001"]["FD-SC-007"]

kinds = [k for k, n in KINDS for _ in range(n)]
kinds.remove("sundry"); kinds.remove("restaurant"); kinds.remove("minimarket")  # the three named ones
random.shuffle(kinds)
for i, kind in enumerate(kinds, start=4):
    cid = f"C-{i:04d}"
    b = BEHAVIOUR[kind]
    limit = random.randint(*b["limit"]) // 100 * 10000
    used = random.uniform(0.15, 0.9) if random.random() > 0.05 else random.uniform(1.0, 1.15)  # a few above the limit
    cs = [dict(id=f"CT-{i:04d}-1", name=random.choice(["Owner", "Manager", "Store manager", "Purchasing"]),
               channel="whatsapp", value=phone(), approved=True)]
    if random.random() < 0.4:
        cs.append(dict(id=f"CT-{i:04d}-2", name="Accounts", channel="email",
                       value=f"accounts{i}@shop.example", approved=random.random() < 0.7))
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
        stock[s][wh] = dict(qty=random.randint(40, 400), updated=NOW - random.randint(2, 20) * 3600)
for s in random.sample([x for x in SKUS if x not in ("FD-DR-003", "FD-PF-010", "FD-SC-002", "FD-PF-003")], 5):
    stock[s]["WH-B"]["updated"] = NOW - random.randint(26, 50) * 3600  # some figures out of date on purpose
for s in random.sample(SKUS, 3):
    stock[s]["WH-B"]["qty"] = random.randint(0, 4)  # some SKUs short on purpose
stock["FD-DR-003"]["WH-A"] = dict(qty=200, updated=ts("2026-10-01 06:00"))
stock["FD-SC-002"]["WH-A"] = dict(qty=120, updated=ts("2026-10-01 06:00"))
stock["FD-PF-003"]["WH-A"] = dict(qty=150, updated=ts("2026-10-01 06:00"))
stock["FD-SC-007"]["WH-A"] = dict(qty=80, updated=ts("2026-10-01 06:00"))
stock["FD-PF-010"]["WH-A"] = dict(qty=60, updated=ts("2026-09-30 04:00"))  # 30 hours old (row 15, run e)
stock["FD-DR-012"]["WH-A"] = dict(qty=8, updated=ts("2026-10-01 06:00"))  # short: 8 cartons (RM 364.80), above the minimum
del stock["FD-CI-014"]["WH-A"]  # no stock record at WH-A (failure 5)

# ---- STORAGE: bin location and last manual count per SKU per warehouse (Warehouse only, MP-07).
# A separate random stream, so every record above keeps its values.
rx = random.Random(SEED + 1)
storage = {}
for s in SKUS:
    storage[s] = {}
    for wh in ("WH-A", "WH-B"):
        storage[s][wh] = dict(bin=f"{rx.choice('ABCDEF')}-{rx.randint(1, 12):02d}-{rx.randint(1, 4)}",
                              last_count=NOW - rx.randint(3, 40) * 86400 - rx.randint(0, 8) * 3600)
storage["FD-DR-003"]["WH-A"] = dict(bin="A-01-1", last_count=ts("2026-09-28 16:00"))

# ---- ORDERS: September 2026 history, all delivered, then C-A's open order due tomorrow ----
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
history.sort(key=lambda o: o["created_at"])
for n, o in enumerate(history, start=1):
    orders.append(dict(id=f"FD-SO-{n:05d}", request_id=f"RQ-H{n:05d}", **o))
open_id = f"FD-SO-{len(orders) + 1:05d}"
orders.append(dict(id=open_id, request_id="RQ-H-OPEN", customer="C-0001", created_by="SL-02-01",
                   created_at=ts("2026-09-30 16:10"),
                   lines=[dict(sku="FD-DR-003", qty=10, unit_price=4000), dict(sku="FD-SC-002", qty=6, unit_price=2500)],
                   discount_pct=0, total=55000, route="credit", delivery_date="2026-10-02",
                   status="pending_dispatch", warehouse="WH-A"))

# ---- APPROVAL RECORDS (seeded; seven fields) ----
approvals = [
    dict(id="AP-0091", approver="SL-01-01", type="minimum_order", customer="C-0010", request_id="RQ-H00012", value=22000, time=ts("2026-09-02 11:20")),
    dict(id="AP-0092", approver="WH-01-01", type="delivery_exception", customer="C-0021", request_id="RQ-H00040", value="2026-09-05", time=ts("2026-09-04 10:05")),
    dict(id="AP-0093", approver="FN-01-01", type="prepaid", customer="C-0033", request_id="RQ-H00088", value=180000, time=ts("2026-09-10 15:40")),
    # For the benchmark's approval and identity runs (request IDs the matrix does not use).
    dict(id="AP-0101", approver="SL-01-01", type="discount", customer="C-0001", request_id="RQ-A", value=10, time=ts("2026-10-01 09:30")),
    dict(id="AP-0102", approver="FN-01-01", type="discount", customer="C-0001", request_id="RQ-B", value=10, time=ts("2026-10-01 09:32")),
    dict(id="AP-0103", approver="FN-01-01", type="prepaid", customer="C-0001", request_id="RQ-D", value=120000, time=ts("2026-10-01 09:35")),
    dict(id="AP-0104", approver="WH-01-01", type="stock_confirmation", customer="C-0001", request_id="RQ-E", value="FD-PF-010", time=ts("2026-10-01 09:40")),
]
for a in approvals[:3]:  # the September records belong to the history orders they name
    a["customer"] = next(o["customer"] for o in orders if o["request_id"] == a["request_id"])

# ---- INVOICES: the unpaid invoices behind each outstanding balance (Finance only, MP-07).
# Outstanding = unpaid invoices + open orders, so the figures agree. Due date = issue date + terms (FP-09).
def due_of(issued, days):
    return (datetime.strptime(issued, "%Y-%m-%d") + timedelta(days=days)).strftime("%Y-%m-%d")
invoices, inv_n = [], 0
for c in customers:
    open_total = sum(o["total"] for o in orders if o["customer"] == c["id"] and o["status"] != "delivered")
    unpaid = c["outstanding"] - open_total
    if c["id"] == "C-0001":
        parts = [("2026-08-20", 135000), ("2026-09-15", 120000)]  # one overdue, one not yet due
        assert sum(x for _, x in parts) == unpaid
    elif unpaid <= 0:
        continue
    else:
        older = unpaid * rx.randint(35, 65) // 100
        parts = [(f"2026-08-{rx.randint(5, 28):02d}", older), (f"2026-09-{rx.randint(8, 29):02d}", unpaid - older)]
    for issued, amount in parts:
        inv_n += 1
        invoices.append(dict(id=f"FD-INV-{inv_n:05d}", customer=c["id"], issued=issued, due=due_of(issued, c["terms"]),
                             amount=amount, paid=False))

staff = T["staff"]
meta = dict(seed=SEED, now=NOW, now_label="Thursday 1 October 2026, 10:00 Malaysia time",
            next_order=len(orders) + 1, open_order=open_id,
            named={"C-A": "C-0001", "C-Z": "C-0002", "credit_incomplete": "C-0003",
                   "stock_30h": ["FD-PF-010", "WH-A"], "stock_missing": ["FD-CI-014", "WH-A"],
                   "stock_short": ["FD-DR-012", "WH-A"], "promotion_sku": "FD-PF-003", "no_price_sku": "FD-SC-007"})

catalogue = [dict(sku=c[0], name=c[1], brand=c[2], pack=c[3], unit=c[4]) for c in CATALOGUE]

# ---- Checks: every record the Answer Key names is present and as stated ----
ca = next(c for c in customers if c["id"] == "C-0001")
assert ca["credit_limit"] - ca["outstanding"] == 190000 and ca["assigned_to"] == "SL-02-01" and ca["warehouse"] == "WH-A"
assert [x["approved"] for x in ca["contacts"]] == [True, False]
cz = next(c for c in customers if c["id"] == "C-0002")
assert cz["credit_limit"] - cz["outstanding"] == 0
assert next(c for c in customers if c["id"] == "C-0003")["credit_limit"] is None
assert NOW - stock["FD-PF-010"]["WH-A"]["updated"] == 30 * 3600
assert "WH-A" not in stock["FD-CI-014"] and stock["FD-DR-012"]["WH-A"]["qty"] == 8
assert "FD-SC-007" not in price_lists["C-0001"] and price_lists["C-0001"]["FD-DR-003"] == 4000
assert any("FD-PF-003" in p["skus"] and p["start"] <= "2026-10-01" <= p["end"] for p in T["promotions"])
for p in T["promotions"]:
    assert all(s in SKUS for s in p["skus"]), p["id"]
assert len(catalogue) == 60 and len(customers) == 120 and len(set(SKUS)) == 60
assert sum(1 for c in customers if c["kind"] == "sundry") == 50 and sum(1 for c in customers if c["kind"] == "restaurant") == 30
assert all(c["assigned_to"] in SALES for c in customers)
assert next(o for o in orders if o["id"] == open_id)["delivery_date"] == "2026-10-02"
ca_inv = [i for i in invoices if i["customer"] == "C-0001"]
assert [i["due"] for i in ca_inv] == ["2026-09-19", "2026-10-15"] and sum(i["amount"] for i in ca_inv) == 255000
assert storage["FD-DR-003"]["WH-A"]["bin"] == "A-01-1"

files = {"catalogue": catalogue, "customers": customers, "price_lists": price_lists, "stock": stock,
         "orders": orders, "staff": staff, "approvals": approvals, "confirmations": [], "credit_raises": [],
         "storage": storage, "invoices": invoices,
         "meta": meta}
for name, obj in files.items():
    with open(os.path.join(DATA, f"{name}.json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=1)

# ---- Resources: product catalogue and customer directory (option A: ID, name, salesperson, location) ----
staff_name = {s["id"]: s["name"] for s in staff}
cat_md = "# Product Catalogue\n\nFD Food and Drink Distributors, 60 SKUs, all ambient. Order in whole ordering units (SP-02). Prices come only from retrieve_customer_prices (SP-04).\n\n| SKU | Product | Brand | Pack | Ordering unit |\n|---|---|---|---|---|\n"
cat_md += "".join(f"| {c['sku']} | {c['name']} | {c['brand']} | {c['pack']} | {c['unit']} |\n" for c in catalogue)
dir_md = "# Customer Directory\n\nFD Food and Drink Distributors, 120 customers. ID, name, assigned salesperson and location only; delivery, credit and payments come through views of retrieve_customer_account after the hook checks department and assignment (MP-06, MP-07).\n\n| Customer | Name | Assigned salesperson | Location |\n|---|---|---|---|\n"
dir_md += "".join(f"| {c['id']} | {c['name']} | {c['assigned_to']} ({staff_name[c['assigned_to']]}) | {c['location']} |\n" for c in customers)


def page(title, intro, head, rows):
    css = open(os.path.join(RES, "Sales Policy.html"), encoding="utf-8").read().split("<style>")[1].split("</style>")[0]
    js = "<script>" + open(os.path.join(RES, "Sales Policy.html"), encoding="utf-8").read().split("<script>")[1]
    trs = "".join("<tr>" + "".join(f"<td>{v}</td>" for v in r) + "</tr>\n" for r in rows)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><style>{css}</style></head><body><div class="wrap">
<div class="top"><div class="crumbs" style="font-size:12.5px;opacity:.8;margin-bottom:2px"><a href="../../../index.html" style="color:inherit;text-decoration:none">AI Projects</a> / <a href="../../../fd-food-and-drink-distributors.html" style="color:inherit;text-decoration:none">FD Food and Drink Distributors</a></div><h1>{title}</h1><nav id="toc"></nav></div>
<p>{intro}</p>
<h2>1. {title}</h2>
<table class="cl"><tr>{''.join(f'<th>{h}</th>' for h in head)}</tr>
{trs}</table>
<footer>&copy; 2026 Lee Yih Ven &middot; {title}</footer></div>
{js}"""


open(os.path.join(RES, "Product Catalogue.md"), "w", encoding="utf-8").write(cat_md)
open(os.path.join(RES, "Customer Directory.md"), "w", encoding="utf-8").write(dir_md)
open(os.path.join(RES, "Product Catalogue.html"), "w", encoding="utf-8").write(page(
    "Product Catalogue", "60 SKUs, all ambient, ordered in whole ordering units. Prices are per customer and come only through the hooked price tool.",
    ["SKU", "Product", "Brand", "Pack", "Ordering unit"], [(c["sku"], c["name"], c["brand"], c["pack"], c["unit"]) for c in catalogue]))
open(os.path.join(RES, "Customer Directory.html"), "w", encoding="utf-8").write(page(
    "Customer Directory", "120 customers: ID, name, assigned salesperson and location only. Delivery, credit and payments sit behind the hooked account tool, by view.",
    ["Customer", "Name", "Assigned salesperson", "Location"],
    [(c["id"], c["name"], f"{c['assigned_to']} ({staff_name[c['assigned_to']]})", c["location"]) for c in customers]))
print(f"done: {len(catalogue)} SKUs, {len(customers)} customers, {len(orders)} orders (open {open_id}), {len(approvals)} approvals")
