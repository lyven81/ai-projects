"""Comel Diaper sample data generator (fixed seed).

Writes, once, before the build:
  data/campaigns.csv          60 campaigns, 10 columns
  data/weekly_results.csv     review period, Mon 29 Sep 2025 to Sun 27 Sep 2026
  data/weekly_results_next.csv next period, Mon 28 Sep to Sun 25 Oct 2026 (read only by the check)
  data/plan.seed.json         the approved changes the check cases start from
  data/states.json            where each seeded data state sits (for the Answer Key and cases)
  data/data_notes.json        data issues the owner reported (one tracking fault), supplied information (RP-10)

The rules in resources/ were written first; the states below are seeded against them.
Same seed, same data.
"""
import csv, json, random
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
rng = random.Random(20261029)

REVIEW_START = date(2025, 9, 29)
CUTOFF = date(2026, 9, 27)
NEXT_START = date(2026, 9, 28)
NEXT_WEEKS = 4
WEEKS = [REVIEW_START + timedelta(weeks=i) for i in range(52)]
NEXT = [NEXT_START + timedelta(weeks=i) for i in range(NEXT_WEEKS)]

PLATFORMS = {  # code, completed, running, weekly budget range, CPM, CTR %, Sales ROAS, freq
    "Facebook":    ("FB", 12, 4, (160, 280), 18.0, 1.40, 3.20, 1.8),
    "Instagram":   ("IG", 12, 4, (160, 300), 22.0, 1.10, 3.80, 1.9),
    "TikTok":      ("TT", 11, 3, (130, 250), 12.0, 1.80, 2.70, 1.6),
    "YouTube":     ("YT", 6, 2, (150, 240), 25.0, 0.80, 2.20, 1.5),
    "XiaoHongShu": ("XH", 4, 2, (50, 80), 30.0, 1.20, 2.50, 1.4),
}
# Sales only (founder, 30 Oct 2026): every campaign is a Sales campaign; the first Running one on FB, IG and TT is the partial one.
FORMATS = ["Image", "Carousel", "Video", "Short video", "Live"]
AUDIENCES = ["New", "Lookalike", "Retargeting", "Existing customers"]
NAMES = {
    "Sales": ["Newborn Pack Sale", "Night Pants Promo", "Wipes Bundle Deal", "11.11 Mega Sale", "12.12 Year-End Sale",
              "CNY Bundle", "Raya Value Pack", "Mid-Year Sale", "Merdeka Deal", "Size Up Bundle", "Subscribe and Save",
              "Cart Reminder"],
}


def week_row(cid, wk, spend, cpm, ctr, roas, freq, objective, aov=72.0):
    impressions = int(round(spend / (cpm * rng.uniform(0.92, 1.08)) * 1000))  # CPM and CTR vary week to week
    clicks = int(round(impressions * ctr * rng.uniform(0.92, 1.08) / 100))
    engagements = int(round(impressions * rng.uniform(0.02, 0.045)))
    reach = int(round(impressions / freq))
    leads = orders = 0
    revenue = 0.0
    if objective == "Sales":
        revenue = round(spend * roas, 2)
        orders = int(round(revenue / aov))
    return {"campaign_id": cid, "week_start": wk.isoformat(), "spend_rm": round(spend, 2), "impressions": impressions,
            "reach": reach, "clicks": clicks, "engagements": engagements, "leads": leads, "orders": orders,
            "revenue_rm": revenue}


campaigns, weekly, nxt = [], [], []
states = {}
perf = {}  # campaign id -> (cpm, ctr, roas, freq, weekly budget)
name_use = {}

