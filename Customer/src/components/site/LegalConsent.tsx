/** Terms & Privacy consent — required checkbox on account create, with the full
 *  policy opening in an in-app WebView (points to the public /api/legal/{doc}). */
import React, { useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator, Platform } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import { PRIMARY, TC, useTheme } from "@/src/theme";
import { API_BASE } from "@/src/api/client";

const legalUrl = (doc: "terms" | "privacy") => `${API_BASE}/legal/${doc}`;

function LegalModal({ doc, onClose }: { doc: "terms" | "privacy" | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { c, isDark } = useTheme();
  const title = doc === "privacy" ? "Privacy Policy" : "Terms & Conditions";
  return (
    <Modal visible={!!doc} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.surface, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.borderSoft }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: "700", color: c.text }}>{title}</Text>
          <Pressable testID="legal-close" onPress={onClose} style={{ height: 36, width: 36, borderRadius: 8, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" }}><X size={16} color={c.text} /></Pressable>
        </View>
        {doc ? (
          Platform.OS === "web"
            ? React.createElement("iframe", { title, src: legalUrl(doc), style: { flex: 1, width: "100%", height: "100%", border: 0 } })
            : <WebView testID="legal-webview" source={{ uri: legalUrl(doc) }} startInLoadingState renderLoading={() => <ActivityIndicator color={PRIMARY[600]} style={{ marginTop: 40 }} />} style={{ flex: 1, backgroundColor: isDark ? "#0B1220" : "#F8FAFC" }} />
        ) : null}
      </View>
    </Modal>
  );
}

export function LegalConsent({ checked, onChange, testID = "legal-consent" }: { checked: boolean; onChange: (v: boolean) => void; testID?: string }) {
  const { c } = useTheme();
  const [doc, setDoc] = useState<"terms" | "privacy" | null>(null);
  return (
    <View>
      <Pressable testID={testID} onPress={() => onChange(!checked)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View testID={`${testID}-box`} style={{ marginTop: 1, height: 22, width: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? PRIMARY[700] : TC.border, backgroundColor: checked ? PRIMARY[700] : "transparent", alignItems: "center", justifyContent: "center" }}>
          {checked ? <Check size={14} color="#fff" /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: c.textMuted }}>
          I agree to the{" "}
          <Text testID={`${testID}-terms`} onPress={() => setDoc("terms")} style={{ color: PRIMARY[600], fontWeight: "700" }}>Terms &amp; Conditions</Text>
          {" "}and{" "}
          <Text testID={`${testID}-privacy`} onPress={() => setDoc("privacy")} style={{ color: PRIMARY[600], fontWeight: "700" }}>Privacy Policy</Text>.
        </Text>
      </Pressable>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </View>
  );
}
