import React, { useEffect, useState, useCallback, useRef } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import PremiumSelect from "@/components/ui/PremiumSelect";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  TrendingUp, Users, Star, Wallet, Search, Download, ChevronLeft, ChevronRight,
  ArrowUpDown, Gift, Plus, Trash2, Trophy, Award, AlertTriangle, ShieldAlert,
  Target, Sparkles, IndianRupee, RotateCcw, Crown, Percent,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ shared UI */
const Bar = ({ pct, className = "bg-primary-600" }) => (
  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
    <div className={`h-full rounded-full ${className} transition-all`} style={{ width: `${Math.min(100, Math.max(0, pct || 0))}%` }} />
  </div>
);

const StatCard = ({ icon: Icon, label, value, tint = "primary", sub }) => {
  const tints = {
    primary: "from-primary-500 to-primary-700",
    emerald: "from-emerald-500 to-emerald-700",
    amber: "from-amber-500 to-orange-600",
    rose: "from-rose-500 to-red-600",
    violet: "from-violet-500 to-purple-700",
    slate: "from-slate-600 to-slate-800",
  };
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
      <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${tints[tint]} flex items-center justify-center text-white shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="text-lg font-heading font-bold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 truncate">{sub}</p>}
      </div>
    </div>
  );
};

const Pager = ({ page, pages, total, pageSize, onPage, onSize }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <span>Rows</span>
      <PremiumSelect className="border rounded-lg h-9 px-2 text-sm" value={String(pageSize)} onChange={(e) => onSize(Number(e.target.value))}>
        {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
      </PremiumSelect>
      <span className="hidden sm:inline">· {total} total</span>
    </div>
    <div className="flex items-center gap-1">
      <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50" data-testid="pg-prev"><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-sm font-medium px-3">{page} / {pages}</span>
      <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50" data-testid="pg-next"><ChevronRight className="h-4 w-4" /></button>
    </div>
  </div>
);

const useDebounced = (value, delay = 400) => {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return v;
};

const rankMedal = (r) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : null);