for platform, (code, n_done, n_run, (blo, bhi), cpm0, ctr0, roas0, freq0) in PLATFORMS.items():
    for i in range(n_done + n_run):
        cid = f"{code}-{i + 1:02d}"
        running = i >= n_done
        objective = "Sales"
        weekly_budget = round(rng.uniform(blo, bhi) / 10) * 10
        if running:
            if i == n_done and platform in ("Facebook", "Instagram", "TikTok"):
                start = date(2026, 9, 21) if platform == "TikTok" else date(2026, 9, 14)  # partial: 1 or 2 weeks in
                weekly_budget = {"Facebook": 90, "Instagram": 100, "TikTok": 80}[platform]  # a new launch on a small test budget
            else:
                start = CUTOFF + timedelta(days=1) - timedelta(weeks=rng.randint(6, 12))
            end = date(2026, 11, 29) + timedelta(weeks=rng.randint(0, 4))
        else:
            n = rng.randint(4, 8)
            latest = len(WEEKS) - n
            s = rng.randint(0, latest)
            start, end = WEEKS[s], WEEKS[s] + timedelta(weeks=n) - timedelta(days=1)
        names = NAMES[objective]
        k = name_use.get(objective, 0)
        name_use[objective] = k + 1
        campaigns.append({"campaign_id": cid, "campaign_name": names[k % len(names)], "platform": platform,
                          "objective": objective, "format": rng.choice(FORMATS), "audience": rng.choice(AUDIENCES),
                          "start_date": start.isoformat(), "end_date": end.isoformat(), "budget_rm": 0.0,
                          "status": "Running" if running else "Completed"})
        perf[cid] = (cpm0 * rng.uniform(0.85, 1.15), ctr0 * rng.uniform(0.8, 1.2), roas0 * rng.uniform(0.8, 1.2),
                     freq0 * rng.uniform(0.9, 1.15), weekly_budget)

by_id = {c["campaign_id"]: c for c in campaigns}

# Seeded states, chosen from the generated campaigns so each sits at a known ID.
completed_sales = [c for c in campaigns if c["status"] == "Completed" and c["objective"] == "Sales"
                   and c["platform"] in ("Facebook", "Instagram", "TikTok")]
states["overspend"] = [completed_sales[0]["campaign_id"], completed_sales[3]["campaign_id"]]
states["zero_results"] = [c["campaign_id"] for c in completed_sales if c["platform"] == "TikTok"][:1]
states["missing_week"] = [c["campaign_id"] for c in completed_sales if c["platform"] == "Facebook"
                          and c["campaign_id"] not in states["overspend"]][:1]
states["thin_evidence_platform"] = "XiaoHongShu"
states["partial"] = [c["campaign_id"] for c in campaigns if c["status"] == "Running" and c["start_date"] >= "2026-09-14"]
states["running"] = [c["campaign_id"] for c in campaigns if c["status"] == "Running"]

missing_week_date = None
for c in campaigns:
    cid = c["campaign_id"]
    cpm, ctr, roas, freq, wb = perf[cid]
    start, end = date.fromisoformat(c["start_date"]), date.fromisoformat(c["end_date"])
    weeks = [w for w in WEEKS if start <= w <= min(end, CUTOFF)]
    if c["status"] == "Completed":
        c["budget_rm"] = round(wb * len(weeks), 2)
    else:
        planned = [w for w in WEEKS + NEXT if start <= w <= end] + \
                  [NEXT[-1] + timedelta(weeks=j + 1) for j in range(52) if NEXT[-1] + timedelta(weeks=j + 1) <= end]
        c["budget_rm"] = round(wb * len(planned), 2)
    over = cid in states["overspend"]
    for j, w in enumerate(weeks):
        if cid in states["missing_week"] and j == 2:
            missing_week_date = w.isoformat()
            continue
        factor = rng.uniform(1.10, 1.16) if over else (rng.uniform(1.08, 1.14) if c["status"] == "Running" else rng.uniform(0.92, 1.0))
        r = week_row(cid, w, wb * factor, cpm, ctr, roas * rng.uniform(0.85, 1.15), freq * rng.uniform(0.9, 1.1), c["objective"])
        if cid in states["zero_results"] and j in (1, 2):
            r["orders"], r["revenue_rm"] = 0, 0.0
        weekly.append(r)
states["missing_week_date"] = missing_week_date

# Seeded approved plan for the check cases (clock Mon 26 Oct 2026).
run_est = [c for c in campaigns if c["status"] == "Running" and c["campaign_id"] not in states["partial"]]
def first(pred, used):
    for c in run_est:
        if pred(c) and c["campaign_id"] not in used:
            used.add(c["campaign_id"])
            return c
    raise SystemExit("no running campaign fits a seeded change")
