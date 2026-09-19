import { useEffect, useState, useCallback, useRef } from "react";
import { StatValue } from "@/components/ExactHover";
import {
  Wallet, TrendingUp, Users, Repeat, Clock, CheckCircle2, ClipboardPlus, ArrowRight,
  Loader2, Bell, AlertTriangle, BarChart3, QrCode, Download, X, History, Banknote,
  Send, Printer, Trophy, Crown, Medal, Tag as TagIcon,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import api, { fmt, fmtC } from "@/lib/api";
import { onlyDigits } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";

const STATUS_PILL = {
  completed: "bg-emerald-100 text-emerald-700", paid: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700", rejected: "bg-red-100 text-red-700",
  open: "bg-amber-100 text-amber-700", done: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};
const Pill = ({ s }) => <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize ${STATUS_PILL[s] || "bg-slate-100 text-slate-600"}`}>{(s || "").replace(/_/g, " ")}</span>;
const TONE = {
  slate: "bg-slate-50 border-slate-100", sky: "bg-sky-50 border-sky-100",
  emerald: "bg-emerald-50 border-emerald-100", amber: "bg-amber-50 border-amber-100",
  primary: "bg-primary-50 border-primary-100",
};
const Kpi = ({ label, value, tone = "slate", icon: Icon, sub }) => (
  <div className={`rounded-2xl border p-4 ${TONE[tone] || TONE.slate}`}>
    <div className="flex items-center gap-1.5 text-slate-500"><Icon className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">{label}</span></div>
    <p className="font-heading font-extrabold text-2xl text-slate-900 mt-1"><StatValue value={value} /></p>
    {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
  </div>
);

export const mediaUrl = (u) => (!u ? "" : (u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL}${u}`));

// Reusable branded print for bills & payout receipts (reuses the saved shop logo).
function printReceipt({ logo, shopName = "My Shop", title, rows = [], total, footer }) {
  const w = window.open("", "_blank", "width=720,height=920");
  if (!w) { toast.error("Allow pop-ups to print"); return; }
  const logoHtml = logo ? `<img class="logo" src="${logo}"/>` : "";
  const rowsHtml = rows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join("");
  const totalHtml = (total !== undefined && total !== null)
    ? `<div class="total"><span>Total</span><span>${total}</span></div>` : "";
  w.document.write(`<!doctype html><html><head><title>${shopName} — ${title}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a}
      body{padding:40px;background:#fff}
      .doc{max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}
      .head{background:linear-gradient(135deg,#0D47A1,#1565C0);color:#fff;padding:24px 28px;display:flex;align-items:center;gap:14px}
      .logo{width:56px;height:56px;border-radius:14px;object-fit:cover;background:#fff;padding:4px}
      .head h1{font-size:22px;font-weight:800;color:#fff}
      .head p{font-size:12px;opacity:.85;letter-spacing:1px;text-transform:uppercase}
      .title{padding:18px 28px 0;font-size:15px;font-weight:700;color:#334155}
      table{width:100%;border-collapse:collapse;padding:0 28px;margin:12px 0}
      td{padding:9px 28px;font-size:14px;border-bottom:1px solid #f1f5f9}
      td.k{color:#64748b}.v{text-align:right;font-weight:600}
      .total{display:flex;justify-content:space-between;padding:16px 28px;font-size:18px;font-weight:800;background:#f8fafc;border-top:2px solid #e2e8f0}
      .foot{padding:16px 28px;font-size:12px;color:#94a3b8;text-align:center}
      @media print{body{padding:0}.doc{border:none}}
    </style></head><body onload="window.print()">
    <div class="doc">
      <div class="head">${logoHtml}<div><p>AzoApp Partner</p><h1>${shopName}</h1></div></div>
      <div class="title">${title}</div>
      <table><tbody>${rowsHtml}</tbody></table>
      ${totalHtml}
      <div class="foot">${footer || "Thank you for your business • Generated via AzoApp"}</div>
    </div></body></html>`);
  w.document.close();
}


