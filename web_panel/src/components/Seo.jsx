import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSiteConfig } from "@/context/SiteConfigContext";
import api from "@/lib/api";

const _cache = new Map();

export const resolveSeo = (path) => {
  if (!_cache.has(path)) {
    _cache.set(path, api.get("/seo/resolve", { params: { path } }).then((r) => r.data).catch(() => null));
  }
  return _cache.get(path);
};

const currentPath = () => (typeof window !== "undefined" ? window.location.pathname : "/");

/**
 * Document head for storefront pages. The backend SEO engine (global → category →
 * subcategory → service → city overrides) is authoritative; props are the fallback
 * shown until it resolves or when the path is unknown to the engine.
 */
export default function Seo({ title, description, keywords, image, path, type = "website", noindex = false, jsonLd = null }) {
  const { seo = {}, branding = {} } = useSiteConfig();
  const p = path || currentPath();
  const [srv, setSrv] = useState(null);
  useEffect(() => {
    let live = true;
    resolveSeo(p).then((d) => live && setSrv(d));
    return () => { live = false; };
  }, [p]);

  const siteName = seo.site_name || branding.site_name || "AzoApp";
  const suffix = seo.title_suffix || siteName;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const abs = (u) => (u && u.startsWith("/") ? origin + u : u);
  const found = srv && srv.found;

  const fullTitle = found ? srv.title : title ? (title.includes(suffix) ? title : `${title} | ${suffix}`) : (seo.site_title || siteName);
  const desc = (found && srv.description) || description || seo.meta_description || "";
  const kw = (found && srv.keywords) || keywords || "";
  const ogImage = (found && srv.og_image) || abs(image || seo.og_image || "/api/site/og-image");
  const canonical = (srv && srv.canonical) || origin + p;
  const robots = noindex ? "noindex,nofollow" : (srv && srv.robots) || "index,follow";
  const blocks = found ? (srv.jsonld || []) : (Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []);
  const ogTitle = (found && srv.og_title) || fullTitle;
  const ogDesc = (found && srv.og_description) || desc;

  return (
    <Helmet prioritizeSeoTags>
      {srv?.language && <html lang={srv.language} />}
      <title>{fullTitle}</title>
      {desc && <meta name="description" content={desc} />}
      {kw && <meta name="keywords" content={kw} />}
      <meta name="robots" content={robots} />
      {!srv?.private && <link rel="canonical" href={canonical} />}
      <meta property="og:type" content={type} />
      <meta property="og:site_name" content={(srv && srv.site_name) || siteName} />
      <meta property="og:title" content={ogTitle} />
      {ogDesc && <meta property="og:description" content={ogDesc} />}
      <meta property="og:url" content={canonical} />
      {srv?.locale && <meta property="og:locale" content={srv.locale} />}
      {ogImage && <meta property="og:image" content={ogImage} />}
      {found && srv.image_alt && <meta property="og:image:alt" content={srv.image_alt} />}
      <meta name="twitter:card" content={(srv && srv.twitter_card) || (ogImage ? "summary_large_image" : "summary")} />
      <meta name="twitter:title" content={ogTitle} />
      {ogDesc && <meta name="twitter:description" content={ogDesc} />}
      {ogImage && <meta name="twitter:image" content={ogImage} />}
      {(srv?.twitter || seo.twitter) && <meta name="twitter:site" content={srv?.twitter || seo.twitter} />}
      {blocks.map((b, i) => (
        <script key={`${b["@type"]}-${i}`} type="application/ld+json">{JSON.stringify(b).replace(/</g, "\\u003c")}</script>
      ))}
    </Helmet>
  );
}

/* ---- JSON-LD builders (fallback only; the backend engine supplies the real blocks) ---- */
export const orgJsonLd = (siteName, logo, origin, phone) => ({
  "@context": "https://schema.org", "@type": "Organization", name: siteName, url: origin,
  ...(logo ? { logo } : {}),
  ...(phone ? { contactPoint: { "@type": "ContactPoint", telephone: phone, contactType: "customer service" } } : {}),
});

export const websiteJsonLd = (siteName, origin) => ({
  "@context": "https://schema.org", "@type": "WebSite", name: siteName, url: origin,
  potentialAction: { "@type": "SearchAction", target: `${origin}/services?q={search_term_string}`, "query-input": "required name=search_term_string" },
});

export const serviceJsonLd = (svc, origin) => ({
  "@context": "https://schema.org", "@type": "Service", name: svc.name,
  description: svc.short_description || svc.description || svc.name,
  ...(svc.image || (svc.gallery && svc.gallery[0]) ? { image: svc.image || svc.gallery[0] } : {}),
  serviceType: svc.category_name || "Home Service",
  provider: { "@type": "Organization", name: "AzoApp", url: origin },
});

export const breadcrumbJsonLd = (items, origin) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: origin + (it.path || it.url || "/") })),
});
