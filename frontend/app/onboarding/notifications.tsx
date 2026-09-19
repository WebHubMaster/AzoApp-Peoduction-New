import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { Button } from "@/src/components/ui";
import { requestNotificationPermission, markPrompted } from "@/src/lib/notifications";
import { useToast } from "@/src/components/Toast";

const PERKS: { icon: MdiName; title: string; sub: string }[] = [
  { icon: "bell-ring", title: "Job Ring Alerts", sub: "Loud ring + vibration for new job requests" },
  { icon: "calendar-check", title: "Booking Alerts", sub: "Instant updates on new & upcoming jobs" },
  { icon: "wallet", title: "Earnings & Payouts", sub: "Know the moment money hits your wallet" },
  { icon: "shield-alert", title: "Account Alerts", sub: "KYC, verification & important updates" },
];

export default function NotificationsOnboarding() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const finish = () => router.replace("/(auth)/login");

  const enable = async () => {
    setBusy(true);
    try {
      const { granted } = await requestNotificationPermission();
      await markPrompted();
      toast[granted ? "success" : "info"](
        granted ? "Notifications enabled" : "You can enable notifications later in Settings",
      );
    } catch {
      /* ignore */
    }
    setBusy(false);
    finish();
  };

  const skip = async () => {
    await markPrompted();
    finish();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[colors.primary, colors.primaryHover]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ paddingTop: insets.top + 40, paddingBottom: 40, alignItems: "center", borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}
      >
        <View
          style={{
            width: 92,
            height: 92,
            borderRadius: 26,
            backgroundColor: "rgba(255,255,255,0.15)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bell-badge" size={48} color="#fff" />
        </View>
        <Text style={{ color: "#fff", fontSize: fontSize.xxl, fontWeight: "900", marginTop: spacing.lg }}>Stay in the loop</Text>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: fontSize.sm, marginTop: 6, textAlign: "center", paddingHorizontal: 32, lineHeight: 20 }}>
          Turn on notifications so you never miss a job or a payout.
        </Text>
      </LinearGradient>

      <View style={{ flex: 1, padding: spacing.lg, gap: spacing.md }}>
        {PERKS.map((p) => (
          <View
            key={p.title}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.md,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
            }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
              <Icon name={p.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{p.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{p.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.sm }}>
        <Button title="Enable notifications" icon="bell-ring" onPress={enable} loading={busy} testID="enable-notifications-button" />
        <Pressable onPress={skip} style={{ alignItems: "center", paddingVertical: 12 }} testID="skip-notifications-button">
          <Text style={{ color: colors.textMuted, fontWeight: "700", fontSize: fontSize.sm }}>Maybe later</Text>
        </Pressable>
      </View>
    </View>
  );
}
