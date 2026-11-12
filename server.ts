import { watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
// GitHub's emoji shortcodes (":tada:" -> 🎉), generated from the gemoji database.
import emojiMap from "./emojis.json";

const EMOJIS: Record<string, string> = emojiMap;

const MD_OPTIONS = { autolinks: true, headings: { ids: true } };

// Live reload is on by default; start with LIVE_RELOAD=0 to turn it off.
const LIVE_RELOAD = process.env.LIVE_RELOAD !== "0";

const arg = process.argv[2];
if (!arg || arg === "-h" || arg === "--help") {
  console.error("Usage: bun run server.ts <file.md | folder>   (PORT=3000 by default)");
  process.exit(arg ? 0 : 1);
}

/** "file", "dir", or null if the path doesn't exist. */
async function kindOf(path: string): Promise<"file" | "dir" | null> {
  try {
    return (await stat(path)).isDirectory() ? "dir" : "file";
  } catch {
    return null;
  }
}

const FILE = resolve(arg);
const FILE_KIND = await kindOf(FILE);
if (!FILE_KIND) {
  console.error(`Not found: ${FILE}`);
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3000);

const CSS = `
  /* Light or dark follows the system unless the page's toggle set data-theme on <html>. */
  :root { color-scheme: light dark; }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] { color-scheme: dark; }
  body { background: Canvas; color: CanvasText; }
  body { max-width: 760px; margin: 2rem auto; padding: 0 1rem;
         font: 16px/1.6 system-ui, sans-serif; }
  pre { padding: 1rem; overflow-x: auto; background: #8881; border-radius: 6px; }
  code { background: #8881; padding: 0.1em 0.3em; border-radius: 4px; }
  pre code, pre code.hljs { background: none; padding: 0; }
  blockquote { margin-left: 0; padding-left: 1rem; border-left: 4px solid #8885; color: #888; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #8885; padding: 0.4rem 0.8rem; }
  img { max-width: 100%; }
  a { color: #3b82f6; }
  details { border: 1px solid #8885; border-radius: 6px; padding: 0.5rem 1rem; margin: 1rem 0; }
  summary { cursor: pointer; font-weight: 600; }
  .math.display { display: block; text-align: center; margin: 1em 0; overflow-x: auto; }

  /* Footnotes */
  .footnotes { margin-top: 2.5rem; padding-top: 0.5rem; border-top: 1px solid #8885;
               font-size: 0.9em; }
  .footnotes ol { padding-left: 1.5rem; }
  .footnotes p { margin: 0.3rem 0; }
  .fn-back { text-decoration: none; margin-left: 0.2em; }
  .fnref a { text-decoration: none; padding: 0 0.1em; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden;
             clip: rect(0 0 0 0); white-space: nowrap; }
  li:target, sup a:target { background: #ffd33d44; border-radius: 3px; }
  /* Briefly marks the element that changed after a live reload. */
  @keyframes md-flash { from { background-color: #ffd33d88; } to { background-color: transparent; } }
  .md-flash { animation: md-flash 2.5s ease-out; }

  /* Folder listings */
  .listing { list-style: none; padding: 0; }
  .listing li { padding: 0.3rem 0; border-bottom: 1px solid #8883; }
  .listing .doc-title { color: #888; margin-left: 0.5rem; }
  .listing .empty { color: #888; }

  /* GitHub-style alerts: > [!NOTE] */
  :root { --a-note: #0969da; --a-tip: #1a7f37; --a-important: #8250df;
          --a-warning: #9a6700; --a-caution: #cf222e; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) { --a-note: #4493f8; --a-tip: #3fb950; --a-important: #ab7df8;
            --a-warning: #d29922; --a-caution: #f85149; }
  }
  :root[data-theme="dark"] { --a-note: #4493f8; --a-tip: #3fb950; --a-important: #ab7df8;
          --a-warning: #d29922; --a-caution: #f85149; }

  /* Light/dark toggle. Its icon comes from CSS so the button's HTML never changes, which
     keeps live reload's comparison of old and new pages from seeing a difference in it. */
  .theme-toggle, .browse-toggle, .edit-toggle, .back-toggle {
                  position: fixed; top: 0.6rem; right: 0.6rem; width: 2.2rem; height: 2.2rem;
                  border: 1px solid #8885; border-radius: 50%; background: Canvas; cursor: pointer;
                  font-size: 1.1rem; line-height: 1; padding: 0; opacity: 0.6; }
  .theme-toggle:hover, .theme-toggle:focus-visible,
  .browse-toggle:hover, .browse-toggle:focus-visible,
  .edit-toggle:hover, .edit-toggle:focus-visible,
  .back-toggle:hover, .back-toggle:focus-visible { opacity: 1; }
  .browse-toggle { right: 3.2rem; }
  .edit-toggle { right: 5.8rem; }
  /* Only there while there is a place to go back to (see PLACE_HEAD). */
  .back-toggle { right: 8.4rem; display: none; }
  :root[data-back] .back-toggle { display: block; }
  .back-toggle::before { content: "↩️"; }
  .edit-toggle::before { content: "✏️"; }
  :root[data-edit] .edit-toggle { opacity: 1; border-color: var(--a-note); box-shadow: 0 0 0 2px var(--a-note); }
  .browse-toggle::before { content: "📂"; }
  .theme-toggle::before { content: "🌙"; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .theme-toggle::before { content: "☀️"; }
  }
  :root[data-theme="dark"] .theme-toggle::before { content: "☀️"; }
  @media print { .theme-toggle, .browse-toggle, .edit-toggle, .back-toggle, .edit-bar { display: none !important; } }

  /* Editing (the ✏️ button): a bar of buttons, and a dialog for each kind of change. */
  .edit-bar { display: none; position: fixed; top: 0.6rem; left: 0.6rem; z-index: 1;
              max-width: calc(100vw - 9.8rem); box-sizing: border-box; flex-wrap: wrap;
              align-items: center; gap: 0.3rem 0.4rem; padding: 0.3rem 0.5rem; font-size: 0.9rem;
              background: Canvas; border: 1px solid #8885; border-radius: 8px;
              box-shadow: 0 2px 10px #0003; }
  :root[data-edit] .edit-bar { display: flex; }
  :root[data-back] .edit-bar { max-width: calc(100vw - 12.4rem); }
  .edit-bar button, .edit-dialog button { font: inherit; padding: 0.15rem 0.6rem; cursor: pointer; }
  .edit-msg { color: #888; }
  .edit-msg.bad, .edit-error { color: var(--a-caution); }
  :root[data-edit] .math[data-i], :root[data-edit] span.fix[data-was] { cursor: pointer; }
  :root[data-edit] .math[data-i]:hover { outline: 1px dashed var(--a-note); outline-offset: 2px;
                                         border-radius: 3px; }
  :root[data-edit] span.fix[data-was] { text-decoration: underline dotted var(--a-tip); }
  :root[data-edit] details.mine, :root[data-edit] .alert { cursor: pointer; }
  :root[data-edit] details.mine:hover, :root[data-edit] .alert:hover {
    outline: 1px dashed var(--a-note); outline-offset: 2px; }
  .edit-delete { color: var(--a-caution); }
  .edit-dialog { width: min(42rem, calc(100vw - 2rem)); box-sizing: border-box; padding: 1rem;
                 border: 1px solid #8885; border-radius: 8px; background: Canvas; color: CanvasText; }
  .edit-dialog::backdrop { background: #0006; }
  .edit-dialog h2 { margin: 0 0 0.6rem; font-size: 1.1rem; }
  .edit-dialog textarea, .edit-dialog input[type="text"] {
                 display: block; width: 100%; box-sizing: border-box; font: inherit;
                 padding: 0.3rem 0.5rem; margin: 0.3rem 0 0.6rem; }
  .edit-dialog textarea[name="tex"] { font-family: ui-monospace, monospace; font-size: 0.9rem; }
  .edit-dialog label { display: block; }
  .edit-dialog input[type="checkbox"] { margin-right: 0.4rem; }
  .edit-was { margin: 0 0 0.4rem; color: #888; overflow-wrap: anywhere; }
  .edit-preview { overflow-x: auto; min-height: 2rem; padding: 0.3rem 0; }
  .edit-error { margin: 0.4rem 0; overflow-wrap: anywhere; }
  .edit-error:empty { display: none; }
  .edit-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.8rem; }
  .edit-gap { flex: 1; }
  /* Your own notes (<details class="mine">) stand out from the book's text. */
  details.mine { border-color: var(--a-note); }
  details.mine > summary { color: var(--a-note); }

  /* Browse and search dialog */
  .browse { width: min(40rem, calc(100vw - 2rem)); max-height: min(40rem, calc(100vh - 2rem));
            padding: 0; border: 1px solid #8885; border-radius: 8px;
            background: Canvas; color: CanvasText; }
  .browse[open] { display: flex; flex-direction: column; }
  .browse::backdrop { background: #0006; }
  .browse-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1rem;
                 border-bottom: 1px solid #8883; }
  .browse-where { flex: 1; margin: 0; font-size: 1.05rem; overflow-wrap: anywhere; }
  .browse-close { border: none; background: none; color: inherit; font-size: 1.1rem;
                  cursor: pointer; padding: 0.2rem 0.4rem; }
  .browse-search { display: flex; gap: 0.5rem; padding: 0.6rem 1rem 0; }
  .browse-search input { flex: 1; min-width: 0; font: inherit; padding: 0.3rem 0.5rem; }
  .browse-search button { font: inherit; padding: 0.3rem 0.8rem; cursor: pointer; }
  .browse-status { margin: 0.6rem 1rem 0; color: #888; }
  .browse-status:empty { display: none; }
  .browse .listing { margin: 0.4rem 0 0; padding: 0 1rem 1rem; overflow-y: auto; }
  .browse .count { margin-left: 0.5rem; font-variant-numeric: tabular-nums; }
  .browse .back { font-style: italic; }
  /* Find bar, opened on the page a search result leads to. */
  .find-bar { position: fixed; bottom: 0.8rem; left: 50%; transform: translateX(-50%);
              display: flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.5rem;
              width: max-content; max-width: calc(100vw - 2rem); box-sizing: border-box;
              background: Canvas; border: 1px solid #8885; border-radius: 8px;
              box-shadow: 0 2px 10px #0003; }
  .find-bar input { width: 12rem; min-width: 0; flex: 1 1 auto; font: inherit; padding: 0.2rem 0.4rem; }
  .find-bar .find-count { color: #888; white-space: nowrap; font-variant-numeric: tabular-nums;
                          min-width: 4.5em; text-align: center; }
  .find-bar button { border: none; background: none; color: inherit; cursor: pointer;
                     font-size: 1rem; padding: 0.2rem 0.4rem; border-radius: 4px; }
  .find-bar button:hover { background: #8883; }
  @media print { .find-bar { display: none; } }
  ::highlight(md-find) { background-color: #ffd33d88; }
  ::highlight(md-find-current) { background-color: #ff9632; color: #000; }
  .alert { border-left: 4px solid var(--c); padding: 0.1rem 1rem; margin: 1rem 0; }
  .alert > :last-child { margin-bottom: 0.6rem; }
  .alert-note { --c: var(--a-note); }
  .alert-tip { --c: var(--a-tip); }
  .alert-important { --c: var(--a-important); }
  .alert-warning { --c: var(--a-warning); }
  .alert-caution { --c: var(--a-caution); }
  .alert-title { display: flex; align-items: center; gap: 0.5rem; margin: 0.6rem 0 0.4rem;
                 color: var(--c); font-weight: 600; }
  .alert-title svg { fill: currentColor; flex: none; }
`;

// KaTeX typesets math in the browser; only loaded for pages that contain math.
// Only elements the server marked with class "math" are rendered. We deliberately do NOT
// use KaTeX's auto-render, which would re-scan the page and treat text like "$5 and $10" as math.
//
// The CDN versions are pinned exactly: jsDelivr lets browsers cache a pinned file for a year,
// but a version range like "katex@0.16" for only a week, after which it is downloaded again.
const KATEX = "https://cdn.jsdelivr.net/npm/katex@0.16.47/dist";
const KATEX_HEAD = `
  <link rel="stylesheet" href="${KATEX}/katex.min.css">
  <script defer src="${KATEX}/katex.min.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", () => {
      if (!window.katex) return; // CDN unreachable: the TeX source stays visible
      for (const el of document.querySelectorAll(".math")) {
        const display = el.classList.contains("display");
        const src = el.textContent;
        let tex = src.slice(Number(el.dataset.open), src.length - Number(el.dataset.close)).trim();
        // An equation's number written behind it as text (pdf2md does: GitHub breaks an
        // equation with a \\tag into a column of symbols) goes to the right margin here.
        if (display) tex = tex.replace(/\\\\qquad \\\\text\\{\\(([^{}]*)\\)\\}$/, "\\\\tag{$1}");
        try {
          katex.render(tex, el, { displayMode: display, throwOnError: false });
        } catch (e) {
          console.error(e);
        }
      }
    });
  </script>`;

// highlight.js colors fenced code that declares a language (```ts, ```python, ...).
// Blocks without a language are left alone rather than guessed at. Theme follows light/dark mode.
const HLJS = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.12.0/build";
const HLJS_HEAD = `
  <link rel="stylesheet" href="${HLJS}/styles/github.min.css" media="(prefers-color-scheme: light)" data-theme-for="light">
  <link rel="stylesheet" href="${HLJS}/styles/github-dark.min.css" media="(prefers-color-scheme: dark)" data-theme-for="dark">
  <script defer src="${HLJS}/highlight.min.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", () => {
      if (!window.hljs) return; // CDN unreachable: code stays plain
      for (const el of document.querySelectorAll('pre code[class*="language-"]')) {
        hljs.highlightElement(el);
      }
    });
  </script>`;

// Live reload: the page listens on a Server-Sent Events stream and reloads when told to.
// The scroll position is kept across the reload, and if the connection drops and comes back
// (the server was restarted) the page reloads once to pick up the new version. Only one tab
// at a time holds the stream open and relays it to the others (see listen() below).
//
// It also finds where you just edited. Bun's parser keeps no source positions, so instead of
// mapping source lines to elements the page compares the old and new *rendered* HTML: it
// snapshots the page as served, fetches the new version when told to reload, and walks both
// trees to the first element that differs (descending into lists, tables, quotes, alerts, etc.
// so a one-line edit in a long list points at that item, not the whole list). After the reload
// that element is scrolled into view if it is off-screen, and flashed briefly.
const liveHead = (self: string, isDir = false) => `
  <script>
    (() => {
      const SELF = ${JSON.stringify(self).replace(/</g, "\\u003c")};
      const IS_DIR = ${isDir};
      const SCROLL = "md-live-scroll", TARGET = "md-live-target";
      const CONTAINERS = new Set(["UL", "OL", "TABLE", "THEAD", "TBODY", "BLOCKQUOTE", "DETAILS", "DIV", "SECTION"]);

      // The browser restores scroll position on its own after a reload, and does it after our
      // load handler, undoing any jump to the edit. Take over so there is one source of truth.
      try { history.scrollRestoration = "manual"; } catch {}

      // Snapshot before KaTeX / highlight.js touch the DOM. This script is listed first in the
      // head, so its DOMContentLoaded listener runs before theirs.
      let pristine = null;
      document.addEventListener("DOMContentLoaded", () => { pristine = document.body.cloneNode(true); });

      // Child-index path to the first element that differs between two trees, or null if none.
      function firstDiff(a, b) {
        const path = [];
        for (;;) {
          const ca = a.children, cb = b.children;
          let i = 0;
          while (i < ca.length && i < cb.length && ca[i].outerHTML === cb[i].outerHTML) i++;
          if (i === ca.length && i === cb.length) return path.length ? path : null;
          if (cb.length === 0) return path;
          if (i >= cb.length) { path.push(cb.length - 1); return path; } // content removed at the end
          path.push(i);
          if (ca[i] && ca[i].tagName === cb[i].tagName && CONTAINERS.has(cb[i].tagName)) {
            a = ca[i]; b = cb[i];
          } else {
            return path;
          }
        }
      }

      function resolve(path) {
        let el = document.body;
        for (const i of path) { el = el && el.children[i]; }
        return el || null;
      }

      let y = null, target = null;
      try {
        y = sessionStorage.getItem(SCROLL);
        target = JSON.parse(sessionStorage.getItem(TARGET) || "null");
        sessionStorage.removeItem(SCROLL);
        sessionStorage.removeItem(TARGET);
      } catch {}
      // A link to "#id" (an index entry, a footnote, a page marker): scroll the target into
      // view and flash it, so you see where you landed. Done again on load because KaTeX
      // changes the page height after the browser's own jump to the hash. An empty anchor
      // (<a id="x"></a>) shows nothing, so its parent (heading, paragraph) flashes instead.
      function flashHash() {
        let id = location.hash.slice(1);
        try { id = decodeURIComponent(id); } catch {}
        let el = id && document.getElementById(id);
        if (!el) return;
        if (!el.textContent.trim() && el.parentElement) el = el.parentElement;
        if (el.tagName === "DETAILS") el.open = true; // a ✎ marker leads to a note: show it
        el.scrollIntoView({ block: "center" });
        el.classList.remove("md-flash");
        void el.offsetWidth; // restart the animation when the same target is flashed again
        el.classList.add("md-flash");
      }
      addEventListener("hashchange", flashHash);
      // Clicking a link to the hash already in the address bar fires no hashchange.
      document.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a[href*='#']");
        if (a && a.href === location.href) setTimeout(flashHash);
      });

      addEventListener("load", () => {
        // a live reload restores its own position; otherwise honour the link's #target
        if (y === null && target === null && location.hash) flashHash();
        if (y !== null) scrollTo(0, Number(y));
        const el = target && resolve(target);
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) {
          el.scrollIntoView({ block: r.height > innerHeight * 0.7 ? "start" : "center" });
        }
        el.classList.add("md-flash");
      });

      // Reload only for this page's own file, or for a file it embeds (an image).
      // Other tabs may be showing other files; their changes don't concern this page.
      async function onChange(changed) {
        const uses = (el) => {
          try { return decodeURIComponent(new URL(el.src || el.href).pathname) === changed; }
          catch { return false; }
        };
        // A folder listing cares about anything directly inside the folder.
        const inside = IS_DIR && changed.slice(0, changed.lastIndexOf("/")) === SELF;
        if (!inside && changed !== SELF && ![...document.querySelectorAll("[src], link[href]")].some(uses)) return;
        try {
          sessionStorage.setItem(SCROLL, String(scrollY));
          const res = await fetch(location.pathname, { cache: "no-store" });
          if (res.ok && pristine) {
            const next = new DOMParser().parseFromString(await res.text(), "text/html");
            const path = firstDiff(pristine, next.body);
            // Most edits in a folder don't change its listing; only reload when it did.
            if (IS_DIR && !path) { sessionStorage.removeItem(SCROLL); return; }
            if (path) sessionStorage.setItem(TARGET, JSON.stringify(path));
          }
        } catch {}
        location.reload();
      }

      // The server was restarted: reload to pick up the new version.
      function onRestart() {
        try { sessionStorage.setItem(SCROLL, String(scrollY)); } catch {}
        location.reload();
      }

      // Browsers allow only 6 connections to one server, and each event stream holds one open
      // for good, so with 6 tabs open new pages would wait forever. Instead one tab at a time
      // (whichever holds the "md-live" lock) listens to the server and passes what it hears on
      // to the other tabs. When it closes or moves to another page, its lock is released and
      // the next waiting tab takes over.
      function listen(relay) {
        let dropped = false;
        const es = new EventSource("/__reload");
        es.addEventListener("reload", (e) => { relay?.postMessage({ reload: e.data }); onChange(e.data); });
        es.onerror = () => { dropped = true; };
        es.onopen = () => {
          if (!dropped) return;
          relay?.postMessage({ restart: true });
          onRestart();
        };
      }
      if (navigator.locks && window.BroadcastChannel) {
        const relay = new BroadcastChannel("md-live");
        relay.onmessage = ({ data }) => data.restart ? onRestart() : onChange(data.reload);
        // Holding the lock until the page goes away: the promise never resolves.
        navigator.locks.request("md-live", () => { listen(relay); return new Promise(() => {}); });
      } else {
        listen(null);
      }
    })();
  </script>`;

// Remembering the place. Where each file was last being read is kept in localStorage, and the
// file opens there again (unless its address says where to go: a #target or a search result).
// And when you leave the place you were reading, by a link, a search, or a long scroll, the \u21A9\uFE0F
// button appears and takes you back to it; pressing it again returns to where you pressed it.
//
// A place is not a number of pixels, which would be wrong as soon as the window is another
// width: it is the block (child of <body>) at the top of the window and how far through it
// the top is. The pixels are kept as well, for when the file has changed and the block is gone.
//
// Moving more than a window and a half between two pauses counts as leaving, anything less as
// reading on. Once there is a place to go back to, later jumps don't replace it unless you
// stayed where you were for a while (DWELL), so stepping through search results or following
// a few links in a row still leads back to where you were reading. Scrolling back there
// yourself removes the button.
//
// This script must come before liveHead's in <head>: it looks at what a live reload left in
// sessionStorage before that script removes it, and its load handler must run first.
// As in BROWSE_HEAD, the script must not use "$" followed by "{", or backticks.
const PLACE_HEAD = String.raw`
  <script>
    (() => {
      const KEY = "md-place:" + location.pathname, root = document.documentElement;
      const UI = "script, style, button, dialog, .edit-bar, .find-bar";
      const DWELL = 30000;
      // Otherwise the browser's own idea of where to scroll to arrives after ours.
      try { history.scrollRestoration = "manual"; } catch {}

      const ok = (p) => p && [p.i, p.f, p.y].every(Number.isFinite) ? { i: p.i, f: p.f, y: p.y } : null;
      let here = null, back = null;
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "null");
        here = ok(saved && saved.here);
        back = ok(saved && saved.back);
      } catch {}
      // Something else decides where this page opens: a #target, a search result, or a live
      // reload (which keeps its place, or shows the edit). The remembered place is then what
      // the button goes back to, if the page opens far from it.
      let elsewhere = !!location.hash || !!new URLSearchParams(location.search).get("find");
      try { elsewhere = elsewhere || sessionStorage.getItem("md-live-scroll") !== null; } catch {}

      // rest: where you are reading, and since when you have been around there. The place a
      // file was left at has been read for long enough: since 0.
      let rest = here && { pos: here, since: 0 };
      let ready = false, timer;

      const block = (i) => {
        const el = document.body.children[i];
        return el && !el.matches(UI) ? el : null;
      };
      function where() {
        const kids = document.body.children;
        for (let i = 0; i < kids.length; i++) {
          if (kids[i].matches(UI)) continue;
          const r = kids[i].getBoundingClientRect();
          if (r.height > 0 && r.bottom > 0) return { i, f: -r.top / r.height, y: scrollY };
        }
        return { i: -1, f: 0, y: scrollY };
      }
      /** How far down the page has to be scrolled to be at this place. */
      function yOf(pos) {
        const el = block(pos.i);
        const r = el && el.getBoundingClientRect();
        return r && r.height > 0 ? r.top + scrollY + pos.f * r.height : pos.y;
      }

      // Called when scrolling pauses.
      function settle() {
        if (!ready) return;
        const now = Date.now(), p = where();
        if (!rest) {
          rest = { pos: p, since: now };
        } else if (Math.abs(p.y - yOf(rest.pos)) > innerHeight * 1.5) {
          if (!back || now - rest.since >= DWELL) back = rest.pos;
          rest = { pos: p, since: now };
        } else {
          rest.pos = p;
        }
        here = p;
        if (back && Math.abs(p.y - yOf(back)) < innerHeight * 0.75) back = null; // you are back
        root.toggleAttribute("data-back", !!back);
        try { localStorage.setItem(KEY, JSON.stringify({ here, back })); } catch {}
      }

      addEventListener("load", () => {
        if (here && !elsewhere) scrollTo(0, yOf(here));
        // The load handlers after this one may scroll (to a #target, a match, an edit).
        setTimeout(() => { ready = true; settle(); });
      });
      addEventListener("scroll", () => { clearTimeout(timer); timer = setTimeout(settle, 250); }, { passive: true });
      addEventListener("pagehide", () => { clearTimeout(timer); settle(); });

      document.addEventListener("click", (e) => {
        if (!back || !e.target.closest || !e.target.closest(".back-toggle")) return;
        clearTimeout(timer);
        const to = back;
        back = where();
        rest = { pos: to, since: 0 };
        scrollTo(0, yOf(to));
        const el = block(to.i);
        if (el) {
          el.classList.remove("md-flash");
          void el.offsetWidth; // restart the animation
          el.classList.add("md-flash");
        }
        settle();
      });
    })();
  </script>`;

// Light/dark toggle. A choice made with the button is stored in localStorage, which every tab
// on localhost:3000 shares, so it applies to all pages and other open tabs switch at once.
// Switching back to whatever the system uses forgets the choice, so the page follows the
// system again. Runs in <head> so the page never flashes the wrong theme while loading.
const THEME_HEAD = `
  <script>
    (() => {
      const KEY = "md-theme", root = document.documentElement;
      const system = matchMedia("(prefers-color-scheme: dark)");
      const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
      function apply(theme) {
        if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
        // highlight.js themes are picked by their media attribute, not by CSS selectors.
        for (const link of document.querySelectorAll("link[data-theme-for]")) {
          const t = link.dataset.themeFor;
          link.media = theme ? (t === theme ? "all" : "not all") : "(prefers-color-scheme: " + t + ")";
        }
      }
      apply(get());
      document.addEventListener("DOMContentLoaded", () => {
        apply(get()); // the highlight.js links come after this script
        document.querySelector(".theme-toggle")?.addEventListener("click", () => {
          const now = root.dataset.theme || (system.matches ? "dark" : "light");
          const next = now === "dark" ? "light" : "dark";
          const keep = next !== (system.matches ? "dark" : "light");
          try { keep ? localStorage.setItem(KEY, next) : localStorage.removeItem(KEY); } catch {}
          apply(keep ? next : null);
        });
      });
      addEventListener("storage", (e) => { if (e.key === KEY) apply(e.newValue); });
    })();
  </script>`;

// Browse and search. The 📂 button opens a dialog listing the Markdown files and folders in the
// page's folder. Folders open in the dialog; files open in the tab. Search looks through every
// Markdown file in the folder shown and the folders below it, and lists those that match with
// how many times. A result's link carries the search as "?find=", and the page it opens
// shows a find bar for stepping through every match in it.
//
// String.raw keeps the regular expressions' backslashes as written. The script must not use
// "${" or backticks, since it sits inside a template literal.
const BROWSE_HEAD = String.raw`
  <script>
    (() => {
      const pattern = (q) => new RegExp(
        q.trim().split(/\s+/).map((w) => w.replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");

      // ?find= : take it out of the address (so a reload doesn't jump again) and, once the
      // page has finished laying out (KaTeX changes its height), open the find bar on it.
      const params = new URLSearchParams(location.search);
      const find = params.get("find");
      if (find && find.trim()) {
        params.delete("find");
        const rest = params.toString();
        history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
        addEventListener("load", () => findBar(find));
      }

      // Every match in the page's visible text. The text is read as one string, with where
      // each text node starts in it, so a match that spans <em> or a link is still found.
      function findAll(q) {
        const nodes = [];
        let text = "";
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => n.parentElement && !n.parentElement.closest(
            "script, style, dialog, button, .find-bar, .edit-bar, .katex-mathml") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
        });
        for (let n; (n = walker.nextNode()); ) { nodes.push([n, text.length]); text += n.data; }
        const locate = (pos, isEnd) => {
          for (let i = nodes.length - 1; i >= 0; i--) {
            const [n, start] = nodes[i];
            if (isEnd ? start < pos : start <= pos && pos < start + n.data.length) return [n, pos - start];
          }
        };
        const ranges = [];
        if (!q.trim()) return ranges;
        const re = new RegExp(pattern(q).source, "gi");
        for (const m of text.matchAll(re)) {
          const range = document.createRange();
          range.setStart(...locate(m.index, false));
          range.setEnd(...locate(m.index + m[0].length, true));
          ranges.push(range);
        }
        return ranges;
      }

      // A find bar like the browser's own (which a page can't open): every match highlighted,
      // the current one brighter, its paragraph flashed and scrolled to the middle of the
      // window. Enter / Shift+Enter or the arrows move between matches; Esc or ✕ closes it.
      function findBar(q) {
        const bar = document.createElement("form");
        bar.className = "find-bar";
        bar.setAttribute("role", "search");
        bar.innerHTML =
          '<input type="search" aria-label="Find in page">' +
          '<span class="find-count" aria-live="polite"></span>' +
          '<button type="button" class="find-prev" aria-label="Previous match" title="Previous (Shift+Enter)">▲</button>' +
          '<button type="button" class="find-next" aria-label="Next match" title="Next (Enter)">▼</button>' +
          '<button type="button" class="find-close" aria-label="Close" title="Close (Esc)">✕</button>';
        document.body.append(bar);
        const input = bar.querySelector("input");
        const count = bar.querySelector(".find-count");
        input.value = q;
        const canHighlight = !!(window.Highlight && CSS.highlights);
        let ranges = [], at = -1;

        function show(i) {
          if (!ranges.length) return;
          at = (i + ranges.length) % ranges.length;
          const range = ranges[at];
          count.textContent = (at + 1) + " of " + ranges.length;
          if (canHighlight) {
            const current = new Highlight(range);
            current.priority = 1;
            CSS.highlights.set("md-find-current", current);
          }
          const first = range.startContainer.parentElement;
          const block = first.closest("p, li, h1, h2, h3, h4, h5, h6, td, th, pre, blockquote, dt, dd, figcaption, summary") || first;
          const r = range.getBoundingClientRect();
          scrollBy(0, r.top - innerHeight / 2 + r.height / 2);
          block.classList.remove("md-flash");
          void block.offsetWidth;
          block.classList.add("md-flash");
        }
        function search() {
          ranges = findAll(input.value);
          at = -1;
          if (canHighlight) {
            CSS.highlights.set("md-find", new Highlight(...ranges));
            CSS.highlights.delete("md-find-current");
          }
          count.textContent = input.value.trim() ? (ranges.length ? "" : "No matches") : "";
          show(0);
        }
        function close() {
          if (canHighlight) { CSS.highlights.delete("md-find"); CSS.highlights.delete("md-find-current"); }
          bar.remove();
        }
        bar.addEventListener("submit", (e) => e.preventDefault());
        input.addEventListener("input", search);
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); show(at + (e.shiftKey ? -1 : 1)); }
        });
        bar.querySelector(".find-prev").addEventListener("click", () => show(at - 1));
        bar.querySelector(".find-next").addEventListener("click", () => show(at + 1));
        bar.querySelector(".find-close").addEventListener("click", close);
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && bar.isConnected && !document.querySelector("dialog[open]")) close();
        });
        search();
      }

      document.addEventListener("DOMContentLoaded", () => {
        const button = document.querySelector(".browse-toggle");
        const dialog = document.querySelector("dialog.browse");
        if (!button || !dialog) return;
        const where = dialog.querySelector(".browse-where");
        const status = dialog.querySelector(".browse-status");
        const list = dialog.querySelector(".listing");
        const form = dialog.querySelector(".browse-search");
        const input = form.elements.q;
        let folder = null; // the folder on show: { name, path, dir }
        let request = 0;   // answers to older requests are ignored

        // A link; a plain click runs onOpen instead of following it, but middle- and
        // ctrl-clicks still open it in a new tab.
        function item(label, href, onOpen, ...extras) {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.href = href;
          a.textContent = label;
          if (onOpen) a.addEventListener("click", (e) => {
            if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            onOpen();
          });
          li.append(a);
          for (const [cls, text] of extras) {
            if (!text) continue;
            const span = document.createElement("span");
            span.className = cls;
            span.textContent = text;
            li.append(span);
          }
          return li;
        }

        async function get(url) {
          const id = ++request;
          const res = await fetch(url, { cache: "no-store" });
          const data = res.ok ? await res.json() : null;
          return id === request ? { data } : null;
        }

        async function show(dir) {
          status.textContent = "Loading…";
          const got = await get("/__browse?dir=" + encodeURIComponent(dir)).catch(() => ({ data: null }));
          if (!got) return;
          const d = got.data;
          if (!d) { status.textContent = "This folder can't be shown."; return; }
          folder = d;
          where.textContent = "📁 " + d.name;
          where.title = d.path;
          const items = [];
          if (d.parent) items.push(item("../", d.parent, () => show(d.parent)));
          for (const f of d.folders) items.push(item(f.name + "/", f.href, () => show(f.href)));
          for (const f of d.files) items.push(item(f.name, f.href, null, ["doc-title", f.title !== f.name && f.title]));
          list.replaceChildren(...items);
          list.scrollTop = 0;
          status.textContent = d.folders.length + d.files.length ? "" : "No Markdown files or folders here.";
        }

        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          const q = input.value.trim();
          if (!folder) return;
          if (!q) return show(folder.dir);
          status.textContent = "Searching…";
          list.replaceChildren();
          const url = "/__search?dir=" + encodeURIComponent(folder.dir) + "&q=" + encodeURIComponent(q);
          const got = await get(url).catch(() => ({ data: null }));
          if (!got) return;
          const d = got.data;
          if (!d) { status.textContent = "The search failed."; return; }
          const matches = d.results.reduce((sum, r) => sum + r.count, 0);
          const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
          status.textContent = d.results.length
            ? plural(matches, "match", "matches") + " in " + plural(d.results.length, "file", "files") + " (of " + d.searched + " searched)"
            : "No matches in " + plural(d.searched, "file", "files") + ".";
          if (d.limited) status.textContent += " Only the first " + d.searched + " files were searched.";
          const back = item("← Back to " + folder.name, folder.dir, () => show(folder.dir));
          back.className = "back";
          list.replaceChildren(back, ...d.results.map((r) =>
            item(r.name, r.href + "?find=" + encodeURIComponent(q), null,
              ["count", "(" + r.count + ")"], ["doc-title", r.title])));
          list.scrollTop = 0;
        });

        button.addEventListener("click", () => {
          if (!folder) show(button.dataset.dir);
          dialog.showModal();
        });
        dialog.querySelector(".browse-close").addEventListener("click", () => dialog.close());
        // A click on the dimmed page around the dialog closes it.
        dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
      });
    })();
  </script>`;

const browseDialog = (dir: string) => `<button class="browse-toggle" type="button" data-dir="${escapeHtml(dir)}" aria-label="Browse and search Markdown files" title="Browse and search Markdown files"></button>
<dialog class="browse" aria-label="Browse Markdown files">
  <div class="browse-head"><h2 class="browse-where">📁</h2><button class="browse-close" type="button" aria-label="Close">✕</button></div>
  <form class="browse-search" role="search"><input type="search" name="q" placeholder="Search this folder and below" aria-label="Search"><button type="submit">Search</button></form>
  <p class="browse-status"></p>
  <ul class="listing"></ul>
</dialog>
`;

// Editing. The ✏️ button turns it on for the tab (kept across reloads and links). Then:
//  - clicking an equation opens its TeX, with a preview, to correct it in the file;
//  - "Fix text" marks the selected words as a fix: <span class="fix" data-was="…">…</span>;
//  - "Note" and "Warning" add <details class="mine"> or > [!WARNING] after the paragraph of
//    the selected words (or after an equation, from its dialog), with an optional ✎ marker;
//  - clicking one of those notes, or any alert box, opens its Markdown to change or delete it.
// These are the marks pdf2md keeps when it converts a book again. The page only says what to
// change and where; the server (saveEdit below) finds the place in the file and writes it,
// and live reload then shows the result.
//
// Where the selected words are is told by counting: they are the nth of count places those
// words appear in the page's text. The server counts the same words in the file and only
// goes ahead if it finds as many, so a place it can't be sure of is refused, never guessed.
//
// As in BROWSE_HEAD, the script must not use "$" followed by "{", or backticks.
const EDIT_HEAD = String.raw`
  <script>
    (() => {
      const KEY = "md-edit", MARK = "md-edit-marker", root = document.documentElement;
      try { if (sessionStorage.getItem(KEY)) root.setAttribute("data-edit", ""); } catch {}
      const editing = () => root.hasAttribute("data-edit");
      // Text the file doesn't have as such: formulas, footnotes (moved to the end), our own controls.
      const SKIP = "script, style, dialog, button, .find-bar, .edit-bar, .math, .footnotes, .fnref, .alert-title";
      const HINT = "Select words, or click an equation or a note.";
      const NOT_FOUND = "These words aren't in the page's text as selected. Select a few plain words.";
      const texOf = new WeakMap(); // each formula's TeX, before KaTeX replaces it

      // The selection: { text, nth, count }, see above.
      function place(range) {
        if (!range) throw new Error("Select some words first.");
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: (n) => n.parentElement && !n.parentElement.closest(SKIP) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
        });
        let text = "", start = -1, end = -1;
        for (let n; (n = walker.nextNode()); ) {
          if (start < 0) {
            if (n === range.startContainer) start = text.length + range.startOffset;
            else if (range.comparePoint(n, 0) >= 0) start = text.length;
          }
          if (n === range.endContainer) end = text.length + range.endOffset;
          else if (range.comparePoint(n, n.data.length) <= 0) end = text.length + n.data.length;
          text += n.data;
        }
        const raw = start < 0 || end <= start ? "" : text.slice(start, end);
        const words = raw.trim();
        if (!words) throw new Error("Select some words first (not only a formula).");
        const at = start + raw.length - raw.trimStart().length;
        const re = new RegExp(words.split(/\s+/).map((w) => w.replace(/[.*+?^$\{}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
        let nth = -1, count = 0;
        for (const m of text.matchAll(re)) { if (m.index === at) nth = count; count++; }
        if (nth < 0) throw new Error(NOT_FOUND);
        return { text: words, nth, count };
      }

      document.addEventListener("DOMContentLoaded", () => {
        for (const el of document.querySelectorAll(".math[data-i]")) texOf.set(el, el.textContent);
        const toggle = document.querySelector(".edit-toggle");
        const bar = document.querySelector(".edit-bar");
        const dialog = document.querySelector("dialog.edit-dialog");
        if (!toggle || !bar || !dialog) return;
        const msg = bar.querySelector(".edit-msg");
        let msgTimer;
        function say(text, bad) {
          clearTimeout(msgTimer);
          msg.textContent = text;
          msg.classList.toggle("bad", !!bad);
          if (text !== HINT) msgTimer = setTimeout(() => say(HINT), 8000);
        }
        say(HINT);

        toggle.addEventListener("click", () => {
          const on = root.toggleAttribute("data-edit");
          try { on ? sessionStorage.setItem(KEY, "1") : sessionStorage.removeItem(KEY); } catch {}
          say(HINT);
        });

        // Tapping a button on a phone drops the selection first, so the last one is kept
        // for a moment after it goes.
        let kept = null, lostAt = 0;
        document.addEventListener("selectionchange", () => {
          const sel = getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) { kept = sel.getRangeAt(0).cloneRange(); lostAt = 0; }
          else if (kept && !lostAt) lostAt = Date.now();
        });
        function picked() {
          const sel = getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed) return sel.getRangeAt(0);
          return kept && lostAt && Date.now() - lostAt < 1500 ? kept : null;
        }

        async function send(payload) {
          const res = await fetch("/__edit", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(Object.assign({ path: location.pathname }, payload)),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "The change couldn't be saved.");
          return data;
        }

        // The dialog with these fields; save(form) gives what to send (nothing: no change)
        // or throws what is wrong. Ctrl+Enter saves, Esc cancels.
        function ask(title, fields, extra, save) {
          dialog.innerHTML =
            '<form><h2>' + title + '</h2>' + fields + '<p class="edit-error" role="alert"></p>' +
            '<div class="edit-actions">' + extra + '<span class="edit-gap"></span>' +
            '<button type="button" class="edit-cancel">Cancel</button>' +
            '<button type="submit" class="edit-save">Save</button></div></form>';
          const form = dialog.querySelector("form");
          const error = form.querySelector(".edit-error");
          const button = form.querySelector(".edit-save");
          form.querySelector(".edit-cancel").addEventListener("click", () => dialog.close());
          form.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
          });
          form.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (button.disabled) return;
            let payload;
            try { payload = save(form); } catch (err) { error.textContent = err.message; return; }
            if (!payload) { dialog.close(); return; }
            button.disabled = true;
            try {
              await send(payload);
              dialog.close();
              say("Saved.");
              if (toggle.dataset.live !== "1") location.reload(); // live reload does it otherwise
            } catch (err) {
              error.textContent = err.message;
              button.disabled = false;
            }
          });
          dialog.showModal();
          return form;
        }

        function openMath(el) {
          const src = texOf.get(el);
          if (src == null) return;
          const display = el.classList.contains("display");
          const tex = src.slice(Number(el.dataset.open), src.length - Number(el.dataset.close)).trim();
          const where = { math: { i: Number(el.dataset.i), was: src } };
          const form = ask("Correct this equation",
            '<textarea name="tex" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="The equation in TeX"></textarea>' +
            '<div class="edit-preview"></div>',
            '<button type="button" data-then="note">Note after it…</button>' +
            '<button type="button" data-then="warning">Warning after it…</button>',
            (f) => {
              const now = f.elements.tex.value.trim();
              if (!now) throw new Error("The equation can't be empty.");
              return now === tex ? null : { op: "math", where, now };
            });
          const area = form.elements.tex;
          const preview = form.querySelector(".edit-preview");
          const error = form.querySelector(".edit-error");
          area.value = tex;
          area.rows = Math.min(16, Math.max(3, tex.split("\n").length + 1));
          function show() {
            if (!window.katex) return;
            error.textContent = "";
            try {
              katex.render(area.value, preview, { displayMode: display, throwOnError: true });
            } catch (err) {
              error.textContent = err.message;
              try { katex.render(area.value, preview, { displayMode: display, throwOnError: false }); } catch {}
            }
          }
          area.addEventListener("input", show);
          show();
          for (const b of form.querySelectorAll("[data-then]")) {
            b.addEventListener("click", () => { dialog.close(); openNote(b.dataset.then, where, display ? "" : "the formula"); });
          }
        }

        // was: what an earlier fix replaced, when that fix is being changed.
        function openFix(where, text, was) {
          const form = ask("Fix the converted text",
            '<p class="edit-was"></p>' +
            '<textarea name="now" rows="3" aria-label="The words as in the book"></textarea>',
            was == null ? "" : '<button type="button" class="edit-undo">Undo this fix</button>',
            (f) => {
              const now = f.elements.now.value.trim();
              return now === text ? null : { op: "fix", where, now };
            });
          form.querySelector(".edit-was").textContent = "As converted: " + (was == null ? text : was);
          form.elements.now.value = text;
          form.elements.now.select();
          const undo = form.querySelector(".edit-undo");
          if (undo) undo.addEventListener("click", () => { form.elements.now.value = was; form.requestSubmit(); });
        }

        // kind: "note" (collapsible) or "warning" (a box). markAfter: what a ✎ marker would
        // follow ("" if there can't be one).
        function openNote(kind, where, markAfter) {
          const note = kind === "note";
          const form = ask(note ? "Add a note" : "Add a warning",
            (note ? '<label>Title<input type="text" name="title" value="My note"></label>' : "") +
            '<textarea name="body" rows="6" aria-label="Your words (Markdown, with $math$)" placeholder="Your words (Markdown, with $math$)"></textarea>' +
            (note && markAfter ? '<label><input type="checkbox" name="marker">Put a ✎ marker after ' + markAfter + ', linked to the note</label>' : ""),
            "",
            (f) => {
              const body = f.elements.body.value.trim();
              if (!body) throw new Error("Write something first.");
              const marker = !!(f.elements.marker && f.elements.marker.checked);
              if (f.elements.marker) { try { localStorage.setItem(MARK, marker ? "1" : ""); } catch {} }
              return { op: "note", where, kind, body, marker, title: note ? f.elements.title.value.trim() : "" };
            });
          if (form.elements.marker) { try { form.elements.marker.checked = !!localStorage.getItem(MARK); } catch {} }
          form.elements.body.focus();
        }

        // A note of your own or an alert box that is already in the file: change or delete it.
        // The page only has it as HTML, so the server is asked for its Markdown first. Which
        // one it is is told by counting, like the selected words: the nth of count.
        async function openOld(el) {
          const mine = el.matches("details.mine");
          const all = [...document.querySelectorAll(mine ? "details.mine" : ".alert")];
          const note = { kind: mine ? "mine" : "alert", i: all.indexOf(el), count: all.length };
          let got;
          try { got = await send({ op: "peek", where: { note } }); }
          catch (err) { say(err.message, true); return; }
          note.was = got.was;
          const heading = el.querySelector(".alert-title");
          const name = mine || !heading ? "note" : heading.textContent.trim().toLowerCase();
          const form = ask("Change this " + name,
            (mine ? '<label>Title<input type="text" name="title"></label>' : "") +
            '<textarea name="body" rows="8" aria-label="Your words (Markdown, with $math$)"></textarea>',
            '<button type="button" class="edit-delete">Delete</button>',
            (f) => {
              if (f.dataset.remove) return { op: "renote", where: { note }, remove: true };
              const body = f.elements.body.value.trim();
              if (!body) throw new Error("Write something, or use Delete.");
              const title = mine ? f.elements.title.value.trim() : "";
              if (body === got.body && title === got.title) return null;
              return { op: "renote", where: { note }, body, title, sameTitle: title === got.title };
            });
          if (mine) form.elements.title.value = got.title;
          form.elements.body.value = got.body;
          form.elements.body.focus();
          // Deleting takes a second press, since what you wrote is gone for good.
          const del = form.querySelector(".edit-delete");
          del.addEventListener("click", () => {
            if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Really delete this " + name + "?"; return; }
            form.dataset.remove = "1";
            form.requestSubmit();
          });
        }

        // Keep the selection when a button of the bar is pressed.
        bar.addEventListener("mousedown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
        bar.addEventListener("click", (e) => {
          const button = e.target.closest("button[data-do]");
          if (!button) return;
          let where;
          try { where = place(picked()); } catch (err) { say(err.message, true); return; }
          say(HINT);
          if (button.dataset.do === "fix") openFix(where, where.text, null);
          else openNote(button.dataset.do, where, "the selected words");
        });

        // While editing, a click on an equation corrects it, and one on a fix, a note of your
        // own or an alert box changes it.
        document.addEventListener("click", (e) => {
          if (!editing() || e.button || !e.target.closest) return;
          const sel = getSelection();
          if (sel && !sel.isCollapsed) return; // the end of selecting, not a click
          if (e.target.closest("dialog, .edit-bar")) return;
          const math = e.target.closest(".math[data-i]");
          if (math) { e.preventDefault(); openMath(math); return; }
          const fix = e.target.closest("span.fix[data-was]");
          if (!fix) {
            // Links in a note still work, and its title still opens and closes it.
            const note = e.target.closest("details.mine, .alert");
            if (note && !e.target.closest("a, summary")) { e.preventDefault(); openOld(note); }
            return;
          }
          const range = document.createRange();
          range.selectNodeContents(fix);
          try { const where = place(range); openFix(where, where.text, fix.dataset.was); }
          catch (err) { say("This fix can only be changed in the file.", true); }
        });
      });
    })();
  </script>`;

/** The edit button, the bar it shows, and the dialog; checklist: link to check-equations.md. */
const editTools = (checklist: boolean) => `<button class="edit-toggle" type="button" data-live="${LIVE_RELOAD ? 1 : 0}" aria-label="Edit: correct equations and text, add notes" title="Edit: correct equations and text, add notes"></button>
<div class="edit-bar" role="toolbar" aria-label="Editing">
  <button type="button" data-do="fix" title="Correct the selected words where the conversion got them wrong">Fix text</button>
  <button type="button" data-do="note" title="Add a collapsible note of your own after the paragraph of the selected words">Note</button>
  <button type="button" data-do="warning" title="Add a warning box after the paragraph of the selected words">Warning</button>
  ${checklist ? '<a href="check-equations.md" title="The equations most worth comparing with the book">Equations to check</a>' : ""}
  <span class="edit-msg" aria-live="polite"></span>
</div>
<dialog class="edit-dialog" aria-label="Edit"></dialog>
`;

// Its HTML never changes (the page shows it by setting data-back on <html>), so live reload's
// comparison of old and new pages sees no difference in it.
const BACK_BUTTON = `<button class="back-toggle" type="button" aria-label="Back to where you were" title="Back to where you were"></button>
`;

const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
const encoder = new TextEncoder();

function broadcast(message: string) {
  for (const client of clients) {
    try {
      client.enqueue(encoder.encode(message));
    } catch {
      clients.delete(client);
    }
  }
}

// Watch the folder of every file that has been served (the Markdown pages and their images),
// and nothing else, so opening ~/notes.md doesn't watch the whole home directory. Folders
// rather than files: many editors save by writing a temp file and renaming it over the
// original, which a watcher on the file itself would lose track of. Edits are debounced so
// one save triggers one reload, and the changed file's path is sent so each tab can decide
// whether the change concerns it.
const watched = new Set<string>();
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

function watchFolder(dir: string) {
  if (!LIVE_RELOAD || watched.has(dir)) return;
  watched.add(dir);
  try {
    watch(dir, (_event, name) => {
      if (!name || name.startsWith(".") || /(~|\.sw[a-p]|\.tmp)$/.test(name)) return;
      pending.add(join(dir, String(name)));
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const path of pending) broadcast(`event: reload\ndata: ${path}\n\n`);
        pending = new Set();
      }, 100);
    });
  } catch (err) {
    console.error(`Can't watch ${dir}:`, err);
  }
}