used = set()
A = first(lambda c: c["platform"] == "Facebook", used)                      # pause, reported, spend stops: met
B = first(lambda c: c["platform"] == "TikTok", used)                        # pause, reported, spend continues: conflict
C = first(lambda c: c["objective"] == "Sales" and c["platform"] == "Instagram", used)   # trim, no record: not reported
D = first(lambda c: c["objective"] == "Sales" and c["platform"] == "Instagram", used)   # scale, midweek record: met
E = first(lambda c: c["objective"] == "Sales" and c["platform"] == "Facebook", used)    # trim, reported: missed
F = first(lambda c: c["platform"] == "YouTube", used)                       # extend, reported
G = first(lambda c: c["platform"] == "Instagram", used)                     # rejected: listed, not scored

def wb_of(c):
    return perf[c["campaign_id"]][4]

# P-01 (A paused, spend RM 0.00: met) was removed on 30 Oct (founder): a row of RM 0.00 weeks gives no insight.
# A stays selected, and its next-period rows stay as generated, so every other campaign's data is unchanged.
seed_plan = {"changes": [
    {"id": "P-02", "campaign_id": B["campaign_id"], "type": "pause", "change": {},
     "target": {"rule": "T1", "deadline": "2026-10-25"}, "status": "approved",
     "decided": {"by": "Owner", "at": "2026-09-28T10:07"},
     "action": {"action": "Paused", "date": "2026-09-30", "new_setting": "Paused"}},
    {"id": "P-03", "campaign_id": C["campaign_id"], "type": "budget_shift",
     "change": {"from_weekly_rm": wb_of(C), "to_weekly_rm": round(wb_of(C) * 0.85)},
     "target": {"rule": "T3", "deadline": "2026-10-25"}, "status": "approved",
     "decided": {"by": "Owner", "at": "2026-09-28T10:10"}, "action": None},
    {"id": "P-04", "campaign_id": D["campaign_id"], "type": "budget_shift",
     "change": {"from_weekly_rm": wb_of(D), "to_weekly_rm": round(wb_of(D) * 1.15)},
     "target": {"rule": "T2", "deadline": "2026-10-25"}, "status": "approved",
     "decided": {"by": "Owner", "at": "2026-09-28T10:12"},
     "action": {"action": "Weekly budget changed", "date": "2026-09-30", "new_setting": f"RM {round(wb_of(D) * 1.15)} a week"}},
    {"id": "P-05", "campaign_id": E["campaign_id"], "type": "budget_shift",
     "change": {"from_weekly_rm": wb_of(E), "to_weekly_rm": round(wb_of(E) * 0.85)},
     "target": {"rule": "T3", "deadline": "2026-10-25"}, "status": "approved",
     "decided": {"by": "Owner", "at": "2026-09-28T10:14"},
     "action": {"action": "Weekly budget changed", "date": "2026-10-01", "new_setting": f"RM {round(wb_of(E) * 0.85)} a week"}},
    {"id": "P-06", "campaign_id": F["campaign_id"], "type": "extend", "change": {"to_end_date": "2027-01-31"},
     "target": {"rule": "T4", "deadline": "2026-10-25"}, "status": "approved",
     "decided": {"by": "Owner", "at": "2026-09-28T10:16"},
     "action": {"action": "End date extended", "date": "2026-10-02", "new_setting": "Ends 31 Jan 2027"}},
    {"id": "P-07", "campaign_id": G["campaign_id"], "type": "pause", "change": {},
     "target": {"rule": "T1", "deadline": "2026-10-25"}, "status": "rejected",
     "decided": {"by": "Owner", "at": "2026-09-28T10:18"}, "action": None},
]}
states["seed_plan"] = {"conflict": B["campaign_id"], "not_reported": C["campaign_id"],
                       "midweek_met": D["campaign_id"], "missed": E["campaign_id"], "extend": F["campaign_id"],
                       "rejected": G["campaign_id"]}

