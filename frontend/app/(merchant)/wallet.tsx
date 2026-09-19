import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Platform } from "react-native";
import { KeyboardAvoidingView, KeyboardProvider } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, StatCard, SectionTitle, Button, EmptyState, CardSkeleton } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { fmt, timeAgo } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

export default function MerchantWallet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [amount, setAmount] = useState("");

  const wallet = useQuery({ queryKey: ["merchant-wallet"], queryFn: () => api.get<any>("/merchant/wallet") });
  const elig = useQuery({ queryKey: ["merchant-fkyc"], queryFn: () => api.get<any>("/merchant/panel/finance-kyc") });
  const s = wallet.data?.summary || wallet.data || {};
  const ledger: any[] = s.ledger || [];
  const e = elig.data || {};
  const eligible = !!e.eligible;
  const primaryBank = e.primary_bank || (e.banks || [])[0];

  const withdraw = useMutation({
    mutationFn: (amt: number) => api.post("/merchant/wallet/withdraw", { amount: amt, method: "bank", bank: primaryBank || {} }),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      setShow(false);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["merchant-wallet"] });
      qc.invalidateQueries({ queryKey: ["merchant-overview"] });
    },
    onError: (x: any) => toast.error(x?.detail || "Withdrawal failed"),
  });

  const openWithdraw = () => {
    if (!eligible) { toast.info("Complete Payouts & Bank KYC first"); router.push("/merchant/payouts"); return; }
    setShow(true);
  };

  const submit = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > (s.withdrawable_balance || 0)) return toast.error("Amount exceeds withdrawable balance");
    withdraw.mutate(amt);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Wallet" subtitle="Commission & withdrawals" variant="gradient" testID="merchant-wallet-header" />
      <ScreenScroll refreshing={wallet.isFetching} onRefresh={() => { qc.invalidateQueries({ queryKey: ["merchant-wallet"] }); qc.invalidateQueries({ queryKey: ["merchant-fkyc"] }); }}>
        {wallet.isLoading ? (
          <CardSkeleton />
        ) : (
          <LinearGradient colors={[colors.primary, colors.primaryHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.lg }}>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, fontWeight: "700" }}>AVAILABLE BALANCE</Text>
            <Text style={{ color: "#fff", fontSize: fontSize.hero, fontWeight: "900", marginTop: 4 }}>{fmt(s.available_balance)}</Text>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: fontSize.xs, marginTop: 4 }}>Withdrawable {fmt(s.withdrawable_balance)}</Text>
            <Pressable testID="withdraw-button" onPress={openWithdraw} style={{ marginTop: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <Icon name="bank-transfer-out" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>Withdraw to Bank</Text>
            </Pressable>
          </LinearGradient>
        )}

        <Pressable testID="m-payout-banner" onPress={() => router.push("/merchant/payouts")}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: eligible ? colors.successSubtle : colors.warningSubtle, alignItems: "center", justifyContent: "center" }}>
                <Icon name={eligible ? "bank-check" : "alert-circle-outline"} size={20} color={eligible ? colors.success : colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>{eligible ? "Payout account" : "Set up payouts"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>{eligible && primaryBank ? `${primaryBank.bank_name} ••••${String(primaryBank.account_number || "").slice(-4)}` : "Add & verify PAN + bank to withdraw"}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.textMuted} />
            </View>
          </Card>
        </Pressable>

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatCard label="Total Earned" value={fmt(s.total_earned)} icon="cash-multiple" tone="success" />
          <StatCard label="Withdrawn" value={fmt(s.total_withdrawn)} icon="bank-transfer-out" tone="info" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatCard label="Referral" value={fmt(s.total_referral)} icon="account-multiple-plus" tone="primary" />
          <StatCard label="Customer" value={fmt(s.total_customer)} icon="account-cash" tone="warning" />
        </View>

        <View>
          <SectionTitle title="Transactions" />
          {ledger.length === 0 ? (
            <Card><EmptyState icon="receipt-text-outline" title="No transactions yet" subtitle="Commission credits & payouts appear here." /></Card>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {ledger.slice(0, 20).map((t, i) => (
                <View key={t.id || i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: t.direction === "credit" ? colors.successSubtle : colors.dangerSubtle, alignItems: "center", justifyContent: "center" }}>
                    <Icon name={t.direction === "credit" ? "arrow-down-left" : "arrow-up-right"} size={18} color={t.direction === "credit" ? colors.success : colors.danger} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{t.note || t.kind}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{timeAgo(t.created_at)}</Text>
                  </View>
                  <Text style={{ color: t.direction === "credit" ? colors.success : colors.danger, fontWeight: "800", fontSize: fontSize.sm }}>
                    {t.direction === "credit" ? "+" : "-"}{fmt(t.amount)}
                  </Text>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScreenScroll>

      <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
        <KeyboardProvider>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShow(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>Withdraw Money</Text>
              <Pressable testID="close-withdraw" onPress={() => setShow(false)} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Withdrawable balance: {fmt(s.withdrawable_balance)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, height: 54 }}>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: "800" }}>₹</Text>
              <TextInput testID="withdraw-amount-input" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.xl, fontWeight: "800" }} />
            </View>
            <Button title="Request Withdrawal" onPress={submit} loading={withdraw.isPending} testID="submit-withdraw" />
          </View>
        </KeyboardAvoidingView>
        </KeyboardProvider>
      </Modal>
    </View>
  );
}
