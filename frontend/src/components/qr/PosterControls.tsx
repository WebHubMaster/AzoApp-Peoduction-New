import React, { useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { Icon } from "@/src/components/Icon";
import { TEMPLATES, COLOR_PRESETS, QrConfig, isHex6 } from "@/src/pages/merchant/qrData";
import { KitLabel, SLATE, useQrPalette } from "@/src/components/qr/qrKit";

/* 1:1 port of web_panel PosterControls.jsx (Template · Colour Theme · Business Logo · Show/Hide). */

function TemplateSwatch({ tpl }: { tpl: (typeof TEMPLATES)[number] }) {
  const v = tpl.variant;
  const lightish = ["light", "minimal", "soft", "band", "print", "cream"].includes(v);
  const base = { height: 40, borderRadius: 8, marginBottom: 6, borderWidth: lightish ? 1 : 0, borderColor: `${tpl.primary}33` } as const;
  if (v === "gradient") return <LinearGradient colors={[tpl.primary, tpl.primary2 || "#2563eb"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base} />;
  if (v === "luxe") return <LinearGradient colors={["#1f2a44", "#0B1220"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base} />;
  if (v === "cream") return <LinearGradient colors={["#FAF7F0", "#EAD9A8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={base} />;
  return <View style={[base, { backgroundColor: v === "solid" ? tpl.primary : "#f1f5f9" }]} />;
}

export function PosterControls({ config, setConfig, adminLogo }: { config: QrConfig; setConfig: (patch: Partial<QrConfig>) => void; adminLogo: string }) {
  const { P, dark, heading, body, muted } = useQrPalette();
  const [customOpen, setCustomOpen] = useState(false);
  const [hex, setHex] = useState(config.primary);
  const setShow = (k: "logo" | "tagline", v: boolean) => setConfig({ show: { ...config.show, [k]: v } });
  const border = dark ? SLATE[700] : SLATE[200];

  return (
    <View style={{ gap: 24 }} testID="poster-controls">
      {/* Templates */}
      <View>
        <KitLabel>Template</KitLabel>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 }}>
          {TEMPLATES.map((t) => {
            const on = config.template === t.id;
            return (
              <Pressable key={t.id} testID={`tpl-${t.id}`} onPress={() => setConfig({ template: t.id, primary: t.primary, preset: "template" })} style={{ width: "48.5%", borderRadius: 12, borderWidth: 2, borderColor: on ? P[600] : border, padding: 8 }}>
                <TemplateSwatch tpl={t} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: dark ? SLATE[300] : SLATE[600] }} numberOfLines={1}>{t.label}</Text>
                {on ? <View style={{ position: "absolute", top: 4, right: 4, height: 16, width: 16, borderRadius: 8, backgroundColor: P[600], alignItems: "center", justifyContent: "center" }}><Icon name="check" size={10} color="#fff" /></View> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Colours */}
      <View>
        <KitLabel>Colour Theme</KitLabel>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          {COLOR_PRESETS.map((c) => {
            const on = config.primary === c.primary;
            return <Pressable key={c.id} testID={`color-${c.id}`} onPress={() => setConfig({ preset: c.id, primary: c.primary })} style={{ height: 36, width: 36, borderRadius: 12, backgroundColor: c.primary, borderWidth: 2, borderColor: on ? (dark ? "#fff" : SLATE[900]) : "transparent", transform: [{ scale: on ? 1.1 : 1 }] }} />;
          })}
          <Pressable testID="color-custom" onPress={() => { setHex(config.primary); setCustomOpen((o) => !o); }} style={{ height: 36, width: 36, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", borderColor: SLATE[300], alignItems: "center", justifyContent: "center" }}>
            <Icon name="plus" size={16} color={SLATE[400]} />
          </Pressable>
        </View>
        {customOpen ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <View style={{ height: 36, width: 36, borderRadius: 10, backgroundColor: isHex6(hex) ? hex : SLATE[200], borderWidth: 1, borderColor: border }} />
            <TextInput testID="color-custom-input" value={hex} onChangeText={(v) => { const h = v.startsWith("#") ? v : `#${v}`; setHex(h.slice(0, 7)); if (isHex6(h)) setConfig({ preset: "custom", primary: h }); }} autoCapitalize="none" placeholder="#0D47A1" placeholderTextColor={SLATE[400]} style={{ flex: 1, height: 36, borderWidth: 1, borderColor: border, borderRadius: 8, paddingHorizontal: 10, fontSize: 13, color: heading, backgroundColor: dark ? SLATE[900] : "#fff" }} />
          </View>
        ) : null}
      </View>

      {/* Logo — admin managed (read-only) */}
      <View>
        <KitLabel>Business Logo</KitLabel>
        <View testID="logo-managed" style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: dark ? "rgba(30,41,59,0.5)" : SLATE[50], padding: 12 }}>
          {adminLogo ? (
            <View style={{ height: 56, width: 56, borderRadius: 8, borderWidth: 1, borderColor: SLATE[200], backgroundColor: "#fff", padding: 4 }}>
              <Image source={{ uri: adminLogo }} style={{ flex: 1 }} contentFit="contain" />
            </View>
          ) : (
            <View style={{ height: 56, width: 56, borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: SLATE[300], alignItems: "center", justifyContent: "center" }}><Icon name="image-off" size={20} color={SLATE[400]} /></View>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="shield-check" size={16} color={P[600]} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: body }}>Managed by AzoApp</Text>
            </View>
            <Text style={{ fontSize: 12, lineHeight: 16, color: muted, marginTop: 2 }}>{adminLogo ? "Your official logo is applied automatically and shown at the top of the poster." : "No logo set yet — it will appear here once added by the AzoApp team."}</Text>
          </View>
        </View>
      </View>

      {/* Toggles */}
      <View>
        <KitLabel>Show / Hide Elements</KitLabel>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {([["logo", "Logo"], ["tagline", "Trusted Home Services"]] as ["logo" | "tagline", string][]).map(([k, l]) => {
            const val = !!config.show?.[k];
            return (
              <Pressable key={k} testID={`show-${k}`} onPress={() => setShow(k, !val)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ height: 16, width: 16, borderRadius: 3, borderWidth: 1.5, borderColor: val ? P[600] : SLATE[400], backgroundColor: val ? P[600] : "transparent", alignItems: "center", justifyContent: "center" }}>
                  {val ? <Icon name="check" size={12} color="#fff" /> : null}
                </View>
                <Text style={{ fontSize: 14, color: dark ? SLATE[300] : SLATE[600], flexShrink: 1 }} numberOfLines={1}>{l}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default PosterControls;
