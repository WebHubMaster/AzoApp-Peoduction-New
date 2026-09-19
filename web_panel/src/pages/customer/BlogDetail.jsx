import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Calendar, ArrowLeft, User, Tag } from "lucide-react";
import api from "@/lib/api";
import Seo from "@/components/Seo";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/MobileBottomNav";
import { useSiteConfig } from "@/context/SiteConfigContext";

const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); } catch { return ""; } };

export default function BlogDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(undefined); // undefined=loading, null=not found
  const { branding = {}, seo: siteSeo = {} } = useSiteConfig();

  useEffect(() => {
    setData(undefined);
    api.get(`/content/blog/${slug}`).then((r) => setData(r.data)).catch(() => setData(null));
    window.scrollTo(0, 0);
  }, [slug]);

  if (data === undefined) return (
    <div className="bg-white min-h-screen"><SiteNavbar />
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-4 animate-pulse">
        <div className="h-8 bg-slate-100 rounded w-3/4" /><div className="h-64 bg-slate-100 rounded-2xl" /><div className="h-4 bg-slate-100 rounded w-full" /><div className="h-4 bg-slate-100 rounded w-5/6" />
      </div>
    </div>
  );
  if (data === null) return (
    <div className="bg-white min-h-screen flex flex-col"><SiteNavbar />
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-24">
        <h1 className="font-heading font-black text-2xl text-slate-900">Article not found</h1>
        <p className="text-slate-500 mt-2">This post may have been moved or unpublished.</p>
        <button onClick={() => navigate("/blog")} className="mt-6 h-11 px-5 rounded-xl bg-[#0D47A1] text-white font-bold">Back to blog</button>
      </div>
      <SiteFooter />
    </div>
  );

  const b = data.blog || {};
  const related = data.related || [];
  const bseo = b.seo || {};
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const siteName = siteSeo.site_name || branding.site_name || "AzoApp";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": bseo.schema_type || "BlogPosting",
    headline: b.title,
    description: bseo.meta_description || b.excerpt || "",
    image: b.image ? [b.image] : undefined,
    author: { "@type": "Person", name: b.author || siteName },
    publisher: { "@type": "Organization", name: siteName, logo: branding.logo ? { "@type": "ImageObject", url: branding.logo } : undefined },
    datePublished: b.publish_at || b.created_at,
    dateModified: b.updated_at || b.publish_at || b.created_at,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${origin}/blog/${b.slug || b.id}` },
  };
  const extraJson = bseo.custom_schema ? (() => { try { return JSON.parse(bseo.custom_schema); } catch { return null; } })() : null;

  return (
    <div className="bg-white min-h-screen">
      <Seo title={bseo.seo_title || b.title} description={bseo.meta_description || b.excerpt}
        image={bseo.og_image || b.image} path={`/blog/${b.slug || b.id}`} type="article"
        noindex={bseo.robots_index === false}
        jsonLd={extraJson ? [jsonLd, extraJson] : jsonLd} />
      <SiteNavbar />
      <article className="max-w-3xl mx-auto px-5 sm:px-6 py-10">
        <button onClick={() => navigate("/blog")} className="text-sm text-slate-500 hover:text-[#0D47A1] inline-flex items-center gap-1 mb-6" data-testid="blog-back"><ArrowLeft className="h-4 w-4" />Back to blog</button>
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
          {b.category && <span className="px-2.5 py-0.5 rounded-full bg-primary-50 text-primary-700 font-semibold">{b.category}</span>}
          <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{fmtDate(b.publish_at || b.created_at)}</span>
          {b.author && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{b.author}</span>}
        </div>
        <h1 className="font-heading font-black text-3xl sm:text-4xl text-slate-900 leading-tight">{b.title}</h1>
        {b.excerpt && <p className="text-lg text-slate-500 mt-3">{b.excerpt}</p>}
        {b.image && (
          <figure className="mt-6">
            <img src={b.image} alt={b.image_alt || b.title} className="w-full rounded-2xl object-cover" />
            {b.image_caption && <figcaption className="text-xs text-slate-400 mt-2 text-center">{b.image_caption}</figcaption>}
          </figure>
        )}
        <div className="rt-editor prose prose-slate max-w-none mt-8 text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: b.body || "" }} />
        {(b.tags || []).length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-8 pt-6 border-t border-slate-100">
            <Tag className="h-4 w-4 text-slate-400" />
            {b.tags.map((t) => <span key={t} className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs">{t}</span>)}
          </div>
        )}
      </article>

      {related.length > 0 && (
        <div className="bg-slate-50/70 border-t border-slate-100 py-12">
          <div className="max-w-5xl mx-auto px-5 sm:px-6">
            <h2 className="font-heading font-extrabold text-xl text-slate-900 mb-6">Related articles</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {related.map((r) => (
                <Link key={r.id} to={`/blog/${r.slug || r.id}`} className="group rounded-2xl overflow-hidden bg-white ring-1 ring-slate-200 hover:ring-primary-300 transition-all">
                  <div className="aspect-video bg-slate-100 overflow-hidden">{r.image && <img src={r.image} alt={r.image_alt || r.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />}</div>
                  <div className="p-4"><h3 className="font-heading font-bold text-sm text-slate-900 line-clamp-2 group-hover:text-primary-700">{r.title}</h3></div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
