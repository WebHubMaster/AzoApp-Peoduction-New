/**
 * Global font — makes the WHOLE app render in "Public Sans" (the exact family
 * the web panel uses) without editing every <Text>. We patch RN's <Text> and
 * <TextInput> render so each element picks the correct Public Sans weight file
 * based on its fontWeight. Elements that already declare an explicit fontFamily
 * (e.g. MaterialDesignIcons glyphs) are left untouched.
 *
 * Font files live in assets/fonts and are registered in app/_layout.tsx.
 */
import React from "react";
import { Text, TextInput, StyleSheet, Platform } from "react-native";

export const PUBLIC_SANS_FONTS = {
  "PublicSans-Regular": require("../../assets/fonts/PublicSans-Regular.ttf"),
  "PublicSans-Medium": require("../../assets/fonts/PublicSans-Medium.ttf"),
  "PublicSans-SemiBold": require("../../assets/fonts/PublicSans-SemiBold.ttf"),
  "PublicSans-Bold": require("../../assets/fonts/PublicSans-Bold.ttf"),
  "PublicSans-ExtraBold": require("../../assets/fonts/PublicSans-ExtraBold.ttf"),
};

const WEIGHT_MAP: Record<string, string> = {
  "100": "PublicSans-Regular",
  "200": "PublicSans-Regular",
  "300": "PublicSans-Regular",
  "400": "PublicSans-Regular",
  normal: "PublicSans-Regular",
  "500": "PublicSans-Medium",
  "600": "PublicSans-SemiBold",
  "700": "PublicSans-Bold",
  bold: "PublicSans-Bold",
  "800": "PublicSans-ExtraBold",
  "900": "PublicSans-ExtraBold",
};

function familyFor(style: any): string {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return flat.fontFamily; // already explicit (icons etc.) — keep
  const w = flat.fontWeight != null ? String(flat.fontWeight) : "400";
  const base = WEIGHT_MAP[w] || "PublicSans-Regular";
  return base;
}

let patched = false;

/** WEB ONLY — RN-Web ignores our render-patch, so map the already-loaded
 * per-weight faces into a single "PublicSansX" family via local() and force it
 * on all text nodes. Icons keep their inline fontFamily (higher precedence). */
function injectWebFont() {
  if (typeof document === "undefined") return;
  if (document.getElementById("azo-global-font")) return;
  const style = document.createElement("style");
  style.id = "azo-global-font";
  style.textContent = `
    @font-face { font-family:"PublicSansX"; font-weight:300 400; src: local("PublicSans-Regular"); }
    @font-face { font-family:"PublicSansX"; font-weight:500; src: local("PublicSans-Medium"); }
    @font-face { font-family:"PublicSansX"; font-weight:600; src: local("PublicSans-SemiBold"); }
    @font-face { font-family:"PublicSansX"; font-weight:700; src: local("PublicSans-Bold"); }
    @font-face { font-family:"PublicSansX"; font-weight:800 900; src: local("PublicSans-ExtraBold"); }
    #root * { font-family: "PublicSansX", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  `;
  document.head.appendChild(style);
}

/** Call ONCE, after fonts are loaded. Idempotent. */
export function installGlobalFont() {
  if (patched) return;
  patched = true;

  if (Platform.OS === "web") {
    injectWebFont();
    return;
  }

  for (const Comp of [Text, TextInput] as any[]) {
    const orig = Comp.render;
    if (typeof orig !== "function") continue;
    Comp.render = function (...args: any[]) {
      const el = orig.apply(this, args);
      if (!el) return el;
      const style = el.props?.style;
      const flat = StyleSheet.flatten(style) || {};
      if (flat.fontFamily) return el; // don't override explicit families (icons)
      const fontFamily = familyFor(flat);
      return React.cloneElement(el, { style: { ...flat, fontFamily } });
    };
  }
}
