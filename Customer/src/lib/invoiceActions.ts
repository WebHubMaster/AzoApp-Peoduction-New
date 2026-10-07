/* Internal invoice PDF download + preview + share for the Customer app.
   The PDF is always generated on the backend and fetched INSIDE the app
   (authorised /invoices/{id}/pdf) to a cache/documents file. We never send
   the phone to the backend URL and never put a backend URL into WhatsApp /
   share text — the raw backend URL is never surfaced to the user.

   Mirrors the Partner app behaviour: after a download the PDF is OPENED in the
   device's native PDF viewer, and sharing attaches the actual PDF file. */
import { Platform, Linking } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { API_BASE, getToken, api } from "../api/client";
import { storage } from "../utils/storage";

const safeName = (s: any) => String(s || "invoice").replace(/[^\w.-]+/g, "_");

/** Short human caption for WhatsApp / native-share — invoice no, amount, status.
    Deliberately contains NO URL. */
export function invoiceSummaryText(inv: any) {
  const num = inv?.invoice_number || inv?.code || "Invoice";
  const cur = inv?.currency === "INR" || !inv?.currency ? "₹" : inv.currency + " ";
  const amt = Number(inv?.total_amount ?? inv?.amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const st = inv?.payment_status ? ` · ${String(inv.payment_status).toUpperCase()}` : "";
  return `${num} · ${cur}${amt}${st} — AzoApp`;
}

/* Persisted Android Storage-Access-Framework directory grant (user picks once —
   e.g. Downloads — and every future save writes there silently). */
const SAF_DIR_KEY = "azo_saf_download_dir";

/** Android-only: copy the already-downloaded PDF into a real, user-visible folder
    (Downloads) via SAF. Returns the created file's content URI, or null. */
async function saveToAndroidDownloads(fileUri: string, filename: string, ask = true): Promise<string | null> {
  const SAF: any = (LegacyFS as any).StorageAccessFramework;
  if (!SAF) return null;
  let base64: string;
  try { base64 = await LegacyFS.readAsStringAsync(fileUri, { encoding: LegacyFS.EncodingType.Base64 }); }
  catch { return null; }
  const writeInto = async (dirUri: string): Promise<string> => {
    const target = await SAF.createFileAsync(dirUri, filename.replace(/\.pdf$/i, ""), "application/pdf");
    await LegacyFS.writeAsStringAsync(target, base64, { encoding: LegacyFS.EncodingType.Base64 });
    return target;
  };
  const cached = await storage.getItem(SAF_DIR_KEY);
  if (cached) {
    try { return await writeInto(cached); }
    catch { await storage.removeItem(SAF_DIR_KEY); /* grant stale/revoked → re-request */ }
  }
  if (!ask) return null;
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted) return null;
    await storage.setItem(SAF_DIR_KEY, perm.directoryUri);
    return await writeInto(perm.directoryUri);
  } catch { return null; }
}

/** Open a saved PDF (SAF content:// or file://) in the device's native PDF viewer. */
export async function openLocalFile(uri: string) {
  if (Platform.OS === "android") {
    let contentUri = uri;
    if (uri.startsWith("file://")) {
      try { contentUri = await LegacyFS.getContentUriAsync(uri); } catch { /* keep original */ }
    }
    await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
      data: contentUri, type: "application/pdf", flags: 1,
    });
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  }
}

/** Fetch the backend-rendered invoice PDF (authorised) to a private cache file. */
export async function fetchInvoicePdfFile(inv: any): Promise<{ uri: string }> {
  const name = safeName(inv.invoice_number);
  const dir = `${LegacyFS.cacheDirectory}invoices/`;
  try { await LegacyFS.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* exists */ }
  const fileUri = `${dir}${name}.pdf`;
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `${API_BASE}/invoices/${inv.id}/pdf`;

  // Primary: stream straight to disk.
  try {
    const res: any = await LegacyFS.downloadAsync(url, fileUri, { headers });
    if (res?.uri && Number(res?.status || 200) === 200) {
      const info: any = await LegacyFS.getInfoAsync(res.uri);
      if (info?.exists && Number(info?.size || 0) > 0) return { uri: res.uri };
    }
  } catch { /* some ROMs fail the streamed download — fall back below */ }

  // Fallback: fetch the bytes ourselves and write the file (guarantees a real PDF).
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("pdf failed");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length) throw new Error("empty pdf");
  const d2 = new Directory(Paths.cache, "invoices");
  d2.create({ intermediates: true, idempotent: true });
  const f = new File(d2, `${name}.pdf`);
  try { if (f.exists) f.delete(); } catch { /* ignore */ }
  try { f.create({ overwrite: true } as any); } catch { /* may already exist */ }
  f.write(bytes);
  return { uri: f.uri };
}