const watchFolderOf = (file: string) => watchFolder(dirname(file));

// Keep idle connections alive through proxies and browsers.
if (LIVE_RELOAD) setInterval(() => broadcast(": ping\n\n"), 15_000);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(
  title: string,
  body: string,
  opts: {
    status?: number;
    math?: boolean;
    code?: boolean;
    live?: string;
    dir?: boolean;
    /** Show the browse button, starting in this folder (a URL ending in "/"). */
    browse?: string;
    /** Remember where the page was being read, and show the ↩️ button (see PLACE_HEAD). */
    place?: boolean;
    /** Show the edit button; checklist: the folder has a check-equations.md to link to. */
    edit?: { checklist: boolean };
  } = {},
) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${CSS}</style>${THEME_HEAD}${opts.place ? PLACE_HEAD : ""}${opts.live ? liveHead(opts.live, opts.dir) : ""}${opts.browse ? BROWSE_HEAD : ""}${opts.edit ? EDIT_HEAD : ""}${opts.math ? KATEX_HEAD : ""}${opts.code ? HLJS_HEAD : ""}
</head>
<body>
${body}
${opts.browse ? browseDialog(opts.browse) : ""}${opts.edit ? editTools(opts.edit.checklist) : ""}${opts.place ? BACK_BUTTON : ""}<button class="theme-toggle" type="button" aria-label="Switch between light and dark" title="Switch between light and dark"></button>
</body>
</html>`;
  return new Response(html, {
    status: opts.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Markdown mangles LaTeX (it eats backslashes in `\{` / `\,` / `\\` and turns `*` and `_`
 * into emphasis), so lift math out first, render the Markdown, then put the untouched
 * source back for KaTeX to typeset. Code blocks/spans are skipped so `$` in code is safe.
 *
 * Math is also read in the two forms GitHub leaves untouched (in "$" and "$$" it mangles the
 * LaTeX the same way): a block fenced with ```math, and $`…`$ in a sentence.
 */
const PROTECT = new RegExp(
  [
    "^(```math[ \\t]*\\n[\\s\\S]*?^```)[ \\t]*$", // 1: display math, fenced
    "(\\$`[^`]+`\\$)", // 2: inline math, in backticks
    "^(`{3,}|~{3,})[^\\n]*\\n[\\s\\S]*?^\\3[ \\t]*$", // 3: fenced code  (kept as is)
    "(`+)(?:(?!\\4)[\\s\\S])+?\\4", // 4: inline code (kept as is)
    "\\\\\\$", // escaped \$ (kept as is)
    "(\\$\\$[\\s\\S]+?\\$\\$)", // 5: display math
    "(\\$(?=\\S)(?:\\\\.|[^$\\\\\\n])+?(?<=\\S)\\$(?!\\d))", // 6: inline math
  ].join("|"),
  "gm",
);

/** The formula a match of PROTECT holds, as written in the file (undefined: it is code). */
const mathOf = (groups: (string | undefined)[]) => groups[0] ?? groups[1] ?? groups[4] ?? groups[5];

/** How a formula is written: is it a displayed one, and how long are the marks around it. */
function mathMarks(math: string): { display: boolean; open: number; close: number } {
  if (math.startsWith("```")) return { display: true, open: math.indexOf("\n") + 1, close: 4 };
  if (math.startsWith("$`")) return { display: false, open: 2, close: 2 };
  if (math.startsWith("$$")) return { display: true, open: 2, close: 2 };
  return { display: false, open: 1, close: 1 };
}

function protectMath(src: string) {
  const stash: string[] = [];
  const text = src.replace(PROTECT, (m, ...groups) => {
    const math = mathOf(groups);
    if (!math) return m;
    stash.push(math);
    return `ZZMATH${stash.length - 1}ZZ`;
  });
  return { text, stash };
}

function restoreMath(html: string, stash: string[]) {
  return html.replace(/ZZMATH(\d+)ZZ/g, (_, i) => {
    const math = stash[Number(i)];
    const { display, open, close } = mathMarks(math);
    const cls = display ? "math display" : "math inline";
    // data-i: which formula of the file it is, so the page can ask to correct it;
    // data-open, data-close: how long the marks around the TeX are
    return `<span class="${cls}" data-i="${i}" data-open="${open}" data-close="${close}">${escapeHtml(math)}</span>`;
  });
}

/**
 * Footnotes (Bun's parser has none): `text[^1]` plus `[^1]: note` anywhere in the file.
 * Numbered in order of first reference, rendered as a list at the end with ↩ back-links.
 * References without a definition are left as typed; definitions never referenced are dropped.
 * Code is stashed first so footnote syntax inside code stays literal.
 */
const CODE_SPAN =
  /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$|(`+)(?:(?!\2)[\s\S])+?\2/gm;

const FOOTNOTE_DEF =
  /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?:[ \t]+\S[^\n]*|[ \t]*(?=\n[ \t]+\S)))*)/gm;

function extractFootnotes(src: string): { text: string; section: string } {
  const code: string[] = [];
  const unstash = (s: string) => s.replace(/ZZCODE(\d+)ZZ/g, (_, i) => code[Number(i)]);
  let text = src.replace(CODE_SPAN, (m) => `ZZCODE${code.push(m) - 1}ZZ`);

  // Definitions: "[^label]: first line" plus any indented continuation lines.
  const defs = new Map<string, string>();
  text = text.replace(
    FOOTNOTE_DEF,
    (_, label: string, body: string) => {
      if (!defs.has(label)) defs.set(label, body.replace(/\n {1,4}|\n\t/g, "\n").trim());
      return "";
    },
  );
  if (defs.size === 0) return { text: unstash(text), section: "" };

  // References, numbered by first use.
  const order: string[] = [];
  const uses = new Map<string, number>();
  const idOf = (label: string) => encodeURIComponent(label);
  text = text.replace(/\[\^([^\]\s]+)\]/g, (m, label: string) => {
    if (!defs.has(label)) return m;
    if (!order.includes(label)) order.push(label);
    const n = (uses.get(label) ?? 0) + 1;
    uses.set(label, n);
    const num = order.indexOf(label) + 1;
    const refId = n === 1 ? `fnref-${idOf(label)}` : `fnref-${idOf(label)}-${n}`;
    return `<sup class="fnref"><a href="#fn-${idOf(label)}" id="${refId}">${num}</a></sup>`;
  });
  if (order.length === 0) return { text: unstash(text), section: "" };

  const items = order.map((label) => {
    let html = Bun.markdown.html(unstash(defs.get(label)!), MD_OPTIONS).trimEnd();
    const backs = Array.from({ length: uses.get(label)! }, (_, i) => {
      const refId = i === 0 ? `fnref-${idOf(label)}` : `fnref-${idOf(label)}-${i + 1}`;
      return `<a href="#${refId}" class="fn-back" aria-label="Back to reference">↩${i ? `<sup>${i + 1}</sup>` : ""}</a>`;
    }).join(" ");
    html = html.endsWith("</p>")
      ? html.slice(0, -4) + ` ${backs}</p>`
      : `${html}\n<p>${backs}</p>`;
    return `<li id="fn-${idOf(label)}">\n${html}\n</li>`;
  });
  const section =
    `<section class="footnotes"><h2 class="sr-only">Footnotes</h2>\n<ol>\n` +
    items.join("\n") +
    `\n</ol></section>`;
  return { text: unstash(text), section };
}

/**
 * GitHub alerts: a blockquote whose first line is [!NOTE], [!TIP], [!IMPORTANT], [!WARNING]
 * or [!CAUTION] (any case). Bun renders these as ordinary blockquotes, so rewrite them into
 * styled callouts. The matching </blockquote> is found by counting, so quotes nested inside
 * an alert survive.
 */
const OCTICON = (d: string) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${d}"/></svg>`;

const ALERTS: Record<string, { title: string; icon: string }> = {
  note: {
    title: "Note",
    icon: OCTICON(
      "M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    ),
  },
  tip: {
    title: "Tip",
    icon: OCTICON(
      "M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z",
    ),
  },
  important: {
    title: "Important",
    icon: OCTICON(
      "M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    ),
  },
  warning: {
    title: "Warning",
    icon: OCTICON(
      "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z",
    ),
  },
  caution: {
    title: "Caution",
    icon: OCTICON(
      "M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    ),
  },
};

function renderAlerts(html: string): string {
  const opener = /<blockquote>\n<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\n|(?=<\/p>))/gi;
  let out = "";
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = opener.exec(html))) {
    // Find the </blockquote> that closes this one, skipping nested blockquotes.
    const tag = /<(\/?)blockquote>/g;
    tag.lastIndex = m.index + "<blockquote>".length;
    let depth = 1;
    let end = -1;
    for (let t; (t = tag.exec(html)); ) {
      depth += t[1] ? -1 : 1;
      if (depth === 0) {
        end = t.index;
        break;
      }
    }
    if (end < 0) continue;

    const alert = ALERTS[m[1].toLowerCase()];
    // The marker line is gone; drop the paragraph too if the marker was alone in it.
    const body = ("<p>" + html.slice(m.index + m[0].length, end)).replace(/^<p><\/p>\n?/, "");
    out += html.slice(pos, m.index);
    out +=
      `<div class="alert alert-${m[1].toLowerCase()}">` +
      `<p class="alert-title">${alert.icon}${alert.title}</p>\n${body}</div>`;
    pos = end + "</blockquote>".length;
    opener.lastIndex = pos;
  }
  return out + html.slice(pos);
}

/** Replace :shortcode: with its emoji; unknown names (and things like 10:30:45) are left alone. */
const SHORTCODE = /:([a-z0-9_+-]+):/g;
const replaceShortcodes = (text: string) =>
  text.replace(SHORTCODE, (m, name) => EMOJIS[name] ?? m);

/** Emojify rendered HTML, touching only visible text: never code, math, scripts or tag attributes. */
function emojify(html: string): string {
  const skip =
    /(<(pre|code|script|style)\b[\s\S]*?<\/\2>|<span class="math[^>]*>[\s\S]*?<\/span>|<[^>]+>)|:([a-z0-9_+-]+):/g;
  return html.replace(skip, (m, protectedSegment, _tag, name) =>
    protectedSegment ? m : (EMOJIS[name] ?? m),
  );
}

/** Markdown source to the HTML of a page's body. */
function renderMarkdown(source: string) {
  const { text: mathFree, stash } = protectMath(source);
  const { text, section } = extractFootnotes(mathFree);
  const html = Bun.markdown.html(text, MD_OPTIONS) + (section ? "\n" + section : "");
  return {
    body: emojify(renderAlerts(restoreMath(html, stash))),
    math: stash.length > 0,
    code: html.includes('<code class="language-'),
  };
}

// pdf2md lists there the equations of a book most worth comparing with the book.
const CHECKLIST = "check-equations.md";

// Re-read the file on every request so edits show up on refresh.
async function renderFile(path: string) {
  const source = await Bun.file(path).text();
  const title = replaceShortcodes(
    source.match(/^#\s+(.+)$/m)?.[1] ?? basename(path, extname(path)),
  );
  const { body, math, code } = renderMarkdown(source);
  const checklist =
    basename(path) !== CHECKLIST && (await Bun.file(join(dirname(path), CHECKLIST)).exists());
  return page(title, body, {
    math,
    code,
    live: LIVE_RELOAD ? path : undefined,
    browse: dirUrl(dirname(path)),
    place: true,
    edit: { checklist },
  });
}

const MD_FILE = /\.(md|markdown)$/i;
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }).compare;

/** The first "# heading" near the top of a Markdown file, or "" if there isn't one. */
async function headingOf(path: string): Promise<string> {
  try {
    const top = await Bun.file(path).slice(0, 8192).text();
    return replaceShortcodes(top.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "");
  } catch {
    return "";
  }
}

/**
 * Is there a Markdown file in this folder or any folder below it? Looks one level at a time,
 * so a nearby file is found without walking the whole tree. Skips what search skips (hidden
 * folders, node_modules, symlinked folders). A huge tree is assumed to have some Markdown
 * rather than walked to the end.
 */
const MAX_FOLDERS_CHECKED = 2000;

async function hasMarkdown(dir: string): Promise<boolean> {
  let level = [dir];
  let checked = 0;
  while (level.length) {
    const next: string[] = [];
    for (const d of level) {
      if (++checked > MAX_FOLDERS_CHECKED) return true;
      let entries;
      try {
        entries = await readdir(d, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        if (MD_FILE.test(e.name) && !e.isDirectory()) return true;
        if (e.isDirectory() && e.name !== "node_modules") next.push(join(d, e.name));
      }
    }
    level = next;
  }
  return false;
}

/**
 * The Markdown files directly inside a folder, and its subfolders that have Markdown somewhere
 * inside them, sorted so "chapter2" comes before "chapter10".
 */
async function listDir(dir: string) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => byName(a.name, b.name));
  const folders: string[] = [];
  const files: string[] = [];
  const subfolders: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    // Follow symlinks: stat says what they point at.
    const kind = e.isSymbolicLink() ? await kindOf(full) : e.isDirectory() ? "dir" : "file";
    if (kind === "dir") subfolders.push(e.name);
    else if (kind === "file" && MD_FILE.test(e.name)) files.push(e.name);
  }
  const keep = await Promise.all(subfolders.map((n) => hasMarkdown(join(dir, n))));
  folders.push(...subfolders.filter((_, i) => keep[i]));
  const titles = await Promise.all(files.map((n) => headingOf(join(dir, n))));
  return { folders, files, titles };
}

