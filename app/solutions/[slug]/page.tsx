import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FramerChromeAssets, FramerFooter, FramerNav } from "@/components/FramerChrome";
import { fetchSolutionBySlug, fetchSolutions } from "@/lib/strapi";
import styles from "./page.module.css";

// Self-hosted as a live server (next start), not a static export: pages are built on first
// request and cached for 60s (ISR), so editing/publishing a solution in Strapi shows up on
// the site without a rebuild. New solutions work immediately too (dynamicParams defaults to true).
export const revalidate = 60;

export async function generateStaticParams() {
  // Docker image builds happen before Strapi is necessarily reachable (separate compose service).
  // That's fine: with dynamicParams defaulting to true, any slug not pre-rendered here just
  // renders on first request instead.
  try {
    const solutions = await fetchSolutions();
    return solutions.map((s) => ({ slug: s.slug }));
  } catch (err) {
    console.warn("generateStaticParams: couldn't reach Strapi at build time, skipping pre-render:", err);
    return [];
  }
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const solution = await fetchSolutionBySlug((await params).slug);
  if (!solution) return {};
  return {
    title: solution.seo.metaTitle || `${solution.title} | ORITSO`,
    description: solution.seo.metaDescription || solution.tagline || undefined,
    openGraph: solution.seo.ogImageUrl ? { images: [solution.seo.ogImageUrl] } : undefined,
  };
}

export default async function SolutionPage({ params }: Props) {
  const solution = await fetchSolutionBySlug((await params).slug);
  if (!solution) notFound();

  return (
    <div className={styles.page}>
      <FramerChromeAssets />
      <FramerNav />

      <main>
        <section className={styles.hero}>
          <span className={styles.category}>{solution.category}</span>
          <h1 className={styles.title}>{solution.title}</h1>
          {solution.tagline && <p className={styles.tagline}>{solution.tagline}</p>}
          <div className={styles.heroImageWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer at runtime */}
            <img className={styles.heroImage} src={solution.heroImageUrl} alt={solution.title} />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.heading}>What is {solution.title}?</h2>
          <p className={styles.body}>{solution.whatIs}</p>
        </section>

        <div className={styles.sectionAlt}>
          <section className={styles.section}>
            <h2 className={styles.heading}>Why Does It Matter?</h2>
            <p className={styles.body}>{solution.whyMatters}</p>
          </section>
        </div>

        {solution.features.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.heading}>Key Features &amp; Benefits</h2>
            <div className={styles.featuresGrid}>
              {solution.features.map((f) => (
                <div className={styles.feature} key={f.id}>
                  {f.iconUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.featureIcon} src={f.iconUrl} alt="" />
                  )}
                  <span className={styles.featureTitle}>{f.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {solution.bestSuitedFor && (
          <div className={styles.sectionAlt}>
            <section className={styles.section}>
              <h2 className={styles.heading}>Best Suited For</h2>
              <p className={styles.body}>{solution.bestSuitedFor}</p>
            </section>
          </div>
        )}

        <section className={styles.cta}>
          <a className={styles.ctaLink} href="/contact">
            Talk to Us
          </a>
        </section>
      </main>

      <FramerFooter />
    </div>
  );
}
