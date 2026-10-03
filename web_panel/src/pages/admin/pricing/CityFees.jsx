import { PriceInput } from "./ServicePriceRow";

const FEES = [
  ["platform_fee", "Platform Fee", "Har booking par ek baar (tax isi + commission par)"],
  ["global_visiting_charge", "Visiting Charge", "Minimum amount se kam order par lagta hai"],
  ["min_service_amount_for_visiting", "Min Service Amount (for visiting)", "Is amount se kam service par visiting charge lagega"],
  ["emergency_fee", "Quick Service / Emergency Fee", "Emergency booking par per category"],
  ["min_labour_charge", "Minimum Labour Charge", "Rate card items par jahan labour nahi hai"],
];

export default function CityFees({ defaults, fees, setFees }) {
  return (
    <div className="space-y-2 max-w-2xl" data-testid="pm-fees">
      <p className="text-sm text-slate-500 mb-2">Khali chhodne par global default lagega (Business Settings).</p>
      {FEES.map(([k, l, h]) => (
        <div key={k} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l}</p>
            <p className="text-xs text-slate-400">{h} · Default ₹{defaults?.[k] ?? 0}</p>
          </div>
          <PriceInput value={fees?.[k]} placeholder={String(defaults?.[k] ?? "")} w="w-28" tid={`pm-fee-${k}`}
            onChange={(v) => setFees((f) => ({ ...(f || {}), [k]: v }))} />
        </div>
      ))}
    </div>
  );
}
