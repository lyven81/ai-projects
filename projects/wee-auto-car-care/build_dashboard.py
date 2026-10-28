"""Build dashboard.html for Wee Auto Car Care.

Reads workshop_bookings.json plus demo_queue.json (the items waiting for staff
when a visitor first opens the demo) and tools.js (shared with the assistant and
the MCP server), and produces a single self-contained staff dashboard: the queue
of requests and handovers from the customer assistant, pill-strip date
navigation, bay grid, bookings list.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(HERE, "workshop_bookings.json"), "r", encoding="utf-8") as f:
    DATA = json.load(f)
with open(os.path.join(HERE, "demo_queue.json"), "r", encoding="utf-8") as f:
    QUEUE = json.load(f)
DATA["bookings"] = DATA["bookings"] + QUEUE["bookings"]
DATA["handovers"] = QUEUE["handovers"]
with open(os.path.join(HERE, "tools.js"), "r", encoding="utf-8") as f:
    TOOLS_JS = f.read()

TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Wee Auto Car Care: Staff Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #F3F4F6; color: #1F2937; min-width: 1280px; padding: 24px; }
  .app { max-width: 1440px; margin: 0 auto; }
  header.top {
    background: linear-gradient(135deg, #EA580C, #C2410C);
    color: white; padding: 20px 28px; border-radius: 12px 12px 0 0;
    display: flex; justify-content: space-between; align-items: center;
  }
  header.top h1 { font-size: 22px; font-weight: 600; letter-spacing: 0.3px; }
  header.top .role { font-size: 13px; opacity: 0.9; }
  header.top .role::before { content: "●"; color: #34D399; margin-right: 6px; }

  /* Pill strip */
  .nav {
    background: white; padding: 18px 28px; border-bottom: 1px solid #E5E7EB;
    display: flex; align-items: center; gap: 16px;
  }
  .week-label { font-weight: 600; color: #374151; min-width: 220px; }
  .nav-btn {
    border: 1px solid #D1D5DB; background: white; padding: 6px 12px;
    border-radius: 6px; cursor: pointer; font-size: 14px; color: #374151;
  }
  .nav-btn:hover { background: #F9FAFB; border-color: #9CA3AF; }
  .pill-strip { display: flex; gap: 8px; flex: 1; justify-content: center; }
  .pill {
    border: 2px solid #E5E7EB; background: white; padding: 8px 12px;
    border-radius: 10px; cursor: pointer; text-align: center; min-width: 74px;
    transition: all 0.15s;
  }
  .pill:hover { border-color: #F59E0B; background: #FEF3C7; }
  .pill.active {
    border-color: #EA580C; background: #FFF7ED; color: #9A3412;
    box-shadow: 0 2px 8px rgba(234, 88, 12, 0.15);
  }
  .pill.closed { color: #9CA3AF; cursor: not-allowed; background: #F9FAFB; }
  .pill.closed:hover { border-color: #E5E7EB; background: #F9FAFB; }
  .pill .dow { font-size: 11px; font-weight: 600; letter-spacing: 0.5px; }
  .pill .date { font-size: 18px; font-weight: 700; margin: 2px 0; }
  .pill .util { font-size: 11px; color: #6B7280; }
  .pill.active .util { color: #9A3412; font-weight: 600; }
  .pill.closed .util::before { content: "closed"; }

  /* Sections */
  section {
    background: white; padding: 20px 28px; border-bottom: 1px solid #E5E7EB;
  }
  section:last-child { border-bottom: none; border-radius: 0 0 12px 12px; }
  section h2 {
    font-size: 14px; text-transform: uppercase; letter-spacing: 0.7px;
    color: #6B7280; font-weight: 700; margin-bottom: 14px;
  }

  /* Bay grid */
  .bay-grid {
    display: grid;
    grid-template-columns: 110px repeat(8, 1fr);
    gap: 4px;
  }
  .bay-grid .th {
    font-size: 12px; font-weight: 700; color: #6B7280; text-align: center;
    padding: 8px 4px; text-transform: uppercase; letter-spacing: 0.5px;
  }
  .bay-grid .row-label {
    font-size: 13px; font-weight: 700; color: #374151;
    padding: 10px 8px; display: flex; flex-direction: column; justify-content: center;
    background: #F9FAFB; border-radius: 6px;
  }
  .bay-grid .row-label .sub { font-size: 11px; color: #9CA3AF; font-weight: 500; margin-top: 2px; }
  .bay-grid .cell {
    padding: 8px 6px; border-radius: 6px; font-size: 11px; line-height: 1.35;
    min-height: 78px; display: flex; flex-direction: column; justify-content: flex-start;
  }
  .cell.bookable { background: #ECFDF5; border: 1px dashed #34D399; color: #065F46; }
  .cell.bookable .state-hdr { font-weight: 800; font-size: 11px; letter-spacing: 0.5px; margin-bottom: 3px; color: #047857; }
  .cell.bookable .mechs { font-weight: 700; font-size: 11px; margin-bottom: 3px; }
  .cell.bookable .can-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: #059669; font-weight: 700; }
  .cell.bookable .can-do { font-size: 11px; color: #065F46; line-height: 1.3; font-weight: 600; }
  .cell.idle { background: #FEF9C3; border: 1.5px dashed #EAB308; color: #713F12; align-items: center; justify-content: center; text-align: center; }
  .cell.idle .state-hdr { font-weight: 800; font-size: 11px; letter-spacing: 0.5px; color: #854D0E; margin-bottom: 4px; }
  .cell.idle .reason { font-size: 10px; line-height: 1.35; opacity: 0.85; }
  .cell.busy { background: #FEF3C7; border: 1px solid #FCD34D; color: #78350F; }
  .cell.multi { background: #FEE2E2; border: 1px solid #FCA5A5; color: #991B1B; }
  .cell.pending { background: repeating-linear-gradient(45deg, #FFF7ED, #FFF7ED 6px, #FFEDD5 6px, #FFEDD5 12px); border: 1.5px dashed #EA580C; color: #9A3412; }
  .cell.pending .state-hdr { font-weight: 800; font-size: 10px; letter-spacing: 0.5px; color: #C2410C; margin-bottom: 2px; }
  .cell .mech { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
  .cell .svc { font-weight: 600; }
  .cell .plate { color: #78350F; font-family: 'Consolas', monospace; font-size: 11px; }
  .cell.multi .plate { color: #991B1B; }
  .cell .ready { margin-top: 4px; font-size: 10px; opacity: 0.85; }
  .cell.multi .ready { font-weight: 700; }

  /* Bookings list */
  .bookings-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .bookings-table th {
    text-align: left; padding: 8px 10px; background: #F9FAFB; color: #6B7280;
    text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; font-weight: 700;
    border-bottom: 2px solid #E5E7EB;
  }
  .bookings-table td { padding: 8px 10px; border-bottom: 1px solid #F3F4F6; }
  .bookings-table tr:hover { background: #FFF7ED; }
  .bookings-table .plate { font-family: Consolas, monospace; font-weight: 700; }
  .bookings-table .price { text-align: right; font-variant-numeric: tabular-nums; }

  /* Legend */
  .legend { display: flex; gap: 16px; font-size: 12px; color: #6B7280; margin-top: 10px; }
  .legend .swatch {
    display: inline-block; width: 14px; height: 14px; border-radius: 3px;
    vertical-align: middle; margin-right: 6px;
  }
  .swatch.bookable { background: #ECFDF5; border: 1px dashed #34D399; }
  .swatch.idle { background: #FEF9C3; border: 1.5px dashed #EAB308; }
  .swatch.busy { background: #FEF3C7; border: 1px solid #FCD34D; }
  .swatch.multi { background: #FEE2E2; border: 1px solid #FCA5A5; }
  .swatch.pending { background: #FFEDD5; border: 1.5px dashed #EA580C; }
  .queue { border-top: 3px solid #EA580C; }
  .queue .count { display: inline-block; min-width: 22px; text-align: center; background: #EA580C; color: white; border-radius: 10px; font-size: 12px; padding: 1px 7px; margin-left: 6px; }
  .queue .count.zero { background: #D1D5DB; }
  .switch { display: inline-flex; border: 1px solid rgba(255,255,255,.7); border-radius: 8px; overflow: hidden; }
  .switch a { color: white; font-size: 13px; font-weight: 600; padding: 7px 14px; text-decoration: none; }
  .switch a.on { background: white; color: #C2410C; }

  /* Action buttons */
  .btn {
    border: none; padding: 8px 14px; border-radius: 6px; cursor: pointer;
    font-size: 13px; font-weight: 600; transition: all 0.15s;
  }
  .btn-primary { background: #EA580C; color: white; }
  .btn-primary:hover { background: #C2410C; }
  .btn-secondary { background: white; color: #374151; border: 1px solid #D1D5DB; }
  .btn-secondary:hover { background: #F9FAFB; border-color: #9CA3AF; }
  .btn-danger { background: white; color: #B91C1C; border: 1px solid #FCA5A5; font-size: 11px; padding: 4px 10px; }
  .btn-danger:hover { background: #FEE2E2; }
  .btn-ok { background: white; color: #047857; border: 1px solid #6EE7B7; font-size: 11px; padding: 4px 10px; margin-right: 4px; }
  .btn-ok:hover { background: #D1FAE5; }
  .pill-pending { display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; padding: 1px 6px; border-radius: 8px; background: #FEF3C7; color: #92400E; }
  .queue-note { font-size: 13px; color: #6B7280; margin: 0 0 10px; }
  .queue-h { font-size: 14px; margin: 16px 0 6px; }
  .btn-ghost-white { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.4); }
  .btn-ghost-white:hover { background: rgba(255,255,255,0.25); }

  .section-header {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;
  }
  .section-header h2 { margin-bottom: 0; }

  /* Modal */
  .modal-backdrop {
    position: fixed; inset: 0; background: rgba(17,24,39,0.55);
    display: none; align-items: center; justify-content: center; z-index: 1000;
  }
  .modal-backdrop.open { display: flex; }
  .modal {
    background: white; border-radius: 12px; width: 560px; max-width: 92vw;
    box-shadow: 0 20px 40px rgba(0,0,0,0.2); overflow: hidden;
  }
  .modal-header {
    background: linear-gradient(135deg, #EA580C, #C2410C); color: white;
    padding: 16px 22px; display: flex; justify-content: space-between; align-items: center;
  }
  .modal-header h3 { font-size: 16px; font-weight: 600; }
  .modal-close { background: none; border: none; color: white; font-size: 22px; cursor: pointer; line-height: 1; }
  .modal-body { padding: 22px; }
  .modal-footer {
    padding: 14px 22px; background: #F9FAFB; border-top: 1px solid #E5E7EB;
    display: flex; justify-content: flex-end; gap: 10px;
  }
  .form-row {
    display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;
  }
  .form-field { display: flex; flex-direction: column; }
  .form-field.full { grid-column: 1 / -1; }
  .form-field label {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px;
    color: #6B7280; font-weight: 700; margin-bottom: 4px;
  }
  .form-field input, .form-field select {
    padding: 8px 10px; border: 1px solid #D1D5DB; border-radius: 6px;
    font-size: 13px; color: #111827;
  }
  .form-field input:focus, .form-field select:focus {
    outline: none; border-color: #EA580C; box-shadow: 0 0 0 3px rgba(234,88,12,0.15);
  }
  .form-field .hint { font-size: 11px; color: #6B7280; margin-top: 4px; }
  .form-field .err { font-size: 11px; color: #B91C1C; margin-top: 4px; font-weight: 600; }
  .form-field .ok { font-size: 11px; color: #059669; margin-top: 4px; font-weight: 600; }

  .banner-info {
    background: #EFF6FF; color: #1E40AF; padding: 10px 14px; border-radius: 6px;
    font-size: 12px; margin-bottom: 14px; border-left: 3px solid #3B82F6;
  }
</style>
</head>
<body>
<div class="app">
  <header class="top">
    <div>
      <h1>Wee Auto Car Care · Staff Dashboard</h1>
      <div class="role">Owner and staff view: review what the customer assistant leaves for you</div>
    </div>
    <div style="display: flex; gap: 10px; align-items: center;">
      <div id="today-indicator" style="font-size: 13px; opacity: 0.9; margin-right: 8px;"></div>
      <nav class="switch"><a class="on" href="demo.html">Staff dashboard</a><a href="assistant.html">Customer assistant</a></nav>
      <button class="btn btn-ghost-white" id="reset-btn" title="Restore original seed bookings">Reset</button>
    </div>
  </header>

  <section class="queue">
    <h2>Waiting for staff</h2>
    <p class="queue-note">The customer assistant never confirms a booking or answers money, release-time or non-package price questions. It leaves them here for staff.</p>
    <h3 class="queue-h">Booking requests to confirm or reject<span class="count" id="pending-count">0</span></h3>
    <table class="bookings-table">
      <thead><tr><th>Booking</th><th>Date</th><th>Time</th><th>Service</th><th>Customer</th><th>Plate</th><th>Phone</th><th>Mechanic</th><th></th></tr></thead>
      <tbody id="pending-tbody"></tbody>
    </table>
    <h3 class="queue-h">Enquiries handed to staff<span class="count" id="handover-count">0</span></h3>
    <table class="bookings-table">
      <thead><tr><th>Ref</th><th>Reason</th><th>Summary</th><th>Customer</th><th>Booking</th><th></th></tr></thead>
      <tbody id="handover-tbody"></tbody>
    </table>
  </section>

  <div class="nav">
    <button class="nav-btn" id="prev-week">◀</button>
    <div class="week-label" id="week-label"></div>
    <button class="nav-btn" id="next-week">▶</button>
    <button class="nav-btn" id="today-btn">Today</button>
    <div class="pill-strip" id="pill-strip"></div>
  </div>

  <section>
    <h2>Bay schedule</h2>
    <div class="bay-grid" id="bay-grid"></div>
    <div class="legend">
      <span><span class="swatch bookable"></span><strong>Bookable</strong>: bay free + qualified mechanic available</span>
      <span><span class="swatch idle"></span><strong>Idle</strong>: bay free but no qualified mechanic</span>
      <span><span class="swatch busy"></span>Single-slot booking</span>
      <span><span class="swatch multi"></span>Multi-slot booking (&gt;60 min)</span>
      <span><span class="swatch pending"></span><strong>Pending</strong>: request from the assistant, slot held until staff confirm or reject</span>
    </div>
  </section>

  <section>
    <div class="section-header">
      <h2>Bookings on this day</h2>
      <button class="btn btn-primary" id="new-booking-btn">+ New booking</button>
    </div>
    <table class="bookings-table" id="bookings-table">
      <thead>
        <tr>
          <th>Booking</th><th>Time</th><th>Bay</th><th>Mechanic</th>
          <th>Service</th><th>Customer</th><th>Plate</th><th>Status</th><th class="price">Price</th><th></th>
        </tr>
      </thead>
      <tbody id="bookings-tbody"></tbody>
    </table>
  </section>

</div>

<!-- New Booking Modal -->
<div class="modal-backdrop" id="modal-backdrop">
  <div class="modal">
    <div class="modal-header">
      <h3>New booking</h3>
      <button class="modal-close" id="modal-close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="banner-info">
        Changes stay in this browser until you press Reset, which restores the starting schedule.
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Date</label>
          <select id="f-date"></select>
        </div>
        <div class="form-field">
          <label>Service</label>
          <select id="f-service"></select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Start slot</label>
          <select id="f-slot"></select>
          <div class="hint" id="f-slot-hint"></div>
        </div>
        <div class="form-field">
          <label>Mechanic</label>
          <select id="f-mechanic"></select>
          <div class="hint" id="f-mech-hint"></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label>Customer name</label>
          <input type="text" id="f-name" placeholder="e.g. Ahmad Faizal">
        </div>
        <div class="form-field">
          <label>Plate number</label>
          <input type="text" id="f-plate" placeholder="e.g. BKL 1234">
        </div>
      </div>
      <div class="form-row">
        <div class="form-field full">
          <label>Phone (optional)</label>
          <input type="text" id="f-phone" placeholder="e.g. 012-345 6789">
        </div>
      </div>
      <div id="f-error" class="err" style="color:#B91C1C; font-weight:600; font-size:13px; padding:8px 12px; background:#FEE2E2; border-radius:6px; display:none; margin-top:4px;"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-submit">Book</button>
    </div>
  </div>
</div>

<script>/*__TOOLS_JS__*/</script>
<script>
const WORKSHOP_DATA = __DATA_JSON__;
const STORAGE_KEY = "wee-auto-bookings-v3"; // v3: dates follow today, demo queue (shared with assistant.html)

function cloneInitial() { return JSON.parse(JSON.stringify(WORKSHOP_DATA)); }
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) { console.warn("Could not save state:", e); }
}
function resetState() {
  localStorage.removeItem(STORAGE_KEY);
  state = WeeAutoTools.stateForToday(null, cloneInitial(), new Date());
  saveState();
  renderAll();
}
// Dates follow the day the page is opened: the demo fortnight starts on this week's Monday.
let state = WeeAutoTools.stateForToday(loadState(), cloneInitial(), new Date());
saveState();

const SLOTS = ["10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"];
const SLOT_LABELS = ["10am","11am","12pm","1pm","2pm","3pm","4pm","5pm"];
const BAYS = {
  BAY1: { label: "Bay 1", sub: "Tyre" },
  BAY2: { label: "Bay 2", sub: "General" },
  BAY3: { label: "Bay 3", sub: "Alignment" },
};
const MECHANICS = ["Shamsul","Vishnu","Albert"];
const CAL = WeeAutoTools.calendar(new Date());
const DEMO_TODAY = CAL.today;

// Service catalog: which bay each service uses + required skill.
const SERVICE_CATALOG = [
  { name: "Tyre Replacement (4 wheels)", skill: "tyre",         bay: "BAY1", short: "Tyre 4w" },
  { name: "Tyre Replacement (1 wheel)",  skill: "tyre",         bay: "BAY1", short: "Tyre 1w" },
  { name: "Puncture Repair",             skill: "tyre",         bay: "BAY1", short: "Puncture" },
  { name: "Tyre Rotation",               skill: "rotation",     bay: "BAY1", short: "Rotation" },
  { name: "Wheel Balancing",             skill: "balancing",    bay: "BAY1", short: "Balance" },
  { name: "Battery Replacement",         skill: "battery",      bay: "BAY1", short: "Battery" },
  { name: "Hunter Alignment",            skill: "alignment",    bay: "BAY3", short: "Alignment" },
  { name: "Engine Oil Change",           skill: "oil",          bay: "BAY2", short: "Oil" },
  { name: "Spark Plug Replacement",      skill: "spark_plug",   bay: "BAY2", short: "Spark plug" },
  { name: "Engine Diagnostic",           skill: "diagnostic",   bay: "BAY2", short: "Diagnostic" },
  { name: "Timing Belt Replacement",     skill: "timing_belt",  bay: "BAY2", short: "Timing belt" },
  { name: "AC Gas Top-up",               skill: "ac_topup",     bay: "BAY2", short: "AC top-up" },
  { name: "AC Service",                  skill: "ac_service",   bay: "BAY2", short: "AC svc" },
  { name: "AC Compressor Repair",        skill: "ac_compressor",bay: "BAY2", short: "AC compr" },
  { name: "Battery Test",                skill: "battery",      bay: "BAY2", short: "Battery test" },
];

const MECHANIC_SKILLS = {
  Shamsul: ["oil","spark_plug","diagnostic","timing_belt","ac_topup","ac_service","ac_compressor","battery","tyre","rotation","balancing"],
  Vishnu:  ["tyre","rotation","balancing","alignment","oil","spark_plug","ac_topup","battery"],
  Albert:  ["tyre","rotation","oil","battery"],
};

function freeSlotAnalysis(bay, slotIdx, mechBusy) {
  const freeMechs = MECHANICS.filter(m => !mechBusy[m][slotIdx]);
  const baySvcs = SERVICE_CATALOG.filter(s => s.bay === bay);
  const bookableServices = [];
  const bookableMechs = new Set();
  baySvcs.forEach(svc => {
    const qualified = freeMechs.filter(m => MECHANIC_SKILLS[m].includes(svc.skill));
    if (qualified.length > 0) {
      bookableServices.push(svc);
      qualified.forEach(m => bookableMechs.add(m));
    }
  });
  if (bookableServices.length === 0) {
    return { state: "idle", reason: idleReason(bay, freeMechs) };
  }
  return {
    state: "bookable",
    mechanics: MECHANICS.filter(m => bookableMechs.has(m)),
    services: bookableServices,
  };
}

function idleReason(bay, freeMechs) {
  const label = BAYS[bay].sub.toLowerCase();
  if (freeMechs.length === 0) return "All mechanics busy";
  return `No ${label}-skilled mechanic free`;
}

// Week definitions covering demo range
const DOW = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const longDate = iso => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const WEEKS = [0, 1].map(w => {
  const start = WeeAutoTools.addDays(CAL.anchor, 7 * w);
  return { start, label: `Week of Mon ${longDate(start)}`,
    days: DOW.map((dow, i) => {
      const date = WeeAutoTools.addDays(start, i);
      return { date, dow, n: Number(date.slice(8)), mon: MONTHS[Number(date.slice(5, 7)) - 1], closed: i === 6 };
    }) };
});
// On a Sunday (closed) the default view is next Monday.
const DEFAULT_DATE = new Date(DEMO_TODAY + "T00:00:00Z").getUTCDay() === 0 ? WeeAutoTools.addDays(DEMO_TODAY, 1) : DEMO_TODAY;

let currentDate = DEFAULT_DATE;
let currentWeekIdx = WEEKS.findIndex(w => w.days.some(d => d.date === DEFAULT_DATE));

// Rejected requests stay on record but no longer hold a slot.
const ACTIVE = b => b.status !== "rejected";
function bookingsOn(date) {
  return state.bookings.filter(b => b.date === date && ACTIVE(b));
}

function utilPctFor(date) {
  // Dynamically compute from current state so utilization reflects
  // any bookings added/cancelled via the UI.
  const day = state.bookings.filter(b => b.date === date && ACTIVE(b));
  const units = day.reduce((s,b) => s + b.slots_occupied, 0);
  return Math.round(units / 24 * 1000) / 10;
}

function renderPillStrip() {
  const strip = document.getElementById("pill-strip");
  strip.innerHTML = "";
  const week = WEEKS[currentWeekIdx];
  document.getElementById("week-label").textContent = week.label;
  week.days.forEach(d => {
    const pill = document.createElement("div");
    pill.className = "pill" + (d.closed ? " closed" : "") + (d.date === currentDate ? " active" : "");
    pill.innerHTML =
      `<div class="dow">${d.dow}</div>` +
      `<div class="date">${d.n}</div>` +
      (d.closed ? `<div class="util"></div>` : `<div class="util">${utilPctFor(d.date)}%</div>`);
    if (!d.closed) pill.addEventListener("click", () => {
      currentDate = d.date;
      renderAll();
    });
    strip.appendChild(pill);
  });
}

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function dayOfWeek(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

function renderBayGrid() {
  const grid = document.getElementById("bay-grid");
  grid.innerHTML = "";

  // Header row
  grid.appendChild(el("div", "th", ""));
  SLOT_LABELS.forEach(l => grid.appendChild(el("div", "th", l)));

  const dayBookings = bookingsOn(currentDate);
  const bookingsByBaySlot = {};
  const mechBusy = {};
  MECHANICS.forEach(m => mechBusy[m] = Array(8).fill(false));
  dayBookings.forEach(b => {
    const idx = SLOTS.indexOf(b.start_slot);
    for (let i=0; i<b.slots_occupied; i++) {
      const key = `${b.bay}_${idx+i}`;
      bookingsByBaySlot[key] = { booking: b, slotOffset: i };
      mechBusy[b.mechanic][idx+i] = true;
    }
  });

  ["BAY1","BAY2","BAY3"].forEach(bay => {
    // Row label
    const rl = el("div", "row-label",
      `<div>${BAYS[bay].label}</div><div class="sub">${BAYS[bay].sub}</div>`);
    rl.innerHTML = `<div>${BAYS[bay].label}</div><div class="sub">${BAYS[bay].sub}</div>`;
    grid.appendChild(rl);

    for (let s=0; s<8; s++) {
      const entry = bookingsByBaySlot[`${bay}_${s}`];
      if (!entry) {
        const analysis = freeSlotAnalysis(bay, s, mechBusy);
        const cell = document.createElement("div");
        if (analysis.state === "bookable") {
          cell.className = "cell bookable";
          const mechList = analysis.mechanics.map(m => `${m} &#10003;`).join("  ");
          const svcList = analysis.services.map(s => s.short).slice(0, 4).join(", ") +
                          (analysis.services.length > 4 ? ` +${analysis.services.length - 4}` : "");
          cell.innerHTML =
            `<div class="state-hdr">BOOKABLE</div>` +
            `<div class="mechs">${mechList}</div>` +
            `<div class="can-label">can do</div>` +
            `<div class="can-do">${svcList}</div>`;
        } else {
          cell.className = "cell idle";
          cell.innerHTML =
            `<div class="state-hdr">IDLE</div>` +
            `<div class="reason">${analysis.reason}</div>`;
        }
        grid.appendChild(cell);
      } else {
        const b = entry.booking;
        const isMulti = b.slots_occupied > 1;
        const isCont = entry.slotOffset > 0;
        const cell = document.createElement("div");
        const isPending = b.status === "pending";
        cell.className = "cell " + (isPending ? "pending" : isMulti ? "multi" : "busy");
        const pendingHdr = isPending ? `<div class="state-hdr">PENDING ${b.booking_id}</div>` : "";
        if (isCont) {
          cell.innerHTML = pendingHdr +
            `<div class="mech">${b.mechanic} (cont.)</div>` +
            `<div class="svc">${shortSvc(b.service)}</div>` +
            `<div class="plate">${b.plate}</div>` +
            `<div class="ready">ready ${b.ready_at}</div>`;
        } else {
          cell.innerHTML = pendingHdr +
            `<div class="mech">${b.mechanic}</div>` +
            `<div class="svc">${shortSvc(b.service)}${isMulti ? ` (${b.slots_occupied} slots)` : ""}</div>` +
            `<div class="plate">${b.plate}</div>` +
            `<div class="ready">ready ${b.ready_at}</div>`;
        }
        grid.appendChild(cell);
      }
    }
  });
}

function shortSvc(s) {
  const map = {
    "Tyre Replacement (4 wheels)": "Tyre 4w",
    "Tyre Replacement (1 wheel)": "Tyre 1w",
    "Puncture Repair": "Puncture",
    "Tyre Rotation": "Rotation",
    "Wheel Balancing": "Balance",
    "Hunter Alignment": "Alignment",
    "Engine Oil Change": "Oil change",
    "Spark Plug Replacement": "Spark plug",
    "Engine Diagnostic": "Diagnostic",
    "Timing Belt Replacement": "Timing belt",
    "AC Gas Top-up": "AC top-up",
    "AC Service": "AC service",
    "AC Compressor Repair": "AC compressor",
    "Battery Test": "Battery test",
    "Battery Replacement": "Battery",
  };
  return map[s] || s;
}

function renderBookingsTable() {
  const tbody = document.getElementById("bookings-tbody");
  const dayBookings = bookingsOn(currentDate)
    .slice()
    .sort((a,b) => a.start_slot.localeCompare(b.start_slot) || a.bay.localeCompare(b.bay));
  if (dayBookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="padding:20px;text-align:center;color:#9CA3AF;">No bookings for this date.</td></tr>`;
    return;
  }
  tbody.innerHTML = dayBookings.map(b =>
    `<tr>
      <td><strong>${b.booking_id}</strong>${b.status === "pending" ? ' <span class="pill-pending">pending</span>' : ""}</td>
      <td>${b.start_slot}&ndash;${b.next_bookable_at}${b.slots_occupied > 1 ? ` <em style="color:#B91C1C;">(${b.slots_occupied} slots)</em>` : ""}</td>
      <td>${b.bay}</td>
      <td>${b.mechanic}</td>
      <td>${b.service}</td>
      <td>${b.customer_name}</td>
      <td class="plate">${b.plate}</td>
      <td>${b.status}</td>
      <td class="price">RM ${b.price_rm}</td>
      <td><button class="btn btn-danger cancel-btn" data-bid="${b.booking_id}">Cancel</button></td>
    </tr>`).join("");
  document.querySelectorAll(".cancel-btn").forEach(btn => {
    btn.addEventListener("click", () => cancelBooking(btn.getAttribute("data-bid")));
  });
}

// ================== INTERACTIVE BOOKING LOGIC ==================

function nextBookingId() {
  let maxN = 0;
  state.bookings.forEach(b => {
    const m = b.booking_id.match(/^SVC(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1]));
  });
  return `SVC${String(maxN + 1).padStart(3, "0")}`;
}

function slotsNeeded(durationMin) {
  return Math.max(1, Math.ceil(durationMin / 60));
}

function readyTimeStr(startSlot, durationMin) {
  const h = parseInt(startSlot.split(":")[0], 10);
  const total = h * 60 + durationMin;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function nextBookableStr(startSlot, nSlots) {
  const h = parseInt(startSlot.split(":")[0], 10) + nSlots;
  return `${String(h).padStart(2, "0")}:00`;
}

// Durations and prices come from the catalogue only. They used to be read back from
// existing bookings, so a booking at a package price (RM 190 fully synthetic oil)
// changed the price of every later plain oil change. Fixed in the 16 Oct review.
const CATALOG_DURATIONS = {
  "Tyre Replacement (4 wheels)": 45, "Tyre Replacement (1 wheel)": 20,
  "Puncture Repair": 30, "Tyre Rotation": 30, "Wheel Balancing": 30,
  "Hunter Alignment": 60, "Engine Oil Change": 30,
  "Spark Plug Replacement": 45, "Engine Diagnostic": 45,
  "Timing Belt Replacement": 180, "AC Gas Top-up": 30,
  "AC Service": 75, "AC Compressor Repair": 180,
  "Battery Test": 10, "Battery Replacement": 20,
};
const CATALOG_PRICES = {
  "Tyre Replacement (4 wheels)": 60, "Tyre Replacement (1 wheel)": 20,
  "Puncture Repair": 25, "Tyre Rotation": 30, "Wheel Balancing": 40,
  "Hunter Alignment": 80, "Engine Oil Change": 120,
  "Spark Plug Replacement": 90, "Engine Diagnostic": 100,
  "Timing Belt Replacement": 450, "AC Gas Top-up": 80,
  "AC Service": 180, "AC Compressor Repair": 650,
  "Battery Test": 20, "Battery Replacement": 250,
};
function SERVICE_DURATIONS() { return CATALOG_DURATIONS; }
function SERVICE_PRICES() { return CATALOG_PRICES; }

function computeSchedule(date) {
  // Returns { bayBusy, mechBusy } arrays keyed to 8 slots for that date.
  const bayBusy = { BAY1: Array(8).fill(false), BAY2: Array(8).fill(false), BAY3: Array(8).fill(false) };
  const mechBusy = {}; MECHANICS.forEach(m => mechBusy[m] = Array(8).fill(false));
  state.bookings.filter(b => b.date === date && ACTIVE(b)).forEach(b => {
    const idx = SLOTS.indexOf(b.start_slot);
    for (let i=0; i<b.slots_occupied; i++) {
      bayBusy[b.bay][idx+i] = true;
      mechBusy[b.mechanic][idx+i] = true;
    }
  });
  return { bayBusy, mechBusy };
}

function cancelBooking(bookingId) {
  const b = state.bookings.find(x => x.booking_id === bookingId);
  if (!b) return;
  if (!confirm(`Cancel ${bookingId}: ${b.service} for ${b.customer_name} (${b.plate})?`)) return;
  state.bookings = state.bookings.filter(x => x.booking_id !== bookingId);
  saveState();
  renderAll();
}

// Modal handlers
function openModal() {
  document.getElementById("modal-backdrop").classList.add("open");
  populateModalFields();
}
function closeModal() {
  document.getElementById("modal-backdrop").classList.remove("open");
  document.getElementById("f-error").style.display = "none";
}

function populateModalFields() {
  // Date select — all open days across both weeks
  const dateSel = document.getElementById("f-date");
  dateSel.innerHTML = "";
  WEEKS.forEach(w => w.days.filter(d => !d.closed && d.date >= DEMO_TODAY).forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.date; opt.textContent = `${d.dow} ${d.n} ${d.mon}`;
    if (d.date === currentDate) opt.selected = true;
    dateSel.appendChild(opt);
  }));
  // Service select
  const svcSel = document.getElementById("f-service");
  svcSel.innerHTML = "";
  SERVICE_CATALOG.forEach(s => {
    const durs = SERVICE_DURATIONS();
    const opt = document.createElement("option");
    opt.value = s.name;
    opt.textContent = `${s.name}  (${durs[s.name]}m, ${s.bay})`;
    svcSel.appendChild(opt);
  });
  // Clear inputs
  document.getElementById("f-name").value = "";
  document.getElementById("f-plate").value = "";
  document.getElementById("f-phone").value = "";
  refreshSlotsAndMechanics();
  ["f-date","f-service","f-slot"].forEach(id =>
    document.getElementById(id).addEventListener("change", refreshSlotsAndMechanics));
}

function refreshSlotsAndMechanics() {
  const date = document.getElementById("f-date").value;
  const svcName = document.getElementById("f-service").value;
  const svc = SERVICE_CATALOG.find(s => s.name === svcName);
  if (!svc) return;
  const durs = SERVICE_DURATIONS();
  const dur = durs[svcName];
  const n = slotsNeeded(dur);
  const sched = computeSchedule(date);

  // Slot dropdown — only show slots where the required bay is free across n slots
  const slotSel = document.getElementById("f-slot");
  slotSel.innerHTML = "";
  let anySlot = false;
  for (let i = 0; i <= 8 - n; i++) {
    let free = true;
    for (let k = 0; k < n; k++) if (sched.bayBusy[svc.bay][i + k]) { free = false; break; }
    if (free) {
      const opt = document.createElement("option");
      opt.value = SLOTS[i];
      opt.textContent = `${SLOT_LABELS[i]} (${n > 1 ? n + " slots" : "1 slot"}, ready ${readyTimeStr(SLOTS[i], dur)})`;
      slotSel.appendChild(opt);
      anySlot = true;
    }
  }
  document.getElementById("f-slot-hint").textContent = anySlot
    ? `Bay ${svc.bay} slots where the service fits`
    : `No free slots in ${svc.bay} for this service on this date.`;

  // Mechanic dropdown — based on selected slot, filter by skill + free across n slots
  refreshMechanicOnly();
  slotSel.removeEventListener("change", refreshMechanicOnly);
  slotSel.addEventListener("change", refreshMechanicOnly);
}

function refreshMechanicOnly() {
  const date = document.getElementById("f-date").value;
  const svcName = document.getElementById("f-service").value;
  const svc = SERVICE_CATALOG.find(s => s.name === svcName);
  if (!svc) return;
  const durs = SERVICE_DURATIONS();
  const dur = durs[svcName];
  const n = slotsNeeded(dur);
  const startSlot = document.getElementById("f-slot").value;
  const startIdx = SLOTS.indexOf(startSlot);
  const sched = computeSchedule(date);
  const mechSel = document.getElementById("f-mechanic");
  mechSel.innerHTML = "";
  const qualified = MECHANICS.filter(m => MECHANIC_SKILLS[m].includes(svc.skill));
  const avail = qualified.filter(m => {
    for (let k = 0; k < n; k++) if (sched.mechBusy[m][startIdx + k]) return false;
    return true;
  });
  if (avail.length === 0) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "No qualified mechanic free at this slot";
    mechSel.appendChild(opt);
    document.getElementById("f-mech-hint").textContent = "Try a different slot or date.";
  } else {
    avail.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m; opt.textContent = m;
      mechSel.appendChild(opt);
    });
    document.getElementById("f-mech-hint").textContent = `Skill required: ${svc.skill}`;
  }
}

function submitBooking() {
  const errEl = document.getElementById("f-error");
  errEl.style.display = "none";
  const date = document.getElementById("f-date").value;
  const svcName = document.getElementById("f-service").value;
  const startSlot = document.getElementById("f-slot").value;
  const mech = document.getElementById("f-mechanic").value;
  const name = document.getElementById("f-name").value.trim();
  const plate = document.getElementById("f-plate").value.trim().toUpperCase();
  const phone = document.getElementById("f-phone").value.trim();
  if (!startSlot || !mech || !name || !plate) {
    errEl.textContent = "Fill all required fields (date, service, slot, mechanic, name, plate).";
    errEl.style.display = "block"; return;
  }
  const svc = SERVICE_CATALOG.find(s => s.name === svcName);
  const durs = SERVICE_DURATIONS();
  const prices = SERVICE_PRICES();
  const dur = durs[svcName];
  const n = slotsNeeded(dur);
  const startIdx = SLOTS.indexOf(startSlot);
  const sched = computeSchedule(date);
  for (let k = 0; k < n; k++) {
    if (sched.bayBusy[svc.bay][startIdx + k]) { errEl.textContent = "Bay no longer free at that slot; someone may have just booked."; errEl.style.display = "block"; return; }
    if (sched.mechBusy[mech][startIdx + k]) { errEl.textContent = "Mechanic no longer free at that slot."; errEl.style.display = "block"; return; }
  }
  const booking = {
    booking_id: nextBookingId(),
    date, start_slot: startSlot, slots_occupied: n,
    slot_list: Array.from({length: n}, (_, i) => SLOTS[startIdx + i]),
    bay: svc.bay, mechanic: mech, service: svcName,
    duration_minutes: dur, ready_at: readyTimeStr(startSlot, dur),
    next_bookable_at: nextBookableStr(startSlot, n),
    customer_name: name, plate: plate, phone: phone || "Not given",
    price_rm: prices[svcName], status: "confirmed",
  };
  state.bookings.push(booking);
  saveState();
  closeModal();
  currentDate = date;
  // Ensure week matches selected date
  for (let i = 0; i < WEEKS.length; i++) {
    if (WEEKS[i].days.some(d => d.date === date)) { currentWeekIdx = i; break; }
  }
  renderAll();
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

const REASON_LABELS = {
  release_time_or_progress: "Release time or progress", money: "Money", price_not_in_packages_or_inspection: "Price or inspection",
  cancel_or_change_booking: "Cancel or change", complaint: "Complaint", asked_for_person: "Asked for a person",
  not_covered: "Not covered", verification_failed: "Booking check failed",
};
function escHtml(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function renderQueues() {
  const pending = state.bookings.filter(b => b.status === "pending").sort((a,b) => (a.date + a.start_slot).localeCompare(b.date + b.start_slot));
  const pt = document.getElementById("pending-tbody");
  pt.innerHTML = pending.length ? pending.map(b => `<tr>
      <td><strong>${escHtml(b.booking_id)}</strong></td><td>${escHtml(b.date)}</td><td>${escHtml(b.start_slot)}</td>
      <td>${escHtml(b.package_name || b.service)}</td><td>${escHtml(b.customer_name)}</td><td class="plate">${escHtml(b.plate)}</td>
      <td>${escHtml(b.phone)}</td><td>${escHtml(b.mechanic)}</td>
      <td><button class="btn btn-ok" data-confirm="${escHtml(b.booking_id)}">Confirm</button><button class="btn btn-danger" data-reject="${escHtml(b.booking_id)}">Reject</button></td>
    </tr>`).join("") : `<tr><td colspan="9" style="padding:14px;text-align:center;color:#9CA3AF;">No requests waiting.</td></tr>`;
  const hs = (state.handovers || []).filter(h => h.status === "open");
  const pc = document.getElementById("pending-count"), hc = document.getElementById("handover-count");
  pc.textContent = pending.length; pc.classList.toggle("zero", !pending.length);
  hc.textContent = hs.length; hc.classList.toggle("zero", !hs.length);
  const ht = document.getElementById("handover-tbody");
  ht.innerHTML = hs.length ? hs.map(h => `<tr>
      <td><strong>${escHtml(h.handover_id)}</strong></td><td>${escHtml(REASON_LABELS[h.reason] || h.reason)}</td><td>${escHtml(h.summary)}</td>
      <td>${escHtml(h.customer_name)}${h.contact_phone ? "<br>" + escHtml(h.contact_phone) : ""}</td><td>${escHtml(h.booking_id)}</td>
      <td><button class="btn btn-ok" data-done="${escHtml(h.handover_id)}">Done</button></td>
    </tr>`).join("") : `<tr><td colspan="6" style="padding:14px;text-align:center;color:#9CA3AF;">No open enquiries.</td></tr>`;
  pt.querySelectorAll("[data-confirm]").forEach(btn => btn.addEventListener("click", () => setStatus(btn.dataset.confirm, "confirmed")));
  pt.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", () => setStatus(btn.dataset.reject, "rejected")));
  ht.querySelectorAll("[data-done]").forEach(btn => btn.addEventListener("click", () => {
    const h = state.handovers.find(x => x.handover_id === btn.dataset.done); if (h) { h.status = "done"; saveState(); renderAll(); }
  }));
}
function setStatus(bookingId, status) {
  const b = state.bookings.find(x => x.booking_id === bookingId);
  if (!b) return;
  b.status = status; saveState(); renderAll();
}
// Pick up requests the assistant makes in another tab.
window.addEventListener("storage", e => { if (e.key === STORAGE_KEY) { state = loadState() || cloneInitial(); renderAll(); } });

function renderAll() {
  renderQueues();
  renderPillStrip();
  renderBayGrid();
  renderBookingsTable();
  document.getElementById("today-indicator").textContent = `Today: ${longDate(DEMO_TODAY)}`;
}

document.getElementById("prev-week").addEventListener("click", () => {
  if (currentWeekIdx > 0) { currentWeekIdx--; currentDate = WEEKS[currentWeekIdx].days[0].date; renderAll(); }
});
document.getElementById("next-week").addEventListener("click", () => {
  if (currentWeekIdx < WEEKS.length - 1) { currentWeekIdx++; currentDate = WEEKS[currentWeekIdx].days[0].date; renderAll(); }
});
document.getElementById("today-btn").addEventListener("click", () => {
  currentDate = DEFAULT_DATE; currentWeekIdx = WEEKS.findIndex(w => w.days.some(d => d.date === DEFAULT_DATE)); renderAll();
});

document.getElementById("new-booking-btn").addEventListener("click", openModal);
document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-submit").addEventListener("click", submitBooking);
document.getElementById("modal-backdrop").addEventListener("click", (e) => {
  if (e.target === document.getElementById("modal-backdrop")) closeModal();
});
document.getElementById("reset-btn").addEventListener("click", () => {
  if (confirm("Restore the original 142 seed bookings? This will discard any changes you made in this browser.")) {
    resetState();
  }
});

renderAll();
</script>
</body>
</html>
"""


def build():
    data_json = json.dumps(DATA, ensure_ascii=False)
    html = TEMPLATE.replace("__DATA_JSON__", data_json).replace("/*__TOOLS_JS__*/", TOOLS_JS)
    out = os.path.join(HERE, "demo.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Wrote {out} ({len(html):,} chars)")


if __name__ == "__main__":
    build()
