/** Checkout — 1:1 port of web Checkout.jsx: 6 steps, live cart-quote, coupon, guest OTP, address, payment, grouped idempotent order placement. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { ArrowLeft, ArrowRight, ShieldCheck, ShoppingBag } from "lucide-react-native";
import { api } from "../../src/api/client";
import { useAuth } from "../../src/context/AuthContext";
import { useCart, lineEstimate, toReqItem } from "../../src/context/CartContext";
import { useToast } from "../../src/components/Toast";
import { runPayment } from "../../src/lib/payments";
import { fmt } from "../../src/lib/format";
import { PRIMARY, SLATE, EMERALD } from "../../src/theme";
import { emptyAddress } from "../../src/components/customer/AddressForm";
import { STEPS, Stepper, StepServices, StepDetails, StepSchedule } from "../../src/components/site/CheckoutUi";
import { StepContact, StepSummary, StepReview, SuccessScreen } from "../../src/components/site/CheckoutSteps";

export default function Checkout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const { items, addService, removeItem, updateItem, setQty, setAddonQty, clear, count, estimateTotal, ready } = useCart();
  const scrollRef = useRef<ScrollView>(null);
  const [upsell, setUpsell] = useState<any>({ popular_addons: {}, frequently_together: [] });
  const cartServiceIds = useMemo(() => items.map((it) => it.service_id).filter(Boolean).join(","), [items]);
  useEffect(() => {
    if (!cartServiceIds) { setUpsell({ popular_addons: {}, frequently_together: [] }); return; }
    let alive = true;
    api.get(`/catalog/upsell?service_ids=${encodeURIComponent(cartServiceIds)}`, { auth: false }).then((r: any) => { if (alive) setUpsell(r || { popular_addons: {}, frequently_together: [] }); }).catch(() => {});
    return () => { alive = false; };
  }, [cartServiceIds]);

  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [schedule, setSchedule] = useState("schedule");
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [couponMsg, setCouponMsg] = useState<any>(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, any>>({});
  const [cartPricing, setCartPricing] = useState<any>(null);
  const [addr, setAddr] = useState<any>(emptyAddress());
  const [selectedId, setSelectedId] = useState("new");
  const [serviceable, setServiceable] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({ address_config: {} });
  const [placing, setPlacing] = useState(false);
  const [payMethod, setPayMethod] = useState<"online" | "wallet">("online");
  const [walletBal, setWalletBal] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [placed, setPlaced] = useState<any>(null);
  const nonceRef = useRef<string | null>(null);
  const acfg = cfg.address_config || {};

  useEffect(() => { api.get("/auth/config", { auth: false }).then(setCfg).catch(() => {}); }, []);
  useEffect(() => { if (user) api.get("/wallet").then((r: any) => setWalletBal(r?.balance || 0)).catch(() => {}); else setWalletBal(0); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const savedAddresses: any[] = user?.addresses || [];
  useEffect(() => {
    if (savedAddresses.length && selectedId === "new" && !addr.line) { const def = savedAddresses.find((a) => a.is_default) || savedAddresses[0]; setSelectedId(def.id); setAddr({ ...emptyAddress(), ...def }); }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /* live combined cart quote (debounced, retried, keeps last good pricing) */
  useEffect(() => {
    if (!items.length) { setQuotes({}); setCartPricing(null); return; }
    let cancelled = false;
    const payload = { schedule_type: schedule, ...(applied ? { coupon_code: applied } : {}), address: addr, items: items.map(toReqItem) };
    const attempt = async (n: number) => {
      try {
        const r: any = await api.post("/bookings/cart-quote", payload, { timeoutMs: 12000, auth: !!user });
        if (cancelled) return;
        const byId: Record<string, any> = {};
        (r.lines || []).forEach((ln: any, i: number) => { const it = items[i]; if (it) byId[it.id] = { line_total: ln.line_total ?? ln.line_service_total, unit_total: ln.unit_total }; });
        setQuotes(byId);
        setCartPricing({ ...r.pricing, cart_service_total: r.cart_service_total, labour_total: r.labour_total || 0, category_charges: r.category_charges || [] });
        if (applied && r.coupon_applied === false) { setApplied(""); setCouponMsg({ ok: false, text: "Coupon no longer applies to this order (minimum order not met)" }); }
      } catch { if (!cancelled && n < 4) setTimeout(() => { if (!cancelled) attempt(n + 1); }, 600 * n); }
    };
    const t = setTimeout(() => attempt(1), 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [items, schedule, applied, user?.id, addr.city, addr.pincode, addr.lat, addr.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => (cartPricing ? { ...cartPricing, ready: true } : { base: 0, addons_total: 0, emergency_fee: 0, visiting_charge: 0, convenience_fee: 0, platform_fee: 0, gst: 0, discount: 0, total: 0, ready: false }), [cartPricing]);
  const displayTotal = totals.ready && items.length ? totals.total : estimateTotal;
  const lineTotal = useCallback((it: any) => { const p = quotes[it.id]; return p && p.line_total != null ? p.line_total : lineEstimate(it); }, [quotes]);
  const go = (n: number) => { setStep(n); setMaxReached((m) => Math.max(m, n)); scrollRef.current?.scrollTo({ y: 0, animated: true }); };
  const pickAddress = (aid: string) => { setSelectedId(aid); if (aid === "new") { setAddr(emptyAddress()); setServiceable(null); } else { const a = savedAddresses.find((x) => x.id === aid); if (a) setAddr({ ...emptyAddress(), ...a }); } };

  const applyCoupon = async () => {
    if (!coupon || !items.length || couponChecking) return;
    if (!user) { toast.info("Please verify your mobile (Your Info step) to apply a coupon"); return; }
    const body = { code: coupon, items: items.map(toReqItem), schedule_type: schedule, address: addr };
    setCouponChecking(true); setCouponMsg(null);
    const attempt = async (n: number) => {
      try { const d: any = await api.post("/bookings/validate-coupon", body, { timeoutMs: 12000 }); setApplied(coupon); setCouponMsg({ ok: true, text: `${d.message} — applied to your order` }); setCouponChecking(false); }
      catch (e: any) { const noResp = !e?.status; if (noResp && n < 4) { setTimeout(() => attempt(n + 1), 600 * n); return; } setApplied(""); setCouponMsg({ ok: false, text: e?.message || (noResp ? "Network slow — please try again" : "Invalid coupon") }); setCouponChecking(false); }
    };
    attempt(1);
  };
  const clearCoupon = () => { setCoupon(""); setApplied(""); setCouponMsg(null); setCouponChecking(false); };

  const useCurrentLocation = async () => {
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) return toast.error("Location permission denied");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const d: any = await api.get(`/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`, { auth: false });
      setAddr((a: any) => ({ ...a, city: d.city || a.city, state: d.state || a.state, pincode: d.pincode || a.pincode, line: a.line || d.line || "", lat: d.lat ?? pos.coords.latitude, lng: d.lng ?? pos.coords.longitude }));
      toast.success("Location set — address auto-filled");
    } catch { toast.error("Could not detect location"); }
  };

  const needsGps = selectedId === "new" || savedAddresses.length === 0;
  const addressValid = () => !!user && !!addr.line && !!addr.pincode && !(needsGps && (!addr.lat || !addr.lng)) && !(acfg.mandatory_landmark && acfg.landmark_instructions && !addr.landmark) && !(needsGps && serviceable && serviceable.serviceable === false);
  const canNext = () => (step === 0 ? items.length > 0 : step === 2 ? schedule !== "schedule" || !!scheduledAt : step === 3 ? addressValid() : true);
  const next = () => {
    if (step === 0 && !items.length) return toast.error("Add at least one service");
    if (step === 2 && schedule === "schedule" && !scheduledAt) return toast.error("Please pick a date & time slot");
    if (step === 3) {
      if (!user) return toast.error("Please verify your mobile to continue");
      if (needsGps && (!addr.lat || !addr.lng)) return toast.error("Please set your location using \"Use my current location\"");
      if (!addr.line || !addr.pincode) return toast.error("Please enter your service address");
      if (acfg.mandatory_landmark && acfg.landmark_instructions && !addr.landmark) return toast.error("Landmark is required");
      if (needsGps && serviceable && serviceable.serviceable === false) return toast.error("Sorry, we don't service this location yet");
    }
    if (step < STEPS.length - 1) go(step + 1);
  };
  const back = () => { if (step > 0) go(step - 1); else if (router.canGoBack()) router.back(); else router.replace("/(site)" as any); };

  const postResilient = async (url: string, body: any, retries = 3, timeoutMs = 20000) => {
    let last: any;
    for (let n = 0; n <= retries; n++) {
      try { return await api.post(url, body, { timeoutMs }); }
      catch (e: any) { last = e; const retriable = !e?.status || (e.status >= 500 && e.status < 600); if (!retriable || n === retries) throw e; await new Promise((r) => setTimeout(r, 700 * (n + 1))); }
    }
    throw last;
  };

  const placeOrder = async () => {
    if (!user) return toast.error("Please verify your mobile first");
    setPlacing(true);
    const groups: Record<string, any[]> = {};
    for (const it of items) { const k = it.category_id || it.category_name || "uncategorised"; (groups[k] ||= []).push(it); }
    const keys = Object.keys(groups);
    setProgress({ done: 0, total: keys.length });
    if (!nonceRef.current) nonceRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const nonce = nonceRef.current;
    const created: any[] = []; let firstErr: string | null = null; let firstGroup = true;
    const cartItems = keys.flatMap((k) => groups[k].map(toReqItem));
    for (const k of keys) {
      try {
        const data: any = await postResilient("/bookings/grouped", { items: groups[k].map(toReqItem), cart_items: cartItems, address: addr, schedule_type: schedule, scheduled_at: scheduledAt, coupon_code: applied || null, cart_service_total: cartPricing?.cart_service_total ?? null, apply_visiting: firstGroup, apply_emergency: firstGroup, idempotency_key: `${nonce}:grp:${k}`, order_group_id: nonce });
        firstGroup = false;
        created.push({ id: data.id, code: data.code || data.id, category: data.category_name || groups[k][0]?.category_name || "Services", total: data.pricing?.total ?? null });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (e: any) { firstErr = firstErr || e?.message || "Booking failed. Please check My Bookings before retrying."; }
    }
    let paidAll = created.length > 0;
    if (created.length > 1) {
      try {
        if (payMethod === "wallet") { try { await postResilient("/bookings/pay-wallet-group", { group_id: nonce }, 2); } catch { for (const bk of created) { try { await postResilient(`/bookings/${bk.id}/pay-wallet`, {}, 2, 15000); } catch { paidAll = false; } } } }
        else if (!(await runPayment({ purpose: "booking_group", groupId: nonce }, toast))) paidAll = false;
      } catch { paidAll = false; }
    } else {
      for (const bk of created) {
        try { if (payMethod === "wallet") await postResilient(`/bookings/${bk.id}/pay-wallet`, {}, 3, 15000); else if (!(await runPayment({ purpose: "booking", bookingId: bk.id }, toast))) paidAll = false; }
        catch { paidAll = false; }
      }
    }
    if (selectedId === "new" && addr.line) { try { await api.post("/auth/address", { ...addr, label: addr.label || "Home" }); } catch {} }
    await refresh();
    setPlacing(false);
    if (created.length) { nonceRef.current = null; clear(); setPlaced({ count: created.length, total: displayTotal, paid: paidAll, orders: created }); }
    else toast.error(firstErr || "Could not place your order");
  };

  if (placed) return <View style={{ flex: 1, backgroundColor: "#FAFAFA", paddingTop: insets.top }}><SuccessScreen placed={placed} onBookings={() => router.replace("/(customer)/orders" as any)} onMore={() => router.replace("/(site)/services" as any)} /></View>;
  if (ready && !items.length && step === 0) return (
    <View testID="cart-empty" style={{ flex: 1, backgroundColor: "#FAFAFA", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View style={{ height: 80, width: 80, borderRadius: 16, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center", marginBottom: 20 }}><ShoppingBag size={40} color={PRIMARY[700]} /></View>
      <Text style={{ fontSize: 22, fontWeight: "700", color: SLATE[900] }}>Your booking is empty</Text>
      <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 8, textAlign: "center", maxWidth: 320 }}>Add one or more services to get started. You can book multiple services in a single order.</Text>
      <Pressable testID="browse-services" onPress={() => router.replace("/(site)/services" as any)} style={{ marginTop: 24, height: 48, paddingHorizontal: 32, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 6 }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Browse services</Text><ArrowRight size={16} color="#fff" /></Pressable>
      <Pressable testID="checkout-back" onPress={back} style={{ marginTop: 16 }}><Text style={{ color: SLATE[500], fontWeight: "600" }}>← Back</Text></Pressable>
    </View>
  );

  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFA" }} testID="checkout-page">
      <View style={{ paddingTop: insets.top + 8, backgroundColor: "rgba(255,255,255,0.95)", borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.7)" }}>
        <View style={{ height: 56, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable testID="checkout-back" onPress={back} style={{ height: 36, width: 36, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} color={SLATE[500]} /></Pressable>
          <View><Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>Book your services</Text><Text testID="checkout-count" style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{count} item{count > 1 ? "s" : ""} in your order</Text></View>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: SLATE[100], paddingVertical: 12, paddingHorizontal: 16 }}><Stepper step={step} /></View>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? <StepServices items={items} removeItem={removeItem} setQty={setQty} lineTotal={lineTotal} together={upsell.frequently_together} addService={addService} /> : null}
        {step === 1 ? <StepDetails items={items} updateItem={updateItem} setAddonQty={setAddonQty} popularAddons={upsell.popular_addons} lineTotal={lineTotal} /> : null}
        {step === 2 ? <StepSchedule schedule={schedule} setSchedule={setSchedule} scheduledAt={scheduledAt} setScheduledAt={setScheduledAt} /> : null}
        {step === 3 ? <StepContact user={user} refresh={refresh} savedAddresses={savedAddresses} selectedId={selectedId} pickAddress={pickAddress} addr={addr} setAddr={setAddr} acfg={acfg} setServiceable={setServiceable} useCurrentLocation={useCurrentLocation} /> : null}
        {step === 4 ? <StepSummary items={items} totals={totals} lineTotal={lineTotal} estimateTotal={estimateTotal} coupon={coupon} setCoupon={setCoupon} applyCoupon={applyCoupon} applied={applied} clearCoupon={clearCoupon} couponMsg={couponMsg} setCouponMsg={setCouponMsg} couponChecking={couponChecking} /> : null}
        {step === 5 ? <StepReview items={items} totals={totals} lineTotal={lineTotal} schedule={schedule} scheduledAt={scheduledAt} addr={addr} user={user} go={go} displayTotal={displayTotal} payMethod={payMethod} setPayMethod={setPayMethod} walletBal={walletBal} /> : null}
        {maxReached > step ? <Pressable testID="checkout-jump-forward" onPress={() => go(maxReached)} style={{ marginTop: 16, alignSelf: "center" }}><Text style={{ fontSize: 13, fontWeight: "600", color: PRIMARY[700] }}>Jump back to {STEPS[maxReached].label} →</Text></Pressable> : null}
      </ScrollView>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.97)", borderTopWidth: 1, borderTopColor: SLATE[200], paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 11, color: SLATE[400], fontWeight: "500" }}>{step >= 4 ? "Total payable" : "Services subtotal · taxes at checkout"}</Text><Text testID="checkout-bar-total" numberOfLines={1} style={{ fontSize: 20, fontWeight: "800", color: SLATE[900] }}>{fmt(step >= 4 ? displayTotal : subtotal)}</Text></View>
        {step < STEPS.length - 1 ? (
          <Pressable testID="checkout-next" onPress={next} disabled={!canNext()} style={({ pressed }) => ({ height: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 6, opacity: canNext() ? 1 : 0.5 })}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>{step === 4 ? "Review order" : "Continue"}</Text><ArrowRight size={16} color="#fff" /></Pressable>
        ) : (
          <Pressable testID="place-order" onPress={placeOrder} disabled={placing} style={({ pressed }) => ({ height: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: pressed ? EMERALD[700] : EMERALD[600], flexDirection: "row", alignItems: "center", gap: 6, opacity: placing ? 0.7 : 1 })}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>{placing ? `Placing ${progress.done}/${progress.total}…` : "Confirm & Place Order"}</Text><ShieldCheck size={16} color="#fff" /></Pressable>
        )}
      </View>
    </View>
  );
}