/** The folder above, if it can be served too. */
const parentOf = (dir: string) =>
  dirname(dir) !== dir && isServable(dirname(dir)) ? dirname(dir) : null;

// A folder is shown as a list of links to its Markdown files (with each file's title, if it
// has one) and to its subfolders that have Markdown somewhere inside them. Its URL ends in "/", so the links are
// just the names.
async function renderDir(dir: string) {
  const { folders, files, titles } = await listDir(dir);

  const link = (name: string, href: string, title = "") =>
    `<li><a href="${escapeHtml(href)}">${escapeHtml(name)}</a>` +
    (title && title !== name ? `<span class="doc-title">${escapeHtml(title)}</span>` : "") +
    `</li>`;
  const items = [
    ...(parentOf(dir) ? [link("../", "../")] : []),
    ...folders.map((n) => link(n + "/", encodeURIComponent(n) + "/")),
    ...files.map((n, i) => link(n, encodeURIComponent(n), titles[i])),
  ];
  if (folders.length + files.length === 0) {
    items.push(`<li class="empty">No Markdown files here.</li>`);
  }
  const name = basename(dir) || dir;
  return page(
    name,
    `<h1>📁 ${escapeHtml(name)}</h1>\n<ul class="listing">\n${items.join("\n")}\n</ul>`,
    { live: LIVE_RELOAD ? dir : undefined, dir: true, browse: dirUrl(dir) },
  );
}

