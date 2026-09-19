import { useMemo, useState } from "react";
import {
  Wallet, Radio, AlertTriangle, CheckCircle2, ArrowUpRight, Star, Sparkles, MapPin, Users, Store, QrCode, Trophy,
} from "lucide-react";
import { Card, SectionTitle, Delta, EmptyState, Seg, Sel, Mini, Bar, fmt, fmtC, compact } from "./kit";
import ExactHover from "@/components/ExactHover";

/* ---------------- Revenue vs Earnings ---------------- */
export function EarningsBreakdown({ e = {}, cmp = {}, hasBaseline }) {
  const rows = [
    { k: "Gross Booking Value", v: e.gmv, c: cmp.gmv, bar: "bg-primary-600", hint: "Total of completed/paid bookings" },
    { k: "Partner Earnings", v: e.partner_earnings, c: cmp.partner_earnings, bar: "bg-emerald-500", hint: "Paid out to partners (ledger)" },
    { k: "Platform Fee", v: e.platform_revenue, c: cmp.platform_revenue, bar: "bg-indigo-500", hint: "Platform commission (ledger)" },
    { k: "Merchant Commission", v: e.merchant_commission, c: null, bar: "bg-amber-500", hint: "Referral commission owed to merchants" },
    { k: "Tax Collected", v: e.tax, c: null, bar: "bg-sky-500", hint: "From successful payment invoices" },
    { k: "Refunds", v: e.refunds, c: null, bar: "bg-red-500", hint: `${e.refund_count ?? 0} refund record${e.refund_count === 1 ? "" : "s"}`, invert: true },
    { k: "Net Platform Revenue", v: e.net_revenue, c: null, bar: "bg-slate-800", hint: "Platform fee − merchant commission − refunds", strong: true },
  ];
  return (
    <Card className="p-5" data-testid="dash-earnings">
      <SectionTitle icon={Wallet} sub="Every figure comes from bookings, commission ledger, payment transactions & refunds">Revenue vs Earnings</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        {rows.map((r) => (
          <div key={r.k} data-testid={`earn-${r.k.toLowerCase().replace(/[^a-z]+/g, "-")}`} className={`rounded-xl border p-3.5 relative overflow-hidden ${r.strong ? "border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40" : "border-slate-100 dark:border-slate-800"}`}>
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${r.bar}`} />
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 leading-tight">{r.k}</p>
            <p className={`font-heading font-extrabold text-lg mt-1 tabular-nums ${(r.v || 0) < 0 ? "text-red-600" : "text-slate-900 dark:text-white"}`}>
              <ExactHover value={typeof r.v === "number" ? r.v : null} currency><span>{fmtC(r.v)}</span></ExactHover>
            </p>
            <div className="mt-1 flex items-center gap-1.5">{hasBaseline && r.c !== null && r.c !== undefined ? <Delta v={r.c} invert={r.invert} /> : null}<span className="text-[10px] text-slate-400 truncate">{r.hint}</span></div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- Operations ---------------- */
export function OpsSnapshot({ o = {}, onNavigate }) {
  const items = [
    { l: "Active jobs", v: o.active_total, c: "text-primary-700 bg-primary-50 dark:bg-primary-900/20 dark:text-primary-300", nav: "liveops" },
    { l: "Searching", v: o.searching, c: "text-sky-700 bg-sky-50 dark:bg-sky-900/20 dark:text-sky-300", nav: "dispatch_feed" },
    { l: "Unassigned", v: o.unassigned, c: "text-rose-700 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-300", nav: "dispatch_feed" },
    { l: "Assigned", v: o.assigned, c: "text-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-300", nav: "bookings" },
    { l: "In progress", v: o.ongoing, c: "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-300", nav: "liveops" },
    { l: "Pending", v: o.pending, c: "text-slate-700 bg-slate-100 dark:bg-slate-800 dark:text-slate-300", nav: "bookings" },
    { l: "Awaiting payment", v: o.awaiting_payment, c: "text-orange-700 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-300", nav: "bookings" },
    { l: "Failed payments", v: o.failed_payments, c: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300", nav: "ledger" },
    { l: "Pending refunds", v: o.pending_refunds, c: "text-fuchsia-700 bg-fuchsia-50 dark:bg-fuchsia-900/20 dark:text-fuchsia-300", nav: "refunds" },
    { l: "Pending withdrawals", v: o.pending_withdrawals, c: "text-violet-700 bg-violet-50 dark:bg-violet-900/20 dark:text-violet-300", nav: "pm_withdrawals" },
    { l: "KYC pending", v: o.kyc_pending, c: "text-teal-700 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-300", nav: "partners" },
  ];
  return (
    <Card className="p-5" data-testid="dash-ops">
      <SectionTitle icon={Radio} sub="Live counts · not affected by the date range">Operational Snapshot</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((o) => (
          <button key={o.l} onClick={() => onNavigate?.(o.nav)} data-testid={`ops-${o.l.toLowerCase().replace(/\s+/g, "-")}`} className={`rounded-xl p-3 text-left hover:opacity-90 active:scale-[.98] transition-all ${o.c}`}>
            <p className="font-heading font-extrabold text-xl tabular-nums">{o.v ?? 0}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80 leading-tight">{o.l}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- Needs attention ---------------- */
export function NeedsAttention({ na = {}, onNavigate }) {
  const items = [
    { l: "Unassigned bookings", v: na.unassigned_bookings, nav: "dispatch_feed", tone: "rose" },
    { l: "Failed payments", v: na.failed_payments, nav: "ledger", tone: "rose" },
    { l: "Pending refunds", v: na.pending_refunds, nav: "refunds", tone: "amber" },
    { l: "Pending payouts", v: na.pending_payouts, nav: "payouts", tone: "amber" },
    { l: "Pending withdrawals", v: na.pending_withdrawals, nav: "pm_withdrawals", tone: "amber" },
    { l: "KYC approvals pending", v: na.kyc_pending, nav: "partners", tone: "sky" },
    { l: "Open support tickets", v: na.open_tickets, nav: "tickets", tone: "sky" },
    { l: "Starter kits expiring (30d)", v: na.expiring_starter_kits, nav: "starter_kit_admin", tone: "slate" },
  ].filter((x) => (x.v || 0) > 0);
  const tone = { rose: "bg-rose-50 text-rose-600 dark:bg-rose-900/20", amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/20", sky: "bg-sky-50 text-sky-600 dark:bg-sky-900/20", slate: "bg-slate-100 text-slate-600 dark:bg-slate-800" };
  return (
    <Card className="p-5" data-testid="dash-attention">
      <SectionTitle icon={AlertTriangle} sub="Generated from live system conditions">Needs Attention</SectionTitle>
      {items.length === 0 ? (
        <div className="grid place-items-center py-6 text-center" data-testid="attention-empty">
          <CheckCircle2 className="h-8 w-8 text-emerald-500 mb-2" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Everything looks good</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((x) => (
            <button key={x.l} onClick={() => onNavigate?.(x.nav)} data-testid={`attn-${x.nav}`} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors group">
              <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${tone[x.tone]}`}><AlertTriangle className="h-4 w-4" /></span>
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{x.l}</span>
              <span className="font-heading font-extrabold text-slate-900 dark:text-white tabular-nums">{x.v}</span>
              <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-primary-500" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- Service / Category performance ---------------- */
const SORTS = [{ value: "revenue", label: "Revenue" }, { value: "bookings", label: "Bookings" }, { value: "completed", label: "Completed" }];
export function ServicePerformance({ services = [], categories = [], onPickService, onPickCategory, onReset }) {
  const [view, setView] = useState("service");
  const [sort, setSort] = useState("revenue");
  const rows = useMemo(() => [...(view === "service" ? services : categories)].sort((a, b) => (b[sort] || 0) - (a[sort] || 0)).slice(0, 8), [view, sort, services, categories]);
  const max = rows[0]?.[sort] || 1;
  return (
    <Card className="p-5" data-testid="dash-services">
      <SectionTitle icon={Sparkles} sub="Ranked dynamically from booking records" right={
        <div className="flex items-center gap-2 flex-wrap">
          <Seg value={view} onChange={setView} testid="svc-view" options={[{ value: "service", label: "Services" }, { value: "category", label: "Categories" }]} />
          <Seg value={sort} onChange={setSort} testid="svc-sort" options={SORTS} />
        </div>}>Service Performance</SectionTitle>
      {rows.length === 0 ? <EmptyState onReset={onReset} text="No service activity available for this period." compact /> : (
        <div className="space-y-3">
          {rows.map((s, i) => (
            <button key={s.name} onClick={() => (view === "service" ? onPickService : onPickCategory)?.(s.name)} data-testid={`svc-row-${i}`} className="w-full text-left group">
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-primary-600"><span className="text-slate-400 mr-1.5">#{i + 1}</span>{s.name}</span>
                <span className="text-slate-500 dark:text-slate-400 shrink-0 tabular-nums font-semibold">{sort === "revenue" ? fmtC(s.revenue) : sort === "bookings" ? `${s.bookings} bookings` : `${s.completed} done`}</span>
              </div>
              <Bar pct={(s[sort] || 0) / max * 100} />
              <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span>{s.bookings} bookings</span><span>·</span><span>{s.completed} completed</span><span>·</span>
                <span className={s.cancellation_rate > 0 ? "text-rose-500" : ""}>{s.cancellation_rate}% cancelled</span>
                {s.avg_rating !== null && s.avg_rating !== undefined && <><span>·</span><span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{s.avg_rating} ({s.rated})</span></>}
              </p>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- Top partners ---------------- */
export function TopPartners({ partners = [], onPick, onReset }) {
  return (
    <Card className="p-5" data-testid="dash-partners">
      <SectionTitle icon={Trophy} sub="Ranked by completed jobs, then earnings">Top Performing Partners</SectionTitle>
      {partners.length === 0 ? <EmptyState onReset={onReset} text="No partner activity available for this period." compact /> : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="py-2 pr-2">Partner</th><th className="py-2 pr-2 text-right">Jobs</th><th className="py-2 pr-2 text-right">Done</th><th className="py-2 pr-2 text-right">Rate</th><th className="py-2 pr-2 text-right">Rating</th><th className="py-2 text-right">Earnings</th>
            </tr></thead>
            <tbody>
              {partners.slice(0, 8).map((p, i) => (
                <tr key={p.id || p.name} onClick={() => onPick?.(p.name)} data-testid={`partner-row-${i}`} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`h-7 w-7 rounded-lg grid place-items-center font-bold text-[11px] shrink-0 ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-200 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>#{i + 1}</span>
                      <div className="min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{p.name}</p>{p.city && <p className="text-[10px] text-slate-400">{p.city}</p>}</div>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{p.bookings}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-semibold text-slate-800 dark:text-white">{p.jobs}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{p.completion_rate}%</td>
                  <td className="py-2 pr-2 text-right"><span className="inline-flex items-center gap-0.5 text-slate-700 dark:text-slate-200"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating || "—"}</span></td>
                  <td className="py-2 text-right font-bold tabular-nums text-slate-900 dark:text-white">{fmtC(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ---------------- Customers ---------------- */
export function CustomerAnalytics({ c = {}, hasBaseline, cmp = {} }) {
  return (
    <Card className="p-5" data-testid="dash-customers">
      <SectionTitle icon={Users} sub="From users & booking records">Customer Analytics</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5">
        <Mini label="Total customers" value={c.total} testId="cust-total" />
        <Mini label="New in period" value={c.new} hint={hasBaseline ? undefined : "all time"} testId="cust-new" />
        <Mini label="Active (booked)" value={c.active} hint={hasBaseline && cmp.active_customers !== undefined ? `${cmp.active_customers >= 0 ? "+" : ""}${cmp.active_customers}% vs prev` : undefined} tone="primary" testId="cust-active" />
        <Mini label="Returning (2+ bookings)" value={c.returning} tone="green" testId="cust-returning" />
        <Mini label="Customer revenue" value={c.revenue} money testId="cust-revenue" />
        <Mini label="Avg booking value" value={c.avg_booking_value} money testId="cust-abv" />
        <div className="col-span-2 rounded-xl border border-slate-100 dark:border-slate-800 p-3 flex items-center justify-between">
          <div><p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Booking frequency</p><p className="text-[10px] text-slate-400">bookings per active customer</p></div>
          <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white tabular-nums" data-testid="cust-freq">{c.booking_frequency ?? 0}×</p>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Merchants ---------------- */
export function MerchantAnalytics({ m = {}, onPick }) {
  return (
    <Card className="p-5" data-testid="dash-merchants">
      <SectionTitle icon={Store} sub="Merchant referral network & QR activity">Merchant Analytics</SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <Mini label="Total merchants" value={m.total} testId="mer-total" />
        <Mini label="KYC verified" value={m.verified} tone="green" testId="mer-verified" />
        <Mini label="New in period" value={m.new} testId="mer-new" />
        <Mini label="Generating bookings" value={m.generating_bookings} tone="primary" testId="mer-active" />
        <Mini label="Merchant bookings" value={m.bookings} testId="mer-bookings" />
        <Mini label="Merchant GBV" value={m.gmv} money testId="mer-gmv" />
        <Mini label="Commission earned" value={m.commission} money tone="amber" testId="mer-commission" />
        <Mini label="QR scans (lifetime)" value={m.qr_scans} testId="mer-scans" />
      </div>
      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Top merchants</p>
      {(m.top || []).length === 0 ? <p className="text-xs text-slate-400 py-2" data-testid="mer-top-empty">No merchant-generated bookings in this period.</p> : (
        <div className="space-y-1">
          {(m.top || []).slice(0, 5).map((t, i) => (
            <button key={t.id} onClick={() => onPick?.(t.name)} className="w-full flex items-center gap-2 text-xs p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
              <span className="text-slate-400 w-5">#{i + 1}</span>
              <span className="flex-1 text-left font-medium text-slate-700 dark:text-slate-200 truncate">{t.name}</span>
              <span className="text-slate-500 tabular-nums">{t.bookings} bk</span>
              <span className="font-bold text-slate-800 dark:text-white tabular-nums w-16 text-right">{fmtC(t.gmv)}</span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------------- QR ---------------- */
export function QrAnalytics({ q = {}, onNavigate }) {
  const total = q.total || 0;
  return (
    <Card className="p-5" data-testid="dash-qr">
      <SectionTitle icon={QrCode} sub="Physical QR sticker inventory & scans" right={<button onClick={() => onNavigate?.("qr_registry")} className="text-[11px] font-bold text-primary-700 hover:underline">Manage</button>}>QR Analytics</SectionTitle>
      {total === 0 ? <EmptyState text="No QR codes generated yet." compact testId="qr-empty" /> : (
        <>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <Mini label="Total QR codes" value={q.total} testId="qr-total" />
            <Mini label="Active" value={q.active} tone="green" hint={`${q.activation_rate}% of total`} testId="qr-active" />
            <Mini label="Assigned to merchants" value={q.assigned} tone="primary" testId="qr-assigned" />
            <Mini label="Free / unassigned" value={q.unassigned} testId="qr-unassigned" />
            <Mini label="Scans in period" value={q.scans_in_window} tone="amber" testId="qr-scans-window" />
            <Mini label="Scans (lifetime)" value={q.scans_total} hint={`${q.merchants_with_scans} merchant${q.merchants_with_scans === 1 ? "" : "s"} scanned`} testId="qr-scans-total" />
          </div>
          <div className="space-y-2">
            {[["Active", q.active, "bg-emerald-500"], ["Assigned", q.assigned, "bg-primary-600"], ["Disabled", q.disabled, "bg-slate-400"]].map(([l, v, c]) => (
              <div key={l}><div className="flex justify-between text-[11px] mb-0.5"><span className="text-slate-500">{l}</span><span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{v} / {total}</span></div><Bar pct={(v || 0) / total * 100} color={c} /></div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/* ---------------- Cities ---------------- */
export function CityPerformance({ cities = [], onPick, onReset }) {
  const [sort, setSort] = useState("bookings");
  const rows = useMemo(() => [...cities].sort((a, b) => (b[sort] || 0) - (a[sort] || 0)).slice(0, 10), [cities, sort]);
  return (
    <Card className="p-5" data-testid="dash-cities">
      <SectionTitle icon={MapPin} sub="Ranked from booking addresses" right={<Seg value={sort} onChange={setSort} testid="city-sort" options={[{ value: "bookings", label: "Bookings" }, { value: "gmv", label: "Revenue" }, { value: "customers", label: "Customers" }]} />}>City Performance</SectionTitle>
      {rows.length === 0 ? <EmptyState onReset={onReset} text="No city data available for this period." compact /> : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm min-w-[560px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="py-2 pr-2">City</th><th className="py-2 pr-2 text-right">Bookings</th><th className="py-2 pr-2 text-right">Completed</th><th className="py-2 pr-2 text-right">Revenue</th><th className="py-2 pr-2 text-right">Platform fee</th><th className="py-2 pr-2 text-right">Customers</th><th className="py-2 pr-2 text-right">Partners</th><th className="py-2 text-right">Merchants</th>
            </tr></thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={c.city} onClick={() => onPick?.(c.city)} data-testid={`city-row-${i}`} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors">
                  <td className="py-2 pr-2 font-semibold text-slate-800 dark:text-slate-100"><span className="text-slate-400 mr-1.5 font-normal">#{i + 1}</span>{c.city}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{c.bookings}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.completed}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-bold text-slate-900 dark:text-white">{fmt(c.gmv)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(c.revenue)}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.customers}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.partners}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{c.merchants}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export { compact, Sel };
