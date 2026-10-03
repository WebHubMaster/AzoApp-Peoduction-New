import { useMemo, useState } from "react";
import { Search, Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import ServicePriceRow from "./ServicePriceRow";

export const isPriced = (s, sp) => {
  if (!sp || sp.enabled === false) return false;
  if (s.tiers.length) return s.tiers.some((t) => Number(sp.tiers?.[t]?.price) > 0);
  if (s.is_subscription) return s.plans.some((p) => Number(sp.plans?.[p.plan_type]) > 0);
  return Number(sp.price) > 0;
};

function bump(sp, f) {
  const r = (v) => (v === "" || v == null ? v : Math.round(Number(v) * f * 100) / 100);
  return {
    ...sp, price: r(sp.price), mrp: r(sp.mrp),
    tiers: Object.fromEntries(Object.entries(sp.tiers || {}).map(([k, v]) => [k, { ...v, price: r(v.price), mrp: r(v.mrp) }])),
    addons: Object.fromEntries(Object.entries(sp.addons || {}).map(([k, v]) => [k, r(v)])),
    plans: Object.fromEntries(Object.entries(sp.plans || {}).map(([k, v]) => [k, r(v)])),
  };
}

export default function ServicePrices({ data, edit, setPrices }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [pct, setPct] = useState("");
  const enabledCats = new Set(edit.categories);
  const list = useMemo(() => data.all_services.filter((s) =>
    (cat === "all" || s.category_id === cat) &&
    (!q || s.name.toLowerCase().includes(q.toLowerCase())) &&
    (!onlyMissing || !isPriced(s, edit.prices[s.id]))), [data, cat, q, onlyMissing, edit.prices]);
  const priced = data.all_services.filter((s) => isPriced(s, edit.prices[s.id])).length;
  const setOne = (id) => (sp) => setPrices((p) => ({ ...p, [id]: sp }));
  const applyPct = () => {
    const f = 1 + Number(pct) / 100;
    if (!pct || !Number.isFinite(f)) return;
    setPrices((p) => ({ ...p, ...Object.fromEntries(list.filter((s) => p[s.id]).map((s) => [s.id, bump(p[s.id], f)])) }));
    setPct("");
  };
  const groups = data.all_categories.map((c) => ({ c, rows: list.filter((s) => s.category_id === c.id) })).filter((g) => g.rows.length);

  return (
    <div className="space-y-4" data-testid="pm-services">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat l="Total services" v={data.all_services.length} />
        <Stat l="Priced in city" v={priced} tone="text-emerald-600" tid="pm-stat-priced" />
        <Stat l="Missing price (hidden)" v={data.all_services.length - priced} tone="text-amber-600" tid="pm-stat-missing" />
        <Stat l="Categories live" v={edit.categories.length} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search service…" className="pl-9 h-9" data-testid="pm-search" /></div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-sm" data-testid="pm-cat-filter">
          <option value="all">All categories</option>
          {data.all_categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600"><Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} data-testid="pm-only-missing" />Only missing</label>
        <div className="flex items-center gap-1">
          <div className="relative w-24"><Input value={pct} onChange={(e) => setPct(e.target.value)} type="number" placeholder="+10" className="h-9 pr-7" data-testid="pm-bulk-pct" /><Percent className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" /></div>
          <Button variant="outline" size="sm" className="h-9" onClick={applyPct} data-testid="pm-bulk-apply">Apply to list</Button>
        </div>
      </div>
      {groups.map(({ c, rows }) => (
        <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 px-3 py-2">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{c.name}</p>
            {!enabledCats.has(c.id) && <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">Category off in this city</span>}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((s) => <ServicePriceRow key={s.id} s={s} sp={edit.prices[s.id]} onChange={setOne(s.id)} priced={isPriced(s, edit.prices[s.id])} />)}
          </div>
        </div>
      ))}
      {!groups.length && <p className="text-sm text-slate-400 text-center py-8">No services match.</p>}
    </div>
  );
}

function Stat({ l, v, tone = "text-slate-900 dark:text-white", tid }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{l}</p>
      <p className={`text-2xl font-bold ${tone}`} data-testid={tid}>{v}</p>
    </div>
  );
}
