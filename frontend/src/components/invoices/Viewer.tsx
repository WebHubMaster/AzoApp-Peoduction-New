/* 1:1 port of web InvoiceViewer.jsx (mobile: full-screen viewer + sticky Download / Share / Print) */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, Platform, ScrollView } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Download, Printer, Share2 } from "lucide-react-native";
import { api } from "@/src/api/client";
import { DocumentSkeleton, OutlineBtn, ShareSheet, useInv } from "@/src/components/invoice";
import { shortDate } from "@/src/lib/invoiceUtils";

const A4_W = 794;
const A4_H = 1123;
/* The server HTML is a fixed 210mm A4 document — pin the WebView viewport to A4 width so
   the page is scaled to fit the phone (same as web's InvoiceA4Frame scale transform). */
const fitA4 = (html: string) => html.replace(/<head([^>]*)>/i, `<head$1><meta name="viewport" content="width=${A4_W}, initial-scale=1, maximum-scale=4, user-scalable=yes" />`);

export default function InvoiceViewer({ inv, loading, onClose, onDownload, onPrint, onShare, downloading, printing }: {
  inv: any | null; loading: boolean; onClose: () => void; onDownload: (d: any) => void; onPrint: (d: any) => void; onShare: (d: any, ch: string) => void; downloading: boolean; printing: boolean;
}) {
  const t = useInv(); const insets = useSafeAreaInsets();
  const open = !!inv;
  const [shareOpen, setShareOpen] = useState(false);
  const [html, setHtml] = useState("");
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [docH, setDocH] = useState(A4_H);
  const scale = box.w > 0 ? Math.min(1, box.w / A4_W) : 1;
  useEffect(() => {
    let alive = true;
    setHtml(""); setDocH(A4_H);
    const id = inv?.id;
    if (!open || !id) return () => { alive = false; };
    (async () => {
      try { const r = await api.get<string>(`/invoices/${id}/view`); if (alive) setHtml(typeof r === "string" ? r : ""); }
      catch { if (alive) setHtml(""); }
    })();
    return () => { alive = false; };
  }, [open, inv?.id]);

  const ready = open && !loading && !!inv?.invoice_number;
  const share = (ch: string) => { setShareOpen(false); setTimeout(() => onShare(inv, ch), 60); };

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} statusBarTranslucent presentationStyle="fullScreen">
      <View testID="invoice-viewer" style={{ flex: 1, backgroundColor: t.dark ? "#020617" : "#F1F5F9" }}>
        {/* toolbar */}
        <View style={{ backgroundColor: t.dark ? "rgba(15,23,42,0.9)" : "rgba(255,255,255,0.9)", borderBottomWidth: 1, borderBottomColor: t.border2, paddingTop: insets.top }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 56 }}>
            <Pressable testID="viewer-close" onPress={onClose} style={({ pressed }) => ({ height: 44, width: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? t.subtle : "transparent" })}><ArrowLeft size={20} color={t.t600} /></Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontWeight: "700", color: t.t900, fontSize: 15, lineHeight: 18 }} numberOfLines={1}>{inv?.invoice_number || "Invoice"}</Text>
              <Text style={{ fontSize: 11, color: t.t400 }} numberOfLines={1}>{inv?.issue_date ? `Issued ${shortDate(inv.issue_date)}` : "Loading invoice…"}{inv?.merchant_snapshot?.name ? ` · ${inv.merchant_snapshot.name}` : ""}</Text>
            </View>
          </View>
        </View>

        {/* document */}
        <View style={{ flex: 1 }}>
          {!ready || !html ? <View style={{ paddingHorizontal: 12, paddingTop: 16 }}><DocumentSkeleton /></View> : Platform.OS === "web" ? (
            /* web InvoiceA4Frame: natural A4 width iframe, visually scaled to the container, page scrolls */
            <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 16, paddingBottom: 16 }}>
              <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ width: "100%", height: Math.round(docH * scale), borderRadius: 2, overflow: "hidden", backgroundColor: "#fff", boxShadow: "0px 10px 40px rgba(2,6,23,0.14)" }}>
                {/* @ts-ignore iframe is valid on web */}
                <iframe title="invoice-preview" srcDoc={html} scrolling="no" onLoad={(e: any) => { try { const doc = e.currentTarget.contentDocument; if (doc?.body) setDocH(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, A4_H)); } catch { /* ignore */ } }}
                  style={{ border: "none", width: A4_W, height: docH, minHeight: docH, flexShrink: 0, transform: `scale(${scale})`, transformOrigin: "top left", display: "block", background: "#fff" }} />
              </View>
              <Text style={{ textAlign: "center", fontSize: 11, color: t.t400, marginTop: 16 }}>This is a computer-generated invoice · Reference {inv.invoice_number}</Text>
            </ScrollView>
          ) : (
            <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 16 }}>
              <View onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} style={{ flex: 1, borderRadius: 2, overflow: "hidden", backgroundColor: "#fff", boxShadow: "0px 10px 40px rgba(2,6,23,0.14)" }}>
                <WebView originWhitelist={["*"]} source={{ html: fitA4(html) }} style={{ flex: 1, backgroundColor: "#fff" }} scalesPageToFit setBuiltInZoomControls={false} showsHorizontalScrollIndicator={false} startInLoadingState testID="invoice-webview" />
              </View>
              <Text style={{ textAlign: "center", fontSize: 11, color: t.t400, marginVertical: 10 }}>This is a computer-generated invoice · Reference {inv.invoice_number}</Text>
            </View>
          )}
        </View>

        {/* mobile sticky actions */}
        <View testID="viewer-mobile-actions" style={{ flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: t.border2, backgroundColor: t.dark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.95)", paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 10 }}>
          <OutlineBtn testID="viewer-m-download" primary onPress={() => onDownload(inv)} disabled={!ready} busy={downloading} height={48} icon={<Download size={16} color="#fff" />} label="Download" />
          <OutlineBtn testID="viewer-m-share" onPress={() => setShareOpen(true)} disabled={!ready} height={48} icon={<Share2 size={16} color={t.t700} />} label="Share" />
          <OutlineBtn testID="viewer-m-print" onPress={() => onPrint(inv)} disabled={!ready} busy={printing} height={48} icon={<Printer size={16} color={t.t700} />} label="Print" />
        </View>

        <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} onPick={share} />
      </View>
    </Modal>
  );
}
