import React, { useEffect, useRef, useState } from "react";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { motion } from "framer-motion";
import {
  FileText, IndianRupee, CheckCircle2, Clock, RotateCcw, Search, X, ArrowUp, ArrowDown, ChevronsUpDown,
  Eye, Download, MoreHorizontal, Printer, Share2, Copy, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  AlertTriangle, WifiOff, Inbox, MessageCircle, Link2, Store, CalendarDays,
} from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface } from "@/components/merchant/finance/FinanceKit";
import {
  money, shortDate, statusMeta, typeMeta, referenceOf, customerOf, customerPhone, DATE_PRESETS, columnSortState,
} from "./invoiceUtils";

/* ═══════════════════════════ badges ═══════════════════════════ */
export function InvStatusBadge({ status, size = "md", testid }) {
  const m = statusMeta(status);
  const Icon = m.icon;
  const sz = size === "sm" ? "px-2 py-0.5 text-[10.5px] gap-1" : "px-2.5 py-1 text-[11.5px] gap-1.5";
  return (
    <span data-testid={testid} className={`inline-flex items-center rounded-full font-semibold ring-1 whitespace-nowrap ${sz} ${m.cls}`}>
      <Icon className={`${size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} ${status === "processing" ? "animate-spin" : ""}`} strokeWidth={2.2} />
      {m.label}
    </span>
  );
}

export function TypeChip({ type, testid }) {
  const m = typeMeta(type);
  return <span data-testid={testid} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 whitespace-nowrap ${m.cls}`}>{m.label}</span>;
}

/* ═══════════════════════════ KPI cards ═══════════════════════════ */
const KPI_TONES = {
  primary: "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
};

function KpiTile({ icon: Icon, tone, label, value, sub, trend, testid, delay = 0 }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }}
      className="snap-start shrink-0 w-[196px] sm:w-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card hover:shadow-cardhover hover:-translate-y-px transition-all duration-200 p-4 sm:p-5" data-testid={testid}>
      <div className="flex items-start justify-between gap-2">
        <span className={`h-10 w-10 rounded-xl grid place-items-center ${KPI_TONES[tone]}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.9} /></span>
        {trend != null && (
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 ${trend >= 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400" : "text-rose-500 bg-rose-50 dark:bg-rose-950/40"}`}>
            {trend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}{Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-3">{label}</p>
      <p className="font-heading font-extrabold text-[22px] sm:text-2xl text-slate-900 dark:text-white leading-tight mt-0.5 tabular-nums truncate" title={String(value)}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">{sub}</p>}
    </motion.div>
  );
}

export function InvoiceKpis({ summary = {}, currency = "INR", rangeLabel = "All Time" }) {
  const cnt = summary.total_count ?? 0;
  const paidPct = summary.total_amount ? Math.round(((summary.paid_amount || 0) / summary.total_amount) * 100) : 0;
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto sm:overflow-visible no-scrollbar snap-x snap-mandatory pb-1 sm:pb-0" data-testid="invoice-kpis">
      <KpiTile icon={FileText} tone="primary" label="Invoices" value={cnt} sub={rangeLabel} testid="inv-kpi-count" />
      <KpiTile icon={IndianRupee} tone="slate" label="Total Amount" value={money(summary.total_amount, currency)} sub="Gross invoice value" testid="inv-kpi-total" delay={0.04} />
      <KpiTile icon={CheckCircle2} tone="emerald" label="Paid" value={money(summary.paid_amount, currency)} sub={`${summary.paid_count ?? 0} invoice${(summary.paid_count ?? 0) === 1 ? "" : "s"} · ${paidPct}% settled`} testid="inv-kpi-paid" delay={0.08} />
      <KpiTile icon={Clock} tone="amber" label="Pending" value={money(summary.pending_amount, currency)} sub={`${summary.pending_count ?? 0} awaiting payment`} testid="inv-kpi-pending" delay={0.12} />
      <KpiTile icon={RotateCcw} tone="violet" label="Refunded" value={money(summary.refunded_amount, currency)} sub={`${summary.refunded_count ?? 0} refunded`} testid="inv-kpi-refunded" delay={0.16} />
    </div>
  );
}

/* ═══════════════════════════ date chips ═══════════════════════════ */
export function DateChips({ value, onChange, dateFrom, dateTo, onDateFrom, onDateTo, onApplyCustom, customApplied }) {
  const [open, setOpen] = useState(value === "custom");
  useEffect(() => { if (value === "custom") setOpen(true); }, [value]);
  const canApply = dateFrom || dateTo;
  return (
    <div className="space-y-2.5" data-testid="invoice-date-filters">
      <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {DATE_PRESETS.map(([k, l]) => {
          const on = value === k;
          return (
            <button key={k} type="button" onClick={() => { onChange(k); if (k !== "custom") setOpen(false); }} data-testid={`invoice-range-${k}`}
              className={`shrink-0 h-10 sm:h-9 px-3.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${on
                ? "bg-[#0D47A1] text-white shadow-sm shadow-primary-500/30"
                : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary-300 hover:text-primary-700 dark:hover:text-primary-300"}`}>
              {k === "custom" && <CalendarDays className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />}{l}
            </button>
          );
        })}
      </div>
      {value === "custom" && open && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3" data-testid="invoice-custom-range">
          <div className="flex-1 min-w-[140px]"><label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">From Date</label>
            <PremiumDatePicker value={dateFrom} onChange={(e) => onDateFrom(e.target.value)} className="!h-10 mt-1" placeholder="From date" data-testid="invoice-date-from" /></div>
          <div className="flex-1 min-w-[140px]"><label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">To Date</label>
            <PremiumDatePicker value={dateTo} min={dateFrom || undefined} onChange={(e) => onDateTo(e.target.value)} className="!h-10 mt-1" placeholder="To date" data-testid="invoice-date-to" /></div>
          <Button onClick={onApplyCustom} disabled={!canApply} className="h-10 bg-[#0D47A1] hover:bg-primary-800 text-white px-5" data-testid="invoice-date-apply">Apply</Button>
          {customApplied && <span className="text-[11px] text-emerald-600 font-semibold self-center">Applied</span>}
        </motion.div>
      )}
    </div>
  );
}

