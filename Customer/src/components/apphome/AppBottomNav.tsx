/** Bottom nav — Home · My Bookings · Book Now (FAB) · Offers · Account */
import React from "react";
import { View, Text, Pressable } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Home, ClipboardList, Plus, BadgePercent, User } from "lucide-react-native";
import { PRIMARY, SLATE } from "../../theme";
import { useAuth } from "../../context/AuthContext";

const Tab = ({ testID, Icon, label, active, onPress }: any) => (
  <Pressable testID={testID} onPress={onPress} style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 }}>
    <Icon size={22} color={active ? PRIMARY[700] : SLATE[400]} />
    <Text style={{ fontSize: 10, fontWeight: active ? "700" : "500", color: active ? PRIMARY[700] : SLATE[500], marginTop: 3 }}>{label}</Text>
  </Pressable>
);

export function AppBottomNav() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const go = (target: string, auth?: boolean) => {
    if (auth && !user) { router.push("/login"); return; }
    router.push(target as any);
  };
  const isHome = path === "/" || path === "/(site)" || path === "";
  return (
    <View testID="app-bottom-nav" style={{ backgroundColor: "#fff", borderTopWidth: 1, borderTopColor: SLATE[200], paddingBottom: insets.bottom, flexDirection: "row", alignItems: "flex-end", boxShadow: "0px -6px 20px rgba(15,23,42,0.06)" }}>
      <Tab testID="bn-home" Icon={Home} label="Home" active={isHome} onPress={() => router.replace("/(site)")} />
      <Tab testID="bn-bookings" Icon={ClipboardList} label="My Bookings" active={path.includes("/orders")} onPress={() => go("/(customer)/orders", true)} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6 }}>
        <Pressable testID="bn-book-now" onPress={() => router.push("/(site)/services" as any)} style={{ height: 56, width: 56, borderRadius: 28, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center", marginTop: -26, borderWidth: 4, borderColor: "#fff", boxShadow: "0px 6px 16px rgba(13,71,161,0.35)" }}>
          <Plus size={26} color="#fff" strokeWidth={2.5} />
        </Pressable>
        <Text style={{ fontSize: 10, fontWeight: "700", color: PRIMARY[700], marginTop: 3 }}>Book Now</Text>
      </View>
      <Tab testID="bn-offers" Icon={BadgePercent} label="Offers" active={path.includes("/offers")} onPress={() => router.push("/(site)/offers" as any)} />
      <Tab testID="bn-account" Icon={User} label="Account" active={path.startsWith("/(customer)") && !path.includes("/orders")} onPress={() => go("/(customer)", true)} />
    </View>
  );
}
