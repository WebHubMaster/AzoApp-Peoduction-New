import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Platform, ScrollView, RefreshControl } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppShellHeader, Surface, KitEmpty, SegTabs, KV, StatusBadge, money, shortDate } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const SLATE400 = "#94A3B8";
const monthKey = (s?: string) => (s || "").slice(0, 7);

/* ── KpiCard (FinanceKit) ── */
const TONES: Record<string, { bg: string; fg: string }> = {
  primary: { bg: "#F0F7FE", fg: "#0659B2" },
  emerald: { bg: "#ECFDF5", fg: "#059669" },
  amber: { bg: "#FFFBEB", fg: "#D97706" },
};
function KpiCard({ icon, tone, label, value, sub, trend, testID }: { icon: MdiName; tone: string; label: string; value: string; sub?: string; trend?: number | null; testID?: string }) {
  const { colors } = useTheme();
  return (
    <Surface testID={testID} style={{ padding: 16, width: "48.5%" }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: TONES[tone].bg, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={TONES[tone].fg} /></View>
        {trend != null ? (
          <View style={{ backgroundColor: trend >= 0 ? "#ECFDF5" : "#FFF1F2", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: trend >= 0 ? "#059669" : "#F43F5E", fontSize: 11, fontWeight: "700" }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] }} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={{ color: SLATE400, fontSize: 12, marginTop: 4 }} numberOfLines={1}>{sub}</Text> : null}
    </Surface>
  );
}

function TxRow({ t, onOpen, card }: { t: any; onOpen: () => void; card?: boolean }) {
  const { colors } = useTheme();
  const credit = t.direction === "credit";
  return (
    <Pressable testID={`wallet-tx-item-${t.id}`} onPress={onOpen} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 10, borderWidth: card ? 1 : 0, borderColor: colors.surfaceSubtle }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: credit ? "#ECFDF5" : "#FFF1F2" }}>
        <Icon name={credit ? "arrow-bottom-right" : "arrow-top-right"} size={16} color={credit ? "#059669" : "#F43F5E"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500", lineHeight: 19 }}>{t.note || t.kind}</Text>
        <Text style={{ color: SLATE400, fontSize: 11, marginTop: 2, textTransform: "capitalize" }}>{shortDate(t.created_at)} · {t.status}</Text>
      </View>
      <Text style={{ color: credit ? "#059669" : "#F43F5E", fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{credit ? "+" : "−"}{money(t.amount)}</Text>
    </Pressable>
  );
}

function WdRow({ w, onOpen }: { w: any; onOpen: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={`wd-item-${w.id}`} onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.surfaceSubtle, padding: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySubtle }}><Icon name="cash-multiple" size={16} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>WD-{String(w.id).slice(0, 6).toUpperCase()}</Text>
        <Text style={{ color: SLATE400, fontSize: 11 }}>{shortDate(w.requested_at || w.created_at)} · {String(w.method || "").toUpperCase()}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{money(w.amount)}</Text>
        <StatusBadge status={w.status} />
      </View>
    </Pressable>
  );
}

