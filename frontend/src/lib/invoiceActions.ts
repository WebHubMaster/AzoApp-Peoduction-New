/* Native equivalents of web invoiceShare.js / invoicePrint.js / download() */
import { Platform, Linking } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as Clipboard from "expo-clipboard";
import { API_BASE, getToken, api } from "@/src/api/client";
import { money, statusMeta } from "@/src/lib/invoiceUtils";
import { storage } from "@/src/utils/storage";

const safeName = (s: any) => String(s || "invoice").replace(/[^\w.-]+/g, "_");

/* Persisted Android Storage-Access-Framework directory grant (user picks once —
   e.g. Downloads — and every future save writes there silently). */
const SAF_DIR_KEY = "azo_saf_download_dir";

/** Android-only: save the already-downloaded PDF into a real, user-visible folder
    (Downloads) via SAF. Returns true only when the file was actually written. */
async function saveToAndroidDownloads(fileUri: string, filename: string): Promise<boolean> {
  const SAF: any = (LegacyFS as any).StorageAccessFramework;
  if (!SAF) return false;
  let base64: string;
  try {
    base64 = await LegacyFS.readAsStringAsync(fileUri, { encoding: LegacyFS.EncodingType.Base64 });
  } catch { return false; }
  const writeInto = async (dirUri: string) => {
    const target = await SAF.createFileAsync(dirUri, filename.replace(/\.pdf$/i, ""), "application/pdf");
    await LegacyFS.writeAsStringAsync(target, base64, { encoding: LegacyFS.EncodingType.Base64 });
  };
  const cached = await storage.getItem(SAF_DIR_KEY);
  if (cached) {
    try { await writeInto(cached); return true; }
    catch { await storage.removeItem(SAF_DIR_KEY); /* grant stale/revoked → re-request */ }
  }
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted) return false;
    await storage.setItem(SAF_DIR_KEY, perm.directoryUri);
    await writeInto(perm.directoryUri);
    return true;
  } catch { return false; }
}

/** Short human summary used as the WhatsApp/native-share caption (web invoiceSummaryText). */
export function invoiceSummaryText(inv: any) {
  const num = inv?.invoice_number || "Invoice";
  const st = inv?.payment_status ? ` · ${String(inv.payment_status).toUpperCase()}` : "";
  return `${num} · ${money(inv?.total_amount, inv?.currency, 2)}${st} — AzoApp`;
}

/** Download the server-rendered invoice PDF (same template as preview/print) to a
    cache file, sending the auth token so the request is authorised. Falls back to a
    manual byte-fetch if the native downloader fails on some ROMs, and validates that
    a non-empty file actually landed so we never share/print a broken/empty document. */
