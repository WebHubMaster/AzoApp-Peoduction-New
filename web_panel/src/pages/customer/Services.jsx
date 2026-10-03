import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Star, Clock, Check, ChevronRight, Sparkles, Search, X, ArrowRight, SearchX,
  LayoutGrid, AirVent, Zap, Droplet, Droplets, WashingMachine, Hammer, Wrench,
} from "lucide-react";
import api, { fmt } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import MobileBottomNav from "@/components/MobileBottomNav";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import Seo, { breadcrumbJsonLd } from "@/components/Seo";
import SmartImage from "@/components/site/SmartImage";
import { CategoryChipsSkeleton } from "@/components/site/Skeletons";
import { toast } from "sonner";

/* ---- Category icon mapping (icons come from admin-set category.icon) ---- */
const CAT_ICONS = {
  "air-vent": AirVent, zap: Zap, sparkles: Sparkles, droplet: Droplet,
  droplets: Droplets, "washing-machine": WashingMachine, hammer: Hammer, wrench: Wrench,
};
const catIcon = (key) => CAT_ICONS[String(key || "").toLowerCase()] || Wrench;

const reviewsLabel = (n) => {
  const v = Number(n) || 0;
  if (v <= 0) return null;
  const s = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(v);
  return `${s} ${v === 1 ? "review" : "reviews"}`;
};

