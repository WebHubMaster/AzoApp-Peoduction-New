import React, { useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator, Platform } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, SectionTitle, Badge, EmptyState, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { useToast } from "@/src/components/Toast";

type Filter = "unassigned" | "active" | "";

export default function AgentMap() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();

  const [token, setToken] = useState("");
  const [filter, setFilter] = useState<Filter>("unassigned");
  const [pickToken, setPickToken] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [msearch, setMsearch] = useState("");

  const list = useQuery({
    queryKey: ["agent-qrs", filter],
    queryFn: () => api.get<any>(`/admin/physical-qr?status=${filter}&page=1&page_size=50`),
  });
  const items: any[] = list.data?.items || [];
  const counts = list.data?.counts || {};

  const merchants = useQuery({
    queryKey: ["agent-merchant-search", msearch],
    queryFn: () => api.get<any>(`/admin/physical-qr/merchant-search?q=${encodeURIComponent(msearch)}`),
    enabled: showPicker,
  });
  const mList: any[] = merchants.data?.merchants || [];

  const lookup = useMutation({
    mutationFn: (t: string) => api.get<any>(`/admin/physical-qr/${encodeURIComponent(t)}`),
    onSuccess: (data) => {
      const qr = data?.qr || {};
      if (qr.status === "active" && qr.merchant_id) {
        toast.info(`Already mapped to ${qr.merchant_name || "a merchant"}`);
      } else {
        openPicker(qr.token || token.trim().toUpperCase());
      }
    },
    onError: (e: any) => toast.error(e?.detail || "QR not found in your batches"),
  });

  const assign = useMutation({
    mutationFn: (v: { token: string; merchant_id: string }) =>
      api.post<any>(`/admin/physical-qr/${encodeURIComponent(v.token)}/assign`, { merchant_id: v.merchant_id }),
    onSuccess: (data) => {
      setShowPicker(false);
      setToken("");
      const earn = data?.agent_earning;
      toast.success(earn ? `Mapped! You earned ₹${earn}` : "QR mapped successfully");
      qc.invalidateQueries({ queryKey: ["agent-qrs"] });
      qc.invalidateQueries({ queryKey: ["agent-me"] });
      qc.invalidateQueries({ queryKey: ["agent-earnings"] });
      qc.invalidateQueries({ queryKey: ["agent-batches"] });
    },
    onError: (e: any) => toast.error(e?.detail || "Could not map this QR"),
  });

  const openPicker = (t: string) => {
    setPickToken(t);
    setMsearch("");
    setShowPicker(true);
  };

  const doLookup = () => {
    const t = token.trim().toUpperCase();
    if (t.length < 3) return toast.error("Enter the QR code printed on the sticker");
    lookup.mutate(t);
  };

  const chips: { key: Filter; label: string }[] = [
    { key: "unassigned", label: `To map (${counts.unassigned ?? 0})` },
    { key: "active", label: `Mapped (${counts.active ?? 0})` },
    { key: "", label: `All (${counts.all ?? 0})` },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Map QR" subtitle="Link a sticker to a merchant" variant="gradient" testID="agent-map-header" />
      <ScreenScroll refreshing={list.isFetching} onRefresh={() => qc.invalidateQueries({ queryKey: ["agent-qrs"] })}>
        {/* Manual token entry */}
        <Card>
          <SectionTitle title="Enter QR code" />
          <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginBottom: spacing.md }}>
            Type the code printed on the physical sticker, then map it to the shop.
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 52 }}>
              <Icon name="qrcode" size={20} color={colors.textMuted} />
              <TextInput
                testID="agent-token-input"
                value={token}
                onChangeText={(v) => setToken(v.replace(/\s/g, "").toUpperCase())}
                placeholder="e.g. PAT7K9QX"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                onSubmitEditing={doLookup}
                style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.lg, fontWeight: "800", letterSpacing: 1 }}
              />
            </View>
            <Pressable testID="agent-lookup-btn" onPress={doLookup} disabled={lookup.isPending} style={{ height: 52, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: lookup.isPending ? 0.7 : 1 }}>
              {lookup.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800" }}>Map</Text>}
            </Pressable>
          </View>
        </Card>

        {/* Filter chips */}
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          {chips.map((c) => {
            const on = filter === c.key;
            return (
              <Pressable key={c.label} testID={`agent-filter-${c.key || "all"}`} onPress={() => setFilter(c.key)} style={{ flex: 1, paddingVertical: 9, borderRadius: radius.md, alignItems: "center", backgroundColor: on ? colors.primary : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                <Text style={{ color: on ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "800" }}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* QR list */}
        <View>
          <SectionTitle title="My QR stickers" />
          {list.isLoading ? <CardSkeleton /> : items.length === 0 ? (
            <Card><EmptyState icon="qrcode-remove" title="No stickers here" subtitle="No QR stickers match this filter in your assigned batches." /></Card>
          ) : (
            <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
              {items.map((qr, i) => {
                const mapped = qr.status === "active" && qr.merchant_id;
                return (
                  <View key={qr.token} style={{ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="qrcode" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.sm, letterSpacing: 0.5 }}>{qr.token}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }} numberOfLines={1}>
                        {mapped ? `${qr.merchant_name || "Merchant"}${qr.merchant_code ? " · " + qr.merchant_code : ""}` : qr.batch_name || "Unassigned"}
                      </Text>
                    </View>
                    {mapped ? (
                      <Badge label="Mapped" tone={statusTone("active")} icon="check-decagram" />
                    ) : qr.status === "disabled" ? (
                      <Badge label="Disabled" tone="danger" icon="cancel" />
                    ) : (
                      <Pressable testID={`agent-map-${qr.token}`} onPress={() => openPicker(qr.token)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.primarySubtle, flexDirection: "row", alignItems: "center", gap: 5 }}>
                        <Icon name="link-variant" size={15} color={colors.primary} />
                        <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>Map</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </Card>
          )}
        </View>
      </ScreenScroll>

      {/* Merchant picker */}
      <Modal visible={showPicker} transparent animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1 }} onPress={() => setShowPicker(false)} />
          <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: insets.bottom + spacing.lg, maxHeight: "82%" }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm }}>
              <View>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: "800" }}>Map to merchant</Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 }}>Sticker <Text style={{ fontWeight: "800", color: colors.primary }}>{pickToken}</Text></Text>
              </View>
              <Pressable testID="agent-picker-close" onPress={() => setShowPicker(false)} hitSlop={8}><Icon name="close" size={24} color={colors.textMuted} /></Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, height: 50, marginBottom: spacing.md }}>
              <Icon name="magnify" size={20} color={colors.textMuted} />
              <TextInput
                testID="agent-merchant-search"
                value={msearch}
                onChangeText={setMsearch}
                placeholder="Search shop name, code or phone"
                placeholderTextColor={colors.textMuted}
                autoFocus
                style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: fontSize.md }}
              />
            </View>
            {merchants.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : mList.length === 0 ? (
              <EmptyState icon="store-search" title="No merchants" subtitle="Try a different shop name, code or phone number." />
            ) : (
              <View>
                {mList.map((m) => (
                  <Pressable
                    key={m.id}
                    testID={`agent-pick-merchant-${m.id}`}
                    disabled={assign.isPending}
                    onPress={() => assign.mutate({ token: pickToken, merchant_id: m.id })}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 })}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}>
                      <Icon name="store" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: fontSize.sm }} numberOfLines={1}>{m.shop_name || m.name}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, marginTop: 1 }} numberOfLines={1}>{m.merchant_code ? m.merchant_code + " · " : ""}{m.phone}</Text>
                    </View>
                    {assign.isPending ? <ActivityIndicator color={colors.primary} /> : <Icon name="chevron-right" size={22} color={colors.textMuted} />}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