# Next period: generated once, with the effects the seeded plan records.
for c in campaigns:
    if c["status"] != "Running":
        continue
    cid = c["campaign_id"]
    cpm, ctr, roas, freq, wb = perf[cid]
    for j, w in enumerate(NEXT):
        spend, roas_w = wb * rng.uniform(1.00, 1.05), roas * rng.uniform(0.9, 1.1)
        if cid == A["campaign_id"] and j >= 1:
            spend = 0.0
        if cid == D["campaign_id"] and j >= 1:
            spend, roas_w = wb * 1.15 * rng.uniform(1.0, 1.03), roas * rng.uniform(0.97, 1.05)
        if cid == E["campaign_id"] and j >= 1:
            spend, roas_w = wb * 0.85 * rng.uniform(1.0, 1.03), roas * rng.uniform(0.70, 0.78)
        if cid == C["campaign_id"]:
            spend = wb * rng.uniform(1.00, 1.04)
        if spend == 0:
            nxt.append({"campaign_id": cid, "week_start": w.isoformat(), "spend_rm": 0.0, "impressions": 0, "reach": 0,
                        "clicks": 0, "engagements": 0, "leads": 0, "orders": 0, "revenue_rm": 0.0})
        else:
            r = week_row(cid, w, spend, cpm, ctr, roas_w, freq * rng.uniform(0.9, 1.1), c["objective"])
            nxt.append(r)

# Review-status states (RP-9, 30 Oct). Fixed overrides written after every random draw, so the rest of the
# data is unchanged. Each sits on a Completed Sales campaign; values give exact boundaries for the Answer Key.
used_ids = set(states["overspend"] + states["zero_results"] + states["missing_week"])
free = [c for c in completed_sales if c["campaign_id"] not in used_ids]
ig_free = [c for c in free if c["platform"] == "Instagram"]
pick = {"tracking_fault": ig_free[0]}
rest = [c for c in free if c is not pick["tracking_fault"]]
for k in ("limited_29", "boundary_30", "variable_above", "low_spend_useful", "high_spend_poor", "zero_avg_roas"):
    pick[k] = rest.pop(0)
rows_by = {}
for r in weekly:
    rows_by.setdefault(r["campaign_id"], []).append(r)

def scale(r, spend):  # delivery figures follow spend
    k = spend / r["spend_rm"]
    for f in ("impressions", "reach", "clicks", "engagements"):
        r[f] = int(round(r[f] * k))
    r["spend_rm"] = round(spend, 2)

def final_four(key, roas, orders, spends=None):
    rows = rows_by[pick[key]["campaign_id"]][-4:]
    for j, r in enumerate(rows):
        if spends:
            scale(r, spends[j])
        r["revenue_rm"] = round(r["spend_rm"] * roas[j], 2)
        r["orders"] = orders[j]
    return rows

final_four("limited_29", [2.50, 2.60, 2.40, 2.50], [7, 8, 7, 7])          # 29 orders: Limited results
final_four("boundary_30", [1.40, 2.60, 1.40, 2.60], [6, 9, 6, 9])         # 30 orders, variation exactly 30.00%: Consistent
final_four("variable_above", [1.39, 2.61, 1.40, 2.60], [6, 10, 6, 9])     # 31 orders, variation 30.25%: Variable
final_four("zero_avg_roas", [0, 0, 0, 0], [0, 0, 0, 0])                    # spend, no revenue: mean ROAS zero
LOW_S, LOW_R, HIGH_S, HIGH_R = [96.40, 98.10, 95.20, 97.80], [5.40, 5.50, 5.30, 5.45], [601.20, 598.40, 604.90, 599.70], [1.10, 1.12, 1.08, 1.11]
for key, S_, R_, per_week in (("low_spend_useful", LOW_S, LOW_R, 100), ("high_spend_poor", HIGH_S, HIGH_R, 620)):
    rows = rows_by[pick[key]["campaign_id"]]
    for j, r in enumerate(rows):  # every week: low spend with useful results, high spend with poor results
        scale(r, S_[j % 4])
        r["revenue_rm"] = round(r["spend_rm"] * R_[j % 4], 2)
        r["orders"] = int(round(r["revenue_rm"] / 72.0))
    for j, r in enumerate(rows[-4:]):
        r["orders"] = [8, 7, 8, 8][j] if key == "low_spend_useful" else 9
    pick[key]["budget_rm"] = round(per_week * len(rows), 2)
