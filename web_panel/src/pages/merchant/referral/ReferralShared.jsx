import PremiumSelect from "@/components/ui/PremiumSelect";
import React, { useState } from "react";
import {
  Calendar, ChevronLeft, ChevronRight, Search, X, TrendingUp, ShieldCheck,
} from "lucide-react";

export const fmt = (n) =>
  "\u20b9" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

/* ─────────────── Report / stat cards ─────────────── */
export function ReportCards({ cards = [] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="report-cards">
      {cards.map((c) => (
        <div key={c.label}
          className={`rounded-2xl border p-4 ${c.primary
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-500/20"
            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide ${c.primary ? "text-emerald-50" : "text-slate-400"}`}>{c.label}</p>
          <p className={`mt-1 font-heading font-extrabold tabular-nums truncate ${c.primary ? "text-2xl" : "text-lg"} ${c.primary ? "text-white" : (c.money ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-white")}`}>
            {c.money ? fmt(c.value) : Number(c.value || 0).toLocaleString("en-IN")}
          </p>
          {c.sub ? <p className={`text-[11px] mt-0.5 ${c.primary ? "text-emerald-50/90" : "text-slate-400"}`}>{c.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

/* ─────────────── Referral-type badge ─────────────── */
export function TypeBadge({ type }) {
  const isCust = type === "customer";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
      isCust ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
             : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"}`}>
      {isCust ? "Customer" : "Partner"}
    </span>
  );
}

export function StatusBadge({ status }) {
  const map = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    suspended: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    inactive: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${map[status] || map.inactive}`}>
      {(status === "active" || status === "approved") && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
      {status || "—"}
    </span>
  );
}

/* ─────────────── Search box ─────────────── */
export function SearchBox({ value, onChange, placeholder = "Search…" }) {
  return (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input data-testid="search-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full h-10 pl-9 pr-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
      {value ? (
        <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/* ─────────────── Premium date-range filter ─────────────── */
const PRESETS = [
  ["", "All time"], ["today", "Today"], ["yesterday", "Yesterday"],
  ["this_week", "This Week"], ["this_month", "This Month"], ["last_month", "Last Month"],
];

const WD = ["S", "M", "T", "W", "T", "F", "S"];
const _iso = (dt) => {
  const z = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

/* Custom-designed range calendar (no native browser date picker). */
export function RangeCalendar({ from, to, onPick }) {
  const base = from ? new Date(from) : new Date();
  const [view, setView] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const y = view.getFullYear(), m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const dim = new Date(y, m + 1, 0).getDate();
  const monthLabel = view.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const fromD = from ? new Date(`${from}T00:00:00`) : null;
  const toD = to ? new Date(`${to}T00:00:00`) : null;

  const pick = (dt) => {
    const s = _iso(dt);
    if (!fromD || (fromD && toD)) onPick(s, "");            // start a fresh range
    else if (dt < fromD) onPick(s, _iso(fromD));            // clicked before start → swap
    else onPick(_iso(fromD), s);                            // set the end
  };

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));

  const shift = (n) => setView(new Date(y, m + n, 1));

  return (
    <div data-testid="range-calendar" className="select-none">
      <div className="flex items-center justify-between mb-2">
        <button type="button" data-testid="cal-prev" onClick={() => shift(-1)}
          className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-slate-800 dark:text-white">{monthLabel}</p>
        <button type="button" data-testid="cal-next" onClick={() => shift(1)}
          className="h-8 w-8 grid place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {WD.map((w, i) => <div key={i} className="h-6 grid place-items-center text-[10px] font-bold text-slate-400">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((dt, i) => {
          if (!dt) return <div key={i} />;
          const s = _iso(dt);
          const isFrom = fromD && s === _iso(fromD);
          const isTo = toD && s === _iso(toD);
          const inRange = fromD && toD && dt > fromD && dt < toD;
          const isToday = s === _iso(today);
          const future = dt > today;
          return (
            <button key={i} type="button" disabled={future} data-testid={`cal-day-${s}`}
              onClick={() => pick(dt)}
              className={`h-9 rounded-lg text-[13px] font-semibold transition relative disabled:opacity-30 disabled:cursor-not-allowed
                ${isFrom || isTo ? "bg-primary-600 text-white shadow"
                  : inRange ? "bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-200"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              {dt.getDate()}
              {isToday && !isFrom && !isTo && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary-500" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangeFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const range = value.range || "";
  const label = range === "custom"
    ? `${value.date_from || "…"} → ${value.date_to || "…"}`
    : (PRESETS.find((p) => p[0] === range)?.[1] || "All time");
  return (
    <div className="relative">
      <button data-testid="date-filter-toggle" onClick={() => setOpen((o) => !o)}
        className="h-10 px-3.5 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-300">
        <Calendar className="h-4 w-4 text-primary-600" />
        <span className="truncate max-w-[140px]">{label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-3" data-testid="date-filter-panel">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">Quick ranges</p>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(([k, lbl]) => (
                <button key={k || "all"} data-testid={`date-preset-${k || "all"}`}
                  onClick={() => { onChange({ range: k }); setOpen(false); }}
                  className={`h-9 rounded-xl text-xs font-semibold transition ${range === k
                    ? "bg-primary-600 text-white" : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100"}`}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Custom range</p>
                <p className="text-[11px] font-semibold text-primary-600 tabular-nums" data-testid="custom-range-label">
                  {value.date_from || "start"} → {value.date_to || "end"}
                </p>
              </div>
              <RangeCalendar from={value.date_from} to={value.date_to}
                onPick={(f, t) => onChange({ range: "custom", date_from: f, date_to: t })} />
              <button data-testid="date-apply" disabled={!value.date_from || !value.date_to}
                onClick={() => setOpen(false)}
                className="mt-3 w-full h-9 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed">Apply</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────── Pagination (server-side) ─────────────── */
export function Pagination({ page, pages, total, pageSize, onPage, onPageSize }) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4" data-testid="pagination">
      <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span>{from}–{to} of <span className="font-semibold text-slate-700 dark:text-slate-200">{total}</span></span>
        <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
          data-testid="page-size" searchable={false} className="!h-9 !w-[104px] rounded-lg text-sm">
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </PremiumSelect>
      </div>
      <div className="flex items-center gap-1.5">
        <button data-testid="page-prev" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
        {Array.from({ length: pages }).slice(0, 5).map((_, i) => {
          const start = Math.min(Math.max(1, page - 2), Math.max(1, pages - 4));
          const n = start + i;
          if (n > pages) return null;
          return (
            <button key={n} onClick={() => onPage(n)} data-testid={`page-${n}`}
              className={`h-9 min-w-9 px-2 rounded-lg text-sm font-semibold ${n === page
                ? "bg-primary-600 text-white" : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>{n}</button>
          );
        })}
        <button data-testid="page-next" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="h-9 w-9 grid place-items-center rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ─────────────── Module header (premium gradient banner) ─────────────── */
export function ModuleHeader({ title, subtitle, icon: Icon = TrendingUp }) {
  return (
    <div className="relative overflow-hidden rounded-3xl p-5 mb-4 lg:mb-5 text-white shadow-lg"
      style={{ background: "linear-gradient(120deg,#0D47A1 0%,#1565C0 55%,#7c3aed 130%)" }}>
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 15% 20%, #fff 0, transparent 40%), radial-gradient(circle at 85% 80%, #fff 0, transparent 35%)" }} />
      <div className="relative flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur-sm grid place-items-center shrink-0">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1 className="font-heading font-extrabold text-xl lg:text-2xl truncate">{title}</h1>
          {subtitle ? <p className="text-sky-100/85 text-xs lg:text-sm truncate">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

/* privacy footnote used across detail views */
export function PrivacyNote() {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-2.5 mt-4">
      <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
        Personal contact details (phone, email, address) are protected and not shared with merchants.
        You only see referral &amp; commission information.
      </p>
    </div>
  );
}

export function EmptyState({ title, desc }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center" data-testid="empty-state">
      <p className="font-heading font-bold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">{desc}</p>
    </div>
  );
}

export function fmtDate(s) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(s).slice(0, 10); }
}
