/** Refer & Earn — port of ReferralView + ReferralShareCard (web). GET /growth/referral, POST /referral/apply. */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Platform, Share, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import ViewShot from "react-native-view-shot";
import { Gift, Copy, Share2, CheckCircle2, TrendingUp, Clock, MessageCircle, Download } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { useToast } from "../../src/components/Toast";
import { api, API_BASE } from "../../src/api/client";
import { fmt, fmtC } from "../../src/lib/format";
import { PRIMARY, SLATE, EMERALD, useTheme, shadowElev } from "../../src/theme";
import { StatTile, StatusChip, EmptyState, SkeletonList } from "../../src/components/customer/ux";
import { FInput } from "../../src/components/customer/FormControls";

const ORIGIN = API_BASE.replace(/\/api$/, "");
const shareText = ({ code, reward, discount, link }: any) => `🎁 Get ₹${discount} OFF your first AzoApp home service!\n\nUse my referral code *${code}* when you book. I'll earn ₹${reward} too — we both win!\n\n👉 ${link}`;
const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

const WhiteBtn = ({ label, icon: Icon, onPress, testID, ghost }: any) => (
  <Pressable testID={testID} onPress={onPress} style={{ height: 44, paddingHorizontal: 16, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ghost ? "rgba(255,255,255,0.2)" : "#fff" }}>
    <Icon size={16} color={ghost ? "#fff" : PRIMARY[700]} /><Text style={{ fontSize: 14, fontWeight: "600", color: ghost ? "#fff" : PRIMARY[700] }}>{label}</Text>
  </Pressable>
);

/* Branded share card — same layout as drawReferralCard (1080×1080 canvas) rendered as a View. */
function ReferralCard({ code, reward, discount, card }: any) {
  const bg = card?.bg || "#0D47A1";
  return (
    <View testID="referral-card-image" style={{ width: 320, height: 320, backgroundColor: bg, alignItems: "center", paddingTop: 22, borderRadius: 16, overflow: "hidden" }}>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>AzoApp</Text>
      <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 2 }}>Home services at your doorstep</Text>
      <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 26 }}>{card?.heading || "Refer a Friend & Earn"}</Text>
      <Text style={{ color: "#fff", fontSize: 40, fontWeight: "900", marginTop: 4 }}>₹{reward}</Text>
      <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 11 }}>{card?.subheading || "Share AzoApp — you both win"}</Text>
      <View style={{ marginTop: 18, paddingHorizontal: 24, paddingVertical: 8, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center" }}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, letterSpacing: 1.5 }}>YOUR REFERRAL CODE</Text>
        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 4, marginTop: 2 }}>{code}</Text>
      </View>
      <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 10, marginTop: 14 }}>Your friend gets ₹{discount} OFF their first booking</Text>
      <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 10, marginTop: 3 }}>You earn ₹{reward} when they complete it</Text>
      <View style={{ position: "absolute", bottom: 16, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff" }}><Text style={{ color: bg, fontWeight: "800", fontSize: 12 }}>{card?.cta_text || "Book Now & Save"}</Text></View>
    </View>
  );
}

