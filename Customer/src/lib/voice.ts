/** Voice search: Web Speech API on web, expo-speech-recognition on native builds (not available inside Expo Go). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

function nativeMod(): any {
  try {
    const m = require("expo-speech-recognition"); // eslint-disable-line @typescript-eslint/no-require-imports
    return m?.ExpoSpeechRecognitionModule ? m : null;
  } catch { return null; }
}

export function useVoiceSearch(onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState("");
  const recRef = useRef<any>(null);
  const subsRef = useRef<any[]>([]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const W = globalThis as any;
      setSupported(!!(W.SpeechRecognition || W.webkitSpeechRecognition));
    } else {
      setSupported(!!nativeMod());
    }
    return () => { subsRef.current.forEach((s) => s?.remove?.()); try { recRef.current?.stop?.(); } catch {} };
  }, []);

  const stop = useCallback(() => {
    setListening(false);
    if (Platform.OS === "web") { try { recRef.current?.stop(); } catch {} return; }
    const m = nativeMod();
    try { m?.ExpoSpeechRecognitionModule.stop(); } catch {}
  }, []);

  const start = useCallback(async () => {
    setError("");
    if (Platform.OS === "web") {
      const W = globalThis as any;
      const SR = W.SpeechRecognition || W.webkitSpeechRecognition;
      if (!SR) { setSupported(false); setError("Voice search is not supported in this browser."); return; }
      const rec = new SR();
      rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = (e: any) => {
        let t = ""; let fin = false;
        for (let i = e.resultIndex; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
        onText(t.trim(), fin);
      };
      rec.onerror = (e: any) => { setError(e?.error === "not-allowed" ? "Microphone permission denied." : "Couldn't hear you. Try again."); setListening(false); };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      try { rec.start(); setListening(true); } catch { setListening(false); }
      return;
    }
    const m = nativeMod();
    if (!m) { setSupported(false); setError("Voice search needs the installed AzoApp build (not available in Expo Go)."); return; }
    const M = m.ExpoSpeechRecognitionModule;
    try {
      const perm = await M.requestPermissionsAsync();
      if (!perm.granted) { setError("Microphone permission denied."); return; }
      subsRef.current.forEach((s) => s?.remove?.());
      subsRef.current = [
        M.addListener("result", (ev: any) => { const t = ev?.results?.[0]?.transcript || ""; onText(t.trim(), !!ev?.isFinal); }),
        M.addListener("end", () => setListening(false)),
        M.addListener("error", (ev: any) => { setError(ev?.message || "Couldn't hear you. Try again."); setListening(false); }),
      ];
      M.start({ lang: "en-IN", interimResults: true, continuous: false, maxAlternatives: 1 });
      setListening(true);
    } catch (e: any) { setError(e?.message || "Voice search failed."); setListening(false); }
  }, [onText]);

  return { listening, supported, error, start, stop, toggle: () => (listening ? stop() : start()) };
}
