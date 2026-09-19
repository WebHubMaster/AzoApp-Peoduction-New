import React from "react";
import { View, Text, Pressable, Share } from "react-native";
import { useQuery } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, SectionTitle, Button, CardSkeleton } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

export default function MerchantScanQr() {
  const { colors } = useTheme();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["merchant-code"], queryFn: () => api.get<any>("/merchant/my-code") });
  const code = data?.merchant_code || "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="My QR / Code" back variant="gradient" testID="merchant-scanqr-header" />
      <ScreenScroll>
        {isLoading ? <CardSkeleton /> : (
          <>
            <LinearGradient colors={[colors.primary, colors.primaryHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.xl, alignItems: "center" }}>
              <View style={{ width: 150, height: 150, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: spacing.lg }}>
                <Icon name="qrcode" size={110} color={colors.primary} />
              </View>
              <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.xs, fontWeight: "700" }}>YOUR MERCHANT CODE</Text>
              <Text style={{ color: "#fff", fontSize: 34, fontWeight: "900", letterSpacing: 4, marginTop: 4 }}>{code}</Text>
            </LinearGradient>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button title="Copy code" variant="secondary" icon="content-copy" onPress={async () => { await Clipboard.setStringAsync(code); toast.success("Code copied"); }} testID="copy-code" />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Share" icon="share-variant" onPress={() => Share.share({ message: `Join via my code: ${code}` })} testID="share-code" />
              </View>
            </View>
            <Card>
              <SectionTitle title="How it works" />
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 22 }}>
                Share this code with customers and partners. When they sign up or book using your code, you earn commission automatically — tracked under Commission & My Network.
              </Text>
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}