tf_rows = rows_by[pick["tracking_fault"]["campaign_id"]][-4:]
for r in tf_rows[1:3]:  # the weeks the owner reported: orders not recorded
    r["orders"], r["revenue_rm"] = 0, 0.0
tf_end = (date.fromisoformat(tf_rows[2]["week_start"]) + timedelta(days=6))
data_notes = [{"campaign_id": pick["tracking_fault"]["campaign_id"], "kind": "tracking_fault",
               "weeks": [tf_rows[1]["week_start"], tf_rows[2]["week_start"]], "source": "Reported by the owner",
               "note": f"Instagram purchase tracking was not recording orders from {date.fromisoformat(tf_rows[1]['week_start']).strftime('%d %b %Y').lstrip('0')} to {tf_end.strftime('%d %b %Y').lstrip('0')}."}]
states["review_status"] = {k: c["campaign_id"] for k, c in pick.items()}

# Tests in the seeded plan (PR-12): P-04 becomes a capped boost (increases need owner targets, PR-11), P-09 a new campaign test.
p4 = next(x for x in seed_plan["changes"] if x["id"] == "P-04")
p4["type"] = "test_boost"
p4["change"]["extra_rm"] = round((p4["change"]["to_weekly_rm"] - p4["change"]["from_weekly_rm"]) * 4, 2)
p4["test"] = {"question": "Does ROAS hold at a slightly higher weekly budget?", "stop_condition": "Stop early if the additional spending reaches its cap."}
seed_plan["changes"].append(
    {"id": "P-09", "campaign_id": None, "type": "test_new",
     "change": {"platform": "XiaoHongShu", "objective": "Sales", "campaign_name": "Wipes Bundle Trial", "weekly_rm": 100, "total_rm": 400},
     "test": {"question": "Does a wipes bundle sell on XiaoHongShu at a small budget?", "stop_condition": "Stop early if RM 400 is spent before 25 Oct 2026."},
     "target": {"rule": "T2", "deadline": "2026-10-25"}, "status": "approved",
     "decided": {"by": "Owner", "at": "2026-09-28T10:22"},
     "action": {"action": "Campaign created", "date": "2026-09-30", "new_setting": "RM 100 a week"}})
states["seed_plan"]["test_boost"] = D["campaign_id"]
states["seed_plan"]["test_new"] = "P-09"

# Headroom for the total-budget rule (PR-5): baseline spend of Running campaigns vs planned 4-week budget.
base_start, base_end = date(2026, 8, 31), CUTOFF
baseline = round(sum(r["spend_rm"] for r in weekly if r["campaign_id"] in states["running"]
                     and base_start <= date.fromisoformat(r["week_start"]) <= base_end), 2)
planned = round(sum(perf[c][4] * 4 for c in states["running"]), 2)
states["total_budget"] = {"baseline_spend_rm": baseline, "planned_next_rm": planned, "headroom_rm": round(baseline - planned, 2)}
states["weekly_budget"] = {c: perf[c][4] for c in states["running"]}

DATA.mkdir(exist_ok=True)
cols_c = ["campaign_id", "campaign_name", "platform", "objective", "format", "audience", "start_date", "end_date", "budget_rm", "status"]
cols_w = ["campaign_id", "week_start", "spend_rm", "impressions", "reach", "clicks", "engagements", "leads", "orders", "revenue_rm"]
for path, rows, cols in ((DATA / "campaigns.csv", campaigns, cols_c), (DATA / "weekly_results.csv", weekly, cols_w),
                         (DATA / "weekly_results_next.csv", nxt, cols_w)):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
(DATA / "plan.seed.json").write_text(json.dumps(seed_plan, indent=2), encoding="utf-8")
(DATA / "states.json").write_text(json.dumps(states, indent=2), encoding="utf-8")
(DATA / "data_notes.json").write_text(json.dumps({"notes": data_notes}, indent=2), encoding="utf-8")
print(f"campaigns {len(campaigns)}, review rows {len(weekly)}, next rows {len(nxt)}")
print(json.dumps(states, indent=1))
