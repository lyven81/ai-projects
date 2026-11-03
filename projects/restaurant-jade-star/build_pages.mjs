// Jade Star: builds the .html version of each resource (R1 to R4) from its .md, with a clause anchor per rule
// (#P8, #G2, #K3, #H5), so the clause shown in the Under the hood view opens highlighted. Master Kit style.
// Run: node build_pages.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(HERE, "resources", "restaurant.json"), "utf8"));
const CSS = readFileSync(join(HERE, "lib", "masterkit.css"), "utf8");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");

function toHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  let title = "", out = [], i = 0, n = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.startsWith("# ")) { title = l.slice(2).trim(); i++; continue; }
    if (l.startsWith("## ")) {
      const t = l.slice(3).trim(); const m = t.match(/^([A-Z]\d+)\s+(.*)$/);
      out.push(m ? `<h3 id="${m[1]}">${m[1]} ${inline(m[2])}</h3>` : `<h2>${++n}. ${inline(t)}</h2>`);
      i++; continue;
    }
    if (l.startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { if (!/^\|\s*-/.test(lines[i])) rows.push(lines[i].split("|").slice(1, -1).map((c) => c.trim())); i++; }
      out.push("<table>" + rows.map((r, k) => {
        const tag = k === 0 ? "th" : "td";
        const id = k > 0 && /^H\d+$/.test(r[0]) ? ` id="${r[0]}"` : "";
        return `<tr${id}>${r.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`;
      }).join("") + "</table>");
      continue;
    }
    if (l.trim()) { out.push(`<p>${inline(l.trim())}</p>`); }
    i++;
  }
  return { title, body: out.join("\n") };
}

for (const r of C.resources) {
  const md = readFileSync(join(HERE, "resources", r.file), "utf8");
  const { title, body } = toHtml(md);
  const first = body.indexOf("<h3") >= 0 && body.indexOf("<h2") < 0 ? `<h2>1. Clauses</h2>\n` : "";
  // The intro paragraph sits before the clauses; the clauses follow under one numbered section.
  const split = body.indexOf("<h3");
  const intro = split > 0 ? body.slice(0, split) : "";
  const rest = split > 0 ? body.slice(split) : body;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="../../../favicon.ico" sizes="any"><link rel="icon" href="../../../favicon.svg" type="image/svg+xml">
<title>${esc(r.name)}</title><style>${CSS}</style></head>
<body><div class="wrap">
<div class="top"><div class="crumbs"><a href="../../../index.html">AI Projects</a> / <a href="../../../restaurant-jade-star.html">Jade Star Chinese Dining 吉星饭厅</a> / <a href="../demo.html">Demo</a></div><h1>${esc(title)}</h1><nav id="toc"></nav></div>
${intro}
<p><b>Resource:</b> <code>${r.uri}</code>, served by the MCP server to the restaurant assistant. Each clause has its own link, for example <code>#${rest.match(/id="([A-Z]\d+)"/) ? rest.match(/id="([A-Z]\d+)"/)[1] : ""}</code>.</p>
${first}${rest}
<footer>© 2026 Lee Yih Ven · ${esc(r.name)}</footer></div>
<script>
const toc=document.getElementById('toc');
document.querySelectorAll('h2').forEach((h,i)=>{h.id=h.id||'s'+(i+1);const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.textContent;toc.appendChild(a);});
document.querySelectorAll('h3[id]').forEach(h=>{const a=document.createElement('a');a.href='#'+h.id;a.textContent=h.id;toc.appendChild(a);});
document.querySelectorAll('table').forEach(t=>{const d=document.createElement('div');d.className='tw';t.parentNode.insertBefore(d,t);d.appendChild(t);});
</script></body></html>
`;
  writeFileSync(join(HERE, "resources", r.file.replace(/\.md$/, ".html")), html);
  console.log(`Wrote resources/${r.file.replace(/\.md$/, ".html")}`);
}
