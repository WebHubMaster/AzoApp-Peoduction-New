/** Permission setup (Customer app) — shown once at app open, before Home.
 *  Phase 1: system pop-ups (Location, Notifications, Photos, Mic) open automatically, one after another.
 *  Phase 2: settings-only permissions are taken through a step-by-step wizard. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, AppState, Linking, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { MapPin, BellRing, MonitorSmartphone, Layers, BatteryCharging, Rocket, Image as ImageIcon, Mic, Check, ShieldCheck, Settings as SettingsIcon } from "lucide-react-native";
import { PRIMARY, useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { PERMS_DONE_KEY, refreshNotifPermission } from "@/src/lib/permissions";
import { detectLocation, getLocationName } from "@/src/lib/location";
import { registerPushToken } from "@/src/lib/push";
import {
  PermState, allAlertStates, requestNotificationPermission, openFullScreenIntentSettings,
  requestOverlayPermission, requestBatteryExemption, requestOemSettings,
} from "@/src/lib/notifications";

type Key = "location" | "notifications" | "photos" | "mic" | "fullscreen" | "overlay" | "battery" | "oem";
type St = Pick<PermState, "granted" | "canAskAgain" | "available">;
type Card = { key: Key; icon: any; title: string; why: string; tint: string; runtime?: boolean; steps?: string[]; cta?: string };

function speech(): any { try { const m = require("expo-speech-recognition"); return m?.ExpoSpeechRecognitionModule || null; } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports
const toSt = (p: any): St => ({ granted: !!p?.granted, canAskAgain: p?.canAskAgain !== false, available: true });
const NA: St = { granted: false, canAskAgain: false, available: false };

const CARDS: Card[] = [
  { key: "location", icon: MapPin, title: "Location", why: "Show services in your area and fill your address automatically.", tint: "#0EA5E9", runtime: true },
  { key: "notifications", icon: BellRing, title: "Notifications", why: "Booking, partner arrival, reschedule & chat alerts.", tint: "#F59E0B", runtime: true },
  { key: "photos", icon: ImageIcon, title: "Photos", why: "Upload a profile photo or attach pictures in support chats.", tint: "#10B981", runtime: true },
  { key: "mic", icon: Mic, title: "Microphone", why: "Search services with your voice.", tint: "#6366F1", runtime: true },
  { key: "fullscreen", icon: MonitorSmartphone, title: "Full-Screen Alert", why: "Show a call-style alert on the lock screen for important booking updates.", tint: "#22C55E",
    steps: ["Tap “Open Settings” below", "Turn ON “Allow full-screen notifications” for AzoApp", "Press back — we'll move to the next step"] },
  { key: "overlay", icon: Layers, title: "Display Over Other Apps", why: "Let important alerts pop up while you use other apps.", tint: "#A855F7",
    steps: ["Tap “Open Settings” below", "Find AzoApp and turn ON “Allow display over other apps”", "Press back — we'll move to the next step"] },
  { key: "battery", icon: BatteryCharging, title: "Run in Background", why: "Keep alerts reliable when the phone tries to save battery.", tint: "#38BDF8", cta: "Allow",
    steps: ["Tap “Allow” below", "Choose “Allow” (or “Unrestricted”) for AzoApp", "Come back — we'll move to the next step"] },
  { key: "oem", icon: Rocket, title: "Autostart & Pop-ups", why: "On Xiaomi / Oppo / Vivo phones, allow Autostart so alerts aren't blocked.", tint: "#EF4444",
    steps: ["Tap “Open Settings” below", "Turn ON “Autostart” for AzoApp", "Also allow “Display pop-up windows while running in background”", "Press back to finish"] },
];
const BLOCKED_STEPS = (t: string) => ["Tap “Open Settings” below", "Open “Permissions”", `Set ${t} to “Allow”`, "Press back — we'll move to the next step"];

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
  const card = CARDS.find((x) => x.key === key);
  if (card?.runtime && st && !st.granted && st.canAskAgain === false) { await Linking.openSettings().catch(() => {}); return; }
  if (key === "location") { const p = await Location.requestForegroundPermissionsAsync(); if (p.granted && !getLocationName()) detectLocation().catch(() => {}); }
  else if (key === "notifications") { const r = await requestNotificationPermission(); refreshNotifPermission(); if (r.granted) registerPushToken().catch(() => {}); }
  else if (key === "photos") await ImagePicker.requestMediaLibraryPermissionsAsync();
  else if (key === "mic") await speech()?.requestPermissionsAsync?.();
  else if (key === "fullscreen") await openFullScreenIntentSettings();
  else if (key === "overlay") await requestOverlayPermission();
  else if (key === "battery") await requestBatteryExemption();
  else if (key === "oem") await requestOemSettings();
}

/** Steps that need the Settings app: settings-only perms + runtime perms the user blocked. */
const wizardKeys = (s: Record<Key, St>): Key[] =>
  CARDS.filter((k) => s[k.key]?.available !== false && !s[k.key]?.granted && (!k.runtime || s[k.key]?.canAskAgain === false)).map((k) => k.key);

