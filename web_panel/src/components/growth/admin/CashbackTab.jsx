import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Gift, Wallet, TrendingUp, TicketPercent, PiggyBank, Percent, Plus, Pencil, Trash2, Copy, Power, X, GripVertical, Coins } from "lucide-react";
import api from "@/lib/api";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { Card, KpiCard, Field, Input, Select, Toggle, SaveBtn, StatusBadge, SectionHeader, inp, fmt, fmtNum, dt, cn, FilterChip } from "./kit";
import DataTable from "./DataTable";
import DateRangePicker from "./DateRangePicker";
import AdvancedFilters, { FilterBtn } from "./AdvancedFilters";

function useForm(initial) {
  const [f, setF] = useState(initial || {});
  useEffect(() => { setF(initial || {}); }, [initial]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return [f, set];
}

export default function CashbackTab({ cfg, onSaved }) {
  const [f, set] = useForm(cfg);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState(null);

  const loadTx = useCallback(() => {
    api.get("/admin/growth/cashback-transactions").then((r) => setTx(r.data)).catch(() => setTx({ transactions: [], stats: {} }));
  }, []);
  useEffect(() => { loadTx(); }, [loadTx]);

  const save = async () => {
    setBusy(true);
    try { await api.put("/admin/growth/config", { cashback: f }); toast.success("Cashback settings saved"); onSaved?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  const transactions = tx?.transactions || [];
  const stats = tx?.stats || {};
  const issuedValue = useMemo(() => transactions.reduce((s, t) => s + Number(t.reward_amount || 0), 0), [transactions]);
  const redeemedValue = useMemo(() => transactions.filter((t) => t.status === "claimed").reduce((s, t) => s + Number(t.reward_amount || 0), 0), [transactions]);
  const redemptionRate = stats.issued ? Math.round((stats.claimed || 0) / stats.issued * 100) : 0;

  return (
    <div className="space-y-5">
      {/* analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Cashback" value={f.enabled ? "On" : "Off"} icon={Wallet} tone={f.enabled ? "green" : "slate"} />
        <KpiCard label="Scratch Cards" value={f.scratch_enabled ? "On" : "Off"} icon={Sparkles} tone={f.scratch_enabled ? "green" : "slate"} />
        <KpiCard label="Total Cashback Issued" value={fmt(issuedValue)} icon={Coins} tone="primary" sub={`${fmtNum(stats.issued)} cards`} />
        <KpiCard label="Cashback Redeemed" value={fmt(redeemedValue)} icon={PiggyBank} tone="violet" />
        <KpiCard label="Outstanding Cashback" value={fmt(Math.max(issuedValue - redeemedValue, 0))} icon={TicketPercent} tone="amber" />
        <KpiCard label="Cards Distributed" value={fmtNum(stats.issued)} icon={Gift} tone="sky" />
        <KpiCard label="Cards Opened" value={fmtNum(stats.claimed)} icon={TrendingUp} tone="green" />
        <KpiCard label="Redemption Rate" value={`${redemptionRate}%`} icon={Percent} tone="rose" />
      </div>

      {/* config */}
      <Card className="p-5">
        <SectionHeader icon={Sparkles} title="Cashback & Scratch Cards" subtitle="Eligibility, caps and campaign window"
          right={<div className="flex items-center gap-4"><Toggle checked={!!f.enabled} onChange={(v) => set("enabled", v)} label="Cashback" /><Toggle checked={!!f.scratch_enabled} onChange={(v) => set("scratch_enabled", v)} label="Scratch cards" /></div>} />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Reward Source"><Select value={f.type || "pool"} onChange={(e) => set("type", e.target.value)}><option value="pool">Weighted pool</option><option value="percent">% of booking</option><option value="fixed">Fixed amount</option></Select></Field>
          <Field label="Minimum Booking Amount (₹)"><Input data-testid="cb-min" type="number" value={f.min_booking_amount ?? 0} onChange={(e) => set("min_booking_amount", +e.target.value)} /></Field>
          <Field label="Maximum Cashback Cap (₹)"><Input type="number" value={f.max_cashback ?? 0} onChange={(e) => set("max_cashback", +e.target.value)} /></Field>
          <Field label="Audience"><Select value={f.audience || "all"} onChange={(e) => set("audience", e.target.value)}><option value="all">All customers</option><option value="new">New only</option><option value="repeat">Repeat only</option></Select></Field>
          <Field label="Card Expiry (days)" hint="0 = never"><Input type="number" value={f.expiry_days ?? 0} onChange={(e) => set("expiry_days", +e.target.value)} /></Field>
          <Field label="Max Cards / Customer" hint="0 = unlimited"><Input type="number" value={f.max_per_customer ?? 0} onChange={(e) => set("max_per_customer", +e.target.value)} /></Field>
          <Field label="Campaign Start"><PremiumDatePicker value={(f.campaign_start || "").slice(0, 10)} onChange={(e) => set("campaign_start", e.target.value)} /></Field>
          <Field label="Campaign End"><PremiumDatePicker value={(f.campaign_end || "").slice(0, 10)} onChange={(e) => set("campaign_end", e.target.value)} /></Field>
        </div>
        <div className="mt-5"><SaveBtn onClick={save} busy={busy} /></div>
      </Card>

      <RewardPool onChanged={loadTx} />

      <TransactionHistory transactions={transactions} />
    </div>
  );
}

/* ---------------------------------------------------------------- reward pool */
function RewardPool({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [dragId, setDragId] = useState(null);
  const load = useCallback(() => { api.get("/admin/growth/scratch-rewards").then((r) => setRows(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);
  const blank = { amount: 0, label: "", weight: 1, max_quantity: 0, daily_limit: 0, active: true };

  const save = async (row) => {
    try {
      if (row.id) await api.put(`/admin/growth/scratch-rewards/${row.id}`, row);
      else await api.post("/admin/growth/scratch-rewards", row);
      toast.success("Reward saved"); setEdit(null); load(); onChanged?.();
    } catch { toast.error("Save failed"); }
  };
  const del = async (id) => { try { await api.delete(`/admin/growth/scratch-rewards/${id}`); toast.success("Deleted"); load(); onChanged?.(); } catch { toast.error("Delete failed"); } };
  const toggle = async (r) => { try { await api.put(`/admin/growth/scratch-rewards/${r.id}`, { ...r, active: !r.active }); load(); } catch { toast.error("Failed"); } };
  const dup = async (r) => { const { id, issued, redeemed, remaining, probability, ...rest } = r; try { await api.post(`/admin/growth/scratch-rewards`, { ...rest, label: `${r.label} (copy)` }); toast.success("Duplicated"); load(); } catch { toast.error("Failed"); } };

  const onDrop = (targetId) => {
    if (!dragId || dragId === targetId) return;
    const arr = [...rows];
    const from = arr.findIndex((x) => x.id === dragId);
    const to = arr.findIndex((x) => x.id === targetId);
    if (from < 0 || to < 0) return;
    arr.splice(to, 0, arr.splice(from, 1)[0]);
    setRows(arr); setDragId(null);
  };

  return (
    <Card className="p-5">
      <SectionHeader icon={Gift} title="Scratch Reward Pool" subtitle="Weighted rewards — probability shown per tier"
        right={<button data-testid="reward-add" onClick={() => setEdit(blank)} className="h-9 px-3 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm inline-flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add Reward</button>} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-slate-500">
            <tr>{["", "Reward", "Display Message", "Weight", "Probability", "Status", "Issued", "Redeemed", "Remaining", ""].map((h, i) => <th key={i} className="px-3 py-3 font-semibold whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-10 text-center text-slate-400">No rewards yet. Add reward tiers with weights.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} draggable onDragStart={() => setDragId(r.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(r.id)}
                className={cn("hover:bg-slate-50/70 dark:hover:bg-slate-800/40", dragId === r.id && "opacity-50")}>
                <td className="px-3 py-3 text-slate-300 cursor-grab active:cursor-grabbing"><GripVertical className="h-4 w-4" /></td>
                <td className="px-3 py-3 font-bold text-slate-900 dark:text-white whitespace-nowrap">{r.amount > 0 ? fmt(r.amount) : "Better luck"}</td>
                <td className="px-3 py-3 text-slate-500">{r.label || "—"}</td>
                <td className="px-3 py-3">{r.weight}</td>
                <td className="px-3 py-3 w-40">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.min(r.probability || 0, 100)}%` }} /></div>
                    <span className="text-xs font-semibold text-slate-500 w-10 text-right">{(r.probability || 0).toFixed(1)}%</span>
                  </div>
                </td>
                <td className="px-3 py-3"><StatusBadge status={r.active ? "active" : "expired"} /></td>
                <td className="px-3 py-3">{fmtNum(r.issued)}</td>
                <td className="px-3 py-3">{fmtNum(r.redeemed)}</td>
                <td className="px-3 py-3">{r.remaining == null ? "∞" : fmtNum(r.remaining)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    <IconBtn title="Enable/Disable" onClick={() => toggle(r)}><Power className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Edit" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Duplicate" onClick={() => dup(r)}><Copy className="h-4 w-4" /></IconBtn>
                    <IconBtn title="Delete" danger onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <RewardEditor row={edit} onClose={() => setEdit(null)} onSave={save} />}
    </Card>
  );
}

const IconBtn = ({ children, onClick, title, danger }) => (
  <button title={title} onClick={onClick} className={cn("h-8 w-8 grid place-items-center rounded-lg text-slate-400", danger ? "hover:text-rose-600 hover:bg-rose-50" : "hover:text-primary-600 hover:bg-primary-50")}>{children}</button>
);

function RewardEditor({ row, onClose, onSave }) {
  const [f, setF] = useState(row);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3"><h4 className="font-bold">{f.id ? "Edit" : "Add"} Reward</h4><button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button></div>
        <div className="space-y-3">
          <Field label="Amount (₹, 0 = better luck)"><Input data-testid="reward-amount" type="number" value={f.amount} onChange={(e) => set("amount", +e.target.value)} /></Field>
          <Field label="Display Message"><Input value={f.label || ""} onChange={(e) => set("label", e.target.value)} placeholder="e.g. ₹50 Cashback" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Weight"><Input type="number" value={f.weight} onChange={(e) => set("weight", +e.target.value)} /></Field>
            <Field label="Max qty" hint="0=∞"><Input type="number" value={f.max_quantity} onChange={(e) => set("max_quantity", +e.target.value)} /></Field>
            <Field label="Daily" hint="0=∞"><Input type="number" value={f.daily_limit} onChange={(e) => set("daily_limit", +e.target.value)} /></Field>
          </div>
          <Toggle checked={!!f.active} onChange={(v) => set("active", v)} label="Active" />
        </div>
        <button onClick={() => onSave(f)} className="mt-4 w-full h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold">Save Reward</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- transactions */
function TransactionHistory({ transactions }) {
  const [filters, setFilters] = useState({ status: "", range: {}, drawer: {} });
  const [drawerOpen, setDrawerOpen] = useState(false);

  const rows = useMemo(() => {
    let d = transactions;
    if (filters.status) d = d.filter((t) => t.status === filters.status);
    if (filters.range?.from) d = d.filter((t) => (t.issued_at || "").slice(0, 10) >= filters.range.from);
    if (filters.range?.to) d = d.filter((t) => (t.issued_at || "").slice(0, 10) <= filters.range.to);
    const dr = filters.drawer || {};
    if (dr.booking) d = d.filter((t) => (t.booking_code || "").toLowerCase().includes(dr.booking.toLowerCase()));
    if (dr.amount_min) d = d.filter((t) => Number(t.reward_amount || 0) >= Number(dr.amount_min));
    if (dr.amount_max) d = d.filter((t) => Number(t.reward_amount || 0) <= Number(dr.amount_max));
    return d;
  }, [transactions, filters]);

  const chips = [];
  if (filters.status) chips.push({ k: "status", label: `Status: ${filters.status}` });
  if (filters.range?.from) chips.push({ k: "range", label: `${filters.range.from} → ${filters.range.to}` });

  const columns = [
    { key: "customer_name", label: "Customer", sortable: true, render: (t) => <div><p className="font-semibold text-slate-800 dark:text-slate-100">{t.customer_name}</p><p className="text-[11px] text-slate-400">{t.customer_phone}</p></div> },
    { key: "booking_code", label: "Booking ID", render: (t) => t.booking_code ? <span className="font-mono text-xs">{t.booking_code}</span> : "—" },
    { key: "reward", label: "Reward", render: (t) => t.reward },
    { key: "reward_amount", label: "Amount", align: "right", sortable: true, render: (t) => <span className="font-semibold">{t.reward_amount ? fmt(t.reward_amount) : "—"}</span>, sortValue: (t) => Number(t.reward_amount || 0) },
    { key: "reward_type", label: "Type", render: (t) => <StatusBadge status={t.reward_type} /> },
    { key: "status", label: "Status", render: (t) => <StatusBadge status={t.status} /> },
    { key: "issued_at", label: "Issued At", sortable: true, render: (t) => dt(t.issued_at, true), sortValue: (t) => t.issued_at || "" },
    { key: "claimed_at", label: "Redeemed At", render: (t) => t.claimed_at ? dt(t.claimed_at, true) : "—" },
    { key: "expires_at", label: "Expiry", render: (t) => t.expires_at ? dt(t.expires_at) : "—" },
  ];

  return (
    <div>
      <SectionHeader icon={Wallet} title="Transaction & Reward History" subtitle="Every scratch card issued and redeemed" />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {chips.map((c) => <FilterChip key={c.k} label={c.label} onRemove={() => setFilters((p) => ({ ...p, [c.k]: c.k === "range" ? {} : "" }))} />)}
        </div>
      )}
      <DataTable
        testId="cashback-table"
        columns={columns}
        rows={rows}
        searchKeys={["customer_name", "customer_phone", "booking_code", "reward"]}
        searchPlaceholder="Search customer…"
        exportFilename="cashback-transactions.csv"
        emptyTitle="No cashback issued yet"
        emptyHint="Scratch cards and cashback appear here as customers earn them."
        emptyIcon={Wallet}
        toolbar={
          <Select className="!h-10 !w-auto" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
            <option value="">All statuses</option>
            {["available", "claimed", "expired"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}
          </Select>
        }
        toolbarRight={
          <>
            <DateRangePicker value={filters.range} onChange={(v) => setFilters((p) => ({ ...p, range: v }))} />
            <FilterBtn onClick={() => setDrawerOpen(true)} count={Object.values(filters.drawer || {}).filter(Boolean).length} />
          </>
        }
      />
      <AdvancedFilters
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters.drawer}
        fields={[
          { key: "booking", label: "Booking ID", type: "text" },
          { key: "amount", label: "Reward Amount Range (₹)", type: "numrange" },
        ]}
        onApply={(v) => setFilters((p) => ({ ...p, drawer: v }))}
        onReset={() => setFilters((p) => ({ ...p, drawer: {} }))}
        savedFilters={[{ name: "Unredeemed Cashback", values: {} }]}
        onSaveFilter={() => toast.success("Filter saved")}
      />
    </div>
  );
}
