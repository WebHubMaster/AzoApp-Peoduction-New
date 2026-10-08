/** Customer App Home — admin-managed layout (GET /app/home), progressive rendering, offline-first cache. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { RefreshControl } from "@/src/components/RefreshNote";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, TC, useTheme } from "../../src/theme";
import { useCity } from "../../src/lib/location";
import { useAppHome } from "../../src/lib/appHome";
import { useNavigate } from "../../src/lib/navigate";
import { requestStartupPermissions } from "../../src/lib/permissions";
import SiteNavbar from "../../src/components/site/SiteNavbar";
import { AppSearchBar } from "../../src/components/apphome/AppHeader";
import { HeroSlider, CategoriesGrid, OfferBanner, QuickFeatures, ServicesRow, WhyChoose, SalonSection, OffersRow, CustomBanner } from "../../src/components/apphome/Blocks";
import { StoriesRow, StoryViewer } from "../../src/components/apphome/Stories";
import { CategoryServicesSheet } from "../../src/components/site/HomeSections";
import { Sk } from "../../src/components/site/ui";

let permissionsAsked = false;

export default function AppHome() {
  useTheme();
  const city = useCity();
  const { data, loading, error, refetch, refreshing } = useAppHome(city);
  const navigate = useNavigate();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [sheetCat, setSheetCat] = useState<any>(null);
  const [story, setStory] = useState<{ stories: any[]; index: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(3);
  const listRef = useRef<FlatList>(null);

  const qc = useQueryClient();
  useEffect(() => {
    if (!permissionsAsked) { permissionsAsked = true; requestStartupPermissions(); }
    qc.prefetchQuery({ queryKey: ["services-all"], queryFn: () => api.get<any[]>("/catalog/services", { auth: false }), staleTime: 60_000 });
    qc.prefetchQuery({ queryKey: ["categories"], queryFn: () => api.get<any[]>("/catalog/categories", { auth: false }), staleTime: 300_000 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));

  const blocks = useMemo(() => {
    if (!data) return [];
    const out: { key: string; render: () => React.ReactNode }[] = [];
    out.push({ key: "hero", render: () => <HeroSlider slides={data.hero_slides} stats={data.stats} navigate={navigate} /> });
    for (const sec of data.sections || []) {
      const k = sec.key;
      if (k === "categories") out.push({ key: k, render: () => <CategoriesGrid cats={sec.data || []} config={sec.config} onCategory={(c) => router.push({ pathname: "/(site)/category/[id]", params: { id: c.id, name: c.name } } as any)} onMore={() => navigate("/services")} /> });
      else if (k === "offer_banner") out.push({ key: k, render: () => <OfferBanner sec={sec} navigate={navigate} /> });
      else if (k === "quick_features") out.push({ key: k, render: () => <QuickFeatures items={sec.data || []} navigate={navigate} /> });
      else if (k === "most_booked") out.push({ key: k, render: () => <ServicesRow sec={sec} navigate={navigate} testID="app-most-booked" /> });
      else if (k === "trending") out.push({ key: k, render: () => <ServicesRow sec={sec} navigate={navigate} compact testID="app-trending" /> });
      else if (k === "why_choose") out.push({ key: k, render: () => <WhyChoose data={sec.data} /> });
      else if (k === "salon") out.push({ key: k, render: () => <SalonSection sec={sec} navigate={navigate} /> });
      else if (k === "offers") out.push({ key: k, render: () => <OffersRow sec={sec} navigate={navigate} /> });
      else if (k.startsWith("custom:")) out.push({ key: k, render: () => (sec.custom_type === "banner" ? <CustomBanner sec={sec} navigate={navigate} /> : sec.custom_type === "stories" ? <StoriesRow sec={sec} onOpen={(index) => setStory({ stories: sec.data || [], index })} /> : <ServicesRow sec={sec} navigate={navigate} testID={`app-custom-${sec.key.split(":")[1]}`} />) });
    }
    return out;
  }, [data, navigate, router]);

  // Progressive render: first 3 blocks instantly, then the rest — so the page always scrolls to the very bottom.
  useEffect(() => { if (!blocks.length) return; const t = setTimeout(() => setVisibleCount(blocks.length), 700); return () => clearTimeout(t); }, [blocks.length]);
  const shown = blocks.slice(0, visibleCount);

  return (
    <View style={{ flex: 1, backgroundColor: TC.surface }} testID="landing-page">
      <SiteNavbar hideSearch />
      <AppSearchBar onSubmit={(q) => router.push(`/(site)/services?q=${encodeURIComponent(q)}` as any)} />
      {loading ? (
        <View style={{ padding: 20, gap: 18 }} testID="app-home-skeleton">
          <Sk style={{ height: 280, borderRadius: 6 }} />
          <View style={{ flexDirection: "row", gap: 10 }}>{[0, 1, 2, 3, 4, 5].map((i) => <Sk key={i} style={{ flex: 1, height: 72 }} />)}</View>
          <Sk style={{ height: 150, borderRadius: 6 }} />
        </View>
      ) : error ? (
        <View style={{ padding: 24, alignItems: "center", gap: 10 }} testID="app-home-error">
          <Text style={{ fontSize: 14, color: TC.textMuted, textAlign: "center" }}>Couldn't load the home page. Check your connection.</Text>
          <Pressable onPress={() => refetch()} style={{ backgroundColor: PRIMARY[700], borderRadius: 6, paddingHorizontal: 16, height: 38, justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700" }}>Retry</Text></Pressable>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={shown}
          keyExtractor={(b) => b.key}
          renderItem={({ item }) => <View>{item.render()}</View>}
          initialNumToRender={3}
          windowSize={5}
          removeClippedSubviews={false}
          onEndReachedThreshold={0.6}
          onEndReached={() => setVisibleCount((c) => Math.min(blocks.length, c + 2))}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refetch()} tintColor={PRIMARY[700]} />}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 64 + insets.bottom + 28 }}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={visibleCount < blocks.length ? <View style={{ padding: 16 }}><Sk style={{ height: 120 }} /></View> : null}
        />
      )}
      <CategoryServicesSheet category={sheetCat} onClose={() => setSheetCat(null)} navigate={navigate} />
      {story ? <StoryViewer stories={story.stories} startIndex={story.index} onClose={() => setStory(null)} navigate={navigate} /> : null}
    </View>
  );
}
