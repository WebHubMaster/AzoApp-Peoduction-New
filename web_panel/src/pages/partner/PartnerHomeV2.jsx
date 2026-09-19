import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import dayjs from "dayjs";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import api, { fmt, fmtC } from "@/lib/api";
import { StatusBadge } from "@/components/partner/ui/kit";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  IndianRupee, Wallet, TrendingUp, TrendingDown, Star, CheckCircle2, Navigation, Briefcase,
  Clock, Zap, ChevronRight, ShieldCheck, AlertTriangle, CalendarDays, RefreshCw, Award,
  Target, XCircle, Timer, FileText, LifeBuoy, CreditCard, Package, ArrowUpRight, MapPin, Crown,
} from "lucide-react";

/* ------------------------------------------------------------------ helpers */

const PRESETS = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "365d", label: "1Y" },
  { key: "all", label: "All" },
];

const RANGE_LABEL = {
  "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
  "365d": "Last 1 year", "all": "All time", "custom": "Custom range",
};

// Money with exact-value native tooltip on hover/tap.
const Money = ({ value, className = "" }) => (
  <span className={className} title={fmt(value)}>{fmtC(value)}</span>
);

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good night";
};

const initials = (name) =>
  (name || "P").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();

/* ------------------------------------------------------------------ skeleton */

const Sk = ({ className = "" }) => (
  <div className={`animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/70 ${className}`} />
);

function DashboardSkeleton() {
  return (
    <div className="space-y-5" data-testid="ph-skeleton">
      <Sk className="h-20" />
      <div className="grid lg:grid-cols-3 gap-5">
        <Sk className="h-56 lg:col-span-2" />
        <Sk className="h-56" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <Sk key={i} className="h-24" />)}
      </div>
      <Sk className="h-72" />
    </div>
  );
}

/* ------------------------------------------------------------------ data hook */

function usePartnerDashboard() {
  // filter = { key, from?, to? }
  const [filter, setFilter] = useState({ key: "30d" });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const seq = useRef(0);

  const qs = useMemo(() => {
    if (filter.key === "custom" && filter.from && filter.to) {
      return `date_from=${filter.from}&date_to=${filter.to}`;
    }
    return `range=${filter.key}`;
  }, [filter]);

  const load = useCallback((showSpin = true) => {
    const id = ++seq.current;
    if (showSpin) setLoading(true);
    setError(false);
    api.get(`/bookings/partner/dashboard?${qs}`)
      .then((r) => { if (id === seq.current) { setData(r.data); setLoading(false); } })
      .catch(() => { if (id === seq.current) { setError(true); setLoading(false); } });
  }, [qs]);

  useEffect(() => { load(true); }, [load]);

  return { filter, setFilter, data, loading, error, reload: () => load(false) };
}

/* ------------------------------------------------------------------ date range */

