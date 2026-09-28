/* Internal invoice PDF download + preview for the Customer app.
   The PDF is fetched INSIDE the app (authorised /invoices/{id}/pdf) to a cache
   file and then opened in the device's native PDF viewer / "Save to Files" sheet.
   We never redirect the phone browser to the backend, so the backend URL is
   never surfaced to the user. */
import { Platform } from "react-native";
import { File, Directory, Paths } from "expo-file-system";
import * as LegacyFS from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { API_BASE, getToken } from "../api/client";

const safeName = (s: any) => String(s || "invoice").replace(/[^\w.-]+/g, "_");

/** Download the authorised invoice PDF to a private cache file and return its uri. */
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

/** Download + open the invoice PDF. On a phone it opens the native PDF viewer /
    "Save to Files" sheet; on web it triggers a normal blob download. */
export async function downloadInvoicePdf(inv: any): Promise<"shared" | "downloaded"> {
  if (Platform.OS === "web") {
    const token = await getToken();
    const r = await fetch(`${API_BASE}/invoices/${inv.id}/pdf`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) throw new Error("pdf failed");
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = `${inv.invoice_number || "invoice"}.pdf`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
    return "downloaded";
  }
  const file = await fetchInvoicePdfFile(inv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `${inv.invoice_number || "Invoice"}.pdf` });
  }
  return "shared";
}
