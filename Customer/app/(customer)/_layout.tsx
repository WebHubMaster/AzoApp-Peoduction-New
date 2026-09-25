/** Customer area — guarded (customer-only) + shared data + persistent shell (header/bottom nav). */
import React, { useEffect } from "react";
import { Slot, useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/src/context/AuthContext";
import { CustomerDataProvider, useCustomerData } from "@/src/context/CustomerDataContext";
import CustomerShell from "@/src/components/customer/CustomerShell";
import { PRIMARY } from "@/src/theme";

function ShellWithBadges() {
  const { activeCount } = useCustomerData();
  return (
    <CustomerShell badges={{ orders: activeCount }}>
      <Slot />
    </CustomerShell>
  );
}

export default function CustomerLayout() {
  const { user, booting } = useAuth();
  const router = useRouter();
  useEffect(() => { if (!booting && !user) router.replace("/login"); }, [booting, user]); // eslint-disable-line react-hooks/exhaustive-deps
  if (booting || !user) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}><ActivityIndicator size="large" color={PRIMARY[700]} /></View>;
  }
  return (
    <CustomerDataProvider>
      <ShellWithBadges />
    </CustomerDataProvider>
  );
}
