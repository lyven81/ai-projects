// Overview workflow diagram for ai-projects pages (project-showcase.md, "The overview diagram", 23 Oct 2026).
// A page holds <div class="wf"><script type="application/json">{ "id", "hz": {nodes, edges}, "rows": [...] }</script></div>.
// Desktop: left to right from "hz". Phone (700px and below): vertical from "rows".
// Roles: c USER, s SYSTEM, a AI, p HUMAN, o OUTCOME.
(function () {
  const CSS = `
:root{--wire:#7a8796;--c-fill:#f1f3f5;--c-line:#6b7785;--s-fill:#eef5fc;--s-line:#2f6fb0;--a-fill:#f4f0fd;--a-line:#7650c4;--p-fill:#fff4e8;--p-line:#c0620c;--o-fill:#ecf8f0;--o-line:#1e8449}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--wire:#7d8a98;--c-fill:#1e242b;--c-line:#9aa7b5;--s-fill:#15253a;--s-line:#6aa7e0;--a-fill:#231d35;--a-line:#a98be8;--p-fill:#2d2114;--p-line:#e59a4f;--o-fill:#13291c;--o-line:#4fbf7d}}
:root[data-theme="dark"]{--wire:#7d8a98;--c-fill:#1e242b;--c-line:#9aa7b5;--s-fill:#15253a;--s-line:#6aa7e0;--a-fill:#231d35;--a-line:#a98be8;--p-fill:#2d2114;--p-line:#e59a4f;--o-fill:#13291c;--o-line:#4fbf7d}
.wf .flow{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:18px 12px;font-size:13.5px;line-height:1.4;margin:8px 0}
.wf .bx{border:2px solid;border-radius:10px;padding:7px 10px 8px}
.wf .bx .rl{font-size:10.5px;font-weight:700;letter-spacing:.06em;margin-bottom:1px}
.wf .bx .tt{font-weight:700;color:var(--ink);font-size:14px;margin-bottom:2px}
.wf .bx .dt{color:var(--ink);opacity:.86}
.wf .bx.c{background:var(--c-fill);border-color:var(--c-line)}.wf .bx.c .rl{color:var(--c-line)}
.wf .bx.s{background:var(--s-fill);border-color:var(--s-line)}.wf .bx.s .rl{color:var(--s-line)}
.wf .bx.a{background:var(--a-fill);border-color:var(--a-line)}.wf .bx.a .rl{color:var(--a-line)}
.wf .bx.p{background:var(--p-fill);border-color:var(--p-line)}.wf .bx.p .rl{color:var(--p-line)}
.wf .bx.o{background:var(--o-fill);border-color:var(--o-line)}.wf .bx.o .rl{color:var(--o-line)}
.wf .pl{display:inline-block;font-size:11.5px;font-weight:600;color:var(--navy);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:1px 8px;text-align:center;line-height:1.3}
.wf .hz{position:relative;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));column-gap:30px;row-gap:66px;padding:40px 4px 6px;font-size:13px;line-height:1.35}
.wf .hz .bx{position:relative;z-index:1;align-self:start}
.wf .hz .bx .tt{font-size:13.5px}
.wf .hz svg.wires{position:absolute;inset:0;width:100%;height:100%;overflow:visible;color:var(--wire);z-index:0}
.wf .hz .wl{position:absolute;z-index:2;transform:translate(-50%,-50%);max-width:112px;white-space:normal}
.wf .vfall{display:none}
.wf .row{display:grid;grid-template-columns:minmax(0,1fr) 88px minmax(0,1.1fr) 88px minmax(0,1fr);align-items:start}
.wf .row .L{grid-column:1}.wf .row .LA{grid-column:2}.wf .row .C{grid-column:3}.wf .row .RA{grid-column:4}.wf .row .R{grid-column:5}
.wf .row .C{align-self:stretch;display:flex;flex-direction:column;align-items:center}.wf .row .C>.bx{align-self:stretch}
.wf .row .C>.fill{flex:1 1 auto;width:2px;background:var(--wire)}
.wf .ha{display:flex;flex-direction:column;align-items:center;padding:14px 4px 0}
.wf .ha .pl{margin-bottom:5px;max-width:100%}
.wf .ha i{display:block;width:100%;height:2px;background:var(--wire);position:relative}
.wf .ha i::after{content:"";position:absolute;top:-5px;border:6px solid transparent}
.wf .ha.toL i::after{left:-2px;border-right:7px solid var(--wire);border-left:0}
.wf .ha.toR i::after{right:-2px;border-left:7px solid var(--wire);border-right:0}
.wf .dn{display:flex;flex-direction:column;align-items:center;min-height:30px;padding:2px 0}
.wf .dn i{width:2px;flex:1 1 auto;min-height:12px;background:var(--wire)}
.wf .dn i.h{position:relative}.wf .dn i.h::after{content:"";position:absolute;left:-5px;bottom:-1px;border:6px solid transparent;border-top:7px solid var(--wire);border-bottom:0}
.wf .dn .pl{margin:2px 0}
.wf .stack .dn{min-height:24px}
.wf .split{position:relative;padding-top:16px;grid-column:1/6}
.wf .split::before{content:"";position:absolute;top:0;left:calc(50% - 1px);width:2px;height:16px;background:var(--wire)}
.wf .split .cols{display:grid;gap:0 14px;position:relative}
.wf .split .cols::before{content:"";position:absolute;top:0;height:2px;background:var(--wire)}
.wf .split.n2 .cols{grid-template-columns:repeat(2,minmax(0,1fr))}.wf .split.n2 .cols::before{left:25%;right:25%}
.wf .split.n3 .cols{grid-template-columns:repeat(3,minmax(0,1fr))}.wf .split.n3 .cols::before{left:calc(100%/6);right:calc(100%/6)}
.wf .split .col{display:flex;flex-direction:column}
.wf .split.join .col::after{content:"";display:block;width:2px;flex:1 1 auto;min-height:16px;margin:0 auto;background:var(--wire)}
.wf .split.join .cols::after{content:"";position:absolute;bottom:0;height:2px;background:var(--wire)}
.wf .split.join.n3 .cols::after{left:calc(100%/6);right:calc(100%/6)}.wf .split.join.n2 .cols::after{left:25%;right:25%}
.wf .key{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--muted);margin:8px 2px 0}
.wf .key span::before{content:"";display:inline-block;width:11px;height:11px;border-radius:3px;border:2px solid;margin-right:5px;vertical-align:-1px}
.wf .key .c::before{background:var(--c-fill);border-color:var(--c-line)}.wf .key .s::before{background:var(--s-fill);border-color:var(--s-line)}
.wf .key .a::before{background:var(--a-fill);border-color:var(--a-line)}.wf .key .p::before{background:var(--p-fill);border-color:var(--p-line)}
.wf .key .o::before{background:var(--o-fill);border-color:var(--o-line)}
@media (max-width:700px){
  .wf .hzbox{display:none}.wf .vfall{display:block}
  .wf .row{grid-template-columns:minmax(0,1fr)}
  .wf .row>*{grid-column:1 !important}
  .wf .row .C{order:1}.wf .row .LA{order:2}.wf .row .L{order:3}.wf .row .RA{order:4}.wf .row .R{order:5}
  .wf .row .e,.wf .row .C>.fill{display:none}
  .wf .row .L,.wf .row .R{margin:0 0 4px 14px;padding:2px 0 6px 12px;border-left:2px dashed var(--wire)}
  .wf .ha{align-items:flex-start;padding:8px 0 0 14px;border-left:2px dashed var(--wire);margin-left:14px}
  .wf .ha .pl{margin-left:12px}
  .wf .ha i{display:none}
  .wf .ha .pl::before{content:"\\21B3  "}
  .wf .split .cols{grid-template-columns:minmax(0,1fr) !important;gap:0}
  .wf .split .cols::before,.wf .split .cols::after,.wf .split::before{display:none}
  .wf .split .col::before{content:"";display:block;width:2px;height:14px;margin:0 auto;background:var(--wire)}
}`;
  const ROLE = { c: "USER", s: "SYSTEM", a: "AI", p: "HUMAN", o: "OUTCOME" };
  const esc = (t) => String(t).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
  const bx = ([k, title, ...d], id, pos) => `<div class="bx ${k}"${id ? ` data-id="${id}"` : ""}${pos ? ` style="grid-row:${pos[0]};grid-column:${pos[1]}"` : ""}><div class="rl">${ROLE[k]}</div><div class="tt">${esc(title)}</div>${d.map((x) => `<div class="dt">${esc(x)}</div>`).join("")}</div>`;
  const pill = (t) => (t ? `<span class="pl">${esc(t)}</span>` : "");
  const dn = (t) => (t ? `<div class="dn"><i></i>${pill(t)}<i class="h"></i></div>` : `<div class="dn"><i class="h"></i></div>`);
  const stack = (b, m = []) => `<div class="stack">${b.map((x, i) => (i ? dn(m[i - 1]) : "") + bx(x)).join("")}</div>`;
  const side = (s, pos) => {
    if (!s) return `<div class="${pos} e"></div><div class="${pos}A e"></div>`;
    const dir = (pos === "L") !== !!s.in ? "toL" : "toR";
    return `<div class="${pos}A"><div class="ha ${dir}">${pill(s.t)}<i></i></div></div><div class="${pos}">${stack(s.b, s.m)}</div>`;
  };
  const vertical = (rows) => `<div class="flow">${rows.map((r) => {
    if (r.down !== undefined) return `<div class="row"><div class="C">${dn(r.down)}</div></div>`;
    if (r.split) return `<div class="row"><div class="split n${r.split.length}${r.join ? " join" : ""}"><div class="cols">${r.split.map((x) => `<div class="col">${dn(x.t)}${bx(x.b)}</div>`).join("")}</div></div></div>` + (r.join ? `<div class="row"><div class="C">${dn()}</div></div>` : "");
    return `<div class="row">${side(r.l, "L")}<div class="C">${bx(r.c)}${r.l || r.r ? '<i class="fill"></i>' : ""}</div>${side(r.r, "R")}</div>`;
  }).join("")}</div>`;
  const horizontal = (h, id) => `<div class="flow hzbox"><div class="hz">${h.nodes.map((n) => bx(n.b, n.id, [n.r, n.c])).join("")}<svg class="wires" aria-hidden="true"><defs><marker id="ah-${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs></svg></div></div>`;
  const KEY = `<div class="key"><span class="c">User: who makes the request</span><span class="s">System: rules in code</span><span class="a">AI</span><span class="p">Human: a person decides</span><span class="o">Outcome</span></div>`;

  function wire(g, edges, id) {
    const svg = g.querySelector("svg"), G = g.getBoundingClientRect();
    if (!G.width) return;
    svg.querySelectorAll("path.w").forEach((e) => e.remove());
    g.querySelectorAll(".wl").forEach((e) => e.remove());
    const R = (k) => { const r = g.querySelector(`[data-id="${k}"]`).getBoundingClientRect(); return { l: r.left - G.left, t: r.top - G.top, r: r.right - G.left, b: r.bottom - G.top, w: r.width, h: r.height }; };
    const line = (d) => { const e = document.createElementNS("http://www.w3.org/2000/svg", "path"); e.setAttribute("d", d); e.setAttribute("class", "w"); e.setAttribute("fill", "none"); e.setAttribute("stroke", "currentColor"); e.setAttribute("stroke-width", "2"); e.setAttribute("marker-end", `url(#ah-${id})`); svg.appendChild(e); };
    const lab = (t, x, y) => { if (!t) return; const e = document.createElement("span"); e.className = "pl wl"; e.textContent = t; e.style.left = x + "px"; e.style.top = y + "px"; g.appendChild(e); };
    edges.forEach(([f, t, label, fx]) => {
      const a = R(f), b = R(t);
      if (a.t > b.b) { const x = a.l + a.w / 2; line(`M${x},${a.t} L${x},${b.b + 2}`); lab(label, x, b.b + (a.t - b.b) * 0.5); return; }
      if (Math.abs(a.t - b.t) < 4) { const y = a.t + 28; line(`M${a.r},${y} L${b.l - 2},${y}`); lab(label, (a.r + b.l) / 2, a.t - 18); return; }
      const x1 = a.l + a.w * (fx ?? 0.5), x2 = b.l + b.w / 2, gy = a.b + (b.t - a.b) * 0.3;
      if (Math.abs(x1 - x2) < 2) { line(`M${x1},${a.b} L${x1},${b.t - 2}`); lab(label, x1, a.b + (b.t - a.b) * 0.66); }
      else { line(`M${x1},${a.b} L${x1},${gy} L${x2},${gy} L${x2},${b.t - 2}`); lab(label, x2, gy + (b.t - gy) * 0.5); }
    });
  }

  function init() {
    if (!document.getElementById("wf-style")) { const st = document.createElement("style"); st.id = "wf-style"; st.textContent = CSS; document.head.appendChild(st); }
    document.querySelectorAll(".wf").forEach((el, i) => {
      const src = el.querySelector('script[type="application/json"]');
      if (!src || el.dataset.done) return;
      const d = JSON.parse(src.textContent), id = d.id || "wf" + i;
      el.dataset.done = "1";
      el.insertAdjacentHTML("beforeend", horizontal(d.hz, id) + `<div class="vfall">${vertical(d.rows)}</div>` + KEY);
      const g = el.querySelector(".hz"), run = () => wire(g, d.hz.edges, id);
      if ("ResizeObserver" in window) new ResizeObserver(run).observe(g); else addEventListener("resize", run);
      run();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
