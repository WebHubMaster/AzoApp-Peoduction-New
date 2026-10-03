import { MapPin } from "lucide-react";
import { PriceInput } from "./ServicePriceRow";

const FEES = [
  ["platform_fee", "Platform Fee", "Charged once per booking (tax & commission apply on this)"],
  ["global_visiting_charge", "Visiting Charge", "Applied on orders below the minimum service amount"],
  ["min_service_amount_for_visiting", "Min Service Amount", "Below this amount the visiting charge applies"],
  ["emergency_fee", "Quick / Emergency Fee", "Per-category emergency booking fee"],
  ["min_labour_charge", "Minimum Labour Charge", "Used on rate-card items that have no labour value"],
];

export default function CityFees({ city, defaults, fees, setFees }) {
  return (
    <div className="space-y-3 max-w-3xl" data-testid="pm-fees">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0D47A1] bg-[#0D47A1]/[0.06] px-2.5 py-1 rounded-full"><MapPin className="h-3 w-3" />{city}</span>
        <p className="text-[13px] text-slate-500">Leave blank to use the global default (Business Settings).</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        {FEES.map(([k, l, h]) => (
          <div key={k} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">{l}</p>
              <p className="text-[12px] text-slate-400">{h} · Default ₹{defaults?.[k] ?? 0}</p>
            </div>
            <PriceInput value={fees?.[k]} placeholder={String(defaults?.[k] ?? "")} w="w-28" tid={`pm-fee-${k}`}
              onChange={(v) => setFees((f) => ({ ...(f || {}), [k]: v }))} />
          </div>
        ))}
      </div>
    </div>
  );
}
