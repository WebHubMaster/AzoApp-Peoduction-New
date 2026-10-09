/** One-place permission setup (Customer app) — shown once at app open, before Home.
 *  Every permission the app uses is requested here; nothing is asked at random later. */
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, AppState, Platform, Linking, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { MapPin, BellRing, MonitorSmartphone, Layers, BatteryCharging, Rocket, Image as ImageIcon, Mic, Check, ShieldCheck } from "lucide-react-native";
import { PRIMARY, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { PERMS_DONE_KEY } from "@/src/lib/permissions";
import { detectLocation, getLocationName } from "@/src/lib/location";
import { refreshNotifPermission } from "@/src/lib/permissions";
import { registerPushToken } from "@/src/lib/push";
import {
  PermState, allAlertStates, requestNotificationPermission, openFullScreenIntentSettings,
  requestOverlayPermission, requestBatteryExemption, requestOemSettings,
} from "@/src/lib/notifications";

type Key = "location" | "notifications" | "photos" | "mic" | "fullscreen" | "overlay" | "battery" | "oem";
type St = Pick<PermState, "granted" | "canAskAgain" | "available">;

function speech(): any { try { const m = require("expo-speech-recognition"); return m?.ExpoSpeechRecognitionModule || null; } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports
const toSt = (p: any): St => ({ granted: !!p?.granted, canAskAgain: p?.canAskAgain !== false, available: true });
const NA: St = { granted: false, canAskAgain: false, available: false };

const CARDS: { key: Key; icon: any; title: string; why: string; tint: string; runtime?: boolean }[] = [
  { key: "location", icon: MapPin, title: "Location", why: "Show services in your area and fill your address automatically.", tint: "#0EA5E9", runtime: true },
  { key: "notifications", icon: BellRing, title: "Notifications", why: "Booking, partner arrival, reschedule & chat alerts.", tint: "#F59E0B", runtime: true },
  { key: "photos", icon: ImageIcon, title: "Photos", why: "Upload a profile photo or attach pictures in support chats.", tint: "#10B981", runtime: true },
  { key: "mic", icon: Mic, title: "Microphone", why: "Search services with your voice.", tint: "#6366F1", runtime: true },
  { key: "fullscreen", icon: MonitorSmartphone, title: "Full-Screen Alert", why: "Show a call-style alert on the lock screen for important booking updates.", tint: "#22C55E" },
  { key: "overlay", icon: Layers, title: "Display Over Other Apps", why: "Let important alerts pop up while you use other apps.", tint: "#A855F7" },
  { key: "battery", icon: BatteryCharging, title: "Run in Background", why: "Keep alerts reliable when the phone tries to save battery.", tint: "#38BDF8" },
  { key: "oem", icon: Rocket, title: "Autostart & Pop-ups", why: "On Xiaomi / Oppo / Vivo phones, allow Autostart so alerts aren't blocked.", tint: "#EF4444" },
];

async function readAll(): Promise<Record<Key, St>> {
  const [loc, pics, alerts] = await Promise.all([
    Location.getForegroundPermissionsAsync().then(toSt).catch(() => NA),
    ImagePicker.getMediaLibraryPermissionsAsync().then(toSt).catch(() => NA),
    allAlertStates(),
  ]);
  const sp = speech();
  const mic = sp?.getPermissionsAsync ? await sp.getPermissionsAsync().then(toSt).catch(() => NA) : NA;
  return { location: loc, photos: pics, mic, ...alerts };
}

async function request(key: Key, st?: St) {
  if (st && !st.granted && st.canAskAgain === false && ["location", "notifications", "photos", "mic"].includes(key)) { await Linking.openSettings().catch(() => {}); return; }
  if (key === "location") { const p = await Location.requestForegroundPermissionsAsync(); if (p.granted && !getLocationName()) detectLocation().catch(() => {}); }
  else if (key === "notifications") { const r = await requestNotificationPermission(); refreshNotifPermission(); if (r.granted) registerPushToken().catch(() => {}); }
  else if (key === "photos") await ImagePicker.requestMediaLibraryPermissionsAsync();
  else if (key === "mic") await speech()?.requestPermissionsAsync?.();
  else if (key === "fullscreen") await openFullScreenIntentSettings();
  else if (key === "overlay") await requestOverlayPermission();
  else if (key === "battery") await requestBatteryExemption();
  else if (key === "oem") await requestOemSettings();
}

export default function PermissionsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<Record<Key, St> | null>(null);
  const [busy, setBusy] = useState<Key | "all" | null>(null);

  const load = useCallback(async () => setS(await readAll()), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const sub = AppState.addEventListener("change", (x) => { if (x === "active") load(); }); return () => sub.remove(); }, [load]);

  const shown = CARDS.filter((k) => s?.[k.key]?.available !== false);
  const allGranted = !!s && shown.every((k) => s[k.key]?.granted);

  const one = async (key: Key) => { setBusy(key); try { await request(key, s?.[key]); } catch { /* ignore */ } await load(); setBusy(null); };
  const allowAll = async () => {
    setBusy("all");
    let cur = s || (await readAll());
    // System dialogs one after another; then the next settings-only switch.
    for (const k of shown.filter((x) => x.runtime)) { if (!cur[k.key]?.granted && cur[k.key]?.canAskAgain !== false) { try { await request(k.key); } catch { /* ignore */ } } }
    cur = await readAll(); setS(cur);
    const nextSetting = shown.find((x) => !x.runtime && cur[x.key]?.available && !cur[x.key]?.granted);
    if (nextSetting) { try { await request(nextSetting.key); } catch { /* ignore */ } }
    setBusy(null);
  };
  const finish = async () => { await storage.setItem(PERMS_DONE_KEY, "1").catch(() => {}); router.replace("/(site)"); };

  return (
    <View testID="permissions-screen" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: PRIMARY[600] + "22", alignItems: "center", justifyContent: "center" }}><ShieldCheck size={30} color={PRIMARY[600]} /></View>
        <Text style={{ fontSize: 24, fontWeight: "900", color: c.text, marginTop: 8 }}>Set up AzoApp</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 20, marginBottom: 8 }}>Allow these once so bookings, alerts and location work smoothly. You can change them anytime in Settings.</Text>
        {shown.map((k) => {
          const st = s?.[k.key]; const ok = !!st?.granted; const Ic = k.icon;
          return (
            <View key={k.key} testID={`perm-card-${k.key}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: ok ? "rgba(34,197,94,0.45)" : c.border, padding: 14 }}>
              <View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: k.tint + "22", alignItems: "center", justifyContent: "center" }}><Ic size={22} color={k.tint} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{k.title}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{k.why}</Text>
              </View>
              {ok ? (
                <View testID={`perm-${k.key}-granted`} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" }}><Check size={18} color="#fff" /></View>
              ) : (
                <Pressable testID={`perm-${k.key}-allow`} disabled={!!busy} onPress={() => one(k.key)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 6, backgroundColor: PRIMARY[700], opacity: busy ? 0.6 : 1 }}>
                  {busy === k.key ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12.5 }}>{st && !st.canAskAgain && k.runtime ? "Settings" : "Allow"}</Text>}
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>
      <View style={{ padding: 20, paddingBottom: insets.bottom + 16, gap: 10, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
        {!allGranted ? (
          <Pressable testID="perm-allow-all" disabled={!!busy || !s} onPress={allowAll} style={{ height: 52, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
            {busy === "all" ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Allow all permissions</Text>}
          </Pressable>
        ) : null}
        <Pressable testID="perm-continue" onPress={finish} style={{ height: 48, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: allGranted ? 0 : 1, borderColor: c.border, backgroundColor: allGranted ? PRIMARY[700] : "transparent" }}>
          <Text style={{ color: allGranted ? "#fff" : c.textMuted, fontWeight: "800", fontSize: 15 }}>{allGranted ? "Continue" : "Skip for now"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
