import { TC, useTheme } from "@/src/theme";
/** Public site area — pages + the web-style bottom nav (Home · Services · Booking · Orders · Profile). */
import React from "react";
import { View } from "react-native";
import { Slot, usePathname } from "expo-router";
import { MobileBottomNav } from "../../src/components/site/SiteNavbar";
import { useCart } from "../../src/context/CartContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RateServiceButton } from "../../src/components/customer/RateService";

export default function SiteLayout() {
  useTheme();
  const path = usePathname();
  const { count } = useCart();
  const insets = useSafeAreaInsets();
  const isHome = path === "/" || path === "/(site)" || path === "";
  const hideNav = path.startsWith("/service/") || path.startsWith("/book") || (path.startsWith("/services") && count > 0);
  return (
    <View style={{ flex: 1, backgroundColor: TC.surface }}>
      <View style={{ flex: 1 }}><Slot /></View>
      {hideNav ? null : <MobileBottomNav />}
      {isHome && !hideNav ? <RateServiceButton bottom={64 + insets.bottom} /> : null}
    </View>
  );
}
