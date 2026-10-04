import { useState } from "react";
import { ChevronDown, CheckCircle2, AlertTriangle, CircleSlash, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { svcStatus, inr } from "./pricingUtils";

const num = (v) => (v === "" ? "" : Number(v));

export function PriceInput({ value, onChange, placeholder = "0", tid, w = "w-[92px]", label }) {
  return (
    <div className={`relative ${w}`}>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none">₹</span>
      <input type="number" min="0" value={value ?? ""} placeholder={placeholder} data-testid={tid} aria-label={label}
        onChange={(e) => onChange(num(e.target.value))}
        className="h-9 w-full pl-5 pr-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30" />
    </div>
  );
}

const STATUS = {
  priced: { cls: "text-emerald-700 bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", icon: CheckCircle2, label: "Priced" },
  missing: { cls: "text-amber-700 bg-amber-50 border-amber-200", dot: "bg-amber-400", icon: AlertTriangle, label: "Missing Price" },
  disabled: { cls: "text-slate-500 bg-slate-100 border-slate-200", dot: "bg-slate-300", icon: CircleSlash, label: "Disabled" },
};

function Sub({ label, children }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[12px] text-slate-500 flex-1 min-w-0 truncate">{label}</span>
      {children}
    </div>
  );
}

export default function ServicePriceRow({ s, sp = {}, onChange, selectable, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ enabled: true, ...sp, ...patch });
  const setIn = (k, key, v) => set({ [k]: { ...(sp[k] || {}), [key]: v } });
  const tid = `pm-svc-${s.id}`;
  const st = STATUS[svcStatus(s, sp)];
  const StIcon = st.icon;
  const hasExtras = s.tiers.length || s.plans.length || s.addons.length;
  const price = Number(sp.price) || 0;
  const mrp = Number(sp.mrp) || 0;
  const savings = mrp > price ? mrp - price : 0;

  return (
    <div className={`px-3 py-2.5 transition-colors ${selected ? "bg-[#0D47A1]/[0.04]" : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"}`} data-testid={tid}>
      <div className="flex items-center gap-2.5">
        {selectable && (
          <input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} data-testid={`${tid}-select`}
            className="h-4 w-4 rounded border-slate-300 text-[#0D47A1] focus:ring-[#0D47A1]/40" />
        )}
        <span className={`h-2 w-2 rounded-full shrink-0 ${st.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-100 truncate">{s.name}</p>
            {s.is_subscription && <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">PLAN</span>}
          </div>
          <p className="text-[12px] text-slate-400 truncate">{s.category_name || "—"}</p>
        </div>

        {!s.tiers.length && !s.is_subscription ? (
          <div className="hidden sm:flex items-center gap-1.5">
            <PriceInput value={sp.price} onChange={(v) => set({ price: v })} placeholder="Price" tid={`${tid}-price`} label="Base price" />
            <PriceInput value={sp.mrp} onChange={(v) => set({ mrp: v })} placeholder="MRP" tid={`${tid}-mrp`} label="MRP" />
          </div>
        ) : (
          <button onClick={() => setOpen((o) => !o)} className="hidden sm:inline text-[12px] font-semibold text-[#0D47A1] hover:underline" data-testid={`${tid}-open-tiers`}>
            {s.is_subscription ? `${s.plans.length} plans` : `${s.tiers.length} variants`}
          </button>
        )}

        {s.addons.length > 0 && (
          <button onClick={() => setOpen((o) => !o)} data-testid={`${tid}-addons-chip`}
            className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-md hover:bg-indigo-100">
            <Plus className="h-3 w-3" />{s.addons.length} add-on{s.addons.length > 1 ? "s" : ""}
          </button>
        )}

        <span className={`hidden lg:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border ${st.cls}`}>
          <StIcon className="h-3 w-3" />{st.label}
        </span>

        <Switch checked={sp.enabled !== false} onCheckedChange={(v) => set({ enabled: v })} data-testid={`${tid}-enabled`} />

        {hasExtras ? (
          <button onClick={() => setOpen((o) => !o)} className="p-1 text-slate-400 hover:text-slate-700" data-testid={`${tid}-toggle`}>
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        ) : <span className="w-6" />}
      </div>

      {/* mobile price inputs */}
      {!s.tiers.length && !s.is_subscription && (
        <div className="sm:hidden flex items-center gap-1.5 mt-2 pl-[18px]">
          <PriceInput value={sp.price} onChange={(v) => set({ price: v })} placeholder="Price" w="flex-1" />
          <PriceInput value={sp.mrp} onChange={(v) => set({ mrp: v })} placeholder="MRP" w="flex-1" />
        </div>
      )}

      {open && hasExtras && (
        <div className="mt-2 ml-[18px] pl-3 border-l-2 border-slate-100 dark:border-slate-800 space-y-0.5" data-testid={`${tid}-extras`}>
          {s.tiers.map((t) => (
            <Sub key={t} label={`Variant · ${t}`}>
              <PriceInput value={sp.tiers?.[t]?.price} onChange={(v) => setIn("tiers", t, { ...(sp.tiers?.[t] || {}), price: v })} placeholder="Price" tid={`${tid}-tier-${t}`} />
              <PriceInput value={sp.tiers?.[t]?.mrp} onChange={(v) => setIn("tiers", t, { ...(sp.tiers?.[t] || {}), mrp: v })} placeholder="MRP" />
            </Sub>
          ))}
          {s.plans.map((p) => (
            <Sub key={p.plan_type} label={`Plan · ${p.label}`}>
              <PriceInput value={sp.plans?.[p.plan_type]} onChange={(v) => setIn("plans", p.plan_type, v)} placeholder="Price" tid={`${tid}-plan-${p.plan_type}`} w="w-[140px]" />
            </Sub>
          ))}
          {s.addons.map((a) => (
            <Sub key={a} label={`+ Add-on · ${a}`}>
              <PriceInput value={sp.addons?.[a]} onChange={(v) => setIn("addons", a, v)} placeholder="Price" tid={`${tid}-addon-${a}`} w="w-[140px]" />
            </Sub>
          ))}
          {savings > 0 && (
            <div className="flex items-center gap-4 pt-1.5 text-[12px]">
              <span className="text-slate-500">Customer pays <b className="text-slate-800 dark:text-slate-100">{inr(price)}</b></span>
              <span className="text-slate-400 line-through">{inr(mrp)}</span>
              <span className="text-emerald-600 font-semibold">Save {inr(savings)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
