import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Calendar, Users, CheckCircle2, Clock, IndianRupee, X, RefreshCw } from "lucide-react";
import api, { fmt } from "@/lib/api";

const STATUS_TABS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "pending_payment", label: "Pending Payment" },
];

const DAY_LABEL = {
  scheduled: ["Scheduled", "bg-blue-50 text-blue-700"],
  completed: ["Completed", "bg-emerald-50 text-emerald-700"],
  replacement_completed: ["Replacement", "bg-violet-50 text-violet-700"],
  maid_absent: ["Maid Absent", "bg-rose-50 text-rose-700"],
  customer_cancel: ["Customer Cancel", "bg-amber-50 text-amber-700"],
  weekly_off: ["Weekly Off", "bg-slate-100 text-slate-500"],
};

const SET_TONE = {
  none: "bg-slate-100 text-slate-500", pending: "bg-amber-100 text-amber-700",
  review: "bg-blue-100 text-blue-700", approved: "bg-indigo-100 text-indigo-700",
  paid: "bg-emerald-100 text-emerald-700",
};

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tone || "bg-primary-50 text-primary-700"}`}><Icon className="h-5 w-5" /></div>
      <div><p className="text-xs uppercase tracking-wide text-slate-400 font-semibold">{label}</p><p className="text-xl font-extrabold text-slate-800">{value}</p></div>
    </div>
  );
}

function DetailDrawer({ id, onClose, onChanged }) {
  const [sub, setSub] = useState(null);
  const [partners, setPartners] = useState([]);
  const [assignId, setAssignId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await api.get(`/subscriptions/${id}`);
    setSub(s.data); setAssignId(s.data.partner_id || "");
    try { const p = await api.get(`/subscriptions/admin/${id}/partners`); setPartners(p.data || []); } catch (_) {}
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => { setBusy(true); try { await fn(); await load(); onChanged?.(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); } };
  const assign = () => act(async () => { await api.post(`/subscriptions/admin/${id}/assign`, { partner_id: assignId }); toast.success("Maid assigned"); });
  const markDay = (date, status) => act(async () => { await api.post(`/subscriptions/admin/${id}/days/${date}`, { status }); toast.success(`Day marked ${status}`); });
  const finalize = () => act(async () => { await api.post(`/subscriptions/admin/${id}/finalize`); toast.success("Settlement generated"); });
  const settlement = (action) => act(async () => { await api.post(`/subscriptions/admin/${id}/settlement`, { action }); toast.success(`Settlement ${action}`); });

  if (!sub) return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40"><div className="w-full max-w-2xl bg-white p-6">Loading…</div></div>
  );
  const set = sub.settlement || {};
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="sub-detail-drawer">
        <div className="sticky top-0 bg-white border-b border-slate-100 p-4 flex items-center justify-between">
          <div><p className="font-extrabold text-slate-800">{sub.plan_label} · {sub.customer_name}</p><p className="text-xs text-slate-400">{sub.code} · {sub.start_date} → {sub.end_date}</p></div>
          <button onClick={onClose} data-testid="sub-drawer-close" className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-4">
          {/* financial snapshot */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {[["Customer Paid", fmt(sub.price)], ["Commission " + sub.commission_pct + "%", fmt(sub.commission_amount)], ["Tax " + sub.tax_pct + "%", fmt(sub.tax_amount)], ["Max Allocation", fmt(sub.partner_allocation)], ["Per-day", fmt(sub.per_day_earning)], ["Working Days", sub.working_days]].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-[11px] text-slate-400">{k}</p><p className="font-bold text-slate-700">{v}</p></div>
            ))}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {[["Completed", sub.completed_days, "text-emerald-600"], ["Absent", sub.absent_days, "text-rose-600"], ["Earned", fmt(sub.accrued_earning), "text-emerald-600"], ["Absent Adj → Platform", fmt(sub.absent_adjustment), "text-rose-600"]].map(([k, v, c]) => (
              <div key={k} className="rounded-lg border border-slate-100 p-2"><p className="text-[11px] text-slate-400">{k}</p><p className={`font-bold ${c}`}>{v}</p></div>
            ))}
          </div>

          {/* assign maid */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-700 mb-2 flex items-center gap-1"><Users className="h-4 w-4" /> Assign Maid</p>
            <div className="flex gap-2">
              <select data-testid="sub-assign-select" value={assignId} onChange={(e) => setAssignId(e.target.value)} className="flex-1 h-9 rounded-lg border border-slate-200 px-2 text-sm">
                <option value="">Select partner…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {(p.skills || []).join(",") || "no-skill"}</option>)}
              </select>
              <button data-testid="sub-assign-btn" disabled={!assignId || busy} onClick={assign} className="h-9 px-4 rounded-lg bg-primary-700 text-white text-sm font-semibold disabled:opacity-50">Assign</button>
            </div>
            {sub.partner_name && <p className="text-xs text-slate-500 mt-1">Current: <b>{sub.partner_name}</b></p>}
          </div>

          {/* settlement controls */}
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-700 flex items-center gap-1"><IndianRupee className="h-4 w-4" /> Settlement</p>
              <span className={`text-xs px-2 py-1 rounded-full font-semibold ${SET_TONE[set.status || "none"]}`}>{set.status || "none"}</span>
            </div>
            <p className="text-lg font-extrabold text-slate-800 mt-1">{fmt(set.amount ?? sub.settlement_amount)}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <button disabled={busy} onClick={finalize} data-testid="sub-finalize-btn" className="h-8 px-3 rounded-lg border border-slate-200 text-sm font-semibold hover:bg-slate-50">Finalize / Generate</button>
              <button disabled={busy || (set.status !== "pending")} onClick={() => settlement("review")} className="h-8 px-3 rounded-lg border border-blue-200 text-blue-700 text-sm font-semibold disabled:opacity-40">Mark Review</button>
              <button disabled={busy || (set.status !== "review")} onClick={() => settlement("approve")} className="h-8 px-3 rounded-lg border border-indigo-200 text-indigo-700 text-sm font-semibold disabled:opacity-40">Approve</button>
              <button disabled={busy || (set.status !== "approved")} onClick={() => settlement("pay")} data-testid="sub-pay-btn" className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-40">Pay Maid</button>
            </div>
          </div>

          {/* daily schedule with overrides */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="font-semibold text-slate-700 mb-2 flex items-center gap-1"><Calendar className="h-4 w-4" /> Daily Schedule</p>
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {(sub.schedule || []).map((d) => {
                const [lbl, tone] = DAY_LABEL[d.status] || DAY_LABEL.scheduled;
                return (
                  <div key={d.date} className="flex items-center gap-2 text-sm border border-slate-100 rounded-lg p-2">
                    <span className="font-medium text-slate-600 w-24">{d.date}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${tone}`}>{lbl}</span>
                    <span className="ml-auto font-semibold text-slate-700">{d.status === "weekly_off" ? "—" : fmt(d.earning || 0)}</span>
                    {d.status !== "weekly_off" && (
                      <div className="flex gap-1">
                        <button title="Completed" onClick={() => markDay(d.date, "completed")} className="text-emerald-600 hover:bg-emerald-50 rounded p-1"><CheckCircle2 className="h-4 w-4" /></button>
                        <button title="Maid Absent" onClick={() => markDay(d.date, "maid_absent")} className="text-rose-600 hover:bg-rose-50 rounded p-1"><X className="h-4 w-4" /></button>
                        <button title="Customer Cancel" onClick={() => markDay(d.date, "customer_cancel")} className="text-amber-600 hover:bg-amber-50 rounded p-1"><Clock className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SubscriptionsAdmin() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([
        api.get(`/subscriptions/admin/all`, { params: { status: tab || undefined, q: q || undefined } }),
        api.get(`/subscriptions/admin/stats`),
      ]);
      setRows(r.data || []); setStats(s.data || {});
    } catch (e) { toast.error("Failed to load subscriptions"); } finally { setLoading(false); }
  }, [tab, q]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4" data-testid="admin-subscriptions">
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-extrabold text-slate-800">Subscriptions</h2><p className="text-sm text-slate-500">Recurring service subscriptions, attendance & maid settlements.</p></div>
        <button onClick={load} className="h-9 px-3 rounded-lg border border-slate-200 text-sm font-semibold flex items-center gap-1 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat icon={Calendar} label="Active" value={stats.active ?? 0} />
        <Stat icon={CheckCircle2} label="Completed" value={stats.completed ?? 0} tone="bg-emerald-50 text-emerald-700" />
        <Stat icon={Clock} label="Settle Pending" value={stats.settlement_pending ?? 0} tone="bg-amber-50 text-amber-700" />
        <Stat icon={Users} label="In Review" value={stats.settlement_review ?? 0} tone="bg-blue-50 text-blue-700" />
        <Stat icon={IndianRupee} label="Approved" value={stats.settlement_approved ?? 0} tone="bg-indigo-50 text-indigo-700" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((t) => (
          <button key={t.key} data-testid={`sub-tab-${t.key || "all"}`} onClick={() => setTab(t.key)} className={`h-8 px-3 rounded-lg text-sm font-semibold ${tab === t.key ? "bg-primary-700 text-white" : "border border-slate-200 text-slate-600"}`}>{t.label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code / customer / service…" className="ml-auto h-8 w-64 rounded-lg border border-slate-200 px-3 text-sm" data-testid="sub-search" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>{["Code", "Customer", "Plan", "Maid", "Paid", "Earned", "Status", "Settlement"].map((h) => <th key={h} className="text-left px-3 py-2 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">No subscriptions found.</td></tr>
            ) : rows.map((s) => (
              <tr key={s.id} data-testid={`sub-row-${s.id}`} onClick={() => setOpenId(s.id)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                <td className="px-3 py-2">{s.customer_name}</td>
                <td className="px-3 py-2">{s.plan_label}</td>
                <td className="px-3 py-2">{s.partner_name || <span className="text-amber-600 text-xs font-semibold">Unassigned</span>}</td>
                <td className="px-3 py-2">{fmt(s.price)}</td>
                <td className="px-3 py-2 text-emerald-700 font-semibold">{fmt(s.accrued_earning)}</td>
                <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 capitalize">{s.status.replace("_", " ")}</span></td>
                <td className="px-3 py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${SET_TONE[(s.settlement || {}).status || "none"]}`}>{(s.settlement || {}).status || "none"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId && <DetailDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}
