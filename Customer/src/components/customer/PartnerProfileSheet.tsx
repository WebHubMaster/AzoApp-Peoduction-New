/* Non-confidential partner profile (port of web PartnerProfileModal) — /bookings/{id}/partner-card. */
import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { Star, ShieldCheck, Crown, Briefcase, MapPin, Quote } from "lucide-react-native";
import { api, mediaUrl } from "../../api/client";
import { PRIMARY, AMBER, EMERALD, SLATE, TC, useTheme } from "../../theme";
import { BottomSheet } from "./ux";

const cache: Record<string, any> = {};

export function usePartnerCard(bookingId?: string, partnerId?: string) {
  const key = bookingId && partnerId ? `${bookingId}:${partnerId}` : "";
  const [data, setData] = useState<any>(key ? cache[key] || null : null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!key) return;
    let alive = true;
    api.get<any>(`/bookings/${bookingId}/partner-card`).then((d) => { cache[key] = d; if (alive) setData(d); }).catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
  }, [key, bookingId]);
  return { data, err };
}

export function PartnerAvatar({ photo, name, size = 48, testID }: { photo?: string; name?: string; size?: number; testID?: string }) {
  const uri = photo ? mediaUrl(photo) : undefined;
  if (uri) return <Image testID={testID} source={{ uri }} style={{ width: size, height: size, borderRadius: 6 }} contentFit="cover" transition={150} accessibilityLabel={name} />;
  return (
    <View testID={testID} style={{ width: size, height: size, borderRadius: 6, backgroundColor: PRIMARY[600], alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "900", fontSize: size * 0.4 }}>{(name || "P").trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function Stars({ value = 0, size = 13 }: { value?: number; size?: number }) {
  return (
    <View style={{ flexDirection: "row", gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} color={i <= Math.round(value) ? AMBER[400] : SLATE[300]} fill={i <= Math.round(value) ? AMBER[400] : "transparent"} />)}
    </View>
  );
}

function Stat({ icon: Icon, color, value, label, testID }: any) {
  const { c } = useTheme();
  return (
    <View testID={testID} style={{ flex: 1, borderRadius: 6, backgroundColor: c.surfaceAlt, padding: 10, alignItems: "center" }}>
      <Icon size={16} color={color} />
      <Text style={{ fontSize: 16, fontWeight: "900", color: c.text, marginTop: 4 }}>{value}</Text>
      <Text style={{ fontSize: 10, fontWeight: "700", color: TC.textFaint, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: 11, fontWeight: "700", color: TC.textFaint, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{children}</Text>
);

function Body({ d }: { d: any }) {
  const { c } = useTheme();
  const dist = d.rating_distribution || {};
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <PartnerAvatar photo={d.photo} name={d.name} size={64} testID="partner-profile-photo" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text testID="partner-profile-name" numberOfLines={1} style={{ fontSize: 18, fontWeight: "900", color: c.text, flexShrink: 1 }}>{d.name}</Text>
            {d.verified ? <ShieldCheck size={16} color={EMERALD[500]} /> : null}
            {d.premium ? <Crown size={16} color={AMBER[500]} /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <Stars value={d.rating} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>{d.rating || "New"}</Text>
            <Text style={{ fontSize: 12, color: TC.textFaint }}>({d.reviews_count} reviews)</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Stat icon={Briefcase} color={PRIMARY[600]} value={d.jobs_completed} label="Jobs done" testID="partner-stat-jobs" />
        <Stat icon={Star} color={AMBER[500]} value={d.rating || "–"} label="Rating" />
        <Stat icon={ShieldCheck} color={EMERALD[500]} value={d.verified ? "Yes" : "–"} label="Verified" />
      </View>

      {d.reviews_count > 0 ? (
        <View testID="partner-rating-dist" style={{ gap: 4 }}>
          {[5, 4, 3, 2, 1].map((st) => {
            const n = dist[String(st)] || 0;
            const pct = Math.round((n / Math.max(1, d.reviews_count)) * 100);
            return (
              <View key={st} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ width: 24, fontSize: 12, color: TC.textMuted, fontWeight: "600" }}>{st}★</Text>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.surfaceAlt, overflow: "hidden" }}><View style={{ height: 6, width: `${pct}%`, backgroundColor: AMBER[400] }} /></View>
                <Text style={{ width: 24, fontSize: 12, color: TC.textFaint, textAlign: "right" }}>{n}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {d.experience || (d.languages || []).length ? (
        <Text testID="partner-experience" style={{ fontSize: 12, color: TC.textMuted }}>
          {d.experience ? `${d.experience} yrs experience` : ""}{d.experience && (d.languages || []).length ? " · " : ""}{(d.languages || []).join(", ")}
        </Text>
      ) : null}

      {(d.skills || []).length ? (
        <View>
          <Label>Skills</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {d.skills.slice(0, 10).map((s: string, i: number) => (
              <Text key={i} style={{ fontSize: 12, fontWeight: "600", color: PRIMARY[700], backgroundColor: PRIMARY[50], borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4, textTransform: "capitalize" }}>{s}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {d.member_since ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MapPin size={13} color={TC.textFaint} />
          <Text style={{ fontSize: 12, color: TC.textFaint }}>{d.city ? `${d.city} · ` : ""}With us since {d.member_since}</Text>
        </View>
      ) : null}

      <View>
        <Label>Recent reviews</Label>
        {(d.reviews || []).length === 0 ? <Text style={{ fontSize: 13, color: TC.textFaint }}>No reviews yet.</Text> : (
          <View testID="partner-reviews" style={{ gap: 8 }}>
            {d.reviews.slice(0, 20).map((rv: any, i: number) => (
              <View key={i} style={{ borderRadius: 6, borderWidth: 1, borderColor: c.border, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 13, fontWeight: "700", color: c.text }}>{rv.customer_name}</Text>
                  <Stars value={rv.rating} size={12} />
                </View>
                {rv.comment ? (
                  <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                    <Quote size={12} color={SLATE[300]} style={{ marginTop: 3 }} />
                    <Text style={{ fontSize: 13, color: TC.text2, flex: 1, lineHeight: 18 }}>{rv.comment}</Text>
                  </View>
                ) : null}
                {rv.service_name ? <Text style={{ fontSize: 11, color: TC.textFaint, marginTop: 4 }}>{rv.service_name}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

export function PartnerProfileSheet({ open, onClose, bookingId, partnerId }: { open: boolean; onClose: () => void; bookingId: string; partnerId?: string }) {
  const { data, err } = usePartnerCard(open ? bookingId : undefined, partnerId);
  return (
    <BottomSheet open={open} onClose={onClose} title="Your Professional" testID="partner-profile-sheet">
      {data ? <Body d={data} /> : err ? <Text style={{ textAlign: "center", color: TC.textFaint, paddingVertical: 40 }}>Could not load profile</Text>
        : <ActivityIndicator color={PRIMARY[600]} style={{ paddingVertical: 40 }} />}
    </BottomSheet>
  );
}
