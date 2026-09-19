import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ShieldCheck, CreditCard, Building2, CheckCircle2, XCircle, RefreshCcw,
  Loader2, Eye, X, AlertTriangle, Inbox,
} from "lucide-react";

const backendRoot = (typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL) || "";
const absUrl = (u) => (!u ? "" : /^(https?:|data:)/.test(u) ? u : `${backendRoot}${u.startsWith("/") ? "" : "/"}${u}`);
const dt = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/* Lightbox to view a PAN / passbook doc */
const DocLightbox = ({ url, label, onClose }) => {
  if (!url) return null;
  const isPdf = /\.pdf($|\?)|application\/pdf/i.test(url);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <CreditCard className="h-4 w-4 text-primary-600" /><p className="font-bold text-sm">{label}</p>
          <a href={absUrl(url)} target="_blank" rel="noreferrer" className="ml-auto text-xs font-bold text-primary-700 underline">Open in new tab</a>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-3 bg-slate-50 grid place-items-center max-h-[80vh] overflow-auto">
          {isPdf ? <iframe title={label} src={absUrl(url)} className="w-full h-[72vh] rounded-lg bg-white" />
            : <img src={absUrl(url)} alt={label} className="max-w-full max-h-[78vh] object-contain rounded-lg" />}
        </div>
      </div>
    </div>
  );
};

