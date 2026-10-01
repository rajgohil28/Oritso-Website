#!/usr/bin/env node
/**
 * Repoints /solutions listing-page links from Framer's legacy slugs to the new
 * Strapi-backed slugs served by app/solutions/[slug]/page.tsx.
 *
 *   STRAPI_URL=http://localhost:1337 node scripts/relink-solutions.mjs
 *
 * Safe to re-run (after `npm run sync` re-pulls solutions.html from Framer, or
 * after a legacySlug changes in Strapi): each link is only rewritten if it still
 * points at its solution's legacySlug.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PAGE = path.join(ROOT, "content/pages/solutions.html");
const STRAPI_URL = (process.env.STRAPI_URL ?? "http://localhost:1337").replace(/\/$/, "");

const res = await fetch(`${STRAPI_URL}/api/solutions?pagination[pageSize]=100&fields[0]=slug&fields[1]=legacySlug`);
if (!res.ok) throw new Error(`Strapi /solutions -> ${res.status} ${await res.text()}`);
const { data } = await res.json();

// `legacySlug` is the filename-sanitized form (e.g. "atm-_-brown-label-atm-_bla_-services");
// the actual href in solutions.html uses the raw route slug (e.g. "atm-–-brown-label-atm-(bla)-services").
// Recover it via content/routes.json, which maps route -> "solutions_<legacySlug>.html".
const routes = JSON.parse(fs.readFileSync(path.join(ROOT, "content/routes.json"), "utf8")).routes;
const fileToRouteSlug = new Map(
  Object.entries(routes)
    .filter(([route]) => route.startsWith("/solutions/"))
    .map(([route, file]) => [file, route.slice("/solutions/".length)]),
);

let html = fs.readFileSync(PAGE, "utf8");
let relinked = 0;
let alreadyDone = 0;

for (const { slug, legacySlug } of data) {
  if (!legacySlug) continue;
  const routeSlug = fileToRouteSlug.get(`solutions_${legacySlug}.html`);
  if (!routeSlug) {
    console.warn(`⚠ no route found for legacySlug "${legacySlug}" (solution "${slug}")`);
    continue;
  }
  const legacyHref = `href="./solutions/${routeSlug}"`;
  const newHref = `href="/solutions/${slug}"`;
  // The listing page duplicates each card per responsive breakpoint, so the same href can appear more than once.
  const count = html.split(legacyHref).length - 1;
  if (count === 0) {
    if (html.includes(newHref)) alreadyDone++;
    else console.warn(`⚠ neither legacy nor new href found for "${slug}" (legacySlug "${legacySlug}") — page markup may have changed`);
    continue;
  }
  html = html.split(legacyHref).join(newHref);
  relinked++;
}

fs.writeFileSync(PAGE, html);
console.log(`✔ relinked ${relinked} solution card(s), ${alreadyDone} already pointed at their new slug`);
