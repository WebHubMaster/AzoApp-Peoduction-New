/* =====================================================================
   AzoApp Marketing — shared premium UI kit
   Consistent primitives used across Coupons / Offers / Banners /
   Loyalty / Membership. Brand primary: #0D47A1
   ===================================================================== */
import React from "react";
import { motion } from "framer-motion";
import PremiumSelect from "@/components/ui/PremiumSelect";

export const BRAND = "#0D47A1";

/* ---------------- Page header ---------------- */
export const PageHeader = ({ icon: Icon, title, subtitle, children }) => (
  <div className="flex items-start justify-between gap-4 flex-wrap">
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm"
             style={{ background: BRAND }}>
          <Icon className="h-5.5 w-5.5" style={{ width: 22, height: 22 }} />
        </div>
      )}
      <div>
        <h1 className="font-heading font-bold text-[22px] leading-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
  </div>
);

/* ---------------- KPI card ---------------- */
const TONE = {
  brand: { fg: BRAND, bg: "rgba(13,71,161,0.08)" },
  emerald: { fg: "#059669", bg: "rgba(5,150,105,0.10)" },
  amber: { fg: "#d97706", bg: "rgba(217,119,6,0.10)" },
  red: { fg: "#dc2626", bg: "rgba(220,38,38,0.10)" },
  violet: { fg: "#7c3aed", bg: "rgba(124,58,237,0.10)" },
  sky: { fg: "#0284c7", bg: "rgba(2,132,199,0.10)" },
  slate: { fg: "#475569", bg: "rgba(71,85,105,0.08)" },
};

