/** Subscription checkout — reached from the normal Booking cart when the cart holds
 *  a single recurring (Maid) subscription line. Same look & feel as the standard
 *  /book checkout, but wired to the /subscriptions endpoints (backend keeps full
 *  subscription logic: working days, attendance, settlement). */
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CalendarClock, MapPin, ShieldCheck, CalendarHeart, CheckCircle2, PartyPopper, ArrowRight, Plus } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { openCheckout } from "@/lib/payments";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import BrandLogo from "@/components/site/BrandLogo";
import { toast } from "sonner";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const todayPlus = (d) => { const t = new Date(); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };

const Section = ({ title, icon: Icon, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60">
      {Icon && <Icon className="h-4 w-4 text-primary-700" />}
      <h3 className="font-heading font-bold text-slate-900 text-sm sm:text-base">{title}</h3>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

export default function SubscriptionCheckout({ item }) {
  const { user } = useAuth();
  const { clear } = useCart();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState([]);
  const [addrId, setAddrId] = useState("");
  const [startDate, setStartDate] = useState(todayPlus(1));
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(null);

  useEffect(() => {
    if (!user) return;
    api.get("/auth/addresses").then((r) => {
      const as = r.data || [];
      setAddresses(as);
      setAddrId((cur) => cur || (as.find((a) => a.is_default) || as[0])?.id || "");
    }).catch(() => {});
  }, [user]);

  const total = Number(item.plan_price) || 0;

  const placeOrder = async () => {
    if (!user) { toast.info("Please login to continue"); return navigate("/login"); }
    if (!addrId) return toast.error("Please select a service address");
    setBusy(true);
    try {
      const { data: sub } = await api.post("/subscriptions", {
        service_id: item.service_id, plan_type: item.plan_type,
        start_date: startDate, preferred_time: time, address_id: addrId,
      });
      const { data: order } = await api.post(`/subscriptions/${sub.id}/pay/order`);
      const ok = await openCheckout(order, {
        user, name: "AzoApp Subscription", description: item.name || "Subscription",
        onVerify: (res) => res.razorpay_payment_id
          ? api.post(`/subscriptions/${sub.id}/pay/verify`, { order_id: res.razorpay_order_id, payment_id: res.razorpay_payment_id, signature: res.razorpay_signature })
          : api.post(`/subscriptions/${sub.id}/pay/confirm`, { order_id: res.order_id, gw: res.gw }),
      });
      if (ok) { clear(); setPlaced({ code: sub.code || sub.id }); }
      else { toast.info("Payment was not completed. You can try again."); }
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Booking failed, please try again");
    } finally { setBusy(false); }
  };

  if (placed) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-6 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/30">
          <PartyPopper className="h-10 w-10 text-white" />
        </motion.div>
        <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900" data-testid="sub-checkout-success">Booking confirmed!</h1>
        <p className="text-slate-500 mt-2 max-w-sm">Your {item.plan_label} plan for {item.name} is booked &amp; paid · {fmt(total)}. We're assigning a verified professional.</p>
        <Button data-testid="sub-go-subscriptions" onClick={() => navigate("/account?tab=subscriptions")} className="mt-6 h-12 px-8 bg-primary-700 hover:bg-primary-800">View my subscriptions <ArrowRight className="h-4 w-4 ml-1" /></Button>
        <button onClick={() => navigate("/services")} className="mt-3 text-sm font-semibold text-slate-500 hover:text-primary-700">Book more services</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col" data-testid="subscription-checkout">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/70">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate(-1)} data-testid="sub-checkout-back" className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-primary-700"><ArrowLeft className="h-5 w-5" /></button>
          <BrandLogo to="/" />
          <div className="ml-auto">
            <p className="text-[11px] text-slate-400 font-medium text-right">Confirm your booking</p>
          </div>
        </div>
      </header>

      <div className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4 pb-40">
        <Section title="Your plan" icon={CalendarHeart}>
          <div className="flex items-start gap-3">
            <div className="h-14 w-14 rounded-xl bg-slate-100 overflow-hidden shrink-0">{item.image && <img src={item.image} alt={item.name} className="h-full w-full object-cover" />}</div>
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Recurring Subscription</span>
              <h3 className="font-semibold text-slate-900 mt-1 leading-snug">{item.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {item.plan_label} plan{item.working_days ? ` · ${item.working_days} working days` : ""}{item.duration_days ? ` · ${item.duration_days}-day period` : ""}
                {(item.weekly_offs || []).length ? ` · ${(item.weekly_offs || []).map((d) => WD[d]).join(", ")} off` : ""}
              </p>
            </div>
            <span className="font-heading font-extrabold text-xl text-slate-900 shrink-0">{fmt(total)}</span>
          </div>
        </Section>

        <Section title="When should we start?" icon={CalendarClock}>
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
        </Section>

        <Section title="Service address" icon={MapPin}>
          {addresses.length === 0 ? (
            <p className="text-sm text-slate-400">No saved address.
              <button data-testid="sub-add-address-link" className="text-primary-700 font-semibold ml-1 inline-flex items-center gap-1" onClick={() => navigate("/account?tab=addresses")}><Plus className="h-3.5 w-3.5" /> Add one</button>
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {addresses.map((a) => (
                <button key={a.id} data-testid={`sub-address-${a.id}`} onClick={() => setAddrId(a.id)}
                  className={`w-full flex items-start gap-2 rounded-xl border-2 p-3 text-left transition-all ${a.id === addrId ? "border-primary-700 bg-primary-50/60" : "border-slate-200 hover:border-primary-300"}`}>
                  <MapPin className="h-4 w-4 text-primary-700 mt-0.5 shrink-0" />
                  <span className="text-sm text-slate-700 flex-1">{a.label ? `${a.label} · ` : ""}{a.line || a.address_line || `${a.city || ""} ${a.pincode || ""}`}</span>
                  {a.id === addrId && <CheckCircle2 className="h-4 w-4 text-primary-700 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Price details" icon={ShieldCheck}>
          <div className="flex justify-between text-sm"><span className="text-slate-500">{item.plan_label} plan</span><span className="text-slate-800 font-medium">{fmt(total)}</span></div>
          <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between"><span className="text-slate-900 font-semibold">Total payable</span><span className="font-heading font-extrabold text-slate-900">{fmt(total)}</span></div>
          <div className="mt-3 rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-sm font-bold text-emerald-800">100% Secure &amp; Refundable</p><p className="text-[11px] text-emerald-700">Attendance captured daily · easy cancellations</p></div>
          </div>
        </Section>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">Total payable</p>
            <p className="font-heading font-extrabold text-xl text-slate-900 leading-none truncate">{fmt(total)}</p>
          </div>
          <Button data-testid="sub-confirm-pay-btn" onClick={placeOrder} disabled={busy || !addrId} className="ml-auto h-12 px-6 sm:px-10 bg-emerald-600 hover:bg-emerald-700 text-base disabled:opacity-50">
            {busy ? "Processing…" : "Confirm & Pay"} <ShieldCheck className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
