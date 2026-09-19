import React, { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, SectionTitle, Button, Badge, InfoRow, CardSkeleton, EmptyState } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

const inputStyle = (colors: any) => ({ height: 50, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, color: colors.text, fontSize: fontSize.md, fontWeight: "600" as const, backgroundColor: colors.surface });

/** Shared Bank & KYC screen for both Partner (/partner/finance-kyc) and Merchant (/merchant/panel/finance-kyc). */
export function FinanceKycScreen({ base, queryKey }: { base: string; queryKey: string }) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: () => api.get<any>(base) });

  const [pan, setPan] = useState("");
  const [holder, setHolder] = useState("");
  const [acc, setAcc] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: [queryKey] });

  const submitPan = useMutation({
    mutationFn: () => api.post(`${base}/pan`, { pan_number: pan.trim().toUpperCase() }),
    onSuccess: () => { toast.success("PAN submitted for verification"); setPan(""); refresh(); },
    onError: (e: any) => toast.error(e?.detail || "Invalid PAN"),
  });
  const addBank = useMutation({
    mutationFn: () => api.post(`${base}/banks`, { account_holder: holder.trim(), bank_name: bankName.trim(), account_number: acc.trim(), ifsc: ifsc.trim().toUpperCase() }),
    onSuccess: () => { toast.success("Bank account added"); setHolder(""); setAcc(""); setIfsc(""); setBankName(""); refresh(); },
    onError: (e: any) => toast.error(e?.detail || "Could not add bank"),
  });
  const setPrimary = useMutation({ mutationFn: (id: string) => api.post(`${base}/banks/${id}/primary`), onSuccess: () => { toast.success("Primary bank updated"); refresh(); }, onError: (e: any) => toast.error(e?.detail || "Failed") });
  const delBank = useMutation({ mutationFn: (id: string) => api.del(`${base}/banks/${id}`), onSuccess: () => { toast.info("Bank removed"); refresh(); }, onError: (e: any) => toast.error(e?.detail || "Failed") });

  const banks: any[] = data?.banks || [];
  const panData = data?.pan;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Bank & KYC" back variant="gradient" testID="bankkyc-header" />
      <ScreenScroll>
        {isLoading ? <CardSkeleton /> : (
          <>
            <Card style={{ backgroundColor: data?.eligible ? colors.successSubtle : colors.warningSubtle, borderColor: data?.eligible ? colors.success : colors.warning }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Icon name={data?.eligible ? "check-circle" : "alert-circle"} size={22} color={data?.eligible ? colors.success : colors.warning} />
                <Text style={{ flex: 1, color: colors.text, fontWeight: "700", fontSize: fontSize.sm }}>{data?.eligible ? "You're eligible for withdrawals" : (data?.blockers || []).join(" · ") || "Complete verification"}</Text>
              </View>
            </Card>

            <Card>
              <SectionTitle title="PAN Card" />
              {panData?.pan_number ? (
                <View><InfoRow icon="card-account-details" label="PAN" value={panData.pan_number} /><Badge label={(panData.status || "pending").replace(/_/g, " ")} tone={panData.status === "verified" ? "success" : "warning"} /></View>
              ) : (
                <><TextInput testID="pan-input" value={pan} onChangeText={setPan} placeholder="ABCDE1234F" autoCapitalize="characters" maxLength={10} placeholderTextColor={colors.textMuted} style={inputStyle(colors)} /><View style={{ marginTop: spacing.sm }}><Button title="Submit PAN" onPress={() => submitPan.mutate()} loading={submitPan.isPending} testID="submit-pan" /></View></>
              )}
            </Card>

            <View>
              <SectionTitle title="Bank accounts" />
              {banks.length === 0 ? <Card><EmptyState icon="bank-off" title="No bank added" subtitle="Add a bank account to receive withdrawals." /></Card> : (
                <View style={{ gap: spacing.sm }}>
                  {banks.map((b) => (
                    <Card key={b.id}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>{b.bank_name || "Bank"}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>••••{String(b.account_number || "").slice(-4)} · {b.ifsc}</Text>
                          <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>{b.account_holder}</Text>
                        </View>
                        {b.is_primary ? <Badge label="Primary" tone="success" icon="star" /> : null}
                      </View>
                      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
                        {!b.is_primary ? <View style={{ flex: 1 }}><Button title="Set primary" size="sm" variant="secondary" onPress={() => setPrimary.mutate(b.id)} testID={`primary-${b.id}`} /></View> : null}
                        <View style={{ flex: 1 }}><Button title="Remove" size="sm" variant="outline" onPress={() => delBank.mutate(b.id)} testID={`del-${b.id}`} /></View>
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </View>

            <Card>
              <SectionTitle title="Add bank account" />
              <View style={{ gap: spacing.sm }}>
                <TextInput testID="bank-holder" value={holder} onChangeText={setHolder} placeholder="Account holder name" placeholderTextColor={colors.textMuted} style={inputStyle(colors)} />
                <TextInput testID="bank-name" value={bankName} onChangeText={setBankName} placeholder="Bank name" placeholderTextColor={colors.textMuted} style={inputStyle(colors)} />
                <TextInput testID="bank-acc" value={acc} onChangeText={(t) => setAcc(t.replace(/\D/g, ""))} placeholder="Account number" keyboardType="number-pad" placeholderTextColor={colors.textMuted} style={inputStyle(colors)} />
                <TextInput testID="bank-ifsc" value={ifsc} onChangeText={setIfsc} placeholder="IFSC code" autoCapitalize="characters" placeholderTextColor={colors.textMuted} style={inputStyle(colors)} />
                <Button title="Add bank account" icon="bank-plus" onPress={() => addBank.mutate()} loading={addBank.isPending} testID="add-bank" />
              </View>
            </Card>
          </>
        )}
      </ScreenScroll>
    </View>
  );
}
