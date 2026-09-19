import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Package, ChevronRight, Check, X, Tag } from "lucide-react";
import api from "@/lib/api";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function PackagesSection({ title, subtitle }) {
  const [pkgs, setPkgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    api.get("/growth/packages").then((r) => setPkgs(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (!loading && pkgs.length === 0) return null;

  return (
    <div className="mt-8" data-testid="packages-section">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">{title || "Combo Offers"}</h3>
          <p className="text-sm text-slate-500">{subtitle || "Bundle popular services & save more"}</p>
        </div>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
        {pkgs.map((p) => (
          <PackageCard key={p.id} pkg={p} onOpen={() => setActive(p.id)} />
        ))}
      </div>
      {active && <PackageDetailModal pkgId={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function PackageCard({ pkg, onOpen }) {
  const pr = pkg.pricing || {};
  return (
    <button data-testid={`package-card-${pkg.id}`} onClick={onOpen}
      className="snap-start shrink-0 w-[260px] text-left rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden azo-hover-lift azo-elev">
      <div className="relative h-32 bg-slate-100">
        {pkg.image && <img src={pkg.image} alt={pkg.name} className="h-full w-full object-cover" loading="lazy" />}
        {pr.discount_pct > 0 && <span className="absolute top-2 left-2 bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded-lg">Save {Math.round(pr.discount_pct)}%</span>}
      </div>
      <div className="p-3.5">
        <p className="font-bold text-slate-900 dark:text-white truncate">{pkg.name}</p>
        <p className="text-[12px] text-slate-500 mt-0.5">{pr.service_count || (pkg.items || []).length} services included</p>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="font-heading font-black text-xl text-slate-900 dark:text-white">{fmt(pr.price)}</span>
          {pr.original > pr.price && <span className="text-sm text-slate-400 line-through">{fmt(pr.original)}</span>}
        </div>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600">View combo <ChevronRight className="h-4 w-4" /></span>
      </div>
    </button>
  );
}

function PackageDetailModal({ pkgId, onClose }) {
  const [pkg, setPkg] = useState(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    api.get(`/growth/packages/${pkgId}`).then((r) => setPkg(r.data)).catch(() => { toast.error("Could not load package"); onClose(); });
  }, [pkgId, onClose]);

  const book = async () => {
    setBooking(true);
    try {
      const { data } = await api.post(`/growth/packages/${pkgId}/book`, { schedule_type: "asap", address: {} });
      if (data?.ok) { toast.success("Package booked 🎉 We're arranging your services."); onClose(); }
      else toast.error("Could not book package");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not book package"); }
    setBooking(false);
  };

  const pr = pkg?.pricing || {};
  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div data-testid="package-detail" className="relative w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-3 top-3 z-10 h-9 w-9 grid place-items-center rounded-xl bg-black/30 text-white"><X className="h-5 w-5" /></button>
        {!pkg ? (
          <div className="p-10 text-center text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="h-44 bg-slate-100">{pkg.image && <img src={pkg.image} alt={pkg.name} className="h-full w-full object-cover" />}</div>
            <div className="p-5">
              <h3 className="font-heading font-black text-xl text-slate-900 dark:text-white">{pkg.name}</h3>
              <p className="text-sm text-slate-500 mt-1">{pkg.description || pkg.short_desc}</p>

              <p className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Included services</p>
              <div className="mt-2 space-y-2">
                {(pkg.items || []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><span className="h-6 w-6 rounded-lg bg-primary-100 text-primary-700 grid place-items-center"><Check className="h-3.5 w-3.5" /></span>{it.service_name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                    <span className="text-sm text-slate-400">{fmt(it.base_price)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-500"><span>Original value</span><span className="line-through">{fmt(pr.original)}</span></div>
                <div className="flex justify-between text-emerald-600 font-semibold"><span className="flex items-center gap-1"><Tag className="h-4 w-4" /> You save</span><span>{fmt(pr.savings)}</span></div>
                <div className="flex justify-between text-slate-500"><span>Package price</span><span>{fmt(pr.price)}</span></div>
                {pr.tax > 0 && <div className="flex justify-between text-slate-500"><span>Est. Govt. Taxes</span><span>{fmt(pr.tax)}</span></div>}
                <div className="flex justify-between pt-1.5 border-t border-slate-200 dark:border-slate-800 font-bold text-slate-900 dark:text-white text-base"><span>Total payable</span><span>{fmt(pr.total)}</span></div>
              </div>

              <button data-testid="package-book" onClick={book} disabled={booking}
                className="mt-4 w-full h-12 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-bold inline-flex items-center justify-center gap-2">
                <Package className="h-5 w-5" /> {booking ? "Booking…" : `Book Package · ${fmt(pr.total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
