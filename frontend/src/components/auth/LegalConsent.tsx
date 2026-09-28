/** Terms & Privacy consent — required checkbox on Partner/Merchant account create,
 *  full policy opens in an in-app WebView (public /api/legal/{doc}). */
import React, { useState } from "react";
import { View, Text, Pressable, Modal, ActivityIndicator } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/src/components/Icon";
import { API_BASE } from "@/src/api/client";
import { AUTH, FS } from "./AuthUi";

const legalUrl = (doc: "terms" | "privacy") => `${API_BASE}/legal/${doc}`;

function LegalModal({ doc, onClose }: { doc: "terms" | "privacy" | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const title = doc === "privacy" ? "Privacy Policy" : "Terms & Conditions";
  return (
    <Modal visible={!!doc} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: AUTH.line }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: "800", color: AUTH.ink }}>{title}</Text>
          <Pressable testID="legal-close" onPress={onClose} style={{ height: 36, width: 36, borderRadius: 8, borderWidth: 1, borderColor: AUTH.line, alignItems: "center", justifyContent: "center" }}><Icon name="close" size={18} color={AUTH.ink} /></Pressable>
        </View>
        {doc ? <WebView testID="legal-webview" source={{ uri: legalUrl(doc) }} startInLoadingState renderLoading={() => <ActivityIndicator color={AUTH.blue} style={{ marginTop: 40 }} />} style={{ flex: 1, backgroundColor: "#F8FAFC" }} /> : null}
      </View>
    </Modal>
  );
}

export function LegalConsent({ checked, onChange, accent = AUTH.blue, testID = "legal-consent" }: { checked: boolean; onChange: (v: boolean) => void; accent?: string; testID?: string }) {
  const [doc, setDoc] = useState<"terms" | "privacy" | null>(null);
  return (
    <View>
      <Pressable testID={testID} onPress={() => onChange(!checked)} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <View testID={`${testID}-box`} style={{ marginTop: 1, height: 22, width: 22, borderRadius: 6, borderWidth: 2, borderColor: checked ? accent : AUTH.line, backgroundColor: checked ? accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {checked ? <Icon name="check" size={14} color="#fff" /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: FS.small, lineHeight: 18, color: AUTH.muted }}>
          I agree to the{" "}
          <Text testID={`${testID}-terms`} onPress={() => setDoc("terms")} style={{ color: accent, fontWeight: "800" }}>Terms &amp; Conditions</Text>
          {" "}and{" "}
          <Text testID={`${testID}-privacy`} onPress={() => setDoc("privacy")} style={{ color: accent, fontWeight: "800" }}>Privacy Policy</Text>.
        </Text>
      </Pressable>
      <LegalModal doc={doc} onClose={() => setDoc(null)} />
    </View>
  );
}
