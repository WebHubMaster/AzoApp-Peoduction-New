import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Plus, Minus, Trash2, Check, CheckCircle2, ShoppingBag,
  Tag, MapPin, CalendarClock, Zap, ShieldCheck, User, Pencil, PartyPopper, Clock, Star, LocateFixed, Loader2, Wallet, CreditCard, Layers,
} from "lucide-react";
import api, { fmt } from "@/lib/api";
import { runPayment } from "@/lib/payments";
import { getMerchantRefCode } from "@/lib/merchantRef";

import { useAuth } from "@/context/AuthContext";
import { useCart, lineEstimate } from "@/context/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddressForm, emptyAddress } from "@/components/AddressForm";
import AddressMap from "@/components/site/AddressMap";
import SchedulePicker from "@/components/site/SchedulePicker";
import { OtpLogin } from "@/components/OtpLogin";
import SiteNavbar from "@/components/site/SiteNavbar";
import { toast } from "sonner";

const STEPS = [
  { key: "services", label: "Services", icon: ShoppingBag },
  { key: "details", label: "Details", icon: Tag },
  { key: "schedule", label: "Schedule", icon: CalendarClock },
  { key: "contact", label: "Your Info", icon: User },
  { key: "summary", label: "Summary", icon: MapPin },
  { key: "confirm", label: "Confirm", icon: ShieldCheck },
];

const PRICE_LABEL = { per_hour: "/ hr", per_person: "/ person", per_sqft: "/ sq ft" };

