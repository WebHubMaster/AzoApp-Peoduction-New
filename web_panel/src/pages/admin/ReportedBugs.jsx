import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bug, RefreshCw, SearchX } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Pagination, EmptyState, ErrorState, ConfirmDialog } from "@/components/admin/ModuleKit";
import BugKpis from "@/components/admin/bugs/BugKpis";
import BugToolbar from "@/components/admin/bugs/BugToolbar";
import BugCard from "@/components/admin/bugs/BugCard";
import BugDrawer from "@/components/admin/bugs/BugDrawer";
import ResolveDialog from "@/components/admin/bugs/ResolveDialog";

const EMPTY = { status: "", role: "", category: "", q: "", range: null, sort: "newest" };

const ListSkeleton = () => (
  <div className="space-y-3" data-testid="bug-list-skeleton">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3 animate-pulse">
        <div className="h-3 w-40 rounded bg-slate-100 dark:bg-slate-800" /><div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" /><div className="flex gap-2">{[0, 1, 2].map((j) => <div key={j} className="h-6 w-20 rounded bg-slate-100 dark:bg-slate-800" />)}</div>
      </div>
    ))}
  </div>
);

export default function ReportedBugs() {
  const [f, setF] = useState(EMPTY);
  const [dq, setDq] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [resolveFor, setResolveFor] = useState(null);
  const [reopenFor, setReopenFor] = useState(null);
  const [saving, setSaving] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => { const t = setTimeout(() => setDq(f.q.trim()), 350); return () => clearTimeout(t); }, [f.q]);

  const load = useCallback(async (silent = false) => {
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const r = await api.get("/admin/bugs", { signal: ctrl.signal, params: {
        status: f.status, role: f.role, category: f.category, q: dq, sort: f.sort, page, page_size: pageSize,
        date_from: f.range?.from || "", date_to: f.range?.to || "" } });
      setData(r.data); setError(false);
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;
      setError(true);
    }
    if (abortRef.current === ctrl) { setLoading(false); setRefreshing(false); }
  }, [f.status, f.role, f.category, f.sort, f.range, dq, page, pageSize]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const set = useCallback((patch) => { setF((p) => ({ ...p, ...patch })); setPage(1); }, []);
  const clearAll = () => { setF(EMPTY); setDq(""); setPage(1); };
  const patchRow = (row) => {
    setData((d) => d && { ...d, data: d.data.map((x) => (x.id === row.id ? row : x)) });
    setDrawer((cur) => (cur?.id === row.id ? row : cur));
  };

  const confirmResolve = async (note) => {
    setSaving(true);
    try {
      const r = await api.post(`/admin/bugs/${resolveFor.id}/resolve`, { note });
      patchRow(r.data); setResolveFor(null);
      toast.success("Marked as solved — the reporter has been notified.");
      load(true);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not resolve the bug. Please try again."); }
    setSaving(false);
  };
  const confirmReopen = async () => {
    setSaving(true);
    try {
      const r = await api.post(`/admin/bugs/${reopenFor.id}/reopen`, {});
      patchRow(r.data); setReopenFor(null);
      toast.success("Bug reopened");
      load(true);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not reopen the bug."); }
    setSaving(false);
  };

  const rows = data?.data || [];
  const counts = data?.counts || {};
  const total = data?.total || 0;
  const hasFilters = JSON.stringify({ ...f, sort: "newest" }) !== JSON.stringify(EMPTY);
  const first = !data && loading;

  return (
    <div data-testid="reported-bugs-page" className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="hidden sm:flex h-11 w-11 shrink-0 rounded-xl bg-primary-700 text-white items-center justify-center shadow-sm"><Bug className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h1 data-testid="bug-page-title" className="font-heading font-extrabold text-[22px] sm:text-[24px] leading-tight tracking-tight text-slate-900 dark:text-white">Reported Bugs</h1>
            <p className="text-[13px] sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage, investigate and resolve issues reported through the Customer and Partner applications.</p>
            {data && <p data-testid="bug-header-context" className="text-xs text-slate-500 mt-2"><b className="text-slate-700 dark:text-slate-200 tabular-nums">{counts.all ?? 0}</b> total reports · <b className="text-orange-600 tabular-nums">{counts.open ?? 0}</b> open</p>}
          </div>
        </div>
        <button type="button" data-testid="bug-refresh" onClick={() => load(true)} disabled={refreshing}
          className="h-10 px-3.5 shrink-0 self-start rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh
        </button>
      </header>

      <BugKpis counts={counts} status={f.status} loading={first} onPick={(s) => set({ status: s })} />
      <BugToolbar f={f} set={set} counts={counts} catCounts={data?.category_counts || {}} onClearAll={clearAll} />

      <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
        <span data-testid="bug-result-count">{data ? <><b className="text-slate-700 dark:text-slate-200 tabular-nums">{total}</b> matching report{total === 1 ? "" : "s"}</> : " "}</span>
        {refreshing && <span className="inline-flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Updating…</span>}
      </div>

      {error && !loading ? (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900" data-testid="bug-error">
          <ErrorState title="Couldn't load bug reports" description="Please check your connection and try again." onRetry={() => load()} />
        </div>
      ) : loading ? <ListSkeleton /> : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <EmptyState icon={hasFilters ? SearchX : Bug} data-testid="bug-empty"
            title={hasFilters ? "No reports match these filters" : "No bug reports yet"}
            description={hasFilters ? "Try a different search, category or date range." : "Reports from the Customer and Partner apps will appear here."}
            action={hasFilters && <button type="button" data-testid="bug-empty-clear" onClick={clearAll} className="h-9 px-4 rounded-md bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold">Clear all filters</button>} />
        </div>
      ) : (
        <div data-testid="bug-list" className={`space-y-3 transition-opacity ${refreshing ? "opacity-70" : ""}`}>
          {rows.map((b) => <BugCard key={b.id} b={b} onOpen={setDrawer} onResolve={setResolveFor} onReopen={setReopenFor} />)}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card">
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} pageSizeOptions={[10, 20, 50, 100]} className="border-t-0" />
            <p data-testid="bug-page-indicator" className="text-center text-[11px] text-slate-400 pb-2 -mt-1">Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</p>
          </div>
        </div>
      )}

      <BugDrawer bug={drawer} onClose={() => setDrawer(null)} onResolve={setResolveFor} onReopen={setReopenFor} />
      <ResolveDialog bug={resolveFor} saving={saving} onCancel={() => setResolveFor(null)} onConfirm={confirmResolve} />
      <ConfirmDialog open={!!reopenFor} onOpenChange={(o) => !o && !saving && setReopenFor(null)} tone="primary" loading={saving}
        title="Reopen this bug?" confirmLabel="Reopen bug" onConfirm={confirmReopen}
        description={reopenFor ? `“${reopenFor.title}” will move back to Open. The previous resolution note is kept for reference.` : ""} />
    </div>
  );
}