// The browse dialog asks for a folder's contents as JSON: the same files and folders as the
// folder page.
async function browseJson(dir: string) {
  const { folders, files, titles } = await listDir(dir);
  const parent = parentOf(dir);
  return Response.json({
    name: basename(dir) || dir,
    path: dir,
    dir: dirUrl(dir),
    parent: parent && dirUrl(parent),
    folders: folders.map((n) => ({ name: n, href: dirUrl(join(dir, n)) })),
    files: files.map((n, i) => ({ name: n, href: urlPath(join(dir, n)), title: titles[i] })),
  });
}

// Search looks at the text a page shows, not its Markdown source, so link addresses and
// markup don't count as matches and the counts agree with what the page will highlight.
// Each file's text is kept until the file changes, so searching again is quick.
const MAX_SEARCH_FILES = 5000;
const textCache = new Map<string, { mtime: number; text: string; title: string }>();

const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" } as Record<string, string>)[lower] ?? m;
  });

async function plainText(path: string) {
  const { mtimeMs } = await stat(path);
  const hit = textCache.get(path);
  if (hit && hit.mtime === mtimeMs) return hit;
  const source = await Bun.file(path).text();
  const html = renderMarkdown(source).body.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "");
  const entry = {
    mtime: mtimeMs,
    text: decodeEntities(html.replace(/<[^>]*>/g, "")),
    title: replaceShortcodes(source.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ""),
  };
  textCache.set(path, entry);
  return entry;
}

