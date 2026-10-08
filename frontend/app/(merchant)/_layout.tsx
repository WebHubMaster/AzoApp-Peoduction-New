import React from "react";
import { View } from "react-native";
import { Stack, Redirect } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { MerchantBottomNav } from "@/src/components/MerchantBottomNav";
import { MerchantTopBar } from "@/src/components/merchant/MerchantTopBar";

/**
 * Merchant primary group. Uses a plain Stack (not expo Tabs) so the same
 * router-based floating bottom nav can be shared across BOTH this group and the
 * app/merchant/* stack — matching the web panel where the tab bar + header are
 * persistent on every merchant page.
 */
export default function MerchantLayout() {
  const { user } = useAuth();
  // Not yet approved by admin → stay on the registration / Under Review screen.
  if (user?.role === "merchant" && !(user.kyc_status === "approved" || user.verified_merchant)) return <Redirect href="/merchant/register" />;
  return (
    <View style={{ flex: 1 }}>
      <MerchantTopBar />
      <Stack screenOptions={{ headerShown: false, animation: "none" }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="customers" />
        <Stack.Screen name="wallet" />
        <Stack.Screen name="profile" />
      </Stack>
      <MerchantBottomNav />
    </View>
  );
}
