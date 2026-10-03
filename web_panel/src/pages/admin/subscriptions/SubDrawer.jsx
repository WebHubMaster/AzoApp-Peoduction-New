import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, User, CalendarDays, Users, Wallet, TrendingUp, IndianRupee, CalendarCheck, FileText, Phone } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { inr, dParts, label } from "../bookings/shared";
import { SubStatusBadge, SubPayBadge, SettleBadge } from "./SubBadges";
import { setStatus, planDuration, fmtDate } from "./subShared";
import { Sec, R, SubTimeline, AttendanceMini, DaySchedule, SettlementBox } from "./SubDrawerParts";

function MaidAssign({ s, partners, busy, assign }) {
  const [pid, setPid] = useState(s.partner_id || "");
  useEffect(() => setPid(s.partner_id || ""), [s.partner_id]);
  return (
    <div className="flex gap-2 pt-1">
      <select data-testid="sub-assign-select" aria-label="Select maid" value={pid} onChange={(e) => setPid(e.target.value)} className="flex-1 min-w-0 h-9 rounded-lg border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
        <option value="">Select maid…</option>
        {partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {(p.skills || []).join(", ") || "no skill"}</option>)}
      </select>
      <Button data-testid="sub-assign-btn" disabled={!pid || busy || pid === s.partner_id} onClick={() => assign(pid)} className="h-9 text-[13px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none">{s.partner_id ? "Reassign" : "Assign"}</Button>
    </div>
  );
}

const Loading = () => <div className="p-5 space-y-3" data-testid="sub-drawer-loading">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>;