const statusPill = (s) => {
  const map = { online: "bg-emerald-100 text-emerald-700", offline: "bg-slate-100 text-slate-500", break: "bg-amber-100 text-amber-700", emergency: "bg-rose-100 text-rose-700", leave: "bg-violet-100 text-violet-700" };
  return <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${map[s] || "bg-slate-100 text-slate-500"}`}>{s || "offline"}</span>;
};
const kycPill = (s) => {
  const map = { approved: "bg-emerald-100 text-emerald-700", pending: "bg-amber-100 text-amber-700", under_review: "bg-blue-100 text-blue-700", rejected: "bg-rose-100 text-rose-700" };
  return <span className={`text-xs font-medium px-2 py-1 rounded-full capitalize ${map[s] || "bg-slate-100 text-slate-500"}`}>{(s || "pending").replace("_", " ")}</span>;
};

/* ============================================================ PERFORMANCE */
export function PerformanceManager() {
  const [data, setData] = useState({ summary: {}, items: [], total: 0, page: 1, pages: 1, page_size: 10 });
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [statusF, setStatusF] = useState("");
  const [kycF, setKycF] = useState("");
  const [minRating, setMinRating] = useState("");
  const [sort, setSort] = useState("jobs_done");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/admin/partner/performance", { params: { q: dq, status: statusF, kyc: kycF, min_rating: minRating || 0, sort, order, page, page_size: pageSize } })
      .then((r) => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [dq, statusF, kycF, minRating, sort, order, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [dq, statusF, kycF, minRating, pageSize]);

  const toggleSort = (key) => {
    if (sort === key) setOrder((o) => (o === "desc" ? "asc" : "desc"));
    else { setSort(key); setOrder("desc"); }
  };

  const exportCsv = () => {
    const rows = data.items || [];
    if (!rows.length) return toast.error("Nothing to export");
    const cols = ["rank", "name", "phone", "jobs_done", "rating", "earnings", "acceptance_rate", "completion_rate", "cancellations", "incentives_earned", "penalties", "status", "kyc_status"];
    const csv = [cols.join(",")].concat(rows.map((r) => cols.map((c) => `"${String(r[c] ?? "").replace(/"/g, '""')}"`).join(","))).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "provider-performance.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const s = data.summary || {};
  const sortTh = (label, k, right) => (
    <th onClick={() => toggleSort(k)} className={`px-3 py-2 cursor-pointer select-none hover:text-slate-900 ${right ? "text-right" : "text-left"}`}>
      <span className="inline-flex items-center gap-1">{label}<ArrowUpDown className={`h-3 w-3 ${sort === k ? "text-primary-600" : "text-slate-300"}`} /></span>
    </th>
  );

  return (
    <div data-testid="performance-manager">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary-600" /> Provider Performance</h2>
          <p className="text-sm text-slate-500">Fleet analytics — jobs, ratings, earnings & reliability.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} data-testid="perf-export"><Download className="h-4 w-4 mr-1" /> Export</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Users} label="Total Partners" value={s.total_partners ?? 0} tint="primary" sub={`${s.active_partners ?? 0} online now`} />
        <StatCard icon={Star} label="Avg Rating" value={`${s.avg_rating ?? 0} ★`} tint="amber" />
        <StatCard icon={Target} label="Total Jobs" value={s.total_jobs ?? 0} tint="violet" sub={`${s.avg_acceptance ?? 0}% avg acceptance`} />
        <StatCard icon={Wallet} label="Partner Earnings" value={fmt(s.total_earnings || 0)} tint="emerald" sub={`${fmt(s.total_incentives || 0)} bonuses`} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="perf-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone…" className="pl-9" />
          </div>
          <PremiumSelect className="border rounded-lg h-10 px-3 text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value)} data-testid="perf-status">
            <option value="">All status</option><option value="online">Online</option><option value="offline">Offline</option><option value="break">Break</option><option value="emergency">Emergency</option>
          </PremiumSelect>
          <PremiumSelect className="border rounded-lg h-10 px-3 text-sm" value={kycF} onChange={(e) => setKycF(e.target.value)} data-testid="perf-kyc">
            <option value="">All KYC</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="under_review">Under review</option><option value="rejected">Rejected</option>
          </PremiumSelect>
          <PremiumSelect className="border rounded-lg h-10 px-3 text-sm" value={minRating} onChange={(e) => setMinRating(e.target.value)}>
            <option value="">Any rating</option><option value="4.5">4.5★ +</option><option value="4">4★ +</option><option value="3">3★ +</option>
          </PremiumSelect>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 border-b border-slate-100">
              <tr>
                <th className="px-3 py-2 text-left">Provider</th>
                {sortTh("Jobs", "jobs_done", true)}
                {sortTh("Rating", "rating", true)}
                {sortTh("Earnings", "earnings", true)}
                {sortTh("Accept %", "acceptance_rate", true)}
                {sortTh("Complete %", "completion_rate", true)}
                {sortTh("Bonus", "incentives_earned", true)}
                {sortTh("Penalty", "penalties", true)}
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">KYC</th>
              </tr>
            </thead>
            <tbody data-testid="perf-rows">
              {(data.items || []).map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-sm">{rankMedal(r.rank) || <span className="text-slate-300 text-xs">#{r.rank}</span>}</span>
                      <div>
                        <p className="font-medium text-slate-800">{r.name}</p>
                        <p className="text-xs text-slate-400">{r.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">{r.jobs_done}</td>
                  <td className="px-3 py-3 text-right">{r.rating > 0 ? `${r.rating}★` : "—"}</td>
                  <td className="px-3 py-3 text-right">{fmt(r.earnings)}</td>
                  <td className="px-3 py-3 text-right"><span className="inline-flex flex-col items-end gap-1 w-16"><span className="text-xs">{r.acceptance_rate}%</span><Bar pct={r.acceptance_rate} className="bg-blue-500" /></span></td>
                  <td className="px-3 py-3 text-right"><span className="inline-flex flex-col items-end gap-1 w-16"><span className="text-xs">{r.completion_rate}%</span><Bar pct={r.completion_rate} className="bg-emerald-500" /></span></td>
                  <td className="px-3 py-3 text-right text-emerald-600 font-medium">{r.incentives_earned ? fmt(r.incentives_earned) : "—"}</td>
                  <td className="px-3 py-3 text-right text-rose-600 font-medium">{r.penalties ? `-${fmt(r.penalties)}` : "—"}</td>
                  <td className="px-3 py-3">{statusPill(r.status)}</td>
                  <td className="px-3 py-3">{kycPill(r.kyc_status)}</td>
                </tr>
              ))}
              {!loading && (data.items || []).length === 0 && (
                <tr><td colSpan={10} className="text-center text-slate-400 py-10">No partners match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onSize={setPageSize} />
      </div>
    </div>
  );
}

