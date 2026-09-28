/** Home header (logo · location pill · bell · avatar) + search bar with voice — per the approved mobile design. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Platform } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MapPin, ChevronDown, Bell, BellOff, User, Search, Mic, MicOff, X, Home as HomeIcon, ArrowRight, History, Globe } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRIMARY, SLATE, ROSE, shadowBtn, useTheme, TC } from "../../theme";
import { mediaUrl } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useSiteConfig } from "../../context/BrandContext";
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
  const { isDark, c } = useTheme();
  const { branding: cfg } = useSiteConfig();
  const brandLogo = (isDark ? cfg.logo_dark || cfg.logo_light : cfg.logo_light || cfg.logo_dark) || "";
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
    <View testID="app-header" style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: c.surface }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable testID="app-logo" onPress={() => router.replace("/(site)")} style={{ flexShrink: 1, minWidth: 110 }}>
          {brandLogo ? (
            <Image testID="app-logo-image" source={{ uri: brandLogo }} style={{ height: 44, width: 150 }} contentFit="contain" contentPosition="left" />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 25, fontWeight: "900", color: TC.primaryText, letterSpacing: -0.6 }}>{branding?.site_name || cfg.site_name || "AzoApp"}</Text>
              <HomeIcon size={22} color={TC.primaryText} strokeWidth={2.4} />
            </View>
          )}
          {!brandLogo && branding?.show_tagline !== false && (branding?.tagline || cfg.tagline) ? <Text testID="app-tagline" style={{ fontSize: 11, color: TC.textMuted, marginTop: 0 }} numberOfLines={1}>{branding?.tagline || cfg.tagline}</Text> : null}
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Pressable testID="app-location-pill" onPress={() => setLocOpen(true)} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: isDark ? c.surfaceAlt : TC.primarySoft, borderRadius: 999, paddingHorizontal: 14, height: 38, maxWidth: 160 }}>
            <MapPin size={16} color={isDark ? PRIMARY[300] : PRIMARY[700]} />
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: c.text, flexShrink: 1 }}>{city || "Set location"}</Text>
            <ChevronDown size={14} color={c.textMuted} />
          </Pressable>
        </View>
        <Pressable testID="app-bell" onPress={onBell} style={{ height: 40, width: 40, alignItems: "center", justifyContent: "center" }}>
          {notif === "denied" ? <BellOff size={24} color={TC.textFaint} /> : <Bell size={24} color={c.text} />}
          {(unread > 0 || notif === "undetermined") && notif !== "denied" ? <View testID="app-bell-dot" style={{ position: "absolute", top: 5, right: 7, height: 8, width: 8, borderRadius: 4, backgroundColor: ROSE[500], borderWidth: 1.5, borderColor: TC.surface }} /> : null}
          {notif === "denied" ? <View testID="app-bell-muted" style={{ position: "absolute", top: 4, right: 5, height: 9, width: 9, borderRadius: 5, backgroundColor: TC.textFaint, borderWidth: 1.5, borderColor: TC.surface }} /> : null}
        </Pressable>
        <Pressable testID="app-avatar" onPress={() => router.push(user ? "/(customer)" : "/login")} style={{ height: 40, width: 40, borderRadius: 20, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", overflow: "hidden", ...shadowBtn }}>
          {user?.photo ? <Image testID="app-avatar-img" source={{ uri: mediaUrl(user.photo) }} style={{ width: 40, height: 40 }} contentFit="cover" cachePolicy="memory-disk" /> : user ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>{initials || "U"}</Text> : <User size={22} color="#fff" />}
        </Pressable>
      </View>

      <LocationSheet open={locOpen} onClose={() => setLocOpen(false)} />
    </View>
  );
}

const RECENT_KEY = "azo_recent_searches_v1";
const MAX_RECENT = 6;

export function AppSearchBar({ onSubmit }: { onSubmit: (q: string) => void }) {
  const { c, isDark } = useTheme();
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { AsyncStorage.getItem(RECENT_KEY).then((v) => { try { const arr = JSON.parse(v || "[]"); if (Array.isArray(arr)) setRecent(arr.filter((x) => typeof x === "string").slice(0, MAX_RECENT)); } catch { /* ignore */ } }); }, []);
  const remember = useCallback((term: string) => {
    const t = term.trim(); if (t.length < 2) return;
    setRecent((prev) => { const next = [t, ...prev.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT); AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {}); return next; });
  }, []);
  const forget = useCallback((term: string) => {
    setRecent((prev) => { const next = prev.filter((x) => x !== term); AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {}); return next; });
  }, []);
  const clearRecent = useCallback(() => { setRecent([]); AsyncStorage.removeItem(RECENT_KEY).catch(() => {}); }, []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();
  const timer = useRef<any>(null);
  const submitRef = useRef<(q: string) => void>(onSubmit);
  submitRef.current = (term: string) => { remember(term); onSubmit(term); };
  const submit = (term: string) => submitRef.current(term);
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
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, backgroundColor: c.surface, zIndex: 20 }}>
      {/* Pill search bar (home, below the navbar): search icon · input · mic — per the approved reference */}
      <View testID="app-search-bar" style={{ flexDirection: "row", alignItems: "center", height: 54, borderRadius: 5, backgroundColor: isDark ? c.surfaceAlt : TC.surface, borderWidth: 1, borderColor: c.border, paddingLeft: 18, paddingRight: 14, gap: 12, boxShadow: "0px 8px 24px rgba(15,23,42,0.10), 0px 1px 3px rgba(15,23,42,0.06)" } as any}>
        <Search size={22} color={c.text} strokeWidth={2.4} />
        <TextInput testID="app-search-input" value={q} onChangeText={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} onSubmitEditing={() => q.trim() && submit(q.trim())} returnKeyType="search" numberOfLines={1} multiline={false}
          placeholder="Search for services" placeholderTextColor={TC.textFaint} style={{ flex: 1, fontSize: 16, color: c.text, height: 52, paddingVertical: 0, outlineStyle: "none" } as any} />
        {q ? <Pressable testID="app-search-clear" onPress={() => { setQ(""); setResults(null); }} hitSlop={8}><X size={18} color={TC.textFaint} /></Pressable> : null}
        <Pressable testID="app-voice-btn" onPress={() => (voice.listening ? cancelVoice() : startVoice())} hitSlop={6} style={{ height: 40, width: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: voice.listening ? ROSE[50] : "transparent" }}>
          {voice.listening ? <MicOff size={22} color={ROSE[600]} /> : <Mic size={22} color={voice.supported ? PRIMARY[900] : TC.border} strokeWidth={2.2} />}
        </Pressable>
      </View>
      {recent.length > 0 && q.trim().length < 2 ? (
        <View testID="recent-searches" style={{ marginTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><History size={13} color={TC.textFaint} /><Text style={{ fontSize: 11, fontWeight: "700", color: TC.textFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>Recent searches</Text></View>
            <Pressable testID="recent-clear" onPress={clearRecent} hitSlop={8}><Text style={{ fontSize: 11.5, fontWeight: "700", color: TC.primaryText }}>Clear</Text></Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
            {recent.map((term) => (
              <View key={term} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingLeft: 12, paddingRight: 8, borderRadius: 17, backgroundColor: TC.bg, borderWidth: 1, borderColor: TC.border }}>
                <Pressable testID={`recent-${term.replace(/\s+/g, "-").toLowerCase()}`} onPress={() => { setQ(term); setOpen(false); submit(term); }} hitSlop={6}><Text style={{ fontSize: 13, fontWeight: "600", color: TC.text2 }}>{term}</Text></Pressable>
                <Pressable onPress={() => forget(term)} hitSlop={8} testID={`recent-remove-${term.replace(/\s+/g, "-").toLowerCase()}`}><X size={13} color={TC.textFaint} /></Pressable>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {open && q.trim().length >= 2 ? (
        <View testID="app-search-results" style={{ position: "absolute", top: 70, left: 16, right: 16, backgroundColor: TC.surface, borderRadius: 16, borderWidth: 1, borderColor: TC.border, padding: 6, zIndex: 50, ...shadowBtn, maxHeight: 320 }}>
          {loading && !results ? <ActivityIndicator color={TC.primaryText} style={{ margin: 12 }} /> : null}
          <ScrollView keyboardShouldPersistTaps="handled">
            {(results || []).slice(0, 8).map((s) => (
              <Pressable key={s.id} testID={`app-search-result-${s.id}`} onPress={() => { setOpen(false); setQ(""); router.push(`/(site)/service/${s.id}` as any); }} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 12 }}>
                <View style={{ height: 34, width: 34, borderRadius: 10, backgroundColor: TC.primarySoft, alignItems: "center", justifyContent: "center" }}><HomeIcon size={16} color={TC.primaryText} /></View>
                <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", color: TC.text }}>{s.name}</Text><Text style={{ fontSize: 11, color: TC.textFaint }}>{s.category_name}</Text></View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: TC.primaryText }}>{fmt(s.base_price)}</Text>
              </Pressable>
            ))}
            {results && results.length === 0 ? <Text style={{ fontSize: 13, color: TC.textMuted, padding: 12 }}>No services match “{q}”.</Text> : null}
            {results && results.length > 0 ? (
              <Pressable testID="app-search-all" onPress={() => { setOpen(false); submit(q.trim()); }} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 10 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: TC.primaryText }}>See all results</Text><ArrowRight size={14} color={TC.primaryText} />
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
      <VoiceSearchOverlay visible={voiceOpen} heard={heard} error={voice.error} onCancel={cancelVoice} />
    </View>
  );
}
