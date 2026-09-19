import React from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, Avatar, Badge, InfoRow, ListTile, SectionTitle, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useAuth } from "@/src/context/AuthContext";

export default function MerchantProfileKyc() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const fin = useQuery({ queryKey: ["merchant-finance-kyc"], queryFn: () => api.get<any>("/merchant/panel/finance-kyc") });
  const kyc = user?.kyc_status || "pending";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Profile & KYC" back variant="gradient" testID="merchant-profilekyc-header" />
      <ScreenScroll>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
            <Avatar name={user?.shop_name || user?.name} uri={user?.photo} size={58} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{user?.shop_name || user?.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{user?.phone}</Text>
              <View style={{ marginTop: 6 }}><Badge label={kyc === "approved" ? "Verified Merchant" : `KYC ${kyc}`} tone={statusTone(kyc)} icon={kyc === "approved" ? "check-decagram" : "clock-outline"} /></View>
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          <InfoRow icon="store" label="Shop name" value={user?.shop_name} />
          <InfoRow icon="tag" label="Shop type" value={user?.shop_type} />
          <InfoRow icon="email" label="Email" value={user?.email} />
          <InfoRow icon="map-marker" label="City" value={user?.city} />
        </Card>

        <Card style={{ backgroundColor: fin.data?.eligible ? colors.successSubtle : colors.warningSubtle, borderColor: fin.data?.eligible ? colors.success : colors.warning }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name={fin.data?.eligible ? "shield-check" : "shield-alert"} size={22} color={fin.data?.eligible ? colors.success : colors.warning} />
            <Text style={{ flex: 1, color: colors.text, fontWeight: "700", fontSize: fontSize.sm }}>
              {fin.data?.eligible ? "Withdrawal eligible — KYC complete" : (fin.data?.blockers || []).join(" · ") || "Complete Bank & KYC to withdraw"}
            </Text>
          </View>
        </Card>

        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          <ListTile icon="credit-card" title="Bank & KYC" subtitle="PAN + bank verification" onPress={() => router.push("/merchant/bankkyc")} testID="goto-bankkyc" />
        </Card>
      </ScreenScroll>
    </View>
  );
}
