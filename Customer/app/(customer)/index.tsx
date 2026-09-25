/** Home tab — CustomerDashboard.jsx `active === "home"` → <HomeView .../> */
import React from "react";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { useCustomerData } from "@/src/context/CustomerDataContext";
import HomeView from "@/src/components/customer/HomeView";
import { NAV, NavKey } from "@/src/components/customer/nav";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const d = useCustomerData();

  const goTo = (key: NavKey, code?: string) => {
    const route = NAV.find((n) => n.key === key)?.route || "/(customer)";
    router.push((code ? `${route}?focus=${encodeURIComponent(code)}` : route) as any);
  };
  const openBooking = (b: any) => router.push((["searching", "assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status) ? `/(customer)/track/${b.id}` : `/(customer)/orders?focus=${encodeURIComponent(b.code)}`) as any);

  return (
    <HomeView
      user={user} bookings={d.bookings} wallet={d.wallet} refunds={d.refunds} categories={d.categories} services={d.services} referral={d.referral} loading={d.loading}
      onNavigate={goTo}
      onBook={() => router.push("/(site)/services" as any)}
      onCategory={(id) => router.push(`/(site)/services?category=${id}` as any)}
      onOpenBooking={openBooking}
      onService={(id) => router.push(`/(site)/service/${id}` as any)}
    />
  );
}
