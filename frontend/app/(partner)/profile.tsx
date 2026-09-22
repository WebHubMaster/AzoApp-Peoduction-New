import React from "react";
import { View, Text, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, Avatar, Badge, ListTile, Button, InfoRow, statusTone } from "@/src/components/ui";
import { MdiName } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";
import { useBrand } from "@/src/context/BrandContext";
import { useToast } from "@/src/components/Toast";

export default function PartnerProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const brand = useBrand();
  const toast = useToast();

  const kyc = user?.kyc_status || "pending";

  const tools: { icon: MdiName; title: string; sub: string; onPress: () => void }[] = [
    { icon: "trending-up", title: "Earnings Ledger", sub: "Track every credit & payout", onPress: () => router.push("/partner/earnings") },
    { icon: "file-document", title: "My Invoices", sub: "Job invoices & receipts", onPress: () => router.push("/partner/invoices") },
    { icon: "credit-card", title: "Bank & KYC", sub: kyc === "approved" ? "Verified" : "Complete verification", onPress: () => router.push("/partner/payouts") },
    { icon: "calendar-clock", title: "Availability", sub: "Set your working days", onPress: () => router.push("/partner/availability") },
    { icon: "gift", title: "Rewards & Challenges", sub: "Bonuses & streaks", onPress: () => router.push("/partner/rewards") },
    { icon: "chart-line", title: "Analytics", sub: "Your performance insights", onPress: () => router.push("/partner/analytics") },
    { icon: "crown", title: "Starter Kit", sub: "Become an AzoApp Pro", onPress: () => router.push("/partner/starter-kit") },
    { icon: "shield-check", title: "Profile & KYC", sub: "Verification status", onPress: () => router.push("/partner/verification") },
    { icon: "bell", title: "Notifications", sub: "Alerts & updates", onPress: () => router.push("/notifications") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Profile" variant="gradient" testID="partner-profile-header" />
      <ScreenScroll>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar name={user?.name} uri={user?.photo} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{user?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{user?.phone}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Badge label={kyc === "approved" ? "Verified Partner" : `KYC ${kyc}`} tone={statusTone(kyc)} icon={kyc === "approved" ? "check-decagram" : "clock-outline"} />
              </View>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          <InfoRow icon="star" label="Rating" value={`${(user?.rating ?? 5).toFixed(1)} ★`} />
          <InfoRow icon="check-decagram" label="Jobs completed" value={String(user?.jobs_completed ?? 0)} />
          <InfoRow icon="identifier" label="Partner code" value={user?.partner_code || "—"} />
          <InfoRow icon="map-marker" label="City" value={user?.city || "—"} />
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {tools.map((t, i) => (
            <View key={t.title} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <ListTile icon={t.icon} title={t.title} subtitle={t.sub} onPress={t.onPress} testID={`tool-${i}`} />
            </View>
          ))}
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListTile icon="headset" title="Help & Support" subtitle={brand.branding.phone || "Contact support"} onPress={() => brand.branding.phone ? Linking.openURL(`tel:${brand.branding.phone}`) : toast.info("Support contact unavailable")} testID="support-tile" />
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
            <ListTile icon="email" title="Email us" subtitle={brand.branding.email || "support"} onPress={() => brand.branding.email ? Linking.openURL(`mailto:${brand.branding.email}`) : toast.info("Email unavailable")} testID="email-tile" />
          </View>
        </Card>

        <View style={{ marginTop: spacing.sm }}>
          <Button
            title="Log out"
            variant="outline"
            icon="logout"
            testID="logout-button"
            onPress={async () => {
              await logout();
              router.replace("/(auth)/login");
            }}
          />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, textAlign: "center", marginTop: 4 }}>
          {brand.branding.site_name} Partner · v1.0.0
        </Text>
      </ScreenScroll>
    </View>
  );
}
