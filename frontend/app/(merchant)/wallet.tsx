import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, RefreshControl, Modal, TextInput, Platform, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Card, Badge, EmptyState, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon, MdiName } from "@/src/components/Icon";
import { fmt, fmtDate } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";
import { MPagination } from "@/src/components/merchant/ReferralShared";

const money = (n: any) => fmt(n);
const shortDate = (s?: string) => fmtDate(s);
const wdId = (id: string) => "WD-" + (id || "").slice(0, 6).toUpperCase();
const monthKey = (s?: string) => (s || "").slice(0, 7);
type Tab = "overview" | "transactions" | "withdrawals";

/* Bottom sheet used for tx / withdrawal detail. */
function Sheet({ open, onClose, title, subtitle, children, testID }: { open: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View testID={testID} style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, maxHeight: "82%" }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>{title}</Text>
              {subtitle ? <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }} numberOfLines={1}>{subtitle}</Text> : null}
            </View>
            <Pressable testID="sheet-close" onPress={onClose} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function KV({ k, v, strong }: { k: string; v: any; strong?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{k}</Text>
      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: strong ? "900" : "700" }}>{v}</Text>
    </View>
  );
}

function TxRow({ t, onOpen }: { t: any; onOpen: () => void }) {
  const { colors } = useTheme();
  const credit = t.direction === "credit";
  return (
    <Pressable testID={`wallet-tx-item-${t.id}`} onPress={onOpen} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: credit ? colors.successSubtle : colors.dangerSubtle, alignItems: "center", justifyContent: "center" }}>
        <Icon name={credit ? "arrow-bottom-left" : "arrow-top-right"} size={18} color={credit ? colors.success : colors.danger} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{t.note || t.kind}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{shortDate(t.created_at)} · {t.status}</Text>
      </View>
      <Text style={{ color: credit ? colors.success : colors.danger, fontWeight: "900", fontSize: fontSize.sm }}>{credit ? "+" : "−"}{money(t.amount)}</Text>
    </Pressable>
  );
}

function WdRow({ w, onOpen }: { w: any; onOpen: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={`wd-item-${w.id}`} onPress={onOpen} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
        <Icon name="bank-transfer-out" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>{wdId(w.id)}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{shortDate(w.requested_at)} · {(w.method || "").toUpperCase()}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={{ color: colors.text, fontWeight: "900", fontSize: fontSize.sm }}>{money(w.amount)}</Text>
        <Badge label={w.status} tone={statusTone(w.status)} />
      </View>
    </Pressable>
  );
}

