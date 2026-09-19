/* Shared premium primitives for Admin → People (Customers / Partners / Merchants). */
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import api, { fmt } from "@/lib/api";
import { StatValue } from "@/components/ExactHover";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, RefreshCw, X, Loader2 } from "lucide-react";
import PremiumSelect from "@/components/ui/PremiumSelect";

/* ---------- hooks ---------- */
export const useDebounce = (v, ms = 350) => {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
};
export const useIsMobile = (bp = 768) => {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < bp : false);
  useEffect(() => { const f = () => setM(window.innerWidth < bp); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, [bp]);
  return m;
};
/* Server-side paged fetcher. params object → GET url. Dedupes identical in-flight keys, caches last result per key. */
const _cache = new Map();
export const usePaged = (url, params, { enabled = true } = {}) => {
  const key = useMemo(() => url + "?" + JSON.stringify(params || {}), [url, params]);
  const [state, setState] = useState(() => ({ data: _cache.get(key) || null, loading: !_cache.has(key), error: null }));
  const seq = useRef(0);
  const load = useCallback(async (silent = false) => {
    if (!enabled || !url) return;
    const my = ++seq.current;
    setState((s) => ({ ...s, loading: !silent || !s.data, error: null }));
    try {
      const { data } = await api.get(url, { params });
      if (my !== seq.current) return;
      _cache.set(key, data);
      setState({ data, loading: false, error: null });
    } catch (e) {
      if (my !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: e?.response?.data?.detail || e.message || "Failed to load" }));
    }
  }, [url, key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setState((s) => ({ data: _cache.get(key) || null, loading: !_cache.has(key), error: null })); load(_cache.has(key)); }, [load, key]);
  return { ...state, reload: () => load(true) };
};
export const invalidatePaged = (prefix) => { for (const k of Array.from(_cache.keys())) if (k.startsWith(prefix)) _cache.delete(k); };

/* ---------- formatting ---------- */
export const money = (n) => fmt(Number(n || 0));
/* Money — currency value that abbreviates large numbers (₹10.2K) and reveals the
   exact total on hover / tap. Small values render in full. */
