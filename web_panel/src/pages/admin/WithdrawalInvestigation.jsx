import { useEffect, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowLeft, CheckCircle2, XCircle, ShieldAlert, Wallet, User, Banknote,
  History, ReceiptText, ScrollText, Clock, RotateCcw, Loader2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

const dt = (s) => (s ? String(s).slice(0, 16).replace("T", " ") : "—");

const riskTone = (lvl) => ({
  LOW: "text-emerald-600 bg-emerald-50 border-emerald-200",
  MEDIUM: "text-amber-600 bg-amber-50 border-amber-200",
  HIGH: "text-orange-600 bg-orange-50 border-orange-200",
  CRITICAL: "text-red-600 bg-red-50 border-red-200",
}[lvl] || "text-slate-600 bg-slate-50 border-slate-200");

const sevDot = (s) => ({ high: "bg-red-500", medium: "bg-amber-500", low: "bg-emerald-500" }[s] || "bg-slate-400");

const Panel = ({ title, icon: Icon, children, action, testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="h-4.5 w-4.5 text-primary-600" /> : null}
        <h3 className="font-heading font-bold text-slate-900 dark:text-white text-[15px]">{title}</h3>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const KV = ({ k, v, cls = "" }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <span className="text-[12px] text-slate-500">{k}</span>
    <span className={`text-[13px] font-medium text-slate-800 dark:text-slate-100 ${cls}`}>{v ?? "—"}</span>
  </div>
);

const Stat = ({ label, value, tone = "" }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
    <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
    <p className={`text-base font-bold ${tone || "text-slate-800 dark:text-white"}`}>{value}</p>
  </div>
);

function RiskGauge({ score, level }) {
  const tone = riskTone(level);
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-4 ${tone}`} data-testid="risk-gauge">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${score} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold">{score}</span>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider opacity-70">Risk Score</p>
        <p className="text-lg font-extrabold leading-tight">{score} / 100</p>
        <p className="text-xs font-semibold">{level} RISK</p>
      </div>
    </div>
  );
}

export default function WithdrawalInvestigation({ wid, onBack, onDone }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmPay, setConfirmPay] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setErr("");
    api.get(`/admin/partner/withdrawals/${wid}/investigation`)
      .then((r) => setD(r.data)).catch((e) => setErr(e?.response?.data?.detail || "Unable to load withdrawal data."));
  }, [wid]);
  useEffect(() => { load(); }, [load]);

  const doAction = async (action, rsn = "") => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "retry") await api.post(`/admin/partner/withdrawals/${wid}/retry`);
      else await api.post(`/admin/partner/withdrawals/${wid}/action`, { action, reason: rsn });
      toast.success(action === "approve" ? "Approved — payout initiated" : action === "retry" ? "Retry triggered" : "Rejected");
      setConfirmPay(false); setRejectOpen(false); setReason("");
      onDone?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
    setBusy(false);
  };

  if (err) {
    return (
      <div className="space-y-4" data-testid="wd-investigation-error">
        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Back to withdrawals</button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium">{err}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
        </div>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="space-y-4" data-testid="wd-investigation-loading">
        <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
        <div className="h-28 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="grid lg:grid-cols-3 gap-5">{[0, 1, 2].map((i) => <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />)}</div>
      </div>
    );
  }

  const { withdrawal: w, owner, wallet, wallet_ledger: ledger, destination: dest, risk, checklist, history, history_summary: hs, transactions, audit, timeline } = d;
  const statusBadge = w.status === "completed" ? "bg-emerald-100 text-emerald-700"
    : w.status === "failed" ? "bg-red-100 text-red-700"
      : w.status === "rejected" ? "bg-red-100 text-red-700"
        : w.status === "on_hold" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-700";
  const statusLabel = { completed: "Paid", failed: "Payout Failed", rejected: "Rejected", pending: "Pending Review", on_hold: "On Hold" }[w.status] || w.status;

  return (
    <div className="space-y-5" data-testid="wd-investigation">
      <button onClick={onBack} data-testid="wd-inv-back" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to withdrawals</button>

      {/* HEADER */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] text-slate-400">Withdrawal request · {w.code}</p>
            <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{owner.name}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{owner.code} · Partner · requested {dt(w.requested_at)}</p>
          </div>
          <div className="text-right">
            <p className="font-heading font-extrabold text-3xl text-slate-900 dark:text-white">{fmt(w.amount)}</p>
            <div className="flex items-center gap-2 justify-end mt-1">
              <span className={`text-[11px] px-2 py-0.5 rounded-md border ${riskTone(risk.level)}`}>{risk.level} · {risk.score}</span>
              <span className={`text-xs px-2.5 py-1 rounded-md ${statusBadge}`}>{statusLabel}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4 flex-wrap">
          {w.status === "pending" && <>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid="inv-approve-pay" disabled={busy} onClick={() => setConfirmPay(true)}><Banknote className="h-4 w-4 mr-1" /> Approve &amp; Pay {fmt(w.net_amount)}</Button>
            <Button size="sm" variant="outline" className="text-red-600 border-red-200" data-testid="inv-reject" disabled={busy} onClick={() => setRejectOpen(true)}><XCircle className="h-4 w-4 mr-1" /> Reject</Button>
          </>}
          {w.status === "failed" && <Button size="sm" className="bg-primary-700 hover:bg-primary-800" data-testid="inv-retry" disabled={busy} onClick={() => doAction("retry")}><RotateCcw className="h-4 w-4 mr-1" /> Retry Payout</Button>}
        </div>
      </div>

      {/* VERIFICATION + RISK */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel title="Financial Verification" icon={ShieldAlert} testid="inv-verification" >
          <div className="grid grid-cols-1 gap-1.5">
            {checklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-[13px]" data-testid={`inv-check-${i}`}>
                {c.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                <span className={c.ok ? "text-slate-700 dark:text-slate-200" : "text-red-600 font-medium"}>{c.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Risk Analysis" icon={ShieldAlert} testid="inv-risk">
          <RiskGauge score={risk.score} level={risk.level} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            {risk.sub_scores.map((s) => (
              <div key={s.key} className="rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                <p className="text-[10px] text-slate-400">{s.label}</p>
                <p className="text-sm font-bold"><span className={riskTone(s.level).split(" ")[0]}>{s.score}</span><span className="text-slate-400 text-[11px]">/100 · {s.level}</span></p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Risk Signals" icon={AlertTriangle} testid="inv-signals">
          <div className="space-y-2">
            {risk.reasons.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[13px]" data-testid={`inv-reason-${i}`}>
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${sevDot(r.severity)}`} />
                <span className="text-slate-700 dark:text-slate-200">{r.text}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {/* PROFILE + WALLET + DESTINATION */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel title="Partner Profile" icon={User} testid="inv-profile">
          <KV k="Partner ID" v={owner.code} />
          <KV k="Phone" v={owner.phone} />
          <KV k="Email" v={owner.email || "—"} />
          <KV k="Joined" v={dt(owner.joined)} />
          <KV k="Account Age" v={`${owner.account_age_days} days`} />
          <KV k="Account Status" v={<span className="capitalize">{owner.account_status}</span>} />
          <KV k="KYC" v={owner.kyc_ok ? <span className="text-emerald-600">Verified</span> : <span className="text-red-600 capitalize">{owner.kyc_status}</span>} />
        </Panel>
        <Panel title="Wallet Overview" icon={Wallet} testid="inv-wallet">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Available" value={fmt(wallet.available_balance)} />
            <Stat label="Withdrawable" value={fmt(wallet.withdrawable_balance)} tone="text-emerald-600" />
            <Stat label="Pending / Locked" value={fmt(wallet.pending_balance)} tone="text-amber-600" />
            <Stat label="Lifetime Earned" value={fmt(wallet.total_earned)} />
            <Stat label="Total Withdrawn" value={fmt(wallet.total_withdrawn)} />
            <Stat label="Penalties" value={fmt(wallet.total_penalty)} tone="text-red-600" />
          </div>
        </Panel>
        <Panel title="Payout Destination" icon={Banknote} testid="inv-destination">
          <KV k="Method" v={(dest.method || "").toUpperCase()} />
          {dest.method === "upi"
            ? <KV k="UPI ID" v={dest.upi_masked} />
            : <><KV k="Bank" v={dest.bank?.bank_name} /><KV k="Account" v={dest.bank?.account_masked} /><KV k="IFSC" v={dest.bank?.ifsc} /></>}
          <KV k="Verified" v={dest.verified ? <span className="text-emerald-600">Yes</span> : <span className="text-red-600">No</span>} />
          <KV k="Successful payouts here" v={dest.successful_payouts} />
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <KV k="Requested" v={fmt(w.amount)} />
            <KV k="Processing fee" v={fmt(w.fee)} />
            <KV k="Net payable" v={fmt(w.net_amount)} cls="text-emerald-600" />
          </div>
        </Panel>
      </div>

      {/* TIMELINE + WALLET LEDGER */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Financial Timeline" icon={Clock} testid="inv-timeline">
          <div className="relative pl-6">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
            <div className="space-y-4">
              {timeline.map((e, i) => (
                <div key={i} className="relative" data-testid={`inv-tl-${i}`}>
                  <span className={`absolute -left-[22px] top-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${e.kind === "fail" ? "bg-red-500" : e.kind === "done" ? "bg-emerald-500" : "bg-primary-500"}`} />
                  <p className={`text-[13px] ${e.kind === "fail" ? "text-red-600 font-medium" : "text-slate-700 dark:text-slate-200"}`}>{e.label}</p>
                  <p className="text-[11px] text-slate-400">{dt(e.at)}</p>
                </div>
              ))}
            </div>
          </div>
        </Panel>
        <Panel title="Wallet Ledger" icon={ScrollText} testid="inv-ledger">
          {ledger.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No ledger entries</p> : (
            <div className="max-h-72 overflow-auto -mx-1">
              <table className="w-full text-[12px]">
                <thead><tr className="text-slate-400 text-left"><th className="py-1 px-1 font-medium">Date</th><th className="font-medium">Type</th><th className="font-medium text-right">Amount</th></tr></thead>
                <tbody>
                  {ledger.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800" data-testid={`inv-ledger-${i}`}>
                      <td className="py-1.5 px-1 text-slate-500 whitespace-nowrap">{dt(e.created_at)}</td>
                      <td className="text-slate-700 dark:text-slate-200"><span className="capitalize">{e.kind}</span><span className="block text-[10px] text-slate-400">{e.note}</span></td>
                      <td className={`text-right font-semibold whitespace-nowrap ${e.direction === "credit" ? "text-emerald-600" : "text-red-600"}`}>{e.direction === "credit" ? "+" : "−"}{fmt(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {/* WITHDRAWAL HISTORY */}
      <Panel title="Withdrawal History" icon={History} testid="inv-history">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-3">
          <Stat label="Total" value={hs.total} />
          <Stat label="Paid" value={hs.count_paid} tone="text-emerald-600" />
          <Stat label="Failed" value={hs.count_failed} tone="text-red-600" />
          <Stat label="Rejected" value={hs.count_rejected} tone="text-red-600" />
          <Stat label="Total Paid" value={fmt(hs.total_paid)} />
          <Stat label="Avg" value={fmt(hs.avg)} />
          <Stat label="Largest" value={fmt(hs.largest)} />
        </div>
        {history.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No previous withdrawals</p> : (
          <div className="overflow-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-slate-400 text-left border-b border-slate-100 dark:border-slate-800"><th className="py-1.5 font-medium">Amount</th><th className="font-medium">Net</th><th className="font-medium">Method</th><th className="font-medium">Status</th><th className="font-medium">Requested</th><th className="font-medium">UTR</th></tr></thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50" data-testid={`inv-hist-${i}`}>
                    <td className="py-1.5">{fmt(h.amount)}</td><td>{fmt(h.net_amount)}</td>
                    <td className="uppercase text-slate-500">{h.method}</td>
                    <td><span className="capitalize">{h.status}</span></td>
                    <td className="text-slate-500 whitespace-nowrap">{dt(h.requested_at || h.created_at)}</td>
                    <td className="text-slate-500">{h.payout?.utr || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* TRANSACTIONS + AUDIT */}
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel title="Recent Transactions" icon={ReceiptText} testid="inv-txns">
          {transactions.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No transactions found</p> : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-[12px]">
                <tbody>
                  {transactions.map((t, i) => (
                    <tr key={i} className="border-b border-slate-50 dark:border-slate-800/50" data-testid={`inv-txn-${i}`}>
                      <td className="py-1.5 text-slate-500 whitespace-nowrap">{dt(t.created_at)}</td>
                      <td className="text-slate-700 dark:text-slate-200"><span className="capitalize">{t.kind || t.note}</span></td>
                      <td className={`text-right font-semibold ${t.type === "credit" ? "text-emerald-600" : "text-red-600"}`}>{t.type === "credit" ? "+" : "−"}{fmt(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Audit Trail" icon={ScrollText} testid="inv-audit">
          {audit.length === 0 ? <p className="text-sm text-slate-400 text-center py-6">No audit events yet</p> : (
            <div className="max-h-72 overflow-auto space-y-2">
              {audit.map((a, i) => (
                <div key={i} className="text-[12px] border-b border-slate-50 dark:border-slate-800/50 pb-1.5" data-testid={`inv-audit-${i}`}>
                  <p className="text-slate-700 dark:text-slate-200">{a.action} <span className="text-slate-400">by {a.actor_name || a.actor_id || "system"}</span></p>
                  <p className="text-[10px] text-slate-400">{dt(a.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* APPROVE & PAY CONFIRMATION */}
      <Dialog open={confirmPay} onOpenChange={(o) => !busy && setConfirmPay(o)}>
        <DialogContent data-testid="inv-confirm-pay">
          <DialogHeader><DialogTitle>Approve Withdrawal?</DialogTitle>
            <DialogDescription>You are about to send money to this payout destination.</DialogDescription></DialogHeader>
          <div className="space-y-1.5 rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-[13px]">
            <KV k="Partner" v={owner.name} />
            <KV k="Requested" v={fmt(w.amount)} />
            <KV k="Processing Fee" v={fmt(w.fee)} />
            <KV k="Net Payable" v={fmt(w.net_amount)} cls="text-emerald-600" />
            <KV k="Wallet Withdrawable" v={fmt(wallet.withdrawable_balance)} />
            <KV k="Destination" v={dest.method === "upi" ? dest.upi_masked : `${dest.bank?.bank_name || ""} ${dest.bank?.account_masked || ""}`} />
            <KV k="Risk" v={<span className={riskTone(risk.level).split(" ")[0]}>{risk.level} · {risk.score}</span>} />
          </div>
          {risk.level !== "LOW" && <p className="text-[12px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Elevated risk — review signals before paying.</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmPay(false)}>Cancel</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" data-testid="inv-confirm-pay-btn" disabled={busy} onClick={() => doAction("approve")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Approve & Pay ${fmt(w.net_amount)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REJECT */}
      <Dialog open={rejectOpen} onOpenChange={(o) => !busy && setRejectOpen(o)}>
        <DialogContent data-testid="inv-reject-dialog">
          <DialogHeader><DialogTitle>Reject withdrawal</DialogTitle>
            <DialogDescription>The locked amount is released back to the partner wallet.</DialogDescription></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" data-testid="inv-reject-reason" />
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" data-testid="inv-reject-btn" disabled={busy || !reason.trim()} onClick={() => doAction("reject", reason)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
