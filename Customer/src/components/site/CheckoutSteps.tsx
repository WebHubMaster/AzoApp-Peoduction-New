import { TC } from "@/src/theme";
/** Checkout Steps 4–6 + success screen — port of web Checkout.jsx (StepContact / StepSummary / StepReview). */
import React from "react";
import { View, Text, Pressable, TextInput, Platform } from "react-native";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import { MapPin, Plus, LocateFixed, ShoppingBag, Tag, Layers, CalendarClock, User, Zap, Wallet, CreditCard, ShieldCheck, PartyPopper, ArrowRight } from "lucide-react-native";
import { fmt } from "../../lib/format";
import { PRIMARY, SLATE, EMERALD } from "../../theme";
import { AddressForm } from "../customer/AddressForm";
import { OtpInline } from "./OtpInline";
import { H2, Lbl, SectionCard, Row, PriceRows, addonLabel, card, SubscriptionHeader } from "./CheckoutUi";

const OsmMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.008}%2C${lat - 0.008}%2C${lng + 0.008}%2C${lat + 0.008}&layer=mapnik&marker=${lat}%2C${lng}`;
  const box = { height: 176, borderRadius: 6, borderWidth: 1, borderColor: TC.border, overflow: "hidden" as const };
  if (Platform.OS === "web") return <View style={box}>{React.createElement("iframe", { title: "saved-map", src, style: { width: "100%", height: "100%", border: 0 } })}</View>;
  return <View style={box}><WebView source={{ uri: src }} style={{ flex: 1 }} /></View>;
};

/* ================= STEP 4 ================= */
export function StepContact({ user, refresh, savedAddresses, selectedId, pickAddress, addr, setAddr, acfg, setServiceable, useCurrentLocation }: any) {
  if (!user) return (
    <View style={{ gap: 16 }}>
      <H2 t="Verify your mobile" s="We'll send an OTP to confirm your number and save your bookings." />
      <View style={{ ...card, padding: 20 }}><OtpInline onSuccess={() => refresh()} /></View>
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      <H2 t="Your details & address" s="Where should our professional reach you?" />
      <View testID="contact-user" style={{ ...card, padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: PRIMARY[100], alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "700", color: TC.primaryText }}>{(user.name || "U")[0]}</Text></View>
        <View><Text style={{ fontSize: 15, fontWeight: "600", color: TC.text }}>{user.name}</Text><Text style={{ fontSize: 12, color: TC.textMuted }}>{user.phone}</Text></View>
      </View>
      {savedAddresses.length > 0 ? (
        <View>
          <Lbl>Saved addresses</Lbl>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {savedAddresses.map((a: any) => { const on = selectedId === a.id; return (
              <Pressable key={a.id} testID={`saved-addr-${a.id}`} onPress={() => pickAddress(a.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: on ? PRIMARY[700] : TC.border, backgroundColor: on ? PRIMARY[50] : TC.surface, maxWidth: 200 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ fontSize: 14, fontWeight: "600", color: on ? PRIMARY[700] : TC.text2 }}>{a.label} {a.is_default ? "★" : ""}</Text>{a.lat && a.lng ? <View testID={`addr-pinned-${a.id}`} style={{ flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}><MapPin size={10} color={EMERALD[600]} /><Text style={{ fontSize: 10, fontWeight: "700", color: EMERALD[600] }}>Pinned</Text></View> : null}</View>
                <Text numberOfLines={1} style={{ fontSize: 12, color: TC.textFaint, maxWidth: 160 }}>{a.line}</Text>
              </Pressable>); })}
            <Pressable testID="saved-addr-new" onPress={() => pickAddress("new")} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: selectedId === "new" ? PRIMARY[700] : TC.border, backgroundColor: selectedId === "new" ? PRIMARY[50] : TC.surface, flexDirection: "row", alignItems: "center", gap: 4 }}><Plus size={16} color={selectedId === "new" ? PRIMARY[700] : TC.textMuted} /><Text style={{ fontSize: 14, fontWeight: "500", color: selectedId === "new" ? PRIMARY[700] : TC.textMuted }}>New address</Text></Pressable>
          </View>
        </View>
      ) : null}
      {selectedId !== "new" && savedAddresses.length > 0 && addr.lat && addr.lng ? (
        <View testID="saved-addr-map" style={{ ...card, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Lbl>Service location</Lbl><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MapPin size={12} color={EMERALD[600]} /><Text style={{ fontSize: 11, fontWeight: "600", color: EMERALD[600] }}>Pinned</Text></View></View>
          <OsmMap lat={Number(addr.lat)} lng={Number(addr.lng)} />
          <Text style={{ fontSize: 14, color: TC.textMuted, marginTop: 8 }}>{[addr.line, addr.city, addr.pincode].filter(Boolean).join(", ")}</Text>
        </View>
      ) : null}
      {selectedId === "new" || savedAddresses.length === 0 ? (
        <View style={{ ...card, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}><Lbl>Service address</Lbl><Pressable testID="use-location" onPress={useCurrentLocation} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 }}><LocateFixed size={14} color={TC.primaryText} /><Text style={{ fontSize: 12, fontWeight: "600", color: TC.primaryText }}>Use current location</Text></Pressable></View>
          <AddressForm value={addr} onChange={setAddr} cfg={acfg} onServiceability={setServiceable} />
        </View>
      ) : null}
    </View>
  );
}

/* ================= STEP 5 ================= */
export function StepSummary({ items, totals, lineTotal, estimateTotal, coupon, setCoupon, applyCoupon, applied, clearCoupon, couponMsg, setCouponMsg, couponChecking, isSub }: any) {
  return (
    <View style={{ gap: 16 }}>
      <H2 t="Order summary" s={isSub ? "Review your plan before you continue." : "Review pricing and apply a coupon before you continue."} />
      <SectionCard title={isSub ? "Your plan" : "Services"} icon={ShoppingBag} testID="summary-services">
        <View style={{ gap: 12 }}>{items.map((it: any) => <View key={it.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}><View style={{ flex: 1, minWidth: 0 }}>{isSub ? <SubscriptionHeader it={it} /> : <><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: TC.text }}>{it.name}</Text><Text style={{ fontSize: 12, color: TC.textFaint }}>{it.tier_index != null && it.tiers?.[it.tier_index] ? `${it.tiers[it.tier_index].label} · ` : ""}Qty {it.qty}{(it.addons || []).length ? ` · +${it.addons.length} add-on` : ""}</Text></>}</View><Text style={{ fontSize: 14, fontWeight: "600", color: TC.text }}>{fmt(lineTotal(it))}</Text></View>)}</View>
      </SectionCard>
      {!isSub ? (
      <SectionCard title="Have a coupon?" icon={Tag} testID="summary-coupon">
        <View style={{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: 6, borderWidth: 1, borderColor: TC.border, paddingHorizontal: 12, gap: 8 }}>
          <Tag size={16} color={TC.textFaint} /><TextInput testID="coupon-input" value={coupon} onChangeText={(v) => { setCoupon(v.toUpperCase()); setCouponMsg(null); }} placeholder="Try AZO50" placeholderTextColor={TC.textFaint} autoCapitalize="characters" style={{ flex: 1, fontSize: 14, color: TC.text, outlineStyle: "none" } as any} />
          {applied ? <Pressable testID="coupon-clear" onPress={clearCoupon}><Text style={{ fontSize: 12, fontWeight: "600", color: "#EF4444" }}>REMOVE</Text></Pressable>
            : <Pressable testID="coupon-apply" onPress={applyCoupon} disabled={!coupon || couponChecking} style={{ opacity: !coupon || couponChecking ? 0.4 : 1 }}><Text style={{ fontSize: 12, fontWeight: "600", color: TC.primaryText }}>{couponChecking ? "CHECKING…" : "APPLY"}</Text></Pressable>}
        </View>
        {couponMsg ? <Text testID="coupon-msg" style={{ fontSize: 12, marginTop: 8, color: couponMsg.ok ? EMERALD[600] : "#EF4444" }}>{couponMsg.text}</Text> : null}
      </SectionCard>
      ) : null}
      {totals.ready && (totals.category_charges || []).length > 1 ? (
        <SectionCard title="Category-wise charges" icon={Layers} testID="category-charges-table">
          <View style={{ flexDirection: "row", paddingBottom: 4 }}>{["Category", "Service", "Visiting", "Emerg.", "Total"].map((h, i) => <Text key={h} style={{ flex: i === 0 ? 1.6 : 1, fontSize: 11, color: TC.textFaint, textAlign: i === 0 ? "left" : "right" }}>{h}</Text>)}</View>
          {(totals.category_charges || []).map((c: any) => <View key={c.category_id || c.category_name} style={{ flexDirection: "row", paddingVertical: 6, borderTopWidth: 1, borderTopColor: TC.borderSoft }}><Text numberOfLines={1} style={{ flex: 1.6, fontSize: 12, fontWeight: "500", color: TC.text2 }}>{c.category_name}</Text><Text style={{ flex: 1, fontSize: 12, color: TC.textMuted, textAlign: "right" }}>{fmt(c.service_total)}</Text><Text style={{ flex: 1, fontSize: 12, color: TC.textMuted, textAlign: "right" }}>{fmt(c.visiting_charge)}</Text><Text style={{ flex: 1, fontSize: 12, color: TC.textMuted, textAlign: "right" }}>{fmt(c.emergency_charge)}</Text><Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: TC.text, textAlign: "right" }}>{fmt(c.category_total)}</Text></View>)}
          <Text style={{ fontSize: 11, color: TC.textFaint, marginTop: 8 }}>Each category is booked separately and paid to its own partner. Visiting & emergency charges apply per category.</Text>
        </SectionCard>
      ) : null}
      <SectionCard title="Price details" icon={MapPin} testID="summary-price"><PriceRows totals={totals} items={items} lineTotal={lineTotal} estimate={estimateTotal} /></SectionCard>
    </View>
  );
}

/* ================= STEP 6 ================= */
export const scheduleLabel = (schedule: string, scheduledAt: string | null) => {
  if (schedule === "emergency") return "Quick Services · ASAP";
  if (!scheduledAt) return "Not set";
  const d = new Date(scheduledAt); const t = scheduledAt.split("T")[1]; const [h, m] = (t || "10:00").split(":").map(Number);
  return `${d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

function PayOpt({ k, Icon, title, sub, disabled, tone, testID, payMethod, setPayMethod }: any) { const on = payMethod === k; const col = tone === "green" ? EMERALD[600] : PRIMARY[600]; return (
    <Pressable testID={testID} disabled={disabled} onPress={() => !disabled && setPayMethod(k)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 6, borderWidth: 2, borderColor: on ? col : TC.border, backgroundColor: on ? (tone === "green" ? EMERALD[50] : PRIMARY[50]) : TC.surface, paddingHorizontal: 16, paddingVertical: 12, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ height: 36, width: 36, borderRadius: 6, backgroundColor: on ? col : TC.surfaceAlt, alignItems: "center", justifyContent: "center" }}><Icon size={20} color={on ? "#fff" : TC.textMuted} /></View>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "600", color: TC.text }}>{title}</Text><Text style={{ fontSize: 12, color: TC.textMuted }}>{sub}</Text></View>
      <View style={{ height: 16, width: 16, borderRadius: 6, borderWidth: 2, borderColor: on ? col : TC.border, backgroundColor: on ? col : "transparent" }} />
    </Pressable>); }