function ReferralShareCard({ code, reward, discount, link, card, copy }: any) {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const shotRef = useRef<any>(null);
  const capture = async (): Promise<string | null> => { try { return await shotRef.current?.capture?.(); } catch { return null; } };
  const onWhatsapp = () => Linking.openURL(whatsappUrl(shareText({ code, reward, discount, link })));
  const onShare = async () => {
    const text = shareText({ code, reward, discount, link });
    const uri = await capture();
    if (Platform.OS !== "web" && uri && (await Sharing.isAvailableAsync())) { await Sharing.shareAsync(uri, { dialogTitle: "AzoApp Referral" }); return; }
    try { await Share.share({ message: text, title: "AzoApp Referral", url: link }); } catch { onWhatsapp(); toast.success("Opening WhatsApp…"); }
  };
  const onDownload = async () => {
    const uri = await capture();
    if (!uri) return toast.error("Could not render card");
    if (Platform.OS === "web") { const a = document.createElement("a"); a.href = uri; a.download = `azoapp-referral-${code}.png`; a.click(); toast.success("Card image downloaded"); return; }
    const MediaLibrary = require("expo-media-library"); // native-only module (no web build)
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return toast.error("Photo library permission denied");
    await MediaLibrary.saveToLibraryAsync(uri); toast.success("Card image saved to gallery");
  };
  const outline = { height: 44, borderRadius: 16, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 6, flex: 1 };
  const outlineT = { fontSize: 14, fontWeight: "600" as const, color: isDark ? SLATE[200] : SLATE[700] };
  return (
    <View testID="referral-share-card" style={{ borderRadius: 24, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 16, ...shadowElev }}>
      <Text style={{ fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, color: SLATE[400], marginBottom: 12 }}>Your shareable card</Text>
      <View style={{ alignItems: "center" }}>
        <ViewShot ref={shotRef} options={{ format: "png", quality: 1, result: Platform.OS === "web" ? "data-uri" : "tmpfile" }}><ReferralCard code={code} reward={reward} discount={discount} card={card} /></ViewShot>
      </View>
      <View style={{ gap: 10, marginTop: 16 }}>
        <Pressable testID="share-whatsapp" onPress={onWhatsapp} style={({ pressed }) => ({ height: 48, borderRadius: 16, backgroundColor: "#25D366", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, transform: [{ scale: pressed ? 0.97 : 1 }] })}><MessageCircle size={20} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Share on WhatsApp</Text></Pressable>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable testID="share-native" onPress={onShare} style={({ pressed }) => ({ ...outline, borderWidth: 0, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700] })}><Share2 size={16} color="#fff" /><Text style={{ ...outlineT, color: "#fff" }}>Share card</Text></Pressable>
          <Pressable testID="share-download" onPress={onDownload} style={outline}><Download size={16} color={outlineT.color} /><Text style={outlineT}>Save image</Text></Pressable>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable testID="card-copy-code" onPress={() => copy(code, "Referral code copied!")} style={outline}><Copy size={16} color={outlineT.color} /><Text style={outlineT}>Copy code</Text></Pressable>
          <Pressable testID="card-copy-link" onPress={() => copy(link, "Referral link copied!")} style={outline}><Copy size={16} color={outlineT.color} /><Text style={outlineT}>Copy link</Text></Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ReferralScreen() {
  const { c, isDark } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const [sum, setSum] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [codeInput, setCodeInput] = useState("");
  const [applying, setApplying] = useState(false);
  const load = useCallback(() => { setLoading(true); api.get("/growth/referral").then(setSum).catch(() => {}).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);

  const code = sum?.code || `AZO${(user?.phone || "").slice(-4)}`;
  const reward = sum?.reward_amount || 100;
  const discount = sum?.referee_discount || reward;
  const link = `${ORIGIN}/${sum?.link || `?fref=${code}`}`;
  const stats = sum?.stats || { invited: 0, joined: 0, first_booking: 0, earned: 0, pending: 0 };
  const history: any[] = sum?.history || [];

  const copy = async (text: string, msg: string) => { try { await Clipboard.setStringAsync(text); } catch {} toast.success(msg); };
  const share = async () => {
    try { await Share.share({ title: "AzoApp", message: `Book trusted home services on AzoApp. Use my code ${code} and we both earn ₹${reward}!\n${link}`, url: link }); }
    catch { copy(link, "Referral link copied!"); }
  };
  const applyCode = async () => {
    const cd = codeInput.trim().toUpperCase();
    if (!cd) return;
    setApplying(true);
    try {
      const data: any = await api.post("/referral/apply", { code: cd });
      if (data.ok) { toast.success(data.detail || "Referral applied!"); setCodeInput(""); load(); } else toast.error(data.detail || "Could not apply code");
    } catch (e: any) { toast.error(e?.message || "Could not apply code"); }
    setApplying(false);
  };
  const card = { borderRadius: 16, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, ...shadowElev };

  return (
    <View testID="referral-page" style={{ gap: 20 }}>
      <View>
        <Text testID="page-title" style={{ fontSize: 24, fontWeight: "900", color: c.text, letterSpacing: -0.4 }}>Refer & Earn</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Invite friends and earn rewards together</Text>
      </View>

      <View style={{ borderRadius: 24, overflow: "hidden", ...shadowElev }}>
        <LinearGradient colors={[PRIMARY[800], PRIMARY[600]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 24 }}>
          <Gift size={40} color="#fff" />
          <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 12 }}>Refer friends, earn ₹{reward} each</Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 4 }}>Share your code — your friend gets ₹{discount} off their first booking and you earn ₹{reward} when they complete it.</Text>
          <View style={{ marginTop: 20, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
            <View style={{ backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.8 }}>Your code</Text>
              <Text testID="referral-code" style={{ color: "#fff", fontSize: 24, fontWeight: "900", letterSpacing: 3 }}>{code}</Text>
            </View>
            <WhiteBtn testID="copy-referral" label="Copy code" icon={Copy} onPress={() => copy(code, "Referral code copied!")} />
            <WhiteBtn testID="copy-referral-link" label="Copy link" icon={Copy} ghost onPress={() => copy(link, "Referral link copied!")} />
            <WhiteBtn testID="share-referral" label="Share" icon={Share2} ghost onPress={share} />
          </View>
        </LinearGradient>
      </View>

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="ref-invited" label="Total Invited" value={stats.invited} count icon={Gift} tone="primary" /><StatTile testID="ref-joined" label="Joined" value={stats.joined} count icon={CheckCircle2} tone="green" /></View>
        <View style={{ flexDirection: "row", gap: 12 }}><StatTile testID="ref-earned" label="Rewards Earned" value={fmtC(stats.earned)} icon={TrendingUp} tone="amber" /><StatTile testID="ref-pending" label="Pending" value={fmtC(stats.pending)} icon={Clock} tone="slate" /></View>
      </View>

      <ReferralShareCard code={code} reward={reward} discount={discount} link={link} card={sum?.card} copy={copy} />

      <View testID="apply-referral-card" style={{ ...card, padding: 20 }}>
        <Text style={{ fontWeight: "700", fontSize: 16, color: c.text }}>Got a friend&apos;s code?</Text>
        <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 2 }}>Enter it before your first booking — you both earn ₹{reward}.</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <View style={{ flex: 1 }}><FInput testID="apply-code-input" value={codeInput} onChange={(v) => setCodeInput(v.toUpperCase())} placeholder="e.g. AZO1234" style={{ textTransform: "uppercase" }} /></View>
          <Pressable testID="apply-code-btn" onPress={applyCode} disabled={applying || !codeInput.trim()} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 12, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", opacity: applying || !codeInput.trim() ? 0.5 : 1 })}><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>{applying ? "Applying…" : "Apply"}</Text></Pressable>
        </View>
      </View>

      <View>
        <Text style={{ fontWeight: "700", fontSize: 18, color: c.text, marginBottom: 12 }}>Referral history</Text>
        {loading ? <SkeletonList rows={3} /> : history.length === 0 ? <EmptyState icon={Gift} title="No referrals yet" desc="Share your code to start earning rewards." testID="referral-empty" /> : (
          <View testID="referral-history" style={{ gap: 8 }}>
            {history.map((h) => (
              <View key={h.id} testID={`referral-row-${h.id}`} style={{ ...card, padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                  <View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "700", color: c.primaryText }}>{(h.name || "F")[0]}</Text></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontWeight: "600", fontSize: 14, color: c.text }}>{h.name}</Text>
                    <Text style={{ fontSize: 12, color: SLATE[400] }}>{h.date ? new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : ""}</Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <StatusChip tone={h.payment_status === "paid" ? "green" : "amber"} label={h.status === "first_booking" ? "Completed" : "Joined"} />
                  <Text style={{ fontWeight: "700", fontSize: 14, color: h.payment_status === "paid" ? EMERALD[600] : SLATE[400] }}>{h.payment_status === "paid" ? "+" : ""}{fmt(h.reward)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View>
        <Text style={{ fontWeight: "700", fontSize: 18, color: c.text, marginBottom: 12 }}>How it works</Text>
        <View style={{ gap: 12 }}>
          {[["Share your code", "Send your referral code or link to friends & family."], ["Friend books", `They get ₹${discount} off their first AzoApp booking.`], ["You earn", `You get ₹${reward} credited once their booking completes.`]].map(([t, d], i) => (
            <View key={t} style={{ ...card, padding: 20 }}>
              <View style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: isDark ? "rgba(7,52,115,0.4)" : PRIMARY[100], alignItems: "center", justifyContent: "center" }}><Text style={{ fontWeight: "900", color: c.primaryText }}>{i + 1}</Text></View>
              <Text style={{ fontWeight: "600", fontSize: 15, color: c.text, marginTop: 12 }}>{t}</Text>
              <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>{d}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
