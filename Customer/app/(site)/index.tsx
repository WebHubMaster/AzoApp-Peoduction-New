/** Landing — 1:1 port of web_panel/src/pages/customer/Landing.jsx (mobile view). */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { MapPin } from "lucide-react-native";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { useAuth } from "@/src/context/AuthContext";
import { PRIMARY, SLATE } from "@/src/theme";
import { useCity, detectLocation, getLocationName } from "@/src/lib/location";
import { Container, RowSkeleton, ErrorState, Sk } from "@/src/components/site/ui";
import HomeHero, { TrustBar, LocationHint, CategoriesSection, ServicesSection, BannersSection, CategoryServicesSheet } from "@/src/components/site/HomeSections";
import { Promotions, ReviewsSection, GrowCta, FaqSection, BlogSection, SiteFooter } from "@/src/components/site/HomeBlocks";
import { LocationButton } from "@/src/components/site/SiteNavbar";

let sessionDismissed = false;

function LocationGate() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "locating" | "error" | "out_of_area">("idle");
  const [err, setErr] = useState("");
  const [oos, setOos] = useState<any>(null);
  useEffect(() => {
    storage.getItem("azo_location").then((has) => { if (!has && !getLocationName() && !sessionDismissed) setTimeout(() => setOpen(true), 900); });
  }, []);
  const dismiss = () => { sessionDismissed = true; setOpen(false); };
  const allow = async () => {
    setStatus("locating"); setErr("");
    const r = await detectLocation();
    if (r.ok) { setStatus("idle"); setOpen(false); return; }
    if ("outOfArea" in r) { setOos(r.outOfArea); setStatus("out_of_area"); return; }
    setStatus("error"); setErr(r.error);
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.4)", alignItems: "center", justifyContent: "center", padding: 16 }} onPress={dismiss}>
        <Pressable testID="location-gate" onPress={() => {}} style={{ backgroundColor: "#fff", borderRadius: 24, width: "100%", maxWidth: 384, padding: 28, alignItems: "center", boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.25)" }}>
          {status === "out_of_area" && oos ? (
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontWeight: "700", fontSize: 20, color: SLATE[900] }}>We&apos;re not in {oos.city} yet</Text>
              <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 8, textAlign: "center" }}>Currently serving: {(oos.servicedCities || []).join(", ") || "select cities"}. We&apos;ll notify you when we launch nearby.</Text>
              <Pressable onPress={dismiss} style={{ marginTop: 20, height: 44, paddingHorizontal: 24, borderRadius: 6, backgroundColor: PRIMARY[700], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "500" }}>Okay</Text></Pressable>
            </View>
          ) : (
            <>
              <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center", marginBottom: 16 }}><MapPin size={32} color={PRIMARY[700]} /></View>
              <Text style={{ fontWeight: "700", fontSize: 20, color: SLATE[900] }}>Allow location access</Text>
              <Text style={{ fontSize: 14, color: SLATE[500], marginTop: 8, textAlign: "center", lineHeight: 20 }}>We use your location to show services available near you and to help professionals reach your doorstep faster.</Text>
              {status === "error" ? <Text testID="loc-error" style={{ fontSize: 12, color: "#DC2626", marginTop: 12, textAlign: "center", lineHeight: 18 }}>{err}</Text> : null}
              <Pressable testID="loc-allow" onPress={allow} disabled={status === "locating"} style={({ pressed }) => ({ width: "100%", marginTop: 20, height: 44, borderRadius: 6, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: status === "locating" ? 0.7 : 1 })}>
                <Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>{status === "locating" ? "Detecting your location…" : status === "error" ? "Retry" : "Allow location"}</Text>
              </Pressable>
              <Pressable testID="loc-skip" onPress={dismiss} style={{ marginTop: 12 }}><Text style={{ fontSize: 14, color: SLATE[500], fontWeight: "500" }}>Not now</Text></Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MemberSavingsBanner() {
  const { user } = useAuth();
  const [info, setInfo] = useState<any>(null);
  useEffect(() => { if (!user) { setInfo(null); return; } api.get("/memberships/me").then((r) => setInfo(r || null)).catch(() => setInfo(null)); }, [user]);
  if (!info || !info.active) return null;
  const saved = Number(info.total_saved || 0);
  const plan = info.membership?.plan_name || info.membership?.slug || "Member";
  return (
    <Container testID="home-member-savings" style={{ paddingTop: 24 }}>
      <View style={{ borderRadius: 16, backgroundColor: "#059669", paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Text style={{ fontSize: 24 }}>🎉</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 18, lineHeight: 22 }}>{saved > 0 ? `You've saved ₹${saved.toLocaleString("en-IN")} as a member` : `You're a ${plan} member`}</Text>
          <Text style={{ color: "#ECFDF5", fontSize: 13 }}>Enjoy member discounts & free visits on every booking · {plan}</Text>
        </View>
      </View>
    </Container>
  );
}

export default function Landing() {
  const router = useRouter();
  const city = useCity();
  const [sections, setSections] = useState<any[] | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [error, setError] = useState(false);
  const [sheetCat, setSheetCat] = useState<any>(null);
  const [locOpen, setLocOpen] = useState(false);
  const navigate = (p: string) => router.push(p as any);

  const load = useCallback(() => {
    setError(false);
    api.get<any[]>("/catalog/categories", { auth: false }).then((r) => setCategories(r || [])).catch(() => {});
    api.get<any[]>(`/site/homepage${city ? `?city=${encodeURIComponent(city)}` : ""}`, { auth: false })
      .then((r) => setSections(Array.isArray(r) ? r : []))
      .catch(() => { setError(true); setSections((s) => s || []); });
  }, [city]);
  useEffect(() => { load(); }, [load]);

  const secs = sections || [];
  const heroBanners = (secs.find((s) => s.type === "hero_banner") || {}).data || [];
  const faqSec = secs.find((s) => s.type === "faq") || {};
  const blogSec = secs.find((s) => ["blog", "latest_blogs", "blogs", "insights"].includes(s.type)) || {};
  const loaded = sections !== null;
  const SERVICE_TYPES = ["featured_services", "trending_services", "most_requested", "recommended_services", "service_collection"];
  const serviceTone = new Map<string, "white" | "tint">();
  secs.filter((s) => SERVICE_TYPES.includes(s.type)).forEach((s, i) => serviceTone.set(s.id, (i + 1) % 2 === 0 ? "tint" : "white"));

  return (
    <ScrollView testID="landing-page" style={{ flex: 1, backgroundColor: "#fff" }} contentContainerStyle={{ paddingBottom: 64 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <HomeHero categories={categories} banners={heroBanners} loaded={loaded} navigate={navigate} city={city} onCategory={setSheetCat} />
      <TrustBar />
      <LocationHint city={city} onPick={() => setLocOpen(true)} />
      {locOpen ? <Container style={{ paddingTop: 12 }}><LocationButton testID="home-location-picker" /></Container> : null}
      <MemberSavingsBanner />

      {!loaded ? (
        <Container testID="home-skeleton" style={{ paddingVertical: 48, gap: 40 }}>
          <View><Sk style={{ height: 28, width: 256, marginBottom: 24 }} /><RowSkeleton count={6} w={176} h={220} /></View>
          <View><Sk style={{ height: 28, width: 224, marginBottom: 24 }} /><RowSkeleton count={4} /></View>
        </Container>
      ) : null}
      {error && loaded && secs.length === 0 ? <Container style={{ paddingVertical: 40 }}><ErrorState onRetry={load} text="We couldn't load the homepage content." /></Container> : null}

      {secs.map((sec) => {
        if (["popular_categories", "featured_categories", "category_slider"].includes(sec.type)) return <CategoriesSection key={sec.id} sec={sec} navigate={navigate} onCategory={setSheetCat} />;
        if (SERVICE_TYPES.includes(sec.type)) return <ServicesSection key={sec.id} sec={sec} navigate={navigate} city={city} tone={serviceTone.get(sec.id) || "white"} />;
        if (["promo_banner", "slider"].includes(sec.type)) return <BannersSection key={sec.id} sec={sec} navigate={navigate} />;
        return null;
      })}

      <Promotions />
      <ReviewsSection />
      <GrowCta navigate={navigate} />
      <FaqSection title={faqSec.title} subtitle={faqSec.subtitle} seeded={faqSec.data} />
      {blogSec.enabled !== false ? <BlogSection title={blogSec.title} subtitle={blogSec.subtitle} seeded={blogSec.data} limit={blogSec.config?.limit || 3} /> : null}
      <SiteFooter navigate={navigate} />
      <LocationGate />
      <CategoryServicesSheet category={sheetCat} onClose={() => setSheetCat(null)} navigate={navigate} />
    </ScrollView>
  );
}
