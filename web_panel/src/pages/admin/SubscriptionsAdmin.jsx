import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, SlidersHorizontal, Download, ChevronDown, X, AlertTriangle, RefreshCcw, Inbox, CalendarDays, CheckCircle2, Clock, ClipboardCheck, BadgeCheck } from "lucide-react";
import api from "@/lib/api";
import { downloadInvoicePdf } from "@/lib/invoiceShare";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Pager } from "./bookings/BookingsTable";
import DateRangeMenu from "./bookings/DateRangeMenu";
import { label, rangeBounds } from "./bookings/shared";
import SubsTable from "./subscriptions/SubsTable";
import SubDrawer from "./subscriptions/SubDrawer";
import RenewalsPanel from "./subscriptions/RenewalsPanel";
import SubFilterDrawer, { EMPTY_SUB_ADV, subAdvCount } from "./subscriptions/SubFilterDrawer";
import { exportSubsCsv, paidOf, setStatus, SET_LABEL } from "./subscriptions/subShared";

const BASE_TABS = ["active", "completed", "pending_payment"];
const STAT_CARDS = [
  ["active", "Active", "Currently active", CalendarDays, "bg-blue-50 text-[#1D4ED8]", "bg-[#2563EB]"],
  ["completed", "Completed", "Plan period finished", CheckCircle2, "bg-green-50 text-[#15803D]", "bg-[#16A34A]"],
  ["settlement_pending", "Settle Pending", "Awaiting review", Clock, "bg-amber-50 text-[#B45309]", "bg-[#F59E0B]"],
  ["settlement_review", "In Review", "Settlement under review", ClipboardCheck, "bg-indigo-50 text-indigo-700", "bg-indigo-500"],
  ["settlement_approved", "Approved", "Ready to pay maid", BadgeCheck, "bg-violet-50 text-violet-700", "bg-violet-500"],
];

