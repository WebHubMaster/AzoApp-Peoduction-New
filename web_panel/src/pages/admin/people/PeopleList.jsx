import PremiumSelect from "@/components/ui/PremiumSelect";
/* PeopleList — enterprise list page for Customers / Partners / Merchants.
   Server-side search, filters, sort & pagination. Tabs: All · Profile Updates. */
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { SlidersHorizontal, ArrowUpDown, RefreshCw, Download, Sparkles, CheckCheck, Eye, Bell, Clock, UserRound, Crown, Trash2, RotateCcw } from "lucide-react";
import { ROLE_CONFIG } from "./config";
import RangeCalendar, { rangeLabel } from "./RangeCalendar";
import { usePaged, useDebounce, invalidatePaged, KpiCard, Card, DataGrid, Pager, Tabs, Drawer, SearchBox, Btn, Chip, Select, Pill, Avatar, Empty, ErrorState, Skeleton, dt, rel, useIsMobile } from "./ui";

const DEFAULT = { page: 1, page_size: 25, sort: "priority", order: "desc" };

/* ---------------- Filter drawer (config-driven) ---------------- */
const FilterDrawer = ({ open, onClose, fields, value, onApply }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Drawer open={open} onClose={onClose} title="Advanced filters" subtitle="Narrow the list — filters persist across pages" testId="filter-drawer" width={440}
      footer={<div className="flex items-center justify-between gap-2"><Btn onClick={() => { setDraft({}); }} data-testid="filter-reset">Reset</Btn><div className="flex gap-2"><Btn onClick={onClose}>Cancel</Btn><Btn variant="primary" data-testid="filter-apply" onClick={() => { onApply(draft); onClose(); }}>Apply filters</Btn></div></div>}>
      <div className="space-y-5">
        {fields.map((f) => (
          <div key={f.label}>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-1.5">{f.label}</p>
            {f.type === "select" && <Select testId={`filter-${f.key}`} value={draft[f.key] || ""} onChange={(v) => set(f.key, v)} options={f.options} className="w-full" />}
            {f.type === "range" && <div className="flex items-center gap-2">
              <input data-testid={`filter-${f.min}`} type="number" inputMode="decimal" placeholder={`${f.prefix}Min`} value={draft[f.min] ?? ""} onChange={(e) => set(f.min, e.target.value)} className="h-10 flex-1 min-w-0 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" />
              {f.max && <><span className="text-slate-300">–</span><input data-testid={`filter-${f.max}`} type="number" inputMode="decimal" placeholder={`${f.prefix}Max`} value={draft[f.max] ?? ""} onChange={(e) => set(f.max, e.target.value)} className="h-10 flex-1 min-w-0 rounded-xl ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-900 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300" /></>}
            </div>}
            {f.type === "date" && <RangeCalendar testId={`filter-${f.from}`} label={f.label} className="w-full justify-start" value={{ from: draft[f.from] || "", to: draft[f.to] || "" }} onChange={(r) => setDraft((d) => ({ ...d, [f.from]: r.from, [f.to]: r.to }))} />}
          </div>
        ))}
      </div>
    </Drawer>
  );
};

