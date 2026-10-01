/**
 * Fetches Solution content from the Strapi CMS (cms/app) at build time.
 * Solutions pages are `force-static`, so this only ever runs during `next build` /
 * `npm run build:docs` — whatever Strapi instance STRAPI_URL points to (localhost
 * by default) must be reachable then, the same way `npm run sync` needs Framer reachable.
 */

const STRAPI_URL = (process.env.STRAPI_URL ?? "http://localhost:1337").replace(/\/$/, "");

type StrapiMedia = { url: string; width: number; height: number; alternativeText: string | null };

type StrapiFeature = { id: number; title: string; icon: StrapiMedia | null };

type StrapiSeo = { metaTitle: string | null; metaDescription: string | null; ogImage: StrapiMedia | null } | null;

type StrapiSolution = {
  id: number;
  title: string;
  slug: string;
  legacySlug: string | null;
  category: "SaaS" | "PaaS" | "IaaS" | "SI";
  order: number;
  tagline: string | null;
  heroImage: StrapiMedia;
  whatIs: string;
  whyMatters: string;
  bestSuitedFor: string | null;
  features: StrapiFeature[];
  seo: StrapiSeo;
};

export type Solution = Omit<StrapiSolution, "heroImage" | "features" | "seo"> & {
  heroImageUrl: string;
  features: { id: number; title: string; iconUrl: string | null }[];
  seo: { metaTitle: string | null; metaDescription: string | null; ogImageUrl: string | null };
};

function mediaUrl(media: StrapiMedia | null): string | null {
  if (!media) return null;
  return media.url.startsWith("http") ? media.url : `${STRAPI_URL}${media.url}`;
}

function toSolution(s: StrapiSolution): Solution {
  const { heroImage, features, seo, ...rest } = s;
  return {
    ...rest,
    heroImageUrl: mediaUrl(heroImage)!,
    features: features.map((f) => ({ id: f.id, title: f.title, iconUrl: mediaUrl(f.icon) })),
    seo: {
      metaTitle: seo?.metaTitle ?? null,
      metaDescription: seo?.metaDescription ?? null,
      ogImageUrl: mediaUrl(seo?.ogImage ?? null),
    },
  };
}

async function strapiFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (process.env.STRAPI_TOKEN) headers.Authorization = `Bearer ${process.env.STRAPI_TOKEN}`;
  const res = await fetch(`${STRAPI_URL}/api${path}`, { headers });
  if (!res.ok) throw new Error(`Strapi ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

export async function fetchSolutions(): Promise<Solution[]> {
  const data = await strapiFetch<{ data: StrapiSolution[] }>(
    "/solutions?populate[heroImage]=true&populate[features][populate][icon]=true&populate[seo][populate][ogImage]=true&pagination[pageSize]=100&sort=category:asc,order:asc",
  );
  return data.data.map(toSolution);
}

export async function fetchSolutionBySlug(slug: string): Promise<Solution | null> {
  const data = await strapiFetch<{ data: StrapiSolution[] }>(
    `/solutions?filters[slug][$eq]=${encodeURIComponent(slug)}&populate[heroImage]=true&populate[features][populate][icon]=true&populate[seo][populate][ogImage]=true`,
  );
  return data.data[0] ? toSolution(data.data[0]) : null;
}
