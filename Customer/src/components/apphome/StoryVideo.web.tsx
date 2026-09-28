/** Web story video — a real DOM <video> (react-native-web renders via react-dom).
 * Autoplays, reports live progress + `ended` for auto-advance, reacts to mute,
 * and if the source fails to load it still auto-advances after a short fallback. */
import React, { useEffect, useRef } from "react";

export function StoryVideo({ url, poster, muted, onEnded, onProgress }: { url: string; poster?: string; muted: boolean; onEnded?: () => void; onProgress?: (f: number) => void }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const failTimer = useRef<any>(null);
  useEffect(() => {
    const v = ref.current;
    if (v) { v.muted = muted; const p = v.play?.(); if (p && p.catch) p.catch(() => {}); }
  }, [muted]);
  useEffect(() => () => { if (failTimer.current) clearTimeout(failTimer.current); }, []);
  return React.createElement("video", {
    ref,
    src: url,
    poster: poster || undefined,
    autoPlay: true,
    muted,
    playsInline: true,
    controls: false,
    onEnded,
    onTimeUpdate: (e: any) => { const v = e.currentTarget; if (v?.duration) onProgress?.(Math.min(1, v.currentTime / v.duration)); },
    onError: () => { if (!failTimer.current) failTimer.current = setTimeout(() => onEnded?.(), 5000); },
    "data-testid": "story-video",
    style: { width: "100%", height: "100%", objectFit: "contain", background: "#000" },
  });
}
