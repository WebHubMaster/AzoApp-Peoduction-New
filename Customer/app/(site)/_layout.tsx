/** Public site area — SiteNavbar on top, MobileBottomNav at bottom (web Landing/Services/Book shell). */
import React from "react";
import { View } from "react-native";
import { Slot } from "expo-router";
import SiteNavbar, { MobileBottomNav } from "@/src/components/site/SiteNavbar";

export default function SiteLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <SiteNavbar />
      <View style={{ flex: 1 }}><Slot /></View>
      <MobileBottomNav />
    </View>
  );
}
