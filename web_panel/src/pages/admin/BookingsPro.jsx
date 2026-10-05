import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, SlidersHorizontal, Download, ChevronDown, X, AlertTriangle, RefreshCcw, Inbox, ClipboardList, Clock, Activity, CheckCircle2, Wallet, XCircle, Banknote } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import BookingsTable, { Pager } from "./bookings/BookingsTable";
import BookingDrawer from "./bookings/BookingDrawer";
import FilterDrawer, { EMPTY_ADV, advCount } from "./bookings/FilterDrawer";
import DateRangeMenu from "./bookings/DateRangeMenu";
import { ORDER, IN_PROGRESS, label, amountOf, rangeBounds, exportCsv } from "./bookings/shared";

function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, []);
  return m;
}
const uniq = (rows, f) => [...new Set(rows.map(f).filter(Boolean))].sort();
const SelectBox = ({ value, onChange, opts, all, tid }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={tid} aria-label={all}
    className={`h-9 rounded-md border bg-white dark:bg-slate-900 px-2.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${value ? "border-[#0D47A1]/40 text-[#0D47A1]" : "border-[#E5E7EB] dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>
    <option value="">{all}</option>{opts.map((o) => <option key={o} value={o}>{label(o)}</option>)}
  </select>
);

export default function BookingsPro({ onOpen, onOpenCustomer, tab: tabProp, onTabChange }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(false);
  const [tabInner, setTabInner] = useState("");
  const tab = tabProp ?? tabInner;
  const setTab = onTabChange ?? setTabInner;
  const [q, setQ] = useState("");
  const [qs, setQs] = useState("");
  const [qt, setQt] = useState("");
  const [date, setDate] = useState({ key: "all" });
  const [adv, setAdv] = useState(EMPTY_ADV);
  const [showAdv, setShowAdv] = useState(false);
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [view, setView] = useState(null);
  const [cosOnly, setCosOnly] = useState(false);
  const isMobile = useIsMobile();

  const load = useCallback(() => { setErr(false); setRows(null); api.get("/admin/bookings").then((r) => setRows(r.data || [])).catch(() => setErr(true)); }, []);
  useEffect(() => { load(); }, [load]);

  const all = useMemo(() => rows || [], [rows]);
  const counts = useMemo(() => all.reduce((m, b) => { m[b.status] = (m[b.status] || 0) + 1; return m; }, {}), [all]);
  const tabs = useMemo(() => [...Object.keys(counts).sort((a, b) => (ORDER[a] ?? 90) - (ORDER[b] ?? 90) || a.localeCompare(b)).map((s) => ({ key: s, count: counts[s] })), { key: "all", count: all.length }], [counts, all.length]);
  useEffect(() => { if (!all.length) return; if (!tab || !tabs.some((t) => t.key === tab)) setTab(tabs[0].key); }, [all.length, tab, tabs, setTab]);

  const options = useMemo(() => ({ status: uniq(all, (b) => b.status), type: uniq(all, (b) => b.booking_type || "direct"), service: uniq(all, (b) => b.service_name), category: uniq(all, (b) => b.category_name), payment: uniq(all, (b) => b.payment_status || "pending") }), [all]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const inRange = (r, iso) => { const [lo, hi] = rangeBounds(r); if (!lo && !hi) return true; const d = new Date(iso); return (!lo || d >= lo) && (!hi || d < hi); };
    const out = all.filter((b) => (tab === "all" || !tab || b.status === tab)
      && (!s || ["code", "service_name", "customer_name", "partner_name"].some((k) => String(b[k] || "").toLowerCase().includes(s)))
      && (!qs || b.status === qs) && (!qt || (b.booking_type || "direct") === qt) && inRange(date, b.created_at)
      && (!adv.status || b.status === adv.status) && (!adv.type || (b.booking_type || "direct") === adv.type)
      && (!adv.service || b.service_name === adv.service) && (!adv.category || b.category_name === adv.category)
      && (!adv.payment || (b.payment_status || "pending") === adv.payment)
      && (!adv.customer || `${b.customer_name || ""} ${b.customer_phone || ""}`.toLowerCase().includes(adv.customer.toLowerCase()))
      && (!adv.partner || (adv.partner.toLowerCase() === "unassigned" ? !b.partner_name : String(b.partner_name || "").toLowerCase().includes(adv.partner.toLowerCase())))
      && (adv.min === "" || amountOf(b) >= Number(adv.min)) && (adv.max === "" || amountOf(b) <= Number(adv.max)) && inRange(adv.date, b.created_at)
      && (!cosOnly || (b.payment_method === "cos")));
    const v = (b) => (sort.key === "amount" ? amountOf(b) : String(b[sort.key] ?? ""));
    return out.sort((x, y) => { const a = v(x), b = v(y); const r = typeof a === "number" ? a - b : a.localeCompare(b); return sort.dir === "asc" ? r : -r; });
  }, [all, tab, q, qs, qt, date, adv, sort, cosOnly]);

  const cosTotals = useMemo(() => {
    const r = { token_paid: 0, cash_to_collect: 0, cash_collected: 0 };
    for (const b of filtered) {
      if (b.payment_method !== "cos") continue;
      const c = b.cos || {};
      r.token_paid += Number(c.token_amount || 0);
      r.cash_to_collect += Number(c.cash_to_collect || 0);
      r.cash_collected += c.cash_collected ? Number(c.collected_amount || 0) : 0;
    }
    r.cash_pending = Math.max(0, r.cash_to_collect - r.cash_collected);
    return r;
  }, [filtered]);

  useEffect(() => { setPage(1); }, [tab, q, qs, qt, date, adv, cosOnly]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const pageRows = filtered.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size);
  const nAdv = advCount(adv);
  const anyFilter = q || qs || qt || date.key !== "all" || nAdv;
  const clearAll = () => { setQ(""); setQs(""); setQt(""); setDate({ key: "all" }); setAdv(EMPTY_ADV); };

  const copy = (code) => { navigator.clipboard?.writeText(code).then(() => toast.success("Booking code copied."), () => toast.error("Could not copy")); };
  const a = { view: setView, full: (b) => onOpen?.(b), customer: (b) => b.customer_id && onOpenCustomer?.(b.customer_id), copy };
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((s) => { const n = new Set(s); const on = pageRows.every((b) => n.has(b.id)); pageRows.forEach((b) => (on ? n.delete(b.id) : n.add(b.id))); return n; });
  const doExport = (list, name) => { exportCsv(list, name); toast.success(`Exported ${list.length} bookings`); };

  const sum = (keys) => keys.reduce((s, k) => s + (counts[k] || 0), 0);
  const stats = [[ClipboardList, "Total Bookings", all.length, "text-[#111827]", "all"], [Clock, "Pending", sum(["pending", "pending_payment"]), "text-[#B45309]"], [Activity, "In Progress", sum(IN_PROGRESS), "text-[#1D4ED8]"], [CheckCircle2, "Completed", sum(["completed"]), "text-[#15803D]", "completed"], [Wallet, "Paid", sum(["paid"]), "text-[#15803D]", "paid"], [XCircle, "Cancelled", sum(["cancelled"]), "text-[#B91C1C]", "cancelled"]];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 text-[14px]" data-testid="bookings-page">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div><h1 className="text-[24px] leading-8 font-bold tracking-tight text-[#111827] dark:text-white">Bookings</h1><p className="text-[13.5px] text-[#6B7280]">Manage, monitor and track all customer bookings and service orders.</p></div>
          <div className="flex items-center gap-2 self-start">
            <Button variant={cosOnly ? "default" : "outline"} className={`h-9 text-[13.5px] ${cosOnly ? "bg-amber-500 hover:bg-amber-600 border-amber-500" : ""}`} disabled={!rows} onClick={() => setCosOnly((v) => !v)} data-testid="bk-cos-filter"><Banknote className="h-4 w-4" /> Cash on Service</Button>
            <Button variant="outline" className="h-9 text-[13.5px]" disabled={!rows} onClick={() => doExport(filtered, "bookings")} data-testid="bk-export-top"><Download className="h-4 w-4" /> Export</Button>
          </div>
        </div>

        {cosOnly && rows ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" data-testid="bk-cos-totals">
            {[["Token paid (online)", cosTotals.token_paid, "text-emerald-700"], ["Cash to collect", cosTotals.cash_to_collect, "text-slate-800"], ["Cash collected", cosTotals.cash_collected, "text-emerald-700"], ["Cash pending", cosTotals.cash_pending, "text-amber-700"]].map(([l, v, c]) => (
              <div key={l} className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2.5">
                <span className="block text-[11.5px] text-amber-800/80 truncate">{l}</span>
                <span className={`block text-[17px] leading-6 font-bold tabular-nums ${c}`} data-testid={`bk-cos-${String(l).toLowerCase().replace(/[^a-z]+/g, "-").replace(/-$/, "")}`}>{fmt(v)}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5" role="tablist" data-testid="bk-status-tabs">
          {!rows && !err && [0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-28 rounded-lg shrink-0" />)}
          {rows && tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} data-testid={`bk-tab-${t.key}`}
              className={`h-8 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${tab === t.key ? "bg-[#0D47A1] border-[#0D47A1] text-white" : "bg-white dark:bg-slate-900 border-[#E5E7EB] dark:border-slate-700 text-[#111827] dark:text-slate-200 hover:border-slate-300"}`}>
              {t.key === "all" ? "All" : label(t.key)}<span className={`min-w-[18px] h-[18px] px-1 rounded text-[11px] tabular-nums grid place-items-center ${tab === t.key ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{t.count}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5" data-testid="bk-summary">
          {stats.map(([I, l, v, c, k]) => (
            <button key={l} type="button" disabled={!k || !rows} onClick={() => k && setTab(k === "all" ? "all" : counts[k] ? k : tab)} className="text-left bg-white dark:bg-slate-900 rounded-md border border-[#E5E7EB] dark:border-slate-800 px-3 py-2.5 flex items-center gap-2.5 transition-shadow enabled:hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)] disabled:cursor-default">
              <I className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="min-w-0"><span className="block text-[11.5px] text-[#6B7280] truncate">{l}</span><span className={`block text-[17px] leading-6 font-bold tabular-nums ${c}`} data-testid={`bk-stat-${l.toLowerCase().replace(/ /g, "-")}`}>{rows ? v : "—"}</span></span>
            </button>
          ))}
        </div>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 overflow-hidden" data-testid="bk-card">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3 px-4 py-3 border-b border-[#E5E7EB] dark:border-slate-800">
            <div className="min-w-0 xl:flex-1">
              <h2 className="text-[16px] font-semibold text-[#111827] dark:text-white">{tab && tab !== "all" ? `${label(tab)} Bookings` : "All Bookings"}</h2>
              <p className="text-[12.5px] text-[#6B7280]" data-testid="bk-count">View and manage customer bookings · {filtered.length} {tab && tab !== "all" ? label(tab).toLowerCase() : "total"} bookings</p>
            </div>
            <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 xl:shrink-0">
              <div className="relative w-full sm:w-[220px] 2xl:w-[260px] shrink-0">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, service, customer..." className="h-9 pl-9 pr-8 text-[13.5px] rounded-lg" data-testid="bk-search" aria-label="Search bookings" />
                {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <SelectBox value={qs} onChange={setQs} opts={options.status} all="All Status" tid="bk-filter-status" />
              <SelectBox value={qt} onChange={setQt} opts={options.type} all="All Type" tid="bk-filter-type" />
              <DateRangeMenu value={date} onChange={setDate} />
              <Button variant="outline" className={`h-9 text-[13px] ${nAdv ? "border-[#0D47A1]/40 text-[#0D47A1]" : ""}`} onClick={() => setShowAdv(true)} data-testid="bk-filters-btn"><SlidersHorizontal className="h-3.5 w-3.5" /> Filters{nAdv > 0 && <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded bg-[#0D47A1] text-white text-[11px] grid place-items-center">{nAdv}</span>}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" className="h-9 text-[13px]" disabled={!rows} data-testid="bk-export"><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3 opacity-60" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 text-[13px]">
                  <DropdownMenuItem onSelect={() => doExport(filtered, "bookings")} data-testid="bk-export-csv">Export CSV ({filtered.length} filtered)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => doExport(all, "bookings-all")} data-testid="bk-export-all">Export CSV (all {all.length})</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-blue-50/70 dark:bg-blue-900/15 border-b border-blue-100 dark:border-blue-900/30 cc-rise" data-testid="bk-bulk-bar">
              <span className="text-[13px] font-semibold text-[#0D47A1]">{selected.size} selected</span>
              <Button variant="outline" className="h-7 text-[12.5px]" onClick={() => doExport(all.filter((b) => selected.has(b.id)), "bookings-selected")} data-testid="bk-bulk-export"><Download className="h-3.5 w-3.5" /> Export</Button>
              <button type="button" className="ml-auto text-[12.5px] text-slate-500 hover:text-slate-800" onClick={() => setSelected(new Set())} data-testid="bk-bulk-clear">Clear selection</button>
            </div>
          )}

          {err ? (
            <div className="py-14 text-center" data-testid="bk-error">
              <AlertTriangle className="h-8 w-8 mx-auto text-[#DC2626]" />
              <p className="mt-2 text-[15px] font-semibold text-[#111827] dark:text-white">Unable to load bookings</p>
              <p className="text-[13px] text-[#6B7280]">Something went wrong while loading booking data.</p>
              <Button className="mt-3 h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={load} data-testid="bk-retry"><RefreshCcw className="h-4 w-4" /> Retry</Button>
            </div>
          ) : !rows ? (
            <div className="p-4 space-y-3" data-testid="bk-loading">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-40" /><Skeleton className="h-7 w-7 rounded-full" /><Skeleton className="h-4 w-28" /><Skeleton className="h-5 w-20 rounded-md ml-auto" /><Skeleton className="h-4 w-16" /></div>)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center" data-testid="bk-empty">
              <Inbox className="h-8 w-8 mx-auto text-slate-300" />
              <p className="mt-2 text-[15px] font-semibold text-[#111827] dark:text-white">No bookings found</p>
              <p className="text-[13px] text-[#6B7280]">No bookings match your current filters.</p>
              {anyFilter ? <Button variant="outline" className="mt-3 h-9 text-[13.5px]" onClick={clearAll} data-testid="bk-clear-filters">Clear Filters</Button> : null}
            </div>
          ) : (
            <>
              <BookingsTable rows={pageRows} isMobile={isMobile} sort={sort} setSort={setSort} selected={selected} toggle={toggle} toggleAll={toggleAll} a={a} />
              <Pager page={Math.min(page, pages)} pages={pages} setPage={setPage} size={size} setSize={setSize} total={filtered.length} />
            </>
          )}
        </section>

        {view && <BookingDrawer b={view} onClose={() => setView(null)} onCopy={copy} onOpenFull={() => { const b = view; setView(null); onOpen?.(b); }} />}
        {showAdv && <FilterDrawer value={adv} options={options} onClose={() => setShowAdv(false)} onApply={(v) => { setAdv(v); setShowAdv(false); }} />}
      </div>
    </TooltipProvider>
  );
}
