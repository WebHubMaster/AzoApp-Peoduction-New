import React from "react";
import { User as UserIcon, Wrench, CalendarClock, CheckCircle2, Phone } from "lucide-react";
import { fmt } from "@/lib/api";
import ServiceBreakdown from "@/components/booking/ServiceBreakdown";

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</p>
      <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 mt-0.5 truncate">{value || "—"}</p>
    </div>
  );
}

export default function JobDetailsBlock({ b }) {
  const schedLabel = b.scheduled_at
    ? new Date(b.scheduled_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Now";
  const last4 = String(b.customer_phone || "").replace(/\D/g, "").slice(-4);
  const maskedPhone = last4 ? `+91 XXXXX X${last4}` : "";
  return (
    <div data-testid={`job-details-block-${b.code}`}>
      <div className="grid grid-cols-2 gap-2">
        <InfoItem icon={UserIcon} label="Customer" value={b.customer_name} />
        <InfoItem icon={Wrench} label="Service" value={b.service_name} />
        <InfoItem icon={CalendarClock} label="Schedule" value={schedLabel} />
        <InfoItem icon={CheckCircle2} label="Job value" value={fmt(b.partner_amount ?? b.breakdown?.total ?? b.pricing?.total ?? 0)} />
      </div>
      <ServiceBreakdown booking={b} fmt={fmt} className="mt-3" showCharges hidePlatformFees title="Services to do" compact />
      {maskedPhone && <p className="text-[12px] text-slate-400 mt-2 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {maskedPhone} <span className="text-slate-300 dark:text-slate-600">· number protected</span></p>}
    </div>
  );
}
