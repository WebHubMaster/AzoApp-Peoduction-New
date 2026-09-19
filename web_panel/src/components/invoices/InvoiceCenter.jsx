import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { motion } from "framer-motion";
import {
  FileText, Download, Eye, Search, SlidersHorizontal, X, Loader2, RefreshCw,
  IndianRupee, ReceiptText, AlertTriangle, FileSpreadsheet, FolderArchive, Mail,
  MoreHorizontal, Printer, Share2, Copy, CheckCircle2, Clock, RotateCcw, ArrowUpDown,
  User, CalendarDays, Wallet, MessageCircle,
} from "lucide-react";
import api from "@/lib/api";
import { shareInvoicePdf } from "@/lib/invoiceShare";
import InvoiceA4Frame from "@/components/invoices/InvoiceA4Frame";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  KpiCard, Surface, StatusBadge, EmptyState, Paginator, DetailDrawer, KV, RowsSkeleton, KpiSkeletonRow, Sk,
} from "@/components/merchant/finance/FinanceKit";

const money = (n, cur = "INR") =>
  (cur === "INR" ? "₹" : cur + " ") + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const shortDate = (s) => { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return (s || "").slice(0, 10); } };

const DATE_PRESETS = [
  ["all", "All time"], ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 Days"],
  ["30d", "Last 30 Days"], ["this_month", "This Month"], ["last_month", "Last Month"], ["this_year", "This Year"], ["custom", "Custom"],
];
const TYPES = [["all", "All Types"], ["booking", "Booking"], ["cancellation", "Cancellation"], ["refund", "Refund Receipt"], ["transaction", "Transaction"], ["withdrawal", "Withdrawal"]];
const PAY_STATUS = ["all", "paid", "pending", "processing", "refunded", "cancelled", "failed"];
const SORTS = [["newest", "Newest first"], ["oldest", "Oldest first"], ["amount_high", "Highest amount"], ["amount_low", "Lowest amount"], ["number", "Invoice number"]];
const TYPE_LABEL = { booking: "Service Invoice", cancellation: "Cancellation", refund: "Refund Receipt", transaction: "Transaction", withdrawal: "Withdrawal" };
const TYPE_BADGE = {
  booking: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-800",
  cancellation: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800",
  refund: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
  transaction: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-800",
  withdrawal: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800",
};

