import React, {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * Renders a self-contained, server-generated invoice HTML document inside an
 * A4-sized iframe and scales it down to fit its container width.
 *
 * This is the SINGLE source of truth for the on-screen preview and the browser
 * print output. The exact same HTML string is rendered to PDF on the backend
 * (WeasyPrint) — so browser preview == print == downloaded PDF.
 *
 * The iframe is kept at natural A4 width (210mm ≈ 794px @96dpi) and only the
 * visual size is scaled via CSS transform. Printing (`ref.print()`) prints the
 * iframe's own document at 100% using its @page rules — the surrounding
 * dashboard UI is never printed.
 */
const A4_W = 794; // 210mm @96dpi
const A4_H = 1123; // 297mm @96dpi

const InvoiceA4Frame = forwardRef(function InvoiceA4Frame({ html, className = "" }, ref) {
  const wrapRef = useRef(null);
  const iframeRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [docH, setDocH] = useState(A4_H);

  useImperativeHandle(
    ref,
    () => ({
      print: () => {
        const win = iframeRef.current?.contentWindow;
        if (!win) return false;
        try {
          win.focus();
          win.print();
          return true;
        } catch {
          return false;
        }
      },
      isReady: () => !!iframeRef.current?.contentWindow,
    }),
    [],
  );

  const measure = () => {
    const el = wrapRef.current;
    if (!el) return;
    const w = el.clientWidth;
    setScale(Math.min(1, w / A4_W));
  };

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLoad = () => {
    try {
      const doc = iframeRef.current.contentDocument;
      if (doc && doc.body) {
        const h = Math.max(
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight,
          A4_H,
        );
        setDocH(h);
      }
    } catch {
      /* cross-origin should never happen for srcDoc — ignore */
    }
    measure();
  };

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", height: Math.round(docH * scale) }}>
      <iframe
        ref={iframeRef}
        title="invoice-preview"
        srcDoc={html || ""}
        onLoad={onLoad}
        scrolling="no"
        style={{
          width: A4_W,
          height: docH,
          border: 0,
          background: "#ffffff",
          display: "block",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          boxShadow: "0 10px 40px rgba(2,6,23,0.14)",
          borderRadius: 2,
        }}
      />
    </div>
  );
});

export default InvoiceA4Frame;
