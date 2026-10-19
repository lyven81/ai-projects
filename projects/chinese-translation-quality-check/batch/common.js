/* Shared by the batch commands: the document, the sources, the run file and where findings go. */
"use strict";
const fs = require("fs");
const path = require("path");
const { indexDocument } = require("../tools.js");
const { ROOT, RUN, sources } = require("../lib/config.js");

function load(docPath = path.join(RUN, "document.json")) {
  return { doc: indexDocument(JSON.parse(fs.readFileSync(docPath, "utf8"))), sources: sources() };
}
function sectionsArg(doc, argv) {
  const i = argv.indexOf("--sections");
  const v = i >= 0 ? argv[i + 1] : "all";
  return v === "all" ? doc.sections.map((s) => s.id) : v.split(",");
}
function saveSection(dir) {
  return async (id, rec) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(rec, null, 1)); };
}
function appendUsage(file, entry) {
  const log = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  log.push(entry); fs.writeFileSync(file, JSON.stringify(log, null, 1));
}
module.exports = { ROOT, RUN, load, sectionsArg, saveSection, appendUsage };
