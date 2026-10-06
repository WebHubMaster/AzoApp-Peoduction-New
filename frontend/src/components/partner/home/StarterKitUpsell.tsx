import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { Icon, MdiName } from "@/src/components/Icon";

const BENEFIT_ICONS: MdiName[] = [
  "flash-outline",
  "crown-outline",
  "check-decagram-outline",
  "shield-check-outline",
];

type Offer = {
  headline?: string;
  subheadline?: string;
  body?: string;
  benefits?: string[];
  cta_label?: string;
};

/** Premium Starter-Kit upgrade popup shown to approved Free partners who have not
 *  purchased the Starter Kit. Reappears every admin-configured N days after dismiss. */
export function StarterKitUpsell() {
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let alive = true;
    api.get<any>("/partner/starter-kit-upsell")
      .then((r) => { if (alive && r?.show) { setOffer(r.offer || {}); setVisible(true); } })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const dismiss = () => {
    setVisible(false);
    api.post("/partner/starter-kit-upsell/dismiss").catch(() => {});
  };

  const upgrade = () => {
    setVisible(false);
    api.post("/partner/starter-kit-upsell/dismiss").catch(() => {});
    router.push("/partner/starter-kit" as any);
  };

  if (!offer) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: "rgba(2,6,23,0.72)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View testID="starter-kit-upsell-popup" style={{ width: "100%", maxWidth: 420, borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: "rgba(251,191,36,0.35)" }}>
          <LinearGradient colors={["#0F172A", "#1E293B", "#0F172A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 0 }}>
            <ScrollView contentContainerStyle={{ padding: 26 }} showsVerticalScrollIndicator={false}>
              <Pressable testID="upsell-dismiss" onPress={dismiss} hitSlop={10}
                style={{ position: "absolute", right: 16, top: 16, zIndex: 10, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" }}>
                <Icon name="close" size={18} color="rgba(255,255,255,0.85)" />
              </Pressable>

              <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(251,191,36,0.15)", borderWidth: 1, borderColor: "rgba(251,191,36,0.3)", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Icon name="crown-outline" size={14} color="#FCD34D" />
                <Text style={{ color: "#FCD34D", fontSize: 11, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" }}>Exclusive Pro Offer</Text>
              </View>

              <Text style={{ color: "#FDE68A", fontSize: 28, fontWeight: "900", marginTop: 16, lineHeight: 32 }}>
                {offer.headline || "Get Jobs Before Others"}
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "700", marginTop: 8 }}>
                {offer.subheadline}
              </Text>
              {offer.body ? (
                <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 6, lineHeight: 19 }}>{offer.body}</Text>
              ) : null}

              <View style={{ gap: 12, marginTop: 20 }}>
                {(offer.benefits || []).map((b, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(251,191,36,0.15)", borderWidth: 1, borderColor: "rgba(251,191,36,0.25)", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={BENEFIT_ICONS[i % BENEFIT_ICONS.length]} size={16} color="#FCD34D" />
                    </View>
                    <Text style={{ flex: 1, color: "rgba(255,255,255,0.92)", fontSize: 14, fontWeight: "600", lineHeight: 20 }}>{b}</Text>
                  </View>
                ))}
              </View>

              <Pressable testID="upsell-upgrade-btn" onPress={upgrade}
                style={({ pressed }) => ({ marginTop: 24, borderRadius: 14, overflow: "hidden", transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <LinearGradient colors={["#FBBF24", "#F59E0B"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Icon name="crown-outline" size={20} color="#0F172A" />
                  <Text style={{ color: "#0F172A", fontSize: 15, fontWeight: "900" }}>{offer.cta_label || "Upgrade to Pro"}</Text>
                </LinearGradient>
              </Pressable>
              <Pressable testID="upsell-maybe-later" onPress={dismiss} hitSlop={8} style={{ marginTop: 8, paddingVertical: 8, alignItems: "center" }}>
                <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700" }}>Maybe later</Text>
              </Pressable>
            </ScrollView>
          </LinearGradient>
        </View>
      </View>
    </Modal>
  );
}
