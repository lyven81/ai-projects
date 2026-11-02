"""
Step 2 - Conversation-log generator (courier CS quality management layer).

Reads the Step 1 ground-truth answer key, then emits a realistic synthetic log of
customer-service conversations with the known truth baked in and a known agent
error profile injected, so the Step 4 recovery check has a real truth to recover.

Outputs (in ./data):
  courier-cs-log.csv      deployed log, what a real client would have (NO truth columns)
  courier-cs-eval.csv     same rows + the baked-in truth (for the recovery check)
  courier-cs-log-150.csv  150-row sample of the deployed log
It also prints the baked-in summary truths (the numbers Step 4 must recover).
"""

import json, csv, random, os
from datetime import datetime, timedelta

random.seed(42)  # reproducible

HERE = os.path.dirname(os.path.abspath(__file__))
import glob
_keyfiles = glob.glob(os.path.join(HERE, "*ground-truth-key.json"))
if not _keyfiles:
    raise SystemExit("Could not find the Step 1 ground-truth-key.json in " + HERE)
KEY = json.load(open(_keyfiles[0], encoding="utf-8"))
os.makedirs(os.path.join(HERE, "data"), exist_ok=True)

# --- build a lookup of reason -> truth, plus out-of-scope ---
REASONS = {r["id"]: r for r in KEY["reasons"]}
REASONS[0] = KEY["out_of_scope"]

# --- two customer phrasings per reason (gives the text realism) ---
PHRASING = {
 1:["Hi, my parcel tracking hasn't updated in 4 days. Where is it?","Why is there no update on my shipment for days now?"],
 2:["The app says delivered but I never received my parcel.","Tracking shows delivered but nothing arrived at my place."],
 3:["When will my parcel be delivered?","What is the estimated delivery date for my order?"],
 4:["My parcel has been stuck at the sorting hub for a week.","Why is my shipment held at customs for so long?"],
 5:["It says out for delivery but no one came today.","Out for delivery since morning but I got nothing."],
 6:["I missed the delivery, how do I get it redelivered?","No one was home, can you redeliver tomorrow?"],
 7:["Rider marked recipient unavailable but I was home all day!","It says no one was home but I never left, this is wrong."],
 8:["Can I change my delivery address?","I need to reschedule the delivery to Friday."],
 9:["Can I collect my parcel at your branch instead?","I would rather self-collect at the hub, is that possible?"],
 10:["My parcel arrived broken, how do I claim?","The box was wet and the item inside is damaged."],
 11:["My parcel is lost, how do I get compensation?","It has been missing for weeks, I want to file a claim."],
 12:["I received someone else's parcel, not mine.","This is the wrong parcel, it is not what I shipped with you."],
 13:["Some items are missing from my parcel.","The parcel came but half the items are gone."],
 14:["Please leave my parcel at the guardhouse.","Can the rider leave it with my neighbour if I am out?"],
 15:["Your rider was extremely rude to me.","I want to complain about the delivery rider's attitude."],
 16:["The rider threw my parcel over the gate.","My parcel was just left outside, not handed to me."],
 17:["The COD amount is wrong, I was overcharged.","I already paid online but it still shows COD owing."],
 18:["Why is there an extra remote area surcharge?","Can you explain this additional weight fee?"],
 19:["I scheduled a pickup but no rider showed up.","How do I arrange a pickup for my outgoing parcels?"],
 20:["How do I return a parcel the customer rejected?","The recipient rejected it, how do I reship it?"],
 0:["What is your CEO's salary?","Can you give me the home address of your branch manager?"],
}

# relative frequency (WISMO heavy)
WEIGHT = {1:12,2:7,3:9,4:6,5:6,6:6,7:4,8:4,9:3,10:5,11:3,12:3,13:3,14:3,15:3,16:2,17:5,18:4,19:3,20:3,0:3}
CHANNELS = (["website"]*40)+(["whatsapp"]*45)+(["app"]*15)

N = 1200
END = datetime(2026, 6, 19)

def assemble_good(items):
    """A good reply that covers the checklist items (so quality is genuinely high)."""
    body = " ".join(s[0].upper()+s[1:]+"." for s in items)
    return "Thank you for reaching out. " + body

