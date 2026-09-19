import React, { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api, mediaUrl } from "@/src/api/client";
import { useRealtime } from "@/src/context/RealtimeContext";
import { useToast } from "@/src/components/Toast";
import { Icon } from "@/src/components/Icon";
import { useTheme } from "@/src/theme";
import { TW } from "./tw";

const REASON: Record<string, string> = {
  offline: "You were offline / on another job",
  no_answer: "You didn't answer the ring",
  taken_back: "Request re-opened",
};
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

/** Still-open jobs this partner missed while offline / unanswered — one-tap re-grab (web MissedRingRecovery). */
export function MissedRingRecovery() {
  const { colors, mode } = useTheme();
  const { subscribe } = useRealtime();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const q = useQuery({ queryKey: ["partner-missed"], queryFn: () => api.get<any[]>("/bookings/partner/missed"), refetchInterval: 20000 });

  useEffect(() => subscribe((ev) => { if (["job_taken", "job_request", "job_update", "__resync__"].includes(ev?.type)) q.refetch(); }), [subscribe]); // eslint-disable-line react-hooks/exhaustive-deps

  const regrab = async (j: any) => {
    setBusy(j.id);
    try {
      await api.post(`/bookings/${j.id}/accept`, {});
      toast.success(`Job is yours! ${j.service_name} · ${j.code}`);
      qc.invalidateQueries({ queryKey: ["partner-missed"] }); qc.invalidateQueries({ queryKey: ["partner-active"] }); qc.invalidateQueries({ queryKey: ["partner-dashboard"] });
      router.push("/(partner)/active");
    } catch (e: any) { toast.error(e?.detail || "Could not grab — it may have been taken"); q.refetch(); }
    finally { setBusy(""); }
  };

  const rows = q.data || [];
  if (rows.length === 0) return null;
  const dark = mode === "dark";
  return (
    <View testID="missed-ring-recovery" style={{ borderRadius: 16, borderWidth: 2, borderColor: dark ? TW.amber700 : TW.amber300, backgroundColor: dark ? "rgba(120,53,15,0.2)" : TW.amber50, padding: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: TW.amber500, alignItems: "center", justifyContent: "center" }}><Icon name="wifi-off" size={20} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>You missed {rows.length} job{rows.length > 1 ? "s" : ""} while offline</Text>
            <Text style={{ color: dark ? TW.amber200 : TW.amber800, fontSize: 12 }}>Still open — grab one before someone else does.</Text>
          </View>
        </View>
        <Pressable testID="missed-refresh" onPress={() => q.refetch()} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Icon name="refresh" size={14} color={TW.amber800} /><Text style={{ color: TW.amber800, fontSize: 12 }}>Refresh</Text>
        </Pressable>
      </View>
      <View style={{ marginTop: 12, gap: 8 }}>
        {rows.map((j) => (
          <View key={j.id} testID={`missed-job-${j.code}`} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: dark ? TW.amber800 : TW.amber200, padding: 12 }}>
            {j.service_image
              ? <Image source={{ uri: mediaUrl(j.service_image) }} style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
              : <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceSubtle, alignItems: "center", justifyContent: "center" }}><Icon name="flash-outline" size={20} color={TW.slate400} /></View>}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: colors.text, fontWeight: "600", fontSize: 14, flexShrink: 1 }} numberOfLines={1}>{j.service_name}</Text>
                {j.schedule_type === "emergency" ? <View style={{ backgroundColor: TW.red100, borderRadius: 999, paddingHorizontal: 6 }}><Text style={{ color: TW.red700, fontSize: 10, fontWeight: "700" }}>Emergency</Text></View> : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="map-marker-outline" size={12} color={TW.slate500} />
                <Text style={{ color: TW.slate500, fontSize: 11, flex: 1 }} numberOfLines={1}>{j.address_line || j.city || "—"}{j.eta_min != null ? ` · ~${j.eta_min} min` : ""}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="clock-outline" size={12} color={TW.amber700} />
                <Text style={{ color: dark ? TW.amber300 : TW.amber700, fontSize: 11 }} numberOfLines={1}>{REASON[j.missed_reason] || "Missed"} · {ago(j.created_at)}</Text>
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Icon name="currency-inr" size={14} color={TW.emerald600} /><Text style={{ color: TW.emerald600, fontWeight: "800", fontSize: 14 }}>{j.total ?? "—"}</Text>
              </View>
              <Pressable testID={`regrab-now-${j.code}`} onPress={() => regrab(j)} disabled={!!busy} style={{ marginTop: 4, height: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: TW.emerald600, flexDirection: "row", alignItems: "center", gap: 6, opacity: busy ? 0.6 : 1 }}>
                {busy === j.id ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="refresh" size={14} color="#fff" />}
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Grab now</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
