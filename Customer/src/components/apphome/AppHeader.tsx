/** Home header (logo · location pill · bell · avatar) + search bar with voice — per the approved mobile design. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, ChevronDown, Bell, BellOff, User, Search, Mic, MicOff, X, Home as HomeIcon, ArrowRight, Zap } from "lucide-react-native";
import { PRIMARY, SLATE, ROSE, shadowBtn } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { useCity } from "../../lib/location";
import { useNotifPermission, enableNotifications } from "../../lib/permissions";
import { useVoiceSearch } from "../../lib/voice";
import { api } from "../../api/client";
import { fmt } from "../../lib/format";
import { LocationButton } from "../site/SiteNavbar";


export function AppHeader({ branding, unread = 0 }: { branding: any; unread?: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const toast = useToast();
  const city = useCity();
  const notif = useNotifPermission();
  const [locOpen, setLocOpen] = useState(false);
  const initials = (user?.name || "").split(" ").map((s: string) => s[0]).join("").slice(0, 2).toUpperCase();

  const onBell = async () => {
    if (notif !== "granted") {
      const s = await enableNotifications();
      if (s === "granted") toast.success("Notifications enabled");
      else if (Platform.OS === "web") toast.error("Notifications are blocked. Allow them in your browser site settings.");
      else toast.info("Turn on notifications for AzoApp in Settings");
      if (s !== "granted") return;
    }
    if (!user) { router.push("/login"); return; }
    router.push("/(customer)?notif=1" as any);
  };

  return (
    <View testID="app-header" style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable testID="app-logo" onPress={() => router.replace("/(site)")} style={{ flexShrink: 1 }}>
          {branding?.logo ? (
            <Image source={{ uri: branding.logo }} style={{ height: 30, width: 112 }} contentFit="contain" contentPosition="left" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ height: 30, width: 30, borderRadius: 9, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Zap size={16} color="#fff" fill="#fff" /></View>
              <Text style={{ fontSize: 20, fontWeight: "900", color: PRIMARY[700], letterSpacing: -0.5 }}>{branding?.site_name || "AzoApp"}</Text>
            </View>
          )}
          {branding?.show_tagline !== false && branding?.tagline ? <Text testID="app-tagline" style={{ fontSize: 10, color: SLATE[500], marginTop: 2 }} numberOfLines={1}>{branding.tagline}</Text> : null}
        </Pressable>
        <Pressable testID="app-location-pill" onPress={() => setLocOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PRIMARY[50], borderRadius: 999, paddingHorizontal: 12, height: 34, marginLeft: "auto", maxWidth: 150 }}>
          <MapPin size={15} color={PRIMARY[700]} />
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: SLATE[800], flexShrink: 1 }}>{city || "Set location"}</Text>
          <ChevronDown size={14} color={SLATE[500]} />
        </Pressable>
        <Pressable testID="app-bell" onPress={onBell} style={{ height: 36, width: 36, alignItems: "center", justifyContent: "center" }}>
          {notif === "denied" ? <BellOff size={22} color={SLATE[400]} /> : <Bell size={22} color={SLATE[800]} />}
          {(unread > 0 || notif === "undetermined") && notif !== "denied" ? <View testID="app-bell-dot" style={{ position: "absolute", top: 5, right: 7, height: 8, width: 8, borderRadius: 4, backgroundColor: ROSE[500], borderWidth: 1.5, borderColor: "#fff" }} /> : null}
          {notif === "denied" ? <View testID="app-bell-muted" style={{ position: "absolute", top: 4, right: 5, height: 9, width: 9, borderRadius: 5, backgroundColor: SLATE[400], borderWidth: 1.5, borderColor: "#fff" }} /> : null}
        </Pressable>
        <Pressable testID="app-avatar" onPress={() => router.push(user ? "/(customer)" : "/login")} style={{ height: 36, width: 36, borderRadius: 18, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}>
          {user ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>{initials || "U"}</Text> : <User size={20} color="#fff" />}
        </Pressable>
      </View>

      <Modal visible={locOpen} transparent animationType="slide" onRequestClose={() => setLocOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.5)" }} onPress={() => setLocOpen(false)} />
        <View testID="app-location-sheet" style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: insets.bottom + 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: "800", color: SLATE[900] }}>Your location</Text>
            <Pressable testID="app-location-close" onPress={() => setLocOpen(false)} style={{ height: 32, width: 32, alignItems: "center", justifyContent: "center", borderRadius: 16, backgroundColor: SLATE[100] }}><X size={16} color={SLATE[600]} /></Pressable>
          </View>
          <LocationButton testID="app-location" />
        </View>
      </Modal>
    </View>
  );
}

export function AppSearchBar({ onSubmit }: { onSubmit: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const timer = useRef<any>(null);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  const onVoice = useCallback((text: string, final: boolean) => {
    setQ(text);
    if (text) setOpen(true);
    if (final && text.trim()) submitRef.current(text.trim());
  }, []);
  const voice = useVoiceSearch(onVoice);
  useEffect(() => { if (voice.error) toast.error(voice.error); }, [voice.error]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return; }
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try { setResults(await api.get<any[]>(`/catalog/services?q=${encodeURIComponent(term)}`)); } catch { setResults([]); } finally { setLoading(false); }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#fff", zIndex: 20 }}>
      <View testID="app-search-bar" style={{ flexDirection: "row", alignItems: "center", height: 46, borderRadius: 14, backgroundColor: SLATE[50], borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 12, gap: 8 }}>
        <Search size={18} color={SLATE[500]} />
        <TextInput testID="app-search-input" value={q} onChangeText={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} onSubmitEditing={() => q.trim() && onSubmit(q.trim())} returnKeyType="search"
          placeholder="Search for services (e.g. AC Repair, Cleaning, Salon)" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 13, color: SLATE[800], height: 44, paddingVertical: 0 }} />
        {q ? <Pressable testID="app-search-clear" onPress={() => { setQ(""); setResults(null); }}><X size={16} color={SLATE[400]} /></Pressable> : null}
        <Pressable testID="app-voice-btn" onPress={voice.toggle} style={{ height: 32, width: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: voice.listening ? ROSE[50] : "transparent" }}>
          {voice.listening ? <MicOff size={18} color={ROSE[600]} /> : <Mic size={18} color={voice.supported ? SLATE[700] : SLATE[300]} />}
        </Pressable>
      </View>
      {voice.listening ? <Text testID="app-voice-listening" style={{ fontSize: 11, color: ROSE[600], marginTop: 6, fontWeight: "600" }}>● Listening… speak now</Text> : null}
      {open && q.trim().length >= 2 ? (
        <View testID="app-search-results" style={{ position: "absolute", top: 50, left: 16, right: 16, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 6, zIndex: 50, ...shadowBtn, maxHeight: 320 }}>
          {loading && !results ? <ActivityIndicator color={PRIMARY[700]} style={{ margin: 12 }} /> : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {(results || []).slice(0, 8).map((s) => (
              <Pressable key={s.id} testID={`app-search-result-${s.id}`} onPress={() => { setOpen(false); setQ(""); router.push(`/(site)/service/${s.id}` as any); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12 }}>
                <View style={{ height: 34, width: 34, borderRadius: 10, backgroundColor: PRIMARY[50], alignItems: "center", justifyContent: "center" }}><HomeIcon size={16} color={PRIMARY[700]} /></View>
                <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: SLATE[800] }}>{s.name}</Text><Text style={{ fontSize: 11, color: SLATE[400] }}>{s.category_name}</Text></View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: PRIMARY[700] }}>{fmt(s.base_price)}</Text>
              </Pressable>
            ))}
            {results && results.length === 0 ? <Text style={{ fontSize: 13, color: SLATE[500], padding: 12 }}>No services match “{q}”.</Text> : null}
            {results && results.length > 0 ? (
              <Pressable testID="app-search-all" onPress={() => { setOpen(false); onSubmit(q.trim()); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: PRIMARY[700] }}>See all results</Text><ArrowRight size={14} color={PRIMARY[700]} />
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
