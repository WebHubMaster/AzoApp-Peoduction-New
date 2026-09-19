import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Store, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "all", label: "All Merchants" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
];

const KYC_PILL = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  under_review: "bg-amber-100 text-amber-700",
  submitted: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
};

// Unified Merchants directory — mirrors PartnersHub design (tabs, filters,
// pagination). Clicking a row opens the merchant 360° profile.
export default function MerchantsHub({ onView }) {
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
      const r = await api.get("/admin/merchants", { params });
      setRows(r.data.merchants || []);
      setCounts(r.data.counts || {});
    } catch (e) {
      toast.error("Failed to load merchants");
    } finally {
      setLoading(false);
    }
  }, [tab, q, dateFrom, dateTo, category]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tab, q, dateFrom, dateTo, category, rows.length]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = rows.slice((curPage - 1) * pageSize, curPage * pageSize);

  const clearFilters = () => { setQ(""); setDateFrom(""); setDateTo(""); setCategory(""); };
  const activeFilters = [q, dateFrom, dateTo, category].filter(Boolean).length;

  return (
    <div className="space-y-4" data-testid="merchants-hub">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary-700 text-white flex items-center justify-center"><Store className="h-5 w-5" /></div>
          <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Merchants</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="merchants-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search shop / owner / phone / code" className="pl-9 w-64" />
          </div>
          <Button data-testid="merchants-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="merchants-filters">
          <div>
            <label className="text-xs text-slate-500">From date</label>
            <PremiumDatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="From date" />
          </div>
          <div>
            <label className="text-xs text-slate-500">To date</label>
            <PremiumDatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="To date" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Category served</label>
            <PremiumSelect value={category} onChange={(e) => setCategory(e.target.value)}
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
          <button key={t.key} data-testid={`merchants-tab-${t.key}`} onClick={() => setTab(t.key)}
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
                {["Shop / Owner", "Phone", "City", "Shop Type", "Categories", "KYC", "Code", "Joined"].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No merchants found</td></tr>
              ) : pageRows.map((m) => (
                <tr key={m.id} data-testid={`merchant-row-${m.id}`} onClick={() => onView?.(m.id)}
                  className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {m.photo ? <img src={m.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <span className="h-8 w-8 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center"><Store className="h-4 w-4" /></span>}
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100">{m.shop_name || m.name || "—"}</p>
                        <p className="text-[11px] text-slate-400">{m.name || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">{m.phone}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{m.city || "—"}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{m.shop_type || "—"}</td>
                  <td className="px-4 py-3 max-w-[180px]">
                    <div className="flex flex-wrap gap-1">
                      {(m.merchant_categories || []).slice(0, 2).map((s, i) => <span key={i} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">{s}</span>)}
                      {(m.merchant_categories || []).length > 2 && <span className="text-[10px] text-slate-400">+{m.merchant_categories.length - 2}</span>}
                      {(m.merchant_categories || []).length === 0 && <span className="text-slate-400">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${KYC_PILL[m.kyc_status] || "bg-slate-100 text-slate-500"}`}>{(m.kyc_status || "pending").replace("_", " ")}</span></td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-500">{m.merchant_code || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-xs">{m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
            <span data-testid="merchants-page-info">{(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, rows.length)} of {rows.length}</span>
            <div className="flex items-center gap-1">
              <button data-testid="merchants-prev" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage === 1}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{curPage} / {pageCount}</span>
              <button data-testid="merchants-next" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
