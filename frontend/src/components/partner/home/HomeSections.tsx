import React from "react";
import { View, Text, Pressable, Switch } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import dayjs from "dayjs";
import { useTheme } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { StatusBadge } from "@/src/components/AppShell";
import { ProgressRing } from "@/src/components/ProgressRing";
import { LineChart } from "@/src/components/LineChart";
import { fmtC, initials } from "@/src/lib/format";
import { TW, greeting, RANGE_LABEL } from "./tw";

export type NavKey = "jobs" | "active" | "wallet" | "earnings" | "invoices" | "support" | "onboarding" | "starterkit" | "bankkyc";
type Nav = (k: NavKey) => void;

export function Card({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: any }) {
  const { colors } = useTheme();
  return <View testID={testID} style={[{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border }, style]}>{children}</View>;
}
const H3 = ({ children, icon, color }: { children: React.ReactNode; icon?: MdiName; color?: string }) => {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      {icon ? <Icon name={icon} size={20} color={color || colors.primaryHover} /> : null}
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{children}</Text>
    </View>
  );
};
const LinkBtn = ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) => {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={8} style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={{ color: colors.primaryHover, fontSize: 12, fontWeight: "600" }}>{label}</Text><Icon name="chevron-right" size={16} color={colors.primaryHover} />
    </Pressable>
  );
};

/* ------------------------------------------------------------ HEADER */
export function HeaderCard({ user, kit, online, connected, onToggle }: { user: any; kit: any; online: boolean; connected: boolean; onToggle: (v: boolean) => void }) {
  const { colors, mode } = useTheme();
  const pro = user?.premium_partner || kit?.purchased;
  return (
    <Card style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <View>
          <LinearGradient colors={[colors.primaryHover, colors.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", boxShadow: "0px 4px 6px -1px rgba(0,0,0,0.1)" }}>
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{initials(user?.name || "P")}</Text>
          </LinearGradient>
          <View style={{ position: "absolute", bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: online ? TW.emerald500 : TW.slate300, borderWidth: 2, borderColor: colors.card }} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: TW.slate400, fontSize: 12, lineHeight: 13 }}>{greeting()},</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, lineHeight: 20 }} numberOfLines={1}>{(user?.name || "Partner").split(" ")[0]} 👋</Text>
            {pro ? (
              <LinearGradient testID="partner-premium-badge" colors={[TW.amber400, TW.amber500]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Icon name="crown-outline" size={12} color="#fff" /><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{user?.partner_badge || kit?.badge_label || "Pro"}</Text>
              </LinearGradient>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
            {user?.partner_code ? <Text style={{ color: TW.slate400, fontSize: 11.5, fontFamily: "monospace" }}>{user.partner_code}</Text> : null}
            {user?.city ? <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}><Icon name="map-marker-outline" size={12} color={TW.slate400} /><Text style={{ color: TW.slate400, fontSize: 11.5 }}>{user.city}</Text></View> : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: connected ? TW.emerald500 : TW.slate300 }} />
              <Text testID="ph-live" style={{ color: connected ? TW.emerald500 : TW.slate400, fontSize: 11.5 }}>{connected ? "Live" : "Offline"}</Text>
            </View>
          </View>
        </View>
      </View>
      <Pressable testID="online-toggle-wrap" onPress={() => onToggle(!online)} style={{ flexShrink: 0, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: online ? (mode === "dark" ? TW.emerald800 : TW.emerald200) : colors.border, backgroundColor: online ? (mode === "dark" ? "rgba(6,78,59,0.2)" : TW.emerald50) : colors.surfaceSubtle }}>
        <Switch testID="online-toggle" value={online} onValueChange={onToggle} trackColor={{ true: colors.primary, false: TW.slate200 }} thumbColor="#fff" />
      </Pressable>
    </Card>
  );
}

