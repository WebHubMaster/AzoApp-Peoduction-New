/** Category → all services of that category (GET /catalog/services?category_id=), rendered incrementally while scrolling. */
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Star, Clock, MapPinOff } from "lucide-react-native";
import { api } from "../../../src/api/client";
import { PRIMARY, SLATE, AMBER, TC, useTheme } from "../../../src/theme";
import { fmt } from "../../../src/lib/format";
import { useNavigate } from "../../../src/lib/navigate";
import { Sk } from "../../../src/components/site/ui";
import { useCity } from "../../../src/lib/location";

const PAGE = 8;

export default function CategoryServices() {
  useTheme();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigate = useNavigate();
  const { width } = useWindowDimensions();
  const cardW = (width - 40 - 14) / 2;
  const q = useQuery({ queryKey: ["cat-services", id], queryFn: () => api.get<any[]>(`/catalog/services?category_id=${id}`, { auth: false }), staleTime: 60_000, enabled: !!id });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get<any[]>("/catalog/categories", { auth: false }), staleTime: 300_000 });
  const meta = useQuery({ queryKey: ["cat-meta", id], queryFn: () => api.get<any>(`/catalog/category/${id}`), staleTime: 60_000, enabled: !!id });
  const city = useCity();
  const comingSoon = meta.data?.city_available === false;
  const cat = (cats.data || []).find((c) => c.id === id) || meta.data;
  const all = q.data || [];
  const [count, setCount] = useState(PAGE);
  useEffect(() => { setCount(PAGE); }, [id]);
  const rows = all.slice(0, count);
  const title = cat?.name || name || "Services";

  return (
    <View style={{ flex: 1, backgroundColor: TC.surface }} testID="category-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: TC.border }}>
        <Pressable testID="category-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: TC.surfaceAlt }}><ArrowLeft size={20} color={TC.text2} /></Pressable>
        {cat?.image ? <Image source={{ uri: cat.image }} style={{ height: 36, width: 36, borderRadius: 6 }} contentFit="cover" /> : null}
        <View style={{ flex: 1 }}>
          <Text testID="category-title" style={{ fontSize: 18, fontWeight: "800", color: TC.text }} numberOfLines={1}>{title}</Text>
          <Text testID="category-count" style={{ fontSize: 12, color: TC.textMuted }}>{comingSoon ? "Coming soon in your city" : q.isLoading ? "Loading…" : `${all.length} service${all.length === 1 ? "" : "s"}`}</Text>
        </View>
      </View>
      {comingSoon ? (
        <View testID="category-coming-soon" style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28 }}>
          <View style={{ height: 72, width: 72, borderRadius: 20, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", marginBottom: 16 }}><MapPinOff size={34} color="#D97706" /></View>
          <Text testID="category-coming-soon-badge" style={{ fontSize: 11, fontWeight: "800", letterSpacing: 1, color: "#B45309", backgroundColor: "#FFFBEB", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>COMING SOON</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", color: TC.text, textAlign: "center" }}>{title} is coming soon{city ? ` to ${city.split(",")[0]}` : " in your city"}</Text>
          <Text style={{ fontSize: 14, color: TC.textMuted, textAlign: "center", marginTop: 8, maxWidth: 340 }}>We're getting our professionals ready here. Meanwhile, explore other services available near you.</Text>
          <Pressable testID="category-coming-soon-browse" onPress={() => router.replace("/(site)/services" as any)} style={{ marginTop: 20, height: 46, paddingHorizontal: 24, borderRadius: 8, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>Browse available services</Text></Pressable>
        </View>
      ) : q.isLoading ? (
        <View style={{ padding: 20, flexDirection: "row", flexWrap: "wrap", gap: 14 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} style={{ width: cardW, height: 220, borderRadius: 6 }} />)}</View>
      ) : (
        <FlatList
          data={rows}
          numColumns={2}
          keyExtractor={(s) => s.id}
          columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingVertical: 20, gap: 14, paddingBottom: 110 }}
          initialNumToRender={PAGE}
          onEndReachedThreshold={0.5}
          onEndReached={() => setCount((c) => Math.min(all.length, c + PAGE))}
          ListEmptyComponent={<Text testID="category-empty" style={{ textAlign: "center", color: TC.textMuted, marginTop: 40 }}>No services in this category yet.</Text>}
          ListFooterComponent={count < all.length ? <View testID="category-loading-more" style={{ paddingVertical: 16, alignItems: "center" }}><ActivityIndicator color={TC.primaryText} /></View> : null}
          renderItem={({ item: s, index }) => (
            <View testID={`category-svc-${index}`} style={{ width: cardW, backgroundColor: TC.surface, borderRadius: 6, borderWidth: 1, borderColor: TC.border, overflow: "hidden" }}>
              <Pressable testID={`category-open-${index}`} onPress={() => navigate(`/service/${s.id}`)}>
                <Image source={{ uri: s.image }} style={{ height: 120, width: "100%", backgroundColor: TC.surfaceAlt }} contentFit="cover" transition={200} />
                <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
                  <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "700", color: TC.text, lineHeight: 18, minHeight: 36 }}>{s.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Star size={12} color={AMBER[500]} fill={AMBER[500]} /><Text style={{ fontSize: 12, fontWeight: "700", color: TC.text2 }}>{Number(s.rating || 0).toFixed(1)}</Text></View>
                    {s.duration_min ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Clock size={12} color={TC.textFaint} /><Text style={{ fontSize: 11, color: TC.textMuted }}>{s.duration_min} min</Text></View> : null}
                  </View>
                  <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 6 }}>From <Text style={{ fontSize: 15, fontWeight: "800", color: TC.text }}>{fmt(s.base_price)}</Text></Text>
                </View>
              </Pressable>
              <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 12 }}>
                <Pressable testID={`category-book-${index}`} onPress={() => navigate(`/service/${s.id}?book=1`)} style={{ height: 36, borderRadius: 6, borderWidth: 1.5, borderColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "700", color: TC.primaryText }}>Book Now</Text></Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
