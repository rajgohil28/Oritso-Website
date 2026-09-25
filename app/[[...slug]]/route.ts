import { allRoutes, readPage, routeFromSegments } from "@/lib/pages";

// Every known page is prerendered at build time; unknown paths render the 404 document on demand.
export const dynamic = "force-static";
export const dynamicParams = true;

export function generateStaticParams() {
  return allRoutes().map((route) => ({ slug: route === "/" ? [] : route.slice(1).split("/") }));
}

type Ctx = { params: Promise<{ slug?: string[] }> };

function respond(route: string, head: boolean) {
  const { html, status } = readPage(route);
  return new Response(head ? null : html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(_req: Request, { params }: Ctx) {
  return respond(routeFromSegments((await params).slug), false);
}

export async function HEAD(_req: Request, { params }: Ctx) {
  return respond(routeFromSegments((await params).slug), true);
}