def pick_outcome_ai(true_oc, channel):
    """AI gate decision vs the correct outcome, with a known error profile."""
    if true_oc == "escalate":
        # under-escalation is the dangerous error; a touch worse on whatsapp
        under = 0.25 + (0.07 if channel == "whatsapp" else 0)
        return random.choices(["escalate","resolve","decline"], [1-under-0.05, under, 0.05])[0]
    if true_oc == "resolve":
        return random.choices(["resolve","escalate","decline"], [0.85, 0.10, 0.05])[0]
    # decline (out of scope)
    return random.choices(["decline","resolve"], [0.80, 0.20])[0]

# individual human agents (Option B): each with a distinct skill profile
ROSTER = [
 {"id":"farah","name":"Farah","init":"F","acc":0.97,"quality":0.90,"smin":9, "smax":13,"w":20},
 {"id":"mei",  "name":"Mei",  "init":"M","acc":0.96,"quality":0.87,"smin":10,"smax":15,"w":20},
 {"id":"arif", "name":"Arif", "init":"A","acc":0.95,"quality":0.85,"smin":11,"smax":16,"w":18},
 {"id":"raj",  "name":"Raj",  "init":"R","acc":0.92,"quality":0.80,"smin":8, "smax":14,"w":16},
 {"id":"bee",  "name":"Bee",  "init":"B","acc":0.84,"quality":0.72,"smin":7, "smax":12,"w":14},  # escalation gap
 {"id":"devi", "name":"Devi", "init":"D","acc":0.78,"quality":0.62,"smin":14,"smax":20,"w":12},  # new recruit
]
def pick_roster():
    return random.choices(ROSTER, weights=[a["w"] for a in ROSTER])[0]
def outcome_human(true_oc, acc):
    if random.random() < acc: return true_oc
    if true_oc == "escalate": return random.choices(["resolve","decline"], [0.85,0.15])[0]  # under-escalation
    if true_oc == "resolve":  return random.choices(["escalate","decline"], [0.7,0.3])[0]
    return "resolve"

rows = []
for i in range(N):
    rid = random.choices(list(WEIGHT), weights=list(WEIGHT.values()))[0]
    r = REASONS[rid]
    category = r["category"]
    # per-row correct outcome: conditional reasons sometimes trigger an escalate
    # Outcome is deterministic per reason (conditional triggers removed) so that
    # per-agent measurement is undistorted and appraisals are fair. The brain then
    # recovers the truth exactly on synthetic data; trigger-based escalation is a
    # documented production enhancement (needs tracking-timestamp / attempt-log fields).
    true_oc = r["correct_outcome"]
    trigger = False

    channel = random.choice(CHANNELS)
    if random.random() < 0.70:
        agent_type, agent_id, agent_name = "ai", "ai", "AI assistant"
        agent_oc = pick_outcome_ai(true_oc, channel); base_quality = 0.65; smin, smax = 1, 4
    else:
        agent_type = "human"; ag = pick_roster()
        agent_id, agent_name = ag["id"], ag["name"]
        agent_oc = outcome_human(true_oc, ag["acc"]); base_quality = ag["quality"]; smin, smax = ag["smin"], ag["smax"]
    outcome_correct = (agent_oc == true_oc)

    # response quality (a genuine fraction of checklist items covered)
    items = r["good_response_must_include"]
    good_prob = base_quality - (0.30 if not outcome_correct else 0)
    if random.random() < max(0.05, good_prob):
        covered = len(items) if random.random() < 0.7 else max(1, len(items)-1)
        quality = round(covered/len(items), 2)
        response = assemble_good(items[:covered])
    else:
        quality = round(random.choice([0.1, 0.25]), 2)
        response = r["bad_response_example"]

    # CSAT (present ~60% of the time)
    if outcome_correct and quality >= 0.8: csat = random.choice([4,5])
    elif outcome_correct:                  csat = random.choice([3,4])
    elif quality >= 0.8:                   csat = random.choice([2,3])
    else:                                  csat = random.choice([1,2])
    if random.random() < 0.40: csat = ""   # not everyone leaves CSAT

    handle = round(random.uniform(smin, smax),1)
    ts = (END - timedelta(days=random.randint(0,59), hours=random.randint(0,23), minutes=random.randint(0,59)))

    rows.append({
        "conversation_id": f"C{100000+i}",
        "timestamp": ts.strftime("%Y-%m-%d %H:%M"),
        "channel": channel,
        "agent_type": agent_type,
        "agent_id": agent_id,
        "agent_name": agent_name,
        "customer_message": random.choice(PHRASING[rid]),
        "agent_response": response,
        "agent_outcome": agent_oc,
        "handle_time_min": handle,
        "csat": csat,
        # --- baked-in truth (eval only) ---
        "true_reason_id": rid,
        "true_reason": r["reason"],
        "category": category,
        "true_correct_outcome": true_oc,
        "trigger_fired": trigger,
        "outcome_correct": outcome_correct,
        "response_quality": quality,
    })

