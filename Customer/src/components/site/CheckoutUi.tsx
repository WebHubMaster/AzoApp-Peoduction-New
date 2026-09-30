import { TC } from "@/src/theme";
/** Checkout UI — port of web Checkout.jsx (Stepper, Qty, SectionCard, Row, price rows, Steps 1–3). */
import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ShoppingBag, Tag, CalendarClock, User, MapPin, ShieldCheck, Plus, Minus, Trash2, Check, Pencil, PartyPopper, Star, Clock, Zap } from "lucide-react-native";
import { fmt } from "../../lib/format";
import { lineEstimate } from "../../context/CartContext";
import { useToast } from "../Toast";
import { PRIMARY, SLATE, AMBER, EMERALD } from "../../theme";
import { SchedulePicker } from "../customer/SchedulePicker";

export const STEPS = [
  { key: "services", label: "Services", icon: ShoppingBag }, { key: "details", label: "Details", icon: Tag }, { key: "schedule", label: "Schedule", icon: CalendarClock },
  { key: "contact", label: "Your Info", icon: User }, { key: "summary", label: "Summary", icon: MapPin }, { key: "confirm", label: "Confirm", icon: ShieldCheck },
];

const DOW_LONG = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const subPlanLine = (it: any) => {
  if (!it) return "";
  const parts = [`${it.plan_label || it.plan_type} plan`];
  if (it.working_days) parts.push(`${it.working_days} working days`);
  if (it.duration_days) parts.push(`${it.duration_days}-day period`);
  if ((it.weekly_offs || []).length) parts.push(`${(it.weekly_offs || []).map((d: number) => DOW_LONG[d]).join(", ")} off`);
  return parts.join(" · ");
};
export const SubscriptionHeader = ({ it }: { it: any }) => (
  <View testID="sub-recurring-header">
    <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <CalendarClock size={12} color={EMERALD[700]} /><Text style={{ fontSize: 11, fontWeight: "700", color: EMERALD[700] }}>Recurring Subscription</Text>
    </View>
    <Text style={{ fontSize: 16, fontWeight: "700", color: TC.text, marginTop: 6 }}>{it.name}</Text>
    <Text style={{ fontSize: 13, color: TC.textMuted, marginTop: 2 }}>{subPlanLine(it)}</Text>
  </View>
);
export const card = { borderRadius: 16, borderWidth: 1, get borderColor() { return TC.border; }, get backgroundColor() { return TC.surface; } };
export const H2 = ({ t, s }: { t: string; s: string }) => <View><Text style={{ fontSize: 20, fontWeight: "700", color: TC.text }}>{t}</Text><Text style={{ fontSize: 14, color: TC.textMuted, marginTop: 2 }}>{s}</Text></View>;
export const Lbl = ({ children }: { children: React.ReactNode }) => <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.textFaint, marginBottom: 8 }}>{children}</Text>;

export const Stepper = ({ step, steps = STEPS }: { step: number; steps?: any[] }) => (
  <View testID="checkout-stepper">
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}><Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.primaryText }}>Step {step + 1} of {steps.length}</Text><Text testID="checkout-step-label" style={{ fontSize: 12, fontWeight: "600", color: TC.textMuted }}>{steps[step]?.label}</Text></View>
    <View style={{ height: 6, borderRadius: 3, backgroundColor: TC.border, overflow: "hidden" }}><View style={{ height: "100%", width: `${((step + 1) / steps.length) * 100}%`, backgroundColor: PRIMARY[700], borderRadius: 3 }} /></View>
  </View>
);

