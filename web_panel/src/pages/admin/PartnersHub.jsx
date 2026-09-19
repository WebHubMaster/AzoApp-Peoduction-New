import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Filter, X, Star, Plus, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { toast } from "sonner";
import AddPartnerWizard from "@/components/AddPartnerWizard";

const TABS = [
  { key: "all", label: "All Partners" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "online", label: "Online" },
  { key: "offline", label: "Offline" },
];

const KYC_PILL = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  under_review: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
};

// Unified Partners directory — single menu, KYC-status + online/offline tabs,
// advanced filters (search, date range, category). Clicking a row opens the
// full 360° profile (which contains the approve/reject action bar).
export default function PartnersHub({ onView, premiumOnly = false }) {
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("");
  const [cats, setCats] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [wizOpen, setWizOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    api.get("/catalog/categories").then((r) => setCats(r.data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tab };
      if (q.trim()) params.q = q.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (category) params.category = category;
      if (premiumOnly) params.premium = true;
      const r = await api.get("/admin/partners", { params });
      setRows(r.data.partners || []);
      setCounts(r.data.counts || {});
    } catch (e) {
      toast.error("Failed to load partners");
    } finally {
      setLoading(false);
    }
  }, [tab, q, dateFrom, dateTo, category, premiumOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, q, dateFrom, dateTo, category, rows.length]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = rows.slice((curPage - 1) * pageSize, curPage * pageSize);

  const clearFilters = () => { setQ(""); setDateFrom(""); setDateTo(""); setCategory(""); };
  const activeFilters = [q, dateFrom, dateTo, category].filter(Boolean).length;

  return (
    <div className="space-y-4" data-testid={premiumOnly ? "pro-partners-hub" : "partners-hub"}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className={`h-9 w-9 rounded-xl text-white flex items-center justify-center ${premiumOnly ? "bg-gradient-to-r from-amber-400 to-amber-500" : "bg-primary-700"}`}>{premiumOnly ? <Crown className="h-5 w-5" /> : <Users className="h-5 w-5" />}</div>
          <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">{premiumOnly ? "Pro Partners" : "Partners"}</h2>
          {premiumOnly && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">AzoApp Pro members only</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="partners-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / phone / code" className="pl-9 w-56" />
          </div>
          <Button data-testid="partners-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
          <Button data-testid="add-partner-btn" onClick={() => setWizOpen(true)} className="gap-1 bg-primary-700 hover:bg-primary-800"><Plus className="h-4 w-4" /> Add Partner</Button>
        </div>
      </div>
      <AddPartnerWizard open={wizOpen} onOpenChange={setWizOpen} basePrefix="/admin" onCreated={load} />

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="partners-filters">
          <div>
            <label className="text-xs text-slate-500">From date</label>
            <PremiumDatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="filter-date-from" placeholder="From date" />
          </div>
          <div>
            <label className="text-xs text-slate-500">To date</label>
            <PremiumDatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="filter-date-to" placeholder="To date" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Category / skill</label>
            <PremiumSelect value={category} onChange={(e) => setCategory(e.target.value)} data-testid="filter-category"
              className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 text-sm">
              <option value="">All categories</option>
              {cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </PremiumSelect>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" onClick={clearFilters} className="gap-1 text-slate-500"><X className="h-4 w-4" /> Clear</Button>
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`partners-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-full text-sm whitespace-nowrap transition-all ${tab === t.key ? "bg-primary-700 text-white shadow" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {t.label}
            <span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>
                {["Partner", "Phone", "City", "Skills", "Rating", "Status", "KYC", "Code", "Joined"].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">No partners found</td></tr>
              ) : pageRows.map((p) => (
                <tr key={p.id} data-testid={`partner-row-${p.id}`} onClick={() => onView?.(p.id)}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {p.photo ? <img src={p.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <span className="h-8 w-8 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">{(p.name || "P").slice(0, 2).toUpperCase()}</span>}
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          {p.name || "—"}
                          {p.premium_partner && (
                            <span title="AzoApp Pro member" data-testid={`pro-badge-${p.id}`}
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-sm">
                              <Crown className="h-3 w-3" /> Pro
                            </span>
                          )}
                        </p>
                        {p.gender && <p className="text-[11px] text-slate-400 capitalize">{p.gender}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{p.phone}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.city || "—"}</td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="flex flex-wrap gap-1">
                      {(p.skills || []).slice(0, 2).map((s, i) => <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">{s}</span>)}
                      {(p.skills || []).length > 2 && <span className="text-[10px] text-slate-400">+{p.skills.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center gap-0.5 text-slate-700 dark:text-slate-200"><Star className="h-3.5 w-3.5 text-amber-400" fill="currentColor" />{(p.rating ?? 0).toFixed ? (p.rating ?? 0).toFixed(1) : p.rating || 0}</span></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs ${p.partner_status === "online" ? "text-emerald-600" : "text-slate-400"}`}>
                      <span className={`h-2 w-2 rounded-full ${p.partner_status === "online" ? "bg-emerald-500" : "bg-slate-300"}`} />{p.partner_status || "offline"}
                    </span>
                  </td>
                  <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${KYC_PILL[p.kyc_status] || "bg-slate-100 text-slate-500"}`}>{(p.kyc_status || "pending").replace("_", " ")}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-500">{p.partner_code || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-xs">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
            <span data-testid="partners-page-info">{(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, rows.length)} of {rows.length}</span>
            <div className="flex items-center gap-1">
              <button data-testid="partners-prev" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage === 1}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{curPage} / {pageCount}</span>
              <button data-testid="partners-next" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
