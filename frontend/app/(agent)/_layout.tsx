import React from "react";
import { Tabs, useRouter } from "expo-router";
import { AppTabBar, MoreItem } from "@/src/components/AppTabBar";
import { useAuth } from "@/src/context/AuthContext";

export default function AgentLayout() {
  const router = useRouter();
  const { logout } = useAuth();

  const moreItems: MoreItem[] = [
    { key: "map", label: "Map QR", icon: "qrcode-scan", onPress: () => router.push("/(agent)/map") },
    { key: "wallet", label: "Wallet & Withdraw", icon: "wallet", onPress: () => router.push("/(agent)/wallet") },
    { key: "notifications", label: "Notifications", icon: "bell", onPress: () => router.push("/notifications") },
    { key: "support", label: "Help & Support", icon: "lifebuoy", onPress: () => router.push("/support") },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} moreItems={moreItems} onLogout={async () => { await logout(); router.replace("/(auth)/welcome"); }} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="map" options={{ title: "Map QR" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