/* ═══════════════════════════ search ═══════════════════════════ */
export function SearchBox({ value, onChange, searching, className = "", autoFocus = false, placeholder = "Search invoice #, booking, customer..." }) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} placeholder={placeholder}
        className="pl-9 pr-9 h-11 rounded-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 focus-visible:ring-primary-500/40" data-testid="invoice-search" />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
        {searching ? <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" data-testid="invoice-search-spinner" />
          : value ? <button type="button" onClick={() => onChange("")} className="h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="invoice-search-clear" aria-label="Clear search"><X className="h-3.5 w-3.5" /></button> : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════ table ═══════════════════════════ */
function Th({ label, col, sort, onSort, right, center, className = "" }) {
  const st = col ? columnSortState(sort, col) : null;
  const body = (
    <span className={`inline-flex items-center gap-1 ${st ? "text-primary-700 dark:text-primary-300" : ""}`}>
      {label}
      {col && (st === "asc" ? <ArrowUp className="h-3 w-3" /> : st === "desc" ? <ArrowDown className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-50" />)}
    </span>
  );
  return (
    <th className={`py-3 px-4 font-bold text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 ${right ? "text-right" : center ? "text-center" : "text-left"} ${className}`} aria-sort={st ? (st === "asc" ? "ascending" : "descending") : "none"}>
      {col ? <button type="button" onClick={() => onSort(col)} className="hover:text-slate-800 dark:hover:text-slate-100 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40" data-testid={`invoice-sort-${col}`}>{body}</button> : body}
    </th>
  );
}

export function RowMenu({ inv, onView, onPreview, onDownload, onPrint, onShare, onCopy, align = "end", trigger }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger || <button type="button" className="h-9 w-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-white transition-colors" data-testid={`invoice-more-${inv.invoice_number}`} aria-label="More actions"><MoreHorizontal className="h-4 w-4" /></button>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52 rounded-xl">
        <DropdownMenuItem onClick={onView} className="gap-2 h-10 rounded-lg"><Eye className="h-4 w-4 text-slate-500" /> View Details</DropdownMenuItem>
        <DropdownMenuItem onClick={onPreview} className="gap-2 h-10 rounded-lg" data-testid={`invoice-menu-preview-${inv.invoice_number}`}><FileText className="h-4 w-4 text-slate-500" /> View Invoice</DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload} className="gap-2 h-10 rounded-lg"><Download className="h-4 w-4 text-slate-500" /> Download PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={onPrint} className="gap-2 h-10 rounded-lg"><Printer className="h-4 w-4 text-slate-500" /> Print Invoice</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onShare("whatsapp")} className="gap-2 h-10 rounded-lg"><MessageCircle className="h-4 w-4 text-emerald-600" /> Share on WhatsApp</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onShare("copy")} className="gap-2 h-10 rounded-lg"><Link2 className="h-4 w-4 text-slate-500" /> Copy Link</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onShare("system")} className="gap-2 h-10 rounded-lg"><Share2 className="h-4 w-4 text-slate-500" /> Share…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onCopy} className="gap-2 h-10 rounded-lg" data-testid={`invoice-menu-copy-${inv.invoice_number}`}><Copy className="h-4 w-4 text-slate-500" /> Copy Invoice Number</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InvoiceTable({ items, sort, onSort, onView, onPreview, onDownload, onPrint, onShare, onCopy, busyId }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="invoice-table">
        <thead>
          <tr className="border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <Th label="Invoice #" col="number" sort={sort} onSort={onSort} className="rounded-tl-xl" />
            <Th label="Type" />
            <Th label="Reference" />
            <Th label="Customer" col="customer" sort={sort} onSort={onSort} />
            <Th label="Date" col="date" sort={sort} onSort={onSort} />
            <Th label="Amount" col="amount" sort={sort} onSort={onSort} right />
            <Th label="Payment Status" col="status" sort={sort} onSort={onSort} center />
            <Th label="Actions" right className="rounded-tr-xl" />
          </tr>
        </thead>
        <tbody>
          {items.map((inv) => {
            const cust = customerOf(inv); const phone = customerPhone(inv);
            return (
              <tr key={inv.id} tabIndex={0} onClick={() => onView(inv)} onKeyDown={(e) => { if (e.key === "Enter") onView(inv); }}
                className="group border-b border-slate-100 dark:border-slate-800/70 last:border-0 hover:bg-primary-50/40 dark:hover:bg-slate-800/50 focus-visible:bg-primary-50/40 focus-visible:outline-none transition-colors cursor-pointer" data-testid={`invoice-row-${inv.invoice_number}`}>
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{inv.invoice_number}</span>
                </td>
                <td className="py-3.5 px-4"><TypeChip type={inv.invoice_type} /></td>
                <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono text-[12.5px]">{referenceOf(inv)}</td>
                <td className="py-3.5 px-4">
                  <p className="text-slate-800 dark:text-slate-200 font-medium leading-tight">{cust}</p>
                  {phone && <p className="text-[11px] text-slate-400 mt-0.5">{phone}</p>}
                </td>
                <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{shortDate(inv.issue_date)}</td>
                <td className="py-3.5 px-4 text-right whitespace-nowrap">
                  <span className="font-heading font-extrabold text-[15px] text-slate-900 dark:text-white tabular-nums">{money(inv.total_amount, inv.currency)}</span>
                </td>
                <td className="py-3.5 px-4 text-center"><InvStatusBadge status={inv.payment_status} testid={`invoice-status-${inv.invoice_number}`} /></td>
                <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5">
                    <IconBtn title="View" onClick={() => onView(inv)} testid={`invoice-view-${inv.invoice_number}`}><Eye className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Download PDF" onClick={() => onDownload(inv)} testid={`invoice-download-${inv.invoice_number}`} busy={busyId === inv.id}><Download className="h-4 w-4" /></IconBtn>
                    <RowMenu inv={inv} onView={() => onView(inv)} onPreview={() => onPreview(inv)} onDownload={() => onDownload(inv)} onPrint={() => onPrint(inv)} onShare={(c) => onShare(inv, c)} onCopy={() => onCopy(inv)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function IconBtn({ children, title, onClick, testid, busy }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={busy} data-testid={testid}
      className="h-9 w-9 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-primary-700 dark:hover:bg-slate-800 dark:hover:text-primary-300 active:scale-95 transition-all disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
      {busy ? <span className="h-4 w-4 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" /> : children}
    </button>
  );
}

/* ═══════════════════════════ mobile cards ═══════════════════════════ */
export function InvoiceCardList({ items, onView, onPreview, onDownload, onPrint, onShare, onCopy, busyId }) {
  return (
    <div className="space-y-3" data-testid="invoice-card-list">
      {items.map((inv, i) => {
        const cust = customerOf(inv);
        return (
          <motion.div key={inv.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card active:scale-[0.995] transition-transform overflow-hidden" data-testid={`invoice-card-${inv.invoice_number}`}>
            <button type="button" onClick={() => onView(inv)} className="w-full text-left p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight truncate">{inv.invoice_number}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap"><TypeChip type={inv.invoice_type} /><span className="text-[11px] font-mono text-slate-400">{referenceOf(inv)}</span></div>
                </div>
                <InvStatusBadge status={inv.payment_status} size="sm" />
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium truncate">{cust}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{shortDate(inv.issue_date)}</p>
                </div>
                <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white tabular-nums">{money(inv.total_amount, inv.currency)}</p>
              </div>
            </button>
            <div className="flex items-center gap-2 px-3 pb-3">
              <Button variant="outline" className="h-11 flex-1 rounded-xl border-slate-200 dark:border-slate-700" onClick={() => onView(inv)} data-testid={`invoice-card-view-${inv.invoice_number}`}><Eye className="h-4 w-4 mr-1.5" /> View</Button>
              <Button variant="outline" className="h-11 flex-1 rounded-xl border-slate-200 dark:border-slate-700" onClick={() => onDownload(inv)} disabled={busyId === inv.id} data-testid={`invoice-card-download-${inv.invoice_number}`}>
                {busyId === inv.id ? <span className="h-4 w-4 mr-1.5 rounded-full border-2 border-primary-200 border-t-primary-700 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download
              </Button>
              <RowMenu inv={inv} onView={() => onView(inv)} onPreview={() => onPreview(inv)} onDownload={() => onDownload(inv)} onPrint={() => onPrint(inv)} onShare={(c) => onShare(inv, c)} onCopy={() => onCopy(inv)}
                trigger={<button type="button" className="h-11 w-11 grid place-items-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500" aria-label="More" data-testid={`invoice-more-${inv.invoice_number}`}><MoreHorizontal className="h-4 w-4" /></button>} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════ pagination ═══════════════════════════ */
function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) { set.add(2); set.add(3); set.add(4); }
  if (page >= pages - 2) { set.add(pages - 1); set.add(pages - 2); set.add(pages - 3); }
  const arr = [...set].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = [];
  arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push("…"); out.push(p); });
  return out;
}

export function AdvancedPaginator({ page, pages, total, pageSize, onPage, onPageSize, noun = "invoice" }) {
  const pgs = Math.max(1, pages || 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = "h-9 min-w-9 px-2 rounded-lg border text-sm font-semibold inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40";
  const ghost = `${btn} border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800" data-testid="invoice-pagination">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span data-testid="pagination-info">Showing <b className="text-slate-800 dark:text-slate-100">{from}–{to}</b> of <b className="text-slate-800 dark:text-slate-100">{total}</b> {noun}{total === 1 ? "" : "s"}</span>
        <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} data-testid="page-size" searchable={false}
          className="!h-9 !w-[104px] rounded-lg text-xs">
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </PremiumSelect>
      </div>
      <div className="flex items-center gap-1">
        <button className={`${ghost} hidden sm:inline-flex`} disabled={page <= 1} onClick={() => onPage(1)} data-testid="page-first" aria-label="First page"><ChevronsLeft className="h-4 w-4" /></button>
        <button className={ghost} disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="page-prev" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /><span className="hidden sm:inline ml-0.5">Previous</span></button>
        {pageList(page, pgs).map((p, i) => p === "…"
          ? <span key={`e${i}`} className="px-1 text-slate-400 text-sm">…</span>
          : <button key={p} onClick={() => onPage(p)} data-testid={`page-${p}`} aria-current={p === page ? "page" : undefined}
              className={`${btn} ${p === page ? "bg-[#0D47A1] border-[#0D47A1] text-white shadow-sm shadow-primary-500/30" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{p}</button>)}
        <button className={ghost} disabled={page >= pgs} onClick={() => onPage(page + 1)} data-testid="page-next" aria-label="Next page"><span className="hidden sm:inline mr-0.5">Next</span><ChevronRight className="h-4 w-4" /></button>
        <button className={`${ghost} hidden sm:inline-flex`} disabled={page >= pgs} onClick={() => onPage(pgs)} data-testid="page-last" aria-label="Last page"><ChevronsRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ═══════════════════════════ skeletons ═══════════════════════════ */
const Sk = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 ${className}`} />;

export function KpiSkeleton() {
  return (
    <div className="-mx-4 px-4 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-3 overflow-hidden" data-testid="invoice-kpi-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="shrink-0 w-[196px] sm:w-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5"><Sk className="h-10 w-10 rounded-xl" /><Sk className="h-3 w-20 mt-4" /><Sk className="h-7 w-28 mt-2" /><Sk className="h-3 w-24 mt-2" /></div>
      ))}
    </div>
  );
}
export function DateChipsSkeleton() {
  return <div className="flex gap-1.5 overflow-hidden">{[64, 56, 80, 92, 100, 88, 88, 80, 72].map((w, i) => <Sk key={i} className="h-9 rounded-xl shrink-0" style={{ width: w }} />)}</div>;
}
export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="p-4 sm:p-5" data-testid="invoice-table-skeleton">
      <div className="hidden md:block">
        <div className="flex gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">{[110, 70, 90, 120, 90, 80, 100, 70].map((w, i) => <Sk key={i} className="h-3" style={{ width: w }} />)}</div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-4 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
            <Sk className="h-4 w-[120px]" /><Sk className="h-5 w-16 rounded-md" /><Sk className="h-4 w-20" /><Sk className="h-4 w-28" /><Sk className="h-4 w-20" /><Sk className="h-5 w-20 ml-auto" /><Sk className="h-6 w-20 rounded-full" /><Sk className="h-8 w-24 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4"><div className="flex justify-between"><Sk className="h-4 w-32" /><Sk className="h-5 w-16 rounded-full" /></div><Sk className="h-3 w-24 mt-3" /><div className="flex justify-between mt-3"><Sk className="h-4 w-28" /><Sk className="h-6 w-20" /></div><div className="flex gap-2 mt-3"><Sk className="h-11 flex-1 rounded-xl" /><Sk className="h-11 flex-1 rounded-xl" /></div></div>
        ))}
      </div>
    </div>
  );
}
export function DetailSkeleton() {
  return (
    <div className="space-y-5" data-testid="invoice-detail-skeleton">
      <Sk className="h-24 w-full rounded-2xl" />
      {Array.from({ length: 3 }).map((_, i) => <div key={i}><Sk className="h-3 w-24 mb-2" /><Sk className="h-28 w-full rounded-xl" /></div>)}
    </div>
  );
}
export function DocumentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[794px] bg-white dark:bg-slate-900 rounded-lg p-10 space-y-6 shadow-lg" data-testid="invoice-document-skeleton">
      <div className="flex justify-between"><Sk className="h-12 w-40" /><Sk className="h-12 w-32" /></div>
      <div className="grid grid-cols-3 gap-6"><Sk className="h-20" /><Sk className="h-20" /><Sk className="h-20" /></div>
      <Sk className="h-40 w-full" /><div className="flex justify-end"><Sk className="h-28 w-64" /></div>
    </div>
  );
}

/* ═══════════════════════════ empty / error ═══════════════════════════ */
export function InvEmpty({ filtered, onClear, hint }) {
  return (
    <div className="py-16 flex flex-col items-center text-center px-6" data-testid="invoice-empty">
      <span className="h-16 w-16 rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400"><Inbox className="h-7 w-7" strokeWidth={1.6} /></span>
      <p className="font-heading font-bold text-lg text-slate-900 dark:text-slate-100 mt-4">{filtered ? "No invoices match your current filters." : "No invoices yet"}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{filtered ? "Try a different date range, clear the search, or reset filters to see all invoices." : (hint || "Your commission & booking invoices will appear here as soon as bookings complete.")}</p>
      {filtered && <Button variant="outline" className="mt-5 h-11 rounded-xl" onClick={onClear} data-testid="invoice-clear-filters"><X className="h-4 w-4 mr-1.5" /> Clear Filters</Button>}
    </div>
  );
}
export function InvError({ offline, onRetry }) {
  return (
    <div className="py-14 flex flex-col items-center text-center px-6" data-testid="invoice-error">
      <span className="h-16 w-16 rounded-2xl bg-rose-50 dark:bg-rose-950/40 grid place-items-center text-rose-500">{offline ? <WifiOff className="h-7 w-7" strokeWidth={1.7} /> : <AlertTriangle className="h-7 w-7" strokeWidth={1.7} />}</span>
      <p className="font-heading font-bold text-lg text-slate-900 dark:text-slate-100 mt-4">{offline ? "No internet connection" : "Unable to load invoices"}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">{offline ? "Check your connection and try again." : "Something went wrong while fetching your invoices."}</p>
      <Button className="mt-5 h-11 rounded-xl bg-[#0D47A1] hover:bg-primary-800 text-white" onClick={onRetry} data-testid="invoice-retry">{offline ? "Reconnect" : "Try Again"}</Button>
    </div>
  );
}

/* ═══════════════════════════ page header ═══════════════════════════ */
export function PageHeader({ shopName, right, title = "My Invoices", subtitle = "Commission & booking invoices for your shop" }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading font-extrabold text-2xl lg:text-[28px] text-slate-900 dark:text-white tracking-tight">{title}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1" data-testid="invoice-merchant-name"><Store className="h-3.5 w-3.5 text-[#0D47A1] dark:text-primary-300" /> {shopName}</p>
      </div>
      {right}
    </div>
  );
}

/* ═══════════════════════════ misc ═══════════════════════════ */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  const t = useRef();
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => setV(value), ms); return () => clearTimeout(t.current); }, [value, ms]);
  return v;
}

export { Surface };
