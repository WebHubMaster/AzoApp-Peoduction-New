import { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Star, Clock, Plus, Check, ChevronRight, Sparkles } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import MobileBottomNav from "@/components/MobileBottomNav";
import SiteNavbar from "@/components/site/SiteNavbar";
import SiteFooter from "@/components/site/SiteFooter";
import Seo, { breadcrumbJsonLd } from "@/components/Seo";
import SmartImage from "@/components/site/SmartImage";
import { ServiceGridSkeleton, CategoryChipsSkeleton } from "@/components/site/Skeletons";
import { toast } from "sonner";

const ServiceCard = ({ s, navigate, i }) => {
  const { addService } = useCart();
  const [added, setAdded] = useState(false);
  const price = s.discounted_price > 0 && s.discounted_price < s.base_price ? s.discounted_price : s.base_price;
  const off = s.discounted_price > 0 && s.discounted_price < s.base_price ? Math.round((1 - s.discounted_price / s.base_price) * 100) : 0;
  const quickAdd = (e) => {
    e.stopPropagation();
    addService(s, {});
    setAdded(true);
    toast.success(`${s.name} added`, { description: "Continue browsing or go to checkout." });
    setTimeout(() => setAdded(false), 1500);
  };
  return (
    <motion.div data-testid={`svc-${s.id}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (i % 8) * 0.03 }}
      onClick={() => navigate(`/service/${s.id}`)}
      className="group cursor-pointer text-left rounded-2xl border border-slate-200 overflow-hidden bg-white hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all">
      <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
        {s.image && <SmartImage src={s.image} alt={s.name} className="group-hover:scale-105 transition-transform duration-500" />}
        {off > 0 && <span className="absolute top-2 left-2 bg-primary-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-md">{off}% OFF</span>}
      </div>
      <div className="p-4">
        <div className="flex items-center gap-1 text-xs text-slate-600"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /><span className="font-semibold">{s.rating || "4.8"}</span><span className="text-slate-400 flex items-center gap-1 ml-1"><Clock className="h-3.5 w-3.5" /> {s.duration_min}m</span></div>
        <h3 className="font-semibold text-slate-900 mt-1 leading-snug line-clamp-2">{s.name}</h3>
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <p className="font-heading font-extrabold text-base text-slate-900 whitespace-nowrap">{fmt(price)}</p>
            {off > 0 && <span className="text-[11px] text-slate-400 line-through whitespace-nowrap">{fmt(s.base_price)}</span>}
          </div>
          <button data-testid={`add-${s.id}`} onClick={quickAdd}
            className={`shrink-0 h-8 px-3 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1 ${added ? "bg-emerald-500 border-emerald-500 text-white" : "border-primary-300 text-primary-700 hover:bg-primary-700 hover:text-white hover:border-primary-700 active:scale-[0.98]"}`}>
            {added ? <><Check className="h-3.5 w-3.5" /> Added</> : <><Plus className="h-3.5 w-3.5" /> Add</>}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

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

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <Seo
        title={(catMeta?.seo?.title) || (catMeta?.name ? `${catMeta.name} Services` : "All Home Services")}
        description={(catMeta?.seo?.description) || catMeta?.description || "Browse and book verified home service professionals near you — AC repair, cleaning, electrician, plumbing, carpentry & more."}
        keywords={catMeta?.seo?.keywords}
        jsonLd={catMeta?.jsonld || breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Services", path: "/services" }], origin)}
      />
      <SiteNavbar />
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1">
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-slate-900">{activeCatName || (q ? `Results for "${q}"` : "All Services")}</h1>
        <p className="text-slate-500 mt-1">Browse and book verified home-service experts near you.</p>

        {/* category chips + search */}
        <div className="flex gap-3 items-center mt-6 mb-6">
          <input data-testid="services-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services…"
            className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary-200" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 mb-6">
          {loading ? <CategoryChipsSkeleton count={7} /> : (
            <>
              <Chip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All" />
              {cats.map((c) => <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} />)}
            </>
          )}
        </div>

        {q.trim().length >= 2 && rcItems.length > 0 && (
          <div className="mb-10" data-testid="ratecard-search-results">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-heading font-bold text-xl text-slate-900">Rate card items</h2>
              <span className="text-[11px] font-bold text-primary-700 bg-primary-50 rounded-full px-2 py-0.5">{rcItems.length} found</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rcItems.map((it) => {
                const price = (Number(it.service_charge) || 0) + (Number(it.labour_charge) || 0);
                return (
                  <div key={it.row_id} data-testid={`rc-result-${it.row_id}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-2 hover:shadow-md transition"
                    style={{ borderLeft: `3px solid ${it.accent_color || "#0D47A1"}` }}>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: it.accent_color || "#0D47A1" }}>
                      <Sparkles className="h-3.5 w-3.5" /> {it.brand_label || "AzoCover"}
                      <span className="text-slate-400 font-medium ml-1">· {it.category_name}</span>
                    </div>
                    <p className="text-[15px] font-semibold text-slate-900 leading-snug line-clamp-2">{it.description}</p>
                    <div className="flex items-center justify-between mt-auto pt-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-heading font-extrabold text-lg text-slate-900">{fmt(price)}</span>
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

        {loading && <div className="mb-10"><ServiceGridSkeleton count={8} /></div>}

        {!loading && Object.keys(grouped).length === 0 && rcItems.length === 0 && <p className="text-slate-400 py-16 text-center">No services found.</p>}

        {!loading && Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="mb-10">
            <h2 className="font-heading font-bold text-xl text-slate-900 mb-4">{cat}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
              {list.map((s, i) => <ServiceCard key={s.id} s={s} navigate={navigate} i={i} />)}
            </div>
          </div>
        ))}
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

const Chip = ({ active, onClick, label }) => (
  <button onClick={onClick} className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all ${active ? "bg-primary-700 text-white border-primary-700" : "bg-white text-slate-600 border-slate-200 hover:border-primary-300"}`}>{label}</button>
);
