/** App Update & Maintenance gate (Customer app). On launch it reads the admin
 *  config for THIS platform and, per spec priority: maintenance > mandatory update.
 *  - Maintenance ON  → blocking full-screen maintenance screen.
 *  - Update needed   → update screen (blocking when force_update).
 *  Update Now downloads the ADMIN-UPLOADED APK (never Play Store) with live progress
 *  + resume support, then launches the Android installer. Native bits (versionCode,
 *  file download, installer intent) are lazy-required so web / Expo Go stay usable. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, Platform, ActivityIndicator, Linking } from "react-native";
import { Image } from "expo-image";
import { Wrench, DownloadCloud, RefreshCw } from "lucide-react-native";
import { api, mediaUrl } from "../api/client";
import { PRIMARY, useTheme } from "../theme";

const PLATFORM = "customer";
const EXPECTED_PACKAGE = "app.azoapp.homeservice";

function expoApplication(): any { try { return require("expo-application"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports
function expoFileSystem(): any { try { return require("expo-file-system"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports
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
  const [downloading, setDownloading] = useState(false);
  const [pct, setPct] = useState(0);
  const [got, setGot] = useState(0);
  const [err, setErr] = useState("");
  const resumableRef = useRef<any>(null);

  const evaluate = useCallback((data: any) => {
    if (!data) return;
    if (data.maintenance_enabled) { setMode("maintenance"); return; }
    const installed = installedVersionCode();
    const latest = Number(data.version_code || 0);
    if (data.update_enabled && latest > 0 && installed < latest && data.apk_url) { setMode("update"); return; }
    setMode("none");
  }, []);

  const load = useCallback(async () => {
    try { const data: any = await api.get(`/app-mgmt/config/${PLATFORM}`); setCfg(data); evaluate(data); }
    catch { /* API error → fail open (never hard-block the app on a config fetch failure) */ }
  }, [evaluate]);
  useEffect(() => { load(); }, [load]);

  const startUpdate = useCallback(async () => {
    setErr("");
    if (!cfg?.apk_url) { setErr("Update file is not available yet. Please try again later."); return; }
    const FS = expoFileSystem();
    const IL = expoIntentLauncher();
    if (!FS || Platform.OS !== "android") {
      // Fallback: open the APK URL directly so the browser downloads it.
      Linking.openURL(cfg.apk_url).catch(() => setErr("Could not start the download."));
      return;
    }
    setDownloading(true); setPct(0); setGot(0);
    const dest = `${FS.cacheDirectory}azoapp-${PLATFORM}-${cfg.version_code}.apk`;
    const onProgress = (p: any) => {
      const total = p.totalBytesExpectedToWrite || Number(cfg.apk_size || 0) || 1;
      const written = p.totalBytesWritten || 0;
      setGot(written);
      setPct(Math.min(100, Math.round((written / total) * 100)));
    };
    try {
      // Resumable download → survives transient network drops (resume from partial).
      const resumable = FS.createDownloadResumable(cfg.apk_url, dest, {}, onProgress);
      resumableRef.current = resumable;
      let result = null;
      try { result = await resumable.downloadAsync(); }
      catch { result = await resumable.resumeAsync().catch(() => null); }
      if (!result?.uri) throw new Error("download-failed");
      // Hand the file to the Android package installer via a content:// URI.
      const contentUri = await FS.getContentUriAsync(result.uri);
      await IL.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
        data: contentUri, flags: 1, type: "application/vnd.android.package-archive",
      });
      setDownloading(false);
    } catch {
      setDownloading(false);
      setErr("Unable to download the update. Please check your connection and try again.");
    }
  }, [cfg]);

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
                <View style={{ height: 10, borderRadius: 5, backgroundColor: c.border, marginTop: 8, overflow: "hidden" }}><View style={{ height: "100%", width: `${pct}%`, backgroundColor: PRIMARY[600] }} /></View>
              </View>
            ) : (
              <Pressable testID="update-now" onPress={startUpdate} style={({ pressed }) => ({ marginTop: 24, alignSelf: "stretch", height: 54, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <DownloadCloud size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Update Now</Text>
              </Pressable>
            )}
            {err ? <Text style={{ color: "#EF4444", fontSize: 12.5, textAlign: "center", marginTop: 12 }}>{err}</Text> : null}
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