/* ---------------- Progress Stepper ---------------- */
const Stepper = ({ step, setStep, maxReached }) => (
  <div className="w-full">
    {/* Desktop */}
    <div className="hidden sm:flex items-center justify-between max-w-3xl mx-auto">
      {STEPS.map((s, i) => {
        const done = i < step;
        const active = i === step;
        const clickable = i <= maxReached;
        const Icon = s.icon;
        return (
          <React.Fragment key={s.key}>
            <button disabled={!clickable} onClick={() => clickable && setStep(i)}
              className="flex flex-col items-center gap-1.5 group" data-testid={`step-${s.key}`}>
              <span className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                ${done ? "bg-primary-700 border-primary-700 text-white"
                  : active ? "bg-white border-primary-700 text-primary-700 ring-4 ring-primary-100"
                  : "bg-white border-slate-200 text-slate-400"}`}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span className={`text-[11px] font-semibold ${active ? "text-primary-700" : done ? "text-slate-700" : "text-slate-400"}`}>{s.label}</span>
            </button>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 -mt-5 rounded-full transition-all ${i < step ? "bg-primary-700" : "bg-slate-200"}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
    {/* Mobile */}
    <div className="sm:hidden">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-primary-700">Step {step + 1} of {STEPS.length}</span>
        <span className="text-xs font-semibold text-slate-500">{STEPS[step].label}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <motion.div className="h-full bg-primary-700 rounded-full" animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </div>
    </div>
  </div>
);

const Qty = ({ value, onChange, size = "md" }) => (
  <div className={`inline-flex items-center rounded-xl border border-slate-200 bg-white ${size === "sm" ? "h-8" : "h-10"}`}>
    <button onClick={() => onChange(Math.max(1, value - 1))} className="px-2.5 h-full text-slate-500 hover:text-primary-700 disabled:opacity-30" disabled={value <= 1}><Minus className="h-3.5 w-3.5" /></button>
    <span className="w-7 text-center text-sm font-bold text-slate-900">{value}</span>
    <button onClick={() => onChange(value + 1)} className="px-2.5 h-full text-slate-500 hover:text-primary-700"><Plus className="h-3.5 w-3.5" /></button>
  </div>
);

const SectionCard = ({ title, icon: Icon, onEdit, children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60">
      <h3 className="font-heading font-bold text-slate-900 flex items-center gap-2 text-sm sm:text-base">
        {Icon && <Icon className="h-4 w-4 text-primary-700" />} {title}
      </h3>
      {onEdit && <button onClick={onEdit} className="text-xs font-semibold text-primary-700 hover:text-primary-800 flex items-center gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</button>}
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </div>
);

const Row = ({ l, v, green, bold }) => (
  <div className="flex justify-between text-sm">
    <span className={bold ? "text-slate-900 font-semibold" : "text-slate-500"}>{l}</span>
    <span className={green ? "text-emerald-600 font-medium" : bold ? "text-slate-900 font-bold" : "text-slate-700"}>{v}</span>
  </div>
);

/* "You saved ₹X as a member" highlight — shows the total membership benefit on this order. */
const MemberSavingsBadge = ({ totals }) => {
  const saved = (Number(totals?.membership_discount) || 0) + (Number(totals?.membership_visit_waiver) || 0);
  if (!(saved > 0)) return null;
  return (
    <div data-testid="member-savings-badge"
      className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
      <span className="text-lg">🎉</span>
      <p className="text-[13px] font-bold text-emerald-700">
        You saved {fmt(saved)} as a member{totals?.membership_plan ? ` · ${totals.membership_plan}` : ""}
      </p>
    </div>
  );
};

// Cart item → API request line (shared by cart-quote preview, coupon validation and booking).
const toReqItem = (it) => (it.custom
  ? { custom: true, custom_name: it.custom_name, custom_price: it.custom_price, labour_charge: it.labour_charge || 0, category_id: it.category_id, category_name: it.category_name, qty: it.qty }
  : { service_id: it.service_id, tier_index: it.tier_index, addons: (it.addons || []).map((n) => ({ name: n, qty: Math.max(1, (it.addonQty || {})[n] || 1) })), qty: it.qty, category_id: it.category_id, category_name: it.category_name });

export default function Checkout() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const { items, addService, removeItem, updateItem, setQty, setAddonQty, clear, count, estimateTotal } = useCart();

  // Add-on upsell / cross-sell: "frequently added" add-ons + "frequently booked
  // together" services, derived from real booking history on the backend.
  const [upsell, setUpsell] = useState({ popular_addons: {}, frequently_together: [] });
  const cartServiceIds = useMemo(
    () => items.map((it) => it.service_id).filter(Boolean).join(","),
    [items]
  );
  useEffect(() => {
    if (!cartServiceIds) { setUpsell({ popular_addons: {}, frequently_together: [] }); return; }
    let alive = true;
    api.get("/catalog/upsell", { params: { service_ids: cartServiceIds } })
      .then((r) => { if (alive) setUpsell(r.data || { popular_addons: {}, frequently_together: [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [cartServiceIds]);

  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [schedule, setSchedule] = useState("schedule");
  const [scheduledAt, setScheduledAt] = useState(null);
  const [coupon, setCoupon] = useState(() => localStorage.getItem("azo_coupon") || "");
  const [applied, setApplied] = useState("");         // validated coupon code
  const [couponMsg, setCouponMsg] = useState(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [quotes, setQuotes] = useState({});
  const [cartPricing, setCartPricing] = useState(null);
  const [addr, setAddr] = useState(emptyAddress());
  const [selectedId, setSelectedId] = useState("new");
  const [serviceable, setServiceable] = useState(null);
  const [cfg, setCfg] = useState({ address_config: {} });
  const [placing, setPlacing] = useState(false);
  const [payMethod, setPayMethod] = useState("online");
  const [walletBal, setWalletBal] = useState(0);
  useEffect(() => { api.get("/wallet").then((r) => setWalletBal(r.data?.balance || 0)).catch(() => {}); }, []);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [placed, setPlaced] = useState(null);
  const orderNonceRef = useRef(null);
  const acfg = cfg.address_config || {};

  useEffect(() => { document.title = "Checkout · AzoApp"; window.scrollTo(0, 0); }, []);
  useEffect(() => { api.get("/auth/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (localStorage.getItem("azo_coupon")) localStorage.removeItem("azo_coupon");
  }, [user]);

  const savedAddresses = user?.addresses || [];
  useEffect(() => {
    if (savedAddresses.length && selectedId === "new" && !addr.line) {
      const def = savedAddresses.find((a) => a.is_default) || savedAddresses[0];
      setSelectedId(def.id); setAddr({ ...emptyAddress(), ...def });
    }
  }, [user]); // eslint-disable-line

  /* live combined cart quote — the Visiting Charge is decided by the WHOLE cart's
     total service amount (added once when total < min, removed when total >= min),
     recomputed automatically whenever items / schedule / coupon change. No refresh.
     Resilient on slow / flaky networks: short per-attempt timeout + auto-retry with
     backoff, and we KEEP the last good pricing on a transient failure (never wipe to
     "Calculating…" once we have a number). cart-quote is a pure calculation (no side
     effects) so retrying is always safe. */
  useEffect(() => {
    if (!items.length) { setQuotes({}); setCartPricing(null); return; }
    let cancelled = false;
    // address is part of the quote: city/pincode-scoped rules (surge, serviceability)
    // must show in the preview exactly as they will be charged on the bookings.
    const payload = {
      schedule_type: schedule,
      ...(applied ? { coupon_code: applied } : {}),
      address: addr,
      items: items.map(toReqItem),
    };
    const attempt = async (n) => {
      try {
        const r = await api.post("/bookings/cart-quote", payload, { timeout: 12000 });
        if (cancelled) return;
        const byId = {};
        // line_total is the authoritative full line amount (base×qty + add-ons×addonQty).
        (r.data.lines || []).forEach((ln, i) => { const it = items[i]; if (it) byId[it.id] = { line_total: ln.line_total ?? ln.line_service_total, unit_total: ln.unit_total }; });
        setQuotes(byId);
        setCartPricing({ ...r.data.pricing, cart_service_total: r.data.cart_service_total, labour_total: r.data.labour_total || 0, category_charges: r.data.category_charges || [] });
        if (applied && r.data.coupon_applied === false) {
          setApplied("");
          setCouponMsg({ ok: false, text: "Coupon no longer applies to this order (minimum order not met)" });
        }
      } catch (e) {
        if (cancelled) return;
        if (n < 4) { setTimeout(() => { if (!cancelled) attempt(n + 1); }, 600 * n); }
        // else: give up quietly — keep any previously computed pricing so the
        // summary still shows real numbers instead of getting stuck on "Calculating…".
      }
    };
    const t = setTimeout(() => attempt(1), 200); // debounce rapid qty/coupon edits
    return () => { cancelled = true; clearTimeout(t); };
  }, [items, schedule, applied, user?.id, addr.city, addr.pincode, addr.lat, addr.lng]);

  const totals = useMemo(() => {
    if (!cartPricing) {
      return { base: 0, addons_total: 0, emergency_fee: 0, visiting_charge: 0, convenience_fee: 0, platform_fee: 0, gst: 0, discount: 0, total: 0, ready: false };
    }
    return { ...cartPricing, ready: true };
  }, [cartPricing]);

  const displayTotal = totals.ready && items.length ? totals.total : estimateTotal;
  const lineTotal = useCallback((it) => {
    const p = quotes[it.id];
    // Backend line_total is the source of truth (base×qty + add-ons at their own qty).
    return p && p.line_total != null ? p.line_total : lineEstimate(it);
  }, [quotes]);

  const go = (n) => { setStep(n); setMaxReached((m) => Math.max(m, n)); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const pickAddress = (aid) => {
    setSelectedId(aid);
    if (aid === "new") { setAddr(emptyAddress()); setServiceable(null); }
    else { const a = savedAddresses.find((x) => x.id === aid); if (a) setAddr({ ...emptyAddress(), ...a }); }
  };

  const applyCoupon = async () => {
    if (!coupon || !items.length || couponChecking) return;
    // Validate against the WHOLE cart (multi-service / multi-category) — never items[0] only.
    const body = { code: coupon, items: items.map(toReqItem), schedule_type: schedule, address: addr };
    setCouponChecking(true);
    setCouponMsg(null);
    // validate-coupon is a pure read → safe to retry on slow / flaky networks.
    const attempt = async (n) => {
      try {
        const { data } = await api.post("/bookings/validate-coupon", body, { timeout: 12000 });
        setApplied(coupon);
        setCouponMsg({ ok: true, text: `${data.message} — applied to your order` });
        setCouponChecking(false);
      } catch (e) {
        const noResponse = !e?.response; // network / timeout → retry
        if (noResponse && n < 4) {
          setTimeout(() => attempt(n + 1), 600 * n);
          return;
        }
        setApplied("");
        setCouponMsg({ ok: false, text: e?.response?.data?.detail || (noResponse ? "Network slow — please try again" : "Invalid coupon") });
        setCouponChecking(false);
      }
    };
    attempt(1);
  };
  const clearCoupon = () => { setCoupon(""); setApplied(""); setCouponMsg(null); setCouponChecking(false); };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("Location not supported");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { data } = await api.get(`/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
        setAddr((a) => ({ ...a, city: data.city || data.town || a.city, state: data.state || a.state, pincode: data.postcode || data.pincode || a.pincode, line: a.line || data.line || data.road || "", lat: data.lat ?? pos.coords.latitude, lng: data.lng ?? pos.coords.longitude }));
        toast.success("Location set — address auto-filled");
      } catch { toast.error("Could not detect location"); }
    }, () => toast.error("Location permission denied"), { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  };

  // A new/manually-entered address must be pinned via current location (or the
  // map) so we always have coordinates + an auto-filled, serviceable address.
  const needsGps = selectedId === "new" || savedAddresses.length === 0;

  const addressValid = () => {
    if (!user) return false;
    if (!addr.line || !addr.pincode) return false;
    if (needsGps && (!addr.lat || !addr.lng)) return false;
    if (acfg.mandatory_landmark && acfg.landmark_instructions && !addr.landmark) return false;
    if (needsGps && serviceable && serviceable.serviceable === false) return false;
    return true;
  };

  const canNext = () => {
    if (step === 0) return items.length > 0;
    if (step === 2) return schedule !== "schedule" || !!scheduledAt;
    if (step === 3) return addressValid();
    return true;
  };

  const next = () => {
    if (step === 0 && !items.length) return toast.error("Add at least one service");
    if (step === 2 && schedule === "schedule" && !scheduledAt) return toast.error("Please pick a date & time slot");
    if (step === 3) {
      if (!user) return toast.error("Please verify your mobile to continue");
      if (needsGps && (!addr.lat || !addr.lng)) return toast.error("Please set your location using \"Use my current location\" or the map");
      if (!addr.line || !addr.pincode) return toast.error("Please enter your service address");
      if (acfg.mandatory_landmark && acfg.landmark_instructions && !addr.landmark) return toast.error("Landmark is required");
      if (needsGps && serviceable && serviceable.serviceable === false) return toast.error("Sorry, we don't service this location yet");
    }
    if (step < STEPS.length - 1) go(step + 1);
  };
  const back = () => { if (step > 0) go(step - 1); else navigate(-1); };

  const placeOrder = async () => {
    if (!user) return toast.error("Please verify your mobile first");
    setPlacing(true);
    // Group cart lines by CATEGORY → one order per category (a single partner does
    // all same-category services; different categories become separate orders).
    const groups = {};
    for (const it of items) {
      const key = it.category_id || it.category_name || "uncategorised";
      (groups[key] ||= []).push(it);
    }
    const groupKeys = Object.keys(groups);
    setProgress({ done: 0, total: groupKeys.length });
    // A stable per-order nonce so retrying a failed order NEVER double-books: each
    // unit carries an idempotency_key that the backend dedupes on. Kept across
    // retries (until the order fully succeeds) via a ref.
    if (!orderNonceRef.current) orderNonceRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const nonce = orderNonceRef.current;
    // POST helper that retries safely on slow / flaky networks (network error or 5xx).
    const postResilient = async (url, body, { retries = 3, timeout = 20000 } = {}) => {
      let lastErr;
      for (let n = 0; n <= retries; n++) {
        try {
          return await api.post(url, body, { timeout });
        } catch (e) {
          lastErr = e;
          const status = e?.response?.status;
          const retriable = !e?.response || (status >= 500 && status < 600);
          if (!retriable || n === retries) throw e;
          await new Promise((r) => setTimeout(r, 700 * (n + 1)));
        }
      }
      throw lastErr;
    };
    const codes = [];
    const created = [];
    let firstErr = null;
    let firstGroup = true;
    const cst = cartPricing?.cart_service_total ?? null;
    // Full cart context: the backend splits once-per-cart amounts (coupon, convenience fee,
    // membership) across the category orders so Σ(orders) == the preview shown here.
    const cartItems = groupKeys.flatMap((k) => groups[k].map(toReqItem));
    // Phase 1 — create all bookings (idempotent + resilient).
    for (const key of groupKeys) {
      const gItems = groups[key].map(toReqItem);
      const idempotency_key = `${nonce}:grp:${key}`;
      try {
        const body = { items: gItems, cart_items: cartItems, address: addr, schedule_type: schedule, scheduled_at: scheduledAt, coupon_code: applied || null, cart_service_total: cst, apply_visiting: firstGroup, apply_emergency: firstGroup, idempotency_key, order_group_id: nonce, merchant_ref_code: getMerchantRefCode() || undefined };
        const { data } = await postResilient("/bookings/grouped", body, { retries: 3, timeout: 20000 });
        firstGroup = false;
        created.push({ id: data.id, code: data.code || data.id, category: data.category_name || groups[key][0]?.category_name || "Services", total: data.pricing?.total ?? null });
        codes.push(data.code || data.id);
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (e) { firstErr = firstErr || (e?.response?.data?.detail || "Booking failed. Please check My Bookings before retrying."); }
    }
    // Phase 2 — collect payment. Wallet = secure server-side deduct. Online = the
    // REAL active gateway (Razorpay/Cashfree/PayU/Easebuzz/Juspay) via runPayment,
    // which only falls back to the dev mock endpoint when NO gateway is configured.
    // No silent mock is ever used while a live gateway is active.
    // Point #13: when the checkout created MORE THAN ONE category-order, the customer
    // pays ONCE via a combined order-group payment (gateway or wallet); on success
    // every booking is confirmed and each category's partners are notified.
    let paidAll = created.length > 0;
    if (created.length > 1) {
      try {
        if (payMethod === "wallet") {
          try {
            await postResilient("/bookings/pay-wallet-group", { group_id: nonce }, { retries: 2, timeout: 20000 });
          } catch (e) {
            // Fallback: pay each booking from the wallet individually.
            for (const bk of created) {
              try { await postResilient(`/bookings/${bk.id}/pay-wallet`, {}, { retries: 2, timeout: 15000 }); }
              catch { paidAll = false; }
            }
          }
        } else {
          const ok = await runPayment({ purpose: "booking_group", groupId: nonce, user });
          if (!ok) paidAll = false;
        }
      } catch { paidAll = false; }
    } else {
      for (const bk of created) {
        try {
          if (payMethod === "wallet") {
            await postResilient(`/bookings/${bk.id}/pay-wallet`, {}, { retries: 3, timeout: 15000 });
          } else {
            const ok = await runPayment({ purpose: "booking", bookingId: bk.id, user });
            if (!ok) paidAll = false;
          }
        } catch { paidAll = false; }
      }
    }
    if (selectedId === "new" && addr.line) { try { await api.post("/auth/address", { ...addr, label: addr.label || "Home" }); } catch { /* ignore */ } }
    await refresh();
    setPlacing(false);
    if (codes.length) {
      orderNonceRef.current = null; // fresh nonce for any future order
      clear();
      setPlaced({ count: codes.length, total: displayTotal, paid: paidAll, orders: created });
    } else {
      toast.error(firstErr || "Could not place your order");
    }
  };

  /* ---------------- Success screen ---------------- */
  if (placed) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-6 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/30">
          <PartyPopper className="h-10 w-10 text-white" />
        </motion.div>
        <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900">Order placed!</h1>
        <p className="text-slate-500 mt-2 max-w-sm">{placed.paid
          ? <>{placed.count} booking{placed.count > 1 ? "s" : ""} confirmed &amp; paid · {fmt(placed.total)}. We're finding the best professionals near you.</>
          : <>{placed.count} booking{placed.count > 1 ? "s" : ""} created · complete the payment from My Bookings to confirm.</>}</p>

        {(placed.orders || []).length > 1 && (
          <div className="mt-6 w-full max-w-md text-left" data-testid="order-group-summary">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Order group · {placed.orders.length} invoices</p>
              <span className="text-[11px] text-slate-400">one per category</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
              {placed.orders.map((o, i) => (
                <div key={o.id || i} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`order-group-row-${i}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{o.category}</p>
                    <p className="text-[11px] text-slate-400 font-mono">#{o.code}</p>
                  </div>
                  <p className="text-sm font-bold text-slate-800 shrink-0 tabular-nums">{o.total != null ? fmt(o.total) : "—"}</p>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50">
                <p className="text-sm font-bold text-slate-900">Combined total</p>
                <p className="text-base font-black text-primary-700 tabular-nums" data-testid="order-group-grand-total">{fmt(placed.orders.every((o) => o.total != null) ? placed.orders.reduce((s, o) => s + (o.total || 0), 0) : placed.total)}</p>
              </div>
            </div>
          </div>
        )}
        <Button data-testid="go-bookings" onClick={() => navigate("/account")} className="mt-6 h-12 px-8 bg-primary-700 hover:bg-primary-800">View my bookings <ArrowRight className="h-4 w-4 ml-1" /></Button>
        <button onClick={() => navigate("/services")} className="mt-3 text-sm font-semibold text-slate-500 hover:text-primary-700">Book more services</button>
      </div>
    );
  }

  /* ---------------- Empty cart ---------------- */
  if (!items.length && step === 0) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
        <SiteNavbar showSearch={false} />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="h-20 w-20 rounded-2xl bg-primary-50 flex items-center justify-center mb-5"><ShoppingBag className="h-10 w-10 text-primary-700" /></div>
          <h1 className="font-heading font-bold text-2xl text-slate-900">Your booking is empty</h1>
          <p className="text-slate-500 mt-2 max-w-sm">Add one or more services to get started. You can book multiple services in a single order.</p>
          <Button data-testid="browse-services" onClick={() => navigate("/services")} className="mt-6 h-12 px-8 bg-primary-700 hover:bg-primary-800">Browse services <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
          <button onClick={back} data-testid="checkout-back" className="h-9 w-9 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-primary-700"><ArrowLeft className="h-5 w-5" /></button>
          <div>
            <h1 className="font-heading font-extrabold text-lg text-slate-900 leading-none">Book your services</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">{count} item{count > 1 ? "s" : ""} in your order</p>
          </div>
        </div>
        <div className="border-t border-slate-100 py-3 px-4 sm:px-6"><Stepper step={step} setStep={go} maxReached={maxReached} /></div>
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-3 gap-6 pb-40 lg:pb-28">
        {/* main step area */}
        <div className="lg:col-span-2 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
              {step === 0 && <StepServices items={items} removeItem={removeItem} setQty={setQty} lineTotal={lineTotal} navigate={navigate} together={upsell.frequently_together} addService={addService} />}
              {step === 1 && <StepDetails items={items} updateItem={updateItem} setAddonQty={setAddonQty} quotes={quotes} popularAddons={upsell.popular_addons} lineTotal={lineTotal} />}
              {step === 2 && <StepSchedule schedule={schedule} setSchedule={setSchedule} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt} />}
              {step === 3 && <StepContact user={user} refresh={refresh} savedAddresses={savedAddresses} selectedId={selectedId} pickAddress={pickAddress} addr={addr} setAddr={setAddr} acfg={acfg} setServiceable={setServiceable} useCurrentLocation={useCurrentLocation} mapsKey={cfg.integrations?.google_maps_api_key || ""} />}
              {step === 4 && <StepSummary items={items} quotes={quotes} totals={totals} lineTotal={lineTotal} estimateTotal={estimateTotal} coupon={coupon} setCoupon={setCoupon} applyCoupon={applyCoupon} applied={applied} clearCoupon={clearCoupon} couponMsg={couponMsg} setCouponMsg={setCouponMsg} couponChecking={couponChecking} />}
              {step === 5 && <StepReview items={items} totals={totals} lineTotal={lineTotal} schedule={schedule} scheduledAt={scheduledAt} addr={addr} user={user} go={go} displayTotal={displayTotal} payMethod={payMethod} setPayMethod={setPayMethod} walletBal={walletBal} />}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* summary sidebar (desktop) */}
        <div className="hidden lg:block">
          <OrderSidebar items={items} lineTotal={lineTotal} totals={totals} displayTotal={displayTotal} navigate={navigate} showFull={step >= 4} />
        </div>
      </div>

      {/* sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400 font-medium">{step >= 4 ? "Total payable" : "Services subtotal · taxes at checkout"}</p>
            <p className="font-heading font-extrabold text-xl text-slate-900 leading-none truncate">{fmt(step >= 4 ? displayTotal : items.reduce((s, it) => s + lineTotal(it), 0))}</p>
          </div>
          {step < STEPS.length - 1 ? (
            <Button data-testid="checkout-next" onClick={next} disabled={!canNext()} className="ml-auto h-12 px-6 sm:px-10 bg-primary-700 hover:bg-primary-800 text-base disabled:opacity-50">
              {step === 4 ? "Review order" : "Continue"} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button data-testid="place-order" onClick={placeOrder} disabled={placing} className="ml-auto h-12 px-6 sm:px-10 bg-emerald-600 hover:bg-emerald-700 text-base">
              {placing ? `Placing ${progress.done}/${progress.total}…` : "Confirm & Place Order"} <ShieldCheck className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= STEP 1: Select Services ================= */
const StepServices = ({ items, removeItem, setQty, lineTotal, navigate, together = [], addService }) => {
  const inCart = new Set(items.map((it) => it.service_id));
  const suggestions = (together || []).filter((s) => !inCart.has(s.id)).slice(0, 6);
  return (
  <div className="space-y-4">
    <div>
      <h2 className="font-heading font-bold text-xl text-slate-900">Your selected services</h2>
      <p className="text-sm text-slate-500 mt-0.5">Add as many services as you like — they'll all be booked in one order.</p>
    </div>
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.id} data-testid={`cart-item-${it.service_id}`} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-20 w-20 rounded-xl bg-slate-100 overflow-hidden shrink-0">{it.image && <img src={it.image} alt={it.name} className="h-full w-full object-cover" />}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary-700 truncate">{it.category_name}</p>
            <h3 className="font-semibold text-slate-900 leading-snug line-clamp-2">{it.name}</h3>
            {it.tier_index != null && it.tiers?.[it.tier_index] && <p className="text-xs text-slate-500 mt-0.5">Pack: {it.tiers[it.tier_index].label}</p>}
            {(it.addons || []).length > 0 && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">+ {it.addons.map((n) => `${n}${((it.addonQty || {})[n] || 1) > 1 ? ` ×${(it.addonQty || {})[n]}` : ""}`).join(", ")}</p>}
            <div className="flex items-center justify-between mt-2">
              <Qty value={it.qty} onChange={(v) => setQty(it.id, v)} size="sm" />
              <span className="font-heading font-extrabold text-slate-900">{fmt(lineTotal(it))}</span>
            </div>
          </div>
          <button data-testid={`remove-${it.service_id}`} onClick={() => removeItem(it.id)} className="text-slate-300 hover:text-red-500 self-start"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
    </div>

    {/* Cross-sell: services frequently booked together (one-tap add → bigger order) */}
    {suggestions.length > 0 && addService && (
      <div data-testid="frequently-together" className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex items-center gap-2 mb-3">
          <PartyPopper className="h-4 w-4 text-amber-600" />
          <p className="text-sm font-bold text-slate-800">Frequently booked together</p>
        </div>
        <div
          data-testid="together-scroller"
          className="flex flex-nowrap gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scroll-smooth"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {suggestions.map((s) => {
            const price = s.discounted_price || s.base_price || (s.tiers?.[0]?.price) || 0;
            return (
              <div key={s.id} data-testid={`together-${s.id}`} className="basis-[62%] sm:basis-auto sm:w-40 shrink-0 grow-0 max-w-[220px] snap-start rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="h-20 w-full bg-slate-100 overflow-hidden">{s.image && <img src={s.image} alt={s.name} className="h-full w-full object-cover" />}</div>
                <div className="p-2.5">
                  <p className="text-[13px] font-semibold text-slate-800 leading-snug line-clamp-2 min-h-[34px]">{s.name}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="font-heading font-extrabold text-sm text-slate-900">{fmt(price)}</span>
                    <button data-testid={`together-add-${s.id}`} onClick={() => { addService(s); toast.success(`${s.name} added`); }}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-700 hover:bg-primary-800 text-white text-xs font-semibold px-2.5 py-1 azo-press">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

    <button data-testid="add-more" onClick={() => navigate("/services")} className="w-full rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/50 text-primary-700 font-semibold py-4 flex items-center justify-center gap-2 hover:bg-primary-50 transition-colors">
      <Plus className="h-4 w-4" /> Add more services
    </button>
  </div>
  );
};


/* ================= STEP 2: Service Details ================= */
const StepDetails = ({ items, updateItem, setAddonQty, quotes, popularAddons = {}, lineTotal }) => {
  const toggleAddon = (it, name) => {
    const has = (it.addons || []).includes(name);
    if (has) {
      const nextQty = { ...(it.addonQty || {}) };
      delete nextQty[name];
      updateItem(it.id, { addons: it.addons.filter((x) => x !== name), addonQty: nextQty });
    } else {
      updateItem(it.id, { addons: [...(it.addons || []), name], addonQty: { ...(it.addonQty || {}), [name]: 1 } });
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-bold text-xl text-slate-900">Customize each service</h2>
        <p className="text-sm text-slate-500 mt-0.5">Pick a pack, add extras and set quantity for each service.</p>
      </div>
      {items.map((it) => (
        <div key={it.id} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid={`detail-${it.service_id}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-12 w-12 rounded-xl bg-slate-100 overflow-hidden shrink-0">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</div>
            <div className="min-w-0"><h3 className="font-semibold text-slate-900 leading-snug line-clamp-1">{it.name}</h3>
              <span className="text-xs text-slate-500 flex items-center gap-2"><Star className="h-3 w-3 fill-amber-400 text-amber-400" />{it.rating || "4.8"}<Clock className="h-3 w-3" />{it.duration_min}m</span></div>
            <div className="ml-auto"><Qty value={it.qty} onChange={(v) => updateItem(it.id, { qty: Math.max(1, v) })} /></div>
          </div>

          {(it.tiers || []).length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Choose a pack</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {it.tiers.map((t, ti) => {
                  const sel = it.tier_index === ti;
                  const off = t.original_price > t.price ? Math.round((1 - t.price / t.original_price) * 100) : 0;
                  return (
                    <button key={ti} data-testid={`tier-${it.service_id}-${ti}`} onClick={() => updateItem(it.id, { tier_index: ti })}
                      className={`relative text-left rounded-xl border-2 p-3 transition-all ${sel ? "border-primary-700 bg-primary-50" : "border-slate-200 hover:border-primary-300"}`}>
                      {t.badge && <span className="absolute -top-2 left-2 bg-primary-700 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{t.badge}</span>}
                      <p className="font-semibold text-sm text-slate-900 line-clamp-1">{t.label}</p>
                      <div className="flex items-baseline gap-1 mt-1"><span className="font-heading font-extrabold text-slate-900">{fmt(t.price)}</span>{off > 0 && <span className="text-[11px] text-slate-400 line-through">{fmt(t.original_price)}</span>}</div>
                      {off > 0 && <p className="text-[11px] text-emerald-600 font-semibold">{off}% off</p>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {(it.addonsCatalog || []).length > 0 && (
            <div>
              {/* Upsell: "frequently added" quick-add chips (popular add-ons not yet selected) */}
              {(() => {
                const pop = (popularAddons[it.service_id] || []).filter((p) => !(it.addons || []).includes(p.name));
                if (!pop.length) return null;
                return (
                  <div data-testid={`freq-addons-${it.service_id}`} className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1.5 flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Frequently added</p>
                    <div className="flex flex-wrap gap-1.5">
                      {pop.map((p) => (
                        <button key={p.name} data-testid={`freq-addon-${it.service_id}-${p.name}`} onClick={() => toggleAddon(it, p.name)}
                          className="inline-flex items-center gap-1 rounded-full bg-white border border-amber-300 text-amber-800 text-xs font-semibold px-2.5 py-1 hover:bg-amber-100 azo-press">
                          <Plus className="h-3 w-3" /> {p.name} <span className="text-amber-500">+{fmt(p.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Add-ons</p>
              <div className="space-y-2">
                {it.addonsCatalog.map((a) => {
                  const on = (it.addons || []).includes(a.name);
                  const popular = (popularAddons[it.service_id] || []).some((p) => p.name === a.name && p.count > 0);
                  const aq = Math.max(1, Number((it.addonQty || {})[a.name]) || 1);
                  return (
                    <div key={a.name}
                      className={`w-full rounded-xl border transition-all ${on ? "border-primary-700 bg-primary-50" : "border-slate-200"}`}>
                      <button data-testid={`addon-${it.service_id}-${a.name}`} onClick={() => toggleAddon(it, a.name)}
                        className="w-full flex items-center justify-between p-3">
                        <span className="flex items-center gap-2.5">
                          <span className={`h-5 w-5 rounded-md border flex items-center justify-center ${on ? "bg-primary-700 border-primary-700" : "border-slate-300"}`}>{on && <Check className="h-3.5 w-3.5 text-white" />}</span>
                          <span className="text-sm font-medium text-slate-800">{a.name}</span>
                          {popular && <span data-testid={`addon-popular-${it.service_id}-${a.name}`} className="text-[9px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Popular</span>}
                        </span>
                        <span className="text-sm font-semibold text-slate-700">+{fmt(a.price)}</span>
                      </button>
                      {/* Independent add-on quantity — does NOT change the main service qty */}
                      {on && (
                        <div className="flex items-center justify-between px-3 pb-3 -mt-1" data-testid={`addon-qty-row-${it.service_id}-${a.name}`}>
                          <span className="text-[11px] text-slate-500">Add-on quantity</span>
                          <div className="flex items-center gap-3">
                            <Qty value={aq} onChange={(v) => setAddonQty(it.id, a.name, v)} size="sm" />
                            <span className="text-xs font-semibold text-slate-700 tabular-nums w-16 text-right">{fmt((Number(a.price) || 0) * aq)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(it.tiers || []).length === 0 && (it.addonsCatalog || []).length === 0 && (
            <p className="text-sm text-slate-400">No extra options for this service — just set the quantity above.</p>
          )}
          <div className="flex justify-end mt-3 pt-3 border-t border-slate-100">
            <span className="text-sm text-slate-500">Subtotal:&nbsp;</span>
            <span className="font-heading font-bold text-slate-900">{fmt(lineTotal ? lineTotal(it) : lineEstimate(it))}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ================= STEP 3: Schedule ================= */
const StepSchedule = ({ schedule, setSchedule, scheduledAt, setScheduledAt }) => (
  <div className="space-y-4">
    <div>
      <h2 className="font-heading font-bold text-xl text-slate-900">When should we come?</h2>
      <p className="text-sm text-slate-500 mt-0.5">This schedule applies to your whole order.</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
      {[["schedule", "Schedule a visit", "Pick a convenient date & time", CalendarClock], ["emergency", "Instant / Emergency", "Get help as soon as possible", Zap]].map(([k, t, d, Icon]) => (
        <button key={k} data-testid={`when-${k}`} onClick={() => setSchedule(k)}
          className={`text-left rounded-2xl border-2 p-4 transition-all ${schedule === k ? "border-primary-700 bg-primary-50" : "border-slate-200 bg-white hover:border-primary-300"}`}>
          <Icon className={`h-6 w-6 mb-2 ${schedule === k ? "text-primary-700" : "text-slate-400"}`} />
          <p className="font-semibold text-slate-900">{t}</p>
          <p className="text-xs text-slate-500 mt-0.5">{d}</p>
        </button>
      ))}
    </div>
    {schedule === "schedule" && <SchedulePicker value={scheduledAt} onChange={setScheduledAt} />}
    {schedule === "emergency" && (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex gap-3">
        <Zap className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">We'll assign the nearest available professional right away. A small instant / emergency charge may apply.</p>
      </div>
    )}
  </div>
);

/* ================= STEP 4: Customer Details ================= */
const StepContact = ({ user, refresh, savedAddresses, selectedId, pickAddress, addr, setAddr, acfg, setServiceable, useCurrentLocation, mapsKey }) => {
  if (!user) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-heading font-bold text-xl text-slate-900">Verify your mobile</h2>
          <p className="text-sm text-slate-500 mt-0.5">We'll send an OTP to confirm your number and save your bookings.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 max-w-md">
          <OtpLogin onSuccess={() => refresh()} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading font-bold text-xl text-slate-900">Your details &amp; address</h2>
        <p className="text-sm text-slate-500 mt-0.5">Where should our professional reach you?</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-700 font-bold flex items-center justify-center">{(user.name || "U")[0]}</div>
        <div><p className="font-semibold text-slate-900">{user.name}</p><p className="text-xs text-slate-500">{user.phone}</p></div>
      </div>

      {savedAddresses.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2"><MapPin className="h-3 w-3 inline mr-1" />Saved addresses</p>
          <div className="flex flex-wrap gap-2">
            {savedAddresses.map((a) => (
              <button key={a.id} data-testid={`saved-addr-${a.id}`} onClick={() => pickAddress(a.id)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border text-left transition-colors ${selectedId === a.id ? "border-primary-700 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600 hover:border-primary-300"}`}>
                <span className="block font-semibold flex items-center gap-1">{a.label} {a.is_default && "★"}
                  {a.lat && a.lng && <span data-testid={`addr-pinned-${a.id}`} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5"><MapPin className="h-2.5 w-2.5" /> Pinned</span>}
                </span>
                <span className="block text-xs text-slate-400 max-w-[160px] truncate">{a.line}</span>
              </button>
            ))}
            <button data-testid="saved-addr-new" onClick={() => pickAddress("new")}
              className={`px-3 py-2 rounded-xl text-sm font-medium border flex items-center gap-1 ${selectedId === "new" ? "border-primary-700 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600"}`}>
              <Plus className="h-4 w-4" /> New address
            </button>
          </div>
        </div>
      )}

      {/* Repeat booking: a saved address that already has a pinned location shows a
          map preview and skips the mandatory "detect location" step entirely. */}
      {selectedId !== "new" && savedAddresses.length > 0 && addr.lat && addr.lng && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid="saved-addr-map">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400"><MapPin className="h-3 w-3 inline mr-1" />Service location</p>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600"><MapPin className="h-3 w-3" /> Pinned</span>
          </div>
          <AddressMap mapsKey={mapsKey} lat={Number(addr.lat)} lng={Number(addr.lng)} onPick={(la, ln) => setAddr((a) => ({ ...a, lat: la, lng: ln }))} />
          <p className="text-sm text-slate-600 mt-2">{[addr.line, addr.city, addr.pincode].filter(Boolean).join(", ")}</p>
          <p className="text-[11px] text-slate-400 mt-1">Drag the pin to fine-tune this location.</p>
        </div>
      )}

      {(selectedId === "new" || savedAddresses.length === 0) && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400"><MapPin className="h-3 w-3 inline mr-1" />Service address</p>
            <button data-testid="use-location" onClick={useCurrentLocation} className="text-xs font-semibold text-primary-700 flex items-center gap-1"><LocateFixed className="h-3.5 w-3.5" /> Use current location</button>
          </div>
          <AddressForm value={addr} onChange={setAddr} cfg={acfg} onServiceability={setServiceable} mapsKey={mapsKey} />
        </div>
      )}
    </div>
  );
};

/* ================= STEP 5: Order Summary (+coupon) ================= */
const StepSummary = ({ items, quotes, totals, lineTotal, estimateTotal, coupon, setCoupon, applyCoupon, applied, clearCoupon, couponMsg, setCouponMsg, couponChecking }) => (
  <div className="space-y-4">
    <div>
      <h2 className="font-heading font-bold text-xl text-slate-900">Order summary</h2>
      <p className="text-sm text-slate-500 mt-0.5">Review pricing and apply a coupon before you continue.</p>
    </div>

    <SectionCard title="Services" icon={ShoppingBag}>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.id} className="flex justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-900 text-sm line-clamp-1">{it.name}</p>
              <p className="text-xs text-slate-400">
                {it.tier_index != null && it.tiers?.[it.tier_index] ? `${it.tiers[it.tier_index].label} · ` : ""}Qty {it.qty}
                {(it.addons || []).length > 0 ? ` · +${it.addons.length} add-on` : ""}
              </p>
            </div>
            <span className="font-semibold text-slate-900 text-sm shrink-0">{fmt(lineTotal(it))}</span>
          </div>
        ))}
      </div>
    </SectionCard>

    <SectionCard title="Have a coupon?" icon={Tag}>
      <div className="relative">
        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input data-testid="coupon-input" className="pl-9 uppercase" placeholder="Try AZO50" value={coupon} onChange={(e) => { setCoupon(e.target.value.toUpperCase()); setCouponMsg(null); }} />
        {applied ? (
          <button data-testid="coupon-clear" onClick={clearCoupon} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-red-500">REMOVE</button>
        ) : (
          <button data-testid="coupon-apply" onClick={applyCoupon} disabled={!coupon || couponChecking} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary-700 disabled:opacity-40 inline-flex items-center gap-1">
            {couponChecking ? <><Loader2 className="h-3 w-3 animate-spin" /> CHECKING…</> : "APPLY"}
          </button>
        )}
      </div>
      {couponMsg && <p className={`text-xs mt-2 ${couponMsg.ok ? "text-emerald-600" : "text-red-500"}`}>{couponMsg.text}</p>}
    </SectionCard>

    {totals.ready && (totals.category_charges || []).length > 1 && (
      <SectionCard title="Category-wise charges" icon={Layers}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs" data-testid="category-charges-table">
            <thead>
              <tr className="text-slate-400 text-left">
                <th className="py-1 pr-2 font-medium">Category</th>
                <th className="py-1 px-1 font-medium text-right">Service</th>
                <th className="py-1 px-1 font-medium text-right">Visiting</th>
                <th className="py-1 px-1 font-medium text-right">Emergency</th>
                <th className="py-1 pl-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(totals.category_charges || []).map((c) => (
                <tr key={c.category_id || c.category_name} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2 font-medium text-slate-700 truncate max-w-[120px]">{c.category_name}</td>
                  <td className="py-1.5 px-1 text-right text-slate-600">{fmt(c.service_total)}</td>
                  <td className="py-1.5 px-1 text-right text-slate-600">{fmt(c.visiting_charge)}</td>
                  <td className="py-1.5 px-1 text-right text-slate-600">{fmt(c.emergency_charge)}</td>
                  <td className="py-1.5 pl-1 text-right font-semibold text-slate-900">{fmt(c.category_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">Each category is booked separately and paid to its own partner. Visiting &amp; emergency charges apply per category.</p>
      </SectionCard>
    )}

    <SectionCard title="Price details" icon={MapPin}>
      {!totals.ready ? (
        <div className="space-y-1.5" data-testid="price-estimating">
          <Row l="Services" v={fmt(items.reduce((s, it) => s + lineTotal(it), 0))} />
          <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finalising taxes &amp; fees…
          </div>
          <div className="pt-2 mt-1 border-t border-slate-100">
            <Row l="Estimated total" v={fmt(estimateTotal)} bold />
          </div>
          <p className="text-[11px] text-slate-400 pt-1">Final amount is confirmed in a moment — you can still continue.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Row l="Services" v={fmt((totals.base || 0) - (totals.labour_total || 0))} />
          {totals.labour_total > 0 && <Row l="Labour charge" v={fmt(totals.labour_total)} />}
          {totals.addons_total > 0 && <Row l="Add-ons" v={fmt(totals.addons_total)} />}
          {totals.emergency_fee > 0 && <Row l="Instant / Emergency fee" v={fmt(totals.emergency_fee)} />}
          {totals.visiting_charge > 0 && <Row l="Visiting charge" v={fmt(totals.visiting_charge)} />}
          {totals.convenience_fee > 0 && <Row l="Convenience fee" v={fmt(totals.convenience_fee)} />}
          {totals.platform_fee > 0 && <Row l="Platform fee" v={fmt(totals.platform_fee)} />}
          {totals.discount > 0 && <Row l="Coupon discount" v={"- " + fmt(totals.discount)} green />}
          {totals.membership_discount > 0 && <Row l={`Member discount${totals.membership_plan ? ` (${totals.membership_plan})` : ""}`} v={"- " + fmt(totals.membership_discount)} green />}
          {totals.membership_visit_waiver > 0 && <Row l="Free visiting charge (Member)" v={"- " + fmt(totals.membership_visit_waiver)} green />}
          {totals.loyalty_discount > 0 && <Row l="Loyalty points" v={"- " + fmt(totals.loyalty_discount)} green />}
          {totals.referral_discount > 0 && <Row l="Referral discount" v={"- " + fmt(totals.referral_discount)} green />}
          {totals.taxable != null && <div data-testid="checkout-taxable"><Row l="Taxable amount" v={fmt(totals.taxable)} /></div>}
          {totals.gst > 0 && <div data-testid="checkout-gst"><Row l="Est. Govt. Taxes" v={fmt(totals.gst)} /></div>}
          <div className="pt-2 mt-1 border-t border-slate-100"><Row l="Total payable" v={fmt(totals.total)} bold /></div>
          <MemberSavingsBadge totals={totals} />
        </div>
      )}
    </SectionCard>
  </div>
);

/* ================= STEP 6: Final Review ================= */
const scheduleLabel = (schedule, scheduledAt) => {
  if (schedule === "emergency") return "Instant / Emergency · ASAP";
  if (!scheduledAt) return "Not set";
  const d = new Date(scheduledAt);
  const t = scheduledAt.split("T")[1];
  const [h, m] = (t || "10:00").split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM"; const hh = h % 12 || 12;
  return `${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${hh}:${String(m).padStart(2, "0")} ${ap}`;
};

const StepReview = ({ items, totals, lineTotal, schedule, scheduledAt, addr, user, go, displayTotal, payMethod, setPayMethod, walletBal }) => (
  <div className="space-y-4">
    <div>
      <h2 className="font-heading font-bold text-xl text-slate-900">Review &amp; confirm</h2>
      <p className="text-sm text-slate-500 mt-0.5">Please verify everything before placing your order.</p>
    </div>

    <SectionCard title={`Services (${items.length})`} icon={ShoppingBag} onEdit={() => go(0)}>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.id} className="flex gap-3">
            <div className="h-12 w-12 rounded-lg bg-slate-100 overflow-hidden shrink-0">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 text-sm line-clamp-1">{it.name}</p>
              <p className="text-xs text-slate-400">
                {it.tier_index != null && it.tiers?.[it.tier_index] ? `${it.tiers[it.tier_index].label} · ` : ""}Qty {it.qty}
                {(it.addons || []).length > 0 ? ` · ${it.addons.map((n) => `${n}${((it.addonQty || {})[n] || 1) > 1 ? ` ×${(it.addonQty || {})[n]}` : ""}`).join(", ")}` : ""}
              </p>
            </div>
            <span className="font-semibold text-slate-900 text-sm shrink-0">{fmt(lineTotal(it))}</span>
          </div>
        ))}
      </div>
    </SectionCard>

    <div className="grid sm:grid-cols-2 gap-4">
      <SectionCard title="Schedule" icon={CalendarClock} onEdit={() => go(2)}>
        <p className="text-sm text-slate-700 font-medium flex items-center gap-2">
          {schedule === "emergency" ? <Zap className="h-4 w-4 text-amber-500" /> : <CalendarClock className="h-4 w-4 text-primary-700" />}
          {scheduleLabel(schedule, scheduledAt)}
        </p>
      </SectionCard>
      <SectionCard title="Contact" icon={User} onEdit={() => go(3)}>
        <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
        <p className="text-xs text-slate-500">{user?.phone}</p>
      </SectionCard>
    </div>

    <SectionCard title="Service address" icon={MapPin} onEdit={() => go(3)}>
      <p className="text-sm text-slate-700"><span className="font-semibold">{addr.label}</span> · {addr.line}</p>
      <p className="text-xs text-slate-500 mt-0.5">{[addr.city, addr.pincode].filter(Boolean).join(" - ")}{addr.landmark ? ` · Near ${addr.landmark}` : ""}</p>
    </SectionCard>

    <SectionCard title="Payment method" icon={Wallet}>
      {(() => {
        const canWallet = walletBal >= displayTotal && displayTotal > 0;
        return (
          <div className="space-y-2.5" data-testid="pay-method">
            <button type="button" data-testid="pay-online" onClick={() => setPayMethod("online")}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${payMethod === "online" ? "border-primary-600 bg-primary-50" : "border-slate-200 hover:border-slate-300"}`}>
              <span className={`h-9 w-9 rounded-lg grid place-items-center ${payMethod === "online" ? "bg-primary-600 text-white" : "bg-slate-100 text-slate-500"}`}><CreditCard className="h-5 w-5" /></span>
              <span className="flex-1"><span className="block text-sm font-semibold text-slate-900">Pay Online</span><span className="block text-xs text-slate-500">UPI · Card · Netbanking</span></span>
              <span className={`h-4 w-4 rounded-full border-2 ${payMethod === "online" ? "border-primary-600 bg-primary-600" : "border-slate-300"}`} />
            </button>
            <button type="button" data-testid="pay-wallet" disabled={!canWallet} onClick={() => canWallet && setPayMethod("wallet")}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${!canWallet ? "opacity-50 cursor-not-allowed border-slate-200" : payMethod === "wallet" ? "border-emerald-600 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>
              <span className={`h-9 w-9 rounded-lg grid place-items-center ${payMethod === "wallet" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}><Wallet className="h-5 w-5" /></span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-slate-900">Pay with Wallet</span>
                <span className="block text-xs text-slate-500">Balance {fmt(walletBal)}{!canWallet ? " · insufficient for this order" : ""}</span>
              </span>
              <span className={`h-4 w-4 rounded-full border-2 ${payMethod === "wallet" ? "border-emerald-600 bg-emerald-600" : "border-slate-300"}`} />
            </button>
            {walletBal <= 0 && <p className="text-[11px] text-slate-400">New here? Wallet unlocks once you have balance (e.g. from a refund). For now, pay online.</p>}
          </div>
        );
      })()}
    </SectionCard>

    <SectionCard title="Payment summary" icon={ShieldCheck} onEdit={() => go(4)}>
      {!totals.ready ? (
        <div className="space-y-1.5" data-testid="review-estimating">
          <Row l="Services" v={fmt(items.reduce((s, it) => s + lineTotal(it), 0))} />
          <div className="flex items-center gap-2 text-slate-400 text-xs py-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finalising taxes &amp; fees…
          </div>
          <div className="pt-2 mt-1 border-t border-slate-100">
            <Row l="Estimated total" v={fmt(displayTotal)} bold />
          </div>
          <p className="text-[11px] text-slate-400 pt-1">Exact amount is confirmed before payment — you can place the order safely.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Row l="Services" v={fmt((totals.base || 0) - (totals.labour_total || 0))} />
          {totals.labour_total > 0 && <Row l="Labour charge" v={fmt(totals.labour_total)} />}
          {totals.addons_total > 0 && <Row l="Add-ons" v={fmt(totals.addons_total)} />}
          {totals.emergency_fee > 0 && <Row l="Instant / Emergency fee" v={fmt(totals.emergency_fee)} />}
          {totals.visiting_charge > 0 && <Row l="Visiting charge" v={fmt(totals.visiting_charge)} />}
          {totals.convenience_fee > 0 && <Row l="Convenience fee" v={fmt(totals.convenience_fee)} />}
          {totals.platform_fee > 0 && <Row l="Platform fee" v={fmt(totals.platform_fee)} />}
          {totals.discount > 0 && <Row l="Coupon discount" v={"- " + fmt(totals.discount)} green />}
          {totals.membership_discount > 0 && <Row l={`Member discount${totals.membership_plan ? ` (${totals.membership_plan})` : ""}`} v={"- " + fmt(totals.membership_discount)} green />}
          {totals.membership_visit_waiver > 0 && <Row l="Free visiting charge (Member)" v={"- " + fmt(totals.membership_visit_waiver)} green />}
          {totals.loyalty_discount > 0 && <Row l="Loyalty points" v={"- " + fmt(totals.loyalty_discount)} green />}
          {totals.referral_discount > 0 && <Row l="Referral discount" v={"- " + fmt(totals.referral_discount)} green />}
          {totals.taxable != null && <div data-testid="checkout-taxable"><Row l="Taxable amount" v={fmt(totals.taxable)} /></div>}
          {totals.gst > 0 && <div data-testid="checkout-gst"><Row l="Est. Govt. Taxes" v={fmt(totals.gst)} /></div>}
          <div className="pt-2 mt-1 border-t border-slate-100"><Row l="Total payable" v={fmt(totals.total)} bold /></div>
          <MemberSavingsBadge totals={totals} />
        </div>
      )}
    </SectionCard>

    <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 flex items-center gap-3" data-testid="secure-badge">
      <div className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
      <div><p className="text-sm font-bold text-emerald-800">100% Secure &amp; Refundable</p><p className="text-[11px] text-emerald-700">Pay safely now · full refund on eligible cancellations</p></div>
    </div>
  </div>
);

/* ================= Desktop order sidebar ================= */
const OrderSidebar = ({ items, lineTotal, totals, displayTotal, navigate, showFull }) => (
  <div className="sticky top-40 rounded-2xl border border-slate-200 bg-white overflow-hidden">
    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
      <h3 className="font-heading font-bold text-slate-900">Your order</h3>
      <button onClick={() => navigate("/services")} className="text-xs font-semibold text-primary-700 flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Add</button>
    </div>
    <div className="p-5 space-y-3 max-h-[40vh] overflow-y-auto">
      {items.map((it) => (
        <div key={it.id} className="flex gap-3">
          <div className="h-11 w-11 rounded-lg bg-slate-100 overflow-hidden shrink-0">{it.image && <img src={it.image} alt="" className="h-full w-full object-cover" />}</div>
          <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-900 line-clamp-1">{it.name}</p><p className="text-xs text-slate-400">Qty {it.qty}</p></div>
          <span className="text-sm font-semibold text-slate-900 shrink-0">{fmt(lineTotal(it))}</span>
        </div>
      ))}
    </div>
    <div className="p-5 border-t border-slate-100 space-y-1.5">
      {!showFull ? (
        <>
          <Row l="Services subtotal" v={fmt(items.reduce((s, it) => s + lineTotal(it), 0))} bold />
          <p className="text-xs text-slate-400 pt-1">Taxes &amp; other charges are calculated at checkout.</p>
        </>
      ) : (
        <>
          {totals.ready && totals.labour_total > 0 && <Row l="Incl. labour charge" v={fmt(totals.labour_total)} />}
          {totals.ready && totals.discount > 0 && <Row l="Discount" v={"- " + fmt(totals.discount)} green />}
          {totals.ready && totals.membership_discount > 0 && <Row l="Member discount" v={"- " + fmt(totals.membership_discount)} green />}
          {totals.ready && totals.membership_visit_waiver > 0 && <Row l="Free visiting charge" v={"- " + fmt(totals.membership_visit_waiver)} green />}
          {totals.ready && totals.visiting_charge > 0 && <Row l="Visiting Charge" v={fmt(totals.visiting_charge)} />}
          {totals.ready && totals.emergency_fee > 0 && <Row l="Emergency Charge" v={fmt(totals.emergency_fee)} />}
          {totals.ready && totals.convenience_fee > 0 && <Row l="Convenience Fee" v={fmt(totals.convenience_fee)} />}
          {totals.ready && totals.platform_fee > 0 && <Row l="Platform Fee" v={fmt(totals.platform_fee)} />}
          {totals.ready && totals.taxable != null && <Row l="Taxable amount" v={fmt(totals.taxable)} />}
          {totals.ready && totals.gst > 0 && <Row l="Est. Govt. Taxes" v={fmt(totals.gst)} />}
          <div className="flex justify-between pt-2 border-t border-slate-100 font-heading font-extrabold text-lg text-slate-900"><span>Total</span><span>{fmt(displayTotal)}</span></div>
        </>
      )}
      <div className="flex items-center gap-2 text-xs text-emerald-700 pt-2"><ShieldCheck className="h-4 w-4" /> Secure &amp; refundable payment</div>
    </div>
  </div>
);