export default function InvoiceCenter({ role = "customer", title = "My Invoices", subtitle = "" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [range, setRange] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [type, setType] = useState("all");
  const [payStatus, setPayStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [sort, setSort] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);

  const [drawerInv, setDrawerInv] = useState(null);   // list row summary for drawer
  const [drawerFull, setDrawerFull] = useState(null);  // full invoice (line items + breakdown) for the drawer
  const [detail, setDetail] = useState(null);          // full invoice for dialog preview
  const [previewHtml, setPreviewHtml] = useState("");   // server-rendered invoice HTML (source of truth)
  const [detailLoading, setDetailLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const frameRef = useRef(null);

  const buildParams = useCallback(() => ({
    range, invoice_type: type, payment_status: payStatus, sort,
    search: search || undefined, min_amount: minAmount || undefined, max_amount: maxAmount || undefined,
    date_from: range === "custom" ? dateFrom || undefined : undefined,
    date_to: range === "custom" ? dateTo || undefined : undefined,
  }), [range, type, payStatus, sort, search, minAmount, maxAmount, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const r = await api.get("/invoices", { params: { page, page_size: pageSize, ...buildParams() } }); setData(r.data); }
    catch { setError(true); } finally { setLoading(false); }
  }, [page, pageSize, buildParams]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [range, type, payStatus, sort, minAmount, maxAmount, dateFrom, dateTo, pageSize, search]);

  const fetchFull = async (id) => { const r = await api.get(`/invoices/${id}`); return r.data; };
  const openPreview = async (id) => {
    setDrawerInv(null);   // close the detail bottom-sheet/drawer so the full invoice isn't stacked behind it
    setDetailLoading(true); setDetail({ id }); setPreviewHtml("");
    try {
      const full = await fetchFull(id);
      setDetail(full);
      // Fetch the SAME HTML the PDF is rendered from → preview == print == PDF.
      try {
        const r = await api.get(`/invoices/${id}/view`, { responseType: "text", transformResponse: [(d) => d] });
        setPreviewHtml(typeof r.data === "string" ? r.data : "");
      } catch { setPreviewHtml(""); }
    }
    catch { toast.error("Invoice could not be loaded. Please try again."); setDetail(null); }
    finally { setDetailLoading(false); }
  };
  const openDrawer = (inv) => {
    setDrawerInv(inv); setDrawerFull(null);
    if (inv?.id) fetchFull(inv.id).then((full) => setDrawerFull(full)).catch(() => {});
  };

  const downloadById = async (inv) => {
    const t = toast.loading("Preparing invoice…");
    // Always use the server-rendered PDF (WeasyPrint) — the exact same HTML
    // template as the on-screen preview + print, so all three are identical.
    const ok = await downloadBlob(`/invoices/${inv.id}/pdf`, {}, `${inv.invoice_number || "invoice"}.pdf`);
    if (ok) toast.success("Invoice downloaded successfully", { id: t });
    else toast.error("Invoice could not be downloaded", { id: t });
  };
  const doDownloadCurrent = async () => { if (!detail?.id) return; setDownloading(true); await downloadById(detail); setDownloading(false); };

  const downloadBlob = async (url, params, filename) => {
    try {
      const r = await api.get(url, { params, responseType: "blob" });
      const href = URL.createObjectURL(r.data); const a = document.createElement("a");
      a.href = href; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
      return true;
    } catch { toast.error("Download failed. Please try again."); return false; }
  };
  const downloadGst = () => { const yr = new Date().getFullYear(); downloadBlob("/invoices/report/gst", { year: yr }, `GST-Report-${yr}.csv`); };
  const downloadZip = async () => { setZipBusy(true); try { if (await downloadBlob("/invoices/bulk/zip", buildParams(), "invoices.zip")) toast.success("Invoices ZIP downloaded"); } finally { setZipBusy(false); } };

  const emailInvoice = async () => {
    if (!detail?.id) return;
    const known = detail?.customer_snapshot?.email || detail?.merchant_snapshot?.email || "";
    const to = window.prompt("Send this invoice to which email?", known);
    if (to === null) return;
    const addr = (to || "").trim();
    if (!addr.includes("@")) { toast.error("Enter a valid email address."); return; }
    setEmailBusy(true);
    try { const r = await api.post(`/invoices/${detail.id}/email`, { to: addr }); toast.success("Invoice emailed" + (r.data?.sent_to ? ` → ${r.data.sent_to}` : "")); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not send email."); }
    finally { setEmailBusy(false); }
  };

  const printCurrent = () => {
    if (!frameRef.current || !frameRef.current.isReady()) { toast.error("Open the invoice preview to print."); return; }
    if (!frameRef.current.print()) toast.error("Print failed. Please try again.");
  };

  const copyNumber = (n) => { navigator.clipboard?.writeText(n); toast.success(`Copied ${n}`); };
  const shareInvoice = async (inv, channel) => {
    // WhatsApp / system share now sends the ACTUAL invoice PDF.
    if (channel === "whatsapp" || channel === "system") { await shareInvoicePdf(inv, channel === "system" ? "system" : "whatsapp"); return; }
    const text = `Invoice ${inv.invoice_number} · ${money(inv.total_amount, inv.currency)} · ${(inv.payment_status || "").toUpperCase()} — AzoApp`;
    if (channel === "copy") { navigator.clipboard?.writeText(text); toast.success("Invoice details copied"); }
    else { navigator.clipboard?.writeText(text); toast.success("Invoice details copied"); }
  };

  const applyFiltersReset = () => { setType("all"); setPayStatus("all"); setMinAmount(""); setMaxAmount(""); };
  const items = data?.items || [];
  const summary = data?.summary || {};
  const cur = items[0]?.currency || "INR";
  const activeFilterCount = useMemo(() => [type !== "all", payStatus !== "all", minAmount, maxAmount].filter(Boolean).length, [type, payStatus, minAmount, maxAmount]);
  const toggleSort = (key) => setSort((s) => (s === key ? (key === "amount_high" ? "amount_low" : key === "newest" ? "oldest" : key) : key));
  const showParty = role !== "customer";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5" data-testid="invoice-center">
      {/* Header + toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-slate-900 dark:text-white flex items-center gap-2"><ReceiptText className="h-5 w-5 text-primary-700 dark:text-primary-400" /> {title}</h2>
          {subtitle ? <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:flex-none lg:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invoice #, booking, customer…" className="pl-9 h-11" data-testid="invoice-search" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" data-testid="invoice-search-clear"><X className="h-4 w-4" /></button>}
          </div>
          <Button variant="outline" className="h-11 relative" onClick={() => setShowFilters(true)} data-testid="invoice-filters-btn">
            <SlidersHorizontal className="h-4 w-4 mr-1.5" /> Filters
            {activeFilterCount ? <span className="ml-1.5 h-5 min-w-5 px-1 rounded-full bg-primary-600 text-white text-[10px] font-bold grid place-items-center">{activeFilterCount}</span> : null}
          </Button>
          <Button variant="outline" className="h-11 w-11 p-0" onClick={load} data-testid="invoice-refresh"><RefreshCw className="h-4 w-4" /></Button>
          {role === "admin" && (
            <>
              <Button variant="outline" className="h-11 hidden xl:inline-flex" onClick={downloadGst} data-testid="invoice-gst-report"><FileSpreadsheet className="h-4 w-4 mr-1" /> GST</Button>
              <Button variant="outline" className="h-11 hidden xl:inline-flex" onClick={downloadZip} disabled={zipBusy} data-testid="invoice-bulk-zip">{zipBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderArchive className="h-4 w-4" />}</Button>
            </>
          )}
        </div>
      </div>

      {/* Date chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {DATE_PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} data-testid={`invoice-range-${k}`}
            className={`shrink-0 px-3.5 h-9 rounded-xl text-xs font-semibold transition-all ${range === k ? "bg-primary-700 text-white shadow-sm shadow-primary-500/30" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}>{l}</button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex flex-wrap items-center gap-2 -mt-1">
          <PremiumDatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="!h-10 !w-40" placeholder="From" data-testid="invoice-date-from" />
          <span className="text-slate-400 text-sm">to</span>
          <PremiumDatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="!h-10 !w-40" placeholder="To" data-testid="invoice-date-to" />
        </div>
      )}

      {/* KPI cards */}
      {loading && !data ? <KpiSkeletonRow n={5} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3" /> : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard icon={FileText} tone="primary" label="Invoices" value={summary.total_count ?? 0} sub="In current view" testid="inv-kpi-count" />
          <KpiCard icon={IndianRupee} tone="slate" label="Total Amount" value={money(summary.total_amount, cur)} sub="Gross value" testid="inv-kpi-total" />
          <KpiCard icon={CheckCircle2} tone="emerald" label="Paid" value={money(summary.paid_amount, cur)} sub="Settled" testid="inv-kpi-paid" />
          <KpiCard icon={Clock} tone="amber" label="Pending" value={money(summary.pending_amount, cur)} sub="Awaiting payment" testid="inv-kpi-pending" />
          <KpiCard icon={RotateCcw} tone="violet" label="Refunded" value={money(summary.refunded_amount, cur)} sub="Returned" testid="inv-kpi-refunded" />
        </div>
      )}

      {/* Table / states */}
      {loading ? <Surface className="p-4"><RowsSkeleton rows={6} /></Surface>
        : error ? (
          <Surface className="p-10 text-center border-rose-200 dark:border-rose-900/50" data-testid="invoice-error">
            <AlertTriangle className="mx-auto h-9 w-9 text-rose-400" />
            <p className="mt-3 font-semibold text-slate-800 dark:text-slate-100">Unable to load invoices</p>
            <p className="text-sm text-slate-400 mt-1">Something went wrong. Please try again.</p>
            <Button variant="outline" className="mt-4" onClick={load} data-testid="invoice-retry">Try Again</Button>
          </Surface>
        ) : items.length === 0 ? (
          <Surface className="p-4">
            <EmptyState icon={FileText} title={activeFilterCount || search || range !== "all" ? "No invoices match your filters" : "No invoices yet"}
              hint={activeFilterCount || search || range !== "all" ? "Try clearing filters or changing the date range." : "Your commission & booking invoices will appear here."}
              action={(activeFilterCount || search || range !== "all") ? <Button variant="outline" onClick={() => { applyFiltersReset(); setSearch(""); setRange("all"); }} data-testid="invoice-clear-filters">Clear Filters</Button> : null}
              testid="invoice-empty" />
          </Surface>
        ) : (
          <Surface className="p-4 sm:p-5">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm" data-testid="invoice-table">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <Th label="Invoice #" onClick={() => toggleSort("number")} active={sort === "number"} />
                    <th className="py-2.5 px-3 font-bold">Type</th>
                    <th className="py-2.5 px-3 font-bold">Reference</th>
                    {showParty && <th className="py-2.5 px-3 font-bold">Customer</th>}
                    <Th label="Date" onClick={() => toggleSort("newest")} active={sort === "newest" || sort === "oldest"} />
                    <Th label="Amount" right onClick={() => toggleSort("amount_high")} active={sort === "amount_high" || sort === "amount_low"} />
                    <th className="py-2.5 px-3 font-bold text-center">Status</th>
                    <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((inv) => (
                    <tr key={inv.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer" onClick={() => openDrawer(inv)} data-testid={`invoice-row-${inv.invoice_number}`}>
                      <td className="py-3.5 px-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{inv.invoice_number}</td>
                      <td className="py-3.5 px-3"><span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ring-1 ${TYPE_BADGE[inv.invoice_type] || "bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"}`}>{TYPE_LABEL[inv.invoice_type] || inv.invoice_type}</span></td>
                      <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400">{inv.booking_code || inv.service_name || (inv.transaction_id ? inv.transaction_id.slice(0, 8) : "—")}</td>
                      {showParty && <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300">{inv.customer_snapshot?.name || inv.merchant_snapshot?.name || inv.partner_snapshot?.name || "—"}</td>}
                      <td className="py-3.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{shortDate(inv.issue_date)}</td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-800 dark:text-slate-100 tabular-nums">{money(inv.display_amount ?? inv.total_amount, inv.currency)}</td>
                      <td className="py-3.5 px-3 text-center"><StatusBadge status={inv.payment_status} /></td>
                      <td className="py-3.5 px-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5">
                          <button onClick={() => openDrawer(inv)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid={`invoice-view-${inv.invoice_number}`} title="View"><Eye className="h-4 w-4" /></button>
                          <button onClick={() => downloadById(inv)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid={`invoice-download-${inv.invoice_number}`} title="Download"><Download className="h-4 w-4" /></button>
                          <RowMenu inv={inv} onView={() => openDrawer(inv)} onPreview={() => openPreview(inv.id)} onDownload={() => downloadById(inv)} onShare={(c) => shareInvoice(inv, c)} onCopy={() => copyNumber(inv.invoice_number)} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2.5">
              {items.map((inv) => (
                <div key={inv.id} className="rounded-2xl border border-slate-100 dark:border-slate-800 p-3.5" data-testid={`invoice-card-${inv.invoice_number}`} onClick={() => openDrawer(inv)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{inv.invoice_number}</span>
                    <StatusBadge status={inv.payment_status} />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      <span>{TYPE_LABEL[inv.invoice_type] || inv.invoice_type}</span> · {inv.customer_snapshot?.name || inv.booking_code || "—"}
                      <p className="text-[11px] text-slate-400 mt-0.5">{shortDate(inv.issue_date)}</p>
                    </div>
                    <span className="font-bold text-slate-800 dark:text-slate-100 tabular-nums">{money(inv.display_amount ?? inv.total_amount, inv.currency)}</span>
                  </div>
                  <div className="flex gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" size="sm" className="h-9 flex-1" onClick={() => openDrawer(inv)}><Eye className="h-4 w-4 mr-1" /> View</Button>
                    <Button variant="outline" size="sm" className="h-9 flex-1" onClick={() => downloadById(inv)}><Download className="h-4 w-4 mr-1" /> Download</Button>
                  </div>
                </div>
              ))}
            </div>

            <Paginator page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          </Surface>
        )}

      {/* Sort (mobile-visible small select under toolbar) */}
      {items.length > 0 && (
        <div className="flex items-center justify-end gap-2 -mt-2">
          <ArrowUpDown className="h-3.5 w-3.5 text-slate-400" />
          <PremiumSelect value={sort} onChange={(e) => setSort(e.target.value)} data-testid="invoice-sort" searchable={false} className="!h-9 !w-auto min-w-[140px] rounded-lg text-xs">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </PremiumSelect>
        </div>
      )}

      {/* Filter drawer / bottom sheet */}
      <DetailDrawer open={showFilters} onClose={() => setShowFilters(false)} title="Filters" subtitle={activeFilterCount ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""} applied` : "Refine your invoices"} testid="invoice-filter-drawer"
        footer={<div className="flex gap-2"><Button variant="outline" className="h-11 flex-1" onClick={applyFiltersReset} data-testid="invoice-filter-reset"><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button><Button className="h-11 flex-1 bg-primary-700 hover:bg-primary-800" onClick={() => setShowFilters(false)} data-testid="invoice-filter-apply">Apply Filters</Button></div>}>
        <div className="space-y-4">
          <div><label className="text-xs font-bold uppercase tracking-wide text-slate-400">Invoice Type</label>
            <PremiumSelect value={type} onChange={(e) => setType(e.target.value)} data-testid="invoice-type-filter" className="mt-1.5 w-full !h-11 rounded-xl">{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</PremiumSelect></div>
          <div><label className="text-xs font-bold uppercase tracking-wide text-slate-400">Payment Status</label>
            <PremiumSelect value={payStatus} onChange={(e) => setPayStatus(e.target.value)} data-testid="invoice-paystatus-filter" className="mt-1.5 w-full !h-11 rounded-xl capitalize">{PAY_STATUS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}</PremiumSelect></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold uppercase tracking-wide text-slate-400">Min Amount</label><Input type="number" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="0" className="mt-1.5 h-11" data-testid="invoice-min-amount" /></div>
            <div><label className="text-xs font-bold uppercase tracking-wide text-slate-400">Max Amount</label><Input type="number" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Any" className="mt-1.5 h-11" data-testid="invoice-max-amount" /></div>
          </div>
        </div>
      </DetailDrawer>

      {/* Invoice detail drawer */}
      <DetailDrawer open={!!drawerInv} onClose={() => { setDrawerInv(null); setDrawerFull(null); }} title={drawerInv?.invoice_number || "Invoice"} subtitle={drawerInv ? shortDate(drawerInv.issue_date) : ""} testid="invoice-detail-drawer"
        footer={drawerInv && <div className="flex gap-2"><Button variant="outline" className="h-11 flex-1" onClick={() => downloadById(drawerInv)} data-testid="drawer-download"><Download className="h-4 w-4 mr-1" /> Download</Button><Button className="h-11 flex-1 bg-primary-700 hover:bg-primary-800" onClick={() => openPreview(drawerInv.id)} data-testid="drawer-view-full"><Eye className="h-4 w-4 mr-1" /> View Invoice</Button></div>}>
        {drawerInv && (
          <div className="space-y-5">
            <div className="rounded-2xl p-4 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div><p className="text-[11px] uppercase tracking-wide text-slate-400">{drawerInv.invoice_type === "cancellation" ? "Total order value" : "Total amount"}</p><p className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white tabular-nums">{money(drawerInv.invoice_type === "cancellation" ? (Number(drawerInv.original_amount != null ? drawerInv.original_amount : drawerInv.total_amount) || 0) : drawerInv.total_amount, drawerInv.currency)}</p></div>
              <StatusBadge status={drawerInv.payment_status} />
            </div>
            <DrawerSection icon={User} title="Customer">
              <KV k="Name" v={drawerInv.customer_snapshot?.name || "—"} />
              <KV k="Mobile" v={drawerInv.customer_snapshot?.phone || drawerInv.customer_snapshot?.mobile || "—"} />
              {drawerInv.customer_snapshot?.email && <KV k="Email" v={drawerInv.customer_snapshot.email} />}
            </DrawerSection>
            <DrawerSection icon={CalendarDays} title="Booking / Reference">
              <KV k="Type" v={<span className="capitalize">{drawerInv.invoice_type}</span>} />
              {drawerInv.booking_code && <KV k="Booking ID" v={drawerInv.booking_code} mono />}
              {drawerInv.service_name && <KV k="Service" v={drawerInv.service_name} />}
              {drawerInv.transaction_id && <KV k="Reference" v={drawerInv.transaction_id.slice(0, 12)} mono />}
              <KV k="Date" v={shortDate(drawerInv.issue_date)} />
            </DrawerSection>
            <DrawerSection icon={Wallet} title="Payment summary">
              {(drawerFull?.breakdown?.service_items || []).length > 0 && (
                <div className="py-2.5 border-b border-slate-100 dark:border-slate-800/70 space-y-1.5" data-testid="drawer-service-items">
                  {drawerFull.breakdown.service_items.map((it, i) => (
                    <div key={i}>
                      <div className="flex items-start justify-between gap-3 text-sm">
                        <span className="text-slate-700 dark:text-slate-300">{it.name}{Number(it.qty) > 1 ? ` ×${it.qty}` : ""}</span>
                        <span className="tabular-nums font-medium text-slate-800 dark:text-slate-200 shrink-0">{money(it.amount, drawerInv.currency)}</span>
                      </div>
                      {(it.addons || []).map((a, ai) => (
                        <div key={ai} className="flex items-center justify-between gap-3 text-[12.5px] pl-3">
                          <span className="text-slate-500 dark:text-slate-400">↳ {a.name}{Number(a.qty) > 1 ? ` ×${a.qty}` : ""}</span>
                          <span className="tabular-nums text-slate-600 dark:text-slate-300 shrink-0">{money(a.amount, drawerInv.currency)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {(drawerFull.breakdown.additional_charges || []).filter((c) => Number(c.amount) > 0).map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-600 dark:text-slate-400">{c.label}</span>
                      <span className="tabular-nums text-slate-700 dark:text-slate-200 shrink-0">{money(c.amount, drawerInv.currency)}</span>
                    </div>
                  ))}
                </div>
              )}
              {drawerFull?.breakdown ? (
                /* Canonical breakdown = single source of truth (matches the booking's
                   on-screen invoice exactly). All fees — including Visiting Charge —
                   are already listed once above in `additional_charges`, so we NEVER
                   re-add them here (this fixes the duplicate Visiting Charge + wrong
                   totals seen when opening an invoice from the Invoices menu). This
                   applies to CANCELLATION invoices too — the cancellation-specific
                   rows (Total Order Value / Customer Refund / Refund Issued) are
                   rendered separately below, so the fee lines must NOT repeat. */
                <>
                  {drawerFull.breakdown.subtotal != null && <KV k="Subtotal" v={money(drawerFull.breakdown.subtotal, drawerInv.currency)} />}
                  {Number(drawerFull.breakdown.discount) > 0 ? <KV k={`Coupon Discount${drawerFull.breakdown.coupon_code ? ` (${drawerFull.breakdown.coupon_code})` : ""}`} v={"−" + money(drawerFull.breakdown.discount, drawerInv.currency)} /> : null}
                  {Number(drawerFull.breakdown.tax) > 0 ? (
                    <>
                      <KV k="Taxable Amount" v={money(drawerFull.breakdown.taxable, drawerInv.currency)} />
                      <KV k="Est. Govt. Taxes" v={money(drawerFull.breakdown.tax, drawerInv.currency)} />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  {drawerInv.subtotal != null && <KV k="Subtotal" v={money(drawerInv.subtotal, drawerInv.currency)} />}
                  {Number(drawerInv.visiting_charge) > 0 ? <KV k="Visiting Charge" v={money(drawerInv.visiting_charge, drawerInv.currency)} /> : null}
                  {Number(drawerInv.fees) - Number(drawerInv.visiting_charge || 0) > 0.001 ? <KV k="Platform / Service Fees" v={money(Number(drawerInv.fees) - Number(drawerInv.visiting_charge || 0), drawerInv.currency)} /> : null}
                  {drawerInv.discount ? <KV k="Discount" v={"−" + money(drawerInv.discount, drawerInv.currency)} /> : null}
                  {drawerInv.tax ? <KV k="Taxable Amount" v={money(drawerInv.taxable ?? (Number(drawerInv.subtotal || 0) + Math.max(0, Number(drawerInv.fees || 0) - Number(drawerInv.visiting_charge || 0))), drawerInv.currency)} /> : null}
                  {drawerInv.tax ? <KV k="Est. Govt. Taxes" v={money(drawerInv.tax, drawerInv.currency)} /> : null}
                </>
              )}
              {drawerInv.invoice_type !== "cancellation" && <KV k="Total amount" v={money(drawerInv.total_amount, drawerInv.currency)} strong />}
              {drawerInv.invoice_type === "cancellation" && drawerInv.original_amount != null && <KV k="Total Order Value" v={money(drawerInv.original_amount, drawerInv.currency)} strong />}
              {drawerInv.invoice_type === "cancellation" && drawerInv.cancellation_pct != null && <KV k="Customer Refund" v={`${drawerInv.cancellation_pct}%`} />}
              {drawerInv.invoice_type === "cancellation" && drawerInv.refund ? <KV k="Refund Issued (see Refund Receipt)" v={money(drawerInv.refund, drawerInv.currency)} /> : null}
              {drawerInv.refund && drawerInv.invoice_type !== "cancellation" ? <KV k="Refunded" v={money(drawerInv.refund, drawerInv.currency)} /> : null}
              {drawerInv.commission ? <>
                <KV k="Commission" v={money(drawerInv.commission, drawerInv.currency)} />
                <KV k="Net amount" v={money((drawerInv.total_amount || 0) - (drawerInv.commission || 0), drawerInv.currency)} strong />
              </> : null}
            </DrawerSection>
          </div>
        )}
      </DetailDrawer>

      {/* Full invoice preview dialog */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-[880px] max-h-[94vh] overflow-y-auto p-0">
          <DialogHeader className="px-5 py-3 border-b sticky top-0 bg-white dark:bg-slate-900 z-10 flex-row items-center justify-between space-y-0">
            <DialogTitle className="text-base">{detail?.invoice_number || "Invoice"}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={printCurrent} disabled={detailLoading || !detail?.invoice_number} data-testid="invoice-print"><Printer className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Print</span></Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={detailLoading || !detail?.invoice_number} data-testid="invoice-share"><Share2 className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Share</span></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => shareInvoice(detail, "whatsapp")}><MessageCircle className="h-4 w-4 mr-2" /> WhatsApp</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareInvoice(detail, "copy")}><Copy className="h-4 w-4 mr-2" /> Copy details</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => shareInvoice(detail, "system")}><Share2 className="h-4 w-4 mr-2" /> System share</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" variant="outline" onClick={emailInvoice} disabled={emailBusy || detailLoading || !detail?.invoice_number} data-testid="invoice-email-btn">{emailBusy ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Mail className="h-4 w-4 sm:mr-1" />}<span className="hidden sm:inline">Email</span></Button>
              <Button size="sm" onClick={doDownloadCurrent} disabled={downloading || detailLoading || !detail?.invoice_number} data-testid="invoice-download-pdf" className="bg-primary-700 hover:bg-primary-800">{downloading ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1" /> : <Download className="h-4 w-4 sm:mr-1" />}<span className="hidden sm:inline">PDF</span></Button>
              <Button size="sm" variant="outline" onClick={() => setDetail(null)} data-testid="invoice-close-btn" title="Close" aria-label="Close invoice"><X className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Close</span></Button>
            </div>
          </DialogHeader>
          <div className="bg-slate-100 dark:bg-slate-950 p-4">
            {detailLoading || !detail?.invoice_number ? (
              <div className="space-y-3" style={{ maxWidth: 794, margin: "0 auto" }}><Sk className="h-96 w-full rounded-xl" /></div>
            ) : previewHtml ? (
              <div className="mx-auto" style={{ maxWidth: 794 }}><InvoiceA4Frame ref={frameRef} html={previewHtml} /></div>
            ) : (
              <div className="space-y-3" style={{ maxWidth: 794, margin: "0 auto" }}><Sk className="h-96 w-full rounded-xl" /></div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function Th({ label, onClick, active, right }) {
  return (
    <th className={`py-2.5 px-3 font-bold ${right ? "text-right" : ""}`}>
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-200 ${active ? "text-primary-600 dark:text-primary-400" : ""}`}>
        {label} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  );
}

function DrawerSection({ icon: Icon, title, children }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2 flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {title}</p>
      <div className="rounded-xl border border-slate-100 dark:border-slate-800 px-3.5">{children}</div>
    </div>
  );
}

function RowMenu({ inv, onView, onPreview, onDownload, onShare, onCopy }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid={`invoice-more-${inv.invoice_number}`}><MoreHorizontal className="h-4 w-4" /></button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onView}><Eye className="h-4 w-4 mr-2" /> View details</DropdownMenuItem>
        <DropdownMenuItem onClick={onPreview}><FileText className="h-4 w-4 mr-2" /> View invoice</DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={onPreview}><Printer className="h-4 w-4 mr-2" /> Print invoice</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onShare("whatsapp")}><MessageCircle className="h-4 w-4 mr-2" /> Share on WhatsApp</DropdownMenuItem>
        <DropdownMenuItem onClick={onCopy}><Copy className="h-4 w-4 mr-2" /> Copy invoice #</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
