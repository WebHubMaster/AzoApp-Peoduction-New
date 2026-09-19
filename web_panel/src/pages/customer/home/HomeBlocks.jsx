import { useEffect, useMemo, useState } from "react";
import { Link as RLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Store, Wrench, ArrowRight, Star, Quote, Calendar } from "lucide-react";
import api from "@/lib/api";
import TestimonialCard from "@/components/TestimonialCard";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { Button } from "@/components/ui/button";
import { Container, SectionHead, Scroller, Sk, ErrorState, compactNum } from "./ui";

/* ---------- Reviews ---------- */
export function ReviewsSection() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const { stats = {} } = useSiteConfig();
  const load = () => { setError(false); api.get("/content/testimonials").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setError(true)); };
  useEffect(load, []);
  if (error) return <Container className="py-8"><ErrorState onRetry={load} text="We couldn't load customer reviews." /></Container>;
  if (items === null) return <Container className="py-12"><Sk className="h-6 w-56 mb-5" /><div className="flex gap-5 overflow-hidden">{[0, 1, 2].map((i) => <Sk key={i} className="w-[320px] h-[260px] shrink-0" />)}</div></Container>;
  if (!items.length) return null;
  const avg = items.reduce((a, t) => a + (Number(t.rating) || 0), 0) / items.length;
  return (
    <section className="py-10 sm:py-16 bg-slate-50/70 border-y border-slate-100" data-testid="home-reviews">
      <Container>
        <SectionHead eyebrow="Loved by customers" title="What our customers say"
          right={(
            <div className="flex items-center gap-3 rounded-2xl bg-white ring-1 ring-slate-200 px-4 py-2.5" data-testid="reviews-summary">
              <Quote className="h-5 w-5 text-primary-700" />
              <div><p className="font-heading font-extrabold text-slate-900 leading-none inline-flex items-center gap-1">{avg.toFixed(1)} <Star className="h-4 w-4 fill-amber-400 text-amber-400" /></p><p className="text-[11px] text-slate-500 mt-0.5">{items.length} featured review{items.length === 1 ? "" : "s"}{stats.reviews && (typeof stats.reviews === "string" || Number(stats.reviews) > 0) ? ` · ${compactNum(stats.reviews)} total` : ""}</p></div>
            </div>
          )} />
        <Scroller testId="home-reviews-row">
          {items.map((t) => <TestimonialCard key={t.id} t={t} className="min-w-[300px] max-w-[340px] snap-start shadow-[0_8px_30px_-16px_rgba(15,23,42,0.25)]" />)}
        </Scroller>
      </Container>
    </section>
  );
}