/* ---------------- Profile Updates tab ---------------- */
const CHANGE_SUB = ["all", "unread", "reviewed"];
export const ProfileUpdates = ({ role, onOpenUser, onChanged, showRole = false }) => {
  const [status, setStatus] = useState("unread");
  const [q, setQ] = useState(""); const dq = useDebounce(q);
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(null);
  const params = useMemo(() => ({ status, q: dq, date_from: range.from, date_to: range.to, page, page_size: pageSize }), [status, dq, range, page, pageSize]);
  useEffect(() => { setPage(1); }, [status, dq, range.from, range.to]);
  const url = role ? `/admin/people/${role}/profile-updates` : "/admin/people/profile-updates";
  const { data, loading, error, reload } = usePaged(url, params);
  const s = data?.summary || {};
  const refresh = () => { invalidatePaged("/admin/people"); reload(); onChanged?.(); };
  const review = async (id) => { try { await api.post(`/admin/people/profile-updates/${id}/review`); toast.success("Marked as reviewed"); refresh(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const reviewAll = async () => { try { const { data: r } = await api.post(role ? `/admin/people/${role}/profile-updates/review-all` : "/admin/people/profile-updates/review-all", {}); toast.success(`${r.reviewed} update(s) reviewed`); refresh(); } catch (e) { toast.error("Failed"); } };
  const mobile = useIsMobile(900);
  return (
    <div className="space-y-4" data-testid="profile-updates">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[["Unread", s.unread, "rose", Bell], ["Today", s.today, "sky", Clock], ["This week", s.week, "violet", Sparkles], ["All changes", s.all, "slate", UserRound]].map(([l, v, t, I]) => <KpiCard key={l} icon={I} label={l} value={v} tone={t} loading={loading && !data} />)}
      </div>
      <Card>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 border-b border-slate-100 dark:border-slate-800">
          <Tabs tabs={CHANGE_SUB.map((k) => ({ key: k, label: k === "all" ? "All changes" : k[0].toUpperCase() + k.slice(1) }))} value={status} onChange={setStatus} counts={{ unread: s.unread, reviewed: s.reviewed, all: s.all }} />
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={setQ} placeholder="Search user, code, phone or changed field…" testId="pu-search" />
            <RangeCalendar value={range} onChange={setRange} label="Changed date" testId="pu-date" align="right" />
            <Btn onClick={reviewAll} disabled={!s.unread} variant="soft" data-testid="review-all-btn"><CheckCheck className="h-4 w-4" />Mark all reviewed</Btn>
          </div>
        </div>
        {loading && !data ? <Skeleton rows={6} cols={4} /> : error ? <ErrorState error={error} onRetry={reload} /> : !data?.items?.length ? <Empty icon={Bell} title="No profile updates yet" hint="When a user edits their profile, the change will appear here for review." /> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.items.map((c) => (
              <li key={c.id} data-testid={`pu-row-${c.id}`} className={`flex flex-col md:flex-row md:items-center gap-3 px-4 py-3.5 ${!c.reviewed ? "bg-red-50/30 dark:bg-red-900/10" : ""}`}>
                <div className="flex items-center gap-3 min-w-0 md:w-[280px] shrink-0 cursor-pointer" onClick={() => onOpenUser?.({ id: c.user_id, role: c.role })}>
                  <Avatar name={c.user_name || c.shop_name} src={c.user_photo} size={40} dot={!c.reviewed} />
                  <div className="min-w-0"><p className="font-semibold text-slate-900 dark:text-white truncate hover:text-primary-700">{c.user_name || c.shop_name || "—"}</p>
                    <p className="text-[11px] text-slate-400 truncate">{showRole && <span className="capitalize font-semibold text-slate-500 mr-1">{c.role} ·</span>}{c.user_code || c.user_phone}</p></div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.summary}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(c.changes || []).slice(0, mobile ? 2 : 4).map((ch, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        <b className="text-slate-700 dark:text-slate-200">{ch.label}</b>
                        {ch.masked ? <span className="italic text-slate-400">· sensitive (masked)</span> : (ch.old || ch.new) ? <>{ch.old && <span className="line-through text-slate-400 max-w-[120px] truncate">{ch.old}</span>}{ch.new && <span className="text-emerald-700 dark:text-emerald-300 max-w-[140px] truncate">→ {ch.new}</span>}</> : null}
                      </span>))}
                    {(c.changes || []).length > (mobile ? 2 : 4) && <button onClick={() => setSelected(c)} className="text-[11px] text-primary-700 font-semibold">+{c.changes.length - (mobile ? 2 : 4)} more</button>}
                  </div>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 md:w-[300px]">
                  <div className="text-right text-xs whitespace-nowrap"><p className="text-slate-700 dark:text-slate-200 font-medium">{dt(c.changed_at)}</p><p className="text-slate-400">{rel(c.changed_at)} · via {c.updated_from}</p></div>
                  <Pill s={c.reviewed ? "reviewed" : "unread"} />
                  <div className="flex gap-1">
                    <button onClick={() => setSelected(c)} title="Details" data-testid={`pu-view-${c.id}`} className="h-9 w-9 rounded-lg ring-1 ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center"><Eye className="h-4 w-4" /></button>
                    {!c.reviewed && <button onClick={() => review(c.id)} title="Mark as reviewed" data-testid={`pu-review-${c.id}`} className="h-9 px-3 rounded-lg bg-primary-600 text-white text-xs font-bold hover:bg-primary-700">Review</button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onPageSize={(s2) => { setPageSize(s2); setPage(1); }} />}
      </Card>
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Profile change details" subtitle={selected ? `${selected.user_name} · ${dt(selected.changed_at)}` : ""} testId="pu-detail"
        footer={selected && <div className="flex justify-between gap-2"><Btn onClick={() => { onOpenUser?.({ id: selected.user_id, role: selected.role }); setSelected(null); }}>Open profile</Btn>{!selected.reviewed && <Btn variant="primary" onClick={() => { review(selected.id); setSelected(null); }}>Mark as reviewed</Btn>}</div>}>
        {selected && <div className="space-y-4">
          <div className="flex items-center gap-3"><Avatar name={selected.user_name} src={selected.user_photo} size={48} /><div><p className="font-bold">{selected.user_name}</p><p className="text-xs text-slate-400 capitalize">{selected.role} · {selected.user_code || selected.user_phone}</p></div><Pill s={selected.reviewed ? "reviewed" : "unread"} className="ml-auto" /></div>
          <div className="rounded-xl ring-1 ring-slate-200 dark:ring-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {selected.changes.map((ch, i) => (
              <div key={i} className="p-3"><p className="text-xs font-bold text-slate-700 dark:text-slate-200">{ch.label}</p>
                {ch.masked ? <p className="text-xs text-slate-400 italic mt-1">Sensitive field — values are not displayed.</p> : (
                  <div className="grid grid-cols-2 gap-3 mt-1.5 text-sm"><div><p className="text-[10px] uppercase text-slate-400 font-semibold">Previous</p><p className="text-slate-500 break-words">{ch.old ?? <span className="italic text-slate-300">not set</span>}</p></div><div><p className="text-[10px] uppercase text-slate-400 font-semibold">New</p><p className="text-emerald-700 dark:text-emerald-300 font-medium break-words">{ch.new ?? <span className="italic text-slate-300">cleared</span>}</p></div></div>)}
              </div>))}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">Changed</dt><dd className="font-medium">{dt(selected.changed_at)}</dd></div><div><dt className="text-slate-400">Updated from</dt><dd className="font-medium capitalize">{selected.updated_from} · {selected.section}</dd></div>{selected.reviewed && <><div><dt className="text-slate-400">Reviewed by</dt><dd className="font-medium">{selected.reviewed_by_name || "Admin"}</dd></div><div><dt className="text-slate-400">Reviewed at</dt><dd className="font-medium">{dt(selected.reviewed_at)}</dd></div></>}</dl>
        </div>}
      </Drawer>
    </div>
  );
};

