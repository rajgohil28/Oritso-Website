import fs from "node:fs";
import path from "node:path";

/**
 * Pulls the nav and footer (raw Framer markup, all responsive variants) plus their
 * scoped CSS out of an already-synced page, so CMS-driven pages (e.g. /solutions/[slug])
 * can reuse the exact site chrome without a hand-maintained, drift-prone copy of it.
 * Source page: content/pages/solutions.html (`npm run sync` keeps it current).
 */

const REFERENCE_PAGE = path.join(process.cwd(), "content/pages/solutions.html");

type Block = { start: number; end: number; html: string };

/** Top-level (non-nested-in-each-other) `<div class="ssr-variant ...">...</div>` blocks, in document order. */
function ssrVariantBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const openRe = /<div class="ssr-variant[^"]*"[^>]*>/g;
  let om: RegExpExecArray | null;
  while ((om = openRe.exec(html))) {
    const start = om.index;
    const tagRe = /<div\b[^>]*>|<\/div>/gi;
    tagRe.lastIndex = start;
    let depth = 0;
    let end = -1;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html))) {
      if (m[0][1] !== "/") depth++;
      else depth--;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    if (end === -1) break;
    blocks.push({ start, end, html: html.slice(start, end) });
    openRe.lastIndex = end;
  }
  return blocks;
}

/** The first contiguous run of blocks for which `test` matches. */
function firstRun(blocks: Block[], test: (b: Block) => boolean): Block[] {
  const startIdx = blocks.findIndex(test);
  if (startIdx === -1) return [];
  const run: Block[] = [];
  for (let i = startIdx; i < blocks.length && test(blocks[i]); i++) run.push(blocks[i]);
  return run;
}

export type FramerChrome = {
  /** Raw HTML: all responsive variants of the site nav, unmodified. */
  navHtml: string;
  /** Raw HTML: all responsive variants of the site footer, unmodified. */
  footerHtml: string;
  /** Font-face declarations (`data-framer-font-css`). */
  fontFaceCss: string;
  /** Breakpoint visibility helpers (`.hidden-xxxxx { display: none }`). */
  breakpointCss: string;
  /** Component CSS for every `framer-*` class used on the reference page, incl. nav/footer and design tokens. */
  componentCss: string;
};

let cached: FramerChrome | undefined;

export function getFramerChrome(): FramerChrome {
  if (cached) return cached;

  const html = fs.readFileSync(REFERENCE_PAGE, "utf8");
  const blocks = ssrVariantBlocks(html);

  const navBlocks = firstRun(blocks, (b) => /<nav\b/.test(b.html));
  const footerBlocks = firstRun(blocks, (b) => /<footer\b/.test(b.html));
  if (!navBlocks.length) throw new Error(`getFramerChrome: no <nav> ssr-variant blocks found in ${REFERENCE_PAGE}`);
  if (!footerBlocks.length) throw new Error(`getFramerChrome: no <footer> ssr-variant blocks found in ${REFERENCE_PAGE}`);

  // Framer's runtime JS animates these wrappers in from opacity:0.001 on load. CMS-driven pages don't
  // load that runtime (see components/FramerChrome.tsx), so left as-is they'd stay permanently invisible;
  // strip the entrance-animation's initial state so the chrome just renders at its resting position.
  const clearAppearState = (s: string) => s.replace(/style="[^"]*opacity:0\.001[^"]*"/g, 'style=""');
  const navHtml = clearAppearState(html.slice(navBlocks[0].start, navBlocks[navBlocks.length - 1].end));
  const footerHtml = clearAppearState(html.slice(footerBlocks[0].start, footerBlocks[footerBlocks.length - 1].end));

  const fontFaceMatch = html.match(/<style data-framer-font-css>[\s\S]*?<\/style>/);
  const breakpointMatch = html.match(/<style data-framer-breakpoint-css>[\s\S]*?<\/style>/);
  const componentMatch = html.match(/<style data-framer-css-ssr-minified[^>]*>[\s\S]*?<\/style>/);
  if (!fontFaceMatch) throw new Error("getFramerChrome: font-face style block not found");
  if (!breakpointMatch) throw new Error("getFramerChrome: breakpoint style block not found");
  if (!componentMatch) throw new Error("getFramerChrome: component css block not found");

  cached = {
    navHtml,
    footerHtml,
    fontFaceCss: fontFaceMatch[0],
    breakpointCss: breakpointMatch[0],
    componentCss: componentMatch[0],
  };
  return cached;
}
