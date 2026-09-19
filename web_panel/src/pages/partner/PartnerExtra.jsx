import { useEffect, useState, useCallback } from "react";
import api, { fmt, fmtC, compact } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Briefcase, Navigation, TrendingUp, Wallet, Star, IndianRupee, CheckCircle2,
  ShieldCheck, CreditCard, Building2, AlertTriangle, Trash2, Plus, ChevronRight } from "lucide-react";

const RANGES = [
  { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" }, { key: "365d", label: "1 year" }, { key: "all", label: "All" },
];

// ---------------------------------------------------------------- Dashboard (Point 11)
export function PartnerHome({ onNavigate }) {
  const [range, setRange] = useState("30d");
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/bookings/partner/dashboard?range=${range}`).then((r) => setD(r.data)).catch(() => {}); }, [range]);
  if (!d) return <div className="p-10 text-center text-slate-400 dark:text-slate-500">Loading analytics…</div>;
  const k = d.kpis;
  const maxAmt = Math.max(1, ...d.earnings_chart.map((x) => x.amount));
  const rangeLabel = (RANGES.find((r) => r.key === range) || {}).label || "";

  const mini = [
    { label: "Completed", value: compact(k.jobs_completed), icon: CheckCircle2, c: "text-emerald-500" },
    { label: "Active", value: compact(k.active_jobs), icon: Navigation, c: "text-sky-500" },
    { label: "Requests", value: compact(k.open_requests), icon: Briefcase, c: "text-amber-500" },
    { label: "Lifetime", value: compact(k.lifetime_jobs), icon: TrendingUp, c: "text-violet-500" },
  ];

  return (
    <div className="space-y-6" data-testid="partner-home">
      {/* Earnings-first premium hero */}
      <section data-testid="ph-hero" className="relative overflow-hidden rounded-[26px] bg-slate-900 text-white p-5 sm:p-7 shadow-[0_24px_50px_-24px_rgba(15,23,42,0.8)]">
        <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_100%_0%,rgba(16,185,129,0.5),transparent_55%),radial-gradient(85%_70%_at_0%_100%,rgba(29,78,216,0.55),transparent_60%)]" />
        <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] bg-[size:28px_28px]" />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/60 inline-flex items-center gap-1.5"><IndianRupee className="h-3.5 w-3.5" /> Earnings · {rangeLabel}</p>
            {k.rating ? <span className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur px-2.5 py-1 text-[12px] font-semibold ring-1 ring-white/15"><Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> {(k.rating || 0).toFixed(1)}</span> : null}
          </div>
          <p className="font-heading font-black text-[38px] sm:text-5xl leading-none tracking-tight mt-2 truncate" title={fmt(k.earnings)} data-testid="ph-earnings">{fmtC(k.earnings)}</p>
          <div className="mt-4 flex gap-1 bg-white/10 backdrop-blur rounded-xl p-1 overflow-x-auto no-scrollbar" data-testid="ph-range">
            {RANGES.map((r) => (
              <button key={r.key} data-testid={`range-${r.key}`} onClick={() => setRange(r.key)}
                className={`flex-1 min-w-[56px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${range === r.key ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"}`}>{r.label}</button>
            ))}
          </div>
          <div className="mt-4 flex items-stretch gap-3">
            <button type="button" data-testid="ph-wallet" onClick={() => onNavigate?.("wallet")} className="flex-1 rounded-2xl bg-white/10 backdrop-blur border border-white/10 p-3.5 text-left active:scale-[0.97] transition-transform">
              <p className="text-[10px] uppercase tracking-widest text-white/55">Wallet balance</p>
              <p className="font-heading font-black text-[20px] mt-0.5 truncate" title={fmt(k.wallet_balance)}>{fmtC(k.wallet_balance)}</p>
            </button>
            <button type="button" data-testid="ph-withdraw" onClick={() => onNavigate?.("wallet")} className="px-5 rounded-2xl bg-emerald-500 text-white text-[13px] font-bold inline-flex flex-col items-center justify-center gap-1 active:scale-[0.97] transition-transform shadow-lg shadow-emerald-500/30">
              <Wallet className="h-5 w-5" /> Withdraw
            </button>
          </div>
        </div>
      </section>

      {/* Mini stat pills */}
      <div className="grid grid-cols-4 gap-2.5 sm:gap-3" data-testid="ph-mini">
        {mini.map((m) => (
          <div key={m.label} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-3 text-center">
            <m.icon className={`h-4 w-4 mx-auto ${m.c}`} strokeWidth={2} />
            <p className="font-heading font-extrabold text-[17px] text-slate-900 dark:text-white mt-1.5 tabular-nums leading-none">{m.value}</p>
            <p className="text-[10px] text-slate-400 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Trend + recent jobs — advanced two-column on desktop */}
      <div className="grid xl:grid-cols-3 gap-5">
      {/* Earnings trend */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-5 xl:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-slate-800 dark:text-white">Earnings trend</h3>
          {k.cancelled > 0 && <span className="text-[11px] text-rose-500 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {k.cancelled} cancelled</span>}
        </div>
        {d.earnings_chart.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No earnings in this period yet.</p>
        ) : (
          <div className="flex items-end gap-1.5 h-40 xl:h-52">
            {d.earnings_chart.map((x) => (
              <div key={x.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-lg transition-all group-hover:opacity-80"
                  style={{ height: `${(x.amount / maxAmt) * 100}%`, minHeight: "4px" }} title={fmt(x.amount)} />
                <span className="text-[9px] text-slate-400">{x.date.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent jobs */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 overflow-hidden xl:col-span-1">
        <div className="flex items-center justify-between px-5 py-4">
          <h3 className="font-heading font-bold text-slate-800 dark:text-white">Recent jobs</h3>
          <button type="button" onClick={() => onNavigate?.("jobs")} className="text-[13px] font-semibold text-primary-700 dark:text-primary-300 inline-flex items-center active:opacity-60">View requests <ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {d.recent.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">No jobs yet.</p>}
          {d.recent.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0"><p className="font-semibold text-[15px] text-slate-800 dark:text-slate-100 truncate">{b.service_name}</p><p className="text-xs text-slate-400 mt-0.5">#{b.code}</p></div>
              <span className="shrink-0 text-[11px] font-semibold capitalize px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300">{(b.status || "").replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Finance KYC (Point 7)
export function FinanceKycSection() {
  const [data, setData] = useState(null);
  const [pan, setPan] = useState({ pan_number: "", pan_url: "" });
  const [showBank, setShowBank] = useState(false);
  const [bank, setBank] = useState({ account_holder: "", bank_name: "", account_number: "", ifsc: "", upi_id: "", passbook_url: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { api.get("/partner/finance-kyc").then((r) => setData(r.data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="p-10 text-center text-slate-400">Loading…</div>;

  const panStatus = data.pan?.status;
  const submitPan = async () => {
    setBusy(true);
    try { await api.post("/partner/finance-kyc/pan", pan); toast.success("PAN submitted for verification"); setPan({ pan_number: "", pan_url: "" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const submitBank = async () => {
    setBusy(true);
    try { await api.post("/partner/finance-kyc/banks", bank); toast.success("Bank submitted for verification"); setShowBank(false); setBank({ account_holder: "", bank_name: "", account_number: "", ifsc: "", upi_id: "", passbook_url: "" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const setPrimary = async (id) => { try { await api.post(`/partner/finance-kyc/banks/${id}/primary`); toast.success("Primary account updated"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const delBank = async (id) => { if (!window.confirm("Remove this bank account?")) return; await api.delete(`/partner/finance-kyc/banks/${id}`); load(); };

  // fake upload helper — stores a placeholder URL (media upload wired elsewhere)
  const pickImage = (setter, field) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const fd = new FormData(); fd.append("file", f); fd.append("doc_type", field);
      try { const r = await api.post("/partner/registration/upload", fd, { headers: { "Content-Type": "multipart/form-data" } }); setter((s) => ({ ...s, [field]: r.data.url })); toast.success("Image uploaded"); }
      catch { toast.error("Upload failed"); }
    };
    inp.click();
  };

  const Pill = ({ s }) => <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${s === "approved" ? "bg-emerald-100 text-emerald-700" : s === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{s || "not submitted"}</span>;

  return (
    <div className="max-w-3xl space-y-6" data-testid="finance-kyc">
      <div className={`rounded-2xl p-5 flex items-start gap-3 ${data.eligible ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
        <ShieldCheck className={`h-8 w-8 shrink-0 ${data.eligible ? "text-emerald-600" : "text-amber-600"}`} />
        <div>
          <h3 className="font-heading font-bold text-slate-800">{data.eligible ? "You are withdrawal-eligible ✓" : "Complete KYC to withdraw"}</h3>
          {!data.eligible && <p className="text-sm text-amber-700 mt-0.5">Pending: {data.blockers.join(", ")}</p>}
        </div>
      </div>

      {/* PAN */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary-700" /> PAN Card</h3>
          <Pill s={panStatus} />
        </div>
        {data.pan?.reason && panStatus === "rejected" && <p className="text-sm text-red-600 mb-3 bg-red-50 rounded-lg px-3 py-2">Rejected: {data.pan.reason}</p>}
        {panStatus === "approved" ? (
          <p className="text-sm text-slate-600">PAN <span className="font-mono font-semibold">{data.pan.pan_number}</span> verified & locked.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <Input data-testid="pan-number" placeholder="PAN number (ABCDE1234F)" inputMode="text" autoCapitalize="characters" autoComplete="off" value={pan.pan_number} onChange={(e) => setPan({ ...pan, pan_number: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} maxLength={10} className="uppercase" />
            <Button variant="outline" onClick={() => pickImage(setPan, "pan_url")} className={pan.pan_url ? "border-emerald-300 text-emerald-700" : ""}>{pan.pan_url ? "PAN image ✓" : "Upload PAN image"}</Button>
            <div className="sm:col-span-2"><Button data-testid="submit-pan" onClick={submitPan} disabled={busy || !pan.pan_number || !pan.pan_url} className="bg-primary-700 hover:bg-primary-800">Submit PAN</Button></div>
          </div>
        )}
      </div>

      {/* Bank accounts */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-bold text-slate-800 flex items-center gap-2"><Building2 className="h-5 w-5 text-primary-700" /> Bank Accounts</h3>
          <Button size="sm" variant="outline" data-testid="add-bank-btn" onClick={() => setShowBank((s) => !s)}><Plus className="h-4 w-4 mr-1" /> Add bank</Button>
        </div>

        <div className="space-y-2 mb-3">
          {(data.banks || []).length === 0 && <p className="text-sm text-slate-400">No bank accounts added yet.</p>}
          {(data.banks || []).map((b) => (
            <div key={b.id} className="border border-slate-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800 flex items-center gap-2">{b.bank_name} {b.is_primary && <span className="text-[10px] bg-primary-100 text-primary-700 rounded px-1.5 py-0.5">PRIMARY</span>}</p>
                  <p className="text-xs text-slate-500">{b.account_holder} · A/C {b.account_number} · {b.ifsc}{b.upi_id ? ` · UPI ${b.upi_id}` : ""}</p>
                </div>
                <Pill s={b.status} />
              </div>
              {b.status === "rejected" && b.reason && <p className="text-xs text-red-600 mt-1">Rejected: {b.reason}</p>}
              <div className="flex gap-2 mt-2">
                {b.status === "approved" && !b.is_primary && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPrimary(b.id)}>Set primary</Button>}
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500" onClick={() => delBank(b.id)}><Trash2 className="h-3.5 w-3.5 mr-1" /> Remove</Button>
              </div>
            </div>
          ))}
        </div>

        {showBank && (
          <div className="grid sm:grid-cols-2 gap-3 border-t border-slate-100 pt-4" data-testid="bank-form">
            <Input placeholder="Account holder name" value={bank.account_holder} onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} />
            <Input placeholder="Bank name" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
            <Input placeholder="Account number" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} />
            <Input placeholder="IFSC code" value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} className="uppercase" />
            <Input placeholder="UPI ID (optional)" value={bank.upi_id} onChange={(e) => setBank({ ...bank, upi_id: e.target.value })} />
            <Button variant="outline" onClick={() => pickImage(setBank, "passbook_url")} className={bank.passbook_url ? "border-emerald-300 text-emerald-700" : ""}>{bank.passbook_url ? "Passbook ✓" : "Upload passbook / cheque"}</Button>
            <div className="sm:col-span-2"><Button data-testid="submit-bank" onClick={submitBank} disabled={busy} className="bg-primary-700 hover:bg-primary-800">Submit for verification</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
