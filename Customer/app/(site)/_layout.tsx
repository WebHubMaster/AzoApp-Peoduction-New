/** Public site area — pages + the web-style bottom nav (Home · Services · Booking · Orders · Profile). */
import React from "react";
import { View } from "react-native";
import { Slot, usePathname } from "expo-router";
import { MobileBottomNav } from "../../src/components/site/SiteNavbar";
import { useCart } from "../../src/context/CartContext";

export default function SiteLayout() {
  const path = usePathname();
  const { count } = useCart();
  const hideNav = path.startsWith("/service/") || path.startsWith("/book") || (path.startsWith("/services") && count > 0);
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1 }}><Slot /></View>
      {hideNav ? null : <MobileBottomNav />}
    </View>
  );
}
