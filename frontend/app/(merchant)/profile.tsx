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

export default function MerchantProfile() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const brand = useBrand();
  const toast = useToast();
  const kyc = user?.kyc_status || "pending";

  const tools: { icon: MdiName; title: string; sub: string; onPress: () => void }[] = [
    { icon: "account-group", title: "My Customers", sub: "View & tag your customers", onPress: () => router.push("/(merchant)/customers") },
    { icon: "trending-up", title: "Commission", sub: "Earnings & breakdown", onPress: () => router.push("/merchant/commission") },
    { icon: "qrcode", title: "My QR / Code", sub: "Onboard a customer/partner", onPress: () => router.push("/merchant/scanqr") },
    { icon: "account-network", title: "My Network", sub: "Your partner network", onPress: () => router.push("/merchant/network") },
    { icon: "credit-card", title: "Bank & KYC", sub: kyc === "approved" ? "Verified" : "Complete verification", onPress: () => router.push("/merchant/bankkyc") },
    { icon: "chart-box", title: "Analytics", sub: "Business insights", onPress: () => router.push("/merchant/analytics") },
    { icon: "bell-ring", title: "Reminders", sub: "Customer service reminders", onPress: () => router.push("/merchant/reminders") },
    { icon: "bell", title: "Notifications", sub: "Alerts & updates", onPress: () => router.push("/notifications") },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Profile" embedded variant="gradient" testID="merchant-profile-header" />
      <ScreenScroll>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar name={user?.shop_name || user?.name} uri={user?.photo} size={60} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{user?.shop_name || user?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{user?.phone}</Text>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
                <Badge label={kyc === "approved" ? "Verified Merchant" : `KYC ${kyc}`} tone={statusTone(kyc)} icon={kyc === "approved" ? "check-decagram" : "clock-outline"} />
              </View>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          <InfoRow icon="store" label="Shop" value={user?.shop_name || "—"} />
          <InfoRow icon="tag" label="Type" value={user?.shop_type || "—"} />
          <InfoRow icon="map-marker" label="City" value={user?.city || "—"} />
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {tools.map((t, i) => (
            <View key={t.title} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
              <ListTile icon={t.icon} title={t.title} subtitle={t.sub} onPress={t.onPress} testID={`mtool-${i}`} />
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
          <Button title="Log out" variant="outline" icon="logout" testID="logout-button" onPress={async () => { await logout(); router.replace("/(auth)/welcome"); }} />
        </View>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, textAlign: "center", marginTop: 4 }}>
          {brand.branding.site_name} Merchant · v1.0.0
        </Text>
      </ScreenScroll>
    </View>
  );
}
