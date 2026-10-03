import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inr, dParts } from "../bookings/shared";
import { SettleBadge } from "./SubBadges";
import { attendance, setStatus, setAmount } from "./subShared";

export const Sec = ({ icon: Icon, title, id, right, children }) => (
  <section id={id} className="rounded-lg border border-[#E5E7EB] dark:border-slate-800 scroll-mt-4" data-testid={id}>
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#F1F2F4] dark:border-slate-800">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280]"><Icon className="h-3.5 w-3.5" />{title}</p>{right}
    </div>
    <div className="px-3 py-2 space-y-1.5">{children}</div>
  </section>
);
export const R = ({ l, v, strong, tone }) => (
  <div className="flex items-start justify-between gap-3 text-[13px]"><span className="text-slate-500 shrink-0">{l}</span><span className={`text-right min-w-0 break-words tabular-nums ${tone || (strong ? "font-semibold text-[#111827] dark:text-white" : "text-slate-700 dark:text-slate-200")}`}>{v ?? "—"}</span></div>
);

export function SubTimeline({ s }) {
  const at = (k) => (s.timeline || []).find((t) => t.status === k)?.at;
  const started = at("arrival_marked") || ((s.completed_days || 0) > 0 ? "" : null);
  const steps = [
    ["Subscription Created", at("pending_payment") || s.created_at, true],
    ["Payment Received", at("active") || s.paid_at, s.payment_status === "paid"],
    ["Maid Assigned", at("partner_assigned"), !!s.partner_id],
    ["Service Started", started, started !== null],
    ["Subscription Completed", at("completed"), s.status === "completed"],
    ["Settlement Paid", at("settlement_paid"), setStatus(s) === "paid"],
  ];
  if (s.status === "cancelled") steps.push(["Cancelled", at("cancelled"), true, true]);
  const cur = steps.filter((x) => x[2]).length - 1;
  return (
    <ol className="relative ml-1.5" data-testid="sub-drawer-timeline">
      {steps.map(([l, when, done, bad], i) => (
        <li key={l} className="relative pl-6 pb-3 last:pb-0">
          {i < steps.length - 1 && <span className={`absolute left-[7px] top-4 bottom-0 w-px ${done && steps[i + 1][2] ? "bg-[#16A34A]/40" : "bg-slate-200 dark:bg-slate-700"}`} />}
          <span className="absolute left-0 top-0.5">{done ? (bad ? <Circle className="h-[15px] w-[15px] text-[#DC2626] fill-red-100" /> : i === cur ? <span className="block h-[15px] w-[15px] rounded-full border-2 border-[#2563EB] bg-blue-100" /> : <CheckCircle2 className="h-[15px] w-[15px] text-[#16A34A]" />) : <Circle className="h-[15px] w-[15px] text-slate-300" />}</span>
          <p className={`text-[13px] ${done ? "text-[#111827] dark:text-white font-medium" : "text-slate-400"}`}>{l}</p>
          {done && when && <p className="text-[11.5px] text-slate-400">{dParts(when).join(", ")}</p>}
        </li>
      ))}
    </ol>
  );
}

export function AttendanceMini({ s }) {
  const t = attendance(s);
  const cells = [["Scheduled", t.total, "text-[#111827]"], ["Completed", t.completed, "text-[#15803D]"], ["Missed", t.missed, "text-[#B91C1C]"], ["Pending", t.pending, "text-[#B45309]"]];
  return (
    <div>
      <div className="grid grid-cols-4 gap-2" data-testid="sub-attendance-summary">
        {cells.map(([l, v, c]) => <div key={l} className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5"><p className="text-[11px] text-slate-500">{l}</p><p className={`text-[15px] font-semibold tabular-nums ${c}`}>{v}</p></div>)}
      </div>
      <div className="flex items-center justify-between text-[12px] text-slate-500 mt-2">
        <span>{t.cancelled > 0 ? `${t.cancelled} customer-cancelled · ` : ""}{s.weekly_off_days || 0} weekly off</span>
        {t.rate !== null && <span>Attendance rate <b className="text-[#111827] dark:text-white">{t.rate}%</b></span>}
      </div>
      {t.rate !== null && <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-[#16A34A] transition-all" style={{ width: `${t.rate}%` }} /></div>}
    </div>
  );
}

export function SettlementBox({ s, busy, finalize, action }) {
  const st = setStatus(s);
  const amt = setAmount(s);
  const paid = st === "paid" ? amt : 0;
  const S = s.settlement || {};
  const btn = (txt, on, enabled, cls, tid) => <Button variant="outline" disabled={busy || !enabled} onClick={on} className={`h-8 text-[12.5px] ${cls}`} data-testid={tid}>{txt}</Button>;
  return (
    <>
      <div className="grid grid-cols-3 gap-2" data-testid="sub-settlement-summary">
        {[["Earned", s.accrued_earning, "text-[#15803D]"], ["Paid", paid, "text-[#111827] dark:text-white"], ["Pending", st === "paid" ? 0 : amt, "text-[#B45309]"]].map(([l, v, c]) => (
          <div key={l} className="rounded-md bg-slate-50 dark:bg-slate-800/60 px-2 py-1.5"><p className="text-[11px] text-slate-500">{l}</p><p className={`text-[15px] font-semibold tabular-nums ${c}`}>{inr(v)}</p></div>
        ))}
      </div>
      <R l="Settlement Status" v={<SettleBadge s={st} />} />
      <R l="Settlement Amount" v={inr(amt)} strong />
      {S.paid_at && <R l="Settlement Date" v={dParts(S.paid_at).join(", ")} />}
      {S.approved_at && !S.paid_at && <R l="Approved On" v={dParts(S.approved_at).join(", ")} />}
      {S.note && <R l="Note" v={S.note} />}
      <div className="flex flex-wrap gap-1.5 pt-1.5">
        {btn("Finalize / Generate", finalize, true, "", "sub-finalize-btn")}
        {btn("Mark Review", () => action("review"), st === "pending", "text-[#1D4ED8] border-blue-200", "sub-review-btn")}
        {btn("Approve", () => action("approve"), st === "review", "text-indigo-700 border-indigo-200", "sub-approve-btn")}
        <Button disabled={busy || st !== "approved"} onClick={() => action("pay")} className="h-8 text-[12.5px] bg-[#16A34A] hover:bg-[#15803D] text-white shadow-none" data-testid="sub-pay-btn">Pay Maid</Button>
      </div>
    </>
  );
}
