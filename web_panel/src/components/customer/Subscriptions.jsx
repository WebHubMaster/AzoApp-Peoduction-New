/** Customer subscription UI (web panel) — recurring (Maid) services.
 * SubscriptionPlansPanel: plan picker + upfront full payment dialog (mock gateway
 * path when no live gateway is configured).
 * MySubscriptions: premium full-width subscription cards — overview stat cards,
 * service progress, attendance calendar, payment snapshot, maid details, invoice. */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarHeart, CheckCircle2, MapPin, ShieldCheck, Plus, IndianRupee, XCircle, Calendar, ChevronDown, Download, Copy, Phone, User as UserIcon, Receipt } from "lucide-react";
import api, { fmt, API } from "@/lib/api";
import { openCheckout } from "@/lib/payments";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusChip, EmptyState, SkeletonList } from "./ux";
import { toast } from "sonner";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const todayPlus = (d) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

const DAY_META = {
  completed: { label: "Completed", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  replacement_completed: { label: "Replacement served", chip: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" },
  in_progress: { label: "In progress", chip: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  maid_absent: { label: "Maid absent", chip: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  customer_cancel: { label: "Cancelled by you", chip: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-400" },
  weekly_off: { label: "Weekly off", chip: "bg-slate-50 text-slate-500 border-slate-200", dot: "bg-slate-300" },
  scheduled: { label: "Upcoming", chip: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-400" },
};
const STATUS_TONE = { active: "green", paid: "green", completed: "blue", approved: "blue", pending: "amber", pending_payment: "amber", review: "violet", cancelled: "rose" };

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
      // Create the order on the ACTIVE gateway and open its real checkout in the
      // selected mode. No dev-mock bypass anywhere.
      const { data: order } = await api.post(`/subscriptions/${sub.id}/pay/order`);
      const ok = await openCheckout(order, {
        user, name: "AzoApp Subscription", description: svc.name || "Subscription",
        onVerify: (res) => res.razorpay_payment_id
          ? api.post(`/subscriptions/${sub.id}/pay/verify`, {
              order_id: res.razorpay_order_id,
              payment_id: res.razorpay_payment_id,
              signature: res.razorpay_signature,
            })
          : api.post(`/subscriptions/${sub.id}/pay/confirm`, { order_id: res.order_id, gw: res.gw }),
      });
      if (ok) {
        toast.success("Subscription activated! Full amount paid upfront.");
        setOpen(false);
        navigate("/account?tab=subscriptions");
      }
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

/* ------------------------------------------------------- shared bits ------- */
function OverviewCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${tone.bg}`}><Icon className={`h-5 w-5 ${tone.fg}`} /></div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</p>
        <p className={`text-base font-extrabold truncate ${tone.val || "text-slate-900"}`}>{value}</p>
      </div>
    </div>
  );
}

function DetailRow({ k, v, strong }) {
  return (
    <div className="flex justify-between gap-4 text-sm py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-slate-500">{k}</span>
      <span className={`text-right ${strong ? "font-extrabold text-slate-900" : "font-medium text-slate-800"}`}>{v}</span>
    </div>
  );
}

/* ------------------------------------------------------- subscription card -- */
function SubCard({ s }) {
  const [open, setOpen] = useState(false);
  const [invBusy, setInvBusy] = useState(false);
  const calRef = React.useRef(null);
  const set = s.settlement || {};
  const status = (set.status && set.status !== "none") ? set.status : (s.status || "");
  const tone = STATUS_TONE[status] || "slate";
  const wd = s.working_days || 0;
  const done = s.completed_days || 0;
  const absent = s.absent_days || 0;
  const pct = wd ? Math.min(100, Math.round((done / wd) * 100)) : 0;
  const absentPct = wd ? Math.min(100 - pct, Math.round((absent / wd) * 100)) : 0;
  const schedule = s.schedule || [];
  const todayDay = schedule.find((d) => d.date === todayPlus(0) && (d.status === "scheduled" || d.status === "in_progress"));
  const addr = s.address || {};

  const copyId = () => { navigator.clipboard?.writeText(s.code || ""); toast.success("Subscription ID copied"); };
  const downloadInvoice = async () => {
    setInvBusy(true);
    // Pre-open the tab so popup blockers don't kill window.open after the await.
    const win = window.open("about:blank", "_blank");
    try {
      const { data } = await api.get(`/subscriptions/${s.id}/invoice`);
      if (win) win.location.href = `${API}${data.path}`;
    } catch (e) { win?.close(); toast.error(e?.response?.data?.detail || "Invoice not available yet"); } finally { setInvBusy(false); }
  };
  const viewSchedule = () => { setOpen(true); setTimeout(() => calRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); };

  return (
    <div data-testid={`my-sub-${s.id}`} className="w-full bg-white border border-slate-200/80 rounded-3xl shadow-[0_1px_3px_rgba(13,71,161,0.07)] overflow-hidden">
      {/* header */}
      <div className="p-5 sm:p-6 flex flex-wrap items-start gap-4">
        <div className="h-12 w-12 rounded-2xl bg-primary-50 text-primary-700 flex items-center justify-center shrink-0"><CalendarHeart className="h-6 w-6" /></div>
        <div className="flex-1 min-w-56">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-heading font-extrabold text-lg text-slate-900">{s.service_name}</h3>
            <span className="text-[11px] font-bold text-primary-700 bg-primary-50 border border-primary-100 px-2 py-0.5 rounded-md">{s.plan_label} Subscription</span>
            <StatusChip label={status.replace(/_/g, " ")} tone={tone} testId={`my-sub-status-${s.id}`} />
          </div>
          <p className="text-sm text-slate-500 mt-1.5 flex items-center gap-1.5 flex-wrap">
            <Calendar className="h-3.5 w-3.5 text-slate-400" /> {s.start_date} → {s.end_date}
            <span className="text-slate-300">·</span>
            <button onClick={copyId} data-testid={`my-sub-copy-${s.id}`} className="inline-flex items-center gap-1 text-slate-500 hover:text-primary-700 font-medium">ID: {s.code} <Copy className="h-3 w-3" /></button>
          </p>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 text-slate-400" /> Maid: <span className="font-bold text-slate-800">{s.partner_name || "Assigning soon"}</span>
            {s.preferred_time ? <span className="text-slate-400">· Service time {s.preferred_time}</span> : null}
          </p>
          {status === "active" && todayDay?.otp ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700" data-testid={`my-sub-otp-${s.id}`}>
              <ShieldCheck className="h-3.5 w-3.5" /> Today's service OTP: <span className="tracking-[0.2em] font-extrabold">{todayDay.otp}</span> — share with your maid to start the service
            </p>
          ) : null}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Paid upfront</p>
          <p className="font-heading font-extrabold text-2xl text-slate-900">{fmt(s.price)}</p>
        </div>
      </div>

      {/* overview stat cards */}
      <div className="px-5 sm:px-6 grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid={`my-sub-overview-${s.id}`}>
        <OverviewCard icon={IndianRupee} label="Customer Paid" value={fmt(s.price)} tone={{ bg: "bg-primary-50", fg: "text-primary-700" }} />
        <OverviewCard icon={Calendar} label="Working Days" value={wd} tone={{ bg: "bg-blue-50", fg: "text-blue-600" }} />
        <OverviewCard icon={CheckCircle2} label="Completed" value={done} tone={{ bg: "bg-emerald-50", fg: "text-emerald-600", val: "text-emerald-700" }} />
        <OverviewCard icon={XCircle} label="Absent" value={absent} tone={{ bg: "bg-rose-50", fg: "text-rose-500", val: absent ? "text-rose-600" : "text-slate-900" }} />
      </div>

      {/* progress */}
      <div className="px-5 sm:px-6 py-5">
        <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
          <span>Service progress</span><span>{done} / {wd} completed</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden flex" data-testid={`my-sub-progress-${s.id}`}>
          <div className="bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          <div className="bg-rose-400 transition-all" style={{ width: `${absentPct}%` }} />
        </div>
      </div>

      {/* actions */}
      <div className="px-5 sm:px-6 pb-5 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" data-testid={`my-sub-details-btn-${s.id}`} onClick={() => setOpen(!open)} className="border-primary-200 text-primary-700 hover:bg-primary-50">
          View Details <ChevronDown className={`h-4 w-4 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
        </Button>
        <Button variant="outline" size="sm" data-testid={`my-sub-schedule-btn-${s.id}`} onClick={viewSchedule} className="border-slate-200 text-slate-600 hover:bg-slate-50">
          <Calendar className="h-4 w-4 mr-1" /> View Schedule
        </Button>
        <Button variant="outline" size="sm" data-testid={`my-sub-invoice-btn-${s.id}`} disabled={invBusy} onClick={downloadInvoice} className="border-slate-200 text-slate-600 hover:bg-slate-50">
          <Download className="h-4 w-4 mr-1" /> {invBusy ? "Preparing…" : "Download Invoice"}
        </Button>
      </div>

      {/* expanded details */}
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-5 sm:p-6 grid lg:grid-cols-2 gap-4" data-testid={`my-sub-expanded-${s.id}`}>
          {/* service calendar */}
          <div ref={calRef} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 lg:col-span-2" data-testid={`my-sub-calendar-${s.id}`}>
            <p className="font-bold text-slate-900 mb-3">Service calendar</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
              {schedule.map((d) => {
                const m = DAY_META[d.status] || DAY_META.scheduled;
                const dt = new Date(d.date + "T00:00:00");
                return (
                  <div key={d.date} data-testid={`my-sub-day-${s.id}-${d.date}`} className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${m.chip}`}>
                    <span className={`h-2 w-2 rounded-full shrink-0 ${m.dot}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold">{String(dt.getDate()).padStart(2, "0")} {dt.toLocaleString("en", { month: "short" })} · {WD_SHORT[dt.getDay()]}</p>
                      <p className="text-[11px] opacity-80">{m.label}</p>
                    </div>
                    {d.status !== "weekly_off" && <span className="text-xs font-bold">{d.earning > 0 ? "+" + fmt(d.earning) : "—"}</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
              {[["completed", "Completed"], ["maid_absent", "Absent"], ["weekly_off", "Weekly off"], ["scheduled", "Upcoming"], ["customer_cancel", "Cancelled"]].map(([k, lbl]) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px] text-slate-500"><span className={`h-2 w-2 rounded-full ${DAY_META[k].dot}`} />{lbl}</span>
              ))}
            </div>
          </div>

          {/* payment & subscription details */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" data-testid={`my-sub-payment-${s.id}`}>
            <p className="font-bold text-slate-900 mb-2 flex items-center gap-2"><Receipt className="h-4 w-4 text-primary-700" /> Payment & subscription details</p>
            <DetailRow k="Paid upfront" v={fmt(s.price)} strong />
            <DetailRow k="Commission snapshot" v={`${s.commission_pct}% (${fmt(s.commission_amount)})`} />
            <DetailRow k="Tax snapshot" v={`${s.tax_pct}% (${fmt(s.tax_amount)})`} />
            <DetailRow k="Partner maximum allocation" v={fmt(s.partner_allocation)} />
            <DetailRow k="Per-day earning" v={fmt(s.per_day_earning)} />
            <DetailRow k="Weekly off" v={(s.weekly_offs || []).length ? s.weekly_offs.map((d) => WD[d]).join(", ") : "None"} />
            <DetailRow k="Subscription status" v={<StatusChip label={status.replace(/_/g, " ")} tone={tone} />} />
          </div>

          {/* maid details */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5" data-testid={`my-sub-maid-${s.id}`}>
            <p className="font-bold text-slate-900 mb-2 flex items-center gap-2"><UserIcon className="h-4 w-4 text-primary-700" /> Maid details</p>
            {s.partner_name ? (
              <>
                <DetailRow k="Maid" v={s.partner_name} strong />
                {s.partner_phone ? <DetailRow k="Phone" v={<a href={`tel:${s.partner_phone}`} className="inline-flex items-center gap-1 text-primary-700 font-semibold"><Phone className="h-3.5 w-3.5" />{s.partner_phone}</a>} /> : null}
                <DetailRow k="Service time" v={s.preferred_time || "—"} />
                <DetailRow k="Address" v={[addr.label, addr.line || addr.address_line, addr.city, addr.pincode].filter(Boolean).join(", ") || "—"} />
              </>
            ) : (
              <p className="text-sm text-slate-400">A verified maid will be assigned to your subscription shortly.</p>
            )}
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
    <div data-testid="my-subscriptions" className="w-full space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
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
        <div className="space-y-4">{subs.map((s) => <SubCard key={s.id} s={s} />)}</div>
      )}
    </div>
  );
}
