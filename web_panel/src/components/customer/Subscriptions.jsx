/** Customer subscription UI (web panel) — recurring (Maid) services.
 * SubscriptionPlansPanel: plan picker + upfront full payment dialog (mock gateway
 * path when no live gateway is configured). MySubscriptions: the dashboard tab. */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarHeart, CheckCircle2, MapPin, ShieldCheck, Clock, Plus } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusChip, EmptyState, SkeletonList } from "./ux";
import { toast } from "sonner";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const todayPlus = (d) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

const DAY_DOT = {
  completed: "bg-emerald-500", replacement_completed: "bg-teal-500", maid_absent: "bg-rose-500",
  customer_cancel: "bg-amber-400", weekly_off: "bg-slate-300", scheduled: "bg-blue-400",
};
const DAY_LABEL = {
  completed: "Completed", replacement_completed: "Replacement served", maid_absent: "Maid absent",
  customer_cancel: "Cancelled by you", weekly_off: "Weekly off", scheduled: "Scheduled",
};

/* ------------------------------------------------ plan picker + booking ---- */
export function SubscriptionPlansPanel({ svc }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const rawPlans = svc.subscription_plans || [];
  const [plans, setPlans] = useState(rawPlans);
  const [sel, setSel] = useState(rawPlans[0]?.plan_type || "");
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState([]);
  const [addrId, setAddrId] = useState("");
  const [startDate, setStartDate] = useState(todayPlus(1));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get(`/subscriptions/plans/${svc.id}`).then((r) => {
      const ps = r.data?.plans || [];
      if (ps.length) {
        setPlans(ps);
        setSel((cur) => (ps.some((p) => p.plan_type === cur) ? cur : ps[0].plan_type));
      }
    }).catch(() => {});
    api.get("/auth/addresses").then((r) => {
      const as = r.data || [];
      setAddresses(as);
      setAddrId((cur) => cur || as[0]?.id || "");
    }).catch(() => {});
  }, [svc.id, user]);

  const plan = plans.find((p) => p.plan_type === sel);

  const book = async () => {
    if (!plan) return toast.error("Please select a plan");
    if (!addrId) return toast.error("Please select a service address");
    setBusy(true);
    try {
      const { data: sub } = await api.post("/subscriptions", {
        service_id: svc.id, plan_type: sel, start_date: startDate,
        preferred_time: time, address_id: addrId,
      });
      try {
        await api.post(`/subscriptions/${sub.id}/pay/mock`);
        toast.success("Subscription activated! Full amount paid upfront.");
      } catch {
        await api.post(`/subscriptions/${sub.id}/pay/order`);
        toast.info("Complete the payment to activate your subscription.");
      }
      setOpen(false);
      navigate("/account?tab=subscriptions");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed, please try again");
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="subscription-panel" className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 sticky top-24">
      <div className="flex items-center gap-2">
        <CalendarHeart className="h-5 w-5 text-primary-700" />
        <h3 className="font-heading font-bold text-xl text-slate-900">Choose your plan</h3>
      </div>
      <p className="text-xs text-slate-500 mt-1">Recurring subscription — pay once upfront, the maid visits every working day.</p>

      <div className="space-y-2.5 mt-4">
        {plans.map((p) => {
          const on = p.plan_type === sel;
          return (
            <button key={p.plan_type} data-testid={`sub-plan-${p.plan_type}`} onClick={() => setSel(p.plan_type)}
              className={`relative w-full text-left rounded-2xl border-2 p-3.5 transition-all ${on ? "border-primary-700 bg-primary-50/60" : "border-slate-200 bg-white hover:border-primary-300"}`}>
              <div className="flex items-center justify-between pr-6">
                <span className="font-bold text-slate-900">{p.label || p.plan_type}</span>
                <span className="font-heading font-extrabold text-lg text-primary-700">{fmt(p.price)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {p.working_days ? `${p.working_days} working days · ` : ""}{p.duration_days}-day period
                {(p.weekly_offs || []).length ? ` · ${(p.weekly_offs || []).map((d) => WD[d]).join(", ")} off` : ""}
              </p>
              {on && <CheckCircle2 className="h-4 w-4 text-primary-700 absolute top-3.5 right-3.5" />}
            </button>
          );
        })}
      </div>

      <Button data-testid="sub-subscribe-btn"
        onClick={() => (user ? setOpen(true) : (toast.info("Please login to subscribe"), navigate("/login")))}
        className="w-full mt-4 h-12 bg-primary-700 hover:bg-primary-800 text-base">
        Subscribe · Pay {fmt(plan?.price || 0)} upfront
      </Button>

      <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center gap-3" data-testid="sub-upfront-note">
        <div className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
        <p className="text-[11px] text-emerald-700">Full plan amount is paid upfront. Daily attendance is tracked and a free replacement is arranged on absent days.</p>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-testid="sub-book-dialog">
          <DialogHeader>
            <DialogTitle>Book {plan?.label} subscription</DialogTitle>
            <DialogDescription>{svc.name} · {fmt(plan?.price || 0)} payable now (upfront)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500">Start date</label>
                <Input data-testid="sub-start-date" type="date" min={todayPlus(1)} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500">Preferred time</label>
                <Input data-testid="sub-time-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">Service address</label>
              {addresses.length === 0 ? (
                <p className="text-sm text-slate-400 mt-1">No saved address. <button data-testid="sub-add-address-link" className="text-primary-700 font-semibold" onClick={() => navigate("/account?tab=addresses")}>Add one</button></p>
              ) : (
                <div className="space-y-2 mt-1.5 max-h-44 overflow-y-auto">
                  {addresses.map((a) => (
                    <button key={a.id} data-testid={`sub-address-${a.id}`} onClick={() => setAddrId(a.id)}
                      className={`w-full flex items-start gap-2 rounded-xl border-2 p-2.5 text-left transition-all ${a.id === addrId ? "border-primary-700 bg-primary-50/60" : "border-slate-200 hover:border-primary-300"}`}>
                      <MapPin className="h-4 w-4 text-primary-700 mt-0.5 shrink-0" />
                      <span className="text-sm text-slate-700">{a.label ? `${a.label} · ` : ""}{a.line || a.address_line || `${a.city || ""} ${a.pincode || ""}`}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button data-testid="sub-confirm-pay-btn" disabled={busy || !plan || !addrId} onClick={book}
              className="w-full h-11 bg-primary-700 hover:bg-primary-800">
              {busy ? "Processing…" : `Pay ${fmt(plan?.price || 0)} & Activate`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------- my subscription card ---- */
function SubCard({ s }) {
  const set = s.settlement || {};
  const status = (set.status && set.status !== "none") ? set.status : (s.status || "");
  const tone = { active: "green", paid: "green", completed: "blue", approved: "blue", pending: "amber", pending_payment: "amber", review: "violet", cancelled: "rose" }[status] || "slate";
  return (
    <div data-testid={`my-sub-${s.id}`} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-slate-900">{s.service_name} · {s.plan_label}</p>
          <p className="text-xs text-slate-400 mt-0.5">{s.start_date} → {s.end_date} · {s.code}</p>
        </div>
        <StatusChip label={status.replace(/_/g, " ")} tone={tone} testId={`my-sub-status-${s.id}`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100">
        {[
          ["Paid upfront", fmt(s.price)],
          ["Days completed", `${s.completed_days || 0}/${s.working_days || 0}`],
          ["Maid earned", fmt(s.accrued_earning || 0)],
          ["Absent (kept by platform)", fmt(s.absent_adjustment || 0)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{k}</p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{v}</p>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
        <Clock className="h-3.5 w-3.5 text-slate-400" />
        {s.partner_name ? <>Maid: <span className="font-bold text-slate-800">{s.partner_name}</span>{s.preferred_time ? ` · ${s.preferred_time}` : ""}</> : "Maid will be assigned soon."}
      </p>

      {(s.schedule || []).length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1" data-testid={`my-sub-schedule-${s.id}`}>
            {s.schedule.map((d) => (
              <span key={d.date} title={`${d.date} · ${DAY_LABEL[d.status] || d.status}`}
                className={`h-2.5 w-2.5 rounded-full ${DAY_DOT[d.status] || "bg-slate-200"}`} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {[["completed", "Done"], ["maid_absent", "Absent"], ["weekly_off", "Off"], ["scheduled", "Upcoming"]].map(([k, lbl]) => (
              <span key={k} className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className={`h-2 w-2 rounded-full ${DAY_DOT[k]}`} />{lbl}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- dashboard tab ---- */
export function MySubscriptions() {
  const navigate = useNavigate();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get("/subscriptions/mine").then((r) => setSubs(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  return (
    <div data-testid="my-subscriptions" className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-extrabold text-xl text-slate-900 flex items-center gap-2">
            <CalendarHeart className="h-5 w-5 text-primary-700" /> My Subscriptions
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Recurring maid plans — paid upfront, settled daily on attendance.</p>
        </div>
        <Button data-testid="new-subscription-btn" onClick={() => navigate("/services")} className="bg-primary-700 hover:bg-primary-800">
          <Plus className="h-4 w-4 mr-1" /> New
        </Button>
      </div>

      {loading ? <SkeletonList rows={3} /> : subs.length === 0 ? (
        <EmptyState icon={CalendarHeart} title="No subscriptions yet" desc="Book a Daily / Weekly / Monthly / Yearly maid plan to get started."
          actionLabel="Browse services" onAction={() => navigate("/services")} testId="my-subscriptions-empty" />
      ) : (
        <div className="space-y-3">{subs.map((s) => <SubCard key={s.id} s={s} />)}</div>
      )}
    </div>
  );
}
