import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { useEffect, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Receipt, Filter, X, ChevronLeft, ChevronRight, Download, ArrowLeft,
  CheckCircle2, XCircle, Clock, RotateCcw, CreditCard, Smartphone, Building2, Wallet, Banknote,
  User as UserIcon, Phone, Package, AlertTriangle, FileText,
} from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "pending", label: "Pending" }, { key: "success", label: "Success" },
  { key: "failed", label: "Failed" }, { key: "refunded", label: "Refunded" }, { key: "all", label: "All" },
];
const METHODS = [
  { key: "", label: "All methods" }, { key: "upi", label: "UPI" }, { key: "card", label: "Card" },
  { key: "netbanking", label: "Net Banking" }, { key: "wallet", label: "Wallet" }, { key: "cod", label: "Cash" },
];
const METHOD_ICON = { upi: Smartphone, card: CreditCard, netbanking: Building2, wallet: Wallet, cod: Banknote };
const STATUS = {
  success: { label: "Success", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700", icon: XCircle },
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700", icon: Clock },
  refunded: { label: "Refunded", cls: "bg-sky-100 text-sky-700", icon: RotateCcw },
};

const SummaryCard = ({ label, value, sub, tone }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
    <p className={`font-heading font-extrabold text-lg mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

// Advanced Transactions — every customer payment for a service booking, with
// success/failed/pending/refunded states, method & gateway details, failure
// reasons, an invoice and a full payment journey. Click a row for the 360° view.
export default function TransactionsHub() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [method, setMethod] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tab };
      if (q.trim()) params.q = q.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (method) params.method = method;
      const r = await api.get("/admin/payments", { params });
      setRows(r.data.payments || []); setCounts(r.data.counts || {}); setSummary(r.data.summary || {});
    } catch { toast.error("Failed to load transactions"); } finally { setLoading(false); }
  }, [tab, q, dateFrom, dateTo, method]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, q, dateFrom, dateTo, method, rows.length]);

  const openDetail = async (id) => {
    setDetailLoading(true); setDetail({ id });
    try { const { data } = await api.get(`/admin/payments/${id}`); setDetail(data); }
    catch { toast.error("Failed to load"); setDetail(null); } finally { setDetailLoading(false); }
  };

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pageCount);
  const pageRows = rows.slice((cur - 1) * pageSize, cur * pageSize);
  const activeFilters = [dateFrom, dateTo, method].filter(Boolean).length;

  const exportCsv = () => {
    if (!rows.length) return toast.error("Nothing to export");
    const cols = ["txn_ref", "customer_name", "customer_phone", "service_name", "amount", "method_label", "status", "booking_code", "failure_reason", "created_at"];
    const head = ["Txn Ref", "Customer", "Phone", "Service", "Amount", "Method", "Status", "Order", "Failure Reason", "Date"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    const range = dateFrom || dateTo ? `_${dateFrom || "start"}_to_${dateTo || "today"}` : "";
    a.href = url; a.download = `transactions${range}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} transaction(s)`);
  };

  // ---------------- Detail view (sidebar stays visible) ----------------
  if (detail) {
    const p = detail;
    const S = STATUS[p.status] || {};
    const MI = METHOD_ICON[p.method] || CreditCard;
    return (
      <div className="space-y-5" data-testid="txn-detail">
        <button onClick={() => setDetail(null)} data-testid="txn-back" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to transactions
        </button>
        {detailLoading || !p.txn_ref ? (
          <div className="py-20 text-center text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-slate-400">Transaction</p>
                  <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{p.txn_ref}</h1>
                  <p className="text-sm text-slate-500 mt-1">{new Date(p.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-heading font-extrabold text-3xl text-slate-900 dark:text-white">{fmt(p.amount)}</p>
                  {S.label && <span className={`inline-flex items-center gap-1 mt-1 text-xs px-2.5 py-1 rounded-full ${S.cls}`}>{S.icon && <S.icon className="h-3.5 w-3.5" />}{S.label}</span>}
                </div>
              </div>
              {p.status === "failed" && (
                <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 flex items-start gap-3" data-testid="txn-failure">
                  <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold text-red-700 dark:text-red-300">Payment failed — {p.failure_reason}</p>
                    <p className="text-sm text-red-600/80 dark:text-red-300/70">{p.order_created ? "Order was created." : "Order was NOT created because the payment was not captured."}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="grid lg:grid-cols-3 gap-5">
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <h2 className="font-heading font-bold mb-3 text-slate-900 dark:text-white">Customer</h2>
                  <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><UserIcon className="h-4 w-4 text-slate-400" /> {p.customer_name || "—"}</p>
                  <p className="flex items-center gap-2 text-sm text-slate-500 mt-1"><Phone className="h-4 w-4 text-slate-400" /> {p.customer_phone || "—"}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <h2 className="font-heading font-bold mb-3 text-slate-900 dark:text-white">Service &amp; Order</h2>
                  <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><Package className="h-4 w-4 text-slate-400" /> {p.service_name}</p>
                  <p className="text-xs text-slate-400 mt-1 ml-6">{p.category}</p>
                  <div className="mt-3 text-sm">
                    {p.booking_code
                      ? <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1">Order #{p.booking_code}{p.booking?.status ? ` · ${p.booking.status}` : ""}</span>
                      : <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-1">No order created</span>}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                  <h2 className="font-heading font-bold mb-3 text-slate-900 dark:text-white">Payment Method</h2>
                  <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><MI className="h-4 w-4 text-slate-400" /> {p.method_label}</p>
                  <div className="mt-2 space-y-1 text-xs text-slate-400">
                    <p>Gateway: <span className="text-slate-600 dark:text-slate-300">{p.gateway}</span></p>
                    {p.gateway_payment_id && <p>Payment ID: <span className="font-mono text-slate-600 dark:text-slate-300">{p.gateway_payment_id}</span></p>}
                    {p.gateway_order_id && <p>Order ID: <span className="font-mono text-slate-600 dark:text-slate-300">{p.gateway_order_id}</span></p>}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h2 className="font-heading font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><FileText className="h-5 w-5 text-primary-700" /> Invoice</h2>
                {(p.invoice?.lines || []).map((l, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                    <span className="text-slate-600 dark:text-slate-300">{l.label}</span>
                    <span className={l.amount < 0 ? "text-emerald-600" : "text-slate-700 dark:text-slate-200"}>{fmt(l.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs text-slate-400 pt-2"><span>Incl. tax (GST)</span><span>{fmt(p.invoice?.tax || 0)}</span></div>
                <div className="flex items-center justify-between font-heading font-bold text-lg mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white"><span>Total</span><span>{fmt(p.invoice?.total ?? p.amount)}</span></div>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h2 className="font-heading font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Clock className="h-5 w-5 text-primary-700" /> Payment Journey</h2>
                <div className="relative pl-6">
                  <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
                  <div className="space-y-4">
                    {(p.timeline || []).map((e, i) => {
                      const isFail = /fail|not created|declined|cancel/i.test(e.label);
                      return (
                        <div key={i} className="relative" data-testid={`txn-timeline-${i}`}>
                          <span className={`absolute -left-[22px] top-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${isFail ? "bg-red-500" : i === (p.timeline.length - 1) ? "bg-emerald-500" : "bg-primary-500"}`} />
                          <p className={`text-sm ${isFail ? "text-red-600 font-medium" : "text-slate-700 dark:text-slate-200"}`}>{e.label}</p>
                          <p className="text-[11px] text-slate-400">{new Date(e.at).toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ---------------- List view ----------------
  return (
    <div className="space-y-4" data-testid="transactions-hub">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary-700 text-white flex items-center justify-center"><Receipt className="h-5 w-5" /></div>
          <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Transactions</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="txn-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ref / customer / service" className="pl-9 w-56" />
          </div>
          <Button data-testid="txn-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
          <Button data-testid="txn-export" onClick={exportCsv} className="gap-1 bg-primary-700 hover:bg-primary-800"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="txn-summary">
        <SummaryCard label="Collected" value={fmt(summary.collected || 0)} sub={`${counts.success || 0} successful`} tone="text-emerald-600" />
        <SummaryCard label="Failed" value={fmt(summary.failed_amount || 0)} sub={`${counts.failed || 0} failed`} tone="text-red-500" />
        <SummaryCard label="Refunded" value={fmt(summary.refunded_amount || 0)} sub={`${counts.refunded || 0} refunds`} tone="text-sky-600" />
        <SummaryCard label="Success Rate" value={`${summary.success_rate ?? 0}%`} sub={`${summary.total || 0} attempts`} tone="text-primary-700" />
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="txn-filters">
          <div><label className="text-xs text-slate-500">From date</label><PremiumDatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From date" /></div>
          <div><label className="text-xs text-slate-500">To date</label><PremiumDatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To date" /></div>
          <div>
            <label className="text-xs text-slate-500">Method</label>
            <Select value={method || "all"} onValueChange={(v) => setMethod(v === "all" ? "" : v)}>
              <SelectTrigger data-testid="txn-method" className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{METHODS.map((m) => <SelectItem key={m.key || "all"} value={m.key || "all"}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button variant="ghost" onClick={() => { setDateFrom(""); setDateTo(""); setMethod(""); }} className="gap-1 text-slate-500"><X className="h-4 w-4" /> Clear</Button></div>
        </div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`txn-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-full text-sm whitespace-nowrap transition-all ${tab === t.key ? "bg-primary-700 text-white shadow" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {t.label}<span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>{["Txn Ref", "Customer", "Service", "Amount", "Method", "Status", "Order", "Date", ""].map((h, i) => <th key={i} className="text-left font-medium px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No transactions found</td></tr>
              ) : pageRows.map((p) => {
                const S = STATUS[p.status] || {}; const MI = METHOD_ICON[p.method] || CreditCard;
                return (
                  <tr key={p.id} data-testid={`txn-row-${p.id}`} onClick={() => openDetail(p.id)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">{p.txn_ref}</td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800 dark:text-slate-100">{p.customer_name}</p><p className="text-[11px] text-slate-400">{p.customer_phone}</p></td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.service_name}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{fmt(p.amount)}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300"><MI className="h-3.5 w-3.5 text-slate-400" />{p.method_label}</span></td>
                    <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${S.cls}`}>{S.icon && <S.icon className="h-3 w-3" />}{S.label}</span></td>
                    <td className="px-4 py-3 text-xs">{p.booking_code ? <span className="text-emerald-600">#{p.booking_code}</span> : <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3"><span data-testid={`txn-view-${p.id}`} className="text-primary-700 text-xs font-medium hover:underline">View</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
            <span data-testid="txn-page-info">{(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, rows.length)} of {rows.length}</span>
            <div className="flex items-center gap-1">
              <button data-testid="txn-prev" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={cur === 1} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{cur} / {pageCount}</span>
              <button data-testid="txn-next" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={cur === pageCount} className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
