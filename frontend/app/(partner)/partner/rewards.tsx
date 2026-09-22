import React from "react";
import { View, Text, ScrollView, RefreshControl, Animated } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt } from "@/src/lib/format";

const SLATE400 = "#94A3B8";

function Ring({ pct, size = 76, stroke = 8, color = "#0659B2" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r; const off = c - (Math.min(100, Math.max(0, pct || 0)) / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={`${c}`} strokeDashoffset={off} strokeLinecap="round" />
      </Svg>
      <Text style={{ color: "#1E293B", fontSize: Math.round(size * 0.24), fontWeight: "800" }}>{Math.round(pct || 0)}%</Text>
    </View>
  );
}

/** Looping opacity pulse — mirrors web `animate-pulse`. */
function Pulse({ children, style }: { children: React.ReactNode; style?: any }) {
  const [a] = React.useState(() => new Animated.Value(1));
  React.useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.5, duration: 900, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[style, { opacity: a }]}>{children}</Animated.View>;
}

/** Web ChallengesRewards.jsx 1:1 */
export default function PartnerRewards() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["partner-challenges"], queryFn: () => api.get<any>("/partner/challenges") });
  const bq = useQuery({ queryKey: ["partner-bonuses"], queryFn: () => api.get<any>("/partner/my-bonuses") });
  const data = q.data ?? (q.isError ? { challenges: [], stats: {}, penalties: [] } : undefined);
  const bonuses = bq.data ?? (bq.isError ? { rows: [], totals: {}, grand_total: 0, count: 0 } : undefined);
  const reload = () => { qc.invalidateQueries({ queryKey: ["partner-challenges"] }); qc.invalidateQueries({ queryKey: ["partner-bonuses"] }); };

  const H = ({ icon, color, t, right }: { icon: MdiName; color: string; t: string; right?: React.ReactNode }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}><Icon name={icon} size={22} color={color} /><Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>{t}</Text>{right}</View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView testID="challenges-rewards" contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 24 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}>
        {!data ? <Text style={{ color: SLATE400, textAlign: "center", paddingVertical: 40 }}>Loading your rewards…</Text> : (() => {
          const s = data.stats || {}; const next = s.next_reward; const streak = s.streak || {};
          const list = [...(data.challenges || [])].sort((a, b) => (Number(b.eligible) - Number(a.eligible)) || (b.progress_pct - a.progress_pct));
          const pen: any[] = data.penalties || [];
          return (
            <>
              {/* Hero */}
              <LinearGradient colors={[colors.primary, colors.primaryDark, "#0F172A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, overflow: "hidden" }}>
                <View style={{ position: "absolute", right: -24, top: -24, opacity: 0.1 }}><Icon name="trophy-outline" size={180} color="#fff" /></View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="creation" size={16} color="#BFDBFE" /><Text style={{ color: "#BFDBFE", fontSize: 15 }}>Rewards & Challenges</Text></View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", columnGap: 32, rowGap: 16, marginTop: 12 }}>
                  <View><Text style={{ color: "#BFDBFE", fontSize: 13 }}>Total bonuses earned</Text><Text style={{ color: "#fff", fontSize: 36, fontWeight: "800" }}>{fmt(s.total_earned || 0)}</Text></View>
                  <View><Text style={{ color: "#BFDBFE", fontSize: 13 }}>Fleet rank</Text><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="crown-outline" size={20} color="#FCD34D" /><Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>#{s.rank || "—"}</Text><Text style={{ color: "#93C5FD", fontSize: 14, fontWeight: "500" }}> / {s.total_partners || 0}</Text></View></View>
                  <View><Text style={{ color: "#BFDBFE", fontSize: 13 }}>Active challenges</Text><View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Icon name="fire" size={20} color="#FDBA74" /><Text style={{ color: "#fff", fontSize: 24, fontWeight: "800" }}>{s.active_count || 0}</Text></View></View>
                  {s.eligible_count > 0 ? <Pulse style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(52,211,153,0.9)", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8 }}><Icon name="flash" size={16} color="#022C22" /><Text style={{ color: "#022C22", fontWeight: "600" }}>{s.eligible_count} reward{s.eligible_count > 1 ? "s" : ""} unlocked!</Text></Pulse> : null}
                </View>
              </LinearGradient>

              {/* Auto payout */}
              <View testID="auto-payout-card" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: 1, padding: 16, backgroundColor: s.auto_payout ? "#ECFDF5" : colors.surface, borderColor: s.auto_payout ? "#A7F3D0" : colors.border }}>
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.auto_payout ? "#10B981" : "#CBD5E1", alignItems: "center", justifyContent: "center" }}><Icon name="flash" size={24} color="#fff" /></View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Auto Payout</Text><View style={{ backgroundColor: s.auto_payout ? "#D1FAE5" : colors.surfaceSubtle, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: s.auto_payout ? "#047857" : colors.textMuted, fontSize: 12, fontWeight: "700" }}>{s.auto_payout ? "ON" : "OFF"}</Text></View></View>
                  <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{s.auto_payout ? "Unlocked bonuses land in your wallet instantly — no admin approval needed." : "Bonuses are released after admin approval."}</Text>
                </View>
              </View>

              {/* Streak */}
              <LinearGradient colors={["#FFF7ED", "#FFFBEB"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, borderWidth: 1, borderColor: "#FED7AA", padding: 16 }} testID="streak-card">
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="fire" size={22} color="#F97316" /><Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>5★ Streak</Text></View>
                  <Text><Text style={{ color: "#EA580C", fontSize: 24, fontWeight: "800" }}>{streak.current || 0}</Text><Text style={{ color: SLATE400, fontSize: 13 }}> in a row</Text></Text>
                </View>
                {streak.enabled === false ? <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 8 }}>Streak bonuses are currently paused.</Text> : (
                  <>
                    <View style={{ flexDirection: "row", gap: 4, marginTop: 12 }}>{Array.from({ length: streak.threshold || 5 }).map((_, i) => <View key={i} style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: i < (streak.into_milestone || 0) ? "#F97316" : "rgba(255,255,255,0.8)", borderWidth: i < (streak.into_milestone || 0) ? 0 : 1, borderColor: "#FED7AA" }} />)}</View>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 8 }}>{(streak.remaining || 0) > 0 ? <><Text style={{ color: "#EA580C", fontWeight: "700" }}>{streak.remaining}</Text> more 5★ job{streak.remaining !== 1 ? "s" : ""} to earn a <Text style={{ color: "#059669", fontWeight: "700" }}>{fmt(streak.next_bonus || 0)}</Text> bonus 🔥</> : "Keep the streak alive for your next bonus!"}</Text>
                    <Text style={{ color: SLATE400, fontSize: 12, marginTop: 4 }}>Best streak: {streak.best || 0} · Bonuses paid: {streak.milestones_paid || 0}</Text>
                    {streak.freeze_enabled && (streak.freezes_total || 0) > 0 ? <View testID="streak-freeze" style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, backgroundColor: "#F0F9FF", borderWidth: 1, borderColor: "#BAE6FD", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 }}><Icon name="snowflake" size={14} color="#0369A1" /><Text style={{ color: "#0369A1", fontSize: 12, fontWeight: "500", flex: 1 }}>Streak Freeze: {streak.freezes_left || 0}/{streak.freezes_total} left this week — one off-day won&apos;t break your streak.</Text></View> : null}
                  </>
                )}
              </LinearGradient>

              {/* My bonuses */}
              {bonuses && bonuses.count > 0 ? (
                <View testID="my-bonuses" style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="receipt-text-outline" size={20} color={colors.secondary} /><Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>My Bonuses</Text></View>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>Total earned <Text style={{ color: "#059669", fontWeight: "700" }}>{fmt(bonuses.grand_total)}</Text></Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    {([["Incentives", bonuses.totals?.incentive, "flash", "#059669"], ["Streak", bonuses.totals?.streak_bonus, "fire", "#EA580C"], ["Leaderboard", bonuses.totals?.leaderboard_reward, "trophy-outline", "#D97706"]] as [string, number, MdiName, string][]).map(([l, v, ic, tone]) => (
                      <View key={l} style={{ flex: 1, borderRadius: 12, backgroundColor: colors.surfaceSubtle, padding: 10, alignItems: "center" }}><Icon name={ic} size={16} color={tone} /><Text style={{ color: colors.text, fontWeight: "800", marginTop: 4 }}>{fmt(v || 0)}</Text><Text style={{ color: SLATE400, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{l}</Text></View>
                    ))}
                  </View>
                  <View style={{ gap: 6 }}>
                    {bonuses.rows.map((b: any) => {
                      const ic: MdiName = b.kind === "streak_bonus" ? "fire" : b.kind === "leaderboard_reward" ? "trophy-outline" : "flash";
                      const tone = b.kind === "streak_bonus" ? "#F97316" : b.kind === "leaderboard_reward" ? "#F59E0B" : "#10B981";
                      return (
                        <View key={b.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.surfaceSubtle, paddingHorizontal: 12, paddingVertical: 8 }}>
                          <Icon name={ic} size={16} color={tone} />
                          <View style={{ flex: 1 }}><Text style={{ color: colors.textSecondary, fontSize: 14 }} numberOfLines={1}>{b.note}</Text><Text style={{ color: SLATE400, fontSize: 11 }}>{b.created_at ? new Date(b.created_at).toLocaleDateString("en-IN") : ""}</Text></View>
                          <Text style={{ color: "#059669", fontWeight: "600" }}>+{fmt(b.amount)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Next reward */}
              {next ? (
                <View testID="next-reward" style={{ flexDirection: "row", alignItems: "center", gap: 20, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: "#BFDBFE", backgroundColor: "rgba(239,246,255,0.5)", padding: 20 }}>
                  <Ring pct={next.progress_pct} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.secondary, fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>Closest reward</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>{next.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>You are <Text style={{ color: colors.primary, fontWeight: "700" }}>{next.remaining_jobs} job{next.remaining_jobs !== 1 ? "s" : ""}</Text> away from a <Text style={{ color: "#059669", fontWeight: "700" }}>{fmt(next.bonus_amount)}</Text> bonus. Keep going! 🚀</Text>
                  </View>
                </View>
              ) : null}

              {/* Challenges */}
              <View>
                <H icon="target" color={colors.secondary} t="Your Challenges" />
                {list.length === 0 ? <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border, padding: 32, alignItems: "center" }}><Text style={{ color: SLATE400 }}>No active challenges right now. Check back soon!</Text></View> : null}
                <View style={{ gap: 16 }} testID="challenges-list">
                  {list.map((c) => {
                    const done = c.claim_status === "paid"; const unlocked = c.eligible && !done;
                    const grad: [string, string] = unlocked ? ["#10B981", "#047857"] : done ? ["#64748B", "#334155"] : [colors.secondary, colors.primaryDark];
                    const bar = unlocked ? "#10B981" : done ? "#94A3B8" : colors.secondary;
                    return (
                      <View key={c.id} style={{ borderRadius: 16, borderWidth: 1, borderColor: unlocked ? "#6EE7B7" : colors.border, backgroundColor: colors.surface, overflow: "hidden", opacity: done ? 0.8 : 1 }}>
                        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <View style={{ flex: 1 }}><Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{c.name}</Text><Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, marginTop: 2 }} numberOfLines={2}>{c.description}</Text></View>
                          <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800" }}>{fmt(c.bonus_amount)}</Text>
                        </LinearGradient>
                        <View style={{ padding: 16 }}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}><Text style={{ color: colors.textMuted, fontSize: 13 }}>{c.jobs_done}{c.job_target > 0 ? ` / ${c.job_target}` : ""} jobs {c.rating_min > 0 ? `· ${c.rating}★ / ${c.rating_min}★` : ""}</Text><Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: "600" }}>{c.progress_pct}%</Text></View>
                          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.surfaceSubtle, overflow: "hidden" }}><View style={{ width: `${Math.min(100, c.progress_pct || 0)}%`, height: 10, backgroundColor: bar, borderRadius: 5 }} /></View>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                            {done ? <><Icon name="check-circle-outline" size={16} color="#10B981" /><Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: "500" }}>Bonus received — {fmt(c.bonus_amount)} 🎉</Text></>
                              : unlocked ? <><Icon name="trophy-outline" size={16} color="#059669" /><Text style={{ color: "#059669", fontSize: 14, fontWeight: "600" }}>Unlocked! Bonus on its way to your wallet.</Text></>
                              : <><Icon name="lock-outline" size={14} color={colors.textMuted} /><Text style={{ color: colors.textMuted, fontSize: 15 }}>{c.remaining_jobs} more job{c.remaining_jobs !== 1 ? "s" : ""} to unlock</Text></>}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Penalties */}
              <View>
                <H icon="alert-outline" color="#F43F5E" t="Penalties" right={s.penalty_total > 0 ? <View style={{ backgroundColor: "#FFE4E6", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: "#BE123C", fontSize: 12, fontWeight: "700" }}>-{fmt(s.penalty_total)}</Text></View> : undefined} />
                {pen.length === 0 ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, borderWidth: 1, borderColor: "#A7F3D0", backgroundColor: "#ECFDF5", padding: 20 }}><Icon name="medal-outline" size={20} color="#047857" /><Text style={{ color: "#047857", fontSize: 16, fontWeight: "500", flexShrink: 1 }}>Spotless record — no penalties. Keep it up!</Text></View>
                ) : (
                  <View style={{ gap: 8 }} testID="penalties-list">
                    {pen.map((p) => (
                      <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
                        <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "500" }}>{p.reason}</Text><Text style={{ color: SLATE400, fontSize: 12, textTransform: "capitalize" }}>{p.type} · {p.created_at ? new Date(p.created_at).toLocaleDateString("en-IN") : ""}{p.status === "reversed" ? " · reversed & refunded" : ""}</Text></View>
                        <Text style={{ color: p.status === "reversed" ? SLATE400 : "#E11D48", fontWeight: "600", textDecorationLine: p.status === "reversed" ? "line-through" : "none" }}>{p.type === "score" ? "—" : `-${fmt(p.amount)}`}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          );
        })()}
      </ScrollView>
    </View>
  );
}
