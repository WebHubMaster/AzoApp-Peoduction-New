import { Receipt } from "lucide-react";
import { PriceInput } from "./ServicePriceRow";

export default function RateCardPrices({ cards, values, setValues }) {
  const set = (id, k, v) => setValues((o) => ({ ...(o || {}), [id]: { ...((o || {})[id] || {}), [k]: v === "" ? "" : String(v) } }));
  if (!cards.length) return <p className="text-[13px] text-slate-400 text-center py-10">No rate cards created yet.</p>;
  return (
    <div className="space-y-3" data-testid="pm-ratecards">
      <p className="text-[13px] text-slate-500">Rows with an empty Service charge stay hidden in this city.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {cards.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <p className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-[14px] font-bold text-slate-700 dark:text-slate-200">
              <Receipt className="h-4 w-4 text-[#0D47A1]" />{c.title}
            </p>
            {c.groups.map((g) => (
              <div key={g.id} className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{g.name}</p>
                {g.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-1.5 py-1">
                    <span className="text-[13px] text-slate-700 dark:text-slate-200 flex-1 min-w-[150px] truncate">{r.description}</span>
                    <PriceInput value={values?.[r.id]?.service_charge} onChange={(v) => set(r.id, "service_charge", v)} placeholder="Service" tid={`pm-rc-${r.id}`} />
                    <PriceInput value={values?.[r.id]?.labour_charge} onChange={(v) => set(r.id, "labour_charge", v)} placeholder="Labour" />
                    <PriceInput value={values?.[r.id]?.original_charge} onChange={(v) => set(r.id, "original_charge", v)} placeholder="MRP" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