export const Money = ({ v, className = "" }) => <StatValue value={money(v)} className={className} />;
/* Num — same treatment for plain counts (10.2K jobs) with hover-exact. */
export const Num = ({ v, className = "" }) => <StatValue value={Number(v || 0)} className={className} />;
export const dt = (s, withTime = true) => {
  if (!s) return "—";
  const d = new Date(s); if (isNaN(d)) return String(s);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) + (withTime ? ", " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "");
};
export const rel = (s) => {
  if (!s) return "—";
  const diff = (Date.now() - new Date(s).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} d ago`;
  return dt(s, false);
};
export const initials = (n) => (n || "?").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const HUES = ["from-sky-500 to-blue-700", "from-violet-500 to-purple-700", "from-emerald-500 to-teal-700", "from-amber-500 to-orange-600", "from-rose-500 to-pink-700", "from-cyan-500 to-sky-700"];
export const hue = (s = "") => HUES[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

/* ---------- atoms ---------- */
export const Avatar = ({ name, src, size = 40, dot, className = "" }) => (
  <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
    {src ? <img src={src} alt={name} className="h-full w-full rounded-xl object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
      : <div className={`h-full w-full rounded-xl bg-gradient-to-br ${hue(name)} text-white font-bold flex items-center justify-center shadow-inner`} style={{ fontSize: size * 0.36 }}>{initials(name)}</div>}
    {dot && <span data-testid="row-unread-dot" className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />}
  </div>
);
export const RedDot = ({ className = "" }) => <span className={`inline-block h-2 w-2 rounded-full bg-red-500 ring-2 ring-red-200 dark:ring-red-900/40 ${className}`} />;

const PILL = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  online: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:ring-emerald-800",
  credited: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  reviewed: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  offline: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  pending: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800",
  submitted: "bg-amber-50 text-amber-700 ring-amber-200",
  processing: "bg-amber-50 text-amber-700 ring-amber-200",
  requested: "bg-amber-50 text-amber-700 ring-amber-200",
  searching: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:ring-sky-800",
  assigned: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  started: "bg-violet-50 text-violet-700 ring-violet-200",
  arrived_customer: "bg-violet-50 text-violet-700 ring-violet-200",
  unreviewed: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800",
  unread: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800",
  blocked: "bg-red-50 text-red-700 ring-red-200",
  suspended: "bg-red-50 text-red-700 ring-red-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  credit: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  debit: "bg-rose-50 text-rose-700 ring-rose-200",
};
export const Pill = ({ s, children, className = "", size = "sm" }) => {
  const k = String(s || "").toLowerCase();
  return <span data-testid={`pill-${k}`} className={`inline-flex items-center gap-1 rounded-full ring-1 font-semibold capitalize whitespace-nowrap ${size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]"} ${PILL[k] || "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"} ${className}`}>{children ?? k.replace(/_/g, " ") ?? "—"}</span>;
};
export const TierPill = ({ tier, label }) => {
  const c = { platinum: "from-violet-500 to-fuchsia-600", gold: "from-amber-400 to-orange-500", silver: "from-slate-400 to-slate-600", bronze: "from-orange-400 to-amber-700", new: "from-sky-400 to-blue-600" }[tier] || "from-slate-400 to-slate-600";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold text-white bg-gradient-to-r ${c} shadow-sm`}>{label || tier}</span>;
};
export const Progress = ({ v = 0, className = "" }) => (
  <div className={`flex items-center gap-2 ${className}`}><div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden min-w-[48px]"><div className={`h-full rounded-full ${v >= 80 ? "bg-emerald-500" : v >= 50 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, v)}%` }} /></div><span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 w-8 text-right">{v}%</span></div>
);

export const Card = ({ children, className = "", ...r }) => <div className={`rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200/80 dark:ring-slate-800 shadow-[0_1px_2px_rgba(15,23,42,.04),0_8px_24px_-12px_rgba(15,23,42,.12)] ${className}`} {...r}>{children}</div>;

export const KpiCard = ({ icon: Icon, label, value, sub, tone = "primary", loading }) => {
  const tones = { primary: "from-primary-600 to-primary-400 text-white", emerald: "from-emerald-500 to-teal-500 text-white", amber: "from-amber-500 to-orange-500 text-white", rose: "from-rose-500 to-pink-500 text-white", violet: "from-violet-500 to-purple-500 text-white", slate: "from-slate-600 to-slate-500 text-white", sky: "from-sky-500 to-cyan-500 text-white" };
  return (
    <Card className="p-4 flex items-center gap-3 min-w-[170px] snap-start" data-testid={`kpi-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center shadow-lg shadow-slate-900/10 shrink-0`}>{Icon && <Icon className="h-5 w-5" strokeWidth={2} />}</div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 truncate">{label}</p>
        {loading ? <div className="h-6 w-20 mt-1 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" /> : <p className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight truncate"><StatValue value={value ?? "—"} /></p>}
        {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
      </div>
    </Card>
  );
};

/* ---------- states ---------- */
export const Skeleton = ({ rows = 6, cols = 5 }) => (
  <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="skeleton">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 px-4 py-3.5">
        <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
        {Array.from({ length: cols }).map((__, j) => <div key={j} className="h-3.5 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" style={{ width: `${12 + ((i + j) % 4) * 8}%` }} />)}
      </div>
    ))}
  </div>
);
export const Empty = ({ title = "Nothing here yet", hint, icon: Icon = Inbox, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-14 px-6" data-testid="empty-state">
    <div className="h-14 w-14 rounded-2xl bg-slate-50 dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center mb-3"><Icon className="h-6 w-6 text-slate-400" /></div>
    <p className="font-semibold text-slate-700 dark:text-slate-200">{title}</p>
    {hint && <p className="text-sm text-slate-400 mt-1 max-w-sm">{hint}</p>}
    {action}
  </div>
);
export const ErrorState = ({ error, onRetry }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6" data-testid="error-state">
    <div className="h-12 w-12 rounded-2xl bg-rose-50 dark:bg-rose-900/30 flex items-center justify-center mb-3"><AlertTriangle className="h-5 w-5 text-rose-500" /></div>
    <p className="font-semibold text-slate-700 dark:text-slate-200">Unable to load</p>
    <p className="text-sm text-slate-400 mt-1">{String(error)}</p>
    {onRetry && <button onClick={onRetry} data-testid="retry-btn" className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"><RefreshCw className="h-4 w-4" />Retry</button>}
  </div>
);

/* ---------- pagination ---------- */
export const Pager = ({ page = 1, pages = 1, total = 0, pageSize = 25, onPage, onPageSize, sizes = [10, 25, 50, 100] }) => {
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  const nums = useMemo(() => {
    const s = new Set([1, pages, page - 1, page, page + 1]);
    const arr = [...s].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
    const out = []; let prev = 0;
    for (const n of arr) { if (n - prev > 1) out.push("…"); out.push(n); prev = n; }
    return out;
  }, [page, pages]);
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800" data-testid="pager">
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span data-testid="pager-summary">Showing <b className="text-slate-800 dark:text-slate-100">{from}–{to}</b> of <b className="text-slate-800 dark:text-slate-100">{total}</b></span>
        {onPageSize && <PremiumSelect data-testid="page-size" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} searchable={false} className="!w-[104px] !h-8 rounded-lg text-xs">{sizes.map((s) => <option key={s} value={s}>{s} / page</option>)}</PremiumSelect>}
      </div>
      <div className="flex items-center gap-1">
        <button data-testid="pager-prev" disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 w-9 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
        {nums.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1 text-slate-400">…</span> :
          <button key={n} data-testid={`pager-${n}`} onClick={() => onPage(n)} className={`h-9 min-w-[36px] px-2 rounded-lg text-sm font-semibold ${n === page ? "bg-primary-600 text-white shadow" : "ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"}`}>{n}</button>)}
        <button data-testid="pager-next" disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-9 w-9 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
};

/* ---------- tabs (horizontal scroll on mobile) ---------- */
export const Tabs = ({ tabs, value, onChange, counts = {}, dots = {} }) => (
  <div className="flex gap-1 overflow-x-auto lg:flex-wrap no-scrollbar -mx-1 px-1 snap-x" role="tablist" data-testid="tabs">
    {tabs.map((t) => {
      const on = value === t.key;
      return (
        <button key={t.key} role="tab" data-testid={`tab-${t.key}`} onClick={() => onChange(t.key)}
          className={`relative shrink-0 snap-start inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${on ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400"}`}>
          {t.icon && <t.icon className="h-4 w-4" />}{t.label}
          {counts[t.key] != null && <span className={`ml-0.5 px-1.5 rounded-full text-[10px] ${on ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>{counts[t.key]}</span>}
          {dots[t.key] && <RedDot className="ml-0.5" />}
        </button>
      );
    })}
  </div>
);

/* ---------- drawer: side sheet on desktop, bottom sheet on mobile ---------- */
export const Drawer = ({ open, onClose, title, subtitle, children, footer, width = 520, testId = "drawer" }) => {
  const mobile = useIsMobile();
  useEffect(() => { if (!open) return; const f = (e) => e.key === "Escape" && onClose?.(); document.addEventListener("keydown", f); document.body.style.overflow = "hidden"; return () => { document.removeEventListener("keydown", f); document.body.style.overflow = ""; }; }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90]" data-testid={testId}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-in fade-in" onClick={onClose} />
      <div className={`absolute bg-white dark:bg-slate-900 shadow-2xl flex flex-col ${mobile ? "inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl animate-in slide-in-from-bottom" : "top-0 right-0 h-full animate-in slide-in-from-right"}`} style={mobile ? {} : { width: Math.min(width, window.innerWidth - 24) }}>
        {mobile && <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0"><h3 className="font-bold text-slate-900 dark:text-white truncate">{title}</h3>{subtitle && <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>}</div>
          <button onClick={onClose} data-testid={`${testId}-close`} className="h-9 w-9 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 pb-[max(12px,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>, document.body);
};

/* ---------- key/value grid ---------- */
export const KV = ({ items, cols = 3 }) => (
  <dl className={`grid gap-x-6 gap-y-3 ${cols === 4 ? "grid-cols-2 md:grid-cols-4" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
    {items.filter((i) => i && i.v !== undefined && i.v !== null && i.v !== "").map((i) => (
      <div key={i.k} className="min-w-0"><dt className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">{i.k}</dt><dd className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words mt-0.5">{i.v}</dd></div>
    ))}
  </dl>
);

/* ---------- DataGrid: dense table on desktop, premium cards on mobile ---------- */
export const DataGrid = ({ columns, rows, loading, error, onRetry, onRow, rowKey = "id", empty, mobileCard, sort, onSort, stickyTop = 0, selectable = false, selectedIds, onToggleRow, onToggleAll }) => {
  const isSel = (r) => !!(selectedIds && selectedIds.has(r[rowKey]));
  const allSel = selectable && rows?.length > 0 && rows.every((r) => isSel(r));
  const stop = (e) => e.stopPropagation();
  const mobile = useIsMobile(900);
  if (loading && !rows?.length) return <Skeleton rows={7} cols={Math.min(6, columns.length)} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  if (!rows?.length) return empty || <Empty />;
  if (mobile) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3" data-testid="grid-cards">
        {rows.map((r) => (
          <div key={r[rowKey]} onClick={() => onRow?.(r)} className={`relative rounded-2xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-800 p-4 shadow-sm ${onRow ? "active:scale-[.99] transition cursor-pointer" : ""} ${isSel(r) ? "ring-2 ring-primary-400" : ""}`} data-testid={`card-${r[rowKey]}`}>
            {selectable && <input type="checkbox" data-testid={`select-${r[rowKey]}`} checked={isSel(r)} onClick={stop} onChange={() => onToggleRow?.(r[rowKey])} className="absolute top-3 right-3 h-4 w-4 rounded border-slate-300 text-primary-600" />}
            {mobileCard ? mobileCard(r) : (
              <div className="space-y-2">{columns.filter((c) => !c.hideMobile).map((c) => (
                <div key={c.key} className="flex items-start justify-between gap-3 text-sm"><span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold pt-0.5">{c.label}</span><span className="text-right font-medium text-slate-800 dark:text-slate-100 min-w-0">{c.render ? c.render(r) : (r[c.key] ?? "—")}</span></div>
              ))}</div>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="grid-table">
        <thead className="sticky z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur" style={{ top: stickyTop }}>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 font-semibold">
            {selectable && <th className="px-3 py-3 border-b border-slate-200 dark:border-slate-800 w-10"><input type="checkbox" data-testid="select-all" checked={allSel} onChange={() => onToggleAll?.(rows)} className="h-4 w-4 rounded border-slate-300 text-primary-600" /></th>}
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-3 whitespace-nowrap border-b border-slate-200 dark:border-slate-800 ${c.align === "right" ? "text-right" : ""} ${c.sortKey && onSort ? "cursor-pointer select-none hover:text-slate-800 dark:hover:text-white" : ""}`} onClick={() => c.sortKey && onSort && onSort(c.sortKey)} style={c.width ? { width: c.width } : undefined}>
                <span className="inline-flex items-center gap-1">{c.label}{sort && c.sortKey === sort.key && <span className="text-primary-600">{sort.order === "asc" ? "▲" : "▼"}</span>}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r[rowKey]} onClick={() => onRow?.(r)} data-testid={`row-${r[rowKey]}`} className={`group transition-colors ${onRow ? "cursor-pointer hover:bg-primary-50/40 dark:hover:bg-slate-800/60" : ""} ${isSel(r) ? "bg-primary-50/60 dark:bg-primary-900/20" : r.profile_update_unreviewed ? "bg-red-50/30 dark:bg-red-900/10" : ""}`}>
              {selectable && <td className="px-3 py-3 align-middle" onClick={stop}><input type="checkbox" data-testid={`select-${r[rowKey]}`} checked={isSel(r)} onChange={() => onToggleRow?.(r[rowKey])} className="h-4 w-4 rounded border-slate-300 text-primary-600" /></td>}
              {columns.map((c) => <td key={c.key} className={`px-4 py-3 align-middle ${c.align === "right" ? "text-right" : ""} ${c.nowrap !== false ? "whitespace-nowrap" : ""}`}>{c.render ? c.render(r) : (r[c.key] ?? "—")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />Refreshing…</div>}
    </div>
  );
};

/* ---------- toolbar bits ---------- */
export const SearchBox = ({ value, onChange, placeholder, testId = "search" }) => (
  <div className="relative flex-1 min-w-[200px]">
    <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
    <input data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-10 w-full pl-9 pr-9 rounded-xl bg-white dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 placeholder:text-slate-400" />
    {value && <button onClick={() => onChange("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>}
  </div>
);
export const Btn = ({ children, variant = "ghost", className = "", ...r }) => {
  const v = { ghost: "ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800", primary: "bg-primary-600 text-white hover:bg-primary-700 shadow-sm shadow-primary-600/30", danger: "bg-rose-600 text-white hover:bg-rose-700", soft: "bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-200" }[variant];
  return <button className={`inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${v} ${className}`} {...r}>{children}</button>;
};
export const Chip = ({ children, onRemove }) => (
  <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 text-xs font-semibold ring-1 ring-primary-100 dark:ring-primary-800">{children}{onRemove && <button onClick={onRemove} className="h-4 w-4 rounded-full hover:bg-primary-200/60 flex items-center justify-center"><X className="h-3 w-3" /></button>}</span>
);
export const Select = ({ value, onChange, options, placeholder = "All", testId, className = "" }) => {
  const opts = [{ value: "", label: placeholder }, ...(options || []).map((o) => (typeof o === "string" ? { value: o, label: o } : o))];
  return (
    <PremiumSelect data-testid={testId} value={value ?? ""} onChange={(e) => onChange(e.target.value)} options={opts} placeholder={placeholder} className={`rounded-xl ${className}`} />
  );
};
