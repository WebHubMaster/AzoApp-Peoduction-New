/** Category → all services of that category (GET /catalog/services?category_id=), rendered incrementally while scrolling. */
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Star, Clock } from "lucide-react-native";
import { api } from "../../../src/api/client";
import { PRIMARY, SLATE, AMBER } from "../../../src/theme";
import { fmt } from "../../../src/lib/format";
import { useNavigate } from "../../../src/lib/navigate";
import { Sk } from "../../../src/components/site/ui";

const PAGE = 8;

export default function CategoryServices() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigate = useNavigate();
  const { width } = useWindowDimensions();
  const cardW = (width - 40 - 14) / 2;
  const q = useQuery({ queryKey: ["cat-services", id], queryFn: () => api.get<any[]>(`/catalog/services?category_id=${id}`, { auth: false }), staleTime: 60_000, enabled: !!id });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get<any[]>("/catalog/categories", { auth: false }), staleTime: 300_000 });
  const cat = (cats.data || []).find((c) => c.id === id);
  const all = q.data || [];
  const [count, setCount] = useState(PAGE);
  useEffect(() => { setCount(PAGE); }, [id]);
  const rows = all.slice(0, count);
  const title = cat?.name || name || "Services";

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }} testID="category-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: SLATE[200] }}>
        <Pressable testID="category-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: SLATE[100] }}><ArrowLeft size={20} color={SLATE[700]} /></Pressable>
        {cat?.image ? <Image source={{ uri: cat.image }} style={{ height: 36, width: 36, borderRadius: 18 }} contentFit="cover" /> : null}
        <View style={{ flex: 1 }}>
          <Text testID="category-title" style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }} numberOfLines={1}>{title}</Text>
          <Text testID="category-count" style={{ fontSize: 12, color: SLATE[500] }}>{q.isLoading ? "Loading…" : `${all.length} service${all.length === 1 ? "" : "s"}`}</Text>
        </View>
      </View>
      {q.isLoading ? (
        <View style={{ padding: 20, flexDirection: "row", flexWrap: "wrap", gap: 14 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} style={{ width: cardW, height: 220, borderRadius: 18 }} />)}</View>
      ) : (
        <FlatList
          data={rows}
          numColumns={2}
          keyExtractor={(s) => s.id}
          columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingVertical: 20, gap: 14, paddingBottom: 40 }}
          initialNumToRender={PAGE}
          onEndReachedThreshold={0.5}
          onEndReached={() => setCount((c) => Math.min(all.length, c + PAGE))}
          ListEmptyComponent={<Text testID="category-empty" style={{ textAlign: "center", color: SLATE[500], marginTop: 40 }}>No services in this category yet.</Text>}
          ListFooterComponent={count < all.length ? <View testID="category-loading-more" style={{ paddingVertical: 16, alignItems: "center" }}><ActivityIndicator color={PRIMARY[700]} /></View> : null}
          renderItem={({ item: s, index }) => (
            <Pressable testID={`category-svc-${index}`} onPress={() => navigate(`/service/${s.id}`)} style={{ width: cardW, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: SLATE[200], overflow: "hidden" }}>
              <Image source={{ uri: s.image }} style={{ height: 120, width: "100%", backgroundColor: SLATE[100] }} contentFit="cover" transition={200} />
              <View style={{ padding: 12 }}>
                <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "700", color: SLATE[800], lineHeight: 18, minHeight: 36 }}>{s.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Star size={12} color={AMBER[500]} fill={AMBER[500]} /><Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[700] }}>{Number(s.rating || 0).toFixed(1)}</Text></View>
                  {s.duration_min ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Clock size={12} color={SLATE[400]} /><Text style={{ fontSize: 11, color: SLATE[500] }}>{s.duration_min} min</Text></View> : null}
                </View>
                <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 6 }}>From <Text style={{ fontSize: 15, fontWeight: "800", color: SLATE[900] }}>{fmt(s.base_price)}</Text></Text>
                <View style={{ marginTop: 12, height: 36, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Book Now</Text></View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
