import PremiumSelect from "@/components/ui/PremiumSelect";
import React, { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Download, Inbox, CalendarDays, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/*
  Premium reusable admin data table.
  Props:
    columns: [{ key, label, render?(row), sortable?, className? }]
    rows: array of objects
    searchKeys: array of keys used for the search box (default: all string columns)
    filters: [{ key, label, options: [{label, value}], match?(row, value) }]
    pageSize: default 10
    loading: bool
    emptyText: string
    rowKey: fn(row) -> key (default row.id)
    toolbar: extra React node rendered on the right of the toolbar (e.g. Add button)
    onExport: optional fn(rows) -> triggers CSV export button
    title: optional heading above table
    dense: bool
*/
export default function DataTable({
  columns = [], rows = [], searchKeys, filters = [], pageSize: initialPageSize = 10,
  loading = false, emptyText = "No records found", rowKey = (r) => r.id, toolbar = null,
  onRowClick, title, subtitle, searchPlaceholder = "Search…", exportName, dateKey, dateLabel = "Date",
}) {
  const [q, setQ] = useState("");
  const [filterVals, setFilterVals] = useState({});
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [range, setRange] = useState({ from: null, to: null });

  const effSearchKeys = searchKeys || columns.map((c) => c.key);

  const filtered = useMemo(() => {
    let out = rows || [];
    const term = q.trim().toLowerCase();
    if (term) {
      out = out.filter((r) => effSearchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(term)));
    }
    filters.forEach((f) => {
      const v = filterVals[f.key];
      if (v && v !== "__all__") {
        out = out.filter((r) => (f.match ? f.match(r, v) : String(r[f.key] ?? "") === v));
      }
    });
    if (dateKey && (range.from || range.to)) {
      out = out.filter((r) => {
        const raw = r[dateKey];
        if (!raw) return false;
        const d = String(raw).slice(0, 10);
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
        return true;
      });
    }
    if (sort.key) {
      out = [...out].sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key];
        if (av == null) return 1; if (bv == null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
        return String(av).localeCompare(String(bv)) * sort.dir;
      });
    }
    return out;
  }, [rows, q, filterVals, sort, effSearchKeys, filters, range, dateKey]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, pageCount);
  const start = (curPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  React.useEffect(() => { setPage(1); }, [q, filterVals, pageSize, range]);

  const toggleSort = (key) => setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });

  const exportCsv = () => {
    const head = columns.map((c) => c.label).join(",");
    const body = filtered.map((r) => columns.map((c) => {
      const val = c.exportValue ? c.exportValue(r) : (r[c.key] ?? "");
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(",")).join("\n");
    const blob = new Blob([head + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${exportName || "export"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-[0_1px_3px_rgba(15,23,42,0.04)] overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          {title && <h3 className="font-heading font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input data-testid="dt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder}
              className="h-9 pl-9 pr-3 w-full sm:w-56 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-200" />
          </div>
          {filters.map((f) => (
            <Select key={f.key} value={filterVals[f.key] || "__all__"} onValueChange={(v) => setFilterVals((p) => ({ ...p, [f.key]: v }))}>
              <SelectTrigger data-testid={`dt-filter-${f.key}`} className="h-9 w-auto min-w-[130px] text-sm"><SelectValue placeholder={f.label} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All {f.label}</SelectItem>
                {f.options.map((o) => <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          ))}
          {dateKey && <DateRangeFilter range={range} onChange={setRange} label={dateLabel} />}
          {exportName && <button onClick={exportCsv} title="Export CSV" className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1.5"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span></button>}
          {toolbar}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-left border-b border-slate-200 dark:border-slate-700">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`px-5 py-3 text-[11px] font-bold uppercase tracking-[0.06em] whitespace-nowrap ${c.className || ""}`}>
                  {c.sortable ? (
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase tracking-[0.06em] hover:text-slate-700 dark:hover:text-slate-200">
                      {c.label} <ArrowUpDown className={`h-3.5 w-3.5 ${sort.key === c.key ? "text-primary-600" : "text-slate-300"}`} />
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-t border-slate-100 dark:border-slate-700">
                {columns.map((c) => <td key={c.key} className="px-5 py-3.5"><div className="h-3.5 rounded animate-pulse bg-slate-200/80 dark:bg-slate-700/60" style={{ width: `${45 + (i * 11 % 45)}%`, minWidth: 40 }} /></td>)}
              </tr>
            ))}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-5 py-16 text-center">
                <div className="flex flex-col items-center gap-2 text-slate-400"><Inbox className="h-8 w-8" /><p className="text-sm">{emptyText}</p></div>
              </td></tr>
            )}
            {!loading && pageRows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={`group border-t border-slate-100 dark:border-slate-700 ${onRowClick ? "cursor-pointer" : ""} hover:bg-slate-50/70 dark:hover:bg-slate-700/40 transition-colors`}>
                {columns.map((c) => {
                  const isAction = !!c.key && (c.key.startsWith("_action") || c.key === "actions" || c.label === "Action" || c.label === "");
                  return (
                    <td key={c.key} className={`px-5 py-3.5 text-slate-700 dark:text-slate-200 ${isAction ? "transition-opacity duration-150 sm:opacity-60 sm:group-hover:opacity-100" : ""} ${c.tdClassName || ""}`}>
                      {c.render ? c.render(r) : (Array.isArray(r[c.key]) ? r[c.key].join(", ") : (r[c.key] ?? "—"))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Rows per page</span>
          <PremiumSelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-slate-700 dark:text-slate-200">
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </PremiumSelect>
          <span className="ml-2">{total === 0 ? 0 : start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
        </div>
        <div className="flex items-center gap-1">
          <PgBtn onClick={() => setPage(1)} disabled={curPage === 1}><ChevronsLeft className="h-4 w-4" /></PgBtn>
          <PgBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage === 1}><ChevronLeft className="h-4 w-4" /></PgBtn>
          <span className="px-3 text-sm font-medium text-slate-700 dark:text-slate-200">{curPage} / {pageCount}</span>
          <PgBtn onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}><ChevronRight className="h-4 w-4" /></PgBtn>
          <PgBtn onClick={() => setPage(pageCount)} disabled={curPage === pageCount}><ChevronsRight className="h-4 w-4" /></PgBtn>
        </div>
      </div>
    </div>
  );
}

const PgBtn = ({ children, ...props }) => (
  <button {...props} className="h-8 w-8 rounded-md border border-slate-200 dark:border-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed">{children}</button>
);

/* ---- Custom date-range filter with unique calendar (no native date input) ---- */
const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const _sow = (d) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return x; };
const DATE_PRESETS = [
  { key: "today", label: "Today", get: () => { const t = isoD(new Date()); return { from: t, to: t }; } },
  { key: "yesterday", label: "Yesterday", get: () => { const d = new Date(); d.setDate(d.getDate() - 1); const t = isoD(d); return { from: t, to: t }; } },
  { key: "7d", label: "Last 7 Days", get: () => { const s = new Date(); s.setDate(s.getDate() - 6); return { from: isoD(s), to: isoD(new Date()) }; } },
  { key: "week", label: "This Week", get: () => ({ from: isoD(_sow(new Date())), to: isoD(new Date()) }) },
  { key: "month", label: "This Month", get: () => { const n = new Date(); return { from: isoD(new Date(n.getFullYear(), n.getMonth(), 1)), to: isoD(n) }; } },
];

const DateRangeFilter = ({ range, onChange, label }) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const box = React.useRef();
  React.useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const pad = first.getDay();
    const dim = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < pad; i++) arr.push(null);
    for (let d = 1; d <= dim; d++) arr.push(new Date(view.getFullYear(), view.getMonth(), d));
    return arr;
  }, [view]);

  const pick = (d) => {
    const s = isoD(d);
    if (!range.from || (range.from && range.to)) onChange({ from: s, to: null });
    else if (s < range.from) onChange({ from: s, to: range.from });
    else onChange({ from: range.from, to: s });
  };
  const inRange = (d) => { const s = isoD(d); return range.from && range.to && s >= range.from && s <= range.to; };
  const label2 = range.from ? `${range.from.slice(5)}${range.to ? " → " + range.to.slice(5) : " …"}` : `All ${label.toLowerCase()}`;

  return (
    <div className="relative" ref={box}>
      <button data-testid="dt-daterange" onClick={() => setOpen((o) => !o)}
        className={`h-9 px-3 rounded-lg border text-sm flex items-center gap-1.5 ${range.from ? "border-primary-400 text-primary-700 bg-primary-50 dark:bg-primary-900/20" : "border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"} hover:bg-slate-50 dark:hover:bg-slate-700`}>
        <CalendarDays className="h-4 w-4" />{label2}
        {range.from && <span onClick={(e) => { e.stopPropagation(); onChange({ from: null, to: null }); }} className="ml-1 text-slate-400 hover:text-red-500"><X className="h-3.5 w-3.5" /></span>}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 w-72">
          <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-slate-100 dark:border-slate-700">
            {DATE_PRESETS.map((pr) => (
              <button key={pr.key} data-testid={`dr-preset-${pr.key}`} onClick={() => { onChange(pr.get()); setOpen(false); }}
                className="text-[11px] px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-primary-100 hover:text-primary-700 dark:hover:bg-primary-900/40">{pr.label}</button>
            ))}
          </div>
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{MON[view.getMonth()]} {view.getFullYear()}</span>
            <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="h-7 w-7 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">{DOW.map((d, i) => <div key={i} className="text-center text-[10px] font-bold text-slate-400">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const s = isoD(d);
              const isEnd = s === range.from || s === range.to;
              return (
                <button key={i} data-testid={`dr-day-${s}`} onClick={() => pick(d)}
                  className={`h-8 text-xs rounded-md transition ${isEnd ? "bg-primary-700 text-white font-semibold" : inRange(d) ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"}`}>{d.getDate()}</button>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
            <button onClick={() => onChange({ from: null, to: null })} className="text-xs text-slate-500 hover:text-slate-700">Clear</button>
            <button onClick={() => setOpen(false)} className="text-xs font-semibold text-primary-700">Done</button>
          </div>
        </div>
      )}
    </div>
  );
};