/** Markdown files in a folder and all its subfolders: each folder's files before its subfolders. */
async function markdownFilesUnder(dir: string, out: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = (await readdir(dir, { withFileTypes: true }))
      .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules")
      .sort((a, b) => byName(a.name, b.name));
  } catch {
    return out;
  }
  const subfolders: string[] = [];
  for (const e of entries) {
    if (out.length >= MAX_SEARCH_FILES) return out;
    const full = join(dir, e.name);
    // Symlinked folders are not followed: one pointing back up would never end.
    if (e.isDirectory()) subfolders.push(full);
    else if (MD_FILE.test(e.name) && (e.isFile() || (await kindOf(full)) === "file")) out.push(full);
  }
  for (const sub of subfolders) await markdownFilesUnder(sub, out);
  return out;
}

/** Whitespace in the query matches any run of whitespace, so line breaks don't hide a phrase. */
const searchPattern = (q: string) =>
  new RegExp(
    q.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"),
    "gi",
  );

async function searchJson(dir: string, q: string) {
  const files = await markdownFilesUnder(dir);
  const re = searchPattern(q);
  const results: { name: string; href: string; title: string; count: number }[] = [];
  for (let i = 0; i < files.length; i += 16) {
    const batch = await Promise.all(
      files.slice(i, i + 16).map(async (path) => {
        try {
          const { text, title } = await plainText(path);
          const count = text.match(re)?.length ?? 0;
          return count ? { name: relative(dir, path), href: urlPath(path), title, count } : null;
        } catch {
          return null;
        }
      }),
    );
    for (const r of batch) if (r) results.push(r);
  }
  return Response.json({ searched: files.length, limited: files.length >= MAX_SEARCH_FILES, results });
}