export const Qty = ({ value, onChange, size = "md", testID }: { value: number; onChange: (v: number) => void; size?: "sm" | "md"; testID?: string }) => (
  <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface, height: size === "sm" ? 32 : 40 }}>
    <Pressable testID={testID ? `${testID}-minus` : undefined} onPress={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} style={{ paddingHorizontal: 10, height: "100%", justifyContent: "center", opacity: value <= 1 ? 0.3 : 1 }}><Minus size={14} color={TC.textMuted} /></Pressable>
    <Text testID={testID ? `${testID}-value` : undefined} style={{ width: 28, textAlign: "center", fontSize: 14, fontWeight: "700", color: TC.text }}>{value}</Text>
    <Pressable testID={testID ? `${testID}-plus` : undefined} onPress={() => onChange(value + 1)} style={{ paddingHorizontal: 10, height: "100%", justifyContent: "center" }}><Plus size={14} color={TC.textMuted} /></Pressable>
  </View>
);

export const SectionCard = ({ title, icon: Icon, onEdit, children, testID }: { title: string; icon?: any; onEdit?: () => void; children: React.ReactNode; testID?: string }) => (
  <View testID={testID} style={{ ...card, overflow: "hidden" }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: TC.borderSoft, backgroundColor: TC.bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>{Icon ? <Icon size={16} color={TC.primaryText} /> : null}<Text style={{ fontSize: 15, fontWeight: "700", color: TC.text }}>{title}</Text></View>
      {onEdit ? <Pressable testID={testID ? `${testID}-edit` : undefined} onPress={onEdit} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Pencil size={14} color={TC.primaryText} /><Text style={{ fontSize: 12, fontWeight: "600", color: TC.primaryText }}>Edit</Text></Pressable> : null}
    </View>
    <View style={{ padding: 16 }}>{children}</View>
  </View>
);

export const Row = ({ l, v, green, bold, testID }: { l: string; v: string; green?: boolean; bold?: boolean; testID?: string }) => (
  <View testID={testID} style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}><Text style={{ fontSize: 14, color: bold ? SLATE[900] : TC.textMuted, fontWeight: bold ? "600" : "400", flex: 1 }}>{l}</Text><Text style={{ fontSize: 14, color: green ? EMERALD[600] : bold ? SLATE[900] : TC.text2, fontWeight: green ? "500" : bold ? "700" : "400" }}>{v}</Text></View>
);

export const MemberSavingsBadge = ({ totals }: { totals: any }) => {
  const saved = (Number(totals?.membership_discount) || 0) + (Number(totals?.membership_visit_waiver) || 0);
  if (!(saved > 0)) return null;
  return <View testID="member-savings-badge" style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], paddingHorizontal: 12, paddingVertical: 8 }}><PartyPopper size={18} color={EMERALD[600]} /><Text style={{ fontSize: 13, fontWeight: "700", color: EMERALD[700], flex: 1 }}>You saved {fmt(saved)} as a member{totals?.membership_plan ? ` · ${totals.membership_plan}` : ""}</Text></View>;
};

