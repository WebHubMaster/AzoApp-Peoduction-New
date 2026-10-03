/* =============================================================================
   AzoApp — Premium Admin Module Kit
   A single, unified visual language shared across the Super Admin modules
   (Ratings & Reviews, Sub-Categories, Service Categories, Custom Job Requests,
   Add-on Services). Presentation-layer ONLY — no business logic lives here.
   ========================================================================== */
import React from "react";
import {
  Search, X, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight,
  Star, Pencil, Trash2, Eye, Copy, CheckCircle2, AlertTriangle, RefreshCcw,
  Inbox,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";

const cx = (...c) => c.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- PageHeader */
export const PageHeader = ({ icon: Icon, title, description, actions, children }) => (
  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
    <div className="flex items-start gap-3 min-w-0">
      {Icon && (
        <span className="hidden sm:flex h-11 w-11 shrink-0 rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 text-white items-center justify-center shadow-lg shadow-primary-700/25">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="font-heading font-extrabold text-[22px] sm:text-[24px] leading-tight tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {description && <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
      </div>
    </div>
    {(actions || children) && <div className="flex items-center gap-2 shrink-0">{actions}{children}</div>}
  </div>
);

/* ------------------------------------------------------------------- KpiCard */
export const KpiCard = ({ icon: Icon, label, value, accent = "primary", children, loading }) => {
  const tones = {
    primary: "from-primary-500/10 to-primary-600/5 text-primary-700 dark:text-primary-300 ring-primary-100 dark:ring-primary-900/40",
    amber: "from-amber-400/15 to-amber-500/5 text-amber-600 dark:text-amber-400 ring-amber-100 dark:ring-amber-900/40",
    emerald: "from-emerald-400/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400 ring-emerald-100 dark:ring-emerald-900/40",
  };
  if (loading) return <KpiSkeleton />;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-card hover:shadow-cardhover transition-all duration-200">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">{label}</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-heading font-black text-[28px] leading-none text-slate-900 dark:text-white">{value}</span>
            {children}
          </div>
        </div>
        {Icon && (
          <span className={cx("h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br flex items-center justify-center ring-1", tones[accent])}>
            <Icon className="h-5 w-5" strokeWidth={2} />
          </span>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- StarRating */
export const StarRating = ({ value = 0, size = "md", showEmpty = true }) => {
  const dims = { sm: "h-3.5 w-3.5", md: "h-4 w-4", lg: "h-5 w-5" }[size] || "h-4 w-4";
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cx(dims, i <= rounded ? "fill-amber-400 text-amber-400" : showEmpty ? "text-slate-200 dark:text-slate-700" : "hidden")} strokeWidth={1.5} />
      ))}
    </span>
  );
};

/* ------------------------------------------------------- SectionCard / Field */
export const SectionCard = ({ title, icon: Icon, description, children, className, headerRight }) => (
  <section className={cx("rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card", className)}>
    {(title || description) && (
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && <span className="mt-0.5 h-7 w-7 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0"><Icon className="h-4 w-4" /></span>}
          <div className="min-w-0">
            {title && <h3 className="font-heading font-bold text-[15px] text-slate-900 dark:text-white leading-tight">{title}</h3>}
            {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {headerRight}
      </div>
    )}
    <div className="p-5 space-y-4">{children}</div>
  </section>
);

export const Field = ({ label, required, hint, error, children, className }) => (
  <div className={className}>
    {label && (
      <label className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 mb-1.5">
        {label}{required && <span className="text-rose-500">*</span>}
      </label>
    )}
    {children}
    {error ? (
      <p className="mt-1 text-[11px] font-medium text-rose-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{error}</p>
    ) : hint ? (
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    ) : null}
  </div>
);

export const CharCounter = ({ value = "", max }) => {
  const len = String(value || "").length;
  const over = max && len > max;
  const near = max && len > max * 0.9;
  return (
    <span className={cx("text-[11px] font-semibold tabular-nums", over ? "text-rose-500" : near ? "text-amber-500" : "text-slate-400")}>
      {len}{max ? ` / ${max}` : ""}
    </span>
  );
};

/* ------------------------------------------------------------- Toolbar bits */
export const Toolbar = ({ children, className }) => (
  <div className={cx("rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card p-3 sm:p-4", className)}>{children}</div>
);

export const SearchInput = ({ value, onChange, placeholder = "Search…", className, "data-testid": testId, onClear }) => (
  <div className={cx("relative", className)}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      data-testid={testId}
      className="w-full h-[42px] pl-9 pr-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:ring-primary-200 dark:focus:ring-primary-900/50 focus:border-primary-400 focus:bg-white dark:focus:bg-slate-800"
    />
    {value ? (
      <button type="button" aria-label="Clear search" data-testid={testId ? `${testId}-clear` : undefined}
        onClick={() => (onClear ? onClear() : onChange?.({ target: { value: "" } }))}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    ) : null}
  </div>
);

/* --------------------------------------------------------------- FilterChips */
export const FilterChip = ({ label, onRemove, "data-testid": testId }) => (
  <span data-testid={testId} className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs font-semibold border border-primary-100 dark:border-primary-900/50">
    {label}
    {onRemove && (
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="h-4 w-4 rounded-full flex items-center justify-center hover:bg-primary-200/60 dark:hover:bg-primary-800/60">
        <X className="h-3 w-3" />
      </button>
    )}
  </span>
);

export const ChipBar = ({ chips = [], onClearAll, className }) => {
  if (!chips.length) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-2", className)}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Filters:</span>
      {chips.map((c) => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} data-testid={c.testId} />)}
      {onClearAll && (
        <button type="button" onClick={onClearAll} data-testid="chip-clear-all" className="text-xs font-semibold text-slate-500 hover:text-rose-500 underline underline-offset-2 transition-colors">
          Clear all
        </button>
      )}
    </div>
  );
};

