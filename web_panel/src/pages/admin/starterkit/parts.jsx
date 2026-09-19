import PremiumSelect from "@/components/ui/PremiumSelect";
import { ChevronLeft, ChevronRight, PackageSearch, AlertTriangle, RefreshCw } from "lucide-react";

export const STATUS_META = {
  processing: { label: "Processing", cls: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  shipped: { label: "Shipped", cls: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
  out_for_delivery: { label: "Out for Delivery", cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  delivered: { label: "Delivered", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
};
export const STATUS_ORDER = ["processing", "shipped", "out_for_delivery", "delivered"];

export const METHOD_LABEL = { mock: "Mock / Dev", razorpay: "Razorpay", free: "Free", cashfree: "Cashfree", juspay: "Juspay", easebuzz: "Easebuzz", gateway: "Gateway" };
export const methodLabel = (m) => METHOD_LABEL[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : "—");

export const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN")}`;
export const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtShort = (ymdStr) => {
  if (!ymdStr) return "";
  const [y, m, d] = ymdStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
};
export const initials = (name) => (name || "P").trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "P";

export function StatCard({ label, value, hint, icon: Icon, tone = "primary", testId }) {
  const tones = {
    primary: "bg-primary-50 text-primary-700",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div data-testid={testId} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(13,71,161,0.15)] transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_32px_-12px_rgba(13,71,161,0.25)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-400">{label}</p>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      </div>
      <p className="mt-2 font-heading font-extrabold text-2xl sm:text-[28px] leading-none text-slate-900 tabular-nums truncate" data-testid={testId ? `${testId}-value` : undefined}>{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function StatusBadge({ status, className = "" }) {
  const m = STATUS_META[status] || STATUS_META.processing;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ring-1 ${m.cls} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
    </span>
  );
}

export function Avatar({ name, size = "h-9 w-9 text-xs" }) {
  return (
    <div className={`${size} rounded-full bg-primary-50 text-primary-700 font-bold flex items-center justify-center ring-1 ring-primary-100 shrink-0`}>
      {initials(name)}
    </div>
  );
}

export function EmptyState({ title, subtitle, testId }) {
  return (
    <div className="py-14 flex flex-col items-center text-center" data-testid={testId}>
      <div className="h-14 w-14 rounded-2xl bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center text-slate-400 mb-4">
        <PackageSearch className="h-7 w-7" />
      </div>
      <p className="font-heading font-bold text-slate-800">{title}</p>
      <p className="text-sm text-slate-500 mt-1 max-w-xs">{subtitle}</p>
    </div>
  );
}

export function ErrorState({ onRetry }) {
  return (
    <div className="py-14 flex flex-col items-center text-center" data-testid="sk-error">
      <div className="h-14 w-14 rounded-2xl bg-rose-50 ring-1 ring-rose-200 flex items-center justify-center text-rose-500 mb-4">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <p className="font-heading font-bold text-slate-800">Could not load purchases</p>
      <p className="text-sm text-slate-500 mt-1">Please check your connection and try again.</p>
      <button onClick={onRetry} data-testid="sk-retry" className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary-700 text-white text-sm font-semibold hover:bg-primary-800">
        <RefreshCw className="h-4 w-4" /> Retry
      </button>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="space-y-2 p-4" data-testid="sk-loading">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-14 rounded-xl bg-slate-100 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

export function Pagination({ page, totalPages, pageSize, total, onPage, onPageSize }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = [];
  const lo = Math.max(1, page - 2), hi = Math.min(totalPages, page + 2);
  for (let i = lo; i <= hi; i++) pages.push(i);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-100" data-testid="sk-pagination">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span data-testid="sk-showing">Showing <b className="text-slate-800">{start}–{end}</b> of <b className="text-slate-800">{total}</b> purchase{total === 1 ? "" : "s"}</span>
        <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} data-testid="sk-page-size" searchable={false}
          className="!h-8 !w-[104px] rounded-lg text-xs">
          {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
        </PremiumSelect>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="sk-prev"
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary-300 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {lo > 1 && <span className="px-1 text-slate-400 text-xs">…</span>}
          {pages.map((p) => (
            <button key={p} onClick={() => onPage(p)} data-testid={`sk-page-${p}`}
              className={`h-8 min-w-8 px-2 rounded-lg text-sm font-semibold transition-colors ${p === page ? "bg-primary-700 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-primary-300"}`}>{p}</button>
          ))}
          {hi < totalPages && <span className="px-1 text-slate-400 text-xs">…</span>}
          <button disabled={page >= totalPages} onClick={() => onPage(page + 1)} data-testid="sk-next"
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:border-primary-300 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
