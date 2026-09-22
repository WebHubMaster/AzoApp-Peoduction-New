import React from "react";
import { View, Text, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, Avatar, Badge, ListTile, Button, InfoRow, statusTone } from "@/src/components/ui";
import { MdiName } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";
import { fmt } from "@/src/lib/format";

export default function AgentProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const brand = useBrand();
  const toast = useToast();

  const me = useQuery({ queryKey: ["agent-me"], queryFn: () => api.get<any>("/agent/me") });
  const w = me.data?.wallet || {};
  const bank = me.data?.bank || null;
  const bankVerified = !!(bank && bank.verified);
  const active = user?.agent_active !== false;

  const tools: { icon: MdiName; title: string; sub: string; onPress: () => void }[] = [
    { icon: "qrcode-scan", title: "Map QR", sub: "Link stickers to merchants", onPress: () => router.push("/(agent)/map") },
    { icon: "wallet", title: "Wallet & Withdraw", sub: `Available ${fmt(w.available)}`, onPress: () => router.push("/(agent)/wallet") },
    { icon: "bank", title: "Bank details", sub: bank ? (bankVerified ? "Verified" : "Pending verification") : "Add to withdraw", onPress: () => router.push("/(agent)/wallet") },
    { icon: "bell", title: "Notifications", sub: "Alerts & updates", onPress: () => router.push("/notifications") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Profile" variant="gradient" testID="agent-profile-header" />
      <ScreenScroll refreshing={me.isFetching} onRefresh={() => me.refetch()}>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar name={user?.name} uri={user?.photo} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{user?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{user?.phone}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Badge label={active ? "Active agent" : "Disabled"} tone={statusTone(active ? "active" : "rejected")} icon={active ? "check-decagram" : "cancel"} />
              </View>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          <InfoRow icon="qrcode-plus" label="QRs mapped" value={String(w.mappings ?? 0)} />
          <InfoRow icon="cash-multiple" label="Total earned" value={fmt(w.total_earned)} />
          <InfoRow icon="package-variant-closed" label="Batches assigned" value={String((me.data?.assigned_batch_ids || []).length)} />
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {tools.map((t, i) => (
            <View key={t.title} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <ListTile icon={t.icon} title={t.title} subtitle={t.sub} onPress={t.onPress} testID={`atool-${i}`} />
            </View>
          ))}
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListTile icon="headset" title="Help & Support" subtitle={brand.branding.phone || "Contact support"} onPress={() => brand.branding.phone ? Linking.openURL(`tel:${brand.branding.phone}`) : toast.info("Support contact unavailable")} testID="agent-support-tile" />
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
            <ListTile icon="email" title="Email us" subtitle={brand.branding.email || "support"} onPress={() => brand.branding.email ? Linking.openURL(`mailto:${brand.branding.email}`) : toast.info("Email unavailable")} testID="agent-email-tile" />
          </View>
        </Card>

        <View style={{ marginTop: spacing.sm }}>
          <Button title="Log out" variant="outline" icon="logout" testID="agent-logout-button" onPress={async () => { await logout(); router.replace("/(auth)/login"); }} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, textAlign: "center", marginTop: 4 }}>
          {brand.branding.site_name} Agent · v1.0.0
        </Text>
      </ScreenScroll>
    </View>
  );
}
