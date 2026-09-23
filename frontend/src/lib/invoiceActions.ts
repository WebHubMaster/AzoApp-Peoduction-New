/* Native equivalents of web invoiceShare.js / invoicePrint.js / download() */
import { Platform, Linking } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import * as Clipboard from "expo-clipboard";
import * as IntentLauncher from "expo-intent-launcher";
import { API_BASE, getToken, api } from "@/src/api/client";
import { money, statusMeta } from "@/src/lib/invoiceUtils";
import { storage } from "@/src/utils/storage";

const safeName = (s: any) => String(s || "invoice").replace(/[^\w.-]+/g, "_");

/* Persisted Android Storage-Access-Framework directory grant (user picks once —
   e.g. Downloads — and every future save writes there silently). */
const SAF_DIR_KEY = "azo_saf_download_dir";

/** Android-only: save the already-downloaded PDF into a real, user-visible folder
    (Downloads) via SAF. Returns the created file's content URI on success (so the
    caller can offer an "Open" action), or null when it wasn't written. */
async function saveToAndroidDownloads(fileUri: string, filename: string): Promise<string | null> {
  const SAF: any = (LegacyFS as any).StorageAccessFramework;
  if (!SAF) return null;
  let base64: string;
  try {
    base64 = await LegacyFS.readAsStringAsync(fileUri, { encoding: LegacyFS.EncodingType.Base64 });
  } catch { return null; }
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
  try {
    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm?.granted) return null;
    await storage.setItem(SAF_DIR_KEY, perm.directoryUri);
    return await writeInto(perm.directoryUri);
  } catch { return null; }
}

/** Open a saved PDF (SAF content:// or file://) in the device's PDF viewer. */
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

/** Short human summary used as the WhatsApp/native-share caption (web invoiceSummaryText). */
export function invoiceSummaryText(inv: any) {
  const num = inv?.invoice_number || "Invoice";
  const st = inv?.payment_status ? ` · ${String(inv.payment_status).toUpperCase()}` : "";
  return `${num} · ${money(inv?.total_amount, inv?.currency, 2)}${st} — AzoApp`;
}

type ProgressCb = (pct: number | null) => void;
type FetchOpts = { onProgress?: ProgressCb; onCancelReady?: (cancel: () => void) => void };

function cancelledError() { const e: any = new Error("cancelled"); e.cancelled = true; return e; }
export const isCancelled = (e: any) => !!(e && e.cancelled);

/** Download the server-rendered invoice PDF (same template as preview/print) to a
    cache file, sending the auth token so the request is authorised. Reports download
    progress (0..1, or null when the size is unknown) via `opts.onProgress`, and exposes
    a cancel function via `opts.onCancelReady`. Falls back to a manual byte-fetch if the
    streamed download fails, and validates a non-empty file actually landed. */
