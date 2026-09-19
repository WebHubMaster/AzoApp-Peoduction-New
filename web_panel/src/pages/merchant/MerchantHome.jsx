import React, { useEffect, useState } from "react";
import {
  TrendingUp, Users, Network, Wallet, Banknote, QrCode,
  ChevronRight, ShieldCheck, Store, Sparkles, Clock, Copy, Check,
} from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { ReportCards, TypeBadge, fmt, fmtDate } from "@/pages/merchant/referral/ReferralShared";

/**
 * Merchant Home = a clean, premium "Referral & Commission" dashboard.
 * Every number is REAL (actual earned commission from the ledger) and
 * privacy-safe. No bookings, no reminders, no fake stats.
 */
export default function MerchantHome({ user, code, onNavigate }) {
  const [copied, setCopied] = useState(false);
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/merchant/overview")
      .then((r) => setDash(r.data)).catch(() => setDash(null)).finally(() => setLoading(false));
  }, []);

  const c = dash?.commission || {};
  const counts = dash?.counts || {};
  const wallet = dash?.wallet || {};
  const recent = dash?.recent_activity || [];
  const shopName = user?.shop_name || user?.name || "My Shop";
  const _h = new Date().getHours();
  const greeting = _h < 12 ? "Good morning" : _h < 17 ? "Good afternoon" : "Good evening";

  const kpiCards = [
    { label: "Total Commission", value: c.total, money: true, primary: true, sub: `${counts.transactions || 0} transactions` },
    { label: "Customer Commission", value: c.customer, money: true },
    { label: "Partner Commission", value: c.partner, money: true },
    { label: "Referred Customers", value: counts.customers },
    { label: "Referred Partners", value: counts.partners, sub: `${counts.active_partners || 0} active` },
    { label: "This Month", value: c.this_month, money: true },
    { label: "Last Month", value: c.last_month, money: true },
    { label: "Today", value: c.today, money: true },
  ];

  const quick = [
    { k: "customers", label: "My Customers", icon: Users, tone: "sky", sub: `${counts.customers || 0} referred` },
    { k: "network", label: "My Partners", icon: Network, tone: "violet", sub: `${counts.partners || 0} referred` },
    { k: "earnings", label: "Commission", icon: TrendingUp, tone: "emerald", sub: "earning history" },
    { k: "scanqr", label: "Scan QR", icon: QrCode, tone: "primary", sub: "share & grow" },
  ];
  const toneCls = {
    sky: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    primary: "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
  };

  if (loading) return <div className="p-10 text-center text-slate-400 text-sm">Loading dashboard…</div>;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true); toast.success("Merchant code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  };

  return (
    <div className="space-y-5" data-testid="merchant-home">
      {/* Hero — premium navy/blue theme (matches app), earned commission stays green */}
      <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white shadow-lg"
        style={{ background: "linear-gradient(135deg,#0A2A66 0%,#0D47A1 45%,#1565C0 100%)" }}>
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 12% 18%, #ffffff 0, transparent 42%), radial-gradient(circle at 88% 82%, #7c3aed 0, transparent 38%)" }} />
        <div className="relative">
          {/* top row: merchant pill + avatar */}
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-[11px] font-semibold">
              <Store className="h-3.5 w-3.5" /> Merchant
            </span>
            <div className="h-9 w-9 rounded-full bg-white/20 grid place-items-center font-heading font-extrabold text-sm">
              {(shopName || "M").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
            </div>
          </div>

          {/* greeting */}
          <p className="text-sky-100/80 text-[11px] font-semibold uppercase tracking-widest mt-4">{greeting}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <h1 className="font-heading font-black text-2xl sm:text-3xl truncate">{shopName}</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold"><ShieldCheck className="h-3 w-3" /> Verified</span>
          </div>
          <p className="text-sky-100/75 text-[13px] mt-1">Here&apos;s how your referral business is performing today.</p>

          {/* two cards: lifetime earning (green) + merchant code (amber) */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-100/70">Lifetime Commission</p>
              <p className="font-heading font-black text-2xl sm:text-3xl mt-1 tabular-nums text-emerald-300" data-testid="mh-total-earning">{fmt(c.total)}</p>
              <p className="text-[11px] text-sky-100/70 mt-0.5">{counts.transactions || 0} transactions</p>
            </div>
            <button type="button" onClick={copyCode} data-testid="mh-merchant-code"
              className="rounded-2xl p-3.5 text-left transition active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg,#F59E0B 0%,#F97316 100%)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-50/90 flex items-center justify-between">
                Merchant Code {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </p>
              <p className="font-heading font-black text-2xl sm:text-3xl mt-1 tracking-wider">{code || "—"}</p>
              <p className="text-[11px] text-amber-50/90 mt-0.5">Tap to copy &amp; share</p>
            </button>
          </div>

          {/* actions */}
          <div className="mt-4 flex gap-2">
            <button type="button" data-testid="mh-scan" onClick={() => onNavigate("scanqr")}
              className="flex-1 h-11 px-4 rounded-2xl bg-white text-primary-700 text-[13px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
              <QrCode className="h-4 w-4" /> Scan &amp; Share QR
            </button>
            <button type="button" data-testid="mh-withdraw" onClick={() => onNavigate("wallet")}
              className="flex-1 h-11 px-4 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 transition-transform">
              <Banknote className="h-4 w-4" /> Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="mh-quick">
        {quick.map((q) => (
          <button key={q.k} onClick={() => onNavigate(q.k)} data-testid={`mh-quick-${q.k}`}
            className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 text-left hover:border-primary-300 hover:shadow-md transition">
            <div className={`h-10 w-10 rounded-xl grid place-items-center mb-2 ${toneCls[q.tone]}`}><q.icon className="h-5 w-5" /></div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{q.label}</p>
            <p className="text-[11px] text-slate-400">{q.sub}</p>
          </button>
        ))}
      </div>

      {/* KPI report cards (all real) */}
      <div>
        <h3 className="font-heading font-bold text-[15px] text-slate-900 dark:text-white mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-600" /> Commission overview
        </h3>
        <ReportCards cards={kpiCards} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent commission activity */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4" data-testid="mh-recent">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-[15px] text-slate-900 dark:text-white">Recent commission</h3>
            <button type="button" onClick={() => onNavigate("earnings")} className="text-[13px] font-semibold text-primary-700 dark:text-primary-300 inline-flex items-center">
              View all <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {recent.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              <TrendingUp className="h-8 w-8 mx-auto text-slate-300 mb-2" />
              No commission earned yet. Share your QR / merchant code <b className="text-slate-600 dark:text-slate-300">{code || ""}</b> to start earning.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{r.service_name}</p>
                      <TypeBadge type={r.referral_type} />
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{r.name} · {fmtDate(r.created_at)} · {r.booking_code || ""}</p>
                  </div>
                  <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">{fmt(r.earned)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wallet snapshot */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4" data-testid="mh-wallet">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-[15px] text-slate-900 dark:text-white inline-flex items-center gap-1.5">
              <Wallet className="h-4 w-4 text-primary-700" /> Wallet
            </h3>
            <button type="button" onClick={() => onNavigate("wallet")} className="text-primary-700"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <p className="font-heading font-black text-[28px] text-slate-900 dark:text-white tabular-nums">{fmt(wallet.available || 0)}</p>
          <div className="flex flex-col gap-1.5 mt-3 text-[12px]">
            <span className="flex items-center justify-between"><span className="text-slate-400 inline-flex items-center gap-1"><Banknote className="h-3.5 w-3.5 text-emerald-500" /> Withdrawable</span><b className="text-emerald-600">{fmt(wallet.withdrawable || 0)}</b></span>
            <span className="flex items-center justify-between"><span className="text-slate-400 inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Pending</span><b className="text-slate-500">{fmt(wallet.pending || 0)}</b></span>
          </div>
          <button type="button" onClick={() => onNavigate("wallet")} className="mt-4 w-full h-10 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5">
            <Banknote className="h-4 w-4" /> Withdraw
          </button>
        </div>
      </div>

      {/* privacy note */}
      <div className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          You only see your referred customers, partners and your actual earned commission. Personal contact details are protected.
        </p>
      </div>
    </div>
  );
}