export function StepReview({ items, totals, lineTotal, schedule, scheduledAt, addr, user, go, displayTotal, payMethod, setPayMethod, walletBal, isSub }: any) {
  const canWallet = walletBal >= displayTotal && displayTotal > 0;
  return (
    <View style={{ gap: 16 }}>
      <H2 t="Review & confirm" s="Please verify everything before placing your order." />
      <SectionCard title={isSub ? "Your plan" : `Services (${items.length})`} icon={ShoppingBag} onEdit={() => go(0)} testID="review-services">
        <View style={{ gap: 12 }}>{items.map((it: any) => <View key={it.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}><View style={{ height: 48, width: 48, borderRadius: 6, backgroundColor: TC.surfaceAlt, overflow: "hidden" }}>{it.image ? <Image source={{ uri: it.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}</View><View style={{ flex: 1, minWidth: 0 }}>{isSub ? <SubscriptionHeader it={it} /> : <><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: TC.text }}>{it.name}</Text><Text numberOfLines={1} style={{ fontSize: 12, color: TC.textFaint }}>{it.tier_index != null && it.tiers?.[it.tier_index] ? `${it.tiers[it.tier_index].label} · ` : ""}Qty {it.qty}{(it.addons || []).length ? ` · ${addonLabel(it)}` : ""}</Text></>}</View><Text style={{ fontSize: 14, fontWeight: "600", color: TC.text }}>{fmt(lineTotal(it))}</Text></View>)}</View>
      </SectionCard>
      <SectionCard title="Schedule" icon={CalendarClock} onEdit={() => go(isSub ? 1 : 2)} testID="review-schedule"><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{schedule === "emergency" ? <Zap size={16} color="#F59E0B" /> : <CalendarClock size={16} color={TC.primaryText} />}<Text style={{ fontSize: 14, fontWeight: "500", color: TC.text2 }}>{scheduleLabel(schedule, scheduledAt)}</Text></View></SectionCard>
      <SectionCard title="Contact" icon={User} onEdit={() => go(isSub ? 2 : 3)} testID="review-contact"><Text style={{ fontSize: 14, fontWeight: "600", color: TC.text }}>{user?.name}</Text><Text style={{ fontSize: 12, color: TC.textMuted }}>{user?.phone}</Text></SectionCard>
      <SectionCard title="Service address" icon={MapPin} onEdit={() => go(isSub ? 2 : 3)} testID="review-address"><Text style={{ fontSize: 14, color: TC.text2 }}><Text style={{ fontWeight: "600" }}>{addr.label}</Text> · {addr.line}</Text><Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 2 }}>{[addr.city, addr.pincode].filter(Boolean).join(" - ")}{addr.landmark ? ` · Near ${addr.landmark}` : ""}</Text></SectionCard>
      <SectionCard title="Payment method" icon={Wallet} testID="pay-method">
        <View style={{ gap: 10 }}>
          <PayOpt k="online" Icon={CreditCard} title="Pay Online" sub="UPI · Card · Netbanking" testID="pay-online" payMethod={payMethod} setPayMethod={setPayMethod} />
          <PayOpt k="wallet" Icon={Wallet} title="Pay with Wallet" sub={`Balance ${fmt(walletBal)}${!canWallet ? " · insufficient for this order" : ""}`} disabled={!canWallet} tone="green" testID="pay-wallet" payMethod={payMethod} setPayMethod={setPayMethod} />
          {walletBal <= 0 ? <Text style={{ fontSize: 11, color: TC.textFaint }}>New here? Wallet unlocks once you have balance (e.g. from a refund). For now, pay online.</Text> : null}
        </View>
      </SectionCard>
      <SectionCard title="Payment summary" icon={ShieldCheck} onEdit={() => go(isSub ? 3 : 4)} testID="review-price"><PriceRows totals={totals} items={items} lineTotal={lineTotal} estimate={displayTotal} review /></SectionCard>
      <View testID="secure-badge" style={{ borderRadius: 6, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}><View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: EMERALD[600], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={20} color="#fff" /></View><View><Text style={{ fontSize: 14, fontWeight: "700", color: "#065F46" }}>100% Secure & Refundable</Text><Text style={{ fontSize: 11, color: EMERALD[700] }}>Pay safely now · full refund on eligible cancellations</Text></View></View>
    </View>
  );
}

