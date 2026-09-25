/** Home screen blocks — all content comes from GET /app/home (admin CMS + live catalog). */
import React, { useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, useWindowDimensions, FlatList } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { Star, ArrowRight, Copy, ChevronRight, LayoutGrid, Zap, Shield, Sparkles } from "lucide-react-native";
import { PRIMARY, SLATE, AMBER, ORANGE, ROSE, EMERALD, VIOLET, shadowBtn } from "../../theme";
import { LucideByName, compactNum } from "../site/ui";
import { fmt } from "../../lib/format";
import { storage } from "../../utils/storage";
import { useToast } from "../Toast";

type Nav = (to: string) => void;
const card = { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200] } as const;

export function BlockTitle({ icon, title, onSeeAll, right, testID }: { icon?: string; title: string; onSeeAll?: () => void; right?: React.ReactNode; testID?: string }) {
  return (
    <View testID={testID} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 10, gap: 8 }}>
      {icon ? <LucideByName name={icon} size={18} color={icon === "flame" ? ORANGE[500] : icon === "map-pin" ? ROSE[500] : icon === "badge-percent" ? AMBER[500] : PRIMARY[700]} strokeWidth={2.2} /> : null}
      <Text style={{ fontSize: 16, fontWeight: "800", color: SLATE[900], flex: 1 }}>{title}</Text>
      {right}
      {onSeeAll ? <Pressable onPress={onSeeAll} style={{ flexDirection: "row", alignItems: "center", gap: 2 }}><Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[700] }}>See all</Text><ArrowRight size={13} color={PRIMARY[700]} /></Pressable> : null}
    </View>
  );
}

