import { useEffect, useState } from "react";
import { Loader2, Info, Copy, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import PremiumSelect from "@/components/ui/PremiumSelect";

export const BRAND = "#0D47A1";

export const errMsg = (e, fb = "Something went wrong") => {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : Array.isArray(d) ? d.map((x) => x.msg).join(", ") : fb;
};

export const useDebounced = (v, ms = 350) => {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
};

export const fmtDate = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export const copy = (t) => { navigator.clipboard?.writeText(t); toast.success("Copied to clipboard"); };

export const Card = ({ title, subtitle, right, children, className = "", testId, pad = true }) => (
  <section data-testid={testId} className={`bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
    {(title || right) && (
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
        <div className="min-w-0"><h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>{subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}</div>
        {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
      </header>
    )}
    <div className={pad ? "p-5" : ""}>{children}</div>
  </section>
);

export const Stat = ({ label, value, hint, tone = "slate", source, testId, icon: Icon }) => {
  const tones = { slate: "text-slate-900", blue: "text-[#0D47A1]", green: "text-emerald-600", amber: "text-amber-600", red: "text-rose-600" };
  return (
    <div data-testid={testId} className="bg-white rounded-xl border border-slate-200/80 p-4 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-slate-300" />}
      </div>
      <p className={`text-2xl font-bold tabular-nums mt-1.5 ${tones[tone]}`}>{value ?? "—"}</p>
      <div className="flex items-center justify-between mt-1 gap-2">
        {hint && <p className="text-[11px] text-slate-500 truncate">{hint}</p>}
        {source && <SourceTag s={source} />}
      </div>
    </div>
  );
};

export const SourceTag = ({ s }) => {
  const m = { google: ["Google data", "bg-emerald-50 text-emerald-700 ring-emerald-200"], audit: ["Rule-based audit", "bg-amber-50 text-amber-700 ring-amber-200"],
    db: ["Stored data", "bg-slate-50 text-slate-600 ring-slate-200"] }[s] || [s, "bg-slate-50 text-slate-600 ring-slate-200"];
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 whitespace-nowrap ${m[1]}`}>{m[0]}</span>;
};

const SEV = {
  critical: "bg-rose-50 text-rose-700 ring-rose-200", high: "bg-orange-50 text-orange-700 ring-orange-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200", low: "bg-sky-50 text-sky-700 ring-sky-200",
  info: "bg-slate-50 text-slate-600 ring-slate-200", ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};
export const Sev = ({ s, children }) => <span className={`inline-flex items-center text-[10.5px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ring-1 ${SEV[s] || SEV.info}`}>{children || s}</span>;

export const Pill = ({ tone = "slate", children, testId }) => {
  const t = { slate: "bg-slate-100 text-slate-700", blue: "bg-blue-50 text-[#0D47A1]", green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700", red: "bg-rose-50 text-rose-700" }[tone];
  return <span data-testid={testId} className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${t}`}>{children}</span>;
};

export const Btn = ({ variant = "primary", size = "md", loading, children, className = "", ...p }) => {
  const v = { primary: "bg-[#0D47A1] text-white hover:bg-[#0B3C8A] shadow-sm", outline: "bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-[#0D47A1]/40 hover:text-[#0D47A1]",
    ghost: "text-slate-600 hover:bg-slate-100", danger: "bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50" }[variant];
  const s = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm" }[size];
  return (
    <button {...p} disabled={p.disabled || loading} className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-[background-color,color,box-shadow] disabled:opacity-50 disabled:cursor-not-allowed ${v} ${s} ${className}`}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{children}
    </button>
  );
};

export const inputCls = "w-full h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/20 focus:border-[#0D47A1] transition-[border-color,box-shadow]";
export const areaCls = inputCls.replace("h-9", "min-h-[84px] py-2");

