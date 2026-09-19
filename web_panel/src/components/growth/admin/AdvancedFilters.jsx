import PremiumSelect from "@/components/ui/PremiumSelect";
import React, { useEffect, useState } from "react";
import { SlidersHorizontal, X, RotateCcw, Bookmark, Check } from "lucide-react";
import { cn, inp, Field } from "./kit";
import DateRangePicker from "./DateRangePicker";

/*
 * Reusable premium Advanced Filters drawer.
 * fields: [{ key, label, type: 'select'|'text'|'daterange'|'numrange', options:[{value,label}], placeholder }]
 * value: current applied values object
 * onApply(values), onReset()
 * savedFilters:[{name, values}], onSaveFilter(name, values), onApplySaved(values)
 */
export default function AdvancedFilters({ open, onClose, fields = [], value = {}, onApply, onReset, savedFilters = [], onSaveFilter }) {
  const [draft, setDraft] = useState(value);
  const [saveName, setSaveName] = useState("");
  useEffect(() => { if (open) setDraft(value || {}); }, [open, value]);

  const set = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[9998]" data-testid="advanced-filters">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 shadow-2xl flex flex-col animate-[slideIn_.2s_ease]">
        <style>{"@keyframes slideIn{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}"}</style>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-lg bg-primary-50 dark:bg-primary-900/30 grid place-items-center text-primary-700"><SlidersHorizontal className="h-4 w-4" /></span>
            <h3 className="font-bold text-slate-900 dark:text-white">Advanced Filters</h3>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {savedFilters.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">Saved filters</p>
              <div className="flex flex-wrap gap-2">
                {savedFilters.map((s) => (
                  <button key={s.name} onClick={() => setDraft(s.values)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:text-primary-700">
                    <Bookmark className="h-3.5 w-3.5" /> {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {fields.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "select" && (
                <PremiumSelect value={draft[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} className={inp} placeholder="All">
                  <option value="">All</option>
                  {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </PremiumSelect>
              )}
              {f.type === "text" && (
                <input value={draft[f.key] || ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder || ""} className={inp} />
              )}
              {f.type === "daterange" && (
                <DateRangePicker value={draft[f.key] || {}} onChange={(v) => set(f.key, v)} align="left" />
              )}
              {f.type === "numrange" && (
                <div className="flex items-center gap-2">
                  <input type="number" value={draft[`${f.key}_min`] ?? ""} onChange={(e) => set(`${f.key}_min`, e.target.value)} placeholder="Min" className={inp} />
                  <span className="text-slate-400">–</span>
                  <input type="number" value={draft[`${f.key}_max`] ?? ""} onChange={(e) => set(`${f.key}_max`, e.target.value)} placeholder="Max" className={inp} />
                </div>
              )}
            </Field>
          ))}

          {onSaveFilter && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-semibold text-slate-500 mb-2">Save this filter</p>
              <div className="flex items-center gap-2">
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Pending Rewards" className={inp} />
                <button onClick={() => { if (saveName.trim()) { onSaveFilter(saveName.trim(), draft); setSaveName(""); } }}
                  className="h-10 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5 shrink-0"><Check className="h-4 w-4" /> Save</button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <button onClick={() => { setDraft({}); onReset?.(); }} className="h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Reset</button>
          <button data-testid="apply-filters" onClick={() => { onApply?.(draft); onClose(); }} className="flex-1 h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold">Apply Filters</button>
        </div>
      </div>
    </div>
  );
}

export const FilterBtn = ({ onClick, count = 0 }) => (
  <button onClick={onClick} data-testid="open-advanced-filters"
    className="h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5">
    <SlidersHorizontal className="h-4 w-4" /> Filters
    {count > 0 && <span className="h-5 min-w-5 px-1 grid place-items-center rounded-full bg-primary-600 text-white text-[10px] font-bold">{count}</span>}
  </button>
);
