import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import DateRangeMenu from "./DateRangeMenu";
import { keepPremiumCal } from "@/components/ui/PremiumDatePicker";
import { label } from "./shared";

export const EMPTY_ADV = { status: "", type: "", service: "", category: "", customer: "", partner: "", payment: "", min: "", max: "", date: { key: "all" } };
export const advCount = (a) => ["status", "type", "service", "category", "customer", "partner", "payment", "min", "max"].filter((k) => a[k] !== "").length + (a.date.key !== "all" ? 1 : 0);

const Sel = ({ id, value, onChange, opts, all }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} data-testid={`bk-adv-${id}`}
    className="h-10 w-full rounded-md border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-[14px] text-slate-700 dark:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
    <option value="">{all}</option>
    {opts.map((o) => <option key={o} value={o}>{label(o)}</option>)}
  </select>
);
const F = ({ l, id, children }) => <div><label htmlFor={id} className="block text-[13px] font-medium text-slate-700 dark:text-slate-200 mb-1">{l}</label>{children}</div>;

export default function FilterDrawer({ value, options, onApply, onClose }) {
  const [a, setA] = useState(value);
  const set = (k) => (v) => setA((o) => ({ ...o, [k]: v }));
  const n = advCount(a);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[420px] p-0 flex flex-col gap-0 text-[14px]" data-testid="bk-filter-drawer" onInteractOutside={keepPremiumCal}>
        <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] dark:border-slate-800 text-left space-y-0.5">
          <SheetTitle className="text-[17px] font-semibold">Filter Bookings {n > 0 && <span className="ml-1 text-[11.5px] font-semibold text-[#0D47A1] bg-blue-50 rounded px-1.5 py-0.5 align-middle">{n} active</span>}</SheetTitle>
          <SheetDescription className="text-[12.5px]">Combine filters to narrow down the booking list.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <F l="Booking Status" id="status"><Sel id="status" value={a.status} onChange={set("status")} opts={options.status} all="All statuses" /></F>
            <F l="Booking Type" id="type"><Sel id="type" value={a.type} onChange={set("type")} opts={options.type} all="All types" /></F>
          </div>
          <F l="Service" id="service"><Sel id="service" value={a.service} onChange={set("service")} opts={options.service} all="All services" /></F>
          <F l="Category" id="category"><Sel id="category" value={a.category} onChange={set("category")} opts={options.category} all="All categories" /></F>
          <F l="Customer" id="customer"><Input id="customer" className="h-10 rounded-lg" placeholder="Customer name or phone" value={a.customer} onChange={(e) => set("customer")(e.target.value)} data-testid="bk-adv-customer" /></F>
          <F l="Partner" id="partner"><Input id="partner" className="h-10 rounded-lg" placeholder="Partner name (or 'unassigned')" value={a.partner} onChange={(e) => set("partner")(e.target.value)} data-testid="bk-adv-partner" /></F>
          <F l="Payment Status" id="payment"><Sel id="payment" value={a.payment} onChange={set("payment")} opts={options.payment} all="All payment statuses" /></F>
          <F l="Date Range" id="date"><DateRangeMenu full value={a.date} onChange={set("date")} /></F>
          <F l="Amount Range (₹)" id="min">
            <div className="grid grid-cols-2 gap-3">
              <Input id="min" type="number" min="0" className="h-10 rounded-lg" placeholder="Min" value={a.min} onChange={(e) => set("min")(e.target.value)} data-testid="bk-adv-min" />
              <Input type="number" min="0" className="h-10 rounded-lg" placeholder="Max" value={a.max} onChange={(e) => set("max")(e.target.value)} data-testid="bk-adv-max" aria-label="Maximum amount" />
            </div>
          </F>
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] dark:border-slate-800 flex justify-between gap-2">
          <Button variant="ghost" className="h-9 text-[13.5px] text-slate-600" onClick={() => setA(EMPTY_ADV)} data-testid="bk-adv-reset">Reset Filters</Button>
          <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={() => onApply(a)} data-testid="bk-adv-apply">Apply Filters</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
