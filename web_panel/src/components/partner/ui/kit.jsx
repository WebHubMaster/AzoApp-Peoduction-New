/**
 * AzoApp Partner — Shared Premium Design System (kit)
 * ---------------------------------------------------
 * One cohesive visual language reused by ALL 13 partner modules.
 * Brand: #0D47A1 (primary-700) · secondary #1565C0 (primary-600)
 * Fully responsive (mobile-first, app-feel) + dark mode aware.
 *
 * NOTE: presentation only — no business logic here.
 */
import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StatValue } from "@/components/ExactHover";
import { X, Inbox, ChevronRight } from "lucide-react";
import PremiumSelect from "@/components/ui/PremiumSelect";

/* -------------------------------------------------------------- primitives */

export const cx = (...c) => c.filter(Boolean).join(" ");

// Base surface card — the atomic building block for every module.
export const Surface = ({ className = "", children, as: As = "div", ...rest }) => (
  <As
    className={cx(
      "bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl shadow-card",
      className
    )}
    {...rest}
  >
    {children}
  </As>
);

// Section wrapper with optional title + action on the right.
export const Section = ({ title, subtitle, right, icon: Icon, className = "", bodyClass = "p-5", children }) => (
  <Surface className={cx("overflow-hidden", className)}>
    {(title || right) && (
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="min-w-0 flex items-center gap-2.5">
          {Icon && (
            <span className="h-8 w-8 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center shrink-0">
              <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-heading font-bold text-slate-800 dark:text-white truncate leading-tight">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
    )}
    <div className={bodyClass}>{children}</div>
  </Surface>
);

// Page header used above module content on desktop (mobile uses PanelLayout header).
export const PageHead = ({ title, subtitle, right }) => (
  <div className="flex items-end justify-between gap-3 mb-6 flex-wrap">
    <div>
      <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{title}</h1>
      {subtitle && <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{subtitle}</p>}
    </div>
    {right}
  </div>
);

/* --------------------------------------------------------- status badge sys */

const STATUS_MAP = {
  // emerald — success / positive terminal states
  completed: "emerald", paid: "emerald", verified: "emerald", approved: "emerald",
  active: "emerald", online: "emerald", success: "emerald", delivered: "emerald", resolved: "emerald",
  // amber — in-flight / attention
  pending: "amber", processing: "amber", waiting: "amber", in_progress: "amber",
  started: "amber", "waiting for partner": "amber", shipped: "amber", "order placed": "amber",
  // rose — negative / failure
  rejected: "rose", failed: "rose", cancelled: "rose", canceled: "rose",
  offline: "rose", inactive: "rose", reversed: "rose", closed: "slate",
  // blue — new / assigned
  assigned: "blue", new: "blue", open: "blue", adjusted: "blue", "arrived customer": "blue",
  "arrived shop": "blue", incomplete: "amber",
};
const TONE = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
const DOT = {
  emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500",
  blue: "bg-blue-500", slate: "bg-slate-400",
};

export const StatusBadge = ({ status, dot = true, className = "" }) => {
  const key = String(status || "").toLowerCase().replace(/_/g, " ").trim();
  const tone = TONE[STATUS_MAP[key.replace(/ /g, "_")] || STATUS_MAP[key] || "slate"];
  const dotc = DOT[STATUS_MAP[key.replace(/ /g, "_")] || STATUS_MAP[key] || "slate"];
  const label = key ? key.replace(/\b\w/g, (m) => m.toUpperCase()) : "—";
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap", tone, className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", dotc)} />}
      {label}
    </span>
  );
};

/* --------------------------------------------------------------- KPI cards */

export const Kpi = ({ label, value, icon: Icon, tone = "slate", hint, onClick }) => {
  const tones = {
    primary: "text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-900/30",
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30",
    rose: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30",
    violet: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30",
    slate: "text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800",
  };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cx(
        "text-left bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl p-4 transition-all",
        onClick && "hover:shadow-cardhover active:scale-[0.98] cursor-pointer w-full"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 leading-tight">{label}</p>
        {Icon && <span className={cx("h-8 w-8 rounded-xl flex items-center justify-center shrink-0", tones[tone])}><Icon className="h-4 w-4" strokeWidth={2} /></span>}
      </div>
      <p className="font-heading font-extrabold text-[22px] text-slate-900 dark:text-white mt-2 tabular-nums leading-none truncate"><StatValue value={value} /></p>
      {hint && <p className="text-[11px] text-slate-400 mt-1.5 truncate">{hint}</p>}
    </Comp>
  );
};

/* -------------------------------------------------------------- empty state */

