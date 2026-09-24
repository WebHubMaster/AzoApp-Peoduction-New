import React from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { MerchantBottomNav } from "@/src/components/MerchantBottomNav";
import { MerchantTopBar } from "@/src/components/merchant/MerchantTopBar";

/**
 * Merchant secondary stack (Scan QR, Commission, My Partners, Bank & KYC,
 * Analytics, Profile & KYC, …). Shares the SAME floating bottom nav so the
 * navigation chrome is present on every merchant page — just like the web panel.
 */
export default function MerchantStackLayout() {
  return (
    <View style={{ flex: 1 }}>
      <MerchantTopBar />
      <Stack screenOptions={{ headerShown: false }} />
      <MerchantBottomNav />
    </View>
  );
}
