import React from "react";
import { Tabs, useRouter } from "expo-router";
import { AppTabBar, MoreItem } from "@/src/components/AppTabBar";
import { useAuth } from "@/src/context/AuthContext";

export default function MerchantLayout() {
  const router = useRouter();
  const { logout } = useAuth();

  const moreItems: MoreItem[] = [
    { key: "commission", label: "Commission", icon: "trending-up", onPress: () => router.push("/merchant/commission") },
    { key: "scanqr", label: "My QR / Code", icon: "qrcode-scan", onPress: () => router.push("/merchant/scanqr") },
    { key: "network", label: "My Network", icon: "account-network", onPress: () => router.push("/merchant/network") },
    { key: "payouts", label: "Payouts & Bank", icon: "bank", onPress: () => router.push("/merchant/payouts") },
    { key: "bankkyc", label: "Bank & KYC", icon: "credit-card", onPress: () => router.push("/merchant/bankkyc") },
    { key: "analytics", label: "Analytics", icon: "chart-box", onPress: () => router.push("/merchant/analytics") },
    { key: "reminders", label: "Reminders", icon: "bell-ring", onPress: () => router.push("/merchant/reminders") },
    { key: "profilekyc", label: "Profile & KYC", icon: "shield-check", onPress: () => router.push("/merchant/profilekyc") },
    { key: "notifications", label: "Notifications", icon: "bell", onPress: () => router.push("/notifications") },
    { key: "support", label: "Help & Support", icon: "lifebuoy", onPress: () => router.push("/support") },
  ];

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} moreItems={moreItems} onLogout={async () => { await logout(); router.replace("/(auth)/login"); }} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="customers" options={{ title: "Customers" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
