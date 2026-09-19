import React from "react";
import { View, Text } from "react-native";
import { WebView } from "react-native-webview";
import { MapPin } from "lucide-react-native";
import { TW, T } from "./tokens";

/* OpenStreetMap embed preview — same iframe URL as the web panel */
export function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.004}%2C${lat - 0.003}%2C${lng + 0.004}%2C${lat + 0.003}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <View testID="address-map" style={{ borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: TW.slate200 }}>
      <WebView source={{ uri: src }} style={{ height: 180, backgroundColor: TW.slate100 }} scrollEnabled={false} />
      <View style={{ backgroundColor: TW.slate50, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", gap: 4 }}>
        <MapPin size={12} color={TW.slate500} />
        <Text style={{ ...T.px11, color: TW.slate500 }}>{Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}</Text>
      </View>
    </View>
  );
}
