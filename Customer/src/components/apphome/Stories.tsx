/** Video "stories" — Instagram-style tappable story cards on the home screen.
 * Cards come from an admin custom section (type "stories") via GET /app/home.
 * Tapping a card opens a full-screen viewer that plays the short video (WebView). */
import React, { useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, Modal, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { WebView } from "react-native-webview";
import { X, ChevronLeft, ChevronRight, Volume2, VolumeX, ArrowRight, Play } from "lucide-react-native";
import { PRIMARY, SLATE } from "../../theme";
import { BlockTitle } from "./Blocks";

type Story = { id: string; title?: string; avatar?: string; poster?: string; video?: string; cta_label?: string; cta_link?: string };
type Nav = (to: string) => void;

/* ---------------- Story cards row ---------------- */
export function StoriesRow({ sec, onOpen }: { sec: any; onOpen: (index: number) => void }) {
  const stories: Story[] = sec?.data || [];
  if (!stories.length) return null;
  return (
    <View testID={`app-stories-${sec.key.split(":")[1]}`} style={{ marginBottom: 30 }}>
      {sec.title ? <BlockTitle icon={sec.icon} title={sec.title} /> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {stories.map((s, i) => (
          <Pressable key={s.id || i} testID={`app-story-card-${i}`} onPress={() => onOpen(i)} style={{ width: 112, height: 158, borderRadius: 18, overflow: "hidden", backgroundColor: SLATE[800] }}>
            {s.poster ? <Image source={{ uri: s.poster }} style={{ ...StyleFill }} contentFit="cover" transition={200} /> : null}
            <LinearGradient colors={["rgba(15,23,42,0.05)", "rgba(15,23,42,0.85)"]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ ...StyleFill }} />
            {/* avatar ring top-left */}
            {s.avatar ? (
              <View style={{ position: "absolute", top: 8, left: 8, height: 40, width: 40, borderRadius: 20, borderWidth: 2.5, borderColor: "#fff", overflow: "hidden", backgroundColor: PRIMARY[600] }}>
                <Image source={{ uri: s.avatar }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
              </View>
            ) : (
              <View style={{ position: "absolute", top: 8, left: 8, height: 30, width: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.9)", alignItems: "center", justifyContent: "center" }}>
                <Play size={14} color={PRIMARY[700]} fill={PRIMARY[700]} />
              </View>
            )}
            <Text numberOfLines={2} style={{ position: "absolute", left: 10, right: 10, bottom: 10, color: "#fff", fontSize: 12.5, fontWeight: "800", letterSpacing: -0.2, lineHeight: 16 }}>{s.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const StyleFill = { position: "absolute" as const, left: 0, right: 0, top: 0, bottom: 0 };

/* ---------------- Full-screen story viewer ---------------- */
function videoHtml(url: string, poster: string) {
  const p = poster ? `poster="${poster}"` : "";
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <style>html,body{margin:0;height:100%;background:#000;overflow:hidden}video{width:100vw;height:100vh;object-fit:contain;background:#000}</style></head>
  <body><video id="v" src="${url}" ${p} autoplay muted loop playsinline webkit-playsinline></video>
  <script>var v=document.getElementById('v');
  function onMsg(e){var d=(e&&e.data)||'';if(d==='unmute'){v.muted=false;v.play&&v.play()}else if(d==='mute'){v.muted=true}else if(d==='play'){v.play&&v.play()}}
  document.addEventListener('message',onMsg);window.addEventListener('message',onMsg);
  v.play&&v.play();</script></body></html>`;
}

export function StoryViewer({ stories, startIndex, onClose, navigate }: { stories: Story[]; startIndex: number; onClose: () => void; navigate: Nav }) {
  const { width, height } = useWindowDimensions();
  const [idx, setIdx] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const webRef = useRef<WebView>(null);
  const cur = stories[idx];
  const next = () => (idx < stories.length - 1 ? setIdx(idx + 1) : onClose());
  const prev = () => idx > 0 && setIdx(idx - 1);
  const toggleMute = () => { const m = !muted; setMuted(m); webRef.current?.injectJavaScript(`(function(){var v=document.getElementById('v');if(v){v.muted=${m ? "true" : "false"};v.play&&v.play();}})();true;`); };
  const html = useMemo(() => (cur ? videoHtml(cur.video || "", cur.poster || "") : ""), [cur?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cur) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#000" }} testID="story-viewer">
        {/* video */}
        {cur.video ? (
          <WebView
            ref={webRef}
            key={cur.id}
            source={{ html }}
            style={{ flex: 1, backgroundColor: "#000" }}
            originWhitelist={["*"]}
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            javaScriptEnabled
            testID="story-video"
          />
        ) : (
          <Image source={{ uri: cur.poster }} style={{ flex: 1 }} contentFit="contain" />
        )}

        {/* progress segments */}
        <View style={{ position: "absolute", top: 52, left: 12, right: 12, flexDirection: "row", gap: 5 }}>
          {stories.map((_, i) => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.3)", overflow: "hidden" }}>
              <View style={{ height: "100%", width: i < idx ? "100%" : i === idx ? "60%" : "0%", backgroundColor: "#fff" }} />
            </View>
          ))}
        </View>

        {/* header: avatar + title + close */}
        <View style={{ position: "absolute", top: 66, left: 14, right: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
          {cur.avatar ? <Image source={{ uri: cur.avatar }} style={{ height: 36, width: 36, borderRadius: 18, borderWidth: 2, borderColor: "#fff" }} contentFit="cover" /> : null}
          <Text numberOfLines={1} style={{ flex: 1, color: "#fff", fontSize: 15, fontWeight: "800" }}>{cur.title}</Text>
          <Pressable testID="story-mute" onPress={toggleMute} hitSlop={10} style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}>
            {muted ? <VolumeX size={18} color="#fff" /> : <Volume2 size={18} color="#fff" />}
          </Pressable>
          <Pressable testID="story-close" onPress={onClose} hitSlop={10} style={{ height: 34, width: 34, borderRadius: 17, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}>
            <X size={20} color="#fff" />
          </Pressable>
        </View>

        {/* tap zones — left third = prev, right two-thirds = next */}
        <Pressable testID="story-prev" onPress={prev} style={{ position: "absolute", left: 0, top: 100, bottom: 120, width: width * 0.33 }} />
        <Pressable testID="story-next" onPress={next} style={{ position: "absolute", right: 0, top: 100, bottom: 120, width: width * 0.67 }} />

        {/* nav chevrons */}
        {idx > 0 ? <View style={{ position: "absolute", left: 8, top: height / 2 - 16, opacity: 0.6 }}><ChevronLeft size={30} color="#fff" /></View> : null}
        {idx < stories.length - 1 ? <View style={{ position: "absolute", right: 8, top: height / 2 - 16, opacity: 0.6 }}><ChevronRight size={30} color="#fff" /></View> : null}

        {/* CTA */}
        {cur.cta_link ? (
          <Pressable testID="story-cta" onPress={() => { onClose(); navigate(cur.cta_link!); }} style={{ position: "absolute", left: 24, right: 24, bottom: 44, height: 50, borderRadius: 14, backgroundColor: PRIMARY[600], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>{cur.cta_label || "Book Now"}</Text>
            <ArrowRight size={17} color="#fff" />
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}