/* ============================================================ INCENTIVES */
export function IncentivesManagerPro() {
  const [ov, setOv] = useState({ items: [], stats: {} });
  const [edit, setEdit] = useState(null);
  const [board, setBoard] = useState(null);
  const [statusF, setStatusF] = useState("");
  const [q, setQ] = useState("");
  const load = useCallback(() => api.get("/admin/partner/incentives/overview").then((r) => setOv(r.data)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  const blank = { name: "", description: "", job_target: 0, revenue_target: 0, rating_min: 0, bonus_amount: 0, start_date: "", end_date: "", status: "active" };
  const del = async (id) => { await api.delete(`/admin/partner/incentives/${id}`); toast.success("Incentive deleted"); load(); };

  const st = ov.stats || {};
  let items = ov.items || [];
  if (statusF) items = items.filter((i) => (i.status || "active") === statusF);
  if (q) items = items.filter((i) => (i.name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div data-testid="incentives-manager-pro">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2"><Gift className="h-5 w-5 text-primary-600" /> Partner Incentives</h2>
          <p className="text-sm text-slate-500">Design bonus challenges that keep your fleet motivated.</p>
        </div>
        <Button className="bg-primary-700 hover:bg-primary-800" data-testid="new-incentive-btn" onClick={() => setEdit(blank)}><Plus className="h-4 w-4 mr-1" /> New Incentive</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Sparkles} label="Active Challenges" value={st.active ?? 0} tint="violet" sub={`${st.total ?? 0} total`} />
        <StatCard icon={Target} label="Live Bonus Budget" value={fmt(st.total_budget || 0)} tint="primary" />
        <StatCard icon={Award} label="Bonuses Awarded" value={st.total_awards ?? 0} tint="amber" />
        <StatCard icon={Wallet} label="Total Paid Out" value={fmt(st.total_paid || 0)} tint="emerald" />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search incentives…" className="pl-9" />
        </div>
        <PremiumSelect className="border rounded-lg h-10 px-3 text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option>
        </PremiumSelect>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="incentives-grid">
        {items.map((i) => (
          <div key={i.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 bg-gradient-to-br from-primary-600 to-primary-800 text-white relative">
              <div className="absolute right-4 top-4"><Badge className={`border-0 ${i.status === "active" ? "bg-emerald-400/90 text-emerald-950" : "bg-slate-300 text-slate-700"}`}>{i.status || "active"}</Badge></div>
              <Trophy className="h-6 w-6 mb-2 opacity-90" />
              <p className="font-heading font-bold text-lg leading-tight pr-16">{i.name}</p>
              <p className="text-primary-100 text-sm mt-1 line-clamp-2 min-h-[2.5rem]">{i.description}</p>
              <p className="font-heading font-extrabold text-3xl mt-3">{fmt(i.bonus_amount)}</p>
            </div>
            <div className="p-4 flex-1">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {i.job_target > 0 && <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700 flex items-center gap-1"><Target className="h-3 w-3" /> {i.job_target} jobs</span>}
                {i.revenue_target > 0 && <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 flex items-center gap-1"><IndianRupee className="h-3 w-3" /> {fmt(i.revenue_target)}</span>}
                {i.rating_min > 0 && <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1"><Star className="h-3 w-3" /> {i.rating_min}★+</span>}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div><p className="text-lg font-bold text-emerald-600">{i.eligible_count}</p><p className="text-[11px] text-slate-400">Eligible</p></div>
                <div><p className="text-lg font-bold text-primary-600">{i.awarded_count}</p><p className="text-[11px] text-slate-400">Awarded</p></div>
                <div><p className="text-lg font-bold text-slate-700">{fmt(i.total_paid)}</p><p className="text-[11px] text-slate-400">Paid</p></div>
              </div>
            </div>
            <div className="p-3 border-t border-slate-100 flex items-center gap-2">
              <Button size="sm" className="flex-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => setBoard(i)} data-testid="incentive-award-btn"><Award className="h-4 w-4 mr-1" /> Award</Button>
              <Button size="sm" variant="outline" onClick={() => setEdit(i)}>Edit</Button>
              <button onClick={() => del(i.id)} className="h-9 w-9 rounded-lg border border-slate-200 flex items-center justify-center text-rose-400 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="col-span-full text-center text-slate-400 py-12">No incentives yet. Create one to motivate your partners.</div>}
      </div>

      <IncentiveEditDialog inc={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
      <LeaderboardDialog inc={board} onClose={() => setBoard(null)} onAwarded={() => { setBoard(null); load(); }} />
    </div>
  );
}

function IncentiveEditDialog({ inc, onClose, onDone }) {
  const [f, setF] = useState(inc);
  useEffect(() => { setF(inc); }, [inc]);
  if (!f) return null;
  const save = async () => {
    if (!f.name) return toast.error("Name is required");
    const p = { name: f.name, description: f.description, status: f.status || "active",
      job_target: Number(f.job_target) || 0, revenue_target: Number(f.revenue_target) || 0,
      rating_min: Number(f.rating_min) || 0, bonus_amount: Number(f.bonus_amount) || 0,
      start_date: f.start_date || "", end_date: f.end_date || "" };
    if (f.id) await api.put(`/admin/partner/incentives/${f.id}`, p); else await api.post("/admin/partner/incentives", p);
    toast.success("Incentive saved"); onDone();
  };
  return (
    <Dialog open={!!inc} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>{f.id ? "Edit" : "New"} Incentive</DialogTitle>
        <DialogDescription>Set the goals partners must hit and the bonus they earn.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name (e.g. Weekend Warrior)" value={f.name} data-testid="incentive-name" onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-slate-500">Job target</label><Input type="number" value={f.job_target} onChange={(e) => setF({ ...f, job_target: e.target.value })} /></div>
            <div><label className="text-xs text-slate-500">Bonus amount (₹)</label><Input type="number" value={f.bonus_amount} data-testid="incentive-bonus" onChange={(e) => setF({ ...f, bonus_amount: e.target.value })} /></div>
            <div><label className="text-xs text-slate-500">Min rating</label><Input type="number" step="0.1" value={f.rating_min} onChange={(e) => setF({ ...f, rating_min: e.target.value })} /></div>
            <div><label className="text-xs text-slate-500">Revenue target (₹)</label><Input type="number" value={f.revenue_target} onChange={(e) => setF({ ...f, revenue_target: e.target.value })} /></div>
            <div><label className="text-xs text-slate-500">Start date</label><DatePicker value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} placeholder="Optional" /></div>
            <div><label className="text-xs text-slate-500">End date</label><DatePicker value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} placeholder="Optional" minDate={f.start_date ? new Date(f.start_date) : undefined} /></div>
          </div>
          <div><label className="text-xs text-slate-500">Status</label>
            <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={f.status || "active"} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </PremiumSelect>
          </div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="incentive-save" className="bg-primary-700 hover:bg-primary-800">Save Incentive</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaderboardDialog({ inc, onClose, onAwarded }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!inc) return;
    setLoading(true);
    api.get(`/admin/partner/incentives/${inc.id}/eligible`).then((r) => setRows(r.data.partners || [])).catch(() => {}).finally(() => setLoading(false));
  }, [inc]);
  const award = async (pid) => {
    try { await api.post(`/admin/partner/incentives/${inc.id}/award/${pid}`); toast.success(`Bonus of ${fmt(inc.bonus_amount)} credited!`); onAwarded(); }
    catch (e) { toast.error(e.response?.data?.detail || "Award failed"); }
  };
  return (
    <Dialog open={!!inc} onOpenChange={onClose}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> {inc?.name} — Leaderboard</DialogTitle>
        <DialogDescription>Ranked by progress. Award {fmt(inc?.bonus_amount)} to eligible partners.</DialogDescription></DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto" data-testid="incentive-leaderboard">
          {loading && <p className="text-sm text-slate-400 text-center py-6">Loading…</p>}
          {!loading && rows.map((p, idx) => (
            <div key={p.id} className="border border-slate-200 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 text-center">{rankMedal(idx + 1) || <span className="text-slate-300 text-xs">#{idx + 1}</span>}</span>
                  <div className="min-w-0"><p className="font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.jobs_done} jobs · {p.rating}★ · {fmt(p.revenue)}</p></div>
                </div>
                {p.claim_status === "paid"
                  ? <Badge className="bg-emerald-100 text-emerald-700 border-0 shrink-0">Awarded</Badge>
                  : <Button size="sm" disabled={!p.eligible} onClick={() => award(p.id)} className={p.eligible ? "bg-emerald-600 hover:bg-emerald-700 shrink-0" : "shrink-0"}>{p.eligible ? "Award" : "Not eligible"}</Button>}
              </div>
              <div className="mt-2"><Bar pct={p.progress_pct} className={p.eligible ? "bg-emerald-500" : "bg-primary-500"} /></div>
            </div>
          ))}
          {!loading && rows.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No partners found.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ PENALTIES */
export function PenaltiesManagerPro() {
  const [data, setData] = useState({ stats: {}, items: [], total: 0, page: 1, pages: 1 });
  const [partners, setPartners] = useState([]);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [typeF, setTypeF] = useState("");
  const [statusF, setStatusF] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/partner/penalties/board", { params: { q: dq, type: typeF, status: statusF, page, page_size: pageSize } })
      .then((r) => setData(r.data)).catch(() => {});
  }, [dq, typeF, statusF, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/admin/users?role=partner").then((r) => setPartners(r.data)).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [dq, typeF, statusF, pageSize]);

  const reverse = async (id) => { await api.post(`/admin/partner/penalties/${id}/reverse`); toast.success("Penalty reversed & refunded"); load(); };
  const st = data.stats || {};

  return (
    <div data-testid="penalties-manager-pro">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-rose-600" /> Partner Penalties</h2>
          <p className="text-sm text-slate-500">Enforce quality standards with transparent, reversible deductions.</p>
        </div>
        <Button className="bg-rose-600 hover:bg-rose-700" data-testid="new-penalty-btn" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Apply Penalty</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon={AlertTriangle} label="Total Penalties" value={st.total ?? 0} tint="slate" />
        <StatCard icon={ShieldAlert} label="Active" value={st.active ?? 0} tint="rose" />
        <StatCard icon={RotateCcw} label="Reversed" value={st.reversed ?? 0} tint="violet" />
        <StatCard icon={IndianRupee} label="Amount Deducted" value={fmt(st.total_deducted || 0)} tint="amber" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search partner or reason…" className="pl-9" data-testid="penalty-search" />
          </div>
          <PremiumSelect className="border rounded-lg h-10 px-3 text-sm" value={typeF} onChange={(e) => setTypeF(e.target.value)}>
            <option value="">All types</option><option value="fixed">Fixed ₹</option><option value="percentage">Percentage</option><option value="score">Score only</option>
          </PremiumSelect>
          <PremiumSelect className="border rounded-lg h-10 px-3 text-sm" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="">All status</option><option value="active">Active</option><option value="reversed">Reversed</option>
          </PremiumSelect>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400 border-b border-slate-100">
              <tr><th className="px-3 py-2 text-left">Partner</th><th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Action</th></tr>
            </thead>
            <tbody data-testid="penalty-rows">
              {(data.items || []).map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-3 py-3 font-medium text-slate-800">{p.partner_name}</td>
                  <td className="px-3 py-3 text-slate-600">{p.reason}</td>
                  <td className="px-3 py-3 capitalize"><span className="inline-flex items-center gap-1 text-xs">{p.type === "percentage" ? <Percent className="h-3 w-3" /> : null}{p.type}</span></td>
                  <td className={`px-3 py-3 text-right font-semibold ${p.status === "reversed" ? "text-slate-400 line-through" : "text-rose-600"}`}>{p.type === "score" ? "—" : `-${fmt(p.amount)}`}</td>
                  <td className="px-3 py-3 text-xs text-slate-400">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-3">{p.status === "active" ? <Badge className="bg-rose-100 text-rose-700 border-0">Active</Badge> : <Badge className="bg-slate-100 text-slate-500 border-0">Reversed</Badge>}</td>
                  <td className="px-3 py-3 text-right">{p.status === "active" && <Button size="sm" variant="outline" onClick={() => reverse(p.id)}><RotateCcw className="h-3.5 w-3.5 mr-1" /> Reverse</Button>}</td>
                </tr>
              ))}
              {(data.items || []).length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-10">No penalties — your fleet is behaving! 🎉</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={data.page} pages={data.pages} total={data.total} pageSize={pageSize} onPage={setPage} onSize={setPageSize} />
      </div>

      <PenaltyDialog open={open} partners={partners} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />
    </div>
  );
}

function PenaltyDialog({ open, partners, onClose, onDone }) {
  const [f, setF] = useState({ partner_id: "", reason: "", type: "fixed", amount: 0, note: "" });
  useEffect(() => { if (open) setF({ partner_id: "", reason: "", type: "fixed", amount: 0, note: "" }); }, [open]);
  const save = async () => {
    if (!f.partner_id || !f.reason) return toast.error("Partner & reason are required");
    try { await api.post("/admin/partner/penalties", { ...f, amount: Number(f.amount) || 0 }); toast.success("Penalty applied"); onDone(); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>Apply Penalty</DialogTitle>
        <DialogDescription>Deducts from the partner wallet with a transparent ledger entry &amp; notification.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={f.partner_id} data-testid="penalty-partner" onChange={(e) => setF({ ...f, partner_id: e.target.value })}>
            <option value="">Select partner…</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.phone})</option>)}
          </PremiumSelect>
          <Input placeholder="Reason (e.g. Late arrival)" value={f.reason} data-testid="penalty-reason" onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <PremiumSelect className="border rounded-md h-10 px-3 text-sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="fixed">Fixed ₹</option><option value="percentage">Percentage %</option><option value="score">Score only</option>
            </PremiumSelect>
            <Input type="number" placeholder="Amount" value={f.amount} data-testid="penalty-amount" onChange={(e) => setF({ ...f, amount: e.target.value })} disabled={f.type === "score"} />
          </div>
          <Input placeholder="Internal note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </div>
        <DialogFooter><Button onClick={save} data-testid="penalty-save" className="bg-rose-600 hover:bg-rose-700">Apply Penalty</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
