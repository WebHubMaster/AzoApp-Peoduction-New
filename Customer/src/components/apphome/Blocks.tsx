/** Home screen blocks — all content comes from GET /app/home (admin CMS + live catalog). */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, FlatList } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { Star, ArrowRight, Copy, ChevronRight, Grip, Zap, Shield, Sparkles } from "lucide-react-native";
import { PRIMARY, SLATE, AMBER, ORANGE, ROSE, EMERALD, VIOLET, shadowBtn } from "../../theme";
import { LucideByName, compactNum } from "../site/ui";
import { fmt } from "../../lib/format";
import { storage } from "../../utils/storage";
import { useToast } from "../Toast";

type Nav = (to: string) => void;
const card = { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200] } as const;

export function BlockTitle({ icon, title, onSeeAll, right, testID }: { icon?: string; title: string; onSeeAll?: () => void; right?: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 14, gap: 10 }}>
      {icon ? <LucideByName name={icon} size={18} color={icon === "flame" ? ORANGE[500] : icon === "map-pin" ? ROSE[500] : icon === "badge-percent" ? AMBER[500] : PRIMARY[700]} strokeWidth={2.2} /> : null}
      <Text style={{ fontSize: 19, fontWeight: "800", color: SLATE[900], flex: 1, letterSpacing: -0.3 }}>{title}</Text>
      {right}
      {onSeeAll ? <Pressable onPress={onSeeAll} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}><Text style={{ fontSize: 13, fontWeight: "700", color: PRIMARY[700] }}>See all</Text><ArrowRight size={14} color={PRIMARY[700]} /></Pressable> : null}
    </View>
  );
}

