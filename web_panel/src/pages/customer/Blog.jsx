import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Calendar, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import Seo from "@/components/Seo";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/MobileBottomNav";

const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } };

export default function Blog() {
  const [blogs, setBlogs] = useState(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  useEffect(() => { api.get("/content/blogs").then((r) => setBlogs(Array.isArray(r.data) ? r.data : [])).catch(() => setBlogs([])); }, []);

  const cats = useMemo(() => Array.from(new Set((blogs || []).map((b) => b.category).filter(Boolean))), [blogs]);
  const list = (blogs || []).filter((b) => (!cat || b.category === cat) && (!q || `${b.title} ${b.excerpt} ${(b.tags || []).join(" ")}`.toLowerCase().includes(q.toLowerCase())));
  const featured = list[0];

  return (
    <div className="bg-white min-h-screen">
      <Seo title="Blog & Insights" description="Tips, guides and updates on home services, maintenance and more." path="/blog" />
      <SiteNavbar />
      <div className="bg-gradient-to-b from-[#0D47A1] to-[#0b3c88] text-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14">
          <h1 className="font-heading font-black text-3xl sm:text-4xl">Our Blog</h1>
          <p className="text-blue-100 mt-2 max-w-xl">Expert tips, how-to guides and the latest updates from our team.</p>
          <div className="relative max-w-md mt-6">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search articles…" data-testid="blog-search"
              className="w-full h-12 pl-10 pr-4 rounded-xl bg-white text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-white/50" />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-10">
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button onClick={() => setCat("")} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${!cat ? "bg-[#0D47A1] text-white" : "bg-slate-100 text-slate-600"}`}>All</button>
            {cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`px-4 py-1.5 rounded-full text-sm font-semibold ${cat === c ? "bg-[#0D47A1] text-white" : "bg-slate-100 text-slate-600"}`}>{c}</button>)}
          </div>
        )}

        {blogs === null ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 rounded-2xl bg-slate-100 animate-pulse" />)}</div>
        ) : list.length === 0 ? (
          <p className="text-center text-slate-400 py-20">No articles found.</p>
        ) : (
          <>
            {featured && !q && !cat && (
              <Link to={`/blog/${featured.slug || featured.id}`} className="group grid md:grid-cols-2 gap-6 rounded-3xl overflow-hidden ring-1 ring-slate-200 hover:ring-primary-300 mb-10" data-testid="blog-featured">
                <div className="aspect-video md:aspect-auto bg-slate-100 overflow-hidden">
                  {featured.image && <img src={featured.image} alt={featured.image_alt || featured.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />}
                </div>
                <div className="p-6 sm:p-8 flex flex-col justify-center">
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                    {featured.category && <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-semibold">{featured.category}</span>}
                    <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(featured.publish_at || featured.created_at)}</span>
                  </div>
                  <h2 className="font-heading font-black text-2xl text-slate-900 group-hover:text-primary-700 leading-tight">{featured.title}</h2>
                  <p className="text-slate-500 mt-3 line-clamp-3">{featured.excerpt}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary-700">Read article <ArrowRight className="h-4 w-4" /></span>
                </div>
              </Link>
            )}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {(featured && !q && !cat ? list.slice(1) : list).map((b) => (
                <Link key={b.id} to={`/blog/${b.slug || b.id}`} data-testid={`blog-card-${b.slug || b.id}`}
                  className="group rounded-2xl overflow-hidden bg-white ring-1 ring-slate-200 hover:ring-primary-300 hover:shadow-[0_18px_40px_-24px_rgba(13,71,161,0.4)] transition-all">
                  <div className="aspect-video bg-slate-100 overflow-hidden">
                    {b.image && <img src={b.image} alt={b.image_alt || b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />}
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-2">
                      {b.category && <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-semibold">{b.category}</span>}
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(b.publish_at || b.created_at)}</span>
                    </div>
                    <h3 className="font-heading font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-primary-700">{b.title}</h3>
                    <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">{b.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
