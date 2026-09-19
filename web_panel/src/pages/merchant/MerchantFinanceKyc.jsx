import PremiumSelect from "@/components/ui/PremiumSelect";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CreditCard, Landmark, Plus, Trash2, ShieldCheck, UploadCloud, Eye, RefreshCw, X,
  CheckCircle2, Star, AlertTriangle, Building2, Clock, Lock, Loader2,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { StatusBadge, Surface, SecurityNote, EmptyState } from "@/components/merchant/finance/FinanceKit";

const PANEL = "/merchant/panel";
const EMPTY_BANK = { account_holder: "", bank_name: "", account_number: "", confirm_account: "", ifsc: "", account_type: "savings", upi_id: "", passbook_url: "" };
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const maskAcc = (a) => (a ? "•••• •••• " + String(a).slice(-4) : "");
const fdate = (s) => { try { return s ? new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null; } catch { return null; } };

export default function MerchantFinanceKyc() {
  const [data, setData] = useState(null);
  const [pan, setPan] = useState({ pan_number: "", pan_url: "" });
  const [showBank, setShowBank] = useState(false);
  const [bank, setBank] = useState(EMPTY_BANK);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [uploadPct, setUploadPct] = useState({}); // { field: percent } — live upload feedback

  const load = useCallback(() => { api.get(`${PANEL}/finance-kyc`).then((r) => setData(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const pickImage = (setter, field) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*,application/pdf";
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      const fd = new FormData(); fd.append("file", file); fd.append("doc_type", field);
      try {
        setUploadPct((p) => ({ ...p, [field]: 0 }));
        const r = await api.post("/merchant/registration/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => { if (e.total) setUploadPct((p) => ({ ...p, [field]: Math.round((e.loaded * 100) / e.total) })); },
        });
        setUploadPct((p) => ({ ...p, [field]: 100 }));
        setter((s) => ({ ...s, [field]: r.data.url }));
        toast.success("Document uploaded");
      } catch { toast.error("Upload failed — please try again"); }
      finally { setTimeout(() => setUploadPct((p) => { const n = { ...p }; delete n[field]; return n; }), 700); }
    };
    inp.click();
  };

  const submitPan = async () => {
    setBusy(true);
    try { await api.post(`${PANEL}/finance-kyc/pan`, { pan_number: pan.pan_number, pan_url: pan.pan_url }); toast.success("PAN submitted for verification"); setPan({ pan_number: "", pan_url: "" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const submitBank = async () => {
    if (bank.account_number !== bank.confirm_account) return toast.error("Account numbers do not match");
    if (!IFSC_RE.test(bank.ifsc)) return toast.error("Invalid IFSC code");
    setBusy(true);
    try { const { confirm_account, ...payload } = bank; await api.post(`${PANEL}/finance-kyc/banks`, payload); toast.success("Bank submitted for verification"); setShowBank(false); setBank(EMPTY_BANK); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const setPrimary = async (id) => { try { await api.post(`${PANEL}/finance-kyc/banks/${id}/primary`); toast.success("Primary account updated"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const delBank = async (id) => { if (!window.confirm("Remove this bank account?")) return; try { await api.delete(`${PANEL}/finance-kyc/banks/${id}`); toast.success("Bank removed"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };

  if (!data) return (
    <div className="max-w-3xl space-y-5"><Surface className="p-6"><div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Surface><Surface className="p-6"><div className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Surface></div>
  );

  const panStatus = data.pan?.status;
  const panOk = panStatus === "approved";
  const panPending = panStatus === "pending";
  const panRejected = panStatus === "rejected";
  const banks = data.banks || [];
  const bankOk = banks.some((b) => b.status === "approved");
  const doneCount = (panOk ? 1 : 0) + (bankOk ? 1 : 0);
  const canConfirm = bank.account_holder && bank.bank_name && bank.account_number && bank.confirm_account && bank.ifsc;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="max-w-3xl space-y-5" data-testid="merchant-finance-kyc">
      {/* progress header */}
      <div className={`relative overflow-hidden rounded-3xl p-6 text-white shadow-lg ${data.eligible ? "bg-gradient-to-br from-emerald-600 to-emerald-800" : "bg-[#0D47A1] bg-gradient-to-br from-[#0D47A1] to-[#0a2e6b]"}`}>
        <div className="absolute -right-14 -top-14 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-start gap-4">
          <span className="h-12 w-12 rounded-2xl bg-white/15 grid place-items-center shrink-0">{data.eligible ? <ShieldCheck className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-extrabold text-xl" data-testid="mfk-eligibility">{data.eligible ? "Withdrawal-eligible" : "Complete KYC to withdraw"}</h2>
            <p className="text-sm text-white/80 mt-0.5">{data.eligible ? "Your PAN and bank account are verified. You can withdraw earnings anytime." : `Pending: ${(data.blockers || []).join(", ")}`}</p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-white/20 overflow-hidden"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${(doneCount / 2) * 100}%` }} /></div>
              <span className="text-sm font-bold tabular-nums">{doneCount}/2 verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* PAN */}
      <Surface className="p-5" data-testid="mfk-pan-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><span className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 grid place-items-center"><CreditCard className="h-4 w-4" /></span> PAN Card</h3>
          <StatusBadge status={panStatus} testid="mfk-pan-status" />
        </div>
        {data.pan?.reason && panStatus === "rejected" && <p className="text-sm text-rose-600 mb-3 bg-rose-50 dark:bg-rose-950/30 rounded-lg px-3 py-2">Rejected: {data.pan.reason}</p>}
        {panOk ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3.5">
            <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div><p className="text-[11px] uppercase tracking-wide text-slate-400">PAN Number</p><p className="font-mono font-bold text-slate-900 dark:text-white">{data.pan.pan_number}</p></div>
            {fdate(data.pan.verified_at) && <div><p className="text-[11px] uppercase tracking-wide text-slate-400">Verified</p><p className="text-sm font-medium text-emerald-600">{fdate(data.pan.verified_at)}</p></div>}
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold w-full">Verified &amp; locked</p>
            {data.pan.pan_url && <Button size="sm" variant="outline" onClick={() => setPreview(data.pan.pan_url)} className="ml-auto" data-testid="mfk-pan-view"><Eye className="h-4 w-4 mr-1" /> View</Button>}
          </div>
        ) : panPending ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-4" data-testid="mfk-pan-pending">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Submitted — under review</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">PAN <span className="font-mono font-bold">{data.pan?.pan_number}</span> · locked until reviewed by admin.</p>
              </div>
              {data.pan?.pan_url && <button data-testid="mfk-pan-view" onClick={() => setPreview(data.pan.pan_url)} className="text-xs font-bold text-primary-700 inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />View</button>}
            </div>
            <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1"><Lock className="h-3 w-3" /> You can resubmit only if it is rejected.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">PAN Number</label>
              <Input data-testid="mfk-pan-number" placeholder="ABCDE1234F" inputMode="text" autoCapitalize="characters" autoComplete="off" value={pan.pan_number} onChange={(e) => setPan({ ...pan, pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} maxLength={10} className="mt-1 h-11 font-mono uppercase" />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">PAN Document</label>
              {uploadPct.pan_url != null ? (
                <div className="mt-1 rounded-xl border-2 border-dashed border-primary-300 p-3" data-testid="mfk-pan-uploading">
                  <p className="text-sm font-medium text-primary-700 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading… {uploadPct.pan_url}%</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-primary-600 rounded-full transition-all duration-200" style={{ width: `${uploadPct.pan_url}%` }} /></div>
                </div>
              ) : pan.pan_url ? (
                <div className="mt-1 flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-2">
                  <img src={pan.pan_url} alt="PAN" className="h-9 w-12 rounded object-cover" />
                  <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex-1">Uploaded</span>
                  <button onClick={() => setPreview(pan.pan_url)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-800" data-testid="mfk-pan-preview"><Eye className="h-4 w-4" /></button>
                  <button onClick={() => pickImage(setPan, "pan_url")} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-800" data-testid="mfk-pan-replace"><RefreshCw className="h-4 w-4" /></button>
                  <button onClick={() => setPan({ ...pan, pan_url: "" })} className="h-8 w-8 grid place-items-center rounded-lg text-rose-500 hover:bg-white dark:hover:bg-slate-800" data-testid="mfk-pan-delete"><Trash2 className="h-4 w-4" /></button>
                </div>
              ) : (
                <button onClick={() => pickImage(setPan, "pan_url")} data-testid="mfk-pan-upload"
                  className="mt-1 w-full h-11 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 text-sm font-medium text-slate-500 hover:border-primary-400 hover:text-primary-700 transition-colors">
                  <UploadCloud className="h-4 w-4" /> Upload PAN (image/PDF)
                </button>
              )}
            </div>
            <div className="sm:col-span-2">
              <Button data-testid="mfk-submit-pan" onClick={submitPan} disabled={busy || pan.pan_number.length !== 10 || !pan.pan_url || uploadPct.pan_url != null} className="h-11 bg-primary-700 hover:bg-primary-800">{panRejected ? "Resubmit PAN for verification" : "Submit PAN for verification"}</Button>
              <p className="mt-2 text-[11px] text-slate-400">You can upload only one PAN card. It locks once submitted, until reviewed.</p>
            </div>
          </div>
        )}
      </Surface>

      {/* Bank accounts */}
      <Surface className="p-5" data-testid="mfk-banks-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><span className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 grid place-items-center"><Landmark className="h-4 w-4" /></span> Bank Accounts</h3>
          <Button size="sm" variant="outline" data-testid="mfk-add-bank-btn" onClick={() => setShowBank((s) => !s)}><Plus className="h-4 w-4 mr-1" /> Add bank</Button>
        </div>

        {banks.length === 0 && !showBank ? (
          <EmptyState icon={Building2} title="No bank accounts yet" hint="Add a bank account to receive your withdrawals." action={<Button onClick={() => setShowBank(true)} className="h-10 bg-primary-700 hover:bg-primary-800"><Plus className="h-4 w-4 mr-1" /> Add bank account</Button>} testid="mfk-banks-empty" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {banks.map((b) => (
              <div key={b.id} data-testid={`mfk-bank-${b.id}`} className={`rounded-2xl border p-4 ${b.is_primary ? "border-primary-300 dark:border-primary-700 ring-1 ring-primary-100 dark:ring-primary-900/40" : "border-slate-200 dark:border-slate-800"}`}>
                <div className="flex items-start justify-between">
                  <span className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 grid place-items-center"><Landmark className="h-5 w-5" /></span>
                  <StatusBadge status={b.status} />
                </div>
                <p className="font-semibold text-slate-900 dark:text-white mt-3 flex items-center gap-2">{b.bank_name}{b.is_primary && <span className="inline-flex items-center gap-1 text-[9px] bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded px-1.5 py-0.5"><Star className="h-2.5 w-2.5" fill="currentColor" /> PRIMARY</span>}</p>
                <p className="text-xs text-slate-500 mt-0.5">{b.account_holder}</p>
                <p className="text-sm font-mono text-slate-700 dark:text-slate-300 mt-1">{maskAcc(b.account_number)}</p>
                <p className="text-[11px] text-slate-400">{b.ifsc}{b.upi_id ? ` · UPI ${b.upi_id}` : ""}</p>
                {b.status === "rejected" && b.reason && <p className="text-xs text-rose-600 mt-1">Rejected: {b.reason}</p>}
                <div className="flex gap-2 mt-3">
                  {b.status === "approved" && !b.is_primary && <Button size="sm" variant="outline" className="h-8 text-xs" data-testid={`mfk-primary-${b.id}`} onClick={() => setPrimary(b.id)}><Star className="h-3.5 w-3.5 mr-1" /> Set primary</Button>}
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50" data-testid={`mfk-remove-${b.id}`} onClick={() => delBank(b.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showBank && (
          <div className="grid sm:grid-cols-2 gap-3 border-t border-slate-100 dark:border-slate-800 pt-4 mt-4" data-testid="mfk-bank-form">
            <Input placeholder="Account holder name" value={bank.account_holder} onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} className="h-11" data-testid="mfk-bank-holder" />
            <Input placeholder="Bank name" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} className="h-11" data-testid="mfk-bank-name" />
            <Input placeholder="Account number" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "") })} className="h-11" data-testid="mfk-bank-acc" />
            <div>
              <Input placeholder="Confirm account number" value={bank.confirm_account} onChange={(e) => setBank({ ...bank, confirm_account: e.target.value.replace(/\D/g, "") })} className={`h-11 ${bank.confirm_account && bank.confirm_account !== bank.account_number ? "border-rose-400" : ""}`} data-testid="mfk-bank-acc2" />
              {bank.confirm_account && bank.confirm_account !== bank.account_number && <p className="text-[11px] text-rose-500 mt-1">Account numbers don’t match</p>}
            </div>
            <div>
              <Input placeholder="IFSC code" value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} className={`h-11 font-mono uppercase ${bank.ifsc && !IFSC_RE.test(bank.ifsc) ? "border-rose-400" : ""}`} data-testid="mfk-bank-ifsc" />
              {bank.ifsc && !IFSC_RE.test(bank.ifsc) && <p className="text-[11px] text-rose-500 mt-1">Invalid IFSC (e.g. HDFC0001234)</p>}
            </div>
            <PremiumSelect value={bank.account_type} onChange={(e) => setBank({ ...bank, account_type: e.target.value })} searchable={false} className="!h-11 rounded-md" data-testid="mfk-bank-type">
              <option value="savings">Savings</option><option value="current">Current</option>
            </PremiumSelect>
            <Button variant="outline" data-testid="mfk-passbook-upload" disabled={uploadPct.passbook_url != null} onClick={() => pickImage(setBank, "passbook_url")} className={`h-11 ${bank.passbook_url ? "border-emerald-300 text-emerald-700" : ""}`}>{uploadPct.passbook_url != null ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Uploading… {uploadPct.passbook_url}%</> : bank.passbook_url ? <><CheckCircle2 className="h-4 w-4 mr-1" /> Passbook uploaded</> : <><UploadCloud className="h-4 w-4 mr-1" /> Upload passbook / cheque</>}</Button>
            <div className="sm:col-span-2 flex gap-2">
              <Button variant="outline" onClick={() => { setShowBank(false); setBank(EMPTY_BANK); }} className="h-11">Cancel</Button>
              <Button data-testid="mfk-submit-bank" onClick={submitBank} disabled={busy || !canConfirm} className="h-11 flex-1 bg-primary-700 hover:bg-primary-800">Submit for verification</Button>
            </div>
          </div>
        )}
      </Surface>

      <SecurityNote />

      {preview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-6" data-testid="mfk-preview-modal" onClick={() => setPreview(null)}>
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" />
          <div className="relative max-w-lg w-full">
            <button onClick={() => setPreview(null)} className="absolute -top-10 right-0 h-9 w-9 rounded-lg bg-white/10 text-white grid place-items-center"><X className="h-5 w-5" /></button>
            <img src={preview} alt="document" className="w-full rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </motion.div>
  );
}
