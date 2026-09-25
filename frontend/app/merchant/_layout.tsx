import React from "react";
import { View } from "react-native";
import { Stack, usePathname } from "expo-router";
import { MerchantBottomNav } from "@/src/components/MerchantBottomNav";
import { MerchantTopBar } from "@/src/components/merchant/MerchantTopBar";

/**
 * Merchant secondary stack (Scan QR, Commission, My Partners, Bank & KYC,
 * Analytics, Profile & KYC, …). Shares the SAME floating bottom nav so the
 * navigation chrome is present on every merchant page — just like the web panel.
 *
 * EXCEPTION: the KYC registration screen (`/merchant/register`) is shown BEFORE
 * a merchant is approved/logged-in. On the web panel that screen is a full-page
 * form with no app chrome — so here we hide the TopBar + BottomNav until the
 * merchant is approved. Only the registration form is visible.
 */
export default function MerchantStackLayout() {
  const pathname = usePathname();
  const isRegister = !!pathname && pathname.startsWith("/merchant/register");
  return (
    <View style={{ flex: 1 }}>
      {isRegister ? null : <MerchantTopBar />}
      <Stack screenOptions={{ headerShown: false }} />
      {isRegister ? null : <MerchantBottomNav />}
    </View>
  );
}