function RangeControl({ filter, setFilter }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(undefined);

  const applyPreset = (from, to) => {
    setFilter({ key: "custom", from: dayjs(from).format("YYYY-MM-DD"), to: dayjs(to).format("YYYY-MM-DD") });
    setOpen(false);
  };
  const quick = [
    { label: "Today", fn: () => applyPreset(new Date(), new Date()) },
    { label: "Yesterday", fn: () => applyPreset(dayjs().subtract(1, "day"), dayjs().subtract(1, "day")) },
    { label: "This month", fn: () => applyPreset(dayjs().startOf("month"), new Date()) },
    { label: "Last month", fn: () => applyPreset(dayjs().subtract(1, "month").startOf("month"), dayjs().subtract(1, "month").endOf("month")) },
  ];
  const isCustom = filter.key === "custom";
  const customLabel = isCustom
    ? `${dayjs(filter.from).format("D MMM")} – ${dayjs(filter.to).format("D MMM")}`
    : "Custom";

  return (
    <div className="flex items-center gap-1 bg-white/10 backdrop-blur rounded-xl p-1 overflow-x-auto no-scrollbar" data-testid="ph-range">
      {PRESETS.map((r) => (
        <button
          key={r.key}
          data-testid={`range-${r.key}`}
          onClick={() => setFilter({ key: r.key })}
          className={`shrink-0 min-w-[46px] px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter.key === r.key ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"}`}
        >
          {r.label}
        </button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            data-testid="range-custom"
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-all ${isCustom ? "bg-white text-slate-900 shadow" : "text-white/70 hover:text-white"}`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> {customLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0 rounded-2xl overflow-hidden" data-testid="range-popover">
          <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-100 dark:border-slate-800">
            {quick.map((q) => (
              <button key={q.label} onClick={q.fn}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:text-primary-700">
                {q.label}
              </button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={sel}
            onSelect={setSel}
            numberOfMonths={1}
            captionLayout="dropdown-buttons"
            fromYear={2023}
            toYear={dayjs().year()}
            defaultMonth={new Date()}
          />
          <div className="flex items-center justify-between gap-2 p-3 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => { setSel(undefined); }} className="text-xs font-semibold text-slate-500 hover:text-slate-700">Clear</button>
            <button
              data-testid="range-apply"
              disabled={!sel?.from || !sel?.to}
              onClick={() => { if (sel?.from && sel?.to) applyPreset(sel.from, sel.to); }}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-primary-700 text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ chart tooltip */

function ChartTip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl bg-slate-900 text-white px-3 py-2 shadow-xl text-xs">
      <p className="font-semibold text-white/70">{dayjs(label).format("ddd, D MMM YYYY")}</p>
      <p className="font-bold text-emerald-300 mt-1">{fmt(p.amount)}</p>
      <p className="text-white/60">{p.jobs} job{p.jobs === 1 ? "" : "s"} completed</p>
    </div>
  );
}

/* ------------------------------------------------------------------ small UI bits */

const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 ${className}`} {...rest}>
    {children}
  </div>
);

function Ring({ value, size = 76, stroke = 8, color = "#0D47A1", label, sub }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} style={{ transition: "stroke-dashoffset .6s ease" }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-heading font-black text-slate-900 dark:text-white text-sm">{value == null ? "—" : `${pct}%`}</span>
        </div>
      </div>
      <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 mt-2">{label}</p>
      {sub && <p className="text-[10.5px] text-slate-400">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ MAIN */

export function PartnerHome({ onNavigate, user, kit, online, onToggleOnline, connected }) {
  const { filter, setFilter, data, loading, error, reload } = usePartnerDashboard();

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-900/10 p-10 text-center" data-testid="ph-error">
        <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto" />
        <p className="font-semibold text-slate-800 dark:text-slate-100 mt-3">Unable to load your dashboard</p>
        <button onClick={() => reload()} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-700 text-white text-sm font-semibold">
          <RefreshCw className="h-4 w-4" /> Retry
        </button>
      </div>
    );
  }

  const k = data.kpis;
  const wallet = data.wallet || {};
  const growth = data.growth || {};
  const chart = data.earnings_chart || [];
  const kycApproved = user?.kyc_status === "approved" || user?.verified_partner;

  // ---- smart priority action ----
  let priority = null;
  if (!kycApproved) {
    priority = { tone: "amber", icon: ShieldCheck, title: "Complete your KYC", desc: "Finish verification to start receiving jobs & withdrawals.", cta: "Complete KYC", go: "onboarding" };
  } else if (k.active_jobs > 0) {
    priority = { tone: "primary", icon: Navigation, title: `${k.active_jobs} active job${k.active_jobs > 1 ? "s" : ""} in progress`, desc: "Track and complete your ongoing work.", cta: "Track jobs", go: "active" };
  } else if (k.open_requests > 0) {
    priority = { tone: "emerald", icon: Zap, title: `${k.open_requests} new job request${k.open_requests > 1 ? "s" : ""} available`, desc: "Accept quickly before they expire.", cta: "View requests", go: "jobs" };
  } else if (kit && kit.purchased === false && kit.status) {
    priority = { tone: "violet", icon: Package, title: "Starter Kit", desc: "Track your Starter Kit status.", cta: "View status", go: "starterkit" };
  }

  const toneMap = {
    amber: "from-amber-500 to-orange-500",
    primary: "from-primary-700 to-primary-500",
    emerald: "from-emerald-600 to-emerald-500",
    violet: "from-violet-600 to-primary-700",
  };

  // ---- KPI cards (real data only) ----
  const kpis = [
    { label: "Completed", value: k.jobs_completed, icon: CheckCircle2, tone: "text-emerald-500", go: "active" },
    { label: "Active", value: k.active_jobs, icon: Navigation, tone: "text-sky-500", go: "active" },
    { label: "Requests", value: k.open_requests, icon: Briefcase, tone: "text-amber-500", go: "jobs" },
    { label: "Missed", value: k.missed_jobs, icon: XCircle, tone: "text-rose-500", go: "jobs" },
    { label: "Avg / job", money: k.avg_per_job, icon: TrendingUp, tone: "text-violet-500" },
    { label: "Lifetime jobs", value: k.lifetime_jobs, icon: Award, tone: "text-primary-500" },
    { label: "Rating", value: (k.rating || 0).toFixed(1), icon: Star, tone: "text-amber-400", suffix: k.reviews_count ? ` · ${k.reviews_count}` : "" },
    { label: "Cancelled", value: k.cancelled, icon: AlertTriangle, tone: "text-slate-400" },
  ];

  // ---- alerts ----
  const alerts = [];
  if (!kycApproved) alerts.push({ icon: ShieldCheck, tone: "amber", title: "KYC pending", desc: `Status: ${user?.kyc_status || "not started"}. Complete to receive jobs.`, cta: "Complete", go: "onboarding" });
  if (kycApproved && wallet.withdrawable <= 0 && wallet.available <= 0) alerts.push({ icon: Wallet, tone: "slate", title: "No balance yet", desc: "Complete jobs to build your withdrawable balance.", cta: "See jobs", go: "jobs" });
  if (kit && kit.locked) alerts.push({ icon: Package, tone: "violet", title: "Starter Kit required", desc: "Purchase the Starter Kit to unlock all features.", cta: "View", go: "starterkit" });

  const quickActions = [
    { label: "Requests", icon: Briefcase, go: "jobs", badge: k.open_requests },
    { label: "Active", icon: Navigation, go: "active", badge: k.active_jobs },
    { label: "Wallet", icon: Wallet, go: "wallet" },
    { label: "Earnings", icon: TrendingUp, go: "earnings" },
    { label: "Invoices", icon: FileText, go: "invoices" },
    { label: "Support", icon: LifeBuoy, go: "support" },
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-6" data-testid="partner-home">
      {/* ===================== HEADER ===================== */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <Card className="p-4 sm:p-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-gradient-to-br from-primary-700 to-primary-500 text-white grid place-items-center font-heading font-black text-lg shadow-md">
                {initials(user?.name)}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full ring-2 ring-white dark:ring-slate-900 ${online ? "bg-emerald-500" : "bg-slate-300"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] text-slate-400 leading-none">{greeting()},</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <h1 className="font-heading font-extrabold text-lg sm:text-2xl text-slate-900 dark:text-white leading-none truncate">{(user?.name || "Partner").split(" ")[0]} 👋</h1>
                {(user?.premium_partner || kit?.purchased) && (
                  <span data-testid="partner-premium-badge" className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-amber-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm">
                    <Crown className="h-3 w-3" /> {user?.partner_badge || kit?.badge_label || "Pro"}
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-slate-400 mt-1 flex items-center gap-2 truncate">
                {user?.partner_code && <span className="font-mono">{user.partner_code}</span>}
                {user?.city && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{user.city}</span>}
                <span className={`inline-flex items-center gap-1 ${connected ? "text-emerald-500" : "text-slate-400"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300"}`} /> {connected ? "Live" : "Offline"}
                </span>
              </p>
            </div>
          </div>
          <button type="button" onClick={() => onToggleOnline?.(!online)} data-testid="online-toggle-wrap"
            className={`shrink-0 flex items-center gap-2.5 rounded-2xl px-3 py-2 border transition-colors ${online ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800" : "border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700"}`}>
            <div className="text-right hidden xs:block sm:block">
              <p className={`text-[13px] font-bold leading-none ${online ? "text-emerald-700 dark:text-emerald-300" : "text-slate-500"}`}>{online ? "Online" : "Offline"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 hidden sm:block">{online ? "Ready for jobs" : "Tap to go online"}</p>
            </div>
            <Switch data-testid="online-toggle" checked={online} onCheckedChange={onToggleOnline} />
          </button>
        </Card>
      </motion.div>

      {/* ===================== PRIORITY ACTION ===================== */}
      {priority && (
        <motion.button
          type="button"
          data-testid="ph-priority"
          onClick={() => onNavigate?.(priority.go)}
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }}
          className={`w-full text-left rounded-2xl bg-gradient-to-r ${toneMap[priority.tone]} text-white p-4 sm:p-5 flex items-center gap-3 shadow-lg active:scale-[0.99] transition-transform`}
        >
          <div className="h-11 w-11 rounded-xl bg-white/20 grid place-items-center shrink-0"><priority.icon className="h-5.5 w-5.5" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-heading font-extrabold text-[15px] sm:text-base leading-tight">{priority.title}</p>
            <p className="text-[12px] text-white/85 mt-0.5 truncate">{priority.desc}</p>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 bg-white/20 rounded-xl px-3 py-2 text-[13px] font-bold">{priority.cta} <ChevronRight className="h-4 w-4" /></span>
        </motion.button>
      )}

      {/* ===================== EARNINGS HERO + WALLET ===================== */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Earnings hero */}
        <motion.section
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          data-testid="ph-hero"
          className="lg:col-span-2 relative overflow-hidden rounded-[24px] bg-slate-900 text-white p-5 sm:p-6 shadow-[0_24px_50px_-24px_rgba(15,23,42,0.8)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(110%_80%_at_100%_0%,rgba(16,185,129,0.45),transparent_55%),radial-gradient(85%_70%_at_0%_100%,rgba(29,78,216,0.5),transparent_60%)]" />
          <div className="absolute inset-0 opacity-[0.05] bg-[linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] bg-[size:26px_26px]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-white/60 inline-flex items-center gap-1.5"><IndianRupee className="h-3.5 w-3.5" /> Earnings · {RANGE_LABEL[filter.key] || "Custom"}</p>
                <p className="font-heading font-black text-[34px] sm:text-5xl leading-none tracking-tight mt-2" data-testid="ph-earnings">
                  <Money value={k.earnings} />
                </p>
              </div>
              {k.rating ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur px-2.5 py-1 text-[12px] font-semibold ring-1 ring-white/15">
                  <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" /> {(k.rating || 0).toFixed(1)}
                </span>
              ) : null}
            </div>

            <div className="mt-4"><RangeControl filter={filter} setFilter={setFilter} /></div>

            {/* Today / Week / Month */}
            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                { l: "Today", v: k.today_earnings },
                { l: "This week", v: k.week_earnings },
                { l: "This month", v: k.month_earnings },
              ].map((x) => (
                <div key={x.l} className="rounded-2xl bg-white/10 backdrop-blur border border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-widest text-white/55">{x.l}</p>
                  <p className="font-heading font-black text-[16px] sm:text-lg mt-1"><Money value={x.v} /></p>
                </div>
              ))}
            </div>

            {/* mini earnings sparkline */}
            <div className="mt-4 h-24 sm:h-28 -mx-1">
              {chart.length === 0 ? (
                <div className="h-full grid place-items-center text-white/50 text-[13px]">No earnings in this period yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#34d399" stopOpacity={0.7} />
                        <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <RTooltip content={<ChartTip />} cursor={{ stroke: "rgba(255,255,255,0.2)" }} />
                    <Area type="monotone" dataKey="amount" stroke="#34d399" strokeWidth={2.5} fill="url(#heroGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </motion.section>

        {/* Wallet */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}>
          <Card className="p-5 h-full flex flex-col" data-testid="ph-wallet">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-slate-800 dark:text-white flex items-center gap-2"><Wallet className="h-5 w-5 text-primary-700" /> Wallet</h3>
              <button onClick={() => onNavigate?.("wallet")} className="text-[12px] font-semibold text-primary-700 dark:text-primary-300 inline-flex items-center">Details <ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-widest text-slate-400">Available balance</p>
              <p className="font-heading font-black text-3xl text-slate-900 dark:text-white mt-1"><Money value={wallet.available} /></p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/15 p-3">
                <p className="text-[10px] uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Withdrawable</p>
                <p className="font-heading font-extrabold text-[15px] text-emerald-700 dark:text-emerald-300 mt-0.5"><Money value={wallet.withdrawable} /></p>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/15 p-3">
                <p className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-400">Pending</p>
                <p className="font-heading font-extrabold text-[15px] text-amber-700 dark:text-amber-300 mt-0.5"><Money value={wallet.pending} /></p>
              </div>
            </div>
            <div className="flex items-center justify-between text-[12px] text-slate-400 mt-3">
              <span>Total withdrawn</span><span className="font-semibold text-slate-600 dark:text-slate-300"><Money value={wallet.total_withdrawn} /></span>
            </div>
            <button
              data-testid="ph-withdraw"
              onClick={() => onNavigate?.("wallet")}
              disabled={wallet.withdrawable <= 0}
              className="mt-auto w-full h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ArrowUpRight className="h-4 w-4" /> {wallet.withdrawable > 0 ? "Withdraw" : "Nothing to withdraw"}
            </button>
          </Card>
        </motion.div>
      </div>

      {/* ===================== KPI GRID ===================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="ph-kpis">
        {kpis.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => m.go && onNavigate?.(m.go)}
            className={`text-left rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-3.5 transition-all ${m.go ? "hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]" : "cursor-default"}`}
          >
            <div className="flex items-center justify-between">
              <m.icon className={`h-4.5 w-4.5 ${m.tone}`} strokeWidth={2} />
              {m.go && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
            </div>
            <p className="font-heading font-black text-[20px] text-slate-900 dark:text-white mt-2 tabular-nums leading-none">
              {m.money != null ? <Money value={m.money} /> : m.value}{m.suffix || ""}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">{m.label}</p>
          </button>
        ))}
      </div>

      {/* ===================== CHART + PERFORMANCE ===================== */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Earnings trend (full) */}
        <Card className="lg:col-span-2 p-5" data-testid="ph-chart">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="font-heading font-bold text-slate-800 dark:text-white">Earnings trend</h3>
              <p className="text-[12px] text-slate-400">{RANGE_LABEL[filter.key] || "Custom range"} · {k.jobs_completed} job{k.jobs_completed === 1 ? "" : "s"}</p>
            </div>
            {k.cancelled > 0 && <span className="text-[11px] text-rose-500 inline-flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> {k.cancelled} cancelled</span>}
          </div>
          {chart.length === 0 ? (
            <div className="h-56 grid place-items-center text-slate-400 text-sm">No earnings in this period yet.</div>
          ) : (
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0D47A1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0D47A1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-slate-100 dark:stroke-slate-800" />
                  <XAxis dataKey="date" tickFormatter={(d) => dayjs(d).format("D MMM")} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} width={44} />
                  <RTooltip content={<ChartTip />} cursor={{ stroke: "#0D47A1", strokeOpacity: 0.15 }} />
                  <Area type="monotone" dataKey="amount" stroke="#0D47A1" strokeWidth={2.5} fill="url(#trendGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Performance */}
        <Card className="p-5" data-testid="ph-performance">
          <h3 className="font-heading font-bold text-slate-800 dark:text-white flex items-center gap-2"><Target className="h-5 w-5 text-primary-700" /> Performance</h3>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Ring value={k.completion_rate} label="Completion" color="#059669" />
            <Ring value={k.acceptance_rate} label="Acceptance" color="#0D47A1" sub={k.offered ? `${k.accepted}/${k.offered}` : "no offers yet"} />
          </div>
          <div className="mt-4 space-y-2.5">
            <PerfRow icon={Star} tone="text-amber-400" label="Average rating" value={`${(k.rating || 0).toFixed(1)}${k.reviews_count ? ` (${k.reviews_count})` : ""}`} />
            <PerfRow icon={XCircle} tone="text-rose-500" label="Cancellation rate" value={k.cancellation_rate == null ? "—" : `${k.cancellation_rate}%`} />
            <PerfRow icon={Timer} tone="text-sky-500" label="Accept streak" value={`${k.accept_streak} · best ${k.best_streak}`} />
            <PerfRow icon={TrendingUp} tone="text-violet-500" label="Avg / job" value={<Money value={k.avg_per_job} />} />
          </div>
        </Card>
      </div>

      {/* ===================== GROWTH + RECENT ===================== */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Growth */}
        <Card className="p-5" data-testid="ph-growth">
          <div className="flex items-center justify-between">
            <h3 className="font-heading font-bold text-slate-800 dark:text-white flex items-center gap-2"><Award className="h-5 w-5" style={{ color: growth.color }} /> Your growth</h3>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white" style={{ background: growth.color }}>{growth.label}</span>
          </div>
          <div className="mt-4">
            {growth.next_label ? (
              <>
                <div className="flex items-center justify-between text-[12px] mb-1.5">
                  <span className="text-slate-500 dark:text-slate-400">{growth.progress}% to {growth.next_label}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{growth.jobs_to_next} jobs to go</span>
                </div>
                <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${growth.progress}%`, background: `linear-gradient(90deg, ${growth.color}, #34d399)` }} />
                </div>
                <p className="text-[12px] text-slate-400 mt-2">You&apos;ve completed <b className="text-slate-700 dark:text-slate-200">{growth.lifetime_jobs}</b> jobs. Reach <b>{growth.next_min}</b> to unlock <b>{growth.next_label}</b>.</p>
              </>
            ) : (
              <p className="text-[13px] text-slate-500">🎉 You&apos;ve reached the highest tier — <b>{growth.label}</b>! Keep up the great work.</p>
            )}
          </div>
          {/* alerts */}
          {alerts.length > 0 && (
            <div className="mt-5 space-y-2.5">
              {alerts.map((a, i) => (
                <button key={i} onClick={() => onNavigate?.(a.go)} className="w-full text-left flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${a.tone === "amber" ? "bg-amber-100 text-amber-600" : a.tone === "violet" ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"}`}><a.icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-tight">{a.title}</p>
                    <p className="text-[11.5px] text-slate-400 truncate">{a.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Recent jobs */}
        <Card className="lg:col-span-2 overflow-hidden" data-testid="ph-recent">
          <div className="flex items-center justify-between px-5 py-4">
            <h3 className="font-heading font-bold text-slate-800 dark:text-white">Recent jobs</h3>
            <button onClick={() => onNavigate?.("active")} className="text-[13px] font-semibold text-primary-700 dark:text-primary-300 inline-flex items-center active:opacity-60">View all <ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recent.length === 0 && (
              <div className="py-12 text-center">
                <Briefcase className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-400 mt-2">No jobs yet. Complete your first job to start earning.</p>
              </div>
            )}
            {data.recent.map((b) => {
              const amt = b.total || (b.pricing && b.pricing.total) || 0;
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-xl bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 grid place-items-center shrink-0"><Briefcase className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="font-semibold text-[14.5px] text-slate-800 dark:text-slate-100 truncate">{b.service_name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">#{b.code}{b.customer_name ? ` · ${b.customer_name}` : ""}{b.updated_at ? ` · ${dayjs(b.updated_at).format("D MMM")}` : ""}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-heading font-bold text-[14px] text-slate-900 dark:text-white"><Money value={amt} /></p>
                    <div className="mt-1 flex justify-end"><StatusBadge status={b.status} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ===================== QUICK ACTIONS ===================== */}
      <Card className="p-5" data-testid="ph-quick">
        <h3 className="font-heading font-bold text-slate-800 dark:text-white mb-4">Quick actions</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {quickActions.map((q) => (
            <button key={q.label} onClick={() => onNavigate?.(q.go)}
              className="relative flex flex-col items-center gap-2 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-3.5 hover:shadow-md hover:-translate-y-0.5 active:scale-[0.97] transition-all">
              {q.badge > 0 && <span className="absolute top-2 right-2 h-5 min-w-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center">{q.badge}</span>}
              <span className="h-11 w-11 rounded-2xl bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 grid place-items-center"><q.icon className="h-5 w-5" /></span>
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">{q.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PerfRow({ icon: Icon, tone, label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-2"><Icon className={`h-4 w-4 ${tone}`} /> {label}</span>
      <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

export default PartnerHome;
