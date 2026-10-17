"""Generate Pak Razif's calendar for October and November 2026 (demo data).

Writes:
  calendar.json  the calendar the availability and booking tools read
  calendar.html  Pak Razif's month view of the same data

Rules from resources/Work Schedule.html:
  W1  Monday to Saturday; Sunday rest
  W3  visit slots 08:00, 10:00, 14:00, 16:00
  W4 midday rest 12:00 to 14:00: no visits, no field work
  W5  30-minute visit plus a 30-minute travel buffer
  W7  at most 4 visits a day
  W8  booking window: day after first contact up to the same date next month
  W9 same-day requests are forwarded, never booked
  W13 a visit slot that clashes with field work is blocked
Demo clock: Sat 17 Oct 2026, 10:00 (fixed, so the benchmark is repeatable).
Same seed, same calendar: change the data through this file, never by hand.
"""
import json
import os
import random
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 17
NOW = "2026-10-17T10:00"
TODAY = date(2026, 10, 17)
FIRST_CONTACT = TODAY                              # demo customer's first contact
WINDOW_START = FIRST_CONTACT + timedelta(days=1)  # W8, W9
WINDOW_END = date(2026, 11, 17)                    # W8: same date next month
LAST_DAY = date(2026, 11, 30)
DUTY = "012-555 0188"                             # P18: returned by the check tool only on a match (demo number)
SLOTS = ["08:00", "10:00", "14:00", "16:00"]      # W3
VISIT_MIN, BUFFER_MIN = 30, 30                     # W5
HOLIDAYS = {}                                      # W2: none set for the demo; Pak Razif enters real dates
DEMO_PHOTOS = {"P1": "P1 front lawn", "P2": "P2 side garden", "P3": "P3 back garden", "P4": "P4 land plot"}

AREAS = [  # (place, postcode), all inside the approved coverage (Service Area A1 to A3)
    ("Seksyen 7, Shah Alam", "40000"), ("Seksyen 9, Shah Alam", "40100"), ("Seksyen 13, Shah Alam", "40100"),
    ("Setia Alam, Shah Alam", "40170"), ("Bukit Jelutong, Shah Alam", "40150"), ("Kota Kemuning, Shah Alam", "40460"),
    ("Alam Impian, Shah Alam", "40470"), ("Bandar Botanic, Klang", "41200"), ("Bukit Tinggi, Klang", "41200"),
    ("Bukit Raja, Klang", "41050"), ("SS15, Subang Jaya", "47500"), ("USJ 6, Subang Jaya", "47610"),
]
STREETS = ["Jalan Kenari", "Jalan Cempaka", "Jalan Melur", "Jalan Teratai", "Jalan Dahlia", "Jalan Seroja",
           "Jalan Kemboja", "Jalan Anggerik", "Jalan Mawar", "Jalan Kekwa"]
NAMES = ["Aminah Yusof", "Tan Wei Ming", "Ravi Kumar", "Siti Nurhaliza Ahmad", "Lim Mei Ling", "Farid Hassan",
         "Priya Nair", "Wong Kok Leong", "Nurul Izzah Rahman", "Chong Siew Lan", "Hafiz Ismail", "Grace Teoh",
         "Zainal Abidin", "Kavitha Raj", "Ong Boon Hock", "Aisyah Kamal", "Daniel Lee", "Rosnah Ali",
         "Suresh Pillai", "Yap Hui Min", "Azlan Shah Omar", "Mary Fernandez", "Khoo Chee Keong", "Halimah Said"]
NEEDS = ["Grass cutting for front and back lawn", "Hedge trimming along the fence", "Garden clean-up after renovation",
         "Overgrown lawn, not cut for three months", "Grass cutting and garden waste removal",
         "Bushes overgrown near the gate", "Monthly grass cutting, want to discuss", "Corner lot lawn and side garden"]
ACCESS = ["Gate unlocked, dog kept indoors", "Someone home, ring the bell", "Park outside, gate code given on the day",
          "Side gate open, no pets", "Call on arrival"]
FIELD_WORK = ["Grass cutting and edge trimming", "Hedge and bush trimming", "Garden clean-up", "Garden waste removal",
              "Grass cutting"]


