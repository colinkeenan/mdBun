import { basename, dirname, resolve, sep } from "node:path";

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

// Re-read the file on every request so edits show up on refresh.
async function renderFile() {
  const source = await Bun.file(FILE).text();
  const title = source.match(/^#\s+(.+)$/m)?.[1] ?? basename(FILE, ".md");
  const { text, stash } = protectMath(source);
  const html = Bun.markdown.html(text, { autolinks: true, headings: { ids: true } });
  return page(title, restoreMath(html, stash), {
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
