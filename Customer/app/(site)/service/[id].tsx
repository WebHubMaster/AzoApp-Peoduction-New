/** Service detail — port of web_panel/src/pages/customer/ServiceDetail.jsx (mobile view + sticky add bar). */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ShoppingBag, Star, Clock, Tag, CheckCircle2, Check, Minus, Plus, ShieldCheck, ChevronDown } from "lucide-react-native";
import { api } from "../../../src/api/client";
import { PRIMARY, SLATE, AMBER, EMERALD } from "../../../src/theme";
import { fmt } from "../../../src/lib/format";
import { useCart } from "../../../src/context/CartContext";
import { useToast } from "../../../src/components/Toast";
import { stripHtml } from "../../../src/components/site/ui";

const PRICE_LABEL: Record<string, string> = { per_hour: "/ hr", per_person: "/ person", per_sqft: "/ sq ft" };

export default function ServiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { addService, count } = useCart();
  const [svc, setSvc] = useState<any>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [tier, setTier] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  useEffect(() => {
    setSvc(null); setAddons([]); setQty(1); setAdded(false);
    api.get<any>(`/catalog/services/${id}`, { auth: false }).then((d) => {
      setSvc(d);
      const ts = d.tiers || [];
      if (ts.length) { const bi = ts.findIndex((t: any) => t.badge); setTier(bi >= 0 ? bi : 0); } else setTier(null);
    }).catch(() => toast.error("Service not found"));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAddon = (name: string) => setAddons((a) => (a.includes(name) ? a.filter((x) => x !== name) : [...a, name]));
  const unitPrice = useMemo(() => {
    if (!svc) return 0;
    const base = tier != null && svc.tiers?.[tier] ? Number(svc.tiers[tier].price) || 0 : (svc.discounted_price > 0 && svc.discounted_price < svc.base_price ? svc.discounted_price : svc.base_price);
    const addonSum = addons.reduce((s, name) => { const a = (svc.addons || []).find((x: any) => x.name === name); return s + (a ? Number(a.price) || 0 : 0); }, 0);
    return (Number(base) || 0) + addonSum;
  }, [svc, tier, addons]);
  const addToBooking = (goCheckout = false) => {
    addService(svc, { tier_index: tier, addons, qty });
    setAdded(true);
    if (goCheckout) router.push("/(site)/book" as any); else toast.success(`${svc.name} added to your booking`);
  };

  const Header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, height: insets.top + 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.6)", backgroundColor: "#fff" }}>
      <Pressable testID="back-btn" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color={SLATE[500]} /></Pressable>
      <Text style={{ fontSize: 17, fontWeight: "800", color: SLATE[900], flex: 1 }} numberOfLines={1}>{svc?.name || "Service"}</Text>
      <Pressable testID="nav-cart" onPress={() => router.push("/(site)/book" as any)} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ShoppingBag size={16} color={PRIMARY[700]} /><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[700] }}>Booking</Text>
        {count > 0 ? <View testID="cart-count" style={{ position: "absolute", top: -8, right: -8, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{count}</Text></View> : null}
      </Pressable>
    </View>
  );
  if (!svc) return <View style={{ flex: 1, backgroundColor: "#FAFAFA" }}>{Header}<ActivityIndicator color={PRIMARY[700]} style={{ marginTop: 60 }} /></View>;
  const hasDiscount = svc.discounted_price > 0 && svc.discounted_price < svc.base_price;

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFA" }} testID="service-detail">
      {Header}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Image source={{ uri: svc.image || svc.gallery?.[0] }} style={{ width: "100%", height: 220, borderRadius: 20, backgroundColor: SLATE[100] }} contentFit="cover" transition={200} />
        <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700", color: PRIMARY[700], marginTop: 20 }}>{svc.category_name}{svc.subcategory_name ? ` · ${svc.subcategory_name}` : ""}</Text>
        <Text testID="service-name" style={{ fontSize: 26, fontWeight: "800", color: SLATE[900], marginTop: 4, letterSpacing: -0.4 }}>{svc.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Star size={16} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 14, color: SLATE[500] }}>{svc.rating}</Text></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Clock size={16} color={SLATE[500]} /><Text style={{ fontSize: 14, color: SLATE[500] }}>{svc.duration_min} min</Text></View>
          {svc.members_required > 1 ? <Text style={{ fontSize: 14, color: SLATE[500] }}>· {svc.members_required} pros</Text> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 }}>
          <Text testID="service-price" style={{ fontSize: 26, fontWeight: "800", color: SLATE[900] }}>{fmt(svc.discounted_price || svc.base_price)}</Text>
          {hasDiscount ? <Text style={{ color: SLATE[400], textDecorationLine: "line-through", marginBottom: 4 }}>{fmt(svc.base_price)}</Text> : null}
          {PRICE_LABEL[svc.price_type] ? <Text style={{ fontSize: 12, color: SLATE[500], marginBottom: 5 }}>{PRICE_LABEL[svc.price_type]}</Text> : null}
          {svc.tax_pct > 0 ? <Text testID="service-tax-note" style={{ fontSize: 12, color: SLATE[400], marginBottom: 5 }}>{svc.tax_inclusive ? "Incl. Est. Govt. Taxes" : "+ Est. Govt. Taxes"}</Text> : null}
        </View>
        {(svc.tags || []).length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>{svc.tags.map((t: string) => <View key={t} style={{ backgroundColor: SLATE[100], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ fontSize: 12, color: SLATE[600] }}>{t}</Text></View>)}</View> : null}

        {(svc.tiers || []).length ? (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}><Tag size={16} color={EMERALD[600]} /><Text style={{ fontSize: 14, fontWeight: "600", color: EMERALD[600] }}>Choose a pack & save more</Text></View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {svc.tiers.map((t: any, i: number) => {
                const off = t.original_price > t.price ? Math.round((1 - t.price / t.original_price) * 100) : 0;
                const sel = tier === i;
                return (
                  <Pressable key={i} testID={`tier-${i}`} onPress={() => setTier(i)} style={{ width: "47%", borderRadius: 16, borderWidth: 2, borderColor: sel ? PRIMARY[700] : SLATE[200], backgroundColor: sel ? PRIMARY[50] : "#fff", overflow: "hidden" }}>
                    {t.image ? <Image source={{ uri: t.image }} style={{ height: 90, width: "100%" }} contentFit="cover" /> : null}
                    {t.badge ? <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: PRIMARY[700], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{t.badge}</Text></View> : null}
                    <View style={{ padding: 12 }}>
                      <Text style={{ fontWeight: "600", color: SLATE[900] }}>{t.label}</Text>
                      {t.description ? <Text numberOfLines={1} style={{ fontSize: 11, color: SLATE[400], marginTop: 2 }}>{t.description}</Text> : null}
                      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 }}><Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>{fmt(t.price)}</Text>{off > 0 ? <Text style={{ fontSize: 12, color: SLATE[400], textDecorationLine: "line-through", marginBottom: 2 }}>{fmt(t.original_price)}</Text> : null}</View>
                      {off > 0 ? <Text style={{ fontSize: 12, color: EMERALD[600], fontWeight: "600", marginTop: 2 }}>{off}% off</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {(svc.highlights || []).length ? (
          <View style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: SLATE[900], marginBottom: 12 }}>✨ HIGHLIGHTS</Text>
            <View style={{ gap: 10 }}>{svc.highlights.map((h: string, i: number) => <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}><CheckCircle2 size={16} color={EMERALD[500]} style={{ marginTop: 2 }} /><Text style={{ fontSize: 14, color: SLATE[700], flex: 1 }}>{h}</Text></View>)}</View>
          </View>
        ) : null}
        {svc.description ? <Text style={{ color: SLATE[600], marginTop: 16, lineHeight: 22, fontSize: 14 }}>{stripHtml(svc.description)}</Text> : null}

        {svc.addons?.length ? (
          <View style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: SLATE[900], marginBottom: 12 }}>Add-ons</Text>
            <View style={{ gap: 8 }}>
              {svc.addons.map((a: any) => {
                const on = addons.includes(a.name);
                return (
                  <Pressable key={a.name} testID={`addon-${a.name}`} onPress={() => toggleAddon(a.name)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: on ? PRIMARY[700] : SLATE[200], backgroundColor: on ? PRIMARY[50] : "#fff" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ height: 20, width: 20, borderRadius: 6, borderWidth: 1, borderColor: on ? PRIMARY[700] : SLATE[300], backgroundColor: on ? PRIMARY[700] : "#fff", alignItems: "center", justifyContent: "center" }}>{on ? <Check size={14} color="#fff" /> : null}</View>
                      <Text style={{ fontWeight: "500", color: SLATE[800], fontSize: 15 }}>{a.name}</Text>
                    </View>
                    <Text style={{ fontWeight: "600", color: SLATE[700] }}>+{fmt(a.price)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {(svc.faqs || []).length ? (
          <View style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: SLATE[900], marginBottom: 12 }}>Frequently asked questions</Text>
            <View style={{ gap: 8 }}>{svc.faqs.map((f: any, i: number) => (
              <Pressable key={i} onPress={() => setFaqOpen(faqOpen === i ? null : i)} style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], borderRadius: 12, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={{ fontWeight: "600", color: SLATE[800], flex: 1 }}>{f.question}</Text><ChevronDown size={16} color={SLATE[400]} /></View>
                {faqOpen === i ? <Text style={{ color: SLATE[600], fontSize: 14, marginTop: 8, lineHeight: 20 }}>{stripHtml(f.answer)}</Text> : null}
              </Pressable>
            ))}</View>
          </View>
        ) : null}

        <View style={{ marginTop: 28, backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: SLATE[200], padding: 20 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: SLATE[900] }}>Add to your booking</Text>
          <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 4 }}>Select options, then add this service. You can add more services before checkout.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: SLATE[600] }}>Quantity</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], height: 40 }}>
              <Pressable testID="qty-minus" onPress={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} style={{ paddingHorizontal: 12, height: "100%", justifyContent: "center", opacity: qty <= 1 ? 0.3 : 1 }}><Minus size={16} color={SLATE[500]} /></Pressable>
              <Text testID="qty-value" style={{ width: 32, textAlign: "center", fontWeight: "700", color: SLATE[900] }}>{qty}</Text>
              <Pressable testID="qty-plus" onPress={() => setQty((q) => q + 1)} style={{ paddingHorizontal: 12, height: "100%", justifyContent: "center" }}><Plus size={16} color={SLATE[500]} /></Pressable>
            </View>
          </View>
          {tier != null && svc.tiers?.[tier] ? <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}><Text style={{ fontSize: 14, color: SLATE[500] }}>Pack</Text><Text style={{ fontSize: 14, fontWeight: "500", color: SLATE[800] }}>{svc.tiers[tier].label}</Text></View> : null}
          {addons.length ? <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}><Text style={{ fontSize: 14, color: SLATE[500] }}>Add-ons</Text><Text style={{ fontSize: 14, fontWeight: "500", color: SLATE[800], maxWidth: "60%", textAlign: "right" }}>{addons.join(", ")}</Text></View> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: SLATE[100] }}><Text style={{ fontSize: 14, color: SLATE[500] }}>Item total</Text><Text testID="item-total" style={{ fontSize: 24, fontWeight: "800", color: SLATE[900] }}>{fmt(unitPrice * qty)}</Text></View>
          <Pressable testID="add-to-booking" onPress={() => addToBooking(false)} style={{ marginTop: 16, height: 48, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>{added ? <><Check size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Added · Add again</Text></> : <><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600", fontSize: 16 }}>Add to Booking</Text></>}</Pressable>
          {count > 0 ? <Pressable testID="go-checkout" onPress={() => router.push("/(site)/book" as any)} style={{ marginTop: 8, height: 44, borderRadius: 12, borderWidth: 1, borderColor: PRIMARY[200], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}><Text style={{ color: PRIMARY[700], fontWeight: "600" }}>Go to checkout ({count})</Text><ShoppingBag size={16} color={PRIMARY[700]} /></Pressable>
            : <Pressable testID="book-now" onPress={() => addToBooking(true)} style={{ marginTop: 8, height: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: PRIMARY[700], fontWeight: "600", fontSize: 14 }}>Or book only this service →</Text></Pressable>}
          <View testID="secure-badge" style={{ marginTop: 16, borderRadius: 12, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: EMERALD[600], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={20} color="#fff" /></View>
            <View><Text style={{ fontSize: 14, fontWeight: "700", color: "#065F46" }}>100% Secure & Refundable</Text><Text style={{ fontSize: 11, color: EMERALD[700] }}>Pay safely at checkout · easy cancellations</Text></View>
          </View>
        </View>
      </ScrollView>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.97)", borderTopWidth: 1, borderTopColor: SLATE[200], paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View><Text style={{ fontSize: 11, color: SLATE[400] }}>Item total</Text><Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>{fmt(unitPrice * qty)}</Text></View>
        <Pressable testID="add-to-booking-mobile" onPress={() => addToBooking(false)} style={{ marginLeft: "auto", height: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4 }}><Plus size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text></Pressable>
        {count > 0 ? <Pressable testID="go-checkout-mobile" onPress={() => router.push("/(site)/book" as any)} style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, backgroundColor: EMERALD[600], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "600" }}>Checkout ({count})</Text></Pressable> : null}
      </View>
    </View>
  );
}
