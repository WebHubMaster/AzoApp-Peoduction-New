/** Inline video (native: WebView <video>; web: real <video>) — used to play work-proof clips inside the app. */
import React from "react";
import { Platform, View } from "react-native";

export const isVideoUrl = (u?: string | null) => /\.(mp4|mov|webm|3gp|mkv)(\?|$)/i.test(u || "");

export function InlineVideo({ uri, style, autoPlay = true, testID }: { uri: string; style?: any; autoPlay?: boolean; testID?: string }) {
  if (Platform.OS === "web") {
    return React.createElement("video", { src: uri, controls: true, autoPlay, playsInline: true, "data-testid": testID, style: { width: "100%", height: "100%", background: "#000", borderRadius: 6, objectFit: "contain", ...(style || {}) } });
  }
  // Lazy require keeps the web bundle free of the native module.
  const { WebView } = require("react-native-webview");
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}video{width:100%;height:100%;object-fit:contain}</style></head><body><video src="${uri}" controls ${autoPlay ? "autoplay" : ""} playsinline></video></body></html>`;
  return (
    <View testID={testID} style={[{ width: "100%", height: "100%", backgroundColor: "#000", borderRadius: 6, overflow: "hidden" }, style]}>
      <WebView originWhitelist={["*"]} source={{ html }} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled style={{ backgroundColor: "#000" }} />
    </View>
  );
}
