import { RotateCcw, UserX, Clock, CalendarX2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

function range(cats, k) {
  const v = cats.filter((c) => c.configured).map((c) => Number(c.commission[k]));
  if (!v.length) return null;
  const lo = Math.min(...v); const hi = Math.max(...v);
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`;
}

function PolicyCard({ icon: Icon, tone, title, value, desc, foot, onEdit, tid, soon }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 p-4 flex flex-col transition-shadow hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)]" data-testid={tid}>
      <div className="flex items-start justify-between gap-2">
        <div className={`h-8 w-8 rounded-lg grid place-items-center ${tone.bg}`}><Icon className={`h-4 w-4 ${tone.fg}`} /></div>
        {soon
          ? <span className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">Coming soon</span>
          : <Button variant="ghost" className="h-7 px-2 text-[12.5px] text-[#0D47A1] hover:bg-blue-50" onClick={onEdit} data-testid={`${tid}-edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Button>}
      </div>
      <p className="mt-3 text-[13px] font-medium text-[#6B7280]">{title}</p>
      <p className={`text-[19px] leading-7 font-bold tabular-nums ${soon ? "text-slate-400" : "text-[#111827] dark:text-white"}`} data-testid={`${tid}-value`}>{value}</p>
      <p className="text-[12px] text-[#6B7280] mt-0.5 flex-1">{desc}</p>
      {foot && <p className="text-[11.5px] text-slate-400 mt-2 pt-2 border-t border-[#F1F2F4] dark:border-slate-800">{foot}</p>}
    </div>
  );
}

export default function PolicySection({ defaults, categories, onEditDefault }) {
  const d = defaults || {};
  const rRange = range(categories, "customer_refund_pct");
  const pRange = range(categories, "partner_cancellation_pct");
  return (
    <section className="space-y-3" data-testid="cc-policy-section">
      <div>
        <h2 className="text-[17px] font-semibold text-[#111827] dark:text-white">Refund &amp; Cancellation Policy</h2>
        <p className="text-[12.5px] text-[#6B7280]">Configure refund and cancellation rules for customer and partner cancellations. Values shown are the platform default; each category can override them above.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <PolicyCard icon={RotateCcw} tone={{ bg: "bg-blue-50", fg: "text-[#0D47A1]" }} title="Customer Cancellation" value={`${d.customer_refund_pct ?? 0}% Refund`}
          desc="Refunded to the customer when they cancel before work starts." foot={rRange ? `Category overrides: ${rRange}` : "No category overrides yet"} onEdit={onEditDefault} tid="cc-policy-customer" />
        <PolicyCard icon={UserX} tone={{ bg: "bg-amber-50", fg: "text-[#B45309]" }} title="Partner Cancellation" value={`${d.partner_cancellation_pct ?? 0}% Deduction`}
          desc="Retained from the booking as the partner cancellation charge." foot={pRange ? `Category overrides: ${pRange}` : "No category overrides yet"} onEdit={onEditDefault} tid="cc-policy-partner" />
        <PolicyCard icon={Clock} tone={{ bg: "bg-slate-100", fg: "text-slate-500" }} title="Late Cancellation" value="Configurable" soon
          desc="Separate rule for cancellations close to the scheduled time." tid="cc-policy-late" />
        <PolicyCard icon={CalendarX2} tone={{ bg: "bg-slate-100", fg: "text-slate-500" }} title="No-show" value="Configurable" soon
          desc="Rule applied when the customer is unavailable at the visit." tid="cc-policy-noshow" />
      </div>
    </section>
  );
}
