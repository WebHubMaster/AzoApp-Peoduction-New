import * as Icons from "lucide-react";
import { Star, Wrench, ArrowRight, MapPin, Clock } from "lucide-react";
import { fmt } from "@/lib/api";
import SmartImage from "@/components/site/SmartImage";
import { Container, SectionHead, Scroller, EmptyState, iconName, compactNum } from "./ui";

export function CategoryCard({ c, navigate, testId, onOpen }) {
  const Icon = Icons[iconName(c.icon)] || Wrench;
  return (
    <button onClick={() => (onOpen ? onOpen(c) : navigate(`/services?category=${c.id}`))} data-testid={testId}
      className="group snap-start shrink-0 w-[150px] sm:w-[176px] text-left rounded-3xl bg-white ring-1 ring-slate-200/80 p-2.5 hover:ring-primary-300 hover:shadow-[0_16px_40px_-18px_rgba(13,71,161,0.35)] hover:-translate-y-1 transition-all duration-300">
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-primary-50">
        {c.image ? <SmartImage src={c.image} alt={c.name} className="group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center"><Icon className="h-9 w-9 text-primary-700" strokeWidth={1.5} /></div>}
      </div>
      <div className="px-1.5 pt-3 pb-1">
        <p className="font-semibold text-slate-900 text-sm leading-tight line-clamp-1">{c.name}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">{c.service_count > 0 ? `${c.service_count} service${c.service_count === 1 ? "" : "s"}` : "Explore"}</p>
      </div>
    </button>
  );
}

