/** Ports of home/HomeHero.jsx (+TrustBar) and home/HomeSections.jsx — mobile breakpoint. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ShieldCheck, Star, Wrench, BadgeCheck, Clock, IndianRupee, Users, ArrowRight, MapPin, X } from "lucide-react-native";
import { api, mediaUrl } from "@/src/api/client";
import { fmt } from "@/src/lib/format";
import { useSiteConfig } from "@/src/context/BrandContext";
import { PRIMARY, SLATE, AMBER, EMERALD } from "@/src/theme";
import { Container, SectionHead, Scroller, EmptyState, Sk, LucideByName, compactNum, isPositive } from "@/src/components/site/ui";
import { ServiceSearch } from "@/src/components/site/ServiceSearch";

type Nav = (path: string) => void;
const ring = { borderWidth: 1, borderColor: "rgba(226,232,240,0.8)" } as const;

function Stat({ Icon, bg, color, value, label, suffix }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Icon size={20} color={color} fill={Icon === Star ? color : "none"} /></View>
      <View><Text style={{ fontWeight: "800", fontSize: 20, lineHeight: 22, color: SLATE[900] }}>{value}{suffix ? <Text style={{ color: AMBER[500] }}>{suffix}</Text> : null}</Text><Text style={{ fontSize: 12, color: SLATE[500], marginTop: 4 }}>{label}</Text></View>
    </View>
  );
}

export default function HomeHero({ categories, banners, loaded, navigate, city, onCategory }: { categories: any[]; banners: any[]; loaded: boolean; navigate: Nav; city: string; onCategory: (c: any) => void }) {
  const { stats = {}, branding } = useSiteConfig();
  const tiles = useMemo(() => (categories || []).filter((c) => c.show_on_home !== false).slice(0, 8), [categories]);
  const visuals = (banners || []).filter((b) => b.desktop_image || b.image || b.mobile_image).slice(0, 3);
  const rating = compactNum(stats.rating), jobs = compactNum(stats.jobs_done), pros = compactNum(stats.verified_partners ?? stats.partners), reviews = compactNum(stats.reviews);
  const img = (b: any) => mediaUrl(b.mobile_image || b.desktop_image || b.image);
  return (
    <View testID="home-hero" style={{ backgroundColor: "#fff", overflow: "hidden" }}>
      <LinearGradient colors={["rgba(13,71,161,0.10)", "rgba(13,71,161,0.0)"]} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 560 }} />
      <Container style={{ paddingTop: 32, paddingBottom: 40, gap: 40 }}>
        <View>
          <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, backgroundColor: PRIMARY[50], borderWidth: 1, borderColor: PRIMARY[100], paddingHorizontal: 14, paddingVertical: 6 }}>
            <ShieldCheck size={16} color={PRIMARY[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[800] }}>{branding.tagline || `${branding.site_name || "AzoApp"} — verified home services`}</Text>
          </View>
          <Text testID="hero-title" style={{ fontWeight: "900", fontSize: 36, lineHeight: 38, letterSpacing: -0.8, color: SLATE[900], marginTop: 20 }}>Premium home services,{"\n"}<Text style={{ color: PRIMARY[700] }}>at your doorstep</Text></Text>
          <Text style={{ marginTop: 20, color: SLATE[500], fontSize: 16, lineHeight: 26 }}>Background-verified professionals, upfront pricing and on-time service{city ? <> in <Text style={{ fontWeight: "600", color: SLATE[700] }}>{city}</Text></> : ""}. Book in seconds, pay securely.</Text>
          <View style={{ marginTop: 28, zIndex: 30 }}>
            <ServiceSearch variant="hero" placeholder="Search for AC service, cleaning, electrician…" />
            <View testID="hero-quick-links" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 12, color: SLATE[400], fontWeight: "500" }}>Popular:</Text>
              {!loaded ? [0, 1, 2, 3].map((i) => <Sk key={i} style={{ height: 28, width: 96, borderRadius: 999 }} />) : null}
              {tiles.slice(0, 5).map((c) => (
                <Pressable key={c.id} testID={`hero-chip-${c.id}`} onPress={() => onCategory(c)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "600", color: SLATE[700] }}>{c.name}</Text></Pressable>
              ))}
            </View>
          </View>
          <View testID="hero-stats" style={{ marginTop: 32, flexDirection: "row", flexWrap: "wrap", columnGap: 32, rowGap: 16 }}>
            {rating && isPositive(stats.rating) ? <Stat Icon={Star} bg={AMBER[50]} color={AMBER[400]} value={rating} suffix="★" label={reviews && isPositive(stats.reviews) ? `${reviews} reviews` : "Average rating"} /> : null}
            {jobs !== null ? <Stat Icon={BadgeCheck} bg={PRIMARY[50]} color={PRIMARY[700]} value={jobs} label="Jobs completed" /> : null}
            {pros !== null ? <Stat Icon={Users} bg={EMERALD[50]} color={EMERALD[600]} value={pros} label="Verified pros" /> : null}
          </View>
        </View>

        {visuals.length > 0 ? (
          <View testID="hero-visuals" style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", gap: 12, height: 320 }}>
              <Pressable testID="hero-visual-0" onPress={() => visuals[0].link && navigate(visuals[0].link)} style={{ flex: 1, borderRadius: 28, overflow: "hidden", ...ring, backgroundColor: SLATE[100] }}>
                <Image source={{ uri: img(visuals[0]) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(15,23,42,0.7)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" }} />
                <View style={{ position: "absolute", bottom: 16, left: 16, right: 16 }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 18, lineHeight: 22 }}>{visuals[0].title}</Text>{visuals[0].subtitle ? <Text numberOfLines={1} style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 }}>{visuals[0].subtitle}</Text> : null}</View>
              </Pressable>
              {visuals.length > 1 ? (
                <View style={{ flex: 1, gap: 12 }}>
                  {visuals.slice(1).map((b) => (
                    <Pressable key={b.id} onPress={() => b.link && navigate(b.link)} style={{ flex: 1, borderRadius: 28, overflow: "hidden", ...ring, backgroundColor: SLATE[100] }}>
                      <Image source={{ uri: img(b) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
                      <LinearGradient colors={["transparent", "rgba(15,23,42,0.7)"]} style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "60%" }} />
                      <Text style={{ position: "absolute", bottom: 12, left: 16, right: 16, color: "#fff", fontWeight: "700", fontSize: 14, lineHeight: 18 }}>{b.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            {pros !== null ? (
              <View style={{ position: "absolute", bottom: -20, left: 20, backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: SLATE[100], boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1)" }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: EMERALD[50], alignItems: "center", justifyContent: "center" }}><ShieldCheck size={20} color={EMERALD[600]} /></View>
                <View><Text style={{ fontSize: 14, fontWeight: "700", color: SLATE[900] }}>Verified & insured</Text><Text style={{ fontSize: 12, color: SLATE[500], marginTop: 4 }}>{pros} background-checked pros</Text></View>
              </View>
            ) : null}
          </View>
        ) : (
          <View testID="hero-category-tiles" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {!loaded ? Array.from({ length: 8 }).map((_, i) => <Sk key={i} style={{ width: "22%", flexGrow: 1, aspectRatio: 1 }} />) : null}
            {tiles.map((c, i) => (
              <Pressable key={c.id} testID={`hero-cat-${i}`} onPress={() => onCategory(c)} style={{ width: "22%", flexGrow: 1, maxWidth: "23.5%", alignItems: "center" }}>
                <View style={{ width: "100%", aspectRatio: 1, borderRadius: 16, overflow: "hidden", backgroundColor: PRIMARY[50], borderWidth: 1, borderColor: SLATE[100], alignItems: "center", justifyContent: "center" }}>
                  {c.image ? <Image source={{ uri: mediaUrl(c.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <LucideByName name={c.icon} size={28} />}
                </View>
                <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: "600", color: SLATE[700], marginTop: 8, textAlign: "center", lineHeight: 14 }}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Container>
    </View>
  );
}

export function TrustBar() {
  const { stats = {} } = useSiteConfig();
  const rating = stats.rating && isPositive(stats.rating) ? `Rated ${stats.rating}★ by customers` : "Rated by real customers";
  const items: [any, string, string][] = [
    [ShieldCheck, "Verified Professionals", stats.verified_partners ? `${compactNum(stats.verified_partners)} KYC-verified experts` : "Background-checked experts"],
    [Star, "Quality Guaranteed", rating], [Clock, "On-time Service", "Live tracking, punctual arrival"], [IndianRupee, "Transparent Pricing", "Upfront quotes, no hidden charges"],
  ];
  return (
    <View testID="home-trust" style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: SLATE[100], backgroundColor: "rgba(248,250,252,0.7)" }}>
      <Container style={{ paddingVertical: 20, flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {items.map(([Icon, t, s]) => (
          <View key={t} style={{ width: "47%", flexGrow: 1, flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}><Icon size={20} color={PRIMARY[700]} strokeWidth={1.6} /></View>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "600", color: SLATE[900], fontSize: 14, lineHeight: 18 }}>{t}</Text><Text numberOfLines={1} style={{ fontSize: 12, color: SLATE[500], marginTop: 2 }}>{s}</Text></View>
          </View>
        ))}
      </Container>
    </View>
  );
}

export function LocationHint({ city, onPick }: { city: string; onPick: () => void }) {
  if (city) return null;
  return (
    <Pressable testID="home-location-hint" onPress={onPick}>
      <Container style={{ paddingTop: 24 }}>
        <View style={{ borderRadius: 16, backgroundColor: PRIMARY[50], borderWidth: 1, borderColor: PRIMARY[100], paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><MapPin size={16} color={PRIMARY[700]} /></View>
          <Text style={{ flex: 1, fontSize: 14, color: SLATE[700] }}><Text style={{ fontWeight: "600" }}>Set your location</Text> to see services, partners and offers available near you.</Text>
          <ArrowRight size={16} color={PRIMARY[700]} />
        </View>
      </Container>
    </Pressable>
  );
}

export function CategoryCard({ c, onOpen, testID }: { c: any; onOpen: (c: any) => void; testID?: string }) {
  return (
    <Pressable testID={testID} onPress={() => onOpen(c)} style={{ width: 150, borderRadius: 24, backgroundColor: "#fff", ...ring, padding: 10 }}>
      <View style={{ aspectRatio: 1, borderRadius: 16, overflow: "hidden", backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center" }}>
        {c.image ? <Image source={{ uri: mediaUrl(c.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <LucideByName name={c.icon} size={36} />}
      </View>
      <View style={{ paddingHorizontal: 6, paddingTop: 12, paddingBottom: 4 }}>
        <Text numberOfLines={1} style={{ fontWeight: "600", color: SLATE[900], fontSize: 14 }}>{c.name}</Text>
        <Text style={{ fontSize: 11, color: SLATE[500], marginTop: 2 }}>{c.service_count > 0 ? `${c.service_count} service${c.service_count === 1 ? "" : "s"}` : "Explore"}</Text>
      </View>
    </Pressable>
  );
}

export function ServiceCard({ s, navigate, badge, testID }: { s: any; navigate: Nav; badge?: string; testID?: string }) {
  const hasOff = s.discounted_price > 0 && s.discounted_price < s.base_price;
  const price = hasOff ? s.discounted_price : s.base_price;
  const off = hasOff ? Math.round((1 - s.discounted_price / s.base_price) * 100) : 0;
  const rating = Number(s.rating) > 0 ? Number(s.rating).toFixed(1) : null;
  const dur = s.duration_min >= 60 ? `${Math.floor(s.duration_min / 60)}h${s.duration_min % 60 ? ` ${s.duration_min % 60}m` : ""}` : `${s.duration_min} min`;
  return (
    <Pressable testID={testID} onPress={() => navigate(`/(site)/service/${s.id}`)} style={{ width: 240, borderRadius: 24, backgroundColor: "#fff", ...ring, overflow: "hidden" }}>
      <View style={{ height: 170, backgroundColor: SLATE[100] }}>
        {s.image ? <Image source={{ uri: mediaUrl(s.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Wrench size={32} color={SLATE[300]} /></View>}
        <View style={{ position: "absolute", top: 12, left: 12, flexDirection: "row", gap: 6 }}>
          {off > 0 ? <Text style={{ backgroundColor: PRIMARY[700], color: "#fff", fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>{off}% OFF</Text> : null}
          {badge ? <Text style={{ backgroundColor: "rgba(255,255,255,0.95)", color: SLATE[900], fontSize: 11, fontWeight: "700", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>{badge}</Text> : null}
        </View>
        {rating ? <View style={{ position: "absolute", bottom: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}><Star size={14} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[900] }}>{rating}{s.review_count > 0 ? <Text style={{ color: SLATE[400], fontWeight: "500" }}> ({compactNum(s.review_count)})</Text> : null}</Text></View> : null}
      </View>
      <View style={{ padding: 16, flex: 1 }}>
        {s.category_name ? <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, color: PRIMARY[700] }}>{s.category_name}</Text> : null}
        <Text numberOfLines={2} style={{ fontWeight: "700", color: SLATE[900], marginTop: 4, fontSize: 16, lineHeight: 21 }}>{s.name}</Text>
        {s.duration_min > 0 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}><Clock size={12} color={SLATE[500]} /><Text style={{ fontSize: 12, color: SLATE[500] }}>{dur}</Text></View> : null}
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
          <View><Text style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "700", color: SLATE[400] }}>Starts at</Text><View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}><Text style={{ fontWeight: "800", fontSize: 18, color: SLATE[900] }}>{fmt(price)}</Text>{off > 0 ? <Text style={{ fontSize: 12, color: SLATE[400], textDecorationLine: "line-through" }}>{fmt(s.base_price)}</Text> : null}</View></View>
          <View style={{ height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: PRIMARY[50], flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: PRIMARY[700], fontSize: 12, fontWeight: "700" }}>Book</Text><ArrowRight size={14} color={PRIMARY[700]} /></View>
        </View>
      </View>
    </Pressable>
  );
}

export function CategoriesSection({ sec, navigate, onCategory }: { sec: any; navigate: Nav; onCategory: (c: any) => void }) {
  const data = sec.data || [];
  return (
    <View testID="home-categories" style={{ paddingVertical: 40 }}>
      <Container>
        <SectionHead eyebrow={sec.subtitle || "Categories"} title={sec.title || "What do you need today?"} onSeeAll={() => navigate("/(site)/services")} />
        {data.length === 0 ? <EmptyState title="No categories available yet" subtitle="Services will appear here as soon as they are published." /> : (
          <Scroller testID="home-categories-row">{data.map((c: any, i: number) => <CategoryCard key={c.id} c={c} onOpen={onCategory} testID={`home-cat-${i}`} />)}</Scroller>
        )}
      </Container>
    </View>
  );
}

export function ServicesSection({ sec, navigate, city, tone = "white" }: { sec: any; navigate: Nav; city: string; tone?: "white" | "tint" }) {
  const data = sec.data || [];
  const trending = sec.type === "trending_services";
  const cfg = sec.config || {};
  const cityBased = trending && cfg.city_based && city;
  const title = sec.title || (trending ? (cityBased ? `Popular services near ${city}` : "Trending services") : "Services");
  const eyebrow = trending ? (cfg.demand_based ? `Based on real bookings${cityBased ? ` near ${city}` : ""}` : sec.subtitle || "Popular") : sec.subtitle || "Handpicked";
  return (
    <View testID={`home-${sec.type}`} style={{ paddingVertical: 40, backgroundColor: tone === "tint" ? "rgba(248,250,252,0.7)" : "transparent", borderTopWidth: tone === "tint" ? 1 : 0, borderBottomWidth: tone === "tint" ? 1 : 0, borderColor: SLATE[100] }}>
      <Container>
        <SectionHead eyebrow={eyebrow} title={title} onSeeAll={() => navigate("/(site)/services")} />
        {data.length === 0 ? <EmptyState title={trending ? "No trending services yet" : "No services to show right now"} subtitle="Check back soon or browse all services." /> : (
          <Scroller testID={`home-${sec.type}-row`}>{data.map((s: any, i: number) => <ServiceCard key={s.id} s={s} navigate={navigate} testID={`home-${sec.type}-${i}`} />)}</Scroller>
        )}
      </Container>
    </View>
  );
}

export function BannersSection({ sec, navigate }: { sec: any; navigate: Nav }) {
  const data = (sec.data || []).filter((b: any) => b.desktop_image || b.image || b.mobile_image);
  if (!data.length) return null;
  return (
    <View testID="home-banners" style={{ paddingVertical: 24 }}>
      <Container>
        {sec.title || sec.subtitle ? <SectionHead eyebrow={sec.subtitle} title={sec.title} /> : null}
        <Scroller testID="home-banners-row">
          {data.map((b: any) => (
            <Pressable key={b.id} testID={`home-banner-${b.id}`} onPress={() => (b.link || b.button_url) && navigate(b.link || b.button_url)} style={{ width: 320, height: 200, borderRadius: 24, overflow: "hidden", backgroundColor: SLATE[900], ...ring }}>
              <Image source={{ uri: mediaUrl(b.mobile_image || b.desktop_image || b.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              <LinearGradient colors={["rgba(15,23,42,0.8)", "rgba(15,23,42,0.3)", "transparent"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, padding: 24, justifyContent: "flex-end" }}>
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 20, lineHeight: 24 }}>{b.title}</Text>
                {b.subtitle ? <Text style={{ color: SLATE[200], fontSize: 14, marginTop: 4 }}>{b.subtitle}</Text> : null}
                {b.cta_text || b.link ? <View style={{ marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12 }}><Text style={{ color: SLATE[900], fontSize: 14, fontWeight: "700" }}>{b.cta_text || "Explore"}</Text><ArrowRight size={16} color={SLATE[900]} /></View> : null}
              </View>
            </Pressable>
          ))}
        </Scroller>
      </Container>
    </View>
  );
}

/** Port of components/CategoryServicesSheet.jsx — bottom sheet with GET /catalog/services?category_id= */
export function CategoryServicesSheet({ category, onClose, navigate }: { category: any; onClose: () => void; navigate: Nav }) {
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!category) return;
    setLoading(true); setServices([]);
    api.get<any[]>(`/catalog/services?category_id=${category.id}`, { auth: false }).then((r) => setServices(r || [])).catch(() => setServices([])).finally(() => setLoading(false));
  }, [category]);
  const go = (s: any) => { onClose(); navigate(`/(site)/service/${s.id}`); };
  return (
    <Modal visible={!!category} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.5)" }} onPress={onClose} />
      <View testID="category-services-sheet" style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%", paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: SLATE[100] }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center" }}>{category?.image ? <Image source={{ uri: mediaUrl(category.image) }} style={{ width: 44, height: 44 }} contentFit="cover" /> : <LucideByName name={category?.icon} size={22} />}</View>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 18, color: SLATE[900] }}>{category?.name}</Text><Text style={{ fontSize: 12, color: SLATE[500], marginTop: 2 }}>{loading ? "Loading services…" : `${services.length} service${services.length === 1 ? "" : "s"} available`}</Text></View>
          <Pressable testID="category-sheet-close" onPress={onClose} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: SLATE[100], alignItems: "center", justifyContent: "center" }}><X size={18} color={SLATE[600]} /></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {loading ? <View style={{ alignItems: "center", paddingVertical: 40 }}><ActivityIndicator color={PRIMARY[700]} /><Text style={{ fontSize: 14, color: SLATE[500], marginTop: 12 }}>Fetching services…</Text></View>
            : services.length === 0 ? <EmptyState title="No services in this category yet" subtitle="Please check back soon." />
            : services.map((s) => (
              <Pressable key={s.id} testID={`sheet-svc-${s.id}`} onPress={() => go(s)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, ...ring, backgroundColor: "#fff" }}>
                <View style={{ width: 56, height: 56, borderRadius: 12, overflow: "hidden", backgroundColor: SLATE[100] }}>{s.image ? <Image source={{ uri: mediaUrl(s.image) }} style={{ width: 56, height: 56 }} contentFit="cover" /> : null}</View>
                <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontWeight: "700", fontSize: 14, color: SLATE[900] }}>{s.name}</Text>{s.duration_min > 0 ? <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 2 }}>{s.duration_min} min</Text> : null}<Text style={{ fontWeight: "800", fontSize: 14, color: PRIMARY[700], marginTop: 4 }}>{fmt(s.discounted_price > 0 && s.discounted_price < s.base_price ? s.discounted_price : s.base_price)}</Text></View>
                <ArrowRight size={18} color={PRIMARY[700]} />
              </Pressable>
            ))}
          <Pressable testID="category-sheet-seeall" onPress={() => { onClose(); navigate(`/(site)/services?category=${category?.id}`); }} style={{ marginTop: 8, height: 44, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>See all in {category?.name}</Text></Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}
