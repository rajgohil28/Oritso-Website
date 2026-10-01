import type { Metadata } from "next";
import { getFramerChrome } from "@/lib/framer-chrome";

// Only wraps CMS-driven, component-rendered routes (currently /solutions/[slug]).
// Every other route is raw HTML served by app/[[...slug]]/route.ts and never touches this layout.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.oritso.in"),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const chrome = getFramerChrome();
  return (
    <html lang="en-US">
      <head>
        <meta name="viewport" content="width=device-width" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <style dangerouslySetInnerHTML={{ __html: extractStyleBody(chrome.fontFaceCss) }} />
        <style dangerouslySetInnerHTML={{ __html: extractStyleBody(chrome.breakpointCss) }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

function extractStyleBody(styleTag: string): string {
  return styleTag.replace(/^<style[^>]*>/, "").replace(/<\/style>$/, "");
}
