import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, TextInput, Share, Linking, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "react-native-qrcode-svg";
import Svg, { Rect } from "react-native-svg";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api, MEDIA_ORIGIN } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { AppHeader } from "@/src/components/Screen";
import { Card, CardSkeleton } from "@/src/components/ui";
import { Icon, MdiName } from "@/src/components/Icon";

const DEFAULT_SERVICES = ["Electrician", "Plumber", "AC Repair", "Appliance Repair", "Carpenter", "Cleaning"];
const COLOR_PRESETS = [
  { id: "azo_blue", label: "Blue", primary: "#0D47A1" },
  { id: "emerald", label: "Emerald", primary: "#059669" },
  { id: "purple", label: "Purple", primary: "#7C3AED" },
  { id: "orange", label: "Orange", primary: "#EA580C" },
  { id: "navy", label: "Navy", primary: "#0B1220" },
];
const RANGES: [string, string][] = [["7d", "7 Days"], ["30d", "30 Days"], ["90d", "90 Days"], ["year", "Year"]];

function timeAgo(iso?: string) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function MerchantScanQr() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const brand = useBrand();
  const toast = useToast();

  const codeQ = useQuery({ queryKey: ["merchant-my-code"], queryFn: () => api.get<any>("/merchant/my-code") });
  const cfgQ = useQuery({ queryKey: ["merchant-qr-config"], queryFn: () => api.get<any>("/merchant/panel/qr/config") });
  const code: string = codeQ.data?.merchant_code || "";
  const link = `${MEDIA_ORIGIN}/?ref=${code}`;

  const [range, setRange] = useState("30d");
  const analytics = useQuery({ queryKey: ["merchant-qr-analytics", range], queryFn: () => api.get<any>(`/merchant/panel/qr/analytics?range=${range}`) });
  const a = analytics.data || {};

  // ── poster config (persisted) ──
  const [primary, setPrimary] = useState("#0D47A1");
  const [businessName, setBusinessName] = useState("");
  const [taglineOn, setTaglineOn] = useState(true);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState("");
  const qrRef = useRef<any>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const lastSaved = useRef<string | null>(null);
  const hydrated = useRef(false);

  const shopName = user?.shop_name || user?.name || "My Shop";

  // hydrate from server config once
  useEffect(() => {
    if (!cfgQ.data || hydrated.current) return;
    const s = cfgQ.data || {};
    setPrimary(s.primary || "#0D47A1");
    setBusinessName(s.businessName || shopName);
    setTaglineOn(s?.show?.tagline !== false);
    setPhone(s.phone || user?.phone?.replace("+91", "") || "");
    lastSaved.current = JSON.stringify({ primary: s.primary || "#0D47A1", businessName: s.businessName || shopName, show: { tagline: s?.show?.tagline !== false }, phone: s.phone || "" });
    hydrated.current = true;
  }, [cfgQ.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced persist
  useEffect(() => {
    if (!hydrated.current) return;
    const snap = JSON.stringify({ primary, businessName, show: { tagline: taglineOn }, phone });
    if (snap === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = snap;
      api.put("/merchant/panel/qr/config", { primary, businessName, phone, show: { tagline: taglineOn }, services: DEFAULT_SERVICES }).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [primary, businessName, taglineOn, phone]);

  const shareMessage = `Book trusted home services with ${businessName || shopName} on ${brand.branding.site_name} — Electrician, Plumber, AC Repair, Appliance Repair & more.\n\nBook now: ${link}`;

  const copyLink = async () => { await Clipboard.setStringAsync(link); toast.success("Link copied successfully"); };
  const nativeShare = async () => { try { await Share.share({ message: shareMessage, title: businessName || shopName }); } catch { /* cancelled */ } };
  const waShare = async () => {
    const url = `whatsapp://send?text=${encodeURIComponent(shareMessage)}`;
    const can = await Linking.canOpenURL(url).catch(() => false);
    Linking.openURL(can ? url : `https://wa.me/?text=${encodeURIComponent(shareMessage)}`).catch(() => toast.error("Could not open WhatsApp"));
  };

  const posterHtml = () => {
    const img = qrData ? `<img src="data:image/png;base64,${qrData}" style="width:220px;height:220px" />` : "";
    const chips = DEFAULT_SERVICES.map((s) => `<span style="display:inline-block;background:rgba(255,255,255,.18);color:#fff;border-radius:999px;padding:6px 12px;margin:4px;font-size:15px">${s}</span>`).join("");
    return `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"/></head>
      <body style="margin:0"><div style="width:100%;min-height:100vh;background:${primary};color:#fff;font-family:Helvetica,Arial;padding:48px 32px;text-align:center;box-sizing:border-box">
        <div style="font-size:22px;font-weight:800;letter-spacing:1px">${brand.branding.site_name}</div>
        <div style="font-size:34px;font-weight:900;margin-top:10px">${businessName || shopName}</div>
        ${taglineOn ? `<div style="font-size:18px;opacity:.85;margin-top:6px">Trusted Home Services</div>` : ""}
        <div style="background:#fff;border-radius:24px;display:inline-block;padding:20px;margin:28px auto">${img}</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:3px">Scan to Book a Service</div>
        <div style="margin-top:8px;font-size:16px;opacity:.9">Ref: ${code}${phone ? " · " + phone : ""}</div>
        <div style="margin-top:20px">${chips}</div>
        <div style="margin-top:24px;font-size:14px;opacity:.85;word-break:break-all">${link}</div>
      </div></body></html>`;
  };

  const printPoster = async () => { setBusy("print"); try { await Print.printAsync({ html: posterHtml() }); } catch { toast.error("Print failed"); } finally { setBusy(""); } };
  const savePoster = async () => {
    setBusy("save");
    try {
      const { uri } = await Print.printToFileAsync({ html: posterHtml() });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Save / share your poster" });
      else toast.success("Poster PDF created");
    } catch { toast.error("Could not create poster"); } finally { setBusy(""); }
  };

  const loading = codeQ.isLoading || cfgQ.isLoading;

  const chips: { label: string; icon: MdiName }[] = [
    { label: "Active", icon: "check-circle" },
    { label: "Verified", icon: "check-circle" },
    { label: "Booking Enabled", icon: "check-circle" },
  ];

  const stats: { label: string; value: string; icon: MdiName; bg: string; fg: string }[] = [
    { label: "Total Scans", value: Number(a.total_scans ?? 0).toLocaleString("en-IN"), icon: "qrcode", bg: colors.primarySubtle, fg: colors.primary },
    { label: "Unique Visitors", value: Number(a.unique_visitors ?? 0).toLocaleString("en-IN"), icon: "account-multiple", bg: "rgba(124,58,237,0.12)", fg: "#7C3AED" },
    { label: "Bookings", value: Number(a.bookings ?? 0).toLocaleString("en-IN"), icon: "shopping", bg: colors.successSubtle, fg: colors.success },
    { label: "Conversion", value: `${a.conversion ?? 0}%`, icon: "trending-up", bg: colors.warningSubtle, fg: colors.warning },
  ];

  // simple bar chart from series (scans vs bookings)
  const series: any[] = (a.series || []).slice(-14);
  const maxV = Math.max(1, ...series.map((s) => Math.max(s.scans || 0, s.bookings || 0)));
  const CH = 120;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Scan QR" subtitle="Share your booking link & QR poster" back variant="gradient" testID="merchant-scanqr-header" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.lg }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={codeQ.isFetching || analytics.isFetching} onRefresh={() => { codeQ.refetch(); cfgQ.refetch(); analytics.refetch(); }} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="scanqr-module"
      >
        {loading ? <CardSkeleton /> : (
          <>
            {/* Hero */}
            <LinearGradient colors={[colors.primaryHover, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: spacing.lg }}>
              <View style={{ alignItems: "center", marginBottom: spacing.md }}>
                <View style={{ backgroundColor: "#fff", borderRadius: 20, padding: 14 }}>
                  <QRCode value={link || " "} size={150} color="#0b1220" backgroundColor="#fff" getRef={(c: any) => { qrRef.current = c; if (c && !qrData) setTimeout(() => c.toDataURL?.((d: string) => setQrData(d)), 300); }} />
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.15)", alignSelf: "center", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill }}>
                <Icon name="shield-check" size={13} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Verified Merchant QR</Text>
              </View>
              <Text style={{ color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center", marginTop: 10 }} numberOfLines={1}>{businessName || shopName}</Text>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.sm, textAlign: "center", marginTop: 2 }}>Trusted Home Services</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, textAlign: "center", marginTop: 8 }} numberOfLines={1}>{link}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 10 }}>
                <View style={{ backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm }}>
                  <Text style={{ color: "#fff", fontSize: 11 }}>Ref: <Text style={{ fontWeight: "900" }}>{code}</Text></Text>
                </View>
                {chips.map((c) => (
                  <View key={c.label} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                    <Icon name={c.icon} size={13} color="#A7F3D0" />
                    <Text style={{ color: "#A7F3D0", fontSize: 11, fontWeight: "600" }}>{c.label}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Pressable testID="hero-share" onPress={nativeShare} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                  <Icon name="share-variant" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>Share</Text>
                </Pressable>
                <Pressable testID="hero-whatsapp" onPress={waShare} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: "#22C55E", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                  <Icon name="whatsapp" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>WhatsApp</Text>
                </Pressable>
              </View>
            </LinearGradient>

            {/* Booking link */}
            <Card>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>Your booking link</Text>
              <Text style={{ color: colors.text, fontSize: fontSize.sm, marginTop: 6 }} numberOfLines={2}>{link}</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
                <Pressable testID="copy-link" onPress={copyLink} style={{ flex: 1, height: 42, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                  <Icon name="content-copy" size={16} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>Copy Link</Text>
                </Pressable>
                <Pressable testID="link-share" onPress={nativeShare} style={{ flex: 1, height: 42, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
                  <Icon name="share-variant" size={16} color="#fff" />
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>Share</Text>
                </Pressable>
              </View>
            </Card>

            {/* Poster builder */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md }}>
                <Icon name="qrcode" size={18} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "900" }}>Create Your Booking Poster</Text>
              </View>

              {/* Preview */}
              <View testID="poster-preview" style={{ borderRadius: radius.lg, backgroundColor: primary, padding: spacing.lg, alignItems: "center" }}>
                <Text style={{ color: "#fff", fontSize: fontSize.sm, fontWeight: "800", letterSpacing: 0.5 }}>{brand.branding.site_name}</Text>
                <Text style={{ color: "#fff", fontSize: fontSize.xl, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>{businessName || shopName}</Text>
                {taglineOn ? <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.xs, marginTop: 2 }}>Trusted Home Services</Text> : null}
                <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 12, marginTop: spacing.md }}>
                  <QRCode value={link || " "} size={110} color="#0b1220" backgroundColor="#fff" />
                </View>
                <Text style={{ color: "#fff", fontSize: fontSize.sm, fontWeight: "900", marginTop: spacing.md, letterSpacing: 1 }}>Scan to Book a Service</Text>
                <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 11, marginTop: 4 }}>Ref: {code}{phone ? ` · ${phone}` : ""}</Text>
              </View>

              {/* Customize */}
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6 }}>Poster color</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {COLOR_PRESETS.map((p) => {
                  const on = primary === p.primary;
                  return (
                    <Pressable key={p.id} testID={`poster-color-${p.id}`} onPress={() => setPrimary(p.primary)} style={{ alignItems: "center", gap: 4 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: p.primary, borderWidth: on ? 3 : 0, borderColor: colors.text }} />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6 }}>Business name</Text>
              <TextInput testID="poster-business-name" value={businessName} onChangeText={setBusinessName} placeholder={shopName} placeholderTextColor={colors.textMuted}
                style={{ height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.text, fontSize: fontSize.sm, backgroundColor: colors.surface }} />

              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700", textTransform: "uppercase", marginTop: spacing.md, marginBottom: 6 }}>Phone (optional)</Text>
              <TextInput testID="poster-phone" value={phone} onChangeText={(v) => setPhone(v.replace(/[^0-9]/g, "").slice(0, 10))} keyboardType="number-pad" placeholder="98765 43210" placeholderTextColor={colors.textMuted}
                style={{ height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, color: colors.text, fontSize: fontSize.sm, backgroundColor: colors.surface }} />

              <Pressable testID="poster-tagline-toggle" onPress={() => setTaglineOn((v) => !v)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md }}>
                <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700" }}>Show tagline</Text>
                <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: taglineOn ? colors.primary : colors.surfaceSubtle, padding: 3, alignItems: taglineOn ? "flex-end" : "flex-start" }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff" }} />
                </View>
              </Pressable>

              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                <Pressable testID="poster-save" onPress={savePoster} disabled={!!busy} style={{ flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: busy ? 0.6 : 1 }}>
                  {busy === "save" ? <ActivityIndicator size="small" color={colors.primary} /> : <Icon name="download" size={16} color={colors.primary} />}
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "800" }}>Save / Share</Text>
                </Pressable>
                <Pressable testID="poster-print" onPress={printPoster} disabled={!!busy} style={{ flex: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, opacity: busy ? 0.6 : 1 }}>
                  {busy === "print" ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="printer" size={16} color="#fff" />}
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800" }}>Print</Text>
                </Pressable>
              </View>
            </Card>

            {/* QR Analytics */}
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name="trending-up" size={18} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "900" }}>QR Performance</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 6, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: 4, marginBottom: spacing.md }}>
                {RANGES.map(([v, l]) => {
                  const on = range === v;
                  return (
                    <Pressable key={v} testID={`qra-range-${v}`} onPress={() => setRange(v)} style={{ flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: "center", backgroundColor: on ? colors.surface : "transparent" }}>
                      <Text style={{ color: on ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: "800" }}>{l}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
                {stats.map((st) => (
                  <View key={st.label} style={{ width: "47.8%" }}>
                    <Card padded={false} style={{ padding: spacing.md }}>
                      <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: st.bg, alignItems: "center", justifyContent: "center" }}>
                        <Icon name={st.icon} size={18} color={st.fg} />
                      </View>
                      <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900", marginTop: 8 }}>{st.value}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>{st.label}</Text>
                    </Card>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
                <Card padded={false} style={{ flex: 1, padding: spacing.md }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>This Month Scans</Text>
                  <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900", marginTop: 4 }}>{Number(a.month_scans ?? 0).toLocaleString("en-IN")}</Text>
                </Card>
                <Card padded={false} style={{ flex: 1, padding: spacing.md }}>
                  <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>This Month Bookings</Text>
                  <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "900", marginTop: 4 }}>{Number(a.month_bookings ?? 0).toLocaleString("en-IN")}</Text>
                </Card>
              </View>

              {/* Scans vs Bookings mini chart */}
              <Card style={{ marginTop: spacing.md }}>
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: "700", marginBottom: spacing.md }}>Scans vs Bookings</Text>
                {series.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center", paddingVertical: 20 }}>No data yet</Text>
                ) : (
                  <>
                    <Svg width="100%" height={CH}>
                      {series.map((s, i) => {
                        const bw = 100 / series.length;
                        const x = i * bw;
                        const sh = ((s.scans || 0) / maxV) * (CH - 10);
                        const bh = ((s.bookings || 0) / maxV) * (CH - 10);
                        return (
                          <React.Fragment key={i}>
                            <Rect x={`${x + bw * 0.18}%`} y={CH - sh} width={`${bw * 0.3}%`} height={sh} rx={2} fill={colors.primary} />
                            <Rect x={`${x + bw * 0.52}%`} y={CH - bh} width={`${bw * 0.3}%`} height={bh} rx={2} fill={colors.success} />
                          </React.Fragment>
                        );
                      })}
                    </Svg>
                    <View style={{ flexDirection: "row", gap: spacing.lg, marginTop: spacing.sm }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.primary }} /><Text style={{ color: colors.textMuted, fontSize: 11 }}>Scans</Text></View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: colors.success }} /><Text style={{ color: colors.textMuted, fontSize: 11 }}>Bookings</Text></View>
                    </View>
                  </>
                )}
              </Card>

              {/* Recent activity */}
              <Card padded={false} style={{ padding: spacing.lg, marginTop: spacing.md }} testID="qra-recent">
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm }}>
                  <Icon name="calendar-clock" size={16} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "800" }}>Recent Activity</Text>
                </View>
                {(a.recent || []).length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, textAlign: "center", paddingVertical: 18 }}>No scans yet. Share your QR to start tracking.</Text>
                ) : (
                  (a.recent || []).map((r: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                      <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: r.type === "booking" ? colors.successSubtle : colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                        <Icon name={r.type === "booking" ? "shopping" : "qrcode"} size={16} color={r.type === "booking" ? colors.success : colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "600" }} numberOfLines={1}>{r.label}</Text>
                        {r.city ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{r.city}</Text> : null}
                      </View>
                      <Text style={{ color: colors.textMuted, fontSize: 11 }}>{timeAgo(r.at)}</Text>
                    </View>
                  ))
                )}
              </Card>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