const Row = ({ id, checked, onCheck, icon: Icon, title, sub, extra, docUrl, docLabel, submitted, onView }) => (
  <div className={`flex items-start gap-3 p-3.5 rounded-xl border transition ${checked ? "border-primary-300 bg-primary-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}>
    <input type="checkbox" checked={!!checked} onChange={onCheck} className="mt-1 h-4 w-4 rounded accent-primary-600 cursor-pointer" data-testid={`chk-${id}`} />
    <span className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 grid place-items-center text-slate-500"><Icon className="h-4.5 w-4.5" /></span>
    <div className="min-w-0 flex-1">
      <p className="font-semibold text-slate-800 text-sm truncate">{title}</p>
      <p className="text-xs text-slate-500 truncate">{sub}</p>
      {extra && <p className="text-xs text-slate-400 mt-0.5">{extra}</p>}
      <p className="text-[11px] text-slate-400 mt-0.5">Submitted {dt(submitted)}</p>
    </div>
    {docUrl && <button onClick={() => onView({ url: docUrl, label: docLabel })} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:underline"><Eye className="h-3.5 w-3.5" />View</button>}
  </div>
);

export default function KycApprovals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selPan, setSelPan] = useState({});   // partner_id -> true
  const [selBank, setSelBank] = useState({}); // bank id -> true
  const [busy, setBusy] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);
  const [rejectModal, setRejectModal] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/partner/finance/pending-kyc")
      .then((r) => setData(r.data))
      .catch(() => toast.error("Failed to load pending KYC"))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const pans = data?.pans || [];
  const banks = data?.banks || [];
  const selPanIds = useMemo(() => Object.keys(selPan).filter((k) => selPan[k]), [selPan]);
  const selBankIds = useMemo(() => Object.keys(selBank).filter((k) => selBank[k]), [selBank]);
  const selectedCount = selPanIds.length + selBankIds.length;

  const allSelected = pans.length + banks.length > 0 &&
    selPanIds.length === pans.length && selBankIds.length === banks.length;
  const toggleAll = () => {
    if (allSelected) { setSelPan({}); setSelBank({}); }
    else {
      setSelPan(Object.fromEntries(pans.map((p) => [p.partner_id, true])));
      setSelBank(Object.fromEntries(banks.map((b) => [b.id, true])));
    }
  };

  const runBulk = async (action, rsn = "") => {
    if (selectedCount === 0) return toast.error("Select at least one request");
    setBusy(true);
    try {
      const r = await api.post("/admin/partner/finance/bulk-review", {
        pan_partner_ids: selPanIds, bank_ids: selBankIds, action, reason: rsn,
      });
      const d = r.data;
      toast.success(`${action === "approve" ? "Approved" : "Rejected"} ${d.pans} PAN + ${d.banks} bank request(s)`);
      if ((d.errors || []).length) toast.error(`${d.errors.length} request(s) failed`);
      setSelPan({}); setSelBank({}); setRejectModal(false); setReason("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Bulk action failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="kyc-approvals">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="h-11 w-11 rounded-2xl bg-primary-600 text-white grid place-items-center"><ShieldCheck className="h-6 w-6" /></div>
        <div className="min-w-0">
          <h2 className="text-xl font-heading font-bold text-slate-900">KYC Approvals</h2>
          <p className="text-sm text-slate-500">Review &amp; verify pending PAN and bank requests in bulk.</p>
        </div>
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100">
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Action bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 bg-white/90 backdrop-blur rounded-2xl border border-slate-200 px-4 py-3 shadow-sm">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded accent-primary-600" data-testid="chk-all" />
          Select all
        </label>
        <span className="text-sm text-slate-500">{selectedCount} selected</span>
        <div className="ml-auto flex items-center gap-2">
          <button disabled={busy || selectedCount === 0} onClick={() => runBulk("approve")}
            data-testid="bulk-approve"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 px-4 py-2 rounded-xl">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve selected
          </button>
          <button disabled={busy || selectedCount === 0} onClick={() => setRejectModal(true)}
            data-testid="bulk-reject"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 disabled:opacity-40 px-4 py-2 rounded-xl">
            <XCircle className="h-4 w-4" /> Reject selected
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : pans.length + banks.length === 0 ? (
        <div className="grid place-items-center py-20 text-center">
          <Inbox className="h-12 w-12 text-slate-300 mb-3" />
          <p className="font-semibold text-slate-700">No pending KYC requests</p>
          <p className="text-sm text-slate-400">All PAN &amp; bank submissions are reviewed.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          <section>
            <div className="flex items-center gap-2 mb-2.5"><CreditCard className="h-4 w-4 text-primary-600" /><h3 className="font-bold text-slate-800">Pending PAN <span className="text-slate-400 font-medium">({pans.length})</span></h3></div>
            <div className="space-y-2.5">
              {pans.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No pending PAN.</p> :
                pans.map((p) => (
                  <Row key={p.partner_id} id={`pan-${p.partner_id}`} checked={selPan[p.partner_id]}
                    onCheck={() => setSelPan((s) => ({ ...s, [p.partner_id]: !s[p.partner_id] }))}
                    icon={CreditCard} title={p.partner_name || "Partner"}
                    sub={`${p.partner_phone || ""} · PAN ${p.pan_number || "—"}`}
                    docUrl={p.pan_url || p.pan_image || p.document_url} docLabel={`PAN — ${p.partner_name}`}
                    submitted={p.submitted_at} onView={setViewDoc} />
                ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2.5"><Building2 className="h-4 w-4 text-primary-600" /><h3 className="font-bold text-slate-800">Pending Bank Accounts <span className="text-slate-400 font-medium">({banks.length})</span></h3></div>
            <div className="space-y-2.5">
              {banks.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No pending banks.</p> :
                banks.map((b) => (
                  <Row key={b.id} id={`bank-${b.id}`} checked={selBank[b.id]}
                    onCheck={() => setSelBank((s) => ({ ...s, [b.id]: !s[b.id] }))}
                    icon={Building2} title={`${b.partner_name || "Partner"} · ${b.bank_name || "Bank"}`}
                    sub={`${b.partner_phone || ""} · A/C ${b.account_number || "—"} · ${b.ifsc || ""}`}
                    extra={b.account_holder ? `Holder: ${b.account_holder}${b.upi_id ? ` · UPI ${b.upi_id}` : ""}` : null}
                    docUrl={b.passbook_url || b.cancelled_cheque || b.cheque_url} docLabel={`${b.bank_name || "Bank"} passbook`}
                    submitted={b.submitted_at} onView={setViewDoc} />
                ))}
            </div>
          </section>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-[85] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={() => setRejectModal(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3"><AlertTriangle className="h-5 w-5 text-rose-500" /><h3 className="font-bold text-slate-900">Reject {selectedCount} request(s)</h3></div>
            <p className="text-sm text-slate-500 mb-3">This reason is shared with the partner in their notification. It is required.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} data-testid="reject-reason"
              placeholder="e.g. Document blurred / details do not match" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-300 outline-none" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setRejectModal(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button disabled={busy || !reason.trim()} onClick={() => runBulk("reject", reason.trim())}
                data-testid="confirm-reject"
                className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40">
                {busy ? "Rejecting…" : "Reject selected"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DocLightbox url={viewDoc?.url} label={viewDoc?.label} onClose={() => setViewDoc(null)} />
    </div>
  );
}