/* ---------- Partner / Merchant CTA ---------- */
export function GrowCta({ navigate }) {
  const { stats = {}, branding = {} } = useSiteConfig();
  const partners = compactNum(stats.partners); const merchants = compactNum(stats.merchants);
  return (
    <section className="py-10 sm:py-16" data-testid="home-grow-cta">
      <Container>
        <div className="grid md:grid-cols-2 gap-5">
          <div className="relative rounded-[28px] bg-primary-700 text-white p-8 sm:p-10 overflow-hidden group">
            <div className="absolute -right-12 -bottom-12 h-56 w-56 rounded-full bg-white/10 group-hover:scale-110 transition-transform duration-700" />
            <span className="h-12 w-12 rounded-2xl bg-white/15 ring-1 ring-white/20 flex items-center justify-center"><Store className="h-6 w-6" /></span>
            <h3 className="font-heading font-extrabold text-2xl sm:text-3xl mt-5">Are you a shopkeeper?</h3>
            <p className="text-primary-100 mt-2 max-w-sm">Refer partners &amp; book services for your customers. Earn <b className="text-white">lifetime commission</b> on every job.</p>
            {merchants !== null && (typeof stats.merchants === "string" || Number(stats.merchants) > 0) && <p className="text-xs text-primary-100/80 mt-3">{merchants} merchant{Number(stats.merchants) === 1 ? "" : "s"} already earning with {branding.site_name || "AzoApp"}</p>}
            <Button data-testid="cta-merchant" onClick={() => navigate("/login")} className="mt-6 h-11 rounded-xl bg-white text-primary-700 hover:bg-primary-50 font-bold">Join as Merchant <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
          <div className="relative rounded-[28px] bg-slate-900 text-white p-8 sm:p-10 overflow-hidden group">
            <div className="absolute -right-12 -bottom-12 h-56 w-56 rounded-full bg-amber-400/10 group-hover:scale-110 transition-transform duration-700" />
            <span className="h-12 w-12 rounded-2xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center"><Wrench className="h-6 w-6 text-amber-300" /></span>
            <h3 className="font-heading font-extrabold text-2xl sm:text-3xl mt-5">Skilled professional?</h3>
            <p className="text-slate-300 mt-2 max-w-sm">Get verified, receive nearby job requests, and grow your earnings with transparent payouts.</p>
            {partners !== null && (typeof stats.partners === "string" || Number(stats.partners) > 0) && <p className="text-xs text-slate-400 mt-3">Join {partners} verified partners on the platform</p>}
            <Button data-testid="cta-partner" onClick={() => navigate("/login")} className="mt-6 h-11 rounded-xl bg-amber-400 text-slate-900 hover:bg-amber-300 font-bold">Become a Partner <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ---------- FAQ ---------- */
const FaqItem = ({ f, isOpen, onToggle }) => (
  <div className={`bg-white rounded-2xl ring-1 transition-all ${isOpen ? "ring-primary-300 shadow-[0_12px_30px_-18px_rgba(13,71,161,0.35)]" : "ring-slate-200 hover:ring-slate-300"}`}>
    <button onClick={onToggle} aria-expanded={isOpen} data-testid={`faq-${f.id}`} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left">
      <span className="font-semibold text-slate-800 text-[15px]">{f.question}</span>
      <span className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${isOpen ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-500"}`}><ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} /></span>
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
          <div className="rt-editor px-5 pb-5 text-sm text-slate-600 leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: f.answer || "" }} />
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

export function FaqSection({ title, subtitle, seeded }) {
  const [groups, setGroups] = useState(null);
  const [open, setOpen] = useState({});
  const [q, setQ] = useState("");
  useEffect(() => {
    api.get("/content/faqs/grouped")
      .then((r) => setGroups(Array.isArray(r.data) ? r.data : []))
      .catch(() => {
        // fallback to flat list grouped under "General"
        api.get("/content/faqs").then((r) => {
          const list = Array.isArray(r.data) ? r.data : [];
          const b = {}; list.forEach((f) => { const c = f.category || "General"; (b[c] = b[c] || []).push(f); });
          setGroups(Object.entries(b).map(([category, faqs]) => ({ category, faqs })));
        }).catch(() => setGroups(seeded ? [{ category: "General", faqs: seeded }] : []));
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    if (!groups) return null;
    const needle = q.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, faqs: (g.faqs || []).filter((f) => !needle || `${f.question} ${f.answer}`.toLowerCase().includes(needle)) }))
      .filter((g) => g.faqs.length);
  }, [groups, q]);

  const totalFaqs = (groups || []).reduce((a, g) => a + (g.faqs?.length || 0), 0);
  const stripHtml = (h) => { const d = document.createElement("div"); d.innerHTML = h || ""; return (d.textContent || "").trim(); };
  const jsonLd = useMemo(() => {
    const items = [];
    (groups || []).forEach((g) => (g.faqs || []).forEach((f) => items.push({
      "@type": "Question", name: f.question,
      acceptedAnswer: { "@type": "Answer", text: stripHtml(f.answer) },
    })));
    return items.length ? { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: items } : null;
  }, [groups]);

  if (groups && !totalFaqs) return null;

  return (
    <section className="py-12 sm:py-16 bg-slate-50/70 border-t border-slate-100" data-testid="home-faq">
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}
      <Container>
        <div className="max-w-5xl mx-auto">
          <SectionHead align="center" eyebrow="Got questions?" title={title || "Frequently asked questions"} subtitle={subtitle} />
          {totalFaqs > 4 && (
            <div className="relative max-w-md mx-auto -mt-2 mb-8">
              <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions…" data-testid="faq-search" className="w-full h-11 pl-10 pr-4 rounded-xl bg-white ring-1 ring-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
            </div>
          )}
          {!groups ? (
            <div className="grid md:grid-cols-2 gap-4">{[0, 1, 2, 3].map((i) => <Sk key={i} className="h-14" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-6">No questions match “{q}”.</p>
          ) : (
            <div className="space-y-9">
              {filtered.map((g) => (
                <div key={g.category} data-testid={`faq-cat-${g.category}`}>
                  <h3 className="font-heading font-extrabold text-lg text-slate-900 mb-4 flex items-center gap-2">
                    <span className="h-6 w-1.5 rounded-full bg-primary-700" />{g.category}
                    <span className="text-xs font-medium text-slate-400">({g.faqs.length})</span>
                  </h3>
                  <div className="grid md:grid-cols-2 gap-4 items-start">
                    {(() => { const cols = [[], []]; g.faqs.forEach((f, i) => cols[i % 2].push(f));
                      return cols.map((col, ci) => <div key={ci} className="space-y-4">{col.map((f) => <FaqItem key={f.id} f={f} isOpen={!!open[f.id]} onToggle={() => setOpen((o) => ({ ...o, [f.id]: !o[f.id] }))} />)}</div>);
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

/* ---------- Blog / Latest Insights ---------- */
export function BlogSection({ title, subtitle, seeded, limit }) {
  const [blogs, setBlogs] = useState(seeded && seeded.length ? seeded : null);
  useEffect(() => {
    if (seeded && seeded.length) { setBlogs(seeded); return; }
    api.get("/content/blogs").then((r) => setBlogs(Array.isArray(r.data) ? r.data : [])).catch(() => setBlogs([]));
  }, [seeded]);
  const list = (blogs || []).slice(0, limit || 3);
  if (blogs && !list.length) return null;
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }); } catch { return ""; } };
  return (
    <section className="py-12 sm:py-16 bg-white border-t border-slate-100" data-testid="home-blog">
      <Container>
        <SectionHead eyebrow={subtitle || "Insights"} title={title || "Latest from our blog"}
          right={<RLink to="/blog" className="text-sm font-semibold text-primary-700 inline-flex items-center gap-1 hover:gap-2 transition-all" data-testid="blog-see-all">View all <ArrowRight className="h-4 w-4" /></RLink>} />
        {!blogs ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <Sk key={i} className="h-72" />)}</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {list.map((b) => (
              <RLink key={b.id} to={`/blog/${b.slug || b.id}`} data-testid={`blog-card-${b.slug || b.id}`}
                className="group rounded-2xl overflow-hidden bg-white ring-1 ring-slate-200 hover:ring-primary-300 hover:shadow-[0_18px_40px_-24px_rgba(13,71,161,0.4)] transition-all">
                <div className="aspect-video bg-slate-100 overflow-hidden">
                  {b.image ? <img src={b.image} alt={b.image_alt || b.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Quote className="h-8 w-8" /></div>}
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-2">
                    {b.category && <span className="px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 font-semibold">{b.category}</span>}
                    {b.publish_at || b.created_at ? <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(b.publish_at || b.created_at)}</span> : null}
                  </div>
                  <h3 className="font-heading font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-primary-700">{b.title}</h3>
                  <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">{b.excerpt}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700">Read more <ArrowRight className="h-4 w-4" /></span>
                </div>
              </RLink>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
