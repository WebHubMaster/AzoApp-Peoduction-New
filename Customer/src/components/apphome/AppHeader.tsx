/** Home header (logo · location pill · bell · avatar) + search bar with voice — per the approved mobile design. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, ChevronDown, Bell, BellOff, User, Search, Mic, MicOff, X, Home as HomeIcon, ArrowRight } from "lucide-react-native";
import { PRIMARY, SLATE, ROSE, shadowBtn } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../Toast";
import { useCity } from "../../lib/location";
import { useNotifPermission, enableNotifications } from "../../lib/permissions";
import { useVoiceSearch } from "../../lib/voice";
import { api } from "../../api/client";
import { fmt } from "../../lib/format";
import { LocationSheet } from "./LocationSheet";
import { VoiceSearchOverlay } from "./VoiceSearchOverlay";


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
    <View testID="app-header" style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: "#fff" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable testID="app-logo" onPress={() => router.replace("/(site)")} style={{ flexShrink: 1, minWidth: 110 }}>
          {branding?.logo ? (
            <Image testID="app-logo-image" source={{ uri: branding.logo }} style={{ height: 44, width: 150 }} contentFit="contain" contentPosition="left" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 25, fontWeight: "900", color: PRIMARY[700], letterSpacing: -0.6 }}>{branding?.site_name || "AzoApp"}</Text>
              <HomeIcon size={22} color={PRIMARY[700]} strokeWidth={2.4} />
            </View>
          )}
          {!branding?.logo && branding?.show_tagline !== false && branding?.tagline ? <Text testID="app-tagline" style={{ fontSize: 11, color: SLATE[500], marginTop: 0 }} numberOfLines={1}>{branding.tagline}</Text> : null}
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Pressable testID="app-location-pill" onPress={() => setLocOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: PRIMARY[50], borderRadius: 999, paddingHorizontal: 14, height: 38, maxWidth: 160 }}>
            <MapPin size={16} color={PRIMARY[700]} />
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: SLATE[800], flexShrink: 1 }}>{city || "Set location"}</Text>
            <ChevronDown size={14} color={SLATE[500]} />
          </Pressable>
        </View>
        <Pressable testID="app-bell" onPress={onBell} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}>
          {notif === "denied" ? <BellOff size={24} color={SLATE[400]} /> : <Bell size={24} color={SLATE[800]} />}
          {(unread > 0 || notif === "undetermined") && notif !== "denied" ? <View testID="app-bell-dot" style={{ position: "absolute", top: 5, right: 7, height: 8, width: 8, borderRadius: 4, backgroundColor: ROSE[500], borderWidth: 1.5, borderColor: "#fff" }} /> : null}
          {notif === "denied" ? <View testID="app-bell-muted" style={{ position: "absolute", top: 4, right: 5, height: 9, width: 9, borderRadius: 5, backgroundColor: SLATE[400], borderWidth: 1.5, borderColor: "#fff" }} /> : null}
        </Pressable>
        <Pressable testID="app-avatar" onPress={() => router.push(user ? "/(customer)" : "/login")} style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", ...shadowBtn }}>
          {user ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{initials || "U"}</Text> : <User size={22} color="#fff" />}
        </Pressable>
      </View>

      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
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
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [heard, setHeard] = useState("");
  const heardRef = useRef("");
  heardRef.current = heard;
  const startedRef = useRef(false);
  const finalizedRef = useRef(false);

  const onVoice = useCallback((text: string, final: boolean) => {
    setQ(text); setHeard(text);
    if (text) setOpen(true);
    if (final && text.trim()) { finalizedRef.current = true; submitRef.current(text.trim()); setVoiceOpen(false); }
  }, []);
  const voice = useVoiceSearch(onVoice);
  useEffect(() => { if (voice.listening) startedRef.current = true; }, [voice.listening]);
  // When recognition ends without a final result, submit whatever was heard, then close.
  useEffect(() => {
    if (!voiceOpen || !startedRef.current || voice.listening) return;
    if (voice.error) return; // keep the error visible until the user cancels
    const t = setTimeout(() => {
      if (!finalizedRef.current) { const h = heardRef.current.trim(); if (h) submitRef.current(h); }
      setVoiceOpen(false);
    }, 300);
    return () => clearTimeout(t);
  }, [voice.listening, voiceOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const startVoice = () => {
    if (!voice.supported) { toast.error("Voice search needs the installed AzoApp build (not available in Expo Go)."); return; }
    setHeard(""); finalizedRef.current = false; startedRef.current = false; setVoiceOpen(true); voice.start();
  };
  const cancelVoice = () => { finalizedRef.current = true; voice.stop(); setVoiceOpen(false); };

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
    <View style={{ paddingHorizontal: 20, paddingBottom: 18, backgroundColor: "#fff", zIndex: 20 }}>
      <View testID="app-search-bar" style={{ flexDirection: "row", alignItems: "center", height: 54, borderRadius: 18, backgroundColor: SLATE[50], borderWidth: 1, borderColor: SLATE[200], paddingHorizontal: 16, gap: 10 }}>
        <Search size={20} color={SLATE[500]} />
        <TextInput testID="app-search-input" value={q} onChangeText={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} onSubmitEditing={() => q.trim() && onSubmit(q.trim())} returnKeyType="search"
          placeholder="Search for services (AC Repair, Cleaning…)" placeholderTextColor={SLATE[400]} style={{ flex: 1, fontSize: 14, color: SLATE[800], height: 52, paddingVertical: 0, outlineStyle: "none" } as any} />
        {q ? <Pressable testID="app-search-clear" onPress={() => { setQ(""); setResults(null); }}><X size={16} color={SLATE[400]} /></Pressable> : null}
        <Pressable testID="app-voice-btn" onPress={() => (voice.listening ? cancelVoice() : startVoice())} style={{ height: 36, width: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: voice.listening ? ROSE[50] : PRIMARY[50] }}>
          {voice.listening ? <MicOff size={18} color={ROSE[600]} /> : <Mic size={18} color={voice.supported ? PRIMARY[700] : SLATE[300]} />}
        </Pressable>
      </View>
      {open && q.trim().length >= 2 ? (
        <View testID="app-search-results" style={{ position: "absolute", top: 58, left: 20, right: 20, backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: SLATE[200], padding: 6, zIndex: 50, ...shadowBtn, maxHeight: 320 }}>
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
      <VoiceSearchOverlay visible={voiceOpen} heard={heard} error={voice.error} onCancel={cancelVoice} />
    </View>
  );
}
