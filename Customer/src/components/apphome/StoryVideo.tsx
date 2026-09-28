/** Native story video — plays a short clip in a WebView, reports live progress +
 * `ended` so the viewer can auto-advance, and auto-advances after a short delay
 * if the source fails. Mute is toggled live via injected JS. */
import React, { useEffect, useRef } from "react";
import { WebView } from "react-native-webview";

function html(url: string, poster: string, muted: boolean) {
  const p = poster ? `poster="${poster}"` : "";
  const m = muted ? "muted" : "";
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100vw;height:100vh;object-fit:contain;background:#000}</style></head>
  <body><video id="v" src="${url}" ${p} autoplay ${m} playsinline webkit-playsinline></video>
  <script>var v=document.getElementById('v');
  function post(m){try{window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(m)}catch(e){}}
  v.addEventListener('ended',function(){post('ended')});
  v.addEventListener('timeupdate',function(){if(v.duration){post('p:'+(v.currentTime/v.duration))}});
  v.addEventListener('error',function(){setTimeout(function(){post('ended')},5000)});
  function onMsg(e){var d=(e&&e.data)||'';if(d==='unmute'){v.muted=false;v.play&&v.play()}else if(d==='mute'){v.muted=true}else if(d==='play'){v.play&&v.play()}}
  document.addEventListener('message',onMsg);window.addEventListener('message',onMsg);
  v.play&&v.play();</script></body></html>`;
}

export function StoryVideo({ url, poster, muted, onEnded, onProgress }: { url: string; poster?: string; muted: boolean; onEnded?: () => void; onProgress?: (f: number) => void }) {
  const ref = useRef<WebView>(null);
  useEffect(() => {
    ref.current?.injectJavaScript(`(function(){var v=document.getElementById('v');if(v){v.muted=${muted ? "true" : "false"};v.play&&v.play();}})();true;`);
  }, [muted]);
  return (
    <WebView
      ref={ref}
      source={{ html: html(url, poster || "", muted) }}
      style={{ flex: 1, backgroundColor: "#000" }}
      originWhitelist={["*"]}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      scrollEnabled={false}
      javaScriptEnabled
      onMessage={(e) => {
        const d = e.nativeEvent.data || "";
        if (d === "ended") onEnded?.();
        else if (d.startsWith("p:")) onProgress?.(Math.min(1, parseFloat(d.slice(2)) || 0));
      }}
      testID="story-video"
    />
  );
}
