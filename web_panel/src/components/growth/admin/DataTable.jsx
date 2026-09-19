import React, { useMemo, useState } from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Download, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { cn, exportCSV, exportExcel, exportPDF, EmptyState, TableSkeleton, GhostBtn } from "./kit";
import PremiumSelect from "@/components/ui/PremiumSelect";

const PAGE_SIZES = [10, 25, 50, 100];

export default function DataTable({
  columns,
  rows = [],
  loading = false,
  error = "",
  getRowId = (r) => r.id,
  searchKeys = [],
  searchPlaceholder = "Search…",
  toolbar = null,
  toolbarRight = null,
  selectable = false,
  bulkActions = [],
  exportFilename = "export.csv",
  enableExport = true,
  emptyTitle = "No records yet",
  emptyHint = "",
  emptyIcon = Inbox,
  initialPageSize = 25,
  mobileCard = null,
  testId = "data-table",
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selected, setSelected] = useState(new Set());
  const [exportOpen, setExportOpen] = useState(false);

  const filtered = useMemo(() => {
    let data = rows;
    if (q && searchKeys.length) {
      const s = q.toLowerCase();
      data = data.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(s)));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      const val = (r) => (col?.sortValue ? col.sortValue(r) : r[sortKey]);
      data = [...data].sort((a, b) => {
        const va = val(a), vb = val(b);
        if (va == null) return 1; if (vb == null) return -1;
        if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return data;
  }, [rows, q, sortKey, sortDir, searchKeys, columns]);

  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((curPage - 1) * pageSize, curPage * pageSize);
  const start = total === 0 ? 0 : (curPage - 1) * pageSize + 1;
  const end = Math.min(curPage * pageSize, total);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(getRowId(r)));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) pageRows.forEach((r) => next.delete(getRowId(r)));
    else pageRows.forEach((r) => next.add(getRowId(r)));
    setSelected(next);
  };
  const toggleRow = (id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); };
  const clearSel = () => setSelected(new Set());
  const selectedRows = rows.filter((r) => selected.has(getRowId(r)));

  const colCount = columns.length + (selectable ? 1 : 0);

  const pageNumbers = useMemo(() => {
    const nums = []; const win = 1;
    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || (i >= curPage - win && i <= curPage + win)) nums.push(i);
      else if (nums[nums.length - 1] !== "…") nums.push("…");
    }
    return nums;
  }, [pageCount, curPage]);

  return (
    <div data-testid={testId} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      {/* toolbar */}
      <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
        {searchKeys.length > 0 && (
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input data-testid="table-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder={searchPlaceholder}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
          </div>
        )}
        {toolbar}
        <div className="ml-auto flex items-center gap-2">
          {toolbarRight}
          {enableExport && (
            <div className="relative">
              <GhostBtn icon={Download} onClick={() => setExportOpen((o) => !o)} testid="table-export">Export</GhostBtn>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
                    <ExportItem icon={FileText} label="Export CSV" onClick={() => { exportCSV(exportFilename, columns, filtered); setExportOpen(false); }} />
                    <ExportItem icon={FileSpreadsheet} label="Export Excel" onClick={() => { exportExcel(exportFilename, columns, filtered); setExportOpen(false); }} />
                    <ExportItem icon={FileType} label="Export PDF" onClick={() => { exportPDF(exportFilename.replace(/\.csv$/, ""), columns, filtered); setExportOpen(false); }} />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* bulk bar */}
      {selectable && selected.size > 0 && (
        <div className="px-4 py-2.5 bg-primary-50 dark:bg-primary-900/20 border-b border-primary-100 dark:border-primary-900/40 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">{selected.size} selected</span>
          {bulkActions.map((a) => (
            <button key={a.label} onClick={() => a.onClick(selectedRows, clearSel)}
              className="h-8 px-3 rounded-lg bg-white dark:bg-slate-900 border border-primary-200 text-xs font-semibold text-primary-700 inline-flex items-center gap-1.5 hover:bg-primary-100">
              {a.icon && <a.icon className="h-3.5 w-3.5" />} {a.label}
            </button>
          ))}
          <button onClick={clearSel} className="text-xs font-semibold text-slate-500 hover:text-slate-700 ml-auto">Clear</button>
        </div>
      )}

      {/* body */}
      {loading ? <TableSkeleton cols={Math.min(colCount, 6)} />
        : error ? <EmptyState icon={emptyIcon} title="Couldn't load data" hint={error} />
        : total === 0 ? <EmptyState icon={emptyIcon} title={q ? "No results" : emptyTitle} hint={q ? "Try adjusting your search or filters." : emptyHint} />
        : (
          <>
            {/* mobile cards */}
            {mobileCard && (
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {pageRows.map((r) => <div key={getRowId(r)} className="p-4">{mobileCard(r)}</div>)}
              </div>
            )}
            {/* table */}
            <div className={cn("overflow-x-auto", mobileCard && "hidden md:block")}>
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                  <tr className="text-left text-slate-500">
                    {selectable && (
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
                      </th>
                    )}
                    {columns.map((c) => (
                      <th key={c.key} className={cn("px-4 py-3 font-semibold whitespace-nowrap", c.align === "right" && "text-right", c.align === "center" && "text-center", c.headClassName)}>
                        {c.sortable ? (
                          <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-slate-700 dark:hover:text-slate-200">
                            {c.label}
                            {sortKey === c.key ? (sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                          </button>
                        ) : c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((r) => {
                    const id = getRowId(r);
                    return (
                      <tr key={id} className={cn("hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors", selected.has(id) && "bg-primary-50/50 dark:bg-primary-900/10")}>
                        {selectable && (
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selected.has(id)} onChange={() => toggleRow(id)} className="h-4 w-4 rounded border-slate-300 text-primary-600" />
                          </td>
                        )}
                        {columns.map((c) => (
                          <td key={c.key} className={cn("px-4 py-3 text-slate-700 dark:text-slate-200 whitespace-nowrap", c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}>
                            {c.render ? c.render(r) : (r[c.key] ?? "—")}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

      {/* pagination footer */}
      {total > 0 && (
        <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-3 sm:px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Rows per page</span>
            <PremiumSelect value={pageSize} onChange={(e) => { setPageSize(+e.target.value); setPage(1); }} searchable={false}
              className="!w-[72px] !h-8 rounded-lg text-xs">
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </PremiumSelect>
            <span className="ml-2">Showing {start}–{end} of {total}</span>
          </div>
          <div className="flex items-center gap-1">
            <PgBtn onClick={() => setPage(1)} disabled={curPage === 1}><ChevronsLeft className="h-4 w-4" /></PgBtn>
            <PgBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage === 1}><ChevronLeft className="h-4 w-4" /></PgBtn>
            {pageNumbers.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1 text-slate-400">…</span> : (
              <button key={n} onClick={() => setPage(n)} className={cn("h-8 min-w-8 px-2 rounded-lg text-xs font-semibold", n === curPage ? "bg-primary-700 text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")}>{n}</button>
            ))}
            <PgBtn onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}><ChevronRight className="h-4 w-4" /></PgBtn>
            <PgBtn onClick={() => setPage(pageCount)} disabled={curPage === pageCount}><ChevronsRight className="h-4 w-4" /></PgBtn>
          </div>
        </div>
      )}
    </div>
  );
}

const PgBtn = ({ children, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} className="h-8 w-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent">{children}</button>
);

const ExportItem = ({ icon: Icon, label, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-left">
    <Icon className="h-4 w-4 text-slate-400" /> {label}
  </button>
);
