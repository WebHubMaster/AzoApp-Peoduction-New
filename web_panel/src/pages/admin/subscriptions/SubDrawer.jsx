import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, User, CalendarDays, Users, Wallet, TrendingUp, IndianRupee, CalendarCheck, FileText, Phone, Settings2, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { inr, dParts, label } from "../bookings/shared";
import { SubStatusBadge, SubPayBadge, SettleBadge } from "./SubBadges";
import { setStatus, planDuration, fmtDate } from "./subShared";
import { Sec, R, SubTimeline, AttendanceMini, SettlementBox } from "./SubDrawerParts";
import SubCalendar from "./SubCalendar";
import SubLifecycle from "./SubLifecycle";

function fitTone(score) {
  if (score >= 80) return "text-emerald-700 bg-emerald-50 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300";
  if (score >= 50) return "text-blue-700 bg-blue-50 ring-blue-600/15 dark:bg-blue-500/10 dark:text-blue-300";
  return "text-slate-600 bg-slate-100 ring-slate-500/15 dark:bg-slate-700/40 dark:text-slate-300";
}

function MaidAssign({ s, partners, busy, assign }) {
  const [pid, setPid] = useState(s.partner_id || "");
  useEffect(() => setPid(s.partner_id || ""), [s.partner_id]);
  const recommended = partners.filter((p) => p.recommended).slice(0, 5);
  const others = partners.filter((p) => !p.recommended);
  const cityLabel = s?.address?.city ? ` in ${s.address.city}` : "";
  return (
    <div className="space-y-2.5 pt-1" data-testid="sub-assign-panel">
      <div className="space-y-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Suggested maids ({s.category_name || "this category"}{cityLabel})
        </p>
        {recommended.length === 0 ? (
          <p className="text-[12px] text-[#B45309] bg-amber-50 dark:bg-amber-500/10 rounded-md px-2.5 py-2" data-testid="sub-assign-empty">
            No registered {s.category_name || "service"} maid found{cityLabel}. Pick any available maid below.
          </p>
        ) : (
          <div className="space-y-1.5" data-testid="sub-assign-recommended">
            {recommended.map((p) => {
              const sel = pid === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`sub-assign-rec-${p.id}`}
                  onClick={() => setPid(p.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${sel ? "border-[#0D47A1] ring-2 ring-blue-200 bg-blue-50/60 dark:bg-blue-500/10" : "border-[#E5E7EB] dark:border-slate-700 hover:border-[#0D47A1]/50 bg-white dark:bg-slate-900"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium truncate flex items-center gap-1.5">
                        {p.name}
                        {p.nearby && <span className="shrink-0 inline-flex items-center h-[16px] px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 text-[9.5px] font-semibold uppercase tracking-wide">Nearby</span>}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">{(p.skills || []).join(", ") || "no skill"}{p.city ? ` · ${p.city}` : ""}</p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center h-[20px] px-1.5 rounded text-[10.5px] font-semibold ring-1 ${fitTone(p.fit_score)}`}>{Math.round(p.fit_score)}% fit</span>
                  </div>
                  {(p.fit_reasons || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.fit_reasons.map((r, i) => (
                        <span key={i} className="inline-flex items-center h-[18px] px-1.5 rounded bg-slate-100 dark:bg-slate-700/50 text-[10px] text-slate-600 dark:text-slate-300">{r}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <select data-testid="sub-assign-select" aria-label="Select maid" value={pid} onChange={(e) => setPid(e.target.value)} className="flex-1 min-w-0 h-9 rounded-md border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">
          <option value="">{recommended.length ? "Choose another maid…" : "Select maid…"}</option>
          {recommended.length > 0 && (
            <optgroup label={`Suggested (${s.category_name || "category"}${cityLabel})`}>
              {recommended.map((p) => <option key={p.id} value={p.id}>{p.name} · {Math.round(p.fit_score)}% fit</option>)}
            </optgroup>
          )}
          <optgroup label={recommended.length ? "Other maids" : "All maids"}>
            {others.map((p) => <option key={p.id} value={p.id}>{p.name} · {(p.skills || []).join(", ") || "no skill"}{p.city ? ` · ${p.city}` : ""}</option>)}
          </optgroup>
        </select>
        <Button data-testid="sub-assign-btn" disabled={!pid || busy || pid === s.partner_id} onClick={() => assign(pid)} className="h-9 text-[13px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none">{s.partner_id ? "Reassign" : "Assign"}</Button>
      </div>
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
          <SheetDescription asChild><div className="flex items-center gap-2 flex-wrap">{s && <><SubStatusBadge s={s.status} tid="sub-drawer-status" />{s.pause?.active && s.status === "active" && <SubStatusBadge s="paused" tid="sub-drawer-paused" />}<SubPayBadge s={s.payment_status} /><SettleBadge s={setStatus(s)} /></>}</div></SheetDescription>
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
              {(s.platform_fee || 0) > 0 && <R l="Platform Fee" v={inr(s.platform_fee)} />}
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
              {(s.platform_fee || 0) > 0 && <R l="Platform Fee" v={inr(s.platform_fee)} />}
              {(s.tax_amount || 0) > 0 && <R l={`GST (${s.tax_pct}%) · on commission`} v={inr(s.tax_amount)} />}
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
              <div className="pt-2"><SubCalendar key={s.id} s={s} busy={busy} markDay={markDay} /></div>
            </Sec>
            <Sec icon={Settings2} title="Manage" id="sub-sec-manage"><SubLifecycle s={s} busy={busy} act={act} /></Sec>
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
