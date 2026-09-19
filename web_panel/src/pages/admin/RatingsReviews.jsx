import React, { useEffect, useMemo, useState } from "react";
import { Star, Search, Loader2, MessageSquare, TrendingUp, Filter } from "lucide-react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const Stars = ({ n, size = 4 }) => (
  <span className="inline-flex items-center gap-0.5" aria-label={`${n} stars`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} className={`h-${size} w-${size} ${i <= n ? "fill-amber-400 text-amber-400" : "text-slate-300 dark:text-slate-600"}`} />
    ))}
  </span>
);

const fmtDate = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function RatingsReviews() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serviceId, setServiceId] = useState("");
  const [rating, setRating] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/reviews", { params: { service_id: serviceId || "", rating: rating || 0, q: q || "", page, page_size: pageSize } });
      setData(r.data);
    } catch { /* handled by global */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [serviceId, rating, page]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 400); return () => clearTimeout(t); }, [q]);

  const summary = data?.summary || {};
  const services = data?.services || [];
  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeSvc = useMemo(() => services.find((s) => (s.service_id || s.service_name) === serviceId), [services, serviceId]);

  return (
    <div className="space-y-5" data-testid="admin-ratings">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Ratings & Reviews</h1>
        <p className="text-sm text-slate-500">Service-wise customer ratings — which service, how many stars, and what they said.</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1"><MessageSquare className="h-3.5 w-3.5" /> Total reviews</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1" data-testid="rv-total">{summary.total_reviews ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1"><Star className="h-3.5 w-3.5" /> Average rating</p>
          <p className="text-2xl font-black text-amber-500 mt-1 flex items-center gap-2">{summary.avg_rating ?? 0} <Stars n={Math.round(summary.avg_rating || 0)} /></p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Services reviewed</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{summary.services_reviewed ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Service-wise list */}
        <div className="lg:col-span-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <p className="font-bold text-slate-800 dark:text-white text-sm">By service</p>
            {serviceId && <button onClick={() => setServiceId("")} className="text-xs font-semibold text-primary-600">Clear</button>}
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800" data-testid="rv-services">
            {services.length === 0 && <p className="p-4 text-sm text-slate-400">No reviews yet.</p>}
            {services.map((s) => {
              const key = s.service_id || s.service_name;
              const sel = key === serviceId;
              return (
                <button key={key} onClick={() => setServiceId(sel ? "" : key)} data-testid={`rv-svc-${key}`}
                  className={`w-full text-left px-4 py-3 transition ${sel ? "bg-primary-50 dark:bg-primary-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{s.service_name}</p>
                    <span className="text-xs font-bold text-amber-500 shrink-0">{s.avg_rating} ★</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-[11px] text-slate-400">{s.category_name || "—"}</p>
                    <p className="text-[11px] text-slate-400">{s.count} review{s.count > 1 ? "s" : ""}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Review list */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search comment, customer, partner, booking…" className="pl-9 h-10" data-testid="rv-search" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 mr-1"><Filter className="h-3.5 w-3.5" /> Stars:</span>
              {[0, 5, 4, 3, 2, 1].map((r) => (
                <button key={r} onClick={() => { setPage(1); setRating(r); }} data-testid={`rv-filter-${r}`}
                  className={`h-8 px-3 rounded-full text-xs font-semibold border transition ${rating === r ? "bg-primary-700 text-white border-transparent" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300"}`}>
                  {r === 0 ? "All" : `${r}★`}
                </button>
              ))}
              {activeSvc && <span className="ml-1 text-xs text-slate-500">· {activeSvc.service_name}</span>}
            </div>
          </div>

          {loading ? (
            <div className="p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>
          ) : items.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-400">No reviews match these filters.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="rv-list">
              {items.map((it) => (
                <div key={it.booking_id} className="p-4" data-testid={`rv-item-${it.booking_id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{it.service_name}</p>
                      <p className="text-[11px] text-slate-400 font-mono">#{it.booking_code}{it.category_name ? ` · ${it.category_name}` : ""}</p>
                    </div>
                    <Stars n={it.rating} />
                  </div>
                  {it.comment ? (
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 italic">&ldquo;{it.comment}&rdquo;</p>
                  ) : (
                    <p className="text-sm text-slate-400 mt-2">No comment</p>
                  )}
                  <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
                    <span>By {it.customer_name}{it.partner_name ? ` · Partner: ${it.partner_name}` : ""}</span>
                    <span>{fmtDate(it.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > pageSize && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-xs text-slate-400">Page {page} of {totalPages} · {total} reviews</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
