/** Web story video — a real DOM <video> (react-native-web renders via react-dom).
 * Autoplays, reports `ended` for auto-advance, and reacts to the mute toggle. */
import React, { useEffect, useRef } from "react";

export function StoryVideo({ url, poster, muted, onEnded }: { url: string; poster?: string; muted: boolean; onEnded?: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.muted = muted; const p = v.play?.(); if (p && p.catch) p.catch(() => {}); }
  }, [muted]);
  return React.createElement("video", {
    ref,
    src: url,
    poster: poster || undefined,
    autoPlay: true,
    muted,
    playsInline: true,
    controls: false,
    onEnded,
    "data-testid": "story-video",
    style: { width: "100%", height: "100%", objectFit: "contain", background: "#000" },
  });
}
