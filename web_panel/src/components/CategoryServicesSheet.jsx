import { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { Star, Wrench, ChevronRight, ArrowRight, Clock, Loader2 } from "lucide-react";
import api, { fmt } from "@/lib/api";
import SmartImage from "@/components/site/SmartImage";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { iconName } from "@/pages/customer/home/ui";

/**
 * Bottom sheet that opens when a category is tapped on the homepage. It stays
 * fully inside the viewport (max-height), the service list scrolls INSIDE the
 * sheet (the background page is locked by vaul), and it animates up/down
 * smoothly on both mobile and desktop.
 *
 * Props:
 *   category  — the selected category object (or null to keep it closed)
 *   onClose   — called when the sheet should close
 *   navigate  — react-router navigate (to open a service / see-all)
 */
export default function CategoryServicesSheet({ category, onClose, navigate }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(false);
  const open = !!category;

  useEffect(() => {
    if (!category?.id) return;
    let alive = true;
    setLoading(true);
    setServices([]);
    api
      .get("/catalog/services", { params: { category_id: category.id } })
      .then((r) => { if (alive) setServices(Array.isArray(r.data) ? r.data : []); })
      .catch(() => { if (alive) setServices([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [category?.id]);

  const go = (s) => { onClose?.(); navigate(`/service/${s.id}`); };
  const seeAll = () => { onClose?.(); navigate(`/services?category=${category.id}`); };
  const CatIcon = Icons[iconName(category?.icon)] || Wrench;

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose?.(); }} shouldScaleBackground={false}>
      <DrawerContent
        className="max-h-[88dvh] focus:outline-none"
        data-testid="category-services-sheet"
      >
        {/* Header (fixed) */}
        <div className="px-4 pb-3 pt-1 flex items-center gap-3 border-b border-slate-100">
          <span className="h-11 w-11 rounded-2xl bg-primary-50 flex items-center justify-center overflow-hidden shrink-0">
            {category?.image
              ? <SmartImage src={category.image} alt={category?.name || ""} className="h-full w-full object-cover" />
              : <CatIcon className="h-6 w-6 text-primary-700" strokeWidth={1.6} />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading font-extrabold text-lg text-slate-900 leading-tight line-clamp-1">
              {category?.name || "Services"}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {loading ? "Loading services…" : `${services.length} service${services.length === 1 ? "" : "s"} available`}
            </p>
          </div>
          <button
            data-testid="category-sheet-seeall"
            onClick={seeAll}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-800 shrink-0"
          >
            View all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 py-3" data-testid="category-sheet-list">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm mt-3">Fetching services…</p>
            </div>
          ) : services.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Wrench className="h-8 w-8 mx-auto text-slate-300" />
              <p className="text-sm mt-3 font-medium">No services in this category yet</p>
              <p className="text-xs text-slate-400 mt-1">Please check back soon.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {services.map((s, i) => {
                const hasOff = s.discounted_price > 0 && s.discounted_price < s.base_price;
                const price = hasOff ? s.discounted_price : s.base_price;
                const off = hasOff ? Math.round((1 - s.discounted_price / s.base_price) * 100) : 0;
                const rating = Number(s.rating) > 0 ? Number(s.rating).toFixed(1) : null;
                return (
                  <button
                    key={s.id}
                    data-testid={`category-sheet-service-${i}`}
                    onClick={() => go(s)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left ring-1 ring-transparent hover:ring-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                      {s.image
                        ? <SmartImage src={s.image} alt={s.name} className="h-full w-full object-cover" />
                        : <div className="h-full w-full flex items-center justify-center text-slate-300"><Wrench className="h-6 w-6" /></div>}
                      {off > 0 && (
                        <span className="absolute top-1 left-1 bg-primary-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{off}%</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">{s.name}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                        {rating && (
                          <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />{rating}
                          </span>
                        )}
                        {s.duration_min > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {s.duration_min >= 60 ? `${Math.floor(s.duration_min / 60)}h${s.duration_min % 60 ? ` ${s.duration_min % 60}m` : ""}` : `${s.duration_min} min`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-1.5 mt-1">
                        <span className="font-heading font-extrabold text-base text-slate-900">{fmt(price)}</span>
                        {off > 0 && <span className="text-xs text-slate-400 line-through">{fmt(s.base_price)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer CTA (fixed) */}
        <div className="p-4 border-t border-slate-100">
          <button
            data-testid="category-sheet-viewall-btn"
            onClick={seeAll}
            className="w-full h-12 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            View all in {category?.name || "this category"} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
