#!/usr/bin/env node
/**
 * Pushes cms/export/solutions.json (+ its icons/images) into a running Strapi instance.
 *
 *   STRAPI_URL=http://localhost:1337 STRAPI_TOKEN=<full-access API token> node cms/seed-strapi.mjs
 *
 * Requires the "solution" content type and "solution.feature" component from cms/strapi-schema/
 * to already exist in Strapi (paste them into the Content-Type Builder, or copy the files into
 * <strapi-project>/src/api and src/components and restart Strapi).
 *
 * Safe to re-run: matches existing entries by `legacySlug` and updates them instead of duplicating.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname));
const URL_BASE = (process.env.STRAPI_URL ?? "http://localhost:1337").replace(/\/$/, "");
const TOKEN = process.env.STRAPI_TOKEN;
if (!TOKEN) {
  console.error("Set STRAPI_TOKEN to a Strapi API token with full access (Settings → API Tokens).");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

async function api(pathname, opts = {}) {
  const res = await fetch(`${URL_BASE}/api${pathname}`, { ...opts, headers: { ...headers, ...(opts.headers ?? {}) } });
  if (!res.ok) throw new Error(`${opts.method ?? "GET"} ${pathname} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** Upload a local file to the Media Library, or reuse it if a file with that name was already uploaded. */
const uploadCache = new Map();
async function upload(filePath, name) {
  const key = name;
  if (uploadCache.has(key)) return uploadCache.get(key);

  const existing = await fetch(`${URL_BASE}/api/upload/files?filters[name][$eq]=${encodeURIComponent(name)}`, { headers }).then((r) => r.json());
  if (Array.isArray(existing) && existing.length) {
    uploadCache.set(key, existing[0].id);
    return existing[0].id;
  }

  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  const type = name.endsWith(".svg") ? "image/svg+xml" : name.endsWith(".png") ? "image/png" : "image/jpeg";
  form.append("files", new Blob([buf], { type }), name);
  const res = await fetch(`${URL_BASE}/api/upload`, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error(`upload ${name} -> ${res.status} ${await res.text()}`);
  const [{ id }] = await res.json();
  uploadCache.set(key, id);
  return id;
}

const solutions = JSON.parse(fs.readFileSync(path.join(ROOT, "export/solutions.json"), "utf8"));

for (const s of solutions) {
  console.log(`\n${s.category} ${s.slug}`);

  const heroId = await upload(path.join(ROOT, "export/images", path.basename(s.heroImage)), path.basename(s.heroImage));
  console.log(`  hero image uploaded (media id ${heroId})`);

  const features = [];
  for (const f of s.features) {
    const iconId = await upload(path.join(ROOT, "export/icons", f.icon), f.icon);
    features.push({ title: f.title, icon: iconId });
  }
  console.log(`  ${features.length} feature icons uploaded`);

  const data = {
    title: s.title,
    slug: s.slug,
    legacySlug: s.legacySlug,
    category: s.category,
    order: s.order,
    tagline: s.tagline,
    heroImage: heroId,
    whatIs: s.whatIs,
    whyMatters: s.whyMatters,
    bestSuitedFor: s.bestSuitedFor,
    features,
    publishedAt: new Date().toISOString(),
  };

  const found = await api(`/solutions?filters[legacySlug][$eq]=${encodeURIComponent(s.legacySlug)}`);
  if (found.data.length) {
    await api(`/solutions/${found.data[0].documentId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
    console.log(`  updated existing entry`);
  } else {
    await api(`/solutions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
    console.log(`  created`);
  }
}

console.log(`\n✔ seeded ${solutions.length} solutions`);
