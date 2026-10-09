import React from "react";
import { Bug, CircleDot, CheckCircle2 } from "lucide-react";
import { KpiSkeleton } from "@/components/admin/ModuleKit";

const CARDS = [
  { key: "", label: "Total Reports", icon: Bug, count: "all", tone: "text-primary-700 bg-primary-50 dark:bg-primary-900/30 dark:text-primary-300", bar: "bg-primary-700", hint: "All reports from every app" },
  { key: "open", label: "Open Bugs", icon: CircleDot, count: "open", tone: "text-orange-600 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-300", bar: "bg-orange-500", hint: "Awaiting investigation" },
  { key: "solved", label: "Resolved Bugs", icon: CheckCircle2, count: "solved", tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-300", bar: "bg-emerald-500", hint: "Reporter notified with a note" },
];

export default function BugKpis({ counts, status, onPick, loading }) {
  if (loading) return <div className="grid grid-cols-3 gap-2 sm:gap-3"><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></div>;
  const all = counts.all || 0;
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="bug-kpis">
      {CARDS.map((c) => {
        const on = status === c.key;
        const v = counts[c.count] ?? 0;
        const share = c.key && all ? Math.round((v / all) * 100) : null;
        return (
          <button key={c.count} type="button" data-testid={`bug-kpi-${c.count}`} onClick={() => onPick(c.key)} aria-pressed={on}
            className={`group relative overflow-hidden text-left rounded-xl border bg-white dark:bg-slate-900 p-3 sm:p-5 shadow-card hover:shadow-cardhover transition-[box-shadow,border-color] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 ${on ? "border-primary-300 dark:border-primary-700" : "border-slate-200/80 dark:border-slate-800"}`}>
            <span className={`absolute left-0 top-0 h-full w-[3px] ${c.bar} ${on ? "opacity-100" : "opacity-0 group-hover:opacity-60"} transition-opacity`} />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.08em] sm:tracking-[0.12em] text-slate-400 leading-tight">{c.label}</p>
                <p data-testid={`bug-kpi-${c.count}-value`} className="mt-2 font-heading font-black text-[22px] sm:text-[28px] leading-none text-slate-900 dark:text-white tabular-nums">{v}</p>
                <p className="hidden sm:block mt-2 text-xs text-slate-500 truncate">{share != null ? `${share}% of all reports` : c.hint}</p>
              </div>
              <span className={`hidden sm:flex h-10 w-10 shrink-0 rounded-lg items-center justify-center ${c.tone}`}><c.icon className="h-5 w-5" /></span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
