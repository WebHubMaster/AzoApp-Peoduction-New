import { useEffect, useState, useCallback, useRef } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Banknote, Search, Filter, RefreshCw, Download, X, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Clock, CheckCircle2, XCircle, AlertTriangle,
  Wallet, TrendingUp, Loader2, Building2, Smartphone, FileText,
} from "lucide-react";
import { toast } from "sonner";
import WithdrawalInvestigation from "@/pages/admin/WithdrawalInvestigation";
import DateRangeControl from "@/pages/admin/finance/DateRangeControl";

const dt = (s) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const STATUS = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  completed: { label: "Paid", cls: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  failed: { label: "Payout Failed", cls: "bg-red-100 text-red-700 border-red-200", icon: XCircle },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700 border-rose-200", icon: XCircle },
};
const METHOD_ICON = { upi: Smartphone, bank: Building2, cheque: FileText };
const TABS = [
  { key: "pending", label: "Pending", ck: "pending" }, { key: "completed", label: "Approved / Paid", ck: "completed" },
  { key: "failed", label: "Payout Failed", ck: "failed" }, { key: "rejected", label: "Rejected", ck: "rejected" },
  { key: "all", label: "All", ck: "all" },
];
const PAGE_SIZES = [10, 25, 50, 100];

function Kpi({ label, value, sub, tone, icon: Icon, iconBg }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {Icon && <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconBg}`}><Icon className="h-4 w-4" /></span>}
      </div>
      <p className={`font-heading font-extrabold text-xl mt-1.5 ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function AcctBadge({ type }) {
  const merchant = type === "merchant";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${merchant ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
      {merchant ? "Merchant" : "Partner"}
    </span>
  );
}

export default function FinanceWithdrawals() {
  const [data, setData] = useState({ items: [], total: 0, counts: {}, kpis: {} });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pending");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [acct, setAcct] = useState("");
  const [method, setMethod] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [view, setView] = useState(null); // { id, accountType }
  const [confirm, setConfirm] = useState(null); // withdrawal obj for approve
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // debounce search
  const tRef = useRef();
  useEffect(() => { clearTimeout(tRef.current); tRef.current = setTimeout(() => setDq(q), 350); return () => clearTimeout(tRef.current); }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status: tab, page, page_size: pageSize };
      if (dq) params.q = dq;
      if (acct) params.account_type = acct;
      if (method) params.method = method;
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      const r = await api.get("/admin/finance/withdrawals", { params });
      setData(r.data);
    } catch { toast.error("Could not load withdrawal requests. Please retry."); }
    finally { setLoading(false); }
  }, [tab, page, pageSize, dq, acct, method, from, to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, dq, acct, method, from, to, pageSize]);

  const { items, total, counts = {}, kpis = {} } = data;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const activeFilters = [acct, method, from, to].filter(Boolean).length;

  const act = async (w, action, rsn = "") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/finance/withdrawals/${w.account_type}/${w.id}/action`, { action, reason: rsn });
      const st = r.data?.status;
      if (action === "approve") toast[st === "completed" ? "success" : "error"](st === "completed" ? "Payout successful — withdrawal marked Paid" : "Gateway declined — payout failed");
      else toast.success("Withdrawal rejected");
      setConfirm(null); setReject(null); setReason("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
    finally { setBusy(false); }
  };

  const exportCsv = () => {
    if (!items.length) return toast.error("Nothing to export in this view");
    const cols = ["code", "account_type", "name", "amount", "fee", "net_amount", "method", "destination", "status", "requested_at"];
    const head = ["Request ID", "Account Type", "Recipient", "Amount", "Fee", "Net Payable", "Method", "Destination", "Status", "Requested"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = items.map((r) => cols.map((c) => esc(c === "requested_at" ? dt(r[c]) : r[c])).join(","));
    const csv = [head.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `withdrawals_${tab}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${items.length} withdrawal(s)`);
  };

  if (view) {
    return <WithdrawalInvestigation wid={view.id} accountType={view.accountType}
      onBack={() => setView(null)} onDone={() => { setView(null); load(); }} />;
  }

  const Filters = (
    <>
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">Account type</label>
        <div className="flex gap-1.5">
          {[["", "All"], ["partner", "Partner"], ["merchant", "Merchant"]].map(([k, l]) => (
            <button key={k} data-testid={`wd-acct-${k || "all"}`} onClick={() => setAcct(k)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${acct === k ? "bg-primary-700 text-white border-primary-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-[11px] text-slate-500 block mb-1">Payment method</label>
        <div className="flex gap-1.5">
          {[["", "All"], ["bank", "Bank"], ["upi", "UPI"], ["cheque", "Cheque"]].map(([k, l]) => (
            <button key={k} data-testid={`wd-method-${k || "all"}`} onClick={() => setMethod(k)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border ${method === k ? "bg-primary-700 text-white border-primary-700" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="text-[11px] text-slate-500 block mb-1">Date range</label>
        <DateRangeControl from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} testid="wd-daterange" />
      </div>
    </>
  );

  return (
    <div className="space-y-4" data-testid="finance-withdrawals">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-primary-700 text-white flex items-center justify-center shrink-0"><Banknote className="h-5 w-5" /></div>
          <div>
            <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Withdrawal Requests</h2>
            <p className="text-[12px] text-slate-500">Review, verify and process partner & merchant payouts</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="wd-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name / Request ID / UTR / A/c" className="pl-9 w-60" />
          </div>
          <Button variant="outline" data-testid="wd-filter-toggle" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-md bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
          <Button variant="outline" data-testid="wd-refresh" onClick={load} className="gap-1"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button data-testid="wd-export" onClick={exportCsv} className="gap-1 bg-primary-700 hover:bg-primary-800"><Download className="h-4 w-4" /> Export</Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3" data-testid="wd-kpis">
        <Kpi label="Total Requested" value={fmt(kpis.total_requested || 0)} sub={`${kpis.count_requested || 0} requests`} tone="text-slate-800 dark:text-white" icon={TrendingUp} iconBg="bg-blue-50 text-blue-600" />
        <Kpi label="Pending" value={fmt(kpis.pending_amount || 0)} sub={`${kpis.count_pending || 0} awaiting`} tone="text-amber-600" icon={Clock} iconBg="bg-amber-50 text-amber-600" />
        <Kpi label="Approved / Paid" value={fmt(kpis.paid_amount || 0)} sub={`${kpis.count_paid || 0} paid`} tone="text-emerald-600" icon={CheckCircle2} iconBg="bg-emerald-50 text-emerald-600" />
        <Kpi label="Payout Failed" value={fmt(kpis.failed_amount || 0)} sub={`${kpis.count_failed || 0} failed`} tone="text-red-600" icon={XCircle} iconBg="bg-red-50 text-red-600" />
        <Kpi label="Rejected" value={fmt(kpis.rejected_amount || 0)} sub={`${kpis.count_rejected || 0} rejected`} tone="text-rose-600" icon={AlertTriangle} iconBg="bg-rose-50 text-rose-600" />
        <Kpi label="Processing Fees" value={fmt(kpis.total_fees || 0)} sub="on paid payouts" tone="text-violet-600" icon={Wallet} iconBg="bg-violet-50 text-violet-600" />
        <Kpi label="Total Net Paid" value={fmt(kpis.total_net_paid || 0)} sub="disbursed" tone="text-primary-700" icon={Banknote} iconBg="bg-primary-50 text-primary-700" />
      </div>

      {/* Filters (desktop inline) */}
      {showFilters && (
        <div className="hidden sm:grid rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid-cols-2 gap-4" data-testid="wd-filters">
          {Filters}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`wd-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${tab === t.key ? "bg-primary-700 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {t.label}<span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>{counts[t.ck] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Table (desktop) */}
      <div className="hidden md:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>{["Request ID", "Recipient", "Amount", "Fee", "Net Payable", "Method", "Destination", "Requested", "Status", "UTR / Ref", "Actions"].map((h, i) => (
                <th key={i} className={`font-medium px-3 py-3 whitespace-nowrap ${["Amount", "Fee", "Net Payable"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {loading ? [...Array(6)].map((_, i) => (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800"><td colSpan={11} className="px-3 py-3"><div className="h-6 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td></tr>
              )) : items.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-16 text-center">
                  <Banknote className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-500">No withdrawal requests</p>
                  <p className="text-[12px] text-slate-400">Nothing matches the current filters.</p>
                </td></tr>
              ) : items.map((w) => {
                const S = STATUS[w.status] || {}; const MI = METHOD_ICON[w.method] || Building2;
                return (
                  <tr key={`${w.account_type}:${w.id}`} data-testid={`wd-row-${w.id}`} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{w.code}</td>
                    <td className="px-3 py-3"><div className="flex items-center gap-2"><span className="font-medium text-slate-800 dark:text-slate-100">{w.name}</span><AcctBadge type={w.account_type} /></div></td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">{fmt(w.amount)}</td>
                    <td className="px-3 py-3 text-right text-slate-500 whitespace-nowrap">{fmt(w.fee)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-600 whitespace-nowrap">{fmt(w.net_amount)}</td>
                    <td className="px-3 py-3"><span className="inline-flex items-center gap-1 text-[12px] text-slate-600 dark:text-slate-300"><MI className="h-3.5 w-3.5 text-slate-400" />{(w.method || "").toUpperCase()}</span></td>
                    <td className="px-3 py-3 text-[12px] text-slate-500 whitespace-nowrap max-w-[160px] truncate">{w.destination}</td>
                    <td className="px-3 py-3 text-[12px] text-slate-400 whitespace-nowrap">{dt(w.requested_at)}</td>
                    <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border ${S.cls}`}>{S.icon && <S.icon className="h-3 w-3" />}{S.label}</span></td>
                    <td className="px-3 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">{w.payout?.utr || w.payout?.payout_id || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button size="sm" variant="outline" data-testid={`wd-view-${w.id}`} onClick={() => setView({ id: w.id, accountType: w.account_type })}>View</Button>
                        {w.status === "pending" && <>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`wd-approve-${w.id}`} onClick={() => setConfirm(w)}>Approve &amp; Pay</Button>
                          <Button size="sm" variant="outline" className="text-red-600 border-red-200" data-testid={`wd-reject-${w.id}`} onClick={() => setReject(w)}>Reject</Button>
                        </>}
                        {w.status === "failed" && w.account_type === "partner" && (
                          <Button size="sm" className="bg-primary-700 hover:bg-primary-800 gap-1" data-testid={`wd-retry-${w.id}`} onClick={() => setView({ id: w.id, accountType: w.account_type })}><RefreshCw className="h-3.5 w-3.5" /> Retry</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager {...{ page, pageCount, pageSize, setPage, setPageSize, total }} />
      </div>

      {/* Cards (mobile) */}
      <div className="md:hidden space-y-2.5" data-testid="wd-cards">
        {loading ? [...Array(4)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />)
          : items.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
              <Banknote className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <p className="font-medium text-slate-500">No withdrawal requests</p>
            </div>
          ) : items.map((w) => {
            const S = STATUS[w.status] || {};
            return (
              <div key={`${w.account_type}:${w.id}`} data-testid={`wd-card-${w.id}`} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-semibold text-slate-800 dark:text-slate-100">{w.name}</span><AcctBadge type={w.account_type} /></div>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">{w.code} · {dt(w.requested_at)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border ${S.cls}`}>{S.icon && <S.icon className="h-3 w-3" />}{S.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                  <div><p className="text-[10px] text-slate-400 uppercase">Amount</p><p className="font-bold text-slate-800 dark:text-white">{fmt(w.amount)}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase">Fee</p><p className="font-medium text-slate-500">{fmt(w.fee)}</p></div>
                  <div><p className="text-[10px] text-slate-400 uppercase">Net</p><p className="font-bold text-emerald-600">{fmt(w.net_amount)}</p></div>
                </div>
                <p className="text-[12px] text-slate-500 mt-2">{(w.method || "").toUpperCase()} · {w.destination}</p>
                <div className="flex items-center gap-1.5 mt-3">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => setView({ id: w.id, accountType: w.account_type })}>View</Button>
                  {w.status === "pending" && <>
                    <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirm(w)}>Approve</Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => setReject(w)}>Reject</Button>
                  </>}
                </div>
              </div>
            );
          })}
        {items.length > 0 && <Pager {...{ page, pageCount, pageSize, setPage, setPageSize, total }} />}
      </div>

      {/* Mobile filter drawer */}
      {showFilters && (
        <div className="sm:hidden fixed inset-0 z-[9995]" data-testid="wd-filter-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFilters(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white dark:bg-slate-900 p-5 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <p className="font-heading font-bold text-lg">Filters {activeFilters > 0 && <span className="text-primary-600">({activeFilters})</span>}</p>
              <button onClick={() => setShowFilters(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-4">{Filters}</div>
            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => { setAcct(""); setMethod(""); setFrom(""); setTo(""); }}>Clear all</Button>
              <Button className="flex-1 bg-primary-700 hover:bg-primary-800" onClick={() => setShowFilters(false)}>Apply filters</Button>
            </div>
          </div>
        </div>
      )}

      {/* Approve & Pay confirmation */}
      <Dialog open={!!confirm} onOpenChange={(o) => !busy && !o && setConfirm(null)}>
        <DialogContent data-testid="wd-confirm-pay">
          <DialogHeader>
            <DialogTitle>Approve payout?</DialogTitle>
            <DialogDescription>The disbursement is sent through the configured payout gateway. The withdrawal is marked <b>Paid</b> only after the gateway confirms success.</DialogDescription>
          </DialogHeader>
          {confirm && (
            <div className="space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-[13px]">
              {[["Recipient", confirm.name], ["Account type", confirm.account_type === "merchant" ? "Merchant" : "Partner"],
                ["Requested", fmt(confirm.amount)], ["Processing fee", fmt(confirm.fee)]].map(([k, v]) => (
                <div key={k} className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-medium">{v}</span></div>
              ))}
              <div className="flex justify-between pt-1 border-t border-slate-100 dark:border-slate-800"><span className="text-slate-500">Net payable</span><span className="font-bold text-emerald-600">{fmt(confirm.net_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Destination</span><span className="font-medium">{(confirm.method || "").toUpperCase()} · {confirm.destination}</span></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" data-testid="wd-confirm-pay-btn" disabled={busy} onClick={() => act(confirm, "approve")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirm payout of ${fmt(confirm?.net_amount)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={!!reject} onOpenChange={(o) => !busy && !o && setReject(null)}>
        <DialogContent data-testid="wd-reject-dialog">
          <DialogHeader><DialogTitle>Reject withdrawal</DialogTitle>
            <DialogDescription>The locked amount is released back to the wallet. A reason is required.</DialogDescription></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" data-testid="wd-reject-reason" />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setReject(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" data-testid="wd-reject-btn" disabled={busy || !reason.trim()} onClick={() => act(reject, "reject", reason)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject withdrawal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Pager({ page, pageCount, pageSize, setPage, setPageSize, total }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500 flex-wrap">
      <div className="flex items-center gap-3">
        <span data-testid="wd-page-info">{from}–{to} of {total}</span>
        <select data-testid="wd-page-size" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
          className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-[12px]">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{`${s} / page`}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-1">
        <IconBtn testid="wd-first" disabled={page === 1} onClick={() => setPage(1)}><ChevronsLeft className="h-4 w-4" /></IconBtn>
        <IconBtn testid="wd-prev" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="h-4 w-4" /></IconBtn>
        <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{page} / {pageCount}</span>
        <IconBtn testid="wd-next" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}><ChevronRight className="h-4 w-4" /></IconBtn>
        <IconBtn testid="wd-last" disabled={page === pageCount} onClick={() => setPage(pageCount)}><ChevronsRight className="h-4 w-4" /></IconBtn>
      </div>
    </div>
  );
}
const IconBtn = ({ children, disabled, onClick, testid }) => (
  <button data-testid={testid} onClick={onClick} disabled={disabled}
    className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800">{children}</button>
);
