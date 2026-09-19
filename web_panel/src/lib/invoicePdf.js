import React from "react";
import { createRoot } from "react-dom/client";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import InvoiceDocument from "@/components/invoices/InvoiceDocument";

/**
 * Render the EXACT on-screen InvoiceDocument design to a crisp A4 PDF.
 * We mount the component off-screen at natural full width (794px ≈ A4@96dpi),
 * wait for the logo image to load, then rasterise with html2canvas. Mounting
 * off-screen (not inside the scrolled/scaled dialog) avoids the layout shift
 * that occurred when capturing the dialog node directly.
 */
export async function renderInvoicePdf(inv, filename = "invoice.pdf") {
  if (!inv) return;
  const holder = document.createElement("div");
  holder.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;z-index:-1;";
  document.body.appendChild(holder);
  const root = createRoot(holder);

  try {
    await new Promise((res) => {
      root.render(<InvoiceDocument inv={inv} />);
      setTimeout(res, 80);
    });

    // Wait for the logo (and any images) to finish loading.
    const imgs = Array.from(holder.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.onload = r;
              img.onerror = r;
            }),
      ),
    );
    await new Promise((r) => setTimeout(r, 150));

    const node = holder.firstElementChild;
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: 794,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const data = canvas.toDataURL("image/png");

    // If the content fits on (roughly) one page, render a SINGLE page. This
    // avoids a spurious near-blank 2nd page caused by sub-pixel rounding
    // (imgH ending up a hair over pageH). Up to ~15% over one page we scale
    // proportionally to fit one page (keeps aspect ratio; small side margin).
    if (imgH <= pageH * 1.15) {
      let w = imgW;
      let h = imgH;
      if (h > pageH) {
        const s = pageH / h;
        h = pageH;
        w = imgW * s;
      }
      const x = (pageW - w) / 2;
      pdf.addImage(data, "PNG", x, 0, w, h, undefined, "FAST");
    } else {
      // Genuinely long invoice — paginate across multiple A4 pages.
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(data, "PNG", 0, position, imgW, imgH, undefined, "FAST");
      heightLeft -= pageH;
      while (heightLeft > 1) {
        position -= pageH;
        pdf.addPage();
        pdf.addImage(data, "PNG", 0, position, imgW, imgH, undefined, "FAST");
        heightLeft -= pageH;
      }
    }
    pdf.save(filename);
  } finally {
    try {
      root.unmount();
    } catch (_) {
      /* noop */
    }
    document.body.removeChild(holder);
  }
}

// Backwards-compatible helper (capture an existing DOM node).
export async function downloadInvoicePdf(node, filename = "invoice.pdf") {
  if (!node) return;
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW;
  const imgH = (canvas.height * imgW) / canvas.width;
  if (imgH <= pageH * 1.15) {
    let w = imgW;
    let h = imgH;
    if (h > pageH) { const s = pageH / h; h = pageH; w = imgW * s; }
    pdf.addImage(imgData, "PNG", (pageW - w) / 2, 0, w, h, undefined, "FAST");
    pdf.save(filename);
    return;
  }
  let heightLeft = imgH;
  let position = 0;
  pdf.addImage(imgData, "PNG", 0, position, imgW, imgH, undefined, "FAST");
  heightLeft -= pageH;
  while (heightLeft > 1) {
    position -= pageH;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgW, imgH, undefined, "FAST");
    heightLeft -= pageH;
  }
  pdf.save(filename);
}