// One server shows any number of files, each in its own tab. A page's URL is the file's
// absolute path (http://localhost:3000/home/me/book/toc.md), so relative links between files
// just work. Only folders that were opened explicitly (the folder of the file given at startup,
// or the folder itself, plus any added later through /__open by the `md` script) and their
// subfolders can be served. A folder's URL ends in "/".
const roots = new Set<string>();
let lastOpened = "";

function open(path: string, kind: "file" | "dir") {
  roots.add(kind === "dir" ? path : dirname(path));
  lastOpened = urlPath(path) + (kind === "dir" && path !== "/" ? "/" : "");
  return lastOpened;
}

function urlPath(file: string) {
  return file.split(sep).map(encodeURIComponent).join("/");
}

/** A folder's URL, which ends in "/". */
const dirUrl = (dir: string) => (dir === "/" ? "/" : urlPath(dir) + "/");

const isServable = (full: string) =>
  [...roots].some((root) => full === root || full.startsWith(root === "/" ? "/" : root + sep));

/** Map a URL path to a file inside an opened folder, or null if it is outside all of them. */
function safePath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const full = resolve("/", "." + decoded);
  return isServable(full) ? full : null;
}

// Editing: the changes the page's ✏️ tools ask for (see EDIT_HEAD), made in the Markdown
// file. What is written is what pdf2md keeps when it converts a book again:
//   an equation corrected where it stands;
//   <span class="fix" data-was="as converted">as in the book</span>;
//   <details class="mine"> … </details> or > [!WARNING] after a block, between empty lines;
//   <sup>[✎](#mine-N)</sup> in a sentence, with id="mine-N" on its note.
// A change whose place in the file isn't certain is refused with a message for the reader.
class EditError extends Error {}

