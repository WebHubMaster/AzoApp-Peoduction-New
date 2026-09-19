import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { useEffect, useState, useCallback, useMemo } from "react";
import api, { fmt } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Filter, X, ChevronLeft, ChevronRight, Wallet, ShoppingBag, TrendingUp, Ban, Repeat, Send, Download, Gift, Award } from "lucide-react";
import { toast } from "sonner";

const TABS = [
  { key: "all", label: "All Customers" },
  { key: "active", label: "Active" },
  { key: "new", label: "New (30d)" },
  { key: "repeat", label: "Repeat" },
  { key: "high_value", label: "High Value" },
  { key: "blocked", label: "Blocked" },
];

const TIER_PILL = {
  platinum: "bg-violet-100 text-violet-700", gold: "bg-amber-100 text-amber-700",
  silver: "bg-slate-200 text-slate-700", bronze: "bg-orange-100 text-orange-700", new: "bg-sky-100 text-sky-700",
};

const StatCard = ({ icon: Icon, label, value, tone = "primary" }) => {
  const tones = {
    primary: "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    violet: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  };
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
      <div className={`h-11 w-11 rounded-xl grid place-items-center ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
        <p className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
};

// Unified Customers directory — summary strip, search, advanced filters, status
// tabs, pagination, per-row loyalty tier, plus bulk actions (message / CSV) and a
// one-tap Win-back campaign for inactive customers. Row click opens the 360°.
export default function CustomersHub({ onView }) {
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [city, setCity] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({ channel: "push", title: "", body: "" });
  const [winOpen, setWinOpen] = useState(false);
  const [win, setWin] = useState({ days: 60, channel: "push", title: "We miss you! 🧡", body: "Here's a special welcome-back offer. Book now and save!" });
  const [winCount, setWinCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const pageSize = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tab };
      if (q.trim()) params.q = q.trim();
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (city.trim()) params.city = city.trim();
      const r = await api.get("/admin/customers", { params });
      setRows(r.data.customers || []);
      setCounts(r.data.counts || {});
      setSummary(r.data.summary || {});
    } catch (e) {
      toast.error("Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [tab, q, dateFrom, dateTo, city]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [tab, q, dateFrom, dateTo, city, rows.length]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = rows.slice((curPage - 1) * pageSize, curPage * pageSize);

  const clearFilters = () => { setQ(""); setDateFrom(""); setDateTo(""); setCity(""); };
  const activeFilters = [q, dateFrom, dateTo, city].filter(Boolean).length;

  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const togglePage = () => setSelected((prev) => {
    const n = new Set(prev);
    if (allOnPageSelected) pageRows.forEach((r) => n.delete(r.id));
    else pageRows.forEach((r) => n.add(r.id));
    return n;
  });
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  const sendBulk = async () => {
    if (!bulk.title.trim() || !bulk.body.trim()) return toast.error("Title and message are required");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/customers/bulk-notify", { ids: Array.from(selected), ...bulk });
      toast.success(`Message sent to ${data.sent} customer(s)`);
      setBulkOpen(false); setBulk({ channel: "push", title: "", body: "" }); setSelected(new Set());
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const list = selectedRows.length ? selectedRows : rows;
    if (!list.length) return toast.error("Nothing to export");
    const cols = ["name", "phone", "email", "city", "bookings_count", "total_spent", "wallet_balance", "created_at"];
    const head = ["Name", "Phone", "Email", "City", "Bookings", "Total Spent", "Wallet", "Joined"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...list.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${list.length} customer(s)`);
  };

  const openWinback = async () => {
    setWinOpen(true); setWinCount(null);
    try { const { data } = await api.get(`/admin/customers/winback/preview?days=${win.days}`); setWinCount(data.count); }
    catch { setWinCount(0); }
  };
  const refreshWinCount = async (days) => {
    setWinCount(null);
    try { const { data } = await api.get(`/admin/customers/winback/preview?days=${days}`); setWinCount(data.count); }
    catch { setWinCount(0); }
  };
  const sendWinback = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/admin/customers/winback", win);
      toast.success(`Win-back sent to ${data.sent} inactive customer(s)`);
      setWinOpen(false);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4" data-testid="customers-hub">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary-700 text-white flex items-center justify-center"><Users className="h-5 w-5" /></div>
          <h2 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Customers</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input data-testid="customers-search" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / phone / email" className="pl-9 w-56" />
          </div>
          <Button data-testid="customers-filter-toggle" variant="outline" onClick={() => setShowFilters((s) => !s)} className="gap-1">
            <Filter className="h-4 w-4" /> Filters {activeFilters > 0 && <span className="ml-1 h-5 min-w-[20px] px-1 rounded-full bg-primary-600 text-white text-[10px] flex items-center justify-center">{activeFilters}</span>}
          </Button>
          <Button data-testid="customers-export" variant="outline" onClick={exportCsv} className="gap-1"><Download className="h-4 w-4" /> Export</Button>
          <Button data-testid="customers-winback" onClick={openWinback} className="gap-1 bg-primary-700 hover:bg-primary-800"><Gift className="h-4 w-4" /> Win-back</Button>
        </div>
      </div>

      {/* summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="customers-summary">
        <StatCard icon={Users} label="Total Customers" value={summary.total ?? 0} />
        <StatCard icon={TrendingUp} label="Lifetime GMV" value={fmt(summary.total_gmv || 0)} tone="emerald" />
        <StatCard icon={Wallet} label="Wallet Balance" value={fmt(summary.total_wallet || 0)} tone="violet" />
        <StatCard icon={ShoppingBag} label="Avg Bookings" value={summary.avg_bookings ?? 0} tone="amber" />
      </div>

      {showFilters && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 grid grid-cols-1 sm:grid-cols-4 gap-3" data-testid="customers-filters">
          <div>
            <label className="text-xs text-slate-500">From date</label>
            <PremiumDatePicker value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="cust-filter-date-from" placeholder="From date" />
          </div>
          <div>
            <label className="text-xs text-slate-500">To date</label>
            <PremiumDatePicker value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="cust-filter-date-to" placeholder="To date" />
          </div>
          <div>
            <label className="text-xs text-slate-500">City</label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} data-testid="cust-filter-city" placeholder="e.g. Patna" className="h-10" />
          </div>
          <div className="flex items-end">
            <Button variant="ghost" onClick={clearFilters} className="gap-1 text-slate-500"><X className="h-4 w-4" /> Clear</Button>
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} data-testid={`customers-tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`px-3.5 py-2 rounded-full text-sm whitespace-nowrap transition-all ${tab === t.key ? "bg-primary-700 text-white shadow" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"}`}>
            {t.label}
            <span className={`ml-1.5 text-[11px] ${tab === t.key ? "text-white/80" : "text-slate-400"}`}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary-200 dark:border-primary-900/40 bg-primary-50/70 dark:bg-primary-900/10 px-4 py-3 flex-wrap" data-testid="bulk-bar">
          <span className="text-sm font-medium text-primary-800 dark:text-primary-200">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <Button data-testid="bulk-message" size="sm" onClick={() => setBulkOpen(true)} className="gap-1 bg-primary-700 hover:bg-primary-800"><Send className="h-4 w-4" /> Message</Button>
            <Button data-testid="bulk-export" size="sm" variant="outline" onClick={exportCsv} className="gap-1"><Download className="h-4 w-4" /> Export CSV</Button>
            <Button data-testid="bulk-clear" size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-slate-500">Clear</Button>
          </div>
        </div>
      )}

      {/* table */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
              <tr>
                <th className="px-4 py-3 w-10"><input type="checkbox" data-testid="select-all" checked={allOnPageSelected} onChange={togglePage} className="h-4 w-4 rounded border-slate-300 accent-primary-700 cursor-pointer" /></th>
                {["Customer", "Phone", "City", "Bookings", "Total Spent", "Wallet", "Status", "Joined"].map((h) => (
                  <th key={h} className="text-left font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400">No customers found</td></tr>
              ) : pageRows.map((cst) => (
                <tr key={cst.id} data-testid={`customer-row-${cst.id}`}
                  className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 ${selected.has(cst.id) ? "bg-primary-50/40 dark:bg-primary-900/10" : ""}`}>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" data-testid={`select-${cst.id}`} checked={selected.has(cst.id)} onChange={() => toggleOne(cst.id)} className="h-4 w-4 rounded border-slate-300 accent-primary-700 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => onView?.(cst.id)}>
                    <div className="flex items-center gap-2.5">
                      {cst.photo ? <img src={cst.photo} alt="" className="h-8 w-8 rounded-full object-cover" />
                        : <span className="h-8 w-8 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">{(cst.name || "C").slice(0, 2).toUpperCase()}</span>}
                      <div>
                        <p className="font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          {cst.name || "—"}
                          {cst.is_repeat && <span title="Repeat customer" className="inline-flex items-center gap-0.5 text-[10px] bg-emerald-100 text-emerald-700 rounded px-1 py-0.5"><Repeat className="h-2.5 w-2.5" /></span>}
                        </p>
                        {cst.gender && <p className="text-[11px] text-slate-400 capitalize">{cst.gender}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 cursor-pointer" onClick={() => onView?.(cst.id)}>{cst.phone}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300 cursor-pointer" onClick={() => onView?.(cst.id)}>{cst.city || "—"}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-medium cursor-pointer" onClick={() => onView?.(cst.id)}>{cst.bookings_count || 0}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-100 cursor-pointer" onClick={() => onView?.(cst.id)}>{fmt(cst.total_spent || 0)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300 cursor-pointer" onClick={() => onView?.(cst.id)}>{fmt(cst.wallet_balance || 0)}</td>
                  <td className="px-4 py-3 cursor-pointer" onClick={() => onView?.(cst.id)}>
                    {cst.is_blocked
                      ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700"><Ban className="h-3 w-3" /> Blocked</span>
                      : cst.is_new
                        ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">New</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Active</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-xs cursor-pointer" onClick={() => onView?.(cst.id)}>{cst.created_at ? new Date(cst.created_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-500">
            <span data-testid="customers-page-info">{(curPage - 1) * pageSize + 1}–{Math.min(curPage * pageSize, rows.length)} of {rows.length}</span>
            <div className="flex items-center gap-1">
              <button data-testid="customers-prev" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage === 1}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-3 font-medium text-slate-700 dark:text-slate-200">{curPage} / {pageCount}</span>
              <button data-testid="customers-next" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={curPage === pageCount}
                className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* bulk message dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent data-testid="bulk-message-dialog">
          <DialogHeader><DialogTitle className="font-heading">Message {selected.size} customer(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={bulk.channel} onValueChange={(v) => setBulk((p) => ({ ...p, channel: v }))}>
              <SelectTrigger data-testid="bulk-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="push">In-app / Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Input data-testid="bulk-title" placeholder="Title" value={bulk.title} onChange={(e) => setBulk((p) => ({ ...p, title: e.target.value }))} />
            <Textarea data-testid="bulk-body" placeholder="Message…" rows={3} value={bulk.body} onChange={(e) => setBulk((p) => ({ ...p, body: e.target.value }))} />
            <Button data-testid="bulk-send" onClick={sendBulk} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">{busy ? "Sending…" : `Send to ${selected.size}`}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* win-back dialog */}
      <Dialog open={winOpen} onOpenChange={setWinOpen}>
        <DialogContent data-testid="winback-dialog">
          <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Gift className="h-5 w-5 text-primary-700" /> Win-back campaign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 text-sm text-slate-600 dark:text-slate-300">
              Target customers with no booking in the last{" "}
              <input data-testid="winback-days" type="number" min="1" value={win.days}
                onChange={(e) => { const v = Number(e.target.value) || 60; setWin((p) => ({ ...p, days: v })); refreshWinCount(v); }}
                className="w-16 mx-1 h-7 px-2 rounded border border-slate-200 dark:border-slate-700 dark:bg-slate-900 text-center" /> days.
              <span className="ml-1 font-semibold text-primary-700 dark:text-primary-300" data-testid="winback-count">
                {winCount === null ? "counting…" : `${winCount} match`}
              </span>
            </div>
            <Select value={win.channel} onValueChange={(v) => setWin((p) => ({ ...p, channel: v }))}>
              <SelectTrigger data-testid="winback-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="push">In-app / Push</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Input data-testid="winback-title" placeholder="Title" value={win.title} onChange={(e) => setWin((p) => ({ ...p, title: e.target.value }))} />
            <Textarea data-testid="winback-body" placeholder="Offer message…" rows={3} value={win.body} onChange={(e) => setWin((p) => ({ ...p, body: e.target.value }))} />
            <Button data-testid="winback-send" onClick={sendWinback} disabled={busy || !winCount} className="w-full bg-primary-700 hover:bg-primary-800">{busy ? "Sending…" : `Send campaign${winCount ? ` (${winCount})` : ""}`}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
