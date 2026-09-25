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
 * Base path: a GitHub project site lives under /<repo>/ (e.g. rajgohil28.github.io/Oritso-Website/), while a custom
 * domain or a <user>.github.io repository serves from /. The base is detected from the "origin" remote; override it:
 *   npm run build:docs -- --base /Oritso-Website     # project site
 *   npm run build:docs -- --base ""                  # custom domain (www.oritso.in) or <user>.github.io
 * With a base, docs/ gets: prefixed asset paths, a prefix-aware URL shim, a history patch so the router keeps the base
 * in the address bar, and a prefix-aware 404 page.
 */
import { execSync } from "node:child_process";
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

function detectBase() {
  const i = process.argv.indexOf("--base");
  if (i !== -1) return (process.argv[i + 1] ?? "").replace(/\/+$/, "");
  let url = "";
  try {
    url = execSync("git remote get-url origin", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
  const m = /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/i.exec(url);
  if (!m) return "";
  return m[2].toLowerCase() === `${m[1].toLowerCase()}.github.io` ? "" : `/${m[2]}`;
}
const BASE = detectBase();
if (BASE && !/^\/[A-Za-z0-9._-]+$/.test(BASE)) fail(`invalid base path "${BASE}"`);
const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&");

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
  `var b=${JSON.stringify(BASE)},r=${JSON.stringify(Object.keys(registry.routes))},p=location.pathname,t=p.replace(/\\/+$/,"");` +
  `if(b&&t.indexOf(b+"/")!==0)return;var k=t.slice(b.length);` +
  `try{if(p!==t&&k&&r.indexOf(decodeURIComponent(k))>-1)location.replace(t+location.search+location.hash)}catch(e){}})()</script>`;
notFound = notFound.replace(CHARSET, () => CHARSET + "\n  " + trailingSlashRedirect);
fs.writeFileSync(path.join(OUT, "404.html"), notFound);
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

if (BASE) {
  const isText = (p) => /\.(html|mjs|js|json|css|svg)$/i.test(p);
  const files = [];
  const collect = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) collect(p);
      else if (isText(p)) files.push(p);
    }
  };
  collect(OUT);
  // 1. self-hosted asset paths: "/_fr/…" -> "<base>/_fr/…" (the lookbehind keeps this idempotent)
  const ASSET = /(?<![\w.-])\/_(fr|gs|fm)(?=[/"'`])/g;
  // 2. the URL shim must recognise the prefixed paths
  const SHIM_FROM = "r=/^\\/_(fr|gs)\\//";
  const SHIM_TO = `r=/^${escRe(BASE)}\\/_(fr|gs)\\//`;
  // 3. Framer's router pushes root paths ("/about"); keep the base in the address bar. Patched on History.prototype
  //    because the router sometimes calls the prototype method directly. Back/forward restore pages from the
  //    history state, not the URL, so this is all the router needs.
  const HISTORY_PATCH =
    `<script>/* served under ${BASE}/: keep it in URLs the router pushes */(()=>{const B=${JSON.stringify(BASE)},H=History.prototype;` +
    `for(const k of["pushState","replaceState"]){const o=H[k];H[k]=function(s,t,u){if(u!=null)try{const x=new URL(u,location.href);` +
    `if(x.origin===location.origin&&x.pathname!==B&&x.pathname.indexOf(B+"/")!==0){x.pathname=B+x.pathname;u=x.href}}catch(e){}` +
    `return o.call(this,s,t,u)}}})()</script>`;
  let pagesPatched = 0;
  for (const f of files) {
    let t = fs.readFileSync(f, "utf8");
    const before = t;
    t = t.replace(ASSET, `${BASE}/_$1`);
    if (f.endsWith(".html") && f !== path.join(OUT, "404.html")) {
      if (t.split(SHIM_FROM).length !== 2) fail(`${path.relative(ROOT, f)}: URL shim not found exactly once`);
      t = t.replace(SHIM_FROM, () => SHIM_TO);
      t = t.replace("</script>", () => "</script>" + HISTORY_PATCH); // right after the shim, the first script
      if (t.indexOf(HISTORY_PATCH) > t.indexOf("<style")) fail(`${path.relative(ROOT, f)}: history patch not early in <head>`);
      pagesPatched++;
    }
    if (f === path.join(OUT, "404.html")) {
      if (t.split('href="/"').length !== 2) fail('404.html: expected one href="/" (Back to Home)');
      t = t.replace('href="/"', () => `href="${BASE}/"`);
    }
    if (t !== before) fs.writeFileSync(f, t);
  }
  if (pagesPatched !== written.length) fail(`patched ${pagesPatched} pages, expected ${written.length}`);
  // nothing may still point at an unprefixed asset path
  const leftovers = files.filter((f) => /(?<![\w.-])\/_(fr|gs|fm)(?=[/"'`])/.test(fs.readFileSync(f, "utf8").replaceAll(`${BASE}/_`, "")));
  if (leftovers.length) fail("unprefixed asset paths remain in:\n  " + leftovers.map((f) => path.relative(ROOT, f)).join("\n  "));
}

// every local asset referenced by a page must exist in docs/
const missing = new Set();
for (const page of [...written, path.join(OUT, "404.html")]) {
  const html = fs.readFileSync(page, "utf8");
  for (const m of html.matchAll(/\/_(fr|gs|fm)\/[A-Za-z0-9_\-./%@~+=]+/g)) {
    // (with a base, m[0] is the part after it: "<base>/_fr/x" contains "/_fr/x")
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
console.log(`✔ docs/ is ready for GitHub Pages, served under "${BASE || "/"}"` + (BASE ? " (use --base \"\" for a custom domain)" : ""));
