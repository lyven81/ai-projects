// Build the requests for the chosen sections and show the cost estimate; submits nothing.
// Usage: node batch/build_requests.mjs --sections S01   (or --sections all)
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { load, sectionsArg } = require("./common.js");
const { estimate } = require("../lib/batch.js");
const { sectionRequests } = require("../prompt.js");
const { doc } = load();
const ids = sectionsArg(doc, process.argv);
const reqs = doc.sections.filter((s) => ids.includes(s.id)).flatMap((s) => sectionRequests(doc, s));
const est = await estimate(doc, reqs);
console.log(`${ids.length} section(s), ${est.requests} requests, ${est.input_tokens} input tokens, estimate $${est.usd.toFixed(2)} at batch prices`);
