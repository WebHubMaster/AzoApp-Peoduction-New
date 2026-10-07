import { useEffect, useState, useCallback, useRef } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Receipt, Search, Filter, RefreshCw, Download, X, ArrowLeft, ArrowUpRight, ArrowDownLeft,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckCircle2, XCircle, Clock,
  RotateCcw, CreditCard, Smartphone, Building2, Wallet, Banknote, User as UserIcon, Phone,
  Package, FileText, AlertTriangle, Link2,
} from "lucide-react";
import { toast } from "sonner";
import DateRangeControl from "@/pages/admin/finance/DateRangeControl";
import WithdrawalInvestigation from "@/pages/admin/WithdrawalInvestigation";

const dt = (s) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const dtt = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const CAT_LABEL = {
  booking: "Bookings", withdrawal: "Withdrawals", commission: "Commission", refund: "Refunds",
  earning: "Earnings", adjustment: "Adjustments", bonus: "Bonuses", penalty: "Penalties",
  registration: "Registration", kit: "Kit Purchase", other: "Other",
};
const STATUS = {
  success: { label: "Success", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  processed: { label: "Processed", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700", icon: XCircle },
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700", icon: Clock },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700", icon: XCircle },
  refunded: { label: "Refunded", cls: "bg-sky-100 text-sky-700", icon: RotateCcw },
};
const METHOD_ICON = { upi: Smartphone, card: CreditCard, netbanking: Building2, wallet: Wallet, cod: Banknote, bank: Building2 };
const ACCT_CLS = { customer: "bg-slate-100 text-slate-600 border-slate-200", partner: "bg-blue-50 text-blue-700 border-blue-200", merchant: "bg-violet-50 text-violet-700 border-violet-200" };
const PAGE_SIZES = [10, 25, 50, 100];

const Kpi = ({ label, value, sub, tone }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`font-heading font-extrabold text-lg mt-1 ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);
const StatusBadge = ({ s }) => { const S = STATUS[s] || { label: s, cls: "bg-slate-100 text-slate-600" }; return <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md ${S.cls}`}>{S.icon && <S.icon className="h-3 w-3" />}{S.label}</span>; };

