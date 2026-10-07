/** Bottom nav — Home · My Bookings · Book Now (FAB) · Offers · Account */
import React from "react";
import { View, Text, Pressable } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, ClipboardList, Plus, Crown, User, Ticket } from "lucide-react-native";
import { PRIMARY, SLATE, useTheme, TC } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useSiteConfig } from "../../context/BrandContext";

const Tab = ({ testID, Icon, label, active, onPress }: any) => (
  <Pressable testID={testID} onPress={onPress} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12 }}>
    <Icon size={23} color={active ? PRIMARY[700] : TC.textFaint} />
    <Text style={{ fontSize: 11, fontWeight: active ? "700" : "500", color: active ? PRIMARY[700] : TC.textMuted, marginTop: 4 }}>{label}</Text>
  </Pressable>
);

export function AppBottomNav() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { c } = useTheme();
  const { membership_enabled } = useSiteConfig();
  const go = (target: string, auth?: boolean) => {
    if (auth && !user) { router.push("/login"); return; }
    router.push(target as any);
  };
  const isHome = path === "/" || path === "/(site)" || path === "";
  return (
    <View style={{ backgroundColor: c.surface, paddingBottom: Math.max(insets.bottom, 8), paddingHorizontal: 12 }}>
      <View testID="app-bottom-nav" style={{ backgroundColor: c.surface, borderRadius: 6, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "flex-end", boxShadow: "0px -4px 24px rgba(15,23,42,0.10)" }}>
        <Tab testID="bn-home" Icon={Home} label="Home" active={isHome} onPress={() => router.replace("/(site)")} />
        <Tab testID="bn-bookings" Icon={ClipboardList} label="My Bookings" active={path.includes("/orders")} onPress={() => go("/(customer)/orders", true)} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 10 }}>
          <Pressable testID="bn-book-now" onPress={() => router.push("/(site)/services" as any)} style={{ height: 60, width: 60, borderRadius: 30, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", marginTop: -28, borderWidth: 4, borderColor: "#fff", boxShadow: "0px 6px 16px rgba(13,71,161,0.35)" }}>
            <Plus size={26} color="#fff" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ fontSize: 11, fontWeight: "700", color: TC.primaryText, marginTop: 4 }}>Book Now</Text>
        </View>
        {membership_enabled !== false
          ? <Tab testID="bn-membership" Icon={Crown} label="Membership" active={path.includes("/membership")} onPress={() => router.push("/(site)/membership" as any)} />
          : <Tab testID="bn-offers" Icon={Ticket} label="Offers" active={path.includes("/offers")} onPress={() => router.push("/(site)/offers" as any)} />}
        <Tab testID="bn-account" Icon={User} label="Account" active={path.startsWith("/(customer)") && !path.includes("/orders")} onPress={() => go("/(customer)", true)} />
      </View>
    </View>
  );
}