/* Price details rows — identical list in Summary + Review */
export const PriceRows = ({ totals, items, lineTotal, estimate, review }: { totals: any; items: any[]; lineTotal: (it: any) => number; estimate: number; review?: boolean }) => !totals.ready ? (
  <View testID={review ? "review-estimating" : "price-estimating"} style={{ gap: 6 }}>
    <Row l="Services" v={fmt(items.reduce((s, it) => s + lineTotal(it), 0))} />
    <Text style={{ fontSize: 12, color: TC.textFaint, paddingVertical: 4 }}>Finalising taxes & fees…</Text>
    <View style={{ paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: TC.borderSoft }}><Row l="Estimated total" v={fmt(estimate)} bold /></View>
    <Text style={{ fontSize: 11, color: TC.textFaint, paddingTop: 4 }}>{review ? "Exact amount is confirmed before payment — you can place the order safely." : "Final amount is confirmed in a moment — you can still continue."}</Text>
  </View>
) : (
  <View style={{ gap: 6 }}>
    <Row l="Services" v={fmt((totals.base || 0) - (totals.labour_total || 0))} />
    {totals.labour_total > 0 ? <Row l="Labour charge" v={fmt(totals.labour_total)} /> : null}
    {totals.addons_total > 0 ? <Row l="Add-ons" v={fmt(totals.addons_total)} /> : null}
    {totals.emergency_fee > 0 ? <Row l="Quick Services fee" v={fmt(totals.emergency_fee)} /> : null}
    {totals.visiting_charge > 0 ? <Row l="Visiting charge" v={fmt(totals.visiting_charge)} /> : null}
    {totals.convenience_fee > 0 ? <Row l="Convenience fee" v={fmt(totals.convenience_fee)} /> : null}
    {totals.platform_fee > 0 ? <Row l="Platform fee" v={fmt(totals.platform_fee)} /> : null}
    {totals.discount > 0 ? <Row l="Coupon discount" v={"- " + fmt(totals.discount)} green /> : null}
    {totals.membership_discount > 0 ? <Row l={`Member discount${totals.membership_plan ? ` (${totals.membership_plan})` : ""}`} v={"- " + fmt(totals.membership_discount)} green /> : null}
    {totals.membership_visit_waiver > 0 ? <Row l="Free visiting charge (Member)" v={"- " + fmt(totals.membership_visit_waiver)} green /> : null}
    {totals.loyalty_discount > 0 ? <Row l="Loyalty points" v={"- " + fmt(totals.loyalty_discount)} green /> : null}
    {totals.referral_discount > 0 ? <Row l="Referral discount" v={"- " + fmt(totals.referral_discount)} green /> : null}
    {totals.taxable != null ? <Row testID="checkout-taxable" l="Taxable amount" v={fmt(totals.taxable)} /> : null}
    {totals.gst > 0 ? <Row testID="checkout-gst" l="Est. Govt. Taxes" v={fmt(totals.gst)} /> : null}
    <View style={{ paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: TC.borderSoft }}><Row testID="checkout-total" l="Total payable" v={fmt(totals.total)} bold /></View>
    <MemberSavingsBadge totals={totals} />
  </View>
);