async function webBlob(inv: any) {
  const token = await getToken();
  const r = await fetch(`${API_BASE}/invoices/${inv.id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error("pdf failed");
  return r.blob();
}

/** Download the invoice PDF and OPEN it (same behaviour as the Partner app).
    - web → browser download.
    - Android → keep a permanent copy in the app documents, silently drop into the
      Downloads folder when already granted, then return an openUri the caller opens
      in the native PDF viewer.
    - iOS → system save/preview sheet (Save to Files / open in a PDF app). */
export async function downloadInvoicePdf(inv: any): Promise<{ status: "downloaded" | "saved" | "shared"; openUri?: string }> {
  if (Platform.OS === "web") {
    const blob = await webBlob(inv);
    const href = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = href; a.download = `${inv.invoice_number || "invoice"}.pdf`; document.body.appendChild(a); a.click(); a.remove();
    // Open a preview tab too, matching "auto-open after download".
    try { window.open(href, "_blank", "noopener"); } catch { /* popup blocked */ }
    setTimeout(() => { try { URL.revokeObjectURL(href); } catch { /* ignore */ } }, 60000);
    return { status: "downloaded", openUri: href };
  }
  const file = await fetchInvoicePdfFile(inv);
  const filename = `${safeName(inv.invoice_number)}.pdf`;
  if (Platform.OS === "android") {
    const dir = `${LegacyFS.documentDirectory}invoices/`;
    try { await LegacyFS.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* exists */ }
    const keep = `${dir}${filename}`;
    try { await LegacyFS.deleteAsync(keep, { idempotent: true }); await LegacyFS.copyAsync({ from: file.uri, to: keep }); } catch { /* fall back to cache file */ }
    const savedUri = await saveToAndroidDownloads(file.uri, filename, false);
    const exists = await LegacyFS.getInfoAsync(keep).then((i: any) => i.exists).catch(() => false);
    return { status: savedUri ? "saved" : "downloaded", openUri: savedUri || (exists ? keep : file.uri) };
  }
  // iOS: open the system preview/save sheet with the actual PDF file.
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `${inv.invoice_number || "Invoice"}.pdf` });
  }
  return { status: "shared" };
}

/** Download the invoice PDF WITHOUT auto-opening it, returning a handle the caller can
    open later (used by the "Invoice saved · Open" toast). */
export async function saveInvoicePdf(inv: any): Promise<{ openUri: string; platform: "web" | "native" }> {
  if (Platform.OS === "web") {
    const blob = await webBlob(inv);
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = `${inv.invoice_number || "invoice"}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    return { openUri: href, platform: "web" };
  }
  const file = await fetchInvoicePdfFile(inv);
  return { openUri: file.uri, platform: "native" };
}

/** Open an already-saved invoice PDF — native viewer/share sheet, or a new browser tab. */
export async function openInvoicePdf(openUri: string, platform: "web" | "native") {
  if (platform === "web") { try { window.open(openUri, "_blank", "noopener"); } catch { /* ignore */ } return; }
  await openLocalFile(openUri);
}

/** Share the ACTUAL invoice PDF file (never a URL).
    - Android + channel "whatsapp" → sends the PDF straight into WhatsApp
      (consumer, then Business), falling back to the system share sheet.
    - iOS / other → native share sheet with the PDF attached.
    - web → downloads the PDF and opens wa.me with a text caption only (no URL). */
export async function shareInvoicePdf(inv: any, channel: "whatsapp" | "system" = "whatsapp"): Promise<"shared" | "downloaded" | "fallback"> {
  const text = invoiceSummaryText(inv);
  if (Platform.OS === "web") {
    await downloadInvoicePdf(inv);
    if (channel === "whatsapp") { try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank"); } catch { /* ignore */ } }
    return "downloaded";
  }
  const file = await fetchInvoicePdfFile(inv);
  // Reliable on EVERY device: hand the real PDF file to the Android system share
  // sheet via expo-sharing (proper FileProvider content:// URI + read grant to the
  // chosen app). WhatsApp appears in the sheet and attaches the PDF correctly. The
  // old direct ACTION_SEND intent passed the STREAM as a plain string, so WhatsApp
  // often couldn't read the file and showed "sharing failed" — that was the bug.
  const available = await Sharing.isAvailableAsync().catch(() => false);
  if (available) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: channel === "whatsapp" ? "Share invoice on WhatsApp" : "Share invoice",
    });
    return "shared";
  }
  // Last resort (sharing unavailable): open WhatsApp with the text caption only.
  if (channel === "whatsapp") {
    const wa = `whatsapp://send?text=${encodeURIComponent(text)}`;
    try {
      if (await Linking.canOpenURL(wa).catch(() => false)) { await Linking.openURL(wa); return "fallback"; }
    } catch { /* ignore */ }
    try { await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`); return "fallback"; } catch { /* ignore */ }
  }
  throw new Error("share failed");
}

/** Email the invoice PDF to the customer. The backend generates + sends the PDF
    (POST /invoices/{id}/email) — no backend URL is ever exposed to the user. */
export async function emailInvoice(invoiceId: string, to?: string) {
  return api.post<any>(`/invoices/${invoiceId}/email`, to ? { to } : {});
}