/* ------------------------------------------------------------ PRIORITY */
export function PriorityAction({ k, kycApproved, kit, nav }: { k: any; kycApproved: boolean; kit: any; nav: Nav }) {
  const { colors } = useTheme();
  let p: { colors: readonly [string, string]; icon: MdiName; title: string; desc: string; cta: string; go: NavKey } | null = null;
  if (!kycApproved) p = { colors: [TW.amber500, TW.orange500], icon: "shield-check-outline", title: "Complete your KYC", desc: "Finish verification to start receiving jobs & withdrawals.", cta: "Complete KYC", go: "onboarding" };
  else if (k.active_jobs > 0) p = { colors: [colors.primaryHover, colors.primary], icon: "navigation-variant-outline", title: `${k.active_jobs} active job${k.active_jobs > 1 ? "s" : ""} in progress`, desc: "Track and complete your ongoing work.", cta: "Track jobs", go: "active" };
  else if (k.open_requests > 0) p = { colors: [TW.emerald600, TW.emerald500], icon: "flash-outline", title: `${k.open_requests} new job request${k.open_requests > 1 ? "s" : ""} available`, desc: "Accept quickly before they expire.", cta: "View requests", go: "jobs" };
  else if (kit && kit.purchased === false && kit.status) p = { colors: [TW.violet600, colors.primaryHover], icon: "package-variant-closed", title: "Starter Kit", desc: "Track your Starter Kit status.", cta: "View status", go: "starterkit" };
  if (!p) return null;
  return (
    <Pressable testID="ph-priority" onPress={() => nav(p!.go)}>
      <LinearGradient colors={p.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 16, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, boxShadow: "0px 10px 15px -3px rgba(0,0,0,0.15)" }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}><Icon name={p.icon} size={22} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15, lineHeight: 18 }}>{p.title}</Text>
          <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 }} numberOfLines={1}>{p.desc}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>{p.cta}</Text><Icon name="chevron-right" size={16} color="#fff" />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

/* ------------------------------------------------------------ WALLET */
export function WalletCard({ wallet, nav }: { wallet: any; nav: Nav }) {
  const { colors, mode } = useTheme();
  const dark = mode === "dark";
  const canW = (wallet.withdrawable ?? 0) > 0;
  const up = { fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" as const };
  return (
    <Card testID="ph-wallet" style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <H3 icon="wallet-outline">Wallet</H3>
        <LinkBtn label="Details" onPress={() => nav("wallet")} testID="ph-wallet-details" />
      </View>
      <Text style={{ color: TW.slate400, fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 12 }}>Available balance</Text>
      <Text testID="ph-wallet-available" style={{ color: colors.text, fontSize: 30, fontWeight: "900", marginTop: 4 }}>{fmtC(wallet.available)}</Text>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
        <View style={{ flex: 1, borderRadius: 12, backgroundColor: dark ? "rgba(6,78,59,0.15)" : TW.emerald50, padding: 12 }}>
          <Text style={[up, { color: TW.emerald600 }]}>Withdrawable</Text>
          <Text style={{ color: TW.emerald700, fontSize: 15, fontWeight: "800", marginTop: 2 }}>{fmtC(wallet.withdrawable)}</Text>
        </View>
        <View style={{ flex: 1, borderRadius: 12, backgroundColor: dark ? "rgba(120,53,15,0.15)" : TW.amber50, padding: 12 }}>
          <Text style={[up, { color: TW.amber600 }]}>Pending</Text>
          <Text style={{ color: TW.amber700, fontSize: 15, fontWeight: "800", marginTop: 2 }}>{fmtC(wallet.pending)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12 }}>
        <Text style={{ color: TW.slate400, fontSize: 12 }}>Total withdrawn</Text><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{fmtC(wallet.total_withdrawn)}</Text>
      </View>
      <Pressable testID="ph-withdraw" disabled={!canW} onPress={() => nav("wallet")} style={{ marginTop: 16, height: 44, borderRadius: 12, backgroundColor: colors.primaryHover, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: canW ? 1 : 0.4 }}>
        <Icon name="arrow-top-right" size={16} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>{canW ? "Withdraw" : "Nothing to withdraw"}</Text>
      </Pressable>
    </Card>
  );
}

