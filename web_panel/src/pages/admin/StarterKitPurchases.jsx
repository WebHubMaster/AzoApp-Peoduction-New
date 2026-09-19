import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ShoppingBag, IndianRupee, Filter, Wallet, Search, X, Calendar, ChevronDown, Check,
  ArrowUpDown, ArrowUp, ArrowDown, Eye, SlidersHorizontal, Clock,
} from "lucide-react";
import {
  STATUS_META, STATUS_ORDER, inr, fmtDateTime, fmtShort, methodLabel,
  StatCard, StatusBadge, Avatar, EmptyState, ErrorState, TableSkeleton, Pagination,
} from "./starterkit/parts";
import DateRangeField, { toYMD } from "./starterkit/DateRangeField";
import PurchaseDrawer from "./starterkit/PurchaseDrawer";

const QUICK = [
  { key: 1, label: "Today" }, { key: 7, label: "7 Days" }, { key: 30, label: "30 Days" },
];
const quickRange = (days) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today); start.setDate(today.getDate() - (days - 1));
  return { from: toYMD(start), to: toYMD(today) };
};

function Dropdown({ value, options, onChange, testId, icon: Icon, width = "sm:w-48" }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);
  const cur = options.find((o) => o.value === value) || options[0];
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <div ref={ref} className={`relative w-full ${width}`}>
      <button type="button" data-testid={testId} onClick={() => setOpen((o) => !o)}
        className={`w-full h-11 px-3 rounded-xl border bg-white text-sm flex items-center gap-2 transition-all duration-150 ${open ? "border-primary-500 ring-2 ring-primary-100" : value !== "all" && value !== "newest" ? "border-primary-200 text-primary-800 font-semibold" : "border-slate-200 text-slate-700 hover:border-slate-300"}`}>
        {Icon && <Icon className="h-4 w-4 text-slate-400 shrink-0" />}
        <span className="truncate flex-1 text-left">{cur?.label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.12 }}
            className="absolute z-40 mt-1.5 w-full min-w-[180px] rounded-xl bg-white ring-1 ring-slate-200 shadow-xl shadow-slate-900/10 p-1.5" data-testid={`${testId}-menu`}>
            {options.length > 6 && (
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full h-9 mb-1 px-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" />
            )}
            <div className="max-h-60 overflow-y-auto">
              {list.map((o) => (
                <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ(""); }} data-testid={`${testId}-opt-${o.value}`}
                  className={`w-full flex items-center justify-between px-2.5 h-9 rounded-lg text-sm transition-colors ${o.value === value ? "bg-primary-50 text-primary-800 font-semibold" : "text-slate-700 hover:bg-slate-50"}`}>
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4" />}
                </button>
              ))}
              {list.length === 0 && <p className="px-2.5 py-2 text-xs text-slate-400">No matches</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SortHead({ label, k, sort, onSort, className = "" }) {
  const asc = `${k}_asc`, desc = `${k}_desc`;
  const active = sort === asc || sort === desc;
  const Icon = !active ? ArrowUpDown : sort === asc ? ArrowUp : ArrowDown;
  return (
    <th className={`px-4 py-3 text-left ${className}`}>
      <button type="button" onClick={() => onSort(sort === desc ? asc : desc)} data-testid={`sk-sort-${k}`}
        className={`inline-flex items-center gap-1 text-[11px] uppercase tracking-wider font-bold transition-colors ${active ? "text-primary-700" : "text-slate-400 hover:text-slate-600"}`}>
        {label} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}
const SORT_API = { date_desc: "newest", date_asc: "oldest", amount_desc: "amount_high", amount_asc: "amount_low", partner_asc: "partner", partner_desc: "partner_desc" };

export default function StarterKitPurchases({ onSummary, kitTitle, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");
  const [method, setMethod] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const [sort, setSort] = useState("date_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [debouncedQ, status, method, range.from, range.to, pageSize, sort]);

  const load = useCallback(() => {
    setLoading(true); setError(false);
    const params = { page, page_size: pageSize, status, method, sort: SORT_API[sort] || "newest" };
    if (debouncedQ) params.q = debouncedQ;
    if (range.from) params.date_from = range.from;
    if (range.to) params.date_to = range.to;
    api.get("/starter-kit/admin/purchases", { params })
      .then((r) => {
        setData(r.data);
        onSummary?.({ count: r.data.total_all ?? 0, revenue: r.data.total_revenue ?? 0 });
        setSelected((s) => s ? (r.data.purchases || []).find((p) => p.id === s.id) || s : s);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, pageSize, status, method, debouncedQ, range.from, range.to, sort, onSummary]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const updateTracking = async (id, newStatus) => {
    try {
      await api.post(`/starter-kit/admin/purchases/${id}/tracking`, { status: newStatus });
      toast.success("Delivery status updated");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    }
  };

  const activeQuick = useMemo(() => QUICK.find((k) => { const r = quickRange(k.key); return r.from === range.from && r.to === range.to; })?.key ?? null, [range]);
  const clearAll = () => { setQ(""); setStatus("all"); setMethod("all"); setRange({ from: "", to: "" }); };
  const hasFilters = !!(debouncedQ || status !== "all" || method !== "all" || range.from || range.to);

  const d = data || {};
  const sc = d.status_counts || {};
  const rows = d.purchases || [];
  const methodOptions = [{ value: "all", label: "All methods" }, ...(d.methods || []).map((m) => ({ value: m, label: methodLabel(m) }))];
  const sortOptions = [
    { value: "date_desc", label: "Newest first" }, { value: "date_asc", label: "Oldest first" },
    { value: "amount_desc", label: "Amount: high → low" }, { value: "amount_asc", label: "Amount: low → high" },
    { value: "partner_asc", label: "Partner A → Z" }, { value: "partner_desc", label: "Partner Z → A" },
  ];
  const dateLabel = range.from ? (range.from === range.to || !range.to ? fmtShort(range.from) : `${fmtShort(range.from)} – ${fmtShort(range.to)}`) : "";
  const chipCls = (on) => `shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-xs font-semibold ring-1 transition-all duration-150 ${on ? "bg-primary-700 text-white ring-primary-700 shadow-sm shadow-primary-700/25" : "bg-white text-slate-600 ring-slate-200 hover:ring-primary-300 hover:text-primary-800"}`;

  return (
    <div className="space-y-4" data-testid="sk-purchases">
      {/* analytics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard testId="sk-stat-total" label="All-Time Purchases" value={loading && !data ? "…" : (d.total_all ?? 0)} icon={ShoppingBag} tone="primary" hint="Lifetime kit orders · independent of filters" />
        <StatCard testId="sk-stat-revenue" label="All-Time Revenue" value={loading && !data ? "…" : inr(d.total_revenue)} icon={IndianRupee} tone="emerald" hint="Sum of all paid kit orders" />
        <StatCard testId="sk-stat-matching" label="Matching Results" value={loading && !data ? "…" : (d.filtered_count ?? 0)} icon={Filter} tone="indigo" hint={hasFilters ? "Records matching active filters" : "No filters applied · showing everything"} />
        <StatCard testId="sk-stat-filtered-revenue" label="Filtered Revenue" value={loading && !data ? "…" : inr(d.filtered_revenue)} icon={Wallet} tone="amber" hint={`Across ${d.filtered_count ?? 0} matching order${(d.filtered_count ?? 0) === 1 ? "" : "s"}`} />
      </div>

      {/* filters */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-4 sm:p-5 space-y-4" data-testid="sk-filters">
        <div className="flex items-center gap-2 text-slate-800">
          <SlidersHorizontal className="h-4 w-4 text-primary-700" />
          <h3 className="font-heading font-bold text-sm">Search & filters</h3>
        </div>

        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-primary-600 transition-colors" />
            <input ref={searchRef} data-testid="sk-search" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") setQ(""); if (e.key === "Enter") setDebouncedQ(q.trim()); }}
              placeholder="Search partner name or phone..."
              className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-200 bg-white text-base sm:text-sm text-slate-800 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100" />
            {q && (
              <button onClick={() => { setQ(""); searchRef.current?.focus(); }} data-testid="sk-search-clear" aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Dropdown value={method} options={methodOptions} onChange={setMethod} testId="sk-filter-method" icon={Wallet} />
          <Dropdown value={sort} options={sortOptions} onChange={setSort} testId="sk-sort" icon={ArrowUpDown} width="sm:w-52" />
        </div>

        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="flex items-center gap-2 text-slate-500 shrink-0">
            <Calendar className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em]">Order date</span>
          </div>
          <DateRangeField from={range.from} to={range.to} onChange={setRange} testId="sk-date" />
          <div className="flex gap-2 flex-wrap shrink-0" data-testid="sk-quick">
            {QUICK.map((k) => (
              <button key={k.key} type="button" data-testid={`sk-preset-${k.key}`} onClick={() => setRange(activeQuick === k.key ? { from: "", to: "" } : quickRange(k.key))}
                className={`h-11 px-4 rounded-xl text-sm font-semibold ring-1 transition-all duration-150 ${activeQuick === k.key ? "bg-primary-700 text-white ring-primary-700 shadow-sm shadow-primary-700/25" : "bg-white text-slate-700 ring-slate-200 hover:ring-primary-300 hover:text-primary-800"}`}>
                {k.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap no-scrollbar -mx-2 px-2 py-1" data-testid="sk-status-chips">
          <button data-testid="sk-status-all" onClick={() => setStatus("all")} className={chipCls(status === "all")}>
            All <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${status === "all" ? "bg-white/20" : "bg-slate-100"}`}>{d.base_total ?? 0}</span>
          </button>
          {STATUS_ORDER.map((s) => (
            <button key={s} data-testid={`sk-status-${s}`} onClick={() => setStatus(s)} className={chipCls(status === s)}>
              <span className={`h-1.5 w-1.5 rounded-full ${status === s ? "bg-white" : STATUS_META[s].dot}`} />
              {STATUS_META[s].label} <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${status === s ? "bg-white/20" : "bg-slate-100"}`}>{sc[s] ?? 0}</span>
            </button>
          ))}
        </div>

        <AnimatePresence initial={false}>
          {hasFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100" data-testid="sk-active-filters">
                <span className="text-xs font-semibold text-slate-500">Active filters:</span>
                {debouncedQ && <FilterTag label="Partner" value={debouncedQ} onRemove={() => setQ("")} testId="sk-tag-q" />}
                {status !== "all" && <FilterTag label="Status" value={STATUS_META[status].label} onRemove={() => setStatus("all")} testId="sk-tag-status" />}
                {method !== "all" && <FilterTag label="Method" value={methodLabel(method)} onRemove={() => setMethod("all")} testId="sk-tag-method" />}
                {dateLabel && <FilterTag label="Date" value={dateLabel} onRemove={() => setRange({ from: "", to: "" })} testId="sk-tag-date" />}
                <button data-testid="sk-clear" onClick={clearAll} className="ml-auto inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
                  <X className="h-3.5 w-3.5" /> Clear all
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden" data-testid="sk-table-card">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-slate-100">
          <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary-700" /> Kit purchases
          </h3>
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 ring-1 ring-slate-200 rounded-full px-2.5 py-1 tabular-nums" data-testid="sk-results-count">
            {d.filtered_count ?? 0} result{(d.filtered_count ?? 0) === 1 ? "" : "s"}
          </span>
        </div>

        {error && <ErrorState onRetry={load} />}
        {!error && loading && !data && <TableSkeleton />}
        {!error && data && rows.length === 0 && !loading && (
          (d.total_all ?? 0) === 0
            ? <EmptyState testId="sk-empty" title="No starter kit purchases yet." subtitle="Purchases will appear here as soon as a partner buys the kit." />
            : <EmptyState testId="sk-empty" title="No kit purchases found" subtitle="Try changing your search, date range or status filters." />
        )}

        {!error && data && rows.length > 0 && (
          <div className={`transition-opacity duration-150 ${loading ? "opacity-60 pointer-events-none" : ""}`}>
            {/* desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm" data-testid="sk-table">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <SortHead label="Partner" k="partner" sort={sort} onSort={setSort} />
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-bold text-slate-400 whitespace-nowrap">Order ID</th>
                    <SortHead label="Amount" k="amount" sort={sort} onSort={setSort} />
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-bold text-slate-400">Payment</th>
                    <SortHead label="Order date" k="date" sort={sort} onSort={setSort} />
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-bold text-slate-400">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] uppercase tracking-wider font-bold text-slate-400">Delivery</th>
                    <th className="px-4 py-3 text-right text-[11px] uppercase tracking-wider font-bold text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((p) => (
                    <tr key={p.id} data-testid={`sk-purchase-${p.id}`} onClick={() => setSelected(p)} className="group hover:bg-primary-50/40 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar name={p.user_name} />
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate max-w-[180px]">{p.user_name || "Partner"}</p>
                            <p className="text-xs text-slate-500">{p.user_phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{p.order_id || "—"}</td>
                      <td className="px-4 py-3 font-heading font-bold text-slate-900 tabular-nums whitespace-nowrap">{inr(p.amount)}</td>
                      <td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-700">{methodLabel(p.method)}</span></td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" />{fmtDateTime(p.created_at)}</span></td>
                      <td className="px-4 py-3"><span className={`inline-flex text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ${p.status === "paid" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}>{p.status === "paid" ? "Paid" : (p.status || "—")}</span></td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={p.tracking_status} />
                          <PremiumSelect value={p.tracking_status || "processing"} data-testid={`sk-track-${p.id}`} onChange={(e) => updateTracking(p.id, e.target.value)} aria-label="Update delivery status" searchable={false}
                            className="!h-8 !w-auto min-w-[130px] rounded-lg text-xs">
                            {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                          </PremiumSelect>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setSelected(p)} data-testid={`sk-view-${p.id}`}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-primary-700 ring-1 ring-primary-200 hover:bg-primary-50 transition-colors">
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile cards */}
            <div className="md:hidden divide-y divide-slate-100" data-testid="sk-cards">
              {rows.map((p) => (
                <button key={p.id} type="button" onClick={() => setSelected(p)} data-testid={`sk-card-${p.id}`} className="w-full text-left p-4 active:bg-primary-50/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={p.user_name} />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{p.user_name || "Partner"}</p>
                        <p className="text-xs text-slate-500">{p.user_phone}</p>
                      </div>
                    </div>
                    <p className="font-heading font-bold text-slate-900 tabular-nums">{inr(p.amount)}</p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                    <StatusBadge status={p.tracking_status} />
                    <span className="text-[11px] text-slate-500 inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDateTime(p.created_at)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-slate-600">{methodLabel(p.method)}</span>
                    <span className="font-mono truncate">{p.order_id || "—"}</span>
                  </div>
                </button>
              ))}
            </div>

            <Pagination page={d.page || 1} totalPages={d.total_pages || 1} pageSize={pageSize} total={d.filtered_count || 0} onPage={setPage} onPageSize={setPageSize} />
          </div>
        )}
      </div>

      <PurchaseDrawer purchase={selected} kitTitle={kitTitle} onClose={() => setSelected(null)} onUpdateStatus={updateTracking} />
    </div>
  );
}

const FilterTag = ({ label, value, onRemove, testId }) => (
  <span data-testid={testId} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-lg bg-primary-50 text-primary-800 text-xs font-semibold ring-1 ring-primary-100">
    <span className="text-primary-500 font-medium">{label}:</span> {value}
    <button onClick={onRemove} aria-label={`Remove ${label} filter`} className="h-5 w-5 rounded-md hover:bg-primary-100 flex items-center justify-center transition-colors"><X className="h-3 w-3" /></button>
  </span>
);