/* ----------------------------------------------------------------- StatusBadge */
export const StatusBadge = ({ active, activeLabel = "Active", inactiveLabel = "Inactive", onClick }) => {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp onClick={onClick} className={cx(
      "inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-bold transition-colors",
      active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
      onClick && "hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-900/50 cursor-pointer",
    )}>
      <span className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />
      {active ? activeLabel : inactiveLabel}
    </Comp>
  );
};

export const CountBadge = ({ value = 0, label }) => (
  <span className="inline-flex flex-col items-center justify-center min-w-[2.75rem] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700">
    <span className="font-bold text-sm text-slate-700 dark:text-slate-200 leading-none tabular-nums">{value}</span>
    {label && <span className="text-[9px] uppercase tracking-wide text-slate-400 mt-0.5">{label}</span>}
  </span>
);

/* ------------------------------------------------------------ Action buttons */
const ACTION_TONES = {
  blue: "text-primary-600 hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/30",
  red: "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/30",
  slate: "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
};
export const ActionIconButton = ({ icon: Icon, tooltip, tone = "slate", onClick, "data-testid": testId }) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick} data-testid={testId} aria-label={tooltip}
          className={cx("h-9 w-9 rounded-lg flex items-center justify-center transition-colors active:scale-95", ACTION_TONES[tone])}>
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent><span className="text-xs">{tooltip}</span></TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
export const EditButton = (p) => <ActionIconButton icon={Pencil} tooltip="Edit" tone="blue" {...p} />;
export const DeleteButton = (p) => <ActionIconButton icon={Trash2} tooltip="Delete" tone="red" {...p} />;
export const ViewButton = (p) => <ActionIconButton icon={Eye} tooltip="View" tone="blue" {...p} />;
export const DuplicateButton = (p) => <ActionIconButton icon={Copy} tooltip="Duplicate" tone="slate" {...p} />;

/* ------------------------------------------------------------------- DataPanel */
export const DataPanel = ({ children, className, toolbar }) => (
  <div className={cx("rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card overflow-hidden", className)}>
    {toolbar}
    <div className="overflow-x-auto">{children}</div>
  </div>
);

export const Th = ({ children, className, align = "left" }) => (
  <th className={cx("px-4 py-3 font-bold text-[11px] uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500 whitespace-nowrap", align === "right" && "text-right", align === "center" && "text-center", align === "left" && "text-left", className)}>{children}</th>
);
export const Td = ({ children, className, align = "left" }) => (
  <td className={cx("px-4 py-3.5 align-middle", align === "right" && "text-right", align === "center" && "text-center", className)}>{children}</td>
);
export const TableHead = ({ children }) => (
  <thead className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">{children}</thead>
);
export const TableBody = ({ children }) => (
  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">{children}</tbody>
);
export const Tr = ({ children, className, ...rest }) => (
  <tr className={cx("transition-colors hover:bg-primary-50/40 dark:hover:bg-primary-900/10 group", className)} {...rest}>{children}</tr>
);

/* ------------------------------------------------------------------- Pagination */
const pageWindow = (page, totalPages) => {
  const out = [];
  const add = (v) => out.push(v);
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) add(i); return out; }
  add(1);
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) add("…l");
  for (let i = start; i <= end; i++) add(i);
  if (end < totalPages - 1) add("…r");
  add(totalPages);
  return out;
};