export default function SubDrawer({ id, focus, onClose, onChanged, onCopy, onInvoice }) {
  const [s, setS] = useState(null);
  const [partners, setPartners] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.get(`/subscriptions/${id}`);
    setS(r.data);
    api.get(`/subscriptions/admin/${id}/partners`).then((p) => setPartners(p.data || [])).catch(() => setPartners([]));
  }, [id]);
  useEffect(() => { load().catch(() => { toast.error("Could not load subscription"); onClose(); }); }, [load, onClose]);
  useEffect(() => { if (s && focus) setTimeout(() => document.getElementById(`sub-sec-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 250); }, [s, focus]);

  const act = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg); await load(); onChanged?.(); } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); } finally { setBusy(false); } };
  const assign = (pid) => act(() => api.post(`/subscriptions/admin/${id}/assign`, { partner_id: pid }), "Maid assigned");
  const markDay = (date, status) => act(() => api.post(`/subscriptions/admin/${id}/days/${date}`, { status }), `Day marked ${label(status).toLowerCase()}`);
  const finalize = () => act(() => api.post(`/subscriptions/admin/${id}/finalize`), "Settlement generated");
  const settle = (action) => act(() => api.post(`/subscriptions/admin/${id}/settlement`, { action }), `Settlement ${action === "pay" ? "paid" : action === "approve" ? "approved" : "moved to review"}`);

  const a = s?.address || {};
  const assignedAt = (s?.timeline || []).filter((t) => t.status === "partner_assigned").pop()?.at;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[540px] p-0 flex flex-col gap-0 text-[14px]" data-testid="sub-detail-drawer">
        <SheetHeader className="px-5 py-4 border-b border-[#E5E7EB] dark:border-slate-800 text-left space-y-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280]">Subscription</p>
          <SheetTitle className="text-[17px] font-semibold flex items-center gap-2">
            <span className="font-mono">#{s?.code || "…"}</span>
            {s && <button type="button" onClick={() => onCopy(s.code)} aria-label="Copy subscription code" className="text-slate-400 hover:text-[#0D47A1]" data-testid="sub-drawer-copy"><Copy className="h-3.5 w-3.5" /></button>}
          </SheetTitle>
          <SheetDescription asChild><div className="flex items-center gap-2 flex-wrap">{s && <><SubStatusBadge s={s.status} tid="sub-drawer-status" /><SubPayBadge s={s.payment_status} /><SettleBadge s={setStatus(s)} /></>}</div></SheetDescription>
        </SheetHeader>
        {!s ? <Loading /> : (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <Sec icon={User} title="Customer" id="sub-sec-customer">
              <R l="Name" v={s.customer_name} strong />
              <R l="Phone" v={s.customer_phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{s.customer_phone}</span> : null} />
              {(a.email || s.customer_email) && <R l="Email" v={a.email || s.customer_email} />}
              <R l="Address" v={[a.line, a.landmark, a.city, a.pincode].filter(Boolean).join(", ") || null} />
            </Sec>
            <Sec icon={CalendarDays} title="Subscription" id="sub-sec-plan">
              <R l="Service" v={s.service_name} strong />
              <R l="Plan" v={`${s.plan_label} · ${planDuration(s)}`} />
              <R l="Start Date" v={fmtDate(s.start_date)} /><R l="End Date" v={fmtDate(s.end_date)} />
              <R l="Frequency" v={`${s.working_days} working days${s.preferred_time ? ` · ${s.preferred_time}` : ""}`} />
              <R l="Status" v={<SubStatusBadge s={s.status} />} />
            </Sec>
            <Sec icon={Users} title="Maid" id="sub-sec-maid">
              <R l="Maid Name" v={s.partner_name || "Unassigned"} strong={!!s.partner_name} tone={s.partner_name ? null : "text-[#B45309] font-medium"} />
              <R l="Assigned Date" v={assignedAt ? dParts(assignedAt).join(", ") : "—"} />
              <R l="Attendance" v={`${s.completed_days || 0} completed · ${s.absent_days || 0} absent`} />
              <MaidAssign s={s} partners={partners} busy={busy} assign={assign} />
            </Sec>
            <Sec icon={Wallet} title="Payment" id="sub-sec-payment" right={s.payment_status === "paid" && <button type="button" onClick={() => onInvoice(s)} className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0D47A1] hover:underline" data-testid="sub-drawer-invoice"><FileText className="h-3.5 w-3.5" />Invoice</button>}>
              <R l="Plan Amount" v={inr(s.price)} />
              {(s.gst_amount || 0) > 0 && <R l={`GST${s.gst_pct ? ` (${s.gst_pct}%)` : ""}`} v={inr(s.gst_amount)} />}
              {s.total_payable != null && <R l="Total Payable" v={inr(s.total_payable)} strong />}
              <R l="Paid" v={s.payment_status === "paid" ? inr(s.total_payable ?? s.price) : inr(0)} tone="text-[#15803D] font-semibold" />
              <R l="Pending" v={s.payment_status === "paid" ? inr(0) : inr(s.total_payable ?? s.price)} />
              {s.paid_at && <R l="Paid On" v={dParts(s.paid_at).join(", ")} />}
              <R l="Payment Status" v={<SubPayBadge s={s.payment_status} />} />
            </Sec>
            <Sec icon={TrendingUp} title="Earnings" id="sub-sec-earnings">
              <R l="Gross Amount" v={inr(s.price)} />
              <R l={`Commission (${s.commission_pct ?? 0}%)`} v={inr(s.commission_amount)} />
              {(s.tax_amount || 0) > 0 && <R l={`Tax (${s.tax_pct}%)`} v={inr(s.tax_amount)} />}
              <R l="Maid Allocation (max)" v={inr(s.partner_allocation)} />
              <R l="Per-day Earning" v={inr(s.per_day_earning)} />
              <R l="Absent Adjustment → Platform" v={inr(s.absent_adjustment)} tone="text-[#B91C1C]" />
              {(s.customer_cancel_retained || 0) > 0 && <R l="Customer Cancel Retained" v={inr(s.customer_cancel_retained)} />}
              <R l="Platform Total" v={inr(s.platform_total)} />
              <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1" />
              <R l="Net Earned (Maid)" v={inr(s.accrued_earning)} tone="font-semibold text-[#15803D]" />
            </Sec>
            <Sec icon={IndianRupee} title="Settlement" id="sub-sec-settlement"><SettlementBox s={s} busy={busy} finalize={finalize} action={settle} /></Sec>
            <Sec icon={CalendarCheck} title="Attendance" id="sub-sec-attendance">
              <AttendanceMini s={s} />
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280] pt-2">Daily Schedule</p>
              <DaySchedule s={s} busy={busy} markDay={markDay} />
            </Sec>
            <section className="rounded-lg border border-[#E5E7EB] dark:border-slate-800 p-3">
              <p className="text-[11.5px] font-semibold uppercase tracking-wide text-[#6B7280] mb-2.5">Activity Timeline</p>
              <SubTimeline s={s} />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
