/** Checkout — port of web_panel/src/pages/customer/Checkout.jsx (mobile): cart → schedule → your info → summary → confirm. Same APIs. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ShoppingBag, CalendarClock, User, MapPin, ShieldCheck, Trash2, Minus, Plus, Check, Zap, Wallet, CreditCard, LocateFixed, Tag } from "lucide-react-native";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, EMERALD, ROSE, AMBER } from "../../src/theme";
import { fmt } from "../../src/lib/format";
import { useAuth } from "../../src/context/AuthContext";
import { useCart, lineEstimate, toReqItem } from "../../src/context/CartContext";
import { useToast } from "../../src/components/Toast";
import { storage } from "../../src/utils/storage";
import { detectLocation } from "../../src/lib/location";
import * as Location from "expo-location";

const STEPS = [{ key: "services", label: "Services", Icon: ShoppingBag }, { key: "schedule", label: "Schedule", Icon: CalendarClock }, { key: "contact", label: "Your Info", Icon: User }, { key: "summary", label: "Summary", Icon: MapPin }, { key: "confirm", label: "Confirm", Icon: ShieldCheck }];
const emptyAddress = () => ({ label: "Home", line: "", pincode: "", city: "", state: "", property_type: "Apartment", wing: "", floor: "", flat_no: "", landmark: "", instructions: "", lat: null as number | null, lng: null as number | null, is_default: false });
const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const Row = ({ l, v, bold, color }: any) => <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}><Text style={{ fontSize: 14, color: SLATE[500] }}>{l}</Text><Text style={{ fontSize: 14, fontWeight: bold ? "800" : "600", color: color || SLATE[800] }}>{v}</Text></View>;
const Field = ({ label, value, onChange, placeholder, testID, keyboardType }: any) => (
  <View style={{ marginTop: 10 }}><Text style={{ fontSize: 12, fontWeight: "600", color: SLATE[600], marginBottom: 4 }}>{label}</Text>
    <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboardType} placeholderTextColor={SLATE[400]} style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 12, fontSize: 14, color: SLATE[900], backgroundColor: "#fff", outlineStyle: "none" } as any} /></View>
);

export default function Checkout() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user, refresh } = useAuth();
  const { items, removeItem, setQty, clear, count, estimateTotal } = useCart();
  const [step, setStep] = useState(0);
  const [schedule, setSchedule] = useState<"schedule" | "emergency">("schedule");
  const [day, setDay] = useState(dateStr(new Date()));
  const [slot, setSlot] = useState<string | null>(null);
  const [slots, setSlots] = useState<any>({ slots: [], full_slots: [] });
  const [coupon, setCoupon] = useState("");
  const [applied, setApplied] = useState("");
  const [couponMsg, setCouponMsg] = useState<any>(null);
  const [cartPricing, setCartPricing] = useState<any>(null);
  const [addr, setAddr] = useState<any>(emptyAddress());
  const [selectedId, setSelectedId] = useState("new");
  const [payMethod, setPayMethod] = useState<"online" | "wallet">("online");
  const [walletBal, setWalletBal] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<any>(null);
  const [locating, setLocating] = useState(false);
  const nonceRef = useRef<string | null>(null);
  const savedAddresses: any[] = user?.addresses || [];
  const scheduledAt = schedule === "schedule" && slot ? `${day}T${slot}:00` : null;

  useEffect(() => { storage.getItem("azo_coupon").then((c) => c && setCoupon(c)); }, []);
  useEffect(() => { if (user) api.get<any>("/wallet").then((w) => setWalletBal(w?.balance || 0)).catch(() => {}); }, [user]);
  useEffect(() => { if (savedAddresses.length && selectedId === "new" && !addr.line) { const d = savedAddresses.find((a) => a.is_default) || savedAddresses[0]; setSelectedId(d.id); setAddr({ ...emptyAddress(), ...d }); } }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.get<any>(`/bookings/slot-availability?date=${day}`, { auth: false }).then((r) => setSlots({ slots: r.slots || [], full_slots: r.full_slots || [] })).catch(() => {}); setSlot(null); }, [day]);

  useEffect(() => {
    if (!items.length) { setCartPricing(null); return; }
    let cancelled = false;
    const payload = { schedule_type: schedule, ...(applied ? { coupon_code: applied } : {}), address: addr, items: items.map(toReqItem) };
    const attempt = async (n: number) => {
      try {
        const r: any = await api.post("/bookings/cart-quote", payload, { auth: false });
        if (cancelled) return;
        setCartPricing({ ...r.pricing, cart_service_total: r.cart_service_total });
        if (applied && r.coupon_applied === false) { setApplied(""); setCouponMsg({ ok: false, text: "Coupon no longer applies to this order (minimum order not met)" }); }
      } catch { if (!cancelled && n < 4) setTimeout(() => attempt(n + 1), 600 * n); }
    };
    attempt(1);
    return () => { cancelled = true; };
  }, [items, schedule, applied, addr.pincode, addr.city]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = cartPricing || {};
  const displayTotal = cartPricing ? totals.total : estimateTotal;

  const applyCoupon = async () => {
    if (!coupon || !items.length) return;
    try {
      const d: any = await api.post("/bookings/validate-coupon", { code: coupon, items: items.map(toReqItem), schedule_type: schedule, address: addr }, { auth: false });
      setApplied(coupon); setCouponMsg({ ok: true, text: `${d.message} — applied to your order` });
    } catch (e: any) { setApplied(""); setCouponMsg({ ok: false, text: e?.message || "Invalid coupon" }); }
  };
  const useGps = async () => {
    setLocating(true);
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (!p.granted) { toast.error("Location permission denied"); return; }
      const pos = await Location.getCurrentPositionAsync({});
      const rev: any = await api.get(`/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`, { auth: false });
      setAddr((a: any) => ({ ...a, lat: pos.coords.latitude, lng: pos.coords.longitude, line: a.line || rev.address || rev.display_name || "", pincode: rev.postcode || rev.pincode || a.pincode, city: rev.city || a.city, state: rev.state || a.state }));
      toast.success("Location captured");
    } catch { toast.error("Couldn't get your location"); } finally { setLocating(false); }
  };
  const next = () => {
    if (step === 0 && !items.length) return toast.error("Add at least one service");
    if (step === 1 && schedule === "schedule" && !slot) return toast.error("Please pick a date & time slot");
    if (step === 2) {
      if (!user) { toast.info("Please sign in to continue"); router.push("/login"); return; }
      if (!addr.line || !addr.pincode) return toast.error("Please enter your service address");
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const back = () => { if (step > 0) setStep(step - 1); else if (router.canGoBack()) router.back(); else router.replace("/(site)"); };

  const placeOrder = async () => {
    if (!user) return toast.error("Please sign in first");
    setPlacing(true);
    const groups: Record<string, any[]> = {};
    for (const it of items) { const k = it.category_id || it.category_name || "uncategorised"; (groups[k] ||= []).push(it); }
    const keys = Object.keys(groups);
    if (!nonceRef.current) nonceRef.current = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const nonce = nonceRef.current;
    const cartItems = keys.flatMap((k) => groups[k].map(toReqItem));
    const created: any[] = []; let firstErr: string | null = null; let first = true;
    for (const k of keys) {
      try {
        const data: any = await api.post("/bookings/grouped", { items: groups[k].map(toReqItem), cart_items: cartItems, address: addr, schedule_type: schedule, scheduled_at: scheduledAt, coupon_code: applied || null, cart_service_total: cartPricing?.cart_service_total ?? null, apply_visiting: first, apply_emergency: first, idempotency_key: `${nonce}:grp:${k}`, group_id: nonce });
        first = false;
        created.push({ id: data.id, code: data.code || data.id, category: data.category_name || groups[k][0]?.category_name || "Services", total: data.pricing?.total ?? null });
      } catch (e: any) { firstErr = firstErr || e?.message || "Booking failed. Please check My Bookings before retrying."; }
    }
    let paidAll = created.length > 0;
    const pay = async (purpose: string, bookingId?: string, groupId?: string) => {
      const order: any = await api.post("/payments/order", { purpose, booking_id: bookingId, group_id: groupId });
      if (order.mock) { await api.post("/payments/mock", { purpose, booking_id: bookingId, group_id: groupId }); return true; }
      toast.info("Online payment gateway is not available in the app yet — pay from My Bookings"); return false;
    };
    try {
      if (created.length > 1) {
        if (payMethod === "wallet") await api.post("/bookings/pay-wallet-group", { group_id: nonce }); else paidAll = await pay("booking_group", undefined, nonce);
      } else for (const bk of created) {
        if (payMethod === "wallet") await api.post(`/bookings/${bk.id}/pay-wallet`, {}); else paidAll = await pay("booking", bk.id);
      }
    } catch { paidAll = false; }
    if (selectedId === "new" && addr.line) { try { await api.post("/auth/address", { ...addr, label: addr.label || "Home" }); } catch {} }
    await refresh();
    setPlacing(false);
    if (created.length) { nonceRef.current = null; clear(); setPlaced({ count: created.length, total: displayTotal, paid: paidAll, orders: created }); setStep(4); }
    else toast.error(firstErr || "Could not place your order");
  };

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const isToday = day === dateStr(new Date());
  const nowHM = new Date().toTimeString().slice(0, 5);
  const primaryBtn = { height: 50, borderRadius: 14, backgroundColor: PRIMARY[700], alignItems: "center" as const, justifyContent: "center" as const, flexDirection: "row" as const, gap: 6 };

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFA" }} testID="checkout-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: SLATE[200] }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable testID="checkout-back" onPress={back} style={{ height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color={SLATE[500]} /></Pressable>
          <Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>Book Services</Text>
          <Text style={{ marginLeft: "auto", fontSize: 13, color: SLATE[500] }}>Step {step + 1} of {STEPS.length}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>{STEPS.map((s, i) => <View key={s.key} testID={`step-${s.key}`} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? PRIMARY[700] : SLATE[200] }} />)}</View>
        <Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700], marginTop: 6 }}>{STEPS[step].label}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View testID="step-cart">
            {!items.length ? <View style={{ alignItems: "center", paddingVertical: 60 }}><ShoppingBag size={40} color={SLATE[300]} /><Text style={{ color: SLATE[500], marginTop: 12 }}>Your booking is empty.</Text><Pressable testID="browse-services" onPress={() => router.push("/(site)/services" as any)} style={{ ...primaryBtn, paddingHorizontal: 20, marginTop: 16 }}><Text style={{ color: "#fff", fontWeight: "700" }}>Browse services</Text></Pressable></View> : null}
            {items.map((it) => (
              <View key={it.id} testID={`cart-line-${it.service_id || it.id}`} style={{ flexDirection: "row", gap: 12, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 12, marginBottom: 12 }}>
                {it.image ? <Image source={{ uri: it.image }} style={{ height: 72, width: 72, borderRadius: 12 }} contentFit="cover" /> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: SLATE[900], fontSize: 15 }}>{it.name}</Text>
                  <Text style={{ fontSize: 12, color: SLATE[500] }}>{it.category_name}{it.tier_index != null && it.tiers?.[it.tier_index] ? ` · ${it.tiers[it.tier_index].label}` : ""}{it.addons?.length ? ` · +${it.addons.length} add-on` : ""}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: SLATE[200], height: 34 }}>
                      <Pressable testID={`cart-minus-${it.id}`} onPress={() => setQty(it.id, it.qty - 1)} style={{ paddingHorizontal: 10, height: "100%", justifyContent: "center" }}><Minus size={14} color={SLATE[500]} /></Pressable>
                      <Text style={{ width: 24, textAlign: "center", fontWeight: "700" }}>{it.qty}</Text>
                      <Pressable testID={`cart-plus-${it.id}`} onPress={() => setQty(it.id, it.qty + 1)} style={{ paddingHorizontal: 10, height: "100%", justifyContent: "center" }}><Plus size={14} color={SLATE[500]} /></Pressable>
                    </View>
                    <Text style={{ fontWeight: "800", color: SLATE[900], marginLeft: "auto" }}>{fmt(lineEstimate(it))}</Text>
                    <Pressable testID={`cart-remove-${it.id}`} onPress={() => removeItem(it.id)}><Trash2 size={18} color={ROSE[500]} /></Pressable>
                  </View>
                </View>
              </View>
            ))}
            {items.length ? <Pressable testID="add-more" onPress={() => router.push("/(site)/services" as any)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 44 }}><Plus size={16} color={PRIMARY[700]} /><Text style={{ color: PRIMARY[700], fontWeight: "600" }}>Add more services</Text></Pressable> : null}
          </View>
        ) : null}

        {step === 1 ? (
          <View testID="step-schedule">
            <View style={{ flexDirection: "row", gap: 12 }}>
              {[["schedule", "Schedule", "Pick a date & time", CalendarClock], ["emergency", "Emergency", "ASAP · extra fee applies", Zap]].map(([k, t, s, I]: any) => (
                <Pressable key={k} testID={`schedule-${k}`} onPress={() => setSchedule(k)} style={{ flex: 1, borderRadius: 16, borderWidth: 2, borderColor: schedule === k ? PRIMARY[700] : SLATE[200], backgroundColor: schedule === k ? PRIMARY[50] : "#fff", padding: 14 }}>
                  <I size={20} color={PRIMARY[700]} /><Text style={{ fontWeight: "700", color: SLATE[900], marginTop: 8 }}>{t}</Text><Text style={{ fontSize: 11, color: SLATE[500], marginTop: 2 }}>{s}</Text>
                </Pressable>
              ))}
            </View>
            {schedule === "schedule" ? (
              <>
                <Text style={{ fontWeight: "700", color: SLATE[900], marginTop: 20, marginBottom: 10 }}>Choose a date</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {days.map((d) => { const ds = dateStr(d); const on = ds === day; return (
                    <Pressable key={ds} testID={`day-${ds}`} onPress={() => setDay(ds)} style={{ width: 64, paddingVertical: 10, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: on ? PRIMARY[700] : SLATE[200], backgroundColor: on ? PRIMARY[700] : "#fff" }}>
                      <Text style={{ fontSize: 11, color: on ? "rgba(255,255,255,0.8)" : SLATE[500] }}>{d.toLocaleDateString("en-IN", { weekday: "short" })}</Text><Text style={{ fontSize: 18, fontWeight: "800", color: on ? "#fff" : SLATE[900] }}>{d.getDate()}</Text>
                    </Pressable>); })}
                </ScrollView>
                <Text style={{ fontWeight: "700", color: SLATE[900], marginTop: 20, marginBottom: 10 }}>Choose a time slot</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {slots.slots.map((t: string) => { const full = slots.full_slots.includes(t) || (isToday && t <= nowHM); const on = slot === t; return (
                    <Pressable key={t} testID={`slot-${t}`} disabled={full} onPress={() => setSlot(t)} style={{ width: "23%", paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1, borderColor: on ? PRIMARY[700] : SLATE[200], backgroundColor: on ? PRIMARY[700] : full ? SLATE[100] : "#fff", opacity: full ? 0.5 : 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: on ? "#fff" : SLATE[700] }}>{t}</Text>
                    </Pressable>); })}
                  {!slots.slots.length ? <Text style={{ color: SLATE[500] }}>No slots available for this date.</Text> : null}
                </View>
              </>
            ) : <View style={{ marginTop: 16, padding: 14, borderRadius: 14, backgroundColor: AMBER[50], borderWidth: 1, borderColor: AMBER[200] }}><Text style={{ color: AMBER[700], fontSize: 13 }}>A professional will be assigned as soon as possible. Emergency fee {totals.emergency_fee ? fmt(totals.emergency_fee) : ""} applies.</Text></View>}
          </View>
        ) : null}

        {step === 2 ? (
          <View testID="step-contact">
            {!user ? <View style={{ padding: 16, borderRadius: 16, backgroundColor: PRIMARY[50], borderWidth: 1, borderColor: PRIMARY[100], marginBottom: 12 }}><Text style={{ fontWeight: "700", color: SLATE[900] }}>Verify your mobile to continue</Text><Text style={{ fontSize: 13, color: SLATE[600], marginTop: 4 }}>Sign in with OTP — your booking stays saved.</Text><Pressable testID="checkout-login" onPress={() => router.push("/login")} style={{ ...primaryBtn, height: 44, marginTop: 12 }}><Text style={{ color: "#fff", fontWeight: "700" }}>Sign in / Sign up</Text></Pressable></View>
              : <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}><View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><User size={18} color="#fff" /></View><View><Text style={{ fontWeight: "700", color: SLATE[900] }}>{user.name}</Text><Text style={{ fontSize: 12, color: SLATE[500] }}>{user.phone}</Text></View></View>}
            {savedAddresses.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 8 }}>
                {savedAddresses.map((a) => <Pressable key={a.id} testID={`addr-${a.id}`} onPress={() => { setSelectedId(a.id); setAddr({ ...emptyAddress(), ...a }); }} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: selectedId === a.id ? PRIMARY[700] : SLATE[200], backgroundColor: selectedId === a.id ? PRIMARY[50] : "#fff", maxWidth: 200 }}><Text style={{ fontWeight: "700", color: SLATE[900] }}>{a.label || "Home"}</Text><Text numberOfLines={2} style={{ fontSize: 12, color: SLATE[500] }}>{a.line}, {a.city} {a.pincode}</Text></Pressable>)}
                <Pressable testID="addr-new" onPress={() => { setSelectedId("new"); setAddr(emptyAddress()); }} style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: selectedId === "new" ? PRIMARY[700] : SLATE[200], backgroundColor: selectedId === "new" ? PRIMARY[50] : "#fff", justifyContent: "center" }}><Text style={{ fontWeight: "700", color: PRIMARY[700] }}>+ New address</Text></Pressable>
              </ScrollView>
            ) : null}
            <Pressable testID="use-gps" onPress={useGps} style={{ flexDirection: "row", alignItems: "center", gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: PRIMARY[200], backgroundColor: "#fff", alignSelf: "flex-start" }}>{locating ? <ActivityIndicator size="small" color={PRIMARY[700]} /> : <LocateFixed size={16} color={PRIMARY[700]} />}<Text style={{ color: PRIMARY[700], fontWeight: "600" }}>Use my current location</Text></Pressable>
            <Field label="Address (house / street / area)" testID="addr-line" value={addr.line} onChange={(v: string) => setAddr({ ...addr, line: v })} placeholder="Flat 4B, Green Park Apartments, MG Road" />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}><Field label="Pincode" testID="addr-pincode" keyboardType="number-pad" value={addr.pincode} onChange={(v: string) => setAddr({ ...addr, pincode: v })} placeholder="800001" /></View>
              <View style={{ flex: 1 }}><Field label="City" testID="addr-city" value={addr.city} onChange={(v: string) => setAddr({ ...addr, city: v })} placeholder="Patna" /></View>
            </View>
            <Field label="Landmark (optional)" testID="addr-landmark" value={addr.landmark} onChange={(v: string) => setAddr({ ...addr, landmark: v })} placeholder="Near City Mall" />
            <Field label="Instructions for the professional (optional)" testID="addr-instructions" value={addr.instructions} onChange={(v: string) => setAddr({ ...addr, instructions: v })} placeholder="Ring the bell twice" />
          </View>
        ) : null}

        {step === 3 ? (
          <View testID="step-summary">
            <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 16 }}>
              <Text style={{ fontWeight: "700", color: SLATE[900], marginBottom: 6 }}>Booking details</Text>
              <Row l="Services" v={`${count} item${count > 1 ? "s" : ""}`} />
              <Row l="When" v={schedule === "emergency" ? "Emergency · ASAP" : `${day} · ${slot}`} />
              <Row l="Address" v={`${addr.line}, ${addr.city} ${addr.pincode}`.slice(0, 40)} />
            </View>
            <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 16, marginTop: 12 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Tag size={16} color={PRIMARY[700]} /><Text style={{ fontWeight: "700", color: SLATE[900] }}>Coupon</Text></View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TextInput testID="coupon-input" value={coupon} onChangeText={(v) => setCoupon(v.toUpperCase())} placeholder="Enter code" autoCapitalize="characters" placeholderTextColor={SLATE[400]} style={{ flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 12, fontSize: 14, color: SLATE[900], outlineStyle: "none" } as any} />
                <Pressable testID="coupon-apply" onPress={applyCoupon} style={{ height: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: PRIMARY[700], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Apply</Text></Pressable>
              </View>
              {couponMsg ? <Text testID="coupon-msg" style={{ fontSize: 12, marginTop: 8, color: couponMsg.ok ? EMERALD[600] : ROSE[600] }}>{couponMsg.text}</Text> : null}
            </View>
            <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 16, marginTop: 12 }}>
              <Text style={{ fontWeight: "700", color: SLATE[900] }}>Payment method</Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                {[["online", "Pay online", CreditCard, ""], ["wallet", "Wallet", Wallet, fmt(walletBal)]].map(([k, t, I, s]: any) => (
                  <Pressable key={k} testID={`pay-${k}`} onPress={() => setPayMethod(k)} style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: payMethod === k ? PRIMARY[700] : SLATE[200], backgroundColor: payMethod === k ? PRIMARY[50] : "#fff" }}><I size={18} color={PRIMARY[700]} /><Text style={{ fontWeight: "700", color: SLATE[900], marginTop: 6 }}>{t}</Text>{s ? <Text style={{ fontSize: 11, color: SLATE[500] }}>Balance {s}</Text> : null}</Pressable>
                ))}
              </View>
            </View>
            <View style={{ backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 16, marginTop: 12 }} testID="price-breakdown">
              <Text style={{ fontWeight: "700", color: SLATE[900] }}>Price details</Text>
              {cartPricing ? <>
                <Row l="Services" v={fmt(totals.base)} />
                {totals.addons_total > 0 ? <Row l="Add-ons" v={fmt(totals.addons_total)} /> : null}
                {totals.visiting_charge > 0 ? <Row l="Visiting charge" v={fmt(totals.visiting_charge)} /> : null}
                {totals.emergency_fee > 0 ? <Row l="Emergency fee" v={fmt(totals.emergency_fee)} /> : null}
                {totals.surge > 0 ? <Row l="Surge" v={fmt(totals.surge)} /> : null}
                {totals.total_discount > 0 || totals.discount > 0 ? <Row l="Discount" v={`- ${fmt(totals.total_discount || totals.discount)}`} color={EMERALD[600]} /> : null}
                {totals.gst > 0 ? <Row l={`GST (${totals.gst_pct}%)`} v={fmt(totals.gst)} /> : null}
                <View style={{ height: 1, backgroundColor: SLATE[100], marginVertical: 10 }} />
                <Row l="Total" v={fmt(totals.total)} bold />
              </> : <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}><ActivityIndicator size="small" color={PRIMARY[700]} /><Text style={{ color: SLATE[500], fontSize: 13 }}>Calculating…</Text></View>}
            </View>
          </View>
        ) : null}

        {step === 4 && placed ? (
          <View testID="step-confirm" style={{ alignItems: "center", paddingVertical: 30 }}>
            <View style={{ height: 72, width: 72, borderRadius: 36, backgroundColor: EMERALD[500], alignItems: "center", justifyContent: "center" }}><Check size={36} color="#fff" /></View>
            <Text style={{ fontSize: 24, fontWeight: "800", color: SLATE[900], marginTop: 16 }}>Booking confirmed!</Text>
            <Text style={{ color: SLATE[500], marginTop: 6, textAlign: "center" }}>{placed.count} booking{placed.count > 1 ? "s" : ""} placed{placed.paid ? " · Paid" : " · Payment pending"}</Text>
            <View style={{ width: "100%", marginTop: 20, gap: 8 }}>{placed.orders.map((o: any) => <View key={o.id} testID={`placed-${o.code}`} style={{ backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: SLATE[200], padding: 14, flexDirection: "row", justifyContent: "space-between" }}><View><Text style={{ fontWeight: "700", color: SLATE[900] }}>#{o.code}</Text><Text style={{ fontSize: 12, color: SLATE[500] }}>{o.category}</Text></View>{o.total != null ? <Text style={{ fontWeight: "800", color: SLATE[900] }}>{fmt(o.total)}</Text> : null}</View>)}</View>
            <Pressable testID="view-bookings" onPress={() => router.replace("/(customer)/orders" as any)} style={{ ...primaryBtn, width: "100%", marginTop: 20 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>View my bookings</Text></Pressable>
            <Pressable testID="back-home" onPress={() => router.replace("/(site)")} style={{ marginTop: 12, height: 44, justifyContent: "center" }}><Text style={{ color: PRIMARY[700], fontWeight: "600" }}>Back to home</Text></Pressable>
          </View>
        ) : null}
      </ScrollView>

      {step < 4 ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.97)", borderTopWidth: 1, borderTopColor: SLATE[200], padding: 16, paddingBottom: insets.bottom + 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View><Text style={{ fontSize: 11, color: SLATE[400] }}>{cartPricing ? "Total" : "Estimated total"}</Text><Text testID="checkout-total" style={{ fontSize: 20, fontWeight: "800", color: SLATE[900] }}>{fmt(displayTotal)}</Text></View>
          {step < 3 ? <Pressable testID="checkout-next" onPress={next} style={{ ...primaryBtn, flex: 1, marginLeft: "auto" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Continue</Text></Pressable>
            : <Pressable testID="place-order" disabled={placing || !cartPricing} onPress={placeOrder} style={{ ...primaryBtn, flex: 1, marginLeft: "auto", backgroundColor: EMERALD[600], opacity: placing || !cartPricing ? 0.7 : 1 }}>{placing ? <ActivityIndicator color="#fff" /> : <><ShieldCheck size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{payMethod === "wallet" ? "Pay with wallet" : "Confirm & pay"}</Text></>}</Pressable>}
        </View>
      ) : null}
    </View>
  );
}
