import { basename, dirname, resolve, sep } from "node:path";
// GitHub's emoji shortcodes (":tada:" -> 🎉), generated from the gemoji database.
import emojiMap from "./emojis.json";

const EMOJIS: Record<string, string> = emojiMap;

const arg = process.argv[2];
if (!arg || arg === "-h" || arg === "--help") {
  console.error("Usage: bun run server.ts <file.md>   (PORT=3000 by default)");
  process.exit(arg ? 0 : 1);
}

const FILE = resolve(arg);
if (!(await Bun.file(FILE).exists())) {
  console.error(`File not found: ${FILE}`);
  process.exit(1);
}

const DIR = dirname(FILE);
const PORT = Number(process.env.PORT ?? 3000);

const CSS = `
  :root { color-scheme: light dark; }
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

  /* GitHub-style alerts: > [!NOTE] */
  :root { --a-note: #0969da; --a-tip: #1a7f37; --a-important: #8250df;
          --a-warning: #9a6700; --a-caution: #cf222e; }
  @media (prefers-color-scheme: dark) {
    :root { --a-note: #4493f8; --a-tip: #3fb950; --a-important: #ab7df8;
            --a-warning: #d29922; --a-caution: #f85149; }
  }
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
const KATEX_HEAD = `
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
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
const HLJS = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build";
const HLJS_HEAD = `
  <link rel="stylesheet" href="${HLJS}/styles/github.min.css" media="(prefers-color-scheme: light)">
  <link rel="stylesheet" href="${HLJS}/styles/github-dark.min.css" media="(prefers-color-scheme: dark)">
  <script defer src="${HLJS}/highlight.min.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", () => {
      if (!window.hljs) return; // CDN unreachable: code stays plain
      for (const el of document.querySelectorAll('pre code[class*="language-"]')) {
        hljs.highlightElement(el);
      }
    });
  </script>`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(
  title: string,
  body: string,
  opts: { status?: number; math?: boolean; code?: boolean } = {},
) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${CSS}</style>${opts.math ? KATEX_HEAD : ""}${opts.code ? HLJS_HEAD : ""}
</head>
<body>
${body}
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
async function renderFile() {
  const source = await Bun.file(FILE).text();
  const title = replaceShortcodes(
    source.match(/^#\s+(.+)$/m)?.[1] ?? basename(FILE, ".md"),
  );
  const { text, stash } = protectMath(source);
  const html = Bun.markdown.html(text, { autolinks: true, headings: { ids: true } });
  const body = emojify(renderAlerts(restoreMath(html, stash)));
  return page(title, body, {
    math: stash.length > 0,
    code: html.includes('<code class="language-'),
  });
}

/** Resolve a URL path inside the file's directory, refusing anything that escapes it. */
function safePath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const full = resolve(DIR, "." + decoded);
  return full.startsWith(DIR + sep) ? full : null;
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { pathname } = new URL(req.url);
    if (pathname === "/") return renderFile();

    // Serve sibling files (images etc.) referenced by relative links in the Markdown.
    const target = safePath(pathname);
    if (!target) return new Response("Bad request", { status: 400 });

    const file = Bun.file(target);
    if (await file.exists()) return new Response(file);

    return page("Not found", "<h1>404</h1><p>Page not found.</p>", { status: 404 });
  },
  error(err) {
    console.error(err);
    return page("Server error", "<h1>500</h1><p>Something went wrong.</p>", { status: 500 });
  },
});

console.log(`Serving ${FILE} at http://localhost:${server.port}`);
