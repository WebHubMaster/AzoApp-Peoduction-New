import React, { useState } from "react";
import { View, Text, Pressable, Modal, TextInput, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, StatCard, SectionTitle, Button, Badge, EmptyState, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { fmt, timeAgo } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

export default function AgentWallet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const me = useQuery({ queryKey: ["agent-me"], queryFn: () => api.get<any>("/agent/me") });
  const wds = useQuery({ queryKey: ["agent-withdrawals"], queryFn: () => api.get<any>("/agent/withdrawals") });

  const w = me.data?.wallet || {};
  const cfg = me.data?.config || {};
  const bank = me.data?.bank || null;
  const bankVerified = !!(bank && bank.verified);
  const withdrawals: any[] = wds.data?.withdrawals || [];

  const [showWithdraw, setShowWithdraw] = useState(false);
  const [amount, setAmount] = useState("");
  const [showBank, setShowBank] = useState(false);
  const [form, setForm] = useState({ account_name: "", account_number: "", ifsc: "", bank_name: "", upi: "" });

  const submitBank = useMutation({
    mutationFn: () => api.post<any>("/agent/bank", form),
    onSuccess: () => {
      toast.success("Bank submitted — awaiting admin verification");
      setShowBank(false);
      qc.invalidateQueries({ queryKey: ["agent-me"] });
    },
    onError: (e: any) => toast.error(e?.detail || "Could not save bank details"),
  });

  const withdraw = useMutation({
    mutationFn: (amt: number) => api.post<any>("/agent/withdraw", { amount: amt, method: "bank" }),
    onSuccess: () => {
      toast.success("Withdrawal request submitted");
      setShowWithdraw(false);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["agent-me"] });
      qc.invalidateQueries({ queryKey: ["agent-withdrawals"] });
    },
    onError: (e: any) => toast.error(e?.detail || "Withdrawal failed"),
  });

  const openBank = () => {
    if (bank) setForm({ account_name: bank.account_name || "", account_number: bank.account_number || "", ifsc: bank.ifsc || "", bank_name: bank.bank_name || "", upi: bank.upi || "" });
    setShowBank(true);
  };

  const openWithdraw = () => {
    if (!bankVerified) { toast.info("Add & verify your bank details first"); openBank(); return; }
    setShowWithdraw(true);
  };

  const submitWithdraw = () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (amt > (w.available || 0)) return toast.error("Amount exceeds available balance");
    withdraw.mutate(amt);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Wallet" subtitle="Earnings & withdrawals" variant="gradient" testID="agent-wallet-header" />
      <ScreenScroll refreshing={me.isFetching} onRefresh={() => { qc.invalidateQueries({ queryKey: ["agent-me"] }); qc.invalidateQueries({ queryKey: ["agent-withdrawals"] }); }}>
        {me.isLoading ? <CardSkeleton /> : (
          <LinearGradient colors={[colors.primary, colors.primaryHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: spacing.lg }}>
            <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: fontSize.xs, fontWeight: "700" }}>AVAILABLE BALANCE</Text>
            <Text style={{ color: "#fff", fontSize: fontSize.hero, fontWeight: "900", marginTop: 4 }}>{fmt(w.available)}</Text>
            <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: fontSize.xs, marginTop: 4 }}>{w.mappings || 0} mappings · min withdrawal {fmt(cfg.min_withdrawal)}</Text>
            <Pressable testID="agent-withdraw-button" onPress={openWithdraw} style={{ marginTop: spacing.md, backgroundColor: "#fff", borderRadius: radius.md, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
              <Icon name="bank-transfer-out" size={18} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: "800" }}>Withdraw to Bank</Text>
            </Pressable>
          </LinearGradient>
        )}

        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatCard label="Total Earned" value={fmt(w.total_earned)} icon="cash-multiple" tone="success" />
          <StatCard label="Pending" value={fmt(w.pending)} icon="clock-outline" tone="warning" />
        </View>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <StatCard label="Withdrawn" value={fmt(w.withdrawn)} icon="bank-transfer-out" tone="info" />
          <StatCard label="QRs Mapped" value={String(w.mappings || 0)} icon="qrcode-plus" tone="primary" />
        </View>

        {/* Bank card */}
        <Pressable testID="agent-bank-card" onPress={openBank}>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 11, backgroundColor: bankVerified ? colors.successSubtle : colors.warningSubtle, alignItems: "center", justifyContent: "center" }}>
                <Icon name={bankVerified ? "bank-check" : "bank-outline"} size={20} color={bankVerified ? colors.success : colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm }}>{bank ? "Payout account" : "Add bank account"}</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                  {bank ? `${bank.bank_name || "Bank"} ••••${String(bank.account_number || "").slice(-4)}` : "Required before you can withdraw earnings"}
                </Text>
              </View>
              {bank ? <Badge label={bankVerified ? "Verified" : "Pending"} tone={statusTone(bankVerified ? "verified" : "pending")} /> : <Icon name="chevron-right" size={22} color={colors.textMuted} />}
            </View>
          </Card>
        </Pressable>

        {/* Withdrawals history */}
        <View>
          <SectionTitle title="Withdrawals" />
          {withdrawals.length === 0 ? (
            <Card><EmptyState icon="bank-transfer" title="No withdrawals yet" subtitle="Your payout requests will appear here." /></Card>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {withdrawals.map((t, i) => (
                <View key={t.id || i} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                  <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                    <Icon name="bank-transfer-out" size={18} color={colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }}>{fmt(t.amount)}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>{timeAgo(t.requested_at)}{t.reason ? " · " + t.reason : ""}</Text>
                  </View>
                  <Badge label={t.status} tone={statusTone(t.status)} />
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScreenScroll>

      {/* Withdraw modal */}
      <Modal visible={showWithdraw} transparent animationType="slide" onRequestClose={() => setShowWithdraw(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowWithdraw(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>Withdraw Money</Text>
              <Pressable testID="agent-close-withdraw" onPress={() => setShowWithdraw(false)} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>Available: {fmt(w.available)} · Min {fmt(cfg.min_withdrawal)}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, height: 54 }}>
              <Text style={{ color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: "800" }}>₹</Text>
              <TextInput testID="agent-withdraw-amount" value={amount} onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="number-pad" style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.xl, fontWeight: "800" }} />
            </View>
            <Button title="Request Withdrawal" onPress={submitWithdraw} loading={withdraw.isPending} testID="agent-submit-withdraw" />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Bank modal */}
      <Modal visible={showBank} transparent animationType="slide" onRequestClose={() => setShowBank(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowBank(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>Bank details</Text>
              <Pressable testID="agent-close-bank" onPress={() => setShowBank(false)} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            {([
              { k: "account_name", ph: "Account holder name", kb: "default" },
              { k: "account_number", ph: "Account number", kb: "number-pad" },
              { k: "ifsc", ph: "IFSC code", kb: "default", up: true },
              { k: "bank_name", ph: "Bank name (optional)", kb: "default" },
              { k: "upi", ph: "UPI ID (optional)", kb: "default" },
            ] as { k: keyof typeof form; ph: string; kb: any; up?: boolean }[]).map((f) => (
              <TextInput
                key={f.k}
                testID={`agent-bank-${f.k}`}
                value={form[f.k]}
                onChangeText={(v) => setForm((s) => ({ ...s, [f.k]: f.up ? v.toUpperCase() : v }))}
                placeholder={f.ph}
                placeholderTextColor={colors.textMuted}
                keyboardType={f.kb}
                autoCapitalize={f.up ? "characters" : "none"}
                style={{ height: 50, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, color: colors.text, fontSize: fontSize.md }}
              />
            ))}
            <View style={{ marginTop: spacing.sm }}>
              <Button title="Save bank details" onPress={() => submitBank.mutate()} loading={submitBank.isPending} testID="agent-submit-bank" />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
