/** Placeholder for pages not yet ported (page-by-page development). Shows the web SectionHeader style. */
import React from "react";
import { View, Text } from "react-native";
import { usePathname, useLocalSearchParams } from "expo-router";
import { Construction } from "lucide-react-native";
import { useTheme } from "@/src/theme";
import { NAV } from "@/src/components/customer/nav";
import { EmptyState } from "@/src/components/customer/ux";

export default function ComingSoon() {
  const { c } = useTheme();
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const seg = pathname.split("/").filter(Boolean).pop() || "";
  const item = NAV.find((n) => n.key === seg);
  const title = item?.label || (seg === "services" ? "Services" : seg.replace(/_/g, " "));
  const sub = Object.keys(params).length ? Object.entries(params).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
  return (
    <View testID={`page-${seg}`} style={{ gap: 20 }}>
      <View>
        <Text testID="page-title" style={{ fontWeight: "900", fontSize: 24, color: c.text }}>{title}</Text>
        {sub ? <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <EmptyState icon={Construction} title="Coming next" desc="This page will be ported from the Customer Web Panel in the next step." testID="coming-soon" />
    </View>
  );
}
