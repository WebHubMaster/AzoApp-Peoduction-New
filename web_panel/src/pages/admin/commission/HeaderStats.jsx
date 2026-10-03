import { Download, Settings2, Info, Layers, CheckCircle2, AlertTriangle, Percent, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({ onExport, onSettings }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[24px] leading-8 font-bold tracking-tight text-[#111827] dark:text-white">Commission &amp; Refund</h1>
          <p className="text-[13.5px] text-[#6B7280] mt-0.5">Manage category-wise commission splits, partner earnings and cancellation refund policies.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="h-9 text-[13px]" onClick={onExport} data-testid="cc-export"><Download className="h-4 w-4" /> Export</Button>
          <Button variant="outline" className="h-9 text-[13px]" onClick={onSettings} data-testid="cc-settings"><Settings2 className="h-4 w-4" /> Settings</Button>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-[12.5px] text-[#1E3A8A]" data-testid="cc-info-banner">
        <Info className="h-4 w-4 shrink-0 text-[#2563EB]" />
        <span>Commission settings are applied to new bookings. Existing bookings retain the commission rate captured at booking time.</span>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, desc, accent, tid, delay }) {
  return (
    <div className="cc-rise bg-white dark:bg-slate-900 rounded-xl border border-[#E5E7EB] dark:border-slate-800 px-4 py-3.5 flex items-center gap-3 transition-shadow hover:shadow-[0_4px_16px_-8px_rgba(15,23,42,0.18)] relative overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <span className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-r ${accent.bar}`} />
      <div className={`h-9 w-9 rounded-lg hidden sm:grid place-items-center shrink-0 ${accent.bg}`}><Icon className={`h-4 w-4 ${accent.fg}`} /></div>
      <div className="min-w-0">
        <p className="text-[12px] font-medium text-[#6B7280]">{label}</p>
        <p className="text-[22px] leading-7 font-bold tabular-nums text-[#111827] dark:text-white" data-testid={tid}>{value}</p>
        <p className="text-[11.5px] text-[#9CA3AF] truncate">{desc}</p>
      </div>
    </div>
  );
}

export function StatCards({ data, pending, activePartner }) {
  const A = {
    blue: { bar: "bg-[#0D47A1]", bg: "bg-blue-50", fg: "text-[#0D47A1]" },
    green: { bar: "bg-[#16A34A]", bg: "bg-green-50", fg: "text-[#16A34A]" },
    red: { bar: "bg-[#DC2626]", bg: "bg-red-50", fg: "text-[#DC2626]" },
    amber: { bar: "bg-[#F59E0B]", bg: "bg-amber-50", fg: "text-[#B45309]" },
  };
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <Stat icon={Layers} label="Total Categories" value={data.total} desc="Service categories" accent={A.blue} tid="cc-stat-total" delay={0} />
      <Stat icon={CheckCircle2} label="Configured" value={data.configured} desc="Commission configured" accent={A.green} tid="cc-stat-configured" delay={40} />
      <Stat icon={AlertTriangle} label="Rate Required" value={pending} desc="Categories need setup" accent={pending ? A.red : A.green} tid="cc-stat-pending" delay={80} />
      <Stat icon={Percent} label="Active Commission" value={activePartner == null ? "—" : `${activePartner}%`} desc={activePartner == null ? "No category configured yet" : "Current partner rate (avg.)"} accent={A.amber} tid="cc-stat-active" delay={120} />
    </div>
  );
}

export function ConfigAlert({ pending, onConfigure }) {
  if (!pending) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-red-200/80 bg-red-50/60 px-4 py-2.5" data-testid="cc-pending-banner">
      <div className="flex items-start gap-2.5 flex-1 min-w-0">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[#DC2626]" />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-[#991B1B]">{pending} {pending === 1 ? "category needs" : "categories need"} a commission rate</p>
          <p className="text-[12.5px] text-[#B91C1C]/80">Commission is mandatory for every category. Until configured, bookings will use the platform default split.</p>
        </div>
      </div>
      <Button className="h-8 text-[13px] bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-none shrink-0" onClick={onConfigure} data-testid="cc-configure-now">Configure Now <ArrowRight className="h-3.5 w-3.5" /></Button>
    </div>
  );
}
