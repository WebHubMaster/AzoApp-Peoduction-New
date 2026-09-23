import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { Icon, MdiName } from "@/src/components/Icon";
import { AppShellHeader } from "@/src/components/AppShell";
import { Skeleton } from "@/src/components/ui";
import { MissedRingRecovery } from "@/src/components/partner/home/MissedRingRecovery";
import { PermissionBanner } from "@/src/components/PermissionBanner";
import { ProPerks, OnboardingBanner } from "@/src/components/partner/home/HomeBanners";
import { EarningsHero, RangeFilter } from "@/src/components/partner/home/EarningsHero";
import { HeaderCard, PriorityAction, WalletCard, KpiGrid, TrendCard, PerformanceCard, GrowthCard, RecentJobs, QuickActions, NavKey } from "@/src/components/partner/home/HomeSections";
import { TestRingCard, SnoozeCard, StreakCard, MissedRequestsCard } from "@/src/components/partner/home/AlertsPanel";
import { requestNotificationPermission, registerPushToken } from "@/src/lib/notifications";
import { TW } from "@/src/components/partner/home/tw";

/* web NAV key → mobile route */
const ROUTES: Record<NavKey, string> = {
  jobs: "/(partner)/jobs", active: "/(partner)/active", wallet: "/(partner)/wallet",
  earnings: "/partner/earnings", invoices: "/partner/invoices", support: "/partner/support",
  onboarding: "/partner/verification", starterkit: "/partner/starter-kit", bankkyc: "/partner/payouts",
};

function DashboardSkeleton() {
  return (
    <View testID="ph-skeleton" style={{ gap: 20 }}>
      <Skeleton height={80} radius={16} />
      <Skeleton height={224} radius={24} />
      <Skeleton height={224} radius={16} />
      <View style={{ flexDirection: "row", gap: 12 }}>{[0, 1].map((i) => <Skeleton key={i} height={96} radius={16} style={{ flex: 1 }} />)}</View>
      <Skeleton height={288} radius={16} />
    </View>
  );
}

