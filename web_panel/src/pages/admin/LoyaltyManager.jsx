import { useEffect, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import {
  Star, Save, Gift, TrendingUp, Users, Wallet, Percent, Coins,
  ArrowDownRight, ArrowUpRight, Search, ListChecks, UserRound,
} from "lucide-react";
import { toast } from "sonner";
import {
  PageHeader, KpiCard, Card, SectionTitle, Field, PInput, BtnPrimary,
  Tabs, Badge, Skeleton, EmptyState, Pagination,
} from "@/components/marketing/mkit";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";

const TYPE_ICON = {
  earned: ArrowUpRight, bonus: ArrowUpRight, adjusted: TrendingUp,
  redeemed: ArrowDownRight, expired: ArrowDownRight,
};

export default function LoyaltyManager() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("transactions");

  const loadOverview = useCallback(() => {
    api.get("/admin/loyalty/overview")
      .then((r) => { setData(r.data); setForm(r.data.config); })
      .catch(() => toast.error("Failed to load loyalty overview"));
  }, []);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/loyalty/config", {
        enabled: !!form.enabled,
        earn_rate: Number(form.earn_rate) || 0,
        redeem_value: Number(form.redeem_value) || 0,
        min_redeem_points: Number(form.min_redeem_points) || 0,
        max_redeem_pct: Number(form.max_redeem_pct) || 0,
        welcome_bonus: Number(form.welcome_bonus) || 0,
      });
      toast.success("Loyalty settings saved");
      loadOverview();
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    finally { setSaving(false); }
  };

  if (!form || !data) return <Skeleton rows={8} />;

  const sample = 1000;
  const earned = Math.floor((sample / 100) * (Number(form.earn_rate) || 0));
  const value = earned * (Number(form.redeem_value) || 0);
  const redeemable = Math.round(sample * (Number(form.max_redeem_pct) || 0) / 100);

  return (
    <div className="space-y-6" data-testid="loyalty-manager">
      <PageHeader icon={Star} title="Loyalty Points"
        subtitle="Manage customer rewards, points earning and redemption." />

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Members" value={data.members} icon={Users} tone="brand" />
        <KpiCard label="Points Issued" value={(data.points_issued || 0).toLocaleString("en-IN")} icon={TrendingUp} tone="emerald" />
        <KpiCard label="Points Redeemed" value={(data.points_redeemed || 0).toLocaleString("en-IN")} icon={Coins} tone="violet" />
        <KpiCard label="Outstanding" value={(data.outstanding_points || 0).toLocaleString("en-IN")} hint="points" icon={Gift} tone="sky" />
        <KpiCard label="Liability" value={fmt(data.outstanding_value)} icon={Wallet} tone="red" />
        <KpiCard label="Redemption Rate" value={`${data.redemption_rate}%`} icon={Percent} tone="amber" />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3 p-6">
          <SectionTitle icon={Star} title="Program settings"
            right={
              <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer">
                <span className="relative inline-flex">
                  <input type="checkbox" data-testid="loy-enabled" checked={!!form.enabled}
                    onChange={(e) => set("enabled", e.target.checked)} className="peer sr-only" />
                  <span className="w-10 h-6 rounded-full bg-slate-200 dark:bg-slate-700 peer-checked:bg-[#0D47A1] transition" />
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-4" />
                </span>
                Program enabled
              </label>
            } />
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Earn rate" hint="Points earned per ₹100 spent">
              <PInput data-testid="loy-earn" type="number" value={form.earn_rate} onChange={(e) => set("earn_rate", e.target.value)} />
            </Field>
            <Field label="Redeem value (₹)" hint="₹ value of 1 point">
              <PInput data-testid="loy-value" type="number" step="0.01" value={form.redeem_value} onChange={(e) => set("redeem_value", e.target.value)} />
            </Field>
            <Field label="Welcome bonus" hint="Points on first booking">
              <PInput type="number" value={form.welcome_bonus} onChange={(e) => set("welcome_bonus", e.target.value)} />
            </Field>
            <Field label="Min redeem points" hint="Minimum to redeem">
              <PInput type="number" value={form.min_redeem_points} onChange={(e) => set("min_redeem_points", e.target.value)} />
            </Field>
            <Field label="Max redemption %" hint="Max % of a bill points can cover">
              <PInput data-testid="loy-maxpct" type="number" value={form.max_redeem_pct} onChange={(e) => set("max_redeem_pct", e.target.value)} />
            </Field>
          </div>
          <div className="mt-5">
            <BtnPrimary data-testid="loy-save" onClick={save} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save settings"}
            </BtnPrimary>
          </div>
        </Card>

        <Card className="lg:col-span-2 p-6 relative overflow-hidden">
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full opacity-10" style={{ background: "#0D47A1" }} />
          <SectionTitle icon={Coins} title="Earn & Redeem calculator" sub="Live preview" />
          <div className="rounded-2xl p-4 text-white" style={{ background: "linear-gradient(135deg,#0D47A1,#1565C0)" }}>
            <p className="text-xs opacity-80">On a</p>
            <p className="font-heading font-extrabold text-2xl">{fmt(sample)} booking</p>
            <div className="mt-3 space-y-2 text-sm">
              <Row k="Points earned" v={`${earned} pts`} />
              <Row k="Reward value" v={fmt(value)} />
              <Row k="Redeemable on next bill" v={`up to ${fmt(redeemable)}`} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            Members earn <b>{form.earn_rate}</b> points / ₹100 · 1 point = <b>{fmt(form.redeem_value)}</b> ·
            up to <b>{form.max_redeem_pct}%</b> of any bill redeemable.
          </p>
        </Card>
      </div>

      <div>
        <Tabs tabs={[["transactions", "Transactions", ListChecks], ["members", "Members", UserRound]]}
          active={tab} onChange={setTab} />
        <div className="mt-4">
          {tab === "transactions" ? <TransactionsTable /> : <MembersTable />}
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="flex items-center justify-between">
    <span className="opacity-80">{k}</span><span className="font-bold">{v}</span>
  </div>
);

