// Site navigation bar for every ai-projects page: Home · Projects · Categories (menu) · About me · Discuss a project.
// A page adds <div id="sitenav" data-active="..." data-root="..."></div> at the top of .wrap, then loads
// site-data.js and this file. data-active: home | projects | categories | about | category:{type} | project:{slug}.
// data-root: path from the page to the shared files (site-data.js, images/, profile.jpg); "" on the live site.
(function () {
  const S = window.SITE, el = document.getElementById("sitenav");
  if (!S || !el) return;
  const active = el.dataset.active || "", root = el.dataset.root || "";
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const types = S.types.map(t => ({ ...t, n: S.projects.filter(p => p.type === t.id).length })).filter(t => t.n);
  const project = active.startsWith("project:") ? S.projects.find(p => p.slug === active.slice(8)) : null;
  const catId = active.startsWith("category:") ? active.slice(9) : project ? project.type : "";
  const section = active === "home" ? "home" : active === "projects" ? "projects" : active === "about" ? "about" : (active === "categories" || catId) ? "categories" : "";
  const on = k => section === k ? ' class="on" aria-current="page"' : "";

  const css = `
html{scrollbar-gutter:stable}
#sitenav{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--line);margin:-28px 0 0;padding:10px 0}
#sitenav .row{display:flex;align-items:center;gap:6px 18px;flex-wrap:wrap}
#sitenav .brand{font-weight:700;color:var(--navy);text-decoration:none;font-size:18px;white-space:nowrap}
#sitenav .gap{flex:1}
#sitenav .links{display:flex;align-items:center;gap:4px 18px;font-size:18px}
#sitenav .links>a,#sitenav .dd>a{color:var(--ink);text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}
#sitenav .links>a:hover,#sitenav .dd>a:hover{color:var(--accent)}
#sitenav a.on{color:var(--accent);border-bottom-color:var(--accent);font-weight:600}
#sitenav .dd{position:relative;display:flex;align-items:center;gap:2px}
#sitenav .caret{background:none;border:0;color:var(--muted);cursor:pointer;font-size:14px;padding:4px 2px}
#sitenav .menu{display:none;position:absolute;top:100%;left:0;min-width:240px;background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 0;box-shadow:0 6px 18px rgba(0,0,0,.12)}
#sitenav .dd.open .menu{display:block}
@media (hover:hover){#sitenav .dd:hover .menu,#sitenav .dd:focus-within .menu{display:block}}
#sitenav .menu a{display:flex;justify-content:space-between;gap:12px;padding:6px 14px;color:var(--ink);text-decoration:none;font-size:14px}
#sitenav .menu a:hover{background:var(--box);color:var(--accent)}
#sitenav .menu a.cur{color:var(--accent);font-weight:600}
#sitenav .menu .n{color:var(--muted);font-size:12.5px}
#sitenav .menu hr{border:0;border-top:1px solid var(--line);margin:4px 0}
#sitenav .navcta{display:inline-block;font-size:18px;font-weight:600;padding:6px 14px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;text-decoration:none;white-space:nowrap}
#sitenav .burger{display:none;background:var(--card);border:1px solid var(--line);border-radius:6px;color:var(--navy);font:600 14px "Segoe UI",Arial,sans-serif;padding:5px 12px;cursor:pointer}
#sitecrumb{font-size:13px;color:var(--muted);margin:10px 0 -4px}
#sitecrumb a{color:var(--accent);text-decoration:none}
.top{top:var(--navh,0px)}
@media (max-width:700px){
 #sitenav .burger{display:inline-block}
 #sitenav .links{display:none;order:9;width:100%;flex-direction:column;align-items:stretch;gap:0;padding-top:6px}
 #sitenav.openm .links{display:flex}
 #sitenav .links>a,#sitenav .dd>a{padding:8px 2px;border-bottom:1px solid var(--line)}
 #sitenav a.on{border-bottom-color:var(--line)}
 #sitenav .dd{flex-direction:column;align-items:stretch}
 #sitenav .caret{display:none}
 #sitenav .menu{display:block;position:static;box-shadow:none;border:0;background:none;padding:0 0 4px 14px;min-width:0}
 #sitenav .menu hr{display:none}
}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  const menu = `<a href="categories.html"${active === "categories" ? ' class="cur"' : ""}>All categories</a><hr>` +
    types.map(t => `<a href="category-${t.id}.html"${catId === t.id ? ' class="cur"' : ""}>${esc(t.name)}</a>`).join("");
  el.innerHTML = `<div class="row">
<a class="brand" href="index.html">AI Projects · Lee Yih Ven</a><span class="gap"></span>
<div class="links">
 <a href="index.html"${on("home")}>Home</a>
 <a href="projects.html"${on("projects")}>Projects</a>
 <div class="dd"><a href="categories.html"${on("categories")}>Categories</a><button class="caret" aria-label="Show categories" aria-expanded="false">▾</button><div class="menu">${menu}</div></div>
 <a href="about.html"${on("about")}>About me</a>
</div>
<button class="burger" aria-expanded="false">Menu</button>
<a class="navcta" href="${S.whatsapp}" target="_blank" rel="noopener">Discuss a project</a>
</div>`;

  // Breadcrumb on category and project pages only.
  const cat = types.find(t => t.id === catId);
  if (cat) {
    const c = document.createElement("div"); c.id = "sitecrumb";
    c.innerHTML = `<a href="categories.html">Categories</a> › ` + (project
      ? `<a href="category-${cat.id}.html">${esc(cat.name)}</a> › ${esc(project.title)}`
      : esc(cat.name));
    el.after(c);
  }

  const dd = el.querySelector(".dd"), caret = el.querySelector(".caret"), burger = el.querySelector(".burger");
  caret.addEventListener("click", e => { e.stopPropagation(); const o = dd.classList.toggle("open"); caret.setAttribute("aria-expanded", o); });
  burger.addEventListener("click", () => { const o = el.classList.toggle("openm"); burger.setAttribute("aria-expanded", o); burger.textContent = o ? "Close" : "Menu"; setH(); });
  document.addEventListener("click", e => { if (!dd.contains(e.target)) { dd.classList.remove("open"); caret.setAttribute("aria-expanded", false); } });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { dd.classList.remove("open"); el.classList.remove("openm"); burger.textContent = "Menu"; } });

  // The page's own sticky .top (title, tabs, contents) sits just under the bar.
  const setH = () => document.documentElement.style.setProperty("--navh", el.offsetHeight + "px");
  setH(); window.addEventListener("resize", setH);
  window.SITE_ROOT = root;
})();
