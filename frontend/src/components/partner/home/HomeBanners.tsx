import React from "react";
import { View, Text, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Icon, MdiName } from "@/src/components/Icon";
import { useTheme } from "@/src/theme";
import { TW } from "./tw";

/** "AzoApp Pro perks" section — web PartnerDashboard pro-perks-section. Collapsible. */
export function ProPerks({ label }: { label: string }) {
  const [open, setOpen] = React.useState(false);
  const perks: { icon: MdiName; t: string; d: string }[] = [
    { icon: "flash-outline", t: "Priority job access", d: "You see & can accept new jobs a 30-second head-start before non-Pro partners." },
    { icon: "check-decagram-outline", t: "Pro badge on profile", d: "Customers see your gold Pro badge — builds trust and wins more bookings." },
    { icon: "shield-check-outline", t: "Priority support", d: "Faster help from our team whenever you need assistance." },
  ];
  return (
    <LinearGradient testID="pro-perks-section" colors={[TW.amber50, "#FFFFFF"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, borderWidth: 1, borderColor: TW.amber200, padding: 20 }}>
      <Pressable testID="pro-perks-toggle" onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <LinearGradient colors={[TW.amber400, TW.amber500]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }}>
          <Icon name="crown-outline" size={20} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: TW.slate900, fontWeight: "700", fontSize: 15 }}>{label} perks</Text>
          <Text style={{ color: TW.slate500, fontSize: 12 }}>Exclusive benefits for Pro members</Text>
        </View>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={22} color={TW.amber500} />
      </Pressable>
      {open ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          {perks.map((p) => (
            <View key={p.t} style={{ borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: TW.amber100, padding: 16 }}>
              <Icon name={p.icon} size={20} color={TW.amber500} />
              <Text style={{ color: TW.slate800, fontWeight: "600", fontSize: 14, marginTop: 8 }}>{p.t}</Text>
              <Text style={{ color: TW.slate500, fontSize: 12, marginTop: 2, lineHeight: 17 }}>{p.d}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </LinearGradient>
  );
}

/** "Complete your verification" banner — web onboarding-banner. */
export function OnboardingBanner({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <View testID="onboarding-banner" style={{ borderRadius: 16, backgroundColor: colors.primaryHover, padding: 20, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Icon name="shield-check-outline" size={32} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 17 }}>Complete your verification</Text>
          <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>Finish onboarding & KYC to start receiving jobs.</Text>
        </View>
      </View>
      <Pressable testID="goto-onboarding" onPress={onPress} style={{ alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 16, height: 40, justifyContent: "center" }}>
        <Text style={{ color: colors.primaryHover, fontWeight: "600", fontSize: 14 }}>Complete now</Text>
      </Pressable>
    </View>
  );
}