function TransactionsTable() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(() => {
    setRows(null);
    const p = new URLSearchParams({ q, type, date_from: from, date_to: to, page, page_size: pageSize });
    api.get(`/admin/loyalty/transactions?${p}`)
      .then((r) => { setRows(r.data.items); setTotal(r.data.total); })
      .catch(() => setRows([]));
  }, [q, type, from, to, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, type, from, to]);

  return (
    <Card className="overflow-hidden" data-testid="loy-transactions">
      <div className="flex items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <PInput placeholder="Search customer / phone / booking…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
        <PremiumSelect value={type} onChange={(e) => setType(e.target.value)} placeholder="All types" className="!w-auto min-w-[140px] rounded-xl">
          <option value="">All types</option>
          {["earned", "redeemed", "bonus", "adjusted", "expired"].map((t) => <option key={t} value={t}>{t}</option>)}
        </PremiumSelect>
        <PremiumDatePicker value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" className="!w-auto min-w-[150px] rounded-xl" />
        <PremiumDatePicker value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" className="!w-auto min-w-[150px] rounded-xl" />
      </div>
      {rows === null ? <Skeleton /> : rows.length === 0 ? (
        <EmptyState icon={ListChecks} title="No transactions" hint="Loyalty activity will appear here once customers earn or redeem points." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 sticky top-0">
              <tr>{["Customer", "Type", "Points", "₹ Value", "Balance", "Booking", "Source", "Date"].map((h) => (
                <th key={h} className="text-left font-semibold px-4 py-3 whitespace-nowrap">{h}</th>))}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const Ico = TYPE_ICON[r.type] || TrendingUp;
                const credit = r.direction === "credit";
                return (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{r.customer}</p>
                      <p className="text-[11px] text-slate-400">{r.phone}</p>
                    </td>
                    <td className="px-4 py-3"><Badge status={r.type} /></td>
                    <td className={`px-4 py-3 font-semibold ${credit ? "text-emerald-600" : "text-violet-600"}`}>
                      <span className="inline-flex items-center gap-1"><Ico className="h-3.5 w-3.5" />{credit ? "+" : "\u2212"}{r.points}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmt(r.value)}</td>
                    <td className="px-4 py-3 text-slate-500">{r.balance ?? "\u2014"}</td>
                    <td className="px-4 py-3 text-slate-500">{r.booking || "\u2014"}</td>
                    <td className="px-4 py-3 capitalize text-slate-500">{r.source}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{(r.created_at || "").slice(0, 10)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
    </Card>
  );
}

function MembersTable() {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(() => {
    setRows(null);
    const p = new URLSearchParams({ q, page, page_size: pageSize });
    api.get(`/admin/loyalty/members?${p}`)
      .then((r) => { setRows(r.data.items); setTotal(r.data.total); })
      .catch(() => setRows([]));
  }, [q, page, pageSize]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q]);

  return (
    <Card className="overflow-hidden" data-testid="loy-members">
      <div className="flex items-center gap-2 p-3 border-b border-slate-100 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <PInput placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      {rows === null ? <Skeleton /> : rows.length === 0 ? (
        <EmptyState icon={UserRound} title="No members yet" hint="Customers appear here once they start earning loyalty points." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 sticky top-0">
              <tr>{["Customer", "Available", "Earned", "Redeemed", "Lifetime Value", "Last Activity", "Status"].map((h) => (
                <th key={h} className="text-left font-semibold px-4 py-3 whitespace-nowrap">{h}</th>))}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 dark:text-slate-100">{r.name}</p>
                    <p className="text-[11px] text-slate-400">{r.phone}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-[#0D47A1]">{r.available}</span>
                    <span className="text-[11px] text-slate-400 ml-1">({fmt(r.available_value)})</span>
                  </td>
                  <td className="px-4 py-3 text-emerald-600 font-medium">{r.earned}</td>
                  <td className="px-4 py-3 text-violet-600 font-medium">{r.redeemed}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{fmt(r.lifetime_value)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{(r.last_activity || "").slice(0, 10) || "\u2014"}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
    </Card>
  );
}
