import { useEffect, useState, useCallback } from "react";
import { Banknote, Loader2, CheckCircle2, XCircle } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const PILL = {
  pending: "bg-amber-100 text-amber-700", completed: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function MerchantWithdrawals() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [cfg, setCfg] = useState(null);
  const [tab, setTab] = useState("pending");
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/merchant/withdrawals").then((r) => { setItems(r.data.withdrawals || []); setStats(r.data.stats || {}); });
    api.get("/admin/merchant/wallet-config").then((r) => setCfg(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (id, action, rsn = "") => {
    setBusy(true);
    try { await api.post(`/admin/merchant/withdrawals/${id}/action`, { action, reason: rsn }); toast.success(`Withdrawal ${action}d`); setReject(null); setReason(""); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };
  const saveCfg = async () => { await api.put("/admin/merchant/wallet-config", cfg); toast.success("Rules saved"); };

  const counts = items.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
  const tabs = [
    { key: "pending", label: "Pending", count: counts.pending || 0 },
    { key: "completed", label: "Approved", count: counts.completed || 0 },
    { key: "rejected", label: "Rejected", count: counts.rejected || 0 },
    { key: "all", label: "All", count: items.length },
  ];
  const shown = tab === "all" ? items : items.filter((x) => x.status === tab);

  return (
    <div className="max-w-4xl space-y-6" data-testid="merchant-withdrawals-admin">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-3"><p className="text-[11px] uppercase tracking-wider text-amber-500">Pending</p><p className="text-lg font-bold text-amber-600">{fmt(stats.pending_amount || 0)}</p><p className="text-[11px] text-slate-400">{stats.pending || 0} requests</p></div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3"><p className="text-[11px] uppercase tracking-wider text-emerald-500">Total Paid</p><p className="text-lg font-bold text-emerald-600">{fmt(stats.total_paid || 0)}</p><p className="text-[11px] text-slate-400">{stats.completed || 0} paid</p></div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><p className="text-[11px] uppercase tracking-wider text-slate-400">All Requests</p><p className="text-lg font-bold text-slate-700">{items.length}</p></div>
        <div className="rounded-2xl border border-primary-100 bg-primary-50 p-3 flex items-center gap-2"><Banknote className="h-6 w-6 text-primary-600" /><p className="text-sm font-semibold text-primary-700">Merchant Payouts</p></div>
      </div>

      {cfg && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="merchant-wallet-rules">
          <p className="font-semibold mb-3">Withdrawal Rules</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="text-xs">Min</label><Input type="number" value={cfg.min_withdrawal} onChange={(e) => setCfg({ ...cfg, min_withdrawal: Number(e.target.value) })} /></div>
            <div><label className="text-xs">Max</label><Input type="number" value={cfg.max_withdrawal} onChange={(e) => setCfg({ ...cfg, max_withdrawal: Number(e.target.value) })} /></div>
            <div><label className="text-xs">Fee %</label><Input type="number" value={cfg.processing_fee_pct} onChange={(e) => setCfg({ ...cfg, processing_fee_pct: Number(e.target.value) })} /></div>
            <div><label className="text-xs">Fee flat</label><Input type="number" value={cfg.processing_fee_flat} onChange={(e) => setCfg({ ...cfg, processing_fee_flat: Number(e.target.value) })} /></div>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 items-center">
            {["upi", "bank", "cheque"].map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm capitalize">
                <input type="checkbox" checked={!!cfg[`${m}_enabled`]} onChange={(e) => setCfg({ ...cfg, [`${m}_enabled`]: e.target.checked })} /> {m}
              </label>
            ))}
            <Button size="sm" onClick={saveCfg} className="bg-primary-700 hover:bg-primary-800 ml-auto" data-testid="save-merchant-wallet-cfg">Save Rules</Button>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-1.5 mb-3">
          {tabs.map((t) => (
            <button key={t.key} data-testid={`mwd-tab-${t.key}`} onClick={() => setTab(t.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm ${tab === t.key ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-600"}`}>{t.label} <span className="opacity-70 text-xs">{t.count}</span></button>
          ))}
        </div>
        <div className="space-y-2" data-testid="admin-merchant-withdrawals">
          {shown.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No withdrawal requests</div>}
          {shown.map((x) => (
            <div key={x.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <p className="font-medium text-slate-800">{x.merchant_name} · {fmt(x.amount)} <span className="text-xs uppercase text-slate-400">{x.method}</span> <span className={`ml-1 text-[11px] px-2 py-0.5 rounded-full capitalize ${PILL[x.status] || "bg-slate-100 text-slate-500"}`}>{x.status}</span></p>
                  <p className="text-xs text-slate-400">{x.method === "upi" ? x.upi_id : x.method === "bank" ? x.bank?.account_number : x.cheque?.payee} · fee {fmt(x.fee)} · net {fmt(x.net_amount)} · {String(x.requested_at || "").slice(0, 10)}</p>
                </div>
                {x.status === "pending" && (
                  <div className="flex gap-2 items-center">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`mwd-approve-${x.id}`} disabled={busy} onClick={() => act(x.id, "approve")}><CheckCircle2 className="h-4 w-4 mr-1" />Approve &amp; Pay</Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200" data-testid={`mwd-reject-${x.id}`} onClick={() => setReject(x.id)}><XCircle className="h-4 w-4 mr-1" />Reject</Button>
                  </div>
                )}
              </div>
              {reject === x.id && (
                <div className="mt-3 flex gap-2">
                  <Input data-testid={`mwd-reason-${x.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" className="h-10" />
                  <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={() => act(x.id, "reject", reason)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setReject(null); setReason(""); }}>Cancel</Button>
                </div>
              )}
              {x.status === "rejected" && x.reason && <p className="text-xs text-red-500 mt-2">Reason: {x.reason}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