export async function fetchInvoicePdfFile(inv: any, opts?: FetchOpts): Promise<{ uri: string }> {
  const onProgress = opts?.onProgress;
  const name = safeName(inv.invoice_number);
  const dir = `${LegacyFS.cacheDirectory}invoices/`;
  try { await LegacyFS.makeDirectoryAsync(dir, { intermediates: true }); } catch { /* already exists */ }
  const fileUri = `${dir}${name}.pdf`;
  const token = await getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const url = `${API_BASE}/invoices/${inv.id}/pdf`;
  let cancelled = false;
  // Primary: resumable download streamed to disk with real progress + cancel support.
  try {
    const dl = LegacyFS.createDownloadResumable(url, fileUri, { headers }, (p: any) => {
      const total = Number(p?.totalBytesExpectedToWrite || 0);
      onProgress?.(total > 0 ? Math.min(1, Number(p?.totalBytesWritten || 0) / total) : null);
    });
    opts?.onCancelReady?.(() => { cancelled = true; try { dl.cancelAsync(); } catch { /* ignore */ } });
    const res = await dl.downloadAsync();
    if (cancelled) throw cancelledError();
    if (res?.uri) {
      const info: any = await LegacyFS.getInfoAsync(res.uri);
      if (info?.exists && Number(info?.size || 0) > 0) { onProgress?.(1); return { uri: res.uri }; }
    }
  } catch (e) {
    if (isCancelled(e) || cancelled) throw cancelledError();
    /* some ROMs fail the streamed download — fall back to a manual fetch */
  }
  // Fallback: fetch the bytes ourselves and write the file (guarantees a real PDF lands).
  onProgress?.(null);
  const ac = new AbortController();
  opts?.onCancelReady?.(() => { cancelled = true; ac.abort(); });
  let r: Response;
  try { r = await fetch(url, { headers, signal: ac.signal }); }
  catch (e) { if (cancelled) throw cancelledError(); throw e; }
  if (!r.ok) throw new Error("pdf failed");
  const bytes = new Uint8Array(await r.arrayBuffer());
  if (cancelled) throw cancelledError();
  if (!bytes.length) throw new Error("empty pdf");
  const d2 = new Directory(Paths.cache, "invoices");
  d2.create({ intermediates: true, idempotent: true });
  const f = new File(d2, `${name}.pdf`);
  try { if (f.exists) f.delete(); } catch { /* ignore */ }
  try { f.create({ overwrite: true } as any); } catch { /* may already exist */ }
  f.write(bytes);
  onProgress?.(1);
  return { uri: f.uri };
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
export async function downloadInvoicePdf(inv: any, opts?: FetchOpts): Promise<{ status: "downloaded" | "saved" | "shared"; openUri?: string }> {
  if (Platform.OS === "web") {
    const blob = await webBlob(inv);
    const href = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = href; a.download = `${inv.invoice_number || "invoice"}.pdf`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    return { status: "downloaded" };
  }
  const file = await fetchInvoicePdfFile(inv, opts);
  const filename = `${safeName(inv.invoice_number)}.pdf`;
  if (Platform.OS === "android") {
    opts?.onProgress?.(null); // indeterminate while writing into the chosen folder
    const savedUri = await saveToAndroidDownloads(file.uri, filename);
    if (savedUri) return { status: "saved", openUri: savedUri };
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `${inv.invoice_number || "Invoice"}.pdf` });
  }
  return { status: "shared" };
}

/** Print the invoice — the downloaded PDF is printed 1:1 (preview == print == PDF). */
export async function printInvoice(inv: any, opts?: FetchOpts) {
  if (Platform.OS === "web") {
    const blob = await webBlob(inv);
    const href = URL.createObjectURL(blob); const w = window.open(href, "_blank");
    w?.addEventListener?.("load", () => w.print());
    return;
  }
  const file = await fetchInvoicePdfFile(inv, opts);
  await Print.printAsync({ uri: file.uri });
}

/** Share the ACTUAL invoice PDF.
    - Android + `opts.waPackage` → sends straight into that WhatsApp flavour's chooser.
      Returns "not_installed" if that flavour isn't present (caller can offer another).
    - channel "whatsapp" (no package) on Android → tries com.whatsapp then com.whatsapp.w4b.
    - otherwise → native share sheet with the PDF attached. */
export async function shareInvoicePdf(
  inv: any,
  channel: "whatsapp" | "system" = "whatsapp",
  opts?: FetchOpts & { waPackage?: string },
) {
  const text = invoiceSummaryText(inv);
  if (Platform.OS === "web") {
    await downloadInvoicePdf(inv);
    if (channel === "whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    return "downloaded";
  }
  const file = await fetchInvoicePdfFile(inv, opts);
  const sendTo = async (pkg: string) => {
    const contentUri = await LegacyFS.getContentUriAsync(file.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.SEND", {
      type: "application/pdf",
      extra: { "android.intent.extra.STREAM": contentUri },
      packageName: pkg,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
    });
  };
  // Targeted WhatsApp flavour (from the in-app chooser).
  if (channel === "whatsapp" && Platform.OS === "android" && opts?.waPackage) {
    try { await sendTo(opts.waPackage); return "shared"; }
    catch { return "not_installed"; }
  }
  // Direct WhatsApp with no explicit flavour: try consumer, then Business.
  if (channel === "whatsapp" && Platform.OS === "android") {
    for (const pkg of ["com.whatsapp", "com.whatsapp.w4b"]) {
      try { await sendTo(pkg); return "shared"; } catch { /* try next flavour */ }
    }
  }
  try {
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
export async function emailInvoiceCompose(inv: any, to?: string, opts?: FetchOpts): Promise<"composed" | "sent"> {
  if (Platform.OS !== "web") {
    try {
      const MailComposer = require("expo-mail-composer");
      if (await MailComposer.isAvailableAsync().catch(() => false)) {
        const file = await fetchInvoicePdfFile(inv, opts);
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
