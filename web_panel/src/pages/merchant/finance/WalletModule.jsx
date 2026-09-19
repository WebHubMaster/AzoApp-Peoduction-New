import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Wallet, TrendingUp, Clock, Banknote, ShieldCheck, AlertTriangle, ArrowDownRight,
  ArrowUpRight, Search, Landmark, CheckCircle2, ChevronRight, Sparkles, Receipt, ArrowRight,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  KpiCard, Surface, SegTabs, DetailDrawer, KV, Timeline, EmptyState, KpiSkeletonRow,
  RowsSkeleton, Paginator, StatusBadge, money, shortDate,
} from "@/components/merchant/finance/FinanceKit";

const PANEL = "/merchant/panel";
const monthKey = (s) => (s || "").slice(0, 7);

export default function WalletModule({ onNavigate }) {
  const [ov, setOv] = useState(null);
  const [tab, setTab] = useState("overview");
  const [tx, setTx] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [txf, setTxf] = useState({ q: "", direction: "", page: 1, page_size: 10 });
  const [txLoading, setTxLoading] = useState(false);
  const [wds, setWds] = useState([]);
  const [detail, setDetail] = useState(null);
  const [wdDetail, setWdDetail] = useState(null);
  const [flow, setFlow] = useState(false);

  const load = useCallback(async () => {
    const [o, w] = await Promise.all([api.get(`${PANEL}/wallet/overview`), api.get(`${PANEL}/wallet/withdrawals`)]);
    setOv(o.data); setWds(w.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (tab !== "transactions") return;
    setTxLoading(true);
    api.get(`${PANEL}/wallet/transactions`, { params: txf }).then((r) => setTx(r.data)).finally(() => setTxLoading(false));
  }, [tab, txf]);
  useEffect(() => { setTxf((f) => ({ ...f, page: 1 })); }, [txf.q, txf.direction, txf.page_size]);

  const s = ov?.summary || {};
  const cfg = ov?.config || {};
  const fin = ov?.finance || { eligible: false, blockers: [], banks: [], primary_bank: null };
  const eligible = !!fin.eligible;

  const trend = useMemo(() => {
    const led = s.ledger || [];
    if (!led.length) return null;
    const now = new Date(); const cur = monthKey(now.toISOString());
    const prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1); const prev = monthKey(prevD.toISOString());
    let c = 0, p = 0;
    led.forEach((l) => { if (l.direction !== "credit") return; const m = monthKey(l.created_at); if (m === cur) c += l.amount; else if (m === prev) p += l.amount; });
    if (!p) return c > 0 ? 100 : null;
    return Math.round(((c - p) / p) * 100);
  }, [s.ledger]);

  const gotoKyc = () => (onNavigate ? onNavigate("bankkyc") : toast.message("Open Bank & KYC from the menu"));
  const startWithdraw = () => { if (!eligible) { gotoKyc(); toast.message("Complete Bank & KYC verification first"); } else setFlow(true); };
  const recentTx = (s.ledger || []).slice(0, 6);

  if (!ov) return (
    <div className="space-y-5">
      <Surface className="p-6"><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Surface>
      <KpiSkeletonRow n={3} className="grid grid-cols-3 gap-3" />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-5" data-testid="wallet-module">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-7 text-white shadow-xl bg-[#0D47A1] bg-gradient-to-br from-[#0D47A1] via-[#0f52ba] to-[#0a2e6b]">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-10 bottom-0 h-32 w-32 rounded-full bg-sky-300/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-primary-100">
            <Wallet className="h-4 w-4" />
            <p className="text-[11px] uppercase tracking-[0.2em] font-semibold">Available Balance</p>
          </div>
          <div className="flex items-end gap-3 mt-1.5">
            <p className="font-heading font-extrabold text-4xl sm:text-5xl tabular-nums" data-testid="wallet-balance">{money(s.available_balance)}</p>
            {trend != null && (
              <span className={`mb-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${trend >= 0 ? "bg-emerald-400/20 text-emerald-100" : "bg-rose-400/20 text-rose-100"}`}>
                {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% <span className="font-normal opacity-80">this month</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-6 max-w-xl">
            {[["Withdrawable", s.withdrawable_balance], ["Pending", s.pending_balance], ["Withdrawn", s.total_withdrawn]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-white/10 backdrop-blur px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-primary-100">{k}</p>
                <p className="font-bold text-sm sm:text-base tabular-nums mt-0.5">{money(v)}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-6">
            <Button onClick={startWithdraw} data-testid="withdraw-btn"
              className="h-12 flex-1 sm:flex-none sm:px-8 bg-white text-primary-800 hover:bg-primary-50 font-bold text-base rounded-2xl shadow-lg">
              <Banknote className="h-5 w-5 mr-2" /> Withdraw Money
            </Button>
            <div className="flex items-center gap-1.5 text-primary-100 text-xs">
              <ShieldCheck className="h-4 w-4" /> Secured payouts to your verified bank account
            </div>
          </div>
        </div>
      </div>

      {/* KYC blocker */}
      {!eligible && (
        <Surface className="p-4 border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20" data-testid="wallet-kyc-blocker">
          <div className="flex items-start gap-3">
            <span className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 grid place-items-center shrink-0"><AlertTriangle className="h-5 w-5" /></span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100">Complete Bank &amp; KYC to withdraw</p>
              <p className="text-sm text-amber-700 dark:text-amber-300/90 mt-0.5">Pending: {(fin.blockers || []).join(", ") || "verification"}</p>
            </div>
            <Button onClick={gotoKyc} data-testid="wallet-complete-kyc" className="h-10 bg-primary-700 hover:bg-primary-800 shrink-0 hidden sm:inline-flex">Complete Bank &amp; KYC</Button>
          </div>
          <Button onClick={gotoKyc} className="h-10 w-full mt-3 bg-primary-700 hover:bg-primary-800 sm:hidden">Complete Bank &amp; KYC</Button>
        </Surface>
      )}

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard icon={TrendingUp} tone="emerald" label="Total Earned" value={money(s.total_earned)} sub="Lifetime earnings" trend={trend} testid="kpi-total-earned" />
        <KpiCard icon={Wallet} tone="primary" label="Commission" value={money((s.total_referral || 0) + (s.total_customer || 0))} sub="Referral + booking" testid="kpi-commission" />
        <KpiCard icon={Clock} tone="amber" label="Processing" value={money(s.pending_balance)} sub="Locked in withdrawals" testid="kpi-processing" />
      </div>

      <SegTabs tabs={["overview", "transactions", "withdrawals"]} value={tab} onChange={setTab} />

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Surface className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><Receipt className="h-4 w-4 text-primary-600" /> Recent Activity</h3>
              <button onClick={() => setTab("transactions")} className="text-xs font-semibold text-primary-600 hover:underline inline-flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></button>
            </div>
            {recentTx.length === 0 ? <EmptyState icon={Receipt} title="No activity yet" hint="Your wallet credits and debits will appear here." testid="wallet-overview-empty" /> : (
              <div className="space-y-1">
                {recentTx.map((t) => <TxRow key={t.id} t={t} onOpen={() => setDetail(t)} />)}
              </div>
            )}
          </Surface>
          <Surface className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white flex items-center gap-2"><Banknote className="h-4 w-4 text-primary-600" /> Recent Withdrawals</h3>
              <button onClick={() => setTab("withdrawals")} className="text-xs font-semibold text-primary-600 hover:underline inline-flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></button>
            </div>
            {wds.length === 0 ? <EmptyState icon={Banknote} title="No withdrawals yet" hint="Withdraw your earnings to your verified bank account." action={<Button onClick={startWithdraw} className="h-10 bg-primary-700 hover:bg-primary-800">Withdraw Money</Button>} testid="wallet-wd-empty" /> : (
              <div className="space-y-2">{wds.slice(0, 5).map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</div>
            )}
          </Surface>
        </div>
      )}

      {/* TRANSACTIONS */}
      {tab === "transactions" && (
        <Surface className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={txf.q} onChange={(e) => setTxf({ ...txf, q: e.target.value })} placeholder="Search description, reference…" className="h-11 pl-9" data-testid="wallet-tx-search" />
            </div>
            <PremiumSelect value={txf.direction} onChange={(e) => setTxf({ ...txf, direction: e.target.value })} data-testid="wallet-tx-direction" searchable={false}
              className="!h-11 rounded-xl">
              <option value="">All types</option><option value="credit">Credit</option><option value="debit">Debit</option>
            </PremiumSelect>
          </div>
          {txLoading ? <RowsSkeleton /> : tx.items.length === 0 ? (
            <EmptyState icon={Receipt} title="No transactions found" hint="Try adjusting your search or filters." testid="wallet-tx-empty" />
          ) : (
            <>
              {/* desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm" data-testid="wallet-tx-table">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-2 font-bold">Date</th><th className="py-2.5 px-2 font-bold">Description</th><th className="py-2.5 px-2 font-bold">Type</th><th className="py-2.5 px-2 font-bold text-right">Amount</th><th className="py-2.5 px-2 font-bold text-right">Balance</th><th className="py-2.5 px-2 font-bold">Status</th><th className="py-2.5 px-2" /></tr></thead>
                  <tbody>
                    {tx.items.map((t) => (
                      <tr key={t.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => setDetail(t)} data-testid={`wallet-tx-row-${t.id}`}>
                        <td className="py-3 px-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">{shortDate(t.created_at)}</td>
                        <td className="py-3 px-2 font-medium text-slate-800 dark:text-slate-100 max-w-[220px] truncate">{t.note}</td>
                        <td className="py-3 px-2 capitalize text-slate-500">{t.kind}</td>
                        <td className={`py-3 px-2 text-right font-bold tabular-nums ${t.direction === "credit" ? "text-emerald-600" : "text-rose-500"}`}>{t.direction === "credit" ? "+" : "−"}{money(t.amount)}</td>
                        <td className="py-3 px-2 text-right tabular-nums text-slate-500">{t.balance != null ? money(t.balance) : "—"}</td>
                        <td className="py-3 px-2"><StatusBadge status={t.status} /></td>
                        <td className="py-3 px-2 text-right"><ChevronRight className="h-4 w-4 text-slate-300 inline" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* mobile cards */}
              <div className="md:hidden space-y-2">{tx.items.map((t) => <TxRow key={t.id} t={t} onOpen={() => setDetail(t)} card />)}</div>
              <Paginator page={tx.page} pages={tx.pages} total={tx.total} pageSize={txf.page_size} onPage={(p) => setTxf({ ...txf, page: p })} onPageSize={(n) => setTxf({ ...txf, page_size: n })} />
            </>
          )}
        </Surface>
      )}

      {/* WITHDRAWALS */}
      {tab === "withdrawals" && (
        <Surface className="p-4 sm:p-5">
          {wds.length === 0 ? <EmptyState icon={Banknote} title="No withdrawals yet" hint="Your withdrawal history will appear here." action={<Button onClick={startWithdraw} className="h-10 bg-primary-700 hover:bg-primary-800">Withdraw Money</Button>} testid="wallet-wd-empty2" /> : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm" data-testid="withdrawal-history">
                  <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-2 font-bold">Withdrawal ID</th><th className="py-2.5 px-2 font-bold">Date</th><th className="py-2.5 px-2 font-bold text-right">Amount</th><th className="py-2.5 px-2 font-bold">Bank</th><th className="py-2.5 px-2 font-bold">Method</th><th className="py-2.5 px-2 font-bold">Status</th><th className="py-2.5 px-2" /></tr></thead>
                  <tbody>
                    {wds.map((w) => (
                      <tr key={w.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => setWdDetail(w)} data-testid={`wd-row-${w.id}`}>
                        <td className="py-3 px-2 font-mono font-medium text-slate-800 dark:text-slate-100">WD-{w.id.slice(0, 6).toUpperCase()}</td>
                        <td className="py-3 px-2 text-slate-500 whitespace-nowrap">{shortDate(w.requested_at)}</td>
                        <td className="py-3 px-2 text-right font-bold tabular-nums">{money(w.amount)}</td>
                        <td className="py-3 px-2 text-slate-500 max-w-[160px] truncate">{w.bank?.bank_name || (w.method === "upi" ? w.upi_id : "—")}</td>
                        <td className="py-3 px-2 uppercase text-xs text-slate-500">{w.method}</td>
                        <td className="py-3 px-2"><StatusBadge status={w.status} /></td>
                        <td className="py-3 px-2 text-right"><ChevronRight className="h-4 w-4 text-slate-300 inline" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="md:hidden space-y-2">{wds.map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</div>
            </>
          )}
        </Surface>
      )}

      {/* Transaction detail drawer */}
      <DetailDrawer open={!!detail} onClose={() => setDetail(null)} title="Transaction details" subtitle={detail?.note} testid="wallet-tx-drawer">
        {detail && (
          <div className="space-y-5">
            <div className={`rounded-2xl p-4 text-center ${detail.direction === "credit" ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-rose-50 dark:bg-rose-950/30"}`}>
              <p className={`font-heading font-extrabold text-3xl tabular-nums ${detail.direction === "credit" ? "text-emerald-600" : "text-rose-500"}`}>{detail.direction === "credit" ? "+" : "−"}{money(detail.amount)}</p>
              <div className="mt-2 flex justify-center"><StatusBadge status={detail.status} /></div>
            </div>
            <div>
              <KV k="Reference ID" v={detail.ref_id || detail.id.slice(0, 10).toUpperCase()} mono />
              <KV k="Date" v={shortDate(detail.created_at)} />
              <KV k="Type" v={<span className="capitalize">{detail.kind}</span>} />
              <KV k="Direction" v={<span className="capitalize">{detail.direction}</span>} />
              <KV k="Amount" v={money(detail.amount)} strong />
              <KV k="Balance after" v={detail.balance != null ? money(detail.balance) : "—"} />
            </div>
          </div>
        )}
      </DetailDrawer>

      {/* Withdrawal detail drawer */}
      <DetailDrawer open={!!wdDetail} onClose={() => setWdDetail(null)} title="Withdrawal details" subtitle={wdDetail ? `WD-${wdDetail.id.slice(0, 6).toUpperCase()}` : ""} testid="wallet-wd-drawer">
        {wdDetail && (
          <div className="space-y-5">
            <div className="rounded-2xl p-4 text-center bg-primary-50 dark:bg-primary-900/20">
              <p className="font-heading font-extrabold text-3xl tabular-nums text-primary-700 dark:text-primary-300">{money(wdDetail.amount)}</p>
              <div className="mt-2 flex justify-center"><StatusBadge status={wdDetail.status} /></div>
            </div>
            <div>
              <KV k="Withdrawal ID" v={`WD-${wdDetail.id.slice(0, 6).toUpperCase()}`} mono />
              <KV k="Requested" v={shortDate(wdDetail.requested_at)} />
              <KV k="Method" v={<span className="uppercase">{wdDetail.method}</span>} />
              <KV k="Bank" v={wdDetail.bank?.bank_name || (wdDetail.method === "upi" ? wdDetail.upi_id : "—")} />
              {wdDetail.bank?.account_number && <KV k="Account" v={"••••" + String(wdDetail.bank.account_number).slice(-4)} mono />}
              <KV k="Amount" v={money(wdDetail.amount)} />
              <KV k="Processing fee" v={"−" + money(wdDetail.fee || 0)} />
              <KV k="Net payable" v={money(wdDetail.net_amount ?? wdDetail.amount)} strong />
              {wdDetail.status === "rejected" && wdDetail.reason && <KV k="Reason" v={<span className="text-rose-500">{wdDetail.reason}</span>} />}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Timeline</p>
              <Timeline steps={[
                { title: "Request submitted", time: shortDate(wdDetail.requested_at), done: true },
                { title: "Under review", done: wdDetail.status !== "pending", active: wdDetail.status === "pending" },
                { title: wdDetail.status === "rejected" ? "Rejected" : "Completed", time: wdDetail.processed_at ? shortDate(wdDetail.processed_at) : "", done: wdDetail.status === "completed" || wdDetail.status === "rejected" },
              ]} />
            </div>
          </div>
        )}
      </DetailDrawer>

      {flow && <WithdrawFlow ov={ov} cfg={cfg} fin={fin} onClose={() => setFlow(false)} onDone={() => { setFlow(false); load(); setTab("withdrawals"); }} />}
    </motion.div>
  );
}

function TxRow({ t, onOpen, card }) {
  const credit = t.direction === "credit";
  return (
    <button onClick={onOpen} data-testid={`wallet-tx-item-${t.id}`}
      className={`w-full flex items-center gap-3 text-left rounded-xl px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${card ? "border border-slate-100 dark:border-slate-800" : ""}`}>
      <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${credit ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" : "bg-rose-50 text-rose-500 dark:bg-rose-950/40"}`}>{credit ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}</span>
      <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{t.note}</p><p className="text-[11px] text-slate-400">{shortDate(t.created_at)} · <span className="capitalize">{t.status}</span></p></div>
      <p className={`font-bold text-sm tabular-nums shrink-0 ${credit ? "text-emerald-600" : "text-rose-500"}`}>{credit ? "+" : "−"}{money(t.amount)}</p>
    </button>
  );
}
function WdRow({ w, onOpen }) {
  return (
    <button onClick={onOpen} data-testid={`wd-item-${w.id}`} className="w-full flex items-center gap-3 text-left rounded-xl border border-slate-100 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <span className="h-9 w-9 rounded-xl grid place-items-center bg-primary-50 text-primary-700 dark:bg-primary-900/30 shrink-0"><Banknote className="h-4 w-4" /></span>
      <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">WD-{w.id.slice(0, 6).toUpperCase()}</p><p className="text-[11px] text-slate-400">{shortDate(w.requested_at)} · {w.method?.toUpperCase()}</p></div>
      <div className="text-right shrink-0"><p className="font-bold text-sm tabular-nums">{money(w.amount)}</p><div className="mt-1"><StatusBadge status={w.status} /></div></div>
    </button>
  );
}

/* ── multi-step withdraw ── */
function WithdrawFlow({ ov, cfg, fin, onClose, onDone }) {
  const s = ov.summary || {};
  const banks = (fin.banks || []).filter((b) => b.status === "approved");
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState(fin.primary_bank?.id || banks[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const amt = Number(amount) || 0;
  const min = cfg.min_withdrawal || 100, max = cfg.max_withdrawal || 50000;
  const maxAllowed = Math.min(max, s.withdrawable_balance || 0);
  const fee = Math.round((amt * (cfg.processing_fee_pct || 0) / 100 + (cfg.processing_fee_flat || 0)) * 100) / 100;
  const net = Math.max(0, amt - fee);
  const bank = banks.find((b) => b.id === bankId) || fin.primary_bank || {};
  const masked = bank.account_number ? "••••" + String(bank.account_number).slice(-4) : "";

  const amtError = amt > 0 && amt < min ? `Minimum ₹${min}` : amt > maxAllowed ? `Max ${money(maxAllowed)}` : "";
  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`${PANEL}/withdraw`, { amount: amt, method: "bank", bank });
      setResult(data); setStep(5); toast.success("Withdrawal request submitted");
    } catch (e) { toast.error(e?.response?.data?.detail || "Withdrawal failed"); } finally { setBusy(false); }
  };

  const StepDots = () => (
    <div className="flex items-center gap-1.5 mb-5">
      {[1, 2, 3, 4].map((n) => <span key={n} className={`h-1.5 rounded-full transition-all ${n === step ? "w-6 bg-primary-600" : n < step ? "w-3 bg-primary-400" : "w-3 bg-slate-200 dark:bg-slate-700"}`} />)}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="withdraw-flow">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-h-[92vh] overflow-y-auto">
        {step < 5 && <StepDots />}

        {step === 1 && (
          <div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Enter amount</h3>
            <p className="text-sm text-slate-500 mt-1">Available {money(s.withdrawable_balance)} · Min {money(min)} · Max {money(max)}</p>
            <div className="mt-4 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">₹</span>
              <Input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus data-testid="withdraw-amount" className="h-16 pl-10 text-3xl font-extrabold" />
            </div>
            {amtError && <p className="text-xs text-rose-500 mt-1.5" data-testid="withdraw-amount-error">{amtError}</p>}
            <div className="grid grid-cols-5 gap-2 mt-4">
              {[500, 1000, 2000, 5000].map((q) => (
                <button key={q} disabled={q > maxAllowed} onClick={() => setAmount(String(q))} data-testid={`withdraw-quick-${q}`}
                  className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-primary-400 hover:text-primary-700 disabled:opacity-40">₹{q >= 1000 ? q / 1000 + "k" : q}</button>
              ))}
              <button onClick={() => setAmount(String(Math.floor(maxAllowed)))} data-testid="withdraw-quick-max" className="h-10 rounded-xl border border-primary-200 bg-primary-50 dark:bg-primary-900/30 text-xs font-bold text-primary-700 dark:text-primary-300">Max</button>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={onClose} className="h-11 flex-1">Cancel</Button>
              <Button disabled={!amt || !!amtError} onClick={() => setStep(2)} data-testid="withdraw-next-1" className="h-11 flex-1 bg-primary-700 hover:bg-primary-800">Continue</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Select bank account</h3>
            <p className="text-sm text-slate-500 mt-1">Money will be sent to your verified account.</p>
            <div className="space-y-2 mt-4">
              {banks.map((b) => (
                <button key={b.id} onClick={() => setBankId(b.id)} data-testid={`withdraw-bank-${b.id}`}
                  className={`w-full flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all ${bankId === b.id ? "border-primary-500 ring-2 ring-primary-100 dark:ring-primary-900/40 bg-primary-50/50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-700"}`}>
                  <span className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 grid place-items-center shrink-0"><Landmark className="h-5 w-5" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 dark:text-slate-100 truncate flex items-center gap-2">{b.bank_name}{b.is_primary && <span className="text-[9px] bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 rounded px-1.5 py-0.5">PRIMARY</span>}</p>
                    <p className="text-xs text-slate-500">••••{String(b.account_number).slice(-4)} · {b.ifsc}</p>
                  </div>
                  {bankId === b.id && <CheckCircle2 className="h-5 w-5 text-primary-600 shrink-0" />}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setStep(1)} className="h-11 flex-1">Back</Button>
              <Button disabled={!bankId} onClick={() => setStep(3)} data-testid="withdraw-next-2" className="h-11 flex-1 bg-primary-700 hover:bg-primary-800">Review</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Review withdrawal</h3>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 mt-4">
              <KV k="Withdrawal amount" v={money(amt)} />
              <KV k="Processing fee" v={"−" + money(fee)} />
              <KV k="Net amount" v={money(net)} strong />
              <KV k="Bank account" v={`${bank.bank_name} ${masked}`} />
              <KV k="Expected processing" v="1–2 business days" />
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setStep(2)} className="h-11 flex-1">Back</Button>
              <Button onClick={() => setStep(4)} data-testid="withdraw-next-3" className="h-11 flex-1 bg-primary-700 hover:bg-primary-800">Confirm</Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="text-center">
            <span className="mx-auto h-14 w-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 grid place-items-center"><ShieldCheck className="h-7 w-7" /></span>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white mt-4">Confirm withdrawal</h3>
            <p className="text-sm text-slate-500 mt-1">You are about to withdraw <b className="text-slate-800 dark:text-slate-100">{money(amt)}</b> to {bank.bank_name} {masked}. This can’t be undone once submitted.</p>
            <div className="flex gap-2 mt-6">
              <Button variant="outline" onClick={() => setStep(3)} className="h-11 flex-1">Back</Button>
              <Button onClick={submit} disabled={busy} data-testid="withdraw-submit" className="h-11 flex-1 bg-primary-700 hover:bg-primary-800">{busy ? "Submitting…" : "Confirm & Submit"}</Button>
            </div>
          </div>
        )}

        {step === 5 && result && (
          <div className="text-center py-2" data-testid="withdraw-success">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", damping: 12 }} className="mx-auto h-16 w-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 grid place-items-center"><CheckCircle2 className="h-9 w-9" /></motion.span>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white mt-4">Withdrawal submitted!</h3>
            <p className="text-sm text-slate-500 mt-1">Your request is now pending approval.</p>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/50 p-4 mt-4 text-left">
              <KV k="Withdrawal ID" v={`WD-${result.id.slice(0, 6).toUpperCase()}`} mono />
              <KV k="Amount" v={money(result.amount)} strong />
              <KV k="Bank" v={`${bank.bank_name} ${masked}`} />
              <KV k="Expected arrival" v="1–2 business days" />
            </div>
            <Button onClick={onDone} className="h-11 w-full mt-5 bg-primary-700 hover:bg-primary-800">Done</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
