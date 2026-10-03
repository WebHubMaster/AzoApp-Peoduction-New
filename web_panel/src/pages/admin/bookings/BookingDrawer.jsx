import { ExternalLink, Copy, CheckCircle2, Circle, MapPin, Phone, User, Wrench, CalendarDays, Wallet, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StatusBadge, PayBadge } from "./Badges";
import { label, inr, dParts, ORDER } from "./shared";

const Sec = ({ icon: Icon, title, children }) => (
  <section className="rounded-lg border border-[#E5E7EB] dark:border-slate-800">
    <p className="flex items-center gap-1.5 px-3 py-2 border-b border-[#F1F2F4] dark:border-slate-800 text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280]"><Icon className="h-3.5 w-3.5" />{title}</p>
    <dl className="px-3 py-2 space-y-1.5">{children}</dl>
  </section>
);
const R = ({ l, v, strong }) => (
  <div className="flex items-start justify-between gap-3 text-[13px]"><dt className="text-slate-500 shrink-0">{l}</dt><dd className={`text-right min-w-0 break-words ${strong ? "font-semibold text-[#111827] dark:text-white" : "text-slate-700 dark:text-slate-200"}`}>{v ?? "—"}</dd></div>
);
const STEPS = [["pending_payment", "Booking Created"], ["searching", "Partner Search Started"], ["assigned", "Partner Assigned"], ["started", "Service Started"], ["completed", "Completed"], ["paid", "Payment Received"]];

function Timeline({ b }) {
  const at = Object.fromEntries((b.timeline || []).map((t) => [t.status, t.at]));
  const reached = ORDER[b.status] ?? 0;
  const cancelled = b.status === "cancelled";
  const steps = STEPS.map(([k, l], i) => ({ k, l, at: i === 0 ? at[k] || at.pending || b.created_at : at[k], done: i === 0 || !!at[k] || (!cancelled && (ORDER[k] ?? 9) <= reached) }));
  if (cancelled) steps.push({ k: "cancelled", l: "Cancelled", at: at.cancelled, done: true, bad: true });
  const cur = steps.filter((s) => s.done).length - 1;
  return (
    <ol className="relative ml-1.5" data-testid="bk-drawer-timeline">
      {steps.map((s, i) => (
        <li key={s.k} className="relative pl-6 pb-3 last:pb-0">
          {i < steps.length - 1 && <span className={`absolute left-[7px] top-4 bottom-0 w-px ${s.done && steps[i + 1].done ? "bg-[#16A34A]/40" : "bg-slate-200 dark:bg-slate-700"}`} />}
          <span className="absolute left-0 top-0.5">{s.done ? (s.bad ? <Circle className="h-[15px] w-[15px] text-[#DC2626] fill-red-100" /> : i === cur ? <span className="block h-[15px] w-[15px] rounded-full border-2 border-[#2563EB] bg-blue-100" /> : <CheckCircle2 className="h-[15px] w-[15px] text-[#16A34A]" />) : <Circle className="h-[15px] w-[15px] text-slate-300" />}</span>
          <p className={`text-[13px] ${s.done ? "text-[#111827] dark:text-white font-medium" : "text-slate-400"}`}>{s.l}</p>
          {s.at && <p className="text-[11.5px] text-slate-400">{dParts(s.at).join(", ")}</p>}
        </li>
      ))}
    </ol>
  );
}

export default function BookingDrawer({ b, onClose, onOpenFull, onCopy }) {
  const p = b.pricing || {};
  const [d, t] = dParts(b.scheduled_at || b.created_at);
  const a = b.address || {};
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[460px] p-0 flex flex-col gap-0 text-[14px]" data-testid="bk-drawer">
        <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] dark:border-slate-800 text-left space-y-1">
          <SheetTitle className="text-[17px] font-semibold flex items-center gap-2">
            Booking <span className="font-mono">#{b.code}</span>
            <button type="button" onClick={() => onCopy(b.code)} aria-label="Copy booking code" className="text-slate-400 hover:text-[#0D47A1]"><Copy className="h-3.5 w-3.5" /></button>
          </SheetTitle>
          <SheetDescription asChild><div className="flex items-center gap-2"><StatusBadge s={b.status} /><PayBadge s={b.payment_status} /></div></SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <Sec icon={User} title="Customer">
            <R l="Name" v={b.customer_name} strong />
            <R l="Phone" v={b.customer_phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{b.customer_phone}</span> : null} />
            <R l="Address" v={[a.line, a.city, a.pincode].filter(Boolean).join(", ") || null} />
          </Sec>
          <Sec icon={Wrench} title="Service">
            <R l="Service" v={b.service_name} strong />
            <R l="Category" v={b.category_name} />
            {b.tier_label && <R l="Option" v={b.tier_label} />}
            <R l="Add-ons" v={(b.addons || []).length ? (b.addons || []).map((x) => x.name || x).join(", ") : "None"} />
          </Sec>
          <Sec icon={MapPin} title="Partner">
            <R l="Partner" v={b.partner_name || "Not assigned"} strong={!!b.partner_name} />
            <R l="Assigned" v={(b.timeline || []).find((x) => x.status === "assigned")?.at ? dParts(b.timeline.find((x) => x.status === "assigned").at).join(", ") : "—"} />
          </Sec>
          <Sec icon={CalendarDays} title="Booking">
            <R l="Date" v={d} /><R l="Time" v={t || "—"} />
            <R l="Type" v={label(b.booking_type)} /><R l="Schedule" v={label(b.schedule_type)} />
            {b.merchant_name && <R l="Merchant" v={b.merchant_name} />}
          </Sec>
          <Sec icon={Wallet} title="Payment">
            <R l="Subtotal" v={inr(p.subtotal ?? p.base)} />
            {(p.platform_fee || 0) > 0 && <R l="Platform Fee" v={inr(p.platform_fee)} />}
            {(p.convenience_fee || 0) > 0 && <R l="Convenience Fee" v={inr(p.convenience_fee)} />}
            {(p.total_discount || p.discount || 0) > 0 && <R l="Discounts" v={`−${inr(p.total_discount || p.discount)}`} />}
            <R l={`Taxes${p.gst_pct ? ` (GST ${p.gst_pct}%)` : ""}`} v={inr(p.gst ?? p.tax)} />
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1" />
            <R l="Total" v={inr(p.total)} strong />
            <R l="Payment Status" v={label(b.payment_status || "pending")} />
          </Sec>
          {(b.refund || b.cancellation) && (
            <Sec icon={RotateCcw} title="Refund">
              <R l="Refund Amount" v={inr(b.refund ?? b.cancellation?.refund)} />
              <R l="Refund Status" v={label(b.payment_status)} />
            </Sec>
          )}
          <section className="rounded-lg border border-[#E5E7EB] dark:border-slate-800 p-3">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280] mb-2.5">Activity Timeline</p>
            <Timeline b={b} />
          </section>
        </div>
        <div className="px-5 py-3 border-t border-[#E5E7EB] dark:border-slate-800 flex justify-between items-center gap-2">
          <p className="text-[12px] text-slate-400">Reschedule, refund &amp; status actions are on the full page.</p>
          <Button className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none shrink-0" onClick={onOpenFull} data-testid="bk-drawer-open-full"><ExternalLink className="h-4 w-4" /> Open Booking</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
