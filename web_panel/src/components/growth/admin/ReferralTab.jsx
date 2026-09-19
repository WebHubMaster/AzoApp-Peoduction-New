import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Users, CheckCircle2, Clock, Wallet, TrendingUp, Eye, Share2, MessageCircle, X, User, Receipt } from "lucide-react";
import api from "@/lib/api";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { Card, KpiCard, Field, Input, Select, Toggle, SaveBtn, StatusBadge, SectionHeader, inp, fmt, dt, FilterChip, cn } from "./kit";
import DataTable from "./DataTable";
import DateRangePicker from "./DateRangePicker";
import AdvancedFilters, { FilterBtn } from "./AdvancedFilters";

function useForm(initial) {
  const [f, setF] = useState(initial || {});
  useEffect(() => { setF(initial || {}); }, [initial]);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setCard = (k, v) => setF((p) => ({ ...p, card: { ...(p.card || {}), [k]: v } }));
  return [f, set, setCard, setF];
}

export default function ReferralTab({ cfg, onSaved }) {
  const [f, set, setCard] = useForm(cfg);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ status: "", reward: "", customer: "", range: {}, drawer: {} });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    api.get("/admin/growth/referrals").then((r) => setData(r.data)).catch(() => setData({ referrals: [], summary: {} }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try { await api.put("/admin/growth/config", { referral: f }); toast.success("Referral settings saved"); onSaved?.(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  const card = f.card || {};
  const s = data?.summary || {};
  const referrals = data?.referrals || [];

  const customers = useMemo(() => {
    const m = new Map();
    referrals.forEach((r) => { if (r.referrer_id) m.set(r.referrer_id, r.referrer_name); });
    return Array.from(m, ([value, label]) => ({ value, label }));
  }, [referrals]);

  const rows = useMemo(() => {
    let d = referrals;
    if (filters.status) d = d.filter((r) => (r.status_label || "").toLowerCase() === filters.status.toLowerCase());
    if (filters.reward) d = d.filter((r) => (r.reward_status || "") === filters.reward);
    if (filters.customer) d = d.filter((r) => r.referrer_id === filters.customer);
    if (filters.range?.from) d = d.filter((r) => (r.created_at || "").slice(0, 10) >= filters.range.from);
    if (filters.range?.to) d = d.filter((r) => (r.created_at || "").slice(0, 10) <= filters.range.to);
    const dr = filters.drawer || {};
    if (dr.reward_min) d = d.filter((r) => Number(r.reward_amount || 0) >= Number(dr.reward_min));
    if (dr.reward_max) d = d.filter((r) => Number(r.reward_amount || 0) <= Number(dr.reward_max));
    if (dr.code) d = d.filter((r) => (r.referrer_code || "").toLowerCase().includes(dr.code.toLowerCase()));
    return d;
  }, [referrals, filters]);

  const chips = [];
  if (filters.status) chips.push({ k: "status", label: `Status: ${filters.status}` });
  if (filters.reward) chips.push({ k: "reward", label: `Reward: ${filters.reward}` });
  if (filters.customer) chips.push({ k: "customer", label: `Customer: ${customers.find((c) => c.value === filters.customer)?.label || ""}` });
  if (filters.range?.from) chips.push({ k: "range", label: `${filters.range.from} → ${filters.range.to}` });
  const removeChip = (k) => setFilters((p) => ({ ...p, [k]: k === "range" ? {} : "" }));

  const columns = [
    { key: "referrer_name", label: "Referrer", sortable: true, render: (r) => (
        <div className="min-w-0"><p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{r.referrer_name || "—"}</p><p className="text-[11px] text-slate-400">{r.referrer_code || ""}</p></div>) },
    { key: "referee_name", label: "Referred Customer", sortable: true, render: (r) => r.referee_name || "—" },
    { key: "booking_code", label: "Booking ID", render: (r) => r.booking_code ? <span className="font-mono text-xs">{r.booking_code}</span> : "—" },
    { key: "booking_amount", label: "Booking Amount", align: "right", render: (r) => r.booking_amount ? fmt(r.booking_amount) : "—" },
    { key: "reward_amount", label: "Referrer Reward", align: "right", sortable: true, render: (r) => <span className="font-semibold">{fmt(r.reward_amount)}</span>, sortValue: (r) => Number(r.reward_amount || 0) },
    { key: "friend_discount", label: "Friend Discount", align: "right", render: (r) => fmt(r.friend_discount) },
    { key: "status_label", label: "Status", render: (r) => <StatusBadge status={r.status_label} /> },
    { key: "created_at", label: "Booking Date", sortable: true, render: (r) => dt(r.credited_at || r.created_at), sortValue: (r) => r.created_at || "" },
    { key: "reward_status", label: "Reward Status", render: (r) => <StatusBadge status={r.reward_status === "paid" ? "Reward Paid" : "Pending"} /> },
    { key: "created", label: "Created At", render: (r) => dt(r.created_at, true) },
    { key: "__actions", label: "", exportable: false, render: (r) => (
        <button onClick={() => setDetail(r)} data-testid="ref-view" className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50"><Eye className="h-4 w-4" /></button>) },
  ];

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <KpiCard label="Total Referrals" value={s.total ?? 0} icon={Users} tone="primary" />
        <KpiCard label="Successful" value={s.successful ?? 0} icon={CheckCircle2} tone="green" />
        <KpiCard label="Pending" value={s.pending ?? 0} icon={Clock} tone="amber" />
        <KpiCard label="Rewards Paid" value={fmt(s.rewards_paid)} icon={Wallet} tone="violet" />
        <KpiCard label="Conversion Rate" value={`${s.conversion_rate ?? 0}%`} icon={TrendingUp} tone="sky" />
      </div>

      <div className="grid xl:grid-cols-3 gap-5">
        {/* Config */}
        <Card className="p-5 xl:col-span-2">
          <SectionHeader icon={Gift} title="Referral Program" subtitle="Rewards, limits and campaign window"
            right={<div className="flex items-center gap-2"><StatusBadge status={f.enabled ? "active" : "expired"} /><Toggle checked={!!f.enabled} onChange={(v) => set("enabled", v)} label={f.enabled ? "Enabled" : "Disabled"} /></div>} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Referrer Reward (₹)" hint="Credited to referrer's wallet"><Input data-testid="ref-reward" type="number" value={f.reward_amount ?? 0} onChange={(e) => set("reward_amount", +e.target.value)} /></Field>
            <Field label="Friend Discount (₹)" hint="Off the friend's first booking"><Input type="number" value={f.referee_discount ?? 0} onChange={(e) => set("referee_discount", +e.target.value)} /></Field>
            <Field label="Minimum Booking Amount (₹)"><Input type="number" value={f.min_booking_amount ?? 0} onChange={(e) => set("min_booking_amount", +e.target.value)} /></Field>
            <Field label="Maximum Reward Cap (₹)" hint="0 = no cap"><Input type="number" value={f.max_reward ?? 0} onChange={(e) => set("max_reward", +e.target.value)} /></Field>
            <Field label="Referral Expiry (days)" hint="0 = never"><Input type="number" value={f.expiry_days ?? 0} onChange={(e) => set("expiry_days", +e.target.value)} /></Field>
            <Field label="Max Referrals / Customer" hint="0 = unlimited"><Input type="number" value={f.max_referrals_per_customer ?? 0} onChange={(e) => set("max_referrals_per_customer", +e.target.value)} /></Field>
            <Field label="Campaign Start"><PremiumDatePicker value={(f.campaign_start || "").slice(0, 10)} onChange={(e) => set("campaign_start", e.target.value)} /></Field>
            <Field label="Campaign End"><PremiumDatePicker value={(f.campaign_end || "").slice(0, 10)} onChange={(e) => set("campaign_end", e.target.value)} /></Field>
          </div>
          <div className="mt-4"><Field label="Terms & Conditions"><textarea className={inp + " h-24 py-2"} value={f.terms || ""} onChange={(e) => set("terms", e.target.value)} /></Field></div>
          <div className="mt-5"><SaveBtn onClick={save} busy={busy} /></div>
        </Card>

        {/* Share card design + preview */}
        <Card className="p-5">
          <SectionHeader icon={Share2} title="Share Card Design" subtitle="What customers share with friends" />
          <div className="grid gap-3">
            <Field label="Heading"><Input value={card.heading || ""} onChange={(e) => setCard("heading", e.target.value)} /></Field>
            <Field label="Subheading"><Input value={card.subheading || ""} onChange={(e) => setCard("subheading", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="CTA Text"><Input value={card.cta_text || ""} onChange={(e) => setCard("cta_text", e.target.value)} /></Field>
              <Field label="Background"><input type="color" className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer" value={card.bg || "#0D47A1"} onChange={(e) => setCard("bg", e.target.value)} /></Field>
            </div>
            <Field label="Share Card Image URL"><Input value={card.logo || ""} onChange={(e) => setCard("logo", e.target.value)} placeholder="https://…" /></Field>
          </div>
          {/* live preview */}
          <p className="text-xs font-semibold text-slate-500 mt-4 mb-2">Live Preview</p>
          <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: card.bg || "#0D47A1" }}>
            <p className="text-lg font-black leading-tight">{card.heading || "Refer a Friend & Earn"}</p>
            <p className="text-sm opacity-90 mt-1">{card.subheading || "Share AzoApp — you both win"}</p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
              <Gift className="h-4 w-4" /> {fmt(f.reward_amount)} for you · {fmt(f.referee_discount)} for them
            </div>
            <div className="mt-4"><span className="inline-block rounded-lg bg-white text-slate-900 px-4 py-2 text-sm font-bold">{card.cta_text || "Book Now & Save"}</span></div>
          </div>
          {/* whatsapp preview */}
          <div className="mt-3 flex items-start gap-2">
            <span className="h-8 w-8 rounded-full bg-[#25D366] grid place-items-center text-white shrink-0"><MessageCircle className="h-4 w-4" /></span>
            <div className="rounded-2xl rounded-tl-sm bg-[#dcf8c6] dark:bg-emerald-900/40 text-slate-800 dark:text-slate-100 text-xs p-3 leading-relaxed">
              {card.heading || "Refer a Friend & Earn"}! Use my code <b>AZOxxxx</b> to get {fmt(f.referee_discount)} off your first AzoApp booking. 🎉
            </div>
          </div>
        </Card>
      </div>

      {/* History */}
      <div>
        <SectionHeader icon={Users} title="Referral History" subtitle="Every referral, reward and its status" />
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {chips.map((c) => <FilterChip key={c.k} label={c.label} onRemove={() => removeChip(c.k)} />)}
            <button onClick={() => setFilters({ status: "", reward: "", customer: "", range: {}, drawer: {} })} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Clear all</button>
          </div>
        )}
        <DataTable
          testId="referral-table"
          columns={columns}
          rows={rows}
          searchKeys={["referrer_name", "referee_name", "booking_code", "referrer_code"]}
          searchPlaceholder="Search customer / referral…"
          exportFilename="referrals.csv"
          emptyTitle="No referrals yet"
          emptyHint="Referrals appear here once customers start sharing their code."
          emptyIcon={Users}
          toolbar={
            <>
              <Select className="!h-10 !w-auto" value={filters.customer} onChange={(e) => setFilters((p) => ({ ...p, customer: e.target.value }))}>
                <option value="">All customers</option>
                {customers.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
              <Select className="!h-10 !w-auto" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                <option value="">All statuses</option>
                {["Pending", "Successful", "Cancelled", "Reward Paid", "Expired"].map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
              <Select className="!h-10 !w-auto" value={filters.reward} onChange={(e) => setFilters((p) => ({ ...p, reward: e.target.value }))}>
                <option value="">All rewards</option>
                <option value="paid">Reward Paid</option>
                <option value="pending">Pending</option>
              </Select>
            </>
          }
          toolbarRight={
            <>
              <DateRangePicker value={filters.range} onChange={(v) => setFilters((p) => ({ ...p, range: v }))} />
              <FilterBtn onClick={() => setDrawerOpen(true)} count={Object.values(filters.drawer || {}).filter(Boolean).length} />
            </>
          }
        />
      </div>

      <AdvancedFilters
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        value={filters.drawer}
        fields={[
          { key: "code", label: "Referral Code", type: "text", placeholder: "AZO…" },
          { key: "reward", label: "Reward Amount Range (₹)", type: "numrange" },
        ]}
        onApply={(v) => setFilters((p) => ({ ...p, drawer: v }))}
        onReset={() => setFilters((p) => ({ ...p, drawer: {} }))}
        savedFilters={[{ name: "Pending Rewards", values: { reward_min: "1" } }]}
        onSaveFilter={() => toast.success("Filter saved")}
      />

      {detail && <ReferralDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ReferralDetail({ row, onClose }) {
  const items = [
    ["Referrer", row.referrer_name], ["Referral Code", row.referrer_code], ["Referred Customer", row.referee_name],
    ["Booking ID", row.booking_code || "—"], ["Referrer Reward", fmt(row.reward_amount)], ["Friend Discount", fmt(row.friend_discount)],
    ["Status", row.status_label], ["Reward Status", row.reward_status === "paid" ? "Reward Paid" : "Pending"],
    ["Created", dt(row.created_at, true)], ["Credited", row.credited_at ? dt(row.credited_at, true) : "—"],
  ];
  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-bold text-slate-900 dark:text-white">Referral Details</h4>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2.5">
          {items.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-sm border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="text-slate-500">{k}</span><span className="font-semibold text-slate-800 dark:text-slate-100 text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-1.5"><User className="h-4 w-4" /> View Customer</button>
          <button className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 inline-flex items-center justify-center gap-1.5"><Receipt className="h-4 w-4" /> View Booking</button>
        </div>
      </div>
    </div>
  );
}
