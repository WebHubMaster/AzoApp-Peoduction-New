/** Public site area — pages + the app bottom nav (Home · My Bookings · Book Now · Offers · Account). */
import React from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import { AppBottomNav } from "../../src/components/apphome/AppBottomNav";

export default function SiteLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1 }}><Slot /></View>
      <AppBottomNav />
    </View>
  );
}