export default function PartnerHome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, setUser, refresh } = useAuth() as any;
  const { subscribe, connected } = useRealtime();
  const toast = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<RangeFilter>({ key: "30d" });
  const [optimistic, setOptimistic] = useState<{ status?: string; value: boolean } | null>(null);
  const serverOnline = user?.partner_status === "online";
  const online = optimistic && optimistic.status === user?.partner_status ? optimistic.value : serverOnline;
  const setOnline = (v: boolean) => setOptimistic({ status: user?.partner_status, value: v });

  const qs = useMemo(() => (filter.key === "custom" && filter.from && filter.to ? `date_from=${filter.from}&date_to=${filter.to}` : `range=${filter.key}`), [filter]);
  const dash = useQuery({ queryKey: ["partner-dashboard", qs], queryFn: () => api.get<any>(`/bookings/partner/dashboard?${qs}`), placeholderData: keepPreviousData });
  const stats = useQuery({ queryKey: ["partner-stats"], queryFn: () => api.get<any>("/partner/stats") });
  const kitQ = useQuery({ queryKey: ["starter-kit"], queryFn: () => api.get<any>("/starter-kit/me") });
  const kit = kitQ.data;

  const nav = (k: NavKey) => router.push(ROUTES[k] as any);
  const invalidateAll = () => ["partner-dashboard", "partner-stats", "partner-missed", "partner-jobs", "partner-active", "starter-kit"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));

  // Live dispatch over SSE — dashboard updates without any refresh (web PartnerDashboard).
  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_request") { const d = ev.data || {}; toast.success(`🔔 New job request available${d.service_name ? " · " + d.service_name : ""}${d.city ? " · " + d.city : ""}`); invalidateAll(); }
    else if (["job_taken", "job_accepted", "booking_update", "__resync__"].includes(ev.type)) invalidateAll();
  }), [subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live GPS ping while online (admin live map) — web uses navigator.geolocation.watchPosition.
  useEffect(() => {
    if (!online) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    const send = (p: Location.LocationObject) => api.post("/partner/location", { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => {});
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(send).catch(() => {});
        sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 30000, distanceInterval: 25 }, send);
      } catch { /* location unavailable */ }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [online]);

  const toggleOnline = useMutation({
    mutationFn: (v: boolean) => api.put<any>("/auth/partner/online-status", { online: v }),
    onMutate: (v) => setOnline(v),
    onSuccess: (data, v) => {
      setUser?.({ ...(data || user), partner_status: v ? "online" : "offline" });
      toast.success(v ? "You are online" : "You are offline");
      if (v) {
        qc.invalidateQueries({ queryKey: ["partner-missed"] });
        // Going online = we start the FCM-independent background ring listener
        // (RealtimeContext). Make sure notifications are allowed so the persistent
        // "you're online" service notification + the full-screen job ring can show.
        if (Platform.OS !== "web") {
          requestNotificationPermission()
            .then((r) => { if (r.granted) registerPushToken().catch(() => {}); })
            .catch(() => {});
        }
      }
    },
    onError: (e: any, v) => { setOnline(!v); toast.error(e?.detail || "Could not update status"); },
  });

  const d = dash.data;
  const loading = dash.isLoading && !d;
  const kycApproved = user?.kyc_status === "approved" || !!user?.verified_partner;
  const showOnboarding = !user?.onboarding_submitted && user?.kyc_status !== "approved";
  const isPro = !!(user?.premium_partner || kit?.purchased);
  const k = d?.kpis || {};
  const wallet = d?.wallet || {};
  const growth = d?.growth || {};
  const chart: any[] = (d?.earnings_chart || []).map((c: any) => ({ date: c.date, earning: c.amount, jobs: c.jobs }));

  const alerts: { icon: MdiName; tone: "amber" | "violet" | "slate"; title: string; desc: string; go: NavKey }[] = [];
  if (d) {
    if (!kycApproved) alerts.push({ icon: "shield-check-outline", tone: "amber", title: "KYC pending", desc: `Status: ${user?.kyc_status || "not started"}. Complete to receive jobs.`, go: "onboarding" });
    if (kycApproved && (wallet.withdrawable ?? 0) <= 0 && (wallet.available ?? 0) <= 0) alerts.push({ icon: "wallet-outline", tone: "slate", title: "No balance yet", desc: "Complete jobs to build your withdrawable balance.", go: "jobs" });
    if (kit?.locked) alerts.push({ icon: "package-variant-closed", tone: "violet", title: "Starter Kit required", desc: "Purchase the Starter Kit to unlock all features.", go: "starterkit" });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView
        testID="partner-home"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={dash.isFetching && !loading} onRefresh={() => { invalidateAll(); refresh?.(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <MissedRingRecovery />
        <PermissionBanner />
        {isPro ? <ProPerks label={user?.partner_badge || kit?.badge_label || "AzoApp Pro"} /> : null}
        {showOnboarding ? <OnboardingBanner onPress={() => nav("onboarding")} /> : null}

        {loading ? <DashboardSkeleton /> : dash.isError && !d ? (
          <View testID="ph-error" style={{ borderRadius: 16, borderWidth: 1, borderColor: TW.rose200, backgroundColor: TW.rose50, padding: 40, alignItems: "center" }}>
            <Icon name="alert-outline" size={32} color={TW.rose500} />
            <Text style={{ color: TW.slate800, fontWeight: "600", marginTop: 12 }}>Unable to load your dashboard</Text>
            <Pressable testID="ph-retry" onPress={() => dash.refetch()} style={{ marginTop: 16, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.primaryHover }}>
              <Icon name="refresh" size={16} color="#fff" /><Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <HeaderCard user={user} kit={kit} online={online} connected={connected} onToggle={(v) => toggleOnline.mutate(v)} />
            <PriorityAction k={k} kycApproved={kycApproved} kit={kit} nav={nav} />
            <EarningsHero k={k} chart={chart} filter={filter} setFilter={setFilter} updating={dash.isPlaceholderData} />
            <WalletCard wallet={wallet} nav={nav} />
            <KpiGrid k={k} nav={nav} />
            <TrendCard k={k} chart={chart} filterKey={filter.key} />
            <PerformanceCard k={k} />
            <GrowthCard growth={growth} alerts={alerts} nav={nav} />
            <RecentJobs recent={d?.recent || []} nav={nav} onOpen={(id) => router.push(`/(partner)/booking/${id}` as any)} />
            <QuickActions k={k} nav={nav} />
          </>
        )}

        {/* PartnerAlertsPanel */}
        <View testID="partner-alerts-panel" style={{ gap: 16 }}>
          <TestRingCard />
          <SnoozeCard />
          <StreakCard stats={stats.data} />
          <MissedRequestsCard />
        </View>
        {Platform.OS === "web" ? <View style={{ height: 8 }} /> : null}
      </ScrollView>
    </View>
  );
}
