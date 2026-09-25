import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, TextInput, Linking, ActivityIndicator, Modal, Platform } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { api, MEDIA_ORIGIN } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { AppShellHeader } from "@/src/components/AppShell";
import { Icon } from "@/src/components/Icon";
import { QrBookingPoster } from "@/src/components/qr/QrBookingPoster";
import { PosterControls } from "@/src/components/qr/PosterControls";
import { QrAnalytics } from "@/src/components/qr/QrAnalytics";
import { KitCard, KitSeg, WBtn, SLATE, EMERALD, useQrPalette } from "@/src/components/qr/qrKit";
import { buildPoster, savePosterFile, sharePosterFile, printPosterFile, openPosterFile, canShareWithCaption, shareViaBrowser, PosterFormat, PosterParams } from "@/src/lib/posterActions";
import { TEMPLATES, DEFAULT_CONFIG, QrConfig, POSTER_CANVAS } from "@/src/pages/merchant/qrData";

const WEB_ORIGIN = (process.env.EXPO_PUBLIC_WEB_URL || MEDIA_ORIGIN).replace(/\/+$/, "");
const PANEL = "/merchant/panel";

/* 1:1 port of web_panel/src/pages/merchant/scanqr/ScanQRModule.jsx (mobile view). */
export default function MerchantScanQr() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const brand = useBrand();
  const toast = useToast();
  const qc = useQueryClient();
  const { P, dark, heading, muted, colors } = useQrPalette();

  const codeQ = useQuery({ queryKey: ["merchant-my-code"], queryFn: () => api.get<any>("/merchant/my-code") });
  const cfgQ = useQuery({ queryKey: ["merchant-qr-config"], queryFn: () => api.get<any>(`${PANEL}/qr/config`) });
  const code: string = codeQ.data?.merchant_code || "";
  // Prefer the canonical customer-facing URL from the backend (matches the web panel &
  // physical QR — always the public site, never the api host). Fall back to the web origin.
  const link = codeQ.data?.ref_url || (code ? `${WEB_ORIGIN}/?ref=${code}` : "");
  const shopName = user?.shop_name || user?.name || "My Shop";
  const adminLogo = brand.branding.logo_light || brand.branding.logo_dark || brand.branding.logo || "";

  const [config, setConfigState] = useState<QrConfig | null>(null);
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [waMsgOverride, setWaMsg] = useState<string | null>(null);
  const [boxW, setBoxW] = useState(340);
  const exportRef = useRef<View>(null);
  const lastSaved = useRef<string | null>(null);

  // hydrate from server config (same merge rules as web)
  useEffect(() => {
    if (!cfgQ.isSuccess && !cfgQ.isError) return;
    const saved = cfgQ.data || {};
    const s = saved.show || {};
    const merged: QrConfig = {
      ...DEFAULT_CONFIG, ...saved,
      businessName: saved.businessName || shopName,
      phone: saved.phone || user?.phone?.replace("+91", "") || "",
      logoUrl: adminLogo,
      show: { logo: s.logo !== false, tagline: s.tagline !== false },
      services: saved.services || DEFAULT_CONFIG.services,
    };
    lastSaved.current = JSON.stringify(merged);
    setConfigState(merged);
  }, [cfgQ.data, cfgQ.isSuccess, cfgQ.isError]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultWaMsg = useMemo(() => `Hi \u{1F44B}\nBook trusted home services from ${shopName}.\nElectrician, Plumber, AC Repair, Appliance Repair and more.\n\nBook now:\n${link}\n\nScan our QR or use the booking link.`, [shopName, link]);
  const waMsg = waMsgOverride ?? defaultWaMsg;

  useEffect(() => {
    if (config && (config.logoUrl || "") !== (adminLogo || "")) setConfigState((c) => (c ? { ...c, logoUrl: adminLogo } : c));
  }, [adminLogo]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced persist — only when the config actually changed vs last saved
  useEffect(() => {
    if (!config) return;
    const snap = JSON.stringify(config);
    if (snap === lastSaved.current) return;
    const t = setTimeout(() => { lastSaved.current = snap; api.put(`${PANEL}/qr/config`, config).catch(() => {}); }, 900);
    return () => clearTimeout(t);
  }, [config]);

  const setConfig = (patch: Partial<QrConfig>) => setConfigState((c) => (c ? { ...c, ...patch } : c));
  const resetConfig = () => setConfigState({ ...DEFAULT_CONFIG, businessName: shopName, phone: user?.phone?.replace("+91", "") || "", logoUrl: adminLogo });

  const businessName = config?.businessName || shopName;
  const tpl = TEMPLATES.find((t) => t.id === config?.template) || TEMPLATES[0];
  const posterBrand = useMemo(() => ({
    logo: config?.show?.logo === false ? "" : (config?.logoUrl || adminLogo || ""),
    siteName: brand.branding.site_name || "AzoApp",
    primary: config?.primary || tpl.primary || "#0D47A1",
    secondary: tpl.primary2 || "",
  }), [config?.show?.logo, config?.logoUrl, config?.primary, adminLogo, tpl, brand.branding.site_name]);
  const posterTrust = config?.show?.tagline === false ? "" : "Trusted Home Services";

  const shareCaption = `Book trusted home services with ${businessName} on ${brand.branding.site_name || "AzoApp"} — Electrician, Plumber, AC Repair, Appliance Repair & more.`;
  const shareMessage = `${shareCaption}\n\nBook now: ${link}`;
  const fileName = `azoapp-poster-${code}`;
  const posterParams: PosterParams = { link, name: businessName, primary: posterBrand.primary, secondary: posterBrand.secondary, logo: posterBrand.logo, site: posterBrand.siteName, trust: posterTrust };
  const makePoster = (fmt: PosterFormat, caption?: string) => buildPoster(fmt, caption ? { ...posterParams, caption } : posterParams, fileName, exportRef);
  // Native single-message share (react-native-share in EAS build / Web Share) when available.
  // Expo Go: open the share page in Chrome/Safari → Web Share sends poster + caption as ONE message.
  // Last resort: the message + link are printed INTO the poster (one image = one message).
  const shareWith = async (channel: "system" | "whatsapp", caption: string) => {
    if (canShareWithCaption()) return sharePosterFile(await makePoster("png"), { channel, caption, title: businessName });
    if (Platform.OS !== "web" && (await shareViaBrowser(posterParams, code, channel, caption))) return "shared" as const;
    const file = await makePoster("png", caption);
    return sharePosterFile(file, { channel, caption, title: businessName, captionEmbedded: true });
  };

  const copy = async () => { await Clipboard.setStringAsync(link); setCopied(true); toast.success("Link copied successfully"); setTimeout(() => setCopied(false), 1500); };
  const isAbort = (e: any) => e && (e.name === "AbortError" || /cancel|abort/i.test(String(e.message || "")));

  const nativeShare = async () => {
    if (busy) return;
    setBusy("share");
    try {
      const r = await shareWith("system", shareMessage);
      if (r === "shared-two-step") toast.info("Poster shared — now send the message with your link");
    } catch (e) { if (!isAbort(e)) setShareOpen(true); } finally { setBusy(""); }
  };
  const waShare = async () => {
    if (busy) return;
    setBusy("wa");
    try {
      const r = await shareWith("whatsapp", waMsg);
      if (r === "shared-two-step") toast.info("Poster shared — now send the message with your link on WhatsApp");
      else if (r === "fallback") toast.success("Poster saved — attach it in WhatsApp with your message");
    } catch (e) {
      if (isAbort(e)) return;
      toast.error("Could not attach the poster — sharing the link instead");
      const wa = `whatsapp://send?text=${encodeURIComponent(waMsg)}`;
      const can = await Linking.canOpenURL(wa).catch(() => false);
      Linking.openURL(can ? wa : `https://wa.me/?text=${encodeURIComponent(waMsg)}`).catch(() => toast.error("Could not open WhatsApp"));
    } finally { setBusy(""); }
  };
  const downloadPoster = async (fmt: PosterFormat) => {
    if (busy) return;
    setBusy(fmt);
    try {
      const file = await makePoster(fmt);
      const r = await savePosterFile(file);
      if (r.status === "saved") {
        toast.success(`Poster downloaded (${fmt.toUpperCase()})`);
        if (fmt === "pdf") openPosterFile(file, r.uri).catch(() => {});
      } else toast.success(`Poster ready (${fmt.toUpperCase()}) — choose where to save`);
    } catch (e) { if (!isAbort(e)) toast.error("Download failed — please retry"); } finally { setBusy(""); }
  };
  const printPoster = async () => {
    if (busy) return;
    setBusy("print");
    try { await printPosterFile(await makePoster("png")); }
    catch (e) { if (!isAbort(e)) toast.error("Print failed"); } finally { setBusy(""); }
  };

  const refreshing = codeQ.isFetching || cfgQ.isFetching;
  const onRefresh = () => { codeQ.refetch(); cfgQ.refetch(); qc.invalidateQueries({ queryKey: ["merchant-qr-analytics"] }); };

  // preview: web previewBaseW = 340 → poster scaled to fit, × zoom
  const baseW = Math.min(340, boxW);
  const previewScale = (baseW / POSTER_CANVAS.w) * zoom;
  const pw = POSTER_CANVAS.w * previewScale, ph = POSTER_CANVAS.h * previewScale;

  const ready = !!config && !codeQ.isLoading;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>

      {/* offscreen full-res poster (1080×1350, same as web export node) */}
      {ready ? (
        <View style={Platform.OS === "web" ? { position: "absolute", left: 0, top: 0, zIndex: -1 } : { position: "absolute", left: -4000, top: 0 }} pointerEvents="none">
          <View ref={exportRef} collapsable={false} style={{ width: POSTER_CANVAS.w, height: POSTER_CANVAS.h, backgroundColor: "#fff" }}>
            <QrBookingPoster qrValue={link} token={code} merchantName={businessName} brand={posterBrand} trustLine={posterTrust} width={POSTER_CANVAS.w} height={POSTER_CANVAS.h} scale={POSTER_CANVAS.scale} link={link} />
          </View>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing && ready} onRefresh={onRefresh} tintColor={P[700]} colors={[P[700]]} />}
        testID="scanqr-module"
      >
        {!ready ? (
          <View style={{ paddingVertical: 80, alignItems: "center" }}><ActivityIndicator color={P[600]} /></View>
        ) : (
          <>
            {/* Header */}
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 24, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6, color: heading }} testID="merchant-scanqr-header">Scan QR</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: muted, marginTop: 4 }}>Share your booking link, generate branded QR posters and let customers book your services instantly.</Text>
            </View>

            {/* Hero */}
            <LinearGradient colors={[P[800], P[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 20, marginBottom: 24, gap: 24, boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.1)" }} testID="scanqr-hero">
              <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 16, alignSelf: "center" }}>
                <QRCode value={link || " "} size={150} color="#0b1220" backgroundColor="#fff" />
              </View>
              <View style={{ minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, marginBottom: 8 }}>
                  <Icon name="shield-check" size={14} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Verified Merchant QR</Text>
                </View>
                <Text style={{ color: "#fff", fontSize: 24, lineHeight: 32, fontWeight: "800" }}>{businessName}</Text>
                <Text style={{ color: P[100], fontSize: 14, lineHeight: 20 }}>{config?.tagline || "Trusted Home Services"}</Text>
                <Text style={{ color: P[100], fontSize: 12, lineHeight: 16, marginTop: 8 }} testID="hero-link">{link}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ color: "#fff", fontSize: 11 }}>Ref: <Text style={{ fontWeight: "700" }}>{code}</Text></Text>
                  </View>
                  {["Active", "Verified", "Booking Enabled"].map((l) => (
                    <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Icon name="check-circle" size={14} color={EMERALD[200]} />
                      <Text style={{ color: EMERALD[200], fontSize: 11 }}>{l}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                  <WBtn testID="hero-share" label="Share" icon="share-variant" variant="white" bold onPress={nativeShare} busy={busy === "share"} disabled={!!busy} style={{ flex: 1 }} />
                  <WBtn testID="hero-whatsapp" label="WhatsApp" icon="whatsapp" variant="whatsapp" onPress={waShare} busy={busy === "wa"} disabled={!!busy} style={{ flex: 1 }} />
                </View>
              </View>
            </LinearGradient>

            {/* Poster builder */}
            <KitCard style={{ marginBottom: 24 }} testID="poster-builder">
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
                  <Icon name="qrcode" size={20} color={P[700]} />
                  <Text style={{ fontSize: 18, lineHeight: 28, fontWeight: "800", color: heading }} numberOfLines={1}>Create Your Booking Poster</Text>
                </View>
                <KitSeg items={[{ v: "preview", l: "Preview", icon: "eye" }, { v: "edit", l: "Customize", icon: "tune-variant" }]} value={tab} onChange={setTab} testidPrefix="poster-tab" />
              </View>

              {tab === "preview" ? (
                <View>
                  <View testID="poster-preview" onLayout={(e) => setBoxW(Math.max(200, e.nativeEvent.layout.width - 32))} style={{ borderRadius: 16, backgroundColor: dark ? "rgba(30,41,59,0.6)" : SLATE[100], borderWidth: 1, borderColor: dark ? SLATE[800] : "rgba(226,232,240,0.7)", padding: 16, alignItems: "center", overflow: "hidden" }}>
                    <View style={{ flexDirection: "row", gap: 4, alignSelf: "flex-end", marginBottom: 12 }}>
                      {([["zoom-out", "magnify-minus-outline", () => setZoom((z) => Math.max(0.5, z - 0.15))], ["zoom-fit", "arrow-expand-all", () => setZoom(1)], ["zoom-in", "magnify-plus-outline", () => setZoom((z) => Math.min(2, z + 0.15))]] as [string, any, () => void][]).map(([id, ic, fn]) => (
                        <Pressable key={id} testID={id} onPress={fn} style={{ height: 32, width: 32, borderRadius: 8, backgroundColor: dark ? SLATE[900] : "#fff", borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center" }}>
                          <Icon name={ic} size={16} color={SLATE[500]} />
                        </Pressable>
                      ))}
                    </View>
                    <View style={{ width: pw, height: ph, borderRadius: 12, overflow: "hidden", boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1), 0px 8px 10px -6px rgba(0,0,0,0.1)" }}>
                      <QrBookingPoster qrValue={link} token={code} merchantName={businessName} brand={posterBrand} trustLine={posterTrust} width={pw} height={ph} scale={POSTER_CANVAS.scale * previewScale} />
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
                    <WBtn testID="dl-png" label="PNG" icon="download" variant="outline" onPress={() => downloadPoster("png")} busy={busy === "png"} disabled={!!busy} style={{ width: "48.5%" }} />
                    <WBtn testID="dl-jpg" label="JPG" icon="download" variant="outline" onPress={() => downloadPoster("jpg")} busy={busy === "jpg"} disabled={!!busy} style={{ width: "48.5%" }} />
                    <WBtn testID="dl-pdf" label="PDF" icon="download" variant="outline" onPress={() => downloadPoster("pdf")} busy={busy === "pdf"} disabled={!!busy} style={{ width: "48.5%" }} />
                    <WBtn testID="dl-print" label="Print" icon="printer" onPress={printPoster} busy={busy === "print"} disabled={!!busy} style={{ width: "48.5%" }} />
                  </View>
                </View>
              ) : (
                <View>
                  <PosterControls config={config!} setConfig={setConfig} adminLogo={adminLogo} />
                  <WBtn testID="reset-poster" label="Reset design" icon="restore" variant="ghost" onPress={resetConfig} style={{ alignSelf: "flex-start", marginTop: 16 }} />
                </View>
              )}
            </KitCard>

            <QrAnalytics />
          </>
        )}
      </ScrollView>

      {/* Share modal (fallback when the native sheet is unavailable) */}
      <Modal visible={shareOpen} transparent animationType="fade" onRequestClose={() => setShareOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.5)", justifyContent: "center", padding: 16 }}>
          <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setShareOpen(false)} />
          <View testID="share-modal" style={{ backgroundColor: dark ? SLATE[900] : "#fff", borderRadius: 16, padding: 20, boxShadow: "0px 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: heading }}>Share your booking link</Text>
              <Pressable testID="share-close" onPress={() => setShareOpen(false)} hitSlop={8} style={{ height: 36, width: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={20} color={SLATE[400]} /></Pressable>
            </View>
            <Text style={{ fontSize: 12, color: SLATE[500], marginBottom: 8 }}>Edit the message before sharing (your booking link is already included):</Text>
            <TextInput testID="share-message" multiline value={waMsg} onChangeText={setWaMsg} style={{ minHeight: 120, borderWidth: 1, borderColor: dark ? SLATE[700] : SLATE[200], borderRadius: 6, padding: 12, color: heading, fontSize: 14, lineHeight: 20, textAlignVertical: "top", backgroundColor: dark ? SLATE[900] : "#fff" }} />
            <Pressable testID="share-save-poster" onPress={() => downloadPoster("png")} disabled={!!busy} style={{ marginTop: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: P[300], backgroundColor: dark ? "rgba(13,71,161,0.2)" : `${P[50]}99`, paddingVertical: 8, paddingHorizontal: 12, opacity: busy ? 0.6 : 1 }}>
              {busy === "png" ? <ActivityIndicator size="small" color={P[700]} /> : <Icon name="download" size={16} color={P[700]} />}
              <Text style={{ color: dark ? P[300] : P[700], fontSize: 12, fontWeight: "600" }}>Save designed poster to attach with your message</Text>
            </Pressable>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <WBtn testID="share-wa" label="WhatsApp" icon="whatsapp" variant="whatsapp" onPress={waShare} busy={busy === "wa"} disabled={!!busy} style={{ width: "48.5%", height: 44 }} />
              <WBtn testID="share-tg" label="Telegram" variant="outline" onPress={() => { const t = waMsg.split(link).join("").replace(/\n{3,}/g, "\n\n").trim(); Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t)}`); }} style={{ width: "48.5%", height: 44 }} />
              <WBtn testID="share-fb" label="Facebook" variant="outline" onPress={() => Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`)} style={{ width: "48.5%", height: 44 }} />
              <WBtn testID="share-copy" label="Copy Link" icon={copied ? "clipboard-check-outline" : "content-copy"} variant="outline" onPress={copy} style={{ width: "48.5%", height: 44 }} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
