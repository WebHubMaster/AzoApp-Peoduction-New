/** Services — port of web_panel/src/pages/customer/Services.jsx (mobile): search, category chips, service grid (incremental). */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, Pressable, TextInput, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Star, Clock, ShoppingBag, X } from "lucide-react-native";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, AMBER } from "../../src/theme";
import { fmt } from "../../src/lib/format";
import { useCart } from "../../src/context/CartContext";
import { Sk } from "../../src/components/site/ui";

const PAGE = 10;

export default function ServicesPage() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { count } = useCart();
  const cardW = (width - 40 - 14) / 2;
  const [q, setQ] = useState(String(params.q || ""));
  const [cat, setCat] = useState(String(params.category || ""));
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setQ(String(params.q || "")); setCat(String(params.category || "")); }, [params.q, params.category]);
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get<any[]>("/catalog/categories", { auth: false }), staleTime: 300_000 });
  const svcs = useQuery({ queryKey: ["services-all"], queryFn: () => api.get<any[]>("/catalog/services", { auth: false }), staleTime: 60_000 });
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (svcs.data || []).filter((s) => (!cat || s.category_id === cat) && (!term || `${s.name} ${s.category_name} ${s.description || ""}`.toLowerCase().includes(term)));
  }, [svcs.data, q, cat]);
  useEffect(() => { setShown(PAGE); }, [q, cat]);
  const catName = (cats.data || []).find((c) => c.id === cat)?.name;

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }} testID="services-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: SLATE[200], gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable testID="services-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 20, backgroundColor: SLATE[100] }}><ArrowLeft size={20} color={SLATE[700]} /></Pressable>
          <Text testID="services-title" style={{ fontSize: 18, fontWeight: "800", color: SLATE[900], flex: 1 }}>{catName || "All Services"}</Text>
          <Pressable testID="services-cart" onPress={() => router.push("/(site)/book" as any)} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ShoppingBag size={16} color={PRIMARY[700]} /><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[700] }}>Booking</Text>
            {count > 0 ? <View testID="services-cart-count" style={{ position: "absolute", top: -8, right: -8, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{count}</Text></View> : null}
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", height: 46, borderRadius: 14, backgroundColor: SLATE[50], borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 14, gap: 8 }}>
          <Search size={18} color={SLATE[400]} />
          <TextInput testID="services-search" value={q} onChangeText={setQ} placeholder="Search services…" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 14, color: SLATE[800], height: 44, outlineStyle: "none" } as any} />
          {q ? <Pressable onPress={() => setQ("")}><X size={16} color={SLATE[400]} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable testID="services-cat-all" onPress={() => setCat("")} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: !cat ? PRIMARY[700] : "#fff", borderWidth: 1, borderColor: !cat ? PRIMARY[700] : SLATE[200], justifyContent: "center" }}><Text style={{ fontSize: 13, fontWeight: "600", color: !cat ? "#fff" : SLATE[700] }}>All</Text></Pressable>
          {(cats.data || []).map((c) => (
            <Pressable key={c.id} testID={`services-cat-${c.id}`} onPress={() => setCat(c.id)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: cat === c.id ? PRIMARY[700] : "#fff", borderWidth: 1, borderColor: cat === c.id ? PRIMARY[700] : SLATE[200], justifyContent: "center" }}><Text style={{ fontSize: 13, fontWeight: "600", color: cat === c.id ? "#fff" : SLATE[700] }}>{c.name}</Text></Pressable>
          ))}
        </ScrollView>
      </View>
      {svcs.isLoading ? (
        <View style={{ padding: 20, flexDirection: "row", flexWrap: "wrap", gap: 14 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} style={{ width: cardW, height: 220, borderRadius: 18 }} />)}</View>
      ) : (
        <FlatList data={list.slice(0, shown)} numColumns={2} keyExtractor={(s) => s.id} columnWrapperStyle={{ gap: 14, paddingHorizontal: 20 }} contentContainerStyle={{ paddingVertical: 20, gap: 14, paddingBottom: 40 }}
          onEndReachedThreshold={0.5} onEndReached={() => setShown((n) => Math.min(list.length, n + PAGE))}
          ListHeaderComponent={<Text testID="services-count" style={{ paddingHorizontal: 20, marginBottom: 4, fontSize: 12, color: SLATE[500] }}>{list.length} service{list.length === 1 ? "" : "s"}{q ? ` for “${q}”` : ""}</Text>}
          ListEmptyComponent={<Text testID="services-empty" style={{ textAlign: "center", color: SLATE[500], marginTop: 40 }}>No services found.</Text>}
          renderItem={({ item: s, index }) => (
            <Pressable testID={`services-svc-${index}`} onPress={() => router.push(`/(site)/service/${s.id}` as any)} style={{ width: cardW, backgroundColor: "#fff", borderRadius: 18, borderWidth: 1, borderColor: SLATE[200], overflow: "hidden" }}>
              <Image source={{ uri: s.image }} style={{ height: 120, width: "100%", backgroundColor: SLATE[100] }} contentFit="cover" transition={200} />
              <View style={{ padding: 12 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: PRIMARY[700], textTransform: "uppercase", letterSpacing: 0.5 }} numberOfLines={1}>{s.category_name}</Text>
                <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "700", color: SLATE[800], lineHeight: 18, minHeight: 36, marginTop: 2 }}>{s.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Star size={12} color={AMBER[500]} fill={AMBER[500]} /><Text style={{ fontSize: 12, fontWeight: "700", color: SLATE[700] }}>{Number(s.rating || 0).toFixed(1)}</Text></View>
                  {s.duration_min ? <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}><Clock size={12} color={SLATE[400]} /><Text style={{ fontSize: 11, color: SLATE[500] }}>{s.duration_min} min</Text></View> : null}
                </View>
                <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 6 }}>From <Text style={{ fontSize: 15, fontWeight: "800", color: SLATE[900] }}>{fmt(s.discounted_price > 0 && s.discounted_price < s.base_price ? s.discounted_price : s.base_price)}</Text></Text>
                <View style={{ marginTop: 12, height: 36, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Book Now</Text></View>
              </View>
            </Pressable>
          )} />
      )}
    </View>
  );
}
