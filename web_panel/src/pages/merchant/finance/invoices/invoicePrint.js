/**
 * Print an invoice as a clean A4 document from the server-rendered, fully
 * self-contained invoice HTML (the SAME HTML the PDF is generated from). A
 * hidden same-origin iframe is used so only the invoice document prints — no
 * dashboard UI, no pop-ups.
 */
export async function printInvoiceHtml(html, title = "Invoice") {
  if (!html) throw new Error("no invoice html");
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      iframe.contentWindow?.removeEventListener?.("afterprint", cleanup);
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
    }, 500);
  };

  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html.includes("<title") ? html : html.replace("</head>", `<title>${title}</title></head>`));
  doc.close();

  // Wait for embedded fonts + any images to settle before printing.
  await new Promise((r) => setTimeout(r, 120));
  const imgs = Array.from(doc.querySelectorAll("img"));
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
  try {
    if (doc.fonts && doc.fonts.ready) await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 1200))]);
  } catch {
    /* ignore */
  }
  await new Promise((r) => setTimeout(r, 150));

  const win = iframe.contentWindow;
  win.addEventListener("afterprint", cleanup);
  win.focus();
  win.print();
  // Safari/iOS may not fire afterprint — fallback cleanup.
  setTimeout(cleanup, 60000);
}
