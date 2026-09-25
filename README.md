# Oritso Website

A 1:1 replica of the Oritso Framer site (`https://whole-color-987719.framer.app`), with every dependency self-hosted.
It runs on Next.js, and `docs/` is a static build of the same site for GitHub Pages. Pages, text, layout, animations, interactions and CMS content are identical to the Framer
site because they *are* Framer's output: the prerendered HTML of each page plus the Framer runtime that hydrates it.

## Commands

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # prerenders all 26 pages
npm run start
npm run sync        # re-mirror from Framer after changing the site there
npm run build:docs  # rebuild docs/ (GitHub Pages) from content/ and public/
```

After changing the site in Framer: `npm run sync && npm run build:docs`, then commit.

## GitHub Pages

`docs/` is the complete static site. To publish it:

1. Push the repository to GitHub.
2. **Settings → Pages → Build and deployment → Deploy from a branch**, pick the branch and the **`/docs`** folder.
3. Under **Custom domain**, enter the domain (e.g. `www.oritso.in`) and point its DNS at GitHub Pages.

**The site must be served from the root of a domain**: a custom domain, or a repository named `<user>.github.io`.
Framer's router and every asset path are root-relative, so the default project URL `https://<user>.github.io/<repo>/`
shows a broken page. `docs/` deliberately has no `CNAME` file: adding one makes the github.io URL redirect to that
domain, which still serves the old WordPress site until DNS is switched.

`docs/.nojekyll` must stay: without it GitHub runs Jekyll, which drops the `_fr`, `_gs` and `_fm` asset folders.

## How it works

| Path | What |
| --- | --- |
| `app/[[...slug]]/route.ts` | Serves each page's HTML document. All 26 pages are prerendered at build; unknown paths get the 404 page. |
| `content/pages/*.html` | The page documents (Framer's prerendered HTML). |
| `content/routes.json` | Route → document map. |
| `public/_fr/` | Mirror of `framerusercontent.com`: Framer runtime JS, component modules, CMS data, images, videos, fonts. |
| `public/_gs/` | Mirror of `fonts.gstatic.com` (Google Fonts files). |
| `public/_fm/` | Mirror of `framer.com/m/` (icon modules the runtime loads by name). |
| `scripts/sync-framer.mjs` | Generates all of the above from the live Framer site. |
| `scripts/extra-assets.txt` | Assets the runtime requests by a computed name, which the crawler can't discover on its own. |
| `scripts/build-docs.mjs` | Assembles `docs/`: each page as `<route>.html`, `index.html`, `404.html`, `.nojekyll`, and the assets. |
| `docs/` | Generated GitHub Pages site. |

Everything under `content/`, `public/_*` and `docs/` is generated. Don't edit it by hand, because `npm run sync` overwrites it.

### Changes from Framer's output

`scripts/sync-framer.mjs` makes only these edits. Each one is asserted to apply exactly as expected, so if Framer
changes its runtime, the sync fails loudly instead of producing a broken site.

1. **Asset URLs point at this server.** `https://framerusercontent.com` → `/_fr`, `https://fonts.gstatic.com` → `/_gs`,
   `https://framer.com/m/` → `/_fm/`.
2. **A 1-line URL shim runs first on every page.** Framer's runtime calls `new URL(src)` with no base URL on asset URLs.
   The shim resolves `/_fr/…` and `/_gs/…` against the current origin, so this works on any domain.
3. **Framer analytics removed** (`events.framer.com`).
4. **Framer's on-page editor bar disabled.** It loads from `framer.com` and is only visible to logged-in Framer editors.
   Visitors never see it.
5. **CMS data is read without `?range=`.** Framer's CMS client fetches byte ranges of its data files through a
   `?range=a-b` query and checks the response length. Static hosts ignore query strings and return the whole file,
   which made CMS pages freeze ("Made UI non-interactive"). The client now fetches the whole file (a few KB to 87 KB,
   cached) and cuts out the same byte ranges itself.
6. **Icon modules end in `.js`.** The runtime imports icons as `<Icon>.js@<version>`. A static host can't tell that's
   JavaScript, and browsers refuse to run module scripts with the wrong type, so the files are stored and requested
   as `<Icon>.js@<version>.js`.

## Still connected to Framer

- **Contact forms** still submit to Framer's form API (`api.framer.com/forms/...`), exactly as on the Framer site, so
  submissions arrive wherever the Framer project sends them today. The API accepts any origin. **If the Framer project
  is deleted, the forms stop working.** Move them to your own endpoint before cancelling Framer.

The Google Maps embed on the contact section loads from Google, as it does on Framer.

## Notes

- Images are served at original resolution. Framer's CDN resizes and recompresses on the fly (`?scale-down-to=`),
  which a static host can't do, so pages are heavier than on Framer (the largest assets are 30+ MB GIFs and a 37 MB
  video). The images look the same: the query parameters only resize, never crop.
- SEO metadata is Framer's as published: all static pages are titled `oritso`, the description is the "Xtract"
  template's text, and CMS pages end in "- My Framer Site". Fix these in Framer and re-sync, or edit the documents directly.
