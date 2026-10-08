import { useEffect, useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PremiumMultiSelect from "@/components/ui/PremiumMultiSelect";

export const FILTER_FIELDS = [
  { key: "source", label: "Earning Type", opt: (m) => (m.sources || []).map((s) => ({ value: s.key, label: s.label })) },
  { key: "method", label: "Payment Method", opt: (m) => (m.methods || []).map((v) => ({ value: v, label: METHOD_LABEL[v] || v })) },
  { key: "service", label: "Service", opt: (m) => (m.services || []).map((v) => ({ value: v, label: v })) },
  { key: "category", label: "Category", opt: (m) => (m.categories || []).map((v) => ({ value: v, label: v })) },
  { key: "city", label: "City", opt: (m) => (m.cities || []).map((v) => ({ value: v, label: v })) },
  { key: "partner", label: "Partner", opt: (m) => (m.partners || []).map((p) => ({ value: p.id, label: p.name || p.id })) },
  { key: "merchant", label: "Merchant", opt: (m) => (m.merchants || []).map((p) => ({ value: p.id, label: p.name || p.id })) },
  { key: "customer", label: "Customer", opt: (m) => (m.customers || []).map((p) => ({ value: p.id, label: p.name })) },
  { key: "txn_status", label: "Transaction Status", opt: (m) => (m.txn_statuses || []).map((v) => ({ value: v, label: cap(v) })) },
  { key: "booking_status", label: "Booking Status", opt: (m) => (m.booking_statuses || []).map((v) => ({ value: v, label: cap(v) })) },
  { key: "payment_status", label: "Payment Status", opt: (m) => (m.payment_statuses || []).map((v) => ({ value: v, label: cap(v) })) },
  { key: "refund_status", label: "Refund Status", opt: (m) => (m.refund_statuses || []).map((v) => ({ value: v, label: cap(v) })) },
];
export const METHOD_LABEL = { upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Wallet", cod: "Cash on Service", bank: "Bank", razorpay: "Razorpay", mock: "Test (mock)" };
const cap = (s) => String(s || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
export const EMPTY_FILTERS = Object.fromEntries([...FILTER_FIELDS.map((f) => [f.key, []]), ["min_amount", ""], ["max_amount", ""]]);

export const activeCount = (f) => FILTER_FIELDS.reduce((n, x) => n + (f[x.key]?.length ? 1 : 0), 0) + (f.min_amount !== "" ? 1 : 0) + (f.max_amount !== "" ? 1 : 0);

export function labelFor(meta, key, value) {
  const field = FILTER_FIELDS.find((f) => f.key === key);
  const o = field?.opt(meta || {}).find((x) => String(x.value) === String(value));
  return o?.label || value;
}

/** Desktop right drawer / mobile bottom sheet. Edits a draft; Apply commits. */
export default function PeFilters({ open, onClose, meta, value, onApply }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  if (!open) return null;
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const n = activeCount(draft);
  return (
    <div className="fixed inset-0 z-[9990]" data-testid="pe-filter-drawer">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[90vh] rounded-t-2xl md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:h-full md:max-h-none md:w-[440px] md:rounded-none bg-white dark:bg-slate-900 flex flex-col shadow-2xl animate-[slideUp_.2s_ease] md:animate-none">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-[#0D47A1]" />
            <p className="font-heading font-bold text-slate-900 dark:text-white">Advanced Filters</p>
            {n > 0 && <span data-testid="pe-filter-draft-count" className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-[#0D47A1] text-white">{n}</span>}
          </div>
          <button onClick={onClose} data-testid="pe-filter-close" className="p-1 text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {FILTER_FIELDS.map((f) => {
            const opts = f.opt(meta || {});
            if (!opts.length) return null;
            return (
              <div key={f.key}>
                <label className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">{f.label}</label>
                <PremiumMultiSelect data-testid={`pe-filter-${f.key}`} value={draft[f.key] || []} onChange={(v) => set(f.key, v)} options={opts} placeholder={`All ${f.label.toLowerCase()}s`} searchable={opts.length > 8} className="w-full" />
              </div>
            );
          })}
          <div>
            <label className="text-[12px] font-semibold text-slate-600 dark:text-slate-300 block mb-1.5">Gross amount range (₹)</label>
            <div className="grid grid-cols-2 gap-2">
              <Input data-testid="pe-filter-min" type="number" inputMode="decimal" placeholder="Minimum" value={draft.min_amount} onChange={(e) => set("min_amount", e.target.value)} />
              <Input data-testid="pe-filter-max" type="number" inputMode="decimal" placeholder="Maximum" value={draft.max_amount} onChange={(e) => set("max_amount", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
          <Button variant="outline" className="flex-1" data-testid="pe-filter-clear" onClick={() => setDraft(EMPTY_FILTERS)}>Clear All</Button>
          <Button className="flex-1 bg-[#0D47A1] hover:bg-[#0B3C8A]" data-testid="pe-filter-apply" onClick={() => { onApply(draft); onClose(); }}>Apply{n ? ` (${n})` : ""}</Button>
        </div>
      </div>
    </div>
  );
}
