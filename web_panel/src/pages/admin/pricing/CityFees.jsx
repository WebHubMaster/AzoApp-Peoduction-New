import { MapPin, Store } from "lucide-react";
import { PriceInput } from "./ServicePriceRow";

const FEES = [
  ["platform_fee", "Platform Fee", "Charged once per booking (tax & commission apply on this)"],
  ["global_visiting_charge", "Visiting Charge", "Applied on orders below the minimum service amount"],
  ["min_service_amount_for_visiting", "Min Service Amount", "Below this amount the visiting charge applies"],
  ["emergency_fee", "Quick / Emergency Fee", "Per-category quick/emergency booking fee (commission + tax apply)"],
  ["min_labour_charge", "Minimum Labour Charge", "Used on rate-card items that have no labour value"],
];

// City-wise merchant commission %s. These OVERRIDE the category/global merchant %s so a
// merchant earns exactly the rate set for this city. Leave blank to use the global value.
const MERCHANT = [
  ["merchant_partner_referral_pct", "Merchant · Partner Referral %", "Paid to the merchant who onboarded the PARTNER"],
  ["merchant_customer_pct", "Merchant · Customer %", "Paid to the merchant the CUSTOMER booked through"],
];

function PctInput({ value, onChange, tid }) {
  return (
    <div className="relative w-28">
      <input type="number" min="0" max="100" step="0.01" value={value ?? ""} placeholder="0" data-testid={tid}
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="h-9 w-full pr-6 pl-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30" />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none">%</span>
    </div>
  );
}

export default function CityFees({ city, defaults, fees, setFees }) {
  return (
    <div className="space-y-4 max-w-3xl" data-testid="pm-fees">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#0D47A1] bg-[#0D47A1]/[0.06] px-2.5 py-1 rounded-md"><MapPin className="h-3 w-3" />{city}</span>
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

      <div className="pt-1">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 mb-2">
          <Store className="h-3.5 w-3.5 text-[#0D47A1]" /> Merchant Commission (city-wise)
        </p>
        <div className="grid sm:grid-cols-2 gap-2.5">
          {MERCHANT.map(([k, l, h]) => (
            <div key={k} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">{l}</p>
                <p className="text-[12px] text-slate-400">{h}</p>
              </div>
              <PctInput value={fees?.[k]} tid={`pm-fee-${k}`}
                onChange={(v) => setFees((f) => ({ ...(f || {}), [k]: v }))} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
