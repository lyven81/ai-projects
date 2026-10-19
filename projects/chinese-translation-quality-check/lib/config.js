/* The document settings and resources, read once.
 *
 * config/document.json holds every rule that changes from one document to the next (front-matter
 * names, the protected passage, sections, the editor's name, words banned from the output), so the
 * engine itself carries no domain wording. sources() lists every id a finding may cite:
 * glossary entries (G01), house style rules (H1) and brief points (B1).
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RUN = process.env.CTQC_RUN || path.join(ROOT, "run");
const readJSON = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

const config = readJSON("config/document.json");
const glossary = readJSON(config.resources.glossary);
const houseStyle = readJSON(config.resources.house_style);
const brief = fs.readFileSync(path.join(ROOT, config.resources.brief), "utf8");

function sources() {
  return {
    glossary: glossary.entries.map((e) => e.id),
    style: houseStyle.rules.map((r) => r.id),
    brief: [...brief.matchAll(/\*\*(B\d)\b/g)].map((m) => m[1]),
  };
}

/** The resources as Markdown, for the prompts and the MCP server. */
function glossaryMd() {
  return [`# ${glossary.title}`, "", "| id | English | approved Chinese | avoid |", "|---|---|---|---|",
    ...glossary.entries.map((e) => `| ${e.id} | ${e.en} | ${e.zh} | ${e.avoid.join("、")} |`)].join("\n");
}
function houseStyleMd() {
  return [`# ${houseStyle.title}`, "", ...houseStyle.rules.map((r) => `- **${r.id}** ${r.rule}`)].join("\n");
}

module.exports = { ROOT, RUN, config, glossary, houseStyle, brief, sources, glossaryMd, houseStyleMd };
