/* ══════════════════════════════════════════════════════════════
   bookengine.js — turns a folder of Markdown chapters into a
   two-pane web book (table of contents left, chapter right).
   https://github.com/khaledmahmudkm/bookengine · MIT licence

   A book is a folder with index.html, book.json and chapters/.
   This file knows nothing about any particular book: everything
   book-specific comes from book.json, and interactive extras are
   plugins the book lists under "scripts" (see README.md).
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const VERSION = "1.0.0";

  // Pinned third-party libraries. Bump deliberately, test, then release.
  const CDN = "https://cdn.jsdelivr.net/npm/";
  const HLJS = CDN + "@highlightjs/cdn-assets@11.11.1/";
  const LIBS = {
    marked: CDN + "marked@18.1.0/lib/marked.umd.js",
    hljs: HLJS + "highlight.min.js",
    hljsLang: lang => HLJS + "languages/" + lang + ".min.js",
    hljsLight: HLJS + "styles/default.min.css",
    hljsDark: HLJS + "styles/github-dark.min.css",
    markdownCss: CDN + "github-markdown-css@5.8.1/github-markdown.css",
    mathjax: CDN + "mathjax@3.2.2/es5/tex-svg.js",
    fonts: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
  };

  const THEME_KEY = "bookengine-theme"; // shared by all books on the origin, on purpose
  const BOOK_KEY = location.pathname; // per-book storage namespace

  // Where this engine was loaded from, so it can find bookengine.css next to it.
  const ENGINE_BASE = new URL(".", document.currentScript.src).href;

  // ── Small helpers ──────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage blocked */ } }
  };

  // Resolve a URL from book.json against the book (the page), not the engine.
  const bookUrl = u => new URL(u, document.baseURI).href;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  // Resolves when the sheet has loaded or failed; a broken stylesheet
  // must never stop the book from rendering.
  function loadStyle(href, id) {
    return new Promise(resolve => {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      if (id) l.id = id;
      l.onload = l.onerror = () => resolve();
      document.head.appendChild(l);
    });
  }

  async function fetchText(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status + " " + r.statusText + " — " + url);
    return r.text();
  }

  const domReady = new Promise(r =>
    document.readyState === "loading"
      ? document.addEventListener("DOMContentLoaded", r, { once: true })
      : r());

  function slugify(text) {
    return text.toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
  }

  function titleFromFile(file) {
    const stem = file.replace(/\.md$/, "").replace(/^\d+[-_]/, "").replace(/[-_]+/g, " ");
    return stem.charAt(0).toUpperCase() + stem.slice(1);
  }

  // ── Plugin API ─────────────────────────────────────────────
  // Book scripts listed in book.json register hooks here, e.g.
  //   BookEngine.onChapter("08-pbkdf2.md", ({ el }) => { ... });
  //   BookEngine.onChapter(({ file, el }) => { ... });   // every chapter
  const hooks = [];
  let meta = {};

  window.BookEngine = {
    version: VERSION,
    onChapter(fileOrFn, fn) {
      if (typeof fileOrFn === "function") hooks.push({ file: "*", fn: fileOrFn });
      else hooks.push({ file: fileOrFn, fn });
    },
    get book() { return meta; },
    util: { esc, loadScript, loadStyle }
  };

  // ── Theme ──────────────────────────────────────────────────
  const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") ||
      store.get(THEME_KEY) ||
      (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }

  function setTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) store.set(THEME_KEY, theme);
    const btn = $("#theme-toggle");
    if (btn) {
      btn.innerHTML = theme === "light" ? MOON_ICON : SUN_ICON;
      btn.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
    }
    const light = $("#hljs-light-theme"), dark = $("#hljs-dark-theme");
    if (light && dark) { light.disabled = theme === "dark"; dark.disabled = theme !== "dark"; }
  }

  // ── Page shell ─────────────────────────────────────────────
  // Default header logo: an open book, drawn in the accent colour
  const BOOK_ICON = '<svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>';

  // book.json "logo": an .svg is inlined so it can use currentColor and
  // follow the theme; any other image is shown as <img>.
  async function logoHTML() {
    if (!meta.logo) return BOOK_ICON;
    const url = bookUrl(meta.logo);
    if (/\.svg(\?|#|$)/i.test(meta.logo)) {
      try {
        const doc = new DOMParser().parseFromString(await fetchText(url), "image/svg+xml");
        const svg = doc.documentElement;
        if (svg.nodeName.toLowerCase() !== "svg") throw new Error("not an SVG");
        svg.querySelectorAll("script, foreignObject").forEach(n => n.remove());
        svg.setAttribute("class", "brand-icon");
        svg.setAttribute("aria-hidden", "true");
        svg.removeAttribute("width"); svg.removeAttribute("height");
        return svg.outerHTML;
      } catch (e) {
        console.warn("bookengine: logo", e.message);
        return BOOK_ICON;
      }
    }
    return `<img class="brand-icon" src="${esc(url)}" alt="">`;
  }

  // book.json "theme": { "light": { "accent": "#…" }, "dark": { … } }
  // Keys are the CSS variables in bookengine.css, with or without "--".
  function applyTheme() {
    const t = meta.theme;
    if (!t || typeof t !== "object") return;
    const block = (sel, vars) => {
      if (!vars || typeof vars !== "object") return "";
      const decls = Object.entries(vars).map(([k, v]) => {
        const name = "--" + String(k).replace(/^--/, "").replace(/[^\w-]/g, "");
        return `${name}:${String(v).replace(/[{};<>]/g, "")};`;
      }).join("");
      return `${sel}{${decls}}`;
    };
    const style = document.createElement("style");
    style.id = "bookengine-theme";
    style.textContent = block(":root", t.light) + block(':root[data-theme="dark"]', t.dark);
    document.head.appendChild(style);
  }

  function buildShell(logo) {
    const brandInner = `${logo}<h1 id="book-title">${esc(meta.title || "")}</h1>`;
    const brand = meta.homeUrl
      ? `<a class="brand" href="${esc(meta.homeUrl)}" aria-label="Home">${brandInner}</a>`
      : `<div class="brand">${brandInner}</div>`;
    document.body.innerHTML = `
<div class="wrapper">
  <header class="header">
    <button class="hamburger" id="sidebar-toggle" aria-label="Table of contents" aria-expanded="false" aria-controls="sidebar">
      <span></span><span></span><span></span>
    </button>
    ${brand}
    <button class="theme-btn" id="theme-toggle"></button>
  </header>
  <div class="sidebar-overlay" id="sidebar-overlay"></div>
  <div class="container">
    <aside class="sidebar" id="sidebar" aria-label="Table of contents">
      <div class="sidebar-header">
        <h2>Chapters</h2>
        <button class="sidebar-close" id="sidebar-close" aria-label="Close table of contents">&#x2715;</button>
      </div>
      <nav><ul id="toc"></ul></nav>
    </aside>
    <main class="content markdown-body" id="content" tabindex="-1">
      <p class="kmb-status">Loading…</p>
    </main>
  </div>
  <footer class="footer">
    <p class="footer-copy">${esc(meta.copyright || "")}</p>
  </footer>
</div>`;

    $("#theme-toggle").addEventListener("click", () =>
      setTheme(currentTheme() === "light" ? "dark" : "light", true));
    setTheme(currentTheme(), false);
    initSidebar();
  }

  function setHeadMeta() {
    if (meta.title) document.title = meta.title;
    const put = (name, value) => {
      if (!value) return;
      let m = $(`meta[name="${name}"]`);
      if (!m) { m = document.createElement("meta"); m.name = name; document.head.appendChild(m); }
      if (!m.content) m.content = value;
    };
    put("description", meta.description);
    put("author", meta.author);
    put("theme-color", meta.themeColor || "#5a9e2f");
  }

  // ── Sidebar (mobile drawer) ────────────────────────────────
  function initSidebar() {
    const toggle = $("#sidebar-toggle"), sidebar = $("#sidebar"), overlay = $("#sidebar-overlay");
    const isOpen = () => sidebar.classList.contains("is-open");
    const set = open => {
      sidebar.classList.toggle("is-open", open);
      overlay.classList.toggle("is-visible", open);
      toggle.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      document.body.style.overflow = open ? "hidden" : "";
    };
    toggle.addEventListener("click", () => set(!isOpen()));
    $("#sidebar-close").addEventListener("click", () => set(false));
    overlay.addEventListener("click", () => set(false));
    sidebar.addEventListener("click", e => {
      if (e.target.closest("a.toc-link") && window.innerWidth <= 768) set(false);
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && isOpen()) set(false); });
  }

  // ── Chapters & TOC ─────────────────────────────────────────
  let home = null;        // { file, path, slug: "", title }
  let chapters = [];      // reading order, separators excluded
  let tocEntries = [];    // chapters + { separator } in order
  const textCache = new Map();

  function getText(path) {
    if (!textCache.has(path)) {
      const p = fetchText(path);
      p.catch(() => textCache.delete(path));
      textCache.set(path, p);
    }
    return textCache.get(path);
  }

  const hrefFor = (item, section) =>
    "#/" + encodeURIComponent(item.slug) + (section ? "/" + encodeURIComponent(section) : "");

  // Titles come from chapters.json ("title") when given, otherwise from
  // each file's first "# " heading. All files are fetched in parallel.
  async function loadChapterList() {
    const entries = JSON.parse(await fetchText("chapters/chapters.json"));
    home = { file: "home.md", path: "chapters/home.md", slug: "", title: meta.homeLabel || "Preface" };

    const items = entries.map(entry => {
      if (entry && typeof entry === "object" && entry.separator) return { separator: entry.separator };
      const file = typeof entry === "string" ? entry : entry.file;
      return {
        file,
        path: "chapters/" + file,
        slug: file.replace(/\.md$/, ""),
        title: (typeof entry === "object" && entry.title) || null
      };
    });

    await Promise.all(items.filter(i => i.file && !i.title).map(async item => {
      try {
        const md = await getText(item.path);
        const m = md.match(/^#\s+(.+?)\s*#*\s*$/m);
        item.title = m ? m[1] : titleFromFile(item.file);
      } catch (_) {
        item.title = titleFromFile(item.file);
      }
    }));

    tocEntries = items;
    chapters = items.filter(i => i.file);
  }

  function renderTOC() {
    const toc = $("#toc");
    const collapseKey = "bookengine-toc-collapsed:" + BOOK_KEY;
    let collapsed = [];
    try { collapsed = JSON.parse(store.get(collapseKey)) || []; } catch (_) { /* malformed */ }

    const link = item => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.className = "toc-link";
      a.href = hrefFor(item);
      a.dataset.slug = item.slug;
      a.textContent = item.title;
      li.appendChild(a);
      return li;
    };

    toc.textContent = "";
    toc.appendChild(link(home));
    let list = toc;

    for (const entry of tocEntries) {
      if (!entry.separator) { list.appendChild(link(entry)); continue; }

      const label = entry.separator;
      const group = document.createElement("li");
      group.className = "toc-group";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toc-group-toggle";
      btn.innerHTML = '<span class="toc-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>';
      const span = document.createElement("span");
      span.textContent = label;
      btn.appendChild(span);
      const ul = document.createElement("ul");
      ul.className = "toc-group-list";

      const isCollapsed = collapsed.includes(label);
      group.classList.toggle("collapsed", isCollapsed);
      btn.setAttribute("aria-expanded", String(!isCollapsed));
      btn.addEventListener("click", () => {
        const now = group.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", String(!now));
        collapsed = now ? [...new Set([...collapsed, label])] : collapsed.filter(l => l !== label);
        store.set(collapseKey, JSON.stringify(collapsed));
      });

      group.append(btn, ul);
      toc.appendChild(group);
      list = ul;
    }
  }

  function setActive(slug) {
    let active = null;
    $$("#toc a.toc-link").forEach(a => {
      const on = a.dataset.slug === slug;
      a.classList.toggle("active", on);
      if (on) { a.setAttribute("aria-current", "page"); active = a; }
      else a.removeAttribute("aria-current");
    });
    if (!active) return;
    // Open the Part holding the current chapter (without changing the saved state)
    const group = active.closest(".toc-group.collapsed");
    if (group) {
      group.classList.remove("collapsed");
      $(".toc-group-toggle", group).setAttribute("aria-expanded", "true");
    }
    active.scrollIntoView({ block: "nearest" });
  }

  // ── Rendering ──────────────────────────────────────────────
  function navBar(position, idx) {
    // idx: -1 = home, 0..n-1 = chapters
    const prev = idx > 0 ? chapters[idx - 1] : idx === 0 ? home : null;
    const next = idx + 1 < chapters.length ? chapters[idx + 1] : null;
    const btn = (item, dir, fallback) => {
      const arrow = `<span class="nav-arrow" aria-hidden="true">${dir === "prev" ? "&#8592;" : "&#8594;"}</span>`;
      const label = `<span class="nav-label">${esc(item ? item.title : fallback)}</span>`;
      const inner = dir === "prev" ? arrow + label : label + arrow;
      return item
        ? `<a class="nav-btn nav-btn--${dir}" href="${hrefFor(item)}" rel="${dir}">${inner}</a>`
        : `<span class="nav-btn nav-btn--${dir} is-disabled" aria-hidden="true">${inner}</span>`;
    };
    return `<nav class="chapter-nav chapter-nav--${position}" aria-label="Chapter navigation">
      ${btn(prev, "prev", "Previous")}${btn(next, "next", "Next")}</nav>`;
  }

  function postProcess(body, item) {
    // Stable ids + permalinks on headings, so sections can be linked
    const used = new Set();
    $$("h1, h2, h3, h4", body).forEach(h => {
      let id = h.id || slugify(h.textContent);
      let n = 2, base = id;
      while (used.has(id)) id = base + "-" + n++;
      used.add(id);
      h.id = id;
      if (h.tagName !== "H1") {
        const a = document.createElement("a");
        a.className = "heading-anchor";
        a.href = hrefFor(item, id);
        a.setAttribute("aria-label", "Link to this section");
        a.textContent = "#";
        h.appendChild(a);
      }
    });

    // Links between chapters: [see](03-md5.md) or [see](03-md5.md#some-heading)
    const known = new Set(chapters.map(c => c.slug).concat("home"));
    $$("a[href]", body).forEach(a => {
      const href = a.getAttribute("href");
      const m = href.match(/^(?:\.\/)?(?:chapters\/)?([^/:#?]+)\.md(?:#(.+))?$/);
      if (m && known.has(m[1])) {
        const target = m[1] === "home" ? home : chapters.find(c => c.slug === m[1]);
        a.setAttribute("href", hrefFor(target, m[2]));
      } else if (/^https?:\/\//.test(href) && new URL(href).origin !== location.origin) {
        a.target = "_blank";
        a.rel = "noopener";
      }
    });

    // Syntax highlighting + copy buttons on code blocks
    $$("pre code", body).forEach(code => {
      if (window.hljs) {
        try { hljs.highlightElement(code); } catch (e) { console.warn(e); }
      }
      if (meta.codeCopy === false) return;
      const pre = code.parentElement;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "code-copy";
      b.textContent = "Copy";
      b.setAttribute("aria-label", "Copy code");
      b.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          b.textContent = "Copied";
        } catch (_) { b.textContent = "Failed"; }
        setTimeout(() => (b.textContent = "Copy"), 1200);
      });
      pre.appendChild(b);
    });
  }

  function scrollToSection(section) {
    const el = section && document.getElementById(section);
    if (el) el.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  function parseHash() {
    const h = location.hash;
    if (!h.startsWith("#/")) return { slug: "", section: "" };
    const [slug = "", section = ""] = h.slice(2).split("/").map(s => {
      try { return decodeURIComponent(s); } catch (_) { return s; }
    });
    return { slug, section };
  }

  let renderSeq = 0;
  let renderedSlug = null;

  async function route() {
    const { slug, section } = parseHash();
    if (slug === renderedSlug) { scrollToSection(section); return; }

    const idx = slug ? chapters.findIndex(c => c.slug === slug) : -1;
    const content = $("#content");
    const seq = ++renderSeq; // a newer navigation makes this one stale

    if (slug && idx < 0) {
      renderedSlug = slug;
      setActive(null);
      content.innerHTML = `<article class="chapter-body"><h1>Page not found</h1>
        <p>There is no chapter called <code>${esc(slug)}</code>. <a href="#/">Go to the start of the book</a>.</p></article>`;
      return;
    }

    const item = idx < 0 ? home : chapters[idx];
    setActive(item.slug);

    let md;
    try { md = await getText(item.path); }
    catch (err) {
      if (seq !== renderSeq) return;
      renderedSlug = null;
      content.innerHTML = `<article class="chapter-body"><p class="kmb-status">Could not load this chapter (${esc(err.message)}).</p></article>`;
      return;
    }
    if (seq !== renderSeq) return;

    content.innerHTML = navBar("top", idx) +
      `<article class="chapter-body">${marked.parse(md)}</article>` +
      navBar("bottom", idx);
    renderedSlug = slug;

    const body = $(".chapter-body", content);
    postProcess(body, item);
    document.title = idx < 0 ? meta.title : item.title + " · " + meta.title;

    for (const h of hooks) {
      if (h.file !== "*" && h.file !== item.file) continue;
      try { h.fn({ file: item.file, el: body, book: meta }); }
      catch (e) { console.error("bookengine: chapter hook failed for", item.file, e); }
    }

    if (meta.math && window.MathJax && MathJax.typesetPromise) {
      if (MathJax.typesetClear) MathJax.typesetClear();
      MathJax.typesetPromise([body]).catch(e => console.warn("MathJax:", e));
    }

    content.focus({ preventScroll: true });
    scrollToSection(section);
  }

  // In-page links like [x](#some-heading) become #/<chapter>/<heading>,
  // so they scroll instead of being treated as a route to the Preface.
  function interceptInPageLinks() {
    document.addEventListener("click", e => {
      const a = e.target.closest("#content a[href^='#']");
      if (!a) return;
      const href = a.getAttribute("href");
      if (href.startsWith("#/") || href === "#") return;
      e.preventDefault();
      const id = decodeURIComponent(href.slice(1));
      history.pushState(null, "", "#/" + encodeURIComponent(renderedSlug || "") + "/" + encodeURIComponent(id));
      scrollToSection(id);
    });
  }

  // ← / → turn pages, except while typing or with a modifier held
  function initKeyboard() {
    document.addEventListener("keydown", e => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const t = e.target;
      if (t.closest && t.closest("input, textarea, select, [contenteditable], pre")) return;
      const a = $(`#content .chapter-nav--top a.nav-btn--${e.key === "ArrowLeft" ? "prev" : "next"}`);
      if (a) { e.preventDefault(); location.hash = a.getAttribute("href"); }
    });
  }

  function fatal(message) {
    document.body.innerHTML = `<p style="font-family:sans-serif;padding:2rem">${esc(message)}</p>`;
  }

  // ── Boot ───────────────────────────────────────────────────
  async function start() {
    // Engine CSS + markdown base are awaited so the shell never flashes unstyled
    const cssReady = Promise.all([
      loadStyle(LIBS.markdownCss),
      loadStyle(ENGINE_BASE + "bookengine.css")
    ]);
    loadStyle(LIBS.hljsLight, "hljs-light-theme");
    loadStyle(LIBS.hljsDark, "hljs-dark-theme").then(() => setTheme(currentTheme(), false));

    const libsReady = Promise.all([loadScript(LIBS.marked), loadScript(LIBS.hljs)]);

    try { meta = JSON.parse(await fetchText("book.json")); }
    catch (e) { await domReady; fatal("Could not load book.json: " + e.message); return; }
    setHeadMeta();
    applyTheme();

    // Webfonts: the default pair, a book's own Google Fonts URL, or none (false)
    if (meta.fonts !== false) loadStyle(typeof meta.fonts === "string" ? meta.fonts : LIBS.fonts);

    // Optional extras declared by the book
    (meta.styles || []).forEach(s => loadStyle(bookUrl(s)));

    if (meta.math) {
      window.MathJax = {
        tex: {
          inlineMath: [["$", "$"], ["\\(", "\\)"]],
          displayMath: [["$$", "$$"], ["\\[", "\\]"]]
        },
        svg: { fontCache: "global" }
      };
      loadScript(LIBS.mathjax).catch(e => console.error(e));
    }

    const langsReady = libsReady.then(() => Promise.all(
      (meta.highlightLanguages || []).map(l =>
        loadScript(LIBS.hljsLang(l)).catch(e => console.warn(e.message)))));

    // Plugin scripts load in order: later ones may depend on earlier ones
    const pluginsReady = (async () => {
      for (const s of meta.scripts || []) {
        try { await loadScript(bookUrl(s)); }
        catch (e) { console.error("bookengine:", e.message); }
      }
    })();

    const listReady = loadChapterList();
    const logoReady = logoHTML();

    await Promise.all([domReady, cssReady]);
    buildShell(await logoReady);

    try { await listReady; }
    catch (e) {
      $("#content").innerHTML = `<p class="kmb-status">Could not load chapters/chapters.json (${esc(e.message)}).</p>`;
      return;
    }
    renderTOC();

    try { await libsReady; }
    catch (e) {
      $("#content").innerHTML = `<p class="kmb-status">Could not load the Markdown renderer. Check your connection and reload. (${esc(e.message)})</p>`;
      return;
    }
    await Promise.all([langsReady, pluginsReady]);

    interceptInPageLinks();
    initKeyboard();
    window.addEventListener("hashchange", route);
    route();
  }

  start();
})();
