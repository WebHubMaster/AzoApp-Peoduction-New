/** Public site area — pages + the app bottom nav (Home · My Bookings · Book Now · Offers · Account). */
import React from "react";
import { View } from "react-native";
import { Slot, usePathname } from "expo-router";
import { AppBottomNav } from "../../src/components/apphome/AppBottomNav";

export default function SiteLayout() {
  const path = usePathname();
  const hideNav = path.startsWith("/service/") || path.startsWith("/book");
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1 }}><Slot /></View>
      {hideNav ? null : <AppBottomNav />}
    </View>
  );
}
