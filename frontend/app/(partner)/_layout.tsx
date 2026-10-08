import React, { useEffect } from "react";
import { AppState } from "react-native";
import { Tabs, useRouter, usePathname } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { refreshPartnerLive, LIVE_EVENTS } from "@/src/lib/partnerLive";
import { AppTabBar, MoreItem } from "@/src/components/AppTabBar";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { JobRingOverlay } from "@/src/components/JobRingOverlay";
import { useRealtime } from "@/src/context/RealtimeContext";
import { usePersistHomeQueries } from "@/src/lib/queryPersist";

/** Mirrors web PartnerDashboard NAV (rest of the menu lives under "More"). */
export default function PartnerLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const { logout, user } = useAuth() as any;
  // Maid partners get a work-focused menu — Rewards & Challenges is hidden for them.
  const isMaid = (user?.skills || []).includes("maid");

  const { connected, subscribe } = useRealtime();
  const qc = useQueryClient();
  usePersistHomeQueries(qc, user?.id);
  useEffect(() => subscribe((ev) => { if (LIVE_EVENTS.includes(ev.type)) refreshPartnerLive(qc); }), [subscribe, qc]);
  useEffect(() => { const sub = AppState.addEventListener("change", (s) => { if (s === "active") refreshPartnerLive(qc); }); return () => sub.remove(); }, [qc]);
  const jobs = useQuery({ queryKey: ["partner-jobs"], queryFn: () => api.get<any[]>("/bookings/partner/jobs"), refetchInterval: connected ? 60000 : 15000 });
  const active = useQuery({ queryKey: ["partner-active"], queryFn: () => api.get<any[]>("/bookings/partner/active") });
  const badges = { jobs: jobs.data?.length || 0, active: active.data?.length || 0 };

  const ROUTES: Record<string, string> = { subscriptions: "/partner/subscriptions", availability: "/partner/availability", bankkyc: "/partner/payouts", earnings: "/partner/earnings", invoices: "/partner/invoices", incentives: "/partner/rewards", analytics: "/partner/analytics", starterkit: "/partner/starter-kit", onboarding: "/partner/verification", support: "/partner/support", permissions: "/partner/permissions" };
  const moreItems: MoreItem[] = ([
    { key: "subscriptions", label: "Maid Subscriptions", icon: "calendar-heart", onPress: () => router.push("/partner/subscriptions") },
    { key: "availability", label: "My Availability", icon: "calendar-clock-outline", onPress: () => router.push("/partner/availability") },
    { key: "permissions", label: "Alerts & Permissions", icon: "bell-cog-outline", onPress: () => router.push("/partner/permissions") },
    { key: "bankkyc", label: "Bank & KYC", icon: "credit-card-outline", onPress: () => router.push("/partner/payouts") },
    { key: "earnings", label: "Earnings Ledger", icon: "trending-up", onPress: () => router.push("/partner/earnings") },
    { key: "invoices", label: "My Invoice", icon: "file-document-outline", onPress: () => router.push("/partner/invoices") },
    { key: "incentives", label: "Rewards & Challenges", icon: "gift-outline", onPress: () => router.push("/partner/rewards") },
    { key: "analytics", label: "Analytics", icon: "chart-line", onPress: () => router.push("/partner/analytics") },
    { key: "starterkit", label: "Starter Kit", icon: "package-variant-closed", onPress: () => router.push("/partner/starter-kit") },
    { key: "onboarding", label: "Profile & KYC", icon: "check-circle-outline", onPress: () => router.push("/partner/verification") },
    { key: "support", label: "Help & Support", icon: "lifebuoy", onPress: () => router.push("/partner/support") },
  ] as MoreItem[]).filter((it) => !(isMaid && it.key === "incentives") && !(!isMaid && it.key === "subscriptions")).map((it) => ({ ...it, active: pathname.startsWith(ROUTES[it.key]) }));

  return (
    <>
    <JobRingOverlay />
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} moreItems={moreItems} badges={badges} hideTabs={["profile"]} hideBarRoutes={["partner/support/[id]", "partner/job/[id]"]} onLogout={async () => { await logout(); router.replace("/(auth)/welcome"); }} />}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="jobs" options={{ title: "Job Request" }} />
      <Tabs.Screen name="active" options={{ title: "Active Job" }} />
      <Tabs.Screen name="wallet" options={{ title: "Wallet & Withdraw" }} />
      <Tabs.Screen name="booking/[id]" options={{ href: null }} />
      {["subscriptions", "analytics", "availability", "bankkyc", "earnings", "history", "invoices", "payouts", "rewards", "starter-kit", "verification", "notifications", "permissions", "invoice/[id]", "support/index", "support/[id]", "job/[id]"].map((n) => (
        <Tabs.Screen key={n} name={`partner/${n}`} options={{ href: null }} />
      ))}
    </Tabs>
    </>
  );
}