export const EmptyState = ({ icon: Icon = Inbox, title, desc, action, className = "" }) => (
  <div className={cx("flex flex-col items-center justify-center text-center px-6 py-12", className)}>
    <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
      <Icon className="h-7 w-7" strokeWidth={1.75} />
    </div>
    <p className="font-heading font-bold text-slate-800 dark:text-slate-100">{title}</p>
    {desc && <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{desc}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* --------------------------------------------------------------- skeletons */

export const Skeleton = ({ className = "" }) => (
  <div className={cx("animate-pulse rounded-lg bg-slate-200/70 dark:bg-slate-800", className)} />
);
export const SkeletonKpis = ({ n = 4 }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
    {Array.from({ length: n }).map((_, i) => (
      <Surface key={i} className="p-4"><Skeleton className="h-3 w-16" /><Skeleton className="h-6 w-20 mt-3" /></Surface>
    ))}
  </div>
);
export const SkeletonList = ({ n = 4 }) => (
  <div className="space-y-3">
    {Array.from({ length: n }).map((_, i) => (
      <Surface key={i} className="p-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1"><Skeleton className="h-3.5 w-1/3" /><Skeleton className="h-3 w-1/2 mt-2" /></div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </Surface>
    ))}
  </div>
);
export const SkeletonChart = () => (
  <Surface className="p-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-40 w-full mt-4" /></Surface>
);

/* ---------------------------------------------------------- segmented tabs */

export const Segmented = ({ options, value, onChange, className = "", size = "md" }) => (
  <div className={cx("inline-flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto no-scrollbar max-w-full", className)}>
    {options.map((o) => {
      const v = o.key ?? o.value ?? o;
      const label = o.label ?? o;
      const on = v === value;
      return (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cx(
            "rounded-lg font-semibold whitespace-nowrap transition-all",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs",
            on ? "bg-white dark:bg-slate-950 text-primary-700 dark:text-primary-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
          )}
        >
          {label}
        </button>
      );
    })}
  </div>
);

/* ----------------------------------------- responsive Sheet / Drawer combo */
// Mobile: bottom sheet. Desktop (>=lg): right-side drawer.

export const Sheet = ({ open, onClose, title, children, footer, size = "md" }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  const width = size === "lg" ? "lg:max-w-xl" : size === "sm" ? "lg:max-w-sm" : "lg:max-w-md";
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          {/* Mobile bottom sheet */}
          <motion.div
            className="lg:hidden absolute bottom-0 inset-x-0 bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 max-h-[88vh] flex flex-col shadow-2xl"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
          >
            <div className="pt-3 pb-1 flex justify-center shrink-0"><div className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" /></div>
            <SheetHead title={title} onClose={onClose} />
            <div className="px-5 pb-4 overflow-y-auto">{children}</div>
            {footer && <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{footer}</div>}
          </motion.div>
          {/* Desktop right drawer */}
          <motion.div
            className={cx("hidden lg:flex flex-col absolute top-0 right-0 h-full w-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl", width)}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 34, stiffness: 320 }}
          >
            <SheetHead title={title} onClose={onClose} />
            <div className="px-6 py-4 overflow-y-auto flex-1">{children}</div>
            {footer && <div className="p-5 border-t border-slate-100 dark:border-slate-800">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
const SheetHead = ({ title, onClose }) => (
  <div className="flex items-center justify-between px-5 lg:px-6 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
    <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white truncate">{title}</h3>
    <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
      <X className="h-4.5 w-4.5" />
    </button>
  </div>
);

/* ------------------------------------------------------------- detail rows */

export const DetailRow = ({ label, value, mono, strong }) => (
  <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
    <span className="text-sm text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
    <span className={cx("text-sm text-right text-slate-800 dark:text-slate-100", mono && "font-mono", strong && "font-bold")}>{value}</span>
  </div>
);

/* ------------------------------------------------------------------ tappable list row */

export const ListRow = ({ onClick, children, className = "" }) => (
  <button
    onClick={onClick}
    className={cx(
      "w-full text-left flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
      onClick && "active:bg-slate-100 dark:active:bg-slate-800",
      className
    )}
  >
    {children}
    {onClick && <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600 shrink-0 ml-auto" />}
  </button>
);

/* ------------------------------------------------------------- pagination */

export const Pagination = ({ page, pageSize, total, onPage, onPageSize }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const win = [];
  const s = Math.max(1, Math.min(page - 1, pages - 2));
  for (let i = s; i <= Math.min(pages, s + 2); i += 1) win.push(i);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
      <p className="text-xs text-slate-400">Showing <b className="text-slate-600 dark:text-slate-300">{from}–{to}</b> of {total}</p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} searchable={false}
            className="!w-[92px] !h-8 rounded-lg text-xs">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}/page</option>)}
          </PremiumSelect>
        )}
        <div className="flex items-center gap-1">
          <PgBtn disabled={page <= 1} onClick={() => onPage(page - 1)} label="‹" />
          {win.map((p) => (
            <button key={p} onClick={() => onPage(p)}
              className={cx("h-8 min-w-8 px-2 rounded-lg text-xs font-semibold", p === page ? "bg-primary-700 text-white" : "border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")}>{p}</button>
          ))}
          <PgBtn disabled={page >= pages} onClick={() => onPage(page + 1)} label="›" />
        </div>
      </div>
    </div>
  );
};
const PgBtn = ({ disabled, onClick, label }) => (
  <button disabled={disabled} onClick={onClick}
    className={cx("h-8 w-8 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700", disabled ? "opacity-40 cursor-not-allowed" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800")}>{label}</button>
);

/* -------------------------------------------------------------- sort head */

export const SortHead = ({ label, active, dir, onClick, align = "left" }) => (
  <button onClick={onClick} className={cx("inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200", align === "right" && "flex-row-reverse")}>
    {label}
    <span className={cx("text-[9px] leading-none", active ? "text-primary-600 dark:text-primary-400" : "text-slate-300 dark:text-slate-600")}>{active ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
  </button>
);

/* --------------------------------------------------------------- toolbar */

export const Toolbar = ({ children, className = "" }) => (
  <div className={cx("flex flex-wrap items-center gap-2.5", className)}>{children}</div>
);
