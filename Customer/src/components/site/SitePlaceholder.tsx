/** Placeholder for public pages not yet ported (services, book, membership, service/[id], blog, about, contact). */
import React from "react";
import { View, Text } from "react-native";
import { usePathname, useLocalSearchParams } from "expo-router";
import { Construction } from "lucide-react-native";
import { SLATE } from "@/src/theme";
import { EmptyState } from "@/src/components/customer/ux";

const TITLES: Record<string, string> = { services: "All Services", book: "Booking", membership: "Membership", service: "Service Details", blog: "Blog", about: "About us", contact: "Contact us" };

export function SitePlaceholder() {
  const pathname = usePathname();
  const params = useLocalSearchParams();
  const segs = pathname.split("/").filter(Boolean);
  const key = segs[0] || "";
  const sub = [...segs.slice(1), ...Object.entries(params).filter(([k]) => k !== "page").map(([k, v]) => `${k}: ${v}`)].join(" · ");
  return (
    <View testID={`site-page-${key}`} style={{ padding: 16, gap: 20 }}>
      <View>
        <Text testID="page-title" style={{ fontWeight: "900", fontSize: 24, color: SLATE[900] }}>{TITLES[key] || key}</Text>
        {sub ? <Text style={{ color: SLATE[500], fontSize: 14, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      <EmptyState icon={Construction} title="Coming next" desc="This page will be ported from the Customer Web Panel in the next step." testID="coming-soon" />
    </View>
  );
}
