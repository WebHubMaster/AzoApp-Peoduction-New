import React, { useEffect, useMemo, useState } from "react";
import { Star, MessageSquare, TrendingUp, Layers } from "lucide-react";
import api from "@/lib/api";
import {
  PageHeader, KpiCard, StarRating, SectionCard, Toolbar, SearchInput,
  ChipBar, Pagination, EmptyState, KpiSkeleton, CardListSkeleton,
} from "@/components/admin/ModuleKit";

const fmtDate = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function RatingsReviews() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [serviceId, setServiceId] = useState("");
  const [rating, setRating] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/reviews", { params: { service_id: serviceId || "", rating: rating || 0, q: q || "", page, page_size: pageSize } });
      setData(r.data);
    } catch { /* handled by global */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [serviceId, rating, page, pageSize]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 400); return () => clearTimeout(t); }, [q]);

  const summary = data?.summary || {};
  const services = data?.services || [];
  const items = data?.items || [];
  const total = data?.total || 0;

  const activeSvc = useMemo(() => services.find((s) => (s.service_id || s.service_name) === serviceId), [services, serviceId]);

  const chips = [];
  if (rating) chips.push({ key: "rating", label: `Rating: ${rating}★`, testId: "chip-rating", onRemove: () => { setPage(1); setRating(0); } });
  if (activeSvc) chips.push({ key: "svc", label: `Service: ${activeSvc.service_name}`, testId: "chip-service", onRemove: () => setServiceId("") });
  if (q) chips.push({ key: "q", label: `Search: ${q}`, testId: "chip-q", onRemove: () => setQ("") });
  const clearAll = () => { setRating(0); setServiceId(""); setQ(""); setPage(1); };

  const hasAvg = Number(summary.avg_rating) > 0;

  return (
    <div className="space-y-5 az-rise" data-testid="admin-ratings">
      <PageHeader icon={Star} title="Ratings & Reviews" description="Service-wise customer ratings — which service, how many stars, and what they said." />

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading && !data ? (
          <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></>
        ) : (
          <>
            <KpiCard icon={MessageSquare} label="Total Reviews" value={summary.total_reviews ?? 0} accent="primary" />
            <KpiCard icon={Star} label="Average Rating" value={hasAvg ? Number(summary.avg_rating).toFixed(1) : "—"} accent="amber">
              {hasAvg && <StarRating value={summary.avg_rating} size="md" />}
            </KpiCard>
            <KpiCard icon={TrendingUp} label="Services Reviewed" value={summary.services_reviewed ?? 0} accent="emerald" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* Service-wise list */}
        <SectionCard title="Reviews by Service" icon={Layers} className="lg:col-span-1"
          headerRight={serviceId && <button onClick={() => setServiceId("")} data-testid="rv-clear-service" className="text-xs font-semibold text-primary-600 hover:underline">Clear</button>}>
          <div className="-mx-5 -my-5">
            {loading && !data ? (
              <CardListSkeleton count={4} />
            ) : services.length === 0 ? (
              <EmptyState icon={Layers} title="No reviews yet" description="Service-wise ratings will appear here once customers leave reviews." />
            ) : (
              <div className="max-h-[560px] overflow-y-auto no-scrollbar divide-y divide-slate-100 dark:divide-slate-800" data-testid="rv-services">
                {services.map((s) => {
                  const key = s.service_id || s.service_name;
                  const sel = key === serviceId;
                  return (
                    <button key={key} onClick={() => setServiceId(sel ? "" : key)} data-testid={`rv-svc-${key}`}
                      className={`w-full text-left px-5 py-4 transition-colors ${sel ? "bg-primary-50/70 dark:bg-primary-900/20 border-l-2 border-primary-600" : "hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{s.service_name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{s.category_name || "—"}</p>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{s.avg_rating}</span>
                          <span className="text-[11px] text-slate-400 mt-0.5">{s.count} review{s.count > 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Review list */}
        <SectionCard className="lg:col-span-2" title={null}>
          <div className="-mt-1 space-y-4">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} data-testid="rv-search"
              placeholder="Search comment, customer, partner, booking…" />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Stars</span>
              {[0, 5, 4, 3, 2, 1].map((r) => (
                <button key={r} onClick={() => { setPage(1); setRating(r); }} data-testid={`rv-filter-${r}`}
                  className={`h-8 px-3.5 rounded-full text-xs font-bold border transition-all ${rating === r ? "bg-primary-700 text-white border-transparent shadow-sm shadow-primary-700/30" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary-300 hover:text-primary-700"}`}>
                  {r === 0 ? "All" : `${r}★`}
                </button>
              ))}
            </div>
            <ChipBar chips={chips} onClearAll={chips.length ? clearAll : undefined} />
          </div>

          <div className="-mx-5 border-t border-slate-100 dark:border-slate-800">
            {loading ? (
              <CardListSkeleton count={5} />
            ) : items.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No reviews match these filters"
                description="Try clearing the star filter or search to see more customer reviews."
                action={chips.length ? <button onClick={clearAll} className="h-10 px-4 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm">Clear Filters</button> : null} />
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="rv-list">
                {items.map((it) => (
                  <div key={it.booking_id} className="px-5 py-4 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors" data-testid={`rv-item-${it.booking_id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StarRating value={it.rating} size="sm" />
                          <span className="text-xs font-bold text-amber-500">{Number(it.rating).toFixed(1)}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-800 dark:text-white mt-1 truncate">{it.service_name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">#{it.booking_code}{it.category_name ? ` · ${it.category_name}` : ""}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">{fmtDate(it.at)}</span>
                    </div>
                    {it.comment ? (
                      <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 italic border-l-2 border-slate-200 dark:border-slate-700 pl-3">&ldquo;{it.comment}&rdquo;</p>
                    ) : (
                      <p className="text-sm text-slate-400 mt-2">No comment left</p>
                    )}
                    <div className="flex items-center gap-2 mt-2.5 text-[11px] text-slate-500">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">By {it.customer_name}</span>
                      {it.partner_name && <span className="text-slate-400">· Partner: {it.partner_name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {total > 0 && (
              <Pagination page={page} pageSize={pageSize} total={total}
                onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
