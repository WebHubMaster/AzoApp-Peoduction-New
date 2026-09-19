import { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, PackageOpen, AlertTriangle, RefreshCw } from "lucide-react";

export const Container = ({ className = "", children }) => <div className={`max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;

export const SectionHead = ({ eyebrow, title, subtitle, onSeeAll, seeAllLabel = "View all", right, align = "left", testId }) => (
  <div className={`flex items-end justify-between gap-4 mb-6 sm:mb-8 ${align === "center" ? "flex-col items-center text-center" : ""}`} data-testid={testId}>
    <div className="min-w-0">
      {eyebrow && <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] text-primary-700">{eyebrow}</p>}
      <h2 className="font-heading font-extrabold text-2xl sm:text-[32px] leading-tight tracking-tight text-slate-900 mt-1.5">{title}</h2>
      {subtitle && <p className="text-slate-500 mt-2 text-sm sm:text-base max-w-2xl">{subtitle}</p>}
    </div>
    {right || (onSeeAll && (
      <button onClick={onSeeAll} className="shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-primary-900 group transition-colors">
        {seeAllLabel} <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </button>
    ))}
  </div>
);

/* Horizontal scroller with arrows (desktop) + swipe (mobile) */
export function Scroller({ children, gap = "gap-4 sm:gap-5", testId, itemSelector }) {
  const ref = useRef(null);
  const [canL, setCanL] = useState(false); const [canR, setCanR] = useState(false);
  const update = () => { const el = ref.current; if (!el) return; setCanL(el.scrollLeft > 4); setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4); };
  useEffect(() => { update(); const el = ref.current; if (!el) return; el.addEventListener("scroll", update, { passive: true }); const ro = new ResizeObserver(update); ro.observe(el); return () => { el.removeEventListener("scroll", update); ro.disconnect(); }; }, [children]);
  const by = (dir) => { const el = ref.current; if (!el) return; const item = itemSelector ? el.querySelector(itemSelector) : el.firstElementChild; const w = item ? item.getBoundingClientRect().width + 20 : 300; el.scrollBy({ left: dir * Math.max(w * 2, 300), behavior: "smooth" }); };
  const btn = "hidden md:flex absolute top-1/2 -translate-y-1/2 z-10 h-11 w-11 rounded-full bg-white shadow-lg ring-1 ring-slate-200 items-center justify-center text-slate-700 hover:text-primary-700 hover:ring-primary-300 transition-all disabled:opacity-0 disabled:pointer-events-none";
  return (
    <div className="relative group/scroller">
      <button aria-label="Scroll left" onClick={() => by(-1)} disabled={!canL} className={`${btn} -left-4`}><ChevronLeft className="h-5 w-5" /></button>
      <button aria-label="Scroll right" onClick={() => by(1)} disabled={!canR} className={`${btn} -right-4`}><ChevronRight className="h-5 w-5" /></button>
      <div ref={ref} data-testid={testId} className={`flex ${gap} overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 -mx-4 px-4 sm:mx-0 sm:px-0 pb-2`}>{children}</div>
    </div>
  );
}

export const EmptyState = ({ title = "Nothing here yet", subtitle, testId }) => (
  <div data-testid={testId} className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/60 py-12 flex flex-col items-center text-center px-6">
    <div className="h-12 w-12 rounded-2xl bg-white ring-1 ring-slate-200 flex items-center justify-center text-slate-400 mb-3"><PackageOpen className="h-6 w-6" /></div>
    <p className="font-heading font-bold text-slate-800">{title}</p>
    {subtitle && <p className="text-sm text-slate-500 mt-1 max-w-sm">{subtitle}</p>}
  </div>
);

export const ErrorState = ({ onRetry, text = "We couldn't load this section." }) => (
  <div className="rounded-3xl border border-rose-100 bg-rose-50/50 py-10 flex flex-col items-center text-center px-6" data-testid="home-error">
    <AlertTriangle className="h-7 w-7 text-rose-500 mb-2" />
    <p className="font-semibold text-slate-800">{text}</p>
    {onRetry && <button onClick={onRetry} data-testid="home-retry" className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800"><RefreshCw className="h-4 w-4" /> Retry</button>}
  </div>
);

export const Sk = ({ className = "" }) => <div className={`animate-pulse bg-slate-200/70 rounded-2xl ${className}`} />;
export const RowSkeleton = ({ count = 4, w = "w-[260px]", h = "h-[300px]" }) => (
  <div className="flex gap-5 overflow-hidden">{Array.from({ length: count }).map((_, i) => <Sk key={i} className={`${w} ${h} shrink-0`} />)}</div>
);

export const iconName = (name) => name?.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join("");
export const compactNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return v;
  const x = Number(v) || 0;
  if (x >= 10000000) return `${(x / 10000000).toFixed(x % 10000000 ? 1 : 0)}Cr+`;
  if (x >= 100000) return `${(x / 100000).toFixed(x % 100000 ? 1 : 0)}L+`;
  if (x >= 1000) return `${(x / 1000).toFixed(x % 1000 ? 1 : 0)}K+`;
  return String(x);
};
export const useCity = () => {
  const [city, setCity] = useState(() => localStorage.getItem("azo_location") || "");
  useEffect(() => { const s = () => setCity(localStorage.getItem("azo_location") || ""); window.addEventListener("azo-location-changed", s); return () => window.removeEventListener("azo-location-changed", s); }, []);
  return city && city !== "Your area" ? city : "";
};
