import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Users, Wrench, CheckCircle2, Navigation } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/MobileBottomNav";
import ServiceSearch from "@/components/site/ServiceSearch";
import Seo, { breadcrumbJsonLd } from "@/components/Seo";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { Container, SectionHead, Scroller, EmptyState, ErrorState, Sk } from "./home/ui";
import { CategoryCard, ServiceCard } from "./home/HomeSections";
import { GrowCta } from "./home/HomeBlocks";

const titleCase = (s) => (s || "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function CityPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { branding = {} } = useSiteConfig();
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");
  const load = () => { setState("loading"); api.get(`/site/city/${slug}`).then((r) => { setD(r.data); setState("ok"); }).catch((e) => setState(e?.response?.status === 404 ? "notfound" : "error")); };
  useEffect(load, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  const site = branding.site_name || "AzoApp";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const setLocation = () => { localStorage.setItem("azo_location", d.city); window.dispatchEvent(new Event("azo-location-changed")); toast.success(`Location set to ${d.city}`); navigate("/services"); };

  if (state === "notfound") {
    return (
      <div className="bg-white min-h-screen"><SiteNavbar /><Container className="py-24"><EmptyState testId="city-notfound" title="We don't serve this city yet" subtitle="Browse our services or pick another city from the footer." /><div className="text-center mt-6"><Link to="/services" className="text-primary-700 font-semibold">Browse all services →</Link></div></Container><SiteFooter /></div>
    );
  }

  const s = d?.stats || {};
  const cityName = d?.city || titleCase(slug);
  const popularIds = new Set(d?.popular_service_ids || []);

  return (
    <div className="bg-white min-h-screen" data-testid="city-page">
      {d && (
        <Seo title={`Home services in ${cityName}${d.categories.length ? ` — ${d.categories.slice(0, 3).map((c) => c.name).join(", ")} & more` : ""}`}
          description={`Book verified professionals in ${cityName}${d.areas?.length ? ` (${d.areas.join(", ")})` : ""}: ${d.categories.slice(0, 5).map((c) => c.name).join(", ")}. ${s.jobs_done > 0 ? `${s.jobs_done} jobs completed` : "Transparent pricing"}${s.rating > 0 ? `, rated ${s.rating}★ by ${s.reviews} customers` : ""}.`}
          path={`/city/${slug}`}
          jsonLd={[
            breadcrumbJsonLd([{ name: "Home", url: "/" }, { name: `Home services in ${cityName}`, url: `/city/${slug}` }], origin),
            { "@context": "https://schema.org", "@type": "Service", name: `Home services in ${cityName}`, provider: { "@type": "Organization", name: site, url: origin },
              areaServed: { "@type": "City", name: cityName, ...(d.lat && d.lng ? { geo: { "@type": "GeoCoordinates", latitude: d.lat, longitude: d.lng } } : {}) },
              ...(s.rating > 0 && s.reviews > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: s.rating, reviewCount: s.reviews } } : {}),
              hasOfferCatalog: { "@type": "OfferCatalog", name: `Services in ${cityName}`, itemListElement: (d.services || []).slice(0, 10).map((x) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: x.name }, price: x.discounted_price > 0 ? x.discounted_price : x.base_price, priceCurrency: "INR" })) } },
          ]} />
      )}
      <SiteNavbar />

      <section className="relative overflow-hidden" data-testid="city-hero">
        <div className="absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_at_top_left,rgba(13,71,161,0.12),transparent_55%)]" />
        <Container className="pt-8 sm:pt-12 pb-10">
          <nav className="text-xs text-slate-500 flex items-center gap-1.5 mb-5" aria-label="Breadcrumb"><Link to="/" className="hover:text-primary-700">Home</Link><span>/</span><span className="text-slate-800 font-medium">{cityName}</span></nav>
          {state === "loading" && !d ? <div className="space-y-4"><Sk className="h-8 w-56 rounded-full" /><Sk className="h-16 w-3/4" /><Sk className="h-6 w-1/2" /><Sk className="h-14 w-full max-w-2xl" /></div> : state === "error" ? <ErrorState onRetry={load} text="We couldn't load this city page." /> : (
            <div className="grid lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-7">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-primary-50 ring-1 ring-primary-100 px-3.5 py-1.5 text-xs font-semibold text-primary-800"><MapPin className="h-4 w-4" /> Now serving {cityName}{d.areas?.length ? ` · ${d.areas.join(", ")}` : ""}</motion.div>
                <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="font-heading font-black text-4xl sm:text-5xl lg:text-6xl tracking-tight text-slate-900 leading-[1.05] mt-4">Home services in <span className="text-primary-700">{cityName}</span></motion.h1>
                <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 text-slate-500 text-base sm:text-lg max-w-xl">Verified professionals across {s.services} service{s.services === 1 ? "" : "s"} — upfront pricing, live tracking, doorstep in {cityName}.</motion.p>
                <div className="mt-6 max-w-2xl"><ServiceSearch variant="hero" placeholder={`Search services in ${cityName}…`} /></div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button onClick={setLocation} data-testid="city-set-location" className="h-11 px-5 rounded-xl bg-primary-700 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-primary-800 shadow-sm shadow-primary-700/25"><Navigation className="h-4 w-4" /> Book in {cityName}</button>
                  <button onClick={() => navigate("/services")} className="h-11 px-5 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold hover:ring-primary-300 hover:text-primary-700 transition-colors">Browse all services</button>
                </div>
              </div>
              <div className="lg:col-span-5 grid grid-cols-2 gap-3" data-testid="city-stats">
                {[
                  [Wrench, s.services, "Services available", "primary"],
                  [Users, d.categories.length, "Categories", "emerald"],
                  [CheckCircle2, s.jobs_done, "Jobs completed here", "sky"],
                  [MapPin, d.pincodes.length || d.areas.length, d.pincodes.length ? "Pincodes covered" : "Areas covered", "amber"],
                ].map(([Icon, v, l, tone]) => (
                  <div key={l} data-testid={`city-stat-${l.toLowerCase().replace(/\s+/g, "-")}`} className="rounded-3xl bg-white ring-1 ring-slate-200/80 p-5 shadow-[0_8px_30px_-16px_rgba(15,23,42,0.2)]">
                    <span className={`h-10 w-10 rounded-xl flex items-center justify-center ${{ primary: "bg-primary-50 text-primary-700", emerald: "bg-emerald-50 text-emerald-600", sky: "bg-sky-50 text-sky-600", amber: "bg-amber-50 text-amber-600" }[tone]}`}><Icon className="h-5 w-5" /></span>
                    <p className="font-heading font-extrabold text-2xl text-slate-900 mt-3 tabular-nums">{v ?? 0}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{l}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Container>
      </section>

      {d && (
        <>
          <section className="py-10 sm:py-14 bg-slate-50/70 border-y border-slate-100" data-testid="city-categories">
            <Container>
              <SectionHead eyebrow="Categories" title={`What ${cityName} books most`} onSeeAll={() => navigate("/services")} />
              {d.categories.length === 0 ? <EmptyState title="No categories available in this city yet" /> : <Scroller testId="city-categories-row">{d.categories.map((c, i) => <CategoryCard key={c.id} c={c} navigate={navigate} testId={`city-cat-${i}`} />)}</Scroller>}
            </Container>
          </section>

          <section className="py-10 sm:py-14" data-testid="city-services">
            <Container>
              <SectionHead eyebrow={popularIds.size ? "Ranked by real bookings" : "Available now"} title={`Popular services in ${cityName}`} onSeeAll={() => navigate("/services")} />
              {d.services.length === 0 ? <EmptyState title={`No services listed for ${cityName} yet`} subtitle="We're onboarding professionals here — check back soon." /> : (
                <Scroller testId="city-services-row">{d.services.map((x, i) => <ServiceCard key={x.id} s={x} navigate={navigate} testId={`city-svc-${i}`} badge={popularIds.has(x.id) ? <>Popular in {cityName}</> : null} />)}</Scroller>
              )}
            </Container>
          </section>

          <section className="py-10 sm:py-14 bg-slate-50/70 border-y border-slate-100" data-testid="city-coverage">
            <Container>
              <div className="grid lg:grid-cols-2 gap-8">
                <div>
                  <SectionHead eyebrow="Coverage" title={`Areas we cover in ${cityName}`} />
                  <div className="flex flex-wrap gap-2">
                    {d.areas.map((a) => <span key={a} className="inline-flex items-center gap-1.5 rounded-xl bg-white ring-1 ring-slate-200 px-3 py-2 text-sm font-medium text-slate-700"><MapPin className="h-3.5 w-3.5 text-primary-600" />{a}</span>)}
                    {d.pincodes.map((p) => <span key={p} className="rounded-xl bg-primary-50 ring-1 ring-primary-100 px-3 py-2 text-sm font-mono font-semibold text-primary-800">{p}</span>)}
                  </div>
                </div>
                {d.other_cities.length > 0 && (
                  <div data-testid="city-others">
                    <SectionHead eyebrow="Also serving" title="Other cities" />
                    <div className="flex flex-wrap gap-2">
                      {d.other_cities.map((c) => <Link key={c.slug} to={`/city/${c.slug}`} data-testid={`city-link-${c.slug}`} className="inline-flex items-center gap-2 rounded-xl bg-white ring-1 ring-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:ring-primary-300 hover:text-primary-700 transition-colors"><Users className="h-4 w-4 text-slate-400" />{c.city}</Link>)}
                    </div>
                  </div>
                )}
              </div>
            </Container>
          </section>

          <GrowCta navigate={navigate} />
        </>
      )}
      <SiteFooter />
      <MobileBottomNav />
    </div>
  );
}
