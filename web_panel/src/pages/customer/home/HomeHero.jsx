import { useMemo } from "react";
import { motion } from "framer-motion";
import * as Icons from "lucide-react";
import { ShieldCheck, Star, Wrench, ChevronRight, BadgeCheck, Clock, IndianRupee, Users } from "lucide-react";
import ServiceSearch from "@/components/site/ServiceSearch";
import SmartImage from "@/components/site/SmartImage";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { Container, iconName, compactNum, Sk } from "./ui";

const fade = (d = 0) => ({ initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, delay: d, ease: "easeOut" } });

export default function HomeHero({ categories, banners, loaded, navigate, city, onCategory }) {
  const { stats = {}, branding = {} } = useSiteConfig();
  const tiles = useMemo(() => (categories || []).filter((c) => c.show_on_home !== false).slice(0, 8), [categories]);
  const visuals = (banners || []).filter((b) => b.desktop_image || b.image).slice(0, 3);
  const rating = compactNum(stats.rating);
  const jobs = compactNum(stats.jobs_done);
  const pros = compactNum(stats.verified_partners ?? stats.partners);
  const reviews = compactNum(stats.reviews);

  return (
    <section className="relative overflow-hidden bg-white" data-testid="home-hero">
      <div className="absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(ellipse_at_top_left,rgba(13,71,161,0.10),transparent_55%),radial-gradient(ellipse_at_top_right,rgba(13,71,161,0.06),transparent_50%)]" />
      <Container className="pt-8 sm:pt-12 lg:pt-16 pb-10 lg:pb-16">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7">
            <motion.div {...fade(0)} className="inline-flex items-center gap-2 rounded-full bg-primary-50 ring-1 ring-primary-100 px-3.5 py-1.5">
              <ShieldCheck className="h-4 w-4 text-primary-700" />
              <span className="text-xs font-semibold text-primary-800">{branding.tagline || `${branding.site_name || "AzoApp"} — verified home services`}</span>
            </motion.div>
            <motion.h1 {...fade(0.05)} className="font-heading font-black text-4xl sm:text-5xl lg:text-6xl tracking-tight text-slate-900 leading-[1.04] mt-5">
              Premium home services,<br /><span className="text-primary-700">at your doorstep</span>
            </motion.h1>
            <motion.p {...fade(0.1)} className="mt-5 text-slate-500 text-base sm:text-lg max-w-xl leading-relaxed">
              Background-verified professionals, upfront pricing and on-time service{city ? <> in <span className="font-semibold text-slate-700">{city}</span></> : ""}. Book in seconds, pay securely.
            </motion.p>

            <motion.div {...fade(0.15)} className="mt-7 max-w-2xl">
              <ServiceSearch variant="hero" placeholder="Search for AC service, cleaning, electrician…" />
              <div className="flex items-center gap-2 mt-3 flex-wrap" data-testid="hero-quick-links">
                <span className="text-xs text-slate-400 font-medium">Popular:</span>
                {!loaded && [0, 1, 2, 3].map((i) => <Sk key={i} className="h-7 w-24 rounded-full" />)}
                {tiles.slice(0, 5).map((c) => (
                  <button key={c.id} onClick={() => (onCategory ? onCategory(c) : navigate(`/services?category=${c.id}`))} data-testid={`hero-chip-${c.id}`}
                    className="h-8 px-3 rounded-full bg-white ring-1 ring-slate-200 text-xs font-semibold text-slate-700 hover:ring-primary-400 hover:text-primary-700 hover:-translate-y-px transition-all">{c.name}</button>
                ))}
              </div>
            </motion.div>

            <motion.div {...fade(0.2)} className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4" data-testid="hero-stats">
              {rating && (typeof stats.rating === "string" || Number(stats.rating) > 0) && (
                <div className="flex items-center gap-2.5">
                  <span className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /></span>
                  <div><p className="font-heading font-extrabold text-xl text-slate-900 leading-none">{rating}<span className="text-amber-500">★</span></p><p className="text-xs text-slate-500 mt-1">{reviews && (typeof stats.reviews === "string" || Number(stats.reviews) > 0) ? `${reviews} reviews` : "Average rating"}</p></div>
                </div>
              )}
              {jobs !== null && (
                <div className="flex items-center gap-2.5">
                  <span className="h-10 w-10 rounded-xl bg-primary-50 flex items-center justify-center"><BadgeCheck className="h-5 w-5 text-primary-700" /></span>
                  <div><p className="font-heading font-extrabold text-xl text-slate-900 leading-none">{jobs}</p><p className="text-xs text-slate-500 mt-1">Jobs completed</p></div>
                </div>
              )}
              {pros !== null && (
                <div className="flex items-center gap-2.5">
                  <span className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Users className="h-5 w-5 text-emerald-600" /></span>
                  <div><p className="font-heading font-extrabold text-xl text-slate-900 leading-none">{pros}</p><p className="text-xs text-slate-500 mt-1">Verified pros</p></div>
                </div>
              )}
            </motion.div>
          </div>

          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }} className="lg:col-span-5">
            {visuals.length > 0 ? (
              <div className="relative" data-testid="hero-visuals">
                <div className={`grid gap-3 sm:gap-4 ${visuals.length > 1 ? "grid-cols-2" : "grid-cols-1"} h-[320px] sm:h-[420px] lg:h-[480px]`}>
                  <button onClick={() => visuals[0].link && navigate(visuals[0].link)} className={`relative rounded-[28px] overflow-hidden group ring-1 ring-slate-200/60 ${visuals.length > 2 ? "row-span-2" : ""}`}>
                    <SmartImage src={visuals[0].desktop_image || visuals[0].image} alt={visuals[0].title || ""} className="group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 text-left text-white">
                      <p className="font-heading font-bold text-lg leading-tight">{visuals[0].title}</p>
                      {visuals[0].subtitle && <p className="text-xs text-white/80 mt-0.5 line-clamp-1">{visuals[0].subtitle}</p>}
                    </div>
                  </button>
                  {visuals.slice(1).map((b) => (
                    <button key={b.id} onClick={() => b.link && navigate(b.link)} className="relative rounded-[28px] overflow-hidden group ring-1 ring-slate-200/60">
                      <SmartImage src={b.desktop_image || b.image} alt={b.title || ""} className="group-hover:scale-105 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-transparent to-transparent" />
                      <p className="absolute bottom-3 left-4 right-4 text-left text-white font-heading font-bold text-sm leading-tight">{b.title}</p>
                    </button>
                  ))}
                </div>
                {pros !== null && (
                  <div className="absolute -bottom-5 left-5 bg-white rounded-2xl shadow-xl ring-1 ring-slate-100 px-4 py-3 flex items-center gap-3">
                    <span className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center"><ShieldCheck className="h-5 w-5 text-emerald-600" /></span>
                    <div><p className="text-sm font-heading font-bold text-slate-900 leading-none">Verified &amp; insured</p><p className="text-xs text-slate-500 mt-1">{pros} background-checked pros</p></div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 sm:gap-4" data-testid="hero-category-tiles">
                {!loaded && Array.from({ length: 8 }).map((_, i) => <Sk key={i} className="aspect-square" />)}
                {tiles.map((c, i) => {
                  const Icon = Icons[iconName(c.icon)] || Wrench;
                  return (
                    <button key={c.id} data-testid={`hero-cat-${i}`} onClick={() => (onCategory ? onCategory(c) : navigate(`/services?category=${c.id}`))} className="group flex flex-col items-center text-center">
                      <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-primary-50 ring-1 ring-slate-100 group-hover:ring-primary-300 transition-all flex items-center justify-center">
                        {c.image ? <SmartImage src={c.image} alt={c.name} className="group-hover:scale-105 transition-transform duration-500" /> : <Icon className="h-7 w-7 text-primary-700" strokeWidth={1.5} />}
                      </div>
                      <p className="text-[11px] sm:text-xs font-semibold text-slate-700 group-hover:text-primary-700 mt-2 leading-tight line-clamp-2">{c.name}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

export function TrustBar() {
  const { stats = {} } = useSiteConfig();
  const rating = stats.rating && (typeof stats.rating === "string" || Number(stats.rating) > 0) ? `Rated ${stats.rating}★ by customers` : "Rated by real customers";
  const items = [
    [ShieldCheck, "Verified Professionals", stats.verified_partners ? `${compactNum(stats.verified_partners)} KYC-verified experts` : "Background-checked experts"],
    [Star, "Quality Guaranteed", rating],
    [Clock, "On-time Service", "Live tracking, punctual arrival"],
    [IndianRupee, "Transparent Pricing", "Upfront quotes, no hidden charges"],
  ];
  return (
    <section className="border-y border-slate-100 bg-slate-50/70" data-testid="home-trust">
      <Container className="py-5 sm:py-6 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {items.map(([Icon, t, s]) => (
          <div key={t} className="flex items-start gap-3">
            <span className="h-10 w-10 rounded-xl bg-white ring-1 ring-slate-200 flex items-center justify-center shrink-0"><Icon className="h-5 w-5 text-primary-700" strokeWidth={1.6} /></span>
            <div className="min-w-0"><p className="font-semibold text-slate-900 text-sm leading-tight">{t}</p><p className="text-xs text-slate-500 mt-0.5 truncate">{s}</p></div>
          </div>
        ))}
      </Container>
    </section>
  );
}