const NOT_IN_FILE =
  "These words can't be found for sure in the file (formatting or a formula may be in the " +
  "way, or the same words read differently elsewhere). Select a few plain words, or more of them.";

type Span = { start: number; end: number };

/** Where each formula is in the source; the nth is the page's data-i="n". */
function mathSpans(src: string): Span[] {
  const spans: Span[] = [];
  for (const m of src.matchAll(PROTECT)) {
    const math = mathOf(m.slice(1));
    if (math) spans.push({ start: m.index, end: m.index + math.length });
  }
  return spans;
}

const codeSpans = (src: string) =>
  [...src.matchAll(CODE_SPAN)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    fenced: m[1] !== undefined,
  }));

/**
 * The source with everything the page doesn't show as text blanked out (formulas, tags,
 * comments, link addresses, footnote definitions), each character replaced so that positions
 * stay the same. The page leaves the same things out when it counts.
 */
function shownText(src: string): string {
  const blank = (m: string) => "\0".repeat(m.length);
  return src
    .replace(PROTECT, (m, ...groups) => (mathOf(groups) ? blank(m) : m))
    .replace(FOOTNOTE_DEF, blank)
    .replace(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^<>]*>|!\[[^\]\n]*\]\([^)\n]*\)|\]\([^)\n]*\)/g, blank);
}

/** The place in the source the page means: a formula, or the selected words. */
function locate(src: string, where: any): Span {
  if (where?.math) {
    const span = mathSpans(src)[where.math.i];
    if (!span || src.slice(span.start, span.end).replace(/\r\n/g, "\n") !== where.math.was) {
      throw new EditError("The file has changed since this page was shown. Reload the page and try again.");
    }
    return span;
  }
  const words = typeof where?.text === "string" ? where.text.trim().split(/\s+/).filter(Boolean) : [];
  if (!words.length) throw new EditError("Select some words first.");
  const re = new RegExp(words.map((w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "g");
  const found = [...shownText(src).matchAll(re)];
  const m = found.length === where.count ? found[where.nth] : undefined;
  if (!m) throw new EditError(NOT_IN_FILE);
  return { start: m.index, end: m.index + m[0].length };
}

const FIX_SPAN = /<span class="fix" data-was="([^"]*)">([\s\S]*?)<\/span>/g;
const toAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fromAttr = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&");

function editMath(src: string, edit: any): string {
  const { start, end } = locate(src, { math: edit.where?.math ?? {} });
  const old = src.slice(start, end);
  const { display, open, close } = mathMarks(old);
  const inner = old.slice(open, old.length - close);
  // keep the delimiters and the line breaks inside them as they were
  const lead = inner.match(/^\s*/)![0];
  const trail = inner.trim() ? inner.match(/\s*$/)![0] : "";
  const now = String(edit.now ?? "").trim();
  if (!now) throw new EditError("The equation can't be empty.");
  // (the check below would take these for a formula in "$", which they would no longer be
  // on GitHub)
  if (old.startsWith("$`") && now.includes("`")) {
    throw new EditError("This can't be saved as one formula: it must not contain a backtick (`).");
  }
  if (old.startsWith("```") && /^```/m.test(now)) {
    throw new EditError("This can't be saved as one equation: no line of it may start with ```.");
  }
  const next = old.slice(0, open) + lead + now + trail + old.slice(old.length - close);
  const out = src.slice(0, start) + next + src.slice(end);
  // It must still be one formula, the same one of the file.
  const after = mathSpans(out);
  const same = after[edit.where.math.i];
  if (after.length !== mathSpans(src).length || !same || out.slice(same.start, same.end) !== next) {
    throw new EditError(
      !old.startsWith("$$") && !old.startsWith("$`") && display
        ? "This can't be saved as one equation."
        : old.startsWith("$`")
          ? "This can't be saved as one formula."
          : display
            ? "This can't be saved as one equation: it must not contain $$."
            : "This can't be saved as one formula: it must stay on one line, without a $ that isn't written \\$.",
    );
  }
  return out;
}

function editFix(src: string, edit: any): string {
  if (edit.where?.math) throw new EditError("Click an equation to correct it.");
  const { start, end } = locate(src, edit.where);
  const now = String(edit.now ?? "").trim().replace(/\n\s*\n/g, "\n");
  if (/<\/span>/i.test(now)) throw new EditError("A fix can't contain </span>.");
  const was = src.slice(start, end);
  if (/\n[ \t]*\r?\n/.test(was)) throw new EditError("A fix has to stay inside one paragraph.");
  if (codeSpans(src).some((c) => start < c.end && end > c.start)) {
    throw new EditError("Words inside code can't be marked as a fix.");
  }
  // An earlier fix: its words are changed, or it is undone if they are the converted ones again.
  for (const m of src.matchAll(FIX_SPAN)) {
    const spanEnd = m.index + m[0].length;
    if (end <= m.index || start >= spanEnd) continue;
    const textEnd = spanEnd - "</span>".length;
    if (start !== textEnd - m[2].length || end !== textEnd) {
      throw new EditError("These words are part of a fix made earlier. Click that fix to change it.");
    }
    const original = fromAttr(m[1]);
    const squash = (s: string) => s.replace(/\s+/g, " ");
    const next = squash(now) === squash(original) ? original : `<span class="fix" data-was="${m[1]}">${now}</span>`;
    return src.slice(0, m.index) + next + src.slice(spanEnd);
  }
  if (now === was) return src;
  return src.slice(0, start) + `<span class="fix" data-was="${toAttr(was)}">${now}</span>` + src.slice(end);
}

/** The next free N for id="mine-N", looking at every Markdown file of the folder (book.md holds them all). */
async function nextMineId(file: string): Promise<number> {
  const dir = dirname(file);
  let max = 0;
  const names = (await readdir(dir)).filter((n) => MD_FILE.test(n));
  await Promise.all(
    names.map(async (n) => {
      try {
        const text = await Bun.file(join(dir, n)).text();
        for (const m of text.matchAll(/\bmine-(\d+)/g)) max = Math.max(max, Number(m[1]));
      } catch {}
    }),
  );
  return max + 1;
}

async function editNote(src: string, edit: any, file: string): Promise<string> {
  const { start, end } = locate(src, edit.where);
  const body = String(edit.body ?? "").trim();
  if (!body) throw new EditError("Write something first.");
  const code = codeSpans(src);
  const displayMath = !!edit.where?.math && mathMarks(src.slice(start, end)).display;
  const marker = edit.kind === "note" && !!edit.marker && !displayMath;
  if (marker && code.some((c) => end > c.start && end <= c.end)) {
    throw new EditError("A marker can't be put inside code. Untick it, or select other words.");
  }

  let note: string;
  let mark = "";
  if (edit.kind === "note") {
    const title = (String(edit.title ?? "").trim() || "My note").replace(/\s+/g, " ").replace(/</g, "&lt;");
    let id = "";
    if (marker) {
      const n = await nextMineId(file);
      id = ` id="mine-${n}"`;
      mark = `<sup>[✎](#mine-${n})</sup>`;
    }
    note =
      `<details class="mine"${id}>\n<summary>${title.startsWith("✎") ? title : "✎ " + title}</summary>\n\n` +
      `${body}\n\n</details>`;
  } else if (edit.kind === "warning") {
    note = "> [!WARNING]\n" + body.split(/\r?\n/).map((l) => (l.trim() ? "> " + l : ">")).join("\n");
  } else {
    throw new EditError("Unknown kind of note.");
  }

  // After the block the place is in: at the next empty line (or the end of the file). A place
  // inside a code block or a table means after the whole of it.
  let from = end;
  const fence = code.find((c) => c.fenced && c.start < from && from < c.end);
  if (fence) from = fence.end;
  const table = src.lastIndexOf("<table", from);
  if (table >= 0 && src.lastIndexOf("</table>", from) < table) {
    const close = src.indexOf("</table>", from);
    if (close >= 0) from = close + "</table>".length;
  }
  const gap = /\r?\n[ \t]*\r?\n/g;
  gap.lastIndex = from;
  const at = Math.max(end, gap.exec(src)?.index ?? src.trimEnd().length);
  const rest = src.slice(at);
  return src.slice(0, end) + mark + src.slice(end, at) + "\n\n" + note + (rest.trim() ? rest : "\n");
}

