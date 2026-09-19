import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Users, TrendingUp, CheckCircle2, Wallet, Coins, PiggyBank, Sparkles, Download, Activity, History } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import api from "@/lib/api";
import { Card, KpiCard, SectionHeader, StatusBadge, EmptyState, fmt, fmtNum, dt, cn } from "./kit";
import DataTable from "./DataTable";
import DateRangePicker, { presetRange } from "./DateRangePicker";

const C = { primary: "#0D47A1", secondary: "#1565C0", accent: "#F59E0B", green: "#10b981", violet: "#8b5cf6", rose: "#f43f5e", sky: "#0ea5e9", slate: "#94a3b8" };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shortDate = (s) => { try { const d = new Date(s); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); } catch { return s; } };

function ChartCard({ title, subtitle, icon, children, empty }) {
  return (
    <Card className="p-5">
      <SectionHeader icon={icon} title={title} subtitle={subtitle} />
      {empty ? <EmptyState icon={icon} title="No data for this range" hint="Try a wider date range." />
        : <div className="h-64 w-full">{children}</div>}
    </Card>
  );
}

const tooltipStyle = { borderRadius: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(16,24,40,.08)", fontSize: 12 };

export default function InsightsTab() {
  const init = useMemo(() => { const r = presetRange("30d"); return { from: iso(r.from), to: iso(r.to), preset: "30d" }; }, []);
  const [range, setRange] = useState(init);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refs, setRefs] = useState([]);
  const [audit, setAudit] = useState([]);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/growth/insights?date_from=${range.from}&date_to=${range.to}`).then((r) => setData(r.data)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/admin/growth/referrals").then((r) => setRefs(r.data?.referrals || [])).catch(() => {});
    api.get("/admin/growth/audit").then((r) => setAudit(r.data || [])).catch(() => {});
  }, []);

  const k = data?.kpis || {};
  const refPerf = data?.referral_performance || [];
  const rewardDist = data?.reward_distribution || [];
  const cbPerf = data?.cashback_performance || [];
  const pwaTrend = data?.pwa_trend || [];
  const funnel = data?.funnel || [];
  const funnelMax = Math.max(1, ...funnel.map((s) => s.count));

  const someRef = refPerf.some((r) => r.referrals > 0);
  const someReward = rewardDist.some((r) => r.issued > 0);
  const someCb = cbPerf.some((r) => r.issued > 0);
  const somePwa = pwaTrend.some((r) => r.prompt_views > 0);

  const refCols = [
    { key: "referrer_name", label: "Customer", render: (r) => r.referrer_name },
    { key: "referee_name", label: "Referred Customer", render: (r) => r.referee_name || "—" },
    { key: "booking_code", label: "Booking", render: (r) => r.booking_code || "—" },
    { key: "reward_amount", label: "Amount", align: "right", render: (r) => fmt(r.reward_amount) },
    { key: "reward_status", label: "Reward", render: (r) => <StatusBadge status={r.reward_status === "paid" ? "Reward Paid" : "Pending"} /> },
    { key: "status_label", label: "Status", render: (r) => <StatusBadge status={r.status_label} /> },
    { key: "created_at", label: "Date", render: (r) => dt(r.created_at) },
  ];

  return (
    <div className="space-y-5">
      {/* header + range */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Showing <b className="text-slate-700 dark:text-slate-200">{data?.range?.from || range.from}</b> to <b className="text-slate-700 dark:text-slate-200">{data?.range?.to || range.to}</b></p>
        <DateRangePicker value={range} onChange={(v) => setRange(v)} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Referrals" value={loading ? "…" : fmtNum(k.total_referrals)} icon={Users} tone="primary" />
        <KpiCard label="Referral Conversion" value={loading ? "…" : `${k.referral_conversion ?? 0}%`} icon={TrendingUp} tone="sky" />
        <KpiCard label="Successful Referrals" value={loading ? "…" : fmtNum(k.successful_referrals)} icon={CheckCircle2} tone="green" />
        <KpiCard label="Rewards Paid" value={loading ? "…" : fmt(k.rewards_paid)} icon={Wallet} tone="violet" />
        <KpiCard label="Cashback Issued" value={loading ? "…" : fmtNum(k.cashback_issued)} icon={Coins} tone="amber" />
        <KpiCard label="Cashback Redeemed" value={loading ? "…" : fmt(k.cashback_redeemed)} icon={PiggyBank} tone="rose" />
        <KpiCard label="Scratch Cards Opened" value={loading ? "…" : fmtNum(k.scratch_opened)} icon={Sparkles} tone="green" />
        <KpiCard label="PWA Installs" value={loading ? "…" : fmtNum(k.pwa_installs)} icon={Download} tone="primary" />
      </div>

      {/* charts grid */}
      <div className="grid lg:grid-cols-2 gap-5">
        <ChartCard title="Referral Performance" subtitle="Referrals vs successful vs pending" icon={TrendingUp} empty={!someRef}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={refPerf} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gRef" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.primary} stopOpacity={0.35} /><stop offset="100%" stopColor={C.primary} stopOpacity={0} /></linearGradient>
                <linearGradient id="gSucc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.3} /><stop offset="100%" stopColor={C.green} stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="referrals" name="Referrals" stroke={C.primary} strokeWidth={2} fill="url(#gRef)" />
              <Area type="monotone" dataKey="successful" name="Successful" stroke={C.green} strokeWidth={2} fill="url(#gSucc)" />
              <Area type="monotone" dataKey="pending" name="Pending" stroke={C.accent} strokeWidth={2} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Reward Distribution" subtitle="Scratch cards issued per reward tier" icon={Coins} empty={!someReward}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rewardDist} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="issued" name="Issued" radius={[6, 6, 0, 0]}>
                {rewardDist.map((_, i) => <Cell key={i} fill={[C.primary, C.secondary, C.sky, C.violet, C.accent, C.slate][i % 6]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Cashback Performance" subtitle="Issued vs redeemed vs expired" icon={PiggyBank} empty={!someCb}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cbPerf} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="issued" name="Issued" stroke={C.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="redeemed" name="Redeemed" stroke={C.green} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expired" name="Expired" stroke={C.rose} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="PWA Installation Trend" subtitle="Prompt views vs installs" icon={Download} empty={!somePwa}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={pwaTrend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs><linearGradient id="gPwa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.sky} stopOpacity={0.35} /><stop offset="100%" stopColor={C.sky} stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="prompt_views" name="Prompt Views" stroke={C.sky} strokeWidth={2} fill="url(#gPwa)" />
              <Area type="monotone" dataKey="installs" name="Installs" stroke={C.primary} strokeWidth={2} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* funnel */}
      <Card className="p-5">
        <SectionHeader icon={Activity} title="Customer Engagement Funnel" subtitle="From shared referral to credited reward" />
        <div className="space-y-2.5">
          {funnel.map((s, i) => {
            const wpct = Math.round((s.count / funnelMax) * 100);
            const conv = i === 0 ? 100 : funnel[0].count ? Math.round((s.count / funnel[0].count) * 100) : 0;
            const shade = [C.primary, C.secondary, C.sky, C.violet, C.accent][i % 5];
            return (
              <div key={s.stage} className="flex items-center gap-3">
                <span className="w-40 text-sm font-medium text-slate-600 dark:text-slate-300 shrink-0">{s.stage}</span>
                <div className="flex-1 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                  <div className="h-full rounded-lg flex items-center px-3 text-white text-xs font-bold transition-all" style={{ width: `${Math.max(wpct, 8)}%`, background: shade }}>{fmtNum(s.count)}</div>
                </div>
                <span className="w-12 text-right text-xs font-semibold text-slate-400 shrink-0">{conv}%</span>
              </div>
            );
          })}
          {funnel.length === 0 && <p className="text-sm text-slate-400">No funnel data.</p>}
        </div>
      </Card>

      {/* recent referrals */}
      <div>
        <SectionHeader icon={Users} title="Recent Referrals" subtitle="Latest referral activity" />
        <DataTable
          testId="insights-recent-referrals"
          columns={refCols}
          rows={refs}
          initialPageSize={10}
          searchKeys={["referrer_name", "referee_name", "booking_code"]}
          searchPlaceholder="Search…"
          exportFilename="recent-referrals.csv"
          emptyTitle="No referrals yet"
          emptyIcon={Users}
        />
      </div>

      {/* audit trail */}
      <Card className="p-5">
        <SectionHeader icon={History} title="Audit Trail" subtitle="Configuration changes by admins" />
        {audit.length === 0 ? <EmptyState icon={History} title="No changes logged yet" hint="Growth configuration changes will be recorded here." />
          : (
            <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
              {audit.slice(0, 40).map((a) => (
                <li key={a.id} className="ml-4">
                  <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary-600 ring-4 ring-primary-50 dark:ring-primary-900/30" />
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <p className="text-sm text-slate-700 dark:text-slate-200"><b>{a.actor_name || "Admin"}</b> · <span className="font-medium text-primary-700 dark:text-primary-300">{(a.action || "").replace(/_/g, " ")}</span></p>
                    <span className="text-xs text-slate-400">{dt(a.created_at, true)}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Module: Growth · Entity: {a.entity_id || "—"}</p>
                </li>
              ))}
            </ol>
          )}
      </Card>
    </div>
  );
}