const Thumb = ({ uri, size }: { uri?: string; size: number }) => <View style={{ height: size, width: size, borderRadius: 12, backgroundColor: TC.surfaceAlt, overflow: "hidden" }}>{uri ? <Image source={{ uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}</View>;
export const addonLabel = (it: any) => (it.addons || []).map((n: string) => `${n}${((it.addonQty || {})[n] || 1) > 1 ? ` ×${(it.addonQty || {})[n]}` : ""}`).join(", ");

/* ================= STEP 1 ================= */
export function StepServices({ items, removeItem, setQty, lineTotal, together = [], addService, isSub }: any) {
  const router = useRouter(); const toast = useToast();
  const inCart = new Set(items.map((it: any) => it.service_id));
  const suggestions = (together || []).filter((s: any) => !inCart.has(s.id)).slice(0, 6);
  if (isSub) {
    const it = items[0];
    return (
      <View style={{ gap: 16 }}>
        <H2 t="Your plan" s="You're booking a recurring subscription — a verified professional every working day." />
        <View testID={`cart-item-${it.service_id || it.id}`} style={{ ...card, flexDirection: "row", gap: 12, padding: 16 }}>
          <Thumb uri={it.image} size={72} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <SubscriptionHeader it={it} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 12 }}>
              <Pressable testID={`change-plan-${it.service_id || it.id}`} onPress={() => router.push(`/(site)/service/${it.service_id}` as any)} hitSlop={8}><Text style={{ fontSize: 12, fontWeight: "700", color: TC.primaryText }}>Change plan</Text></Pressable>
              <Pressable testID={`remove-${it.service_id || it.id}`} onPress={() => { removeItem(it.id); router.replace(`/(site)/service/${it.service_id}` as any); }} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Trash2 size={14} color={TC.textFaint} /><Text style={{ fontSize: 12, fontWeight: "700", color: TC.textFaint }}>Remove</Text></Pressable>
            </View>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "800", color: TC.text }}>{fmt(lineTotal(it))}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <H2 t="Your selected services" s="Add as many services as you like — they'll all be booked in one order." />
      <View style={{ gap: 12 }}>
        {items.map((it: any) => (
          <View key={it.id} testID={`cart-item-${it.service_id || it.id}`} style={{ ...card, flexDirection: "row", gap: 12, padding: 12 }}>
            <Thumb uri={it.image} size={80} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: TC.primaryText }}>{it.category_name}</Text>
              <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", color: TC.text, lineHeight: 20 }}>{it.name}</Text>
              {it.tier_index != null && it.tiers?.[it.tier_index] ? <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 2 }}>Pack: {it.tiers[it.tier_index].label}</Text> : null}
              {(it.addons || []).length ? <Text numberOfLines={1} style={{ fontSize: 12, color: TC.textFaint, marginTop: 2 }}>+ {addonLabel(it)}</Text> : null}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}><Qty value={it.qty} onChange={(v) => setQty(it.id, v)} size="sm" testID={`qty-${it.service_id || it.id}`} /><Text style={{ fontSize: 16, fontWeight: "800", color: TC.text }}>{fmt(lineTotal(it))}</Text></View>
            </View>
            <Pressable testID={`remove-${it.service_id || it.id}`} onPress={() => removeItem(it.id)} hitSlop={8}><Trash2 size={16} color={TC.textFaint} /></Pressable>
          </View>
        ))}
      </View>
      {suggestions.length > 0 ? (
        <View testID="frequently-together" style={{ borderRadius: 16, borderWidth: 1, borderColor: AMBER[200], backgroundColor: TC.text === "#FFFFFF" ? "rgba(245,158,11,0.10)" : "rgba(255,251,235,0.6)", padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}><PartyPopper size={16} color={AMBER[600]} /><Text style={{ fontSize: 14, fontWeight: "700", color: TC.text }}>Frequently booked together</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {suggestions.map((s: any) => { const price = s.discounted_price || s.base_price || s.tiers?.[0]?.price || 0; return (
              <View key={s.id} testID={`together-${s.id}`} style={{ width: 180, borderRadius: 12, borderWidth: 1, borderColor: TC.border, backgroundColor: TC.surface, overflow: "hidden" }}>
                <View style={{ height: 80, backgroundColor: TC.surfaceAlt }}>{s.image ? <Image source={{ uri: s.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : null}</View>
                <View style={{ padding: 10 }}>
                  <Text numberOfLines={2} style={{ fontSize: 13, fontWeight: "600", color: TC.text, minHeight: 34 }}>{s.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}><Text style={{ fontSize: 14, fontWeight: "800", color: TC.text }}>{fmt(price)}</Text><Pressable testID={`together-add-${s.id}`} onPress={() => { addService(s); toast.success(`${s.name} added`); }} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: PRIMARY[700], paddingHorizontal: 10, paddingVertical: 4 }}><Plus size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Add</Text></Pressable></View>
                </View>
              </View>); })}
          </ScrollView>
        </View>
      ) : null}
      <Pressable testID="add-more" onPress={() => router.push("/(site)/services" as any)} style={{ borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: PRIMARY[200], backgroundColor: TC.primarySoft, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={16} color={TC.primaryText} /><Text style={{ fontSize: 15, fontWeight: "600", color: TC.primaryText }}>Add more services</Text></Pressable>
    </View>
  );
}

/* ================= STEP 2 ================= */
export function StepDetails({ items, updateItem, setAddonQty, popularAddons = {}, lineTotal }: any) {
  const toggleAddon = (it: any, name: string) => {
    if ((it.addons || []).includes(name)) { const nq = { ...(it.addonQty || {}) }; delete nq[name]; updateItem(it.id, { addons: it.addons.filter((x: string) => x !== name), addonQty: nq }); }
    else updateItem(it.id, { addons: [...(it.addons || []), name], addonQty: { ...(it.addonQty || {}), [name]: 1 } });
  };
  return (
    <View style={{ gap: 16 }}>
      <H2 t="Customize each service" s="Pick a pack, add extras and set quantity for each service." />
      {items.map((it: any) => { const pop = ((popularAddons[it.service_id] || []) as any[]).filter((p) => !(it.addons || []).includes(p.name)); return (
        <View key={it.id} testID={`detail-${it.service_id || it.id}`} style={{ ...card, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Thumb uri={it.image} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: TC.text }}>{it.name}</Text><View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Star size={12} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 12, color: TC.textMuted }}>{it.rating || "4.8"}</Text><Clock size={12} color={TC.textMuted} /><Text style={{ fontSize: 12, color: TC.textMuted }}>{it.duration_min}m</Text></View></View>
            <Qty value={it.qty} onChange={(v) => updateItem(it.id, { qty: Math.max(1, v) })} testID={`dqty-${it.service_id || it.id}`} />
          </View>
          {(it.tiers || []).length ? <View style={{ marginBottom: 12 }}><Lbl>Choose a pack</Lbl><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {it.tiers.map((t: any, ti: number) => { const sel = it.tier_index === ti; const off = t.original_price > t.price ? Math.round((1 - t.price / t.original_price) * 100) : 0; return (
              <Pressable key={ti} testID={`tier-${it.service_id}-${ti}`} onPress={() => updateItem(it.id, { tier_index: ti })} style={{ width: "48%", borderRadius: 12, borderWidth: 2, borderColor: sel ? PRIMARY[700] : TC.border, backgroundColor: sel ? PRIMARY[50] : TC.surface, padding: 12 }}>
                {t.badge ? <View style={{ position: "absolute", top: -8, left: 8, backgroundColor: PRIMARY[700], borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{t.badge}</Text></View> : null}
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: TC.text }}>{t.label}</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 }}><Text style={{ fontSize: 16, fontWeight: "800", color: TC.text }}>{fmt(t.price)}</Text>{off > 0 ? <Text style={{ fontSize: 11, color: TC.textFaint, textDecorationLine: "line-through", marginBottom: 2 }}>{fmt(t.original_price)}</Text> : null}</View>
                {off > 0 ? <Text style={{ fontSize: 11, color: EMERALD[600], fontWeight: "600" }}>{off}% off</Text> : null}
              </Pressable>); })}
          </View></View> : null}
          {(it.addonsCatalog || []).length ? <View>
            {pop.length ? <View testID={`freq-addons-${it.service_id}`} style={{ marginBottom: 12, borderRadius: 12, borderWidth: 1, borderColor: AMBER[200], backgroundColor: TC.text === "#FFFFFF" ? "rgba(245,158,11,0.10)" : "rgba(255,251,235,0.6)", padding: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 }}><Zap size={14} color={AMBER[700]} /><Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: AMBER[700] }}>Frequently added</Text></View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{pop.map((p) => <Pressable key={p.name} testID={`freq-addon-${it.service_id}-${p.name}`} onPress={() => toggleAddon(it, p.name)} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, backgroundColor: TC.surface, borderWidth: 1, borderColor: AMBER[300], paddingHorizontal: 10, paddingVertical: 4 }}><Plus size={12} color={AMBER[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: "#92400E" }}>{p.name} <Text style={{ color: AMBER[500] }}>+{fmt(p.price)}</Text></Text></Pressable>)}</View>
            </View> : null}
            <Lbl>Add-ons</Lbl>
            <View style={{ gap: 8 }}>{it.addonsCatalog.map((a: any) => { const on = (it.addons || []).includes(a.name); const popular = ((popularAddons[it.service_id] || []) as any[]).some((p) => p.name === a.name && p.count > 0); const aq = Math.max(1, Number((it.addonQty || {})[a.name]) || 1); return (
              <View key={a.name} style={{ borderRadius: 12, borderWidth: 1, borderColor: on ? PRIMARY[700] : TC.border, backgroundColor: on ? PRIMARY[50] : TC.surface }}>
                <Pressable testID={`addon-${it.service_id}-${a.name}`} onPress={() => toggleAddon(it, a.name)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}><View style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1, borderColor: on ? PRIMARY[700] : TC.border, backgroundColor: on ? PRIMARY[700] : "transparent", alignItems: "center", justifyContent: "center" }}>{on ? <Check size={14} color="#fff" /> : null}</View><Text style={{ fontSize: 14, fontWeight: "500", color: TC.text }}>{a.name}</Text>{popular ? <View testID={`addon-popular-${it.service_id}-${a.name}`} style={{ backgroundColor: AMBER[100], borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ fontSize: 9, fontWeight: "700", textTransform: "uppercase", color: AMBER[700] }}>Popular</Text></View> : null}</View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: TC.text2 }}>+{fmt(a.price)}</Text>
                </Pressable>
                {on ? <View testID={`addon-qty-row-${it.service_id}-${a.name}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 12 }}><Text style={{ fontSize: 11, color: TC.textMuted }}>Add-on quantity</Text><View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Qty value={aq} onChange={(v) => setAddonQty(it.id, a.name, v)} size="sm" testID={`aqty-${it.service_id}-${a.name}`} /><Text style={{ fontSize: 12, fontWeight: "600", color: TC.text2, width: 64, textAlign: "right" }}>{fmt((Number(a.price) || 0) * aq)}</Text></View></View> : null}
              </View>); })}</View>
          </View> : null}
          {!(it.tiers || []).length && !(it.addonsCatalog || []).length ? <Text style={{ fontSize: 14, color: TC.textFaint }}>No extra options for this service — just set the quantity above.</Text> : null}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: TC.borderSoft }}><Text style={{ fontSize: 14, color: TC.textMuted }}>Subtotal: </Text><Text style={{ fontSize: 14, fontWeight: "700", color: TC.text }}>{fmt(lineTotal ? lineTotal(it) : lineEstimate(it))}</Text></View>
        </View>); })}
    </View>
  );
}

/* ================= STEP 3 ================= */
export function StepSchedule({ schedule, setSchedule, scheduledAt, setScheduledAt, isSub }: any) {
  return (
    <View style={{ gap: 16 }}>
      <H2 t={isSub ? "When should we start?" : "When should we come?"} s={isSub ? "Pick the start date & time — your recurring visits begin from here." : "This schedule applies to your whole order."} />
      {!isSub ? (
        <View style={{ flexDirection: "row", gap: 12 }}>
          {([["schedule", "Schedule a visit", "Pick a convenient date & time", CalendarClock], ["emergency", "Quick Services", "Get help as soon as possible", Zap]] as any[]).map(([k, t, d, Icon]) => (
            <Pressable key={k} testID={`when-${k}`} onPress={() => setSchedule(k)} style={{ flex: 1, borderRadius: 16, borderWidth: 2, borderColor: schedule === k ? PRIMARY[700] : TC.border, backgroundColor: schedule === k ? PRIMARY[50] : TC.surface, padding: 16 }}>
              <Icon size={24} color={schedule === k ? PRIMARY[700] : TC.textFaint} /><Text style={{ fontSize: 15, fontWeight: "600", color: TC.text, marginTop: 8 }}>{t}</Text><Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 2 }}>{d}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {schedule === "schedule" ? <SchedulePicker value={scheduledAt} onChange={setScheduledAt} /> : null}
      {schedule === "emergency" && !isSub ? <View style={{ borderRadius: 16, backgroundColor: AMBER[50], borderWidth: 1, borderColor: AMBER[200], padding: 16, flexDirection: "row", gap: 12 }}><Zap size={20} color={AMBER[600]} /><Text style={{ fontSize: 14, color: "#92400E", flex: 1 }}>We'll assign the nearest available professional right away. A small quick services charge may apply.</Text></View> : null}
    </View>
  );
}
