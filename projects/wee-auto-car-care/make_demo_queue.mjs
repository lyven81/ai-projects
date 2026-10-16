// Builds demo_queue.json: the items waiting for staff when a visitor first opens
// the demo (2 pending booking requests, 2 enquiries not covered, 3 money enquiries).
// Made through the real tools, so every record has the shape the assistant writes.
// Dates are on the seed calendar (fortnight from Mon 2 Mar 2026); the pages move them
// to the current fortnight. Not used by the benchmark, which runs on the plain seed.
//
// Run: node make_demo_queue.mjs   (then rebuild both pages)

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createWorkshop } = require("./tools.js");

const seed = JSON.parse(readFileSync(join(HERE, "workshop_bookings.json"), "utf8"));
const state = JSON.parse(JSON.stringify(seed));
const servicePackages = JSON.parse(readFileSync(join(HERE, "resources", "service-packages.json"), "utf8"));
const w = createWorkshop({ load: () => state, save: () => {} }, { servicePackages }, { today: "2026-03-02" });

const must = (r) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r; };

must(w.call("request_booking", { date: "2026-03-10", start_slot: "14:00", package_id: "OIL-SEMI-10W30", customer_name: "Nur Hidayah", plate: "WRT 5521", phone: "011-2345 6612" }));
must(w.call("request_booking", { date: "2026-03-12", start_slot: "13:00", package_id: "ALIGNMENT", customer_name: "Kevin Ong", plate: "VDE 3307", phone: "012-640 7781" }));

const handovers = [
  ["money", "Customer asks how much the bill is for booking SVC001 (timing belt replacement). Booking check not done in the chat; no amount was shared.", "Melvin Chua", "017-576 8424", "SVC001"],
  ["not_covered", "Customer asks whether the workshop does car wrapping and window tint. Not in the policy guide, FAQ or package list.", "Daniel Lim", "012-778 3140", ""],
  ["money", "Customer asks whether a deposit is needed to hold booking request SVC143 and how to pay it online.", "Nur Hidayah", "011-2345 6612", "SVC143"],
  ["not_covered", "Customer asks if the workshop can collect the car from Puchong and send it back after the service. Not covered by the policy guide or FAQ.", "Aisyah Rahman", "013-552 9018", ""],
  ["money", "Customer asks for a refund on the air-cond gas top-up from booking SVC014; says the air is still not cold. Wants a call back.", "Ivy Goh", "012-544 4191", "SVC014"],
];
for (const [reason, summary, customer_name, contact_phone, booking_id] of handovers)
  must(w.call("escalate_to_staff", { reason, summary, customer_name, contact_phone, booking_id }));

const bookings = state.bookings.filter((b) => !seed.bookings.some((s) => s.booking_id === b.booking_id));
writeFileSync(join(HERE, "demo_queue.json"), JSON.stringify({ bookings, handovers: state.handovers }, null, 2));
console.log(`Wrote demo_queue.json: ${bookings.length} pending requests, ${state.handovers.length} handovers`);
