/** App Update & Maintenance gate (Customer app). On launch it reads the admin
 *  config for THIS platform and, per spec priority: maintenance > mandatory update.
 *  - Maintenance ON  → blocking full-screen maintenance screen.
 *  - Update needed   → update screen (blocking when force_update).
 *  Update Now downloads the ADMIN-UPLOADED APK (never Play Store) with live progress
 *  + resume support, then launches the Android installer. Native bits (versionCode,
 *  file download, installer intent) are lazy-required so web / Expo Go stay usable. */
import React, { useCallback, useEffect, useState } from "react";
import { AppState, View, Text, Pressable, Modal, Platform, Linking } from "react-native";
import { Image } from "expo-image";
import { Wrench, DownloadCloud, RefreshCw } from "lucide-react-native";
import { api, mediaUrl } from "../api/client";
import { PRIMARY, useTheme } from "../theme";

import { useApkUpdate, startApkDownload, restoreApkDownload, installApk } from "@/src/lib/apkUpdate";

const PLATFORM = "customer";
const EXPECTED_PACKAGE = "app.azoapp.homeservice";

function expoApplication(): any { try { return require("expo-application"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports
function expoFileSystem(): any { try { return require("expo-file-system/legacy"); } catch { try { return require("expo-file-system"); } catch { return null; } } } // eslint-disable-line @typescript-eslint/no-require-imports
function expoIntentLauncher(): any { try { return require("expo-intent-launcher"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports

function installedVersionCode(): number {
  if (Platform.OS === "web") return Number.MAX_SAFE_INTEGER; // web never needs an APK update
  const App = expoApplication();
  const raw = App?.nativeBuildVersion ?? App?.default?.nativeBuildVersion;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export default function AppUpdateGate() {
  const { c, isDark } = useTheme();
  const [cfg, setCfg] = useState<any>(null);
  const [mode, setMode] = useState<"none" | "maintenance" | "update">("none");
  const dl = useApkUpdate();
  const downloading = dl.status === "downloading";
  const ready = dl.status === "ready";
  const { pct, got } = dl;
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const evaluate = useCallback((data: any) => {
    if (!data) return;
    if (data.maintenance_enabled) { setMode("maintenance"); return; }
    const installed = installedVersionCode();
    const latest = Number(data.version_code || 0);
    if (data.update_enabled && latest > 0 && installed < latest && data.apk_url) { setMode("update"); restoreApkDownload(latest); return; }
    setMode("none");
  }, []);

  const load = useCallback(async () => {
    try { const data: any = await api.get(`/app-mgmt/config/${PLATFORM}`); setCfg(data); evaluate(data); }
    catch { /* API error → fail open (never hard-block the app on a config fetch failure) */ }
  }, [evaluate]);
  useEffect(() => { load(); }, [load]);

  // Returning from background → refresh config + real download status.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") load(); });
    return () => sub.remove();
  }, [load]);

  const startUpdate = useCallback(async () => {
    setErr(""); setNote("");
    if (ready) { await installApk(); setNote("If Android asks, allow \"Install unknown apps\" for this app, then tap Install Update again."); return; }
    const url = mediaUrl(cfg?.apk_url || "");
    if (!url) { setErr("Update file is not available yet. Please try again later."); return; }
    if (Platform.OS !== "android" || !expoFileSystem()?.createDownloadResumable || !expoIntentLauncher()?.startActivityAsync) {
      Linking.openURL(url).catch(() => setErr("Could not start the download."));
      return;
    }
    startApkDownload(url, Number(cfg.version_code || 0), Number(cfg.apk_size || 0), PLATFORM);
  }, [cfg, ready]);
  const shownErr = err || (dl.status === "error" ? dl.error : "");

  if (mode === "none") return null;

  const overlayBg = isDark ? "#0B1220" : "#0F172A";

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, alignItems: "center", justifyContent: "center" }} testID={`app-gate-${mode}`}>
        {mode === "maintenance" ? (
          <View style={{ alignItems: "center", maxWidth: 380 }}>
            {cfg?.maintenance_image ? (
              <Image source={{ uri: mediaUrl(cfg.maintenance_image) }} style={{ width: 260, height: 140, marginBottom: 20 }} contentFit="contain" />
            ) : cfg?.maintenance_icon ? (
              <Image source={{ uri: mediaUrl(cfg.maintenance_icon) }} style={{ width: 140, height: 96, marginBottom: 20 }} contentFit="contain" />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 6, backgroundColor: "#F59E0B22", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><Wrench size={44} color="#F59E0B" /></View>
            )}
            <Text testID="maint-title" style={{ fontSize: 24, fontWeight: "900", color: c.text, textAlign: "center" }}>{cfg?.maintenance_title || "We’ll be back soon"}</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: "center", marginTop: 12, lineHeight: 21 }}>{cfg?.maintenance_description || "The app is under maintenance. Please try again later."}</Text>
            <Pressable testID="maint-retry" onPress={load} style={{ marginTop: 24, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 6, borderWidth: 1, borderColor: c.border }}>
              <RefreshCw size={16} color={c.primaryText} /><Text style={{ color: c.primaryText, fontWeight: "800" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: "center", maxWidth: 400, width: "100%" }}>
            <View style={{ width: 96, height: 96, borderRadius: 6, backgroundColor: PRIMARY[600] + "22", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><DownloadCloud size={44} color={PRIMARY[600]} /></View>
            <Text style={{ fontSize: 22, fontWeight: "900", color: c.text, textAlign: "center" }}>New Update Available</Text>
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: "center", marginTop: 10, lineHeight: 21 }}>A new version of the app is available. Please update to continue.</Text>
            {cfg?.latest_version ? <Text style={{ fontSize: 13, color: c.primaryText, fontWeight: "800", marginTop: 8 }}>Version {cfg.latest_version}</Text> : null}
            {cfg?.release_notes ? (
              <View style={{ marginTop: 16, alignSelf: "stretch", backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: c.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Release Notes</Text>
                <Text style={{ fontSize: 13, color: c.text, lineHeight: 20 }}>{cfg.release_notes}</Text>
              </View>
            ) : null}
            {downloading ? (
              <View style={{ alignSelf: "stretch", marginTop: 20 }}>
                <Text style={{ fontSize: 13, color: c.textMuted, textAlign: "center" }}>Downloading Update… {pct}%</Text>
                <Text style={{ fontSize: 11.5, color: c.textMuted, textAlign: "center", marginTop: 2 }}>{(got / 1024 / 1024).toFixed(1)} MB / {((Number(cfg?.apk_size || 0)) / 1024 / 1024).toFixed(1) || "?"} MB</Text>
                <Text testID="update-bg-hint" style={{ fontSize: 11.5, color: c.textMuted, textAlign: "center", marginTop: 6 }}>You can minimise the app — the download continues in the background.</Text>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: c.border, marginTop: 8, overflow: "hidden" }}><View style={{ height: "100%", width: `${pct}%`, backgroundColor: PRIMARY[600] }} /></View>
              </View>
            ) : (
              <Pressable testID="update-now" onPress={startUpdate} style={({ pressed }) => ({ marginTop: 24, alignSelf: "stretch", height: 54, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <DownloadCloud size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{ready ? "Install Update" : dl.status === "error" ? "Resume Download" : "Update Now"}</Text>
              </Pressable>
            )}
            {note && !shownErr && !downloading ? <Text testID="update-note" style={{ color: c.textMuted, fontSize: 12.5, textAlign: "center", marginTop: 12 }}>{note}</Text> : null}
            {ready && !shownErr ? <Text testID="update-ready" style={{ color: "#16A34A", fontSize: 13, fontWeight: "800", textAlign: "center", marginTop: 12 }}>Update downloaded — tap Install Update</Text> : null}
            {shownErr ? <Text testID="update-error" style={{ color: "#EF4444", fontSize: 12.5, textAlign: "center", marginTop: 12 }}>{shownErr}</Text> : null}
            {!cfg?.force_update && !downloading ? (
              <Pressable testID="update-later" onPress={() => setMode("none")} style={{ marginTop: 14 }}><Text style={{ color: c.textMuted, fontWeight: "700" }}>Later</Text></Pressable>
            ) : null}
          </View>
        )}
        <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 0, backgroundColor: overlayBg }} />
      </View>
    </Modal>
  );
}
