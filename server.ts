import { watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
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
  .theme-toggle { position: fixed; top: 0.6rem; right: 0.6rem; width: 2.2rem; height: 2.2rem;
                  border: 1px solid #8885; border-radius: 50%; background: Canvas; cursor: pointer;
                  font-size: 1.1rem; line-height: 1; padding: 0; opacity: 0.6; }
  .theme-toggle:hover, .theme-toggle:focus-visible { opacity: 1; }
  .theme-toggle::before { content: "🌙"; }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) .theme-toggle::before { content: "☀️"; }
  }
  :root[data-theme="dark"] .theme-toggle::before { content: "☀️"; }
  @media print { .theme-toggle { display: none; } }
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
        const tex = el.textContent.trim().replace(display ? /^\\$\\$|\\$\\$$/g : /^\\$|\\$$/g, "");
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
  opts: { status?: number; math?: boolean; code?: boolean; live?: string; dir?: boolean } = {},
) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${CSS}</style>${THEME_HEAD}${opts.live ? liveHead(opts.live, opts.dir) : ""}${opts.math ? KATEX_HEAD : ""}${opts.code ? HLJS_HEAD : ""}
</head>
<body>
${body}
<button class="theme-toggle" type="button" aria-label="Switch between light and dark" title="Switch between light and dark"></button>
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
 */
const PROTECT = new RegExp(
  [
    "^(`{3,}|~{3,})[^\\n]*\\n[\\s\\S]*?^\\1[ \\t]*$", // 1: fenced code  (kept as is)
    "(`+)(?:(?!\\2)[\\s\\S])+?\\2", // 2: inline code (kept as is)
    "\\\\\\$", // escaped \$ (kept as is)
    "(\\$\\$[\\s\\S]+?\\$\\$)", // 3: display math
    "(\\$(?=\\S)(?:\\\\.|[^$\\\\\\n])+?(?<=\\S)\\$(?!\\d))", // 4: inline math
  ].join("|"),
  "gm",
);

function protectMath(src: string) {
  const stash: string[] = [];
  const text = src.replace(PROTECT, (m, _fence, _tick, display, inline) => {
    const math = display ?? inline;
    if (!math) return m;
    stash.push(math);
    return `ZZMATH${stash.length - 1}ZZ`;
  });
  return { text, stash };
}

function restoreMath(html: string, stash: string[]) {
  return html.replace(/ZZMATH(\d+)ZZ/g, (_, i) => {
    const math = stash[Number(i)];
    const cls = math.startsWith("$$") ? "math display" : "math inline";
    return `<span class="${cls}">${escapeHtml(math)}</span>`;
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

function extractFootnotes(src: string): { text: string; section: string } {
  const code: string[] = [];
  const unstash = (s: string) => s.replace(/ZZCODE(\d+)ZZ/g, (_, i) => code[Number(i)]);
  let text = src.replace(CODE_SPAN, (m) => `ZZCODE${code.push(m) - 1}ZZ`);

  // Definitions: "[^label]: first line" plus any indented continuation lines.
  const defs = new Map<string, string>();
  text = text.replace(
    /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?:[ \t]+\S[^\n]*|[ \t]*(?=\n[ \t]+\S)))*)/gm,
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

// Re-read the file on every request so edits show up on refresh.
async function renderFile(path: string) {
  const source = await Bun.file(path).text();
  const title = replaceShortcodes(
    source.match(/^#\s+(.+)$/m)?.[1] ?? basename(path, extname(path)),
  );
  const { text: mathFree, stash } = protectMath(source);
  const { text, section } = extractFootnotes(mathFree);
  const html = Bun.markdown.html(text, MD_OPTIONS) + (section ? "\n" + section : "");
  const body = emojify(renderAlerts(restoreMath(html, stash)));
  return page(title, body, {
    math: stash.length > 0,
    code: html.includes('<code class="language-'),
    live: LIVE_RELOAD ? path : undefined,
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

/** Does this folder directly contain a Markdown file? */
async function hasMarkdown(dir: string): Promise<boolean> {
  try {
    return (await readdir(dir)).some((n) => !n.startsWith(".") && MD_FILE.test(n));
  } catch {
    return false;
  }
}

// A folder is shown as a list of links to its Markdown files (with each file's title, if it
// has one) and to its subfolders that contain Markdown. Its URL ends in "/", so the links are
// just the names. Sorted so "chapter2" comes before "chapter10".
async function renderDir(dir: string) {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => !e.name.startsWith("."))
    .sort((a, b) => byName(a.name, b.name));
  const folders: string[] = [];
  const files: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    // Follow symlinks: stat says what they point at.
    const kind = e.isSymbolicLink() ? await kindOf(full) : e.isDirectory() ? "dir" : "file";
    if (kind === "dir" && (await hasMarkdown(full))) folders.push(e.name);
    else if (kind === "file" && MD_FILE.test(e.name)) files.push(e.name);
  }
  const titles = await Promise.all(files.map((n) => headingOf(join(dir, n))));

  const link = (name: string, href: string, title = "") =>
    `<li><a href="${escapeHtml(href)}">${escapeHtml(name)}</a>` +
    (title && title !== name ? `<span class="doc-title">${escapeHtml(title)}</span>` : "") +
    `</li>`;
  const items = [
    ...(isServable(dirname(dir)) && dirname(dir) !== dir ? [link("../", "../")] : []),
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
    { live: LIVE_RELOAD ? dir : undefined, dir: true },
  );
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

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    if (pathname === "/" && lastOpened !== "/") return Response.redirect(lastOpened, 302);
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