export async function fetchInvoicePdfFile(inv: any): Promise<File> {
  const dir = new Directory(Paths.cache, "invoices");
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${safeName(inv.invoice_number)}.pdf`);
  const token = await getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `${API_BASE}/invoices/${inv.id}/pdf`;
  // Primary: native downloader (fast, streamed to disk).
  try {
    const out = await File.downloadFileAsync(url, file, { headers, idempotent: true });
    const size = (() => { try { return Number(out?.size ?? file.size ?? 0); } catch { return 0; } })();
    if (size) return out;
  } catch { /* some ROMs fail the native downloader — fall back to a manual fetch */ }
  // Fallback: fetch the bytes ourselves and write the file (guarantees a real PDF lands).
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error("pdf failed");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (!bytes.length) throw new Error("empty pdf");
  try { if (file.exists) file.delete(); } catch { /* ignore */ }
  try { file.create({ overwrite: true } as any); } catch { /* may already exist */ }
  file.write(bytes);
  return file;
}

/** Ask the backend for a PUBLIC, no-login landing page for this invoice that ANYONE
    can open to preview + download the PDF (gated by an unguessable signature). */
export async function getInvoiceShareLink(inv: any): Promise<string> {
  const r = await api.get<any>(`/invoices/${inv.id}/share-link`);
  if (!r?.sig) throw new Error("no link");
  return `${API_BASE}/invoices/pub/${inv.id}/page?s=${r.sig}`;
}

async function webBlob(inv: any) {
  const token = await getToken();
  const r = await fetch(`${API_BASE}/invoices/${inv.id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error("pdf failed");
  return r.blob();
}

/** Save the PDF to the device.
    - web  → browser download.
    - Android → real Downloads folder via SAF (returns "saved"); if the user denies
      the one-time folder grant, falls back to the system save/share sheet.
    - iOS → system save/share sheet (Save to Files). */
export async function downloadInvoicePdf(inv: any): Promise<"downloaded" | "saved" | "shared"> {
  if (Platform.OS === "web") {
    const blob = await webBlob(inv);
    const href = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = href; a.download = `${inv.invoice_number || "invoice"}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    return "downloaded";
  }
  const file = await fetchInvoicePdfFile(inv);
  const filename = `${safeName(inv.invoice_number)}.pdf`;
  if (Platform.OS === "android") {
    const saved = await saveToAndroidDownloads(file.uri, filename);
    if (saved) return "saved";
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `${inv.invoice_number || "Invoice"}.pdf` });
  }
  return "shared";
}

/** Print the invoice — the downloaded PDF is printed 1:1 (preview == print == PDF). */
export async function printInvoice(inv: any) {
  if (Platform.OS === "web") {
    const blob = await webBlob(inv);
    const href = URL.createObjectURL(blob); const w = window.open(href, "_blank");
    w?.addEventListener?.("load", () => w.print());
    return;
  }
  const file = await fetchInvoicePdfFile(inv);
  await Print.printAsync({ uri: file.uri });
}

/** WhatsApp / system share → sends the ACTUAL invoice PDF via the native share sheet. */
export async function shareInvoicePdf(inv: any, channel: "whatsapp" | "system" = "whatsapp") {
  const text = invoiceSummaryText(inv);
  try {
    if (Platform.OS === "web") { await downloadInvoicePdf(inv); if (channel === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank"); return "downloaded"; }
    const file = await fetchInvoicePdfFile(inv);
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: channel === "whatsapp" ? "Share on WhatsApp" : "Share invoice" });
    return "shared";
  } catch {
    if (channel === "whatsapp") {
      const wa = `whatsapp://send?text=${encodeURIComponent(text)}`;
      if (await Linking.canOpenURL(wa).catch(() => false)) await Linking.openURL(wa);
      else await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`);
      return "fallback";
    }
    throw new Error("share failed");
  }
}

export const copyText = async (text: string) => {
  try { await Clipboard.setStringAsync(text); return true; } catch { return false; }
};

/** Email the invoice PDF via the backend (POST /invoices/{id}/email). `to` optional —
    backend falls back to the invoice's on-file email. Throws ApiError on failure so the
    caller can surface the backend message (e.g. "email not configured"). */
export async function emailInvoice(inv: any, to?: string) {
  return api.post<any>(`/invoices/${inv.id}/email`, to ? { to } : {});
}

/** Email flow used by the app: on a phone this OPENS the device mail app with the
    invoice PDF already ATTACHED (expo-mail-composer). If no mail app is available
    (or on web), it falls back to the backend server-send. */
export async function emailInvoiceCompose(inv: any, to?: string): Promise<"composed" | "sent"> {
  if (Platform.OS !== "web") {
    try {
      const MailComposer = require("expo-mail-composer");
      if (await MailComposer.isAvailableAsync().catch(() => false)) {
        const file = await fetchInvoicePdfFile(inv);
        await MailComposer.composeAsync({
          recipients: to ? [to] : [],
          subject: `Invoice ${inv.invoice_number || ""}`.trim(),
          body: `${invoiceSummaryText(inv)}\n\nPlease find the invoice PDF attached.`,
          attachments: [file.uri],
        });
        return "composed";
      }
    } catch { /* no mail app / attach failed → server-send below */ }
  }
  await emailInvoice(inv, to);
  return "sent";
}

export const shareStatusLabel = (inv: any) => statusMeta(inv?.payment_status).label;
