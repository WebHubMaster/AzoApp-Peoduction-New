/**
 * Global font — makes the WHOLE app render in "Inter" (the exact family
 * the web panel uses) at the same size on every phone (OS font-scaling disabled) without editing every <Text>. We patch RN's <Text> and
 * <TextInput> render so each element picks the correct Inter weight file
 * based on its fontWeight. Elements that already declare an explicit fontFamily
 * (e.g. MaterialDesignIcons glyphs) are left untouched.
 *
 * Font files live in assets/fonts and are registered in app/_layout.tsx.
 */
import React from "react";
import { Text, TextInput, StyleSheet, Platform } from "react-native";

export const APP_FONTS = {
  "Inter-Regular": require("../../assets/fonts/Inter-Regular.ttf"),
  "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
  "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
  "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf"),
  "Inter-ExtraBold": require("../../assets/fonts/Inter-ExtraBold.ttf"),
  "Inter-Black": require("../../assets/fonts/Inter-Black.ttf"),
};

const WEIGHT_MAP: Record<string, string> = {
  "100": "Inter-Regular",
  "200": "Inter-Regular",
  "300": "Inter-Regular",
  "400": "Inter-Regular",
  normal: "Inter-Regular",
  "500": "Inter-Medium",
  "600": "Inter-SemiBold",
  "700": "Inter-Bold",
  bold: "Inter-Bold",
  "800": "Inter-ExtraBold",
  "900": "Inter-Black",
};

function familyFor(style: any): string {
  const flat = StyleSheet.flatten(style) || {};
  if (flat.fontFamily) return flat.fontFamily; // already explicit (icons etc.) — keep
  const w = flat.fontWeight != null ? String(flat.fontWeight) : "400";
  const base = WEIGHT_MAP[w] || "Inter-Regular";
  return base;
}

let patched = false;

/** WEB ONLY — RN-Web ignores our render-patch, so map the already-loaded
 * per-weight faces into a single "InterX" family via local() and force it
 * on all text nodes. Icons keep their inline fontFamily (higher precedence). */
function injectWebFont() {
  if (typeof document === "undefined") return;
  if (document.getElementById("azo-global-font")) return;
  const style = document.createElement("style");
  style.id = "azo-global-font";
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Asset } = require("expo-asset");
  const src = (k: keyof typeof APP_FONTS) => `url("${Asset.fromModule(APP_FONTS[k]).uri}")`;
  style.textContent = `
    @font-face { font-family:"InterX"; font-weight:100 400; src: ${src("Inter-Regular")}; }
    @font-face { font-family:"InterX"; font-weight:500; src: ${src("Inter-Medium")}; }
    @font-face { font-family:"InterX"; font-weight:600; src: ${src("Inter-SemiBold")}; }
    @font-face { font-family:"InterX"; font-weight:700; src: ${src("Inter-Bold")}; }
    @font-face { font-family:"InterX"; font-weight:800; src: ${src("Inter-ExtraBold")}; }
    @font-face { font-family:"InterX"; font-weight:900; src: ${src("Inter-Black")}; }
    #root * { font-family: "InterX", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
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

  // RN ≥0.80: <Text>/<TextInput> are plain function components (React 19 ref-as-prop),
  // so there is no `.render` to patch. Instead we wrap them and re-export the wrapper
  // through react-native's lazy module getters — every `import { Text }` resolves to
  // the wrapper at render time, so the whole app picks the right Inter face.
  const RN = require("react-native");
  const wrap = (Orig: any, name: string) => {
    const Wrapped = (props: any) => {
      // Same size on every phone: ignore the OS "font size" accessibility multiplier.
      const fixed = { ...props, allowFontScaling: false, maxFontSizeMultiplier: 1 };
      const flat = StyleSheet.flatten(props.style) || {};
      if (flat.fontFamily) return React.createElement(Orig, fixed);
      // weight is baked into the font file → drop fontWeight so Android never applies faux-bold
      const { fontWeight: _w, ...rest } = flat;
      // App-wide readability bump — scale up numeric font sizes (+ line heights) a touch.
      const FS = 1.09;
      if (typeof (rest as any).fontSize === "number") (rest as any).fontSize = Math.round((rest as any).fontSize * FS);
      if (typeof (rest as any).lineHeight === "number") (rest as any).lineHeight = Math.round((rest as any).lineHeight * FS);
      return React.createElement(Orig, { ...fixed, style: { ...rest, fontFamily: familyFor(flat) } });
    };
    Object.assign(Wrapped, Orig); // keep statics (TextInput.State, propTypes…)
    (Wrapped as any).displayName = name;
    return Wrapped;
  };
  const PatchedText = wrap(Text, "Text");
  const PatchedInput = wrap(TextInput, "TextInput");
  try {
    Object.defineProperty(RN, "Text", { get: () => PatchedText, configurable: true, enumerable: true });
    Object.defineProperty(RN, "TextInput", { get: () => PatchedInput, configurable: true, enumerable: true });
  } catch { /* non-configurable exports — leave defaults */ }
}
