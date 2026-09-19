import HomeStatsControl from "@/pages/admin/HomeStatsControl";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { useEffect, useState, useCallback } from "react";
import { useRealtime } from "@/context/RealtimeContext";
import { useNavigate } from "react-router-dom";
import api, { fmt, fmtC, compact } from "@/lib/api";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { CommissionFlow } from "@/components/admin/CommissionFlow";
import { phoneInput } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/PanelLayout";
import DateRangePicker from "@/components/DateRangePicker";
import DashCalendar from "@/pages/admin/dashboard/DashCalendar";
import DataTable from "@/components/admin/DataTable";
import PartnerConsole from "@/pages/admin/PartnerConsole";
import MerchantConsole from "@/pages/admin/MerchantConsole";
import { KeywordsInput } from "@/pages/admin/adminSectionsPro";
import SchedulePicker from "@/components/site/SchedulePicker";
import { Star, IndianRupee, TrendingUp, ClipboardList, Package, Users, Wrench, AlertCircle, Ticket, Trash2, Eye, CheckCircle2, Plus, ArrowLeft, Phone, Mail, MapPin, Wallet, Store, ShieldCheck, FileText, Award, Activity, User as UserIcon, X, XCircle, ZoomIn, Loader2, Search, Ban, Send, Bell, Sparkles, Repeat, ShieldAlert, Clock, Heart, Building2, Globe2, CalendarClock, ToggleRight, Share2, Scale, MessageCircle, RefreshCw, ChevronLeft, ChevronRight, TrendingDown, Camera, Facebook, Instagram, Twitter, Youtube, Linkedin, Smartphone, Save, Globe, AlertTriangle } from "lucide-react";
import WorkProofSection from "@/components/WorkProof";
import DispatchTimeline from "@/components/admin/DispatchTimeline";
import AssignConfirm, { busyLabel } from "@/components/admin/AssignConfirm";
import ServiceBreakdown from "@/components/booking/ServiceBreakdown";
import { AreaChart as RAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart as RBarChart, Bar, Cell } from "recharts";
import { toast } from "sonner";

const SC = {
  searching: "bg-amber-100 text-amber-700", assigned: "bg-blue-100 text-blue-700",
  arrived_shop: "bg-blue-100 text-blue-700", arrived_customer: "bg-blue-100 text-blue-700",
  started: "bg-indigo-100 text-indigo-700", completed: "bg-emerald-100 text-emerald-700",
  paid: "bg-emerald-100 text-emerald-700", cancelled: "bg-red-100 text-red-700",
  pending: "bg-amber-100 text-amber-700", approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700", open: "bg-amber-100 text-amber-700",
  answered: "bg-blue-100 text-blue-700", closed: "bg-slate-100 text-slate-500",
};

export const SBadge = ({ s }) => <Badge className={`border-0 capitalize ${SC[s] || "bg-slate-100 text-slate-600"}`}>{String(s).replace(/_/g, " ")}</Badge>;

