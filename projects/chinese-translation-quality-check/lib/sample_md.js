/**
 * Reads and writes the sample's Markdown format: `[F1]` to `[F4]` front matter, `## ` headings (kept
 * for layout, never reviewed) and `[1]` to `[44]` numbered paragraphs, one per line. Comments and the
 * `# ` title line are kept as they are.
 */
const fs = require("fs");

const TARGET = /^\[(F\d+|\d+)\]\s?(.*)$/;

function parse(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const items = [];
  for (const line of lines) {
    const m = line.match(TARGET);
    if (m) items.push({ type: "target", key: m[1], text: m[2] });
    else if (line.startsWith("## ")) items.push({ type: "heading", text: line.slice(3) });
    else items.push({ type: "raw", text: line });
  }
  return items;
}

function targets(items) {
  const out = {};
  for (const it of items) if (it.type === "target") out[it.key] = it.text;
  return out;
}

function write(file, items) {
  const text = items.map((it) => (it.type === "target" ? `[${it.key}] ${it.text}` : it.type === "heading" ? `## ${it.text}` : it.text)).join("\n");
  fs.writeFileSync(file, text, "utf8");
}

module.exports = { parse, targets, write };