/* ---------------- Overview KPIs (Module 2.2) ---------------- */
export function OverviewKPIs({ ov }) {
  if (!ov) return null;
  const t = ov.today_overview, c = ov.commission, w = ov.wallet, cu = ov.customers;
  return (
    <div className="space-y-5 mb-6" data-testid="merchant-overview-kpis">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Today&apos;s Overview</p>
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <Kpi label="Requests" value={t.requests} icon={ClipboardPlus} tone="sky" />
          <Kpi label="Completed" value={t.completed} icon={CheckCircle2} tone="emerald" />
          <Kpi label="Pending" value={t.pending} icon={Clock} tone="amber" />
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Commission Earned</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Today" value={fmt(c.today)} icon={TrendingUp} tone="emerald" />
          <Kpi label="This Week" value={fmt(c.week)} icon={TrendingUp} tone="emerald" />
          <Kpi label="This Month" value={fmt(c.month)} icon={TrendingUp} tone="emerald" />
          <Kpi label="Lifetime" value={fmt(c.lifetime)} icon={TrendingUp} tone="primary" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Wallet Balance</p>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Available" value={fmt(w.available)} icon={Wallet} tone="primary" />
            <Kpi label="Pending" value={fmt(w.pending)} icon={Clock} tone="amber" />
            <Kpi label="Withdrawable" value={fmt(w.withdrawable)} icon={Banknote} tone="emerald" />
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Customers</p>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Total" value={cu.total} icon={Users} tone="sky" />
            <Kpi label="Repeat" value={cu.repeat} icon={Repeat} tone="primary" />
            <Kpi label="Repeat %" value={`${cu.repeat_pct}%`} icon={BarChart3} tone="emerald" />
          </div>
        </div>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Recent Activity</p>
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left"><tr>
              <th className="px-4 py-2.5 font-semibold">Booking</th><th className="px-4 py-2.5 font-semibold">Customer</th>
              <th className="px-4 py-2.5 font-semibold">Service</th><th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
            </tr></thead>
            <tbody>
              {ov.recent_activity.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">No activity yet</td></tr>}
              {ov.recent_activity.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-800">#{r.booking_code}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.customer_name || "—"}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.service || "—"}</td>
                  <td className="px-4 py-2.5"><Pill s={r.status} /></td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{fmt(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------- My Customers (Module 2.3) + Bulk Reminders ---------------- */
export function MyCustomers({ shopName = "My Shop", logoUrl = "" }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState(null);
  const [hLoading, setHLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({ title: "AC AMC follow-up", type: "amc", due_date: "", note: "", recurrence_months: 0 });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [tagOpen, setTagOpen] = useState(null);
  const [tagFilter, setTagFilter] = useState("");
  const [insights, setInsights] = useState(null);
  const [vipThreshold, setVipThreshold] = useState("");
  const [savingVip, setSavingVip] = useState(false);

  const loadInsights = useCallback(() => { api.get("/merchant/tag-insights").then((r) => setInsights(r.data)).catch(() => {}); }, []);
  useEffect(() => { loadInsights(); }, [loadInsights]);
  useEffect(() => { api.get("/merchant/settings").then((r) => setVipThreshold(r.data.vip_threshold ? String(r.data.vip_threshold) : "")).catch(() => {}); }, []);

  const saveVip = async () => {
    setSavingVip(true);
    try { await api.put("/merchant/settings", { vip_threshold: Number(vipThreshold) || 0 }); toast.success(Number(vipThreshold) > 0 ? `Auto-VIP set above ₹${vipThreshold}` : "Auto-VIP turned off"); load(); loadInsights(); }
    catch (e) { toast.error("Failed"); }
    finally { setSavingVip(false); }
  };
  const printBill = (it) => printReceipt({
    logo: mediaUrl(logoUrl), shopName, title: "Service Bill",
    rows: [["Booking", `#${it.booking_code || ""}`], ["Service", it.service || "Service"],
           ["Status", (it.status || "").replace(/_/g, " ")],
           ["Date", it.created_at ? new Date(it.created_at).toLocaleDateString() : "—"],
           ["Partner", it.partner_name || "—"]],
    total: fmt(it.amount),
  });

  const CUST_TAGS = [["vip", "VIP"], ["amc", "AMC"], ["regular", "Regular"], ["lead", "Lead"]];
  const TAG_STYLE = { vip: "bg-amber-100 text-amber-700", amc: "bg-primary-50 text-primary-700", regular: "bg-slate-100 text-slate-600", lead: "bg-emerald-100 text-emerald-700" };

  const toggleTag = async (c, tag) => {
    const cur = c.tags || [];
    const next = cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag];
    setItems((arr) => arr.map((x) => x.customer_key === c.customer_key ? { ...x, tags: next } : x));
    try { await api.put(`/merchant/customers/${encodeURIComponent(c.customer_key)}/tags`, { tags: next }); loadInsights(); }
    catch (e) { toast.error("Failed to save tag"); load(); }
  };

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/merchant/customers?q=${encodeURIComponent(q)}`).then((r) => setItems(r.data.items || [])).finally(() => setLoading(false));
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const toggle = (key) => setSelected((s) => s.includes(key) ? s.filter((k) => k !== key) : [...s, key]);
  const allKeys = items.map((c) => c.customer_key);
  const allSelected = selected.length > 0 && selected.length === allKeys.length;
  const toggleAll = () => setSelected(allSelected ? [] : allKeys);

  const openHistory = async (c) => {
    setHLoading(true); setHistory({ loading: true, customer: c });
    try { const { data } = await api.get(`/merchant/customers/${encodeURIComponent(c.customer_key)}/history`); setHistory({ ...data, customer: c }); }
    catch { toast.error("Failed to load history"); setHistory(null); }
    finally { setHLoading(false); }
  };
  const repeat = async (c) => {
    try { await api.post("/merchant/repeat-service", { customer_name: c.name, customer_phone: c.customer_phone, service: c.last_service }); toast.success("Repeat-service reminder created"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const sendBulk = async (target) => {
    if (!bulk.title.trim()) return toast.error("Enter a reminder title");
    setBulkBusy(true);
    try {
      const body = { ...bulk };
      if (target && target.startsWith("tag:")) { body.target = "tag"; body.tag = target.slice(4); }
      else if (target) body.target = target;
      else body.customer_keys = selected;
      const { data } = await api.post("/merchant/reminders/bulk", body);
      toast.success(`Reminder sent to ${data.created} customer${data.created === 1 ? "" : "s"}`);
      setBulkOpen(false); setSelected([]);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBulkBusy(false); }
  };

  const filtered = tagFilter ? items.filter((c) => (c.tags || []).includes(tagFilter)) : items;

  return (
    <div data-testid="merchant-customers">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-heading font-bold text-lg">My Customers <span className="text-slate-400 text-sm">({filtered.length})</span></h3>
        <div className="flex items-center gap-2 flex-wrap">
          <PremiumSelect data-testid="tag-filter" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="!h-9 !w-auto min-w-[130px] rounded-md">
            <option value="">All tags</option>
            {CUST_TAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </PremiumSelect>
          <Button variant="outline" size="sm" data-testid="bulk-tag-vip" onClick={() => setBulkOpen("tag:vip")} className="border-amber-200 text-amber-700"><Send className="h-3.5 w-3.5 mr-1" /> VIP group</Button>
          <Button variant="outline" size="sm" data-testid="bulk-all-repeat" onClick={() => setBulkOpen("all_repeat")} className="border-primary-200 text-primary-700"><Send className="h-3.5 w-3.5 mr-1" /> Repeat group</Button>
          <Input data-testid="customers-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone" className="w-44" />
        </div>
      </div>

      {insights && (
        <div className="mb-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 flex-1" data-testid="tag-insights">
            {[["Total", insights.total, "bg-slate-50 text-slate-700"],
              ["VIP", insights.counts.vip, "bg-amber-50 text-amber-700"],
              ["AMC", insights.counts.amc, "bg-primary-50 text-primary-700"],
              ["Regular", insights.counts.regular, "bg-slate-50 text-slate-600"],
              ["Lead", insights.counts.lead, "bg-emerald-50 text-emerald-700"],
              ["Untagged", insights.untagged, "bg-slate-50 text-slate-400"]].map(([l, v, cls]) => (
              <div key={l} className={`rounded-xl px-3 py-2 text-center ${cls}`}>
                <p className="font-heading font-extrabold text-lg leading-none">{v}</p>
                <p className="text-[10px] uppercase tracking-wider font-bold mt-1">{l}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2" data-testid="auto-vip-setting">
            <span className="text-xs font-semibold text-amber-700 whitespace-nowrap">Auto-VIP above ₹</span>
            <Input data-testid="vip-threshold" type="number" value={vipThreshold} onChange={(e) => setVipThreshold(e.target.value)} placeholder="0 = off" className="h-8 w-24" />
            <Button size="sm" data-testid="vip-save" onClick={saveVip} disabled={savingVip} className="h-8 bg-amber-500 hover:bg-amber-600">{savingVip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</Button>
          </div>
        </div>
      )}

      {selected.length > 0 && (
        <div className="mb-3 rounded-xl bg-primary-50 border border-primary-100 p-3 flex items-center justify-between gap-3" data-testid="bulk-action-bar">
          <span className="text-sm font-medium text-primary-700">{selected.length} customer{selected.length === 1 ? "" : "s"} selected</span>
          <div className="flex gap-2">
            <Button size="sm" data-testid="bulk-send-open" onClick={() => setBulkOpen(true)} className="bg-primary-700 hover:bg-primary-800"><Bell className="h-3.5 w-3.5 mr-1" /> Send Reminder</Button>
            <Button size="sm" variant="outline" onClick={() => setSelected([])}>Clear</Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left"><tr>
            <th className="px-4 py-3 w-10"><input type="checkbox" data-testid="cust-select-all" checked={allSelected} onChange={toggleAll} /></th>
            <th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Tags</th><th className="px-4 py-3 font-semibold">Bookings</th>
            <th className="px-4 py-3 font-semibold">Last Service</th><th className="px-4 py-3 font-semibold">Total Spent</th>
            <th className="px-4 py-3 font-semibold text-right">Actions</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
              : filtered.length === 0 ? <tr><td colSpan="7" className="px-4 py-10 text-center text-slate-400">No customers yet</td></tr>
              : filtered.map((c) => (
                <tr key={c.customer_key} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3"><input type="checkbox" data-testid={`cust-check-${c.customer_key}`} checked={selected.includes(c.customer_key)} onChange={() => toggle(c.customer_key)} /></td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800 flex items-center gap-2">{c.name}{c.repeat && <Badge className="bg-primary-50 text-primary-700 border-0 text-[10px]">Repeat</Badge>}</div>
                    <p className="text-[11px] text-slate-400">{c.customer_phone}</p>
                  </td>
                  <td className="px-4 py-3 relative">
                    <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                      {(c.tags || []).map((tg) => <span key={tg} className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-semibold ${TAG_STYLE[tg] || "bg-slate-100 text-slate-600"}`}>{tg}</span>)}
                      <button data-testid={`cust-tagbtn-${c.customer_key}`} onClick={() => setTagOpen(tagOpen === c.customer_key ? null : c.customer_key)} className="h-6 w-6 rounded-full border border-dashed border-slate-300 text-slate-400 hover:border-primary-400 hover:text-primary-600 grid place-items-center"><TagIcon className="h-3 w-3" /></button>
                    </div>
                    {tagOpen === c.customer_key && (
                      <div className="absolute z-20 mt-1 left-4 bg-white rounded-xl border border-slate-200 shadow-lg p-2 w-40" data-testid={`cust-tageditor-${c.customer_key}`}>
                        {CUST_TAGS.map(([v, l]) => (
                          <label key={v} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                            <input type="checkbox" data-testid={`cust-tag-${c.customer_key}-${v}`} checked={(c.tags || []).includes(v)} onChange={() => toggleTag(c, v)} /> {l}
                          </label>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.bookings} <span className="text-slate-400 text-xs">({c.completed} done)</span></td>
                  <td className="px-4 py-3 text-slate-600">{c.last_service || "—"}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{fmt(c.total_spent)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button size="sm" variant="outline" data-testid={`cust-history-${c.customer_key}`} onClick={() => openHistory(c)} className="mr-1"><History className="h-3.5 w-3.5 mr-1" />History</Button>
                    <Button size="sm" variant="outline" onClick={() => repeat(c)} className="border-primary-200 text-primary-700"><Repeat className="h-3.5 w-3.5 mr-1" />Repeat</Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* bulk reminder modal */}
      {bulkOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setBulkOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="bulk-reminder-modal">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-heading font-bold text-lg">Bulk Service Reminder</h4>
              <button onClick={() => setBulkOpen(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-3">{bulkOpen === "all_repeat" ? "Sends to all your repeat customers." : (typeof bulkOpen === "string" && bulkOpen.startsWith("tag:")) ? `Sends to all customers tagged "${bulkOpen.slice(4).toUpperCase()}".` : `Sends to ${selected.length} selected customer(s).`}</p>
            <div className="space-y-3">
              <Input data-testid="bulk-title" value={bulk.title} onChange={(e) => setBulk({ ...bulk, title: e.target.value })} placeholder="Reminder title" className="h-11" />
              <div className="grid grid-cols-2 gap-2">
                <PremiumSelect value={bulk.type} onChange={(e) => setBulk({ ...bulk, type: e.target.value })} searchable={false} className="!h-11 rounded-md">
                  <option value="amc">AMC</option><option value="follow_up">Follow-up</option><option value="repeat">Repeat service</option>
                </PremiumSelect>
                <PremiumDatePicker value={bulk.due_date} onChange={(e) => setBulk({ ...bulk, due_date: e.target.value })} className="!h-11 rounded-md" />
              </div>
              <Textarea value={bulk.note} onChange={(e) => setBulk({ ...bulk, note: e.target.value })} placeholder="Note (optional)" />
              <PremiumSelect data-testid="bulk-recurrence" value={bulk.recurrence_months} onChange={(e) => setBulk({ ...bulk, recurrence_months: Number(e.target.value) })} searchable={false} className="!h-11 w-full rounded-md">
                <option value={0}>One-time reminder</option>
                <option value={3}>Repeat every 3 months</option><option value={6}>Repeat every 6 months</option><option value={12}>Repeat yearly</option>
              </PremiumSelect>
              <Button data-testid="bulk-send-confirm" onClick={() => sendBulk(typeof bulkOpen === "string" ? bulkOpen : null)} disabled={bulkBusy} className="w-full h-11 bg-primary-700 hover:bg-primary-800">
                {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Send Reminder</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {history && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={() => setHistory(null)}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div><h4 className="font-heading font-bold text-lg">{history.customer?.name}</h4><p className="text-xs text-slate-400">{history.customer?.customer_phone} · Service history</p></div>
              <button onClick={() => setHistory(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            {hLoading || history.loading ? <div className="py-10 text-center"><Loader2 className="h-6 w-6 animate-spin inline text-primary-600" /></div>
              : (history.items || []).length === 0 ? <p className="py-8 text-center text-slate-400 text-sm">No service history</p>
              : <div className="space-y-2">
                  {history.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between border border-slate-100 rounded-xl p-3">
                      <div><p className="font-medium text-slate-800 text-sm">#{it.booking_code} · {it.service || "Service"}</p><p className="text-[11px] text-slate-400">{it.created_at ? new Date(it.created_at).toLocaleDateString() : ""} {it.partner_name ? `· ${it.partner_name}` : ""}</p></div>
                      <div className="flex items-center gap-2">
                        <div className="text-right"><Pill s={it.status} /><p className="text-sm font-semibold text-slate-700 mt-1">{fmt(it.amount)}</p></div>
                        <Button size="sm" variant="outline" data-testid={`bill-${it.id}`} onClick={() => printBill(it)}><Printer className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Wallet & Withdrawal (Module 2.3) ---------------- */
export function WalletWithdraw({ kycApproved, shopName = "My Shop", logoUrl = "" }) {
  const [data, setData] = useState(null);
  const [wds, setWds] = useState([]);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("upi");
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState({ account_holder: "", bank_name: "", account_number: "", ifsc: "" });
  const [cheque, setCheque] = useState({ payee: "" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/merchant/wallet").then((r) => setData(r.data)).catch(() => {});
    api.get("/merchant/wallet/withdrawals").then((r) => setWds(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      await api.post("/merchant/wallet/withdraw", { amount: amt, method, upi_id: upi, bank, cheque });
      toast.success("Withdrawal request submitted");
      setAmount(""); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const s = data?.summary; const cfg = data?.config;
  const printPayout = (w) => printReceipt({
    logo: mediaUrl(logoUrl), shopName, title: "Payout Receipt",
    rows: [["Amount", fmt(w.amount)], ["Processing Fee", fmt(w.fee)],
           ["Net Paid", fmt(w.net_amount)], ["Method", (w.method || "").toUpperCase()],
           ["Reference", (w.id || "").slice(0, 8).toUpperCase()],
           ["Status", w.status], ["Date", w.requested_at ? new Date(w.requested_at).toLocaleDateString() : "—"]],
    total: fmt(w.net_amount), footer: "Payout processed via AzoApp",
  });
  return (
    <div data-testid="merchant-wallet">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <Kpi label="Available" value={fmt(s?.available_balance || 0)} icon={Wallet} tone="primary" />
        <Kpi label="Withdrawable" value={fmt(s?.withdrawable_balance || 0)} icon={Banknote} tone="emerald" />
        <Kpi label="Pending" value={fmt(s?.pending_balance || 0)} icon={Clock} tone="amber" />
        <Kpi label="Total Withdrawn" value={fmt(s?.total_withdrawn || 0)} icon={TrendingUp} tone="slate" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h3 className="font-heading font-bold text-lg mb-1">Request Withdrawal</h3>
          <p className="text-xs text-slate-400 mb-4">Min {fmt(cfg?.min_withdrawal || 0)} · Max {fmt(cfg?.max_withdrawal || 0)}</p>
          {!kycApproved && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700 mb-4 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" /> Complete KYC &amp; get approved to enable withdrawals.
            </div>
          )}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-semibold text-slate-700">Amount</label>
              <Input data-testid="wd-amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Enter amount" className="h-11 mt-1" />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-700 mb-1 block">Method</label>
              <div className="grid grid-cols-3 gap-2">
                {[["upi", "UPI"], ["bank", "Bank"], ["cheque", "Cheque"]].map(([v, l]) => (
                  <button key={v} type="button" data-testid={`wd-method-${v}`} onClick={() => setMethod(v)}
                    className={`rounded-xl border-2 py-2.5 text-sm font-medium transition ${method === v ? "border-primary-600 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600 hover:border-primary-300"}`}>{l}</button>
                ))}
              </div>
            </div>
            {method === "upi" && (
              <Input data-testid="wd-upi" value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="UPI ID (name@bank)" className="h-11" />
            )}
            {method === "bank" && (
              <div className="grid grid-cols-2 gap-2">
                <Input value={bank.account_holder} onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} placeholder="Account holder" className="h-11" />
                <Input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} placeholder="Bank name" className="h-11" />
                <Input data-testid="wd-acct" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: onlyDigits(e.target.value, 18) })} placeholder="Account number" className="h-11" />
                <Input value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} placeholder="IFSC" className="h-11 uppercase" />
              </div>
            )}
            {method === "cheque" && (
              <Input data-testid="wd-cheque" value={cheque.payee} onChange={(e) => setCheque({ payee: e.target.value })} placeholder="Payee name (on cheque)" className="h-11" />
            )}
            <Button data-testid="wd-submit" onClick={submit} disabled={busy || !kycApproved} className="w-full h-11 bg-primary-700 hover:bg-primary-800">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Request Withdrawal"}
            </Button>
          </div>
        </div>

        <div>
          <h3 className="font-heading font-bold text-lg mb-3">Payout History</h3>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-testid="payout-history">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left"><tr>
                <th className="px-4 py-2.5 font-semibold">Amount</th><th className="px-4 py-2.5 font-semibold">Method</th>
                <th className="px-4 py-2.5 font-semibold">Status</th><th className="px-4 py-2.5 font-semibold">Date</th><th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody>
                {wds.length === 0 && <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400">No withdrawals yet</td></tr>}
                {wds.map((w) => (
                  <tr key={w.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{fmt(w.net_amount)}</td>
                    <td className="px-4 py-2.5 uppercase text-xs text-slate-500">{w.method}</td>
                    <td className="px-4 py-2.5"><Pill s={w.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{w.requested_at ? new Date(w.requested_at).toLocaleDateString() : ""}</td>
                    <td className="px-4 py-2.5 text-right"><button data-testid={`payout-receipt-${w.id}`} onClick={() => printPayout(w)} className="text-slate-400 hover:text-primary-600" title="Print receipt"><Printer className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Reminders (Module 2.3) ---------------- */
export function Reminders() {
  const [items, setItems] = useState([]);
  const [view, setView] = useState("list");
  const [f, setF] = useState({ title: "", type: "follow_up", customer_name: "", customer_phone: "", due_date: "", note: "", recurrence_months: 0 });
  const load = useCallback(() => { api.get("/merchant/reminders").then((r) => setItems(r.data || [])); }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!f.title.trim()) return toast.error("Enter a title");
    try { await api.post("/merchant/reminders", f); toast.success("Reminder added"); setF({ title: "", type: "follow_up", customer_name: "", customer_phone: "", due_date: "", note: "", recurrence_months: 0 }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const done = async (id) => { await api.put(`/merchant/reminders/${id}`, { status: "done" }); load(); };
  return (
    <div className="grid lg:grid-cols-2 gap-5" data-testid="merchant-reminders">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-bold text-lg mb-3">New Service Reminder</h3>
        <div className="space-y-3">
          <Input data-testid="rem-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title (e.g. AC AMC follow-up)" className="h-11" />
          <div className="grid grid-cols-2 gap-2">
            <PremiumSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} searchable={false} className="!h-11 rounded-md">
              <option value="follow_up">Follow-up</option><option value="amc">AMC</option><option value="repeat">Repeat service</option>
            </PremiumSelect>
            <PremiumDatePicker value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className="!h-11 rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} placeholder="Customer name" className="h-11" />
            <Input value={f.customer_phone} onChange={(e) => setF({ ...f, customer_phone: onlyDigits(e.target.value, 10) })} placeholder="Customer phone" className="h-11" />
          </div>
          <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-500 whitespace-nowrap">Repeat every</span>
            <PremiumSelect data-testid="rem-recurrence" value={f.recurrence_months} onChange={(e) => setF({ ...f, recurrence_months: Number(e.target.value) })} searchable={false} className="!h-10 flex-1 rounded-md">
              <option value={0}>Off (one-time)</option>
              <option value={3}>3 months</option><option value={6}>6 months</option><option value={12}>12 months (yearly)</option>
            </PremiumSelect>
          </div>
          <Button data-testid="rem-submit" onClick={create} className="w-full h-11 bg-primary-700 hover:bg-primary-800"><Bell className="h-4 w-4 mr-1" /> Add Reminder</Button>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-bold text-lg">Upcoming Reminders</h3>
          <div className="flex gap-1">
            <button data-testid="rem-view-list" onClick={() => setView("list")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${view === "list" ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-600"}`}>List</button>
            <button data-testid="rem-view-calendar" onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-full text-xs font-medium ${view === "calendar" ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-600"}`}>Calendar</button>
          </div>
        </div>
        {view === "calendar" ? <ReminderCalendar items={items} />
          : <div className="space-y-2">
          {items.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No reminders</div>}
          {items.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-slate-800 flex items-center gap-2 flex-wrap">{r.title} <Badge className="bg-slate-100 text-slate-600 border-0 text-[10px] capitalize">{r.type.replace("_", " ")}</Badge>{r.recurrence_months > 0 && <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px]"><Repeat className="h-2.5 w-2.5 mr-0.5 inline" />every {r.recurrence_months}mo</Badge>}</div>
                <p className="text-[11px] text-slate-400">{r.customer_name} {r.customer_phone && `· ${r.customer_phone}`} {r.due_date && `· due ${r.due_date}`}</p>
              </div>
              <div className="flex items-center gap-2">
                <Pill s={r.status} />
                {r.status === "pending" && <Button size="sm" variant="outline" onClick={() => done(r.id)}><CheckCircle2 className="h-3.5 w-3.5 mr-1" />Done</Button>}
              </div>
            </div>
          ))}
        </div>}
      </div>
    </div>
  );
}

/* ---------------- Reminder month calendar ---------------- */
function ReminderCalendar({ items }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = cursor.getFullYear(), mo = cursor.getMonth();
  const firstDow = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);
  const byDate = {};
  (items || []).forEach((r) => { if (r.due_date) { (byDate[r.due_date] = byDate[r.due_date] || []).push(r); } });
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthName = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const shift = (n) => setCursor(new Date(y, mo + n, 1));
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4" data-testid="reminder-calendar">
      <div className="flex items-center justify-between mb-3">
        <button data-testid="cal-prev" onClick={() => shift(-1)} className="h-8 w-8 rounded-lg border border-slate-200 grid place-items-center hover:bg-slate-50">‹</button>
        <p className="font-heading font-bold text-slate-800">{monthName}</p>
        <button data-testid="cal-next" onClick={() => shift(1)} className="h-8 w-8 rounded-lg border border-slate-200 grid place-items-center hover:bg-slate-50">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-400 mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const ds = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const rem = byDate[ds] || [];
          const isToday = ds === todayStr;
          return (
            <div key={ds} className={`min-h-[64px] rounded-lg border p-1 text-left ${isToday ? "border-primary-400 bg-primary-50/40" : "border-slate-100"}`}>
              <p className={`text-[11px] font-semibold ${isToday ? "text-primary-700" : "text-slate-500"}`}>{d}</p>
              <div className="space-y-0.5 mt-0.5">
                {rem.slice(0, 2).map((r) => (
                  <div key={r.id} title={`${r.title} · ${r.customer_name || ""}`}
                    className={`text-[9px] truncate rounded px-1 py-0.5 ${r.status === "done" ? "bg-slate-100 text-slate-400 line-through" : r.type === "amc" ? "bg-primary-100 text-primary-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {r.title}
                  </div>
                ))}
                {rem.length > 2 && <p className="text-[9px] text-slate-400">+{rem.length - 2} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


/* ---------------- Complaints (Module 2.3) ---------------- */
export function Complaints() {
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ subject: "", description: "", booking_code: "", category: "service" });
  const load = useCallback(() => { api.get("/merchant/complaints").then((r) => setItems(r.data || [])); }, []);
  useEffect(() => { load(); }, [load]);
  const create = async () => {
    if (!f.subject.trim()) return toast.error("Enter a subject");
    try { await api.post("/merchant/complaints", f); toast.success("Complaint raised"); setF({ subject: "", description: "", booking_code: "", category: "service" }); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <div className="grid lg:grid-cols-2 gap-5" data-testid="merchant-complaints">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-heading font-bold text-lg mb-3">Raise a Complaint</h3>
        <div className="space-y-3">
          <Input data-testid="cmp-subject" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Subject" className="h-11" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={f.booking_code} onChange={(e) => setF({ ...f, booking_code: e.target.value })} placeholder="Booking code (optional)" className="h-11" />
            <PremiumSelect value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} searchable={false} className="!h-11 rounded-md">
              <option value="service">Service dispute</option><option value="payment">Payment</option><option value="partner">Partner</option><option value="other">Other</option>
            </PremiumSelect>
          </div>
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Describe the issue" />
          <Button data-testid="cmp-submit" onClick={create} className="w-full h-11 bg-primary-700 hover:bg-primary-800"><AlertTriangle className="h-4 w-4 mr-1" /> Submit Complaint</Button>
        </div>
      </div>
      <div>
        <h3 className="font-heading font-bold text-lg mb-3">My Complaints</h3>
        <div className="space-y-2">
          {items.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No complaints raised</div>}
          {items.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between"><p className="font-medium text-slate-800">{c.subject}</p><Pill s={c.status} /></div>
              <p className="text-sm text-slate-500 mt-1">{c.description}</p>
              <p className="text-[11px] text-slate-400 mt-1 capitalize">{c.category} {c.booking_code && `· #${c.booking_code}`} · {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Performance Analytics (Module 2.3) ---------------- */
export function Performance() {
  const [period, setPeriod] = useState("monthly");
  const [series, setSeries] = useState([]);
  useEffect(() => { api.get(`/merchant/performance?period=${period}`).then((r) => setSeries(r.data.series || [])); }, [period]);
  const max = Math.max(1, ...series.map((s) => s.earning));
  return (
    <div data-testid="merchant-performance">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-heading font-bold text-lg">Performance Analytics</h3>
        <div className="flex gap-1.5">
          {[["monthly", "Monthly"], ["quarterly", "Quarterly"], ["yearly", "Yearly"]].map(([v, l]) => (
            <button key={v} data-testid={`perf-${v}`} onClick={() => setPeriod(v)}
              className={`px-3.5 py-1.5 rounded-full text-sm ${period === v ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-600"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {series.length === 0 ? <p className="py-10 text-center text-slate-400 text-sm">No data for this period</p>
          : <div className="space-y-3">
              {series.map((s) => (
                <div key={s.period} className="flex items-center gap-3">
                  <span className="w-20 text-xs font-medium text-slate-500 shrink-0">{s.period}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(6, s.earning / max * 100)}%` }}>
                      <span className="text-[11px] text-white font-semibold">{fmt(s.earning)}</span>
                    </div>
                  </div>
                  <span className="w-16 text-right text-xs text-slate-400 shrink-0">{s.bookings} jobs</span>
                </div>
              ))}
            </div>}
      </div>
    </div>
  );
}

/* ---------------- Top Customers leaderboard (quick rebook) ---------------- */
const RANK = ["text-amber-500", "text-slate-400", "text-orange-400"];
export function TopCustomers() {
  const [period, setPeriod] = useState("month");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.get(`/merchant/top-customers?period=${period}`).then((r) => setItems(r.data.items || [])).finally(() => setLoading(false));
  }, [period]);
  useEffect(() => { load(); }, [load]);
  const rebook = async (c) => {
    try { await api.post("/merchant/repeat-service", { customer_name: c.name, customer_phone: c.customer_phone, service: c.last_service }); toast.success(`Rebook reminder created for ${c.name}`); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  return (
    <div data-testid="merchant-top-customers">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="font-heading font-bold text-lg flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" /> Top Customers</h3>
        <div className="flex gap-1.5">
          {[["month", "This Month"], ["all", "All Time"]].map(([v, l]) => (
            <button key={v} data-testid={`top-${v}`} onClick={() => setPeriod(v)}
              className={`px-3.5 py-1.5 rounded-full text-sm ${period === v ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-600"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {loading ? <div className="bg-white rounded-xl border border-slate-200 p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-primary-600" /></div>
          : items.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">No customer data for this period yet</div>
          : items.map((c, i) => (
            <div key={c.customer_key} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4">
              <div className="w-9 text-center shrink-0">
                {i < 3 ? <Crown className={`h-6 w-6 mx-auto ${RANK[i]}`} /> : <span className="font-heading font-extrabold text-lg text-slate-400">#{i + 1}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-800 flex items-center gap-2 truncate">{c.name}{c.repeat && <Badge className="bg-primary-50 text-primary-700 border-0 text-[10px]">Repeat</Badge>}</div>
                <p className="text-[11px] text-slate-400">{c.customer_phone} · {c.bookings} bookings · {c.completed} completed</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-heading font-bold text-slate-800">{fmt(c.total_spent)}</p>
                <p className="text-[11px] text-slate-400">spent</p>
              </div>
              <Button size="sm" data-testid={`rebook-${c.customer_key}`} onClick={() => rebook(c)} className="bg-primary-700 hover:bg-primary-800 shrink-0"><Repeat className="h-3.5 w-3.5 mr-1" />Rebook</Button>
            </div>
          ))}
      </div>
    </div>
  );
}

/* ---------------- Scan QR + themed printable poster (Module 2.3) ---------------- */
const POSTER_THEMES = {
  blue: { label: "Ocean", from: "#0D47A1", to: "#1565C0", swatch: "from-blue-800 to-blue-500" },
  emerald: { label: "Emerald", from: "#065f46", to: "#10b981", swatch: "from-emerald-800 to-emerald-500" },
  purple: { label: "Royal", from: "#4c1d95", to: "#7c3aed", swatch: "from-violet-900 to-violet-600" },
  sunset: { label: "Sunset", from: "#7c2d12", to: "#ea580c", swatch: "from-orange-900 to-orange-500" },
  dark: { label: "Midnight", from: "#0f172a", to: "#334155", swatch: "from-slate-900 to-slate-600" },
};

/* ---- poster canvas helpers (used by Download / Print so both match the preview) ---- */
function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function _drawSpaced(ctx, text, cx, y, sp) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let x = cx - total / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((ch, i) => { ctx.fillText(ch, x, y); x += widths[i] + sp; });
  ctx.textAlign = prev;
}
function _loadImg(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export function ScanQR({ code, shopName = "My Shop" }) {
  const [theme, setTheme] = useState("blue");
  const [logo, setLogo] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef(null);
  const link = `${window.location.origin}/?ref=${code || ""}`;
  const t = POSTER_THEMES[theme];
  const getCanvas = () => document.querySelector("#merchant-qr canvas");

  useEffect(() => {
    api.get("/merchant/poster-logo").then((r) => setLogo(mediaUrl(r.data.logo_url))).catch(() => {});
  }, []);

  const onLogo = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2MB");
    setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/merchant/poster-logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setLogo(mediaUrl(data.logo_url));
      toast.success("Logo saved — it will be remembered next time");
    } catch (e) { toast.error(e?.response?.data?.detail || "Upload failed"); }
    finally { setLogoBusy(false); }
  };
  const removeLogo = async () => {
    try { await api.delete("/merchant/poster-logo"); setLogo(""); toast.success("Logo removed"); }
    catch { toast.error("Failed"); }
  };
  /* Render the FULL premium poster (gradient + logo + shop + QR + CTA + ref) to a
     high-res PNG so Download and Print both match the on-screen preview exactly. */
  const buildPosterDataUrl = async () => {
    const qr = getCanvas();
    if (!qr) return null;
    const S = 3;            // hi-res scale (600 -> 1800px wide, print-ready)
    const W = 600;
    const logoImg = logo ? await _loadImg(logo) : null;
    let y = 52;
    const layout = [];
    if (logoImg) { layout.push({ type: "logo", y }); y += 84 + 16; }
    layout.push({ type: "brand", y }); y += 28;
    layout.push({ type: "shop", y }); y += 52;
    layout.push({ type: "tag", y }); y += 40;
    const qrBox = 300;
    layout.push({ type: "qr", y, box: qrBox }); y += qrBox + 10;
    layout.push({ type: "cta", y }); y += 44;
    layout.push({ type: "sub", y }); y += 34;
    layout.push({ type: "code", y }); y += 52;
    const H = y + 44;

    const c = document.createElement("canvas");
    c.width = W * S; c.height = H * S;
    const ctx = c.getContext("2d");
    ctx.scale(S, S);
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, t.from); grad.addColorStop(1, t.to);
    _roundRect(ctx, 0, 0, W, H, 28); ctx.fillStyle = grad; ctx.fill();
    ctx.textAlign = "center";
    const cx = W / 2;
    for (const item of layout) {
      if (item.type === "logo") {
        const s = 84; const lx = cx - s / 2;
        ctx.fillStyle = "#fff"; _roundRect(ctx, lx, item.y, s, s, 20); ctx.fill();
        const p = 6;
        ctx.save(); _roundRect(ctx, lx + p, item.y + p, s - 2 * p, s - 2 * p, 14); ctx.clip();
        ctx.drawImage(logoImg, lx + p, item.y + p, s - 2 * p, s - 2 * p); ctx.restore();
      } else if (item.type === "brand") {
        ctx.fillStyle = "rgba(255,255,255,.82)"; ctx.font = "600 14px 'Segoe UI',Arial,sans-serif";
        _drawSpaced(ctx, "AZOAPP PARTNER", cx, item.y + 14, 3);
      } else if (item.type === "shop") {
        ctx.fillStyle = "#fff"; ctx.font = "800 40px 'Segoe UI',Arial,sans-serif";
        ctx.fillText(shopName, cx, item.y + 34);
      } else if (item.type === "tag") {
        ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.font = "400 18px 'Segoe UI',Arial,sans-serif";
        ctx.fillText("Trusted Home Services", cx, item.y + 18);
      } else if (item.type === "qr") {
        const box = item.box; const bx = cx - box / 2;
        ctx.fillStyle = "#fff"; _roundRect(ctx, bx, item.y, box, box, 24); ctx.fill();
        const inner = box - 40;
        ctx.imageSmoothingEnabled = false;   // keep QR modules crisp when upscaled
        ctx.drawImage(qr, bx + 20, item.y + 20, inner, inner);
        ctx.imageSmoothingEnabled = true;
      } else if (item.type === "cta") {
        ctx.fillStyle = "#fff"; ctx.font = "700 26px 'Segoe UI',Arial,sans-serif";
        ctx.fillText("Scan to Book a Service", cx, item.y + 24);
      } else if (item.type === "sub") {
        ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "400 15px 'Segoe UI',Arial,sans-serif";
        ctx.fillText("Point your phone camera at the QR code", cx, item.y + 15);
      } else if (item.type === "code") {
        const label = `Ref: ${code || ""}`;
        ctx.font = "700 18px 'Segoe UI',Arial,sans-serif";
        const w = ctx.measureText(label).width + 44;
        ctx.fillStyle = "rgba(255,255,255,.16)"; _roundRect(ctx, cx - w / 2, item.y, w, 40, 20); ctx.fill();
        ctx.fillStyle = "#fff"; _drawSpaced(ctx, label, cx, item.y + 26, 2);
      }
    }
    return c.toDataURL("image/png");
  };

  const download = async () => {
    const url = await buildPosterDataUrl();
    if (!url) return toast.error("QR not ready");
    const a = document.createElement("a");
    a.href = url; a.download = `${(shopName || "merchant").replace(/\s+/g, "-")}-QR-Poster.png`; a.click();
    toast.success("Premium poster downloaded");
  };
  const printPoster = async () => {
    const url = await buildPosterDataUrl();
    if (!url) return toast.error("QR not ready");
    const w = window.open("", "_blank", "width=820,height=1120");
    if (!w) return toast.error("Allow pop-ups to print the poster");
    w.document.write(`<!doctype html><html><head><title>${shopName} — Booking Poster</title>
      <style>*{margin:0;padding:0;box-sizing:border-box}
      body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f1f5f9}
      img{width:560px;max-width:92vw;height:auto;border-radius:28px;box-shadow:0 20px 60px rgba(0,0,0,.2)}
      @media print{body{background:#fff}img{box-shadow:none}}
      </style></head><body onload="setTimeout(function(){window.print()},300)"><img src="${url}"/></body></html>`);
    w.document.close();
  };

  return (
    <div className="max-w-3xl" data-testid="merchant-scanqr">
      <h3 className="font-heading font-bold text-lg mb-1 flex items-center gap-2"><QrCode className="h-5 w-5 text-primary-700" /> Your Booking QR &amp; Poster</h3>
      <p className="text-sm text-slate-500 mb-4">Customers scan this QR to book a service — every booking is auto-tagged with your referral code <b>{code}</b>.</p>
      <div className="grid md:grid-cols-2 gap-5">
        {/* live poster preview */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Poster Preview</p>
          <div className="rounded-3xl p-6 text-center text-white" style={{ background: `linear-gradient(160deg, ${t.from}, ${t.to})` }} data-testid="poster-preview">
            {logo && <img src={logo} alt="logo" className="h-16 w-16 rounded-2xl object-cover bg-white p-1 mx-auto mb-3" />}
            <p className="text-[11px] tracking-[3px] uppercase opacity-80">AzoApp Partner</p>
            <p className="font-heading font-extrabold text-2xl mt-1">{shopName}</p>
            <p className="text-sm opacity-90 mb-4">Trusted Home Services</p>
            <div id="merchant-qr" className="bg-white rounded-2xl p-3 inline-block">
              {code ? <QRCodeCanvas value={link} size={260} level="M" includeMargin style={{ width: 150, height: 150 }} /> : <div className="h-[150px] w-[150px] grid place-items-center text-slate-300">No code</div>}
            </div>
            <p className="font-bold text-lg mt-4">📱 Scan to Book</p>
            <span className="inline-block mt-3 bg-white/15 px-4 py-1.5 rounded-full text-sm font-bold tracking-widest">Ref: {code}</span>
          </div>
        </div>
        {/* controls */}
        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Colour Theme</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(POSTER_THEMES).map(([k, v]) => (
                <button key={k} data-testid={`theme-${k}`} onClick={() => setTheme(k)}
                  className={`h-11 w-11 rounded-xl bg-gradient-to-br ${v.swatch} ring-offset-2 transition ${theme === k ? "ring-2 ring-primary-600" : ""}`} title={v.label} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Shop Logo (optional) <span className="text-emerald-500 normal-case font-medium">· remembered</span></p>
            <div className="flex items-center gap-2">
              <Button variant="outline" data-testid="poster-logo-upload" disabled={logoBusy} onClick={() => logoRef.current?.click()}>{logoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : logo ? "Replace logo" : "Upload logo"}</Button>
              {logo && <Button variant="ghost" className="text-red-500" onClick={removeLogo}>Remove</Button>}
              <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            </div>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Actions</p>
            <p className="text-xs text-slate-400 break-all mb-2">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(link); toast.success("Link copied"); }}>Copy link</Button>
              <Button variant="outline" data-testid="download-poster" onClick={download}><Download className="h-4 w-4 mr-1" /> Download Poster</Button>
              <Button data-testid="print-poster" onClick={printPoster} className="bg-primary-700 hover:bg-primary-800"><Printer className="h-4 w-4 mr-1" /> Print Poster</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
