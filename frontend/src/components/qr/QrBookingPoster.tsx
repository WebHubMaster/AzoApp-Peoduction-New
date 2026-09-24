import React from "react";
import { View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import QRCode from "react-native-qrcode-svg";
import Svg, { Path, Rect, Circle } from "react-native-svg";
import { adjust, withAlpha, isHex6, POSTER_BASE, POSTER_SERVICES, LUCIDE } from "@/src/pages/merchant/qrData";

/**
 * QrBookingPoster (native) — a faithful React-Native port of the Web Panel's
 * single source-of-truth poster (web_panel/src/components/qr/QrBookingPoster.jsx).
 * Same fixed 384×576 coordinate system: every value is multiplied by `scale`, so
 * the identical node renders tiny (preview) or large (export). White card, brand-
 * primary decorative accents, corner-bracketed QR, gradient CTA, 5 service glyphs
 * and footer — byte-for-byte matching the web poster design.
 */

export interface PosterBrand {
  logo?: string;
  siteName?: string;
  primary?: string;
  secondary?: string;
}

function LucideIcon({ paths, size, color, strokeWidth = 1.9 }: { paths: string[]; size: number; color: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

function ScanPhone({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect x={8} y={3} width={16} height={26} rx={3} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12.5 12.5v-1.5h1.5M18 11h1.5v1.5M19.5 18v1.5H18M14 19.5h-1.5V18" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={16} cy={15.5} r={0.9} fill={color} />
    </Svg>
  );
}

export function QrBookingPoster({
  qrValue = "",
  token = "",
  merchantName = "",
  brand = {},
  trustLine = "Trusted Home Services",
  scale = 1,
  width,
  height,
  link = "",
}: {
  qrValue?: string;
  token?: string;
  merchantName?: string;
  brand?: PosterBrand;
  trustLine?: string;
  scale?: number;
  width?: number;
  height?: number;
  /** optional booking-link line under the footer (used on the exported/shared poster) */
  link?: string;
}) {
  const S = (n: number) => n * scale;
  // web parity: when a canvas size is given the poster FILLS it (space-between layout)
  const bodyW = width != null ? width : POSTER_BASE.w * scale;
  const bodyH = height != null ? height : POSTER_BASE.h * scale;

  const primary = isHex6(brand.primary) ? (brand.primary as string) : "#0D47A1";
  const secondary = isHex6(brand.secondary) ? (brand.secondary as string) : adjust(primary, 46);
  const logo = brand.logo || "";
  const siteName = brand.siteName || "AzoApp";

  const pale = withAlpha(primary, "14"); // ~8%
  const paleSoft = withAlpha(primary, "0F"); // ~6%

  const qrSize = 156;

  return (
    <View style={{ width: bodyW, height: bodyH, backgroundColor: "#FFFFFF", position: "relative", overflow: "hidden" }}>
      {/* ── decorative bleed shapes (behind content) ── */}
      <LinearGradient colors={[primary, secondary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: -S(70), left: -S(70), width: S(150), height: S(150), borderRadius: S(75) }} />
      <View style={{ position: "absolute", bottom: -S(198), right: -S(95), width: S(244), height: S(244), borderRadius: S(122), backgroundColor: paleSoft }} />
      <LinearGradient colors={[secondary, primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", bottom: -S(176), right: -S(70), width: S(206), height: S(206), borderRadius: S(103) }} />
      <View style={{ position: "absolute", bottom: -S(110), left: -S(72), width: S(150), height: S(150), borderRadius: S(75), backgroundColor: pale }} />

      {/* ── content: 4 groups evenly distributed (space-between) ── */}
      <View style={{ position: "relative", zIndex: 1, height: "100%", paddingTop: S(30), paddingHorizontal: S(24), paddingBottom: S(16), justifyContent: "space-between", alignItems: "center" }}>
        {/* GROUP 1 — brand */}
        <View style={{ width: "100%", alignItems: "center" }}>
          {logo ? (
            <Image source={{ uri: logo }} style={{ height: S(46), width: S(200) }} contentFit="contain" />
          ) : (
            <Text style={{ fontSize: S(56), fontWeight: "900", letterSpacing: -S(2), color: primary, lineHeight: S(56) }}>{siteName}</Text>
          )}

          {merchantName ? (
            <>
              <Text style={{ marginTop: S(8), fontSize: S(9), fontWeight: "800", letterSpacing: S(2), color: withAlpha(primary, "B3") }}>
                {siteName.toUpperCase()} PARTNER
              </Text>
              <Text numberOfLines={2} style={{ marginTop: S(2), fontSize: S(21), fontWeight: "900", color: "#1F2A3A", lineHeight: S(22), textAlign: "center", maxWidth: S(300) }}>
                {merchantName}
              </Text>
            </>
          ) : null}

          {trustLine ? (
            <View style={{ marginTop: S(merchantName ? 3 : 0), flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
              <View style={{ width: S(18), height: S(2), borderRadius: S(2), backgroundColor: primary, marginRight: S(8) }} />
              <Text style={{ fontSize: S(12), fontWeight: "700", letterSpacing: S(0.3), color: primary }}>{trustLine}</Text>
              <View style={{ width: S(18), height: S(2), borderRadius: S(2), backgroundColor: primary, marginLeft: S(8) }} />
            </View>
          ) : null}
        </View>

        {/* GROUP 2 — QR card + token */}
        <View style={{ alignItems: "center" }}>
          <View style={{ backgroundColor: "#fff", borderRadius: S(22), padding: S(17), position: "relative", boxShadow: `0px ${S(10)}px ${S(26)}px ${withAlpha(primary, "26")}` }}>
            {[
              { top: S(10), left: S(10), sides: ["top", "left"] },
              { top: S(10), right: S(10), sides: ["top", "right"] },
              { bottom: S(10), left: S(10), sides: ["bottom", "left"] },
              { bottom: S(10), right: S(10), sides: ["bottom", "right"] },
            ].map((c, i) => (
              <View
                key={i}
                style={{
                  position: "absolute",
                  width: S(28),
                  height: S(28),
                  top: (c as any).top,
                  bottom: (c as any).bottom,
                  left: (c as any).left,
                  right: (c as any).right,
                  borderColor: secondary,
                  borderTopWidth: c.sides.includes("top") ? S(5) : 0,
                  borderBottomWidth: c.sides.includes("bottom") ? S(5) : 0,
                  borderLeftWidth: c.sides.includes("left") ? S(5) : 0,
                  borderRightWidth: c.sides.includes("right") ? S(5) : 0,
                  borderTopLeftRadius: c.sides.includes("top") && c.sides.includes("left") ? S(4) : 0,
                  borderTopRightRadius: c.sides.includes("top") && c.sides.includes("right") ? S(4) : 0,
                  borderBottomLeftRadius: c.sides.includes("bottom") && c.sides.includes("left") ? S(4) : 0,
                  borderBottomRightRadius: c.sides.includes("bottom") && c.sides.includes("right") ? S(4) : 0,
                }}
              />
            ))}
            <QRCode value={qrValue || " "} size={S(qrSize)} color="#0f172a" backgroundColor="#ffffff" />
          </View>
          {token ? <Text style={{ marginTop: S(6), fontFamily: "monospace", fontSize: S(10), letterSpacing: S(1), color: "#B4BECC" }}>{token}</Text> : null}
        </View>

        {/* GROUP 3 — CTA button */}
        <View style={{ width: "100%", alignItems: "center" }}>
          <LinearGradient
            colors={[adjust(primary, 34), primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: "relative", width: S(324), maxWidth: "100%", height: S(64), borderRadius: S(50), boxShadow: `0px ${S(12)}px ${S(26)}px ${withAlpha(primary, "59")}` }}
          >
            {/* left glyph circle */}
            <View style={{ position: "absolute", left: S(9), top: S(9), height: S(46), width: S(46), borderRadius: S(23), backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }}>
              <ScanPhone size={S(26)} color={primary} />
            </View>
            {/* divider */}
            <View style={{ position: "absolute", left: S(64), top: S(16), width: S(1.5), height: S(32), backgroundColor: "rgba(255,255,255,0.5)" }} />
            {/* centred text */}
            <View style={{ position: "absolute", left: 0, right: 0, top: S(15), alignItems: "center" }}>
              <Text style={{ fontSize: S(16), fontWeight: "800", color: "#fff", lineHeight: S(18) }}>Scan to Book a Service</Text>
              <Text style={{ fontSize: S(9), fontWeight: "600", letterSpacing: S(0.5), color: "rgba(255,255,255,0.82)", marginTop: S(2) }}>Fast  •  Easy  •  Trusted</Text>
            </View>
            {/* right chevron circle */}
            <View style={{ position: "absolute", right: S(9), top: S(11), height: S(42), width: S(42), borderRadius: S(21), backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
              <LucideIcon paths={LUCIDE.chevronRight} size={S(23)} color="#fff" strokeWidth={2.8} />
            </View>
          </LinearGradient>
        </View>

        {/* GROUP 4 — services + footer */}
        <View style={{ width: "100%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            {POSTER_SERVICES.map((s, i) => (
              <View key={i} style={{ width: S(63), alignItems: "center" }}>
                <View style={{ width: S(44), height: S(44), borderRadius: S(22), backgroundColor: pale, alignItems: "center", justifyContent: "center" }}>
                  <LucideIcon paths={LUCIDE[s.icon]} size={S(23)} color={primary} />
                </View>
                <Text style={{ marginTop: S(6), fontSize: S(9.5), fontWeight: "700", color: "#2C3A4B", textAlign: "center", lineHeight: S(11) }}>{s.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: S(12), width: "100%", textAlign: "center", fontSize: S(8.5), fontWeight: "700", letterSpacing: S(1.4), color: withAlpha(primary, "B3") }}>
            — BETTER HOMES BRIGHTER TOMORROW —
          </Text>
          {link ? (
            <Text numberOfLines={1} style={{ marginTop: S(7), width: "100%", textAlign: "center", fontSize: S(9.5), fontWeight: "600", color: primary }}>{link}</Text>
          ) : null}
        </View>
      </View>

      {/* top-right corner circle + script tagline (above content, decorative) */}
      <View style={{ position: "absolute", top: -S(42), right: -S(42), width: S(172), height: S(172), borderRadius: S(86), backgroundColor: pale, zIndex: 2 }} />
      <View style={{ position: "absolute", top: S(28), right: S(10), width: S(120), alignItems: "center", zIndex: 3 }}>
        <Text style={{ fontSize: S(13), fontStyle: "italic", color: primary, lineHeight: S(15) }}>Your Home</Text>
        <Text style={{ fontSize: S(13), fontStyle: "italic", fontWeight: "700", color: primary, lineHeight: S(15) }}>Our Priority</Text>
      </View>
    </View>
  );
}

export default QrBookingPoster;
