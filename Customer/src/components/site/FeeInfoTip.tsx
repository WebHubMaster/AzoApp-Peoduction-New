import React, { useRef, useState } from "react";
import { View, Text, Pressable, Modal, useWindowDimensions } from "react-native";
import { Info } from "lucide-react-native";
import { SLATE } from "@/src/theme";
import { useSiteConfig } from "@/src/context/BrandContext";

/**
 * Small ⓘ icon shown next to "Platform fee" / "Est. Govt. Taxes" in the booking
 * price details. Tapping reveals an admin-configured info tooltip (General Settings
 * → Fees & Taxes → public site config `fee_info`). Renders nothing when no info
 * text is configured. White card + dark text to match the web tooltip.
 *
 * `kind` = "tax" | "platform_fee"
 */
export function FeeInfoTip({ kind }: { kind: "tax" | "platform_fee" }) {
  const cfg = useSiteConfig();
  const text = String((cfg?.fee_info as any)?.[kind] || "").trim();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<View>(null);
  const { width } = useWindowDimensions();
  if (!text) return null;

  const CARD_W = Math.min(260, width - 32);
  const openTip = () => {
    const node = ref.current as any;
    if (node?.measureInWindow) {
      node.measureInWindow((x: number, y: number, w: number, h: number) => {
        setPos({ x: x + (w || 0) / 2, y: y + (h || 16) });
        setOpen(true);
      });
    } else setOpen(true);
  };
  const left = pos ? Math.max(16, Math.min(pos.x - CARD_W / 2, width - 16 - CARD_W)) : (width - CARD_W) / 2;
  const top = pos ? pos.y + 6 : 120;

  return (
    <>
      <Pressable ref={ref} testID={`fee-info-${kind}`} accessibilityLabel={`${kind === "tax" ? "Tax" : "Platform fee"} info`} onPress={openTip} hitSlop={10} style={{ marginLeft: 4 }}>
        <Info size={14} color={SLATE[400]} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            testID={`fee-info-tip-${kind}`}
            style={{
              position: "absolute", left, top, width: CARD_W,
              backgroundColor: "#FFFFFF", borderRadius: 6, borderWidth: 1, borderColor: SLATE[200],
              paddingHorizontal: 12, paddingVertical: 10,
              shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
            }}
          >
            <Text style={{ fontSize: 12, lineHeight: 17, color: SLATE[700] }}>{text}</Text>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default FeeInfoTip;
