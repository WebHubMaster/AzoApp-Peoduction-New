import React, { useEffect, useMemo, useState } from "react";
import { Bug, CheckCircle2, Clock, Trash2, User, Smartphone, ExternalLink, RotateCcw } from "lucide-react";
import api, { mediaSrc } from "@/lib/api";
import {
  PageHeader, KpiCard, SectionCard, SearchInput, Pagination, EmptyState,
  KpiSkeleton, CardListSkeleton,
} from "@/components/admin/ModuleKit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const fmtDate = (s) => (s ? new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const APP_LABEL = { customer: "Customer App", partner: "Partner App", merchant: "Merchant App" };

const TABS = [
  { key: "", label: "All" },
  { key: "open", label: "Open" },
  { key: "solved", label: "Solved" },
];

export default function ReportedBugs() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [resolveFor, setResolveFor] = useState(null); // bug row being resolved
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null); // screenshot url to zoom

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/bugs", { params: { status, role, q, page, page_size: pageSize } });
      setData(r.data);
    } catch { /* global handler */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, role, page, pageSize]);
  useEffect(() => { const t = setTimeout(() => { setPage(1); load(); }, 400); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [q]);

  const rows = data?.data || [];
  const counts = data?.counts || {};
  const total = data?.total || 0;

  const openResolve = (b) => { setResolveFor(b); setNote(b.resolution_note || ""); };
  const submitResolve = async () => {
    if (!resolveFor) return;
    setSaving(true);
    try {
      await api.post(`/admin/bugs/${resolveFor.id}/resolve`, { note });
      toast.success("Marked as solved — the reporter has been notified.");
      setResolveFor(null); setNote("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not update"); }
    finally { setSaving(false); }
  };
  const reopen = async (b) => {
    try { await api.post(`/admin/bugs/${b.id}/reopen`, {}); toast.success("Reopened"); load(); }
    catch { toast.error("Could not reopen"); }
  };

  const isSolved = (s) => s === "solved" || s === "closed";

  return (
    <div data-testid="reported-bugs-page" className="space-y-5">
      <PageHeader icon={Bug} title="Reported Bugs" description="Bug reports submitted from the Customer & Partner apps. Mark them solved with a note the user will see." />

      {/* KPIs */}
      {loading && !data ? <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></div> : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <KpiCard icon={Bug} label="Total Reports" value={counts.all ?? 0} accent="primary" />
          <KpiCard icon={Clock} label="Open" value={counts.open ?? 0} accent="amber" />
          <KpiCard icon={CheckCircle2} label="Solved" value={counts.solved ?? 0} accent="emerald" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {TABS.map((t) => {
            const on = status === t.key;
            const c = t.key === "" ? counts.all : t.key === "open" ? counts.open : counts.solved;
            return (
              <button key={t.key || "all"} data-testid={`bug-tab-${t.key || "all"}`} onClick={() => { setPage(1); setStatus(t.key); }}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all border ${on ? "bg-primary-600 text-white border-primary-600" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-300"}`}>
                {t.label}{c != null && <span className={`h-4 min-w-[16px] px-1 rounded-md text-[10px] font-bold flex items-center justify-center ${on ? "bg-white/25 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{c}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5">
          {[["", "All apps"], ["customer", "Customer"], ["partner", "Partner"]].map(([k, l]) => (
            <button key={k || "all"} data-testid={`bug-app-${k || "all"}`} onClick={() => { setPage(1); setRole(k); }}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-semibold transition-all border ${role === k ? "bg-slate-800 text-white border-slate-800" : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}`}>{l}</button>
          ))}
        </div>
        <div className="sm:ml-auto sm:w-72"><SearchInput value={q} onChange={setQ} placeholder="Search title, text, reporter…" data-testid="bug-search" onClear={() => setQ("")} /></div>
      </div>

      {/* List */}
      {loading ? <CardListSkeleton count={4} /> : rows.length === 0 ? (
        <EmptyState icon={Bug} title="No bug reports" description="Nothing here yet. Reports from the apps will show up here." data-testid="bug-empty" />
      ) : (
        <div className="space-y-3" data-testid="bug-list">
          {rows.map((b) => (
            <SectionCard key={b.id}>
              <div data-testid={`bug-card-${b.id}`} className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{b.title}</h3>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${isSolved(b.status) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {isSolved(b.status) ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{isSolved(b.status) ? "Solved" : "Open"}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"><Smartphone className="h-3 w-3" />{b.app_label || APP_LABEL[b.reporter_role] || "App"}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-wrap">{b.description}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 flex-wrap">
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{b.reporter_name || "—"}{b.reporter_phone ? ` · ${b.reporter_phone}` : ""}</span>
                      <span>{fmtDate(b.created_at)}</span>
                    </div>
                  </div>
                  {b.screenshot_url ? (
                    <button data-testid={`bug-shot-${b.id}`} onClick={() => setPreview(mediaSrc(b.screenshot_url))} className="shrink-0 relative group">
                      <img src={mediaSrc(b.screenshot_url)} alt="screenshot" className="h-20 w-20 rounded-lg object-cover border border-slate-200 dark:border-slate-700" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 rounded-lg transition"><ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" /></span>
                    </button>
                  ) : null}
                </div>

                {isSolved(b.status) && b.resolution_note ? (
                  <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg p-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                    <p className="text-sm text-emerald-800 dark:text-emerald-300"><span className="font-bold">Resolution: </span>{b.resolution_note}{b.resolved_by ? <span className="text-emerald-600/70"> — {b.resolved_by}</span> : null}</p>
                  </div>
                ) : null}

                <div className="flex items-center justify-end gap-2">
                  {isSolved(b.status) ? (
                    <Button data-testid={`bug-reopen-${b.id}`} variant="outline" size="sm" onClick={() => reopen(b)}><RotateCcw className="h-4 w-4 mr-1" />Reopen</Button>
                  ) : (
                    <Button data-testid={`bug-resolve-${b.id}`} size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openResolve(b)}><CheckCircle2 className="h-4 w-4 mr-1" />Mark Solved</Button>
                  )}
                </div>
              </div>
            </SectionCard>
          ))}
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} pageSizeOptions={[10, 20, 50]} />
        </div>
      )}

      {/* Resolve dialog */}
      <Dialog open={!!resolveFor} onOpenChange={(o) => { if (!o) { setResolveFor(null); setNote(""); } }}>
        <DialogContent data-testid="bug-resolve-dialog">
          <DialogHeader><DialogTitle>Mark bug as solved</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Add a short resolution note. The reporter will see this in their app.</p>
            <Textarea data-testid="bug-resolve-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="e.g. Fixed in the latest update. Please reopen the app." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveFor(null); setNote(""); }}>Cancel</Button>
            <Button data-testid="bug-resolve-confirm" className="bg-emerald-600 hover:bg-emerald-700" disabled={saving} onClick={submitResolve}>{saving ? "Saving…" : "Mark Solved & Notify"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Screenshot preview */}
      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-2xl" data-testid="bug-shot-preview">
          <DialogHeader><DialogTitle>Screenshot</DialogTitle></DialogHeader>
          {preview ? <img src={preview} alt="screenshot" className="w-full rounded-lg" /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