export const Field = ({ label, hint, help, count, max, min, children, className = "" }) => (
  <label className={`block ${className}`}>
    <span className="flex items-center justify-between gap-2 mb-1.5">
      <span className="text-[12px] font-semibold text-slate-700 flex items-center gap-1">{label}{help && <span title={help}><Info className="h-3 w-3 text-slate-400" /></span>}</span>
      {count !== undefined && <CharCount n={count} max={max} min={min} />}
    </span>
    {children}
    {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
  </label>
);

export const CharCount = ({ n, max, min }) => {
  const tone = max && n > max ? "text-amber-600" : min && n > 0 && n < min ? "text-amber-600" : n === 0 ? "text-slate-400" : "text-emerald-600";
  return <span className={`text-[11px] font-medium tabular-nums ${tone}`}>{n}{max ? ` / ${max}` : ""}</span>;
};

export const Select = ({ value, onChange, options, placeholder, testId, className = "" }) => (
  <div className={className || "w-full"}><PremiumSelect value={value} onChange={(e) => onChange(e.target.value)} options={options} placeholder={placeholder} data-testid={testId} /></div>
);

export const Toggle = ({ checked, onChange, label, testId }) => (
  <button type="button" data-testid={testId} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-sm text-slate-700">
    <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-[#0D47A1]" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </span>{label}
  </button>
);

export const Skel = ({ className = "" }) => <div className={`animate-pulse rounded-lg bg-slate-200/70 ${className}`} />;
export const SkelGrid = ({ n = 4 }) => <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{Array.from({ length: n }).map((_, i) => <Skel key={i} className="h-[92px]" />)}</div>;
export const SkelRows = ({ n = 6 }) => <div className="space-y-2 p-4">{Array.from({ length: n }).map((_, i) => <Skel key={i} className="h-10" />)}</div>;

export const Empty = ({ title, text, testId }) => (
  <div data-testid={testId} className="py-12 text-center"><p className="text-sm font-semibold text-slate-700">{title}</p>{text && <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{text}</p>}</div>
);

export const Pager = ({ page, pages, total, onPage, pageSize, onSize, testId = "pager" }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-xs text-slate-500" data-testid={testId}>
    <span>{total} result{total === 1 ? "" : "s"}</span>
    <div className="flex items-center gap-2">
      {onSize && <select value={pageSize} onChange={(e) => onSize(Number(e.target.value))} data-testid={`${testId}-size`} className="h-8 rounded-md border border-slate-200 px-2 bg-white">{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</select>}
      <button data-testid={`${testId}-prev`} disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-8 w-8 rounded-md ring-1 ring-slate-200 flex items-center justify-center disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
      <span className="tabular-nums">Page {page} of {pages}</span>
      <button data-testid={`${testId}-next`} disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-8 w-8 rounded-md ring-1 ring-slate-200 flex items-center justify-center disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
    </div>
  </div>
);

export const CopyField = ({ value, testId }) => (
  <div className="flex items-center gap-2">
    <code data-testid={testId} className="flex-1 min-w-0 truncate text-xs bg-slate-50 ring-1 ring-slate-200 rounded-md px-2.5 py-2 text-slate-700">{value}</code>
    <Btn variant="outline" size="sm" onClick={() => copy(value)} data-testid={`${testId}-copy`}><Copy className="h-3.5 w-3.5" />Copy</Btn>
  </div>
);

export const SnippetPreview = ({ url, title, description, testId = "snippet-preview" }) => {
  let host = "", crumbs = "";
  try { const u = new URL(url); host = u.host; crumbs = u.pathname.split("/").filter(Boolean).join(" › "); } catch { host = url; }
  const t = (title || "").length > 60 ? title.slice(0, 58) + "…" : title;
  const d = (description || "").length > 160 ? description.slice(0, 157) + "…" : description;
  return (
    <div data-testid={testId} className="rounded-xl border border-slate-200 p-4 bg-white font-[arial,sans-serif]">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Search result preview</p>
      <div className="flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-slate-100 ring-1 ring-slate-200 flex items-center justify-center text-[10px] font-bold text-[#0D47A1]">{(host || "A")[0].toUpperCase()}</span>
        <div className="min-w-0 leading-tight"><p className="text-[13px] text-slate-800 truncate">{host}</p><p className="text-[12px] text-slate-500 truncate">{host}{crumbs ? ` › ${crumbs}` : ""}</p></div></div>
      <p className="text-[19px] text-[#1a0dab] mt-1.5 leading-snug hover:underline cursor-pointer">{t || <span className="text-slate-400">No title</span>}</p>
      <p className="text-[13.5px] text-[#4d5156] mt-0.5 leading-snug">{d || <span className="text-slate-400">No description — search engines will pick text from the page.</span>}</p>
    </div>
  );
};

export const SocialPreview = ({ url, title, description, image, testId = "social-preview" }) => {
  let host = ""; try { host = new URL(url).host; } catch { host = ""; }
  return (
    <div data-testid={testId} className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-4 pt-3 pb-2">Social share preview</p>
      <div className="aspect-[1.91/1] bg-slate-100 flex items-center justify-center overflow-hidden">
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-400">No share image</span>}
      </div>
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200">
        <p className="text-[11px] uppercase text-slate-500">{host}</p>
        <p className="text-sm font-semibold text-slate-900 line-clamp-1">{title}</p>
        <p className="text-xs text-slate-600 line-clamp-2">{description}</p>
      </div>
    </div>
  );
};

export const CheckRow = ({ ok, sev, title, detail, fix, testId }) => (
  <div data-testid={testId} className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
    {ok ? <CheckCircle2 className="h-4.5 w-4.5 h-[18px] w-[18px] text-emerald-500 mt-0.5 shrink-0" /> : sev === "critical" || sev === "high" ? <XCircle className="h-[18px] w-[18px] text-rose-500 mt-0.5 shrink-0" /> : <AlertTriangle className="h-[18px] w-[18px] text-amber-500 mt-0.5 shrink-0" />}
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap"><p className="text-sm font-medium text-slate-800">{title}</p>{!ok && <Sev s={sev} />}</div>
      {detail && <p className="text-xs text-slate-500 mt-0.5 break-words">{detail}</p>}
      {fix && <p className="text-xs text-[#0D47A1] mt-0.5">{fix}</p>}
    </div>
  </div>
);

export const TYPE_LABEL = { static: "Page", category: "Category", subcategory: "Subcategory", service: "Service", city: "City", city_service: "City · Service", blog: "Blog" };
