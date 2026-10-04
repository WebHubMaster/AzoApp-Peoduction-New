import { useEffect, useState, useCallback, useMemo } from "react";
import { Eye, Save, Loader2, Undo2, Radio, Layers, CheckCircle2, Clock, UserRound, Search, LayoutTemplate, Plus, ArrowUpDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { setNavGuard } from "@/lib/navGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import HomeStatsControl from "@/pages/admin/HomeStatsControl";
import AddSectionPanel from "./homepage/AddSectionPanel";
import SectionCard from "./homepage/SectionCard";
import SectionDrawer from "./homepage/SectionDrawer";
import PreviewDialog from "./homepage/PreviewDialog";
import { metaOf, sectionDiff, fmtWhen } from "./homepage/meta";

const merge = (server, prev) => {
  const ids = new Set(server.map((s) => s.id));
  const kept = prev.filter((p) => ids.has(p.id));
  const keptIds = new Set(kept.map((k) => k.id));
  return [...kept, ...server.filter((s) => !keptIds.has(s.id))];
};
const SORTS = [["default", "Default order"], ["recent", "Recently updated"], ["type", "Section type"]];
const stamp = (s) => s.updated_at || s.created_at || "";

function Stat({ icon: Icon, label, value, sub, tone = "text-[#111827] dark:text-white", tid }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 px-3.5 py-3 flex items-center gap-3 min-w-0">
      <span className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800 grid place-items-center shrink-0"><Icon className="h-4 w-4 text-slate-500" /></span>
      <div className="min-w-0">
        <p className="text-[11.5px] font-medium text-[#6B7280]">{label}</p>
        <p className={`text-[15px] font-semibold truncate ${tone}`} data-testid={tid}>{value}</p>
        {sub && <p className="text-[11.5px] text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function HomepageBuilderPro() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState([]);
  const [services, setServices] = useState([]);
  const [cats, setCats] = useState([]);
  const [expanded, setExpanded] = useState(() => new Set());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("default");
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [preview, setPreview] = useState(false);
  const [leave, setLeave] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("sections");
  const [drag, setDragState] = useState({ dragId: null, overId: null });

  const load = useCallback(async (keep = true) => {
    const r = await api.get("/admin/homepage-sections");
    setRows(r.data || []);
    setDraft((prev) => (keep ? merge(r.data || [], prev) : r.data || []));
  }, []);
  useEffect(() => {
    load(false).catch(() => { setRows([]); toast.error("Could not load homepage sections"); });
    api.get("/catalog/services").then((r) => setServices(r.data || [])).catch(() => {});
    api.get("/catalog/categories").then((r) => setCats(r.data || [])).catch(() => {});
  }, [load]);

  const srvById = useMemo(() => Object.fromEntries((rows || []).map((s) => [s.id, s])), [rows]);
  const orderChanged = useMemo(() => (rows || []).map((s) => s.id).join() !== draft.map((s) => s.id).join(), [rows, draft]);
  const dirtyIds = useMemo(() => new Set(draft.filter((d) => srvById[d.id] && Object.keys(sectionDiff(srvById[d.id], d)).length).map((d) => d.id)), [draft, srvById]);
  const dirty = orderChanged || dirtyIds.size > 0;

  useEffect(() => {
    setNavGuard(dirty ? (go) => setLeave({ go }) : null);
    const onUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onUnload);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", onUnload); };
  }, [dirty]);

  const meta = () => ({ updated_at: new Date().toISOString(), updated_by: user?.name || "Super Admin" });
  const change = (id, patch) => setDraft((d) => d.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const saveAll = async () => {
    setSaving(true);
    try {
      const calls = [];
      draft.forEach((d, i) => {
        const srv = srvById[d.id]; if (!srv) return;
        const body = sectionDiff(srv, d);
        if (orderChanged && srv.order !== i) body.order = i;
        if (Object.keys(body).length) calls.push(api.put(`/admin/homepage-sections/${d.id}`, { ...body, ...meta() }));
      });
      await Promise.all(calls);
      await load(false);
      toast.success("Homepage updated successfully.");
    } catch { toast.error("Could not save all changes — please retry"); } finally { setSaving(false); }
  };
  const discard = () => { setDraft(rows || []); toast("Changes discarded"); };

  const addSection = async (add) => {
    try {
      await api.post("/admin/homepage-sections", { type: add.type, title: add.title, subtitle: add.subtitle, enabled: true, order: draft.length, config: { limit: Number(add.limit), ...(add.config || {}) }, ...meta() });
      toast.success(`${metaOf(add.type).label} added`);
      await load(); setTab("sections");
      return true;
    } catch { toast.error("Could not add section"); return false; }
  };
  const duplicate = async (s) => {
    try {
      await api.post("/admin/homepage-sections", { type: s.type, title: s.title ? `${s.title} (copy)` : "", subtitle: s.subtitle, enabled: !!s.enabled, order: draft.length, config: { ...(s.config || {}) }, ...meta() });
      toast.success("Section duplicated — added at the end"); await load();
    } catch { toast.error("Could not duplicate section"); }
  };
  const remove = async (s) => {
    try { await api.delete(`/admin/homepage-sections/${s.id}`); toast.success("Section deleted"); await load(); } catch { toast.error("Could not delete section"); }
  };
  const saveSection = async (id, f) => {
    try {
      const { data } = await api.put(`/admin/homepage-sections/${id}`, { ...f, ...meta() });
      setRows((r) => r.map((s) => (s.id === id ? { ...s, ...f, ...(data || {}) } : s)));
      change(id, f); setEditing(null);
      toast.success("Section saved");
      return true;
    } catch { toast.error("Could not save section"); return false; }
  };
  const reorder = (from, to) => {
    if (from === to || from < 0 || to < 0 || to >= draft.length) return;
    setDraft((d) => { const n = [...d]; const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
    toast.success("Homepage section order updated.", { description: "Save changes to publish the new order." });
  };

  const canDrag = !q.trim() && filter === "all" && sort === "default";
  const visible = useMemo(() => {
    let v = draft.filter((s) => (filter === "all" || (filter === "active" ? s.enabled : !s.enabled)) &&
      `${metaOf(s.type).label} ${s.title || ""} ${s.subtitle || ""}`.toLowerCase().includes(q.trim().toLowerCase()));
    if (sort === "recent") v = [...v].sort((a, b) => stamp(b).localeCompare(stamp(a)));
    if (sort === "type") v = [...v].sort((a, b) => metaOf(a.type).label.localeCompare(metaOf(b.type).label));
    return v;
  }, [draft, q, filter, sort]);
  const idx = (id) => draft.findIndex((s) => s.id === id);
  const dragApi = {
    ...drag, after: drag.dragId && drag.overId ? idx(drag.dragId) < idx(drag.overId) : false,
    start: (id) => setDragState({ dragId: id, overId: null }),
    over: (id) => setDragState((d) => (d.overId === id ? d : { ...d, overId: id })),
    end: () => setDragState({ dragId: null, overId: null }),
    drop: () => { if (drag.dragId && drag.overId) reorder(idx(drag.dragId), idx(drag.overId)); setDragState({ dragId: null, overId: null }); },
  };
  const toggleExpand = (id) => setExpanded((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const active = (rows || []).filter((s) => s.enabled).length;
  const latest = [...(rows || [])].sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
  const live = active > 0;

  const SaveBtn = ({ tid }) => (
    <Button onClick={saveAll} disabled={!dirty || saving} data-testid={tid} className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
    </Button>
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4 text-[14px]" data-testid="homepage-builder">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[24px] leading-8 font-bold tracking-tight text-[#111827] dark:text-white">Homepage Builder</h1>
            <p className="text-[13.5px] text-[#6B7280]">Manage, organize and configure the sections displayed on the AzoApp homepage.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {dirty && <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#B45309] bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md px-2.5 h-7" data-testid="hp-unsaved"><span className="h-1.5 w-1.5 rounded-full bg-[#F59E0B] animate-pulse" /> Unsaved Changes</span>}
            {dirty && <Button variant="ghost" className="h-9 text-[13.5px] text-slate-600" onClick={discard} data-testid="hp-discard"><Undo2 className="h-4 w-4" /> Reset</Button>}
            <Button variant="outline" className="h-9 text-[13.5px]" onClick={() => setPreview(true)} data-testid="hp-preview-btn"><Eye className="h-4 w-4" /> Preview Homepage</Button>
            <SaveBtn tid="hp-save" />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3" data-testid="hp-status-bar">
          <div className="col-span-2 md:col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 px-3.5 py-3 flex items-center gap-3">
            <span className={`h-8 w-8 rounded-lg grid place-items-center shrink-0 ${live ? "bg-green-50" : "bg-slate-100"}`}><Radio className={`h-4 w-4 ${live ? "text-[#16A34A]" : "text-slate-400"}`} /></span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium text-[#6B7280]">Homepage Status</p>
              <p className={`text-[15px] font-bold flex items-center gap-1.5 ${live ? "text-[#16A34A]" : "text-slate-500"}`} data-testid="hp-status"><span className={`h-2 w-2 rounded-full ${live ? "bg-[#16A34A] animate-pulse" : "bg-slate-400"}`} />{live ? "LIVE" : "OFFLINE"}</p>
              <p className="text-[11.5px] text-slate-400 truncate">{live ? "Saved changes are published to customers" : "No active sections — homepage is empty"}</p>
            </div>
          </div>
          <Stat icon={Layers} label="Sections" value={rows ? rows.length : "—"} tid="hp-stat-sections" />
          <Stat icon={CheckCircle2} label="Active Sections" value={rows ? active : "—"} tone="text-[#16A34A]" tid="hp-stat-active" />
          <Stat icon={Clock} label="Last Updated" value={fmtWhen(latest && stamp(latest))} tid="hp-stat-updated" />
          <Stat icon={UserRound} label="Modified By" value={latest?.updated_by || "—"} tid="hp-stat-by" />
        </div>

        <div className="lg:hidden inline-flex rounded-lg border border-[#E5E7EB] bg-white dark:bg-slate-900 dark:border-slate-700 p-0.5 w-full" role="tablist">
          {[["sections", `Sections (${draft.length})`], ["add", "Add Section"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`hp-tab-${k}`}
              className={`flex-1 h-9 rounded-md text-[13.5px] font-medium transition-colors ${tab === k ? "bg-[#0D47A1] text-white" : "text-slate-600 dark:text-slate-300"}`}>{l}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(290px,29%)_1fr] gap-4 items-start">
          <div className={tab === "add" ? "" : "hidden lg:block"}><AddSectionPanel onAdd={addSection} services={services} cats={cats} /></div>

          <section className={`bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 min-w-0 ${tab === "sections" ? "" : "hidden lg:block"}`} data-testid="hp-sections-panel">
            <div className="flex flex-col md:flex-row md:items-center gap-2 px-4 pt-4 pb-3">
              <div className="flex-1 min-w-0">
                <h2 className="text-[16px] font-semibold text-[#111827] dark:text-white flex items-center gap-2">Homepage Sections <span className="text-[11.5px] font-semibold text-[#0D47A1] bg-blue-50 dark:bg-blue-900/30 rounded-md px-1.5 py-0.5" data-testid="hp-count">{draft.length} Sections</span></h2>
                <p className="text-[12.5px] text-[#6B7280]">Drag, reorder and configure the sections displayed on the homepage.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="h-8 text-[13px]" onClick={() => setPreview(true)} data-testid="hp-preview-btn-2"><Eye className="h-3.5 w-3.5" /> Preview</Button>
                <Button onClick={saveAll} disabled={!dirty || saving} data-testid="hp-save-2" className="h-8 text-[13px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save Changes</Button>
              </div>
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2 px-4 pb-3 border-b border-[#F1F2F4] dark:border-slate-800">
              <div className="relative w-full md:w-[280px]">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sections..." className="h-9 pl-9 text-[13.5px] rounded-lg" data-testid="hp-search" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {[["all", "All", draft.length], ["active", "Active", draft.filter((s) => s.enabled).length], ["disabled", "Disabled", draft.filter((s) => !s.enabled).length]].map(([k, l, n]) => (
                  <button key={k} onClick={() => setFilter(k)} data-testid={`hp-filter-${k}`}
                    className={`h-8 px-3 rounded-md text-[13px] font-medium whitespace-nowrap border transition-colors ${filter === k ? "bg-[#0D47A1] border-[#0D47A1] text-white" : "bg-white dark:bg-slate-900 border-[#E5E7EB] dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300"}`}>
                    {l} <span className={`ml-0.5 text-[11.5px] tabular-nums ${filter === k ? "text-white/75" : "text-slate-400"}`}>{n}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 md:ml-auto">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" className="h-8 text-[13px]" data-testid="hp-sort"><ArrowUpDown className="h-3.5 w-3.5" /> {SORTS.find((s) => s[0] === sort)[1]}</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">{SORTS.map(([k, l]) => <DropdownMenuItem key={k} className="text-[13px]" onSelect={() => setSort(k)} data-testid={`hp-sort-${k}`}>{l}</DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" className="h-8 text-[13px] text-slate-600" data-testid="hp-expand-all"
                  onClick={() => setExpanded(expanded.size ? new Set() : new Set(draft.map((s) => s.id)))}>
                  {expanded.size ? <><ChevronsDownUp className="h-3.5 w-3.5" /> Collapse all</> : <><ChevronsUpDown className="h-3.5 w-3.5" /> Expand all</>}
                </Button>
              </div>
            </div>

            <div className="p-3 space-y-2.5" data-testid="hp-section-list">
              {!rows && [0, 1, 2, 3].map((i) => <div key={i} className="flex items-center gap-3 rounded-xl border border-[#F1F2F4] p-3"><Skeleton className="h-11 w-[72px] rounded-md" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-3 w-64" /></div><Skeleton className="h-7 w-20 rounded-full" /></div>)}
              {rows && draft.length === 0 && (
                <div className="py-14 text-center" data-testid="hp-empty">
                  <span className="mx-auto h-12 w-12 rounded-xl bg-blue-50 grid place-items-center"><LayoutTemplate className="h-6 w-6 text-[#0D47A1]" /></span>
                  <p className="mt-3 text-[15px] font-semibold text-[#111827] dark:text-white">Your homepage is empty</p>
                  <p className="text-[13px] text-[#6B7280]">Add your first section to start building the AzoApp homepage.</p>
                  <Button className="mt-4 h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={() => { setTab("add"); document.getElementById("hp-add-title")?.focus(); }} data-testid="hp-add-first"><Plus className="h-4 w-4" /> Add First Section</Button>
                </div>
              )}
              {rows && draft.length > 0 && visible.length === 0 && <p className="py-10 text-center text-[13px] text-slate-400" data-testid="hp-no-match">No sections match your search or filter.</p>}
              {!canDrag && rows && visible.length > 0 && <p className="text-[12px] text-slate-400 px-1">Reordering is available in Default order with no search or filter.</p>}
              {visible.map((s) => {
                const i = idx(s.id);
                return (
                  <SectionCard key={s.id} s={s} i={i} total={draft.length} expanded={expanded.has(s.id)} dirty={dirtyIds.has(s.id)} canDrag={canDrag} drag={dragApi}
                    services={services} cats={cats} onToggleExpand={() => toggleExpand(s.id)} onChange={(p) => change(s.id, p)}
                    onEdit={() => setEditing(s)} onPreview={() => setPreview(true)} onDuplicate={() => duplicate(s)}
                    onMove={(dir) => reorder(i, i + dir)} onDelete={() => setConfirmDel(s)} />
                );
              })}
            </div>
          </section>
        </div>

        <HomeStatsControl />

        {editing && <SectionDrawer s={editing} services={services} cats={cats} onClose={() => setEditing(null)} onSave={(f) => saveSection(editing.id, f)} />}
        {preview && <PreviewDialog dirty={dirty} onClose={() => setPreview(false)} />}

        <AlertDialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
          <AlertDialogContent className="max-w-sm" data-testid="hp-delete-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[16px]">Delete this section?</AlertDialogTitle>
              <AlertDialogDescription className="text-[13px]">&quot;{confirmDel?.title || metaOf(confirmDel?.type).label}&quot; will be removed from the homepage immediately. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-[13.5px]">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-9 text-[13.5px] bg-[#DC2626] hover:bg-[#B91C1C]" data-testid="hp-delete-confirm-btn" onClick={() => { const s = confirmDel; setConfirmDel(null); remove(s); }}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={!!leave} onOpenChange={(o) => !o && setLeave(null)}>
          <AlertDialogContent className="max-w-sm" data-testid="hp-leave-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[16px]">Unsaved changes</AlertDialogTitle>
              <AlertDialogDescription className="text-[13px]">You have unsaved homepage changes. Are you sure you want to leave?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-9 text-[13.5px]" data-testid="hp-leave-stay">Stay</AlertDialogCancel>
              <AlertDialogAction className="h-9 text-[13.5px] bg-[#DC2626] hover:bg-[#B91C1C]" data-testid="hp-leave-go" onClick={() => { const g = leave.go; setLeave(null); setNavGuard(null); g(); }}>Leave Without Saving</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
