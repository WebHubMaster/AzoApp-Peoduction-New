import { Layers, Package, CheckCircle2, AlertTriangle, Tag, IndianRupee } from "lucide-react";
import { isPriced, inr } from "./pricingUtils";

function Card({ icon: Icon, label, value, tone = "text-slate-900 dark:text-white", ring = "text-slate-300", tid }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-3 flex items-center gap-3" data-testid={tid}>
      <div className={`h-9 w-9 shrink-0 rounded-lg bg-slate-50 dark:bg-slate-800 grid place-items-center ${ring}`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold truncate">{label}</p>
        <p className={`text-[20px] leading-tight font-bold ${tone}`}>{value}</p>
      </div>
    </div>
  );
}

export default function PricingSummary({ data, edit }) {
  const all = data.all_services || [];
  const priced = all.filter((s) => isPriced(s, edit.prices[s.id])).length;
  const missing = all.length - priced;
  const addonTotal = all.reduce((n, s) => n + (s.addons?.length || 0), 0);
  const prices = all.map((s) => Number(edit.prices[s.id]?.price)).filter((n) => n > 0);
  const avg = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3" data-testid="pm-summary">
      <Card icon={Package} label="Total Services" value={all.length} ring="text-slate-400" tid="pm-summary-total" />
      <Card icon={CheckCircle2} label="Priced" value={priced} tone="text-emerald-600" ring="text-emerald-500" tid="pm-summary-priced" />
      <Card icon={AlertTriangle} label="Missing Price" value={missing} tone={missing ? "text-amber-600" : "text-slate-900 dark:text-white"} ring={missing ? "text-amber-500" : "text-slate-400"} tid="pm-summary-missing" />
      <Card icon={Layers} label="Categories" value={edit.categories.length} ring="text-[#0D47A1]" tid="pm-summary-categories" />
      <Card icon={Tag} label="Add-ons" value={addonTotal} ring="text-indigo-500" tid="pm-summary-addons" />
      <Card icon={IndianRupee} label="Average Price" value={avg ? inr(avg) : "—"} ring="text-[#2563EB]" tid="pm-summary-avg" />
    </div>
  );
}
