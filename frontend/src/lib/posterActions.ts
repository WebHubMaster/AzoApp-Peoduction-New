/* Poster export — the artifact is rendered SERVER-SIDE (GET /merchant/panel/qr/poster →
   PNG / JPG / PDF), so Share / WhatsApp / Download / Print produce the identical designed
   poster (QR + brand + booking link) on every device: Expo Go, EAS APK and web — no native
   capture module required. react-native-view-shot is only a last-resort fallback. */
import { Platform, Linking, Share as RNShareSheet } from "react-native";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as Clipboard from "expo-clipboard";
import * as IntentLauncher from "expo-intent-launcher";
import * as WebBrowser from "expo-web-browser";
import { API_BASE, getToken } from "@/src/api/client";
import { storage } from "@/src/utils/storage";
import { POSTER_CANVAS } from "@/src/pages/merchant/qrData";

export type PosterFormat = "png" | "jpg" | "pdf";
const SAF_DIR_KEY = "azo_saf_download_dir";
const MIME: Record<PosterFormat, string> = { png: "image/png", jpg: "image/jpeg", pdf: "application/pdf" };
const UTI: Record<PosterFormat, string> = { png: "public.png", jpg: "public.jpeg", pdf: "com.adobe.pdf" };

export interface PosterFile { uri: string; fmt: PosterFormat; name: string }
export interface PosterParams { link: string; name: string; primary?: string; secondary?: string; logo?: string; site?: string; trust?: string; caption?: string }
export type SaveResult = { status: "saved" | "shared"; uri: string };
export type ShareResult = "shared" | "shared-two-step" | "fallback";

const isWeb = Platform.OS === "web";

/** react-native-share is a native module — present in custom builds, absent in Expo Go. */
function loadRNShare(): any | null {
  try {
    const m = require("react-native-share");
    const s = m?.default || m;
    return s && typeof s.open === "function" ? s : null;
  } catch { return null; }
}

function posterUrl(fmt: PosterFormat, p: PosterParams) {
  const q = new URLSearchParams({ fmt, link: p.link, name: p.name, primary: p.primary || "", secondary: p.secondary || "", logo: p.logo || "", site: p.site || "", trust: p.trust ?? "", caption: p.caption || "" });
  return `${API_BASE}/merchant/panel/qr/poster?${q.toString()}`;
}

/** True when the share sheet can carry image + caption in ONE message (react-native-share
    in an EAS/custom build, or the Web Share API). Otherwise the caption is baked INTO the poster. */
export function canShareWithCaption(): boolean {
  if (isWeb) { const nav: any = typeof navigator !== "undefined" ? navigator : null; return !!nav?.canShare; }
  return !!loadRNShare();
}

/** Expo Go path: open the public share page in the system browser (Chrome / Safari), where the
    Web Share API hands WhatsApp the poster IMAGE + caption as ONE message (same as the web panel). */
export async function shareViaBrowser(params: PosterParams, code: string, channel: "whatsapp" | "system", caption: string): Promise<boolean> {
  const q = new URLSearchParams({ code, link: params.link, name: params.name, primary: params.primary || "", secondary: params.secondary || "", logo: params.logo || "", site: params.site || "", trust: params.trust ?? "", caption, channel });
  const url = `${API_BASE}/merchant/qr/share-page?${q.toString()}`;
  try {
    const r = await WebBrowser.openBrowserAsync(url, { showTitle: false, enableBarCollapsing: true, dismissButtonStyle: "close", toolbarColor: "#0b1220", controlsColor: "#ffffff" } as any);
    return !!r;
  } catch { return false; }
}

/** Download the server-rendered poster → local file (native) or data-uri (web). */
export async function fetchPoster(fmt: PosterFormat, params: PosterParams, name: string): Promise<PosterFile> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const url = posterUrl(fmt, params);
  const fileName = `${name}.${fmt}`;
  if (isWeb) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`poster ${res.status}`);
    const blob = await res.blob();
    const uri = await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(blob); });
    return { uri, fmt, name: fileName };
  }
  const dest = `${LegacyFS.cacheDirectory}${fileName}`;
  await LegacyFS.deleteAsync(dest, { idempotent: true }).catch(() => {});
  const r = await LegacyFS.downloadAsync(url, dest, { headers });
  if (r.status !== 200) { await LegacyFS.deleteAsync(dest, { idempotent: true }).catch(() => {}); throw new Error(`poster ${r.status}`); }
  return { uri: r.uri, fmt, name: fileName };
}