export default function MerchantWallet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>("overview");
  const [txq, setTxq] = useState("");
  const [txDir, setTxDir] = useState("");
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(10);
  const [detail, setDetail] = useState<any>(null);
  const [wdDetail, setWdDetail] = useState<any>(null);
  const [flow, setFlow] = useState(false);

  const ovQ = useQuery({ queryKey: ["m-wallet-overview"], queryFn: () => api.get<any>("/merchant/panel/wallet/overview") });
  const wdsQ = useQuery({ queryKey: ["m-wallet-withdrawals"], queryFn: () => api.get<any[]>("/merchant/panel/wallet/withdrawals") });
  const txQ = useQuery({
    queryKey: ["m-wallet-tx", tab, txq, txDir, txPage, txPageSize],
    queryFn: () => api.get<any>(`/merchant/panel/wallet/transactions?q=${encodeURIComponent(txq)}&direction=${txDir}&page=${txPage}&page_size=${txPageSize}`),
    enabled: tab === "transactions",
  });

  useEffect(() => { setTxPage(1); }, [txq, txDir, txPageSize]);

  const ov = ovQ.data;
  const s = ov?.summary || {};
  const cfg = ov?.config || {};
  const fin = ov?.finance || { eligible: false, blockers: [], banks: [], primary_bank: null };
  const eligible = !!fin.eligible;
  const ledger: any[] = s.ledger || [];
  const wds: any[] = wdsQ.data || [];
  const tx = txQ.data || { items: [], total: 0, page: 1, pages: 1 };

  const trend = useMemo(() => {
    if (!ledger.length) return null;
    const now = new Date(); const cur = monthKey(now.toISOString());
    const prev = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString());
    let c = 0, p = 0;
    ledger.forEach((l) => { if (l.direction !== "credit") return; const m = monthKey(l.created_at); if (m === cur) c += l.amount; else if (m === prev) p += l.amount; });
    if (!p) return c > 0 ? 100 : null;
    return Math.round(((c - p) / p) * 100);
  }, [ledger]);

  const startWithdraw = () => { if (!eligible) { toast.info("Complete Bank & KYC verification first"); router.push("/merchant/payouts"); return; } setFlow(true); };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["m-wallet-overview"] }); qc.invalidateQueries({ queryKey: ["m-wallet-withdrawals"] }); if (tab === "transactions") txQ.refetch(); };

  const kpis: { icon: MdiName; label: string; value: string; sub: string; bg: string; fg: string }[] = [
    { icon: "trending-up", label: "Total Earned", value: money(s.total_earned), sub: "Lifetime earnings", bg: colors.successSubtle, fg: colors.success },
    { icon: "wallet", label: "Commission", value: money((s.total_referral || 0) + (s.total_customer || 0)), sub: "Referral + booking", bg: colors.primarySubtle, fg: colors.primary },
    { icon: "clock-outline", label: "Processing", value: money(s.pending_balance), sub: "Locked in withdrawals", bg: colors.warningSubtle, fg: colors.warning },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Wallet" subtitle="Commission & withdrawals" variant="gradient" testID="merchant-wallet-header" />
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={ovQ.isFetching} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
        testID="wallet-module"
      >
        {ovQ.isLoading ? <CardSkeleton /> : (
          <>
            {/* HERO */}
            <LinearGradient colors={["#0f52ba", "#0D47A1", "#0a2e6b"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: spacing.lg }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Icon name="wallet" size={15} color="#BFDBFE" />
                <Text style={{ color: "#BFDBFE", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1.5 }}>Available Balance</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 4 }}>
                <Text testID="wallet-balance" style={{ color: "#fff", fontSize: 40, fontWeight: "900" }}>{money(s.available_balance)}</Text>
                {trend != null ? (
                  <View style={{ marginBottom: 8, backgroundColor: trend >= 0 ? "rgba(52,211,153,0.2)" : "rgba(251,113,133,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill }}>
                    <Text style={{ color: trend >= 0 ? "#D1FAE5" : "#FECDD3", fontSize: 11, fontWeight: "800" }}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                {[["Withdrawable", s.withdrawable_balance], ["Pending", s.pending_balance], ["Withdrawn", s.total_withdrawn]].map(([k, v]) => (
                  <View key={k as string} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <Text style={{ color: "#BFDBFE", fontSize: 9, fontWeight: "700", textTransform: "uppercase" }}>{k as string}</Text>
                    <Text style={{ color: "#fff", fontSize: fontSize.sm, fontWeight: "800", marginTop: 2 }} numberOfLines={1}>{money(v)}</Text>
                  </View>
                ))}
              </View>
              <Pressable testID="withdraw-btn" onPress={startWithdraw} style={({ pressed }) => ({ marginTop: spacing.lg, height: 48, borderRadius: radius.lg, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <Icon name="bank-transfer-out" size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: fontSize.md, fontWeight: "900" }}>Withdraw Money</Text>
              </Pressable>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, justifyContent: "center" }}>
                <Icon name="shield-check" size={13} color="#BFDBFE" />
                <Text style={{ color: "#BFDBFE", fontSize: 11 }}>Secured payouts to your verified bank account</Text>
              </View>
            </LinearGradient>

            {/* KYC blocker */}
            {!eligible ? (
              <Pressable testID="wallet-kyc-blocker" onPress={() => router.push("/merchant/payouts")}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.warningSubtle, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.lg, padding: spacing.md }}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: "rgba(217,119,6,0.15)", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="alert" size={20} color={colors.warning} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>Complete Bank & KYC to withdraw</Text>
                    <Text style={{ color: colors.warning, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={2}>Pending: {(fin.blockers || []).join(", ") || "verification"}</Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={colors.textMuted} />
                </View>
              </Pressable>
            ) : null}

            {/* KPI grid */}
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              {kpis.map((k) => (
                <View key={k.label} style={{ flex: 1 }}>
                  <Card padded={false} style={{ padding: spacing.md }} testID={`kpi-${k.label}`}>
                    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: k.bg, alignItems: "center", justifyContent: "center" }}>
                      <Icon name={k.icon} size={16} color={k.fg} />
                    </View>
                    <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "900", marginTop: 8 }} numberOfLines={1}>{k.value}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "700", marginTop: 1 }} numberOfLines={1}>{k.label}</Text>
                  </Card>
                </View>
              ))}
            </View>

            {/* SegTabs */}
            <View style={{ flexDirection: "row", gap: 6, backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: 4 }}>
              {(["overview", "transactions", "withdrawals"] as Tab[]).map((t) => {
                const on = tab === t;
                return (
                  <Pressable key={t} testID={`wallet-tab-${t}`} onPress={() => setTab(t)} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center", backgroundColor: on ? colors.surface : "transparent" }}>
                    <Text style={{ color: on ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: "800", textTransform: "capitalize" }}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* OVERVIEW */}
            {tab === "overview" ? (
              <>
                <Card padded={false} style={{ padding: spacing.lg }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="receipt" size={16} color={colors.primary} /><Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "800" }}>Recent Activity</Text></View>
                    <Pressable testID="wallet-view-all-tx" onPress={() => setTab("transactions")} hitSlop={8}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>View all</Text></Pressable>
                  </View>
                  {ledger.length === 0 ? <EmptyState icon="receipt-text-outline" title="No activity yet" subtitle="Your wallet credits and debits will appear here." /> : (
                    ledger.slice(0, 6).map((t, i) => (
                      <View key={t.id || i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}><TxRow t={t} onOpen={() => setDetail(t)} /></View>
                    ))
                  )}
                </Card>
                <Card padded={false} style={{ padding: spacing.lg }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Icon name="bank-transfer-out" size={16} color={colors.primary} /><Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: "800" }}>Recent Withdrawals</Text></View>
                    <Pressable testID="wallet-view-all-wd" onPress={() => setTab("withdrawals")} hitSlop={8}><Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>View all</Text></Pressable>
                  </View>
                  {wds.length === 0 ? <EmptyState icon="bank-outline" title="No withdrawals yet" subtitle="Withdraw your earnings to your verified bank account." /> : (
                    <View style={{ gap: spacing.sm }}>{wds.slice(0, 5).map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</View>
                  )}
                </Card>
              </>
            ) : null}

            {/* TRANSACTIONS */}
            {tab === "transactions" ? (
              <Card padded={false} style={{ padding: spacing.lg }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 44 }}>
                  <Icon name="magnify" size={20} color={colors.textMuted} />
                  <TextInput testID="wallet-tx-search" value={txq} onChangeText={setTxq} placeholder="Search description, reference…" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: fontSize.sm }} />
                </View>
                <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.md }}>
                  {[["", "All"], ["credit", "Credit"], ["debit", "Debit"]].map(([v, l]) => {
                    const on = txDir === v;
                    return (
                      <Pressable key={v as string} testID={`wallet-tx-dir-${v || "all"}`} onPress={() => setTxDir(v as string)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: on ? colors.primary : colors.surfaceSubtle }}>
                        <Text style={{ color: on ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{l as string}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ marginTop: spacing.sm }}>
                  {txQ.isLoading ? (
                    <View style={{ paddingVertical: 30, alignItems: "center" }}><ActivityIndicator color={colors.primary} /></View>
                  ) : (tx.items || []).length === 0 ? (
                    <EmptyState icon="receipt-text-outline" title="No transactions found" subtitle="Try adjusting your search or filters." />
                  ) : (
                    <>
                      {tx.items.map((t: any, i: number) => (
                        <View key={t.id} testID={`wallet-tx-row-${t.id}`} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}><TxRow t={t} onOpen={() => setDetail(t)} /></View>
                      ))}
                      <View style={{ marginTop: spacing.md }}>
                        <MPagination page={tx.page || 1} pages={tx.pages || 1} total={tx.total || 0} pageSize={txPageSize} onPage={setTxPage} onPageSize={setTxPageSize} />
                      </View>
                    </>
                  )}
                </View>
              </Card>
            ) : null}

            {/* WITHDRAWALS */}
            {tab === "withdrawals" ? (
              <Card padded={false} style={{ padding: spacing.lg }} testID="withdrawal-history">
                {wds.length === 0 ? (
                  <EmptyState icon="bank-outline" title="No withdrawals yet" subtitle="Your withdrawal history will appear here." action="Withdraw Money" onAction={startWithdraw} />
                ) : (
                  <View style={{ gap: spacing.sm }}>{wds.map((w) => <WdRow key={w.id} w={w} onOpen={() => setWdDetail(w)} />)}</View>
                )}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Transaction detail */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title="Transaction details" subtitle={detail?.note} testID="wallet-tx-drawer">
        {detail ? (
          <View>
            <View style={{ borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", backgroundColor: detail.direction === "credit" ? colors.successSubtle : colors.dangerSubtle, marginBottom: spacing.md }}>
              <Text style={{ color: detail.direction === "credit" ? colors.success : colors.danger, fontSize: 30, fontWeight: "900" }}>{detail.direction === "credit" ? "+" : "−"}{money(detail.amount)}</Text>
              <View style={{ marginTop: 8 }}><Badge label={detail.status} tone={statusTone(detail.status)} /></View>
            </View>
            <KV k="Reference ID" v={detail.ref_id || (detail.id || "").slice(0, 10).toUpperCase()} />
            <KV k="Date" v={shortDate(detail.created_at)} />
            <KV k="Type" v={detail.kind} />
            <KV k="Direction" v={detail.direction} />
            <KV k="Amount" v={money(detail.amount)} strong />
            <KV k="Balance after" v={detail.balance != null ? money(detail.balance) : "—"} />
          </View>
        ) : null}
      </Sheet>

      {/* Withdrawal detail */}
      <Sheet open={!!wdDetail} onClose={() => setWdDetail(null)} title="Withdrawal details" subtitle={wdDetail ? wdId(wdDetail.id) : ""} testID="wallet-wd-drawer">
        {wdDetail ? (
          <View>
            <View style={{ borderRadius: radius.lg, padding: spacing.lg, alignItems: "center", backgroundColor: colors.primarySubtle, marginBottom: spacing.md }}>
              <Text style={{ color: colors.primary, fontSize: 30, fontWeight: "900" }}>{money(wdDetail.amount)}</Text>
              <View style={{ marginTop: 8 }}><Badge label={wdDetail.status} tone={statusTone(wdDetail.status)} /></View>
            </View>
            <KV k="Withdrawal ID" v={wdId(wdDetail.id)} />
            <KV k="Requested" v={shortDate(wdDetail.requested_at)} />
            <KV k="Method" v={(wdDetail.method || "").toUpperCase()} />
            <KV k="Bank" v={wdDetail.bank?.bank_name || (wdDetail.method === "upi" ? wdDetail.upi_id : "—")} />
            {wdDetail.bank?.account_number ? <KV k="Account" v={"••••" + String(wdDetail.bank.account_number).slice(-4)} /> : null}
            <KV k="Processing fee" v={"−" + money(wdDetail.fee || 0)} />
            <KV k="Net payable" v={money(wdDetail.net_amount ?? wdDetail.amount)} strong />
            {wdDetail.status === "rejected" && wdDetail.reason ? <KV k="Reason" v={wdDetail.reason} /> : null}
          </View>
        ) : null}
      </Sheet>

      {flow ? <WithdrawFlow ov={ov} cfg={cfg} fin={fin} onClose={() => setFlow(false)} onDone={() => { setFlow(false); refresh(); setTab("withdrawals"); }} /> : null}
    </View>
  );
}

/* ── Multi-step withdraw ── */
function WithdrawFlow({ ov, cfg, fin, onClose, onDone }: { ov: any; cfg: any; fin: any; onClose: () => void; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const s = ov?.summary || {};
  const banks = (fin.banks || []).filter((b: any) => b.status === "approved");
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
  const bank = banks.find((b: any) => b.id === bankId) || fin.primary_bank || {};
  const masked = bank.account_number ? "••••" + String(bank.account_number).slice(-4) : "";
  const amtError = amt > 0 && amt < min ? `Minimum ${money(min)}` : amt > maxAllowed ? `Max ${money(maxAllowed)}` : "";

  const submit = async () => {
    setBusy(true);
    try {
      const data = await api.post<any>("/merchant/panel/withdraw", { amount: amt, method: "bank", bank });
      setResult(data); setStep(5); toast.success("Withdrawal request submitted");
    } catch (e: any) { toast.error(e?.detail || "Withdrawal failed"); } finally { setBusy(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardProvider>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View testID="withdraw-flow" style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, maxHeight: "90%" }}>
            {step < 5 ? (
              <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.lg }}>
                {[1, 2, 3, 4].map((n) => <View key={n} style={{ height: 6, borderRadius: 3, width: n === step ? 28 : 14, backgroundColor: n <= step ? colors.primary : colors.surfaceSubtle }} />)}
              </View>
            ) : null}

            <ScrollView showsVerticalScrollIndicator={false}>
              {step === 1 ? (
                <View>
                  <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900" }}>Enter amount</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>Available {money(s.withdrawable_balance)} · Min {money(min)} · Max {money(max)}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, height: 60, marginTop: spacing.md }}>
                    <Text style={{ color: colors.textMuted, fontSize: 26, fontWeight: "900" }}>₹</Text>
                    <TextInput testID="withdraw-amount" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" autoFocus style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 26, fontWeight: "900" }} />
                  </View>
                  {amtError ? <Text testID="withdraw-amount-error" style={{ color: colors.danger, fontSize: fontSize.xs, marginTop: 6 }}>{amtError}</Text> : null}
                  <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.md }}>
                    {[500, 1000, 2000, 5000].map((q) => (
                      <Pressable key={q} disabled={q > maxAllowed} testID={`withdraw-quick-${q}`} onPress={() => setAmount(String(q))} style={{ flex: 1, height: 40, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", opacity: q > maxAllowed ? 0.4 : 1 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "800" }}>₹{q >= 1000 ? q / 1000 + "k" : q}</Text>
                      </Pressable>
                    ))}
                    <Pressable testID="withdraw-quick-max" onPress={() => setAmount(String(Math.floor(maxAllowed)))} style={{ flex: 1, height: 40, borderRadius: radius.md, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "900" }}>Max</Text>
                    </Pressable>
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                    <Pressable onPress={onClose} style={{ flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "800" }}>Cancel</Text></Pressable>
                    <Pressable disabled={!amt || !!amtError} testID="withdraw-next-1" onPress={() => setStep(banks.length ? 2 : 3)} style={{ flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: !amt || !!amtError ? 0.5 : 1 }}><Text style={{ color: "#fff", fontWeight: "800" }}>Continue</Text></Pressable>
                  </View>
                </View>
              ) : null}

              {step === 2 ? (
                <View>
                  <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900" }}>Select bank account</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>Money will be sent to your verified account.</Text>
                  <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                    {banks.map((b: any) => {
                      const on = bankId === b.id;
                      return (
                        <Pressable key={b.id} testID={`withdraw-bank-${b.id}`} onPress={() => setBankId(b.id)} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1.5, borderColor: on ? colors.primary : colors.border, borderRadius: radius.lg, padding: spacing.md, backgroundColor: on ? colors.primarySubtle : "transparent" }}>
                          <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="bank" size={20} color={colors.primary} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>{b.bank_name}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>••••{String(b.account_number).slice(-4)} · {b.ifsc}</Text>
                          </View>
                          {on ? <Icon name="check-circle" size={20} color={colors.primary} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                    <Pressable onPress={() => setStep(1)} style={{ flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "800" }}>Back</Text></Pressable>
                    <Pressable disabled={!bankId} testID="withdraw-next-2" onPress={() => setStep(3)} style={{ flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: !bankId ? 0.5 : 1 }}><Text style={{ color: "#fff", fontWeight: "800" }}>Review</Text></Pressable>
                  </View>
                </View>
              ) : null}

              {step === 3 ? (
                <View>
                  <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900" }}>Review withdrawal</Text>
                  <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md }}>
                    <KV k="Withdrawal amount" v={money(amt)} />
                    <KV k="Processing fee" v={"−" + money(fee)} />
                    <KV k="Net amount" v={money(net)} strong />
                    <KV k="Bank account" v={`${bank.bank_name || "—"} ${masked}`} />
                    <KV k="Expected processing" v="1–2 business days" />
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
                    <Pressable onPress={() => setStep(banks.length ? 2 : 1)} style={{ flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "800" }}>Back</Text></Pressable>
                    <Pressable testID="withdraw-next-3" onPress={() => setStep(4)} style={{ flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "800" }}>Confirm</Text></Pressable>
                  </View>
                </View>
              ) : null}

              {step === 4 ? (
                <View style={{ alignItems: "center" }}>
                  <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name="shield-check" size={28} color={colors.primary} /></View>
                  <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900", marginTop: spacing.md }}>Confirm withdrawal</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4, textAlign: "center" }}>You are about to withdraw <Text style={{ color: colors.text, fontWeight: "800" }}>{money(amt)}</Text> to {bank.bank_name} {masked}. This can't be undone once submitted.</Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, alignSelf: "stretch" }}>
                    <Pressable onPress={() => setStep(3)} style={{ flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.textSecondary, fontWeight: "800" }}>Back</Text></Pressable>
                    <Pressable testID="withdraw-submit" disabled={busy} onPress={submit} style={{ flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: busy ? 0.6 : 1 }}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Confirm & Submit</Text>}</Pressable>
                  </View>
                </View>
              ) : null}

              {step === 5 && result ? (
                <View style={{ alignItems: "center", paddingVertical: 6 }} testID="withdraw-success">
                  <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.successSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="check-circle" size={36} color={colors.success} /></View>
                  <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "900", marginTop: spacing.md }}>Withdrawal submitted!</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 4 }}>Your request is now pending approval.</Text>
                  <View style={{ backgroundColor: colors.surfaceSubtle, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, alignSelf: "stretch" }}>
                    <KV k="Withdrawal ID" v={wdId(result.id)} />
                    <KV k="Amount" v={money(result.amount)} strong />
                    <KV k="Bank" v={`${bank.bank_name || "—"} ${masked}`} />
                    <KV k="Expected arrival" v="1–2 business days" />
                  </View>
                  <Pressable onPress={onDone} style={{ height: 46, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", alignSelf: "stretch", marginTop: spacing.lg }}><Text style={{ color: "#fff", fontWeight: "800" }}>Done</Text></Pressable>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </KeyboardProvider>
    </Modal>
  );
}
