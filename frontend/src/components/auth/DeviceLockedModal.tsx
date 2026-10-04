import React from "react";
import { View, Text, Pressable, Modal } from "react-native";
import { Icon } from "@/src/components/Icon";
import { useSupportContact } from "./AuthUi";

/**
 * Full-screen blocking notice shown when a partner tries to log in from a device
 * that is NOT their registered one (single-device lock). Gives the exact message
 * plus a Support Contact button so they can request an admin "Reset Device".
 */
export function DeviceLockedModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const openSupport = useSupportContact();
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.55)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View testID="device-locked-modal" style={{ width: "100%", maxWidth: 400, backgroundColor: "#fff", borderRadius: 10, padding: 24, alignItems: "center", gap: 6 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: "#FEF2F2", alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
            <Icon name="cellphone-lock" size={38} color="#E11D48" />
          </View>
          <Text testID="device-locked-title" style={{ color: "#0F172A", fontSize: 20, fontWeight: "900", textAlign: "center" }}>Device not registered</Text>
          <Text testID="device-locked-message" style={{ color: "#475569", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 4 }}>
            This account is registered on another device. Please contact Support for help.
          </Text>

          <Pressable testID="device-locked-support" onPress={openSupport} style={({ pressed }) => ({ marginTop: 18, width: "100%", height: 54, borderRadius: 6, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Icon name="headset" size={22} color="#fff" />
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>Contact Support</Text>
          </Pressable>
          <Pressable testID="device-locked-close" onPress={onClose} hitSlop={8} style={{ marginTop: 12, paddingVertical: 8 }}>
            <Text style={{ color: "#64748B", fontSize: 14, fontWeight: "700" }}>Try a different number</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