export function ServiceCard({ s, navigate, badge, testId }) {
  const hasOff = s.discounted_price > 0 && s.discounted_price < s.base_price;
  const price = hasOff ? s.discounted_price : s.base_price;
  const off = hasOff ? Math.round((1 - s.discounted_price / s.base_price) * 100) : 0;
  const rating = Number(s.rating) > 0 ? Number(s.rating).toFixed(1) : null;
  return (
    <button onClick={() => navigate(`/service/${s.id}`)} data-testid={testId}
      className="group snap-start shrink-0 w-[240px] sm:w-[268px] text-left rounded-3xl bg-white ring-1 ring-slate-200/80 overflow-hidden hover:ring-primary-300 hover:shadow-[0_20px_50px_-20px_rgba(13,71,161,0.35)] hover:-translate-y-1 transition-all duration-300 flex flex-col">
      <div className="relative h-[170px] sm:h-[190px] bg-slate-100 overflow-hidden">
        {s.image ? <SmartImage src={s.image} alt={s.name} className="group-hover:scale-105 transition-transform duration-500" /> : <div className="w-full h-full flex items-center justify-center text-slate-300"><Wrench className="h-8 w-8" /></div>}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {off > 0 && <span className="bg-primary-700 text-white text-[11px] font-bold px-2 py-1 rounded-lg shadow">{off}% OFF</span>}
          {badge && <span className="bg-white/95 text-slate-900 text-[11px] font-bold px-2 py-1 rounded-lg shadow inline-flex items-center gap-1">{badge}</span>}
        </div>
        {rating && (
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 bg-white/95 backdrop-blur rounded-lg px-2 py-1 text-xs font-bold text-slate-900 shadow-sm">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{rating}{s.review_count > 0 && <span className="text-slate-400 font-medium">({compactNum(s.review_count)})</span>}
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        {s.category_name && <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-700 truncate">{s.category_name}</p>}
        <h3 className="font-heading font-bold text-slate-900 mt-1 leading-snug line-clamp-2">{s.name}</h3>
        {s.duration_min > 0 && <p className="text-xs text-slate-500 mt-1 inline-flex items-center gap-1"><Clock className="h-3 w-3" />{s.duration_min >= 60 ? `${Math.floor(s.duration_min / 60)}h${s.duration_min % 60 ? ` ${s.duration_min % 60}m` : ""}` : `${s.duration_min} min`}</p>}
        <div className="flex items-end justify-between gap-2 mt-auto pt-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Starts at</p>
            <div className="flex items-baseline gap-1.5"><p className="font-heading font-extrabold text-lg text-slate-900">{fmt(price)}</p>{off > 0 && <span className="text-xs text-slate-400 line-through">{fmt(s.base_price)}</span>}</div>
          </div>
          <span className="h-9 px-3 rounded-xl bg-primary-50 text-primary-700 text-xs font-bold inline-flex items-center gap-1 group-hover:bg-primary-700 group-hover:text-white transition-colors">Book <ArrowRight className="h-3.5 w-3.5" /></span>
        </div>
      </div>
    </button>
  );
}

export function CategoriesSection({ sec, navigate, onCategory }) {
  const data = sec.data || [];
  return (
    <section className="py-10 sm:py-14" data-testid="home-categories">
      <Container>
        <SectionHead eyebrow={sec.subtitle || "Categories"} title={sec.title || "What do you need today?"} onSeeAll={() => navigate("/services")} />
        {data.length === 0 ? <EmptyState title="No categories available yet" subtitle="Services will appear here as soon as they are published." /> : (
          <Scroller testId="home-categories-row">{data.map((c, i) => <CategoryCard key={c.id} c={c} navigate={navigate} onOpen={onCategory} testId={`home-cat-${i}`} />)}</Scroller>
        )}
      </Container>
    </section>
  );
}

export function ServicesSection({ sec, navigate, city, tone = "white" }) {
  const data = sec.data || [];
  const trending = sec.type === "trending_services";
  const cfg = sec.config || {};
  const cityBased = trending && cfg.city_based && city;
  const title = sec.title || (trending ? (cityBased ? `Popular services near ${city}` : "Trending services") : "Services");
  const eyebrow = trending ? (cfg.demand_based ? `Based on real bookings${cityBased ? ` near ${city}` : ""}` : sec.subtitle || "Popular") : sec.subtitle || "Handpicked";
  return (
    <section className={`py-10 sm:py-14 ${tone === "tint" ? "bg-slate-50/70 border-y border-slate-100" : ""}`} data-testid={`home-${sec.type}`}>
      <Container>
        <SectionHead eyebrow={eyebrow} title={title} onSeeAll={() => navigate("/services")} />
        {data.length === 0 ? <EmptyState title={trending ? "No trending services yet" : "No services to show right now"} subtitle="Check back soon or browse all services." /> : (
          <Scroller testId={`home-${sec.type}-row`}>
            {data.map((s, i) => (
              <ServiceCard key={s.id} s={s} navigate={navigate} testId={`home-${sec.type}-${i}`} />
            ))}
          </Scroller>
        )}
      </Container>
    </section>
  );
}

export function BannersSection({ sec, navigate }) {
  const data = (sec.data || []).filter((b) => b.desktop_image || b.image);
  if (!data.length) return null;
  return (
    <section className="py-6 sm:py-8" data-testid="home-banners">
      <Container>
        {(sec.title || sec.subtitle) && <SectionHead eyebrow={sec.subtitle} title={sec.title} />}
        <Scroller testId="home-banners-row">
          {data.map((b) => (
            <button key={b.id} onClick={() => (b.link || b.button_url) && navigate(b.link || b.button_url)} data-testid={`home-banner-${b.id}`}
              className="group snap-start relative rounded-3xl overflow-hidden h-[200px] sm:h-[240px] w-[86vw] sm:w-[420px] lg:w-[calc(50%-10px)] shrink-0 text-left bg-slate-900 ring-1 ring-slate-200/60">
              <SmartImage src={b.desktop_image || b.image} alt={b.title || ""} className="group-hover:scale-105 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/30 to-transparent" />
              <div className="absolute inset-0 p-6 flex flex-col justify-end">
                <h3 className="font-heading font-extrabold text-xl sm:text-2xl text-white leading-tight">{b.title}</h3>
                {b.subtitle && <p className="text-slate-200 text-sm mt-1 max-w-sm">{b.subtitle}</p>}
                {(b.cta_text || b.link) && <span className="mt-4 inline-flex items-center gap-1.5 bg-white text-slate-900 px-4 py-2 rounded-xl text-sm font-bold w-fit group-hover:gap-2.5 transition-all">{b.cta_text || "Explore"} <ArrowRight className="h-4 w-4" /></span>}
              </div>
            </button>
          ))}
        </Scroller>
      </Container>
    </section>
  );
}

export function LocationHint({ city, onPick }) {
  if (city) return null;
  return (
    <button onClick={onPick} data-testid="home-location-hint" className="w-full text-left">
      <Container className="pt-6">
        <div className="rounded-2xl bg-primary-50 ring-1 ring-primary-100 px-4 py-3 flex items-center gap-3 hover:ring-primary-300 transition-colors">
          <span className="h-9 w-9 rounded-xl bg-white flex items-center justify-center"><MapPin className="h-4 w-4 text-primary-700" /></span>
          <p className="text-sm text-slate-700"><span className="font-semibold">Set your location</span> to see services, partners and offers available near you.</p>
          <ArrowRight className="h-4 w-4 text-primary-700 ml-auto shrink-0" />
        </div>
      </Container>
    </button>
  );
}