// Reusable status-tab bar (section 73: statuses as tabs, not sidebar menus)
export const StatusTabs = ({ tabs, value, onChange }) => (
  <div data-testid="status-tabs" className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
    {tabs.map((t) => {
      const on = value === t.key;
      return (
        <button
          key={t.key}
          data-testid={`status-tab-${t.key}`}
          onClick={() => onChange(t.key)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all border ${on ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-300"}`}
        >
          {t.label}
          {t.count != null && <span className={`h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${on ? "bg-white/25 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{t.count}</span>}
        </button>
      );
    })}
  </div>
);

const useList = (url, deps = []) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); return api.get(url).then((r) => setRows(r.data || [])).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, deps);
  return { rows, loading, load, setRows };
};

/* ---------------- Dashboard Home ---------------- */
const RANGES = [["today", "Today"], ["7d", "Last 7 days"], ["15d", "Last 15 days"], ["30d", "Last 30 days"], ["90d", "Last 90 days"], ["365d", "This year"], ["all", "All time"]];
const STATUS_HEX = { searching: "#38bdf8", assigned: "#818cf8", arrived_shop: "#818cf8", arrived_customer: "#a78bfa", started: "#fbbf24", completed: "#10b981", paid: "#059669", cancelled: "#f87171", pending: "#fbbf24" };

// Premium ApexCharts-style gradient area chart (recharts) with smooth curve,
// soft grid, floating tooltip and entry animation — used across the dashboard.
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const ChartTooltip = ({ active, payload, label, currency }) => {
  if (!active || !payload || !payload.length) return null;
  const v = payload[0].value;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-3 py-2">
      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-bold text-slate-800 dark:text-white">{currency ? money(v) : v}</p>
    </div>
  );
};
const AreaChart = ({ data = [], color = "#0D47A1", height = 170, empty = "No data in this period", currency = true }) => {
  if (!data.length) return <div className="grid place-items-center text-slate-400 text-sm" style={{ height }}>{empty}</div>;
  const gid = `ag-${color.replace("#", "")}`;
  const rows = data.map((d) => ({ ...d, label: String(d.date || "").slice(5) }));
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e2e8f0" strokeOpacity={0.6} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44}
            tickFormatter={(v) => currency ? (v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`) : v} />
          <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: color, strokeOpacity: 0.25, strokeWidth: 1 }} />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill={`url(#${gid})`}
            dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} animationDuration={900} />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const DashboardHome = ({ d: initial, onOpenBooking }) => {
  const [range, setRange] = useState("30d");
  const [custom, setCustom] = useState(null); // {from,to}
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setBusy(true);
    const url = range === "custom" && custom?.from && custom?.to
      ? `/admin/dashboard?range=custom&date_from=${custom.from}&date_to=${custom.to}`
      : `/admin/dashboard?range=${range}`;
    api.get(url).then((r) => setD(r.data)).finally(() => setBusy(false));
  }, [range, custom]);
  if (!d) return null;
  const earn = d.earnings || {};
  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Earnings, jobs &amp; performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          {busy && <Loader2Icon />}
          {range === "custom" && (
            <DateRangePicker from={custom?.from} to={custom?.to}
              onApply={(v) => { if (v) setCustom(v); else { setCustom(null); setRange("30d"); } }} />
          )}
          <PremiumSelect data-testid="dash-range" value={range} searchable={false}
            onChange={(e) => { setRange(e.target.value); if (e.target.value !== "custom") setCustom(null); }}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 px-3 text-sm font-medium">
            {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            <option value="custom">Custom range…</option>
          </PremiumSelect>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatCard label="GMV" value={fmtC(d.gmv)} title={fmt(d.gmv)} icon={IndianRupee} tone="green" />
        <StatCard label="Platform Revenue" value={fmtC(d.platform_revenue)} title={fmt(d.platform_revenue)} icon={TrendingUp} />
        <StatCard label="Total Bookings" value={d.total_bookings} icon={ClipboardList} sub={`${d.completed_bookings} completed`} />
        <StatCard label="Avg Order Value" value={fmtC(d.avg_order_value)} title={fmt(d.avg_order_value)} icon={Package} tone="amber" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Customers" value={compact(d.customers)} title={d.customers} icon={Users} tone="slate" />
        <StatCard label="Partners" value={compact(d.partners)} title={d.partners} icon={Wrench} sub={`${d.online_partners} online`} tone="slate" />
        <StatCard label="Pending Payouts" value={compact(d.pending_payouts)} title={d.pending_payouts} icon={AlertCircle} tone="amber" />
        <StatCard label="Open Queries" value={compact(d.open_tickets)} title={d.open_tickets} icon={Ticket} tone="slate" />
      </div>

      {/* Earnings report */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 mb-6">
        <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Wallet className="h-5 w-5 text-primary-700" /> Earnings Report</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[["GMV (gross)", earn.gmv, "text-slate-900 dark:text-white"], ["Platform revenue", earn.platform_revenue, "text-emerald-600"],
            ["Partner earnings", earn.partner_earnings, "text-primary-700"], ["Refunds", earn.refunds, "text-red-500"]].map(([k, v, cls]) => (
            <div key={k}>
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{k}</p>
              <p className={`font-heading font-extrabold text-xl mt-1 ${cls}`} title={fmt(v)}>{fmtC(v)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Job report + revenue chart */}
      <div className="grid lg:grid-cols-3 gap-5 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><ClipboardList className="h-5 w-5 text-primary-700" /> Job Report</h3>
          {(d.status_breakdown || []).length === 0 ? (
            <div className="grid place-items-center text-slate-400 text-sm" style={{ height: 220 }}>No jobs in this period</div>
          ) : (
            <div style={{ height: Math.max(200, (d.status_breakdown || []).length * 38) }}>
              <ResponsiveContainer width="100%" height="100%">
                <RBarChart layout="vertical" data={(d.status_breakdown || []).map((s) => ({ name: s.status.replace(/_/g, " "), count: s.count, fill: STATUS_HEX[s.status] || "#94a3b8" }))}
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barCategoryGap={10}>
                  <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#e2e8f0" strokeOpacity={0.6} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b", textTransform: "capitalize" }} tickLine={false} axisLine={false} width={92} />
                  <Tooltip content={<ChartTooltip currency={false} />} cursor={{ fill: "#f1f5f9", fillOpacity: 0.5 }} />
                  <Bar dataKey="count" radius={[0, 6, 6, 0]} animationDuration={900} barSize={16}>
                    {(d.status_breakdown || []).map((s, i) => <Cell key={i} fill={STATUS_HEX[s.status] || "#94a3b8"} />)}
                  </Bar>
                </RBarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Platform Revenue</h3>
            <span className="text-xs text-slate-400">{RANGES.find((r) => r[0] === range)?.[1]}</span>
          </div>
          <AreaChart data={d.revenue_series || []} color="#0D47A1" empty="No revenue in this period" />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-heading font-bold text-lg mb-4 text-slate-900 dark:text-white">Bookings Trend</h3>
          <AreaChart data={d.booking_series || []} color="#10b981" height={140} empty="No bookings in this period" currency={false} />
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <h3 className="font-heading font-bold text-lg mb-4 text-slate-900 dark:text-white">Top Providers</h3>
          <div className="space-y-3">
            {(d.top_partners || []).map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs">{i + 1}</div>
                <div className="flex-1 min-w-0"><p className="font-medium text-slate-800 dark:text-slate-100 truncate">{p.name}</p><p className="text-xs text-slate-400 flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{p.rating} · {p.jobs_completed} jobs</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 className="font-heading font-bold text-lg mb-3 text-slate-900 dark:text-white">Recent Bookings</h3>
      <DataTable
        rows={d.recent_bookings || []}
        searchKeys={["code", "service_name", "customer_name", "partner_name"]}
        searchPlaceholder="Search bookings…"
        pageSize={10}
        columns={bookingColumns(onOpenBooking)}
        emptyText="No bookings yet"
      />
    </>
  );
};

const Loader2Icon = () => <Activity className="h-4 w-4 animate-spin text-primary-600" />;

/* ---------------- Bookings ---------------- */
const BOOKING_STATUSES = ["searching", "assigned", "arrived_shop", "arrived_customer", "started", "completed", "paid", "on_hold", "cancelled"];
// Preferred tab order (booking lifecycle). Lower = shown first; "all" is pinned last.
const TAB_ORDER = {
  pending: 1, pending_payment: 1, searching: 1.5, assigned: 2,
  arrived_shop: 2.3, arrived_customer: 2.6, started: 3, completed: 4,
  paid: 5, on_hold: 5.5, cancelled: 6,
};
const bookingColumns = (onOpen, onStatus) => [
  { key: "code", label: "Code", sortable: true, render: (b) => <span className="font-semibold text-slate-800 dark:text-slate-100">#{b.code}</span> },
  { key: "service_name", label: "Service", sortable: true },
  { key: "customer_name", label: "Customer", render: (b) => <span className="text-slate-500 dark:text-slate-400">{b.customer_name}</span> },
  { key: "partner_name", label: "Partner", render: (b) => <span className="text-slate-500 dark:text-slate-400">{b.partner_name || "—"}</span> },
  { key: "booking_type", label: "Type", render: (b) => <Badge className={`border-0 ${b.booking_type === "merchant" ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-600"}`}>{b.booking_type}</Badge> },
  { key: "status", label: "Status", sortable: true, render: (b) => <SBadge s={b.status} /> },
  { key: "total", label: "Amount", sortable: true, render: (b) => <span className="font-semibold">{fmt(b.pricing?.total)}</span>, exportValue: (b) => b.pricing?.total },
  ...(onStatus ? [{ key: "_set", label: "Change status", render: (b) => (
    <Select value={b.status} onValueChange={(v) => onStatus(b.id, v)}>
      <SelectTrigger data-testid={`booking-status-${b.code}`} className="h-8 w-[150px] text-xs capitalize"><SelectValue /></SelectTrigger>
      <SelectContent>{BOOKING_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize text-xs">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
    </Select>
  ) }] : []),
  { key: "_action", label: "", render: (b) => <button data-testid={`view-booking-${b.code}`} onClick={() => onOpen(b)} className="text-primary-700 hover:text-primary-800"><Eye className="h-4 w-4" /></button> },
];

export const BookingsSection = ({ onOpen, tab: tabProp, onTabChange }) => {
  const { rows, loading } = useList("/admin/bookings");
  const [tabInner, setTabInner] = useState("");
  const tab = tabProp ?? tabInner;
  const setTab = onTabChange ?? setTabInner;
  const statuses = [...new Set(rows.map((b) => b.status))].map((s) => ({ label: s.replace(/_/g, " "), value: s }));
  const statusCounts = rows.reduce((m, b) => { m[b.status] = (m[b.status] || 0) + 1; return m; }, {});
  const orderedStatuses = Object.keys(statusCounts).sort((a, b) => (TAB_ORDER[a] ?? 90) - (TAB_ORDER[b] ?? 90) || a.localeCompare(b));
  const tabs = [...orderedStatuses.map((s) => ({ key: s, label: s.replace(/_/g, " "), count: statusCounts[s] })), { key: "all", label: "All", count: rows.length }];
  // Default to (and auto-heal to) the FIRST tab once data loads — whatever the
  // first lifecycle status is (e.g. "pending_payment") becomes active by default.
  useEffect(() => {
    if (!rows.length) return;
    const keys = tabs.map((t) => t.key);
    if (!tab || !keys.includes(tab)) setTab(tabs[0].key);
  }, [rows.length, tab]);
  const filtered = tab === "all" ? rows : rows.filter((b) => b.status === tab);
  return (
    <div className="space-y-4">
      <StatusTabs tabs={tabs} value={tab} onChange={setTab} />
      <DataTable
        title="All Bookings" subtitle={`${filtered.length} ${tab === "all" ? "total" : tab.replace(/_/g, " ")} bookings`}
        rows={filtered} loading={loading}
        searchKeys={["code", "service_name", "customer_name", "partner_name"]}
        searchPlaceholder="Search by code, service, customer…"
        exportName="bookings" dateKey="created_at" dateLabel="Dates"
        filters={[
          { key: "status", label: "Status", options: statuses },
          { key: "booking_type", label: "Type", options: [{ label: "Direct", value: "direct" }, { label: "Merchant", value: "merchant" }] },
        ]}
        columns={bookingColumns(onOpen)}
        emptyText="No bookings found"
      />
    </div>
  );
};

export const BookingDetailModal = ({ booking, onClose, onChanged }) => {
  const [b, setB] = useState(booking);
  const [resched, setResched] = useState(null);
  const [showResched, setShowResched] = useState(false);
  const [refundAmt, setRefundAmt] = useState("");
  const [refunds, setRefunds] = useState([]);
  useEffect(() => {
    setB(booking); setShowResched(false); setResched(null); setRefundAmt("");
    if (booking?.id) api.get("/admin/refunds").then((r) => setRefunds((r.data || []).filter((x) => x.booking_id === booking.id || x.booking_code === booking.code))).catch(() => setRefunds([]));
    else setRefunds([]);
  }, [booking]);
  if (!b) return null;
  const p = b.pricing || {};
  const refund = async () => {
    const amt = refundAmt ? Number(refundAmt) : p.total;
    if (amt <= 0 || amt > (p.total || 0)) return toast.error(`Amount must be between 1 and ${fmt(p.total)}`);
    await api.post(`/admin/refunds`, { booking_id: b.id, amount: amt, reason: refundAmt ? "Admin partial refund" : "Admin full refund" });
    toast.success(`Refunded ${fmt(amt)} to customer wallet`); onChanged?.(); onClose();
  };
  const doReschedule = async () => {
    if (!resched) return toast.error("Pick a new date & time");
    await api.post(`/admin/bookings/${b.id}/reschedule?scheduled_at=${encodeURIComponent(resched)}`);
    toast.success("Booking rescheduled"); onChanged?.(); onClose();
  };
  return (
    <Dialog open={!!b} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="booking-detail-modal">
        <DialogHeader><DialogTitle className="font-heading flex items-center gap-2">Booking #{b.code} <SBadge s={b.status} /></DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Info label="Service" v={b.service_name} />
            <Info label="Category" v={b.category_name} />
            <Info label="Customer" v={`${b.customer_name} · ${b.customer_phone}`} />
            <Info label="Partner" v={b.partner_name || "Not assigned"} />
            {b.merchant_name && <Info label="Merchant" v={b.merchant_name} />}
            <Info label="Type" v={b.booking_type} />
            <Info label="Schedule" v={b.schedule_type} />
            <Info label="Payment" v={b.payment_status} />
          </div>
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Address</p>
            <p className="text-sm text-slate-700 dark:text-slate-200">{b.address?.line}, {b.address?.city} {b.address?.pincode}</p></div>
          {/* Point #9 — per-service + add-on itemisation (excl. GST) */}
          {(b.items || []).length > 0 && (
            <div data-testid="modal-booking-items">
              <ServiceBreakdown booking={b} fmt={fmt} title="Services & add-ons" showCharges />
            </div>
          )}
          {/* Point #10 — work proof photos with lightbox */}
          {((b.evidence?.before || []).length > 0 || (b.evidence?.after || []).length > 0) && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Work Proof Photos</p>
              <WorkProofSection evidence={b.evidence} compact />
            </div>
          )}
          {b.otps && Object.keys(b.otps).length > 0 && (
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">OTPs</p>
              <div className="flex gap-2 flex-wrap">{Object.entries(b.otps).map(([k, v]) => v && <Badge key={k} className="bg-slate-100 text-slate-700 border-0">{k}: <b className="ml-1 tracking-widest">{v}</b></Badge>)}</div></div>
          )}
          <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Timeline</p>
            <div className="space-y-1">{(b.timeline || []).map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-emerald-500" /><span className="capitalize text-slate-700 dark:text-slate-200">{t.status.replace(/_/g, " ")}</span><span className="text-xs text-slate-400 ml-auto">{new Date(t.at).toLocaleString()}</span></div>
            ))}</div></div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-sm space-y-1">
            <Row l="Service Amount" v={fmt(p.base ?? p.subtotal ?? 0)} />
            {p.addons_total > 0 && <Row l="Add-ons" v={fmt(p.addons_total)} />}
            {(p.surge || 0) > 0 && <Row l="Surge Charge" v={fmt(p.surge)} />}
            {(p.visiting_charge || 0) > 0 && <Row l="Visiting Charge" v={fmt(p.visiting_charge)} />}
            {(p.platform_fee || 0) > 0 && <Row l="Platform Fee" v={fmt(p.platform_fee)} />}
            {(p.convenience_fee || 0) > 0 && <Row l="Convenience Fee" v={fmt(p.convenience_fee)} />}
            {p.discount > 0 && <Row l="Coupon discount" v={"-" + fmt(p.discount)} />}
            {p.membership_discount > 0 && <Row l="Member discount" v={"-" + fmt(p.membership_discount)} />}
            {p.membership_visit_waiver > 0 && <Row l="Free visiting (Member)" v={"-" + fmt(p.membership_visit_waiver)} />}
            {p.loyalty_discount > 0 && <Row l="Loyalty discount" v={"-" + fmt(p.loyalty_discount)} />}
            {p.referral_discount > 0 && <Row l="Referral discount" v={"-" + fmt(p.referral_discount)} />}
            <div data-testid="modal-taxable"><Row l="Taxable Amount" v={fmt(p.taxable ?? p.commissionable_base ?? 0)} /></div>
            {p.gst > 0 && <Row l={`Tax${p.gst_pct ? ` (${p.gst_pct}%)` : ""}`} v={fmt(p.gst)} />}
            <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-700 font-bold"><span>Total</span><span>{fmt(p.total)}</span></div>
          </div>
          {b.commission && (
            <div className="bg-primary-50 dark:bg-primary-900/20 rounded-lg p-4 text-sm space-y-1">
              <p className="font-bold text-primary-800 dark:text-primary-300 mb-1">Commission Split</p>
              <Row l="Partner earning" v={fmt(b.commission.partner_earning)} />
              <Row l="Platform earning" v={fmt(b.commission.platform_earning)} />
              <Row l="Merchant referral" v={fmt(b.commission.merchant_referral)} />
              {b.commission.merchant_booking > 0 && <Row l="Merchant booking" v={fmt(b.commission.merchant_booking)} />}
            </div>
          )}
          {/* Admin control panel: reschedule + refund */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3" data-testid="booking-control-panel">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Manage this booking</p>
            {b.scheduled_at && <p className="text-sm text-slate-600 dark:text-slate-300">Scheduled for <b>{new Date(b.scheduled_at).toLocaleString()}</b></p>}
            {!["cancelled", "paid"].includes(b.status) && (
              <div>
                <Button data-testid="reschedule-toggle" variant="outline" size="sm" onClick={() => setShowResched((s) => !s)}>{showResched ? "Cancel reschedule" : "Reschedule booking"}</Button>
                {showResched && (
                  <div className="mt-3 space-y-2">
                    <SchedulePicker value={resched} onChange={setResched} />
                    <Button data-testid="reschedule-save" onClick={doReschedule} className="bg-primary-700 hover:bg-primary-800">Save new slot</Button>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Refund amount (blank = full)</label>
                <Input data-testid="refund-amount" type="number" placeholder={String(p.total || 0)} value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} className="mt-1 w-40" />
              </div>
              <Button data-testid="refund-booking" variant="outline" onClick={refund} className="text-red-600 border-red-200 hover:bg-red-50">Issue Refund</Button>
            </div>
            {(() => {
              const already = refunds.reduce((s, r) => s + (r.amount || 0), 0);
              const remaining = Math.max(0, (p.total || 0) - already);
              return (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm" data-testid="refund-history">
                  <div className="flex justify-between font-medium text-slate-700 dark:text-slate-200">
                    <span>Refunded so far: <b className="text-red-600">{fmt(already)}</b></span>
                    <span>Remaining refundable: <b className="text-emerald-600">{fmt(remaining)}</b></span>
                  </div>
                  {refunds.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2">
                      {refunds.map((r) => (
                        <div key={r.id} className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>{r.reason || "Refund"} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</span>
                          <span className="font-semibold">{fmt(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
const Info = ({ label, v }) => <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="text-slate-800 dark:text-slate-100 mt-0.5 capitalize">{v}</p></div>;
const Row = ({ l, v }) => <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">{l}</span><span className="text-slate-700 dark:text-slate-200">{v}</span></div>;

/* ---------------- Premium full-page Booking Detail ---------------- */
const DCard = ({ title, icon: Icon, action, children, className = "" }) => (
  <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${className}`}>
    {title && (
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
        <p className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">{Icon && <Icon className="h-4 w-4 text-primary-600" />}{title}</p>
        {action}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
);

const COMM_ICON = { partner: Wrench, merchant_referral: Store, merchant_customer: Store, platform: ShieldCheck, customer: UserIcon };
const COMM_TONE = {
  partner: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300",
  merchant_referral: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-900/20 dark:text-violet-300",
  merchant_customer: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-300",
  platform: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-900/20 dark:text-blue-300",
  customer: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/20 dark:text-sky-300",
};
const COMM_LABEL = { partner: "Partner", merchant_referral: "Referral Merchant", merchant_customer: "Booking Merchant", platform: "Platform", customer: "Customer" };

/* One row in the admin "Assign Partner" list — name, status chips, area, ETA + one-tap
   Call / WhatsApp so the admin can confirm with the pro before assigning. */
const waLink = (phone) => `https://wa.me/${String(phone || "").replace(/[^\d]/g, "")}`;
const AssignPartnerRow = ({ e, busy, onAssign, nearby = false }) => (
  <div data-testid={`assign-row-${e.id}`} className={`flex items-center gap-3 rounded-xl border p-3 ${nearby ? "border-amber-100 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-900/10" : "border-slate-100 dark:border-slate-800"} ${e.offline ? "opacity-90" : ""}`}>
    <div className={`h-9 w-9 rounded-lg flex items-center justify-center font-bold shrink-0 ${e.offline ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" : "bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300"}`}>{(e.name || "P").charAt(0)}</div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{e.name}</p>
        {e.is_current && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Current</span>}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${e.partner_status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{e.partner_status}</span>
        {e.busy && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700" title={e.busy_job_service ? `On ${e.busy_job_service}${e.busy_job_code ? ` (#${e.busy_job_code})` : ""}` : "On a job"} data-testid={`busy-${e.id}`}>{busyLabel(e)}</span>}
        {nearby && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">Nearby area</span>}
        {e.eta_min != null && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-50 text-primary-700">~{e.eta_min} min</span>}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 mt-0.5">
        <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{e.rating}</span>
        <span>{e.jobs_completed} jobs</span>
        {e.distance_km != null && <span>{e.distance_km} km away</span>}
        {(e.city || e.service_pincodes?.length > 0) && <span>{[e.city, e.service_pincodes?.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</span>}
        {e.phone && <span>{e.phone}</span>}
      </div>
    </div>
    {e.phone && (
      <div className="flex items-center gap-1 shrink-0">
        <a href={`tel:${e.phone}`} data-testid={`call-${e.id}`} title={`Call ${e.name}`}
          className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          <Phone className="h-3.5 w-3.5" />
        </a>
        <a href={waLink(e.phone)} target="_blank" rel="noreferrer" data-testid={`wa-${e.id}`} title={`WhatsApp ${e.name}`}
          className="h-8 w-8 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      </div>
    )}
    <Button size="sm" disabled={busy || e.is_current} data-testid={`assign-${e.id}`} onClick={() => onAssign(e.id, e)}
      className={`shrink-0 ${e.offline ? "bg-slate-700 hover:bg-slate-800" : "bg-primary-700 hover:bg-primary-800"}`}>
      {e.is_current ? "Assigned" : e.offline ? "Force assign" : "Assign"}
    </Button>
  </div>
);

const MerchantMini = ({ m, tag }) => (
  <div className="flex items-start gap-3 rounded-xl border border-slate-100 dark:border-slate-800 p-3 bg-slate-50/60 dark:bg-slate-800/40">
    <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0"><Store className="h-5 w-5" /></div>
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{m.shop_name || m.name || "Merchant"}</p>
        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{tag}</span>
      </div>
      {m.name && m.shop_name && <p className="text-xs text-slate-500">Owner: {m.name}</p>}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {m.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{m.phone}</span>}
        {(m.city || m.state) && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{[m.city, m.state].filter(Boolean).join(", ")}</span>}
        {m.gst_number && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />GST {m.gst_number}</span>}
      </div>
    </div>
  </div>
);

const DispatchTimelineCard = ({ id }) => (
  <DCard title="Dispatch Timeline Map" icon={Activity}>
    <p className="text-[11px] text-slate-400 mb-2">Who it was sent to → who viewed → who accepted / rejected — live.</p>
    <DispatchTimeline bookingId={id} />
  </DCard>
);

export const BookingDetailPage = ({ id, onBack, onChanged, onJumpToStatus }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resched, setResched] = useState(null);
  const [showResched, setShowResched] = useState(false);
  const [refundAmt, setRefundAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [eligible, setEligible] = useState([]);
  const [eligMeta, setEligMeta] = useState(null);
  const [includeOffline, setIncludeOffline] = useState(false);
  const [nearby, setNearby] = useState([]);
  const [showNearby, setShowNearby] = useState(false);
  const [confirmP, setConfirmP] = useState(null);
  const [loadingElig, setLoadingElig] = useState(false);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get(`/admin/bookings/${id}/detail`); setData(r.data); }
    catch { toast.error("Couldn't load booking"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (id) load(); }, [id]);

  if (loading || !data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3" data-testid="booking-detail-page">
        <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
        <p className="text-sm text-slate-500">Loading booking…</p>
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
      </div>
    );
  }

  const b = data.booking || {};
  const p = b.pricing || {};
  const partner = data.partner;
  const comm = data.commission || {};
  const rows = comm.rows || [];
  const refunds = data.refunds || [];
  const refundedSoFar = refunds.reduce((s, r) => s + (r.amount || 0), 0);
  const remaining = Math.max(0, (p.total || 0) - refundedSoFar);

  const doRefund = async () => {
    const amt = refundAmt ? Number(refundAmt) : (p.total || 0);
    if (amt <= 0 || amt > (p.total || 0)) return toast.error(`Amount must be between 1 and ${fmt(p.total)}`);
    setBusy(true);
    try {
      await api.post(`/admin/refunds`, { booking_id: b.id, amount: amt, reason: refundAmt ? "Admin partial refund" : "Admin full refund" });
      toast.success(`Refunded ${fmt(amt)} to customer wallet`);
      setRefundAmt(""); await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Refund failed"); }
    finally { setBusy(false); }
  };
  const doReschedule = async () => {
    if (!resched) return toast.error("Pick a new date & time");
    setBusy(true);
    try {
      await api.post(`/admin/bookings/${b.id}/reschedule?scheduled_at=${encodeURIComponent(resched)}`);
      toast.success("Booking rescheduled"); setShowResched(false); await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Reschedule failed"); }
    finally { setBusy(false); }
  };

  const loadEligible = async (offline) => {
    setLoadingElig(true);
    try {
      const r = await api.get(`/admin/bookings/${b.id}/eligible-partners`, { params: { include_offline: offline ? 1 : 0 } });
      const d = r.data || {};
      setEligible(d.partners || []);
      setNearby(d.nearby_partners || []);
      // auto-expand the Nearby section when nobody in the customer's own area is free
      setShowNearby((d.free_in_area || 0) === 0 && (d.nearby_partners || []).length > 0);
      setEligMeta({ category: d.category, skill: d.skill, area: d.area || {}, area_known: d.area_known !== false, category_known: d.category_known !== false,
        free_in_area: d.free_in_area || 0, nearby_radius_km: d.nearby_radius_km });
    }
    catch { toast.error("Couldn't load partners"); }
    finally { setLoadingElig(false); }
  };
  const openAssign = async () => { setShowAssign(true); await loadEligible(includeOffline); };
  const toggleOffline = async (v) => { setIncludeOffline(v); await loadEligible(v); };
  // Step 1: open the confirmation sheet (ETA, phone, area) — no mis-click assigns.
  const doAssign = (pid, p) => setConfirmP(p || { id: pid });
  // Step 2: confirmed → assign.
  const confirmAssign = async () => {
    const pid = confirmP?.id; if (!pid) return;
    setBusy(true);
    try {
      await api.post(`/admin/bookings/${b.id}/assign`, { partner_id: pid });
      toast.success(`Assigned to ${confirmP?.name || "partner"}`); setConfirmP(null); setShowAssign(false); await load(); onChanged?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Assign failed"); }
    finally { setBusy(false); }
  };
  const downloadDetailPdf = async () => {
    setPdfBusy(true);
    try {
      const r = await api.get(`/admin/bookings/${b.id}/detail/pdf`, { responseType: "blob" });
      const href = URL.createObjectURL(r.data);
      const a = document.createElement("a"); a.href = href; a.download = `Booking-${b.code}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    } catch { toast.error("Couldn't download PDF"); }
    finally { setPdfBusy(false); }
  };
  const filteredEligible = eligible.filter((e) => {
    const q = partnerQuery.trim().toLowerCase();
    if (!q) return true;
    return (e.name || "").toLowerCase().includes(q) || (e.phone || "").includes(q);
  });

  return (
    <div className="-mt-2" data-testid="booking-detail-page">
      {confirmP && <AssignConfirm partner={confirmP} booking={b} busy={busy} onConfirm={confirmAssign} onCancel={() => setConfirmP(null)} />}
      {/* Sticky sub-header (stays within content; sidebar remains visible) */}
      <div className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 rounded-t-xl">
        <div className="px-4 sm:px-5 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="booking-detail-back" className="shrink-0"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Booking #{b.code}</h1>
              <SBadge s={b.status} />
              <Badge className={`border-0 ${b.booking_type === "merchant" ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-600"}`}>{b.booking_type}</Badge>
            </div>
            <p className="text-xs text-slate-400 truncate">{b.service_name} · {b.category_name}</p>
          </div>
          <Button size="sm" variant="outline" onClick={downloadDetailPdf} disabled={pdfBusy} data-testid="booking-detail-pdf" className="shrink-0 mr-1">
            <FileText className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">{pdfBusy ? "…" : "PDF"}</span>
          </Button>
          <div className="text-right shrink-0">
            <p className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{fmt(p.total)}</p>
            <p className="text-[11px] text-slate-400 capitalize">{b.payment_status || "—"}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-1 py-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <DCard title="Overview" icon={ClipboardList}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Info label="Service" v={b.service_name} />
              <Info label="Category" v={b.category_name} />
              <Info label="Type" v={b.booking_type} />
              <Info label="Schedule" v={b.schedule_type} />
              <Info label="Payment" v={b.payment_status} />
              <Info label="Created" v={b.created_at ? new Date(b.created_at).toLocaleString() : "—"} />
              {b.scheduled_at && <Info label="Scheduled For" v={new Date(b.scheduled_at).toLocaleString()} />}
            </div>
            {b.address && (
              <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Service Address</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{[b.address?.line, b.address?.city, b.address?.pincode].filter(Boolean).join(", ")}</p>
              </div>
            )}
            {b.otps && Object.values(b.otps).some(Boolean) && (
              <div className="mt-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">OTPs</p>
                <div className="flex gap-2 flex-wrap">{Object.entries(b.otps).filter(([k]) => k !== "shop").map(([k, v]) => v && <Badge key={k} className="bg-slate-100 text-slate-700 border-0 capitalize">{k}: <b className="ml-1 tracking-widest">{v}</b></Badge>)}</div>
              </div>
            )}
          </DCard>

          {/* Point #9 — every service (job) inside this order, individually itemised */}
          {(b.items || []).length > 0 && (
            <DCard title={`Services & add-ons (${(b.items || []).length})`} icon={Package}>
              <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="admin-booking-items">
                {(b.items || []).map((it, i) => {
                  const qty = Number(it.qty || 1);
                  const addons = Array.isArray(it.addons) ? it.addons.filter((a) => a && (a.name || typeof a === "string")) : [];
                  return (
                    <div key={i} className="py-2.5 first:pt-0 last:pb-0" data-testid={`admin-booking-item-${i}`}>
                      <div className="flex items-center gap-3">
                        {it.image
                          ? <img src={it.image} alt="" className="h-11 w-11 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0" />
                          : <span className="h-11 w-11 rounded-xl bg-primary-50 dark:bg-primary-900/30 grid place-items-center text-primary-700 shrink-0"><Wrench className="h-5 w-5" /></span>}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{it.service_name || it.name || it.custom_name}</p>
                          <p className="text-[11px] text-slate-400">{it.tier_label ? `${it.tier_label} · ` : ""}Qty {qty}{it.base_price != null ? ` · ${fmt(it.base_price)} each` : ""}</p>
                        </div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 shrink-0">{fmt(it.price ?? it.total ?? it.custom_price ?? 0)}</p>
                      </div>
                      {addons.length > 0 && (
                        <div className="mt-1.5 ml-14 pl-3 border-l-2 border-primary-100 dark:border-primary-900/40 space-y-1">
                          {addons.map((a, ai) => {
                            const an = a && typeof a === "object" ? a.name : String(a);
                            const ap = Number((a && a.price) || 0);
                            return (
                              <div key={ai} className="flex items-center justify-between gap-2 text-[12px]">
                                <span className="text-slate-500 dark:text-slate-400 truncate">+ {an}{ap && qty > 1 ? ` (${fmt(ap)} × ${qty})` : ""}</span>
                                {ap ? <span className="font-medium text-slate-600 dark:text-slate-300 shrink-0">{fmt(ap * qty)}</span> : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10.5px] text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">All service &amp; add-on amounts shown are exclusive of GST/Tax.</p>
            </DCard>
          )}

          {/* Point #10 — partner-uploaded before/after work proof with full-size lightbox */}
          {((b.evidence?.before || []).length > 0 || (b.evidence?.after || []).length > 0) && (
            <DCard title="Work Proof Photos" icon={Camera}>
              <WorkProofSection evidence={b.evidence} compact />
            </DCard>
          )}

          {/* Partner */}
          <DCard title="Service Professional" icon={Wrench}>
            {partner ? (
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center text-xl font-bold overflow-hidden shrink-0">
                  {partner.photo ? <img src={partner.photo} alt={partner.name} className="h-full w-full object-cover" /> : (partner.name || "P").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900 dark:text-white">{partner.name}</p>
                    {partner.partner_code && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">{partner.partner_code}</span>}
                    {partner.partner_status && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${partner.partner_status === "online" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{partner.partner_status}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{partner.rating ?? "—"}</span>
                    <span className="flex items-center gap-1"><Award className="h-4 w-4 text-primary-500" />{partner.jobs_completed ?? partner.total_jobs ?? 0} jobs done</span>
                    {partner.experience_years ? <span className="flex items-center gap-1"><Activity className="h-4 w-4 text-emerald-500" />{partner.experience_years}+ yrs exp</span> : null}
                    {partner.kyc_status && <span className="flex items-center gap-1"><ShieldCheck className="h-4 w-4 text-emerald-500" />KYC {partner.kyc_status}</span>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {partner.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{partner.phone}</span>}
                    {partner.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{partner.email}</span>}
                    {(partner.city || partner.state) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[partner.city, partner.state].filter(Boolean).join(", ")}</span>}
                  </div>
                  {(partner.skills || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {partner.skills.map((s, i) => <span key={i} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300 capitalize">{String(s).replace(/_/g, " ")}</span>)}
                    </div>
                  )}
                  {partner.bio && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{partner.bio}</p>}
                  {data.referral_merchant && <p className="mt-3 text-xs text-slate-500 flex items-center gap-1"><Store className="h-3.5 w-3.5 text-violet-500" /> Onboarded by <b className="text-slate-700 dark:text-slate-200">{data.referral_merchant.shop_name || data.referral_merchant.name}</b></p>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No partner assigned yet.</p>
            )}
          </DCard>

          {/* Assign / Reassign partner */}
          {!["completed", "paid", "cancelled"].includes(b.status) && (
            <DCard title={partner ? "Reassign Partner" : "Assign Partner"} icon={Wrench}
              action={!showAssign
                ? <Button size="sm" variant="outline" data-testid="assign-open" onClick={openAssign}>{partner ? "Change partner" : "Assign partner"}</Button>
                : <Button size="sm" variant="ghost" onClick={() => setShowAssign(false)}>Close</Button>}>
              {!showAssign ? (
                <p className="text-sm text-slate-500">{partner ? `Currently assigned to ${partner.name}. Click "Change partner" to reassign.` : 'No partner assigned. Click "Assign partner" to pick an eligible professional.'}</p>
              ) : loadingElig ? (
                <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading eligible partners…</div>
              ) : (
                <div className="space-y-2">
                  {eligMeta && (
                    <div data-testid="assign-scope" className={`flex flex-wrap items-center gap-1.5 text-xs rounded-lg border px-3 py-2 ${(eligMeta.area_known && eligMeta.category_known) ? "text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800" : "text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
                      <MapPin className={`h-3.5 w-3.5 ${(eligMeta.area_known && eligMeta.category_known) ? "text-primary-600" : "text-amber-600"}`} />
                      {eligMeta.area_known && eligMeta.category_known ? (<>
                        <span>Showing only</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{eligMeta.category || eligMeta.skill}</span>
                        <span>partners serving</span>
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {[eligMeta.area?.city, eligMeta.area?.pincode].filter(Boolean).join(" · ")}
                        </span>
                      </>) : (
                        <span>
                          {!eligMeta.category_known && !eligMeta.area_known
                            ? "This booking has no service category or address on record — showing all online partners."
                            : !eligMeta.area_known
                              ? `No address on this booking — showing all online ${eligMeta.category || eligMeta.skill} partners (area filter skipped).`
                              : `Service category unknown — showing all online partners serving ${[eligMeta.area?.city, eligMeta.area?.pincode].filter(Boolean).join(" · ")}.`}
                        </span>
                      )}
                      <span className="ml-auto opacity-70">{eligible.length} online</span>
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none" data-testid="assign-include-offline">
                    <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 accent-primary-700" checked={includeOffline} onChange={(ev) => toggleOffline(ev.target.checked)} />
                    Include offline partners <span className="text-slate-400">(force-assign a trusted pro when nobody is online)</span>
                  </label>
                  {eligible.length === 0 ? (
                    <p className="text-sm text-slate-400" data-testid="assign-empty">No {includeOffline ? "" : "online "}{eligMeta?.category || ""} partner serves {eligMeta?.area?.pincode || eligMeta?.area?.city || "this area"} right now.</p>
                  ) : (<>
                  <div className="relative">
                    <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input data-testid="partner-search" value={partnerQuery} onChange={(e) => setPartnerQuery(e.target.value)}
                      placeholder="Search partner by name or phone…" className="pl-8" />
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredEligible.length === 0 && <p className="text-sm text-slate-400 py-2">No partner matches &ldquo;{partnerQuery}&rdquo;.</p>}
                  {filteredEligible.map((e) => <AssignPartnerRow key={e.id} e={e} busy={busy} onAssign={doAssign} />)}
                  </div>
                  </>)}
                  {nearby.length > 0 && (
                    <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-700" data-testid="assign-nearby">
                      <button type="button" data-testid="assign-nearby-toggle" onClick={() => setShowNearby((v) => !v)}
                        className="w-full flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 py-1.5">
                        <MapPin className="h-3.5 w-3.5 text-amber-600" />
                        Nearby areas · {nearby.length} {eligMeta?.category || ""} partner{nearby.length === 1 ? "" : "s"} within {eligMeta?.nearby_radius_km || 15} km
                        {eligMeta?.free_in_area === 0 && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">no one free in {eligMeta?.area?.pincode || "area"}</span>}
                        <span className="ml-auto text-slate-400">{showNearby ? "Hide" : "Show"}</span>
                      </button>
                      {showNearby && (
                        <div className="space-y-2 max-h-72 overflow-y-auto">
                          {nearby.filter((e) => { const q = partnerQuery.trim().toLowerCase(); return !q || (e.name || "").toLowerCase().includes(q) || (e.phone || "").includes(q); })
                            .map((e) => <AssignPartnerRow key={e.id} e={e} busy={busy} onAssign={doAssign} nearby />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </DCard>
          )}

          {/* Merchant involvement */}
          {(data.customer_merchant || data.referral_merchant) && (
            <DCard title="Merchant Involvement" icon={Store}>
              <div className="space-y-3">
                {data.customer_merchant && <MerchantMini m={data.customer_merchant} tag="Customer booked via" />}
                {data.referral_merchant && <MerchantMini m={data.referral_merchant} tag="Onboarded the partner" />}
              </div>
            </DCard>
          )}

          {/* Commission breakdown */}
          <DCard title="Commission Breakdown" icon={IndianRupee}
            action={<span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${comm.settled ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{comm.settled ? "Settled" : "Projected"}</span>}>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">{comm.kind === "cancellation" ? "Cancellation: refund + retained-share split (tax excluded)" : "Split of amount paid excluding tax (all charges − discounts)"}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">Base {fmt(comm.base)}</span>
            </div>
            {/* Structured, step-by-step money flow — every figure traceable to config */}
            <div className="mb-3"><CommissionFlow comm={comm} couponCode={b.coupon_code} /></div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Who receives what</p>
            <div className="space-y-2">
              {rows.map((r, i) => {
                const Icon = COMM_ICON[r.role] || IndianRupee;
                const tone = COMM_TONE[r.role] || "bg-slate-50 text-slate-600 ring-slate-200";
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-xl p-3 ${r.eligible ? "bg-white dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800" : "bg-slate-50/70 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-700 opacity-80"}`} data-testid={`commission-row-${r.role}`}>
                    <div className={`h-9 w-9 rounded-lg flex items-center justify-center ring-1 ${tone}`}><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate">{r.name}</p>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{COMM_LABEL[r.role] || r.role}</span>
                      </div>
                      <p className="text-xs text-slate-400">{r.note}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold ${r.eligible ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{fmt(r.amount)}</p>
                      <p className="text-[11px] text-slate-400">{r.pct}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </DCard>
        </div>

        {/* Side column */}
        <div className="space-y-5">
          <DCard title="Customer" icon={UserIcon}>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{b.customer_name || "—"}</p>
            {b.customer_phone && <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><Phone className="h-3.5 w-3.5" />{b.customer_phone}</p>}
          </DCard>

          <DCard title="Progress" icon={Activity}>
            {onJumpToStatus && <p className="text-[11px] text-slate-400 mb-2">Tip: kisi bhi stage par click karke us stage ke sabhi bookings dekhein.</p>}
            {(b.timeline || []).length ? (
              <ol className="relative">
                {b.timeline.map((t, i) => {
                  const last = i === b.timeline.length - 1;
                  const cancel = (t.status || "").toLowerCase() === "cancelled";
                  const clickable = !!onJumpToStatus;
                  const Node = clickable ? "button" : "div";
                  return (
                    <li key={i} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-white ${cancel ? "bg-rose-500" : "bg-emerald-500"} ${last ? (cancel ? "ring-4 ring-rose-100" : "ring-4 ring-emerald-100") : ""}`}>
                          {cancel ? <X className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        </div>
                        {!last && <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700 mt-1" />}
                      </div>
                      <Node
                        {...(clickable ? { type: "button", onClick: () => onJumpToStatus(t.status), "data-testid": `timeline-jump-${(t.status || "").toLowerCase()}` } : {})}
                        className={`pb-1 -mt-0.5 text-left rounded-md ${clickable ? "group/tl hover:bg-slate-50 dark:hover:bg-slate-800 px-2 -mx-2 transition-colors cursor-pointer w-full" : ""}`}
                      >
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize flex items-center gap-1">
                          {String(t.status).replace(/_/g, " ")}
                          {clickable && <span className="text-[10px] text-primary-500 opacity-0 group-hover/tl:opacity-100 transition-opacity">→ view</span>}
                        </p>
                        <p className="text-[11px] text-slate-400">{t.at ? new Date(t.at).toLocaleString() : ""}</p>
                      </Node>
                    </li>
                  );
                })}
              </ol>
            ) : <p className="text-sm text-slate-400">No activity yet.</p>}
          </DCard>

          <DispatchTimelineCard id={id} />

          <DCard title="Payment Summary" icon={Wallet}>
            <div className="text-sm space-y-1.5">
              <Row l="Service Amount" v={fmt(p.base ?? p.subtotal ?? 0)} />
              {p.addons_total > 0 && <Row l="Add-ons" v={fmt(p.addons_total)} />}
              {(p.emergency_fee || 0) > 0 && <Row l="Emergency Fee" v={fmt(p.emergency_fee)} />}
              {(p.surge || 0) > 0 && <Row l="Surge Charge" v={fmt(p.surge)} />}
              {(p.visiting_charge || 0) > 0 && <Row l="Visiting Charge" v={fmt(p.visiting_charge)} />}
              {(p.platform_fee || 0) > 0 && <Row l="Platform Fee" v={fmt(p.platform_fee)} />}
              {(p.convenience_fee || 0) > 0 && <Row l="Convenience Fee" v={fmt(p.convenience_fee)} />}
              {p.discount > 0 && <Row l={`Coupon discount${b.coupon_code ? ` (${b.coupon_code})` : ""}`} v={"-" + fmt(p.discount)} />}
              {p.membership_discount > 0 && <Row l="Member discount" v={"-" + fmt(p.membership_discount)} />}
              {p.membership_visit_waiver > 0 && <Row l="Free visiting (Member)" v={"-" + fmt(p.membership_visit_waiver)} />}
              {p.loyalty_discount > 0 && <Row l="Loyalty discount" v={"-" + fmt(p.loyalty_discount)} />}
              {p.referral_discount > 0 && <Row l="Referral discount" v={"-" + fmt(p.referral_discount)} />}
              <div data-testid="pay-taxable"><Row l="Taxable Amount" v={fmt(p.taxable ?? p.commissionable_base ?? 0)} /></div>
              {p.gst > 0 && <Row l={`Tax${p.gst_pct ? ` (${p.gst_pct}%)` : ""}`} v={fmt(p.gst)} />}
              <div className="flex justify-between pt-2 mt-1 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white"><span>Total</span><span>{fmt(p.total)}</span></div>
            </div>
          </DCard>

          <DCard title="Manage Booking" icon={ShieldCheck}>
            <div className="space-y-3">
              {!["cancelled", "paid"].includes(b.status) && (
                <div>
                  <Button data-testid="reschedule-toggle" variant="outline" size="sm" className="w-full" onClick={() => setShowResched((s) => !s)}>{showResched ? "Cancel reschedule" : "Reschedule booking"}</Button>
                  {showResched && (
                    <div className="mt-3 space-y-2">
                      <SchedulePicker value={resched} onChange={setResched} />
                      <Button data-testid="reschedule-save" disabled={busy} onClick={doReschedule} className="w-full bg-primary-700 hover:bg-primary-800">Save new slot</Button>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Refund amount (blank = full)</label>
                <div className="flex gap-2 mt-1">
                  <Input data-testid="refund-amount" type="number" placeholder={String(p.total || 0)} value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} className="flex-1" />
                  <Button data-testid="refund-booking" variant="outline" disabled={busy} onClick={doRefund} className="text-red-600 border-red-200 hover:bg-red-50 shrink-0">Refund</Button>
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm" data-testid="refund-history">
                <div className="flex justify-between font-medium text-slate-700 dark:text-slate-200">
                  <span>Refunded: <b className="text-red-600">{fmt(refundedSoFar)}</b></span>
                  <span>Remaining: <b className="text-emerald-600">{fmt(remaining)}</b></span>
                </div>
                {refunds.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-slate-200 dark:border-slate-700 pt-2">
                    {refunds.map((r) => (
                      <div key={r.id} className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                        <span>{r.reason || "Refund"} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</span>
                        <span className="font-semibold">{fmt(r.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DCard>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Users (providers/merchants/customers) ---------------- */
export const UsersSection = ({ role, onView }) => {
  const { rows, loading, load } = useList(`/admin/users?role=${role}`, [role]);
  const [tab, setTab] = useState("all");
  const nav2 = useNavigate();
  const openUser = (id) => (onView ? onView(id) : nav2(`/admin/user/${id}`));
  const kyc = async (id, status) => { await api.post(`/admin/kyc/${id}?status=${status}`); toast.success(`KYC ${status}`); load(); };
  const title = { partner: "Providers", merchant: "Merchants", customer: "Customers" }[role] || "Users";
  const matchTab = (u) => {
    if (tab === "all") return true;
    if (tab === "online" || tab === "offline") return (u.partner_status || "offline") === tab;
    return (u.kyc_status || "pending") === tab;
  };
  const filtered = rows.filter(matchTab);
  let tabs = [{ key: "all", label: "All", count: rows.length }];
  if (role !== "customer") {
    const kc = rows.reduce((m, u) => { const k = u.kyc_status || "pending"; m[k] = (m[k] || 0) + 1; return m; }, {});
    tabs.push({ key: "pending", label: "Pending KYC", count: kc.pending || 0 });
    tabs.push({ key: "approved", label: "Approved", count: kc.approved || 0 });
    if (role === "partner") {
      const on = rows.filter((u) => (u.partner_status || "offline") === "online").length;
      tabs.push({ key: "online", label: "Online", count: on });
      tabs.push({ key: "offline", label: "Offline", count: rows.length - on });
    }
  }
  const columns = [
    { key: "name", label: "Name", sortable: true, render: (u) => <span className="font-medium text-slate-800 dark:text-slate-100">{u.shop_name || u.name}</span> },
    { key: "phone", label: "Phone", render: (u) => <span className="text-slate-500 dark:text-slate-400">{u.phone}</span> },
    ...(role === "partner" ? [
      { key: "skills", label: "Skills", render: (u) => (u.skills || []).join(", ") || "—" },
      { key: "jobs_completed", label: "Jobs", sortable: true },
      { key: "rating", label: "Rating", sortable: true, render: (u) => <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{u.rating}</span> },
    ] : []),
    ...(role !== "customer" ? [{ key: "kyc_status", label: "KYC", render: (u) => u.kyc_status === "approved" ? <SBadge s="approved" /> : <div className="flex gap-1 items-center"><SBadge s="pending" /><Button data-testid={`approve-${u.id}`} size="sm" className="h-6 px-2 bg-primary-700 hover:bg-primary-800" onClick={() => kyc(u.id, "approved")}>Approve</Button></div> }] : []),
    { key: "wallet_balance", label: "Wallet", sortable: true, render: (u) => <span className="font-semibold">{fmt(u.wallet_balance)}</span>, exportValue: (u) => u.wallet_balance },
    { key: "_action", label: "", render: (u) => <button data-testid={`view-user-${u.id}`} onClick={() => openUser(u.id)} className="text-primary-700 flex items-center gap-1 text-xs font-semibold"><Eye className="h-4 w-4" /> View</button> },
  ];
  return (
    <div className="space-y-4">
      {tabs.length > 1 && <StatusTabs tabs={tabs} value={tab} onChange={setTab} />}
      <DataTable
        title={title} subtitle={`${filtered.length} ${role}s`}
        rows={filtered} loading={loading}
        searchKeys={["name", "shop_name", "phone", "email"]}
        searchPlaceholder="Search name or phone…"
        exportName={role}
        filters={role !== "customer" ? [{ key: "kyc_status", label: "KYC", options: [{ label: "Approved", value: "approved" }, { label: "Pending", value: "pending" }] }] : []}
        columns={columns}
        emptyText={`No ${role}s found`}
      />
    </div>
  );
};

const RoleIcon = { customer: UserIcon, partner: Wrench, merchant: Store, admin: ShieldCheck };
const PField = ({ label, value }) => value ? <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="text-slate-800 dark:text-slate-100 mt-0.5">{value}</p></div> : null;

// Full-screen document lightbox with zoom controls (images + PDFs).
const DocLightbox = ({ url, label, onClose }) => {
  const [scale, setScale] = useState(1);
  if (!url) return null;
  const isPdf = String(url).toLowerCase().includes(".pdf");
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" data-testid="doc-lightbox" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        {!isPdf && (
          <>
            <button data-testid="doc-zoom-out" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} className="h-10 w-10 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xl font-bold grid place-items-center">−</button>
            <span className="text-white text-sm font-semibold w-14 text-center">{Math.round(scale * 100)}%</span>
            <button data-testid="doc-zoom-in" onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))} className="h-10 w-10 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xl font-bold grid place-items-center">+</button>
          </>
        )}
        <a href={url} target="_blank" rel="noreferrer" className="h-10 px-3 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-semibold grid place-items-center">Open ↗</a>
        <button data-testid="doc-close" onClick={onClose} className="h-10 w-10 rounded-lg bg-white/15 hover:bg-white/25 text-white grid place-items-center"><X className="h-5 w-5" /></button>
      </div>
      {label && <div className="absolute top-5 left-5 text-white/80 text-sm font-medium z-10">{label}</div>}
      <div className="relative max-w-[92vw] max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        {isPdf
          ? <iframe title={label || "document"} src={url} className="w-[85vw] h-[85vh] rounded-lg bg-white" />
          : <img src={url} alt={label || "document"} className="rounded-lg shadow-2xl transition-transform duration-150 select-none" style={{ transform: `scale(${scale})`, transformOrigin: "center" }} />}
      </div>
    </div>
  );
};

// Inline KYC decision bar reused inside the partner profile — approve/reject in one place.
const KycActionBar = ({ profile, userId, onDone }) => {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const approve = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/partners/${userId}/kyc-action`, { action: "approve" });
      toast.success("KYC approved"); onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const reject = async () => {
    if (!reason.trim()) return toast.error("Please add a rejection reason");
    setBusy(true);
    try {
      // unified endpoint stores the reason (shown to the provider) for both
      // registration-flow and directly-added partners
      await api.post(`/admin/partners/${userId}/kyc-action`, { action: "reject", reason: reason.trim() });
      toast.success("KYC rejected"); onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-4" data-testid="kyc-action-bar">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="h-5 w-5 text-amber-600" />
        <p className="font-heading font-bold text-slate-800 dark:text-white">KYC pending — approve or reject this provider</p>
      </div>
      {!rejecting ? (
        <div className="flex gap-3">
          <Button data-testid="profile-kyc-approve" onClick={approve} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Approve KYC</>}
          </Button>
          <Button data-testid="profile-kyc-reject-open" onClick={() => setRejecting(true)} variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50">
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea data-testid="profile-kyc-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Reason for rejection (shown to provider)…"
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-3 text-sm focus:outline-none focus:border-red-400" />
          <div className="flex gap-2">
            <Button data-testid="profile-kyc-reject-confirm" onClick={reject} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Rejection"}
            </Button>
            <Button variant="outline" onClick={() => { setRejecting(false); setReason(""); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
};

// Admin control bar shown on a customer's 360° profile — block/unblock, wallet
// adjustment (credit/debit), direct message and account deletion. Every action
// hits a real backend endpoint and reflects instantly.
const CustomerAdminActions = ({ user, userId, onDone, onDeleted }) => {
  const [walletOpen, setWalletOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const blocked = !!user.blocked || user.status === "blocked";

  const [wf, setWf] = useState({ amount: "", direction: "credit", note: "" });
  const [mf, setMf] = useState({ channel: "push", title: "", body: "" });
  const [blockReason, setBlockReason] = useState("");
  const [delReason, setDelReason] = useState("");

  const adjustWallet = async () => {
    const amt = Number(wf.amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      await api.post(`/admin/customers/${userId}/wallet`, { amount: amt, direction: wf.direction, note: wf.note });
      toast.success(`Wallet ${wf.direction === "credit" ? "credited" : "debited"} ₹${amt}`);
      setWalletOpen(false); setWf({ amount: "", direction: "credit", note: "" }); onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const sendMsg = async () => {
    if (!mf.title.trim() || !mf.body.trim()) return toast.error("Title and message are required");
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/customers/${userId}/notify`, mf);
      toast.success(data.note || "Message sent");
      setMsgOpen(false); setMf({ channel: "push", title: "", body: "" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const toggleBlock = async () => {
    setBusy(true);
    try {
      await api.post(`/admin/customers/${userId}/block`, { block: !blocked, reason: blockReason });
      toast.success(blocked ? "Customer unblocked" : "Customer blocked");
      setBlockOpen(false); setBlockReason(""); onDone?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const doDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/admin/customers/${userId}`);
      toast.success("Customer account deleted");
      setDelOpen(false); onDeleted?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 mb-5" data-testid="customer-admin-actions">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary-700" />
          <div>
            <p className="font-heading font-bold text-slate-900 dark:text-white">Admin controls</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {blocked ? "This account is currently blocked." : "Manage this customer's account, wallet and messaging."}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button data-testid="cust-action-wallet" size="sm" variant="outline" onClick={() => setWalletOpen(true)} className="gap-1"><Wallet className="h-4 w-4" /> Adjust Wallet</Button>
          <Button data-testid="cust-action-message" size="sm" variant="outline" onClick={() => setMsgOpen(true)} className="gap-1"><Send className="h-4 w-4" /> Send Message</Button>
          {blocked
            ? <Button data-testid="cust-action-unblock" size="sm" onClick={() => setBlockOpen(true)} className="gap-1 bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4" /> Unblock</Button>
            : <Button data-testid="cust-action-block" size="sm" variant="outline" onClick={() => setBlockOpen(true)} className="gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"><Ban className="h-4 w-4" /> Block</Button>}
          <Button data-testid="cust-action-delete" size="sm" variant="outline" onClick={() => setDelOpen(true)} className="gap-1 border-red-200 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</Button>
        </div>
      </div>

      {/* Wallet dialog */}
      <Dialog open={walletOpen} onOpenChange={setWalletOpen}>
        <DialogContent data-testid="cust-wallet-dialog">
          <DialogHeader><DialogTitle className="font-heading">Adjust wallet balance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              {["credit", "debit"].map((dir) => (
                <button key={dir} data-testid={`cust-wallet-${dir}`} onClick={() => setWf((p) => ({ ...p, direction: dir }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold capitalize transition ${wf.direction === dir ? (dir === "credit" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-600") : "border-slate-200 text-slate-500"}`}>{dir}</button>
              ))}
            </div>
            <Input data-testid="cust-wallet-amount" type="number" min="1" placeholder="Amount (₹)" value={wf.amount} onChange={(e) => setWf((p) => ({ ...p, amount: e.target.value }))} />
            <Input data-testid="cust-wallet-note" placeholder="Note (optional)" value={wf.note} onChange={(e) => setWf((p) => ({ ...p, note: e.target.value }))} />
            <Button data-testid="cust-wallet-save" onClick={adjustWallet} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">{busy ? "Saving…" : "Apply adjustment"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Message dialog */}
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent data-testid="cust-message-dialog">
          <DialogHeader><DialogTitle className="font-heading">Send message to customer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={mf.channel} onValueChange={(v) => setMf((p) => ({ ...p, channel: v }))}>
              <SelectTrigger data-testid="cust-msg-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="push">In-app / Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Input data-testid="cust-msg-title" placeholder="Title" value={mf.title} onChange={(e) => setMf((p) => ({ ...p, title: e.target.value }))} />
            <Textarea data-testid="cust-msg-body" placeholder="Message…" rows={3} value={mf.body} onChange={(e) => setMf((p) => ({ ...p, body: e.target.value }))} />
            <Button data-testid="cust-msg-send" onClick={sendMsg} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">{busy ? "Sending…" : "Send message"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent data-testid="cust-block-dialog">
          <DialogHeader><DialogTitle className="font-heading">{blocked ? "Unblock customer" : "Block customer"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">{blocked ? "This will restore the customer's access." : "The customer will be prevented from placing new bookings."}</p>
            {!blocked && <Textarea data-testid="cust-block-reason" placeholder="Reason (optional)" rows={2} value={blockReason} onChange={(e) => setBlockReason(e.target.value)} />}
            <Button data-testid="cust-block-confirm" onClick={toggleBlock} disabled={busy} className={`w-full ${blocked ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"}`}>{busy ? "Please wait…" : (blocked ? "Unblock" : "Block customer")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent data-testid="cust-delete-dialog">
          <DialogHeader><DialogTitle className="font-heading text-red-600">Delete customer account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700 flex gap-2"><ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /> This permanently removes the account and cannot be undone.</div>
            <Textarea data-testid="cust-delete-reason" placeholder="Reason (for the audit log)" rows={2} value={delReason} onChange={(e) => setDelReason(e.target.value)} />
            <Button data-testid="cust-delete-confirm" onClick={doDelete} disabled={busy} className="w-full bg-red-600 hover:bg-red-700">{busy ? "Deleting…" : "Yes, delete this account"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


/* ============================================================================
   CUSTOMER 360° INTELLIGENCE CENTER — premium redesign (real data only).
   Consumes the SAME /admin/users/{id}/detail payload (passed as prop `d`) plus
   /admin/customers/{id}/timeline. No dummy data — empty states everywhere.
   ============================================================================ */
const DASH_ALL = { key: "all", label: "All Time", from: "", to: "", allTime: true };
const csMoney = (n) => "\u20b9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const csCompact = (n) => { const a = Math.abs(Number(n) || 0); const s = Number(n) < 0 ? "-" : ""; const t = (v) => v.toFixed(2).replace(/\.?0+$/, ""); if (a >= 1e7) return s + t(a / 1e7) + "Cr"; if (a >= 1e5) return s + t(a / 1e5) + "L"; if (a >= 1e3) return s + t(a / 1e3) + "K"; return s + (Number.isInteger(a) ? a : t(a)); };
const csFmtC = (n) => "\u20b9" + csCompact(n);
const CsCard = ({ className = "", children }) => <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</div>;
const CsEmpty = ({ icon: Icon = ClipboardList, text = "No data available" }) => (
  <div className="grid place-items-center py-10 text-center"><div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center mb-2.5"><Icon className="h-6 w-6 text-slate-400" /></div><p className="text-sm font-medium text-slate-500 dark:text-slate-400">{text}</p></div>
);
const CsSel = ({ value, onChange, children, testid, ph }) => (
  <PremiumSelect data-testid={testid} value={value} onChange={onChange} placeholder={ph} className="!h-9 max-w-[160px] rounded-xl">
    <option value="">{ph}</option>{children}
  </PremiumSelect>
);

const CustomerProfile360 = ({ d, userId, reload, onBack }) => {
  const u = d.user;
  const stats = d.stats || {};
  const [tab, setTab] = useState("overview");
  const [timeline, setTimeline] = useState(null);
  const [tlSort, setTlSort] = useState("new");
  const [zoom, setZoom] = useState(null);
  useEffect(() => {
    if (tab === "timeline" && timeline === null) {
      api.get(`/admin/customers/${userId}/timeline`).then((r) => setTimeline(r.data.events || [])).catch(() => setTimeline([]));
    }
  }, [tab, timeline, userId]);

  const initials = (u.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const joined = u.created_at ? new Date(u.created_at) : null;
  const memberSince = joined ? joined.toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "—";
  const TIER_PILL = { platinum: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", gold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", silver: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200", bronze: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", new: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" };
  const txns = d.transactions || [];
  const refundTotal = stats.total_refund != null ? stats.total_refund : txns.filter((t) => String(t.kind || "").toLowerCase().includes("refund")).reduce((a, b) => a + (b.amount || 0), 0);
  const invoices = d.invoices || [];
  const refundsList = d.refunds || [];
  const blocked = u.blocked || u.status === "blocked";

  const kpis = [
    { l: "Lifetime Spend", v: csFmtC(stats.total_spent || 0), t: csMoney(stats.total_spent || 0), icon: IndianRupee, tone: "text-primary-700 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300" },
    { l: "Bookings", v: `${stats.completed ?? 0}/${stats.bookings ?? (d.bookings || []).length}`, sub: "completed / total", icon: ClipboardList, tone: "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300" },
    { l: "Avg Order", v: csFmtC(stats.avg_order_value || 0), t: csMoney(stats.avg_order_value || 0), icon: Package, tone: "text-violet-700 bg-violet-50 dark:bg-violet-900/30 dark:text-violet-300" },
    { l: "Wallet", v: csFmtC(stats.wallet ?? u.wallet_balance ?? 0), t: csMoney(stats.wallet ?? u.wallet_balance ?? 0), icon: Wallet, tone: "text-sky-700 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-300" },
    { l: "Refunds", v: csFmtC(refundTotal), t: csMoney(refundTotal), icon: RefreshCw, tone: "text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-300" },
    { l: "Member Since", v: memberSince, icon: Award, tone: "text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300" },
  ];

  const TABS = [["overview", "Overview", UserIcon], ["timeline", "Timeline", Activity], ["bookings", "Bookings", Package], ["invoices", "Invoices", FileText], ["refunds", "Refunds", RefreshCw], ["transactions", "Transactions", Wallet], ["wallet", "Wallet", IndianRupee], ["addresses", "Addresses", MapPin]];

  return (
    <div data-testid="customer-profile-360">
      <button data-testid="ud-back" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-700 mb-4"><ArrowLeft className="h-4 w-4" /> Back to list</button>

      {/* Action center (real admin actions with confirmations) */}
      <CustomerAdminActions user={u} userId={userId} onDone={reload} onDeleted={onBack} />

      {/* Premium header */}
      <CsCard className="overflow-hidden mb-4">
        <div className="relative h-28 md:h-32 bg-gradient-to-br from-primary-700 via-fuchsia-600 to-sky-500">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 18% 20%, rgba(255,255,255,0.5) 0, transparent 45%), radial-gradient(circle at 82% 65%, rgba(255,255,255,0.35) 0, transparent 40%)" }} />
          <span className="absolute top-4 right-5 inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white text-[11px] font-mono font-semibold tracking-wide">#{String(u.id || "").slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="px-4 md:px-6 pb-5">
          <div className="-mt-12 flex items-end gap-4">
            <div className="h-24 w-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 bg-gradient-to-br from-primary-600 to-primary-800 overflow-hidden grid place-items-center text-white text-3xl font-extrabold shadow-lg shrink-0">
              {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover" /> : initials}
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{u.name}</h1>
              <Badge className="bg-primary-50 text-primary-700 border-0 dark:bg-primary-900/30 dark:text-primary-300">Customer</Badge>
              {stats.tier_label && <Badge className={`border-0 flex items-center gap-1 capitalize ${TIER_PILL[stats.tier] || "bg-slate-100 text-slate-600"}`}><Award className="h-3 w-3" /> {stats.tier_label}</Badge>}
              {(stats.bookings ?? 0) >= 2 && <Badge className="border-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-1"><Repeat className="h-3 w-3" /> Repeat</Badge>}
              <Badge className={`border-0 flex items-center gap-1 ${blocked ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"}`}><span className={`h-1.5 w-1.5 rounded-full ${blocked ? "bg-red-500" : "bg-emerald-500"}`} /> {blocked ? "Blocked" : "Active"}</Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{u.phone}</span>
              {u.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{u.email}</span>}
              {(u.city || u.state) && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[u.city, u.state].filter(Boolean).join(", ")}</span>}
              {joined && <span className="flex items-center gap-1"><Clock className="h-4 w-4" />Joined {joined.toLocaleDateString()}</span>}
            </div>
          </div>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-5">
            {kpis.map((k) => (
              <div key={k.l} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-3.5">
                <div className="flex items-center justify-between"><p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{k.l}</p><span className={`h-7 w-7 rounded-lg grid place-items-center ${k.tone}`}><k.icon className="h-3.5 w-3.5" /></span></div>
                <p className="font-heading font-extrabold text-lg md:text-xl text-slate-900 dark:text-white mt-1.5 whitespace-nowrap" title={k.t || k.v}>{k.v}</p>
                {k.sub && <p className="text-[10px] text-slate-400 mt-0.5">{k.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </CsCard>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4 w-full md:w-fit overflow-x-auto no-scrollbar">
        {TABS.map(([k, l, Icon]) => (
          <button key={k} data-testid={`cp-tab-${k}`} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition inline-flex items-center gap-1.5 whitespace-nowrap ${tab === k ? "bg-white dark:bg-slate-900 text-primary-700 dark:text-primary-300 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}><Icon className="h-4 w-4" />{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-4">
          <CsCard className="p-5">
            <h2 className="font-heading font-bold text-[15px] mb-4 text-slate-900 dark:text-white">Profile Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <PField label="Name" value={u.name} />
              <PField label="Gender" value={u.gender} />
              <PField label="Email" value={u.email} />
              <PField label="Language" value={u.language} />
              <PField label="Alt. Mobile" value={u.alternate_mobile} />
              <PField label="DOB" value={u.dob} />
              <PField label="Joined" value={joined ? joined.toLocaleDateString() : null} />
              <PField label="Customer ID" value={String(u.id || "").slice(0, 8).toUpperCase()} />
            </div>
            <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-3" data-testid="customer-insights">
              {[["Completed", stats.completed ?? 0], ["Cancelled", stats.cancelled ?? 0], ["Avg order", csFmtC(stats.avg_order_value || 0)]].map(([k, v]) => (
                <div key={k} className="text-center rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3"><p className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{v}</p><p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{k}</p></div>
              ))}
            </div>
            {stats.last_booking_at && <p className="text-xs text-slate-400 mt-3 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Last booking {new Date(stats.last_booking_at).toLocaleDateString()}</p>}
          </CsCard>
          <div className="lg:col-span-2 space-y-4">
            {stats.tier_label && (
              <CsCard className="p-5" >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white"><Award className="h-5 w-5 text-primary-700" /> Loyalty — <span className={`px-2 py-0.5 rounded-full text-sm capitalize ${TIER_PILL[stats.tier] || "bg-slate-100 text-slate-600"}`}>{stats.tier_label}</span></h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">Lifetime {csMoney(stats.total_spent || 0)}</span>
                </div>
                {stats.next_tier ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1"><span>Progress to {stats.next_tier}</span><span>{csMoney(stats.amount_to_next_tier || 0)} to go</span></div>
                    <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full bg-gradient-to-r from-primary-500 to-fuchsia-500" style={{ width: `${Math.min(100, Math.max(6, Math.round(((stats.total_spent || 0) / ((stats.total_spent || 0) + (stats.amount_to_next_tier || 1))) * 100)))}%` }} /></div>
                  </div>
                ) : <p className="text-sm text-emerald-600 mt-2 font-medium">Top tier reached — enjoy the best perks!</p>}
                {(stats.tier_perks || []).length > 0 && <div className="flex flex-wrap gap-2 mt-4">{(stats.tier_perks || []).map((p, i) => <span key={i} className="inline-flex items-center gap-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-2.5 py-1 text-slate-600 dark:text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {p}</span>)}</div>}
              </CsCard>
            )}
            {(d.favourite_services || []).length > 0 && (
              <CsCard className="p-5" >
                <h2 className="font-heading font-bold text-[15px] mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Heart className="h-5 w-5 text-primary-700" /> Favourite Services</h2>
                <div className="flex flex-wrap gap-2">{(d.favourite_services || []).map((s, i) => <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1.5 text-sm font-medium">{s.name} <span className="text-[11px] bg-primary-200/60 dark:bg-primary-800 rounded-full px-1.5">{s.count}×</span></span>)}</div>
              </CsCard>
            )}
            <CsCard className="p-5">
              <h2 className="font-heading font-bold text-[15px] mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Activity className="h-5 w-5 text-primary-700" /> Recent Activity</h2>
              {(d.notifications || []).length === 0 ? <CsEmpty icon={Activity} text="No recent activity" /> : (
                <div className="space-y-2 max-h-80 overflow-y-auto">{(d.notifications || []).slice(0, 25).map((n, i) => <div key={i} className="text-sm border-l-2 border-primary-200 dark:border-primary-800 pl-3 py-0.5"><p className="text-slate-700 dark:text-slate-200 font-medium">{n.title}</p><p className="text-[11px] text-slate-400">{n.body} · {new Date(n.created_at).toLocaleString()}</p></div>)}</div>
              )}
            </CsCard>
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <CsCard className="p-5" data-testid="customer-timeline">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white"><Activity className="h-5 w-5 text-primary-700" /> Activity Timeline{timeline ? ` (${timeline.length})` : ""}</h2>
            <CsSel testid="cp-tl-sort" ph="Newest" value={tlSort === "new" ? "" : "old"} onChange={(e) => setTlSort(e.target.value === "old" ? "old" : "new")}><option value="old">Oldest first</option></CsSel>
          </div>
          {timeline === null && <CsEmpty icon={Activity} text="Loading timeline…" />}
          {timeline && timeline.length === 0 && <CsEmpty icon={Activity} text="No activity yet" />}
          {timeline && timeline.length > 0 && (
            <div className="relative pl-6">
              <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-4">
                {[...timeline].sort((a, b) => tlSort === "new" ? String(b.at).localeCompare(String(a.at)) : String(a.at).localeCompare(String(b.at))).map((e, i) => {
                  const meta = { booking: { icon: Package, tone: "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300" }, transaction: { icon: Wallet, tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }, message: { icon: Bell, tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" }, account: { icon: ShieldAlert, tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" } }[e.type] || { icon: Activity, tone: "bg-slate-100 text-slate-600" };
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="relative" data-testid={`timeline-item-${i}`}>
                      <span className={`absolute -left-[22px] top-0.5 h-6 w-6 rounded-full grid place-items-center ${meta.tone}`}><Icon className="h-3.5 w-3.5" /></span>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>{e.subtitle && <p className="text-xs text-slate-400 truncate">{e.subtitle}</p>}<p className="text-[11px] text-slate-400 mt-0.5">{new Date(e.at).toLocaleString()}</p></div>
                        {e.amount != null && <span className={`text-sm font-semibold whitespace-nowrap ${e.direction === "credit" ? "text-emerald-600" : e.direction === "debit" ? "text-red-500" : "text-slate-700 dark:text-slate-200"}`}>{e.direction === "credit" ? "+" : e.direction === "debit" ? "-" : ""}{csMoney(e.amount)}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CsCard>
      )}

      {tab === "bookings" && <CustomerBookingsTab rows={d.bookings || []} />}
      {tab === "invoices" && <CustomerInvoicesTab rows={invoices} />}
      {tab === "refunds" && <CustomerRefundsTab rows={refundsList} />}
      {tab === "transactions" && <CustomerTxnsTab rows={txns} />}

      {tab === "wallet" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[["Balance", csFmtC(stats.wallet ?? u.wallet_balance ?? 0), "text-primary-700"], ["Credits", csFmtC(txns.filter((t) => t.type === "credit").reduce((a, b) => a + (b.amount || 0), 0)), "text-emerald-600"], ["Debits", csFmtC(txns.filter((t) => t.type === "debit").reduce((a, b) => a + (b.amount || 0), 0)), "text-red-500"], ["Refunds", csFmtC(refundTotal), "text-rose-600"]].map(([k, v, cls]) => (
              <CsCard key={k} className="p-4"><p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{k}</p><p className={`font-heading font-extrabold text-xl mt-1 ${cls}`}>{v}</p></CsCard>
            ))}
          </div>
          <CustomerTxnsTab rows={txns} title="Wallet Transactions" />
        </div>
      )}

      {tab === "addresses" && (
        <CsCard className="p-5">
          <h2 className="font-heading font-bold text-[15px] mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><MapPin className="h-5 w-5 text-primary-700" /> Saved Addresses ({(u.addresses || []).length})</h2>
          {(u.addresses || []).length === 0 ? <CsEmpty icon={MapPin} text="No saved addresses" /> : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {(u.addresses || []).map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                  <div className="flex items-center gap-2 mb-1"><span className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 grid place-items-center"><MapPin className="h-4 w-4" /></span><p className="font-semibold text-slate-800 dark:text-slate-100 capitalize">{a.label || "Address"}</p></div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{[a.line, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</p>
                  {(a.lat && a.lng) && <p className="text-[11px] text-slate-400 mt-1">GPS: {a.lat}, {a.lng}</p>}
                </div>
              ))}
            </div>
          )}
        </CsCard>
      )}

      <DocLightbox url={zoom?.url} label={zoom?.label} onClose={() => setZoom(null)} />
    </div>
  );
};

/* Bookings tab — search + status filter + date range + sort + pagination (real data). */
function CustomerBookingsTab({ rows }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState("");
  const [statusF, setStatusF] = useState(""); const [date, setDate] = useState(DASH_ALL);
  const [sortDir, setSortDir] = useState("desc"); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [dq, statusF, date, pageSize]);
  const statuses = Array.from(new Set(rows.map((r) => r.status)));
  const filtered = (() => {
    let out = rows;
    if (dq) { const s = dq.toLowerCase(); out = out.filter((r) => [r.code, r.service_name].some((v) => (v || "").toLowerCase().includes(s))); }
    if (statusF) out = out.filter((r) => r.status === statusF);
    if (!date.allTime && date.from && date.to) out = out.filter((r) => { const dd = (r.created_at || "").slice(0, 10); return dd >= date.from && dd <= date.to; });
    return [...out].sort((a, b) => sortDir === "asc" ? String(a.created_at).localeCompare(String(b.created_at)) : String(b.created_at).localeCompare(String(a.created_at)));
  })();
  const total = filtered.length; const pages = Math.max(1, Math.ceil(total / pageSize)); const start = (page - 1) * pageSize; const pageRows = filtered.slice(start, start + pageSize);
  return (
    <CsCard className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white"><Package className="h-5 w-5 text-primary-700" /> Booking History <span className="text-slate-400 font-normal">({total})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input data-testid="cp-bk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-40 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" /></div>
          <CsSel testid="cp-bk-status" ph="All Status" value={statusF} onChange={(e) => setStatusF(e.target.value)}>{statuses.map((s) => <option key={s} value={s} className="capitalize">{String(s).replace(/_/g, " ")}</option>)}</CsSel>
          <DashCalendar value={date} onChange={setDate} testid="cp-bk-date" />
        </div>
      </div>
      {total === 0 ? <CsEmpty icon={Package} text="No bookings found" /> : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800"><th className="py-2.5 pr-3">Code</th><th className="py-2.5 pr-3">Service</th><th className="py-2.5 pr-3 cursor-pointer select-none" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>Date {sortDir === "asc" ? "↑" : "↓"}</th><th className="py-2.5 pr-3">Status</th><th className="py-2.5 text-right">Amount</th></tr></thead>
              <tbody>{pageRows.map((b) => (<tr key={b.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"><td className="py-2.5 pr-3 font-semibold text-slate-800 dark:text-slate-100">#{b.code}</td><td className="py-2.5 pr-3 text-slate-700 dark:text-slate-200">{b.service_name}</td><td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{new Date(b.created_at).toLocaleDateString()}</td><td className="py-2.5 pr-3"><SBadge s={b.status} /></td><td className="py-2.5 text-right font-semibold text-slate-800 dark:text-white">{fmt(b.pricing?.total)}</td></tr>))}</tbody>
            </table>
          </div>
          <div className="md:hidden space-y-2.5">{pageRows.map((b) => (<div key={b.id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{b.service_name}</p><p className="text-[11px] text-slate-400">#{b.code} · {new Date(b.created_at).toLocaleDateString()}</p></div><SBadge s={b.status} /></div><p className="text-right font-bold text-slate-800 dark:text-white mt-1">{fmt(b.pricing?.total)}</p></div>))}</div>
          <CsPager page={page} pages={pages} total={total} start={start} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testid="cp-bk" />
        </>
      )}
    </CsCard>
  );
}

/* Transactions tab — search + type filter + pagination (real data). */
function CustomerTxnsTab({ rows, title = "Transaction Ledger" }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [typeF, setTypeF] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [dq, typeF, pageSize]);
  const filtered = (() => { let out = rows; if (dq) { const s = dq.toLowerCase(); out = out.filter((t) => [t.kind, t.note].some((v) => (v || "").toLowerCase().includes(s))); } if (typeF) out = out.filter((t) => t.type === typeF); return out; })();
  const total = filtered.length; const pages = Math.max(1, Math.ceil(total / pageSize)); const start = (page - 1) * pageSize; const pageRows = filtered.slice(start, start + pageSize);
  return (
    <CsCard className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white"><Wallet className="h-5 w-5 text-primary-700" /> {title} <span className="text-slate-400 font-normal">({total})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input data-testid="cp-tx-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-40 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" /></div>
          <CsSel testid="cp-tx-type" ph="All Types" value={typeF} onChange={(e) => setTypeF(e.target.value)}><option value="credit">Credit</option><option value="debit">Debit</option></CsSel>
        </div>
      </div>
      {total === 0 ? <CsEmpty icon={Wallet} text="No transactions available" /> : (
        <>
          <div className="space-y-2">{pageRows.map((t) => (<div key={t.id} className="flex items-center justify-between border border-slate-100 dark:border-slate-800 rounded-xl p-3"><div className="min-w-0"><p className="font-medium text-slate-800 dark:text-slate-100 text-sm capitalize">{t.kind}</p><p className="text-xs text-slate-400 truncate">{t.note || "—"}</p></div><span className={`font-semibold text-sm whitespace-nowrap ${t.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>{t.type === "credit" ? "+" : "-"}{fmt(t.amount)}</span></div>))}</div>
          <CsPager page={page} pages={pages} total={total} start={start} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testid="cp-tx" />
        </>
      )}
    </CsCard>
  );
}

function CsPager({ page, pages, total, start, pageSize, setPage, setPageSize, testid }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><span>Rows</span><CsSel testid={`${testid}-pagesize`} ph="10" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</CsSel><span className="ml-1">Showing {total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} of {total}</span></div>
      <div className="flex items-center gap-1"><button data-testid={`${testid}-prev`} disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button><span className="text-xs font-semibold text-slate-600 dark:text-slate-300 px-2">Page {page} / {pages}</span><button data-testid={`${testid}-next`} disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button></div>
    </div>
  );
}

/* Invoices tab — real invoices (customer_id) with search + status filter + pagination. */
function CustomerInvoicesTab({ rows }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [statusF, setStatusF] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10); const [sel, setSel] = useState(null);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [dq, statusF, pageSize]);
  const statuses = Array.from(new Set(rows.map((r) => r.payment_status).filter(Boolean)));
  const filtered = (() => { let out = rows; if (dq) { const s = dq.toLowerCase(); out = out.filter((r) => [r.invoice_number, r.booking_code, r.service_name].some((v) => (v || "").toLowerCase().includes(s))); } if (statusF) out = out.filter((r) => r.payment_status === statusF); return out; })();
  const total = filtered.length; const pages = Math.max(1, Math.ceil(total / pageSize)); const start = (page - 1) * pageSize; const pageRows = filtered.slice(start, start + pageSize);
  return (
    <CsCard className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white"><FileText className="h-5 w-5 text-primary-700" /> Invoices <span className="text-slate-400 font-normal">({total})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input data-testid="cp-inv-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-40 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" /></div>
          <CsSel testid="cp-inv-status" ph="All Payments" value={statusF} onChange={(e) => setStatusF(e.target.value)}>{statuses.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</CsSel>
        </div>
      </div>
      {total === 0 ? <CsEmpty icon={FileText} text="No invoices available" /> : (
        <>
          <div className="hidden md:block overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-800"><th className="py-2.5 pr-3">Invoice #</th><th className="py-2.5 pr-3">Type</th><th className="py-2.5 pr-3">Booking</th><th className="py-2.5 pr-3">Date</th><th className="py-2.5 pr-3">Payment</th><th className="py-2.5 pr-3 text-right">Amount</th><th className="py-2.5" /></tr></thead>
            <tbody>{pageRows.map((iv) => (<tr key={iv.id} className="border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50/70 dark:hover:bg-slate-800/40"><td className="py-2.5 pr-3 font-semibold text-slate-800 dark:text-slate-100">{iv.invoice_number}</td><td className="py-2.5 pr-3 capitalize text-slate-600 dark:text-slate-300">{iv.invoice_type}</td><td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400">#{iv.booking_code || "—"}</td><td className="py-2.5 pr-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">{iv.created_at ? new Date(iv.created_at).toLocaleDateString() : "—"}</td><td className="py-2.5 pr-3"><SBadge s={iv.payment_status} /></td><td className="py-2.5 pr-3 text-right font-semibold text-slate-800 dark:text-white">{fmt(iv.total_amount)}</td><td className="py-2.5"><button data-testid={`cp-inv-view-${iv.invoice_number}`} onClick={() => setSel(iv)} className="text-primary-600 hover:text-primary-800 text-xs font-semibold">View</button></td></tr>))}</tbody></table></div>
          <div className="md:hidden space-y-2.5">{pageRows.map((iv) => (<div key={iv.id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{iv.invoice_number}</p><p className="text-[11px] text-slate-400">#{iv.booking_code} · {iv.created_at ? new Date(iv.created_at).toLocaleDateString() : "—"}</p></div><SBadge s={iv.payment_status} /></div><div className="flex items-center justify-between mt-1"><span className="font-bold text-slate-800 dark:text-white">{fmt(iv.total_amount)}</span><button onClick={() => setSel(iv)} className="text-primary-600 text-xs font-semibold">View</button></div></div>))}</div>
          <CsPager page={page} pages={pages} total={total} start={start} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testid="cp-inv" />
        </>
      )}
      {sel && <InvoiceDrawer inv={sel} onClose={() => setSel(null)} />}
    </CsCard>
  );
}

/* Premium invoice detail drawer built from already-loaded real invoice data. */
function InvoiceDrawer({ inv, onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex justify-end" data-testid="cp-inv-drawer">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full overflow-y-auto shadow-2xl animate-[slideIn_.25s_ease]">
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 px-5 py-4 flex items-center justify-between">
          <div><p className="font-heading font-bold text-slate-900 dark:text-white">{inv.invoice_number}</p><p className="text-xs text-slate-400 capitalize">{inv.invoice_type} · #{inv.booking_code}</p></div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="flex items-center justify-between"><SBadge s={inv.payment_status} /><span className="text-slate-400 text-xs">{inv.created_at ? new Date(inv.created_at).toLocaleString() : "—"}</span></div>
          <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-3">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Billed To</p>
            <p className="font-medium text-slate-800 dark:text-slate-100">{inv.customer_snapshot?.name || "—"}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{inv.customer_snapshot?.phone} {inv.customer_snapshot?.email ? `· ${inv.customer_snapshot.email}` : ""}</p>
            {inv.customer_snapshot?.address && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{inv.customer_snapshot.address}</p>}
          </div>
          <div><p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-2">Line Items</p><div className="space-y-1.5">{(inv.line_items || []).map((li, i) => (<div key={i} className="flex items-center justify-between"><div className="min-w-0"><p className="text-slate-700 dark:text-slate-200 truncate">{li.desc} <span className="text-slate-400">×{li.qty}</span></p>{li.detail && <p className="text-[11px] text-slate-400">{li.detail}</p>}</div><span className="font-medium text-slate-800 dark:text-white">{fmt(li.amount)}</span></div>))}</div></div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1">
            {[["Subtotal", inv.subtotal], ["Discount", -(inv.discount || 0)], [inv.tax_label || "Tax", inv.tax], ["Fees", inv.fees], ["Refund", -(inv.refund || 0)]].filter(([, v]) => v).map(([k, v]) => (<div key={k} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400"><span>{k}</span><span>{fmt(v)}</span></div>))}
            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-slate-200 dark:border-slate-700"><span className="font-bold text-slate-800 dark:text-white">Total</span><span className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{fmt(inv.total_amount)}</span></div>
          </div>
          {inv.partner_snapshot?.name && <p className="text-xs text-slate-400">Partner: {inv.partner_snapshot.name}</p>}
          <p className="text-xs text-slate-400">Payment method: {inv.payment_method || "—"}</p>
        </div>
      </div>
    </div>
  );
}

/* Refunds tab — real refunds (matched by customer phone) with search + status filter + pagination. */
function CustomerRefundsTab({ rows }) {
  const [q, setQ] = useState(""); const [dq, setDq] = useState(""); const [statusF, setStatusF] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(10);
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [dq, statusF, pageSize]);
  const statuses = Array.from(new Set(rows.map((r) => r.status).filter(Boolean)));
  const filtered = (() => { let out = rows; if (dq) { const s = dq.toLowerCase(); out = out.filter((r) => [r.booking_code, r.service_name, r.cancellation_reason].some((v) => (v || "").toLowerCase().includes(s))); } if (statusF) out = out.filter((r) => r.status === statusF); return out; })();
  const total = filtered.length; const pages = Math.max(1, Math.ceil(total / pageSize)); const start = (page - 1) * pageSize; const pageRows = filtered.slice(start, start + pageSize);
  return (
    <CsCard className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="font-heading font-bold text-[15px] flex items-center gap-2 text-slate-900 dark:text-white"><RefreshCw className="h-5 w-5 text-primary-700" /> Refunds <span className="text-slate-400 font-normal">({total})</span></h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative"><Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input data-testid="cp-rf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-9 w-40 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200" /></div>
          <CsSel testid="cp-rf-status" ph="All Status" value={statusF} onChange={(e) => setStatusF(e.target.value)}>{statuses.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}</CsSel>
        </div>
      </div>
      {total === 0 ? <CsEmpty icon={RefreshCw} text="No refund history yet" /> : (
        <>
          <div className="space-y-2">{pageRows.map((r) => (<div key={r.id} className="flex items-center justify-between gap-3 border border-slate-100 dark:border-slate-800 rounded-xl p-3"><div className="min-w-0"><p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{r.service_name} <span className="text-xs text-slate-400">#{r.booking_code}</span></p><p className="text-xs text-slate-400 truncate">{r.cancellation_reason || r.method || "—"} · {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</p></div><div className="text-right shrink-0"><p className="font-semibold text-sm text-rose-600">{fmt(r.amount)}</p><SBadge s={r.status} /></div></div>))}</div>
          <CsPager page={page} pages={pages} total={total} start={start} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} testid="cp-rf" />
        </>
      )}
    </CsCard>
  );
}


export const UserProfile360 = ({ userId, onBack }) => {
  const [d, setD] = useState(null);
  const [zoom, setZoom] = useState(null); // { url, label }
  const [tab, setTab] = useState("overview");
  const reload = () => api.get(`/admin/users/${userId}/detail`).then((r) => setD(r.data)).catch(() => {});
  useEffect(() => { setD(null); reload(); }, [userId]);
  const [timeline, setTimeline] = useState(null);
  useEffect(() => {
    if (tab === "timeline" && !timeline) {
      api.get(`/admin/customers/${userId}/timeline`).then((r) => setTimeline(r.data.events || [])).catch(() => setTimeline([]));
    }
  }, [tab, timeline, userId]);
  const back = () => (onBack ? onBack() : window.history.back());
  const BackBar = (
    <button data-testid="ud-back" onClick={back} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-700 mb-4">
      <ArrowLeft className="h-4 w-4" /> Back to list
    </button>
  );
  if (!d) return <div data-testid="user-detail-page">{BackBar}<div className="py-20 text-center text-slate-400">Loading profile…</div></div>;
  const u = d.user;
  if (u.role === "partner") return <PartnerConsole userId={userId} onBack={back} />;
  if (u.role === "merchant") return <MerchantConsole userId={userId} onBack={back} />;
  if (u.role === "customer") return <CustomerProfile360 d={d} userId={userId} reload={reload} onBack={back} />;
  const stats = d.stats || {};
  const initials = (u.shop_name || u.name || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  const memberSince = u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short" }) : "—";
  const TIER_PILL = { platinum: "bg-violet-100 text-violet-700", gold: "bg-amber-100 text-amber-700", silver: "bg-slate-200 text-slate-700", bronze: "bg-orange-100 text-orange-700", new: "bg-sky-100 text-sky-700" };
  const chips = u.role === "merchant"
    ? [["Network", `${stats.partners || 0} partners`], ["Commission earned", fmt(stats.commission_earned || 0)], ["Wallet", fmt(stats.wallet ?? u.wallet_balance)], ["Status", u.status || "active"]]
    : [["Lifetime spend", fmt(stats.total_spent || 0)], ["Bookings", `${stats.completed || 0}/${stats.bookings ?? d.bookings.length}`], ["Avg order", fmt(stats.avg_order_value || 0)], ["Wallet", fmt(stats.wallet ?? u.wallet_balance)], ["Member since", memberSince]];
  const chipCols = chips.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4";
  const TABS = u.role === "merchant"
    ? [["overview", "Overview"], ["bookings", "Bookings"], ["transactions", "Transactions"], ["network", "Network"]]
    : [["overview", "Overview"], ["timeline", "Timeline"], ["bookings", "Bookings"], ["transactions", "Transactions"], ["addresses", "Addresses"]];
  return (
    <div data-testid="user-detail-page">
      {BackBar}
      {u.role === "customer" && (
        <CustomerAdminActions user={u} userId={userId} onDone={reload} onDeleted={back} />
      )}
      {/* premium header — same style as the provider profile */}
      <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-5 shadow-sm">
        <div className="relative h-36 bg-gradient-to-br from-primary-700 via-fuchsia-600 to-sky-500">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.5) 0, transparent 45%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.35) 0, transparent 40%)" }} />
          <div className="absolute top-4 right-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white text-xs font-semibold capitalize">{u.role}</span>
          </div>
        </div>
        <div className="px-6 pb-5">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
            <div className="relative shrink-0">
              <div className="h-24 w-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 bg-gradient-to-br from-primary-600 to-primary-800 overflow-hidden grid place-items-center text-white text-3xl font-extrabold shadow-lg">
                {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{u.shop_name || u.name}</h1>
              <Badge className="bg-primary-50 text-primary-700 border-0 capitalize dark:bg-primary-900/30 dark:text-primary-300">{u.role}</Badge>
              {u.role === "customer" && stats.tier_label && <Badge className={`border-0 flex items-center gap-1 ${TIER_PILL[stats.tier] || "bg-slate-100 text-slate-600"}`}><Award className="h-3 w-3" /> {stats.tier_label}</Badge>}
              {u.kyc_status && u.kyc_status !== "na" && <Badge className={`border-0 ${u.kyc_status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>KYC {u.kyc_status}</Badge>}
              {(u.blocked || u.status === "blocked") && <Badge className="border-0 bg-red-100 text-red-700 flex items-center gap-1"><Ban className="h-3 w-3" /> Blocked</Badge>}
              {u.role === "customer" && stats.bookings >= 2 && <Badge className="border-0 bg-emerald-100 text-emerald-700 flex items-center gap-1"><Repeat className="h-3 w-3" /> Repeat</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{u.phone}</span>
              {u.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{u.email}</span>}
              {(u.city || u.state) && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[u.city, u.state].filter(Boolean).join(", ")}</span>}
              <span className="flex items-center gap-1"><UserIcon className="h-4 w-4" />Joined {new Date(u.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className={`grid grid-cols-2 ${chipCols} gap-3 mt-5`}>
            {chips.map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{k}</p>
                <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-1 capitalize">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4 w-fit flex-wrap">
        {TABS.map(([k, l]) => (
          <button key={k} data-testid={`ud-tab-${k}`} onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${tab === k ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"}`}>{l}</button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h2 className="font-heading font-bold text-lg mb-4 text-slate-900 dark:text-white">Profile Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <PField label="Name" value={u.name} />
              <PField label="Gender" value={u.gender} />
              <PField label="Email" value={u.email} />
              <PField label="Language" value={u.language} />
              <PField label="Alt. Mobile" value={u.alternate_mobile} />
              <PField label="DOB" value={u.dob} />
              {u.communication_pref && <PField label="Comm. Pref" value={u.communication_pref} />}
              {u.gst_number && <PField label="GST" value={u.gst_number} />}
              {u.company_name && <PField label="Company" value={u.company_name} />}
              {u.role === "merchant" && <PField label="Shop name" value={u.shop_name} />}
              {u.role === "merchant" && <PField label="Shop Type" value={u.shop_type} />}
              <PField label="Joined" value={new Date(u.created_at).toLocaleDateString()} />
            </div>
            {u.role === "customer" && (
              <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-3" data-testid="customer-insights">
                {[["Completed", stats.completed ?? 0], ["Cancelled", stats.cancelled ?? 0], ["Avg order", fmt(stats.avg_order_value || 0)]].map(([k, v]) => (
                  <div key={k} className="text-center rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
                    <p className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{v}</p>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{k}</p>
                  </div>
                ))}
              </div>
            )}
            {u.role === "customer" && stats.last_booking_at && (
              <p className="text-xs text-slate-400 mt-3 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Last booking {new Date(stats.last_booking_at).toLocaleDateString()}</p>
            )}
          </div>
          <div className="lg:col-span-2 space-y-6">
            {u.role === "customer" && stats.tier_label && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6" data-testid="loyalty-card">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="font-heading font-bold text-lg flex items-center gap-2 text-slate-900 dark:text-white"><Award className="h-5 w-5 text-primary-700" /> Loyalty — <span className={`px-2 py-0.5 rounded-full text-sm ${TIER_PILL[stats.tier] || "bg-slate-100 text-slate-600"}`}>{stats.tier_label}</span></h2>
                  <span className="text-sm text-slate-500 dark:text-slate-400">Lifetime {fmt(stats.total_spent || 0)}</span>
                </div>
                {stats.next_tier ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Progress to {stats.next_tier}</span>
                      <span>{fmt(stats.amount_to_next_tier || 0)} to go</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary-500 to-fuchsia-500" style={{ width: `${Math.min(100, Math.max(6, Math.round(((stats.total_spent || 0) / ((stats.total_spent || 0) + (stats.amount_to_next_tier || 1))) * 100)))}%` }} />
                    </div>
                  </div>
                ) : <p className="text-sm text-emerald-600 mt-2 font-medium">Top tier reached — enjoy the best perks!</p>}
                <div className="flex flex-wrap gap-2 mt-4">
                  {(stats.tier_perks || []).map((p, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-2.5 py-1 text-slate-600 dark:text-slate-300"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {p}</span>
                  ))}
                </div>
              </div>
            )}
            {u.role === "customer" && (d.favourite_services || []).length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6" data-testid="favourite-services">
                <h2 className="font-heading font-bold text-lg mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Heart className="h-5 w-5 text-primary-700" /> Favourite Services</h2>
                <div className="flex flex-wrap gap-2">
                  {(d.favourite_services || []).map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 px-3 py-1.5 text-sm font-medium">
                      {s.name} <span className="text-[11px] bg-primary-200/60 dark:bg-primary-800 rounded-full px-1.5">{s.count}×</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <h2 className="font-heading font-bold text-lg mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Activity className="h-5 w-5 text-primary-700" /> Recent Activity</h2>
              {(d.notifications || []).length === 0 && <p className="text-sm text-slate-400">No recent activity</p>}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {(d.notifications || []).slice(0, 25).map((n, i) => (
                  <div key={i} className="text-sm border-l-2 border-primary-200 pl-3 py-0.5">
                    <p className="text-slate-700 dark:text-slate-200 font-medium">{n.title}</p>
                    <p className="text-[11px] text-slate-400">{n.body} · {new Date(n.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "timeline" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6" data-testid="customer-timeline">
          <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Activity className="h-5 w-5 text-primary-700" /> Activity Timeline{timeline ? ` (${timeline.length})` : ""}</h2>
          {timeline === null && <p className="text-sm text-slate-400">Loading timeline…</p>}
          {timeline && timeline.length === 0 && <p className="text-sm text-slate-400">No activity yet</p>}
          {timeline && timeline.length > 0 && (
            <div className="relative pl-6">
              <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="space-y-4">
                {timeline.map((e, i) => {
                  const meta = {
                    booking: { icon: Package, tone: "bg-primary-100 text-primary-700" },
                    transaction: { icon: Wallet, tone: "bg-emerald-100 text-emerald-700" },
                    message: { icon: Bell, tone: "bg-sky-100 text-sky-700" },
                    account: { icon: ShieldAlert, tone: "bg-amber-100 text-amber-700" },
                  }[e.type] || { icon: Activity, tone: "bg-slate-100 text-slate-600" };
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="relative" data-testid={`timeline-item-${i}`}>
                      <span className={`absolute -left-[22px] top-0.5 h-6 w-6 rounded-full grid place-items-center ${meta.tone}`}><Icon className="h-3.5 w-3.5" /></span>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.title}</p>
                          {e.subtitle && <p className="text-xs text-slate-400 truncate">{e.subtitle}</p>}
                          <p className="text-[11px] text-slate-400 mt-0.5">{new Date(e.at).toLocaleString()}</p>
                        </div>
                        {e.amount != null && (
                          <span className={`text-sm font-semibold whitespace-nowrap ${e.direction === "credit" ? "text-emerald-600" : e.direction === "debit" ? "text-red-500" : "text-slate-700 dark:text-slate-200"}`}>
                            {e.direction === "credit" ? "+" : e.direction === "debit" ? "-" : ""}{fmt(e.amount)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Package className="h-5 w-5 text-primary-700" /> Bookings ({d.bookings.length})</h2>
          {d.bookings.length === 0 && <p className="text-sm text-slate-400">No bookings</p>}
          <div className="space-y-2">
            {d.bookings.slice(0, 50).map((b) => (
              <div key={b.id} className="flex items-center justify-between border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                <div><p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{b.service_name} <span className="text-xs text-slate-400">#{b.code}</span></p><p className="text-xs text-slate-400">{new Date(b.created_at).toLocaleDateString()}</p></div>
                <div className="flex items-center gap-3"><SBadge s={b.status} /><span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{fmt(b.pricing.total)}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "transactions" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Wallet className="h-5 w-5 text-primary-700" /> Transactions ({d.transactions.length})</h2>
          {d.transactions.length === 0 && <p className="text-sm text-slate-400">No transactions</p>}
          <div className="space-y-2">
            {d.transactions.slice(0, 50).map((t) => (
              <div key={t.id} className="flex items-center justify-between border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                <div><p className="font-medium text-slate-800 dark:text-slate-100 text-sm capitalize">{t.kind}</p><p className="text-xs text-slate-400">{t.note}</p></div>
                <span className={`font-semibold text-sm ${t.type === "credit" ? "text-emerald-600" : "text-slate-700 dark:text-slate-200"}`}>{t.type === "credit" ? "+" : "-"}{fmt(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "addresses" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><MapPin className="h-5 w-5 text-primary-700" /> Addresses ({(u.addresses || []).length})</h2>
          {(u.addresses || []).length === 0 && <p className="text-sm text-slate-400">No saved addresses</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {(u.addresses || []).map((a) => <div key={a.id} className="text-sm text-slate-600 dark:text-slate-300 border border-slate-100 dark:border-slate-700 rounded-lg p-3"><b>{a.label}</b> · {a.line}, {a.city} {a.pincode}</div>)}
          </div>
        </div>
      )}

      {tab === "network" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><Users className="h-5 w-5 text-primary-700" /> Referred Partners ({(d.network || []).length})</h2>
          {(d.network || []).length === 0 && <p className="text-sm text-slate-400">No partners referred yet</p>}
          <div className="space-y-2">
            {(d.network || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                <div><p className="font-medium text-slate-800 dark:text-slate-100 text-sm">{p.name}</p><p className="text-xs text-slate-400">{p.phone} · {p.jobs_completed || 0} jobs</p></div>
                <Badge className={`border-0 ${p.kyc_status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>KYC {p.kyc_status || "pending"}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- PARTNER 360 (registration + docs + skills + wallet + activity) ---------------- */}
      {u.role === "partner" && (
        <div className="mt-6 space-y-6" data-testid="partner-360">
          {(u.kyc_status !== "approved" || d.profile?.status === "under_review") && (
            <KycActionBar profile={d.profile} userId={userId} onDone={reload} />
          )}
          {/* wallet stat strip */}
          {d.wallet && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[["Wallet balance", fmt(d.wallet.balance)], ["Total earned", fmt(d.wallet.earned)],
                ["Completed jobs", d.wallet.completed_jobs], ["Rating", `${d.wallet.rating || 0} ★`]].map(([k, v]) => (
                <div key={k} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{k}</p>
                  <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-1">{v}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Registration details */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 lg:col-span-2">
              <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2 text-slate-900 dark:text-white"><FileText className="h-5 w-5 text-primary-700" /> Registration Details</h2>
              {!d.profile ? <p className="text-sm text-slate-400">No registration profile submitted.</p> : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <PField label="Full name" value={d.profile.basic?.full_name} />
                    <PField label="DOB" value={d.profile.basic?.dob} />
                    <PField label="Email" value={d.profile.basic?.email} />
                    <PField label="Education" value={d.profile.basic?.education_name} />
                    <PField label="State" value={d.profile.basic?.state} />
                    <PField label="District" value={d.profile.basic?.district} />
                    <PField label="City" value={d.profile.basic?.city} />
                    <PField label="Village" value={d.profile.basic?.village} />
                    <PField label="Pincode" value={d.profile.basic?.pincode} />
                    <PField label="Aadhaar no." value={d.profile.documents?.aadhaar_number} />
                    <PField label="Completion" value={d.profile.completion_score != null ? `${d.profile.completion_score}%` : "—"} />
                    <PField label="Status" value={d.profile.status} />
                  </div>
                  <h3 className="font-heading font-bold text-sm mt-6 mb-2 text-slate-900 dark:text-white">Service Categories & Experience</h3>
                  <div className="flex flex-wrap gap-2">
                    {(d.profile.work?.categories || []).length === 0 && <p className="text-sm text-slate-400">None</p>}
                    {(d.profile.work?.categories || []).map((c, i) => (
                      <Badge key={i} className="bg-primary-50 text-primary-700 border-0">{c.category_name}{c.experience_label ? ` · ${c.experience_label}` : ""}</Badge>
                    ))}
                  </div>
                  <h3 className="font-heading font-bold text-sm mt-6 mb-2 flex items-center gap-1 text-slate-900 dark:text-white"><MapPin className="h-4 w-4 text-primary-700" /> Address</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{d.profile.address?.manual_address || d.profile.address?.location_address || "—"}</p>

                  {/* Documents */}
                  <h3 className="font-heading font-bold text-sm mt-6 mb-3 text-slate-900 dark:text-white">Documents & KYC</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[["Live photo", d.profile.basic?.live_photo_url],
                      ["Aadhaar front", d.profile.documents?.aadhaar_front_url],
                      ["Aadhaar back", d.profile.documents?.aadhaar_back_url],
                      ["Education cert", d.profile.documents?.education_certificate_url]].map(([label, url]) => (
                      <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                        {url ? (
                          <button type="button" data-testid={`doc-zoom-${label.replace(/\s+/g, "-").toLowerCase()}`} onClick={() => setZoom({ url, label })} className="relative block w-full group">
                            <img src={url} alt={label} className="h-28 w-full object-cover" />
                            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <ZoomIn className="h-6 w-6 text-white" />
                            </span>
                          </button>
                        ) : <div className="h-28 w-full grid place-items-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800">Not uploaded</div>}
                        <p className="text-[11px] text-slate-500 px-2 py-1.5 border-t border-slate-100 dark:border-slate-700">{label}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Skills + Certificates + Activity */}
            <div className="space-y-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <h2 className="font-heading font-bold text-lg mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Award className="h-5 w-5 text-primary-700" /> Skills & Certificates</h2>
                <div className="flex flex-wrap gap-2 mb-3">
                  {(d.skills || []).length === 0 && <p className="text-sm text-slate-400">No skills added</p>}
                  {(d.skills || []).map((s, i) => (
                    <Badge key={i} className={`border-0 ${s.verified ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{s.skill_name || s.name || "Skill"}{s.verified ? " ✓" : ""}</Badge>
                  ))}
                </div>
                {(d.certificates || []).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border border-slate-100 dark:border-slate-700 rounded-lg p-2.5 mb-2">
                    <span className="text-slate-700 dark:text-slate-200 truncate">{c.title || c.name || "Certificate"}</span>
                    <Badge className={`border-0 ${c.status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{c.status || "pending"}</Badge>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <h2 className="font-heading font-bold text-lg mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Wallet className="h-5 w-5 text-primary-700" /> Wallet Ledger ({(d.ledger || []).length})</h2>
                {(d.ledger || []).length === 0 && <p className="text-sm text-slate-400">No ledger entries</p>}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(d.ledger || []).slice(0, 20).map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border border-slate-100 dark:border-slate-700 rounded-lg p-2.5">
                      <div><p className="capitalize text-slate-700 dark:text-slate-200">{l.kind}</p><p className="text-[11px] text-slate-400">{l.note}</p></div>
                      <span className={`font-semibold ${l.direction === "credit" ? "text-emerald-600" : "text-red-500"}`}>{l.direction === "credit" ? "+" : "-"}{fmt(l.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
                <h2 className="font-heading font-bold text-lg mb-3 flex items-center gap-2 text-slate-900 dark:text-white"><Activity className="h-5 w-5 text-primary-700" /> Recent Activity</h2>
                {(d.notifications || []).length === 0 && <p className="text-sm text-slate-400">No recent activity</p>}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(d.notifications || []).slice(0, 20).map((n, i) => (
                    <div key={i} className="text-sm border-l-2 border-primary-200 pl-3 py-0.5">
                      <p className="text-slate-700 dark:text-slate-200 font-medium">{n.title}</p>
                      <p className="text-[11px] text-slate-400">{n.body} · {new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <DocLightbox url={zoom?.url} label={zoom?.label} onClose={() => setZoom(null)} />
    </div>
  );
};
export const PayoutsSection = () => {
  const { rows, loading, load } = useList("/admin/payouts");
  const act = async (id, status) => { await api.post(`/admin/payouts/${id}?status=${status}`); toast.success(`Payout ${status}`); load(); };
  const columns = [
    { key: "name", label: "Name", sortable: true, render: (p) => <span className="font-medium">{p.name}</span> },
    { key: "role", label: "Role", render: (p) => <span className="capitalize text-slate-500 dark:text-slate-400">{p.role}</span> },
    { key: "amount", label: "Amount", sortable: true, render: (p) => <span className="font-semibold">{fmt(p.amount)}</span>, exportValue: (p) => p.amount },
    { key: "method", label: "Method", render: (p) => <span className="capitalize">{p.method}</span> },
    { key: "status", label: "Status", render: (p) => <SBadge s={p.status} /> },
    { key: "_action", label: "Action", render: (p) => p.status === "pending" && <div className="flex gap-1"><Button data-testid={`payout-approve-${p.id}`} size="sm" className="h-7 bg-primary-700 hover:bg-primary-800" onClick={() => act(p.id, "approved")}>Approve</Button><Button size="sm" variant="outline" className="h-7 text-red-600" onClick={() => act(p.id, "rejected")}>Reject</Button></div> },
  ];
  return <DataTable title="Payment Requests" rows={rows} loading={loading} searchKeys={["name", "role", "method"]} exportName="payouts" dateKey="created_at" dateLabel="Dates"
    filters={[{ key: "status", label: "Status", options: [{ label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Rejected", value: "rejected" }] }]}
    columns={columns} emptyText="No payout requests" />;
};

/* ---------------- Refunds ---------------- */
export const RefundsSection = () => {
  const { rows, loading } = useList("/admin/refunds");
  const [detail, setDetail] = useState(null);
  const columns = [
    { key: "booking_code", label: "Booking", render: (r) => <span className="font-medium">#{r.booking_code}</span> },
    { key: "customer_name", label: "Customer", render: (r) => <span>{r.customer_name || "—"}</span> },
    { key: "partner_name", label: "Partner", render: (r) => <span className="text-slate-500 dark:text-slate-400">{r.partner_name || "—"}</span> },
    { key: "original_amount", label: "Original", sortable: true, render: (r) => fmt(r.original_amount), exportValue: (r) => r.original_amount },
    { key: "refund_pct", label: "Refund %", render: (r) => <span>{r.refund_pct ?? "—"}%</span> },
    { key: "refund_amount", label: "Refund", sortable: true, render: (r) => <span className="font-semibold text-emerald-600">{fmt(r.refund_amount ?? r.amount)}</span>, exportValue: (r) => r.refund_amount ?? r.amount },
    { key: "platform_commission", label: "Platform Comm.", render: (r) => <span className="text-primary-700">{fmt(r.platform_commission || 0)}</span>, exportValue: (r) => r.platform_commission },
    { key: "method", label: "Method", render: (r) => <Badge className="bg-slate-100 text-slate-600 border-0 capitalize">{r.method || "wallet"}</Badge> },
    { key: "status", label: "Status", render: (r) => <SBadge s={r.status} /> },
    { key: "created_at", label: "Date", sortable: true, render: (r) => <span className="text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span> },
    { key: "_actions", label: "", render: (r) => <Button size="sm" variant="outline" data-testid={`refund-view-${r.booking_code}`} onClick={() => setDetail(r)}><Eye className="h-4 w-4" /></Button> },
  ];
  return (
    <>
      <DataTable title="Cancellations & Refunds" rows={rows} loading={loading} searchKeys={["booking_code", "customer_name", "partner_name", "cancellation_reason", "razorpay_refund_id"]} exportName="refunds" dateKey="created_at" dateLabel="Dates" columns={columns} emptyText="No cancellations or refunds yet." />
      <RefundDetailModal refund={detail} onClose={() => setDetail(null)} />
    </>
  );
};

const RDRow = ({ label, value }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-sm">
    <span className="text-slate-400">{label}</span>
    <span className="font-medium text-slate-800 dark:text-slate-100 text-right break-all">{value ?? "—"}</span>
  </div>
);

const RefundDetailModal = ({ refund, onClose }) => {
  if (!refund) return null;
  const r = refund;
  return (
    <Dialog open={!!refund} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="refund-detail-modal">
        <DialogHeader><DialogTitle className="flex items-center gap-2">Refund · #{r.booking_code} <SBadge s={r.status} /></DialogTitle></DialogHeader>
        <div className="space-y-0.5">
          <RDRow label="Customer" value={r.customer_name} />
          <RDRow label="Partner" value={r.partner_name} />
          <RDRow label="Service" value={r.service_name} />
          <RDRow label="Original amount (paid)" value={fmt(r.original_amount)} />
          <RDRow label="Service cost" value={fmt(r.service_cost)} />
          <RDRow label="Tax amount" value={fmt(r.tax_amount)} />
          <RDRow label="Cancellation reason" value={r.cancellation_reason} />
          <RDRow label="Cancellation %" value={`Refund ${r.refund_pct}% · Partner ${r.partner_cancellation_pct}%`} />
          <RDRow label="Customer refund amount" value={fmt(r.refund_amount ?? r.amount)} />
          <RDRow label="Partner cancellation amount" value={fmt(r.partner_cancellation_amount)} />
          <RDRow label="Platform / Admin commission" value={fmt(r.platform_commission)} />
          <RDRow label="Method" value={r.method} />
          <RDRow label="Razorpay Payment ID" value={r.razorpay_payment_id} />
          <RDRow label="Razorpay Refund ID" value={r.razorpay_refund_id} />
          <RDRow label="Refund status" value={r.status} />
          <RDRow label="Cancelled at" value={r.cancelled_at ? new Date(r.cancelled_at).toLocaleString() : "—"} />
          <RDRow label="Refund initiated" value={r.initiated_at ? new Date(r.initiated_at).toLocaleString() : "—"} />
          <RDRow label="Refund completed" value={r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"} />
          <RDRow label="Webhook received" value={r.webhook_response ? "Yes" : "—"} />
        </div>
        {(r.status_history || []).length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Status timeline</p>
            <div className="space-y-1">
              {r.status_history.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                  <span className="capitalize font-medium text-slate-700 dark:text-slate-200">{String(h.status).replace(/_/g, " ")}</span>
                  <span className="text-slate-400">· {new Date(h.at).toLocaleString()}</span>
                  {h.note && <span className="text-slate-400 truncate">— {h.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/* ---------------- Ledger ---------------- */
export const LedgerSection = () => {
  const { rows, loading } = useList("/admin/ledger");
  const tot = rows.reduce((a, l) => ({
    gross: a.gross + (l.gross || 0), partner: a.partner + (l.partner_earning || 0),
    platform: a.platform + (l.platform_earning || 0), merchant: a.merchant + (l.merchant_referral || 0),
  }), { gross: 0, partner: 0, platform: 0, merchant: 0 });
  const columns = [
    { key: "booking_code", label: "Booking", render: (l) => <span className="font-medium">#{l.booking_code}</span> },
    { key: "gross", label: "Gross", sortable: true, render: (l) => fmt(l.gross), exportValue: (l) => l.gross },
    { key: "partner_earning", label: "Partner", sortable: true, render: (l) => fmt(l.partner_earning), exportValue: (l) => l.partner_earning },
    { key: "platform_earning", label: "Platform", sortable: true, render: (l) => <span className="text-primary-700 font-medium">{fmt(l.platform_earning)}</span>, exportValue: (l) => l.platform_earning },
    { key: "merchant_referral", label: "Merchant Referral", render: (l) => <span className="text-emerald-600">{fmt(l.merchant_referral)}</span>, exportValue: (l) => l.merchant_referral },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="ledger-summary">
        {[["Gross Volume", tot.gross, "text-slate-800 dark:text-white"], ["Partner Earnings", tot.partner, "text-slate-700 dark:text-slate-200"], ["Platform Revenue", tot.platform, "text-primary-700"], ["Merchant Referral", tot.merchant, "text-emerald-600"]].map(([k, v, cls]) => (
          <div key={k} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{k}</p>
            <p className={`font-heading font-extrabold text-lg mt-1 ${cls}`}>{fmt(v)}</p>
            <p className="text-[11px] text-slate-400">{rows.length} txn{rows.length === 1 ? "" : "s"}</p>
          </div>
        ))}
      </div>
      <DataTable title="Transactions & Ledger" rows={rows} loading={loading} searchKeys={["booking_code"]} exportName="ledger" dateKey="created_at" dateLabel="Dates" columns={columns} emptyText="No transactions yet" />
    </div>
  );
};

/* ---------------- Tickets ---------------- */
export const TicketsSection = () => {
  const [rows, setRows] = useState([]);
  const [reply, setReply] = useState({});
  const load = () => api.get("/admin/tickets").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const send = async (id) => { if (!reply[id]) return; await api.post(`/admin/tickets/${id}/reply`, { text: reply[id] }); toast.success("Reply sent"); setReply({ ...reply, [id]: "" }); load(); };
  const close = async (id) => { await api.post(`/admin/tickets/${id}/close`); load(); };
  return (
    <div className="space-y-3">
      {rows.length === 0 && <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-10 text-center text-slate-400">No support queries yet</div>}
      {rows.map((t) => (
        <div key={t.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex justify-between items-start"><div><p className="font-semibold text-slate-800 dark:text-slate-100">{t.subject}</p><p className="text-xs text-slate-400">{t.user_name} · {t.role}</p></div><SBadge s={t.status} /></div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">{t.message}</p>
          {(t.replies || []).map((r, i) => <p key={i} className="text-sm bg-primary-50 dark:bg-primary-900/20 text-primary-800 dark:text-primary-300 rounded-lg px-3 py-2 mt-2">{r.by}: {r.text}</p>)}
          {t.status !== "closed" && (
            <div className="flex gap-2 mt-3">
              <Input data-testid={`ticket-reply-${t.id}`} placeholder="Reply…" value={reply[t.id] || ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
              <Button size="sm" className="bg-primary-700 hover:bg-primary-800" onClick={() => send(t.id)}>Send</Button>
              <Button size="sm" variant="outline" onClick={() => close(t.id)}>Close</Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/* ---------------- Notifications ---------------- */
export const NotificationsSection = () => {
  const [f, setF] = useState({ title: "", body: "", audience: "all" });
  const [rows, setRows] = useState([]);
  const load = () => api.get("/admin/notifications").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const send = async () => { if (!f.title || !f.body) return toast.error("Title & body required"); await api.post("/admin/notifications", f); toast.success("Notification sent"); setF({ title: "", body: "", audience: "all" }); load(); };
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2 h-fit" data-testid="send-notification">
        <h3 className="font-heading font-bold text-slate-900 dark:text-white">Send Notification</h3>
        <Input data-testid="notif-title" placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <Textarea data-testid="notif-body" placeholder="Message" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <Select value={f.audience} onValueChange={(v) => setF({ ...f, audience: v })}>
          <SelectTrigger data-testid="notif-audience"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "customer", "partner", "merchant"].map((a) => <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>)}</SelectContent>
        </Select>
        <Button data-testid="notif-send" onClick={send} className="w-full bg-primary-700 hover:bg-primary-800">Send</Button>
      </div>
      <div className="lg:col-span-2 space-y-2">
        {rows.map((n) => <div key={n.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><div className="flex justify-between"><p className="font-semibold text-slate-800 dark:text-slate-100">{n.title}</p><Badge className="bg-slate-100 text-slate-600 border-0 capitalize">{n.audience}</Badge></div><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{n.body}</p></div>)}
      </div>
    </div>
  );
};

/* ---------------- Generic CMS Manager ---------------- */
export const CmsManager = ({ title, endpoint, fields, columns }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({});
  const load = () => { setLoading(true); api.get(`/admin/${endpoint}`).then((r) => setRows(r.data)).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [endpoint]);
  const create = async () => {
    for (const fl of fields) if (fl.required && !f[fl.key]) return toast.error(`${fl.label} required`);
    const payload = { ...f };
    fields.forEach((fl) => { if (fl.type === "number") payload[fl.key] = Number(payload[fl.key] || 0); if (fl.type === "list") payload[fl.key] = String(payload[fl.key] || "").split(",").map((s) => s.trim()).filter(Boolean); });
    await api.post(`/admin/${endpoint}`, payload); toast.success(`${title} created`); setF({}); load();
  };
  const del = async (id) => { await api.delete(`/admin/${endpoint}/${id}`); load(); };
  const dtColumns = [
    ...columns.map((c) => ({ ...c, render: (r) => c.render ? c.render(r) : (Array.isArray(r[c.key]) ? r[c.key].join(", ") : String(r[c.key] ?? "—")).slice(0, 60) })),
    { key: "_del", label: "", render: (r) => <button data-testid={`cms-del-${r.id}`} onClick={() => del(r.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button> },
  ];
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2 h-fit" data-testid={`cms-${endpoint}`}>
        <h3 className="font-heading font-bold text-slate-900 dark:text-white">Add {title}</h3>
        {fields.map((fl) => fl.type === "textarea"
          ? <Textarea key={fl.key} data-testid={`cms-${endpoint}-${fl.key}`} placeholder={fl.label} value={f[fl.key] || ""} onChange={(e) => setF({ ...f, [fl.key]: e.target.value })} />
          : (fl.type === "keywords" || fl.type === "tags")
            ? (<div key={fl.key}><label className="text-[11px] font-semibold text-slate-500">{fl.label}</label>
                <div className="mt-1" data-testid={`cms-${endpoint}-${fl.key}`}><KeywordsInput value={f[fl.key] || ""} onChange={(v) => setF({ ...f, [fl.key]: v })} placeholder={`Add ${fl.label.toLowerCase()} — Enter or comma`} /></div></div>)
          : fl.type === "select"
            ? (<div key={fl.key}><label className="text-[11px] font-semibold text-slate-500">{fl.label}</label>
                <Select value={f[fl.key] || ""} onValueChange={(v) => setF({ ...f, [fl.key]: v })}>
                  <SelectTrigger data-testid={`cms-${endpoint}-${fl.key}`}><SelectValue placeholder={`Select ${fl.label.toLowerCase()}`} /></SelectTrigger>
                  <SelectContent>{(fl.options || []).map((o) => <SelectItem key={typeof o === "string" ? o : o.value} value={typeof o === "string" ? o : o.value}>{typeof o === "string" ? o : o.label}</SelectItem>)}</SelectContent>
                </Select></div>)
            : <Input key={fl.key} data-testid={`cms-${endpoint}-${fl.key}`} type={fl.type === "number" ? "number" : "text"} placeholder={fl.label + (fl.type === "list" ? " (comma separated)" : "")} value={f[fl.key] || ""} onChange={(e) => setF({ ...f, [fl.key]: e.target.value })} />
        )}
        <Button data-testid={`cms-${endpoint}-create`} onClick={create} className="w-full bg-primary-700 hover:bg-primary-800">Create</Button>
      </div>
      <div className="lg:col-span-2">
        <DataTable title={`${title}s`} rows={rows} loading={loading} columns={dtColumns} searchKeys={columns.map((c) => c.key)} exportName={endpoint} pageSize={10} emptyText={`No ${title.toLowerCase()}s yet`} />
      </div>
    </div>
  );
};

/* ---------------- Coupons ---------------- */
export const CouponsSection = () => {
  const { rows, loading, load } = useList("/admin/coupons");
  const [f, setF] = useState({ code: "", discount_type: "percentage", discount_value: 10, min_order: 0, max_discount: 0 });
  const create = async () => { if (!f.code) return toast.error("Code required"); await api.post("/admin/coupons", { ...f, discount_value: Number(f.discount_value), min_order: Number(f.min_order), max_discount: Number(f.max_discount), usage_limit: 1000, status: "active" }); toast.success("Coupon created"); setF({ ...f, code: "" }); load(); };
  const columns = [
    { key: "code", label: "Code", sortable: true, render: (c) => <span className="font-heading font-bold text-primary-700">{c.code}</span> },
    { key: "discount_value", label: "Discount", render: (c) => c.discount_type === "percentage" ? c.discount_value + "%" : fmt(c.discount_value) },
    { key: "min_order", label: "Min Order", render: (c) => fmt(c.min_order) },
    { key: "status", label: "Status", render: (c) => <SBadge s={c.status} /> },
  ];
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2 h-fit" data-testid="create-coupon">
        <h3 className="font-heading font-bold text-slate-900 dark:text-white">New Coupon</h3>
        <Input data-testid="coupon-code" placeholder="CODE" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
        <Select value={f.discount_type} onValueChange={(v) => setF({ ...f, discount_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percentage">Percentage</SelectItem><SelectItem value="fixed">Fixed ₹</SelectItem></SelectContent></Select>
        <Input data-testid="coupon-value" type="number" placeholder="Discount value" value={f.discount_value} onChange={(e) => setF({ ...f, discount_value: e.target.value })} />
        <Input data-testid="coupon-min" type="number" placeholder="Min order" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} />
        <Input data-testid="coupon-max" type="number" placeholder="Max discount (0=none)" value={f.max_discount} onChange={(e) => setF({ ...f, max_discount: e.target.value })} />
        <Button data-testid="coupon-create" onClick={create} className="w-full bg-primary-700 hover:bg-primary-800">Create</Button>
      </div>
      <div className="lg:col-span-2">
        <DataTable title="Promo Codes" rows={rows} loading={loading} columns={columns} searchKeys={["code"]} exportName="coupons" emptyText="No coupons yet" />
      </div>
    </div>
  );
};

/* ---------------- Commission & Settings ---------------- */
export const CommissionSettings = () => {
  const [f, setF] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setF(r.data)); }, []);
  if (!f) return null;
  const fields = [["platform_commission_pct", "Platform Commission %"], ["partner_commission_pct", "Partner Commission %"], ["merchant_referral_pct", "Merchant Lifetime Referral %"], ["merchant_booking_pct", "Merchant Booking Commission %"], ["gst_pct", "GST %"], ["convenience_fee_pct", "Convenience Fee %"], ["platform_fee", "Platform Fee (₹)"], ["emergency_fee", "Emergency Fee (₹)"], ["slot_capacity", "Bookings per time slot"]];
  const save = async () => { const payload = Object.fromEntries(fields.map(([k]) => [k, Number(f[k])])); const { data } = await api.put("/admin/settings", payload); setF(data); toast.success("Settings saved — applies to new bookings"); };
  const toggleDemo = async (v) => { setF({ ...f, demo_mode: v }); await api.put("/admin/settings", { demo_mode: v }); toast.success(`Demo login ${v ? "enabled" : "disabled"}`); };
  return (
    <div className="max-w-2xl space-y-5" data-testid="commission-settings">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex items-center justify-between">
        <div><p className="font-heading font-bold text-lg text-slate-900 dark:text-white">Demo Mode</p><p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Demo accounts log in with OTP <b>123456</b>. Turn OFF to disable all dummy logins.</p></div>
        <Switch data-testid="demo-mode-toggle" checked={!!f.demo_mode} onCheckedChange={toggleDemo} />
      </div>
      <HomeStatsControl compact />
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">All commercial rules are dynamic — no code changes needed.</p>
        <div className="grid grid-cols-2 gap-4">{fields.map(([k, label]) => <div key={k}><label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label><Input data-testid={`set-${k}`} type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="mt-1" /></div>)}</div>
      </div>
    </div>
  );
};

/* ---------------- Business Settings (visiting charge, distance, timezone) ---------------- */
export const BusinessSettings = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const b = s.business_config || {};
  const set = (k, v) => setS((prev) => ({ ...prev, business_config: { ...(prev.business_config || {}), [k]: v } }));
  const TIMEZONES = ["Asia/Kolkata", "Asia/Dubai", "Asia/Karachi", "Asia/Dhaka", "Asia/Kathmandu", "UTC", "America/New_York", "Europe/London"];
  const save = async () => {
    const payload = {
      timezone: b.timezone || "Asia/Kolkata",
      global_visiting_charge: Number(b.global_visiting_charge) || 0,
      min_service_amount_for_visiting: Number(b.min_service_amount_for_visiting) || 0,
      max_distance_km: Number(b.max_distance_km) || 0,
      distance_unit: b.distance_unit || "km",
    };
    const { data } = await api.put("/admin/settings", { business_config: payload });
    setS(data); toast.success("Business settings saved");
  };
  return (
    <div className="max-w-2xl space-y-5" data-testid="business-settings">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Select Time Zone</label>
          <Select value={b.timezone || "Asia/Kolkata"} onValueChange={(v) => set("timezone", v)}>
            <SelectTrigger data-testid="biz-timezone" className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Global Visiting Charge (₹)</label>
            <Input data-testid="biz-visiting-charge" type="number" value={b.global_visiting_charge ?? ""} onChange={(e) => set("global_visiting_charge", e.target.value)} className="mt-1" />
            <p className="text-[11px] text-slate-400 mt-1">This common charge applies to every provider.</p>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Minimum Service Amount for Visiting Charge (₹)</label>
            <Input data-testid="biz-min-service" type="number" value={b.min_service_amount_for_visiting ?? ""} onChange={(e) => set("min_service_amount_for_visiting", e.target.value)} className="mt-1" />
            <p className="text-[11px] text-slate-400 mt-1">The visiting charge applies only when the service amount is below this value.</p>
          </div>
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">Max Serviceable Distance</label>
          <div className="flex gap-2 mt-1">
            <Input data-testid="biz-max-distance" type="number" value={b.max_distance_km ?? ""} onChange={(e) => set("max_distance_km", e.target.value)} className="flex-1" />
            <Select value={b.distance_unit || "km"} onValueChange={(v) => set("distance_unit", v)}>
              <SelectTrigger data-testid="biz-distance-unit" className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="km">Kms</SelectItem><SelectItem value="mile">Miles</SelectItem></SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-rose-500 mt-1">Note : This distance is used while searching nearby providers for a customer.</p>
        </div>
        <Button data-testid="biz-save" onClick={save} className="bg-primary-700 hover:bg-primary-800">Save changes</Button>
      </div>
    </div>
  );
};

/* ---------------- SMS Templates (event-based, active/inactive) ---------------- */
export const SmsTemplates = () => {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = () => api.get("/admin/sms-templates").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const toggle = async (t) => {
    const next = !t.active;
    setRows((rs) => rs.map((x) => (x.id === t.id ? { ...x, active: next } : x)));
    try { await api.put(`/admin/sms-templates/${t.id}`, { active: next }); toast.success(`${t.title} ${next ? "activated" : "deactivated"}`); }
    catch { load(); toast.error("Update failed"); }
  };
  const saveEdit = async () => {
    try {
      const { data } = await api.put(`/admin/sms-templates/${edit.id}`, { title: edit.title, template: edit.template });
      setRows((rs) => rs.map((x) => (x.id === data.id ? data : x)));
      setEdit(null); toast.success("Template saved");
    } catch { toast.error("Save failed"); }
  };
  if (!rows) return null;
  return (
    <div data-testid="sms-templates" className="space-y-4">
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-800">
        Each SMS is tied to an app event. Only <b>Active</b> templates are sent when the event/task happens.
        Use placeholders like <code className="bg-white px-1 rounded">[[customer_name]]</code>, <code className="bg-white px-1 rounded">[[booking_id]]</code>.
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase tracking-wider text-slate-400">
            <tr><th className="px-4 py-3">Title</th><th className="px-4 py-3">Event Type</th><th className="px-4 py-3">Template</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Action</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} data-testid={`sms-row-${t.type}`} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{t.title}</td>
                <td className="px-4 py-3"><code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{t.type}</code></td>
                <td className="px-4 py-3 text-slate-500 max-w-md truncate" title={t.template}>{t.template}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Switch data-testid={`sms-toggle-${t.type}`} checked={!!t.active} onCheckedChange={() => toggle(t)} />
                    <Badge className={`border-0 ${t.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{t.active ? "Active" : "Inactive"}</Badge>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Button data-testid={`sms-edit-${t.type}`} size="sm" variant="outline" onClick={() => setEdit({ ...t })}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit SMS Template</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Title</label>
                <Input data-testid="sms-edit-title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Message Body</label>
                <Textarea data-testid="sms-edit-body" rows={4} value={edit.template} onChange={(e) => setEdit({ ...edit, template: e.target.value })} className="mt-1" />
                {edit.params?.length > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">Available: {edit.params.map((p) => `[[${p}]]`).join(", ")}</p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
                <Button data-testid="sms-edit-save" onClick={saveEdit} className="bg-primary-700 hover:bg-primary-800">Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* Module-level so React keeps input identity stable (prevents focus loss). */
const IntTxt = ({ tid, label, value, onChange, type = "text", ph }) => (
  <div><label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label>
    <Input data-testid={tid} type={type} placeholder={ph} value={value || ""} onChange={(e) => onChange(e.target.value)} className="mt-1" /></div>
);
const IntTog = ({ tid, label, checked, onChange }) => (
  <div className="flex items-center justify-between py-2"><span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
    <Switch data-testid={tid} checked={!!checked} onCheckedChange={onChange} /></div>
);

export const IntegrationsSettings = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const g = s.integrations || {};
  const set = (k, v) => setS((prev) => ({ ...prev, integrations: { ...prev.integrations, [k]: v } }));
  const save = async () => { await api.put("/admin/settings", { integrations: s.integrations }); toast.success("Integrations saved"); };
  return (
    <div className="max-w-3xl space-y-5" data-testid="integrations-settings">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">SMS Gateway — Fast2SMS (India)</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Sends real OTP &amp; booking alerts. When OFF or no API key, the app uses dev OTP.</p>
        <IntTog tid="int-sms_enabled" label="Enable Fast2SMS delivery" checked={g.sms_enabled} onChange={(v) => set("sms_enabled", v)} />
        <div className="grid grid-cols-2 gap-4 mt-2">
          <IntTxt tid="int-fast2sms_api_key" label="Fast2SMS API Key" type="password" ph="Paste your Dev API key" value={g.fast2sms_api_key} onChange={(v) => set("fast2sms_api_key", v)} />
          <IntTxt tid="int-fast2sms_sender_id" label="DLT Sender ID" ph="e.g. AZOAPP" value={g.fast2sms_sender_id} onChange={(v) => set("fast2sms_sender_id", v)} />
          <IntTxt tid="int-fast2sms_message_id" label="DLT Message / Template ID" ph="Numeric template ID" value={g.fast2sms_message_id} onChange={(v) => set("fast2sms_message_id", v)} />
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Route</label>
            <Select value={g.fast2sms_route || "otp"} onValueChange={(v) => set("fast2sms_route", v)}>
              <SelectTrigger data-testid="int-fast2sms_route" className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="otp">OTP route (no DLT needed)</SelectItem>
                <SelectItem value="dlt">DLT route (sender + template)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">Payments — Razorpay</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Switch between Test and Live. Live keys are used only when mode is Live.</p>
        <IntTog tid="int-razorpay_enabled" label="Enable Razorpay checkout (off = dev mock payments)" checked={g.razorpay_enabled} onChange={(v) => set("razorpay_enabled", v)} />
        <div className="flex items-center justify-between py-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Mode</span>
          <Select value={g.razorpay_mode || "test"} onValueChange={(v) => set("razorpay_mode", v)}>
            <SelectTrigger data-testid="int-razorpay_mode" className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="test">Test</SelectItem><SelectItem value="live">Live</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <IntTxt tid="int-razorpay_test_key_id" label="Test Key ID" ph="rzp_test_..." value={g.razorpay_test_key_id} onChange={(v) => set("razorpay_test_key_id", v)} />
          <IntTxt tid="int-razorpay_test_key_secret" label="Test Key Secret" type="password" value={g.razorpay_test_key_secret} onChange={(v) => set("razorpay_test_key_secret", v)} />
          <IntTxt tid="int-razorpay_live_key_id" label="Live Key ID" ph="rzp_live_..." value={g.razorpay_live_key_id} onChange={(v) => set("razorpay_live_key_id", v)} />
          <IntTxt tid="int-razorpay_live_key_secret" label="Live Key Secret" type="password" value={g.razorpay_live_key_secret} onChange={(v) => set("razorpay_live_key_secret", v)} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">Social Login — Google</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Enable Social Login in Auth &amp; Profile, then paste your Google OAuth credentials here.</p>
        <div className="grid grid-cols-2 gap-4">
          <IntTxt tid="int-google_client_id" label="Google Client ID" value={g.google_client_id} onChange={(v) => set("google_client_id", v)} />
          <IntTxt tid="int-google_client_secret" label="Google Client Secret" type="password" value={g.google_client_secret} onChange={(v) => set("google_client_secret", v)} />
          <IntTxt tid="int-facebook_app_id" label="Facebook App ID (later)" value={g.facebook_app_id} onChange={(v) => set("facebook_app_id", v)} />
          <IntTxt tid="int-apple_client_id" label="Apple Client ID (later)" value={g.apple_client_id} onChange={(v) => set("apple_client_id", v)} />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">Media Storage — Amazon S3</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">When enabled with valid keys, all uploaded media is stored on S3. When OFF, media is stored on the app server (S3-ready).</p>
        <IntTog tid="int-aws_s3_enabled" label="Enable AWS S3 storage" checked={g.aws_s3_enabled} onChange={(v) => set("aws_s3_enabled", v)} />
        <div className="grid grid-cols-2 gap-4 mt-2">
          <IntTxt tid="int-aws_access_key_id" label="AWS Access Key ID" value={g.aws_access_key_id} onChange={(v) => set("aws_access_key_id", v)} />
          <IntTxt tid="int-aws_secret_access_key" label="AWS Secret Access Key" type="password" value={g.aws_secret_access_key} onChange={(v) => set("aws_secret_access_key", v)} />
          <IntTxt tid="int-aws_bucket" label="S3 Bucket Name" value={g.aws_bucket} onChange={(v) => set("aws_bucket", v)} />
          <IntTxt tid="int-aws_region" label="Region" ph="ap-south-1" value={g.aws_region} onChange={(v) => set("aws_region", v)} />
          <IntTxt tid="int-aws_public_base" label="Public Base URL / CDN (optional)" ph="https://cdn.example.com" value={g.aws_public_base} onChange={(v) => set("aws_public_base", v)} />
        </div>
      </div>

      <Button data-testid="int-save" onClick={save} className="bg-primary-700 hover:bg-primary-800">Save Integrations</Button>
    </div>
  );
};

const CfgToggle = ({ k, label, desc, checked, onChange, tag }) => (
  <div className="flex items-start justify-between gap-3 py-3 border-b border-slate-100 dark:border-slate-800 last:border-0">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        {tag && <span className="text-[10px] uppercase tracking-wide font-bold rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">{tag}</span>}
      </div>
      {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
    </div>
    <Switch data-testid={`cfg-${k}`} checked={!!checked} onCheckedChange={onChange} />
  </div>
);

/* ---------------- Auth & Profile Config ---------------- */
export const AuthProfileSettings = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  // [key, label, description, liveTag] — liveTag marks toggles that visibly change
  // the customer-facing login / checkout instantly.
  const AUTH = [
    ["mobile_otp", "Mobile OTP Login", "Primary sign-in via one-time password on mobile.", "Live"],
    ["email_login", "Email + Password Login", "Shows the email/password box on the login screen.", "Live"],
    ["social_login", "Social Login (Google)", "Shows Google sign-in (needs Google Client ID in Integrations).", "Live"],
    ["whatsapp_login", "WhatsApp OTP Login", "Offers WhatsApp as an OTP channel on login.", "Live"],
    ["guest_checkout", "Guest Checkout", "Allow booking without creating an account first.", "Live"],
    ["two_factor", "Two-Factor Auth (2FA)", "Require a second factor for sensitive accounts.", ""],
    ["device_management", "Device Management", "Let users see & sign out of active devices.", ""],
    ["account_deletion_approval", "Account Deletion needs Admin approval", "Deletion requests wait for admin review instead of deleting instantly.", "Live"],
  ];
  const PROF = [
    ["gender", "Gender", "Show the gender field on the profile."],
    ["dob", "Date of Birth", "Collect date of birth."],
    ["alternate_mobile", "Alternate Mobile", "Allow a backup contact number."],
    ["email", "Email", "Collect & show an email address."],
    ["language", "Language Preference", "Let customers pick their language."],
    ["communication_pref", "Communication Preference", "Email / SMS / push preference control."],
    ["gst", "GST Details (B2B)", "Collect GST number for business invoices."],
    ["company", "Company Details (B2B)", "Collect company name for B2B accounts."],
  ];
  const toggle = async (group, key, val) => { const next = { ...s[group], [key]: val }; setS({ ...s, [group]: next }); await api.put("/admin/settings", { [group]: next }); toast.success("Saved"); };
  return (
    <div className="space-y-4" data-testid="auth-profile-settings">
      <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-900/10 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
        <p className="text-sm text-slate-600 dark:text-slate-300">Changes save instantly. Items marked <b className="text-emerald-700">Live</b> immediately change the customer login, checkout and profile screens.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-700" /> Authentication Methods</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Enable/disable how customers can sign in.</p>
          {AUTH.map(([k, l, desc, tag]) => <CfgToggle key={k} k={k} label={l} desc={desc} tag={tag} checked={(s.auth_config || {})[k]} onChange={(v) => toggle("auth_config", k, v)} />)}
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white flex items-center gap-2"><UserIcon className="h-5 w-5 text-primary-700" /> Profile Fields</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Which profile fields are collected/shown to customers.</p>
          {PROF.map(([k, l, desc]) => <CfgToggle key={k} k={k} label={l} desc={desc} tag="Live" checked={(s.profile_fields || {})[k]} onChange={(v) => toggle("profile_fields", k, v)} />)}
        </div>
      </div>
    </div>
  );
};

/* ---------------- Live Ops ---------------- */
const LIVE_STATES = ["searching", "assigned", "arrived_shop", "arrived_customer", "started"];
const LIVE_STATE_LABELS = {
  all: "All active", searching: "Searching", assigned: "Assigned",
  arrived_shop: "Arrived (shop)", arrived_customer: "Arrived (customer)", started: "Started",
};
const _ago = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const LiveOps = () => {
  const [b, setB] = useState([]);
  const [p, setP] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [cityF, setCityF] = useState("all");
  const [auto, setAuto] = useState(true);
  const [page, setPage] = useState(1);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const { subscribe, connected } = useRealtime();
  const PER = 6;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [rb, rp] = await Promise.all([
        api.get("/admin/bookings"),
        api.get("/admin/users?role=partner"),
      ]);
      setB(rb.data || []);
      setP(rp.data || []);
      setRefreshedAt(new Date());
    } catch { /* handled globally */ }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Instant live updates via SSE — refresh silently whenever a job or partner
  // status changes (no page reload / no manual refresh needed).
  useEffect(() => subscribe((ev) => {
    if (["job_new", "job_update", "partner_status", "partner_location", "__resync__"].includes(ev?.type)) {
      load(true);
    }
  }), [subscribe, load]);
  useEffect(() => {
    if (!auto) return undefined;
    const t = setInterval(() => load(true), 15000);
    return () => clearInterval(t);
  }, [auto, load]);
  useEffect(() => { setPage(1); }, [q, statusF, cityF]);

  const active = b.filter((x) => LIVE_STATES.includes(x.status));
  const online = p.filter((x) => x.partner_status === "online");
  const cities = Array.from(new Set(active.map((x) => x.address?.city).filter(Boolean))).sort();

  const ql = q.trim().toLowerCase();
  const filtered = active.filter((x) => {
    if (statusF !== "all" && x.status !== statusF) return false;
    if (cityF !== "all" && (x.address?.city || "") !== cityF) return false;
    if (!ql) return true;
    return [x.code, x.service_name, x.customer_name, x.customer_phone, x.partner_name, x.address?.city]
      .some((v) => String(v || "").toLowerCase().includes(ql));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER));
  const cur = Math.min(page, pageCount);
  const pageRows = filtered.slice((cur - 1) * PER, cur * PER);

  return (
    <div data-testid="live-ops">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary-700" /> Live Operations
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Real-time view of active jobs & partners{refreshedAt ? ` · updated ${_ago(refreshedAt.toISOString())}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid="liveops-auto" onClick={() => setAuto((a) => !a)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-medium border transition ${auto ? (connected ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300") : "bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700"}`}>
            <span className={`h-2 w-2 rounded-full ${auto ? (connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500 animate-pulse") : "bg-slate-300"}`} /> {auto ? (connected ? "Live" : "Connecting…") : "Paused"}
          </button>
          <Button data-testid="liveops-refresh" size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active Jobs" value={active.length} icon={ClipboardList} />
        <StatCard label="Searching" value={b.filter((x) => x.status === "searching").length} icon={AlertCircle} tone="amber" />
        <StatCard label="Online Partners" value={online.length} icon={Wrench} tone="green" />
        <StatCard label="Total Partners" value={p.length} icon={Users} tone="slate" />
      </div>

      {/* Toolbar: search + status + city */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input data-testid="liveops-search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9"
            placeholder="Search by code, service, customer, phone, partner or city…" />
        </div>
        <div className="w-52">
          <Select value={statusF} onValueChange={setStatusF}>
            <SelectTrigger data-testid="liveops-status"><SelectValue placeholder="All active" /></SelectTrigger>
            <SelectContent>
              {["all", ...LIVE_STATES].map((s) => <SelectItem key={s} value={s}>{LIVE_STATE_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <Select value={cityF} onValueChange={setCityF}>
            <SelectTrigger data-testid="liveops-city"><SelectValue placeholder="All cities" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap" data-testid="liveops-count">{filtered.length} live job{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {/* Job list */}
      {loading ? (
        <div className="py-16 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /> Loading live operations…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-12 text-center text-slate-400" data-testid="liveops-empty">
          No live jobs match your filters right now
        </div>
      ) : (
        <>
          <div className="grid gap-3">
            {pageRows.map((x) => (
              <div key={x.id} data-testid={`liveops-row-${x.id}`}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center gap-4 hover:shadow-card transition">
                <div className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 grid place-items-center shrink-0">
                  <Wrench className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-[220px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-bold text-slate-900 dark:text-white">{x.service_name}</span>
                    <span className="text-xs font-mono text-slate-400">#{x.code}</span>
                    <SBadge s={x.status} />
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" />{x.customer_name || "—"}</span>
                    {x.address?.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{x.address.city}</span>}
                    <span className="flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />{x.partner_name || "Unassigned"}</span>
                    <span className="flex items-center gap-1"><Activity className="h-3.5 w-3.5" />{_ago(x.created_at)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-slate-900 dark:text-white">{fmt(x.pricing?.total || 0)}</p>
                  <p className="text-[11px] text-slate-400 capitalize">{x.payment_status || x.booking_type || "—"}</p>
                </div>
              </div>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-5" data-testid="liveops-pagination">
              <p className="text-xs text-slate-500">Page {cur} of {pageCount} · {filtered.length} live jobs</p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)} data-testid="liveops-prev">Prev</Button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                  <button key={n} data-testid={`liveops-page-${n}`} onClick={() => setPage(n)}
                    className={`h-8 w-8 rounded-lg text-sm font-semibold transition ${n === cur ? "bg-primary-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>{n}</button>
                ))}
                <Button size="sm" variant="outline" disabled={cur >= pageCount} onClick={() => setPage(cur + 1)} data-testid="liveops-next">Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const SystemUsersSection = () => {
  const { rows, loading, load } = useList("/admin/system-users");
  const [roles, setRoles] = useState([]);
  const [f, setF] = useState({ name: "", phone: "", email: "", system_role_id: "" });
  useEffect(() => { api.get("/admin/collection/roles").then((r) => setRoles(r.data || [])); }, []);
  const roleName = (id) => roles.find((r) => r.id === id)?.name || "";
  const create = async () => {
    if (!f.name.trim() || !f.phone.trim()) return toast.error("Name and phone are required");
    try {
      await api.post("/admin/system-users", { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), system_role_id: f.system_role_id, system_role: roleName(f.system_role_id) });
      toast.success("System user created — they can now log in via OTP");
      setF({ name: "", phone: "", email: "", system_role_id: "" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to create user"); }
  };
  const del = async (u) => {
    if (!window.confirm(`Remove system user "${u.name}"?`)) return;
    try { await api.delete(`/admin/system-users/${u.id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const changeRole = async (u, roleId) => {
    try { await api.put(`/admin/system-users/${u.id}`, { system_role_id: roleId, system_role: roleName(roleId) }); toast.success("Role updated"); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const toggleStatus = async (u) => {
    const next = (u.status || "active") === "active" ? "suspended" : "active";
    try { await api.put(`/admin/system-users/${u.id}`, { status: next }); toast.success(`User ${next}`); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const columns = [
    { key: "name", label: "Name", sortable: true, render: (u) => (
      <span className="font-medium flex items-center gap-1.5">{u.name}
        {u.is_super_admin && <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">Super</Badge>}
      </span>
    ) },
    { key: "phone", label: "Phone", render: (u) => <span className="text-slate-500 dark:text-slate-400">{u.phone}</span> },
    { key: "system_role", label: "Assigned Role", render: (u) => u.is_super_admin ? (
      <Badge className="bg-amber-50 text-amber-700 border-0">Full Access</Badge>
    ) : (
      <Select value={u.system_role_id || ""} onValueChange={(v) => changeRole(u, v)}>
        <SelectTrigger className="h-8 w-40 text-xs" data-testid={`sysuser-role-${u.id}`}><SelectValue placeholder="No role" /></SelectTrigger>
        <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
      </Select>
    ) },
    { key: "status", label: "Status", render: (u) => (
      <button onClick={() => !u.is_super_admin && toggleStatus(u)} disabled={u.is_super_admin}><SBadge s={u.status || "active"} /></button>
    ) },
    { key: "_del", label: "", render: (u) => u.phone !== "+919000000000" && (
      <button data-testid={`sysuser-del-${u.id}`} onClick={() => del(u)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
    ) },
  ];
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start" data-testid="system-users">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-2 h-fit" data-testid="create-system-user">
        <h3 className="font-heading font-bold text-slate-900 dark:text-white">Add Admin User</h3>
        <p className="text-xs text-slate-400">Create a staff/admin login and assign a role from Roles &amp; Permissions. Their sidebar shows only permitted sections.</p>
        <Input data-testid="sysuser-name" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input data-testid="sysuser-phone" inputMode="tel" placeholder="Phone (e.g. +9199xxxxxxxx)" value={f.phone} onChange={(e) => setF({ ...f, phone: phoneInput(e.target.value) })} />
        <Input data-testid="sysuser-email" placeholder="Email (optional)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Select value={f.system_role_id} onValueChange={(v) => setF({ ...f, system_role_id: v })}>
          <SelectTrigger data-testid="sysuser-role"><SelectValue placeholder="Assign a role" /></SelectTrigger>
          <SelectContent>{roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button data-testid="sysuser-create" onClick={create} className="w-full bg-primary-700 hover:bg-primary-800">Create User</Button>
      </div>
      <div className="lg:col-span-2">
        <DataTable title="Admin Users" rows={rows} loading={loading} columns={columns} searchKeys={["name", "phone", "email", "system_role"]} exportName="admin-users" emptyText="No admin users" />
      </div>
    </div>
  );
};

/* ---------------- Address Management Config ---------------- */
export const AddressConfigSettings = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const a = s.address_config || {};
  const setA = (k, v) => setS((p) => ({ ...p, address_config: { ...p.address_config, [k]: v } }));
  const TOGGLES = [
    ["gps", "GPS Location (Auto-detect via map)"], ["multiple_addresses", "Multiple Saved Addresses"],
    ["property_type", "Property Type"], ["floor_flat", "Floor & Flat Number"],
    ["landmark_instructions", "Landmark & Access Instructions"],
    ["mandatory_landmark", "Make Landmark Mandatory"],
  ];
  const save = async () => { await api.put("/admin/settings", { address_config: s.address_config }); toast.success("Address settings saved"); };
  return (
    <div className="grid lg:grid-cols-2 gap-6 max-w-5xl" data-testid="address-config-settings">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">Address Features</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Enable/disable each address capture feature dynamically. These apply instantly on the customer address form.</p>
        {TOGGLES.map(([k, l]) => (
          <div key={k} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{l}</span>
            <Switch data-testid={`addrcfg-${k}`} checked={!!a[k]} onCheckedChange={(v) => setA(k, v)} />
          </div>
        ))}
      </div>
      <div className="space-y-5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h2 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">Property Types</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Comma-separated list shown to customers.</p>
          <Textarea data-testid="addrcfg-property-types" value={(a.property_types || []).join(", ")}
            onChange={(e) => setA("property_types", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} className="min-h-[70px]" />
        </div>
        <div className="rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-900/10 p-5" data-testid="serviceability-note">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-heading font-bold text-slate-800 dark:text-white">Serviceability is managed in Service Areas</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Which pincodes, radius zones, polygons and cities you serve is now controlled entirely from
                <b> Locations → Service Areas</b>. That keeps a single source of truth — no duplicate pincode lists here.
              </p>
            </div>
          </div>
        </div>
      </div>
      <Button data-testid="addrcfg-save" onClick={save} className="bg-primary-700 hover:bg-primary-800 w-fit">Save Address Settings</Button>
    </div>
  );
};

/* ---------------- Account Deletion Requests ---------------- */
export const DeletionRequestsSection = () => {
  const { rows, loading, load } = useList("/admin/deletion-requests");
  const act = async (id, action) => { await api.post(`/admin/deletion-requests/${id}?action=${action}`); toast.success(`Request ${action === "approve" ? "approved — account deleted" : "rejected"}`); load(); };
  const columns = [
    { key: "name", label: "User", sortable: true, render: (r) => <span className="font-medium text-slate-800 dark:text-slate-100">{r.name}</span> },
    { key: "role", label: "Role", render: (r) => <span className="capitalize text-slate-500 dark:text-slate-400">{r.role}</span> },
    { key: "phone", label: "Contact", render: (r) => <span className="text-slate-500 dark:text-slate-400">{r.phone || r.email || "—"}</span> },
    { key: "reason", label: "Reason", render: (r) => <span className="text-slate-500 dark:text-slate-400">{r.reason || "—"}</span> },
    { key: "status", label: "Status", render: (r) => <SBadge s={r.status} /> },
    { key: "created_at", label: "Requested", sortable: true, render: (r) => <span className="text-slate-400">{new Date(r.created_at).toLocaleDateString()}</span> },
    { key: "_action", label: "Action", render: (r) => r.status === "pending" && (
      <div className="flex gap-1">
        <Button data-testid={`deletion-approve-${r.id}`} size="sm" className="h-7 bg-red-600 hover:bg-red-700" onClick={() => act(r.id, "approve")}>Approve</Button>
        <Button data-testid={`deletion-reject-${r.id}`} size="sm" variant="outline" className="h-7" onClick={() => act(r.id, "reject")}>Reject</Button>
      </div>
    ) },
  ];
  return <DataTable title="Account Deletion Requests" rows={rows} loading={loading} columns={columns} searchKeys={["name", "role", "phone", "email"]}
    filters={[{ key: "status", label: "Status", options: [{ label: "Pending", value: "pending" }, { label: "Approved", value: "approved" }, { label: "Rejected", value: "rejected" }] }]}
    exportName="deletion-requests" emptyText="No account deletion requests" />;
};

/* ================= Phase 5 generic building blocks ================= */

/* Settings form bound to a settings sub-object (seo / general / storage) */
export const SettingsForm = ({ title, skey, fields, note }) => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/admin/settings").then((r) => setS(r.data)); }, []);
  if (!s) return null;
  const obj = s[skey] || {};
  const set = (k, v) => setS((p) => ({ ...p, [skey]: { ...(p[skey] || {}), [k]: v } }));
  const save = async () => {
    const payload = {};
    fields.forEach((f) => { payload[f.key] = f.type === "number" ? Number(obj[f.key] || 0) : (obj[f.key] ?? ""); });
    const { data } = await api.put("/admin/settings", { [skey]: payload });
    setS(data); toast.success(`${title} saved`);
  };
  return (
    <div className="max-w-2xl space-y-4" data-testid={`settings-${skey}`}>
      {note && <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-800">{note}</div>}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">{f.label}</label>
            {f.type === "textarea"
              ? <Textarea data-testid={`set-${skey}-${f.key}`} value={obj[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="mt-1" rows={3} />
              : f.type === "keywords"
                ? <div className="mt-1"><KeywordsInput value={obj[f.key] ?? ""} onChange={(v) => set(f.key, v)} /></div>
                : f.type === "select"
                ? <Select value={obj[f.key] ?? f.options?.[0]} onValueChange={(v) => set(f.key, v)}><SelectTrigger data-testid={`set-${skey}-${f.key}`} className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{(f.options || []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
                : <Input data-testid={`set-${skey}-${f.key}`} type={f.type === "number" ? "number" : "text"} value={obj[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} className="mt-1" />}
          </div>
        ))}
        <Button data-testid={`set-${skey}-save`} onClick={save} className="bg-primary-700 hover:bg-primary-800">Save changes</Button>
      </div>
    </div>
  );
};

/* ── Advanced General Settings — premium platform-wide configuration ── */
const BRAND_C = "#0D47A1";
const GEN_SECTIONS = [
  { key: "identity", label: "Business Identity", icon: Building2 },
  { key: "localization", label: "Localization", icon: Globe2 },
  { key: "social", label: "Social & Apps", icon: Share2 },
  { key: "history", label: "Change History", icon: Clock },
];
const GEN_TEXT = {
  identity: [
    { key: "site_name", label: "Site Name", ph: "AzoApp", required: true },
    { key: "tagline", label: "Tagline", ph: "Home services, on demand" },
    { key: "support_email", label: "Support Email", ph: "help@azoapp.com", validate: "email" },
    { key: "support_phone", label: "Support Phone", ph: "+91 90000 00000", validate: "phone" },
    { key: "support_hours", label: "Support Hours", ph: "Mon-Sun, 8am-10pm" },
    { key: "company_website", label: "Website", ph: "https://azoapp.com", validate: "url" },
    { key: "whatsapp_number", label: "WhatsApp Support", ph: "+91 90000 00000", validate: "phone" },
    { key: "business_email", label: "Business Email (optional)", ph: "hello@azoapp.com", validate: "email" },
    { key: "company_address", label: "Company Address", type: "textarea", full: true },
  ],
  localization: [
    { key: "currency_symbol", label: "Currency Symbol", ph: "₹" },
    { key: "currency_code", label: "Currency Code", type: "select", options: ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"] },
    { key: "timezone", label: "Timezone", type: "select", options: ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"] },
    { key: "country", label: "Country", ph: "India" },
    { key: "default_language", label: "Default Language", type: "select", options: ["en", "hi", "ta", "te", "kn", "mr", "bn"] },
    { key: "date_format", label: "Date Format", type: "select", options: ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] },
  ],
  social: [
    { key: "facebook_url", label: "Facebook", icon: Facebook, validate: "url" },
    { key: "instagram_url", label: "Instagram", icon: Instagram, validate: "url" },
    { key: "twitter_url", label: "Twitter / X", icon: Twitter, validate: "url" },
    { key: "linkedin_url", label: "LinkedIn", icon: Linkedin, validate: "url" },
    { key: "youtube_url", label: "YouTube", icon: Youtube, validate: "url" },
    { key: "playstore_url", label: "Google Play Store URL", icon: Smartphone, validate: "url" },
    { key: "appstore_url", label: "Apple App Store URL", icon: Smartphone, validate: "url" },
  ],
};
const GEN_SEARCH_INDEX = (() => {
  const idx = [];
  const sectionLabel = (k) => (GEN_SECTIONS.find((s) => s.key === k) || {}).label || k;
  ["identity", "localization", "social"].forEach((sec) => {
    (GEN_TEXT[sec] || []).forEach((f) => idx.push({ key: f.key, label: f.label, tab: sec, section: sectionLabel(sec) }));
  });
  return idx;
})();

const _validators = {
  email: (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  url: (v) => { if (!v) return true; try { const u = new URL(v); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } },
  phone: (v) => !v || /^[+]?[\d\s()-]{7,20}$/.test(v),
};

export const GeneralSettingsAdvanced = () => {
  const [g, setG] = useState(null);
  const [tab, setTab] = useState("identity");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState("");
  const [audit, setAudit] = useState(null);
  const [histQ, setHistQ] = useState("");
  const { refresh } = useSiteConfig();

  useEffect(() => {
    api.get("/admin/settings").then((r) => setG(r.data.general || {})).catch(() => setG({}));
  }, []);
  useEffect(() => {
    if (tab === "history" && audit === null) {
      api.get("/admin/settings-audit?limit=100").then((r) => setAudit(r.data.entries || [])).catch(() => setAudit([]));
    }
  }, [tab, audit]);

  const set = (k, v) => { setG((p) => ({ ...p, [k]: v })); setDirty(true); setSavedAt(null); };

  const invalid = (() => {
    for (const sec of ["identity", "localization", "social"]) {
      for (const f of GEN_TEXT[sec]) {
        if (f.required && !(g?.[f.key] || "").trim()) return `${f.label} is required`;
        if (f.validate && !_validators[f.validate](g?.[f.key] || "")) return `${f.label} is not a valid ${f.validate}`;
      }
    }
    return "";
  });
  const errText = g ? invalid() : "";

  const save = async () => {
    if (errText) { toast.error(errText); return; }
    setSaving(true);
    try {
      const { data } = await api.put("/admin/settings", { general: g });
      setG(data.general || g); setDirty(false); setSavedAt(Date.now());
      setAudit(null);
      refresh?.();  // refresh site config so footer social/apps update immediately
      toast.success("All changes saved — live across the site");
    } catch { toast.error("Unable to save settings. Please try again."); } finally { setSaving(false); }
  };

  const results = query.trim().length >= 1
    ? GEN_SEARCH_INDEX.filter((f) => `${f.label} ${f.key}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];
  const jumpTo = (f) => {
    setTab(f.tab); setQuery(""); setHighlight(f.key);
    setTimeout(() => { const el = document.getElementById(`gen-field-${f.key}`); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 80);
    setTimeout(() => setHighlight(""), 2600);
  };

  if (!g) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;
  const hl = (k) => highlight === k ? "ring-2 ring-offset-2 rounded-lg" : "";
  const fieldErr = (f) => f.validate && g[f.key] && !_validators[f.validate](g[f.key]);

  const inputBase = "w-full h-11 rounded-lg border bg-white dark:bg-slate-900 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30";
  const renderText = (f) => (
    <div key={f.key} id={`gen-field-${f.key}`} className={`transition ${f.full ? "sm:col-span-2" : ""} ${hl(f.key)}`} style={highlight === f.key ? { "--tw-ring-color": BRAND_C } : {}}>
      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">{f.icon && <f.icon className="w-3.5 h-3.5" />}{f.label}{f.required && <span className="text-red-400">*</span>}</label>
      {f.type === "textarea"
        ? <Textarea data-testid={`gen-${f.key}`} value={g[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} rows={3} className="mt-1.5" placeholder={f.ph} />
        : f.type === "select"
          ? <PremiumSelect data-testid={`gen-${f.key}`} value={g[f.key] ?? f.options[0]} onChange={(e) => set(f.key, e.target.value)} className="mt-1.5 rounded-xl">
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </PremiumSelect>
          : <input data-testid={`gen-${f.key}`} type={f.type === "number" ? "number" : "text"} value={g[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.ph}
              className={`mt-1.5 ${inputBase} ${fieldErr(f) ? "border-red-300 focus:ring-red-200" : "border-slate-200 dark:border-slate-700"}`} />}
      {fieldErr(f) && <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Enter a valid {f.validate === "url" ? "URL (https://…)" : f.validate}</p>}
    </div>
  );

  const curSym = g.currency_symbol || "₹";
  const fmtMoney = `${curSym}1,250.00`;
  const now = new Date();
  const df = g.date_format || "DD/MM/YYYY";
  const fmtDate = df === "MM/DD/YYYY" ? `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`
    : df === "YYYY-MM-DD" ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    : `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  let fmtTime = ""; try { fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: g.timezone || "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(now); } catch { fmtTime = now.toLocaleTimeString(); }

  const SOCIAL_ICONS = { facebook_url: Facebook, instagram_url: Instagram, twitter_url: Twitter, linkedin_url: Linkedin, youtube_url: Youtube };

  const filteredAudit = (audit || []).filter((e) => {
    if (!histQ.trim()) return true;
    const n = histQ.trim().toLowerCase();
    return `${e.actor_name || ""} ${(e.changes || []).map((c) => `${c.field} ${c.section} ${c.old} ${c.new}`).join(" ")}`.toLowerCase().includes(n);
  });

  return (
    <div className="w-full pb-24" data-testid="settings-general-advanced">
      {/* premium header */}
      <div className="mb-5">
        <p className="text-xs text-slate-400 mb-1">System · General Settings</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 dark:text-white">General Settings</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">Manage your business identity, localization, social links and other platform-wide website settings from one place.</p>
          </div>
          <div className="text-xs">
            {saving ? <span className="text-slate-400 inline-flex items-center gap-1"><Loader2 className="w-3.5 h-3.5 animate-spin" />Saving…</span>
              : dirty ? <span className="text-amber-500 font-medium">Unsaved changes</span>
              : savedAt ? <span className="text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" />Last saved just now</span> : null}
          </div>
        </div>
      </div>

      {/* search */}
      <div className="relative max-w-md mb-4">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input data-testid="gen-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search settings… (e.g. currency, email, facebook)"
          className={`${inputBase} pl-9 border-slate-200 dark:border-slate-700`} />
        {results.length > 0 && (
          <div data-testid="gen-search-results" className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
            {results.map((f) => (
              <button key={f.key} data-testid={`gen-search-hit-${f.key}`} onClick={() => jumpTo(f)} className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-left">
                <span className="text-slate-700 dark:text-slate-200">{f.label}</span><span className="text-xs text-slate-400">{f.section}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-2 mb-5 overflow-x-auto no-scrollbar" data-testid="gen-tabs">
        {GEN_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.key} data-testid={`gen-tab-${s.key}`} onClick={() => setTab(s.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition ${tab === s.key ? "text-white shadow-sm" : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 hover:border-[#0D47A1]/40"}`}
              style={tab === s.key ? { background: BRAND_C } : {}}>
              <Icon className="w-4 h-4" /> {s.label}
            </button>
          );
        })}
      </div>

      {tab === "identity" && (
        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="grid sm:grid-cols-2 gap-4">{GEN_TEXT.identity.map(renderText)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 h-fit" data-testid="gen-business-preview">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Business Preview</p>
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl grid place-items-center text-white font-black" style={{ background: BRAND_C }}>{(g.site_name || "A")[0]}</div>
              <div><p className="font-heading font-bold text-slate-900 dark:text-white leading-tight">{g.site_name || "Site Name"}</p><p className="text-xs text-slate-400">{g.tagline || "Your tagline"}</p></div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              {g.support_email && <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-[#0D47A1]" />{g.support_email}</p>}
              {g.support_phone && <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-[#0D47A1]" />{g.support_phone}</p>}
              {g.support_hours && <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-[#0D47A1]" />{g.support_hours}</p>}
              {g.company_website && <p className="flex items-center gap-2"><Globe className="w-4 h-4 text-[#0D47A1]" />{g.company_website}</p>}
              {g.company_address && <p className="flex items-start gap-2"><MapPin className="w-4 h-4 text-[#0D47A1] mt-0.5" />{g.company_address}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === "localization" && (
        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="grid sm:grid-cols-2 gap-4">{GEN_TEXT.localization.map(renderText)}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 h-fit space-y-4" data-testid="gen-localization-preview">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Live Preview</p>
            {[["Currency", fmtMoney], ["Date", fmtDate], ["Time", fmtTime], ["Country", g.country || "—"], ["Language", g.default_language || "en"]].map(([l, v]) => (
              <div key={l} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5"><span className="text-xs text-slate-400">{l}</span><span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{v}</span></div>
            ))}
          </div>
        </div>
      )}

      {tab === "social" && (
        <div className="grid xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="grid sm:grid-cols-2 gap-4">{GEN_TEXT.social.map(renderText)}</div>
            <p className="text-[11px] text-slate-400 mt-4">These links appear in the website footer automatically. Empty links are hidden — no broken icons.</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 h-fit" data-testid="gen-social-preview">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Footer Social Preview</p>
            <p className="text-xs text-slate-500 mb-2">Follow us</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(SOCIAL_ICONS).map(([k, Icon]) => (
                <span key={k} className={`h-9 w-9 rounded-full grid place-items-center border ${g[k] ? "text-white border-transparent" : "text-slate-300 border-slate-200 dark:border-slate-700"}`} style={g[k] ? { background: BRAND_C } : {}} title={g[k] ? g[k] : "Empty — hidden on footer"}>
                  <Icon className="w-4 h-4" />
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border ${g.playstore_url ? "text-white border-transparent" : "text-slate-300 border-slate-200 dark:border-slate-700"}`} style={g.playstore_url ? { background: BRAND_C } : {}}><Smartphone className="w-3.5 h-3.5" />Google Play</span>
              <span className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-semibold border ${g.appstore_url ? "text-white border-transparent" : "text-slate-300 border-slate-200 dark:border-slate-700"}`} style={g.appstore_url ? { background: BRAND_C } : {}}><Smartphone className="w-3.5 h-3.5" />App Store</span>
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6" data-testid="gen-history">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-heading font-bold text-slate-900 dark:text-white">Configuration Change History</h3>
            <div className="relative w-full sm:w-64"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" /><input value={histQ} onChange={(e) => setHistQ(e.target.value)} placeholder="Search history…" data-testid="gen-history-search" className={`${inputBase} pl-9 border-slate-200 dark:border-slate-700`} /></div>
          </div>
          {audit === null ? <div className="py-10 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div> :
            filteredAudit.length === 0 ? <p className="text-sm text-slate-400 py-8 text-center">No configuration changes {histQ ? "match your search" : "recorded yet"}.</p> : (
              <div className="space-y-3">
                {filteredAudit.map((e) => (
                  <div key={e.id} data-testid="gen-history-entry" className="rounded-xl border border-slate-100 dark:border-slate-800 p-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-full grid place-items-center text-xs font-bold text-white" style={{ background: BRAND_C }}>{(e.actor_name || "A")[0]}</span>
                        <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{e.actor_name || "Admin"}</span>
                        <span className="text-xs text-slate-400">changed {e.count} field{e.count === 1 ? "" : "s"}</span>
                      </div>
                      <span className="text-xs text-slate-400">{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      {(e.changes || []).map((ch, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{ch.section ? `${ch.section}.` : ""}{ch.field}</span>
                          <span className="text-slate-400 line-through max-w-[180px] truncate">{String(ch.old ?? "—")}</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-emerald-600 font-semibold max-w-[220px] truncate">{String(ch.new ?? "—")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {/* sticky save bar */}
      {tab !== "history" && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-700 px-4 sm:px-8 py-3 flex items-center justify-between md:pl-72">
          <span className="text-xs text-slate-400">{errText ? <span className="text-red-500">{errText}</span> : dirty ? "You have unsaved changes" : savedAt ? "All changes saved" : "Ready"}</span>
          <Button data-testid="gen-save" onClick={save} disabled={saving || !dirty || !!errText} className="h-11 px-6 rounded-xl text-white font-bold" style={{ background: BRAND_C }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" />Save Changes</>}
          </Button>
        </div>
      )}
    </div>
  );
};


/* Read-only listing over an existing admin endpoint */
export const ReadOnlyTable = ({ title, endpoint, columns, searchKeys, filters, exportName, emptyText }) => {
  const { rows, loading } = useList(`/admin/${endpoint}`);
  return <DataTable title={title} rows={rows} loading={loading} columns={columns} searchKeys={searchKeys || columns.map((c) => c.key)}
    filters={filters} exportName={exportName || "export"} emptyText={emptyText || "No records yet"} pageSize={10} />;
};

/* ── Date-range control shared by Reports Overview & Export Center ── */
const RANGE_PRESETS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "365d", label: "1 year", days: 365 },
];
const isoDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const todayIso = () => new Date().toISOString().slice(0, 10);

const DateRangeBar = ({ from, to, onFrom, onTo, onPreset, active, right }) => (
  <div className="flex flex-wrap items-center gap-2" data-testid="reports-range-bar">
    <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
      {RANGE_PRESETS.map((p) => (
        <button key={p.key} data-testid={`range-${p.key}`} onClick={() => onPreset(p.days)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${active === p.days ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
          {p.label}
        </button>
      ))}
    </div>
    <div className="flex items-center gap-2 ml-auto">
      <PremiumDatePicker data-testid="range-from" value={from} max={to || todayIso()} onChange={(e) => onFrom(e.target.value)} placeholder="From" className="!h-9 !w-auto min-w-[150px] rounded-lg" />
      <span className="text-slate-400 text-sm">to</span>
      <PremiumDatePicker data-testid="range-to" value={to} min={from} max={todayIso()} onChange={(e) => onTo(e.target.value)} placeholder="To" className="!h-9 !w-auto min-w-[150px] rounded-lg" />
      {right}
    </div>
  </div>
);

const KPI = ({ label, value, sub, tone = "slate", testid }) => {
  const tones = {
    slate: "text-slate-900 dark:text-white", emerald: "text-emerald-600", blue: "text-blue-600",
    indigo: "text-indigo-600", amber: "text-amber-600", red: "text-red-600", violet: "text-violet-600",
  };
  return (
    <div data-testid={testid} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1.5 font-heading font-extrabold text-2xl ${tones[tone] || tones.slate}`}>{value}</p>
      {sub != null && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
};

const STATUS_COLORS = {
  searching: "#f59e0b", assigned: "#3b82f6", arrived_customer: "#3b82f6", started: "#6366f1",
  completed: "#10b981", paid: "#10b981", cancelled: "#ef4444", pending_payment: "#f59e0b",
};

/* Advanced Reports & Analytics — Overview with date range + charts + breakdowns */
export const ReportsPanel = ({ mode = "overview" }) => {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [active, setActive] = useState(30);
  const [d, setD] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/reports/overview", { params: { date_from: from, date_to: to } })
      .then((r) => setD(r.data))
      .catch(() => toast.error("Failed to load analytics"))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const preset = (days) => { setActive(days); setFrom(isoDaysAgo(days)); setTo(todayIso()); };
  const onFrom = (v) => { setActive(0); setFrom(v); };
  const onTo = (v) => { setActive(0); setTo(v); };

  const k = d?.kpis || {};
  return (
    <div className="space-y-6" data-testid={`reports-${mode}`}>
      <DateRangeBar from={from} to={to} onFrom={onFrom} onTo={onTo} onPreset={preset} active={active} />

      {loading && !d && <div className="py-20 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />Loading analytics…</div>}

      {d && (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="reports-kpis">
            <KPI testid="kpi-gross" label="Gross Revenue" value={fmt(k.gross_revenue)} sub={`${k.completed_bookings || 0} completed`} tone="emerald" />
            <KPI testid="kpi-platform" label="Platform Revenue" value={fmt(k.platform_revenue)} sub="net earnings" tone="indigo" />
            <KPI testid="kpi-bookings" label="Total Bookings" value={k.total_bookings || 0} sub={`${k.active_bookings || 0} active`} tone="blue" />
            <KPI testid="kpi-aov" label="Avg Order Value" value={fmt(k.avg_order_value)} tone="violet" />
            <KPI testid="kpi-success" label="Success Rate" value={`${k.success_rate || 0}%`} sub={`${k.cancellation_rate || 0}% cancelled`} tone="emerald" />
            <KPI testid="kpi-refunds" label="Refunds" value={fmt(k.refunds)} sub={`${k.refund_count || 0} refunds`} tone="red" />
            <KPI testid="kpi-newcust" label="New Customers" value={k.new_customers || 0} sub={`${k.total_customers || 0} total`} tone="blue" />
            <KPI testid="kpi-partners" label="Active Providers" value={k.active_partners || 0} sub={`${k.total_partners || 0} total`} tone="slate" />
            <KPI testid="kpi-partner-earn" label="Partner Payouts" value={fmt(k.partner_earnings)} tone="amber" />
            <KPI testid="kpi-merchant-ref" label="Merchant Referral" value={fmt(k.merchant_referral)} tone="slate" />
            <KPI testid="kpi-membership" label="Memberships" value={k.active_memberships || 0} sub={`${fmt(k.membership_revenue)} rev`} tone="violet" />
            <KPI testid="kpi-tickets" label="Open Tickets" value={k.open_tickets || 0} sub={`${k.loyalty_outstanding || 0} loyalty pts`} tone="amber" />
          </div>

          {/* Revenue trend + 7-day forecast */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5" data-testid="chart-revenue">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white">Revenue Trend</h3>
              <span className="flex items-center gap-1.5 text-xs text-slate-400"><span className="w-3 h-0.5 bg-indigo-500" />Actual<span className="w-3 border-t-2 border-dashed border-amber-500 ml-2" />Forecast</span>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <RAreaChart data={(() => {
                const act = (d.revenue_trend || []).map((p) => ({ ...p }));
                const fc = d.forecast || [];
                if (act.length && fc.length) act[act.length - 1] = { ...act[act.length - 1], projected: act[act.length - 1].revenue };
                return act.concat(fc.map((f) => ({ date: f.date, projected: f.projected })));
              })()}>
                <defs>
                  <linearGradient id="revG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} width={48} />
                <Tooltip formatter={(v, n) => [fmt(v), n === "projected" ? "Forecast" : "Revenue"]} labelStyle={{ color: "#334155" }} />
                <Area type="monotone" dataKey="revenue" stroke="#4f46e5" strokeWidth={2} fill="url(#revG)" connectNulls />
                <Area type="monotone" dataKey="projected" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 4" fill="none" connectNulls />
              </RAreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Bookings by status */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5" data-testid="chart-status">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-4">Bookings by Status</h3>
              {(d.bookings_by_status || []).length === 0 ? <p className="text-sm text-slate-400 py-10 text-center">No bookings in range</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <RBarChart data={d.bookings_by_status}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="status" tickFormatter={(v) => String(v).replace(/_/g, " ")} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={32} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {(d.bookings_by_status || []).map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status] || "#64748b"} />)}
                    </Bar>
                  </RBarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Customer growth */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5" data-testid="chart-growth">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-4">New Customers</h3>
              <ResponsiveContainer width="100%" height={220}>
                <RAreaChart data={d.customer_growth || []}>
                  <defs>
                    <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={32} />
                  <Tooltip />
                  <Area type="monotone" dataKey="new_customers" stroke="#10b981" strokeWidth={2} fill="url(#cg)" />
                </RAreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            {/* Top services */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5" data-testid="table-top-services">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-3">Top Services</h3>
              {(d.top_services || []).length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No data</p> : (
                <div className="space-y-2">
                  {d.top_services.map((s, i) => (
                    <div key={s.name} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-slate-400 font-bold">{i + 1}</span>
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{s.name}</span>
                      <span className="text-slate-400 text-xs">{s.orders} ord</span>
                      <span className="font-bold text-slate-900 dark:text-white w-20 text-right">{fmt(s.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By category */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5" data-testid="table-by-category">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-3">Revenue by Category</h3>
              {(d.by_category || []).length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No data</p> : (
                <div className="space-y-3">
                  {d.by_category.map((c) => {
                    const max = Math.max(1, ...d.by_category.map((x) => x.revenue));
                    return (
                      <div key={c.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                          <span className="font-bold text-slate-900 dark:text-white">{fmt(c.revenue)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-primary-600 rounded-full" style={{ width: `${(c.revenue / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top partners */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5" data-testid="table-top-partners">
            <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-3">Top Providers</h3>
            {(d.top_partners || []).length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">No data</p> : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {d.top_partners.map((p, i) => (
                  <div key={p.name + i} className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5">
                    <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 grid place-items-center font-bold text-sm">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.earnings != null ? `${fmt(p.earnings)} earned` : `${p.jobs || 0} jobs · ★ ${p.rating || 0}`}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

/* Advanced Export Center — server-side clean datasets with date-range + CSV download */
export const ExportCenter = () => {
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [active, setActive] = useState(30);
  const [useRange, setUseRange] = useState(false);
  const [manifest, setManifest] = useState([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.get("/admin/reports/export/manifest").then((r) => setManifest(r.data.datasets || [])).catch(() => {});
  }, []);

  const preset = (days) => { setActive(days); setFrom(isoDaysAgo(days)); setTo(todayIso()); };

  const toCsv = (columns, rows) => {
    const esc = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return `"${s.replace(/"/g, '""')}"`; };
    return [columns.map(esc).join(",")].concat(rows.map((r) => columns.map((c) => esc(r[c])).join(","))).join("\n");
  };

  const download = async (ds) => {
    setBusy(ds.key);
    try {
      const params = { dataset: ds.key };
      if (useRange) { params.date_from = from; params.date_to = to; }
      const { data } = await api.get("/admin/reports/export", { params });
      const rows = data.rows || [];
      if (!rows.length) { toast.error(`No ${ds.label} in ${useRange ? "selected range" : "records"}`); return; }
      const columns = data.columns && data.columns.length ? data.columns : Object.keys(rows[0]);
      const csv = "\ufeff" + toCsv(columns, rows); // BOM for Excel
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${ds.key}-${todayIso()}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} ${ds.label}`);
    } catch { toast.error("Export failed"); }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-5" data-testid="export-center">
      <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-4 text-sm text-indigo-800 dark:text-indigo-200">
        Download clean, formatted datasets as CSV (Excel-ready). Toggle a date range to filter records by creation date.
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200" data-testid="export-range-toggle">
          <Switch checked={useRange} onCheckedChange={setUseRange} />
          Filter by date range
        </label>
        {useRange && (
          <DateRangeBar from={from} to={to} active={active}
            onFrom={(v) => { setActive(0); setFrom(v); }} onTo={(v) => { setActive(0); setTo(v); }} onPreset={preset} />
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {manifest.map((ds) => (
          <div key={ds.key} data-testid={`export-card-${ds.key}`}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-heading font-bold text-slate-900 dark:text-white">{ds.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{ds.count} records · {ds.columns?.length || 0} columns</p>
              </div>
              <FileText className="w-5 h-5 text-primary-500 shrink-0" />
            </div>
            <button data-testid={`export-${ds.key}`} onClick={() => download(ds)} disabled={busy === ds.key}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold text-sm py-2.5 transition">
              {busy === ds.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {busy === ds.key ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        ))}
        {manifest.length === 0 && <p className="text-sm text-slate-400 col-span-full py-8 text-center">Loading datasets…</p>}
      </div>
    </div>
  );
};

/* ── Custom Report Builder — pick dataset + columns + filters, preview, save & export ── */
export const ReportBuilder = () => {
  const [manifest, setManifest] = useState([]);
  const [views, setViews] = useState([]);
  const [dataset, setDataset] = useState("bookings");
  const [cols, setCols] = useState([]);
  const [filterText, setFilterText] = useState("");
  const [useRange, setUseRange] = useState(false);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewName, setViewName] = useState("");

  const loadViews = useCallback(() => api.get("/admin/report-views").then((r) => setViews(r.data.views || [])).catch(() => {}), []);
  useEffect(() => {
    api.get("/admin/reports/export/manifest").then((r) => setManifest(r.data.datasets || [])).catch(() => {});
    loadViews();
  }, [loadViews]);

  const current = manifest.find((m) => m.key === dataset);
  const allCols = current?.columns || [];
  useEffect(() => { setCols(allCols); setResult(null); /* reset on dataset change */ }, [dataset]); // eslint-disable-line

  const toggleCol = (c) => setCols((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);

  const buildFilters = () => {
    // "field:value, field2:value2"
    const out = {};
    filterText.split(",").forEach((pair) => {
      const [k, ...v] = pair.split(":");
      if (k && v.length) out[k.trim()] = v.join(":").trim();
    });
    return out;
  };

  const run = async () => {
    setBusy(true);
    try {
      const body = { dataset, columns: cols, filters: buildFilters() };
      if (useRange) { body.date_from = from; body.date_to = to; }
      const { data } = await api.post("/admin/report-views/run", body);
      setResult(data);
    } catch { toast.error("Run failed"); } finally { setBusy(false); }
  };

  const downloadCsv = () => {
    if (!result?.rows?.length) return toast.error("Run a report first");
    const c = result.columns || Object.keys(result.rows[0]);
    const esc = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return `"${s.replace(/"/g, '""')}"`; };
    const csv = "\ufeff" + [c.map(esc).join(",")].concat(result.rows.map((r) => c.map((k) => esc(r[k])).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `${dataset}-report-${todayIso()}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Downloaded ${result.rows.length} rows`);
  };

  const saveView = async () => {
    if (!viewName.trim()) return toast.error("Name your view");
    try {
      const body = { name: viewName.trim(), dataset, columns: cols, filters: buildFilters() };
      if (useRange) { body.date_from = from; body.date_to = to; }
      await api.post("/admin/report-views", body);
      toast.success("View saved"); setViewName(""); loadViews();
    } catch { toast.error("Save failed"); }
  };

  const loadView = (v) => {
    setDataset(v.dataset); setCols(v.columns || []);
    setFilterText(Object.entries(v.filters || {}).map(([k, val]) => `${k}:${val}`).join(", "));
    if (v.date_from || v.date_to) { setUseRange(true); setFrom(v.date_from || isoDaysAgo(30)); setTo(v.date_to || todayIso()); }
    setTimeout(run, 60);
  };

  const delView = async (id) => { try { await api.delete(`/admin/report-views/${id}`); loadViews(); } catch { toast.error("Delete failed"); } };

  return (
    <div className="space-y-5" data-testid="report-builder">
      <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-4 text-sm text-indigo-800 dark:text-indigo-200">
        Build a custom report — choose a dataset, pick the columns & filters you need, preview the result, then save the view or download a CSV.
      </div>

      {/* saved views */}
      {views.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="saved-views">
          {views.map((v) => (
            <span key={v.id} className="inline-flex items-center gap-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 pl-3 pr-1 py-1 text-sm">
              <button onClick={() => loadView(v)} data-testid={`load-view-${v.id}`} className="font-medium text-slate-700 dark:text-slate-200 hover:text-primary-600">{v.name}</button>
              <button onClick={() => delView(v.id)} className="w-6 h-6 grid place-items-center rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* config */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Dataset</label>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {manifest.map((m) => (
                <button key={m.key} data-testid={`ds-${m.key}`} onClick={() => setDataset(m.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left truncate transition ${dataset === m.key ? "bg-primary-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"}`}>
                  {m.label} <span className="opacity-60">({m.count})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Columns</label>
            <div className="mt-2 space-y-1.5 max-h-52 overflow-auto pr-1">
              {allCols.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" data-testid={`col-${c}`} checked={cols.includes(c)} onChange={() => toggleCol(c)} className="rounded border-slate-300 text-primary-600" />
                  {c}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Filters</label>
              <Input data-testid="rb-filters" value={filterText} onChange={(e) => setFilterText(e.target.value)}
                placeholder="status:completed, priority:high" className="mt-1.5 h-9 text-sm" />
              <p className="text-[11px] text-slate-400 mt-1">Format: field:value, comma-separated. Matches are case-insensitive.</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <Switch checked={useRange} onCheckedChange={setUseRange} data-testid="rb-range-toggle" /> Date range
            </label>
            {useRange && (
              <div className="flex items-center gap-2">
                <PremiumDatePicker value={from} max={to} onChange={(e) => setFrom(e.target.value)} placeholder="From" className="!h-9 !w-auto min-w-[140px] rounded-lg" />
                <span className="text-slate-400 text-sm">to</span>
                <PremiumDatePicker value={to} max={todayIso()} onChange={(e) => setTo(e.target.value)} placeholder="To" className="!h-9 !w-auto min-w-[140px] rounded-lg" />
              </div>
            )}
            <Button data-testid="rb-run" onClick={run} disabled={busy} className="w-full bg-primary-600 hover:bg-primary-700">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Report"}
            </Button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex gap-2">
            <Input data-testid="rb-view-name" value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Save view as…" className="h-9 text-sm" />
            <Button data-testid="rb-save-view" onClick={saveView} variant="outline" className="shrink-0">Save</Button>
          </div>
        </div>

        {/* preview */}
        <div className="lg:col-span-2">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4" data-testid="rb-preview">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-bold text-slate-900 dark:text-white">Preview {result ? `· ${result.count} rows` : ""}</h3>
              <Button data-testid="rb-download" onClick={downloadCsv} disabled={!result?.rows?.length} size="sm" className="bg-emerald-600 hover:bg-emerald-700">
                <FileText className="w-4 h-4 mr-1" /> Download CSV
              </Button>
            </div>
            {!result ? <p className="text-sm text-slate-400 py-12 text-center">Configure and run a report to see the preview.</p> : (
              result.rows.length === 0 ? <p className="text-sm text-slate-400 py-12 text-center">No rows match your filters.</p> : (
                <div className="overflow-auto max-h-[520px] border border-slate-100 dark:border-slate-800 rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                      <tr>{(result.columns || []).map((c) => <th key={c} className="text-left px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 100).map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                          {(result.columns || []).map((c) => <td key={c} className="px-3 py-2 text-slate-600 dark:text-slate-300 whitespace-nowrap max-w-[220px] truncate">{String(r[c] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.rows.length > 100 && <p className="text-xs text-slate-400 p-2 text-center">Showing first 100 of {result.count} — download CSV for all.</p>}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ── Scheduled Reports — auto weekly/daily/monthly PDF+CSV summary emailed to recipients ── */
export const ScheduledReports = () => {
  const [schedules, setSchedules] = useState([]);
  const [runs, setRuns] = useState([]);
  const [form, setForm] = useState({ name: "", frequency: "weekly", recipients: "", format: "both", enabled: true });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/report-schedules").then((r) => setSchedules(r.data.schedules || [])).catch(() => {});
    api.get("/admin/report-runs").then((r) => setRuns(r.data.runs || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) return toast.error("Name your report");
    setBusy(true);
    try {
      await api.post("/admin/report-schedules", {
        name: form.name.trim(), frequency: form.frequency, format: form.format,
        enabled: form.enabled,
        recipients: form.recipients.split(",").map((e) => e.trim()).filter(Boolean),
      });
      toast.success("Schedule created");
      setForm({ name: "", frequency: "weekly", recipients: "", format: "both", enabled: true });
      load();
    } catch { toast.error("Create failed"); } finally { setBusy(false); }
  };

  const runNow = async (id) => {
    try {
      const { data } = await api.post(`/admin/report-schedules/${id}/run-now`);
      toast.success(data.emailed_to?.length ? `Sent to ${data.emailed_to.length} recipient(s)` : "Report generated (email not configured — download below)");
      load();
    } catch { toast.error("Run failed"); }
  };

  const toggle = async (s) => { try { await api.put(`/admin/report-schedules/${s.id}`, { enabled: !s.enabled }); load(); } catch { toast.error("Update failed"); } };
  const del = async (id) => { try { await api.delete(`/admin/report-schedules/${id}`); load(); } catch { toast.error("Delete failed"); } };

  return (
    <div className="space-y-5" data-testid="scheduled-reports">
      <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-4 text-sm text-indigo-800 dark:text-indigo-200">
        Automatically generate an analytics summary (PDF + CSV) on a schedule and email it to your team. Configure SMTP/SendGrid in Integration Center for email delivery — reports are always saved below for download.
      </div>

      {/* create form */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end" data-testid="schedule-form">
        <div className="lg:col-span-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Name</label>
          <Input data-testid="sched-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Weekly Exec Summary" className="mt-1.5 h-9" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Frequency</label>
          <PremiumSelect data-testid="sched-frequency" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} searchable={false}
            className="mt-1.5 w-full !h-9 rounded-lg">
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </PremiumSelect>
        </div>
        <div className="lg:col-span-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Recipients</label>
          <Input data-testid="sched-recipients" value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="a@x.com, b@y.com" className="mt-1.5 h-9" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Format</label>
          <PremiumSelect data-testid="sched-format" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} searchable={false}
            className="mt-1.5 w-full !h-9 rounded-lg">
            <option value="both">PDF + CSV</option><option value="pdf">PDF only</option><option value="csv">CSV only</option>
          </PremiumSelect>
        </div>
        <Button data-testid="sched-create" onClick={create} disabled={busy} className="bg-primary-600 hover:bg-primary-700 h-9">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Create</>}
        </Button>
      </div>

      {/* schedules list */}
      <div className="space-y-2" data-testid="schedule-list">
        {schedules.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">No schedules yet — create one above.</p> :
          schedules.map((s) => (
            <div key={s.id} data-testid={`schedule-${s.id}`} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{s.name} <span className="ml-1 text-xs font-normal capitalize text-primary-600">{s.frequency}</span></p>
                <p className="text-xs text-slate-400 truncate">{(s.recipients || []).join(", ") || "No recipients"} · {s.format?.toUpperCase()} · next {s.next_run_at ? new Date(s.next_run_at).toLocaleDateString() : "—"}</p>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-500"><Switch checked={s.enabled} onCheckedChange={() => toggle(s)} /> {s.enabled ? "On" : "Off"}</label>
              <Button data-testid={`run-now-${s.id}`} onClick={() => runNow(s.id)} size="sm" variant="outline">Run now</Button>
              <button onClick={() => del(s.id)} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
      </div>

      {/* run history */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4" data-testid="run-history">
        <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-3">Report History</h3>
        {runs.length === 0 ? <p className="text-sm text-slate-400 py-4 text-center">No reports generated yet.</p> : (
          <div className="space-y-2">
            {runs.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-700 dark:text-slate-200 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400">{r.period?.date_from} → {r.period?.date_to} · {new Date(r.generated_at).toLocaleString()}</p>
                </div>
                <Badge className={`border-0 text-xs ${r.email_status === "sent" ? "bg-emerald-100 text-emerald-700" : r.email_status === "failed" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                  email {r.email_status}
                </Badge>
                {r.pdf_url && <a href={r.pdf_url} target="_blank" rel="noreferrer" className="text-primary-600 font-semibold hover:underline">PDF ↗</a>}
                {r.csv_url && <a href={r.csv_url} target="_blank" rel="noreferrer" className="text-emerald-600 font-semibold hover:underline">CSV ↗</a>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


/* SEO dashboard / sitemap info panel */
const SitemapPanel = ({ backendRoot }) => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/admin/seo/status").then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const ping = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/seo/ping-sitemap");
      const ok = (data.results || []).filter((r) => r.ok).map((r) => r.engine);
      toast.success(ok.length ? `Pinged: ${ok.join(", ")}` : "Ping sent (search engines will re-crawl soon)");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Ping failed"); }
    finally { setBusy(false); }
  };
  const sm = status?.sitemap_url || `${backendRoot}/api/sitemap.xml`;
  return (
    <div className="max-w-2xl space-y-4" data-testid="sitemap-panel">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-heading font-bold text-slate-900 dark:text-white mb-1">Sitemap &amp; Robots</h3>
        <p className="text-sm text-slate-500 mb-4">Auto-generated from every active category, sub-category, service &amp; page (with canonical URLs). Ping search engines for faster indexing.</p>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-xl bg-primary-50 dark:bg-primary-900/10 p-4 text-center"><p className="font-heading font-extrabold text-2xl text-primary-700">{status?.total_urls ?? "…"}</p><p className="text-xs text-slate-500">URLs in sitemap</p></div>
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 p-4 text-center"><p className="font-heading font-extrabold text-2xl text-emerald-600">✓</p><p className="text-xs text-slate-500">robots.txt live</p></div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4 text-center"><p className="font-heading font-bold text-sm text-slate-700 dark:text-slate-200 truncate">{status?.last_ping ? new Date(status.last_ping).toLocaleDateString() : "Never"}</p><p className="text-xs text-slate-500">last pinged</p></div>
        </div>
        <div className="space-y-2 text-sm">
          <a href={sm} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 hover:bg-slate-100"><span className="font-mono text-slate-600 dark:text-slate-300 truncate">/api/sitemap.xml</span><span className="text-primary-700 font-semibold shrink-0 ml-2">Open ↗</span></a>
          <a href={status?.robots_url || `${backendRoot}/api/robots.txt`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800 px-4 py-2.5 hover:bg-slate-100"><span className="font-mono text-slate-600 dark:text-slate-300">/api/robots.txt</span><span className="text-primary-700 font-semibold shrink-0 ml-2">Open ↗</span></a>
        </div>
        <Button data-testid="ping-sitemap" onClick={ping} disabled={busy} className="w-full mt-4 bg-primary-700 hover:bg-primary-800">{busy ? "Pinging search engines…" : "Ping Google & Bing now"}</Button>
        {status?.last_results?.length > 0 && (
          <div className="mt-3 space-y-1">
            {status.last_results.map((r) => (
              <div key={r.engine} className="flex items-center justify-between text-xs rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2">
                <span className="text-slate-600 dark:text-slate-300">{r.engine}</span>
                <span className={r.ok ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>{r.ok ? `OK (${r.status})` : `HTTP ${r.status}${r.error ? " · " + r.error : ""}`}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">Tip: also add this sitemap in Google Search Console → Sitemaps for guaranteed indexing. Google&apos;s ping endpoint is deprecated, so a non-OK status there is expected — the robots.txt Sitemap directive + Search Console is the reliable path.</p>
      </div>
    </div>
  );
};

const CoverageBar = ({ label, pct }) => (
  <div>
    <div className="flex justify-between text-xs mb-1"><span className="text-slate-500 dark:text-slate-400">{label}</span><span className="font-semibold text-slate-700 dark:text-slate-200">{pct}%</span></div>
    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${pct}%` }} />
    </div>
  </div>
);

const SeoDashboardAdvanced = () => {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/admin/seo/dashboard").then((r) => setD(r.data)).catch(() => setD(null));
  useEffect(() => { load(); }, []);
  const ping = async () => {
    setBusy(true);
    try { const { data } = await api.post("/admin/seo/ping-sitemap"); toast.success(data.throttled ? "Recently pinged — throttled" : "Pinged Google & Bing"); load(); }
    catch { toast.error("Ping failed"); } finally { setBusy(false); }
  };
  if (!d) return <div className="py-20 text-center text-slate-400" data-testid="seo-dashboard"><Loader2 className="h-5 w-5 animate-spin inline" /> Analyzing SEO…</div>;
  const score = d.score || 0;
  const scoreColor = score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500";
  const ring = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const R = 52, C = 2 * Math.PI * R;
  const cov = d.coverage || {};
  const rec = d.recommendations || [];
  const recDone = rec.filter((r) => r.done).length;
  return (
    <div className="space-y-5" data-testid="seo-dashboard">
      <div className="rounded-xl bg-gradient-to-r from-indigo-50 to-sky-50 dark:from-indigo-900/20 dark:to-sky-900/20 border border-indigo-100 dark:border-indigo-900/40 p-3 text-sm text-indigo-800 dark:text-indigo-200">
        Advanced SEO command center — fix the issues below & complete the checklist to rank higher across India.
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Score ring */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col items-center justify-center">
          <div className="relative h-32 w-32">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r={R} fill="none" stroke="currentColor" strokeWidth="12" className="text-slate-100 dark:text-slate-800" />
              <circle cx="60" cy="60" r={R} fill="none" stroke={ring} strokeWidth="12" strokeLinecap="round"
                strokeDasharray={C} strokeDashoffset={C - (C * score) / 100} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center"><p className={`text-4xl font-heading font-extrabold ${scoreColor}`}>{score}</p><p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">SEO Score</p></div>
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-3 text-center">{recDone}/{rec.length} best-practices complete</p>
        </div>

        {/* Counts */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[["Categories", d.counts.categories], ["Sub-categories", d.counts.subcategories], ["Services", d.counts.services],
            ["Sitemap URLs", d.counts.sitemap_urls], ["Schema blocks", d.counts.schema], ["Redirects", d.counts.redirects]].map(([k, v]) => (
            <div key={k} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
              <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{k}</p>
              <p className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white mt-1">{v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage + quick actions */}
      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-heading font-bold text-lg mb-4 text-slate-900 dark:text-white">Meta coverage</h3>
          <div className="grid sm:grid-cols-3 gap-6">
            {["category", "subcategory", "service"].map((kind) => cov[kind] && (
              <div key={kind}>
                <p className="font-semibold text-sm capitalize mb-3 text-slate-700 dark:text-slate-200">{kind} <span className="text-slate-400 font-normal">({cov[kind].total})</span></p>
                <div className="space-y-3">
                  <CoverageBar label="Title" pct={cov[kind].title_pct} />
                  <CoverageBar label="Description" pct={cov[kind].description_pct} />
                  <CoverageBar label="Keywords" pct={cov[kind].keywords_pct} />
                  <CoverageBar label="Slug" pct={cov[kind].slug_pct} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-heading font-bold text-lg mb-3 text-slate-900 dark:text-white">Quick actions</h3>
          <Button data-testid="seo-ping" onClick={ping} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800 mb-2">{busy ? "Pinging…" : "Ping Google & Bing now"}</Button>
          <a href={d.sitemap_url} target="_blank" rel="noreferrer" className="block text-center text-sm rounded-lg border border-slate-200 dark:border-slate-700 py-2 mb-2 text-slate-600 dark:text-slate-300 hover:border-primary-400">View sitemap.xml</a>
          <a href={d.robots_url} target="_blank" rel="noreferrer" className="block text-center text-sm rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-slate-600 dark:text-slate-300 hover:border-primary-400">View robots.txt</a>
          {d.last_ping && <p className="text-[11px] text-slate-400 mt-3">Last ping: {new Date(d.last_ping).toLocaleString()}</p>}
        </div>
      </div>

      {/* Recommendations checklist */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-heading font-bold text-lg mb-4 text-slate-900 dark:text-white">Ranking checklist</h3>
        <div className="space-y-2">
          {rec.map((r) => (
            <div key={r.key} className="flex items-start gap-3 rounded-xl border border-slate-100 dark:border-slate-700 p-3">
              {r.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" /> : <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />}
              <div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.title}</p><p className="text-xs text-slate-400 mt-0.5">{r.detail}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Issues */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-heading font-bold text-lg mb-1 text-slate-900 dark:text-white">Issues to fix <span className="text-slate-400 font-normal text-base">({d.issues_total})</span></h3>
        <p className="text-xs text-slate-400 mb-4">Items missing SEO fields — fix them in Category SEO / Service SEO or the Service wizard.</p>
        {d.issues.length === 0 ? <p className="text-sm text-emerald-600">🎉 No SEO gaps found. Everything is optimised!</p> : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {d.issues.map((i) => (
              <div key={`${i.type}-${i.id}`} className="flex items-center justify-between border border-slate-100 dark:border-slate-700 rounded-lg p-3 gap-3">
                <div className="min-w-0"><p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{i.name}</p><Badge className="bg-slate-100 text-slate-600 border-0 capitalize dark:bg-slate-800 dark:text-slate-300 mt-1">{i.type}</Badge></div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {i.missing.map((m) => <Badge key={m} className="bg-red-50 text-red-600 border-0 dark:bg-red-900/20 dark:text-red-300 capitalize">{m}</Badge>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const SeoInfoPanel = ({ kind = "seo" }) => {
  const backendRoot = (typeof process !== "undefined" && process.env && process.env.REACT_APP_BACKEND_URL) || "";
  if (kind === "sitemap") {
    return <SitemapPanel backendRoot={backendRoot} />;
  }
  return <SeoDashboardAdvanced />;
};
