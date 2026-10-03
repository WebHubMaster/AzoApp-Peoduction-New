import { Switch } from "@/components/ui/switch";

const num = (v) => (v === "" ? "" : Number(v));

export function PriceInput({ value, onChange, placeholder = "₹", tid, w = "w-24" }) {
  return (
    <div className={`relative ${w}`}>
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">₹</span>
      <input type="number" min="0" value={value ?? ""} placeholder={placeholder} data-testid={tid}
        onChange={(e) => onChange(num(e.target.value))}
        className="h-8 w-full pl-5 pr-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0D47A1]/30" />
    </div>
  );
}

function Sub({ label, children }) {
  return (
    <div className="flex items-center gap-2 pl-4 py-1">
      <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">{label}</span>
      {children}
    </div>
  );
}

export default function ServicePriceRow({ s, sp = {}, onChange, priced }) {
  const set = (patch) => onChange({ enabled: true, ...sp, ...patch });
  const setIn = (k, key, v) => set({ [k]: { ...(sp[k] || {}), [key]: v } });
  const tid = `pm-svc-${s.id}`;
  return (
    <div className="px-3 py-2.5" data-testid={tid}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${priced ? "bg-emerald-500" : "bg-amber-400"}`} title={priced ? "Live" : "Hidden — no price"} />
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-1 min-w-[160px]">{s.name}
          {s.is_subscription && <span className="ml-2 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">SUBSCRIPTION</span>}
        </p>
        {!s.tiers.length && !s.is_subscription && (
          <>
            <PriceInput value={sp.price} onChange={(v) => set({ price: v })} placeholder="Price" tid={`${tid}-price`} />
            <PriceInput value={sp.mrp} onChange={(v) => set({ mrp: v })} placeholder="MRP" tid={`${tid}-mrp`} />
          </>
        )}
        <Switch checked={sp.enabled !== false} onCheckedChange={(v) => set({ enabled: v })} data-testid={`${tid}-enabled`} />
      </div>
      {s.tiers.map((t) => (
        <Sub key={t} label={`Variant · ${t}`}>
          <PriceInput value={sp.tiers?.[t]?.price} onChange={(v) => setIn("tiers", t, { ...(sp.tiers?.[t] || {}), price: v })} placeholder="Price" tid={`${tid}-tier-${t}`} />
          <PriceInput value={sp.tiers?.[t]?.mrp} onChange={(v) => setIn("tiers", t, { ...(sp.tiers?.[t] || {}), mrp: v })} placeholder="MRP" />
        </Sub>
      ))}
      {s.plans.map((p) => (
        <Sub key={p.plan_type} label={`Plan · ${p.label}`}>
          <PriceInput value={sp.plans?.[p.plan_type]} onChange={(v) => setIn("plans", p.plan_type, v)} placeholder="Plan price" tid={`${tid}-plan-${p.plan_type}`} w="w-[200px]" />
        </Sub>
      ))}
      {s.addons.map((a) => (
        <Sub key={a} label={`+ Add-on · ${a}`}>
          <PriceInput value={sp.addons?.[a]} onChange={(v) => setIn("addons", a, v)} placeholder="Price" tid={`${tid}-addon-${a}`} w="w-[200px]" />
        </Sub>
      ))}
    </div>
  );
}