export const KpiCard = ({ label, value, icon: Icon, tone = "brand", hint, delta }) => {
  const t = TONE[tone] || TONE.brand;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{label}</p>
        {Icon && (
          <span className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: t.bg }}>
            <Icon className="h-4 w-4" style={{ color: t.fg }} />
          </span>
        )}
      </div>
      <p className="font-heading font-extrabold text-2xl mt-2 text-slate-900 dark:text-white">{value}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        {delta != null && (
          <span className={`text-[11px] font-semibold ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
      </div>
    </motion.div>
  );
};

/* ---------------- Card / Section ---------------- */
export const Card = ({ className = "", children, ...rest }) => (
  <div className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 ${className}`} {...rest}>
    {children}
  </div>
);

export const SectionTitle = ({ icon: Icon, title, sub, right }) => (
  <div className="flex items-center justify-between gap-3 mb-4">
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4.5 w-4.5 text-slate-400" style={{ width: 18, height: 18 }} />}
      <div>
        <h3 className="font-heading font-bold text-slate-900 dark:text-white">{title}</h3>
        {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
      </div>
    </div>
    {right}
  </div>
);

/* ---------------- Form field ---------------- */
export const Field = ({ label, hint, required, children }) => (
  <div>
    {label && (
      <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 block">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
    )}
    {children}
    {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
  </div>
);

const inputCls =
  "w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 " +
  "px-3.5 h-10 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30 focus:border-[#0D47A1] transition";

export const PInput = (props) => <input {...props} className={`${inputCls} ${props.className || ""}`} />;
export const PSelect = ({ children, className = "", ...props }) => (
  <PremiumSelect {...props} className={`rounded-xl ${className}`}>{children}</PremiumSelect>
);
export const PTextarea = (props) => (
  <textarea {...props} className={`${inputCls} !h-auto py-2.5 ${props.className || ""}`} />
);

/* ---------------- Buttons ---------------- */
export const BtnPrimary = ({ children, className = "", ...rest }) => (
  <button {...rest}
    className={`inline-flex items-center justify-center gap-1.5 rounded-xl text-white text-sm font-semibold px-4 h-10 shadow-sm hover:brightness-110 active:brightness-95 disabled:opacity-60 transition ${className}`}
    style={{ background: BRAND }}>{children}</button>
);
export const BtnGhost = ({ children, className = "", ...rest }) => (
  <button {...rest}
    className={`inline-flex items-center justify-center gap-1.5 rounded-xl text-sm font-medium px-4 h-10 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${className}`}>
    {children}</button>
);

/* ---------------- Status badge ---------------- */
const BADGE = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300",
  scheduled: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300",
  expired: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/40 dark:text-slate-300",
  draft: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300",
  paused: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300",
  inactive: "bg-red-50 text-red-600 ring-red-200 dark:bg-red-500/10 dark:text-red-300",
  earned: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  redeemed: "bg-violet-50 text-violet-700 ring-violet-200",
  bonus: "bg-sky-50 text-sky-700 ring-sky-200",
  adjusted: "bg-amber-50 text-amber-700 ring-amber-200",
};
export const Badge = ({ status, children }) => {
  const cls = BADGE[(status || "").toLowerCase()] || BADGE.expired;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold capitalize px-2.5 py-1 rounded-full ring-1 ${cls}`}>
      {children || status}
    </span>
  );
};

/* ---------------- Segmented tabs ---------------- */
export const Tabs = ({ tabs, active, onChange }) => (
  <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800">
    {tabs.map(([k, label, Icon]) => (
      <button key={k} onClick={() => onChange(k)} data-testid={`tab-${k}`}
        className={`relative inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
          active === k ? "text-white shadow-sm" : "text-slate-600 dark:text-slate-300 hover:text-slate-900"}`}
        style={active === k ? { background: BRAND } : {}}>
        {Icon && <Icon className="h-4 w-4" />} {label}
      </button>
    ))}
  </div>
);

/* ---------------- Empty state ---------------- */
export const EmptyState = ({ icon: Icon, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    {Icon && (
      <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: "rgba(13,71,161,0.08)" }}>
        <Icon className="h-7 w-7" style={{ color: BRAND }} />
      </div>
    )}
    <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
    {hint && <p className="text-sm text-slate-400 mt-1 max-w-sm">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

/* ---------------- Skeleton ---------------- */
export const Skeleton = ({ rows = 5 }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-10 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
    ))}
  </div>
);

/* ---------------- Pagination ---------------- */
export const Pagination = ({ page, pageSize, total, onPage, onPageSize }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, start + 4);
  for (let i = start; i <= end; i++) nums.push(i);
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex-wrap">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Rows</span>
        <PremiumSelect value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}
          searchable={false} className="!w-[76px] !h-8 rounded-lg">
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
        </PremiumSelect>
        <span className="ml-2">Showing {from}–{to} of {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <PgBtn disabled={page <= 1} onClick={() => onPage(1)}>«</PgBtn>
        <PgBtn disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</PgBtn>
        {nums.map((n) => (
          <button key={n} onClick={() => onPage(n)}
            className={`h-8 min-w-8 px-2 rounded-lg text-xs font-semibold transition ${
              n === page ? "text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            style={n === page ? { background: BRAND } : {}}>{n}</button>
        ))}
        <PgBtn disabled={page >= pages} onClick={() => onPage(page + 1)}>›</PgBtn>
        <PgBtn disabled={page >= pages} onClick={() => onPage(pages)}>»</PgBtn>
      </div>
    </div>
  );
};
const PgBtn = ({ children, ...rest }) => (
  <button {...rest} className="h-8 min-w-8 px-2 rounded-lg text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition">{children}</button>
);

/* ---------------- Filter chips ---------------- */
export const Chips = ({ items, onRemove }) => (
  items.length ? (
    <div className="flex items-center gap-2 flex-wrap">
      {items.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1"
          style={{ background: "rgba(13,71,161,0.06)", color: BRAND, borderColor: "rgba(13,71,161,0.2)" }}>
          {c.label}
          <button onClick={() => onRemove(c.key)} className="hover:text-red-500">✕</button>
        </span>
      ))}
    </div>
  ) : null
);
