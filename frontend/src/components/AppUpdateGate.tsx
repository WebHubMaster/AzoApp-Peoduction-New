/** App Update & Maintenance gate (Partner app). Mirrors the Customer gate:
 *  maintenance > mandatory update. Downloads the ADMIN-UPLOADED Partner APK (never
 *  Play Store) with live progress + resume, then launches the Android installer. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Modal, Platform, Linking } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/src/theme";
import { Icon } from "@/src/components/Icon";
import { api, mediaUrl } from "@/src/api/client";

const PLATFORM = "partner";

function expoApplication(): any { try { return require("expo-application"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports
function expoFileSystem(): any { try { return require("expo-file-system/legacy"); } catch { try { return require("expo-file-system"); } catch { return null; } } } // eslint-disable-line @typescript-eslint/no-require-imports
function expoIntentLauncher(): any { try { return require("expo-intent-launcher"); } catch { return null; } } // eslint-disable-line @typescript-eslint/no-require-imports

function installedVersionCode(): number {
  if (Platform.OS === "web") return Number.MAX_SAFE_INTEGER;
  const App = expoApplication();
  const raw = App?.nativeBuildVersion ?? App?.default?.nativeBuildVersion;
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) ? n : 0;
}

export default function AppUpdateGate() {
  const { colors } = useTheme();
  const [cfg, setCfg] = useState<any>(null);
  const [mode, setMode] = useState<"none" | "maintenance" | "update">("none");
  const [downloading, setDownloading] = useState(false);
  const [pct, setPct] = useState(0);
  const [got, setGot] = useState(0);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
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
    catch { /* fail open on config-fetch error */ }
  }, [evaluate]);
  useEffect(() => { load(); }, [load]);

  const startUpdate = useCallback(async () => {
    setErr(""); setNote("");
    const url = mediaUrl(cfg?.apk_url || "");
    if (!url) { setErr("Update file is not available yet. Please try again later."); return; }
    const FS = expoFileSystem();
    const IL = expoIntentLauncher();
    if (!FS?.createDownloadResumable || !IL?.startActivityAsync || Platform.OS !== "android") {
      Linking.openURL(url).catch(() => setErr("Could not start the download."));
      return;
    }
    setDownloading(true); setPct(0); setGot(0);
    const expected = Number(cfg.apk_size || 0);
    const dest = `${FS.cacheDirectory || FS.documentDirectory}azoapp-${PLATFORM}-${cfg.version_code}.apk`;
    const onProgress = (p: any) => {
      const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : expected || 1;
      const written = p.totalBytesWritten || 0;
      setGot(written);
      setPct(Math.min(99, Math.round((written / total) * 100)));
    };
    let stage = "download";
    try {
      // Already downloaded earlier (e.g. user cancelled the installer) → install straight away.
      const info = await FS.getInfoAsync(dest).catch(() => null);
      let uri: string | null = info?.exists && expected > 0 && info.size === expected ? dest : null;
      if (!uri) {
        if (info?.exists) await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
        let resumable = FS.createDownloadResumable(url, dest, {}, onProgress);
        resumableRef.current = resumable;
        let result: any = null;
        let lastErr: any = null;
        for (let attempt = 0; attempt < 5 && !result?.uri; attempt++) {
          try {
            const saved = attempt > 0 ? resumable.savable?.() : null;
            if (attempt > 0 && !saved?.resumeData) {
              await FS.deleteAsync(dest, { idempotent: true }).catch(() => {});
              resumable = FS.createDownloadResumable(url, dest, {}, onProgress);
              resumableRef.current = resumable;
              result = await resumable.downloadAsync();
            } else {
              result = attempt === 0 ? await resumable.downloadAsync() : await resumable.resumeAsync();
            }
          } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); }
        }
        if (!result?.uri) throw new Error(`Download failed${lastErr?.message ? ` (${lastErr.message})` : ""}. Please check your internet and try again.`);
        if (result.status && (result.status < 200 || result.status >= 300)) {
          await FS.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
          throw new Error(`Download failed (server error ${result.status}). Please try again in a moment.`);
        }
        const done = await FS.getInfoAsync(result.uri).catch(() => null);
        if (!done?.exists || done.size < 1024 * 100 || (expected > 0 && done.size !== expected)) {
          await FS.deleteAsync(result.uri, { idempotent: true }).catch(() => {});
          throw new Error("Downloaded file is incomplete. Please try again.");
        }
        uri = result.uri;
      }
      setPct(100);
      stage = "install";
      const contentUri = await FS.getContentUriAsync(uri);
      // FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK → system package installer.
      const opts = { data: contentUri, flags: 0x1 | 0x10000000, type: "application/vnd.android.package-archive" };
      try { await IL.startActivityAsync("android.intent.action.VIEW", opts); }
      catch { await IL.startActivityAsync("android.intent.action.INSTALL_PACKAGE", opts); }
      setDownloading(false);
      setNote("If Android asks, allow \"Install unknown apps\" for this app, then tap Update Now again to finish installing.");
    } catch (e: any) {
      setDownloading(false);
      const msg = String(e?.message || "");
      if (stage === "install") setErr(`Could not open the installer${msg ? ` (${msg})` : ""}. Allow "Install unknown apps" for this app in Settings and tap Update Now again.`);
      else setErr(msg || "Unable to download the update. Please check your connection and try again.");
    }
  }, [cfg]);

  if (mode === "none") return null;
  const totalMb = ((Number(cfg?.apk_size || 0)) / 1024 / 1024).toFixed(1);

  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 24, alignItems: "center", justifyContent: "center" }} testID={`app-gate-${mode}`}>
        {mode === "maintenance" ? (
          <View style={{ alignItems: "center", maxWidth: 380 }}>
            {cfg?.maintenance_image ? (
              <Image source={{ uri: mediaUrl(cfg.maintenance_image) }} style={{ width: 220, height: 160, borderRadius: 6, marginBottom: 20 }} contentFit="cover" />
            ) : cfg?.maintenance_icon ? (
              <Image source={{ uri: mediaUrl(cfg.maintenance_icon) }} style={{ width: 96, height: 96, borderRadius: 6, marginBottom: 20 }} contentFit="contain" />
            ) : (
              <View style={{ width: 96, height: 96, borderRadius: 6, backgroundColor: "#F59E0B22", alignItems: "center", justifyContent: "center", marginBottom: 20 }}><Icon name="wrench-outline" size={44} color="#F59E0B" /></View>
            )}
            <Text testID="maint-title" style={{ fontSize: 24, fontWeight: "900", color: colors.text, textAlign: "center" }}>{cfg?.maintenance_title || "We’ll be back soon"}</Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 12, lineHeight: 21 }}>{cfg?.maintenance_description || "The app is under maintenance. Please try again later."}</Text>
            <Pressable testID="maint-retry" onPress={load} style={{ marginTop: 24, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border }}>
              <Icon name="refresh" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontWeight: "800" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ alignItems: "center", maxWidth: 400, width: "100%" }}>
            <View style={{ width: 96, height: 96, borderRadius: 6, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center", marginBottom: 20 }}><Icon name="cloud-download-outline" size={44} color={colors.primary} /></View>
            <Text style={{ fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" }}>New Update Available</Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", marginTop: 10, lineHeight: 21 }}>A new version of the app is available. Please update to continue.</Text>
            {cfg?.latest_version ? <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "800", marginTop: 8 }}>Version {cfg.latest_version}</Text> : null}
            {cfg?.release_notes ? (
              <View style={{ marginTop: 16, alignSelf: "stretch", backgroundColor: colors.surface, borderRadius: 6, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Release Notes</Text>
                <Text style={{ fontSize: 13, color: colors.text, lineHeight: 20 }}>{cfg.release_notes}</Text>
              </View>
            ) : null}
            {downloading ? (
              <View style={{ alignSelf: "stretch", marginTop: 20 }}>
                <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center" }}>Downloading Update… {pct}%</Text>
                <Text style={{ fontSize: 11.5, color: colors.textMuted, textAlign: "center", marginTop: 2 }}>{(got / 1024 / 1024).toFixed(1)} MB / {totalMb} MB</Text>
                <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: 8, overflow: "hidden" }}><View style={{ height: "100%", width: `${pct}%`, backgroundColor: colors.primary }} /></View>
              </View>
            ) : (
              <Pressable testID="update-now" onPress={startUpdate} style={({ pressed }) => ({ marginTop: 24, alignSelf: "stretch", height: 54, borderRadius: 6, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <Icon name="cloud-download-outline" size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>Update Now</Text>
              </Pressable>
            )}
            {note && !err && !downloading ? <Text testID="update-note" style={{ color: colors.textMuted, fontSize: 12.5, textAlign: "center", marginTop: 12 }}>{note}</Text> : null}
            {err ? <Text style={{ color: "#EF4444", fontSize: 12.5, textAlign: "center", marginTop: 12 }}>{err}</Text> : null}
            {!cfg?.force_update && !downloading ? (
              <Pressable testID="update-later" onPress={() => setMode("none")} style={{ marginTop: 14 }}><Text style={{ color: colors.textMuted, fontWeight: "700" }}>Later</Text></Pressable>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}
