import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, radius, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader } from "@/src/components/Screen";
import { Badge, CardSkeleton, Button, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { timeAgo } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

export default function SupportThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["support-ticket", id], queryFn: () => api.get<any>(`/support/tickets/${id}`), enabled: !!id, refetchInterval: 8000 });
  const ticket = data?.ticket || data;
  const messages: any[] = data?.messages || ticket?.messages || [];

  const send = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/messages`, { text: text.trim() }),
    onSuccess: () => { setText(""); qc.invalidateQueries({ queryKey: ["support-ticket", id] }); },
    onError: (e: any) => toast.error(e?.detail || "Could not send"),
  });
  const close = useMutation({
    mutationFn: () => api.post(`/support/tickets/${id}/close`),
    onSuccess: () => { toast.info("Ticket closed"); qc.invalidateQueries({ queryKey: ["support-ticket", id] }); qc.invalidateQueries({ queryKey: ["support-tickets"] }); },
  });

  const isClosed = (ticket?.status || "").toLowerCase() === "closed";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title={ticket?.code || "Ticket"} back subtitle={ticket?.subject} variant="gradient" testID="ticket-thread-header"
        right={!isClosed ? <Pressable testID="close-ticket" onPress={() => close.mutate()} hitSlop={8}><Icon name="check-all" size={24} color="#fff" /></Pressable> : undefined} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        {isLoading ? (
          <View style={{ padding: spacing.lg }}><CardSkeleton /></View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
              <Badge label={(ticket?.status || "").replace(/_/g, " ")} tone={statusTone(ticket?.status)} />
              <Badge label={ticket?.priority} tone={ticket?.priority === "high" ? "danger" : "warning"} />
            </View>
            {messages.map((m, i) => {
              const mine = (m.sender_role || m.role) !== "admin";
              return (
                <View key={m.id || i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%", backgroundColor: mine ? colors.primary : colors.surface, borderWidth: mine ? 0 : 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md }}>
                  <Text style={{ color: mine ? "#fff" : colors.text, fontSize: fontSize.sm, lineHeight: 20 }}>{m.text || m.message}</Text>
                  <Text style={{ color: mine ? "rgba(255,255,255,0.7)" : colors.textMuted, fontSize: 10, marginTop: 4 }}>{timeAgo(m.created_at)}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}
        {!isClosed ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: spacing.md, paddingBottom: insets.bottom + spacing.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
            <TextInput testID="ticket-reply" value={text} onChangeText={setText} placeholder="Type a message" placeholderTextColor={colors.textMuted} style={{ flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.surfaceSubtle, paddingHorizontal: 16, color: colors.text, fontSize: fontSize.sm }} />
            <Pressable testID="send-reply" onPress={() => text.trim() && send.mutate()} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
              <Icon name="send" size={20} color="#fff" />
            </Pressable>
          </View>
        ) : (
          <View style={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.md }}>
            <Text style={{ color: colors.textMuted, textAlign: "center", fontSize: fontSize.sm }}>This ticket is closed.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}
