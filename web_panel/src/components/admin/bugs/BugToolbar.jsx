import React from "react";
import { SearchInput, ChipBar } from "@/components/admin/ModuleKit";
import { PremiumSelect, PremiumDateRangePicker } from "@/components/ui/premium";
import { CAT_LABEL, STATUS_LABEL, ROLE_LABEL, SORTS, DATE_PRESETS, presetLabel } from "./bugUtils";

const Segmented = ({ value, options, onChange, testPrefix, counts }) => (
  <div className="inline-flex shrink-0 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700" role="tablist">
    {options.map(([k, l]) => {
      const on = value === k;
      const c = counts?.[k || "all"];
      return (
        <button key={k || "all"} type="button" role="tab" aria-selected={on} data-testid={`${testPrefix}-${k || "all"}`} onClick={() => onChange(k)}
          className={`h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${on ? "bg-white dark:bg-slate-900 text-primary-700 dark:text-primary-300 shadow-sm" : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
          {l}{c != null && <span className={`tabular-nums text-[10px] font-bold ${on ? "text-primary-600" : "text-slate-400"}`}>{c}</span>}
        </button>
      );
    })}
  </div>
);

export default function BugToolbar({ f, set, counts, catCounts, onClearAll }) {
  const catOptions = [{ value: "", label: `All categories (${catCounts.all ?? 0})` },
    ...Object.entries(CAT_LABEL).map(([k, l]) => ({ value: k, label: `${l} (${catCounts[k] ?? 0})` }))];
  const chips = [
    f.status && { key: "s", label: `Status: ${STATUS_LABEL[f.status]}`, onRemove: () => set({ status: "" }), testId: "bug-chip-status" },
    f.role && { key: "r", label: `App: ${ROLE_LABEL[f.role]}`, onRemove: () => set({ role: "" }), testId: "bug-chip-role" },
    f.category && { key: "c", label: `Category: ${CAT_LABEL[f.category]}`, onRemove: () => set({ category: "" }), testId: "bug-chip-category" },
    f.range && { key: "d", label: `Date: ${presetLabel(f.range)}`, onRemove: () => set({ range: null }), testId: "bug-chip-date" },
    f.q && { key: "q", label: `Search: “${f.q}”`, onRemove: () => set({ q: "" }), testId: "bug-chip-search" },
  ].filter(Boolean);

  return (
    <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-card" data-testid="bug-toolbar">
      <div className="p-3 sm:p-4 flex flex-col xl:flex-row xl:items-center gap-3">
        <SearchInput value={f.q} onChange={(e) => set({ q: e.target.value })} onClear={() => set({ q: "" })} placeholder="Search title, description, reporter, phone or BUG-ID…" data-testid="bug-search" className="xl:flex-1 xl:max-w-md" />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={f.status} options={[["", "All"], ["open", "Open"], ["solved", "Solved"]]} counts={counts} onChange={(v) => set({ status: v })} testPrefix="bug-tab" />
          <Segmented value={f.role} options={[["", "All apps"], ["customer", "Customer"], ["partner", "Partner"]]} onChange={(v) => set({ role: v })} testPrefix="bug-app" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 xl:flex items-center gap-2 xl:ml-auto">
          <PremiumSelect value={f.category} onChange={(e) => set({ category: e.target.value })} options={catOptions} searchable data-testid="bug-category-select" className="xl:w-48" />
          <PremiumDateRangePicker from={f.range?.from} to={f.range?.to} presets={DATE_PRESETS} max={new Date().toISOString().slice(0, 10)} align="end" triggerLabel="Any date"
            onApply={(r) => set({ range: r })} data-testid="bug-date-range" />
          <PremiumSelect value={f.sort} onChange={(e) => set({ sort: e.target.value })} options={SORTS} data-testid="bug-sort-select" className="xl:w-40" />
        </div>
      </div>
      {chips.length > 0 && <div className="px-3 sm:px-4 py-2.5 border-t border-slate-100 dark:border-slate-800" data-testid="bug-active-filters"><ChipBar chips={chips} onClearAll={onClearAll} /></div>}
    </div>
  );
}