export function SuccessScreen({ placed, onBookings, onMore }: { placed: any; onBookings: () => void; onMore: () => void }) {
  const orders: any[] = placed.orders || [];
  return (
    <View testID="order-success" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View style={{ height: 80, width: 80, borderRadius: 40, backgroundColor: EMERALD[500], alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0px 10px 30px rgba(16,185,129,0.3)" } as any}><PartyPopper size={40} color="#fff" /></View>
      <Text style={{ fontSize: 26, fontWeight: "900", color: TC.text }}>{placed.subscription ? "Booking confirmed!" : "Order placed!"}</Text>
      <Text testID="order-success-msg" style={{ fontSize: 14, color: TC.textMuted, marginTop: 8, textAlign: "center", maxWidth: 360 }}>{placed.subscription ? `Your subscription is confirmed & paid · ${fmt(placed.total)}. We're alerting verified professionals near you to accept it.` : placed.paid ? `${placed.count} booking${placed.count > 1 ? "s" : ""} confirmed & paid · ${fmt(placed.total)}. We're finding the best professionals near you.` : `${placed.count} booking${placed.count > 1 ? "s" : ""} created · complete the payment from My Bookings to confirm.`}</Text>
      {orders.length > 1 ? (
        <View testID="order-group-summary" style={{ marginTop: 24, width: "100%", maxWidth: 420 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 }}><Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.textFaint }}>Order group · {orders.length} invoices</Text><Text style={{ fontSize: 11, color: TC.textFaint }}>one per category</Text></View>
          <View style={{ ...card, overflow: "hidden" }}>
            {orders.map((o, i) => <View key={o.id || i} testID={`order-group-row-${i}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: TC.borderSoft }}><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: TC.text }}>{o.category}</Text><Text style={{ fontSize: 11, color: TC.textFaint, fontFamily: "monospace" }}>#{o.code}</Text></View><Text style={{ fontSize: 14, fontWeight: "700", color: TC.text }}>{o.total != null ? fmt(o.total) : "—"}</Text></View>)}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: TC.bg }}><Text style={{ fontSize: 14, fontWeight: "700", color: TC.text }}>Combined total</Text><Text testID="order-group-grand-total" style={{ fontSize: 16, fontWeight: "900", color: TC.primaryText }}>{fmt(orders.every((o) => o.total != null) ? orders.reduce((s, o) => s + (o.total || 0), 0) : placed.total)}</Text></View>
          </View>
        </View>
      ) : null}
      <Pressable testID="go-bookings" onPress={onBookings} style={({ pressed }) => ({ marginTop: 24, height: 48, paddingHorizontal: 32, borderRadius: 6, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 6 })}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>{placed.subscription ? "View my subscriptions" : "View my bookings"}</Text><ArrowRight size={16} color="#fff" /></Pressable>
      <Pressable testID="book-more" onPress={onMore} style={{ marginTop: 12 }}><Text style={{ fontSize: 14, fontWeight: "600", color: TC.textMuted }}>Book more services</Text></Pressable>
    </View>
  );
}
