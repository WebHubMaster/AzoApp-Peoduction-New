import { useCallback, useEffect, useState } from "react";
import { CreditCard, Building2, ShieldCheck, CheckCircle2, XCircle, Loader2, FileText, Image as ImageIcon } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const Pill = ({ s }) => (
  <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${s === "approved" ? "bg-emerald-100 text-emerald-700" : s === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{s || "not submitted"}</span>
);

function ReviewActions({ status, onApprove, onReject, busy }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  if (status === "approved") return <span className="text-xs text-emerald-600 font-semibold inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Verified</span>;
  return (
    <div className="flex flex-col gap-2 items-end">
      {!rejecting ? (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={onApprove} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs"><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</Button>
          <Button size="sm" disabled={busy} variant="outline" onClick={() => setRejecting(true)} className="h-8 text-red-600 border-red-200 text-xs"><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</Button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Rejection reason" className="h-8 rounded-lg border border-slate-200 px-2 text-xs w-44" />
          <Button size="sm" disabled={busy || !reason.trim()} onClick={() => onReject(reason.trim())} className="h-8 bg-red-600 hover:bg-red-700 text-xs">Confirm</Button>
          <Button size="sm" variant="ghost" onClick={() => { setRejecting(false); setReason(""); }} className="h-8 text-xs">Cancel</Button>
        </div>
      )}
    </div>
  );
}

export default function MerchantBankKycAdmin({ userId, onZoom }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/admin/merchant/finance-requests`, { params: { merchant_id: userId } }).then((r) => setData(r.data)).catch(() => {});
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const reviewPan = async (action, reason = "") => {
    setBusy(true);
    try { await api.post(`/admin/merchant/${userId}/finance/pan/action`, { action, reason }); toast.success(`PAN ${action}d`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const reviewBank = async (bankId, action, reason = "") => {
    setBusy(true);
    try { await api.post(`/admin/merchant/finance/banks/${bankId}/action`, { action, reason }); toast.success(`Bank ${action}d`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  if (!data) return <div className="py-16 text-center text-slate-400"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  const pan = (data.pans || [])[0];
  const banks = data.banks || [];

  return (
    <div className="space-y-6 max-w-3xl" data-testid="mctab-bankkyc">
      {/* PAN */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary-700" /> PAN Card</h3>
          <Pill s={pan?.status} />
        </div>
        {!pan ? (
          <p className="text-sm text-slate-400">PAN not submitted yet.</p>
        ) : (
          <div className="flex items-start gap-4 flex-wrap">
            {pan.pan_url && (
              <button onClick={() => onZoom?.(pan.pan_url)} className="rounded-xl overflow-hidden border border-slate-200 w-40 shrink-0">
                <img src={pan.pan_url} alt="PAN" className="w-full h-28 object-cover" />
              </button>
            )}
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm text-slate-500">PAN Number</p>
              <p className="font-mono font-bold text-slate-800 dark:text-white">{pan.pan_number}</p>
              {pan.status === "rejected" && pan.reason && <p className="text-xs text-red-600 mt-2">Rejected: {pan.reason}</p>}
            </div>
            <ReviewActions status={pan.status} busy={busy} onApprove={() => reviewPan("approve")} onReject={(r) => reviewPan("reject", r)} />
          </div>
        )}
      </div>

      {/* Bank accounts */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4"><Building2 className="h-5 w-5 text-primary-700" /> Bank Accounts</h3>
        {banks.length === 0 ? (
          <p className="text-sm text-slate-400">No bank accounts submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {banks.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4" data-testid={`mck-bank-${b.id}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-4">
                    {b.passbook_url && (
                      <button onClick={() => onZoom?.(b.passbook_url)} className="rounded-lg overflow-hidden border border-slate-200 w-28 shrink-0 grid place-items-center bg-slate-50 h-20" data-testid={`mck-passbook-${b.id}`}>
                        {String(b.passbook_url).toLowerCase().split("?")[0].endsWith(".pdf")
                          ? <span className="flex flex-col items-center text-rose-500"><FileText className="h-7 w-7" /><span className="text-[10px] font-bold mt-0.5">PDF</span></span>
                          : <img src={b.passbook_url} alt="Passbook" className="w-full h-20 object-cover" />}
                      </button>
                    )}
                    <div>
                      <p className="font-semibold text-slate-800 dark:text-white flex items-center gap-2">{b.bank_name} {b.is_primary && <span className="text-[10px] bg-primary-100 text-primary-700 rounded px-1.5 py-0.5">PRIMARY</span>}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{b.account_holder}</p>
                      <p className="text-xs text-slate-500">A/C {b.account_number} · IFSC {b.ifsc}{b.upi_id ? ` · UPI ${b.upi_id}` : ""}</p>
                      {b.status === "rejected" && b.reason && <p className="text-xs text-red-600 mt-1">Rejected: {b.reason}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Pill s={b.status} />
                    <ReviewActions status={b.status} busy={busy} onApprove={() => reviewBank(b.id, "approve")} onReject={(r) => reviewBank(b.id, "reject", r)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-4 flex items-center gap-2 text-sm text-slate-500">
        <ShieldCheck className="h-4 w-4 text-primary-700" />
        Merchant can withdraw only after PAN + at least one bank account is approved.
      </div>
    </div>
  );
}
