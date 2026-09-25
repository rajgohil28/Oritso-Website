#!/usr/bin/env node
/**
 * Mirrors the published Framer site into this Next.js project, 1:1.
 *
 *   npm run sync                       # uses the default source below
 *   npm run sync -- --source <url>     # any published Framer URL
 *
 * What it does:
 *   1. Reads the source's sitemap.xml and downloads the prerendered HTML of every page (+ the 404 page).
 *   2. Crawls every asset the pages and the Framer runtime can load (JS modules, CMS data, images,
 *      videos, fonts), recursively through JS imports, into .framer-cache/.
 *   3. Writes self-hosted copies:
 *        content/pages/*.html + content/routes.json   (served by app/[[...slug]]/route.ts)
 *        public/_fr/**   <- https://framerusercontent.com/**
 *        public/_gs/**   <- https://fonts.gstatic.com/**
 *        public/_fm/**   <- https://framer.com/m/**  (icon modules the runtime imports by name)
 *        public/robots.txt, public/sitemap.xml  (verbatim)
 *
 * The only edits made to Framer's output are listed in EDITS below; everything else is byte-identical.
 * Each edit is asserted to apply the expected number of times, so a Framer runtime change fails loudly
 * instead of producing a silently broken site.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const SOURCE = (args.source ?? "https://whole-color-987719.framer.app").replace(/\/$/, "");
const CACHE = path.resolve(ROOT, args.cache ?? ".framer-cache");
const MIRROR = path.join(CACHE, "mirror");

/** Remote host prefix -> local public path prefix. */
const HOSTS = [
  ["https://framerusercontent.com", "/_fr"],
  ["https://fonts.gstatic.com", "/_gs"],
  ["https://framer.com/m/", "/_fm/"],
];
const HOST_RE = /https:\/\/(?:framerusercontent\.com|fonts\.gstatic\.com|framer\.com\/m)\/[A-Za-z0-9_\-./%@~+=]+/g;
/** Public path (relative to public/) for a mirrored remote URL. */
function localRel(u) {
  const x = new URL(u);
  const p = decodeURIComponent(x.pathname);
  if (x.host === "framerusercontent.com") return "_fr" + p;
  if (x.host === "fonts.gstatic.com") return "_gs" + p;
  if (x.host === "framer.com" && p.startsWith("/m/")) return "_fm" + p.slice(2) + (/\.js@[\d.]+$/.test(p) ? ".js" : "");
  throw new Error(`unmapped host: ${u}`);
}
/** Files that are JavaScript even though their name doesn't end in .js (e.g. "ArrowLeft.js@0.0.57"). */
const isJsUrl = (u) => /\.(mjs|js)$/.test(u) || u.startsWith("https://framer.com/m/");

/**
 * Framer's runtime passes asset URLs to `new URL(x)` without a base (e.g. responsive image srcsets,
 * CMS chunk locations). Self-hosted asset paths are root-relative, so resolve those two prefixes
 * against the current origin. Nothing else is affected.
 */
const URL_SHIM =
  '<script>/* self-hosted assets: resolve /_fr/ and /_gs/ against this origin */' +
  '(()=>{const O=URL,r=/^\\/_(fr|gs)\\//,f=v=>typeof v=="string"&&r.test(v)?location.origin+v:v;' +
  "class U extends O{constructor(u,b){super(f(u),f(b))}}window.URL=U})()</script>";

const EDITS = {
  html: [
    {
      name: "replace editor-bar preloader with URL shim",
      find: /<script>try\{if\(localStorage\.getItem\("__framer_force_showing_editorbar_since"\)\)\{[^<]*\}\}catch\(e\)\{\}<\/script>/g,
      replace: URL_SHIM,
      expect: 1,
    },
    {
      name: "remove Framer analytics beacon",
      find: /<script async src="https:\/\/events\.framer\.com\/script\?v=2"[^>]*><\/script>/g,
      replace: "",
      expect: 1,
    },
  ],
  // JS edits apply to every runtime file the pattern matches; `perFile` and `files` are asserted.
  js: [
    {
      name: "disable Framer on-page editor bar (loads from framer.com)",
      find: /EditorBar:([A-Za-z_$][\w$]*)===void 0\?void 0:/g,
      replace: "EditorBar:void 0&&",
      perFile: 1,
      files: 1,
    },
    {
      // Framer's CMS client requests byte ranges as `?range=a-b,c-d` and checks the response length. Static hosts
      // (GitHub Pages included) ignore query strings and return the whole file, which makes the page
      // non-interactive. Fetch the whole file instead and cut out the same byte ranges locally.
      name: "CMS: read byte ranges from the whole data file instead of ?range=",
      find: /let ([\w$]+)=([\w$]+)\(([\w$]+)\),([\w$]+)=\[\],([\w$]+)=0;for\(let ([\w$]+) of \1\)\4\.push\(`\$\{\6\.from\}-\$\{\6\.to-1\}`\),\5\+=\6\.to-\6\.from;let ([\w$]+)=new URL\(([\w$]+)\),([\w$]+)=\4\.join\(`,`\);\7\.searchParams\.set\(`range`,\9\);(let ([\w$]+)=await [\w$]+\(\7\);if\(\11\.status!==200\)throw Error\(`Request failed: \$\{\11\.status\} \$\{\11\.statusText\}`\);let ([\w$]+)=await \11\.arrayBuffer\(\),)([\w$]+)=new Uint8Array\(\12\);/g,
      replace: (m, n, _f, _t, r, i, e, a, _u, o, fetchAndRead, _s, c, l) =>
        m
          .replace(`${a}.searchParams.set(\`range\`,${o});`, "")
          .replace(
            `${l}=new Uint8Array(${c});`,
            `${l}=((f,q)=>{let z=new Uint8Array(q.reduce((s,g)=>s+g.to-g.from,0)),p=0;for(let g of q)z.set(f.subarray(g.from,g.to),p),p+=g.to-g.from;return z})(new Uint8Array(${c}),${n});`,
          ),
      perFile: 1,
      files: 3,
    },
    {
      // Icon modules are named "<Icon>.js@<version>"; static hosts can't infer a JavaScript type from that, and browsers
      // refuse to run module scripts served as anything else. They're stored with a trailing ".js".
      name: "icon modules: load <Icon>.js@<version>.js",
      find: /\.js@(0\.0\.\d+)`\)/g,
      replace: ".js@$1.js`)",
      perFile: 1,
      files: 2,
    },
  ],
};

