import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { useEffect, useState, useMemo } from "react";
import api, { fmt } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, RotateCcw, Filter, X, ChevronLeft, ChevronRight, Download, ArrowLeft,
  CheckCircle2, XCircle, Clock, User as UserIcon, Phone, Package, Wrench, FileText, Ban,
} from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "initiated", label: "Pending" }, { key: "processed", label: "Processed" },
  { key: "failed", label: "Failed" }, { key: "all", label: "All" },
];
const STATUS = {
  processed: { label: "Refunded", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  initiated: { label: "Pending", cls: "bg-amber-100 text-amber-700", icon: Clock },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700", icon: XCircle },
};
const BY_CLS = { customer: "bg-sky-100 text-sky-700", partner: "bg-violet-100 text-violet-700", admin: "bg-slate-200 text-slate-700" };

const SummaryCard = ({ label, value, sub, tone }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
    <p className={`font-heading font-extrabold text-lg mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);
const RRow = ({ k, v, cls = "" }) => (
  <div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
    <span className="text-slate-500 dark:text-slate-400">{k}</span>
    <span className={`font-medium text-slate-800 dark:text-slate-100 text-right ${cls}`}>{v ?? "—"}</span>
  </div>
);

// Cancellations & Refunds — advanced list + full-page detail (like Transactions).
export default function RefundsHub() {
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("initiated");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const pageSize = 10;

  const openDetail = async (id) => {
    setDetailLoading(true); setDetail({ id });
    try { const { data } = await api.get(`/admin/refunds/${id}`); setDetail(data); }
    catch { toast.error("Failed to load refund"); setDetail(null); } finally { setDetailLoading(false); }
  };

  useEffect(() => {
    setLoading(true);
    api.get("/admin/refunds").then((r) => setAll(r.data || [])).catch(() => toast.error("Failed to load refunds")).finally(() => setLoading(false));
  }, []);
  useEffect(() => { setPage(1); }, [tab, q, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return all.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (dateFrom && (r.created_at || "") < dateFrom) return false;
      if (dateTo && (r.created_at || "") > dateTo + "T23:59:59") return false;
      if (ql && ![r.booking_code, r.customer_name, r.partner_name, r.service_name, r.cancellation_reason, r.razorpay_refund_id].some((v) => String(v || "").toLowerCase().includes(ql))) return false;
      return true;
    });
  }, [all, tab, q, dateFrom, dateTo]);

  const counts = useMemo(() => ({
    all: all.length,
    initiated: all.filter((r) => r.status === "initiated").length,
    processed: all.filter((r) => r.status === "processed").length,
    failed: all.filter((r) => r.status === "failed").length,
  }), [all]);
  const summary = useMemo(() => {
    const sum = (arr) => arr.reduce((s, r) => s + (r.refund_amount ?? r.amount ?? 0), 0);
    const processed = all.filter((r) => r.status === "processed");
    return {
      refunded: round2(sum(processed)), pending: round2(sum(all.filter((r) => r.status === "initiated"))),
      failed: round2(sum(all.filter((r) => r.status === "failed"))), count: all.length,
      avg: all.length ? round2(sum(all) / all.length) : 0,
    };
  }, [all]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const activeFilters = [dateFrom, dateTo].filter(Boolean).length;

  const exportCsv = () => {
    if (!filtered.length) return toast.error("Nothing to export");
    const cols = ["booking_code", "customer_name", "partner_name", "service_name", "original_amount", "refund_pct", "refund_amount", "platform_commission", "method", "status", "cancelled_by", "cancellation_reason", "created_at"];
    const head = ["Booking", "Customer", "Partner", "Service", "Original", "Refund %", "Refund", "Platform Comm", "Method", "Status", "Cancelled By", "Reason", "Date"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...filtered.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    const range = dateFrom || dateTo ? `_${dateFrom || "start"}_to_${dateTo || "today"}` : "";
    a.href = url; a.download = `refunds${range}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} refund(s)`);
  };

  if (detail) {
    const r = detail; const S = STATUS[r.status] || {};
    if (detailLoading || !r.status) {
      return (
        <div className="space-y-5" data-testid="refund-detail">
          <button onClick={() => setDetail(null)} data-testid="refund-back" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to refunds</button>
          <div className="py-20 text-center text-slate-400">Loading…</div>
        </div>
      );
    }
    return (
      <div className="space-y-5" data-testid="refund-detail">
        <button onClick={() => setDetail(null)} data-testid="refund-back" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to refunds</button>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-slate-400">Cancellation &amp; Refund</p>
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">Order #{r.booking_code}</h1>
              <p className="text-sm text-slate-500 mt-1 flex items-center gap-2">
                Cancelled by <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${BY_CLS[r.cancelled_by] || "bg-slate-100"}`}>{r.cancelled_by}</span>
                · {new Date(r.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Refund amount</p>
              <p className="font-heading font-extrabold text-3xl text-emerald-600">{fmt(r.refund_amount ?? r.amount)}</p>
              {S.label && <span className={`inline-flex items-center gap-1 mt-1 text-xs px-2.5 py-1 rounded-full ${S.cls}`}>{S.icon && <S.icon className="h-3.5 w-3.5" />}{S.label}</span>}
            </div>
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-3 flex items-start gap-2" data-testid="refund-reason">
            <Ban className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-600 dark:text-slate-300"><b>Reason:</b> {r.cancellation_reason || "—"}</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Parties</h2>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><UserIcon className="h-4 w-4 text-slate-400" /> {r.customer_name || "—"}</p>
            <p className="flex items-center gap-2 text-sm text-slate-500"><Phone className="h-4 w-4 text-slate-400" /> {r.customer_phone || "—"}</p>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><Wrench className="h-4 w-4 text-slate-400" /> {r.partner_name || "—"}</p>
            <p className="flex items-center gap-2 text-sm text-slate-500"><Package className="h-4 w-4 text-slate-400" /> {r.service_name}</p>
            {r.category && <p className="text-xs text-slate-400 ml-6 -mt-1">{r.category}</p>}
            <div className="pt-1 text-sm">
              {r.booking_code
                ? <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1 capitalize">Order #{r.booking_code}{r.booking?.status ? ` · ${String(r.booking.status).replace(/_/g, " ")}` : ""}</span>
                : <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-1">No order linked</span>}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="font-heading font-bold mb-2 flex items-center gap-2 text-slate-900 dark:text-white"><FileText className="h-5 w-5 text-primary-700" /> Refund Breakdown</h2>
            <RRow k="Original amount" v={fmt(r.original_amount)} />
            <RRow k="Service cost" v={fmt(r.service_cost)} />
            <RRow k="Tax (GST)" v={fmt(r.tax_amount)} />
            <RRow k="Refund policy" v={`Refund ${r.refund_pct}% · Partner ${r.partner_cancellation_pct}%`} />
            <RRow k="Customer refund" v={fmt(r.refund_amount ?? r.amount)} cls="text-emerald-600" />
            <RRow k="Partner cancellation" v={fmt(r.partner_cancellation_amount)} />
            <RRow k="Platform commission" v={fmt(r.platform_commission)} cls="text-primary-700" />
            <RRow k="Method" v={<span className="capitalize">{r.method || "wallet"}</span>} />
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h2 className="font-heading font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Clock className="h-5 w-5 text-primary-700" /> Refund Journey</h2>
            <div className="relative pl-6">
              <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-4">
                {(r.timeline || []).map((e, i) => (
                  <div key={i} className="relative" data-testid={`refund-timeline-${i}`}>
                    <span className={`absolute -left-[22px] top-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${e.fail ? "bg-red-500" : i === r.timeline.length - 1 ? "bg-emerald-500" : "bg-primary-500"}`} />
                    <p className={`text-sm ${e.fail ? "text-red-600 font-medium" : "text-slate-700 dark:text-slate-200"}`}>{e.label}</p>
                    <p className="text-[11px] text-slate-400">{new Date(e.at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 space-y-1">
              <p>Razorpay Payment: <span className="font-mono text-slate-600 dark:text-slate-300">{r.razorpay_payment_id || "—"}</span></p>
              <p>Razorpay Refund: <span className="font-mono text-slate-600 dark:text-slate-300">{r.razorpay_refund_id || "—"}</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="refunds-hub">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary-700 text-white flex items-center justify-center"><RotateCcw className="h-5 w-5" /></div>
          <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Cancellations &amp; Refunds</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="refund-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Booking / customer / reason" className="pl-9 w-56" />
          </div>
          <Button data-testid="refund-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1"><Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}</Button>
          <Button data-testid="refund-export" onClick={exportCsv} className="gap-1 bg-primary-700 hover:bg-primary-800"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="refund-summary">
        <SummaryCard label="Total Refunded" value={fmt(summary.refunded)} sub={`${counts.processed} processed`} tone="text-emerald-600" />
        <SummaryCard label="Pending" value={fmt(summary.pending)} sub={`${counts.initiated} pending`} tone="text-amber-600" />
        <SummaryCard label="Failed" value={fmt(summary.failed)} sub={`${counts.failed} failed`} tone="text-red-500" />
        <SummaryCard label="Avg Refund" value={fmt(summary.avg)} sub={`${counts.all} total`} tone="text-primary-700" />
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="refund-filters">
          <div><label className="text-xs text-slate-500">From date</label><PremiumDatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From date" /></div>
          <div><label className="text-xs text-slate-500">To date</label><PremiumDatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To date" /></div>
          <div className="flex items-end"><Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); }} className="gap-1 text-slate-500"><X className="h-4 w-4" /> Clear</Button></div>
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`refund-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-full text-sm whitespace-nowrap transition-all ${tab === t.key ? "bg-primary-700 text-white shadow" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {t.label}<span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>{["Booking", "Customer", "Service", "Original", "Refund", "Cancelled By", "Status", "Date", ""].map((h, i) => <th key={i} className="text-left font-medium px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No cancellations or refunds</td></tr>
              ) : pageRows.map((r) => {
                const S = STATUS[r.status] || {};
                return (
                  <tr key={r.id} data-testid={`refund-row-${r.booking_code}`} onClick={() => openDetail(r.id)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200">#{r.booking_code}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.customer_name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.service_name}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(r.original_amount)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600 whitespace-nowrap">{fmt(r.refund_amount ?? r.amount)}</td>
                    <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${BY_CLS[r.cancelled_by] || "bg-slate-100"}`}>{r.cancelled_by}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${S.cls}`}>{S.icon && <S.icon className="h-3 w-3" />}{S.label}</span></td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span data-testid={`refund-view-${r.booking_code}`} className="text-primary-700 text-xs font-medium hover:underline">View</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
            <span data-testid="refund-page-info">{(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, filtered.length)} of {filtered.length}</span>
            <div className="flex items-center gap-1">
              <button data-testid="refund-prev" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={cur === 1} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{cur} / {pageCount}</span>
              <button data-testid="refund-next" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={cur === pageCount} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function round2(n) { return Math.round((n || 0) * 100) / 100; }
