import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import PremiumDatePicker, { keepPremiumCal } from "@/components/ui/PremiumDatePicker";
import { label } from "../bookings/shared";
import { SET_LABEL } from "./subShared";

export const EMPTY_SUB_ADV = { status: "", plan: "", customer: "", maid: "", payment: "", settlement: "", startFrom: "", startTo: "", endFrom: "", endTo: "", min: "", max: "" };
export const subAdvCount = (a) => Object.keys(EMPTY_SUB_ADV).filter((k) => a[k] !== "").length;

const Sel = ({ id, value, onChange, opts, all, fmt = label }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`sub-adv-${id}`}
    className="h-10 w-full rounded-lg border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-[14px] text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
    <option value="">{all}</option>
    {opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
  </select>
);
const F = ({ l, id, children }) => <div><label htmlFor={id} className="block text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1">{l}</label>{children}</div>;
const DatePair = ({ a, set, k1, k2, l }) => (
  <F l={l} id={k1}>
    <div className="grid grid-cols-2 gap-3">
      <PremiumDatePicker id={k1} className="!text-[14px]" placeholder="From" value={a[k1]} max={a[k2] || undefined} onChange={(e) => set(k1)(e.target.value)} data-testid={`sub-adv-${k1}`} />
      <PremiumDatePicker className="!text-[14px]" placeholder="To" value={a[k2]} min={a[k1] || undefined} onChange={(e) => set(k2)(e.target.value)} data-testid={`sub-adv-${k2}`} aria-label={`${l} to`} />
    </div>
  </F>
);
const Pair = ({ a, set, k1, k2, type, p1, p2, l }) => (
  <F l={l} id={k1}>
    <div className="grid grid-cols-2 gap-3">
      <Input id={k1} type={type} min="0" className="h-10 rounded-lg" placeholder={p1} value={a[k1]} onChange={(e) => set(k1)(e.target.value)} data-testid={`sub-adv-${k1}`} />
      <Input type={type} min="0" className="h-10 rounded-lg" placeholder={p2} value={a[k2]} onChange={(e) => set(k2)(e.target.value)} data-testid={`sub-adv-${k2}`} aria-label={`${l} ${p2 || "to"}`} />
    </div>
  </F>
);

export default function SubFilterDrawer({ value, options, onApply, onClose }) {
  const [a, setA] = useState(value);
  const set = (k) => (v) => setA((o) => ({ ...o, [k]: v }));
  const n = subAdvCount(a);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0 text-[14px]" data-testid="sub-filter-drawer" onInteractOutside={keepPremiumCal}>
        <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] dark:border-slate-800 text-left space-y-0.5">
          <SheetTitle className="text-[17px] font-semibold">Filter Subscriptions {n > 0 && <span className="ml-1 text-[11.5px] font-semibold text-[#0D47A1] bg-blue-50 rounded px-1.5 py-0.5 align-middle">{n} active</span>}</SheetTitle>
          <SheetDescription className="text-[12.5px]">Combine filters to narrow down the subscription list.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <F l="Subscription Status" id="status"><Sel id="status" value={a.status} onChange={set("status")} opts={options.status} all="All statuses" /></F>
            <F l="Plan" id="plan"><Sel id="plan" value={a.plan} onChange={set("plan")} opts={options.plan} all="All plans" fmt={(x) => x} /></F>
          </div>
          <F l="Customer" id="customer"><Input id="customer" className="h-10 rounded-lg" placeholder="Customer name or phone" value={a.customer} onChange={(e) => set("customer")(e.target.value)} data-testid="sub-adv-customer" /></F>
          <F l="Maid" id="maid"><Input id="maid" className="h-10 rounded-lg" placeholder="Maid name (or 'unassigned')" value={a.maid} onChange={(e) => set("maid")(e.target.value)} data-testid="sub-adv-maid" /></F>
          <div className="grid grid-cols-2 gap-3">
            <F l="Payment Status" id="payment"><Sel id="payment" value={a.payment} onChange={set("payment")} opts={options.payment} all="All" /></F>
            <F l="Settlement Status" id="settlement"><Sel id="settlement" value={a.settlement} onChange={set("settlement")} opts={options.settlement} all="All" fmt={(x) => SET_LABEL[x] || label(x)} /></F>
          </div>
          <DatePair a={a} set={set} k1="startFrom" k2="startTo" l="Start Date" />
          <DatePair a={a} set={set} k1="endFrom" k2="endTo" l="End Date" />
          <Pair a={a} set={set} k1="min" k2="max" type="number" p1="Min" p2="Max" l="Amount Range (₹)" />
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] dark:border-slate-800 flex justify-between gap-2">
          <Button variant="ghost" className="h-9 text-[13.5px] text-slate-600" onClick={() => setA(EMPTY_SUB_ADV)} data-testid="sub-adv-reset">Reset</Button>
          <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={() => onApply(a)} data-testid="sub-adv-apply">Apply Filters</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
