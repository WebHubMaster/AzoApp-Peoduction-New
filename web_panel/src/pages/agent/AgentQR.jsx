import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Home, ScanLine, Receipt, Wallet, User, LogOut, QrCode, Loader2, TrendingUp,
  Banknote, CheckCircle2, ShieldCheck, ChevronRight, Store, X, Sparkles,
} from "lucide-react";

import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import QrMapPanel from "@/components/qr/QrMapPanel";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const TABS = [
  { key: "home", label: "Home", icon: Home },
  { key: "map", label: "Scan", icon: ScanLine },
  { key: "earnings", label: "History", icon: Receipt },
  { key: "wallet", label: "Wallet", icon: Wallet },
  { key: "profile", label: "Profile", icon: User },
];

export default function AgentQR() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("home");
  const [me, setMe] = useState(null);
  const [earnings, setEarnings] = useState([]);

  const loadMe = useCallback(async () => {
    try { const { data } = await api.get("/agent/me"); setMe(data); } catch { /* ignore */ }
  }, []);
  const loadEarnings = useCallback(async () => {
    try { const { data } = await api.get("/agent/earnings"); setEarnings(data.earnings || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadMe(); loadEarnings(); }, [loadMe, loadEarnings]);

  const wallet = me?.wallet || {};

  return (
    <div className="h-[100dvh] bg-slate-100 dark:bg-slate-950 flex justify-center overflow-hidden">
      <div className="w-full max-w-md bg-slate-50 dark:bg-slate-900 h-full flex flex-col relative shadow-xl">
        <header className="shrink-0 bg-gradient-to-br from-[#0D47A1] via-[#1257bd] to-[#1769d6] text-white px-4 pt-5 pb-5 shadow-[0_6px_20px_-8px_rgba(13,71,161,0.7)] relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur grid place-items-center ring-1 ring-white/20"><QrCode className="w-5 h-5" /></div>
              <div>
                <div className="text-[11px] uppercase tracking-wide opacity-75 leading-none">AzoApp Field Agent</div>
                <div className="text-lg font-extrabold leading-tight mt-0.5">{user?.name || me?.name}</div>
              </div>
            </div>
            <button onClick={logout} data-testid="agent-logout" className="w-10 h-10 grid place-items-center rounded-xl bg-white/15 ring-1 ring-white/20 hover:bg-white/25 active:scale-95 transition"><LogOut className="w-4 h-4" /></button>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto pb-4">
          {tab === "home" && <HomeTab me={me} wallet={wallet} earnings={earnings} onScan={() => setTab("map")} onWallet={() => setTab("wallet")} />}
          {tab === "map" && (
            <div className="p-4">
              <SectionTitle icon={ScanLine} title="Activate a sticker" sub="Scan the printed QR, then pick the shop." />
              <QrMapPanel onMapped={() => { loadMe(); loadEarnings(); toast.success(`You earned ${money(me?.config?.commission_per_mapping)}!`); }} />
            </div>
          )}
          {tab === "earnings" && <EarningsTab earnings={earnings} />}
          {tab === "wallet" && <WalletTab me={me} wallet={wallet} onChanged={() => { loadMe(); }} onProfile={() => setTab("profile")} />}
          {tab === "profile" && <ProfileTab me={me} onChanged={loadMe} logout={logout} />}
        </main>

        <nav className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_16px_-8px_rgba(15,23,42,0.25)] flex px-1 pt-1">
          {TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                data-testid={`agent-nav-${t.key}`}
                className="flex-1 flex flex-col items-center gap-1 py-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <span className={`px-4 py-1 rounded-full transition-all ${on ? "bg-blue-50 dark:bg-blue-900/40" : ""}`}>
                  <t.icon className={`w-5 h-5 transition-colors ${on ? "text-[#0D47A1]" : "text-slate-400"}`} strokeWidth={on ? 2.4 : 2} />
                </span>
                <span className={`text-[10px] font-medium transition-colors ${on ? "text-[#0D47A1]" : "text-slate-400"}`}>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, sub }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Icon className="w-5 h-5 text-[#0D47A1]" /> {title}</h2>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function HomeTab({ me, wallet, earnings, onScan, onWallet }) {
  if (!me) return <div className="py-20 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D47A1] to-[#1769d6] text-white p-5 shadow-lg">
        <div className="text-xs opacity-80">Available to withdraw</div>
        <div className="text-3xl font-extrabold mt-1" data-testid="agent-available">{money(wallet.available)}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div><div className="text-lg font-bold">{wallet.mappings ?? 0}</div><div className="text-[10px] opacity-80">Mapped</div></div>
          <div><div className="text-lg font-bold">{money(wallet.total_earned)}</div><div className="text-[10px] opacity-80">Earned</div></div>
          <div><div className="text-lg font-bold">{money(wallet.withdrawn)}</div><div className="text-[10px] opacity-80">Withdrawn</div></div>
        </div>
      </div>

      <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-amber-500" />
        <div className="text-sm">
          <div className="font-semibold text-amber-800 dark:text-amber-300">Earn {money(me?.config?.commission_per_mapping)} per shop</div>
          <div className="text-xs text-amber-700/80 dark:text-amber-400/80">Every successful QR you map to a shop pays you.</div>
        </div>
      </div>

      <button onClick={onScan} data-testid="agent-home-scan"
        className="w-full rounded-2xl bg-[#0D47A1] text-white py-4 font-semibold flex items-center justify-center gap-2 shadow-md active:scale-[0.99] transition">
        <ScanLine className="w-5 h-5" /> Scan &amp; map a QR
      </button>

      <div className="rounded-2xl bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#0D47A1]" /> Recent mappings</h3>
          <button onClick={onWallet} className="text-xs text-[#0D47A1] flex items-center">Wallet <ChevronRight className="w-3 h-3" /></button>
        </div>
        {earnings.slice(0, 4).map((e) => (
          <div key={e.id} className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700 first:border-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/40 grid place-items-center"><Store className="w-4 h-4 text-[#0D47A1]" /></div>
              <div>
                <div className="text-sm text-slate-700 dark:text-slate-200">{e.merchant_name}</div>
                <div className="text-[10px] text-slate-400">{new Date(e.at).toLocaleDateString()}</div>
              </div>
            </div>
            <span className="text-sm font-semibold text-emerald-600">+{money(e.amount)}</span>
          </div>
        ))}
        {earnings.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No mappings yet — start scanning!</p>}
      </div>
    </div>
  );
}

function EarningsTab({ earnings }) {
  return (
    <div className="p-4">
      <SectionTitle icon={Receipt} title="Mapping history" sub="Every shop you activated & what you earned." />
      <div className="space-y-2">
        {earnings.map((e) => (
          <div key={e.id} data-testid="agent-earning-row" className="rounded-xl bg-white dark:bg-slate-800 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/40 grid place-items-center"><Store className="w-4 h-4 text-[#0D47A1]" /></div>
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.merchant_name}</div>
                <div className="text-[11px] text-slate-400 font-mono">{e.token} · {new Date(e.at).toLocaleString()}</div>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-600">+{money(e.amount)}</span>
          </div>
        ))}
        {earnings.length === 0 && <p className="text-sm text-slate-400 py-10 text-center">No mappings yet.</p>}
      </div>
    </div>
  );
}

function WalletTab({ me, wallet, onChanged, onProfile }) {
  const [withdrawals, setWithdrawals] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const bankVerified = me?.bank?.verified;

  const load = useCallback(async () => {
    try { const { data } = await api.get("/agent/withdrawals"); setWithdrawals(data.withdrawals || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.post("/agent/withdraw", { amount: Number(amount) });
      toast.success("Withdrawal requested");
      setShowForm(false); setAmount("");
      load(); onChanged && onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not withdraw"); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-4 space-y-4">
      <SectionTitle icon={Wallet} title="Wallet" sub="Withdraw your earnings to your bank." />
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-500 text-white p-5">
        <div className="text-xs opacity-80">Available balance</div>
        <div className="text-3xl font-extrabold mt-1">{money(wallet.available)}</div>
        <div className="text-xs opacity-80 mt-1">Pending: {money(wallet.pending)} · Withdrawn: {money(wallet.withdrawn)}</div>
      </div>

      {!bankVerified ? (
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">Verify your bank first</p>
          <p className="text-xs text-amber-700/80 mt-0.5">Add &amp; get your bank details verified before withdrawing.</p>
          <button onClick={onProfile} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white">Go to Profile</button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} data-testid="agent-withdraw-open"
          className="w-full rounded-2xl bg-[#0D47A1] text-white py-3.5 font-semibold flex items-center justify-center gap-2">
          <Banknote className="w-5 h-5" /> Withdraw
        </button>
      )}

      <div className="rounded-2xl bg-white dark:bg-slate-800 p-4">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-2">Withdrawal history</h3>
        {withdrawals.map((w) => (
          <div key={w.id} className="flex items-center justify-between py-2 border-t border-slate-100 dark:border-slate-700 first:border-0">
            <div>
              <div className="text-sm text-slate-700 dark:text-slate-200">{money(w.amount)}</div>
              <div className="text-[10px] text-slate-400">{new Date(w.requested_at).toLocaleString()}</div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${w.status === "approved" ? "bg-emerald-100 text-emerald-700" : w.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{w.status}</span>
          </div>
        ))}
        {withdrawals.length === 0 && <p className="text-sm text-slate-400 py-3 text-center">No withdrawals yet.</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end justify-center" onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">Withdraw amount</h3>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              data-testid="agent-withdraw-amount" placeholder={`Available ${money(wallet.available)}`}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100" />
            <div className="text-xs text-slate-400 mt-1">Min {money(me?.config?.min_withdrawal)} · Max {money(me?.config?.max_withdrawal)}</div>
            <button onClick={submit} disabled={busy} data-testid="agent-withdraw-submit"
              className="mt-3 w-full rounded-lg bg-[#0D47A1] text-white py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />} Request withdrawal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileTab({ me, onChanged, logout }) {
  const bank = me?.bank;
  const [form, setForm] = useState({ account_name: "", account_number: "", ifsc: "", bank_name: "", upi: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (bank) setForm({
      account_name: bank.account_name || "", account_number: bank.account_number || "",
      ifsc: bank.ifsc || "", bank_name: bank.bank_name || "", upi: bank.upi || "",
    });
  }, [bank]);
  const f = (k) => (e) => setForm({ ...form, [k]: k === "ifsc" ? e.target.value.toUpperCase() : e.target.value });
  const save = async () => {
    setBusy(true);
    try {
      await api.post("/agent/bank", form);
      toast.success("Bank details submitted — awaiting admin verification");
      onChanged && onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(false); }
  };
  return (
    <div className="p-4 space-y-4">
      <SectionTitle icon={User} title="Profile & Bank" sub="Add your bank to receive payouts." />
      <div className="rounded-2xl bg-white dark:bg-slate-800 p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/40 grid place-items-center"><User className="w-6 h-6 text-[#0D47A1]" /></div>
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">{me?.name}</div>
          <div className="text-xs text-slate-400">{me?.phone}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Banknote className="w-4 h-4 text-[#0D47A1]" /> Bank details</h3>
          {bank && (
            <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${bank.verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {bank.verified ? <><ShieldCheck className="w-3 h-3" /> Verified</> : "Pending verify"}
            </span>
          )}
        </div>
        <div className="space-y-2">
          <input value={form.account_name} onChange={f("account_name")} placeholder="Account holder name" data-testid="agent-bank-name"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          <input value={form.account_number} onChange={f("account_number")} placeholder="Account number" data-testid="agent-bank-account"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          <input value={form.ifsc} onChange={f("ifsc")} placeholder="IFSC (e.g. HDFC0001234)" data-testid="agent-bank-ifsc"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          <input value={form.bank_name} onChange={f("bank_name")} placeholder="Bank name (optional)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          <input value={form.upi} onChange={f("upi")} placeholder="UPI ID (optional)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
        </div>
        <button onClick={save} disabled={busy} data-testid="agent-bank-save"
          className="mt-3 w-full rounded-lg bg-[#0D47A1] text-white py-2.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} {bank ? "Update bank details" : "Submit bank details"}
        </button>
        {bank && !bank.verified && <p className="text-xs text-amber-600 mt-2 text-center">Waiting for admin to verify your bank before you can withdraw.</p>}
      </div>

      <button onClick={logout} className="w-full rounded-2xl border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 py-3 font-medium flex items-center justify-center gap-2">
        <LogOut className="w-4 h-4" /> Logout
      </button>
    </div>
  );
}
