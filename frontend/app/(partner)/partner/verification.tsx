import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, Linking, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useTheme, spacing } from "@/src/theme";
import { api, mediaUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { AppShellHeader, Surface } from "@/src/components/AppShell";
import { Icon, MdiName } from "@/src/components/Icon";

const SLATE400 = "#94A3B8";
const maskAadhaar = (n: any) => { const s = String(n || "").replace(/\s+/g, ""); return s.length < 4 ? n || "—" : `XXXX XXXX ${s.slice(-4)}`; };

/** Web PartnerProfileView.jsx (approved) / onboarding banner (pending) */
export default function PartnerVerification() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [zoom, setZoom] = useState<{ url: string; label: string } | null>(null);
  const q = useQuery({ queryKey: ["partner-reg-profile"], queryFn: () => api.get<any>("/partner/registration/profile") });
  const kit = useQuery({ queryKey: ["starter-kit"], queryFn: () => api.get<any>("/starter-kit/me") });
  const approved = user?.kyc_status === "approved" || user?.verified_partner;

  const p = q.data?.profile || {}; const b = p.basic || {}; const w = p.work || {}; const d = p.documents || {}; const a = p.address || {};
  const cats: any[] = w.categories || [];
  const isPremium = (user as any)?.premium_partner || kit.data?.purchased;
  const locality = [b.village, b.city, b.district, b.state].filter(Boolean).join(", ");
  const mapLink = a.lat && a.lng ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : null;

  const Field = ({ icon, label, value }: { icon: MdiName; label: string; value?: string }) => (
    <View style={{ flexDirection: "row", gap: 12, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: colors.primarySubtle, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={{ color: SLATE400, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</Text><Text style={{ color: colors.text, fontSize: 15, fontWeight: "600", marginTop: 2, lineHeight: 21 }}>{value || "—"}</Text></View>
    </View>
  );
  const Section = ({ icon, title, sub, children }: { icon: MdiName; title: string; sub?: string; children: React.ReactNode }) => (
    <Surface style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.surfaceSubtle, backgroundColor: "rgba(248,250,252,0.6)" }}>
        <LinearGradient colors={[colors.secondary, "#42A5F5"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color="#fff" /></LinearGradient>
        <View><Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>{title}</Text>{sub ? <Text style={{ color: SLATE400, fontSize: 12 }}>{sub}</Text> : null}</View>
      </View>
      <View style={{ padding: 20, gap: 12 }}>{children}</View>
    </Surface>
  );
  const DocTile = ({ label, url }: { label: string; url?: string }) => (
    <View style={{ width: "48%", borderRadius: 12, borderWidth: 1, borderColor: colors.border, overflow: "hidden", backgroundColor: colors.surfaceSubtle }}>
      {url ? <Pressable testID={`doc-${label.replace(/\s+/g, "-").toLowerCase()}`} onPress={() => setZoom({ url: mediaUrl(url), label })}><Image source={{ uri: mediaUrl(url) }} style={{ height: 128, width: "100%" }} contentFit="cover" /></Pressable>
        : <View style={{ height: 128, alignItems: "center", justifyContent: "center" }}><Text style={{ color: SLATE400, fontSize: 12 }}>Not uploaded</Text></View>}
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "500", paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.surfaceSubtle, backgroundColor: colors.surface }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AppShellHeader profileRoute="/(partner)/profile" />
      <ScrollView testID="partner-profile-view" contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 110, gap: 20 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.isFetching && !q.isLoading} onRefresh={() => qc.invalidateQueries({ queryKey: ["partner-reg-profile"] })} tintColor={colors.primary} colors={[colors.primary]} />}>
        {!approved ? (
          <View testID="onboarding-banner" style={{ borderRadius: 16, backgroundColor: colors.primary, padding: 20, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Icon name="shield-check-outline" size={32} color="#fff" /><View style={{ flex: 1 }}><Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>Complete your verification</Text><Text style={{ color: "#BFDBFE", fontSize: 14 }}>Finish onboarding & KYC to start receiving jobs.</Text></View></View>
            <Pressable testID="goto-onboarding" onPress={() => router.push("/partner/register")} style={{ height: 44, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.primary, fontWeight: "700", fontSize: 15 }}>{user?.onboarding_submitted ? "View submission" : "Complete now"}</Text></Pressable>
          </View>
        ) : null}

        {q.isLoading ? [160, 208, 208].map((h, i) => <View key={i} style={{ height: h, borderRadius: 16, backgroundColor: colors.surfaceSubtle }} />) : (
          <>
            {/* Hero */}
            <LinearGradient colors={[colors.primary, colors.secondary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 24, overflow: "hidden" }}>
              <View style={{ position: "absolute", right: -32, top: -32, width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.1)" }} />
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                <View>
                  {b.live_photo_url ? <Pressable onPress={() => setZoom({ url: mediaUrl(b.live_photo_url), label: "Live photo" })}><Image source={{ uri: mediaUrl(b.live_photo_url) }} style={{ width: 80, height: 80, borderRadius: 16, borderWidth: 4, borderColor: "rgba(255,255,255,0.3)" }} contentFit="cover" /></Pressable>
                    : <View style={{ width: 80, height: 80, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", borderWidth: 4, borderColor: "rgba(255,255,255,0.2)" }}><Icon name="account-outline" size={36} color="#fff" /></View>}
                  <View style={{ position: "absolute", bottom: -6, right: -6, width: 28, height: 28, borderRadius: 14, backgroundColor: "#10B981", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}><Icon name="shield-check-outline" size={16} color="#fff" /></View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#fff", fontSize: 24, fontWeight: "900" }} numberOfLines={1}>{b.full_name || user?.name || "Partner"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}><Icon name="phone-outline" size={14} color="#BFDBFE" /><Text style={{ color: "#BFDBFE", fontSize: 14 }}>{b.mobile || user?.phone}</Text></View>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                    {approved ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(52,211,153,0.9)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Icon name="shield-check-outline" size={14} color="#022C22" /><Text style={{ color: "#022C22", fontSize: 11, fontWeight: "700" }}>KYC Verified</Text></View> : null}
                    {isPremium ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FBBF24", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Icon name="crown-outline" size={14} color="#451A03" /><Text style={{ color: "#451A03", fontSize: 11, fontWeight: "700" }}>{(user as any)?.partner_badge || kit.data?.badge_label || "AzoApp Pro"}</Text></View> : null}
                    {typeof user?.rating === "number" && user.rating > 0 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Icon name="star" size={14} color="#fff" /><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{user.rating.toFixed(1)}</Text></View> : null}
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A", paddingHorizontal: 16, paddingVertical: 12 }}>
              <Icon name="lock-outline" size={20} color="#D97706" /><Text style={{ color: "#92400E", fontSize: 14, flex: 1, lineHeight: 20 }}>These are the details you submitted during registration. They are verified & locked. To change anything, please contact admin / support.</Text>
            </View>

            <Section icon="account-outline" title="Personal Information" sub="As submitted during registration">
              <Field icon="account-outline" label="Full Name" value={b.full_name} />
              <Field icon="phone-outline" label="Mobile" value={b.mobile} />
              <Field icon="cake-variant-outline" label="Date of Birth" value={b.dob} />
              <Field icon="account-group-outline" label="Gender" value={b.gender ? b.gender[0].toUpperCase() + b.gender.slice(1) : ""} />
              <Field icon="email-outline" label="Email" value={b.email} />
              <Field icon="school-outline" label="Education" value={b.education_name} />
              {b.merchant_name || b.merchant_code ? <Field icon="office-building-outline" label="Referred / Onboarded by" value={b.merchant_name ? `${b.merchant_name}${b.merchant_code ? ` (${b.merchant_code})` : ""}` : b.merchant_code} /> : null}
            </Section>

            <Section icon="briefcase-outline" title="Skills & Experience" sub={`${cats.length} service ${cats.length === 1 ? "category" : "categories"}`}>
              {cats.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {cats.map((c, i) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, borderWidth: 1, borderColor: "#BFDBFE", backgroundColor: colors.primarySubtle, paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Icon name="briefcase-outline" size={16} color={colors.primary} /><Text style={{ color: colors.text, fontSize: 14, fontWeight: "600" }}>{c.category_name}</Text>
                      {c.experience_label ? <View style={{ backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700" }}>{c.experience_label}</Text></View> : null}
                    </View>
                  ))}
                </View>
              ) : <Text style={{ color: SLATE400, fontSize: 14 }}>No skills recorded.</Text>}
            </Section>

            <Section icon="map-marker-outline" title="Address & Location">
              <Field icon="map-marker-outline" label="Full Address" value={a.manual_address || a.location_address} />
              <Field icon="office-building-outline" label="Locality" value={locality} />
              <Field icon="map-marker-outline" label="Pincode" value={b.pincode} />
              {mapLink ? <Pressable testID="view-map" onPress={() => Linking.openURL(mapLink)} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, backgroundColor: colors.secondary, padding: 14 }}><Icon name="map-marker-outline" size={20} color="#fff" /><Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>View pinned location on map</Text></Pressable> : null}
            </Section>

            <Section icon="card-account-details-outline" title="Documents & KYC">
              <Field icon="card-account-details-outline" label="Aadhaar Number" value={maskAadhaar(d.aadhaar_number)} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "space-between" }}>
                <DocTile label="Live Photo" url={b.live_photo_url} />
                <DocTile label="Aadhaar Front" url={d.aadhaar_front_url} />
                <DocTile label="Aadhaar Back" url={d.aadhaar_back_url} />
                <DocTile label="Education Cert" url={d.education_certificate_url} />
              </View>
            </Section>
          </>
        )}
      </ScrollView>

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(null)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 16 }} onPress={() => setZoom(null)}>
          <Pressable onPress={() => setZoom(null)} style={{ position: "absolute", top: insets.top + 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" }}><Icon name="close" size={20} color="#fff" /></Pressable>
          {zoom ? <><Image source={{ uri: zoom.url }} style={{ width: "100%", aspectRatio: 0.8, borderRadius: 16 }} contentFit="contain" /><Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 12 }}>{zoom.label}</Text></> : null}
        </Pressable>
      </Modal>
    </View>
  );
}