export default function TransactionsLedger() {
  const [data, setData] = useState({ items: [], total: 0, summary: {}, counts: {} });
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [acct, setAcct] = useState(""); const [method, setMethod] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState(null); const [detailLoading, setDetailLoading] = useState(false);
  const [wdView, setWdView] = useState(null);

  const tRef = useRef();
  useEffect(() => { clearTimeout(tRef.current); tRef.current = setTimeout(() => setDq(q), 350); return () => clearTimeout(tRef.current); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { category: cat, page, page_size: pageSize };
      if (dq) params.q = dq;
      if (acct) params.account_type = acct;
      if (method) params.method = method;
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const r = await api.get("/admin/finance/ledger", { params });
      setData(r.data);
    } catch { toast.error("Could not load transactions. Please retry."); }
    finally { setLoading(false); }
  }, [cat, page, pageSize, dq, acct, method, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [cat, dq, acct, method, from, to, pageSize]);

  const { items, total, summary = {}, counts = {} } = data;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activeFilters = [acct, method, from, to].filter(Boolean).length;

  const open = async (row) => {
    if (row.source === "withdrawal") { const [atype, rid] = String(row.id).split(":"); return setWdView({ id: rid, accountType: atype }); }
    setDetailLoading(true); setDetail({ _row: row });
    try { const { data } = await api.get(`/admin/finance/ledger/${row.source}/${row.id}`); setDetail({ ...data, _row: row }); }
    catch { toast.error("Failed to load transaction"); setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const exportCsv = () => {
    if (!items.length) return toast.error("Nothing to export");
    const cols = ["txn_ref", "account_type", "user_name", "type_label", "reference", "description", "amount", "direction", "method_label", "status", "created_at"];
    const head = ["Txn Ref", "Account", "User", "Type", "Reference", "Description", "Amount", "Dir", "Method", "Status", "Date"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...items.map((r) => cols.map((c) => esc(c === "created_at" ? dt(r[c]) : r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `ledger_${cat}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} transaction(s)`);
  };

  if (wdView) return <WithdrawalInvestigation wid={wdView.id} accountType={wdView.accountType} onBack={() => setWdView(null)} onDone={() => { setWdView(null); load(); }} />;
  if (detail) return <TxnDetail detail={detail} loading={detailLoading} onBack={() => setDetail(null)} onOpenWithdrawal={(id, atype) => { setDetail(null); setWdView({ id, accountType: atype }); }} />;

  const dynamicCats = Object.keys(counts).filter((k) => !["all", "credit", "debit"].includes(k) && counts[k] > 0);
  const tabs = [{ k: "all", l: "All" }, { k: "credit", l: "Credits" }, { k: "debit", l: "Debits" },
    ...dynamicCats.map((k) => ({ k, l: CAT_LABEL[k] || k[0].toUpperCase() + k.slice(1) }))];

  const Filters = (
    <>
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">Account</label>
        <div className="flex gap-1.5 flex-wrap">
          {[["", "All"], ["customer", "Customer"], ["partner", "Partner"], ["merchant", "Merchant"]].map(([k, l]) => (
            <button key={k} data-testid={`txn-acct-${k || "all"}`} onClick={() => setAcct(k)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${acct === k ? "bg-primary-700 text-white border-primary-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">Method</label>
        <div className="flex gap-1.5 flex-wrap">
          {[["", "All"], ["upi", "UPI"], ["card", "Card"], ["netbanking", "Net Banking"], ["wallet", "Wallet"], ["bank", "Bank"]].map(([k, l]) => (
            <button key={k} data-testid={`txn-method-${k || "all"}`} onClick={() => setMethod(k)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${method === k ? "bg-primary-700 text-white border-primary-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] text-slate-500 block mb-1">Date range</label>
        <DateRangeControl from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} testid="txn-daterange" />
      </div>
    </>
  );

  return (
    <div className="space-y-4" data-testid="transactions-ledger">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-primary-700 text-white flex items-center justify-center shrink-0"><Receipt className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Transactions</h2>
            <p className="text-[12px] text-slate-500">Complete financial ledger — payments, payouts, commission, refunds & wallet activity</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="txn-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Txn ID / user / reference" className="pl-9 w-56" />
          </div>
          <Button variant="outline" data-testid="txn-filter-toggle" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-md bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
          <Button variant="outline" data-testid="txn-refresh" onClick={load} className="gap-1"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button data-testid="txn-export" onClick={exportCsv} className="gap-1 bg-primary-700 hover:bg-primary-800"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="txn-summary">
        <Kpi label="Total Credits" value={fmt(summary.total_credit || 0)} sub="money in" tone="text-emerald-600" />
        <Kpi label="Total Debits" value={fmt(summary.total_debit || 0)} sub="money out" tone="text-red-500" />
        <Kpi label="Collected" value={fmt(summary.collected || 0)} sub="booking payments" tone="text-primary-700" />
        <Kpi label="Refunded" value={fmt(summary.refunded || 0)} sub="to customers" tone="text-sky-600" />
        <Kpi label="Withdrawn" value={fmt(summary.withdrawn || 0)} sub="paid out" tone="text-slate-800 dark:text-white" />
        <Kpi label="Commission" value={fmt(summary.commission || 0)} sub="merchant share" tone="text-violet-600" />
      </div>

      {showFilters && (
        <div className="hidden sm:grid rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid-cols-2 gap-4" data-testid="txn-filters">{Filters}</div>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button key={t.k} data-testid={`txn-tab-${t.k}`} onClick={() => setCat(t.k)}
            className={`px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${cat === t.k ? "bg-primary-700 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {t.l}<span className={`ml-1.5 text-[11px] ${cat === t.k ? "text-white/80" : "text-slate-400"}`}>{counts[t.k] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>{["Txn Ref", "User", "Type", "Reference", "Credit", "Debit", "Method", "Status", "Date", ""].map((h, i) => (
                <th key={i} className={`font-medium px-3 py-3 whitespace-nowrap ${["Credit", "Debit"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {loading ? [...Array(8)].map((_, i) => (<tr key={i} className="border-t border-slate-100 dark:border-slate-800"><td colSpan={10} className="px-3 py-3"><div className="h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td></tr>))
                : items.length === 0 ? (<tr><td colSpan={10} className="px-3 py-16 text-center"><Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="font-medium text-slate-500">No transactions found</p><p className="text-[12px] text-slate-400">Try adjusting the filters or date range.</p></td></tr>)
                  : items.map((r) => {
                    const MI = METHOD_ICON[r.method] || CreditCard; const credit = r.direction === "credit";
                    return (
                      <tr key={r.id} data-testid={`txn-row-${r.uid}`} onClick={() => open(r)} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer">
                        <td className="px-3 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{r.txn_ref}</td>
                        <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="font-medium text-slate-800 dark:text-slate-100 max-w-[130px] truncate">{r.user_name || "—"}</span><span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border capitalize ${ACCT_CLS[r.account_type] || ACCT_CLS.customer}`}>{r.account_type}</span></div></td>
                        <td className="px-3 py-3"><span className="text-slate-700 dark:text-slate-200">{r.type_label}</span><span className="block text-[11px] text-slate-400 max-w-[180px] truncate">{r.description}</span></td>
                        <td className="px-3 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{r.reference || "—"}</td>
                        <td className="px-3 py-3 text-right font-semibold whitespace-nowrap">{credit ? <span className="text-emerald-600">+{fmt(r.amount)}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-3 text-right font-semibold whitespace-nowrap">{!credit ? <span className="text-red-500">−{fmt(r.amount)}</span> : <span className="text-slate-300">—</span>}</td>
                        <td className="px-3 py-3"><span className="inline-flex items-center gap-1 text-[12px] text-slate-600 dark:text-slate-300"><MI className="h-3.5 w-3.5 text-slate-400" />{r.method_label || "—"}</span></td>
                        <td className="px-3 py-3"><StatusBadge s={r.status} /></td>
                        <td className="px-3 py-3 text-[12px] text-slate-400 whitespace-nowrap">{dt(r.created_at)}</td>
                        <td className="px-3 py-3"><span className="text-primary-700 text-xs font-medium hover:underline">View</span></td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        <Pager {...{ page, pageCount, pageSize, setPage, setPageSize, total }} />
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2.5" data-testid="txn-cards">
        {loading ? [...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)
          : items.length === 0 ? (<div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center"><Receipt className="h-8 w-8 text-slate-300 mx-auto mb-2" /><p className="font-medium text-slate-500">No transactions found</p></div>)
            : items.map((r) => { const credit = r.direction === "credit"; return (
              <div key={r.id} data-testid={`txn-card-${r.uid}`} onClick={() => open(r)} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{r.type_label}</p>
                    <p className="text-[11px] text-slate-400 font-mono">{r.txn_ref} · {r.user_name}</p>
                  </div>
                  <p className={`font-bold whitespace-nowrap ${credit ? "text-emerald-600" : "text-red-500"}`}>{credit ? "+" : "−"}{fmt(r.amount)}</p>
                </div>
                <div className="flex items-center justify-between mt-2"><StatusBadge s={r.status} /><span className="text-[11px] text-slate-400">{dt(r.created_at)}</span></div>
              </div>
            ); })}
        {items.length > 0 && <Pager {...{ page, pageCount, pageSize, setPage, setPageSize, total }} />}
      </div>

      {showFilters && (
        <div className="sm:hidden fixed inset-0 z-[9995]" data-testid="txn-filter-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white dark:bg-slate-900 p-5 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4"><p className="font-heading font-bold text-lg">Filters {activeFilters > 0 && <span className="text-primary-600">({activeFilters})</span>}</p><button onClick={() => setShowFilters(false)}><X className="h-5 w-5 text-slate-400" /></button></div>
            <div className="space-y-4">{Filters}</div>
            <div className="flex gap-2 mt-5"><Button variant="outline" className="flex-1" onClick={() => { setAcct(""); setMethod(""); setFrom(""); setTo(""); }}>Clear all</Button><Button className="flex-1 bg-primary-700 hover:bg-primary-800" onClick={() => setShowFilters(false)}>Apply filters</Button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ detail view
function TxnDetail({ detail, loading, onBack, onOpenWithdrawal }) {
  const row = detail._row || {};
  const source = detail.source || row.source;
  return (
    <div className="space-y-5" data-testid="txn-detail">
      <button onClick={onBack} data-testid="txn-detail-back" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to transactions</button>
      {loading ? <div className="py-20 text-center text-slate-400">Loading…</div>
        : source === "payment" ? <PaymentDetail p={detail} onOpenWithdrawal={onOpenWithdrawal} />
          : <GenericDetail d={detail} row={row} source={source} />}
    </div>
  );
}

function Header({ title, subtitle, amount, status, credit }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-slate-400">Transaction</p>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="text-right">
          <p className={`font-heading font-extrabold text-3xl ${credit === false ? "text-red-500" : credit === true ? "text-emerald-600" : "text-slate-900 dark:text-white"}`}>{credit === false ? "−" : credit === true ? "+" : ""}{fmt(amount)}</p>
          <div className="mt-1 flex justify-end"><StatusBadge s={status} /></div>
        </div>
      </div>
    </div>
  );
}
const Box = ({ title, icon: Icon, children, testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
    <h2 className="font-heading font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">{Icon && <Icon className="h-5 w-5 text-primary-700" />}{title}</h2>
    {children}
  </div>
);
const Row = ({ k, v, tone = "" }) => (<div className="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0"><span className="text-slate-500">{k}</span><span className={`text-slate-700 dark:text-slate-200 ${tone}`}>{v}</span></div>);

function PaymentDetail({ p, onOpenWithdrawal }) {
  const MI = METHOD_ICON[p.method] || CreditCard;
  const b = p.breakdown || {};
  const brows = [["Base amount", b.base_amount], ["Visiting charge", b.visiting], ["Discount", b.discount ? -b.discount : 0],
    ["Coupon", b.coupon ? -b.coupon : 0], ["GST", b.gst], ["Gateway fee", b.gateway_fee], ["Platform fee", b.platform_fee],
    ["Partner commission", b.partner_commission], ["Merchant referral", b.merchant_referral], ["TDS", b.tds], ["Refund", b.refund ? -b.refund : 0]].filter((r) => (r[1] || 0) !== 0);
  return (
    <>
      <Header title={p.txn_ref} subtitle={dtt(p.created_at)} amount={p.amount} status={p.status} />
      {p.status === "failed" && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 flex items-start gap-3" data-testid="txn-failure">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div><p className="font-semibold text-red-700 dark:text-red-300">Payment failed — {p.failure_reason}</p><p className="text-sm text-red-600/80">{p.order_created ? "Order was created." : "Order was NOT created — payment not captured."}</p></div>
        </div>
      )}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="space-y-5">
          <Box title="Customer" icon={UserIcon}>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><UserIcon className="h-4 w-4 text-slate-400" /> {p.customer_name || "—"}</p>
            <p className="flex items-center gap-2 text-sm text-slate-500 mt-1"><Phone className="h-4 w-4 text-slate-400" /> {p.customer_phone || "—"}</p>
          </Box>
          <Box title="Service & Order" icon={Package}>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><Package className="h-4 w-4 text-slate-400" /> {p.service_name}</p>
            <p className="text-xs text-slate-400 mt-1 ml-6">{p.category}</p>
            <div className="mt-3 text-sm">{p.booking_code ? <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 text-emerald-700 px-2.5 py-1">Order #{p.booking_code}{p.booking?.status ? ` · ${p.booking.status}` : ""}</span> : <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-1">No order created</span>}</div>
          </Box>
          <Box title="Payment Method" icon={MI}>
            <p className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200"><MI className="h-4 w-4 text-slate-400" /> {p.method_label}</p>
            <div className="mt-2 space-y-1 text-xs text-slate-400">
              <p>Gateway: <span className="text-slate-600 dark:text-slate-300">{p.gateway}</span></p>
              {p.gateway_payment_id && <p>Payment ID: <span className="font-mono text-slate-600 dark:text-slate-300">{p.gateway_payment_id}</span></p>}
              {p.gateway_order_id && <p>Order ID: <span className="font-mono text-slate-600 dark:text-slate-300">{p.gateway_order_id}</span></p>}
              <p>UTR: <span className="font-mono text-slate-600 dark:text-slate-300">{p.utr || "—"}</span></p>
            </div>
          </Box>
        </div>
        <Box title="Financial Breakdown" icon={FileText} testid="txn-breakdown">
          {brows.map(([k, v], i) => (<Row key={i} k={k} v={<span className={v < 0 ? "text-emerald-600" : ""}>{fmt(v)}</span>} />))}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2"><span>Gross (incl. GST)</span><span>{fmt(b.gross ?? p.amount)}</span></div>
          <div className="flex items-center justify-between font-heading font-bold text-lg mt-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-slate-900 dark:text-white"><span>Net Amount</span><span>{fmt(b.net ?? p.amount)}</span></div>
        </Box>
        <div className="space-y-5">
          <Box title="Payment Journey" icon={Clock}>
            <div className="relative pl-6"><div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-4">{(p.timeline || []).map((e, i) => { const isFail = /fail|not created|declined|cancel/i.test(e.label); return (
                <div key={i} className="relative" data-testid={`txn-timeline-${i}`}>
                  <span className={`absolute -left-[22px] top-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${isFail ? "bg-red-500" : i === (p.timeline.length - 1) ? "bg-emerald-500" : "bg-primary-500"}`} />
                  <p className={`text-sm ${isFail ? "text-red-600 font-medium" : "text-slate-700 dark:text-slate-200"}`}>{e.label}</p>
                  <p className="text-[11px] text-slate-400">{dtt(e.at)}</p>
                </div>); })}</div>
            </div>
          </Box>
          {p.booking_code && (
            <Box title="Related Records" icon={Link2}>
              <div className="flex items-center justify-between text-sm py-1.5"><span className="text-slate-500">Booking</span><span className="font-mono text-primary-700">#{p.booking_code}</span></div>
              <div className="flex items-center justify-between text-sm py-1.5 border-t border-slate-50 dark:border-slate-800"><span className="text-slate-500">Partner earning</span><span className="text-emerald-600">{fmt(p.commission?.partner_earning || 0)}</span></div>
              <div className="flex items-center justify-between text-sm py-1.5 border-t border-slate-50 dark:border-slate-800"><span className="text-slate-500">Platform earning</span><span>{fmt(p.commission?.platform_earning || 0)}</span></div>
            </Box>
          )}
        </div>
      </div>
    </>
  );
}

function GenericDetail({ d, row, source }) {
  const credit = row.direction === "credit";
  const fields = source === "refund"
    ? [["Booking", d.booking_code], ["Original amount", fmt(d.original_amount || d.amount)], ["Refund amount", fmt(d.refund_amount || d.amount)],
       ["Refund %", d.refund_pct != null ? `${d.refund_pct}%` : "—"], ["Method", (d.method || "").toUpperCase()], ["Gateway refund", d.razorpay_refund_id || "—"],
       ["Reason", d.cancellation_reason || "—"], ["Customer", d.customer_name], ["Phone", d.customer_phone]]
    : [["Type", row.type_label], ["Reference", d.ref_id || row.reference || "—"], ["Direction", credit ? "Credit" : "Debit"],
       ["Account", row.account_type], ["User", row.user_name], ["Note", d.note || row.description]];
  return (
    <>
      <Header title={row.txn_ref} subtitle={`${row.type_label} · ${dtt(row.created_at)}`} amount={row.amount} status={row.status} credit={credit} />
      <div className="grid md:grid-cols-2 gap-5">
        <Box title="Transaction Details" icon={Receipt}>{fields.map(([k, v], i) => <Row key={i} k={k} v={v || "—"} />)}</Box>
        {source === "refund" && (d.timeline || []).length > 0 && (
          <Box title="Refund Timeline" icon={Clock}>
            <div className="relative pl-6"><div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-4">{d.timeline.map((e, i) => (
                <div key={i} className="relative"><span className="absolute -left-[22px] top-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 bg-primary-500" /><p className="text-sm text-slate-700 dark:text-slate-200">{e.label || e.status}</p><p className="text-[11px] text-slate-400">{dtt(e.at || e.created_at)}</p></div>))}</div>
            </div>
          </Box>
        )}
      </div>
    </>
  );
}

function Pager({ page, pageCount, pageSize, setPage, setPageSize, total }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const IconBtn = ({ children, disabled, onClick, testid }) => (
    <button data-testid={testid} onClick={onClick} disabled={disabled} className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">{children}</button>
  );
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 flex-wrap">
      <div className="flex items-center gap-3">
        <span data-testid="txn-page-info">{from}–{to} of {total}</span>
        <select data-testid="txn-page-size" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[12px]">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <IconBtn testid="txn-first" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></IconBtn>
        <IconBtn testid="txn-prev" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></IconBtn>
        <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{page} / {pageCount}</span>
        <IconBtn testid="txn-next" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}><ChevronRight className="h-4 w-4" /></IconBtn>
        <IconBtn testid="txn-last" disabled={page === pageCount} onClick={() => setPage(pageCount)}><ChevronsRight className="h-4 w-4" /></IconBtn>
      </div>
    </div>
  );
}
