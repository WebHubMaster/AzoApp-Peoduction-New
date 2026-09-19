import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, ArrowLeft, Download, Printer, Share2, MessageCircle, Link2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import InvoiceA4Frame from "@/components/invoices/InvoiceA4Frame";
import { DocumentSkeleton, InvStatusBadge } from "./InvoiceParts";
import { ActionSheet } from "./Overlays";
import { shortDate } from "./invoiceUtils";

const A4_W = 794;

/**
 * Full-screen invoice viewer. Desktop: centered document with a toolbar.
 * Mobile: full-screen viewer with sticky bottom actions (Download / Share / Print).
 */
export default function InvoiceViewer({ inv, loading, onClose, onDownload, onPrint, onShare, downloading, printing }) {
  const open = !!inv;
  const [shareOpen, setShareOpen] = useState(false);
  const [html, setHtml] = useState("");
  const frameRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => { if (e.key === "Escape") { if (shareOpen) setShareOpen(false); else onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose, shareOpen]);

  // Fetch the SAME HTML the PDF is rendered from → preview == print == PDF.
  useEffect(() => {
    let alive = true;
    setHtml("");
    const id = inv?.id;
    if (!open || !id) return () => { alive = false; };
    (async () => {
      try {
        const r = await api.get(`/invoices/${id}/view`, { responseType: "text", transformResponse: [(d) => d] });
        if (alive) setHtml(typeof r.data === "string" ? r.data : "");
      } catch { if (alive) setHtml(""); }
    })();
    return () => { alive = false; };
  }, [open, inv?.id]);

  const ready = open && !loading && inv?.invoice_number;
  const share = (ch) => { setShareOpen(false); onShare(inv, ch); };
  const doPrint = () => {
    if (frameRef.current?.isReady?.() && frameRef.current.print()) return;
    onPrint(inv);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[85] bg-slate-100 dark:bg-slate-950 flex flex-col" data-testid="invoice-viewer" role="dialog" aria-modal="true">
          {/* toolbar */}
          <div className="shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 pt-[env(safe-area-inset-top)]">
            <div className="max-w-[1100px] mx-auto flex items-center gap-2 px-3 sm:px-5 h-14 sm:h-16">
              <button onClick={onClose} aria-label="Back" className="h-11 w-11 sm:h-10 sm:w-10 rounded-xl grid place-items-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-95 transition" data-testid="viewer-close">
                <ArrowLeft className="h-5 w-5 sm:hidden" /><X className="h-5 w-5 hidden sm:block" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-heading font-bold text-slate-900 dark:text-white truncate leading-tight">{inv?.invoice_number || "Invoice"}</p>
                <p className="text-[11px] text-slate-400 truncate">{inv?.issue_date ? `Issued ${shortDate(inv.issue_date)}` : "Loading invoice…"}{inv?.merchant_snapshot?.name ? ` · ${inv.merchant_snapshot.name}` : ""}</p>
              </div>
              {ready && <div className="hidden sm:block mr-1"><InvStatusBadge status={inv.payment_status} /></div>}
              {/* desktop actions */}
              <div className="hidden sm:flex items-center gap-2">
                <Button variant="outline" className="h-10 rounded-xl" onClick={doPrint} disabled={!ready || printing} data-testid="viewer-print"><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
                <Button variant="outline" className="h-10 rounded-xl" onClick={() => setShareOpen(true)} disabled={!ready} data-testid="viewer-share"><Share2 className="h-4 w-4 mr-1.5" /> Share</Button>
                <Button className="h-10 rounded-xl bg-[#0D47A1] hover:bg-primary-800 text-white" onClick={() => onDownload(inv)} disabled={!ready || downloading} data-testid="viewer-download">
                  {downloading ? <span className="h-4 w-4 mr-1.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download PDF
                </Button>
              </div>
            </div>
          </div>

          {/* document */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-[1100px] mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-28 sm:pb-10">
              {!ready || !html ? <DocumentSkeleton /> : (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto" style={{ maxWidth: A4_W }}>
                  <InvoiceA4Frame ref={frameRef} html={html} />
                  <p className="text-center text-[11px] text-slate-400 mt-4">This is a computer-generated invoice · Reference {inv.invoice_number}</p>
                </motion.div>
              )}
            </div>
          </div>

          {/* mobile sticky actions */}
          <div className="sm:hidden shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2.5 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] grid grid-cols-3 gap-2" data-testid="viewer-mobile-actions">
            <Button className="h-12 rounded-xl bg-[#0D47A1] hover:bg-primary-800 text-white" onClick={() => onDownload(inv)} disabled={!ready || downloading} data-testid="viewer-m-download">
              {downloading ? <span className="h-4 w-4 mr-1.5 rounded-full border-2 border-white/40 border-t-white animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />} Download
            </Button>
            <Button variant="outline" className="h-12 rounded-xl" onClick={() => setShareOpen(true)} disabled={!ready} data-testid="viewer-m-share"><Share2 className="h-4 w-4 mr-1.5" /> Share</Button>
            <Button variant="outline" className="h-12 rounded-xl" onClick={doPrint} disabled={!ready || printing} data-testid="viewer-m-print"><Printer className="h-4 w-4 mr-1.5" /> Print</Button>
          </div>

          <ShareSheet open={shareOpen} onClose={() => setShareOpen(false)} onPick={share} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function ShareSheet({ open, onClose, onPick }) {
  const Item = ({ icon: Icon, tone, title, sub, ch, testid }) => (
    <button type="button" onClick={() => onPick(ch)} data-testid={testid}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-[0.99] transition text-left min-h-[56px]">
      <span className={`h-11 w-11 rounded-xl grid place-items-center ${tone}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0"><p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p><p className="text-xs text-slate-400">{sub}</p></div>
    </button>
  );
  return (
    <ActionSheet open={open} onClose={onClose} title="Share invoice" testid="invoice-share-sheet">
      <Item icon={MessageCircle} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40" title="WhatsApp" sub="Send invoice summary & link" ch="whatsapp" testid="share-whatsapp" />
      <Item icon={Link2} tone="bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300" title="Copy Link" sub="Copy a link to this invoice" ch="copy" testid="share-copy" />
      <Item icon={Share2} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="System Share" sub="Share via installed apps" ch="system" testid="share-system" />
      <Item icon={Copy} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="Copy Details" sub="Invoice number, amount & status" ch="text" testid="share-text" />
    </ActionSheet>
  );
}