rows.sort(key=lambda x: x["timestamp"])

DEPLOY_COLS = ["conversation_id","timestamp","channel","agent_type","agent_id","agent_name","customer_message","agent_response","agent_outcome","handle_time_min","csat"]
EVAL_COLS = DEPLOY_COLS + ["true_reason_id","true_reason","category","true_correct_outcome","trigger_fired","outcome_correct","response_quality"]

def write(path, cols, data):
    with open(os.path.join(HERE,"data",path),"w",newline="",encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
        for d in data: w.writerow({k:d[k] for k in cols})

write("courier-cs-log.csv", DEPLOY_COLS, rows)
write("courier-cs-eval.csv", EVAL_COLS, rows)
write("courier-cs-log-150.csv", DEPLOY_COLS, rows[:150])

# ---------- print the baked-in summary truths (Step 4 must recover these) ----------
def rate(sub, cond):
    s=[r for r in sub if cond(r)]; return (len(s), round(100*len(s)/max(1,len(sub)),1))
ai=[r for r in rows if r["agent_type"]=="ai"]; hu=[r for r in rows if r["agent_type"]=="human"]
esc_reasons=[r for r in ai if r["true_correct_outcome"]=="escalate"]
print(f"TOTAL conversations: {len(rows)}  (AI {len(ai)}, human {len(hu)})")
print(f"Containment (resolved by any agent): {rate(rows, lambda r:r['agent_outcome']=='resolve')[1]}%")
print(f"Escalation rate: {rate(rows, lambda r:r['agent_outcome']=='escalate')[1]}%   Decline rate: {rate(rows, lambda r:r['agent_outcome']=='decline')[1]}%")
print(f"AI outcome accuracy: {rate(ai, lambda r:r['outcome_correct'])[1]}%   Human outcome accuracy: {rate(hu, lambda r:r['outcome_correct'])[1]}%")
print(f"AI UNDER-escalation (should escalate, AI resolved): {rate(esc_reasons, lambda r:r['agent_outcome']=='resolve')[1]}% of escalate-cases")
print(f"AI avg response quality: {round(sum(r['response_quality'] for r in ai)/len(ai),2)}   Human: {round(sum(r['response_quality'] for r in hu)/len(hu),2)}")
csat_vals=[int(r['csat']) for r in rows if r['csat']!='']
print(f"CSAT avg: {round(sum(csat_vals)/len(csat_vals),2)} (n={len(csat_vals)})")
print(f"AI avg handle time: {round(sum(r['handle_time_min'] for r in ai)/len(ai),1)} min   Human: {round(sum(r['handle_time_min'] for r in hu)/len(hu),1)} min")
print("AI accuracy by channel:")
for ch in ["website","whatsapp","app"]:
    sub=[r for r in ai if r["channel"]==ch]; print(f"   {ch:9} {rate(sub, lambda r:r['outcome_correct'])[1]}%  (n={len(sub)})")
print("Top contact reasons:")
from collections import Counter
for rid,c in Counter(r["true_reason_id"] for r in rows).most_common(6):
    print(f"   #{rid:>2} {REASONS[rid]['reason'][:42]:42} {c}")
print("WROTE data/courier-cs-log.csv, courier-cs-eval.csv, courier-cs-log-150.csv")