/* ---------------- Hero slider ---------------- */
export function HeroSlider({ slides, stats, navigate }: { slides: any[]; stats: any; navigate: Nav }) {
  const { width } = useWindowDimensions();
  const W = width - 32;
  const [idx, setIdx] = useState(0);
  if (!slides?.length) return null;
  return (
    <View testID="hero-slider" style={{ marginBottom: 16 }}>
      <FlatList data={slides} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(s) => s.id} snapToInterval={width} decelerationRate="fast"
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: s, index }) => (
          <View style={{ width, paddingHorizontal: 16 }}>
            <LinearGradient colors={[PRIMARY[50], "#E3F0FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: W, borderRadius: 20, overflow: "hidden", minHeight: 236, borderWidth: 1, borderColor: PRIMARY[100] }} testID={`hero-slide-${index}`}>
              {s.image ? <Image source={{ uri: s.image }} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: W * 0.48 }} contentFit="cover" contentPosition="bottom" transition={200} /> : null}
              {s.rating_value || stats?.rating ? (
                <View testID="hero-rating" style={{ position: "absolute", top: 14, right: 12, backgroundColor: "#fff", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: "center", ...shadowBtn }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Text style={{ fontSize: 15, fontWeight: "800", color: SLATE[900] }}>{s.rating_value || stats?.rating}</Text><Star size={13} color={AMBER[500]} fill={AMBER[500]} /></View>
                  <Text style={{ fontSize: 9, color: SLATE[500], fontWeight: "600" }}>{s.rating_label || "Customer Rating"}</Text>
                </View>
              ) : null}
              <View style={{ padding: 16, width: s.image ? W * 0.62 : W }}>
                {s.badge ? <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}><View style={{ height: 14, width: 14, borderRadius: 7, backgroundColor: EMERALD[500], alignItems: "center", justifyContent: "center" }}><Shield size={8} color="#fff" /></View><Text style={{ fontSize: 10, fontWeight: "700", color: SLATE[700] }}>{s.badge}</Text></View> : null}
                <Text testID="hero-title" style={{ fontSize: 26, fontWeight: "900", color: SLATE[900], marginTop: 10, lineHeight: 30 }}>{s.title}</Text>
                {s.highlight ? <Text style={{ fontSize: 26, fontWeight: "900", color: PRIMARY[700], lineHeight: 30 }}>{s.highlight}</Text> : null}
                {s.subtitle ? <Text style={{ fontSize: 12, color: SLATE[600], marginTop: 6, lineHeight: 17 }}>{s.subtitle}</Text> : null}
                {s.features?.length ? (
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                    {s.features.map((f: any, i: number) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <View style={{ height: 30, width: 30, borderRadius: 15, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><LucideByName name={f.icon} size={15} color="#fff" strokeWidth={2} /></View>
                        <View><Text style={{ fontSize: 10, fontWeight: "700", color: SLATE[800] }}>{f.title}</Text><Text style={{ fontSize: 9, color: SLATE[500] }}>{f.sub}</Text></View>
                      </View>
                    ))}
                  </View>
                ) : null}
                {s.cta_label ? (
                  <Pressable testID={`hero-cta-${index}`} onPress={() => navigate(s.cta_link || "/services")} style={{ marginTop: 14, alignSelf: "flex-start", backgroundColor: PRIMARY[700], borderRadius: 12, paddingHorizontal: 18, height: 40, flexDirection: "row", alignItems: "center", gap: 8, ...shadowBtn }}>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{s.cta_label}</Text><ArrowRight size={15} color="#fff" />
                  </Pressable>
                ) : null}
              </View>
              {s.side_text && s.image ? <Text style={{ position: "absolute", right: W * 0.36, top: 56, fontSize: 12, fontWeight: "700", color: SLATE[700], transform: [{ rotate: "-12deg" }], width: 90, textAlign: "center" }}>{s.side_text}</Text> : null}
            </LinearGradient>
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
  if (showMore) tiles.push({ id: "__more", name: config?.more_label || "More Services", more: true });
  const perPage = 12;
  const pages: any[][] = [];
  for (let i = 0; i < tiles.length; i += perPage) pages.push(tiles.slice(i, i + perPage));
  const [idx, setIdx] = useState(0);
  const tileW = (width - 32) / 6;
  return (
    <View testID="app-categories" style={{ marginBottom: 16 }}>
      <FlatList data={pages} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(_, i) => String(i)} onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: page }) => (
          <View style={{ width, paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap" }}>
            {page.map((c: any) => (
              <Pressable key={c.id} testID={c.more ? "app-cat-more" : `app-cat-${c.id}`} onPress={() => (c.more ? onMore() : onCategory(c))} style={{ width: tileW, alignItems: "center", paddingVertical: 8 }}>
                <View style={{ height: 52, width: 52, borderRadius: 26, backgroundColor: c.more ? PRIMARY[50] : SLATE[100], alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {c.more ? <LayoutGrid size={22} color={PRIMARY[700]} /> : c.image ? <Image source={{ uri: c.image }} style={{ height: 52, width: 52 }} contentFit="cover" transition={150} /> : <LucideByName name={c.icon} size={22} color={PRIMARY[700]} />}
                </View>
                <Text numberOfLines={2} style={{ fontSize: 10, fontWeight: "600", color: c.more ? PRIMARY[700] : SLATE[700], textAlign: "center", marginTop: 6, lineHeight: 13 }}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )} />
      {pages.length > 1 ? <Dots n={pages.length} i={idx} /> : null}
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
    <View testID="app-offer-banner" style={{ marginHorizontal: 16, marginBottom: 16 }}>
      <LinearGradient colors={["#FFF4E0", "#FFE9C7"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, overflow: "hidden", minHeight: 160, borderWidth: 1, borderColor: AMBER[200] }}>
        {(cfg.image || off.image) ? <Image source={{ uri: cfg.image || off.image }} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "46%" }} contentFit="cover" contentPosition="bottom" transition={200} /> : null}
        {label ? <View style={{ position: "absolute", right: 14, top: 40, backgroundColor: ROSE[500], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 8, alignItems: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>{label.split(" ")[0]}</Text><Text style={{ color: "#fff", fontWeight: "700", fontSize: 9 }}>{label.split(" ").slice(1).join(" ") || "OFF"}</Text></View> : null}
        <View style={{ padding: 16, width: "62%" }}>
          {cfg.eyebrow ? <View style={{ alignSelf: "flex-start", backgroundColor: ORANGE[500], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ color: "#fff", fontSize: 9, fontWeight: "800", letterSpacing: 0.5 }}>{cfg.eyebrow}</Text></View> : null}
          <Text style={{ fontSize: 19, fontWeight: "900", color: SLATE[900], marginTop: 8, lineHeight: 24 }}>{off.title || cfg.title || (label ? `Get Up to ${label}` : "")}</Text>
          {off.subtitle || off.description ? <Text numberOfLines={2} style={{ fontSize: 12, color: SLATE[600], marginTop: 2 }}>{off.subtitle || off.description}</Text> : null}
          {code ? (
            <Pressable testID="app-offer-copy" onPress={copy} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: AMBER[200] }}>
              <Text style={{ fontSize: 11, color: SLATE[500], fontWeight: "600" }}>Use Code</Text><Text style={{ fontSize: 14, fontWeight: "800", color: SLATE[900] }}>{code}</Text><Copy size={14} color={SLATE[500]} />
            </Pressable>
          ) : null}
          <Pressable testID="app-offer-cta" onPress={() => navigate(cfg.cta_link || "/services")} style={{ marginTop: 12, alignSelf: "flex-start", backgroundColor: PRIMARY[700], borderRadius: 10, paddingHorizontal: 16, height: 36, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{cfg.cta_label || "Book Now"}</Text><ArrowRight size={14} color="#fff" />
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10, marginBottom: 16 }} testID="app-quick-features">
      {items.map((q) => (
        <Pressable key={q.id} testID={`app-qf-${q.id}`} onPress={() => navigate(q.link || "/services")} style={{ ...card, flexDirection: "row", alignItems: "center", gap: 10, padding: 10, width: 170 }}>
          <View style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center" }}><LucideByName name={q.icon} size={18} color={PRIMARY[700]} strokeWidth={2} /></View>
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: SLATE[800] }}>{q.title}</Text><Text numberOfLines={1} style={{ fontSize: 10, color: SLATE[500] }}>{q.sub}</Text></View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/* ---------------- Service rows ---------------- */
export function ServiceTile({ s, navigate, compact, testID }: { s: any; navigate: Nav; compact?: boolean; testID?: string }) {
  const count = compactNum(s.rating_count || s.booking_count);
  return (
    <Pressable testID={testID} onPress={() => navigate(`/service/${s.id}`)} style={{ ...card, width: compact ? 128 : 136, overflow: "hidden" }}>
      <Image source={{ uri: s.image }} style={{ height: compact ? 82 : 96, width: "100%", backgroundColor: SLATE[100] }} contentFit="cover" transition={200} />
      <View style={{ padding: 8 }}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: SLATE[800] }}>{s.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
          <Star size={11} color={AMBER[500]} fill={AMBER[500]} /><Text style={{ fontSize: 10, fontWeight: "700", color: SLATE[700] }}>{Number(s.rating || 0).toFixed(1)}</Text>{count ? <Text style={{ fontSize: 10, color: SLATE[400] }}>({count})</Text> : null}
        </View>
        <Text style={{ fontSize: 11, color: SLATE[500], marginTop: 3 }}>From <Text style={{ fontSize: 13, fontWeight: "800", color: SLATE[900] }}>{fmt(s.base_price)}</Text></Text>
        {!compact ? (
          <Pressable testID={`${testID}-book`} onPress={() => navigate(`/service/${s.id}`)} style={{ marginTop: 8, height: 30, borderRadius: 8, borderWidth: 1, borderColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: PRIMARY[700] }}>Book Now</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

export function ServicesRow({ sec, navigate, compact, testID }: { sec: any; navigate: Nav; compact?: boolean; testID: string }) {
  if (!sec.data?.length) return null;
  return (
    <View testID={testID} style={{ marginBottom: 16 }}>
      <BlockTitle icon={sec.icon} title={sec.title} onSeeAll={() => navigate("/services")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {sec.data.map((s: any, i: number) => <ServiceTile key={s.id} s={s} navigate={navigate} compact={compact} testID={`${testID}-${i}`} />)}
      </ScrollView>
    </View>
  );
}

/* ---------------- Why choose ---------------- */
export function WhyChoose({ data }: { data: any }) {
  const items = data?.items || [];
  return (
    <View testID="app-why-choose" style={{ marginHorizontal: 16, marginBottom: 16 }}>
      <LinearGradient colors={[PRIMARY[50], "#EEF5FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, overflow: "hidden", borderWidth: 1, borderColor: PRIMARY[100] }}>
        {data?.image ? <Image source={{ uri: data.image }} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "38%" }} contentFit="cover" transition={200} /> : null}
        <View style={{ padding: 16, width: data?.image ? "64%" : "100%" }}>
          <Text style={{ fontSize: 17, fontWeight: "900", color: SLATE[900] }}>{data?.title}</Text>
          {data?.side_text && !data?.image ? <Text style={{ fontSize: 12, color: SLATE[600], marginTop: 2 }}>{data.side_text}</Text> : null}
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 12, rowGap: 12 }}>
            {items.map((it: any, i: number) => (
              <View key={i} style={{ width: items.length >= 5 ? "33%" : "50%", alignItems: "center", paddingHorizontal: 4 }}>
                <View style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", ...shadowBtn }}><LucideByName name={it.icon} size={19} color={PRIMARY[700]} strokeWidth={2} /></View>
                <Text style={{ fontSize: 10, fontWeight: "600", color: SLATE[700], textAlign: "center", marginTop: 6, lineHeight: 13 }}>{it.title}</Text>
              </View>
            ))}
          </View>
        </View>
        {data?.image && data?.side_text ? <Text style={{ position: "absolute", right: 14, top: 16, width: "30%", fontSize: 11, fontWeight: "700", color: SLATE[800], textAlign: "right" }}>{data.side_text}</Text> : null}
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
    <View testID="app-salon" style={{ marginBottom: 16 }}>
      <BlockTitle icon={sec.icon} title={sec.title} onSeeAll={() => navigate(cur?.category_id ? `/services?category=${cur.category_id}` : "/services")}
        right={<View style={{ flexDirection: "row", gap: 6 }}>{tabs.map((tab: any, i: number) => (
          <Pressable key={i} testID={`app-salon-tab-${i}`} onPress={() => setT(i)} style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: i === t ? VIOLET[500] : "#fff", borderWidth: 1, borderColor: i === t ? VIOLET[500] : SLATE[200], justifyContent: "center" }}>
            <Text style={{ fontSize: 10, fontWeight: "700", color: i === t ? "#fff" : SLATE[600] }}>{tab.label}</Text>
          </Pressable>
        ))}</View>} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
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
    <View testID="app-offers" style={{ marginBottom: 16 }}>
      <BlockTitle icon={sec.icon} title={sec.title} onSeeAll={() => navigate("/offers")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
        {sec.data.map((o: any, i: number) => {
          const g = OFFER_GRADS[i % OFFER_GRADS.length];
          const dark = i % OFFER_GRADS.length !== 1;
          const fg = dark ? "#fff" : SLATE[900];
          return (
            <Pressable key={o.id} testID={`app-offer-${o.id}`} onPress={async () => { if (o.code) { await Clipboard.setStringAsync(o.code); storage.setItem("azo_coupon", o.code); toast.success(`Code ${o.code} copied — apply at checkout`); } navigate(o.link || "/services"); }}>
              <LinearGradient colors={g as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 168, height: 112, borderRadius: 16, padding: 12, overflow: "hidden" }}>
                {o.image ? <Image source={{ uri: o.image }} style={{ position: "absolute", right: -6, bottom: -6, width: 70, height: 70, borderRadius: 12, opacity: 0.9 }} contentFit="cover" /> : null}
                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", color: fg, opacity: 0.9 }}>{o.title}</Text>
                <Text style={{ fontSize: 18, fontWeight: "900", color: dark ? "#fff" : ROSE[600], marginTop: 2 }}>{o.discount_label || `${o.discount}% OFF`}</Text>
                {o.subtitle ? <Text numberOfLines={1} style={{ fontSize: 10, color: fg, opacity: 0.85 }}>{o.subtitle}</Text> : null}
                <View style={{ position: "absolute", left: 12, bottom: 10, height: 24, width: 24, borderRadius: 12, backgroundColor: dark ? "rgba(255,255,255,0.25)" : PRIMARY[700], alignItems: "center", justifyContent: "center" }}><ArrowRight size={13} color="#fff" /></View>
              </LinearGradient>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export const Icons = { Zap, Sparkles, ChevronRight };
