import { useCallback, useEffect, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { QrCode, Users, ShoppingBag, TrendingUp, MapPin, CalendarClock } from "lucide-react";
import api from "@/lib/api";

const PANEL = "/merchant/panel";
const RANGES = [["7d", "7 Days"], ["30d", "30 Days"], ["90d", "90 Days"], ["year", "This Year"]];

const Stat = ({ icon: Icon, label, value, tint }) => (
  <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4">
    <span className={`h-9 w-9 rounded-xl grid place-items-center ${tint}`}><Icon className="h-[18px] w-[18px]" /></span>
    <p className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white mt-3 tabular-nums">{value}</p>
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">{label}</p>
  </div>
);

const timeAgo = (iso) => {
  try {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
};

export default function QRAnalytics() {
  const [range, setRange] = useState("30d");
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    api.get(`${PANEL}/qr/analytics`, { params: { range } }).then((r) => setD(r.data)).catch(() => {});
  }, [range]);
  useEffect(() => { load(); }, [load]);

  const s = d || {};
  const chartData = (s.series || []).map((x) => ({ ...x, d: x.date.slice(5) }));

  return (
    <div data-testid="qr-analytics" className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary-700" /> QR Performance</h3>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {RANGES.map(([v, l]) => (
            <button key={v} data-testid={`qra-range-${v}`} onClick={() => setRange(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${range === v ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500"}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={QrCode} label="Total Scans" value={(s.total_scans ?? 0).toLocaleString("en-IN")} tint="bg-primary-50 text-primary-700" />
        <Stat icon={Users} label="Unique Visitors" value={(s.unique_visitors ?? 0).toLocaleString("en-IN")} tint="bg-violet-50 text-violet-600" />
        <Stat icon={ShoppingBag} label="Bookings" value={(s.bookings ?? 0).toLocaleString("en-IN")} tint="bg-emerald-50 text-emerald-600" />
        <Stat icon={TrendingUp} label="Conversion" value={`${s.conversion ?? 0}%`} tint="bg-amber-50 text-amber-600" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">This Month Scans</p>
          <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-1">{(s.month_scans ?? 0).toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">This Month Bookings</p>
          <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-1">{(s.month_bookings ?? 0).toLocaleString("en-IN")}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Scans vs Bookings</p>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D47A1" stopOpacity={0.35} /><stop offset="100%" stopColor="#0D47A1" stopOpacity={0} /></linearGradient>
                <linearGradient id="gB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
              <XAxis dataKey="d" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
              <Tooltip />
              <Area type="monotone" dataKey="scans" stroke="#0D47A1" strokeWidth={2} fill="url(#gS)" name="Scans" />
              <Area type="monotone" dataKey="bookings" stroke="#10b981" strokeWidth={2} fill="url(#gB)" name="Bookings" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary-700" /> Recent Activity</p>
        {(s.recent || []).length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No scans yet. Share your QR to start tracking.</p>
        ) : (
          <div className="space-y-2" data-testid="qra-recent">
            {s.recent.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <span className={`h-8 w-8 rounded-lg grid place-items-center ${a.type === "booking" ? "bg-emerald-50 text-emerald-600" : "bg-primary-50 text-primary-600"}`}>
                  {a.type === "booking" ? <ShoppingBag className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{a.label}</p>
                  {a.city && <p className="text-[11px] text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.city}</p>}
                </div>
                <span className="text-[11px] text-slate-400">{timeAgo(a.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