/* ---- Premium service card (4:3 landscape) ---- */
const ServiceCard = ({ s, navigate, i }) => {
  const { addService } = useCart();
  const [added, setAdded] = useState(false);
  const price = s.discounted_price > 0 && s.discounted_price < s.base_price ? s.discounted_price : s.base_price;
  const off = s.discounted_price > 0 && s.discounted_price < s.base_price ? Math.round((1 - s.discounted_price / s.base_price) * 100) : 0;
  const reviews = reviewsLabel(s.review_count);
  const Ic = catIcon(s.category_icon);
  const quickAdd = (e) => {
    e.stopPropagation();
    addService(s, {});
    setAdded(true);
    toast.success(`${s.name} added`, { description: "Continue browsing or go to checkout." });
    setTimeout(() => setAdded(false), 1500);
  };
  return (
    <motion.div data-testid={`svc-${s.id}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 10) * 0.03, duration: 0.3 }}
      onClick={() => navigate(`/service/${s.id}`)}
      className="group cursor-pointer flex flex-col text-left rounded-2xl border border-[#E5EAF0] dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:shadow-[0_14px_40px_-12px_rgba(13,71,161,0.28)] hover:border-primary-200 dark:hover:border-primary-500/40 hover:-translate-y-1 transition-[transform,box-shadow,border-color] duration-200">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100 dark:bg-slate-800">
        {s.image ? (
          <SmartImage src={s.image} alt={s.name} width={480} className="group-hover:scale-[1.06] transition-transform duration-500 ease-out" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
            <Ic className="h-10 w-10 text-primary-300 dark:text-slate-600" strokeWidth={1.5} />
          </div>
        )}
        {off > 0 && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center rounded-lg bg-primary-700 text-white text-[11px] font-extrabold px-2 py-1 shadow-sm">{off}% OFF</span>
        )}
      </div>
      <div className="p-3.5 sm:p-4 flex flex-col flex-1">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold px-1.5 py-0.5">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{s.rating || "4.8"}
          </span>
          {reviews && <span className="text-slate-400 dark:text-slate-500 truncate">({reviews})</span>}
          <span className="ml-auto inline-flex items-center gap-1 text-slate-400 dark:text-slate-500 shrink-0"><Clock className="h-3.5 w-3.5" />{s.duration_min}m</span>
        </div>
        <h3 className="font-semibold text-[15px] sm:text-base text-slate-900 dark:text-slate-100 mt-2 leading-snug line-clamp-2">{s.name}</h3>
        <div className="mt-2.5 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-none mb-1">Starting from</p>
            <div className="flex items-baseline gap-1.5">
              <p className="font-heading font-extrabold text-lg sm:text-xl text-slate-900 dark:text-white whitespace-nowrap">{fmt(price)}</p>
              {off > 0 && <span className="text-[11px] text-slate-400 line-through whitespace-nowrap">{fmt(s.base_price)}</span>}
            </div>
          </div>
        </div>
        <button data-testid={`add-${s.id}`} onClick={quickAdd}
          className={`mt-3.5 w-full h-10 rounded-[10px] text-[13px] font-bold transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${added
            ? "bg-emerald-500 text-white shadow-sm"
            : "bg-primary-700 text-white hover:bg-primary-800 shadow-[0_2px_8px_rgba(13,71,161,0.25)] hover:shadow-[0_6px_16px_rgba(13,71,161,0.35)]"}`}>
          {added ? <><Check className="h-4 w-4" /> Added</> : <>Book Now <ArrowRight className="h-4 w-4 -mr-0.5 group-hover:translate-x-0.5 transition-transform" /></>}
        </button>
      </div>
    </motion.div>
  );
};

/* ---- Premium skeleton card (matches 4:3 layout) ---- */
const SkeletonCard = () => (
  <div className="rounded-2xl border border-[#E5EAF0] dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
    <div className="aspect-[4/3] w-full shimmer-block" />
    <div className="p-4 space-y-2.5">
      <div className="h-3 w-2/5 rounded shimmer-block" />
      <div className="h-4 w-4/5 rounded shimmer-block" />
      <div className="h-6 w-1/3 rounded shimmer-block mt-1" />
      <div className="h-10 w-full rounded-[10px] shimmer-block mt-1" />
    </div>
  </div>
);
const ServiceGrid = ({ children }) => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5 sm:gap-5">{children}</div>
);

/* ---- Category pill ---- */
const Chip = ({ active, onClick, label, Icon, testid }) => (
  <button data-testid={testid} onClick={onClick}
    className={`group inline-flex items-center gap-2 h-11 pl-3.5 pr-4 rounded-xl text-sm font-semibold whitespace-nowrap border transition-all active:scale-[0.97] ${active
      ? "bg-primary-700 text-white border-primary-700 shadow-[0_4px_12px_rgba(13,71,161,0.3)]"
      : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-[#E5EAF0] dark:border-slate-800 hover:border-primary-300 hover:text-primary-700 dark:hover:text-primary-400 hover:shadow-sm"}`}>
    {Icon && <Icon className={`h-4 w-4 ${active ? "text-white" : "text-primary-600 dark:text-primary-400"}`} strokeWidth={2} />}
    {label}
  </button>
);

export default function Services() {
  const [cats, setCats] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const { count, addCustom } = useCart();
  const loc = useLocation();
  const { slug } = useParams();
  const params = new URLSearchParams(loc.search);
  const initialCat = params.get("category") || "all";
  const [q, setQ] = useState(params.get("q") || "");
  const [activeCat, setActiveCat] = useState(initialCat);
  const [catMeta, setCatMeta] = useState(null);
  const navigate = useNavigate();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get("/catalog/categories").then((r) => setCats(r.data)).catch(() => {}),
      api.get("/catalog/services").then((r) => setServices(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    setActiveCat(p.get("category") || "all");
    setQ(p.get("q") || "");
  }, [loc.search]);
  useEffect(() => {
    if (slug && cats.length) {
      const norm = (x) => (x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const c = cats.find((x) => x.slug === slug || x.id === slug || norm(x.name) === norm(slug));
      if (c) setActiveCat(c.id);
    }
  }, [slug, cats]);

  // SEO: fetch category structured-data + meta for the /category/<slug> route
  useEffect(() => {
    if (!slug) { setCatMeta(null); return; }
    api.get(`/catalog/category/${slug}`).then((r) => setCatMeta(r.data || null)).catch(() => setCatMeta(null));
  }, [slug]);

  // Lookup map so section headings can show the admin-set category icon/desc.
  const catByName = useMemo(() => Object.fromEntries(cats.map((c) => [c.name, c])), [cats]);

  const filtered = useMemo(() => services.filter((s) =>
    (activeCat === "all" || s.category_id === activeCat) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.category_name?.toLowerCase().includes(q.toLowerCase()))
  ), [services, activeCat, q]);

  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach((s) => { (map[s.category_name] = map[s.category_name] || []).push(s); });
    return map;
  }, [filtered]);

  const activeCatName = cats.find((c) => c.id === activeCat)?.name;
  const hasFilters = q.trim().length > 0 || activeCat !== "all";
  const clearFilters = () => { setQ(""); setActiveCat("all"); };

  // Rate-card item search — surface bookable rate-card rows alongside services.
  const [rcItems, setRcItems] = useState([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRcItems([]); return; }
    const t = setTimeout(() => {
      api.get(`/ratecards/search?q=${encodeURIComponent(term)}`)
        .then((r) => setRcItems(r.data || [])).catch(() => setRcItems([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const bookRateItem = (it) => {
    addCustom({
      description: it.description, service_charge: it.service_charge, labour_charge: it.labour_charge,
      category_id: it.category_id, category_name: it.category_name, row_id: it.row_id,
    });
    toast.success(`Added "${it.description}"`, { description: "Taking you to checkout…" });
    navigate("/book");
  };

  const noResults = !loading && Object.keys(grouped).length === 0 && rcItems.length === 0;

  return (
    <div className="min-h-screen bg-[#F7F9FC] dark:bg-slate-950 flex flex-col">
      <Seo
        title={(catMeta?.seo?.title) || (catMeta?.name ? `${catMeta.name} Services` : "All Home Services")}
        description={(catMeta?.seo?.description) || catMeta?.description || "Browse and book verified home service professionals near you — AC repair, cleaning, electrician, plumbing, carpentry & more."}
        keywords={catMeta?.seo?.keywords}
        jsonLd={catMeta?.jsonld || breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }], origin)}
      />
      <SiteNavbar />

      {/* Hero intro */}
      <div className="border-b border-[#E5EAF0] dark:border-slate-800/80 bg-white dark:bg-slate-900">
        <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-8 pb-7 sm:pt-10 sm:pb-9">
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="font-heading font-extrabold text-2xl sm:text-3xl lg:text-[34px] leading-tight text-slate-900 dark:text-white">
            {activeCatName || (q ? `Results for "${q}"` : "All Services")}
          </motion.h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm sm:text-base max-w-xl">
            {catMeta?.description || "Book trusted professionals for every service at your doorstep."}
          </p>

          {/* Premium search */}
          <div className="mt-6 relative w-full max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" />
            <input data-testid="services-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search for AC repair, electrician, cleaning…"
              className="h-14 w-full pl-12 pr-11 py-3.5 rounded-xl border border-[#E5EAF0] dark:border-slate-700 bg-white dark:bg-slate-800 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 shadow-[0_1px_3px_rgba(16,24,40,0.06)] focus:outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:focus:ring-primary-500/20 transition" />
            {q && (
              <button data-testid="services-search-clear" onClick={() => setQ("")} aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1">
        {/* Category navigation */}
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 mb-8">
          {loading ? <CategoryChipsSkeleton count={7} /> : (
            <>
              <Chip testid="chip-all" active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All Services" Icon={LayoutGrid} />
              {cats.map((c) => <Chip key={c.id} testid={`chip-${c.id}`} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} Icon={catIcon(c.icon)} />)}
            </>
          )}
        </div>

        {/* Rate-card search results */}
        {q.trim().length >= 2 && rcItems.length > 0 && (
          <div className="mb-12" data-testid="ratecard-search-results">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 dark:text-white">Rate card items</h2>
              <span className="text-[11px] font-bold text-primary-700 bg-primary-50 dark:bg-primary-500/15 dark:text-primary-300 rounded-full px-2 py-0.5">{rcItems.length} found</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {rcItems.map((it) => {
                const price = (Number(it.service_charge) || 0) + (Number(it.labour_charge) || 0);
                return (
                  <div key={it.row_id} data-testid={`rc-result-${it.row_id}`}
                    className="rounded-2xl border border-[#E5EAF0] dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col gap-2 hover:shadow-md transition"
                    style={{ borderLeft: `3px solid ${it.accent_color || "#0D47A1"}` }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: it.accent_color || "#0D47A1" }}>
                      <Sparkles className="h-3.5 w-3.5" /> {it.brand_label || "AzoCover"}
                      <span className="text-slate-400 font-medium ml-1">· {it.category_name}</span>
                    </div>
                    <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">{it.description}</p>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{fmt(price)}</span>
                        {it.labour_charge && Number(it.labour_charge) > 0 && (
                          <span className="text-[11px] text-slate-400">incl. labour</span>
                        )}
                      </div>
                      <button data-testid={`rc-book-${it.row_id}`} onClick={() => bookRateItem(it)}
                        className="h-9 px-4 rounded-xl text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.98]"
                        style={{ background: it.accent_color || "#0D47A1" }}>
                        Book
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading skeletons */}
        {loading && (
          <div className="mb-12">
            <div className="h-6 w-48 rounded shimmer-block mb-5" />
            <ServiceGrid>{Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}</ServiceGrid>
          </div>
        )}

        {/* Empty state */}
        {noResults && (
          <div data-testid="services-empty" className="flex flex-col items-center justify-center text-center py-20 px-4">
            <div className="h-16 w-16 rounded-2xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center mb-5">
              <SearchX className="h-8 w-8 text-primary-500" strokeWidth={1.75} />
            </div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">No services found</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1.5 max-w-sm">Try searching for another service or category.</p>
            {hasFilters && (
              <button data-testid="services-clear-filters" onClick={clearFilters}
                className="mt-6 h-11 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm shadow-[0_2px_8px_rgba(13,71,161,0.25)] transition active:scale-[0.98]">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Category sections */}
        {!loading && Object.entries(grouped).map(([cat, list]) => {
          const meta = catByName[cat];
          const list2 = list.map((s) => ({ ...s, category_icon: meta?.icon }));
          const Ic = catIcon(meta?.icon);
          return (
            <section key={cat} className="mb-12 sm:mb-14">
              <div className="flex items-end justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
                      <Ic className="h-[18px] w-[18px] text-primary-700 dark:text-primary-400" strokeWidth={2} />
                    </span>
                    <h2 className="font-heading font-bold text-xl sm:text-2xl text-slate-900 dark:text-white truncate">{cat}</h2>
                  </div>
                  {meta?.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 ml-[2.875rem] line-clamp-1">{meta.description}</p>}
                </div>
                {activeCat === "all" && meta && (
                  <button data-testid={`view-all-${meta.id}`} onClick={() => { setActiveCat(meta.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 dark:text-primary-400 hover:gap-1.5 transition-all">
                    View all <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              <ServiceGrid>
                {list2.map((s, i) => <ServiceCard key={s.id} s={s} navigate={navigate} i={i} />)}
              </ServiceGrid>
            </section>
          );
        })}
      </div>

      <SiteFooter />
      {count > 0 && (
        <div className="fixed bottom-16 lg:bottom-4 inset-x-0 z-40 px-4 pointer-events-none">
          <button data-testid="view-booking-bar" onClick={() => navigate("/book")}
            className="pointer-events-auto max-w-md mx-auto w-full h-14 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white shadow-xl shadow-primary-700/30 flex items-center justify-between px-5 font-semibold transition-colors">
            <span className="flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">{count}</span> View your booking</span>
            <span className="flex items-center gap-1">Checkout <ChevronRight className="h-5 w-5" /></span>
          </button>
        </div>
      )}
      <MobileBottomNav />
    </div>
  );
}
