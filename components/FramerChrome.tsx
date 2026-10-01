import { getFramerChrome } from "@/lib/framer-chrome";

/**
 * The nav and footer, exactly as exported by Framer (all responsive variants, CSS-only —
 * Framer's runtime JS isn't loaded here, so hover/mobile-menu animation is out of scope;
 * see lib/framer-chrome.ts for why that's an acceptable tradeoff on CMS-driven pages).
 */
export function FramerNav() {
  const { navHtml } = getFramerChrome();
  return <div dangerouslySetInnerHTML={{ __html: navHtml }} />;
}

export function FramerFooter() {
  const { footerHtml } = getFramerChrome();
  return <div dangerouslySetInnerHTML={{ __html: footerHtml }} />;
}

/** Component CSS for the `framer-*` classes used by the nav/footer (incl. design tokens). */
export function FramerChromeAssets() {
  const { componentCss } = getFramerChrome();
  const cssBody = componentCss.replace(/^<style[^>]*>/, "").replace(/<\/style>$/, "");
  return <style dangerouslySetInnerHTML={{ __html: cssBody }} />;
}