// Changing or deleting a note that is already in the file: one of your own
// (<details class="mine">) or an alert box (> [!WARNING] etc.; in a book converted by pdf2md
// those are all yours too, since pdf2md never writes one). The page says which it means by
// counting, the nth of count on the page, and the server only goes ahead if it finds as many
// in the file. Alerts in footnotes, lists or other quotes are on the page but not counted
// here, so a file with any of those has its alerts changed in the file itself.
const ONLY_IN_FILE = "This one can't be found for sure in the file. Change it in the file itself.";
const ALERT_LINE = /^( {0,3})> ?\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;
const QUOTE_LINE = /^ {0,3}>/;

function noteSpans(src: string, kind: unknown): Span[] {
  const code = codeSpans(src);
  const spans: Span[] = [];
  if (kind === "mine") {
    const inCode = (at: number) => code.some((c) => c.start <= at && at < c.end);
    // A note inside another is on the page too, so the search goes on inside each one.
    for (const m of src.matchAll(/<details class="mine"[^>]*>/g)) {
      if (inCode(m.index)) continue;
      const tag = /<(\/?)details\b[^>]*>/g;
      tag.lastIndex = m.index + m[0].length;
      let depth = 1;
      for (let t; (t = tag.exec(src)); ) {
        depth += t[1] ? -1 : 1;
        if (depth === 0) {
          spans.push({ start: m.index, end: t.index + t[0].length });
          break;
        }
      }
    }
  } else if (kind === "alert") {
    const inFence = (at: number) => code.some((c) => c.fenced && c.start <= at && at < c.end);
    const lines = src.split("\n");
    const starts: number[] = [];
    let at = 0;
    for (const line of lines) {
      starts.push(at);
      at += line.length + 1;
    }
    const text = (i: number) => lines[i].replace(/\r$/, "");
    for (let i = 0; i < lines.length; i++) {
      // the marker has to be the first line of its quote
      if (!ALERT_LINE.test(text(i)) || (i > 0 && QUOTE_LINE.test(lines[i - 1])) || inFence(starts[i])) continue;
      let j = i;
      while (j + 1 < lines.length && QUOTE_LINE.test(lines[j + 1])) j++;
      spans.push({ start: starts[i], end: starts[j] + text(j).length });
      i = j;
    }
  }
  return spans;
}

/** The note the page means, taken apart: head (kept as it is), title (notes only) and body. */
function findNote(src: string, where: any) {
  const n = where?.note ?? {};
  const spans = noteSpans(src, n.kind);
  const span = spans.length === n.count ? spans[n.i] : undefined;
  if (!span) throw new EditError(ONLY_IN_FILE);
  const was = src.slice(span.start, span.end).replace(/\r\n/g, "\n");
  if (n.kind === "mine") {
    const m = was.match(/^(<details[^>]*>)\s*<summary>([\s\S]*?)<\/summary>([\s\S]*)<\/details>$/);
    if (!m) throw new EditError(ONLY_IN_FILE);
    const title = m[2].trim().replace(/^✎\s*/, "");
    return { kind: "mine", spans, span, was, head: m[1], summary: m[2], title, body: m[3].trim(), indent: "" };
  }
  const lines = was.split("\n");
  // A line of the quote written without its ">" would be left behind.
  const next = src.slice(span.end).match(/^\r?\n([^\n]*)/)?.[1] ?? "";
  if (next.trim()) throw new EditError(ONLY_IN_FILE);
  const indent = lines[0].match(ALERT_LINE)![1];
  const body = lines.slice(1).map((l) => l.replace(/^ {0,3}> ?/, "")).join("\n").trim();
  return { kind: "alert", spans, span, was, head: lines[0], summary: "", title: "", body, indent };
}

/** What the page shows in its dialog; "was" comes back with the change, to check nothing moved. */
function peekNote(src: string, edit: any) {
  const { was, title, body } = findNote(src, edit.where);
  return { was, title, body };
}

function editOldNote(src: string, edit: any): string {
  const note = findNote(src, edit.where);
  const { span, spans } = note;
  if (note.was !== edit.where.note.was) {
    throw new EditError("The file has changed since this page was shown. Reload the page and try again.");
  }
  if (edit.remove) {
    // Its empty lines go with it, and so does the ✎ marker that led to it.
    const before = src.slice(0, span.start).replace(/(\r?\n[ \t]*)+$/, "");
    const after = src.slice(span.end).replace(/^([ \t]*\r?\n)+/, "");
    const out = before && after ? before + "\n\n" + after : before ? before + "\n" : after;
    const id = note.head.match(/\bid="(mine-\d+)"/)?.[1];
    return id ? out.replaceAll(`<sup>[✎](#${id})</sup>`, "") : out;
  }
  const body = String(edit.body ?? "").trim();
  if (!body) throw new EditError("Write something, or use Delete.");
  let next: string;
  if (note.kind === "mine") {
    // An unchanged title stays as written in the file, whatever HTML it has.
    let summary = note.summary;
    if (!edit.sameTitle) {
      const title = (String(edit.title ?? "").trim() || "My note").replace(/\s+/g, " ").replace(/</g, "&lt;");
      summary = title.startsWith("✎") ? title : "✎ " + title;
    }
    next = `${note.head}\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;
  } else {
    const quote = note.indent + ">";
    next = note.head + "\n" + body.split(/\r?\n/).map((l) => (l.trim() ? `${quote} ${l}` : quote)).join("\n");
  }
  const out = src.slice(0, span.start) + next + src.slice(span.end);
  // It must still be one note, the same one of the file.
  const after = noteSpans(out, note.kind);
  const same = after[edit.where.note.i];
  if (after.length !== spans.length || !same || out.slice(same.start, same.end) !== next) {
    throw new EditError("This can't be saved as one note: it must not contain </details> or a note of its own.");
  }
  return out;
}

// One change at a time, so two can't read the same file and overwrite each other.
let editQueue: Promise<unknown> = Promise.resolve();

function saveEdit(file: string, edit: any): Promise<void> {
  const run = editQueue.then(async () => {
    const src = await Bun.file(file).text();
    const out =
      edit.op === "math" ? editMath(src, edit)
      : edit.op === "fix" ? editFix(src, edit)
      : edit.op === "note" ? await editNote(src, edit, file)
      : edit.op === "renote" ? editOldNote(src, edit)
      : null;
    if (out === null) throw new EditError("Unknown change.");
    if (out === src) return;
    try {
      await Bun.write(file, out);
    } catch (err) {
      throw new EditError(`The file couldn't be written: ${(err as Error).message}`);
    }
    console.log(`Edited ${file} (${edit.op})`);
  });
  editQueue = run.catch(() => {});
  return run;
}

// Only answer requests addressed to this machine by name, which defeats DNS rebinding (a web
// page pointing its own hostname at 127.0.0.1 to read local files).
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function reloadStream(): Response {
  let self: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      self = controller;
      clients.add(controller);
      controller.enqueue(encoder.encode("retry: 1000\n\n"));
    },
    cancel() {
      clients.delete(self);
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });
}

open(FILE, FILE_KIND);

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1", // never reachable from other machines
  idleTimeout: 0, // the live-reload stream stays open indefinitely
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    if (!LOCAL_HOSTS.has(url.hostname)) return new Response("Forbidden", { status: 403 });

    // `md` adds a file here and gets back its URL. Browsers always send an Origin header with
    // a POST and curl doesn't, so refusing one stops web pages from adding folders.
    if (pathname === "/__open") {
      if (req.method !== "POST" || req.headers.has("origin")) {
        return new Response("Forbidden", { status: 403 });
      }
      const path = new URLSearchParams(await req.text()).get("path") ?? "";
      const kind = path.startsWith("/") ? await kindOf(path) : null;
      if (!kind) return new Response(`Not found: ${path}\n`, { status: 404 });
      const full = resolve(path);
      const where = open(full, kind);
      console.log(`Opened ${full}`);
      return new Response(`http://localhost:${server.port}${where}\n`);
    }

    // A page's ✏️ tools change its Markdown file. Only our own pages may ask: a browser says
    // in the Origin header which site a POST comes from, and another site can't send JSON here
    // without asking first (which gets no permission).
    if (pathname === "/__edit") {
      if (
        req.method !== "POST" ||
        req.headers.get("origin") !== url.origin ||
        !req.headers.get("content-type")?.startsWith("application/json")
      ) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      const edit = await req.json().catch(() => null);
      const file = typeof edit?.path === "string" ? safePath(edit.path) : null;
      if (!file || !MD_FILE.test(file) || (await kindOf(file)) !== "file") {
        return Response.json({ error: "This file can't be edited." }, { status: 404 });
      }
      try {
        // Not a change: the Markdown of a note, for the page to show in its dialog.
        if (edit.op === "peek") return Response.json(peekNote(await Bun.file(file).text(), edit));
        await saveEdit(file, edit);
        return Response.json({ ok: true });
      } catch (err) {
        if (err instanceof EditError) return Response.json({ error: err.message }, { status: 409 });
        throw err;
      }
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (pathname === "/" && lastOpened !== "/") return Response.redirect(lastOpened, 302);

    // The browse dialog: a folder's contents, or a search of the Markdown files below it.
    if (pathname === "/__browse" || pathname === "/__search") {
      const dir = safePath(url.searchParams.get("dir") ?? "");
      if (!dir || (await kindOf(dir)) !== "dir") {
        return Response.json({ error: "Not available" }, { status: 404 });
      }
      const q = url.searchParams.get("q")?.trim();
      if (pathname === "/__browse") return browseJson(dir);
      if (!q) return Response.json({ error: "Nothing to search for" }, { status: 400 });
      return searchJson(dir, q);
    }
    if (LIVE_RELOAD && pathname === "/__reload") return reloadStream();

    // Serve files (Markdown and images etc.) from the opened folders.
    const target = safePath(pathname);
    if (!target) {
      return page(
        "Not available",
        "<h1>Not available</h1><p>This file isn't in a folder opened with <code>md</code>. " +
          "Run <code>md</code> on it (or on a file in a folder above it) to view it.</p>",
        { status: 404 },
      );
    }

    const kind = await kindOf(target);
    if (kind === "dir") {
      // Without the trailing slash, relative links in the listing would point at the parent.
      if (!pathname.endsWith("/")) return Response.redirect(pathname + "/" + url.search, 302);
      watchFolder(target);
      return renderDir(target);
    }
    if (kind === "file") {
      watchFolderOf(target);
      // Linked Markdown files (e.g. TOC -> chapter) are rendered too, not sent as raw text.
      if (MD_FILE.test(target)) return renderFile(target);
      return new Response(Bun.file(target));
    }

    return page("Not found", "<h1>404</h1><p>Page not found.</p>", { status: 404 });
  },
  error(err) {
    console.error(err);
    return page("Server error", "<h1>500</h1><p>Something went wrong.</p>", { status: 500 });
  },
});

console.log(`Serving ${FILE} at http://localhost:${server.port}${lastOpened}`);
