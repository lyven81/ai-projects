// Jade Star: the sample data generator. Writes data/state.json (seeded confirmed bookings, empty lanes),
// data/customers.json (the people in the 20 cases) and data/a2a_requests.json (one request per A2A case).
// Sample data throughout. Run: node generate_data.mjs
//
// Seeded on purpose (Build List section 9): every room at 7pm on Sat 26 Dec (case 7), both 6-pax rooms at 4pm on
// Wed 16 Dec (case 13), and a light spread elsewhere that never touches a slot a case needs, so the seating map is not
// empty and each case's answer is built in.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "data");
mkdirSync(OUT, { recursive: true });

const seed = [
  // case 7: every room, Sat 26 Dec, 7pm
  ...["R6-1", "R6-2", "R8-1", "R8-2", "R10-1", "R10-2"].map((room_id, i) => ({ date: "2026-12-26", slot: "19:00", room_id, party_size: [5, 6, 8, 7, 10, 9][i] })),
  // case 13: both 6-pax rooms, Wed 16 Dec, 4pm
  { date: "2026-12-16", slot: "16:00", room_id: "R6-1", party_size: 6 },
  { date: "2026-12-16", slot: "16:00", room_id: "R6-2", party_size: 4 },
  // the light spread
  { date: "2026-12-15", slot: "19:00", room_id: "R10-1", party_size: 10 },
  { date: "2026-12-17", slot: "13:00", room_id: "R8-1", party_size: 8 },
  { date: "2026-12-18", slot: "13:00", room_id: "R8-2", party_size: 7 },
  { date: "2026-12-19", slot: "19:00", room_id: "R6-1", party_size: 6 },
  { date: "2026-12-20", slot: "19:00", room_id: "R10-2", party_size: 9 },
  { date: "2026-12-24", slot: "19:00", room_id: "R8-1", party_size: 8 },
  { date: "2026-12-24", slot: "19:00", room_id: "R8-2", party_size: 8 },
  { date: "2026-12-25", slot: "13:00", room_id: "R10-1", party_size: 10 },
  { date: "2026-12-27", slot: "13:00", room_id: "R6-2", party_size: 5 },
  { date: "2026-12-31", slot: "19:00", room_id: "R10-1", party_size: 10 },
  { date: "2026-12-31", slot: "19:00", room_id: "R10-2", party_size: 10 },
];
const guests = ["Chong Kah Wai", "Siti Mariam", "Raj Kumar", "Lau Pei Shan", "Mohd Hafiz", "Ong Bee Lian", "Kavitha Nair", "Teoh Jun Hao",
  "Farah Izzati", "Goh Siew Ling", "Arun Pillai", "Ng Chee Keong", "Zainab Yusof", "Wong Kok Leong", "Aisyah Rahim", "Low Mun Yee",
  "Daniel Chin", "Priya Menon", "Hafizah Omar", "Leong Wai Kit"];

const bookings = seed.map((s, i) => ({
  booking_no: `JS-B${4001 + i}`, proposal_ref: null, status: "confirmed", seeded: true, date: s.date, slot: s.slot, party_size: s.party_size, room_id: s.room_id,
  name: guests[i], phone: `016-55${String(10000 + i * 137).slice(-5)}`, route: ["Form", "Chat", "A2A agent"][i % 3], fee_rm: 100, fee_note: "RM 100 due at check-out",
  confirmed_at: "2026-12-10T12:00", confirmed_by: "customer",
}));

const state = { proposals: [], bookings, handovers: [], notices: [], sms: [], seq: { proposal: 1000, booking: 5000, handover: 3000, notice: 7000 } };

// The people in the cases: one each, name and phone from the host (the signed-in website visitor, the form, or the
// customer details an A2A message carries in its fixed metadata form).
const customers = {
  1: { name: "Tan Wei Jie", phone: "012-3456701" },
  2: { name: "Nurul Aina", phone: "012-3456702" },
  3: { name: "Benjamin Lee", phone: "012-3456703" },
  4: { name: "Kalaivani Subramaniam", phone: "012-3456704" },
  5: { name: "Chan Hui Min", phone: "012-3456705" },
  6: { name: "Ahmad Zaki", phone: "012-3456706" },
  7: { name: "Yeoh Soo Ching", phone: "012-3456707" },
  8: { name: "Marcus Tan", phone: "012-3456708" },
  9: { name: "Lim Kok Wah", phone: "012-3456709" },
  10: { name: "Rosnah Ismail", phone: "012-3456710" },
  11: { name: "Vincent Ho", phone: "012-3456711" },
  12: { name: "Fatimah Zahra", phone: "012-3456712" },
  13: { name: "Ahmad Faizal", phone: "012-3456713" },
  14: { name: "Cheryl Wong", phone: "012-3456714" },
  15: { name: "Suresh Kumar", phone: "012-3456715" },
};

// One request per A2A case, the person's words to their own agent, and what the agent knows if the restaurant asks.
const a2a = {
  13: { person: customers[13], request: "Book a private room at Jade Star Chinese Dining for 5 people on Wednesday 16 December 2026 at 4pm.", facts: { party_size: 5, date: "2026-12-16", time: "4pm" } },
  14: { person: customers[14], request: "Book a private room at Jade Star Chinese Dining for 6 people on Friday 1 January 2027 for lunch at 1pm.", facts: { party_size: 6, date: "2027-01-01", time: "1pm" } },
  15: { person: customers[15], request: "Book a private room at Jade Star Chinese Dining on Wednesday 23 December 2026 at 4pm.", facts: { party_size: 4, date: "2026-12-23", time: "4pm" },
    note: "The person's request carries no party size. The agent sends the request as given and answers the restaurant's question from the facts." },
};

writeFileSync(join(OUT, "state.json"), JSON.stringify(state, null, 1));
writeFileSync(join(OUT, "customers.json"), JSON.stringify(customers, null, 1));
writeFileSync(join(OUT, "a2a_requests.json"), JSON.stringify(a2a, null, 1));
console.log(`Wrote data/state.json (${bookings.length} seeded bookings), data/customers.json (${Object.keys(customers).length}), data/a2a_requests.json (${Object.keys(a2a).length}).`);
