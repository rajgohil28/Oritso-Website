#!/usr/bin/env node
/**
 * Builds a static copy of the site into docs/ for GitHub Pages (Settings → Pages → Deploy from a branch → /docs).
 *
 *   npm run build:docs
 *
 * Layout follows GitHub Pages' URL resolution:
 *   /                      -> docs/index.html
 *   /about                 -> docs/about.html          (Pages serves "<path>.html" for extensionless URLs)
 *   /solutions/<slug>      -> docs/solutions/<slug>.html
 *   unknown paths          -> docs/404.html            (served by Pages with status 404)
 *   /_fr, /_gs, /_fm, ...  -> copied from public/
 *   docs/.nojekyll         -> stops Jekyll from dropping the "_"-prefixed asset folders
 *
 * The site must be served from the domain root (a custom domain such as www.oritso.in, or a <user>.github.io
 * repository). Framer's router and all asset paths are root-relative, so a project URL like
 * <user>.github.io/<repo>/ does not work.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "docs");
const CONTENT = path.join(ROOT, "content");
const PUBLIC = path.join(ROOT, "public");

function fail(msg) {
  console.error("\n✖ " + msg);
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(path.join(CONTENT, "routes.json"), "utf8"));

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(PUBLIC, OUT, { recursive: true });

const written = [];
for (const [route, file] of Object.entries(registry.routes)) {
  const target = route === "/" ? path.join(OUT, "index.html") : path.join(OUT, route.slice(1) + ".html");
  if (fs.existsSync(target)) fail(`${path.relative(ROOT, target)} would be overwritten (route ${route})`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(CONTENT, "pages", file), target);
  written.push(target);
}
// Framer answers "/about/" with a 308 to "/about". GitHub Pages can't redirect and serves 404.html instead, so the
// 404 page performs the same redirect client-side for known pages. Unknown paths still get the 404 page.
const CHARSET = '<meta charset="utf-8" />';
let notFound = fs.readFileSync(path.join(CONTENT, "pages", registry.notFound), "utf8");
if (notFound.split(CHARSET).length !== 2) fail(`404 page: expected exactly one ${CHARSET}`);
const trailingSlashRedirect =
  `<script>/* GitHub Pages can't redirect: mirror Framer's 308 from "/page/" to "/page" */(function(){` +
  `var r=${JSON.stringify(Object.keys(registry.routes))},p=location.pathname,t=p.replace(/\/+$/,"");` +
  `try{if(p!==t&&t&&r.indexOf(decodeURIComponent(t))>-1)location.replace(t+location.search+location.hash)}catch(e){}})()</script>`;
notFound = notFound.replace(CHARSET, () => CHARSET + "\n  " + trailingSlashRedirect);
fs.writeFileSync(path.join(OUT, "404.html"), notFound);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

// every local asset referenced by a page must exist in docs/
const missing = new Set();
for (const page of [...written, path.join(OUT, "404.html")]) {
  const html = fs.readFileSync(page, "utf8");
  for (const m of html.matchAll(/\/_(fr|gs|fm)\/[A-Za-z0-9_\-./%@~+=]+/g)) {
    const rel = decodeURIComponent(m[0].split(/[?#]/)[0].replace(/[.,;]+$/, ""));
    if (!rel.endsWith("/") && !fs.existsSync(path.join(OUT, rel))) missing.add(rel);
  }
}
if (missing.size) fail("Pages reference missing assets:\n  " + [...missing].join("\n  "));

let bytes = 0;
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else bytes += fs.statSync(p).size;
  }
};
walk(OUT);
console.log(`Wrote ${written.length} pages + 404.html to docs/ (${(bytes / 1024 / 1024).toFixed(0)} MB)`);
console.log("✔ docs/ is ready for GitHub Pages (serve from the domain root)");
