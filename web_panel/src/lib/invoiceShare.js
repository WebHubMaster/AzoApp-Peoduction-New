import api from "@/lib/api";
import { toast } from "sonner";

function money(n, cur = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: cur || "INR", maximumFractionDigits: 2 }).format(Number(n || 0));
  } catch {
    return `\u20b9${Number(n || 0).toFixed(2)}`;
  }
}

// Short human summary used as the WhatsApp/native-share caption.
export function invoiceSummaryText(inv) {
  const num = inv?.invoice_number || inv?.number || inv?.code || "Invoice";
  const amt = money(inv?.total_amount ?? inv?.total, inv?.currency);
  const st = inv?.payment_status ? ` \u00b7 ${String(inv.payment_status).toUpperCase()}` : "";
  return `${num} \u00b7 ${amt}${st} \u2014 AzoApp`;
}

function saveFile(file) {
  const href = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = href;
  a.download = file.name || "invoice.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

function canShareFile(file) {
  try {
    return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

// Core one-tap share of a PDF File.
// - Mobile / supported browsers: opens the native share sheet with the ACTUAL PDF
//   attached (WhatsApp appears as a target).
// - Desktop / unsupported: downloads the PDF and opens WhatsApp Web with the caption
//   so the user can attach the just-saved file.
export async function shareFilePdf(file, { title = "Invoice", text = "", channel = "whatsapp", toastId } = {}) {
  const done = (msg, kind = "success") => {
    if (toastId) toast[kind](msg, { id: toastId });
    else toast[kind](msg);
  };
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title, text });
      if (toastId) toast.dismiss(toastId);
    } catch (e) {
      // AbortError = user cancelled the sheet — stay silent.
      if (toastId) toast.dismiss(toastId);
    }
    return;
  }
  // Fallback: save locally + open WhatsApp with the caption.
  saveFile(file);
  if (channel === "whatsapp") {
    const msg = `${text}\n\n(Invoice PDF saved to your device \u2014 tap the attach/clip icon in WhatsApp to send it.)`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  }
  done("Invoice PDF downloaded \u2014 attach it in WhatsApp");
}

// Fetch the server-rendered PDF for an invoice record, then share it.
export async function shareInvoicePdf(inv, channel = "whatsapp") {
  if (!inv?.id) {
    toast.error("Invoice is not ready to share yet");
    return;
  }
  const t = toast.loading("Preparing invoice\u2026");
  try {
    const r = await api.get(`/invoices/${inv.id}/pdf`, { responseType: "blob" });
    const blob = r.data instanceof Blob ? r.data : new Blob([r.data], { type: "application/pdf" });
    const file = new File([blob], `${inv.invoice_number || "invoice"}.pdf`, { type: "application/pdf" });
    await shareFilePdf(file, { title: inv.invoice_number || "Invoice", text: invoiceSummaryText(inv), channel, toastId: t });
  } catch {
    toast.dismiss(t);
    if (channel === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(invoiceSummaryText(inv))}`, "_blank", "noopener");
    } else {
      toast.error("Could not prepare the invoice PDF");
    }
  }
}
