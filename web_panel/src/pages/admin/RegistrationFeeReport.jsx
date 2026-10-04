import { useEffect, useState, useCallback } from "react";
import { IndianRupee, Search, CheckCircle2, XCircle, Users, Loader2, RefreshCcw, ChevronLeft, ChevronRight } from "lucide-react";
import api, { fmt } from "@/lib/api";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";

const PAGE_SIZE = 10;

function Pager({ page, setPage, total, testid }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pageCount);
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 text-sm text-slate-500">
      <span data-testid={`${testid}-info`}>{(cur - 1) * PAGE_SIZE + 1}–{Math.min(cur * PAGE_SIZE, total)} of {total}</span>
      <div className="flex items-center gap-1">
        <button data-testid={`${testid}-prev`} onClick={() => setPage(Math.max(1, cur - 1))} disabled={cur === 1} className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /></button>
        <span className="px-3 font-medium text-slate-700">{cur} / {pageCount}</span>
        <button data-testid={`${testid}-next`} onClick={() => setPage(Math.min(pageCount, cur + 1))} disabled={cur === pageCount} className="h-8 w-8 rounded-md border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

const fmtDate = (s) => {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
};

const TONES = {
  slate: "bg-slate-50 text-slate-600", emerald: "bg-emerald-50 text-emerald-600",
  primary: "bg-primary-50 text-primary-700", amber: "bg-amber-50 text-amber-600",
};
const Card = ({ icon: Icon, label, value, tone = "slate", testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
    <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${TONES[tone] || TONES.slate}`}><Icon className="h-5 w-5" /></div>
    <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="text-xl font-extrabold text-slate-900">{value}</p></div>
  </div>
);

export default function RegistrationFeeReport({ onView }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [gateway, setGateway] = useState("");
  const [mode, setMode] = useState("");
  const [paidPage, setPaidPage] = useState(1);
  const [unpaidPage, setUnpaidPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ status, q, date_from: dateFrom, date_to: dateTo, gateway, mode });
    api.get(`/admin/partner-reg/registration-fees?${params.toString()}`)
      .then((r) => setData(r.data))
      .catch(() => setData({ transactions: [], unpaid: [], summary: {} }))
      .finally(() => setLoading(false));
  }, [status, q, dateFrom, dateTo, gateway, mode]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPaidPage(1); setUnpaidPage(1); }, [status, q, dateFrom, dateTo, gateway, mode]);

  const s = data?.summary || {};
  const txns = data?.transactions || [];
  const unpaid = data?.unpaid || [];
  const paidRows = txns.slice((paidPage - 1) * PAGE_SIZE, paidPage * PAGE_SIZE);
  const unpaidRows = unpaid.slice((unpaidPage - 1) * PAGE_SIZE, unpaidPage * PAGE_SIZE);
  const openPartner = (pid) => pid && onView?.({ id: pid, role: "partner" });

  return (
    <div className="space-y-5" data-testid="registration-fee-report">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 flex items-center gap-2"><IndianRupee className="h-6 w-6 text-primary-700" /> Registration Fee</h1>
          <p className="text-sm text-slate-500 mt-0.5">Every partner registration-fee payment — paid & unpaid — with advanced filters.</p>
        </div>
        <button data-testid="regfee-refresh" onClick={load} className="h-10 px-4 rounded-md border border-slate-200 text-sm font-semibold text-slate-600 hover:border-primary-300 flex items-center gap-2"><RefreshCcw className="h-4 w-4" /> Refresh</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card icon={IndianRupee} label="Collected" value={fmt(s.collected || 0)} tone="emerald" testid="regfee-collected" />
        <Card icon={CheckCircle2} label="Paid" value={s.paid_count || 0} tone="primary" testid="regfee-paid-count" />
        <Card icon={XCircle} label="Unpaid" value={s.unpaid_count || 0} tone="amber" testid="regfee-unpaid-count" />
        <Card icon={Users} label="Current Fee" value={s.fee_enabled ? fmt(s.current_fee || 0) : "Disabled"} tone="slate" testid="regfee-current" />
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 grid gap-3 md:grid-cols-6">
        <div className="md:col-span-2 relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input data-testid="regfee-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, code, txn…" className="w-full h-10 pl-9 pr-3 rounded-md border border-slate-200 text-sm outline-none focus:border-primary-400" />
        </div>
        <select data-testid="regfee-status" value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm">
          <option value="all">All</option><option value="paid">Paid only</option><option value="unpaid">Unpaid only</option>
        </select>
        <PremiumDatePicker data-testid="regfee-date-from" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From date" />
        <PremiumDatePicker data-testid="regfee-date-to" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To date" />
        <div className="grid grid-cols-2 gap-2">
          <input data-testid="regfee-gateway" value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="Gateway" className="h-10 rounded-md border border-slate-200 px-3 text-sm" />
          <select data-testid="regfee-mode" value={mode} onChange={(e) => setMode(e.target.value)} className="h-10 rounded-md border border-slate-200 px-2 text-sm">
            <option value="">Mode</option><option value="test">Test</option><option value="live">Live</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>
      ) : (
        <>
          {status !== "unpaid" && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="regfee-paid-table">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="font-bold text-slate-800">Paid ({txns.length})</span></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2">Partner</th><th className="px-4 py-2">Txn Ref</th><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Gateway</th><th className="px-4 py-2">Mode</th><th className="px-4 py-2">Paid At</th>
                  </tr></thead>
                  <tbody>
                    {txns.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No paid registration fees found</td></tr> :
                      paidRows.map((t) => (
                        <tr key={t.id} data-testid={`regfee-txn-${t.id}`} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => openPartner(t.partner_id)}>
                          <td className="px-4 py-2.5"><p className="font-semibold text-slate-800">{t.customer_name}</p><p className="text-xs text-slate-400">{t.customer_phone}{t.partner_code ? ` · ${t.partner_code}` : ""}</p></td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{t.txn_ref}</td>
                          <td className="px-4 py-2.5 font-bold text-slate-900">{fmt(t.amount)}</td>
                          <td className="px-4 py-2.5 capitalize text-slate-600">{t.gateway || "—"}</td>
                          <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.mode === "live" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{(t.mode || "test").toUpperCase()}</span></td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(t.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Pager page={paidPage} setPage={setPaidPage} total={txns.length} testid="regfee-paid-page" />
            </div>
          )}

          {status !== "paid" && (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden" data-testid="regfee-unpaid-table">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2"><XCircle className="h-4 w-4 text-amber-600" /><span className="font-bold text-slate-800">Unpaid partners ({unpaid.length})</span></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-100">
                    <th className="px-4 py-2">Partner</th><th className="px-4 py-2">Code</th><th className="px-4 py-2">KYC</th><th className="px-4 py-2">Payment</th><th className="px-4 py-2">Registered</th>
                  </tr></thead>
                  <tbody>
                    {unpaid.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No unpaid partners</td></tr> :
                      unpaidRows.map((p) => (
                        <tr key={p.partner_id} data-testid={`regfee-unpaid-${p.partner_id}`} className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer" onClick={() => openPartner(p.partner_id)}>
                          <td className="px-4 py-2.5"><p className="font-semibold text-slate-800">{p.name}</p><p className="text-xs text-slate-400">{p.phone}</p></td>
                          <td className="px-4 py-2.5 text-slate-500">{p.partner_code || "—"}</td>
                          <td className="px-4 py-2.5 capitalize text-slate-600">{p.kyc_status || "—"}</td>
                          <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.pending_order ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-600"}`}>{p.pending_order ? "Pending" : "Not paid"}</span></td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{fmtDate(p.created_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Pager page={unpaidPage} setPage={setUnpaidPage} total={unpaid.length} testid="regfee-unpaid-page" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