/* ---------------- Main list ---------------- */
export default function PeopleList({ role, onView, onCountsChanged, pro = false }) {
  const cfg = ROLE_CONFIG[role];
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState(""); const dq = useDebounce(q);
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState({ key: "priority", order: "desc" });
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);
  const [drawer, setDrawer] = useState(false);
  const [facets, setFacets] = useState({});
  const mobile = useIsMobile(900);
  useEffect(() => { api.get(`/admin/people/${role}/facets`).then((r) => setFacets(r.data || {})).catch(() => {}); }, [role]);
  useEffect(() => { setPage(1); }, [dq, filters, sort.key, sort.order, pageSize, tab]);
  const params = useMemo(() => ({ ...DEFAULT, q: dq, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "" && v != null)), ...(tab === "pending" ? { approval: "pending" } : {}), ...(tab === "bin" ? { deleted: 1 } : {}), ...(pro ? { pro: 1 } : {}), sort: sort.key, order: sort.order, page, page_size: pageSize }), [dq, filters, sort, page, pageSize, tab, pro]);
  const { data, loading, error, reload } = usePaged(`/admin/people/${role}`, params);
  const kp = usePaged(`/admin/people/${role}/kpis`, useMemo(() => (pro ? { pro: 1 } : {}), [pro]));
  const refreshAll = useCallback(() => { invalidatePaged("/admin/people"); reload(); kp.reload(); onCountsChanged?.(); }, [reload, kp, onCountsChanged]);
  // Multi-select for bulk delete / restore.
  const [sel, setSel] = useState(new Set());
  const [confirmCfg, setConfirmCfg] = useState(null);
  useEffect(() => { setSel(new Set()); }, [tab, dq, filters, page, pageSize, role]);
  const toggleRow = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = (rows) => setSel((s) => { const all = rows.every((r) => s.has(r.id)); const n = new Set(s); rows.forEach((r) => (all ? n.delete(r.id) : n.add(r.id))); return n; });
  const runBulkDelete = async (ids) => {
    try { const { data: r } = await api.post(`/admin/people/${role}/bulk-delete`, { uids: ids }); const why = r.skipped?.[0]?.reason ? ` — ${r.skipped[0].reason}` : ""; if (r.count === 0 && r.skipped?.length) toast.error(`Nothing deleted · ${r.skipped.length} skipped${why}`); else toast.success(`${r.count} deleted${r.skipped?.length ? `, ${r.skipped.length} skipped${why}` : ""}`); setSel(new Set()); refreshAll(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Bulk delete failed"); }
  };
  const bulkDelete = () => {
    const ids = [...sel]; if (!ids.length) return;
    setConfirmCfg({ title: `Delete ${ids.length} ${title.toLowerCase()}?`, body: "They move to the Deleted tab and can be restored within 30 days.", label: "Delete", danger: true, testid: "confirm-bulk-delete", run: () => runBulkDelete(ids) });
  };
  const bulkRestore = async () => {
    const ids = [...sel]; if (!ids.length) return;
    try { const { data: r } = await api.post(`/admin/people/${role}/bulk-restore`, { uids: ids }); toast.success(`${r.count} restored`); setSel(new Set()); refreshAll(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Bulk restore failed"); }
  };
  const runBulkPurge = async (ids) => {
    try { const { data: r } = await api.post(`/admin/people/${role}/bulk-purge`, { uids: ids }); const why = r.skipped?.[0]?.reason ? ` — ${r.skipped[0].reason}` : ""; if (r.count === 0 && r.skipped?.length) toast.error(`Nothing deleted · ${r.skipped.length} skipped${why}`); else toast.success(`${r.count} permanently deleted${r.skipped?.length ? `, ${r.skipped.length} skipped${why}` : ""}`); setSel(new Set()); refreshAll(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Permanent delete failed"); }
  };
  const bulkPurge = () => {
    const ids = [...sel]; if (!ids.length) return;
    setConfirmCfg({ title: `Permanently delete ${ids.length} account(s)?`, body: "This removes them for good — it CANNOT be undone. Financial & booking history is kept for audit.", label: "Delete forever", danger: true, testid: "confirm-bulk-purge", run: () => runBulkPurge(ids) });
  };
  const fields = useMemo(() => cfg.filters(facets), [cfg, facets]);
  const activeChips = useMemo(() => {
    const out = [];
    for (const f of fields) {
      if (f.type === "select" && filters[f.key]) { const o = f.options.find((x) => (typeof x === "string" ? x : x.value) === filters[f.key]); out.push({ k: [f.key], label: `${f.label}: ${o ? (typeof o === "string" ? o : o.label) : filters[f.key]}` }); }
      if (f.type === "range" && (filters[f.min] || (f.max && filters[f.max]))) out.push({ k: [f.min, f.max].filter(Boolean), label: `${f.label}: ${filters[f.min] || "0"}${f.max ? ` – ${filters[f.max] || "∞"}` : "+"}` });
      if (f.type === "date" && (filters[f.from] || filters[f.to])) out.push({ k: [f.from, f.to], label: `${f.label}: ${rangeLabel({ from: filters[f.from], to: filters[f.to] })}` });
    }
    return out;
  }, [fields, filters]);
  const removeChip = (keys) => setFilters((f) => { const n = { ...f }; keys.forEach((k) => delete n[k]); return n; });
  const onSort = (key) => setSort((s) => ({ key, order: s.key === key && s.order === "desc" ? "asc" : "desc" }));
  const exportCsv = () => {
    const rows = data?.items || []; if (!rows.length) return toast.error("Nothing to export");
    const cols = ["id", "name", "phone", "email", "city", "status_label", "kyc_status", "partner_code", "merchant_code", "shop_name", "bookings_count", "completed_count", "total_spent", "total_earned", "wallet_balance", "rating", "created_at", "last_activity_at"];
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `${role}s-page${page}.csv`; a.click();
  };
  const Icon = cfg.icon;
  const title = pro ? "Pro Partners" : cfg.title;
  const HeadIcon = pro ? Crown : Icon;
  const unread = kp.data?.unread_updates || 0;
  const kpis = cfg.kpis(kp.data || {});
  return (
    <div className="w-full space-y-4" data-testid={pro ? "people-pro_partners" : `people-${role}`}>
      {/* header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-2xl text-white flex items-center justify-center shadow-lg ${pro ? "bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/25" : "bg-gradient-to-br from-primary-600 to-primary-400 shadow-primary-600/25"}`}><HeadIcon className="h-6 w-6" /></div>
          <div><h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white leading-tight flex items-center gap-2">{title}{pro && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">AzoApp Pro members only</span>}</h1>
            <p className="text-xs text-slate-400" data-testid="total-records">{kp.data?.total ?? data?.total ?? "—"} total records{unread ? <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-semibold"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />{unread} unreviewed profile update{unread > 1 ? "s" : ""}</span> : null}</p></div>
        </div>
        <div className="flex items-center gap-2">
          <Btn onClick={refreshAll} title="Refresh" data-testid="refresh-btn"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{!mobile && "Refresh"}</Btn>
          <Btn onClick={exportCsv} data-testid="export-btn"><Download className="h-4 w-4" />{!mobile && "Export CSV"}</Btn>
        </div>
      </div>
      {/* KPIs */}
      <div className="flex md:grid md:grid-cols-3 xl:grid-cols-5 2xl:grid-cols-6 gap-3 overflow-x-auto snap-x no-scrollbar -mx-1 px-1 pb-1">{kpis.map((k) => <KpiCard key={k.label} {...k} loading={kp.loading && !kp.data} />)}</div>
      {/* tabs */}
      <Tabs tabs={[{ key: "all", label: `All ${title}` }, ...(role !== "customer" ? [{ key: "pending", label: "Awaiting approval", icon: Clock }] : []), { key: "updates", label: "Profile Updates", icon: Bell }, { key: "bin", label: "Deleted", icon: Trash2 }]} value={tab} onChange={setTab} counts={{ updates: unread || undefined, pending: (kp.data?.kyc_pending || undefined) }} dots={{ updates: unread > 0 }} />
      {tab === "updates" ? <ProfileUpdates role={role} onOpenUser={(u) => onView(u)} onChanged={refreshAll} /> : (
        <Card>
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
            <SearchBox value={q} onChange={setQ} placeholder={cfg.searchHint} testId="people-search" />
            <div className="flex flex-wrap items-center gap-2">
              <RangeCalendar value={{ from: filters.joined_from || "", to: filters.joined_to || "" }} onChange={(r) => setFilters((f) => ({ ...f, joined_from: r.from, joined_to: r.to }))} label="Joined date" testId="joined-range" align="right" />
              <Btn onClick={() => setDrawer(true)} data-testid="open-filters" className={activeChips.length ? "ring-primary-300 text-primary-700" : ""}><SlidersHorizontal className="h-4 w-4" />Filters{activeChips.length ? <span className="h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] font-bold flex items-center justify-center">{activeChips.length}</span> : null}</Btn>
              <div className="relative">
                <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <PremiumSelect data-testid="sort-select" value={sort.key} onChange={(e) => setSort({ key: e.target.value, order: e.target.value === "name" ? "asc" : "desc" })} searchable={false} className="!h-10 !w-auto min-w-[190px] rounded-xl">
                  <option value="priority">Recently updated first</option><option value="created_at">Newest joined</option><option value="last_active">Last activity</option><option value="name">Name A–Z</option><option value="bookings">Most bookings</option>
                  {role === "customer" ? <><option value="spent">Highest spend</option><option value="wallet">Wallet balance</option></> : <><option value="earned">Highest earnings</option><option value="wallet">Wallet balance</option></>}
                  {role === "partner" && <option value="rating">Rating</option>}
                </PremiumSelect>
              </div>
            </div>
          </div>
          {(activeChips.length > 0 || dq) && <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40" data-testid="active-filters">
            {dq && <Chip onRemove={() => setQ("")}>Search: “{dq}”</Chip>}{activeChips.map((c) => <Chip key={c.label} onRemove={() => removeChip(c.k)}>{c.label}</Chip>)}
            <button onClick={() => { setFilters({}); setQ(""); }} className="text-xs font-semibold text-slate-500 hover:text-slate-800 ml-1" data-testid="clear-all-filters">Clear all</button></div>}
          {sort.key === "priority" && data?.items?.some((r) => r.profile_update_unreviewed) && <div className="px-4 py-2 text-[11px] font-semibold text-red-700 bg-red-50/60 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900/30 flex items-center gap-2" data-testid="recently-updated-banner"><span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />Recently updated profiles are pinned to the top until reviewed</div>}
          {tab === "bin" && <div className="px-4 py-2 text-[11px] font-semibold text-amber-800 bg-amber-50/70 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-900/30 flex items-center gap-2" data-testid="recycle-bin-banner"><Trash2 className="h-3.5 w-3.5" />Deleted accounts are kept for 30 days, then permanently removed. Select rows to restore.</div>}
          {sel.size > 0 && <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-primary-50/60 dark:bg-primary-900/20" data-testid="bulk-bar">
            <span className="text-sm font-semibold text-primary-700 dark:text-primary-200">{sel.size} selected</span>
            <div className="flex items-center gap-2">
              <Btn onClick={() => setSel(new Set())}>Clear</Btn>
              {tab === "bin"
                ? <><Btn variant="primary" data-testid="bulk-restore" onClick={bulkRestore}><RotateCcw className="h-4 w-4" />Restore selected</Btn><Btn variant="danger" data-testid="bulk-purge" onClick={bulkPurge}><Trash2 className="h-4 w-4" />Delete forever</Btn></>
                : <Btn variant="danger" data-testid="bulk-delete" onClick={bulkDelete}><Trash2 className="h-4 w-4" />Delete selected</Btn>}
            </div>
          </div>}
          <DataGrid columns={cfg.columns} rows={data?.items} loading={loading} error={error} onRetry={reload} onRow={(r) => onView({ id: r.id, role })} sort={sort} onSort={onSort}
            selectable selectedIds={sel} onToggleRow={toggleRow} onToggleAll={toggleAll}
            empty={<Empty icon={HeadIcon} title={`No ${title.toLowerCase()} found`} hint={activeChips.length || dq ? "Try adjusting your search or filters." : (pro ? "Partners who buy a Starter Kit become AzoApp Pro and show up here." : "New records will show up here automatically.")} action={(activeChips.length || dq) ? <Btn className="mt-4" onClick={() => { setFilters({}); setQ(""); }}>Clear filters</Btn> : null} />}
            mobileCard={(r) => (
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">{cfg.columns[0].render(r)}<Pill s={r.status_label || "active"} /></div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-slate-400">Phone</p><p className="font-medium">{r.phone}</p></div>
                  <div><p className="text-slate-400">City</p><p className="font-medium">{r.city || r.service_area_name || "—"}</p></div>
                  <div><p className="text-slate-400">{role === "partner" ? "Jobs" : "Bookings"}</p><p className="font-medium">{r.bookings_count ?? 0} <span className="text-slate-400">· {r.completed_count ?? 0} done</span></p></div>
                  <div><p className="text-slate-400">{role === "customer" ? "Spent" : "Earned"}</p><p className="font-semibold">{cfg.columns.find((c) => c.key === (role === "customer" ? "spent" : "earned")).render(r)}</p></div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400"><span>Joined {rel(r.created_at)}</span><span>Active {rel(r.last_activity_at)}</span>{role !== "customer" && <Pill s={r.kyc_status || "pending"} size="xs" />}{role === "customer" && r.tier_label && <span className="font-semibold text-slate-600">{r.tier_label}</span>}</div>
              </div>)} />
          {data && data.total > 0 && <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />}
        </Card>
      )}
      <FilterDrawer open={drawer} onClose={() => setDrawer(false)} fields={fields} value={filters} onApply={setFilters} />
      {confirmCfg && (
        <Drawer open onClose={() => setConfirmCfg(null)} title={confirmCfg.title}
          footer={<div className="flex justify-end gap-2"><Btn onClick={() => setConfirmCfg(null)} data-testid="confirm-cancel">Cancel</Btn><Btn variant={confirmCfg.danger ? "danger" : "primary"} data-testid={confirmCfg.testid || "confirm-ok"} onClick={async () => { const fn = confirmCfg.run; setConfirmCfg(null); await fn?.(); }}>{confirmCfg.label || "Confirm"}</Btn></div>}>
          <p className="text-sm text-slate-600 dark:text-slate-300">{confirmCfg.body}</p>
        </Drawer>
      )}
    </div>
  );
}
