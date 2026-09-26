/** Services — 1:1 port of web Services.jsx: search, category chips, rate-card item results, services grouped by category, quick-add, "View your booking" bar. */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search, Star, Clock, ShoppingBag, X, Plus, Check, ChevronRight, Sparkles } from "lucide-react-native";
import { api } from "../../src/api/client";
import { PRIMARY, SLATE, AMBER, EMERALD } from "../../src/theme";
import { fmt } from "../../src/lib/format";
import { useCart } from "../../src/context/CartContext";
import { useToast } from "../../src/components/Toast";
import { Sk } from "../../src/components/site/ui";

function ServiceCard({ s, w }: { s: any; w: number }) {
  const router = useRouter();
  const toast = useToast();
  const { addService } = useCart();
  const [added, setAdded] = useState(false);
  const disc = s.discounted_price > 0 && s.discounted_price < s.base_price;
  const price = disc ? s.discounted_price : s.base_price;
  const off = disc ? Math.round((1 - s.discounted_price / s.base_price) * 100) : 0;
  const quickAdd = () => { addService(s, {}); setAdded(true); toast.success(`${s.name} added`); setTimeout(() => setAdded(false), 1500); };
  return (
    <Pressable testID={`svc-${s.id}`} onPress={() => router.push(`/(site)/service/${s.id}` as any)} style={{ width: w, borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", overflow: "hidden" }}>
      <View style={{ width: "100%", aspectRatio: 3 / 4, backgroundColor: SLATE[100] }}>
        {s.image ? <Image source={{ uri: s.image }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={200} /> : null}
        {off > 0 ? <View style={{ position: "absolute", top: 8, left: 8, backgroundColor: PRIMARY[700], borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{off}% OFF</Text></View> : null}
      </View>
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Star size={14} color={AMBER[400]} fill={AMBER[400]} /><Text style={{ fontSize: 12, fontWeight: "600", color: SLATE[600] }}>{s.rating || "4.8"}</Text><Clock size={14} color={SLATE[400]} style={{ marginLeft: 4 }} /><Text style={{ fontSize: 12, color: SLATE[400] }}>{s.duration_min}m</Text></View>
        <Text numberOfLines={2} style={{ fontSize: 14, fontWeight: "600", color: SLATE[900], marginTop: 4, lineHeight: 18, minHeight: 36 }}>{s.name}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, flex: 1 }}><Text style={{ fontSize: 16, fontWeight: "800", color: SLATE[900] }}>{fmt(price)}</Text>{off > 0 ? <Text style={{ fontSize: 11, color: SLATE[400], textDecorationLine: "line-through", marginBottom: 2 }}>{fmt(s.base_price)}</Text> : null}</View>
          <Pressable testID={`add-${s.id}`} onPress={quickAdd} style={{ height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: added ? EMERALD[500] : PRIMARY[300], backgroundColor: added ? EMERALD[500] : "#fff", flexDirection: "row", alignItems: "center", gap: 4 }}>
            {added ? <Check size={14} color="#fff" /> : <Plus size={14} color={PRIMARY[700]} />}<Text style={{ fontSize: 12, fontWeight: "700", color: added ? "#fff" : PRIMARY[700] }}>{added ? "Added" : "Add"}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

export default function ServicesPage() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { count, addCustom } = useCart();
  const cardW = (width - 32 - 12) / 2;
  const [q, setQ] = useState(String(params.q || ""));
  const [cat, setCat] = useState(String(params.category || "all"));
  const [rcItems, setRcItems] = useState<any[]>([]);
  useEffect(() => { setQ(String(params.q || "")); setCat(String(params.category || "all")); }, [params.q, params.category]);
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api.get<any[]>("/catalog/categories", { auth: false }), staleTime: 300_000 });
  const svcs = useQuery({ queryKey: ["services-all"], queryFn: () => api.get<any[]>("/catalog/services", { auth: false }), staleTime: 60_000 });
  const loading = cats.isLoading || svcs.isLoading;
  const filtered = useMemo(() => (svcs.data || []).filter((s) => (cat === "all" || s.category_id === cat) && (!q || s.name.toLowerCase().includes(q.toLowerCase()) || s.category_name?.toLowerCase().includes(q.toLowerCase()))), [svcs.data, cat, q]);
  const grouped = useMemo(() => { const m: Record<string, any[]> = {}; filtered.forEach((s) => { (m[s.category_name] = m[s.category_name] || []).push(s); }); return m; }, [filtered]);
  const activeCatName = (cats.data || []).find((c) => c.id === cat)?.name;
  useEffect(() => {
    const term = q.trim(); if (term.length < 2) { setRcItems([]); return; }
    const t = setTimeout(() => { api.get(`/ratecards/search?q=${encodeURIComponent(term)}`, { auth: false }).then((r: any) => setRcItems(r || [])).catch(() => setRcItems([])); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const bookRateItem = (it: any) => { addCustom({ description: it.description, service_charge: it.service_charge, labour_charge: it.labour_charge, category_id: it.category_id, category_name: it.category_name, row_id: it.row_id }); toast.success(`Added "${it.description}" — taking you to checkout…`); router.push("/(site)/book" as any); };
  const chip = (on: boolean) => ({ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? PRIMARY[700] : "#fff", borderWidth: 1, borderColor: on ? PRIMARY[700] : SLATE[200] });

  return (
    <View style={{ flex: 1, backgroundColor: "#FAFAFA" }} testID="services-page">
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: SLATE[200], flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable testID="services-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(site)"))} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: SLATE[200] }}><ArrowLeft size={20} color={SLATE[700]} /></Pressable>
        <Text testID="services-title" numberOfLines={1} style={{ fontSize: 18, fontWeight: "800", color: SLATE[900], flex: 1 }}>{activeCatName || (q ? `Results for "${q}"` : "All Services")}</Text>
        <Pressable testID="services-cart" onPress={() => router.push("/(site)/book" as any)} style={{ height: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ShoppingBag size={16} color={PRIMARY[700]} /><Text style={{ fontSize: 13, fontWeight: "600", color: SLATE[700] }}>Booking</Text>
          {count > 0 ? <View testID="services-cart-count" style={{ position: "absolute", top: -8, right: -8, height: 20, minWidth: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{count}</Text></View> : null}
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: count > 0 ? 160 : 100 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 14, color: SLATE[500] }}>Browse and book verified home-service experts near you.</Text>
        <View style={{ flexDirection: "row", alignItems: "center", height: 40, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 14, gap: 8, marginTop: 20 }}>
          <Search size={16} color={SLATE[400]} /><TextInput testID="services-search" value={q} onChangeText={setQ} placeholder="Search services…" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 14, color: SLATE[800], height: 38, outlineStyle: "none" } as any} />
          {q ? <Pressable testID="services-search-clear" onPress={() => setQ("")}><X size={16} color={SLATE[400]} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 16 }}>
          {loading ? [0, 1, 2, 3, 4].map((i) => <Sk key={i} style={{ width: 90, height: 36, borderRadius: 999 }} />) : <>
            <Pressable testID="services-cat-all" onPress={() => setCat("all")} style={chip(cat === "all")}><Text style={{ fontSize: 14, fontWeight: "500", color: cat === "all" ? "#fff" : SLATE[600] }}>All</Text></Pressable>
            {(cats.data || []).map((c) => <Pressable key={c.id} testID={`services-cat-${c.id}`} onPress={() => setCat(c.id)} style={chip(cat === c.id)}><Text style={{ fontSize: 14, fontWeight: "500", color: cat === c.id ? "#fff" : SLATE[600] }}>{c.name}</Text></Pressable>)}
          </>}
        </ScrollView>

        {q.trim().length >= 2 && rcItems.length > 0 ? (
          <View testID="ratecard-search-results" style={{ marginBottom: 32 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}><Text style={{ fontSize: 20, fontWeight: "700", color: SLATE[900] }}>Rate card items</Text><View style={{ backgroundColor: PRIMARY[50], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ fontSize: 11, fontWeight: "700", color: PRIMARY[700] }}>{rcItems.length} found</Text></View></View>
            <View style={{ gap: 12 }}>
              {rcItems.map((it) => { const accent = it.accent_color || "#0D47A1"; const price = (Number(it.service_charge) || 0) + (Number(it.labour_charge) || 0); return (
                <View key={it.row_id} testID={`rc-result-${it.row_id}`} style={{ borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], borderLeftWidth: 3, borderLeftColor: accent, backgroundColor: "#fff", padding: 16, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Sparkles size={14} color={accent} /><Text style={{ fontSize: 11, fontWeight: "700", color: accent }}>{it.brand_label || "AzoCover"}</Text><Text style={{ fontSize: 11, color: SLATE[400] }}>· {it.category_name}</Text></View>
                  <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", color: SLATE[900] }}>{it.description}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6 }}><Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>{fmt(price)}</Text>{Number(it.labour_charge) > 0 ? <Text style={{ fontSize: 11, color: SLATE[400], marginBottom: 3 }}>incl. labour</Text> : null}</View>
                    <Pressable testID={`rc-book-${it.row_id}`} onPress={() => bookRateItem(it)} style={{ height: 36, paddingHorizontal: 16, borderRadius: 12, backgroundColor: accent, justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>Book</Text></Pressable>
                  </View>
                </View>); })}
            </View>
          </View>
        ) : null}

        {loading ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{[0, 1, 2, 3].map((i) => <Sk key={i} style={{ width: cardW, height: 300, borderRadius: 16 }} />)}</View> : null}
        {!loading && Object.keys(grouped).length === 0 && rcItems.length === 0 ? <Text testID="services-empty" style={{ textAlign: "center", color: SLATE[400], paddingVertical: 64 }}>No services found.</Text> : null}
        {!loading ? Object.entries(grouped).map(([catName, list]) => (
          <View key={catName} testID={`services-group-${catName}`} style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 20, fontWeight: "700", color: SLATE[900], marginBottom: 12 }}>{catName}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{list.map((s: any) => <ServiceCard key={s.id} s={s} w={cardW} />)}</View>
          </View>
        )) : null}
      </ScrollView>
      {count > 0 ? (
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: SLATE[200], boxShadow: "0px -6px 24px rgba(15,23,42,0.10)" } as any}>
          <Pressable testID="view-booking-bar" onPress={() => router.push("/(site)/book" as any)} style={({ pressed }) => ({ height: 56, borderRadius: 16, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, boxShadow: "0px 10px 30px rgba(13,71,161,0.3)" } as any)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ height: 28, width: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{count}</Text></View><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>View your booking</Text></View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 15 }}>Checkout</Text><ChevronRight size={20} color="#fff" /></View>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