export default function PermissionsScreen() {
  const router = useRouter();
  const [s, setS] = useState<Record<Key, St> | null>(null);
  const [phase, setPhase] = useState<"auto" | "wizard">("auto");
  const [asking, setAsking] = useState<Key | null>(null);
  const [steps, setSteps] = useState<Key[]>([]);
  const [idx, setIdx] = useState(0);
  const started = useRef(false);

  const finish = useCallback(async () => { await storage.setItem(PERMS_DONE_KEY, "1").catch(() => {}); router.replace("/(site)"); }, [router]);

  // Phase 1 — fire the system pop-ups automatically, one by one.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      let cur = await readAll(); setS(cur);
      for (const k of CARDS.filter((x) => x.runtime)) {
        const st = cur[k.key];
        if (st?.available === false || st?.granted || st?.canAskAgain === false) continue;
        setAsking(k.key);
        try { await request(k.key); } catch { /* ignore */ }
        cur = await readAll(); setS(cur);
      }
      setAsking(null);
      const w = wizardKeys(cur);
      if (!w.length) { finish(); return; }
      setSteps(w); setIdx(0); setPhase("wizard");
    })();
  }, [finish]);

  return phase === "auto"
    ? <AutoPhase s={s} asking={asking} />
    : <Wizard s={s} setS={setS} steps={steps} idx={idx} setIdx={setIdx} onDone={finish} />;
}