// ---------------------------------------------------------------------------------------------- utils

const log = (...a) => console.log(...a);
function fail(msg) {
  console.error("\n✖ " + msg);
  process.exit(1);
}
async function fetchBuf(url, { allow404 = false } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (allow404 && res.status === 404) return { status: 404, buf: Buffer.from(await res.arrayBuffer()) };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { status: res.status, buf: Buffer.from(await res.arrayBuffer()) };
    } catch (e) {
      if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }
}
const cleanUrl = (u) => u.replace(/&amp;/g, "&").split(/[?#]/)[0].replace(/[.,;]+$/, "");
const mirrorPath = (u) => {
  const x = new URL(u);
  return path.join(MIRROR, x.host, decodeURIComponent(x.pathname));
};
const isText = (p) => /\.(mjs|js|json|css|svg|txt|xml)$/i.test(p) || /\.js@[\d.]+$/.test(p);
const rewriteHosts = (s) => HOSTS.reduce((acc, [from, to]) => acc.split(from).join(to), s);
function applyEdits(text, edits, label) {
  for (const e of edits) {
    const n = (text.match(e.find) ?? []).length;
    if (n !== e.expect) fail(`${label}: edit "${e.name}" matched ${n} time(s), expected ${e.expect}`);
    text = text.replace(e.find, e.replace);
  }
  return text;
}
function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function write(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
}
/** Stable, filesystem-safe file name for a route. */
const fileForRoute = (route) =>
  (route === "/" ? "index" : route.slice(1).replace(/[^a-zA-Z0-9-]+/g, "_").replace(/^_+|_+$/g, "")) + ".html";

// ------------------------------------------------------------------------------------------- 1. pages

log(`Source: ${SOURCE}`);
const robots = (await fetchBuf(`${SOURCE}/robots.txt`)).buf;
const sitemap = (await fetchBuf(`${SOURCE}/sitemap.xml`)).buf.toString("utf8");
const routes = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decodeURIComponent(new URL(m[1]).pathname));
if (routes.length === 0) fail("sitemap.xml lists no pages");
log(`Pages in sitemap: ${routes.length}`);

const pages = new Map(); // route -> html
for (const route of routes) {
  const url = SOURCE + route.split("/").map(encodeURIComponent).join("/");
  pages.set(route, (await fetchBuf(url)).buf.toString("utf8"));
}
const nf = await fetchBuf(`${SOURCE}/__framer-sync-404-probe__`, { allow404: true });
if (nf.status !== 404) fail("404 probe did not return 404");
const notFoundHtml = nf.buf.toString("utf8");
log(`Downloaded ${pages.size} pages + 404 page`);

// ------------------------------------------------------------------------------------ 2. asset crawl

const extraFile = path.join(ROOT, "scripts", "extra-assets.txt");
const seeds = new Set();
const addSeed = (u) => {
  if (/\$\{|\/$/.test(u)) return;
  seeds.add(cleanUrl(u));
};
for (const html of [...pages.values(), notFoundHtml]) for (const m of html.matchAll(HOST_RE)) addSeed(m[0]);
if (fs.existsSync(extraFile))
  for (const line of fs.readFileSync(extraFile, "utf8").split("\n"))
    if (line.trim() && !line.startsWith("#")) addSeed(line.trim());

const done = new Set();
const queue = [...seeds];
let downloaded = 0;
while (queue.length) {
  const batch = queue.splice(0, 16).filter((u) => !done.has(u));
  batch.forEach((u) => done.add(u));
  await Promise.all(
    batch.map(async (u) => {
      const p = mirrorPath(u);
      let buf;
      if (fs.existsSync(p)) buf = fs.readFileSync(p);
      else {
        buf = (await fetchBuf(u)).buf;
        write(p, buf);
        downloaded++;
      }
      if (!isJsUrl(u) && !/\.(json|css)$/.test(u)) return;
      const t = buf.toString("utf8");
      const found = [];
      for (const m of t.matchAll(HOST_RE)) found.push(cleanUrl(m[0]));
      for (const m of t.matchAll(/(?:from|import)\s*\(?\s*["'`](\.{1,2}\/[^"'`]+)["'`]/g)) found.push(new URL(m[1], u).href);
      for (const m of t.matchAll(/new URL\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]\s*,\s*import\.meta\.url/g)) found.push(new URL(m[1], u).href);
      for (const f of found) if (!done.has(f) && !/\$\{|\/$/.test(f)) queue.push(f);
    }),
  );
}
log(`Assets: ${done.size} (${downloaded} newly downloaded)`);

// --------------------------------------------------------------------------------------- 3. write out

const PUBLIC = path.join(ROOT, "public");
const CONTENT = path.join(ROOT, "content");
for (const [, local] of HOSTS) rmrf(path.join(PUBLIC, local));
rmrf(path.join(CONTENT, "pages"));
rmrf(path.join(CONTENT, "cms")); // older layout

const jsEditFiles = Object.fromEntries(EDITS.js.map((e) => [e.name, 0]));
for (const u of done) {
  const x = new URL(u);
  const rel = decodeURIComponent(x.pathname).slice(1);
  const out = localRel(u);
  let data = fs.readFileSync(mirrorPath(u));
  if (isText(out)) {
    let t = data.toString("utf8");
    if (isJsUrl(u))
      for (const e of EDITS.js) {
        const n = (t.match(e.find) ?? []).length;
        if (!n) continue;
        if (n !== e.perFile) fail(`${rel}: edit "${e.name}" matched ${n} time(s), expected ${e.perFile}`);
        t = t.replace(e.find, e.replace);
        jsEditFiles[e.name]++;
      }
    data = rewriteHosts(t);
  }
  const outs = [path.join(PUBLIC, out)];
  // Framer serves CMS data under both /modules/ and /cms/; the CMS runtime requests the /cms/ path.
  if (x.host === "framerusercontent.com" && rel.startsWith("modules/") && rel.endsWith(".framercms"))
    outs.push(path.join(PUBLIC, "_fr/cms/" + rel.slice("modules/".length)));
  for (const o of outs) write(o, data);
}
for (const e of EDITS.js)
  if (jsEditFiles[e.name] !== e.files) fail(`JS edit "${e.name}" applied to ${jsEditFiles[e.name]} files, expected ${e.files}`);

const registry = { routes: {}, notFound: "_404.html" };
for (const [route, html] of pages) {
  const file = fileForRoute(route);
  if (Object.values(registry.routes).includes(file)) fail(`file name collision for ${route}`);
  registry.routes[route] = file;
  write(path.join(CONTENT, "pages", file), rewriteHosts(applyEdits(html, EDITS.html, route)));
}
write(path.join(CONTENT, "pages", registry.notFound), rewriteHosts(notFoundHtml));
write(path.join(CONTENT, "routes.json"), JSON.stringify(registry, null, 2) + "\n");
write(path.join(PUBLIC, "robots.txt"), robots);
write(path.join(PUBLIC, "sitemap.xml"), sitemap);

// -------------------------------------------------------------------------------------- 4. verify

const leftovers = [];
const scan = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) scan(p);
    else if (isText(p) || p.endsWith(".html")) {
      const t = fs.readFileSync(p, "utf8");
      for (const bad of ["https://framerusercontent.com", "https://fonts.gstatic.com", "https://events.framer.com", "https://framer.com/m/"])
        if (t.includes(bad)) leftovers.push(`${path.relative(ROOT, p)}: ${bad}`);
    }
  }
};
scan(path.join(CONTENT, "pages"));
for (const [, local] of HOSTS) scan(path.join(PUBLIC, local));
if (leftovers.length) fail("Remote asset references remain:\n  " + leftovers.join("\n  "));

// every local asset referenced by a page must exist on disk
const missing = new Set();
for (const file of fs.readdirSync(path.join(CONTENT, "pages"))) {
  const t = fs.readFileSync(path.join(CONTENT, "pages", file), "utf8");
  for (const m of t.matchAll(/\/_(fr|gs|fm)\/[A-Za-z0-9_\-./%@~+=]+/g)) {
    const rel = decodeURIComponent(m[0].replace(/&amp;.*/, "").split(/[?#]/)[0].replace(/[.,;]+$/, ""));
    if (rel.endsWith("/")) continue;
    if (!fs.existsSync(path.join(PUBLIC, rel))) missing.add(rel);
  }
}
if (missing.size) fail("Pages reference missing local assets:\n  " + [...missing].join("\n  "));

log(`Wrote ${pages.size} pages + 404 to content/, ${done.size} assets to public/_fr, public/_gs, public/_fm`);
log("✔ sync complete");
