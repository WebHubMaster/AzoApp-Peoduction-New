/** Native story video — plays a short clip in a WebView and reports `ended`
 * so the viewer can auto-advance to the next story. Mute is toggled live. */
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
  function onMsg(e){var d=(e&&e.data)||'';if(d==='unmute'){v.muted=false;v.play&&v.play()}else if(d==='mute'){v.muted=true}else if(d==='play'){v.play&&v.play()}}
  document.addEventListener('message',onMsg);window.addEventListener('message',onMsg);
  v.play&&v.play();</script></body></html>`;
}

export function StoryVideo({ url, poster, muted, onEnded }: { url: string; poster?: string; muted: boolean; onEnded?: () => void }) {
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
      onMessage={(e) => { if (e.nativeEvent.data === "ended") onEnded?.(); }}
      testID="story-video"
    />
  );
}
