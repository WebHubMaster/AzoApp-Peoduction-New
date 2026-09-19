import React from "react";
import { View, Text, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, spacing, fontSize } from "@/src/theme";
import { api } from "@/src/api/client";
import { AppHeader, ScreenScroll } from "@/src/components/Screen";
import { Card, Badge, Button, InfoRow, SectionTitle, CardSkeleton, statusTone } from "@/src/components/ui";
import { Icon } from "@/src/components/Icon";
import { fmt, fmtDate } from "@/src/lib/format";
import { useToast } from "@/src/components/Toast";

const REQUEST_STATES = ["searching", "assigned", "pending"];

export default function PartnerBookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const { data: b, isLoading } = useQuery({
    queryKey: ["partner-booking", id],
    queryFn: () => api.get<any>(`/bookings/partner/job/${id}`),
    enabled: !!id,
  });

  const invalidateLists = () => {
    ["partner-joblist", "partner-active", "partner-jobs", "partner-wallet"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const accept = useMutation({
    mutationFn: () => api.post(`/bookings/${id}/accept`),
    onSuccess: () => { toast.success("Job accepted"); invalidateLists(); router.back(); },
    onError: (e: any) => toast.error(e?.detail || "Could not accept job"),
  });
  const reject = useMutation({
    mutationFn: () => api.post(`/bookings/${id}/reject`),
    onSuccess: () => { toast.info("Job rejected"); invalidateLists(); router.back(); },
    onError: (e: any) => toast.error(e?.detail || "Could not reject job"),
  });

  const pricing = b?.pricing || {};
  const items: any[] = b?.breakdown?.service_items || [];
  const isRequest = REQUEST_STATES.includes(b?.status);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppHeader title="Booking details" back subtitle={b?.code} variant="gradient" testID="booking-detail-header" />
      {isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}><CardSkeleton /><CardSkeleton /></View>
      ) : !b ? (
        <View style={{ padding: spacing.lg }}><Card><Text style={{ color: colors.textMuted }}>Booking not found.</Text></Card></View>
      ) : (
        <>
          <ScreenScroll contentStyle={{ paddingBottom: insets.bottom + 120 }}>
            <Card>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "700" }}>{b.code}</Text>
                <Badge label={(b.status || "").replace(/_/g, " ")} tone={statusTone(b.status)} />
              </View>
              <Text style={{ color: colors.text, fontSize: fontSize.xl, fontWeight: "800" }}>{b.service_name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 }}>{b.category_name}</Text>
            </Card>

            <Card>
              <SectionTitle title="Customer" />
              <InfoRow icon="account" label="Name" value={b.customer_name} />
              <InfoRow icon="phone" label="Phone" value={b.customer_phone} />
              <View style={{ marginTop: 8 }}>
                <Button title="Call customer" variant="secondary" icon="phone" size="sm" onPress={() => b.customer_phone && Linking.openURL(`tel:${b.customer_phone}`)} testID="call-customer" />
              </View>
            </Card>

            <Card>
              <SectionTitle title="Location & schedule" />
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <Icon name="map-marker" size={18} color={colors.primary} />
                <Text style={{ color: colors.textSecondary, fontSize: fontSize.sm, flex: 1 }}>
                  {b.address?.line}, {b.address?.city}, {b.address?.state} {b.address?.pincode}
                </Text>
              </View>
              <InfoRow icon="clock-outline" label="Schedule" value={b.schedule?.is_scheduled ? fmtDate(b.schedule?.scheduled_at) : "As soon as possible"} />
              {b.notes ? <InfoRow icon="note-text" label="Notes" value={b.notes} /> : null}
            </Card>

            <Card>
              <SectionTitle title="Price breakdown" />
              {items.map((it, i) => (
                <InfoRow key={i} label={`${it.name}${it.qty > 1 ? ` ×${it.qty}` : ""}`} value={fmt(it.amount)} />
              ))}
              {pricing.addons_total ? <InfoRow label="Add-ons" value={fmt(pricing.addons_total)} /> : null}
              {pricing.emergency_fee ? <InfoRow label="Emergency fee" value={fmt(pricing.emergency_fee)} /> : null}
              <InfoRow label="Subtotal" value={fmt(pricing.subtotal)} />
              {pricing.discount ? <InfoRow label="Discount" value={`- ${fmt(pricing.discount)}`} /> : null}
              <InfoRow label="GST" value={fmt(pricing.gst)} />
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 6 }} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontSize: fontSize.md }}>Total</Text>
                <Text style={{ color: colors.primary, fontWeight: "900", fontSize: fontSize.lg }}>{fmt(pricing.total)}</Text>
              </View>
            </Card>

            {/* Timeline */}
            {Array.isArray(b.timeline) && b.timeline.length > 0 ? (
              <Card>
                <SectionTitle title="Timeline" />
                {b.timeline.map((t: any, i: number) => (
                  <View key={i} style={{ flexDirection: "row", gap: 10, paddingVertical: 6 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 5 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: "700" }}>{(t.status || "").replace(/_/g, " ")}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: fontSize.xs }}>{fmtDate(t.at)}</Text>
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}
          </ScreenScroll>

          {/* Action bar */}
          {isRequest ? (
            <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: spacing.md, padding: spacing.lg, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Button title="Reject" variant="outline" onPress={() => reject.mutate()} loading={reject.isPending} testID="reject-job" />
              </View>
              <View style={{ flex: 1.4 }}>
                <Button title="Accept Job" icon="check" onPress={() => accept.mutate()} loading={accept.isPending} testID="accept-job" />
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