export const Pagination = ({ page, pageSize, total, onPage, onPageSize, pageSizeOptions = [10, 20, 50], className }) => {
  const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const win = pageWindow(page, totalPages);
  const btn = "h-9 min-w-[36px] px-2 rounded-lg text-sm font-semibold flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const ghost = "text-slate-500 hover:bg-primary-50 dark:text-slate-400 dark:hover:bg-primary-900/30 border border-slate-200 dark:border-slate-700";
  return (
    <div className={cx("flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800", className)}>
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {onPageSize && (
          <label className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} data-testid="pagination-page-size"
              className="h-8 pl-2 pr-6 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold focus:outline-none focus:ring-2 focus:ring-primary-200 cursor-pointer">
              {pageSizeOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        <span>Showing <b className="text-slate-700 dark:text-slate-200 tabular-nums">{from}–{to}</b> of <b className="text-slate-700 dark:text-slate-200 tabular-nums">{total}</b></span>
      </div>
      <div className="flex items-center gap-1" data-testid="pagination-controls">
        <button className={cx(btn, ghost)} disabled={page <= 1} onClick={() => onPage(1)} aria-label="First page"><ChevronsLeft className="h-4 w-4" /></button>
        <button className={cx(btn, ghost)} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" data-testid="pagination-prev"><ChevronLeft className="h-4 w-4" /></button>
        {win.map((p) => typeof p === "string"
          ? <span key={p} className="h-9 w-7 flex items-center justify-center text-slate-400"><MoreDots /></span>
          : <button key={p} onClick={() => onPage(p)} data-testid={`pagination-page-${p}`}
              className={cx(btn, p === page ? "bg-primary-700 text-white shadow-sm shadow-primary-700/30" : ghost)}>{p}</button>
        )}
        <button className={cx(btn, ghost)} disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page" data-testid="pagination-next"><ChevronRight className="h-4 w-4" /></button>
        <button className={cx(btn, ghost)} disabled={page >= totalPages} onClick={() => onPage(totalPages)} aria-label="Last page"><ChevronsRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};
const MoreDots = () => <span className="text-slate-400">…</span>;

/* ------------------------------------------------------------------ EmptyState */
export const EmptyState = ({ icon: Icon = Inbox, title, description, action, "data-testid": testId }) => (
  <div data-testid={testId} className="flex flex-col items-center justify-center text-center px-6 py-16">
    <span className="h-16 w-16 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 flex items-center justify-center text-slate-300 dark:text-slate-600 mb-4">
      <Icon className="h-7 w-7" strokeWidth={1.5} />
    </span>
    <h3 className="font-heading font-bold text-slate-700 dark:text-slate-200">{title}</h3>
    {description && <p className="text-sm text-slate-400 mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ---------------------------------------------------------------- ErrorState */
export const ErrorState = ({ title = "Something went wrong", description = "Unable to load data.", onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center px-6 py-16">
    <span className="h-16 w-16 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500 mb-4"><AlertTriangle className="h-7 w-7" /></span>
    <h3 className="font-heading font-bold text-slate-700 dark:text-slate-200">{title}</h3>
    <p className="text-sm text-slate-400 mt-1">{description}</p>
    {onRetry && (
      <button onClick={onRetry} className="mt-4 h-10 px-4 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm flex items-center gap-2">
        <RefreshCcw className="h-4 w-4" /> Retry
      </button>
    )}
  </div>
);

/* ------------------------------------------------------------------ Skeletons */
const shimmer = "animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg";
export const KpiSkeleton = () => (
  <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-card">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3"><div className={cx(shimmer, "h-3 w-24")} /><div className={cx(shimmer, "h-7 w-16")} /></div>
      <div className={cx(shimmer, "h-11 w-11 rounded-xl")} />
    </div>
  </div>
);
export const TableSkeleton = ({ rows = 6, cols = 5 }) => (
  <div className="p-4 space-y-3">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex items-center gap-4">
        {Array.from({ length: cols }).map((_, c) => <div key={c} className={cx(shimmer, "h-5", c === 0 ? "w-1/4" : "flex-1")} />)}
      </div>
    ))}
  </div>
);
export const CardListSkeleton = ({ count = 4 }) => (
  <div className="space-y-3 p-4">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 space-y-2">
        <div className={cx(shimmer, "h-4 w-1/3")} /><div className={cx(shimmer, "h-3 w-2/3")} /><div className={cx(shimmer, "h-3 w-1/2")} />
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------- ConfirmDialog */
export const ConfirmDialog = ({ open, onOpenChange, title = "Are you sure?", description, confirmLabel = "Confirm", cancelLabel = "Cancel", tone = "danger", onConfirm, loading }) => {
  const isDanger = tone === "danger";
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="rounded-2xl max-w-md" data-testid="confirm-dialog">
        <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
          <span className={cx("h-12 w-12 rounded-2xl flex items-center justify-center mb-2", isDanger ? "bg-rose-50 dark:bg-rose-900/20 text-rose-500" : "bg-primary-50 dark:bg-primary-900/20 text-primary-600")}>
            {isDanger ? <Trash2 className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          </span>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-left">{title}</AlertDialogTitle>
            {description && <AlertDialogDescription className="text-left">{description}</AlertDialogDescription>}
          </AlertDialogHeader>
        </div>
        <AlertDialogFooter className="mt-2">
          <button onClick={() => onOpenChange(false)} data-testid="confirm-cancel"
            className="h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} disabled={loading} data-testid="confirm-ok"
            className={cx("h-10 px-4 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-60", isDanger ? "bg-rose-600 hover:bg-rose-700" : "bg-primary-700 hover:bg-primary-800")}>
            {loading ? "Working…" : confirmLabel}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

/* ------------------------------------------------------------ Button presets */
export const PrimaryButton = ({ children, className, ...p }) => (
  <button className={cx("h-11 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98] disabled:opacity-60 shadow-sm shadow-primary-700/20", className)} {...p}>{children}</button>
);
export const SecondaryButton = ({ children, className, ...p }) => (
  <button className={cx("h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors active:scale-[0.98]", className)} {...p}>{children}</button>
);