/** Fallback only: rasterise the on-screen poster view with react-native-view-shot. */
async function captureView(ref: any, fmt: "png" | "jpg", name: string): Promise<PosterFile> {
  const { captureRef } = require("react-native-view-shot");
  const uri = await captureRef(ref, { format: fmt, quality: 0.95, result: isWeb ? "data-uri" : "tmpfile", width: POSTER_CANVAS.w, height: POSTER_CANVAS.h, fileName: name });
  return { uri, fmt, name: `${name}.${fmt}` };
}

/** Server render first; if the network call fails, capture the local view instead. */
export async function buildPoster(fmt: PosterFormat, params: PosterParams, name: string, viewRef?: any): Promise<PosterFile> {
  try { return await fetchPoster(fmt, params, name); }
  catch (serverErr) {
    if (!viewRef) throw serverErr;
    const img = await captureView(viewRef, fmt === "jpg" ? "jpg" : "png", name);
    if (fmt !== "pdf") return img;
    const pdf = await posterToPdf(img, name);
    if (!pdf) throw serverErr;
    return pdf;
  }
}

async function toBase64(file: PosterFile): Promise<string> {
  if (file.uri.startsWith("data:")) return file.uri.split(",")[1] || "";
  return LegacyFS.readAsStringAsync(file.uri, { encoding: LegacyFS.EncodingType.Base64 });
}
async function toDataUri(file: PosterFile): Promise<string> {
  if (file.uri.startsWith("data:")) return file.uri;
  return `data:${MIME[file.fmt]};base64,${await toBase64(file)}`;
}

/** Full-bleed page with ONLY the poster image. */
async function posterPageHtml(img: PosterFile) {
  const src = await toDataUri(img);
  return `<html><head><meta charset="utf-8"/><style>@page{size:${POSTER_CANVAS.w}px ${POSTER_CANVAS.h}px;margin:0}html,body{margin:0;padding:0;background:#fff}img{width:100%;height:auto;display:block}</style></head><body><img src="${src}"/></body></html>`;
}

/** Image → PDF via expo-print (fallback path). Web opens the print dialog and returns null. */
export async function posterToPdf(img: PosterFile, name: string): Promise<PosterFile | null> {
  const html = await posterPageHtml(img);
  if (isWeb) { await Print.printAsync({ html }); return null; }
  const { uri } = await Print.printToFileAsync({ html, width: 612, height: 765, base64: false });
  const dest = `${LegacyFS.cacheDirectory}${name}.pdf`;
  try { await LegacyFS.deleteAsync(dest, { idempotent: true }); await LegacyFS.moveAsync({ from: uri, to: dest }); return { uri: dest, fmt: "pdf", name: `${name}.pdf` }; }
  catch { return { uri, fmt: "pdf", name: `${name}.pdf` }; }
}

/* ── Android SAF: write into a user-visible folder (Downloads); returns the content:// uri ── */
async function saveViaSaf(file: PosterFile): Promise<string | null> {
  const SAF: any = (LegacyFS as any).StorageAccessFramework;
  if (!SAF) return null;
  const base64 = await toBase64(file);
  const writeInto = async (dirUri: string) => {
    const target: string = await SAF.createFileAsync(dirUri, file.name.replace(/\.[a-z]+$/i, ""), MIME[file.fmt]);
    await LegacyFS.writeAsStringAsync(target, base64, { encoding: LegacyFS.EncodingType.Base64 });
    return target;
  };
  const cached = await storage.getItem(SAF_DIR_KEY);
  if (cached) {
    try { return await writeInto(cached); } catch { await storage.removeItem(SAF_DIR_KEY); }
  }
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted) return null;
    await storage.setItem(SAF_DIR_KEY, perm.directoryUri);
    return await writeInto(perm.directoryUri);
  } catch { return null; }
}

function webDownload(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href; a.download = name; a.click();
}

/** Save to device. Android → Downloads (SAF, falls back to share sheet); iOS → Files/Photos via share sheet; web → download. */
export async function savePosterFile(file: PosterFile): Promise<SaveResult> {
  if (isWeb) { webDownload(await toDataUri(file), file.name); return { status: "saved", uri: file.uri }; }
  if (Platform.OS === "android") {
    const saved = await saveViaSaf(file);
    if (saved) return { status: "saved", uri: saved };
  }
  await Sharing.shareAsync(file.uri, { mimeType: MIME[file.fmt], UTI: UTI[file.fmt], dialogTitle: "Save poster" });
  return { status: "shared", uri: file.uri };
}

