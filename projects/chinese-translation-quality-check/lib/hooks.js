/* The output check, run before a reviewed Word file is saved.
 *
 * checkOutputFile(buffer, original, config): every tracked change and comment is by the editor
 * (config editor_author); no banned wording (config banned_in_output) in the inserted text or the
 * comments; lastModifiedBy is the editor; no tool or library names added to the document properties; the
 * translator's own author and title properties are kept.
 * (The decision gate lives in lib/apply_decisions.js; the punctuation hook and the protected-passage
 * guard run inside tools.js.)
 */
"use strict";
const JSZip = require("jszip");
const { bannedWording } = require("../tools.js");

const TOOL_NAMES = /claude|anthropic|openai|chatgpt|jszip|xmldom|node\.js|python-docx|quality check/i;

async function checkOutputFile(buffer, original, config) {
  const zip = await JSZip.loadAsync(buffer);
  const editor = config.editor_author;
  const problems = [];
  const doc = await zip.file("word/document.xml").async("string");
  const inserted = [...doc.matchAll(/<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g)].map((m) => m[1].replace(/<[^>]+>/g, "")).join(" ");
  const comments = zip.file("word/comments.xml") ? await zip.file("word/comments.xml").async("string") : "";
  const authors = new Set([...(doc + comments).matchAll(/w:author="([^"]*)"/g)].map((m) => m[1]));
  for (const a of authors) if (a !== editor) problems.push(`author ${a} on a change or comment`);
  for (const [where, text] of [["inserted text", inserted], ["comments", comments.replace(/<[^>]+>/g, " ")]]) {
    const w = bannedWording(text, config.banned_in_output); if (w) problems.push(`${where}: ${w}`);
  }
  const core = await zip.file("docProps/core.xml").async("string");
  const app = zip.file("docProps/app.xml") ? await zip.file("docProps/app.xml").async("string") : "";
  if (!core.includes(`<cp:lastModifiedBy>${editor}</cp:lastModifiedBy>`)) problems.push(`lastModifiedBy is not ${editor}`);
  let oc = "", oa = "";
  if (original) {
    const o = await JSZip.loadAsync(original);
    oc = await o.file("docProps/core.xml").async("string");
    oa = o.file("docProps/app.xml") ? await o.file("docProps/app.xml").async("string") : "";
  }
  // Only names the review itself added: what the translator's own file carries is theirs.
  const names = (s) => new Set((s.match(new RegExp(TOOL_NAMES.source, "gi")) || []).map((x) => x.toLowerCase()));
  const before = names(oc + oa);
  if ([...names(core + app)].some((n) => !before.has(n))) problems.push("a tool name in the document properties");
  if (original) {
    const pick = (x, tag) => (x.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1];
    for (const tag of ["dc:creator", "dc:title"]) if (pick(oc, tag) !== pick(core, tag)) problems.push(`${tag} property changed`);
  }
  return { ok: problems.length === 0, problems };
}

module.exports = { checkOutputFile };
