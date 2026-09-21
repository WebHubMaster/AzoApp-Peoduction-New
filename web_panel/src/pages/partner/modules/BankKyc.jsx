import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ShieldCheck, CreditCard, Building2, Plus, Trash2, Star, CheckCircle2,
  AlertTriangle, Upload, Lock, BadgeCheck, Clock, Eye, X, Loader2,
} from "lucide-react";
import { Surface, Section, StatusBadge, EmptyState, Sheet, cx } from "@/components/partner/ui/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { panInput, ifscInput } from "@/lib/validation";

const backendRoot = (typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL) || "";
const absUrl = (u) => (!u ? "" : /^(https?:|data:)/.test(u) ? u : `${backendRoot}${u.startsWith("/") ? "" : "/"}${u}`);

/* Upload with live progress. Returns the uploaded URL. */
async function uploadWithProgress(file, docType, onProgress) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("doc_type", docType);
  const r = await api.post("/partner/registration/upload", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (e) => {
      if (e.total) onProgress(Math.round((e.loaded * 100) / e.total));
    },
  });
  return r.data.url;
}

/* A small tile that uploads an image, shows a progress bar and a preview thumbnail. */
const UploadTile = ({ label, value, docType, onUploaded, testId, disabled }) => {
  const [pct, setPct] = useState(null);
  const [preview, setPreview] = useState(null);
  const pick = () => {
    if (disabled) return;
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*,application/pdf";
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        setPct(0);
        const url = await uploadWithProgress(f, docType, setPct);
        setPct(100);
        setPreview(URL.createObjectURL(f));
        onUploaded(url);
        toast.success("Uploaded");
        setTimeout(() => setPct(null), 600);
      } catch {
        setPct(null);
        toast.error("Upload failed — please try again");
      }
    };
    inp.click();
  };
  const has = !!value;
  const uploading = pct !== null && pct < 100;
  return (
    <button type="button" data-testid={testId} onClick={pick} disabled={disabled}
      className={cx("relative w-full rounded-2xl border-2 border-dashed px-4 py-4 text-left transition",
        disabled ? "opacity-60 cursor-not-allowed border-slate-200 dark:border-slate-700" :
          has ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-slate-300 dark:border-slate-600 hover:border-primary-400")}>
      <div className="flex items-center gap-3">
        <span className={cx("h-11 w-11 shrink-0 rounded-xl grid place-items-center",
          has ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" : "bg-slate-100 text-slate-500 dark:bg-slate-800")}>
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : has ? <CheckCircle2 className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {uploading ? `Uploading… ${pct}%` : has ? "Uploaded — tap to replace" : "Tap to upload (image or PDF)"}
          </p>
          {pct !== null && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full bg-primary-600 rounded-full transition-all duration-200" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        {(preview || value) && !uploading && (
          <img src={preview || absUrl(value)} alt="" className="h-11 w-11 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
        )}
      </div>
    </button>
  );
};

/* Lightbox for viewing an uploaded doc full-size (zoom + open in new tab). */
const DocLightbox = ({ url, label, onClose }) => {
  if (!url) return null;
  const isPdf = /\.pdf($|\?)|application\/pdf/i.test(url);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="max-w-2xl w-full max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <CreditCard className="h-4 w-4 text-primary-600" /><p className="font-bold text-sm">{label}</p>
          <a href={absUrl(url)} target="_blank" rel="noreferrer" className="ml-auto text-xs font-bold text-primary-700 underline">Open in new tab</a>
          <button onClick={onClose} className="h-7 w-7 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-3 bg-slate-50 dark:bg-slate-950 grid place-items-center max-h-[80vh] overflow-auto">
          {isPdf ? <iframe title={label} src={absUrl(url)} className="w-full h-[72vh] rounded-lg bg-white" />
            : <img src={absUrl(url)} alt={label} className="max-w-full max-h-[78vh] object-contain rounded-lg" />}
        </div>
      </div>
    </div>
  );
};

export default function BankKyc() {
  const [data, setData] = useState(null);
  const [pan, setPan] = useState({ pan_number: "", pan_url: "" });
  const [showBank, setShowBank] = useState(false);
  const [bank, setBank] = useState({ account_holder: "", bank_name: "", account_number: "", confirm_number: "", ifsc: "", upi_id: "", passbook_url: "" });
  const [busy, setBusy] = useState(false);
  const [viewDoc, setViewDoc] = useState(null);

  const load = useCallback(() => { api.get("/partner/finance-kyc").then((r) => setData(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const submitPan = async () => {
    setBusy(true);
    try { await api.post("/partner/finance-kyc/pan", pan); toast.success("PAN submitted for verification"); setPan({ pan_number: "", pan_url: "" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to submit PAN"); } finally { setBusy(false); }
  };
  const submitBank = async () => {
    if (bank.account_number !== bank.confirm_number) return toast.error("Account numbers do not match");
    setBusy(true);
    try {
      const { confirm_number, ...payload } = bank;
      await api.post("/partner/finance-kyc/banks", payload);
      toast.success("Bank submitted for verification"); setShowBank(false);
      setBank({ account_holder: "", bank_name: "", account_number: "", confirm_number: "", ifsc: "", upi_id: "", passbook_url: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const setPrimary = async (id) => { try { await api.post(`/partner/finance-kyc/banks/${id}/primary`); toast.success("Primary account updated"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const delBank = async (id) => { if (!window.confirm("Remove this bank account?")) return; try { await api.delete(`/partner/finance-kyc/banks/${id}`); toast.success("Bank account removed"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };

  if (!data) {
    return <div className="max-w-3xl space-y-4"><Surface className="p-6"><div className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Surface></div>;
  }

  const panStatus = data.pan?.status;
  const panDone = panStatus === "approved";
  const panPending = panStatus === "pending";
  const panRejected = panStatus === "rejected";
  const bankDone = (data.banks || []).some((b) => b.status === "approved");
  const steps = [
    { key: "pan", label: "PAN Card", done: panDone },
    { key: "bank", label: "Bank Account", done: bankDone },
  ];
  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="w-full space-y-5" data-testid="finance-kyc">
      {/* KYC status hero */}
      <div className={cx("relative overflow-hidden rounded-3xl p-6 text-white shadow-lg",
        data.eligible ? "bg-gradient-to-br from-emerald-600 to-emerald-500" : "bg-gradient-to-br from-primary-800 to-primary-600")}>
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] bg-[size:26px_26px]" />
        <div className="relative flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
            {data.eligible ? <BadgeCheck className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-heading font-bold text-lg">{data.eligible ? "Verified — withdrawal enabled" : "Complete KYC to withdraw"}</h3>
              <StatusBadge status={data.eligible ? "verified" : "pending"} className="bg-white/20 text-white" dot={false} />
            </div>
            {!data.eligible && (data.blockers || []).length > 0 && (
              <p className="text-sm text-white/85 mt-1">Pending: {data.blockers.join(", ")}</p>
            )}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {steps.map((s) => (
                <span key={s.key} className={cx("inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 whitespace-nowrap", s.done ? "bg-white/25" : "bg-white/10 text-white/70")}>
                  {s.done ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />} {s.label}
                </span>
              ))}
            </div>
          </div>
          {/* Circular KYC progress ring */}
          <div className="relative shrink-0 grid place-items-center" data-testid="kyc-ring">
            <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90">
              <circle cx="46" cy="46" r="40" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" />
              <circle cx="46" cy="46" r="40" fill="none" stroke="white" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * (1 - pct / 100)}
                style={{ transition: "stroke-dashoffset 700ms ease" }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-xl font-extrabold leading-none">{pct}%</p>
                <p className="text-[9px] uppercase tracking-wider text-white/75 mt-0.5">KYC done</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-5 items-start">
      {/* PAN */}
      <Section title="PAN Card" icon={CreditCard} className="lg:col-span-2" right={<StatusBadge status={panStatus || "incomplete"} />}>
        {panRejected && data.pan?.reason && (
          <div className="flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-900/20 rounded-xl px-3 py-2.5 mb-4">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> <span><b>Rejected:</b> {data.pan.reason}</span>
          </div>
        )}
        {panDone ? (
          <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3.5">
            <Lock className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1"><p className="text-sm text-slate-700 dark:text-slate-200">PAN <span className="font-mono font-bold">{data.pan.pan_number}</span></p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">Verified &amp; locked</p></div>
            {data.pan?.pan_url && <button data-testid="pan-view" onClick={() => setViewDoc({ url: data.pan.pan_url, label: "PAN Card" })} className="text-xs font-bold text-primary-700 inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />View</button>}
          </div>
        ) : panPending ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 px-4 py-4" data-testid="pan-pending">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Submitted — under review</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">PAN <span className="font-mono font-bold">{data.pan?.pan_number}</span> · locked until reviewed by admin.</p>
              </div>
              {data.pan?.pan_url && <button data-testid="pan-view" onClick={() => setViewDoc({ url: data.pan.pan_url, label: "PAN Card" })} className="text-xs font-bold text-primary-700 inline-flex items-center gap-1"><Eye className="h-3.5 w-3.5" />View</button>}
            </div>
            <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1"><Lock className="h-3 w-3" /> You can resubmit only if it is rejected.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Input data-testid="pan-number" placeholder="PAN number (ABCDE1234F)" inputMode="text" autoCapitalize="characters" autoComplete="off" value={pan.pan_number} onChange={(e) => setPan({ ...pan, pan_number: panInput(e.target.value) })} maxLength={10} className="h-11 sm:col-span-2 uppercase" />
            <div className="sm:col-span-2">
              <UploadTile label="PAN card image" value={pan.pan_url} docType="pan_url" testId="pan-upload" onUploaded={(url) => setPan((s) => ({ ...s, pan_url: url }))} />
            </div>
            <div className="sm:col-span-2">
              <Button data-testid="submit-pan" onClick={submitPan} disabled={busy || !pan.pan_number || !pan.pan_url} className="w-full bg-primary-700 hover:bg-primary-800 h-11 px-6">
                {panRejected ? "Resubmit PAN" : "Submit PAN"}
              </Button>
              <p className="mt-2 text-[11px] text-slate-400">You can upload only one PAN card. It locks once submitted, until reviewed.</p>
            </div>
          </div>
        )}
      </Section>

      {/* Bank accounts */}
      <Section title="Bank Accounts" icon={Building2} className="lg:col-span-3"
        right={<Button size="sm" variant="outline" data-testid="add-bank-btn" onClick={() => setShowBank(true)}><Plus className="h-4 w-4 mr-1" /> Add bank</Button>}
        bodyClass="p-0">
        {(data.banks || []).length === 0 ? (
          <EmptyState icon={Building2} title="No bank accounts yet" desc="Add a verified bank account or UPI to receive your withdrawals. Each account is reviewed before you can withdraw to it."
            action={<Button size="sm" onClick={() => setShowBank(true)} className="bg-primary-700 hover:bg-primary-800"><Plus className="h-4 w-4 mr-1" /> Add bank account</Button>} />
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(data.banks || []).map((b) => (
              <div key={b.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0"><Building2 className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 flex-wrap">{b.bank_name || "Bank"}
                        {b.is_primary && <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 rounded px-1.5 py-0.5"><Star className="h-2.5 w-2.5 fill-current" /> PRIMARY</span>}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{b.account_holder} · A/C {b.account_number} · {b.ifsc}{b.upi_id ? ` · UPI ${b.upi_id}` : ""}</p>
                      {b.status === "rejected" && b.reason && <p className="text-xs text-rose-600 dark:text-rose-400 mt-1">Rejected: {b.reason}</p>}
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>
                <div className="flex flex-wrap gap-2 mt-3 pl-13">
                  {b.passbook_url && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setViewDoc({ url: b.passbook_url, label: `${b.bank_name || "Bank"} passbook` })}><Eye className="h-3.5 w-3.5 mr-1" /> Passbook</Button>}
                  {b.status === "approved" && !b.is_primary && <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPrimary(b.id)}><Star className="h-3.5 w-3.5 mr-1" /> Set primary</Button>}
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" onClick={() => delBank(b.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
      </div>

      {/* Add bank sheet */}
      <Sheet open={showBank} onClose={() => setShowBank(false)} title="Add Bank Account"
        footer={<Button data-testid="submit-bank" onClick={submitBank} disabled={busy || !bank.account_holder || !bank.account_number || !bank.ifsc || !bank.passbook_url} className="w-full h-12 rounded-2xl bg-primary-700 hover:bg-primary-800 font-bold">{busy ? "Submitting…" : "Submit for verification"}</Button>}>
        <div className="space-y-3">
          <Field label="Account holder name"><Input value={bank.account_holder} onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} className="h-11" /></Field>
          <Field label="Bank name"><Input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} className="h-11" /></Field>
          <Field label="Account number"><Input value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value.replace(/\D/g, "") })} className="h-11" /></Field>
          <Field label="Confirm account number">
            <Input value={bank.confirm_number} onChange={(e) => setBank({ ...bank, confirm_number: e.target.value.replace(/\D/g, "") })} className="h-11" />
            {bank.confirm_number && bank.account_number !== bank.confirm_number && <p className="text-[11px] text-rose-500 mt-1">Account numbers do not match</p>}
          </Field>
          <Field label="IFSC code"><Input value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: ifscInput(e.target.value) })} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} placeholder="SBIN0001234" className="h-11 uppercase" /></Field>
          <Field label="UPI ID (optional)"><Input value={bank.upi_id} onChange={(e) => setBank({ ...bank, upi_id: e.target.value })} className="h-11" placeholder="yourname@upi" /></Field>
          <UploadTile label="Passbook / cancelled cheque" value={bank.passbook_url} docType="passbook_url" testId="passbook-upload" onUploaded={(url) => setBank((s) => ({ ...s, passbook_url: url }))} />
        </div>
      </Sheet>

      <DocLightbox url={viewDoc?.url} label={viewDoc?.label} onClose={() => setViewDoc(null)} />
    </div>
  );
}

const Field = ({ label, children }) => (
  <div>
    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label>
    <div className="mt-1.5">{children}</div>
  </div>
);
