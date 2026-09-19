import React from "react";
import PremiumSelect from "@/components/ui/PremiumSelect";

/* ------------------------------------------------------------------ helpers */
export const cn = (...a) => a.filter(Boolean).join(" ");
export const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
export const fmtNum = (n) => Number(n || 0).toLocaleString("en-IN");
export const pct = (n) => `${Number(n || 0).toFixed(1)}%`;
export const dt = (v, withTime = false) => {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
  } catch { return "—"; }
};

/* ------------------------------------------------------------------ surfaces */
export const Card = ({ children, className = "", ...rest }) => (
  <div {...rest} className={cn("rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)}>{children}</div>
);

export const SectionHeader = ({ title, subtitle, icon: Icon, right }) => (
  <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
    <div className="flex items-start gap-2.5 min-w-0">
      {Icon && <span className="h-9 w-9 shrink-0 rounded-xl bg-primary-50 dark:bg-primary-900/30 grid place-items-center text-primary-700 dark:text-primary-300"><Icon className="h-4.5 w-4.5" /></span>}
      <div className="min-w-0">
        <h3 className="font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {right}
  </div>
);

/* ------------------------------------------------------------------ KPI card */
export const KpiCard = ({ label, value, sub, icon: Icon, tone = "primary", trend }) => {
  const tones = {
    primary: "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    violet: "bg-violet-50 text-violet-600",
    rose: "bg-rose-50 text-rose-600",
    sky: "bg-sky-50 text-sky-600",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && <span className={cn("h-8 w-8 rounded-lg grid place-items-center", tones[tone] || tones.primary)}><Icon className="h-4 w-4" /></span>}
      </div>
      <p className="font-heading font-black text-2xl text-slate-900 dark:text-white mt-2 leading-none">{value}</p>
      {(sub || trend) && (
        <div className="flex items-center gap-1.5 mt-1.5">
          {trend != null && (
            <span className={cn("text-[11px] font-semibold px-1.5 py-0.5 rounded", trend >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600")}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</span>
          )}
          {sub && <span className="text-[11px] text-slate-400">{sub}</span>}
        </div>
      )}
    </Card>
  );
};

/* ------------------------------------------------------------------ form bits */
export const inp = "w-full h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-400 transition-shadow";

export const Field = ({ label, children, hint, error }) => (
  <label className="block">
    {label && <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>}
    {children}
    {error ? <span className="block text-[11px] text-rose-500 mt-1">{error}</span>
      : hint && <span className="block text-[11px] text-slate-400 mt-1">{hint}</span>}
  </label>
);

export const Input = (props) => <input {...props} className={cn(inp, props.className)} />;
export const Select = ({ children, className, ...rest }) => (
  <PremiumSelect {...rest} className={cn("rounded-xl", className)}>{children}</PremiumSelect>
);

export const Toggle = ({ checked, onChange, label, size = "md" }) => {
  const s = size === "sm" ? { w: "w-9", h: "h-5", k: "h-4 w-4", on: "left-[18px]", off: "left-0.5" }
    : { w: "w-11", h: "h-6", k: "h-5 w-5", on: "left-[22px]", off: "left-0.5" };
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 select-none">
      <span className={cn("rounded-full transition-colors relative", s.w, s.h, checked ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600")}>
        <span className={cn("absolute top-0.5 rounded-full bg-white shadow transition-all", s.k, checked ? s.on : s.off)} />
      </span>
      {label}
    </button>
  );
};

export const SaveBtn = ({ onClick, busy, children = "Save changes", testId = "growth-save", icon: Icon }) => (
  <button data-testid={testId} onClick={onClick} disabled={busy}
    className="h-11 px-6 rounded-xl bg-primary-700 hover:bg-primary-800 disabled:opacity-60 text-white font-bold inline-flex items-center gap-2 transition-colors">
    {Icon && <Icon className="h-4 w-4" />} {busy ? "Saving…" : children}
  </button>
);

export const GhostBtn = ({ onClick, children, icon: Icon, className = "", ...rest }) => (
  <button type="button" onClick={onClick} {...rest}
    className={cn("h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors", className)}>
    {Icon && <Icon className="h-4 w-4" />} {children}
  </button>
);

/* ------------------------------------------------------------------ badges */
const STATUS_TONES = {
  successful: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  claimed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  installed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "reward paid": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  available: "bg-sky-50 text-sky-700 ring-sky-200",
  active: "bg-sky-50 text-sky-700 ring-sky-200",
  scratched: "bg-violet-50 text-violet-700 ring-violet-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  expired: "bg-slate-100 text-slate-500 ring-slate-200",
  none: "bg-slate-100 text-slate-500 ring-slate-200",
};
export const StatusBadge = ({ status }) => {
  const key = String(status || "").toLowerCase();
  const tone = STATUS_TONES[key] || "bg-slate-100 text-slate-600 ring-slate-200";
  const label = String(status || "—").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset", tone)}>{label}</span>;
};

export const Pill = ({ children, tone = "slate" }) => {
  const tones = { slate: "bg-slate-100 text-slate-600", primary: "bg-primary-50 text-primary-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700" };
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold", tones[tone])}>{children}</span>;
};

/* ------------------------------------------------------------------ states */
export const EmptyState = ({ icon: Icon, title = "Nothing here yet", hint, action }) => (
  <div className="py-16 px-6 text-center">
    {Icon && <span className="mx-auto mb-3 h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400"><Icon className="h-6 w-6" /></span>}
    <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
    {hint && <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const TableSkeleton = ({ rows = 6, cols = 5 }) => (
  <div className="p-4 space-y-3 animate-pulse">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-3">
        {Array.from({ length: cols }).map((__, c) => (
          <div key={c} className={cn("h-4 rounded bg-slate-100 dark:bg-slate-800", c === 0 ? "w-1/4" : "flex-1")} />
        ))}
      </div>
    ))}
  </div>
);

/* ------------------------------------------------------------------ chips */
export const FilterChip = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-semibold">
    {label}
    <button onClick={onRemove} className="h-4 w-4 grid place-items-center rounded-full hover:bg-primary-100 dark:hover:bg-primary-800">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
    </button>
  </span>
);

/* ------------------------------------------------------------------ export */
export function exportCSV(filename, columns, rows) {
  const cols = columns.filter((c) => c.key !== "__select" && c.key !== "__actions" && c.exportable !== false);
  const head = cols.map((c) => `"${(c.label || c.key).replace(/"/g, '""')}"`).join(",");
  const body = rows.map((row) => cols.map((c) => {
    let v = c.exportValue ? c.exportValue(row) : row[c.key];
    if (v == null) v = "";
    return `"${String(v).replace(/"/g, '""')}"`;
  }).join(",")).join("\n");
  const blob = new Blob([head + "\n" + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function _visibleCols(columns) {
  return columns.filter((c) => c.key !== "__select" && c.key !== "__actions" && c.exportable !== false);
}
function _cellText(c, row) {
  let v = c.exportValue ? c.exportValue(row) : row[c.key];
  return v == null ? "" : String(v);
}

// Excel export via an HTML-table workbook (opens natively in Excel / Sheets).
export function exportExcel(filename, columns, rows) {
  const cols = _visibleCols(columns);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const thead = `<tr>${cols.map((c) => `<th style="background:#0D47A1;color:#fff;padding:6px;text-align:left">${esc(c.label || c.key)}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${cols.map((c) => `<td style="padding:6px;border:1px solid #e2e8f0">${esc(_cellText(c, r))}</td>`).join("")}</tr>`).join("");
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>${thead}${tbody}</table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.replace(/\.csv$/, "") + ".xls";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// PDF export via a styled print window (user saves as PDF).
export function exportPDF(title, columns, rows) {
  const cols = _visibleCols(columns);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const thead = `<tr>${cols.map((c) => `<th>${esc(c.label || c.key)}</th>`).join("")}</tr>`;
  const tbody = rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(_cellText(c, r))}</td>`).join("")}</tr>`).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<html><head><title>${esc(title)}</title><style>
    body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:24px;color:#0f172a}
    h1{font-size:18px;margin:0 0 12px} .meta{color:#64748b;font-size:11px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#0D47A1;color:#fff;text-align:left;padding:7px 8px}
    td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
    tr:nth-child(even) td{background:#f8fafc}
  </style></head><body><h1>${esc(title)}</h1><div class="meta">Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} rows</div><table>${thead}${tbody}</table>
  <script>window.onload=function(){window.print();}</script></body></html>`);
  w.document.close();
}
