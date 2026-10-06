import { useEffect, useState } from "react";
import { PauseCircle, PlayCircle, XCircle, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import PremiumDatePicker, { keepPremiumCal } from "@/components/ui/PremiumDatePicker";
import { inr } from "../bookings/shared";
import { fmtDate } from "./subShared";

const todayIso = () => new Date().toISOString().slice(0, 10);
const F = ({ l, children }) => <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-200">{l}<div className="mt-1">{children}</div></label>;

function PauseDialog({ onClose, onConfirm, busy }) {
  const [from, setFrom] = useState(todayIso());
  const [days, setDays] = useState("3");
  const [reason, setReason] = useState("");
  const n = Number(days);
  const ok = from && n >= 1 && n <= 60;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px] text-[14px]" onInteractOutside={keepPremiumCal} data-testid="sub-pause-dialog">
        <DialogHeader><DialogTitle className="text-[17px]">Pause subscription</DialogTitle><DialogDescription className="text-[12.5px]">Paused working days move to the end of the plan, so the end date extends by the same number of visits.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F l="Pause from"><PremiumDatePicker value={from} min={todayIso()} onChange={(e) => setFrom(e.target.value)} data-testid="sub-pause-from" /></F>
            <F l="Number of days"><Input type="number" min="1" max="60" className="h-10" value={days} onChange={(e) => setDays(e.target.value)} data-testid="sub-pause-days" /></F>
          </div>
          <F l="Reason (optional)"><Input className="h-10" placeholder="e.g. Customer travelling" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sub-pause-reason" /></F>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-9 text-[13.5px]" onClick={onClose}>Close</Button>
          <Button disabled={!ok || busy} className="h-9 text-[13.5px] bg-[#0D47A1] hover:bg-[#0B3C8A] text-white shadow-none" onClick={() => onConfirm({ from_date: from, days: n, reason })} data-testid="sub-pause-confirm">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Pause {n > 0 ? `${n} day${n > 1 ? "s" : ""}` : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ id, onClose, onConfirm, busy }) {
  const [q, setQ] = useState(null);
  const [reason, setReason] = useState("");
  useEffect(() => { api.get(`/subscriptions/admin/${id}/cancel-quote`).then((r) => setQ(r.data)).catch(() => setQ({ error: true })); }, [id]);
  const Row = ({ l, v, b }) => <div className="flex justify-between text-[13px]"><span className="text-slate-500">{l}</span><span className={`tabular-nums ${b ? "font-semibold text-[#111827] dark:text-white" : "text-slate-700 dark:text-slate-200"}`}>{v}</span></div>;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[420px] text-[14px]" data-testid="sub-cancel-dialog">
        <DialogHeader><DialogTitle className="text-[17px]">Cancel subscription?</DialogTitle><DialogDescription className="text-[12.5px]">Remaining visits are cancelled. Refund uses the same policy as a normal booking — applied to the unused working days. If a maid is assigned, a cancellation fee is retained; days already served are not refunded.</DialogDescription></DialogHeader>
        <div className="rounded-lg border border-[#E5E7EB] dark:border-slate-800 p-3 space-y-1.5" data-testid="sub-cancel-quote">
          {!q ? <p className="text-[13px] text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Calculating refund…</p> : q.error ? <p className="text-[13px] text-[#B91C1C]">Could not calculate refund.</p> : (<>
            <Row l="Customer paid" v={inr(q.paid)} />
            <Row l="Working days" v={`${q.used_days} used · ${q.remaining_days} unused of ${q.working_days}`} />
            <Row l="Refundable (unused) value" v={inr(q.original_amount)} />
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1" />
            {q.partner_was_assigned ? (<>
              <Row l={`Service refund (${q.refund_pct}%)`} v={inr(q.service_refund)} />
              {Number(q.gst_refund) > 0 && <Row l="GST refund" v={inr(q.gst_refund)} />}
              <Row l={`Cancellation fee (${q.partner_cancellation_pct}% to maid)`} v={`– ${inr(q.cancellation_fee)}`} />
              {Number(q.cancellation_tax) > 0 && <Row l="GST on cancellation fee" v={`– ${inr(q.cancellation_tax)}`} />}
            </>) : (
              <Row l="No maid assigned — full refund of unused value" v={inr(q.refund_amount)} />
            )}
            <Row l="Maid earned (settled separately)" v={inr(q.maid_earned)} />
            <div className="border-t border-dashed border-slate-200 dark:border-slate-700 my-1" />
            <Row l="Refund to customer" v={<span className="text-[#15803D]" data-testid="sub-cancel-refund">{inr(q.refund_amount)}</span>} b />
          </>)}
        </div>
        <F l="Reason"><Input className="h-10" placeholder="Why is this being cancelled?" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sub-cancel-reason" /></F>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-9 text-[13.5px]" onClick={onClose}>Keep subscription</Button>
          <Button disabled={!q || q.error || busy} className="h-9 text-[13.5px] bg-[#DC2626] hover:bg-[#B91C1C] text-white shadow-none" onClick={() => onConfirm({ reason })} data-testid="sub-cancel-confirm">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Cancel & refund</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SubLifecycle({ s, busy, act }) {
  const [dlg, setDlg] = useState(null);
  const p = s.pause || {};
  const c = s.cancellation;
  const close = () => setDlg(null);
  const run = (fn, msg) => act(fn, msg).then(close);
  if (s.status === "cancelled" && c) return (
    <div className="text-[13px] space-y-1" data-testid="sub-cancel-info">
      <p className="text-[#B91C1C] font-medium">Cancelled on {fmtDate(c.at)}{c.reason ? ` · ${c.reason}` : ""}</p>
      <p className="text-slate-500">Refund {inr(c.refund_amount)} for {c.remaining_days} unused day(s){c.refund_status ? ` · ${c.refund_status}` : ""}</p>
    </div>
  );
  if (!["active", "pending_payment"].includes(s.status)) return <p className="text-[12.5px] text-slate-400">No lifecycle actions for a {s.status} subscription.</p>;
  return (
    <>
      {p.active && <p className="text-[13px] text-slate-600 dark:text-slate-300 mb-1" data-testid="sub-pause-info">Paused {fmtDate(p.from)} – {fmtDate(p.to)}{p.reason ? ` · ${p.reason}` : ""}. End date moved {fmtDate(p.old_end_date)} → <b>{fmtDate(p.new_end_date)}</b>.</p>}
      <div className="flex flex-wrap gap-1.5">
        {s.status === "active" && (p.active
          ? <Button variant="outline" disabled={busy} className="h-8 text-[12.5px] text-[#15803D]" onClick={() => act(() => api.post(`/subscriptions/admin/${s.id}/resume`), "Subscription resumed")} data-testid="sub-resume-btn"><PlayCircle className="h-3.5 w-3.5" /> Resume now</Button>
          : <Button variant="outline" disabled={busy} className="h-8 text-[12.5px]" onClick={() => setDlg("pause")} data-testid="sub-pause-btn"><PauseCircle className="h-3.5 w-3.5" /> Pause</Button>)}
        <Button variant="outline" disabled={busy} className="h-8 text-[12.5px] text-[#B91C1C] border-red-200 hover:bg-red-50" onClick={() => setDlg("cancel")} data-testid="sub-cancel-btn"><XCircle className="h-3.5 w-3.5" /> Cancel subscription</Button>
      </div>
      {dlg === "pause" && <PauseDialog busy={busy} onClose={close} onConfirm={(body) => run(() => api.post(`/subscriptions/admin/${s.id}/pause`, body), "Subscription paused")} />}
      {dlg === "cancel" && <CancelDialog id={s.id} busy={busy} onClose={close} onConfirm={(body) => run(() => api.post(`/subscriptions/admin/${s.id}/cancel`, body), "Subscription cancelled · refund initiated")} />}
    </>
  );
}