function AutoPhase({ s, asking }: { s: Record<Key, St> | null; asking: Key | null }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const cards = CARDS.filter((k) => k.runtime && s?.[k.key]?.available !== false);
  return (
    <View testID="permissions-screen" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 24, gap: 12 }}>
        <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: PRIMARY[600] + "22", alignItems: "center", justifyContent: "center" }}><ShieldCheck size={30} color={PRIMARY[600]} /></View>
        <Text style={{ fontSize: 24, fontWeight: "900", color: c.text, marginTop: 8 }}>Set up AzoApp</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, lineHeight: 20, marginBottom: 8 }}>Tap “Allow” on each pop-up so bookings, alerts and location work smoothly.</Text>
        {cards.map((k) => {
          const st = s?.[k.key]; const ok = !!st?.granted; const Ic = k.icon; const now = asking === k.key;
          return (
            <View key={k.key} testID={`perm-card-${k.key}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: ok ? "rgba(34,197,94,0.45)" : now ? PRIMARY[600] : c.border, padding: 14 }}>
              <View style={{ width: 42, height: 42, borderRadius: 6, backgroundColor: k.tint + "22", alignItems: "center", justifyContent: "center" }}><Ic size={22} color={k.tint} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: "800", fontSize: 15 }}>{k.title}</Text>
                <Text style={{ color: c.textMuted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{k.why}</Text>
              </View>
              {ok ? <View testID={`perm-${k.key}-granted`} style={{ width: 32, height: 32, borderRadius: 6, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center" }}><Check size={18} color="#fff" /></View>
                : now ? <ActivityIndicator testID={`perm-${k.key}-asking`} color={PRIMARY[600]} /> : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

type WizardProps = { s: Record<Key, St> | null; setS: (v: Record<Key, St>) => void; steps: Key[]; idx: number; setIdx: (n: number) => void; onDone: () => void };

function Wizard({ s, setS, steps, idx, setIdx, onDone }: WizardProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = steps[idx];
  const card = CARDS.find((x) => x.key === key)!;
  const ok = !!s?.[key]?.granted;
  const advanced = useRef<Key | null>(null);
  const advanceIfGranted = useCallback((cur: Record<Key, St>) => {
    if (!cur[key]?.granted || advanced.current === key) return;
    advanced.current = key;
    setTimeout(() => { setOpened(false); if (idx + 1 >= steps.length) onDone(); else setIdx(idx + 1); }, 600);
  }, [key, idx, steps.length, onDone, setIdx]);

  const next = useCallback(() => { setOpened(false); if (idx + 1 >= steps.length) onDone(); else setIdx(idx + 1); }, [idx, steps.length, onDone, setIdx]);

  // Back from Settings → re-check; move on automatically once granted.
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (x) => {
      if (x !== "active") return;
      const cur = await readAll(); setS(cur); advanceIfGranted(cur);
    });
    return () => sub.remove();
  }, [advanceIfGranted, setS]);

  const open = async () => {
    setBusy(true);
    try { await request(key, s?.[key]); } catch { /* ignore */ }
    setOpened(true); setBusy(false);
    const cur = await readAll(); setS(cur); advanceIfGranted(cur);
  };

  const Ic = card.icon;
  const howTo = card.runtime ? BLOCKED_STEPS(card.title) : card.steps || [];
  const cta = card.runtime ? "Open Settings" : card.cta || "Open Settings";
  return (
    <View testID="perm-wizard" style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 14 }}>
        <Text testID="perm-wizard-progress" style={{ color: c.textMuted, fontSize: 12.5, fontWeight: "800", letterSpacing: 0.6 }}>STEP {idx + 1} OF {steps.length}</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {steps.map((k, i) => <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < idx || (i === idx && ok) ? "#22C55E" : i === idx ? PRIMARY[600] : c.border }} />)}
        </View>
        <View style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: card.tint + "22", alignItems: "center", justifyContent: "center", marginTop: 16 }}>
          {ok ? <Check size={36} color="#22C55E" /> : <Ic size={36} color={card.tint} />}
        </View>
        <Text testID="perm-wizard-title" style={{ fontSize: 24, fontWeight: "900", color: c.text }}>{card.title}</Text>
        <Text style={{ fontSize: 14.5, color: c.textMuted, lineHeight: 21 }}>{card.why}</Text>
        <View style={{ backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 16, gap: 12, marginTop: 6 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 14 }}>How to allow</Text>
          {howTo.map((t, i) => (
            <View key={t} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: PRIMARY[600] + "22", alignItems: "center", justifyContent: "center" }}><Text style={{ color: PRIMARY[700], fontWeight: "900", fontSize: 12 }}>{i + 1}</Text></View>
              <Text style={{ flex: 1, color: c.text, fontSize: 13.5, lineHeight: 20 }}>{t}</Text>
            </View>
          ))}
        </View>
        {ok ? <Text testID="perm-wizard-granted" style={{ color: "#16A34A", fontWeight: "800", fontSize: 14 }}>Allowed — moving to the next step…</Text>
          : opened ? <Text testID="perm-wizard-not-yet" style={{ color: "#D97706", fontWeight: "700", fontSize: 13 }}>Not turned on yet. Tap “{cta}” again, or skip for now.</Text> : null}
      </ScrollView>
      <View style={{ padding: 20, paddingBottom: insets.bottom + 16, gap: 10, borderTopWidth: 1, borderColor: c.border, backgroundColor: c.bg }}>
        <Pressable testID="perm-wizard-open" disabled={busy || ok} onPress={open} style={{ height: 52, borderRadius: 6, backgroundColor: ok ? "#22C55E" : PRIMARY[700], flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}>
          {busy ? <ActivityIndicator color="#fff" /> : <>{ok ? <Check size={18} color="#fff" /> : <SettingsIcon size={18} color="#fff" />}<Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{ok ? "Allowed" : cta}</Text></>}
        </Pressable>
        <Pressable testID="perm-wizard-skip" onPress={next} style={{ height: 46, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.border }}>
          <Text style={{ color: c.textMuted, fontWeight: "800", fontSize: 14.5 }}>{idx + 1 >= steps.length ? "Finish" : "Skip this step"}</Text>
        </Pressable>
      </View>
    </View>
  );
}
