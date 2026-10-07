import { useMemo } from "react";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function presetRange(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = (x) => { const c = new Date(now); c.setDate(c.getDate() + x); return c; };
  switch (key) {
    case "today": return [iso(now), iso(now)];
    case "yesterday": return [iso(d(-1)), iso(d(-1))];
    case "7d": return [iso(d(-6)), iso(now)];
    case "30d": return [iso(d(-29)), iso(now)];
    case "month": return [iso(new Date(now.getFullYear(), now.getMonth(), 1)), iso(now)];
    case "lastmonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return [iso(first), iso(last)];
    }
    default: return ["", ""];
  }
}

const PRESETS = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"],
  ["30d", "Last 30 days"], ["month", "This month"], ["lastmonth", "Last month"],
];

/** Premium date-range control: quick presets + From/To custom pickers. */
export default function DateRangeControl({ from, to, onChange, testid = "date-range" }) {
  const activePreset = useMemo(() => {
    for (const [k] of PRESETS) {
      const [f, t] = presetRange(k);
      if (f === from && t === to) return k;
    }
    return "";
  }, [from, to]);

  return (
    <div className="space-y-3" data-testid={testid}>
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([k, label]) => (
          <button
            key={k} type="button" data-testid={`${testid}-preset-${k}`}
            onClick={() => { const [f, t] = presetRange(k); onChange(f, t); }}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              activePreset === k
                ? "bg-primary-700 text-white border-primary-700"
                : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-300"}`}>
            {label}
          </button>
        ))}
        {(from || to) && (
          <button type="button" data-testid={`${testid}-clear`} onClick={() => onChange("", "")}
            className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-slate-400 hover:text-red-500">Clear</button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">From</label>
          <PremiumDatePicker value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} placeholder="From date" data-testid={`${testid}-from`} />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 block mb-1">To</label>
          <PremiumDatePicker value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} placeholder="To date" data-testid={`${testid}-to`} />
        </div>
      </div>
    </div>
  );
}