/* ------------------------------------------------------------ KPI GRID */
export function KpiGrid({ k, nav }: { k: any; nav: Nav }) {
  const { colors } = useTheme();
  const kpis: { label: string; value?: any; money?: number; icon: MdiName; tone: string; go?: NavKey; suffix?: string }[] = [
    { label: "Completed", value: k.jobs_completed, icon: "check-circle-outline", tone: TW.emerald500, go: "active" },
    { label: "Active", value: k.active_jobs, icon: "navigation-variant-outline", tone: TW.sky500, go: "active" },
    { label: "Requests", value: k.open_requests, icon: "briefcase-outline", tone: TW.amber500, go: "jobs" },
    { label: "Missed", value: k.missed_jobs, icon: "close-circle-outline", tone: TW.rose500, go: "jobs" },
    { label: "Avg / job", money: k.avg_per_job, icon: "trending-up", tone: TW.violet500 },
    { label: "Lifetime jobs", value: k.lifetime_jobs, icon: "medal-outline", tone: colors.primary },
    { label: "Rating", value: (k.rating || 0).toFixed(1), icon: "star", tone: TW.amber400, suffix: k.reviews_count ? ` · ${k.reviews_count}` : "" },
    { label: "Cancelled", value: k.cancelled, icon: "alert-outline", tone: TW.slate400 },
  ];
  return (
    <View testID="ph-kpis" style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      {kpis.map((m) => (
        <Pressable key={m.label} testID={`kpi-${m.label}`} disabled={!m.go} onPress={() => m.go && nav(m.go)} style={{ width: "48%", flexGrow: 1 }}>
          <Card style={{ padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Icon name={m.icon} size={18} color={m.tone} />
              {m.go ? <Icon name="chevron-right" size={14} color={TW.slate300} /> : null}
            </View>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 8, lineHeight: 22 }}>{m.money != null ? fmtC(m.money) : m.value ?? 0}{m.suffix || ""}</Text>
            <Text style={{ color: TW.slate400, fontSize: 11, marginTop: 4 }}>{m.label}</Text>
          </Card>
        </Pressable>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------ TREND + PERFORMANCE */
export function TrendCard({ k, chart, filterKey }: { k: any; chart: any[]; filterKey: string }) {
  const { colors } = useTheme();
  return (
    <Card testID="ph-chart" style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
        <View>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>Earnings trend</Text>
          <Text style={{ color: TW.slate400, fontSize: 12 }}>{RANGE_LABEL[filterKey] || "Custom range"} · {k.jobs_completed} job{k.jobs_completed === 1 ? "" : "s"}</Text>
        </View>
        {k.cancelled > 0 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="alert-outline" size={14} color={TW.rose500} /><Text style={{ color: TW.rose500, fontSize: 11 }}>{k.cancelled} cancelled</Text></View> : null}
      </View>
      {chart.length === 0
        ? <View style={{ height: 180, alignItems: "center", justifyContent: "center" }}><Text style={{ color: TW.slate400, fontSize: 13 }}>No earnings in this period yet.</Text></View>
        : <LineChart data={chart} height={180} />}
    </Card>
  );
}

function PerfRow({ icon, tone, label, value }: { icon: MdiName; tone: string; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name={icon} size={16} color={tone} /><Text style={{ color: TW.slate500, fontSize: 12.5 }}>{label}</Text></View>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

export function PerformanceCard({ k }: { k: any }) {
  const { colors } = useTheme();
  return (
    <Card testID="ph-performance" style={{ padding: 20 }}>
      <H3 icon="target">Performance</H3>
      <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 16 }}>
        <ProgressRing size={76} stroke={8} pct={k.completion_rate ?? 0} color={TW.emerald600} label="Completion" centerTop={k.completion_rate == null ? "—" : undefined} />
        <View style={{ alignItems: "center" }}>
          <ProgressRing size={76} stroke={8} pct={k.acceptance_rate ?? 0} color={colors.primaryHover} label="Acceptance" centerTop={k.acceptance_rate == null ? "—" : undefined} />
          <Text style={{ color: TW.slate400, fontSize: 10.5 }}>{k.offered ? `${k.accepted}/${k.offered}` : "no offers yet"}</Text>
        </View>
      </View>
      <View style={{ marginTop: 16, gap: 10 }}>
        <PerfRow icon="star" tone={TW.amber400} label="Average rating" value={`${(k.rating || 0).toFixed(1)}${k.reviews_count ? ` (${k.reviews_count})` : ""}`} />
        <PerfRow icon="close-circle-outline" tone={TW.rose500} label="Cancellation rate" value={k.cancellation_rate == null ? "—" : `${k.cancellation_rate}%`} />
        <PerfRow icon="timer-outline" tone={TW.sky500} label="Accept streak" value={`${k.accept_streak ?? 0} · best ${k.best_streak ?? 0}`} />
        <PerfRow icon="trending-up" tone={TW.violet500} label="Avg / job" value={fmtC(k.avg_per_job)} />
      </View>
    </Card>
  );
}

/* ------------------------------------------------------------ GROWTH (+ alerts) */
export function GrowthCard({ growth, alerts, nav }: { growth: any; alerts: { icon: MdiName; tone: "amber" | "violet" | "slate"; title: string; desc: string; go: NavKey }[]; nav: Nav }) {
  const { colors } = useTheme();
  const toneBg = { amber: [TW.amber100, TW.amber600], violet: [TW.violet100, TW.violet600], slate: [TW.slate100, TW.slate500] };
  return (
    <Card testID="ph-growth" style={{ padding: 20 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <H3 icon="medal-outline" color={growth.color}>Your growth</H3>
        <View style={{ backgroundColor: growth.color || colors.primary, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{growth.label}</Text></View>
      </View>
      <View style={{ marginTop: 16 }}>
        {growth.next_label ? (
          <>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ color: TW.slate500, fontSize: 12 }}>{growth.progress}% to {growth.next_label}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{growth.jobs_to_next} jobs to go</Text>
            </View>
            <View style={{ height: 12, borderRadius: 6, backgroundColor: colors.surfaceSubtle, overflow: "hidden" }}>
              <LinearGradient colors={[growth.color || colors.primary, TW.emerald400]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: `${growth.progress || 0}%`, height: 12, borderRadius: 6 }} />
            </View>
            <Text style={{ color: TW.slate400, fontSize: 12, marginTop: 8, lineHeight: 17 }}>You&apos;ve completed <Text style={{ color: colors.textSecondary, fontWeight: "700" }}>{growth.lifetime_jobs}</Text> jobs. Reach <Text style={{ fontWeight: "700" }}>{growth.next_min}</Text> to unlock <Text style={{ fontWeight: "700" }}>{growth.next_label}</Text>.</Text>
          </>
        ) : <Text style={{ color: TW.slate500, fontSize: 13 }}>🎉 You&apos;ve reached the highest tier — <Text style={{ fontWeight: "700" }}>{growth.label}</Text>! Keep up the great work.</Text>}
      </View>
      {alerts.length > 0 ? (
        <View style={{ marginTop: 20, gap: 10 }}>
          {alerts.map((a, i) => (
            <Pressable key={i} testID={`ph-alert-${a.go}`} onPress={() => nav(a.go)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: toneBg[a.tone][0], alignItems: "center", justifyContent: "center" }}><Icon name={a.icon} size={16} color={toneBg[a.tone][1]} /></View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: "700" }}>{a.title}</Text>
                <Text style={{ color: TW.slate400, fontSize: 11.5 }} numberOfLines={1}>{a.desc}</Text>
              </View>
              <Icon name="chevron-right" size={16} color={TW.slate300} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------ RECENT JOBS */
export function RecentJobs({ recent, nav, onOpen, onViewAll }: { recent: any[]; nav: Nav; onOpen: (id: string) => void; onViewAll?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card testID="ph-recent" style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>Recent jobs</Text>
        <LinkBtn label="View all" onPress={() => (onViewAll ? onViewAll() : nav("active"))} testID="ph-recent-all" />
      </View>
      {recent.length === 0 ? (
        <View style={{ paddingVertical: 48, alignItems: "center" }}>
          <Icon name="briefcase-outline" size={32} color={TW.slate300} />
          <Text style={{ color: TW.slate400, fontSize: 13, marginTop: 8 }}>No jobs yet. Complete your first job to start earning.</Text>
        </View>
      ) : recent.map((b) => {
        const amt = b.total || b.pricing?.total || 0;
        return (
          <Pressable key={b.id} testID={`recent-${b.id}`} onPress={() => onOpen(b.id)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="briefcase-outline" size={16} color={colors.primaryHover} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14.5 }} numberOfLines={1}>{b.service_name}</Text>
                <Text style={{ color: TW.slate400, fontSize: 11, marginTop: 2 }} numberOfLines={1}>#{b.code}{b.customer_name ? ` · ${b.customer_name}` : ""}{b.updated_at ? ` · ${dayjs(b.updated_at).format("D MMM")}` : ""}</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{fmtC(amt)}</Text>
              <StatusBadge status={b.status} />
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

/* ------------------------------------------------------------ QUICK ACTIONS */
export function QuickActions({ k, nav }: { k: any; nav: Nav }) {
  const { colors } = useTheme();
  const qa: { label: string; icon: MdiName; go: NavKey; badge?: number }[] = [
    { label: "Requests", icon: "briefcase-outline", go: "jobs", badge: k.open_requests },
    { label: "Active", icon: "navigation-variant-outline", go: "active", badge: k.active_jobs },
    { label: "Wallet", icon: "wallet-outline", go: "wallet" },
    { label: "Earnings", icon: "trending-up", go: "earnings" },
    { label: "Invoices", icon: "file-document-outline", go: "invoices" },
    { label: "Support", icon: "lifebuoy", go: "support" },
  ];
  return (
    <Card testID="ph-quick" style={{ padding: 20 }}>
      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16, marginBottom: 16 }}>Quick actions</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {qa.map((q) => (
          <Pressable key={q.label} testID={`qa-${q.label}`} onPress={() => nav(q.go)} style={{ width: "30%", flexGrow: 1, alignItems: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
            {q.badge ? <View style={{ position: "absolute", top: 8, right: 8, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: TW.rose500, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{q.badge}</Text></View> : null}
            <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name={q.icon} size={20} color={colors.primaryHover} /></View>
            <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{q.label}</Text>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}