/* ── bottom sheet (DetailDrawer mobile) ── */
function Sheet({ open, onClose, title, subtitle, children, testID }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View testID={testID} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "90%" }}>
          <View style={{ alignSelf: "center", height: 6, width: 48, borderRadius: 3, backgroundColor: colors.border, marginTop: 12 }} />
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }} numberOfLines={1}>{title}</Text>
              {subtitle ? <Text style={{ color: SLATE400, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <Pressable testID="drawer-close" onPress={onClose} style={{ width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={16} color={SLATE400} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}

const Btn = ({ title, onPress, outline, disabled, testID, flex = true, small }: { title: string; onPress?: () => void; outline?: boolean; disabled?: boolean; testID?: string; flex?: boolean; small?: boolean }) => {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={disabled} style={{ flex: flex ? 1 : undefined, height: small ? 40 : 44, paddingHorizontal: 16, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: outline ? "transparent" : colors.primary, borderWidth: outline ? 1 : 0, borderColor: colors.border, opacity: disabled ? 0.5 : 1 }}>
      <Text style={{ color: outline ? colors.textSecondary : "#fff", fontWeight: "600", fontSize: 14 }}>{title}</Text>
    </Pressable>
  );
};

export default function PartnerWallet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState("overview");
  const [txq, setTxq] = useState("");
  const [dir, setDir] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<any>(null);
  const [wdDetail, setWdDetail] = useState<any>(null);
  const [flow, setFlow] = useState(false);

  const wallet = useQuery({ queryKey: ["partner-wallet"], queryFn: () => api.get<any>("/partner/wallet") });
  const cfgQ = useQuery({ queryKey: ["partner-wallet-config"], queryFn: () => api.get<any>("/partner/wallet/config") });
  const wdQ = useQuery({ queryKey: ["partner-withdrawals"], queryFn: () => api.get<any>("/partner/withdrawals") });
  const kycQ = useQuery({ queryKey: ["partner-fkyc"], queryFn: () => api.get<any>("/partner/finance-kyc") });

  const s = wallet.data || {};
  const cfg = cfgQ.data || {};
  const wds: any[] = Array.isArray(wdQ.data) ? wdQ.data : wdQ.data?.withdrawals || [];
  const k = kycQ.data || {};
  const banks: any[] = k.banks || [];
  const fin = { eligible: !!k.eligible, blockers: k.blockers || [], banks, primary_bank: banks.find((b) => b.is_primary) || banks.find((b) => b.status === "approved") || null };
  const eligible = fin.eligible;
  const ledger: any[] = s.ledger || [];

  const trend = useMemo(() => {
    if (!ledger.length) return null;
    const now = new Date(); const cur = monthKey(now.toISOString());
    const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
    let c = 0, p = 0;
    ledger.forEach((l) => { if (l.direction !== "credit") return; const m = monthKey(l.created_at); if (m === cur) c += l.amount; else if (m === prev) p += l.amount; });
    if (!p) return c > 0 ? 100 : null;
    return Math.round(((c - p) / p) * 100);
  }, [ledger]);

  const PAGE = 10;
  const tx = useMemo(() => {
    let items = ledger.slice();
    if (txq) { const q = txq.toLowerCase(); items = items.filter((t) => (t.note || "").toLowerCase().includes(q) || (t.kind || "").toLowerCase().includes(q) || (t.ref_id || "").toLowerCase().includes(q)); }
    if (dir) items = items.filter((t) => t.direction === dir);
    const total = items.length; const pages = Math.max(1, Math.ceil(total / PAGE)); const pg = Math.min(page, pages);
    return { items: items.slice((pg - 1) * PAGE, pg * PAGE), total, pages, page: pg };
  }, [ledger, txq, dir, page]);

  const reload = () => ["partner-wallet", "partner-wallet-config", "partner-withdrawals", "partner-fkyc"].forEach((key) => qc.invalidateQueries({ queryKey: [key] }));
  const gotoKyc = () => router.push("/partner/payouts");
  const startWithdraw = () => { if (!eligible) { gotoKyc(); toast.info("Complete Bank & KYC verification first"); } else setFlow(true); };
  const recentTx = ledger.slice(0, 6);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView
        testID="wallet-module"
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={wallet.isFetching && !wallet.isLoading} onRefresh={reload} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        {wallet.isLoading ? (
          <>
            <Surface style={{ padding: 24 }}><View style={{ height: 160, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} /></Surface>
            <View style={{ flexDirection: "row", gap: 12 }}>{[0, 1].map((i) => <Surface key={i} style={{ flex: 1, padding: 20 }}><View style={{ height: 40, width: 40, borderRadius: 12, backgroundColor: colors.surfaceSubtle }} /><View style={{ height: 12, width: 80, borderRadius: 6, backgroundColor: colors.surfaceSubtle, marginTop: 16 }} /><View style={{ height: 24, width: 96, borderRadius: 6, backgroundColor: colors.surfaceSubtle, marginTop: 8 }} /></Surface>)}</View>
          </>
        ) : (
          <>
            {/* HERO */}
            <LinearGradient colors={[colors.primary, "#0f52ba", "#0a2e6b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, overflow: "hidden", boxShadow: "0px 16px 32px rgba(13,71,161,0.25)", elevation: 6 }}>
              <View style={{ position: "absolute", right: -64, top: -64, width: 224, height: 224, borderRadius: 112, backgroundColor: "rgba(255,255,255,0.1)" }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="wallet-outline" size={16} color="#BFDBFE" />
                <Text style={{ color: "#BFDBFE", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 2.2 }}>Available Balance</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                <Text testID="wallet-balance" style={{ color: "#fff", fontSize: 36, fontWeight: "800", fontVariant: ["tabular-nums"], lineHeight: 42 }}>{money(s.withdrawable_balance)}</Text>
                {trend != null ? (
                  <View style={{ marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: trend >= 0 ? "rgba(52,211,153,0.2)" : "rgba(251,113,133,0.2)" }}>
                    <Text style={{ color: trend >= 0 ? "#D1FAE5" : "#FFE4E6", fontSize: 12, fontWeight: "700" }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% <Text style={{ fontWeight: "400", opacity: 0.8 }}>this month</Text></Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}>
                {[["Withdrawable", s.withdrawable_balance], ["Pending", s.pending_balance], ["Withdrawn", s.total_withdrawn]].map(([kk, v]) => (
                  <View key={String(kk)} style={{ flex: 1, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", paddingHorizontal: 12, paddingVertical: 10 }}>
                    <Text style={{ color: "#BFDBFE", fontSize: 9, textTransform: "uppercase", letterSpacing: 0.3 }} numberOfLines={1} adjustsFontSizeToFit>{kk}</Text>
                    <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }} numberOfLines={1}>{money(v)}</Text>
                  </View>
                ))}
              </View>
              <Pressable testID="withdraw-btn" onPress={startWithdraw} style={{ marginTop: 24, height: 48, borderRadius: 16, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, boxShadow: "0px 8px 20px rgba(0,0,0,0.15)", elevation: 4 }}>
                <Icon name="cash" size={20} color={colors.primaryDark} /><Text style={{ color: colors.primaryDark, fontWeight: "700", fontSize: 16 }}>Withdraw Money</Text>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 }}>
                <Icon name="shield-check-outline" size={16} color="#BFDBFE" /><Text style={{ color: "#BFDBFE", fontSize: 12 }}>Secured payouts to your verified account</Text>
              </View>
            </LinearGradient>

            {/* KYC blocker */}
            {!eligible ? (
              <Surface testID="wallet-kyc-blocker" style={{ padding: 16, borderColor: "#FDE68A", backgroundColor: "rgba(255,251,235,0.6)" }}>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" }}><Icon name="alert-outline" size={20} color="#D97706" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600" }}>Complete Bank & KYC to withdraw</Text>
                    <Text style={{ color: "#B45309", fontSize: 14, marginTop: 2 }}>Pending: {fin.blockers.join(", ") || "verification"}</Text>
                  </View>
                </View>
                <Pressable testID="wallet-complete-kyc" onPress={gotoKyc} style={{ marginTop: 12, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>Complete Bank & KYC</Text></Pressable>
              </Surface>
            ) : null}

            {/* KPI grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
              <KpiCard icon="trending-up" tone="emerald" label="Total Earned" value={money(s.total_earned)} sub="Lifetime earnings" trend={trend} testID="kpi-total-earned" />
              <KpiCard icon="gift-outline" tone="primary" label="Incentives" value={money(s.total_incentive)} sub="Bonuses & rewards" testID="kpi-incentives" />
              <KpiCard icon="clock-outline" tone="amber" label="Processing" value={money(s.pending_balance)} sub="Locked in withdrawals" testID="kpi-processing" />
            </View>

            <SegTabs tabs={["overview", "transactions", "withdrawals"]} value={tab} onChange={setTab} />

            {tab === "overview" ? (
              <>
                <Surface style={{ padding: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="receipt-text-outline" size={16} color={colors.secondary} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Recent Activity</Text></View>
                    <Pressable onPress={() => setTab("transactions")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: colors.secondary, fontSize: 12, fontWeight: "600" }}>View all</Text><Icon name="arrow-right" size={12} color={colors.secondary} /></Pressable>
                  </View>
                  {recentTx.length === 0 ? <KitEmpty icon="receipt-text-outline" title="No activity yet" desc="Your wallet credits and debits will appear here." testID="wallet-overview-empty" /> : (
                    <View style={{ gap: 4 }}>{recentTx.map((t) => <TxRow key={t.id} t={t} onOpen={() => setDetail(t)} />)}</View>
                  )}
                </Surface>
                <Surface style={{ padding: 20 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Icon name="cash" size={16} color={colors.secondary} /><Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Recent Withdrawals</Text></View>
                    <Pressable onPress={() => setTab("withdrawals")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Text style={{ color: colors.secondary, fontSize: 12, fontWeight: "600" }}>View all</Text><Icon name="arrow-right" size={12} color={colors.secondary} /></Pressable>
                  </View>
                  {wds.length === 0 ? (
                    <KitEmpty icon="cash" title="No withdrawals yet" desc="Withdraw your earnings to your verified account." testID="wallet-wd-empty" action={<Btn title="Withdraw Money" onPress={startWithdraw} flex={false} small />} />
                  ) : (
                    <View style={{ gap: 8 }}>{wds.slice(0, 5).map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</View>
                  )}
                </Surface>
              </>
            ) : null}

            {tab === "transactions" ? (
              <Surface style={{ padding: 16 }}>
                <View style={{ gap: 8, marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, backgroundColor: colors.surface }}>
                    <Icon name="magnify" size={16} color={SLATE400} />
                    <TextInput testID="wallet-tx-search" value={txq} onChangeText={(v) => { setTxq(v); setPage(1); }} placeholder="Search description, reference…" placeholderTextColor={SLATE400} style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 14 }} />
                  </View>
                  <View style={{ flexDirection: "row", gap: 6 }}>
                    {[["", "All types"], ["credit", "Credit"], ["debit", "Debit"]].map(([v, l]) => (
                      <Pressable key={v} testID={`wallet-tx-direction-${v || "all"}`} onPress={() => { setDir(v); setPage(1); }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: dir === v ? colors.primary : colors.border, backgroundColor: dir === v ? colors.primarySubtle : colors.surface, alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ color: dir === v ? colors.primary : colors.textSecondary, fontSize: 13, fontWeight: "600" }}>{l}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {tx.items.length === 0 ? <KitEmpty icon="receipt-text-outline" title="No transactions found" desc="Try adjusting your search or filters." testID="wallet-tx-empty" /> : (
                  <>
                    <View style={{ gap: 8 }}>{tx.items.map((t) => <TxRow key={t.id} t={t} onOpen={() => setDetail(t)} card />)}</View>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.surfaceSubtle }}>
                      <Text testID="pagination-info" style={{ color: colors.textMuted, fontSize: 12 }}>Showing <Text style={{ fontWeight: "700", color: colors.textSecondary }}>{(tx.page - 1) * PAGE + 1}–{Math.min(tx.page * PAGE, tx.total)}</Text> of <Text style={{ fontWeight: "700", color: colors.textSecondary }}>{tx.total}</Text></Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Pressable testID="page-prev" disabled={tx.page <= 1} onPress={() => setPage(tx.page - 1)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: tx.page <= 1 ? 0.4 : 1 }}><Icon name="chevron-left" size={16} color={colors.textSecondary} /></Pressable>
                        <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "600", paddingHorizontal: 8 }}>{tx.page} / {tx.pages}</Text>
                        <Pressable testID="page-next" disabled={tx.page >= tx.pages} onPress={() => setPage(tx.page + 1)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: tx.page >= tx.pages ? 0.4 : 1 }}><Icon name="chevron-right" size={16} color={colors.textSecondary} /></Pressable>
                      </View>
                    </View>
                  </>
                )}
              </Surface>
            ) : null}

            {tab === "withdrawals" ? (
              <Surface style={{ padding: 16 }}>
                {wds.length === 0 ? (
                  <KitEmpty icon="cash" title="No withdrawals yet" desc="Your withdrawal history will appear here." testID="wallet-wd-empty2" action={<Btn title="Withdraw Money" onPress={startWithdraw} flex={false} small />} />
                ) : <View style={{ gap: 8 }}>{wds.map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</View>}
              </Surface>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Transaction detail */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title="Transaction details" subtitle={detail?.note} testID="wallet-tx-drawer">
        {detail ? (
          <View style={{ gap: 20 }}>
            <View style={{ borderRadius: 16, padding: 16, alignItems: "center", backgroundColor: detail.direction === "credit" ? "#ECFDF5" : "#FFF1F2" }}>
              <Text style={{ color: detail.direction === "credit" ? "#059669" : "#F43F5E", fontSize: 30, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{detail.direction === "credit" ? "+" : "−"}{money(detail.amount)}</Text>
              <View style={{ marginTop: 8 }}><StatusBadge status={detail.status} /></View>
            </View>
            <View>
              <KV k="Reference ID" v={detail.ref_id || String(detail.id).slice(0, 10).toUpperCase()} mono />
              <KV k="Date" v={shortDate(detail.created_at)} />
              <KV k="Type" v={String(detail.kind || "").replace(/^\w/, (m: string) => m.toUpperCase())} />
              <KV k="Direction" v={String(detail.direction || "").replace(/^\w/, (m: string) => m.toUpperCase())} />
              <KV k="Amount" v={money(detail.amount)} strong />
            </View>
          </View>
        ) : null}
      </Sheet>

      {/* Withdrawal detail */}
      <Sheet open={!!wdDetail} onClose={() => setWdDetail(null)} title="Withdrawal details" subtitle={wdDetail ? `WD-${String(wdDetail.id).slice(0, 6).toUpperCase()}` : ""} testID="wallet-wd-drawer">
        {wdDetail ? (
          <View style={{ gap: 20 }}>
            <View style={{ borderRadius: 16, padding: 16, alignItems: "center", backgroundColor: colors.primarySubtle }}>
              <Text style={{ color: colors.primary, fontSize: 30, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{money(wdDetail.amount)}</Text>
              <View style={{ marginTop: 8 }}><StatusBadge status={wdDetail.status} /></View>
            </View>
            <View>
              <KV k="Withdrawal ID" v={`WD-${String(wdDetail.id).slice(0, 6).toUpperCase()}`} mono />
              <KV k="Requested" v={shortDate(wdDetail.requested_at)} />
              <KV k="Method" v={String(wdDetail.method || "").toUpperCase()} />
              <KV k="Account" v={wdDetail.bank?.bank_name || (wdDetail.method === "upi" ? wdDetail.upi_id : "—")} />
              {wdDetail.bank?.account_number ? <KV k="A/C number" v={"••••" + String(wdDetail.bank.account_number).slice(-4)} mono /> : null}
              <KV k="Amount" v={money(wdDetail.amount)} />
              <KV k="Processing fee" v={"−" + money(wdDetail.fee || 0)} />
              <KV k="Net payable" v={money(wdDetail.net_amount ?? wdDetail.amount)} strong />
              {wdDetail.status === "rejected" && wdDetail.reason ? <KV k="Reason" v={<Text style={{ color: "#F43F5E", fontSize: 14 }}>{wdDetail.reason}</Text>} /> : null}
            </View>
            <View>
              <Text style={{ color: SLATE400, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 }}>Timeline</Text>
              {[
                { title: "Request submitted", time: shortDate(wdDetail.requested_at), done: true },
                { title: "Under review", done: wdDetail.status !== "pending", active: wdDetail.status === "pending" },
                { title: wdDetail.status === "rejected" ? "Rejected" : wdDetail.status === "failed" ? "Failed" : "Completed", time: wdDetail.processed_at ? shortDate(wdDetail.processed_at) : "", done: ["completed", "rejected", "failed"].includes(wdDetail.status) },
              ].map((st, i, arr) => (
                <View key={i} style={{ flexDirection: "row", gap: 12, paddingBottom: i < arr.length - 1 ? 16 : 0 }}>
                  <View style={{ alignItems: "center" }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: st.done ? "#10B981" : st.active ? colors.secondary : "#CBD5E1", marginTop: 2 }} />
                    {i < arr.length - 1 ? <View style={{ width: 1, flex: 1, backgroundColor: colors.border, marginTop: 4 }} /> : null}
                  </View>
                  <View>
                    <Text style={{ color: st.done || st.active ? colors.text : SLATE400, fontSize: 14, fontWeight: "600" }}>{st.title}</Text>
                    {st.time ? <Text style={{ color: SLATE400, fontSize: 11, marginTop: 2 }}>{st.time}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Sheet>

      {flow ? <WithdrawFlow s={s} cfg={cfg} fin={fin} onClose={() => setFlow(false)} onDone={() => { setFlow(false); reload(); setTab("withdrawals"); }} onAddBank={() => { setFlow(false); gotoKyc(); }} /> : null}
    </View>
  );
}

/* ── multi-step withdraw (web WithdrawFlow) ── */
function WithdrawFlow({ s, cfg, fin, onClose, onDone, onAddBank }: { s: any; cfg: any; fin: any; onClose: () => void; onDone: () => void; onAddBank: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const banks: any[] = (fin.banks || []).filter((b: any) => b.status === "approved");
  const [step, setStep] = useState(1);
  const [amount, setAmount] = useState("");
  const [bankId, setBankId] = useState(fin.primary_bank?.id || banks[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const amt = Number(amount) || 0;
  const min = cfg.min_withdrawal || 100, max = cfg.max_withdrawal || 50000;
  const maxAllowed = Math.min(max, s.withdrawable_balance || 0);
  const fee = Math.round((amt * (cfg.processing_fee_pct || 0) / 100 + (cfg.processing_fee_flat || 0)) * 100) / 100;
  const net = Math.max(0, amt - fee);
  const bank = banks.find((b) => b.id === bankId) || fin.primary_bank || {};
  const masked = bank.account_number ? "••••" + String(bank.account_number).slice(-4) : "";
  const destLabel = `${bank.bank_name || "Bank"} ${masked}`;
  const amtError = amt > 0 && amt < min ? `Minimum ₹${min}` : amt > maxAllowed ? `Max ${money(maxAllowed)}` : "";

  const submit = async () => {
    setBusy(true);
    try {
      const data = await api.post<any>("/partner/withdrawals", { amount: amt, method: "bank", upi_id: "", bank });
      setResult(data); setStep(5); toast.success("Withdrawal request submitted");
    } catch (e: any) { toast.error(e?.detail || "Withdrawal failed"); } finally { setBusy(false); }
  };

  const H = ({ t, sub }: { t: string; sub?: string }) => (<><Text style={{ color: colors.text, fontSize: 20, fontWeight: "700" }}>{t}</Text>{sub ? <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>{sub}</Text> : null}</>);

  return (
    <Sheet open onClose={onClose} title={step === 5 ? "Withdrawal" : "Withdraw Money"} testID="withdraw-flow">
      {step < 5 ? (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 20 }}>
          {[1, 2, 3, 4].map((n) => <View key={n} style={{ height: 6, borderRadius: 3, width: n === step ? 24 : 12, backgroundColor: n === step ? colors.secondary : n < step ? "#60A5FA" : colors.border }} />)}
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <H t="Enter amount" sub={`Available ${money(s.withdrawable_balance)} · Min ${money(min)} · Max ${money(max)}`} />
          <View style={{ marginTop: 16, flexDirection: "row", alignItems: "center", height: 64, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16 }}>
            <Text style={{ color: SLATE400, fontSize: 24, fontWeight: "700" }}>₹</Text>
            <TextInput testID="withdraw-amount" value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9]/g, ""))} placeholder="0" placeholderTextColor={SLATE400} keyboardType="number-pad" autoFocus style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 30, fontWeight: "800" }} />
          </View>
          {amtError ? <Text testID="withdraw-amount-error" style={{ color: "#F43F5E", fontSize: 12, marginTop: 6 }}>{amtError}</Text> : null}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            {[500, 1000, 2000, 5000].map((q) => (
              <Pressable key={q} testID={`withdraw-quick-${q}`} disabled={q > maxAllowed} onPress={() => setAmount(String(q))} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: q > maxAllowed ? 0.4 : 1 }}><Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>₹{q >= 1000 ? q / 1000 + "k" : q}</Text></Pressable>
            ))}
            <Pressable testID="withdraw-quick-max" onPress={() => setAmount(String(Math.floor(maxAllowed)))} style={{ flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.primary, fontSize: 12, fontWeight: "700" }}>Max</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}><Btn title="Cancel" outline onPress={onClose} /><Btn title="Continue" testID="withdraw-next-1" disabled={!amt || !!amtError} onPress={() => setStep(2)} /></View>
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <H t="Select payout method" sub="Money will be sent to your verified bank account." />
          {banks.length > 0 ? (
            <View style={{ gap: 8, marginTop: 16 }}>
              {banks.map((b) => {
                const on = bankId === b.id;
                return (
                  <Pressable key={b.id} testID={`withdraw-bank-${b.id}`} onPress={() => setBankId(b.id)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, borderWidth: on ? 2 : 1, borderColor: on ? colors.secondary : colors.border, backgroundColor: on ? "rgba(239,246,255,0.5)" : "transparent", padding: 14 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bank-outline" size={20} color={colors.primary} /></View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ color: colors.text, fontWeight: "600", fontSize: 15 }} numberOfLines={1}>{b.bank_name}</Text>{b.is_primary ? <View style={{ backgroundColor: "#DBEAFE", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}><Text style={{ color: colors.primary, fontSize: 9, fontWeight: "700" }}>PRIMARY</Text></View> : null}</View>
                      <Text style={{ color: colors.textMuted, fontSize: 12 }}>••••{String(b.account_number).slice(-4)} · {b.ifsc}</Text>
                    </View>
                    {on ? <Icon name="check-circle-outline" size={20} color={colors.secondary} /> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <View testID="withdraw-no-bank" style={{ marginTop: 16, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: "#CBD5E1", padding: 20, alignItems: "center" }}>
              <Icon name="bank-outline" size={24} color={SLATE400} />
              <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: "600", marginTop: 8 }}>No verified bank account available.</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: "center" }}>Add and verify a bank account to receive your payouts.</Text>
              <View style={{ marginTop: 12 }}><Btn title="Add Bank Account" testID="withdraw-add-bank" onPress={onAddBank} flex={false} small /></View>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}><Btn title="Back" outline onPress={() => setStep(1)} /><Btn title="Review" testID="withdraw-next-2" disabled={!bankId} onPress={() => setStep(3)} /></View>
        </View>
      ) : null}

      {step === 3 ? (
        <View>
          <H t="Review withdrawal" />
          <View style={{ borderRadius: 16, backgroundColor: colors.surfaceSubtle, padding: 16, marginTop: 16 }}>
            <KV k="Withdrawal amount" v={money(amt)} />
            <KV k="Processing fee" v={"−" + money(fee)} />
            <KV k="Net amount" v={money(net)} strong />
            <KV k="Payout to" v={destLabel} />
            <KV k="Expected processing" v="1–2 business days" />
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 24 }}><Btn title="Back" outline onPress={() => setStep(2)} /><Btn title="Confirm" testID="withdraw-next-3" onPress={() => setStep(4)} /></View>
        </View>
      ) : null}

      {step === 4 ? (
        <View style={{ alignItems: "center" }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="shield-check-outline" size={28} color={colors.primary} /></View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700", marginTop: 16 }}>Confirm withdrawal</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4, textAlign: "center", lineHeight: 20 }}>You are about to withdraw <Text style={{ color: colors.text, fontWeight: "700" }}>{money(amt)}</Text> to {destLabel}. This can’t be undone once submitted.</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 24, width: "100%" }}><Btn title="Back" outline onPress={() => setStep(3)} /><Btn title={busy ? "Submitting…" : "Confirm & Submit"} testID="withdraw-submit" disabled={busy} onPress={submit} /></View>
        </View>
      ) : null}

      {step === 5 && result ? (
        <View testID="withdraw-success" style={{ alignItems: "center", paddingVertical: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#ECFDF5", alignItems: "center", justifyContent: "center" }}><Icon name="check-circle-outline" size={36} color="#059669" /></View>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "700", marginTop: 16 }}>Withdrawal submitted!</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 4 }}>Your request is now pending approval.</Text>
          <View style={{ borderRadius: 16, backgroundColor: colors.surfaceSubtle, padding: 16, marginTop: 16, width: "100%" }}>
            <KV k="Withdrawal ID" v={`WD-${String(result.id || "").slice(0, 6).toUpperCase()}`} mono />
            <KV k="Amount" v={money(result.amount)} strong />
            <KV k="Payout to" v={destLabel} />
            <KV k="Expected arrival" v="1–2 business days" />
          </View>
          <View style={{ marginTop: 20, width: "100%" }}><Btn title="Done" onPress={onDone} /></View>
        </View>
      ) : null}
    </Sheet>
  );
}
