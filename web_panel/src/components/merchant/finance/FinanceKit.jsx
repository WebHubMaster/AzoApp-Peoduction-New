import { motion, AnimatePresence } from "framer-motion";
import { StatValue } from "@/components/ExactHover";
import { X, ChevronLeft, ChevronRight, Inbox, ShieldCheck } from "lucide-react";
import PremiumSelect from "@/components/ui/PremiumSelect";

/* ── status badge system (aligned with design_guidelines.json) ── */
const BADGES = {
  verified:   { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-200/70 dark:ring-emerald-800", dot: "bg-emerald-500" },
  approved:   { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-200/70 dark:ring-emerald-800", dot: "bg-emerald-500" },
  completed:  { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-200/70 dark:ring-emerald-800", dot: "bg-emerald-500" },
  paid:       { bg: "bg-violet-50 dark:bg-violet-950/40",   text: "text-violet-700 dark:text-violet-400",   ring: "ring-violet-200/70 dark:ring-violet-800",   dot: "bg-violet-500" },
  pending:    { bg: "bg-amber-50 dark:bg-amber-950/40",     text: "text-amber-700 dark:text-amber-400",     ring: "ring-amber-200/70 dark:ring-amber-800",     dot: "bg-amber-500" },
  processing: { bg: "bg-blue-50 dark:bg-blue-950/40",       text: "text-blue-700 dark:text-blue-400",       ring: "ring-blue-200/70 dark:ring-blue-800",       dot: "bg-blue-500" },
  submitted:  { bg: "bg-blue-50 dark:bg-blue-950/40",       text: "text-blue-700 dark:text-blue-400",       ring: "ring-blue-200/70 dark:ring-blue-800",       dot: "bg-blue-500" },
  under_review:{ bg: "bg-blue-50 dark:bg-blue-950/40",      text: "text-blue-700 dark:text-blue-400",       ring: "ring-blue-200/70 dark:ring-blue-800",       dot: "bg-blue-500" },
  rejected:   { bg: "bg-rose-50 dark:bg-rose-950/40",       text: "text-rose-700 dark:text-rose-400",       ring: "ring-rose-200/70 dark:ring-rose-800",       dot: "bg-rose-500" },
  failed:     { bg: "bg-rose-50 dark:bg-rose-950/40",       text: "text-rose-700 dark:text-rose-400",       ring: "ring-rose-200/70 dark:ring-rose-800",       dot: "bg-rose-500" },
  reversed:   { bg: "bg-slate-100 dark:bg-slate-800",       text: "text-slate-600 dark:text-slate-300",     ring: "ring-slate-200 dark:ring-slate-700",        dot: "bg-slate-400" },
  action_required: { bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", ring: "ring-orange-200/70 dark:ring-orange-800", dot: "bg-orange-500" },
  default:    { bg: "bg-slate-100 dark:bg-slate-800",       text: "text-slate-600 dark:text-slate-300",     ring: "ring-slate-200 dark:ring-slate-700",        dot: "bg-slate-400" },
};

export const StatusBadge = ({ status, label, testid }) => {
  const key = (status || "").toLowerCase().replace(/\s+/g, "_") || "default";
  const s = BADGES[key] || BADGES.default;
  const text = label || (status || "not submitted").replace(/_/g, " ");
  return (
    <span data-testid={testid} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1 ${s.bg} ${s.text} ${s.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{text}
    </span>
  );
};

/* ── surface card ── */
export const Surface = ({ className = "", children, ...rest }) => (
  <div {...rest} className={`rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card ${className}`}>{children}</div>
);

/* ── KPI / summary card ── */
const TONES = {
  primary: "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400",
  amber:   "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  violet:  "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400",
  slate:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  blue:    "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
};
export const KpiCard = ({ icon: Icon, label, value, sub, trend, tone = "slate", testid }) => (
  <Surface className="p-4 sm:p-5 hover:shadow-cardhover transition-shadow duration-200" data-testid={testid}>
    <div className="flex items-start justify-between gap-2">
      {Icon && <span className={`h-10 w-10 rounded-xl grid place-items-center ${TONES[tone]}`}><Icon className="h-[18px] w-[18px]" strokeWidth={1.9} /></span>}
      {trend != null && (
        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${trend >= 0 ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40" : "text-rose-500 bg-rose-50 dark:bg-rose-950/40"}`}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</span>
      )}
    </div>
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-3">{label}</p>
    <p className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white leading-tight mt-0.5 tabular-nums truncate"><StatValue value={value} /></p>
    {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate">{sub}</p>}
  </Surface>
);

/* ── segmented tabs (scrollable on mobile) ── */
export const SegTabs = ({ tabs, value, onChange, testidPrefix = "tab" }) => (
  <div className="flex gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-x-auto no-scrollbar w-full sm:w-max">
    {tabs.map((t) => {
      const v = typeof t === "string" ? t : t.value;
      const l = typeof t === "string" ? t : t.label;
      const on = value === v;
      return (
        <button key={v} data-testid={`${testidPrefix}-${v}`} onClick={() => onChange(v)}
          className={`shrink-0 px-4 h-9 rounded-xl text-sm font-semibold capitalize transition-all ${on ? "bg-white dark:bg-slate-900 text-primary-700 dark:text-primary-300 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"}`}>
          {l}
        </button>
      );
    })}
  </div>
);

/* ── right drawer (desktop) / bottom sheet (mobile) ── */
export const DetailDrawer = ({ open, onClose, title, subtitle, children, footer, testid }) => (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-[70]" data-testid={testid}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 320 }}
          className="hidden sm:flex absolute right-0 top-0 h-full w-full max-w-[480px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex-col shadow-2xl">
          <DrawerHead title={title} subtitle={subtitle} onClose={onClose} />
          <div className="flex-1 overflow-y-auto p-5">{children}</div>
          {footer && <div className="border-t border-slate-100 dark:border-slate-800 p-4">{footer}</div>}
        </motion.div>
        <motion.div
          initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 320 }}
          className="sm:hidden absolute bottom-0 inset-x-0 max-h-[90vh] bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 mt-3" />
          <DrawerHead title={title} subtitle={subtitle} onClose={onClose} />
          <div className="flex-1 overflow-y-auto p-5 pb-24">{children}</div>
          {footer && <div className="border-t border-slate-100 dark:border-slate-800 p-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">{footer}</div>}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);
const DrawerHead = ({ title, subtitle, onClose }) => (
  <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
    <div className="min-w-0">
      <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white truncate">{title}</h3>
      {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{subtitle}</p>}
    </div>
    <button onClick={onClose} data-testid="drawer-close" className="h-8 w-8 rounded-lg grid place-items-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"><X className="h-4 w-4" /></button>
  </div>
);

/* row of key → value inside drawers */
export const KV = ({ k, v, mono, strong, testid }) => (
  <div className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
    <span className="text-sm text-slate-500 dark:text-slate-400">{k}</span>
    <span data-testid={testid} className={`text-sm text-right ${mono ? "font-mono" : ""} ${strong ? "font-bold text-slate-900 dark:text-white" : "font-medium text-slate-700 dark:text-slate-200"}`}>{v}</span>
  </div>
);

/* vertical timeline */
export const Timeline = ({ steps }) => (
  <div className="relative pl-5">
    <span className="absolute left-[7px] top-1.5 bottom-1.5 w-px bg-slate-200 dark:bg-slate-700" />
    {steps.map((s, i) => (
      <div key={i} className="relative pb-4 last:pb-0">
        <span className={`absolute -left-5 top-0.5 h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-slate-900 ${s.done ? "bg-emerald-500" : s.active ? "bg-primary-600" : "bg-slate-300 dark:bg-slate-600"}`} />
        <p className={`text-sm font-semibold ${s.done || s.active ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{s.title}</p>
        {s.time && <p className="text-[11px] text-slate-400 mt-0.5">{s.time}</p>}
      </div>
    ))}
  </div>
);

/* ── empty state ── */
export const EmptyState = ({ icon: Icon = Inbox, title, hint, action, testid }) => (
  <div className="py-14 flex flex-col items-center text-center px-6" data-testid={testid}>
    <span className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400"><Icon className="h-7 w-7" /></span>
    <p className="font-heading font-bold text-slate-800 dark:text-slate-100 mt-4">{title}</p>
    {hint && <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 max-w-xs">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ── skeletons ── */
export const Sk = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800 ${className}`} />;
export const KpiSkeletonRow = ({ n = 4, className = "grid grid-cols-2 lg:grid-cols-4 gap-3" }) => (
  <div className={className}>{Array.from({ length: n }).map((_, i) => (
    <Surface key={i} className="p-5"><Sk className="h-10 w-10 rounded-xl" /><Sk className="h-3 w-20 mt-4" /><Sk className="h-6 w-24 mt-2" /></Surface>
  ))}</div>
);
export const RowsSkeleton = ({ rows = 5 }) => (
  <div className="space-y-2">{Array.from({ length: rows }).map((_, i) => <Sk key={i} className="h-14 w-full rounded-xl" />)}</div>
);

/* ── pagination ── */
export const Paginator = ({ page, pages, total, pageSize, onPage, onPageSize }) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span data-testid="pagination-info">Showing <b className="text-slate-700 dark:text-slate-200">{from}–{to}</b> of <b className="text-slate-700 dark:text-slate-200">{total}</b></span>
        {onPageSize && (
          <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} data-testid="page-size" searchable={false}
            className="!w-[104px] !h-8 rounded-lg text-xs">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </PremiumSelect>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} data-testid="page-prev"
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 grid place-items-center disabled:opacity-40 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm inline-flex items-center gap-1"><ChevronLeft className="h-4 w-4" /></button>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 px-2 tabular-nums">{page} / {pages || 1}</span>
        <button disabled={page >= (pages || 1)} onClick={() => onPage(page + 1)} data-testid="page-next"
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 grid place-items-center disabled:opacity-40 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm inline-flex items-center gap-1"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

/* small security/trust footer */
export const SecurityNote = ({ text = "Your banking information is encrypted and securely protected. AzoApp never shares your financial details." }) => (
  <div className="flex items-start gap-3 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 p-4">
    <span className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 grid place-items-center shrink-0"><ShieldCheck className="h-[18px] w-[18px]" /></span>
    <div><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Bank-grade security</p><p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{text}</p></div>
  </div>
);

export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const shortDate = (s) => { try { return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return (s || "").slice(0, 10); } };
