/** Port of web_panel/src/components/site/ServiceSearch.jsx (hero + navbar variants): debounced GET /catalog/services?q= */
import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Search, ArrowRight, TrendingUp, Clock, Zap } from "lucide-react-native";
import { api } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { fmt } from "@/src/lib/format";
import { PRIMARY, SLATE } from "@/src/theme";

const priceOf = (s: any) => (s.discounted_price > 0 && s.discounted_price < s.base_price ? s.discounted_price : s.base_price);

export function ServiceSearch({ variant = "navbar", placeholder = "Search services…", autoFocus = false, onDone }: { variant?: "hero" | "navbar"; placeholder?: string; autoFocus?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [trending, setTrending] = useState<any[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<any>(null);
  const isHero = variant === "hero";

  useEffect(() => {
    storage.getItem("azo_recent_searches").then((v) => { try { setRecent((JSON.parse(v || "[]") || []).filter((x: any) => typeof x === "string")); } catch {} });
    (async () => {
      try {
        let list = await api.get<any[]>("/catalog/services?trending=true", { auth: false });
        if (!list?.length) list = await api.get<any[]>("/catalog/services?featured=true", { auth: false });
        setTrending((list || []).slice(0, 6));
      } catch {}
    })();
  }, []);

  const runSearch = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (!text || text.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try { const r = await api.get<any[]>(`/catalog/services?q=${encodeURIComponent(text.trim())}`, { auth: false }); setResults((r || []).slice(0, 8)); } catch { setResults([]); }
      setLoading(false);
    }, 250);
  };
  const remember = (term: string) => {
    const next = [term, ...recent.filter((x) => x !== term)].slice(0, 6);
    setRecent(next); storage.setItem("azo_recent_searches", JSON.stringify(next));
  };
  const goAll = () => { if (q.trim()) remember(q.trim()); setOpen(false); onDone?.(); router.push(`/(site)/services${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}` as any); };
  const pick = (s: any) => { remember(s.name); setOpen(false); onDone?.(); router.push(`/(site)/service/${s.id}` as any); };

  const showPanel = open && (q.trim().length >= 2 ? true : recent.length > 0 || trending.length > 0);

  return (
    <View testID={`service-search-${variant}`} style={{ position: "relative", zIndex: 40 }}>
      <View style={{ position: "absolute", left: isHero ? 16 : 14, top: isHero ? 18 : 14, zIndex: 1 }}><Search size={isHero ? 20 : 16} color={SLATE[400]} /></View>
      <TextInput testID={isHero ? "hero-search" : "nav-search"} value={q} autoFocus={autoFocus} onChangeText={(v) => { setQ(v); setOpen(true); runSearch(v); }} onFocus={() => setOpen(true)} onSubmitEditing={goAll}
        placeholder={placeholder} placeholderTextColor={SLATE[400]}
        style={isHero
          ? { height: 56, paddingLeft: 48, paddingRight: 112, borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", fontSize: 15, color: SLATE[900], boxShadow: "0px 10px 40px -12px rgba(13,71,161,0.25)" }
          : { height: 44, paddingLeft: 40, paddingRight: 16, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], backgroundColor: SLATE[50], fontSize: 14, color: SLATE[900] }} />
      {isHero ? (
        <Pressable testID="hero-search-btn" onPress={goAll} style={({ pressed }) => ({ position: "absolute", right: 8, top: 8, height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], flexDirection: "row", alignItems: "center", gap: 4 })}>
          <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Search</Text><ArrowRight size={16} color="#fff" />
        </Pressable>
      ) : null}
      {showPanel ? (
        <View testID="search-panel" style={{ position: "absolute", top: isHero ? 64 : 52, left: 0, right: 0, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.25)", overflow: "hidden", maxHeight: 360 }}>
          {q.trim().length >= 2 ? (
            loading && !results.length ? <Text style={{ padding: 16, fontSize: 13, color: SLATE[500] }}>Searching…</Text>
            : results.length === 0 ? <Text style={{ padding: 16, fontSize: 13, color: SLATE[500] }}>No services match “{q}”.</Text>
            : results.map((s) => (
              <Pressable key={s.id} testID={`search-result-${s.id}`} onPress={() => pick(s)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: pressed ? SLATE[50] : "#fff" })}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: PRIMARY[100], alignItems: "center", justifyContent: "center" }}><Zap size={16} color={PRIMARY[700]} /></View>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: "500", color: SLATE[800] }}>{s.name}</Text><Text style={{ fontSize: 12, color: SLATE[400] }}>{s.category_name}</Text></View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: PRIMARY[700] }}>{fmt(priceOf(s))}</Text>
              </Pressable>
            ))
          ) : (
            <View style={{ padding: 12, gap: 10 }}>
              {recent.length > 0 ? (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: SLATE[400], marginBottom: 6 }}>Recent</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{recent.map((r) => <Pressable key={r} onPress={() => { setQ(r); runSearch(r); }} style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: SLATE[100] }}><Clock size={12} color={SLATE[500]} /><Text style={{ fontSize: 12, color: SLATE[700], fontWeight: "500" }}>{r}</Text></Pressable>)}</View>
                </View>
              ) : null}
              {trending.length > 0 ? (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, color: SLATE[400], marginBottom: 6 }}>Trending</Text>
                  {trending.map((s) => (
                    <Pressable key={s.id} onPress={() => pick(s)} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
                      <TrendingUp size={16} color={PRIMARY[700]} /><Text style={{ flex: 1, fontSize: 14, color: SLATE[800] }}>{s.name}</Text><Text style={{ fontSize: 13, fontWeight: "700", color: PRIMARY[700] }}>{fmt(priceOf(s))}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      ) : null}
    </View>
  );
}
