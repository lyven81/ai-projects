// Builds demo_state.json: what a visitor first sees on Pak Razif's page and in the live chat.
// calendar.json plus inbox items taken from the recorded benchmark run (benchmark/results.json),
// so every item is real tool output, never written by hand. Only the display names, phones and
// received times are set here, so the inbox reads like one morning's messages.
// Pages only; the benchmark always runs on the plain calendar.json.
//
// Run after a benchmark run: node make_demo_state.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const state = JSON.parse(readFileSync(join(HERE, "calendar.json"), "utf8"));
const run = JSON.parse(readFileSync(join(HERE, "benchmark", "results.json"), "utf8"));

// Case, display name and phone (fictional), received time: oldest first.
const PICK = [
  ["13", null, null, "07:42"],                              // Daniel Lee: move the visit (contact from the case)
  ["6", "Farah Hamzah", "012-718 4402", "08:05"],           // price request
  ["5", "Kumar Selvam", "016-930 2217", "08:31"],           // photos
  ["11", "Hafizah Rahim", "013-622 9081", "08:48"],         // outside the area
  ["E7", null, null, "09:02"],                              // a visit booked by the assistant (Aminah Yusof)
  ["15", null, null, "09:20"],                              // Tan Wei Ming: after the visit
  ["E11", "Jason Ong", "017-245 6630", "09:37"],            // unusual work
  ["14", "Melissa Chan", "011-508 7714", "09:51"],          // damaged fence
];

let n = 0;
for (const [id, name, phone, time] of PICK) {
  const r = run.results.find((x) => x.id === id);
  if (!r || !r.score.pass) throw new Error(`case ${id} missing or failed in results.json; rerun the benchmark first`);
  for (const b of r.stateDiff.newBookings) {
    b.ref = "HG-" + state.next_ref++;
    state.bookings.push(b);
    state.days[b.date].slots[b.slot] = { status: "booked", ref: b.ref };
  }
  for (const item of r.stateDiff.inbox) {
    const it = JSON.parse(JSON.stringify(item));
    it.id = "IN-" + String(++n).padStart(3, "0");
    it.received = `2026-10-17T${time}`;
    if (name) it.customer = { name, phone };
    if (it.kind === "new_visit") it.ref = r.stateDiff.newBookings[0].ref;
    if (it.photos && it.photos.length && it.kind === "photos") {
      const ups = r.transcript.flatMap((t) => (t.uploads || []).map((u, i) => [u, t.photos[i]]));
      it.photos = it.photos.map((p) => {
        const src = ups.find(([u]) => u === p);
        const nid = "PH-" + String(state.uploads.length + 1).padStart(3, "0");
        state.uploads.push({ id: nid, image: state.demo_photos[src[1]], uploaded_at: it.received, forwarded: true });
        return nid;
      });
      it.images = it.photos.map((p) => state.uploads.find((u) => u.id === p).image);
    }
    state.inbox.push(it);
  }
}
state.meta = { built_from: "benchmark/results.json " + run.ranAt, cases: PICK.map((p) => p[0]) };
writeFileSync(join(HERE, "demo_state.json"), JSON.stringify(state, null, 1));
console.log(`demo_state.json: ${state.inbox.length} inbox items, next ref HG-${state.next_ref}, ${state.uploads.length} photos`);