/** Open a saved file in the system viewer (Android VIEW intent; iOS Quick-Look via share sheet). */
export async function openPosterFile(file: PosterFile, savedUri?: string): Promise<boolean> {
  if (isWeb) return false;
  if (Platform.OS === "android") {
    const uris = [savedUri, await LegacyFS.getContentUriAsync(file.uri).catch(() => "")].filter(Boolean) as string[];
    for (const data of uris) {
      try { await IntentLauncher.startActivityAsync("android.intent.action.VIEW", { data, type: MIME[file.fmt], flags: 1 }); return true; } catch { /* next */ }
    }
  }
  try { await Sharing.shareAsync(file.uri, { mimeType: MIME[file.fmt], UTI: UTI[file.fmt], dialogTitle: "Open poster" }); return true; } catch { return false; }
}

/** Share the poster IMAGE + caption (link once). WhatsApp channel targets WhatsApp directly.
    "shared-two-step" = image sent first, then the message + link (Expo Go / no react-native-share). */
export async function sharePosterFile(
  file: PosterFile,
  opts: { channel?: "whatsapp" | "system"; caption?: string; title?: string; captionEmbedded?: boolean } = {},
): Promise<ShareResult> {
  const { channel = "system", caption = "", title = "", captionEmbedded = false } = opts;

  if (isWeb) {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    const dataUri = await toDataUri(file);
    const blob = await (await fetch(dataUri)).blob();
    const f = new File([blob], file.name, { type: MIME[file.fmt] });
    if (nav?.canShare?.({ files: [f] })) { await nav.share({ files: [f], title, text: caption }); return "shared"; }
    if (channel === "whatsapp") {
      webDownload(dataUri, file.name);
      window.open(`https://wa.me/?text=${encodeURIComponent(caption)}`, "_blank");
      return "fallback";
    }
    if (nav?.share) { await nav.share({ title, text: caption }); return "shared"; }
    throw new Error("share unsupported");
  }

  // 1) react-native-share (custom/EAS build): image + caption in ONE intent / activity item
  const RNShare = loadRNShare();
  if (RNShare) {
    const base = { url: file.uri, type: MIME[file.fmt], message: caption, title, subject: title, failOnCancel: false };
    if (channel === "whatsapp") {
      for (const social of [RNShare.Social?.WHATSAPP, RNShare.Social?.WHATSAPPBUSINESS].filter(Boolean)) {
        try { await RNShare.shareSingle({ ...base, social }); return "shared"; } catch { /* not installed → next */ }
      }
    }
    try { await RNShare.open(base); return "shared"; } catch { /* fall through */ }
  }

  // 2) Expo Go / no RNShare: an image intent cannot carry text here. When the caption is already
  //    baked into the poster (captionEmbedded) one image share is the whole message; otherwise
  //    share in TWO steps — poster image, then (when the merchant returns) the message + link.
  if (caption) { try { await Clipboard.setStringAsync(caption); } catch { /* ignore */ } }
  try {
    await Sharing.shareAsync(file.uri, { mimeType: MIME[file.fmt], UTI: UTI[file.fmt], dialogTitle: channel === "whatsapp" ? "Share poster on WhatsApp" : "Share poster" });
  } catch {
    if (channel === "whatsapp" && caption) { await openWhatsAppText(caption); return "fallback"; }
    throw new Error("share failed");
  }
  if (!caption || captionEmbedded) return "shared";
  if (channel === "whatsapp") { await openWhatsAppText(caption); return "shared-two-step"; }
  try { await RNShareSheet.share({ message: caption, title }); } catch { /* user dismissed */ }
  return "shared-two-step";
}

async function openWhatsAppText(text: string) {
  const wa = `whatsapp://send?text=${encodeURIComponent(text)}`;
  if (await Linking.canOpenURL(wa).catch(() => false)) await Linking.openURL(wa);
  else await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

/** Print ONLY the poster (image fills the page — identical to the web print page). */
export async function printPosterFile(img: PosterFile) {
  await Print.printAsync({ html: await posterPageHtml(img) });
}
