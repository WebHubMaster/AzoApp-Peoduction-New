/** Service detail — port of web_panel/src/pages/customer/ServiceDetail.jsx (mobile view + sticky add bar). */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ShoppingBag, Star, Clock, Tag, CheckCircle2, Check, Minus, Plus, ShieldCheck, ChevronDown, CalendarClock, Sparkles, Wrench } from "lucide-react-native";
import { api } from "../../../src/api/client";
import { PRIMARY, SLATE, AMBER, EMERALD, TC, useTheme } from "../../../src/theme";
import { fmt } from "../../../src/lib/format";
import { useCart } from "../../../src/context/CartContext";
import { useAuth } from "../../../src/context/AuthContext";
import { RateCardBar } from "../../../src/components/site/RateCardBar";
import { useToast } from "../../../src/components/Toast";
import { stripHtml } from "../../../src/components/site/ui";

const PRICE_LABEL: Record<string, string> = { per_hour: "/ hr", per_person: "/ person", per_sqft: "/ sq ft" };

/** Recurring-subscription (maid) plan picker — parity with the web ServiceDetail.
 *  Button says "Book Now" (no "pay upfront") and there is NO green attendance note. */
function SubscriptionPanel({ svc }: { svc: any }) {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { addSubscription } = useCart();
  const [plans, setPlans] = useState<any[]>(svc.subscription_plans || []);
  const [sel, setSel] = useState<string>((svc.subscription_plans || [])[0]?.plan_type || "");

  useEffect(() => {
    api.get<any>(`/subscriptions/plans/${svc.id}`).then((r) => {
      const ps = r?.plans || [];
      if (ps.length) { setPlans(ps); setSel((cur) => (ps.some((p: any) => p.plan_type === cur) ? cur : ps[0].plan_type)); }
    }).catch(() => {});
  }, [svc.id]);

  const plan = plans.find((p) => p.plan_type === sel);
  // Book like a normal service: drop the chosen plan into the cart, continue to /book.
  const book = () => {
    if (!user) { toast.info("Please log in to book"); router.push("/login" as any); return; }
    if (!plan) return toast.error("Please select a plan");
    addSubscription(svc, plan);
    router.push("/(site)/book" as any);
  };

  return (
    <View testID="subscription-panel" style={{ marginTop: 28, backgroundColor: TC.surface, borderRadius: 20, borderWidth: 1, borderColor: TC.border, padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><CalendarClock size={20} color={PRIMARY[700]} /><Text style={{ fontSize: 20, fontWeight: "800", color: TC.text }}>Choose your plan</Text></View>
      <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 4 }}>Recurring subscription — the maid visits every working day.</Text>

      <View style={{ gap: 10, marginTop: 16 }}>
        {plans.map((p) => {
          const on = p.plan_type === sel;
          return (
            <Pressable key={p.plan_type} testID={`sub-plan-${p.plan_type}`} onPress={() => setSel(p.plan_type)}
              style={{ borderWidth: on ? 2 : 1, borderColor: on ? PRIMARY[700] : TC.border, borderRadius: 16, padding: 14, backgroundColor: on ? PRIMARY[50] : TC.surface }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: TC.text, fontWeight: "800", fontSize: 16 }}>{p.label}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ color: TC.primaryText, fontWeight: "800", fontSize: 17 }}>{fmt(p.price)}</Text>
                  {on ? <CheckCircle2 size={18} color={TC.primaryText} /> : null}
                </View>
              </View>
              <Text style={{ color: TC.textMuted, fontSize: 12, marginTop: 4 }}>{p.duration_days}-day period{p.working_days ? ` · ${p.working_days} working days` : ""}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable testID="sub-book-now" onPress={book} disabled={!plan} style={{ marginTop: 18, height: 52, borderRadius: 14, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: !plan ? 0.6 : 1 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Book Now</Text>
      </Pressable>
    </View>
  );
}

export default function ServiceDetail() {
  useTheme();
  const { id, book } = useLocalSearchParams<{ id: string; book?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { addService, count } = useCart();
  const [svc, setSvc] = useState<any>(null);
  const [tier, setTier] = useState<number | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const autoAddRef = React.useRef<string | null>(null);
  const gallery: string[] = svc ? [svc.image, ...(svc.gallery || [])].filter(Boolean) : [];

  useEffect(() => {
    setSvc(null); setQty(1); setAdded(false); setGalleryIdx(0);
    api.get<any>(`/catalog/services/${id}`, { auth: false }).then((d) => {
      setSvc(d);
      const ts = d.tiers || [];
      if (ts.length) { const bi = ts.findIndex((t: any) => t.badge); setTier(bi >= 0 ? bi : 0); } else setTier(null);
    }).catch(() => toast.error("Service not found"));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitPrice = useMemo(() => {
    if (!svc) return 0;
    const base = tier != null && svc.tiers?.[tier] ? Number(svc.tiers[tier].price) || 0 : (svc.discounted_price > 0 && svc.discounted_price < svc.base_price ? svc.discounted_price : svc.base_price);
    return Number(base) || 0;
  }, [svc, tier]);
  const addToBooking = (goCheckout = false) => {
    addService(svc, { tier_index: tier, addons: [], qty });
    setAdded(true);
    if (goCheckout) router.push("/(site)/book" as any); else toast.success(`${svc.name} added to your booking`);
  };

  // "Book Now" from a category/home card (?book=1) → add to booking immediately and
  // keep the customer on the detail so they can review options, then checkout. Runs once per service.
  useEffect(() => {
    if (svc && book === "1" && autoAddRef.current !== String(id)) {
      autoAddRef.current = String(id);
      addService(svc, { tier_index: tier, addons: [], qty: 1 });
      setAdded(true);
      toast.success(`${svc.name} added — review & checkout`);
      // Clear the ?book=1 flag so returning to this screen (e.g. back from the
      // checkout wizard) never re-adds the service or re-shows the toast.
      router.setParams({ book: "0" });
    }
  }, [svc, book, id, tier]); // eslint-disable-line react-hooks/exhaustive-deps

  const Header = (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, height: insets.top + 64, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.6)", backgroundColor: TC.surface }}>
      <Pressable testID="back-btn" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, borderRadius: 12, borderWidth: 1, borderColor: TC.border, alignItems: "center", justifyContent: "center" }}><ArrowLeft size={18} color={TC.textMuted} /></Pressable>
      <Text style={{ fontSize: 17, fontWeight: "800", color: TC.text, flex: 1 }} numberOfLines={1}>{svc?.name || "Service"}</Text>
      <Pressable testID="nav-cart" onPress={() => router.push("/(site)/book" as any)} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: TC.border, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ShoppingBag size={16} color={TC.primaryText} /><Text style={{ fontSize: 13, fontWeight: "600", color: TC.text2 }}>Booking</Text>
        {count > 0 ? <View testID="cart-count" style={{ position: "absolute", top: -8, right: -8, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{count}</Text></View> : null}
      </Pressable>
    </View>
  );
  if (!svc) return <View style={{ flex: 1, backgroundColor: TC.bg }}>{Header}<ActivityIndicator color={TC.primaryText} style={{ marginTop: 60 }} /></View>;
  const hasDiscount = svc.discounted_price > 0 && svc.discounted_price < svc.base_price;

  return (
    <View style={{ flex: 1, backgroundColor: TC.bg }} testID="service-detail">
      {Header}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Image source={{ uri: gallery[galleryIdx] || svc.image }} style={{ width: "100%", height: 256, borderRadius: 16, backgroundColor: TC.surfaceAlt }} contentFit="cover" transition={200} cachePolicy="memory-disk" priority="high" recyclingKey={String(id)} />
        {gallery.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>{gallery.map((im: string, i: number) => <Pressable key={i} testID={`gallery-thumb-${i}`} onPress={() => setGalleryIdx(i)} style={{ height: 64, width: 96, borderRadius: 8, overflow: "hidden", borderWidth: 2, borderColor: i === galleryIdx ? PRIMARY[700] : "transparent" }}><Image source={{ uri: im }} style={{ width: "100%", height: "100%" }} contentFit="cover" /></Pressable>)}</ScrollView> : null}
        <Text style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1, fontWeight: "700", color: TC.primaryText, marginTop: 20 }}>{svc.category_name}{svc.subcategory_name ? ` · ${svc.subcategory_name}` : ""}</Text>
        {svc.is_subscription ? <View testID="subscription-badge" style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><CalendarClock size={12} color={EMERALD[700]} /><Text style={{ fontSize: 11, fontWeight: "700", color: EMERALD[700] }}>Recurring Subscription</Text></View> : null}
        <Text testID="service-name" style={{ fontSize: 26, fontWeight: "800", color: TC.text, marginTop: 4, letterSpacing: -0.4 }}>{svc.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Star size={16} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 14, color: TC.textMuted }}>{svc.rating}</Text></View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Clock size={16} color={TC.textMuted} /><Text style={{ fontSize: 14, color: TC.textMuted }}>{svc.duration_min} min</Text></View>
          {svc.members_required > 1 ? <Text style={{ fontSize: 14, color: TC.textMuted }}>· {svc.members_required} pros</Text> : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 }}>
          <Text testID="service-price" style={{ fontSize: 26, fontWeight: "800", color: TC.text }}>{fmt(svc.discounted_price || svc.base_price)}</Text>
          {hasDiscount ? <Text style={{ color: TC.textFaint, textDecorationLine: "line-through", marginBottom: 4 }}>{fmt(svc.base_price)}</Text> : null}
          {PRICE_LABEL[svc.price_type] ? <Text style={{ fontSize: 12, color: TC.textMuted, marginBottom: 5 }}>{PRICE_LABEL[svc.price_type]}</Text> : null}
          {svc.tax_pct > 0 ? <Text testID="service-tax-note" style={{ fontSize: 12, color: TC.textFaint, marginBottom: 5 }}>{svc.tax_inclusive ? "Incl. Est. Govt. Taxes" : "+ Est. Govt. Taxes"}</Text> : null}
        </View>
        {(svc.tags || []).length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>{svc.tags.map((t: string) => <View key={t} style={{ backgroundColor: TC.surfaceAlt, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ fontSize: 12, color: TC.textMuted }}>{t}</Text></View>)}</View> : null}
        <View style={{ marginTop: 16 }}><RateCardBar serviceId={svc.id} categoryId={svc.category_id} addable /></View>

        {svc.is_subscription ? <SubscriptionPanel svc={svc} /> : null}

        {(svc.tiers || []).length ? (
          <View style={{ marginTop: 24 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}><Tag size={16} color={EMERALD[600]} /><Text style={{ fontSize: 14, fontWeight: "600", color: EMERALD[600] }}>Choose a pack & save more</Text></View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {svc.tiers.map((t: any, i: number) => {
                const off = t.original_price > t.price ? Math.round((1 - t.price / t.original_price) * 100) : 0;
                const sel = tier === i;
                return (
                  <Pressable key={i} testID={`tier-${i}`} onPress={() => setTier(i)} style={{ width: "47%", borderRadius: 16, borderWidth: 2, borderColor: sel ? PRIMARY[700] : TC.border, backgroundColor: sel ? PRIMARY[50] : TC.surface, overflow: "hidden" }}>
                    {t.image ? <Image source={{ uri: t.image }} style={{ height: 90, width: "100%" }} contentFit="cover" /> : null}
                    {t.badge ? <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: PRIMARY[700], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{t.badge}</Text></View> : null}
                    <View style={{ padding: 12 }}>
                      <Text style={{ fontWeight: "600", color: TC.text }}>{t.label}</Text>
                      {Number(t.review_count) > 0 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}><Star size={12} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 12, color: TC.textMuted }}>{t.rating} <Text style={{ color: TC.textFaint }}>({Number(t.review_count).toLocaleString("en-IN")})</Text></Text></View> : null}
                      {t.description ? <Text numberOfLines={1} style={{ fontSize: 11, color: TC.textFaint, marginTop: 2 }}>{t.description}</Text> : null}
                      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 4 }}><Text style={{ fontSize: 18, fontWeight: "800", color: TC.text }}>{fmt(t.price)}</Text>{off > 0 ? <Text style={{ fontSize: 12, color: TC.textFaint, textDecorationLine: "line-through", marginBottom: 2 }}>{fmt(t.original_price)}</Text> : null}</View>
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
            <Text style={{ fontSize: 18, fontWeight: "700", color: TC.text, marginBottom: 12 }}>✨ HIGHLIGHTS</Text>
            <View style={{ gap: 10 }}>{svc.highlights.map((h: string, i: number) => <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: TC.surface, borderWidth: 1, borderColor: TC.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }}><CheckCircle2 size={16} color={EMERALD[500]} style={{ marginTop: 2 }} /><Text style={{ fontSize: 14, color: TC.text2, flex: 1 }}>{h}</Text></View>)}</View>
          </View>
        ) : null}
        {svc.description ? <Text style={{ color: TC.textMuted, marginTop: 16, lineHeight: 22, fontSize: 14 }}>{stripHtml(svc.description)}</Text> : null}

        {(svc.faqs || []).length ? (
          <View style={{ marginTop: 28 }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: TC.text, marginBottom: 12 }}>Frequently asked questions</Text>
            <View style={{ gap: 8 }}>{svc.faqs.map((f: any, i: number) => (
              <Pressable key={i} onPress={() => setFaqOpen(faqOpen === i ? null : i)} style={{ backgroundColor: TC.surface, borderWidth: 1, borderColor: TC.border, borderRadius: 12, padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}><Text style={{ fontWeight: "600", color: TC.text, flex: 1 }}>{f.question}</Text><ChevronDown size={16} color={TC.textFaint} /></View>
                {faqOpen === i ? <Text style={{ color: TC.textMuted, fontSize: 14, marginTop: 8, lineHeight: 20 }}>{stripHtml(f.answer)}</Text> : null}
              </Pressable>
            ))}</View>
          </View>
        ) : null}

        <View style={{ marginTop: 28, backgroundColor: TC.surface, borderRadius: 20, borderWidth: 1, borderColor: TC.border, padding: 20, display: svc.is_subscription ? "none" : "flex" }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: TC.text }}>Add to your booking</Text>
          <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 4 }}>Select options, then add this service. You can add more services before checkout.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: TC.textMuted }}>Quantity</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: TC.border, height: 40 }}>
              <Pressable testID="qty-minus" onPress={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} style={{ paddingHorizontal: 12, height: "100%", justifyContent: "center", opacity: qty <= 1 ? 0.3 : 1 }}><Minus size={16} color={TC.textMuted} /></Pressable>
              <Text testID="qty-value" style={{ width: 32, textAlign: "center", fontWeight: "700", color: TC.text }}>{qty}</Text>
              <Pressable testID="qty-plus" onPress={() => setQty((q) => q + 1)} style={{ paddingHorizontal: 12, height: "100%", justifyContent: "center" }}><Plus size={16} color={TC.textMuted} /></Pressable>
            </View>
          </View>
          {tier != null && svc.tiers?.[tier] ? <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}><Text style={{ fontSize: 14, color: TC.textMuted }}>Pack</Text><Text style={{ fontSize: 14, fontWeight: "500", color: TC.text }}>{svc.tiers[tier].label}</Text></View> : null}
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: TC.borderSoft }}><Text style={{ fontSize: 14, color: TC.textMuted }}>Item total</Text><Text testID="item-total" style={{ fontSize: 24, fontWeight: "800", color: TC.text }}>{fmt(unitPrice * qty)}</Text></View>
          <Pressable testID="add-to-booking" onPress={() => addToBooking(false)} style={{ marginTop: 16, height: 48, borderRadius: 6, borderWidth: 2, borderColor: PRIMARY[600], backgroundColor: "transparent", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>{added ? <><Check size={16} color={PRIMARY[700]} /><Text style={{ color: PRIMARY[700], fontWeight: "700", fontSize: 16 }}>Added · Book again</Text></> : <Text style={{ color: PRIMARY[700], fontWeight: "700", fontSize: 16 }}>Book Now</Text>}</Pressable>
          {count > 0 ? <Pressable testID="go-checkout" onPress={() => router.push("/(site)/book" as any)} style={{ marginTop: 8, height: 44, borderRadius: 12, borderWidth: 1, borderColor: PRIMARY[200], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}><Text style={{ color: TC.primaryText, fontWeight: "600" }}>Go to checkout ({count})</Text><ShoppingBag size={16} color={TC.primaryText} /></Pressable>
            : <Pressable testID="book-now" onPress={() => addToBooking(true)} style={{ marginTop: 8, height: 44, alignItems: "center", justifyContent: "center" }}><Text style={{ color: TC.primaryText, fontWeight: "600", fontSize: 14 }}>Or book only this service →</Text></Pressable>}
          <View testID="secure-badge" style={{ marginTop: 16, borderRadius: 12, backgroundColor: EMERALD[50], borderWidth: 1, borderColor: EMERALD[200], padding: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: EMERALD[600], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={20} color="#fff" /></View>
            <View><Text style={{ fontSize: 14, fontWeight: "700", color: "#065F46" }}>100% Secure & Refundable</Text><Text style={{ fontSize: 11, color: EMERALD[700] }}>Pay safely at checkout · easy cancellations</Text></View>
          </View>
        </View>
        <Pressable testID="need-custom-service" onPress={() => router.push("/(customer)/custom_jobs?new=1" as any)} style={{ marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: PRIMARY[200], backgroundColor: PRIMARY[50], padding: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Sparkles size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: TC.text }}>Need a Custom Service?</Text>
            <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 1 }}>Can’t find it? Tell us and we’ll arrange it for you.</Text>
          </View>
          <Wrench size={18} color={PRIMARY[700]} />
        </Pressable>
      </ScrollView>
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: TC.surface, borderTopWidth: 1, borderTopColor: TC.border, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: insets.bottom + 12, flexDirection: "row", alignItems: "center", gap: 12, display: svc.is_subscription ? "none" : "flex" }}>
        <View><Text style={{ fontSize: 11, color: TC.textFaint }}>Item total</Text><Text style={{ fontSize: 18, fontWeight: "800", color: TC.text }}>{fmt(unitPrice * qty)}</Text></View>
        {count > 0 ? <Pressable testID="go-checkout-mobile" onPress={() => router.push("/(site)/book" as any)} style={{ marginLeft: "auto", height: 44, paddingHorizontal: 24, borderRadius: 12, backgroundColor: EMERALD[600], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "600" }}>Checkout ({count})</Text></Pressable> : null}
      </View>
    </View>
  );
}
