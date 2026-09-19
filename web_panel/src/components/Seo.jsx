import { Helmet } from "react-helmet-async";
import { useSiteConfig } from "@/context/SiteConfigContext";

/**
 * Dynamic, SEO-friendly document head for any storefront page.
 *
 * Renders <title>, meta description/keywords, canonical, Open Graph, Twitter
 * cards and any JSON-LD structured data — merged with the admin-controlled
 * site-wide SEO defaults (Global SEO settings).
 *
 * Usage:
 *   <Seo title="AC Repair in Patna" description="…" jsonLd={serviceSchema} />
 */
export default function Seo({
  title,
  description,
  keywords,
  image,
  path,
  type = "website",
  noindex = false,
  jsonLd = null,
}) {
  const { seo = {}, branding = {} } = useSiteConfig();
  const siteName = seo.site_name || branding.site_name || "AzoApp";
  const suffix = seo.title_suffix || siteName;

  const fullTitle = title
    ? (title.includes(suffix) ? title : `${title} | ${suffix}`)
    : (seo.site_title || `${siteName} — Home Services at your doorstep`);
  const desc = description || seo.meta_description ||
    "Book verified home service professionals for AC repair, cleaning, electrician, plumbing & more.";
  const kw = keywords || seo.meta_keywords || "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const abs = (u) => (u && u.startsWith("/") ? origin + u : u);
  const ogImage = abs(image || seo.og_image || `/api/site/og-image`);
  const canonical = origin + (path || (typeof window !== "undefined" ? window.location.pathname : ""));

  const blocks = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {kw && <meta name="keywords" content={kw} />}
      <meta name="robots" content={noindex ? "noindex,nofollow" : "index,follow"} />
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={canonical} />
      {ogImage && <meta property="og:image" content={ogImage} />}

      {/* Twitter */}
      <meta name="twitter:card" content={ogImage ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {seo.twitter && <meta name="twitter:site" content={seo.twitter} />}

      {/* Structured data (JSON-LD) */}
      {blocks.map((b, i) => (
        <script key={i} type="application/ld+json">{JSON.stringify(b)}</script>
      ))}
    </Helmet>
  );
}

/* ---- JSON-LD builders (reusable) ---- */
export const orgJsonLd = (siteName, logo, origin, phone) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: origin,
  ...(logo ? { logo } : {}),
  ...(phone ? { contactPoint: { "@type": "ContactPoint", telephone: phone, contactType: "customer service" } } : {}),
});

export const websiteJsonLd = (siteName, origin) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: origin,
  potentialAction: {
    "@type": "SearchAction",
    target: `${origin}/services?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
});

export const serviceJsonLd = (svc, origin, currency = "INR") => ({
  "@context": "https://schema.org",
  "@type": "Service",
  name: svc.name,
  description: svc.short_description || svc.description || svc.name,
  ...(svc.image || (svc.gallery && svc.gallery[0]) ? { image: svc.image || svc.gallery[0] } : {}),
  serviceType: svc.category_name || "Home Service",
  areaServed: "IN",
  provider: { "@type": "Organization", name: "AzoApp", url: origin },
  ...(svc.base_price || svc.price ? {
    offers: {
      "@type": "Offer", price: String(svc.base_price || svc.price),
      priceCurrency: currency, availability: "https://schema.org/InStock",
    },
  } : {}),
  ...(svc.rating ? {
    aggregateRating: {
      "@type": "AggregateRating", ratingValue: String(svc.rating),
      reviewCount: String(svc.reviews_count || svc.bookings_count || 12),
    },
  } : {}),
});

export const breadcrumbJsonLd = (items, origin) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem", position: i + 1, name: it.name,
    item: origin + it.path,
  })),
});
