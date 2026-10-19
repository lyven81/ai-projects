// Submit one batch per chosen section and save the batch IDs to the run file.
// Usage: node batch/submit.mjs --sections S01   (or --sections S02,S03,... or all). Refuses over $15.
import { createRequire } from "node:module";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { RUN, load, sectionsArg } = require("./common.js");
const { submit } = require("../lib/batch.js");
const { CAPS } = require("../coordinator.js");
const { doc } = load();
const ids = sectionsArg(doc, process.argv);
const r = await submit(doc, ids, join(RUN, "batch_run.json"), CAPS.real);
if (!r.ok) { console.log(r.error); process.exit(2); }
console.log(`submitted ${r.batches} batch(es), ${r.estimate.requests} requests, estimate $${r.estimate.usd.toFixed(2)}; the laptop can now be off`);