/* ---------------- Hero slider ---------------- */
export function HeroSlider({ slides, stats, navigate }: { slides: any[]; stats: any; navigate: Nav }) {
  const { width } = useWindowDimensions();
  const W = width - 40;
  const [idx, setIdx] = useState(0);
  const listRef = useRef<FlatList>(null);
  const n = slides?.length || 0;
  useEffect(() => {
    if (n < 2) return;
    const t = setInterval(() => {
      setIdx((i) => { const next = (i + 1) % n; listRef.current?.scrollToOffset({ offset: next * width, animated: true }); return next; });
    }, 4500);
    return () => clearInterval(t);
  }, [n, width]);
  if (!n) return null;
  return (
    <View testID="hero-slider" style={{ marginBottom: 24 }}>
      <FlatList ref={listRef} data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(s) => s.id} snapToInterval={width} decelerationRate="fast"
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: s, index }) => (
          <View style={{ width, paddingHorizontal: 20 }}>
            <Pressable testID={`hero-slide-${index}`} onPress={() => navigate(s.cta_link || "/services")} style={{ width: W, height: Math.round(W * 0.43), borderRadius: 22, overflow: "hidden", backgroundColor: PRIMARY[700] }}>
              <LinearGradient colors={[s.bg_color || VIOLET[500], s.bg_color2 || "#B69CFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} />
              {s.image ? <Image source={{ uri: s.image }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} contentFit="cover" transition={250} /> : null}
              {s.image ? <LinearGradient colors={["rgba(15,23,42,0.55)", "rgba(15,23,42,0.05)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} /> : null}
              <View style={{ padding: 20, width: "66%", flex: 1, justifyContent: "center" }}>
                {s.badge ? <Text style={{ fontSize: 13, fontWeight: "600", color: s.text_color || "#fff", opacity: 0.95 }}>{s.badge}</Text> : null}
                <Text testID="hero-title" style={{ fontSize: 19, fontWeight: "800", color: s.text_color || "#fff", marginTop: 6, lineHeight: 25, letterSpacing: -0.3 }}>{[s.title, s.highlight].filter(Boolean).join(" ")}</Text>
                {s.cta_label ? <View testID={`hero-cta-${index}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 }}><Text style={{ fontSize: 14, fontWeight: "700", color: s.text_color || "#fff" }}>{s.cta_label}</Text><ArrowRight size={16} color={s.text_color || "#fff"} /></View> : null}
              </View>
              {s.rating_value ? <View testID="hero-rating" style={{ position: "absolute", top: 12, right: 12, backgroundColor: "rgba(255,255,255,0.92)", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 3 }}><Text style={{ fontSize: 12, fontWeight: "800", color: SLATE[900] }}>{s.rating_value}</Text><Star size={11} color={AMBER[500]} fill={AMBER[500]} /></View> : null}
            </Pressable>
          </View>
        )} />
      {slides.length > 1 ? <Dots n={slides.length} i={idx} /> : null}
    </View>
  );
}

const Dots = ({ n, i }: { n: number; i: number }) => (
  <View style={{ flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 8 }}>
    {Array.from({ length: n }).map((_, k) => <View key={k} style={{ height: 6, width: k === i ? 16 : 6, borderRadius: 3, backgroundColor: k === i ? PRIMARY[700] : SLATE[300] }} />)}
  </View>
);

/* ---------------- Categories grid (2 rows × 6, paged) ---------------- */

export function CategoriesGrid({ cats, config, onCategory, onMore }: { cats: any[]; config: any; onCategory: (c: any) => void; onMore: () => void }) {
  const { width } = useWindowDimensions();
  const limit = Math.max(1, Number(config?.limit || 11));
  const showMore = config?.show_more !== false;
  const tiles: any[] = cats.slice(0, limit);
  if (showMore) tiles.push({ id: "__more", name: config?.more_label || "All services", more: true });
  const gap = 14;
  const tileW = (width - 40 - gap * 2) / 3;
  return (
    <View testID="app-categories" style={{ marginBottom: 24, paddingHorizontal: 20, flexDirection: "row", flexWrap: "wrap", gap }}>
      {tiles.map((c: any) => (
        <Pressable key={c.id} testID={c.more ? "app-cat-more" : `app-cat-${c.id}`} onPress={() => (c.more ? onMore() : onCategory(c))} style={{ width: tileW, alignItems: "center" }}>
          <View style={{ width: tileW, height: tileW * 0.88, borderRadius: 18, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {c.more ? <Grip size={34} color={SLATE[800]} strokeWidth={2.2} />
              : c.image ? <Image source={{ uri: c.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={150} />
              : c.icon ? <LucideByName name={c.icon} size={40} color={PRIMARY[700]} strokeWidth={1.6} /> : <Sparkles size={34} color={PRIMARY[700]} />}
          </View>
          <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "500", color: SLATE[800], textAlign: "center", marginTop: 10, lineHeight: 19, paddingHorizontal: 2 }}>{c.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ---------------- Offer banner ---------------- */
export function OfferBanner({ sec, navigate }: { sec: any; navigate: Nav }) {
  const toast = useToast();
  const off = sec.data || {};
  const cfg = sec.config || {};
  const code = off.code;
  const copy = async () => { if (!code) return; await Clipboard.setStringAsync(code); storage.setItem("azo_coupon", code); toast.success(`Code ${code} copied — apply at checkout`); };
  const label = off.discount_label || (off.discount ? `${off.discount}% OFF` : "");
  return (
    <View testID="app-offer-banner" style={{ marginHorizontal: 20, marginBottom: 28 }}>
      <LinearGradient colors={["#FFF4E0", "#FFE9C7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, overflow: "hidden", minHeight: 200, borderWidth: 1, borderColor: AMBER[200] }}>
        {(cfg.image || off.image) ? <Image source={{ uri: cfg.image || off.image }} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "46%" }} contentFit="cover" contentPosition="bottom" transition={200} /> : null}
        {label ? <View style={{ position: "absolute", right: 14, top: 40, backgroundColor: ROSE[500], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{label.split(" ")[0]}</Text><Text style={{ color: "#fff", fontWeight: "700", fontSize: 9 }}>{label.split(" ").slice(1).join(" ") || "OFF"}</Text></View> : null}
        <View style={{ padding: 20, width: "62%" }}>
          {cfg.eyebrow ? <View style={{ alignSelf: "flex-start", backgroundColor: ORANGE[500], borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 }}>{cfg.eyebrow}</Text></View> : null}
          <Text style={{ fontSize: 22, fontWeight: "900", color: SLATE[900], marginTop: 12, lineHeight: 27, letterSpacing: -0.4 }}>
            {label ? <>Get Up to <Text style={{ color: ROSE[600] }}>{label}</Text></> : (off.title || cfg.title)}
          </Text>
          <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", color: SLATE[700], marginTop: 2 }}>{label ? (off.subtitle || off.description || `on ${off.title || "Your First Booking"}`) : (off.subtitle || off.description || "")}</Text>
          {code ? (
            <Pressable testID="app-offer-copy" onPress={copy} style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: AMBER[200] }}>
              <Text style={{ fontSize: 12, color: SLATE[500], fontWeight: "600" }}>Use Code</Text><Text style={{ fontSize: 16, fontWeight: "800", color: SLATE[900] }}>{code}</Text><Copy size={15} color={SLATE[500]} />
            </Pressable>
          ) : null}
          <Pressable testID="app-offer-cta" onPress={() => navigate(cfg.cta_link || "/services")} style={{ marginTop: 16, alignSelf: "flex-start", backgroundColor: PRIMARY[700], borderRadius: 12, paddingHorizontal: 20, height: 44, flexDirection: "row", alignItems: "center", gap: 8, ...shadowBtn }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{cfg.cta_label || "Book Now"}</Text><ArrowRight size={16} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}

/* ---------------- Quick features ---------------- */
export function QuickFeatures({ items, navigate }: { items: any[]; navigate: Nav }) {
  if (!items?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12, marginBottom: 28 }} testID="app-quick-features">
      {items.map((q) => (
        <Pressable key={q.id} testID={`app-qf-${q.id}`} onPress={() => navigate(q.link || "/services")} style={{ ...card, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, width: 190, borderRadius: 18 }}>
          <View style={{ height: 44, width: 44, borderRadius: 12, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center" }}><LucideByName name={q.icon} size={21} color={PRIMARY[700]} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: SLATE[800] }}>{q.title}</Text><Text numberOfLines={1} style={{ fontSize: 11, color: SLATE[500], marginTop: 2 }}>{q.sub}</Text></View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/* ---------------- Service rows ---------------- */
export function ServiceTile({ s, navigate, compact, testID }: { s: any; navigate: Nav; compact?: boolean; testID?: string }) {
  const count = compactNum(s.rating_count || s.booking_count);
  return (
    <Pressable testID={testID} onPress={() => navigate(`/service/${s.id}`)} style={{ ...card, width: compact ? 150 : 164, overflow: "hidden", borderRadius: 18 }}>
      <Image source={{ uri: s.image }} style={{ height: compact ? 100 : 116, width: "100%", backgroundColor: SLATE[100] }} contentFit="cover" transition={200} />
      <View style={{ padding: 12 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: SLATE[800] }}>{s.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 }}>
          <Star size={12} color={AMBER[500]} fill={AMBER[500]} /><Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[700] }}>{Number(s.rating || 0).toFixed(1)}</Text>{count ? <Text style={{ fontSize: 11, color: SLATE[400] }}>({count})</Text> : null}
        </View>
        <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 5 }}>From <Text style={{ fontSize: 15, fontWeight: "800", color: SLATE[900] }}>{fmt(s.base_price)}</Text></Text>
        {!compact ? (
          <Pressable testID={`${testID}-book`} onPress={() => navigate(`/service/${s.id}`)} style={{ marginTop: 12, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: PRIMARY[700] }}>Book Now</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ServicesRow({ sec, navigate, compact, testID }: { sec: any; navigate: Nav; compact?: boolean; testID: string }) {
  if (!sec.data?.length) return null;
  return (
    <View testID={testID} style={{ marginBottom: 30 }}>
      <BlockTitle icon={sec.icon} title={sec.title} onSeeAll={() => navigate(sec.category_id ? `/services?category=${sec.category_id}` : "/services")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
        {sec.data.map((s: any, i: number) => <ServiceTile key={s.id} s={s} navigate={navigate} compact={compact} testID={`${testID}-${i}`} />)}
      </ScrollView>
    </View>
  );
}

/* ---------------- Why choose ---------------- */
export function WhyChoose({ data }: { data: any }) {
  const items = data?.items || [];
  return (
    <View testID="app-why-choose" style={{ marginHorizontal: 20, marginBottom: 30 }}>
      <LinearGradient colors={[PRIMARY[50], "#EEF5FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: PRIMARY[100], padding: 20 }}>
        <Text style={{ fontSize: 19, fontWeight: "900", color: SLATE[900], letterSpacing: -0.3 }}>{data?.title}</Text>
        {data?.side_text ? <Text style={{ fontSize: 13, color: SLATE[600], marginTop: 4 }}>{data.side_text}</Text> : null}
        <View style={{ flexDirection: "row", marginTop: 18 }}>
          {items.map((it: any, i: number) => (
            <View key={i} style={{ flex: 1, alignItems: "center" }}>
              <View style={{ height: 46, width: 46, borderRadius: 23, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", ...shadowBtn }}><LucideByName name={it.icon} size={21} color={PRIMARY[700]} strokeWidth={2} /></View>
              <Text numberOfLines={3} style={{ fontSize: 10, fontWeight: "600", color: SLATE[700], textAlign: "center", marginTop: 8, lineHeight: 12.5, letterSpacing: -0.2 }}>{it.title}</Text>
            </View>
          ))}
        </View>
        {data?.image ? <Image source={{ uri: data.image }} style={{ height: 120, width: "100%", borderRadius: 16, marginTop: 16 }} contentFit="cover" transition={200} /> : null}
      </LinearGradient>
    </View>
  );
}

/* ---------------- Salon tabs ---------------- */
export function SalonSection({ sec, navigate }: { sec: any; navigate: Nav }) {
  const tabs = sec.data || [];
  const [t, setT] = useState(0);
  const cur = tabs[t];
  if (!tabs.length) return null;
  return (
    <View testID="app-salon" style={{ marginBottom: 30 }}>
      <BlockTitle icon={sec.icon} title={sec.title} onSeeAll={() => navigate(cur?.category_id ? `/services?category=${cur.category_id}` : "/services")}
        right={<View style={{ flexDirection: "row", gap: 6 }}>{tabs.map((tab: any, i: number) => (
          <Pressable key={i} testID={`app-salon-tab-${i}`} onPress={() => setT(i)} style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: i === t ? VIOLET[500] : "#fff", borderWidth: 1, borderColor: i === t ? VIOLET[500] : SLATE[200], justifyContent: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: i === t ? "#fff" : SLATE[600] }}>{tab.label}</Text>
          </Pressable>
        ))}</View>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
        {(cur?.data || []).map((s: any, i: number) => <ServiceTile key={s.id} s={s} navigate={navigate} compact testID={`app-salon-svc-${i}`} />)}
        {!cur?.data?.length ? <Text style={{ fontSize: 12, color: SLATE[500] }}>No services yet in this category.</Text> : null}
      </ScrollView>
    </View>
  );
}

/* ---------------- Offers & savings ---------------- */
const OFFER_GRADS = [[PRIMARY[600], PRIMARY[800]], ["#FFE3EC", "#FFC9D9"], [VIOLET[500], "#A855F7"], [EMERALD[500], EMERALD[700]], [AMBER[400], ORANGE[500]]];
export function OffersRow({ sec, navigate }: { sec: any; navigate: Nav }) {
  const toast = useToast();
  if (!sec.data?.length) return null;
  return (
    <View testID="app-offers" style={{ marginBottom: 30 }}>
      <BlockTitle icon={sec.icon} title={sec.title} onSeeAll={() => navigate("/offers")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 14 }}>
        {sec.data.map((o: any, i: number) => {
          const g = OFFER_GRADS[i % OFFER_GRADS.length];
          const dark = i % OFFER_GRADS.length !== 1;
          const fg = dark ? "#fff" : SLATE[900];
          return (
            <Pressable key={o.id} testID={`app-offer-${o.id}`} onPress={async () => { if (o.code) { await Clipboard.setStringAsync(o.code); storage.setItem("azo_coupon", o.code); toast.success(`Code ${o.code} copied — apply at checkout`); } navigate(o.link || "/services"); }}>
              <LinearGradient colors={g as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 200, height: 132, borderRadius: 20, padding: 16, overflow: "hidden" }}>
                {o.image ? <Image source={{ uri: o.image }} style={{ position: "absolute", right: -4, bottom: -4, width: 84, height: 84, borderRadius: 14, opacity: 0.9 }} contentFit="cover" /> : null}
                <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: fg, opacity: 0.9 }}>{o.title}</Text>
                <Text style={{ fontSize: 22, fontWeight: "900", color: dark ? "#fff" : ROSE[600], marginTop: 4 }}>{o.discount_label || `${o.discount}% OFF`}</Text>
                {o.subtitle ? <Text numberOfLines={1} style={{ fontSize: 11, color: fg, opacity: 0.85, marginTop: 2 }}>{o.subtitle}</Text> : null}
                <View style={{ position: "absolute", left: 16, bottom: 14, height: 28, width: 28, borderRadius: 14, backgroundColor: dark ? "rgba(255,255,255,0.25)" : PRIMARY[700], alignItems: "center", justifyContent: "center" }}><ArrowRight size={13} color="#fff" /></View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function CustomBanner({ sec, navigate }: { sec: any; navigate: Nav }) {
  const d = sec.data || {};
  return (
    <Pressable testID={`app-custom-${sec.key.split(":")[1]}`} onPress={() => navigate(d.link || "/services")} style={{ marginHorizontal: 20, marginBottom: 28, borderRadius: 22, overflow: "hidden", backgroundColor: PRIMARY[700], minHeight: 140 }}>
      {d.image ? <Image source={{ uri: d.image }} style={{ width: "100%", height: 150 }} contentFit="cover" transition={200} /> : null}
      {d.title || d.subtitle ? <View style={{ padding: 16, position: d.image ? "absolute" : "relative", left: 0, right: 0, bottom: 0 }}>{d.title ? <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>{d.title}</Text> : null}{d.subtitle ? <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13, marginTop: 2 }}>{d.subtitle}</Text> : null}</View> : null}
    </Pressable>
  );
}

export const Icons = { Zap, Sparkles, ChevronRight };
