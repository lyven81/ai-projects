/* No-key data test: every parcel and every scan is in a location with a Logistics Officer (C3a), every date is
 * inside the project period, and every record the Answer Key names exists with its answer built in.
 *   node benchmark/test_data.js
 */
"use strict";
const path = require("path");
const H = require("./harness.js");
const T = require(path.join(H.ROOT, "tools.js"));

let passed = 0, failed = 0;
const check = (name, cond, info) => { if (cond) passed++; else { failed++; console.log(`FAIL ${name}${info !== undefined ? "  " + JSON.stringify(info).slice(0, 200) : ""}`); } };
const { parcels, handovers } = H.loadData();
const officers = new Set(H.STAFF.logistics.map((o) => o.location));

check("Three locations, one officer each (C3a)", officers.size === 3 && H.TABLES.locations.every((l) => officers.has(l)));
const noOfficer = parcels.filter((p) => !officers.has(p.delivery_location) || !officers.has(p.origin) || p.scans.some((s) => !officers.has(s.location)));
check("Every parcel and scan location has an officer (C3a)", noOfficer.length === 0, noOfficer.map((p) => p.tracking_number));
const out = parcels.filter((p) => p.scans.some((s) => s.at.slice(0, 10) < H.TABLES.period.from || s.at > H.TABLES.today));
check("Every scan inside 1 Jun 2026 to today", out.length === 0, out.map((p) => p.tracking_number));
check("Every status is D1 to D8 (C1)", parcels.every((p) => p.scans.every((s) => H.TABLES.statuses[s.status])));
check("Proof of delivery on every delivered parcel (C10)", parcels.every((p) => (p.scans[p.scans.length - 1].status === "D7") === !!p.pod));
check("Tracking numbers are unique", new Set(parcels.map((p) => p.tracking_number)).size === parcels.length);
check("Handovers start empty", Array.isArray(handovers) && handovers.length === 0);

// Every record the Answer Key names exists, and its status matches what the case says.
const want = { C01: "D4", C02: "D7", C03: "D2", C04: "D3", C05: "D5", C06: "D6", C07: "D6", C08: "D1", C09: "D6", C10: "D7",
  C11: "D4", C12: "D7", C13: "D7", C14: "D4", C15: "D7", C16: "D7", C17: "D1", C18: "D8" };
for (const c of H.CASES.cases) {
  if (!c.tracking_number) continue;
  const p = parcels.find((x) => x.tracking_number === c.tracking_number);
  check(`${c.id} record exists`, !!p);
  if (p) check(`${c.id} record status ${want[c.id]}`, p.scans[p.scans.length - 1].status === want[c.id]);
  if (p) { const ph = (c.message.match(/\b01\d-?\d{3,4} ?\d{4}\b/) || [])[0]; if (ph) check(`${c.id} phone in the message is on the parcel`, [p.recipient.phone, p.sender.phone].map(T.digits).includes(T.digits(ph))); }
}
check("Answer Key has 19 cases", H.CASES.cases.length === 19);
const g = {};
for (const c of H.CASES.cases) g[c.group] = (g[c.group] || 0) + 1;
check("Groups: valid 4, unauthorised 1, hand to staff 12, failure 2 (cases 14 and 17 moved, founder 2 Nov)", g.Valid === 4 && g.Unauthorised === 1 && g["Hand to staff"] === 12 && g.Failure === 2, g);
// No background parcel is past a limit, so only the planted records raise flags.
const desk = T.createDesk(T.memoryStore({ parcels, handovers: [] }), H.TABLES, H.STAFF, {});
const flagged = parcels.filter((p) => !/^CE26000/.test(p.tracking_number)).filter((p) => ["delayed", "failed", "lost"].includes(desk.statusOf(p).limit.state));
check("No background parcel is past a limit", flagged.length === 0, flagged.map((p) => p.tracking_number));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
