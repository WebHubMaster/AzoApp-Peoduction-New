import React, { useCallback, useEffect, useState } from "react";
import api, { fmt } from "@/lib/api";
import { toast } from "sonner";
import {
  Wallet, ArrowDownToLine, ShieldCheck, TrendingUp, Gift, MinusCircle,
  Clock, Banknote, ReceiptText, ArrowUpRight, ArrowDownLeft,
} from "lucide-react";
import { Surface, Section, Kpi, StatusBadge, EmptyState, Segmented, Sheet, DetailRow, ListRow, SkeletonKpis, cx } from "@/components/partner/ui/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const TABS = [{ key: "overview", label: "Overview" }, { key: "transactions", label: "Transactions" }, { key: "withdrawals", label: "Withdrawals" }];

export default function WalletModule() {
  const [w, setW] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [wds, setWds] = useState([]);
  const [kyc, setKyc] = useState(null);
  const [tab, setTab] = useState("overview");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api.get("/partner/wallet").then((r) => setW(r.data)).catch(() => {});
    api.get("/partner/wallet/config").then((r) => setCfg(r.data)).catch(() => {});
    api.get("/partner/withdrawals").then((r) => setWds(r.data)).catch(() => {});
    api.get("/partner/finance-kyc").then((r) => setKyc(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!w) {
    return (
      <div className="w-full space-y-5">
        <Surface className="p-6"><div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Surface>
        <SkeletonKpis n={4} />
      </div>
    );
  }
  const eligible = kyc?.eligible;

  return (
    <div className="w-full space-y-5" data-testid="wallet-module">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-800 via-primary-700 to-primary-600 text-white p-6 shadow-[0_20px_45px_-20px_rgba(13,71,161,0.7)]">
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] bg-[size:26px_26px]" />
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-primary-100 text-sm flex items-center gap-1.5"><Wallet className="h-4 w-4" /> Available Balance</p>
            <p className="font-heading font-black text-4xl sm:text-5xl mt-1.5 tabular-nums leading-none">{fmt(w.withdrawable_balance)}</p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span className="text-primary-100">Pending <b className="text-white">{fmt(w.pending_balance)}</b></span>
              <span className="text-primary-100">Withdrawn <b className="text-white">{fmt(w.total_withdrawn)}</b></span>
            </div>
          </div>
          <div className="shrink-0">
            {eligible ? (
              <Button data-testid="withdraw-btn" onClick={() => setWithdrawOpen(true)}
                className="w-full sm:w-auto bg-white text-primary-800 hover:bg-primary-50 font-bold h-12 px-6 rounded-2xl shadow-lg">
                <ArrowDownToLine className="h-5 w-5 mr-1.5" /> Withdraw Money
              </Button>
            ) : (
              <Button data-testid="complete-kyc-btn" onClick={() => window.dispatchEvent(new CustomEvent("partner-nav", { detail: "bankkyc" }))}
                className="w-full sm:w-auto bg-white/95 text-primary-800 hover:bg-white font-bold h-12 px-6 rounded-2xl shadow-lg">
                <ShieldCheck className="h-5 w-5 mr-1.5" /> Complete KYC
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Total Earned" value={fmt(w.total_earned)} icon={TrendingUp} tone="emerald" />
        <Kpi label="Incentives" value={`+${fmt(w.total_incentive)}`} icon={Gift} tone="violet" />
        <Kpi label="Penalties" value={`-${fmt(w.total_penalty)}`} icon={MinusCircle} tone="rose" />
        <Kpi label="Processing" value={fmt(w.pending_balance)} icon={Clock} tone="amber" />
      </div>

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Recent Transactions" icon={ReceiptText}
            right={<button onClick={() => setTab("transactions")} className="text-xs font-semibold text-primary-700 dark:text-primary-300">View all</button>}
            bodyClass="p-0">
            <LedgerList items={(w.ledger || []).slice(0, 5)} />
          </Section>
          <Section title="Recent Withdrawals" icon={Banknote}
            right={<button onClick={() => setTab("withdrawals")} className="text-xs font-semibold text-primary-700 dark:text-primary-300">View all</button>}
            bodyClass="p-0">
            <WithdrawList items={(wds || []).slice(0, 5)} onOpen={setDetail} />
          </Section>
        </div>
      )}

      {tab === "transactions" && (
        <Section title="Wallet Ledger" icon={ReceiptText} bodyClass="p-0">
          <LedgerList items={w.ledger || []} full />
        </Section>
      )}

      {tab === "withdrawals" && (
        <Section title="Withdrawal Requests" icon={Banknote} bodyClass="p-0">
          <WithdrawList items={wds || []} onOpen={setDetail} full />
        </Section>
      )}

      <WithdrawSheet open={withdrawOpen} cfg={cfg} max={w.withdrawable_balance}
        onClose={() => setWithdrawOpen(false)} onDone={() => { setWithdrawOpen(false); load(); }} />
      <WithdrawDetail item={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function LedgerList({ items, full }) {
  if (!items.length) return <EmptyState icon={ReceiptText} title="No transactions yet" desc="Complete jobs to start earning — your wallet activity will appear here." />;
  return (
    <div className={cx("divide-y divide-slate-100 dark:divide-slate-800", full && "max-h-none")} data-testid="wallet-ledger">
      {items.map((l) => {
        const credit = l.direction === "credit";
        return (
          <div key={l.id} className="flex items-center gap-3 px-4 py-3.5">
            <span className={cx("h-9 w-9 rounded-xl flex items-center justify-center shrink-0", credit ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400")}>
              {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 capitalize truncate">{l.note || (l.kind || "").replace(/_/g, " ")}</p>
              <p className="text-[11px] text-slate-400 capitalize">{(l.kind || "").replace(/_/g, " ")} · {l.status}</p>
            </div>
            <p className={cx("font-bold text-sm tabular-nums shrink-0", credit ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {credit ? "+" : "-"}{fmt(l.amount)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function WithdrawList({ items, onOpen, full }) {
  if (!items.length) return <EmptyState icon={Banknote} title="No withdrawals yet" desc="Once you withdraw, every request and its status will show up here." />;
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="withdrawals-list">
      {items.map((x) => (
        <ListRow key={x.id} onClick={() => onOpen(x)}>
          <span className="h-9 w-9 rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 flex items-center justify-center shrink-0">
            <Banknote className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmt(x.amount)} <span className="text-[11px] text-slate-400 uppercase font-medium">via {x.method}</span></p>
            <p className="text-[11px] text-slate-400">{new Date(x.requested_at).toLocaleDateString()}{x.reason ? ` · ${x.reason}` : ""}</p>
          </div>
          <StatusBadge status={x.status} />
        </ListRow>
      ))}
    </div>
  );
}

function WithdrawDetail({ item, onClose }) {
  return (
    <Sheet open={!!item} onClose={onClose} title="Withdrawal Details">
      {item && (
        <div className="space-y-1">
          <div className="text-center py-4">
            <p className="font-heading font-black text-3xl text-slate-900 dark:text-white tabular-nums">{fmt(item.amount)}</p>
            <StatusBadge status={item.status} className="mt-2" />
          </div>
          <DetailRow label="Withdrawal ID" value={item.id?.slice(0, 12) || "—"} mono />
          <DetailRow label="Method" value={(item.method || "").toUpperCase()} />
          {item.upi_id && <DetailRow label="UPI" value={item.upi_id} mono />}
          {item.bank?.account_number && <DetailRow label="Bank A/C" value={`••••${String(item.bank.account_number).slice(-4)}`} mono />}
          <DetailRow label="Requested" value={new Date(item.requested_at).toLocaleString()} />
          {item.net_amount != null && <DetailRow label="Net amount" value={fmt(item.net_amount)} strong />}
          {item.payout?.payout_id && <DetailRow label="Reference" value={item.payout.payout_id} mono />}
          {item.reason && <DetailRow label="Note" value={item.reason} />}
        </div>
      )}
    </Sheet>
  );
}

function WithdrawSheet({ open, cfg, max, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("upi");
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState({ account_holder: "", bank_name: "", account_number: "", ifsc: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(""); setUpi(""); setBusy(false); } }, [open]);

  const min = cfg?.min_withdrawal || 0;
  const amt = Number(amount) || 0;
  const err = amt <= 0 ? "" : amt < min ? `Minimum withdrawal is ${fmt(min)}` : amt > max ? `Amount exceeds available balance (${fmt(max)})` : "";
  const valid = amt >= min && amt <= max && (method === "upi" ? upi.trim() : bank.account_number.trim() && bank.ifsc.trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await api.post("/partner/withdrawals", {
        amount: amt, method,
        upi_id: method === "upi" ? upi.trim() : "",
        bank: method === "bank" ? bank : null,
      });
      toast.success("Withdrawal requested");
      onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || "Withdrawal failed"); setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Withdraw Money"
      footer={
        <Button data-testid="withdraw-submit" onClick={submit} disabled={!valid || busy}
          className="w-full h-12 rounded-2xl bg-primary-700 hover:bg-primary-800 font-bold">
          {busy ? "Requesting…" : `Withdraw ${amt > 0 ? fmt(amt) : ""}`}
        </Button>
      }>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Amount</label>
          <div className="relative mt-1.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">₹</span>
            <Input type="number" inputMode="numeric" data-testid="withdraw-amount" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0" className="pl-8 h-12 text-lg font-bold" />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[11px]">
            <span className={cx(err ? "text-rose-500 font-semibold" : "text-slate-400")}>{err || `Min ${fmt(min)}`}</span>
            <button type="button" onClick={() => setAmount(String(Math.floor(max)))} className="text-primary-700 dark:text-primary-300 font-semibold">Available {fmt(max)}</button>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Payout method</label>
          <div className="grid grid-cols-2 gap-2 mt-1.5">
            {cfg?.upi_enabled !== false && <MethodBtn active={method === "upi"} onClick={() => setMethod("upi")} label="UPI" />}
            {cfg?.bank_enabled !== false && <MethodBtn active={method === "bank"} onClick={() => setMethod("bank")} label="Bank" />}
          </div>
        </div>

        {method === "upi" ? (
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">UPI ID</label>
            <Input data-testid="withdraw-upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="yourname@upi" className="mt-1.5 h-11" />
          </div>
        ) : (
          <div className="space-y-2.5">
            <Input placeholder="Account holder name" value={bank.account_holder} onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} className="h-11" />
            <Input placeholder="Bank name" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} className="h-11" />
            <Input placeholder="Account number" data-testid="withdraw-acc" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} className="h-11" />
            <Input placeholder="IFSC" value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} className="h-11 uppercase" />
          </div>
        )}
        <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2.5">
          Withdrawals are processed to your verified account. Processing usually takes 1–2 business days.
        </p>
      </div>
    </Sheet>
  );
}

const MethodBtn = ({ active, onClick, label }) => (
  <button type="button" onClick={onClick}
    className={cx("h-11 rounded-xl border-2 font-semibold text-sm transition-all",
      active ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 dark:border-primary-500" : "border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300")}>
    {label}
  </button>
);
