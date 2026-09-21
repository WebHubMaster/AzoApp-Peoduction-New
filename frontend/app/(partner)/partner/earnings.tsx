import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Modal } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader, Surface, KitEmpty, StatusBadge } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { LineChart } from "@/src/components/LineChart";
import { fmt, fmtC } from "@/src/lib/format";

const SLATE400 = "#94A3B8";
const RANGES = [{ k: "7", l: "7 Days" }, { k: "14", l: "14 Days" }, { k: "30", l: "30 Days" }];
const PAGE_SIZES = [10, 25, 50, 100];

// Total deduction (platform commission) so every view balances: Service Cost − Net = Commission.
const deduc = (l: any) => Number(l.commission != null ? Math.max(0, Number(l.commission) || 0)
  : Math.max(0, (Number(l.base ?? l.gross) || 0) - (Number(l.net_earning ?? l.partner_earning) || 0)));

/** Web EarningsLedger.jsx (mobile view) — 1:1 — Total Earnings hero, 4 KPIs, Earnings Trend, Payout History, Earnings Ledger. */
export default function PartnerEarnings() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [range, setRange] = useState("14");
  const [detail, setDetail] = useState<any>(null);

  const e = useQuery({ queryKey: ["partner-earn-ledger"], queryFn: () => api.get<any>("/wallet/partner/earnings") });
  const sum = useQuery({ queryKey: ["partner-earnings"], queryFn: () => api.get<any>("/partner/earnings-summary") });
  const E = e.data || {}; const S = sum.data || {};
  const ledger: any[] = E.ledger || [];
  const payouts: any[] = S.payouts || [];
  const pages = Math.max(1, Math.ceil(ledger.length / pageSize)); const pg = Math.min(page, pages);
  const rows = ledger.slice((pg - 1) * pageSize, pg * pageSize);
  const daily = (S.daily || []).slice(-Number(range)).map((d: any) => ({ date: d.date, earning: d.amount }));
  const reload = () => ["partner-earn-ledger", "partner-earnings"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

  const stats: { label: string; value: any; icon: MdiName; bg: string; fg: string }[] = [
    { label: "TODAY", value: S.today, icon: "calendar-today", bg: "#DBEAFE", fg: "#2563EB" },
    { label: "THIS WEEK", value: S.this_week, icon: "calendar-week", bg: "#D1FAE5", fg: "#059669" },
    { label: "THIS MONTH", value: S.this_month, icon: "calendar-month", bg: "#EDE9FE", fg: "#7C3AED" },
    { label: "LIFETIME", value: S.lifetime ?? E.total_earned, icon: "layers-outline", bg: "#FEF3C7", fg: "#D97706" },
  ];

  const Section = ({ title, subtitle, icon, right, bodyPad = false, children }: { title: string; subtitle?: string; icon: MdiName; right?: React.ReactNode; bodyPad?: boolean; children: React.ReactNode }) => (
    <Surface style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
          <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={17} color={colors.primary} /></View>
          <View style={{ flexShrink: 1 }}><Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}</View>
        </View>
        {right}
      </View>
      <View style={bodyPad ? { padding: 16 } : undefined}>{children}</View>
    </Surface>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 16 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={e.isFetching && !e.isLoading} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}>
        {/* Hero */}
        <LinearGradient colors={[colors.primaryDark, colors.primaryHover, colors.secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, boxShadow: "0px 20px 45px rgba(13,71,161,0.4)", elevation: 6 }} testID="partner-earnings-header">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="trending-up" size={16} color="#BFDBFE" /><Text style={{ color: "#BFDBFE", fontSize: 14 }}>Total Earnings</Text></View>
          <Text style={{ color: "#fff", fontSize: 44, fontWeight: "900", marginTop: 6, lineHeight: 50 }} numberOfLines={1}>{fmtC(E.total_earned)}</Text>
          <Text style={{ color: "#BFDBFE", fontSize: 14, marginTop: 8 }}>{E.jobs || S.jobs_paid || 0} jobs completed</Text>
          <View style={{ marginTop: 16, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", paddingHorizontal: 20, paddingVertical: 12, alignSelf: "flex-start" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="wallet-outline" size={13} color="rgba(255,255,255,0.6)" /><Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: "600", letterSpacing: 1.5 }}>WALLET BALANCE</Text></View>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900", marginTop: 2 }}>{fmtC(E.wallet_balance)}</Text>
          </View>
        </LinearGradient>

        {/* KPIs */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
          {stats.map((s) => (
            <Surface key={s.label} style={{ width: "48%", padding: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "600", letterSpacing: 0.8 }} numberOfLines={1}>{s.label}</Text>
                <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: s.bg, alignItems: "center", justifyContent: "center" }}><Icon name={s.icon} size={16} color={s.fg} /></View>
              </View>
              <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", marginTop: 8 }} numberOfLines={1}>{fmt(s.value)}</Text>
            </Surface>
          ))}
        </View>

        {/* Earnings Trend */}
        <Section title="Earnings Trend" icon="trending-up" right={
          <View style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.surfaceSubtle }}>
            {RANGES.map((r) => {
              const on = range === r.k;
              return (
                <Pressable key={r.k} testID={`range-${r.k}`} onPress={() => setRange(r.k)} style={{ paddingHorizontal: 10, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? colors.surface : "transparent" }}>
                  <Text style={{ color: on ? colors.primary : colors.textMuted, fontSize: 11, fontWeight: "700" }}>{r.l}</Text>
                </Pressable>
              );
            })}
          </View>
        } bodyPad>
          <LineChart data={daily} height={230} />
        </Section>

        {/* Payout History */}
        <Section title="Payout History" icon="cash">
          {payouts.length === 0 ? <KitEmpty icon="cash" title="No payouts yet" desc="Your withdrawal payouts will appear here." /> : (
            <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
              {payouts.map((p, i) => (
                <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.surfaceSubtle }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="cash" size={16} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700" }}>{fmt(p.net_amount ?? p.amount)} <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "600" }}>{String(p.method || "").toUpperCase()}</Text></Text>
                    <Text style={{ color: SLATE400, fontSize: 11, marginTop: 1 }}>{p.requested_at ? new Date(p.requested_at).toLocaleDateString() : ""}</Text>
                  </View>
                  <StatusBadge status={p.status} />
                </View>
              ))}
            </ScrollView>
          )}
        </Section>

        {/* Earnings Ledger */}
        <Section title="Earnings Ledger" subtitle={ledger.length ? `${ledger.length} transactions` : undefined} icon="receipt-text-outline">
          {e.isLoading ? <View style={{ padding: 16 }}><View style={{ height: 56, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} /></View>
            : ledger.length === 0 ? <KitEmpty icon="receipt-text-outline" title="No earnings yet" desc="Complete jobs to start earning. Every settled job will appear here with its full commission breakdown." /> : (
            <>
              {rows.map((l, i) => (
                <Pressable key={l.id} testID={`ledger-${l.booking_code}`} onPress={() => setDetail(l)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: colors.surfaceSubtle }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" }}><Icon name="arrow-bottom-left" size={16} color="#059669" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14, fontFamily: "monospace" }}>#{l.booking_code}</Text>
                    <Text style={{ color: SLATE400, fontSize: 11, marginTop: 2 }}>Gross {fmt(l.gross)} · Comm {fmt(deduc(l))}</Text>
                  </View>
                  <Text style={{ color: "#059669", fontSize: 16, fontWeight: "800" }}>+{fmt(l.net_earning ?? l.partner_earning)}</Text>
                </Pressable>
              ))}
              <LedgerPagination page={pg} pageSize={pageSize} total={ledger.length} colors={colors} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
            </>
          )}
        </Section>
      </ScrollView>
      <EarningDetailSheet detail={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

/** Web kit <Pagination> — "Showing x–y of z" + page-size select + prev / page-window / next. */
function LedgerPagination({ page, pageSize, total, colors, onPage, onPageSize }: { page: number; pageSize: number; total: number; colors: any; onPage: (n: number) => void; onPageSize: (n: number) => void }) {
  const [menu, setMenu] = useState(false);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const win: number[] = [];
  const s = Math.max(1, Math.min(page - 1, pages - 2));
  for (let i = s; i <= Math.min(pages, s + 2); i += 1) win.push(i);
  const PgBtn = ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) => (
    <Pressable disabled={disabled} onPress={onPress} style={{ width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, alignItems: "center" }}>
      <Text style={{ color: SLATE400, fontSize: 12 }}>Showing <Text style={{ fontWeight: "700", color: colors.textSecondary }}>{from}–{to}</Text> of {total}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable testID="page-size" onPress={() => setMenu(true)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{pageSize}/page</Text><Icon name="chevron-down" size={14} color={SLATE400} />
        </Pressable>
        <PgBtn label="‹" disabled={page <= 1} onPress={() => onPage(page - 1)} />
        {win.map((p) => (
          <Pressable key={p} onPress={() => onPage(p)} style={{ minWidth: 32, height: 32, paddingHorizontal: 8, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: p === page ? colors.primaryHover : "transparent", borderWidth: p === page ? 0 : 1, borderColor: colors.border }}>
            <Text style={{ color: p === page ? "#fff" : colors.textMuted, fontSize: 13, fontWeight: "700" }}>{p}</Text>
          </Pressable>
        ))}
        <PgBtn label="›" disabled={page >= pages} onPress={() => onPage(page + 1)} />
      </View>
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setMenu(false)}>
          <View style={{ position: "absolute", alignSelf: "center", top: "40%", backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, minWidth: 140, boxShadow: "0px 12px 32px rgba(15,23,42,0.18)", elevation: 8 }}>
            {PAGE_SIZES.map((n) => (
              <Pressable key={n} onPress={() => { onPageSize(n); setMenu(false); }} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ color: n === pageSize ? colors.primary : colors.textSecondary, fontSize: 14, fontWeight: n === pageSize ? "800" : "500" }}>{n} / page</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Web EarningsLedger <Sheet title="Earning Details"> — 1:1 */
function EarningDetailSheet({ detail, onClose }: { detail: any; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!detail) return null;
  const gross = Number(detail.gross) || 0;
  const tax = Number(detail.tax) || 0;
  const net = Number(detail.net_earning ?? detail.partner_earning) || 0;
  const serviceCost = Number(detail.base) || Math.max(0, gross - tax);
  const rates = detail.rates || {};
  const partnerPct = rates.partner_pct;
  const platformComm = Number(detail.commission != null ? detail.commission : Math.max(0, serviceCost - net));
  const platformPct = serviceCost > 0 ? Math.round((platformComm / serviceCost) * 1000) / 10 : rates.platform_pct ?? null;
  const pct = (v: number) => (serviceCost > 0 ? Math.max(0, (v / serviceCost) * 100) : 0);
  const isCancel = detail.kind === "cancellation" || detail.status === "cancelled";
  const costLabel = isCancel ? "Cancellation Charge (excl. tax)" : "Service Cost (excl. tax)";
  const earnLabel = isCancel ? "Partner Earning" : "Partner Commission";
  const platLabel = isCancel ? "Platform Share" : "Platform Commission";
  const Row = ({ k, v, mono, strong }: { k: string; v: string; mono?: boolean; strong?: boolean }) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
      <Text style={{ color: colors.textMuted, fontSize: 15, flexShrink: 1 }}>{k}</Text>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: strong ? "800" : "600", fontFamily: mono ? "monospace" : undefined }}>{v}</Text>
    </View>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View testID="earning-detail-sheet" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
          <View style={{ alignSelf: "center", height: 6, width: 48, borderRadius: 3, backgroundColor: colors.border, marginTop: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800" }}>Earning Details</Text>
            <Pressable testID="drawer-close" onPress={onClose} style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={22} color={SLATE400} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }}>
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 2 }}>{isCancel ? "Your Earning" : "Net Earning"}</Text>
              <Text style={{ color: "#059669", fontSize: 32, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] }}>+{fmt(net)}</Text>
              <View style={{ marginTop: 8 }}><StatusBadge status={detail.status || (isCancel ? "cancelled" : "completed")} /></View>
            </View>
            {serviceCost > 0 ? (
              <View testID="earning-breakdown-bar" style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
                <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: "#E2E8F0" }}>
                  <View style={{ width: `${pct(net)}%`, backgroundColor: "#10B981" }} />
                  <View style={{ width: `${pct(platformComm)}%`, backgroundColor: "#FB7185" }} />
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 10 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#10B981" }} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>Partner {fmt(net)}</Text></View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: "#FB7185" }} /><Text style={{ color: colors.textMuted, fontSize: 12 }}>Platform {fmt(platformComm)}</Text></View>
                </View>
                <Text style={{ color: SLATE400, fontSize: 11, marginTop: 8 }}>{isCancel ? "Cancellation Charge" : "Service Cost"} {fmt(serviceCost)} = Partner {fmt(net)} + Platform {fmt(platformComm)}</Text>
              </View>
            ) : null}
            <Row k="Job" v={`#${detail.booking_code}`} mono />
            <Row k={costLabel} v={fmt(serviceCost)} />
            <Row k={`${earnLabel}${partnerPct != null ? ` (${partnerPct}%)` : ""}`} v={`+${fmt(net)}`} />
            <Row k={`${platLabel}${platformPct != null ? ` (${platformPct}%)` : ""}`} v={`-${fmt(platformComm)}`} />
            {tax ? <Row k="Est. Govt. Taxes (customer-borne)" v={fmt(tax)} /> : null}
            {detail.bonus ? <Row k="Bonus" v={`+${fmt(detail.bonus)}`} /> : null}
            {detail.penalty ? <Row k="Penalty" v={`-${fmt(detail.penalty)}`} /> : null}
            <Row k={isCancel ? "Your Earning" : "Net Earning"} v={fmt(net)} strong />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
