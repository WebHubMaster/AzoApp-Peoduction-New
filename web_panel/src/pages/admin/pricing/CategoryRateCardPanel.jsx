import { Receipt, ArrowRight, Wand2 } from "lucide-react";
import { PriceInput } from "./ServicePriceRow";
import { rateTemplateValues } from "./pricingUtils";

// Sticky right panel: shows the rate card for the currently selected category and
// lets the admin edit it inline (writes into edit.ratecards — saved with the city).
export default function CategoryRateCardPanel({ card, categoryName, values, setValues, onGoRateCards }) {
  const set = (id, k, v) => setValues((o) => ({ ...(o || {}), [id]: { ...((o || {})[id] || {}), [k]: v === "" ? "" : String(v) } }));
  const useTemplate = () => { if (card) setValues((o) => ({ ...(o || {}), ...rateTemplateValues(card) })); };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden" data-testid="pm-ratecard-panel">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50">
        <Receipt className="h-4 w-4 text-[#0D47A1]" />
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Rate Card</p>
          <p className="text-[15px] font-bold text-slate-800 dark:text-slate-100 truncate">{categoryName || "Select a category"}</p>
        </div>
        {card && (
          <button onClick={useTemplate} className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-[#0D47A1] hover:underline shrink-0" data-testid="pm-panel-use-template">
            <Wand2 className="h-3 w-3" />Template
          </button>
        )}
      </div>

      {!card ? (
        <div className="p-6 text-center" data-testid="pm-ratecard-empty">
          <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">No Rate Card Configured</p>
          <p className="mt-1 text-[12px] text-slate-500">This category has no rate card for this city yet.</p>
          <button onClick={onGoRateCards} className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#0D47A1] hover:underline">
            Configure Rate Card <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto p-3 space-y-3">
          <p className="text-[12px] text-slate-400">Rows with no Service charge stay hidden in this city.</p>
          {card.groups.map((g) => (
            <div key={g.id}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1 px-1">{g.name}</p>
              <div className="space-y-1">
                {g.rows.map((r) => (
                  <div key={r.id} className="rounded-lg border border-slate-100 dark:border-slate-800 px-2.5 py-2">
                    <p className="text-[13px] text-slate-700 dark:text-slate-200 mb-1.5 truncate">{r.description}</p>
                    <div className="flex items-center gap-1.5">
                      <PriceInput value={values?.[r.id]?.service_charge} onChange={(v) => set(r.id, "service_charge", v)} placeholder={r.service_charge || "Service"} tid={`pm-rc-${r.id}`} w="flex-1" />
                      <PriceInput value={values?.[r.id]?.labour_charge} onChange={(v) => set(r.id, "labour_charge", v)} placeholder={r.labour_charge || "Labour"} w="flex-1" />
                      <PriceInput value={values?.[r.id]?.original_charge} onChange={(v) => set(r.id, "original_charge", v)} placeholder={r.original_charge || "MRP"} w="flex-1" />
                    </div>
                  </div>
                ))}
                {!g.rows.length && <p className="text-[12px] text-slate-400 px-1">No rows.</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