def mins(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def clashes(slot, field):
    """W13: the slot needs the visit plus a travel buffer either side, clear of field work."""
    s = mins(slot)
    return any(mins(f["start"]) < s + VISIT_MIN + BUFFER_MIN and mins(f["end"]) > s - BUFFER_MIN for f in field)


# Fixed days for the 19 demo use cases (case 20 dropped) (_plan/what agent can and cannot do.txt, section 6).
# The Answer Key relies on these; keep them stable.
FIXED = {
    "2026-10-16": {"field": [("14:00", "17:30")], "booked": ["10:00"], "manual": {}},                         # Fri: visited yesterday (case 15)
    "2026-10-19": {"field": [], "booked": ["08:00", "10:00", "14:00", "16:00"], "manual": {}},                # Mon: full (case 8)
    "2026-10-20": {"field": [("15:00", "18:00")], "booked": ["10:00"], "manual": {}},                         # next Tue: 08:00 and 14:00 open (cases 3, 4)
    "2026-10-21": {"field": [("08:00", "12:00")], "booked": ["14:00"], "manual": {}},                         # Wed: morning job blocks both morning slots
    "2026-10-22": {"field": [], "booked": [], "manual": {"14:00": "Family commitment", "16:00": "Family commitment"}},
    "2026-10-23": {"field": [], "booked": ["08:00"], "manual": {}},                                           # Fri: open slots (case 13 target)
    "2026-10-17": {"field": [("08:00", "12:00")], "booked": ["16:00"], "manual": {}},                         # today: 14:00 open (same-day case)
    "2026-11-10": {"field": [("14:00", "18:00")], "booked": ["10:00"], "manual": {}},                         # Tue: 08:00 open inside the window
    "2026-11-25": {"field": [], "booked": [], "manual": {}},                                                  # Wed: all open, beyond the window
}


def build():
    rng = random.Random(SEED)
    days, bookings = {}, []
    ref_no = 1001
    d = date(2026, 10, 1)
    while d <= LAST_DAY:
        key = d.isoformat()
        day = {"date": key, "weekday": d.strftime("%a"), "closed": None, "field": [], "slots": {}}
        if d.weekday() == 6:
            day["closed"] = "Sunday rest day"                                        # W1
        elif key in HOLIDAYS:
            day["closed"] = HOLIDAYS[key]
        else:
            spec = FIXED.get(key)
            if spec:
                field_times, booked, manual = spec["field"], spec["booked"], spec["manual"]
            else:
                field_times = []
                r = rng.random()
                field_times.append(("08:00", "12:00") if r < 0.35 else ("10:00", "12:00") if r < 0.5 else None)
                r = rng.random()
                field_times.append(("14:00", "18:00") if r < 0.3 else ("16:00", "18:00") if r < 0.45 else None)
                field_times = [f for f in field_times if f]
                booked, manual = [], {}
                for s in SLOTS:
                    r = rng.random()
                    if r < 0.38:
                        booked.append(s)
                    elif r < 0.46:
                        manual[s] = "Blocked by Pak Razif"
            for a, b in field_times:
                place, pc = rng.choice(AREAS)
                day["field"].append({"start": a, "end": b, "work": rng.choice(FIELD_WORK), "area": place})
            for s in SLOTS:
                if clashes(s, day["field"]):
                    day["slots"][s] = {"status": "blocked", "reason": "Field work"}
                elif s in manual:
                    day["slots"][s] = {"status": "blocked", "reason": manual[s]}
                elif s in booked:
                    place, pc = rng.choice(AREAS)
                    b = {
                        "ref": f"HG-{ref_no}", "date": key, "slot": s,
                        "window": f"{s} to {(mins(s) + VISIT_MIN) // 60:02d}:{(mins(s) + VISIT_MIN) % 60:02d}",
                        "name": rng.choice(NAMES), "phone": f"01{rng.randint(1, 9)}-{rng.randint(200, 999)} {rng.randint(1000, 9999)}",
                        "address": f"{rng.randint(1, 60)}, {rng.choice(STREETS)} {rng.randint(1, 12)}, {place}",
                        "postcode": pc, "needs": rng.choice(NEEDS), "access": rng.choice(ACCESS),
                        "status": "visited" if d < TODAY else "confirmed",
                    }
                    ref_no += 1
                    bookings.append(b)
                    day["slots"][s] = {"status": "booked", "ref": b["ref"]}
                else:
                    day["slots"][s] = {"status": "open"}
        day["bookable"] = WINDOW_START <= d <= WINDOW_END and not day["closed"]
        days[key] = day
        d += timedelta(days=1)
    return {
        "business": "Pak Razif Garden", "months": ["2026-10", "2026-11"], "now": NOW, "first_contact": FIRST_CONTACT.isoformat(), "duty_number": DUTY,
        "window": {"from": WINDOW_START.isoformat(), "to": WINDOW_END.isoformat()},
        "slots": SLOTS, "visit_minutes": VISIT_MIN, "buffer_minutes": BUFFER_MIN, "max_visits_per_day": len(SLOTS),
        "days": days, "bookings": bookings, "next_ref": ref_no,
        # Written by the tools: forwarded items, photos and new visits for Pak Razif, and the
        # photos customers attach (the host registers them; the model only ever sees their IDs).
        "inbox": [], "uploads": [],
        "demo_photos": {k: f"images/pak-razif-the-gardener/demo/{v}.jpeg" for k, v in DEMO_PHOTOS.items()},
    }


PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="icon" href="../../favicon.ico" sizes="any"><link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Calendar, October and November 2026</title><style>
*{box-sizing:border-box}
:root{--bg:#f4f6f9;--card:#fff;--ink:#1f2a36;--muted:#5b6878;--line:#dbe2ea;--navy:#243b53;--accent:#2f6fb0;--box:#f8fafc;--field:#e3efe5;--fieldink:#2f5d3a;--open:#2f6fb0;--booked:#243b53;--blocked:#c7ced8;--win:#eef4fb}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21;--field:#1e3324;--fieldink:#9fd3ab;--open:#6aa7e0;--booked:#9cc1e6;--blocked:#3a4552;--win:#17212c}}
:root[data-theme="dark"]{--bg:#12171d;--card:#1a2129;--ink:#e3e8ee;--muted:#9aa7b5;--line:#2c3743;--navy:#9cc1e6;--accent:#6aa7e0;--box:#141a21;--field:#1e3324;--fieldink:#9fd3ab;--open:#6aa7e0;--booked:#9cc1e6;--blocked:#3a4552;--win:#17212c}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Segoe UI",Arial,sans-serif}
html,body{height:100%}
.wrap{max-width:1400px;margin:0 auto;padding:10px 16px 6px;height:100vh;display:flex;flex-direction:column}
.head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:4px 16px}
.main{flex:1;min-height:0;display:grid;grid-template-columns:1fr 320px;gap:12px;margin-top:6px}
.cal{display:flex;flex-direction:column;min-height:0}
#months{flex:1;min-height:0}
.month{height:100%}
.crumbs{font-size:12.5px;opacity:.8}.crumbs a{color:inherit;text-decoration:none}
h1{font-size:20px;color:var(--navy);margin:0}
.sub{color:var(--muted);font-size:13px;margin:0}
.legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;margin:6px 0 4px;align-items:center}
.sw{display:inline-block;width:14px;height:14px;border-radius:3px;vertical-align:-2px;margin-right:5px}
.stats{display:flex;flex-wrap:wrap;gap:6px;margin:0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:3px 10px;font-size:12.5px}
.stat b{color:var(--navy)}
.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;height:100%}
.mnav{display:flex;align-items:center;justify-content:center;gap:14px;margin:0 0 6px}
.mnav span{font-size:19px;font-weight:700;color:var(--navy);min-width:190px;text-align:center}
.mnav button{background:var(--accent);color:#fff;border:none;border-radius:6px;width:38px;height:30px;font-size:19px;line-height:1;cursor:pointer}
.mnav button:disabled{opacity:.35;cursor:default}
.month[hidden]{display:none}
.dow{font-size:12px;font-weight:600;color:var(--muted);text-align:center;padding:4px 0}
.day{background:var(--card);border:1px solid var(--line);border-radius:6px;min-height:0;overflow:hidden;padding:4px 5px;cursor:pointer;font-size:11.5px}
.day.win{background:var(--win)}
.day.today{outline:2px solid var(--accent)}
.day.sel{box-shadow:0 0 0 2px var(--navy)}
.day.closed{opacity:.6;cursor:default}
.day.empty{background:transparent;border:none;cursor:default}
.dn{font-weight:700;color:var(--navy);font-size:13px;display:flex;justify-content:space-between}
.dn small{font-weight:400;color:var(--muted)}
.fw{background:var(--field);color:var(--fieldink);border-radius:3px;padding:1px 4px;margin:3px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chips{display:flex;flex-wrap:wrap;gap:3px;margin-top:4px}
.chip{border-radius:3px;padding:0 4px;font-size:11px;border:1px solid transparent}
.chip.open{border-color:var(--open);color:var(--open)}
.chip.booked{background:var(--booked);color:var(--card)}
.chip.blocked{background:var(--blocked);color:var(--ink)}
.detail{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:auto;min-height:0}
.detail h2{font-size:17px;color:var(--navy);margin:0 0 8px}
table{border-collapse:collapse;width:100%;font-size:13.5px;margin:6px 0}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{background:var(--box);color:var(--navy)}
.tw{overflow-x:auto}
footer{margin-top:4px;font-size:11.5px;color:var(--muted)}
@media (max-width:900px){.wrap{height:auto;display:block}.main{display:block}.grid{height:auto}.day{min-height:96px}.detail{margin-top:12px}}
@media (max-width:760px){.grid{grid-template-columns:1fr;grid-template-rows:none!important}.dow,.day.empty{display:none}.day{min-height:0}}
</style></head><body><div class="wrap">
<div class="head"><div><div class="crumbs"><a href="../../index.html">AI Projects</a> / <a href="../../pak-razif-the-gardener.html">Pak Razif The Gardener</a></div>
<h1>Pak Razif's calendar, October and November 2026</h1>
<p class="sub">Visit slots and field work in one calendar. The assistant books only open slots in the booking window (shaded). Demo clock and first contact: Sat 17 Oct 2026, 10:00.</p></div>
<div class="stats" id="stats"></div></div>
<div class="legend">
<span><span class="sw" style="border:1px solid var(--open)"></span>Open visit slot</span>
<span><span class="sw" style="background:var(--booked)"></span>Site visit booked</span>
<span><span class="sw" style="background:var(--blocked)"></span>Blocked (field work or Pak Razif)</span>
<span><span class="sw" style="background:var(--field)"></span>Field work</span>
<span><span class="sw" style="background:var(--win);border:1px solid var(--line)"></span>Booking window</span>
</div>
<div class="main"><div class="cal">
<div class="mnav"><button id="prev" aria-label="Previous month">&larr;</button><span id="mlabel"></span><button id="next" aria-label="Next month">&rarr;</button></div>
<div id="months"></div></div>
<div class="detail" id="detail"><h2>Select a day</h2><p class="sub">Click a day to see its field work and visits.</p></div></div>
<footer>&copy; 2026 Lee Yih Ven &middot; Calendar, October and November 2026</footer></div>
<script>
const DATA = __DATA__;
const byRef = Object.fromEntries(DATA.bookings.map(b => [b.ref, b]));
const detail = document.getElementById('detail'), months = document.getElementById('months');
const grids = {};
DATA.months.forEach(m => {
  const label = new Date(m + '-01T00:00').toLocaleDateString('en-GB', {month:'long', year:'numeric'});
  months.insertAdjacentHTML('beforeend', `<section class="month" data-m="${m}" data-label="${label}" hidden><div class="grid" id="g${m}"></div></section>`);
  const g = document.getElementById('g' + m); grids[m] = g;
  ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].forEach(d => g.insertAdjacentHTML('beforeend', `<div class="dow">${d}</div>`));
  const first = new Date(m + '-01T00:00').getDay();
  const [yy, mm] = m.split('-').map(Number), dim = new Date(yy, mm, 0).getDate();
  g.style.gridTemplateRows = `auto repeat(${Math.ceil(((first + 6) % 7 + dim) / 7)}, minmax(0, 1fr))`;
  for (let i = 0; i < (first + 6) % 7; i++) g.insertAdjacentHTML('beforeend', '<div class="day empty"></div>');
});
const keys = Object.keys(DATA.days);
let win = {open:0, booked:0, blocked:0};
keys.forEach(k => {
  const grid = grids[k.slice(0, 7)];
  const d = DATA.days[k], n = +k.slice(8);
  const el = document.createElement('div');
  el.className = 'day' + (d.bookable ? ' win' : '') + (k === DATA.now.slice(0,10) ? ' today' : '') + (d.closed ? ' closed' : '');
  let h = `<div class="dn">${n}<small>${d.weekday}</small></div>`;
  if (d.closed) h += `<div class="sub">${d.closed}</div>`;
  d.field.forEach(f => h += `<div class="fw" title="${f.work}, ${f.area}">${f.start}-${f.end} ${f.work}</div>`);
  if (!d.closed) {
    h += '<div class="chips">';
    DATA.slots.forEach(s => { const st = d.slots[s].status; h += `<span class="chip ${st}">${s}</span>`; if (d.bookable) win[st]++; });
    h += '</div>';
  }
  el.innerHTML = h;
  if (!d.closed) el.onclick = () => { document.querySelectorAll('.day.sel').forEach(x => x.classList.remove('sel')); el.classList.add('sel'); show(k); };
  grid.appendChild(el);
});
document.getElementById('stats').innerHTML =
  `<span class="stat">Booking window <b>${fmt(DATA.window.from)} to ${fmt(DATA.window.to)}</b></span>` +
  `<span class="stat">Open slots <b>${win.open}</b></span><span class="stat">Visits booked <b>${win.booked}</b></span><span class="stat">Blocked <b>${win.blocked}</b></span>` +
  `<span class="stat">Bookings, Oct and Nov <b>${DATA.bookings.length}</b></span>`;
let cur = Math.max(0, DATA.months.indexOf(DATA.now.slice(0, 7)));
function showMonth(i) {
  cur = i;
  document.querySelectorAll('.month').forEach((s, j) => s.hidden = j !== i);
  document.getElementById('mlabel').textContent = document.querySelectorAll('.month')[i].dataset.label;
  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === DATA.months.length - 1;
}
document.getElementById('prev').onclick = () => cur > 0 && showMonth(cur - 1);
document.getElementById('next').onclick = () => cur < DATA.months.length - 1 && showMonth(cur + 1);
document.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' && cur > 0) showMonth(cur - 1); if (e.key === 'ArrowRight' && cur < DATA.months.length - 1) showMonth(cur + 1); });
showMonth(cur);
function fmt(k){ return new Date(k + 'T00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'}); }
function show(k) {
  const d = DATA.days[k];
  let h = `<h2>${fmt(k)}${d.bookable ? '' : ' (outside the booking window)'}</h2>`;
  h += '<table><tr><th>Field work</th><th>Time</th><th>Area</th></tr>' +
       (d.field.length ? d.field.map(f => `<tr><td>${f.work}</td><td>${f.start} to ${f.end}</td><td>${f.area}</td></tr>`).join('') : '<tr><td colspan="3">None</td></tr>') + '</table>';
  h += '<table><tr><th>Slot</th><th>Status</th><th>Visit</th></tr>' + DATA.slots.map(s => {
    const x = d.slots[s];
    if (x.status === 'booked') { const b = byRef[x.ref];
      return `<tr><td>${b.window}</td><td>Booked, ${b.status}</td><td><b>${b.ref}</b> ${b.name}, ${b.phone}<br>${b.address}, ${b.postcode}<br>${b.needs}. ${b.access}.</td></tr>`; }
    return `<tr><td>${s}</td><td>${x.status === 'open' ? 'Open' : 'Blocked'}</td><td>${x.reason || ''}</td></tr>`;
  }).join('') + '</table>';
  detail.innerHTML = h;
  detail.querySelectorAll('table').forEach(t => { const w = document.createElement('div'); w.className = 'tw'; t.parentNode.insertBefore(w, t); w.appendChild(t); });
}
</script></body></html>
"""


def main():
    cal = build()
    with open(os.path.join(HERE, "calendar.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(cal, f, indent=1, ensure_ascii=False)
    with open(os.path.join(HERE, "calendar.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(PAGE.replace("__DATA__", json.dumps(cal, ensure_ascii=False)))
    w = [d for d in cal["days"].values() if d["bookable"]]
    count = lambda st: sum(1 for d in w for s in d["slots"].values() if s["status"] == st)
    print(f"bookings {len(cal['bookings'])}; window {cal['window']}; open {count('open')}, booked {count('booked')}, blocked {count('blocked')}")


if __name__ == "__main__":
    main()
