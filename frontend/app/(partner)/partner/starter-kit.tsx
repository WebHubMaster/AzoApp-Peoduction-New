import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useTheme, spacing } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { AppShellHeader, Surface } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const ICONS: Record<string, MdiName> = { shirt: "tshirt-crew-outline", cap: "crown-outline", id: "card-account-details-outline", support: "headphones" };
const fmtINR = (n: any) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const SLATE400 = "#94A3B8";

/** Web PartnerStarterKit.jsx — sales page / owned view */
export default function PartnerStarterKit() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const { refresh } = useAuth() as any;
  const [buying, setBuying] = useState(false);
  const q = useQuery({ queryKey: ["starter-kit"], queryFn: () => api.get<any>("/starter-kit/me") });
  const data = q.data;
  const cfg = data?.config || {};
  const reload = () => qc.invalidateQueries({ queryKey: ["starter-kit"] });

  const purchase = async () => {
    setBuying(true);
    try {
      const order = await api.post<any>("/starter-kit/order", {});
      if (order.free) toast.success("Starter Kit activated!");
      else if (order.mock) { await api.post("/starter-kit/mock", {}); toast.success("Payment successful — welcome to AzoApp Pro! 🎉"); }
      else { toast.info("Online payment is completed from the AzoApp web panel. Your Pro badge activates right after payment."); return; }
      reload(); refresh?.();
    } catch (e: any) { toast.error(e?.detail || "Purchase failed"); }
    finally { setBuying(false); }
  };

  const Wrap = ({ children }: { children: React.ReactNode }) => (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 20 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}>
        {children}
      </ScrollView>
    </View>
  );

  if (!data) return <Wrap><Text style={{ color: SLATE400, padding: 24 }}>Loading Starter Kit…</Text></Wrap>;

  const items: any[] = cfg.items || [];
  const ItemIcon = ({ it, size, color }: { it: any; size: number; color: string }) => <Icon name={ICONS[it.icon] || "package-variant-closed"} size={size} color={color} />;

  /* ── Owned ── */
  if (data.purchased) {
    const steps = [["processing", "Order confirmed"], ["shipped", "Shipped"], ["out_for_delivery", "Out for delivery"], ["delivered", "Delivered"]];
    const cur = data.tracking_status || "processing";
    const idx = Math.max(0, steps.findIndex((s) => s[0] === cur));
    const r = data.renewal;
    return (
      <Wrap>
        <LinearGradient colors={[colors.primary, "#4338CA", "#6D28D9"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 28, overflow: "hidden" }} testID="starter-kit-owned">
          <View style={{ position: "absolute", top: -64, right: -64, width: 224, height: 224, borderRadius: 112, backgroundColor: "rgba(255,255,255,0.1)" }} />
          <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 }}>
            <Icon name="crown-outline" size={16} color="#FCD34D" /><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{data.badge_label || cfg.badge_label || "AzoApp Pro"}</Text>
          </View>
          <Text style={{ color: "#fff", fontSize: 28, fontWeight: "900", marginTop: 16 }}>You&apos;re an AzoApp Pro! 🎉</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 15, marginTop: 8, lineHeight: 22 }}>Your premium badge is live on your profile. Your branded kit is on the way — wear it proud and win more customers.</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 20 }}><Icon name="truck-outline" size={16} color="#fff" /><Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 14 }}>Kit dispatch is handled by the AzoApp team.</Text></View>
        </LinearGradient>
        <View style={{ gap: 12 }}>
          {items.map((it) => (
            <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
              {it.image ? <Image source={{ uri: mediaUrl(it.image) }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" /> : <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><ItemIcon it={it} size={24} color={colors.secondary} /></View>}
              <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{it.name}</Text><Text style={{ color: colors.textMuted, fontSize: 12 }} numberOfLines={2}>{it.description}</Text></View>
              <Icon name="check-decagram" size={20} color="#10B981" />
            </View>
          ))}
        </View>
        <Surface style={{ padding: 20 }} testID="kit-tracking">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}><Icon name="truck-outline" size={16} color={colors.secondary} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Kit delivery status</Text></View>
          <View style={{ flexDirection: "row" }}>
            {steps.map(([k, l], i) => (
              <View key={k} style={{ flex: 1, alignItems: "center" }}>
                <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
                  <View style={{ flex: 1, height: 2, backgroundColor: i > 0 && i <= idx ? "#10B981" : i === 0 ? "transparent" : colors.border }} />
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: i <= idx ? "#10B981" : colors.border, alignItems: "center", justifyContent: "center" }}>
                    {i < idx || (i === idx && cur === "delivered") ? <Icon name="check" size={14} color="#fff" /> : <Text style={{ color: i <= idx ? "#fff" : SLATE400, fontSize: 11, fontWeight: "700" }}>{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, height: 2, backgroundColor: i < idx ? "#10B981" : i === steps.length - 1 ? "transparent" : colors.border }} />
                </View>
                <Text style={{ color: i <= idx ? colors.textSecondary : SLATE400, fontSize: 11, fontWeight: i <= idx ? "600" : "400", marginTop: 6, textAlign: "center" }}>{l}</Text>
              </View>
            ))}
          </View>
        </Surface>
        {r?.expires_at ? (
          <View testID="kit-renewal" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 16, backgroundColor: r.expired ? "#FEF2F2" : r.expiring_soon ? "#FFFBEB" : colors.surfaceSubtle, borderColor: r.expired ? "#FECACA" : r.expiring_soon ? "#FDE68A" : colors.border }}>
            <Icon name="refresh" size={20} color={r.expired ? "#DC2626" : r.expiring_soon ? "#D97706" : colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{r.expired ? "Your AzoApp Pro membership has expired" : `Membership valid till ${new Date(r.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}</Text>
              {!r.expired && r.days_left != null ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{r.days_left} day(s) left{r.expiring_soon ? " — renew soon to keep your perks" : ""}</Text> : null}
            </View>
            {r.expired || r.expiring_soon ? <Pressable onPress={purchase} disabled={buying} style={{ height: 36, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{buying ? "…" : "Renew now"}</Text></Pressable> : null}
          </View>
        ) : null}
      </Wrap>
    );
  }

  /* ── Sales page ── */
  const actual = Number(cfg.actual_price || 0), price = Number(cfg.discounted_price || 0);
  const savings = Math.max(actual - price, 0);
  const pct = actual > 0 ? Math.round((savings / actual) * 100) : 0;
  const Trust = ({ icon, t }: { icon: MdiName; t: string }) => <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name={icon} size={16} color="rgba(255,255,255,0.6)" /><Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>{t}</Text></View>;

  return (
    <Wrap>
      {data.locked ? (
        <View testID="starter-kit-lock-notice" style={{ flexDirection: "row", gap: 12, borderRadius: 16, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", padding: 16 }}>
          <Icon name="lock-outline" size={24} color="#D97706" />
          <View style={{ flex: 1 }}><Text style={{ color: "#78350F", fontWeight: "700", fontSize: 15 }}>Starter Kit purchase required</Text><Text style={{ color: "#92400E", fontSize: 13, marginTop: 2, lineHeight: 18 }}>Your service area requires the AzoApp Pro Starter Kit before you can start taking jobs. Please complete the purchase below to unlock your dashboard.</Text></View>
        </View>
      ) : null}
      <LinearGradient colors={["#0F172A", "#0A2E6B", "#312E81"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 28, overflow: "hidden", boxShadow: "0px 20px 40px rgba(15,23,42,0.3)", elevation: 8 }} testID="starter-kit-buy">
        {cfg.hero_image ? <Image source={{ uri: mediaUrl(cfg.hero_image) }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.25 }} contentFit="cover" /> : null}
        <View style={{ position: "absolute", top: -80, right: -64, width: 256, height: 256, borderRadius: 128, backgroundColor: "rgba(59,130,246,0.2)" }} />
        <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Icon name="creation" size={16} color="#FCD34D" /><Text style={{ color: "#FCD34D", fontSize: 13, fontWeight: "700" }}>{cfg.tagline || "Become a verified AzoApp Pro"}</Text>
        </View>
        <Text style={{ color: "#fff", fontSize: 30, fontWeight: "900", marginTop: 16, lineHeight: 36 }}>{cfg.title || "AzoApp Pro Starter Kit"}</Text>
        <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 15, marginTop: 12 }}>{cfg.subtitle || "Look the part. Win customer trust. Earn more."}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <Text style={{ color: "#fff", fontSize: 36, fontWeight: "900" }}>{fmtINR(price)}</Text>
          {savings > 0 ? <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, textDecorationLine: "line-through" }}>{fmtINR(actual)}</Text> : null}
          {pct > 0 ? <View style={{ backgroundColor: "#10B981", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}><Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{pct}% OFF</Text></View> : null}
        </View>
        {savings > 0 ? <Text style={{ color: "#6EE7B7", fontSize: 14, fontWeight: "600", marginTop: 4 }}>You save {fmtINR(savings)} today</Text> : null}
        <Pressable testID="starter-kit-buy-btn" onPress={purchase} disabled={buying} style={{ alignSelf: "flex-start", marginTop: 24, height: 48, paddingHorizontal: 28, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, boxShadow: "0px 8px 20px rgba(0,0,0,0.25)" }}>
          <Text style={{ color: colors.primaryDark, fontSize: 16, fontWeight: "700" }}>{buying ? "Processing…" : "Get your Starter Kit"}</Text>{!buying ? <Icon name="arrow-right" size={20} color={colors.primaryDark} /> : null}
        </Pressable>
        <View style={{ flexDirection: "row", gap: 16, marginTop: 16 }}><Trust icon="shield-check-outline" t="Secure payment" /><Trust icon="truck-outline" t="Kit delivered to you" /></View>
      </LinearGradient>

      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="package-variant-closed" size={20} color={colors.secondary} /><Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>What&apos;s inside your kit</Text></View>
        <View style={{ gap: 16, marginTop: 16 }}>
          {items.map((it) => (
            <Surface key={it.id} testID={`sk-view-item-${it.id}`} style={{ overflow: "hidden" }}>
              <LinearGradient colors={["#EFF6FF", "#EEF2FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 144, alignItems: "center", justifyContent: "center" }}>
                {it.image ? <Image source={{ uri: mediaUrl(it.image) }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <ItemIcon it={it} size={56} color="#93C5FD" />}
              </LinearGradient>
              <View style={{ padding: 16 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{it.name}</Text><Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, lineHeight: 19 }}>{it.description}</Text></View>
            </Surface>
          ))}
        </View>
      </View>

      {(cfg.benefits || []).length > 0 ? (
        <LinearGradient colors={["#EFF6FF", "#EEF2FF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, borderWidth: 1, borderColor: "#DBEAFE", padding: 24 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="crown-outline" size={20} color="#F59E0B" /><Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Why partners love it</Text></View>
          <View style={{ gap: 12, marginTop: 16 }}>
            {cfg.benefits.map((b: string, i: number) => (
              <View key={i} style={{ flexDirection: "row", gap: 10, backgroundColor: "rgba(255,255,255,0.7)", borderRadius: 12, padding: 12 }}>
                <Icon name="check-circle-outline" size={20} color="#10B981" /><Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "500", flex: 1, lineHeight: 20 }}>{b}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={purchase} disabled={buying} style={{ alignSelf: "center", marginTop: 24, height: 48, paddingHorizontal: 32, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>{buying ? "Processing…" : `Join AzoApp Pro — ${fmtINR(price)}`}</Text>{!buying ? <Icon name="arrow-right" size={18} color="#fff" /> : null}
          </Pressable>
        </LinearGradient>
      ) : null}
    </Wrap>
  );
}
