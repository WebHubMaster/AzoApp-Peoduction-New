import React, { useEffect, useState } from "react";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { RotateCcw, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlideOver } from "./Overlays";
import { DATE_PRESETS, TYPE_OPTIONS, STATUS_OPTIONS, typeMeta, statusMeta } from "./invoiceUtils";

export const EMPTY_FILTERS = { types: [], statuses: [], customer: "", minAmount: "", maxAmount: "", booking: "" };
export const countFilters = (f) => [f.types.length > 0, f.statuses.length > 0, !!f.customer, !!(f.minAmount || f.maxAmount), !!f.booking].filter(Boolean).length;

function Section({ title, hint, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children, testid, count }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={on}
      className={`h-10 sm:h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 border transition-all active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${on
        ? "bg-[#0D47A1] border-[#0D47A1] text-white shadow-sm shadow-primary-500/30"
        : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-primary-300"}`}>
      {on && <Check className="h-3.5 w-3.5" />}{children}
      {count != null && <span className={`text-[10px] px-1.5 rounded-md ${on ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800 text-slate-500"}`}>{count}</span>}
    </button>
  );
}

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/**
 * Advanced filter drawer — works on a local draft, applies on "Apply Filters".
 * `range` controls are included so the mobile sheet has Date as its first section.
 */
export default function InvoiceFilterDrawer({ open, onClose, filters, onApply, range, dateFrom, dateTo, onRangeApply, counts = {} }) {
  const [draft, setDraft] = useState(filters);
  const [dRange, setDRange] = useState(range);
  const [dFrom, setDFrom] = useState(dateFrom);
  const [dTo, setDTo] = useState(dateTo);
  useEffect(() => { if (open) { setDraft(filters); setDRange(range); setDFrom(dateFrom); setDTo(dateTo); } }, [open, filters, range, dateFrom, dateTo]);

  const n = countFilters(draft) + (dRange !== "all" ? 1 : 0);
  const reset = () => { setDraft(EMPTY_FILTERS); setDRange("all"); setDFrom(""); setDTo(""); };
  const apply = () => { onApply(draft); onRangeApply(dRange, dFrom, dTo); onClose(); };
  const amountErr = draft.minAmount && draft.maxAmount && Number(draft.minAmount) > Number(draft.maxAmount);

  return (
    <SlideOver open={open} onClose={onClose} title="Filters" subtitle={n ? `${n} filter${n > 1 ? "s" : ""} applied` : "Refine your invoice list"} testid="invoice-filter-drawer" width={460}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 sm:h-11 flex-1 rounded-xl" onClick={reset} data-testid="invoice-filter-reset"><RotateCcw className="h-4 w-4 mr-1.5" /> Reset Filters</Button>
          <Button className="h-12 sm:h-11 flex-[1.4] rounded-xl bg-[#0D47A1] hover:bg-primary-800 text-white" onClick={apply} disabled={!!amountErr} data-testid="invoice-filter-apply">Apply Filters{n ? ` (${n})` : ""}</Button>
        </div>
      }>
      <div className="space-y-6">
        <Section title="Date Range">
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map(([k, l]) => <Chip key={k} on={dRange === k} onClick={() => setDRange(k)} testid={`filter-range-${k}`}>{l}</Chip>)}
          </div>
          {dRange === "custom" && (
            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <div><label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">From</label><PremiumDatePicker value={dFrom} onChange={(e) => setDFrom(e.target.value)} className="!h-11 mt-1" placeholder="From" data-testid="filter-date-from" /></div>
              <div><label className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">To</label><PremiumDatePicker value={dTo} min={dFrom || undefined} onChange={(e) => setDTo(e.target.value)} className="!h-11 mt-1" placeholder="To" data-testid="filter-date-to" /></div>
            </div>
          )}
        </Section>

        <Section title="Invoice Type" hint={draft.types.length ? `${draft.types.length} selected` : "Any"}>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map((t) => <Chip key={t} on={draft.types.includes(t)} onClick={() => setDraft((d) => ({ ...d, types: toggle(d.types, t) }))} testid={`filter-type-${t}`} count={counts.type_counts?.[t]}>{typeMeta(t).label}</Chip>)}
          </div>
        </Section>

        <Section title="Payment Status" hint={draft.statuses.length ? `${draft.statuses.length} selected` : "Any"}>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => {
              const m = statusMeta(s); const Icon = m.icon;
              return <Chip key={s} on={draft.statuses.includes(s)} onClick={() => setDraft((d) => ({ ...d, statuses: toggle(d.statuses, s) }))} testid={`filter-status-${s}`} count={counts.status_counts?.[s]}><Icon className="h-3.5 w-3.5" /> {m.label}</Chip>;
            })}
          </div>
        </Section>

        <Section title="Amount Range">
          <div className="grid grid-cols-2 gap-2">
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <Input type="number" inputMode="decimal" min="0" value={draft.minAmount} onChange={(e) => setDraft((d) => ({ ...d, minAmount: e.target.value }))} placeholder="Minimum" className="h-11 pl-7" data-testid="invoice-min-amount" /></div>
            <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <Input type="number" inputMode="decimal" min="0" value={draft.maxAmount} onChange={(e) => setDraft((d) => ({ ...d, maxAmount: e.target.value }))} placeholder="Maximum" className="h-11 pl-7" data-testid="invoice-max-amount" /></div>
          </div>
          {amountErr && <p className="text-[11px] text-rose-600 mt-1.5" data-testid="invoice-amount-error">Minimum amount cannot exceed maximum amount.</p>}
        </Section>

        <Section title="Customer">
          <Input value={draft.customer} onChange={(e) => setDraft((d) => ({ ...d, customer: e.target.value }))} placeholder="Customer name or mobile" className="h-11" data-testid="invoice-customer-filter" />
        </Section>

        <Section title="Booking Reference">
          <Input value={draft.booking} onChange={(e) => setDraft((d) => ({ ...d, booking: e.target.value }))} placeholder="e.g. AZOFAE448" className="h-11 font-mono uppercase" data-testid="invoice-booking-filter" />
        </Section>
      </div>
    </SlideOver>
  );
}
