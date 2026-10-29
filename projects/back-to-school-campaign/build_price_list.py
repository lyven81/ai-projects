"""Builds resources/price_list.json from the founder's price list (_plan/price list.txt).
The price list resource is the only source of prices; run this again if the founder's list changes."""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "_plan", "price list.txt")
CATS = {"PB": ("primary_boys", "Primary boys' uniforms"), "PG": ("primary_girls", "Primary girls' uniforms"),
        "SB": ("secondary_boys", "Secondary boys' uniforms"), "SG": ("secondary_girls", "Secondary girls' uniforms"),
        "PF": ("prefect", "Prefect and student leader uniforms"), "RS": ("religious_school", "Religious school uniforms"),
        "PE": ("sports_pe", "Sports and PE clothing"), "CU": ("co_curricular", "Co-curricular uniforms")}
PREFIX = {"PB": "Primary boys' ", "PG": "Primary girls' ", "SB": "Secondary boys' ", "SG": "Secondary girls' "}
CLAUSES = [
    {"id": "PL-01", "applies_to": ["PF"], "text": "Prefect and student leader colours are proposed options. Parents choose the design their school requires; copy never claims an item matches a school's uniform."},
    {"id": "PL-02", "applies_to": ["RS"], "text": "Religious school colours are proposed catalogue options and must match the school's requirements; copy never claims an item matches a school's uniform."},
    {"id": "PL-03", "applies_to": ["PE"], "text": "PE tops are plain, without school logos or printing; copy never offers logos, printing or school badges."},
    {"id": "PL-04", "applies_to": ["CU"], "text": "Each co-curricular garment is sold separately. Badges, scarves, headwear and other accessories are excluded from the campaign; copy never offers them or a full set."},
]

items = []
for line in open(SRC, encoding="utf-8"):
    m = re.match(r"^([A-Z]{2}\d{2})\t(.+?)\t(\d+\.\d\d)\t(\d+\.\d\d)\t(\d+)%\s*$", line.rstrip("\n"))
    if not m:
        continue
    sku, name, normal, promo, disc = m.groups()
    code = sku[:2]
    items.append({"sku": sku, "category": CATS[code][0], "name": PREFIX.get(code, "") + name[0].lower() + name[1:] if code in PREFIX else name,
                  "normal_price": float(normal), "promo_price": float(promo), "discount_pct": int(disc)})

assert len(items) == 100, len(items)
out = {"resource": "kiddoz://price-list", "shop": "Kiddoz Uniform House",
       "campaign_period": {"id": "PL-PERIOD", "start": "2026-10-26", "end": "2026-10-30", "text": "Monday 26 October 2026 to Friday 30 October 2026"},
       "max_discount_pct": 20, "scope": "Only the 100 campaign SKUs (about 20% of the shop's stock). A product not on this list is not in this campaign.",
       "categories": [{"code": k, "id": v[0], "title": v[1], "count": sum(1 for i in items if i["sku"].startswith(k))} for k, v in CATS.items()],
       "clauses": CLAUSES, "items": items}
json.dump(out, open(os.path.join(HERE, "resources", "price_list.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
print(len(items), "items;", ", ".join(f"{c['code']} {c['count']}" for c in out["categories"]))
