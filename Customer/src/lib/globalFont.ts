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

  // RN ≥0.80: <Text>/<TextInput> are plain function components (React 19 ref-as-prop),
  // so there is no `.render` to patch. Instead we wrap them and re-export the wrapper
  // through react-native's lazy module getters — every `import { Text }` resolves to
  // the wrapper at render time, so the whole app picks the right Public Sans face.
  const RN = require("react-native");
  const wrap = (Orig: any, name: string) => {
    const Wrapped = (props: any) => {
      const flat = StyleSheet.flatten(props.style) || {};
      if (flat.fontFamily) return React.createElement(Orig, props);
      // weight is baked into the font file → drop fontWeight so Android never applies faux-bold
      const { fontWeight: _w, ...rest } = flat;
      return React.createElement(Orig, { ...props, style: { ...rest, fontFamily: familyFor(flat) } });
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
