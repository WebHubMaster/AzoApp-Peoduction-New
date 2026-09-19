import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SlidersHorizontal, RefreshCw, ArrowUpDown, X, Search } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  PageHeader, InvoiceKpis, KpiSkeleton, DateChips, SearchBox, InvoiceTable, InvoiceCardList, AdvancedPaginator,
  TableSkeleton, InvEmpty, InvError, Surface, useDebounced,
} from "./invoices/InvoiceParts";
import InvoiceFilterDrawer, { EMPTY_FILTERS, countFilters } from "./invoices/InvoiceFilterDrawer";
import InvoiceDetailPanel from "./invoices/InvoiceDetailPanel";
import InvoiceViewer from "./invoices/InvoiceViewer";
import { printInvoiceHtml } from "./invoices/invoicePrint";
import { shareInvoicePdf } from "@/lib/invoiceShare";
import { useMediaQuery } from "./invoices/Overlays";
import { SORT_OPTIONS, presetLabel, nextColumnSort, typeMeta, statusMeta, shareText, invoiceLink, copyText } from "./invoices/invoiceUtils";

export default function MerchantInvoices({ shopName = "My Shop", role = "merchant", title = "My Invoices", subtitle = "Commission & booking invoices for your shop" }) {
  /* ── list state ── */
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [range, setRange] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({ from: "", to: "" });
  const [sort, setSort] = useState("newest");
  const [searchRaw, setSearchRaw] = useState("");
  const search = useDebounced(searchRaw.trim(), 350);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);

  /* ── detail / viewer state ── */
  const [selected, setSelected] = useState(null);   // row summary for detail drawer
  const [viewerInv, setViewerInv] = useState(null); // full invoice for viewer (or {id} while loading)
  const [fullCache, setFullCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [printing, setPrinting] = useState(false);
  const reqRef = useRef(0);
  const compact = useMediaQuery("(max-width: 767px)"); // cards below md, table from md up
  const desktop = useMediaQuery("(min-width: 1024px)"); // desktop toolbar in header vs mobile toolbar row

  const params = useMemo(() => ({
    page, page_size: pageSize, range, sort,
    date_from: range === "custom" ? applied.from || undefined : undefined,
    date_to: range === "custom" ? applied.to || undefined : undefined,
    search: search || undefined,
    invoice_type: filters.types.length ? filters.types.join(",") : "all",
    payment_status: filters.statuses.length ? filters.statuses.join(",") : "all",
    min_amount: filters.minAmount || undefined, max_amount: filters.maxAmount || undefined,
    customer: filters.customer || undefined, booking_id: filters.booking || undefined,
  }), [page, pageSize, range, sort, applied, search, filters]);

  const load = useCallback(async (silent = false) => {
    const id = ++reqRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await api.get("/invoices", { params });
      if (id === reqRef.current) setData(r.data);
    } catch (e) {
      if (id === reqRef.current) setError(!navigator.onLine || !e?.response ? "offline" : "error");
    } finally { if (id === reqRef.current) setLoading(false); }
  }, [params]);
  useEffect(() => { load(); }, [load]);

  // reset to page 1 whenever filters / search / sort / size change
  const resetKey = JSON.stringify({ range, applied, sort, search, filters, pageSize });
  const firstRun = useRef(true);
  useEffect(() => { if (firstRun.current) { firstRun.current = false; return; } setPage(1); }, [resetKey]);

  // reconnect handling
  useEffect(() => {
    const on = () => { if (error === "offline") { toast.success("Back online"); load(); } };
    window.addEventListener("online", on); return () => window.removeEventListener("online", on);
  }, [error, load]);

  /* ── full invoice fetch (cached) ── */
  const fetchFull = useCallback(async (id) => {
    if (fullCache[id]) return fullCache[id];
    const r = await api.get(`/invoices/${id}`);
    setFullCache((c) => ({ ...c, [id]: r.data }));
    return r.data;
  }, [fullCache]);

  const openDetail = async (inv) => {
    setSelected(inv);
    if (fullCache[inv.id]) return;
    setDetailLoading(true);
    try { await fetchFull(inv.id); } catch { toast.error("Invoice details could not be loaded", { action: { label: "Try Again", onClick: () => openDetail(inv) } }); }
    finally { setDetailLoading(false); }
  };
  const openViewer = async (inv) => {
    setViewerInv({ id: inv.id, invoice_number: inv.invoice_number, issue_date: inv.issue_date });
    setViewerLoading(true);
    try { setViewerInv(await fetchFull(inv.id)); }
    catch { toast.error("Invoice could not be loaded", { action: { label: "Try Again", onClick: () => openViewer(inv) } }); setViewerInv(null); }
    finally { setViewerLoading(false); }
  };

  // deep-link: /merchant?invoice=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("invoice");
    if (id) { openViewer({ id }); const u = new URL(window.location.href); u.searchParams.delete("invoice"); window.history.replaceState({}, "", u.toString()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── actions ── */
  const download = async (inv) => {
    if (!inv?.id) return;
    setBusyId(inv.id);
    const t = toast.loading("Preparing invoice...");
    try {
      // Always download the server-rendered PDF (WeasyPrint) — the exact same
      // HTML template as the on-screen preview + print, so all three match.
      const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const href = URL.createObjectURL(r.data); const a = document.createElement("a");
      a.href = href; a.download = `${inv.invoice_number || "invoice"}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
      toast.success("Invoice downloaded successfully", { id: t });
    } catch {
      toast.error("Invoice could not be downloaded", { id: t, action: { label: "Try Again", onClick: () => download(inv) } });
    } finally { setBusyId(null); }
  };

  const print = async (inv) => {
    if (!inv?.id) return;
    setPrinting(true);
    try {
      const r = await api.get(`/invoices/${inv.id}/view`, { responseType: "text", transformResponse: [(d) => d] });
      await printInvoiceHtml(typeof r.data === "string" ? r.data : "", inv.invoice_number || "Invoice");
    }
    catch { toast.error("Invoice could not be printed", { action: { label: "Try Again", onClick: () => print(inv) } }); }
    finally { setPrinting(false); }
  };

  const share = async (inv, channel) => {
    if (!inv) return;
    // WhatsApp / system share now sends the ACTUAL invoice PDF (native sheet on
    // mobile → WhatsApp; download + WhatsApp Web fallback on desktop).
    if (channel === "whatsapp" || channel === "system") { await shareInvoicePdf(inv, channel === "system" ? "system" : "whatsapp"); return; }
    const text = shareText(inv); const link = invoiceLink(inv);
    if (channel === "copy") { (await copyText(link)) ? toast.success("Invoice link copied") : toast.error("Could not copy link"); return; }
    if (channel === "text") { (await copyText(text)) ? toast.success("Invoice details copied") : toast.error("Could not copy"); return; }
    if (navigator.share) { try { await navigator.share({ title: inv.invoice_number, text, url: link }); } catch { /* cancelled */ } return; }
    (await copyText(link)) ? toast.success("Sharing not supported here — link copied instead") : toast.error("Sharing not available");
  };
  const copyNumber = async (inv) => { (await copyText(inv.invoice_number)) ? toast.success(`Copied ${inv.invoice_number}`) : toast.error("Could not copy"); };

  const applyCustom = () => { setApplied({ from: dateFrom, to: dateTo }); };
  const onRangeChange = (k) => { setRange(k); if (k !== "custom") setApplied({ from: "", to: "" }); };
  const onRangeApplyFromDrawer = (k, f, t) => { setRange(k); setDateFrom(f); setDateTo(t); setApplied(k === "custom" ? { from: f, to: t } : { from: "", to: "" }); };
  const clearAll = () => { setFilters(EMPTY_FILTERS); setSearchRaw(""); setRange("all"); setApplied({ from: "", to: "" }); setDateFrom(""); setDateTo(""); };
  const onSortCol = (col) => setSort((s) => nextColumnSort(s, col));

  const items = data?.items || [];
  const summary = data?.summary || {};
  const cur = items[0]?.currency || "INR";
  const nFilters = countFilters(filters);
  const isFiltered = nFilters > 0 || !!search || range !== "all";
  const emptyHint = role === "partner" ? "Your booking, earnings & withdrawal documents will appear here." : undefined;
  const searching = loading && !!data && (searchRaw.trim() !== search || !!search);
  const rangeLabel = range === "custom" && (applied.from || applied.to) ? `${applied.from || "…"} → ${applied.to || "…"}` : presetLabel(range);

  const filterBadge = nFilters ? <span className="ml-1.5 h-5 min-w-5 px-1.5 rounded-full bg-[#0D47A1] text-white text-[10px] font-bold grid place-items-center" data-testid="invoice-filter-count">{nFilters}</span> : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5" data-testid="merchant-invoices">
      {/* ── page header (desktop toolbar on the right) ── */}
      <PageHeader shopName={shopName} title={title} subtitle={subtitle} right={desktop && (
        <div className="flex items-center gap-2">
          <SearchBox value={searchRaw} onChange={setSearchRaw} searching={searching} className="w-[300px] xl:w-[340px]" />
          <Button variant="outline" className="h-11 rounded-xl border-slate-200 dark:border-slate-700" onClick={() => setShowFilters(true)} data-testid="invoice-filters-btn"><SlidersHorizontal className="h-4 w-4 mr-1.5" /> Filters{filterBadge}</Button>
          <SortMenu sort={sort} onChange={setSort} />
          <Button variant="outline" className="h-11 w-11 p-0 rounded-xl border-slate-200 dark:border-slate-700" onClick={() => load(true)} aria-label="Refresh" data-testid="invoice-refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
        </div>
      )} />

      {/* ── mobile / tablet toolbar ── */}
      {!desktop && <div className="space-y-2.5">
        <div className="flex items-center gap-2">
          <SearchBox value={searchRaw} onChange={setSearchRaw} searching={searching} className="flex-1" autoFocus={mobileSearch} />
          <button onClick={() => setShowFilters(true)} aria-label="Filters" data-testid="invoice-filters-btn-m" className="relative h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 grid place-items-center text-slate-600 dark:text-slate-300 active:scale-95 transition">
            <SlidersHorizontal className="h-[18px] w-[18px]" />
            {nFilters > 0 && <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-[#0D47A1] text-white text-[10px] font-bold grid place-items-center ring-2 ring-white dark:ring-slate-950">{nFilters}</span>}
          </button>
          <SortMenu sort={sort} onChange={setSort} compact />
          <button onClick={() => load(true)} aria-label="Refresh" data-testid="invoice-refresh-m" className="h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 grid place-items-center text-slate-600 dark:text-slate-300 active:scale-95 transition"><RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /></button>
        </div>
      </div>}

      {/* ── date filters ── */}
      <DateChips value={range} onChange={onRangeChange} dateFrom={dateFrom} dateTo={dateTo} onDateFrom={setDateFrom} onDateTo={setDateTo} onApplyCustom={applyCustom} customApplied={range === "custom" && (applied.from || applied.to) && applied.from === dateFrom && applied.to === dateTo} />

      {/* ── active filter chips ── */}
      {(nFilters > 0 || search) && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="invoice-active-filters">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1">{nFilters} filter{nFilters === 1 ? "" : "s"} applied{search ? " · search" : ""}</span>
          {filters.types.map((t) => <ActiveChip key={t} label={`Type: ${typeMeta(t).label}`} onRemove={() => setFilters((f) => ({ ...f, types: f.types.filter((x) => x !== t) }))} />)}
          {filters.statuses.map((s) => <ActiveChip key={s} label={statusMeta(s).label} onRemove={() => setFilters((f) => ({ ...f, statuses: f.statuses.filter((x) => x !== s) }))} />)}
          {(filters.minAmount || filters.maxAmount) && <ActiveChip label={`₹${filters.minAmount || 0} – ${filters.maxAmount ? "₹" + filters.maxAmount : "any"}`} onRemove={() => setFilters((f) => ({ ...f, minAmount: "", maxAmount: "" }))} />}
          {filters.customer && <ActiveChip label={`Customer: ${filters.customer}`} onRemove={() => setFilters((f) => ({ ...f, customer: "" }))} />}
          {filters.booking && <ActiveChip label={`Booking: ${filters.booking}`} onRemove={() => setFilters((f) => ({ ...f, booking: "" }))} />}
          {search && <ActiveChip label={<span className="inline-flex items-center gap-1"><Search className="h-3 w-3" />{search}</span>} onRemove={() => setSearchRaw("")} />}
          <button onClick={clearAll} className="text-xs font-semibold text-[#0D47A1] dark:text-primary-300 hover:underline ml-1" data-testid="invoice-clear-all">Clear all</button>
        </div>
      )}

      {/* ── KPIs ── */}
      {loading && !data ? <KpiSkeleton /> : <InvoiceKpis summary={summary} currency={cur} rangeLabel={rangeLabel} />}

      {/* ── list ── */}
      <Surface className="overflow-hidden" data-testid="invoice-list-surface">
        {loading && !data ? <TableSkeleton /> : error ? <InvError offline={error === "offline"} onRetry={() => load()} />
          : items.length === 0 ? <InvEmpty filtered={isFiltered} onClear={clearAll} hint={emptyHint} />
          : (
            <div className={`transition-opacity duration-200 ${loading ? "opacity-60 pointer-events-none" : ""}`}>
              {compact ? (
                <div className="p-3">
                  <InvoiceCardList items={items} onView={openDetail} onPreview={openViewer} onDownload={download} onPrint={print} onShare={share} onCopy={copyNumber} busyId={busyId} />
                </div>
              ) : (
                <InvoiceTable items={items} sort={sort} onSort={onSortCol} onView={openDetail} onPreview={openViewer} onDownload={download} onPrint={print} onShare={share} onCopy={copyNumber} busyId={busyId} />
              )}
              <div className="px-4 sm:px-5 pb-4">
                <AdvancedPaginator page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} onPageSize={setPageSize} />
              </div>
            </div>
          )}
      </Surface>

      {/* ── overlays ── */}
      <InvoiceFilterDrawer open={showFilters} onClose={() => setShowFilters(false)} filters={filters} onApply={setFilters}
        range={range} dateFrom={dateFrom} dateTo={dateTo} onRangeApply={onRangeApplyFromDrawer} counts={summary} />
      <InvoiceDetailPanel inv={selected} full={selected ? fullCache[selected.id] : null} loading={detailLoading} onClose={() => setSelected(null)}
        onDownload={download} onPreview={(inv) => { openViewer(inv); }} onPrint={print} onShare={share} onCopy={copyNumber} downloading={!!selected && busyId === selected.id} merchantName={shopName} role={role} />
      <InvoiceViewer inv={viewerInv} loading={viewerLoading} onClose={() => setViewerInv(null)} onDownload={download} onPrint={print} onShare={share}
        downloading={!!viewerInv && busyId === viewerInv.id} printing={printing} />
    </motion.div>
  );
}

function ActiveChip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1 rounded-lg bg-primary-50 dark:bg-blue-950/60 text-primary-700 dark:text-blue-200 text-xs font-semibold ring-1 ring-primary-200/70 dark:ring-blue-800/70">
      {label}<button onClick={onRemove} aria-label="Remove filter" className="h-6 w-6 grid place-items-center rounded-md hover:bg-primary-100 dark:hover:bg-primary-800/50"><X className="h-3 w-3" /></button>
    </span>
  );
}

function SortMenu({ sort, onChange, compact }) {
  const label = (SORT_OPTIONS.find(([k]) => k === sort) || [])[1] || "Sort";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {compact
          ? <button aria-label="Sort" data-testid="invoice-sort-btn-m" className="h-11 w-11 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 grid place-items-center text-slate-600 dark:text-slate-300 active:scale-95 transition"><ArrowUpDown className="h-[18px] w-[18px]" /></button>
          : <Button variant="outline" className="h-11 rounded-xl border-slate-200 dark:border-slate-700" data-testid="invoice-sort-btn"><ArrowUpDown className="h-4 w-4 mr-1.5" /> <span className="max-w-[130px] truncate">{label}</span></Button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-slate-400">Sort by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map(([k, l]) => (
          <DropdownMenuItem key={k} onClick={() => onChange(k)} data-testid={`invoice-sort-${k}`} className={`h-10 rounded-lg ${sort === k ? "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-semibold" : ""}`}>{l}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