function useIsMobile() {
  const q = "(max-width: 767px)";
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const h = () => setM(mq.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, []);
  return m;
}
const uniq = (rows, f) => [...new Set(rows.map(f).filter(Boolean))].sort();
const SelectBox = ({ value, onChange, opts, all, tid, fmt = label }) => (
  <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={tid} aria-label={all}
    className={`h-9 rounded-md border bg-white dark:bg-slate-900 px-2.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${value ? "border-[#0D47A1]/40 text-[#0D47A1]" : "border-[#E5E7EB] dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>
    <option value="">{all}</option>{opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
  </select>
);
const inDay = (v, from, to) => (!from || (v || "") >= from) && (!to || (v || "").slice(0, 10) <= to);

function StatCards({ stats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5" data-testid="sub-summary">
      {STAT_CARDS.map(([k, l, d, I, tone, bar]) => (
        <div key={k} className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 px-3.5 py-3 flex items-center gap-3 transition-shadow hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)]">
          <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${bar}`} aria-hidden />
          <span className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${tone}`}><I className="h-4 w-4" /></span>
          <span className="min-w-0">
            <span className="block text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280] truncate">{l}</span>
            {stats ? <span className="block text-[20px] leading-7 font-bold tabular-nums text-[#111827] dark:text-white" data-testid={`sub-stat-${k}`}>{stats[k] ?? 0}</span> : <Skeleton className="h-6 w-10 my-0.5" />}
            <span className="block text-[11.5px] text-slate-400 truncate">{d}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SubscriptionsAdmin({ onOpenCustomer }) {
  const [rows, setRows] = useState(null);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [qp, setQp] = useState("");
  const [qset, setQset] = useState("");
  const [date, setDate] = useState({ key: "all" });
  const [adv, setAdv] = useState(EMPTY_SUB_ADV);
  const [showAdv, setShowAdv] = useState(false);
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [selected, setSelected] = useState(() => new Set());
  const [view, setView] = useState(null);
  const isMobile = useIsMobile();

  const fetchAll = useCallback(async () => {
    const [r, s] = await Promise.all([api.get("/subscriptions/admin/all"), api.get("/subscriptions/admin/stats")]);
    setRows(r.data || []); setStats(s.data || {}); setErr(false);
  }, []);
  const load = useCallback(() => { setErr(false); setRows(null); fetchAll().catch(() => setErr(true)); }, [fetchAll]);
  useEffect(() => { load(); }, [load]);
  const refresh = async () => {
    setRefreshing(true);
    try { await fetchAll(); setRk((k) => k + 1); toast.success("Subscriptions refreshed"); } catch { toast.error("Unable to refresh subscriptions"); } finally { setRefreshing(false); }
  };
  const [rk, setRk] = useState(0);
  const silent = useCallback(() => { fetchAll().catch(() => {}); setRk((k) => k + 1); }, [fetchAll]);

  const all = useMemo(() => rows || [], [rows]);
  const counts = useMemo(() => all.reduce((m, s) => { m[s.status] = (m[s.status] || 0) + 1; return m; }, {}), [all]);
  const tabs = useMemo(() => [{ key: "all", count: all.length }, ...[...BASE_TABS, ...Object.keys(counts).filter((k) => !BASE_TABS.includes(k)).sort()].map((k) => ({ key: k, count: counts[k] || 0 }))], [counts, all.length]);
  const options = useMemo(() => ({ status: uniq(all, (s) => s.status), plan: uniq(all, (s) => s.plan_label), payment: uniq(all, (s) => s.payment_status || "pending"), settlement: uniq(all, setStatus) }), [all]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const [lo, hi] = rangeBounds(date);
    const has = (v, n) => String(v || "").toLowerCase().includes(n.toLowerCase());
    const out = all.filter((s) => (tab === "all" || s.status === tab)
      && (!t || ["code", "customer_name", "customer_phone", "service_name", "plan_label", "partner_name"].some((k) => has(s[k], t)))
      && (!qp || s.plan_label === qp) && (!qset || setStatus(s) === qset)
      && (!lo || new Date(s.created_at) >= lo) && (!hi || new Date(s.created_at) < hi)
      && (!adv.status || s.status === adv.status) && (!adv.plan || s.plan_label === adv.plan)
      && (!adv.payment || (s.payment_status || "pending") === adv.payment) && (!adv.settlement || setStatus(s) === adv.settlement)
      && (!adv.customer || has(`${s.customer_name} ${s.customer_phone}`, adv.customer))
      && (!adv.maid || (adv.maid.toLowerCase() === "unassigned" ? !s.partner_name : has(s.partner_name, adv.maid)))
      && inDay(s.start_date, adv.startFrom, adv.startTo) && inDay(s.end_date, adv.endFrom, adv.endTo)
      && (adv.min === "" || paidOf(s) >= Number(adv.min)) && (adv.max === "" || paidOf(s) <= Number(adv.max)));
    const v = (s) => (sort.key === "paid" ? paidOf(s) : sort.key === "earned" ? Number(s.accrued_earning || 0) : String(s[sort.key] ?? ""));
    return out.sort((x, y) => { const a = v(x), b = v(y); const r = typeof a === "number" ? a - b : a.localeCompare(b); return sort.dir === "asc" ? r : -r; });
  }, [all, tab, q, qp, qset, date, adv, sort]);

  useEffect(() => { setPage(1); }, [tab, q, qp, qset, date, adv]);
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const pageRows = filtered.slice((Math.min(page, pages) - 1) * size, Math.min(page, pages) * size);
  const nAdv = subAdvCount(adv);
  const anyFilter = q || qp || qset || date.key !== "all" || nAdv || tab !== "all";
  const clearAll = () => { setQ(""); setQp(""); setQset(""); setDate({ key: "all" }); setAdv(EMPTY_SUB_ADV); setTab("all"); };

  const copy = (code) => { navigator.clipboard?.writeText(code).then(() => toast.success("Subscription code copied."), () => toast.error("Could not copy")); };
  const invoice = async (s) => {
    try {
      const { data } = await api.get(`/subscriptions/${s.id}/invoice`);
      if (!data?.invoice_id) throw new Error("no invoice");
      await downloadInvoicePdf({ id: data.invoice_id, invoice_number: `AzoApp-${s.code}` });
    } catch (e) { toast.error(e?.response?.data?.detail || "Invoice not available"); }
  };
  const closeView = useCallback(() => setView(null), []);
  const a = { view: (s, focus) => setView({ id: s.id, focus }), customer: (s) => s.customer_id && onOpenCustomer?.(s.customer_id), canCustomer: !!onOpenCustomer, copy, invoice };
  const toggle = (id) => setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((p) => { const n = new Set(p); const on = pageRows.every((s) => n.has(s.id)); pageRows.forEach((s) => (on ? n.delete(s.id) : n.add(s.id))); return n; });
  const doExport = (list, name) => { exportSubsCsv(list, name); toast.success(`Exported ${list.length} subscriptions`); };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 text-[14px] w-full" data-testid="admin-subscriptions">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div><h1 className="text-[24px] leading-8 font-bold tracking-tight text-[#111827] dark:text-white">Subscriptions</h1><p className="text-[13.5px] text-[#6B7280]">Manage recurring service subscriptions, attendance, payments and maid settlements.</p></div>
          <div className="flex items-center gap-2 self-start">
            <Button variant="outline" className="h-9 text-[13.5px]" disabled={!rows || refreshing} onClick={refresh} data-testid="sub-refresh"><RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "Refreshing…" : "Refresh"}</Button>
            <Button variant="outline" className="h-9 text-[13.5px]" disabled={!rows} onClick={() => doExport(filtered, "subscriptions")} data-testid="sub-export-top"><Download className="h-4 w-4" /> Export</Button>
          </div>
        </div>

        <StatCards stats={err ? {} : stats} />

        <RenewalsPanel refreshKey={rk} onOpen={(s) => setView({ id: s.id })} />

        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5" role="tablist" data-testid="sub-status-tabs">
          {!rows && !err ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-28 rounded-lg shrink-0" />) : tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} data-testid={`sub-tab-${t.key}`}
              className={`h-8 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 transition-colors ${tab === t.key ? "bg-[#0D47A1] border-[#0D47A1] text-white" : "bg-white dark:bg-slate-900 border-[#E5E7EB] dark:border-slate-700 text-[#111827] dark:text-slate-200 hover:border-slate-300"}`}>
              {t.key === "all" ? "All" : label(t.key)}<span className={`min-w-[18px] h-[18px] px-1 rounded text-[11px] tabular-nums grid place-items-center ${tab === t.key ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{t.count}</span>
            </button>
          ))}
        </div>

        <section className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 overflow-hidden" data-testid="sub-card">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3 px-4 py-3 border-b border-[#E5E7EB] dark:border-slate-800">
            <div className="min-w-0 xl:flex-1">
              <h2 className="text-[16px] font-semibold text-[#111827] dark:text-white">{tab !== "all" ? `${label(tab)} Subscriptions` : "All Subscriptions"}</h2>
              <p className="text-[12.5px] text-[#6B7280]" data-testid="sub-count">{filtered.length} subscription{filtered.length === 1 ? "" : "s"}{anyFilter ? " match your filters" : " in total"}</p>
            </div>
            <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 xl:shrink-0">
              <div className="relative w-full sm:w-[320px] 2xl:w-[380px] shrink-0">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, customer, service..." className="h-9 pl-9 pr-8 text-[13.5px] rounded-lg" data-testid="sub-search" aria-label="Search subscriptions" />
                {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
              </div>
              <SelectBox value={qp} onChange={setQp} opts={options.plan} all="All Plans" tid="sub-filter-plan" fmt={(x) => x} />
              <SelectBox value={qset} onChange={setQset} opts={options.settlement} all="All Settlements" tid="sub-filter-settlement" fmt={(x) => SET_LABEL[x] || label(x)} />
              <DateRangeMenu value={date} onChange={setDate} />
              <Button variant="outline" className={`h-9 text-[13px] ${nAdv ? "border-[#0D47A1]/40 text-[#0D47A1]" : ""}`} onClick={() => setShowAdv(true)} data-testid="sub-filters-btn"><SlidersHorizontal className="h-3.5 w-3.5" /> Filters{nAdv > 0 && <span className="ml-0.5 h-[18px] min-w-[18px] px-1 rounded bg-[#0D47A1] text-white text-[11px] grid place-items-center" data-testid="sub-filters-count">{nAdv}</span>}</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" className="h-9 text-[13px]" disabled={!rows} data-testid="sub-export"><Download className="h-3.5 w-3.5" /> Export <ChevronDown className="h-3 w-3 opacity-60" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 text-[13px]">
                  <DropdownMenuItem onSelect={() => doExport(filtered, "subscriptions")} data-testid="sub-export-csv">Export CSV ({filtered.length} filtered)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => doExport(all, "subscriptions-all")} data-testid="sub-export-all">Export CSV (all {all.length})</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-blue-50/70 dark:bg-blue-900/15 border-b border-blue-100 dark:border-blue-900/30 cc-rise" data-testid="sub-bulk-bar">
              <span className="text-[13px] font-semibold text-[#0D47A1]">{selected.size} selected</span>
              <Button variant="outline" className="h-7 text-[12.5px]" onClick={() => doExport(all.filter((s) => selected.has(s.id)), "subscriptions-selected")} data-testid="sub-bulk-export"><Download className="h-3.5 w-3.5" /> Export</Button>
              <button type="button" className="ml-auto text-[12.5px] text-slate-500 hover:text-slate-800" onClick={() => setSelected(new Set())} data-testid="sub-bulk-clear">Clear selection</button>
            </div>
          )}

          {err ? (
            <div className="py-14 text-center" data-testid="sub-error">
              <AlertTriangle className="h-8 w-8 mx-auto text-[#DC2626]" />
              <p className="mt-2 text-[15px] font-semibold text-[#111827] dark:text-white">Unable to load subscriptions</p>
              <p className="text-[13px] text-[#6B7280]">Something went wrong while loading subscription data.</p>
              <Button className="mt-3 h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={load} data-testid="sub-retry"><RefreshCcw className="h-4 w-4" /> Retry</Button>
            </div>
          ) : !rows ? (
            <div className="p-4 space-y-3" data-testid="sub-loading">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="flex items-center gap-4"><Skeleton className="h-4 w-4" /><Skeleton className="h-4 w-24" /><Skeleton className="h-7 w-7 rounded-full" /><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-28" /><Skeleton className="h-4 w-20" /><Skeleton className="h-5 w-20 rounded-md ml-auto" /><Skeleton className="h-4 w-16" /></div>)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center" data-testid="sub-empty">
              <span className="h-12 w-12 mx-auto rounded-xl bg-slate-50 dark:bg-slate-800 grid place-items-center"><Inbox className="h-6 w-6 text-slate-400" /></span>
              <p className="mt-3 text-[15px] font-semibold text-[#111827] dark:text-white">No subscriptions found</p>
              <p className="text-[13px] text-[#6B7280]">{all.length ? "There are no subscriptions matching your current filters." : "No customer has purchased a recurring subscription yet."}</p>
              <div className="mt-3 flex justify-center gap-2">
                {anyFilter ? <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={clearAll} data-testid="sub-clear-filters">Clear Filters</Button> : null}
                <Button variant="outline" className="h-9 text-[13.5px]" onClick={refresh} disabled={refreshing} data-testid="sub-empty-refresh"><RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh</Button>
              </div>
            </div>
          ) : (
            <>
              <SubsTable rows={pageRows} isMobile={isMobile} sort={sort} setSort={setSort} selected={selected} toggle={toggle} toggleAll={toggleAll} a={a} />
              <Pager page={Math.min(page, pages)} pages={pages} setPage={setPage} size={size} setSize={setSize} total={filtered.length} />
            </>
          )}
        </section>

        {view && <SubDrawer id={view.id} focus={view.focus} onClose={closeView} onChanged={silent} onCopy={copy} onInvoice={invoice} />}
        {showAdv && <SubFilterDrawer value={adv} options={options} onClose={() => setShowAdv(false)} onApply={(v) => { setAdv(v); setShowAdv(false); }} />}
      </div>
    </TooltipProvider>
  );
}
