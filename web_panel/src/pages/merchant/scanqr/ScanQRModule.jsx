import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck, Share2, MessageCircle, Copy, ClipboardCheck, Download, Printer,
  QrCode, Eye, SlidersHorizontal, CheckCircle2, ZoomIn, ZoomOut, Maximize2, RotateCcw, Loader2, X,
} from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { DEFAULT_CONFIG, TEMPLATES } from "@/pages/merchant/scanqr/qrData";
import QrBookingPoster, { posterDims } from "@/components/qr/QrBookingPoster";
import PosterControls from "@/pages/merchant/scanqr/PosterControls";
import QRAnalytics from "@/pages/merchant/scanqr/QRAnalytics";

const PANEL = "/merchant/panel";

export default function ScanQRModule({ code = "", shopName = "My Shop", user }) {
  const link = `${window.location.origin}/?ref=${code || ""}`;
  const { branding = {} } = useSiteConfig();
  const adminLogo = branding.logo_light || branding.logo_dark || branding.logo || "";
  const [config, setConfig] = useState(null);
  const [tab, setTab] = useState("preview");
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [posterSize] = useState("ig_post");
  const [waMsg, setWaMsg] = useState("");
  const posterRef = useRef(null);
  const qrCanvasRef = useRef(null);
  const lastSaved = useRef(null);
  const posterBlobRef = useRef(null);

  useEffect(() => {
    api.get(`${PANEL}/qr/config`).then((r) => {
      const saved = r.data || {};
      const s = saved.show || {};
      const merged = {
        ...DEFAULT_CONFIG, ...saved,
        businessName: saved.businessName || shopName,
        phone: saved.phone || user?.phone?.replace("+91", "") || "",
        logoUrl: adminLogo,
        // only merchant-toggleable elements are kept; everything else is hidden
        show: { logo: s.logo !== false, tagline: s.tagline !== false },
        services: saved.services || DEFAULT_CONFIG.services,
      };
      lastSaved.current = JSON.stringify(merged);
      setConfig(merged);
    }).catch(() => { const d = { ...DEFAULT_CONFIG, businessName: shopName, logoUrl: adminLogo }; lastSaved.current = JSON.stringify(d); setConfig(d); });
    setWaMsg(`Hi 👋\nBook trusted home services from ${shopName}.\nElectrician, Plumber, AC Repair, Appliance Repair and more.\n\nBook now:\n${link}\n\nScan our QR or use the booking link.`);
  }, [shopName, user, link, adminLogo]);

  // keep the admin-managed logo in sync if branding loads/updates after config
  useEffect(() => {
    if (!config) return;
    if ((config.logoUrl || "") !== (adminLogo || "")) setConfig((c) => ({ ...c, logoUrl: adminLogo }));
  }, [adminLogo]);

  // debounced persist — only when the config actually changed vs last saved
  useEffect(() => {
    if (!config) return;
    const snap = JSON.stringify(config);
    if (snap === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = snap;
      api.put(`${PANEL}/qr/config`, config).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [config]);

  const businessName = (config?.businessName || shopName);
  // Brand + colours for the SHARED poster component (single source of truth).
  const tpl = TEMPLATES.find((t) => t.id === config?.template) || TEMPLATES[0];
  const posterBrand = {
    logo: (config?.show?.logo === false) ? "" : (config?.logoUrl || adminLogo || ""),
    siteName: branding.site_name || "AzoApp",
    tagline: branding.tagline || "",
    primary: config?.primary || tpl.primary || "#0D47A1",
    secondary: tpl.primary2 || "",
  };
  const posterTrust = (config?.show?.tagline === false) ? "" : "Trusted Home Services";
  // Single, consistent share message. The LINK appears exactly ONCE here — no share
  // path may add a second copy (e.g. via a separate `url` param).
  const shareCaption = `Book trusted home services with ${businessName} on AzoApp — Electrician, Plumber, AC Repair, Appliance Repair & more.`;
  const shareMessage = `${shareCaption}\n\nBook now: ${link}`;

  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); toast.success("Link copied successfully"); setTimeout(() => setCopied(false), 1500); };

  // Pre-generate the poster image in the background so tapping "Share" fires the
  // Web Share API instantly (inside the user gesture) — fast + reliable, no long wait.
  useEffect(() => {
    if (!config) return;
    posterBlobRef.current = null;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const canvas = await capturePoster(2);
        if (cancelled || !canvas) return;
        const blob = await new Promise((res) => canvas.toBlob(res, "image/png", 0.95));
        if (cancelled || !blob) return;
        posterBlobRef.current = blob;
      } catch { /* poster not ready — nativeShare will build on demand */ }
    }, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [config, posterSize]);

  // Share the SAME designed poster image (identical to preview/print/download) + text
  // + link. Uses a pre-built blob when ready (instant), otherwise builds on demand.
  // The LINK is passed ONLY inside the message text (never also as a separate `url`
  // param) so it can never appear twice in the shared content.
  const nativeShare = async () => {
    if (busy) return;                       // block multiple clicks while working
    setBusy("share");
    try {
      const file = await buildPosterFile();
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: businessName, text: shareMessage });
        return;
      }
      if (navigator.share) { await navigator.share({ title: businessName, text: shareMessage }); return; }
      setShareOpen(true);
    } catch (e) {
      // user cancelling the native sheet throws AbortError — that's not an error
      if (!(e && e.name === "AbortError")) setShareOpen(true);
    } finally {
      setBusy("");
    }
  };
  // WhatsApp share. On devices that support file sharing (mobile) it sends the DESIGNED
  // POSTER + message (link once) so the merchant can pick WhatsApp from the native sheet.
  // On desktop/web (WhatsApp links can't carry an image) it saves the poster to the
  // device and opens WhatsApp with the text (link once) so it can be attached manually.
  const waShare = async () => {
    if (busy) return;
    setBusy("wa");
    try {
      const file = await buildPosterFile();
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: businessName, text: waMsg }); return; }
        catch (e) { if (e && e.name === "AbortError") return; }
      }
      if (file) {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a"); a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
        toast.success("Poster saved — attach it in WhatsApp with your message");
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, "_blank");
    } catch {
      window.open(`https://wa.me/?text=${encodeURIComponent(waMsg)}`, "_blank");
    } finally {
      setBusy("");
    }
  };

  const capturePoster = async (quality = 3) => {
    const node = posterRef.current; if (!node) return null;
    // Wait for brand fonts so the export never falls back to a different font.
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* noop */ } }
    const { canvasW, canvasH, conf } = posterDims(posterSize, 1);
    // Social canvases are already high-res (1080px+ native); cap the multiplier so
    // exports stay sharp without producing needlessly huge (slow) images.
    const q = conf.social ? 2 : quality;
    return html2canvas(node, {
      scale: q, useCORS: true, backgroundColor: "#ffffff", logging: false,
      width: canvasW, height: canvasH,
      windowWidth: canvasW, windowHeight: canvasH,
      scrollX: 0, scrollY: 0,
    });
  };
  // Build a PNG File of the designed poster (reuses the pre-generated blob when ready).
  const buildPosterFile = async () => {
    let blob = posterBlobRef.current;
    if (!blob) {
      const canvas = await capturePoster(2);
      if (canvas) blob = await new Promise((res) => canvas.toBlob(res, "image/png", 0.95));
    }
    return blob ? new File([blob], `azoapp-poster-${code}.png`, { type: "image/png" }) : null;
  };
  const downloadPoster = async (fmt) => {
    setBusy(fmt);
    try {
      const canvas = await capturePoster(3);
      if (!canvas) return;
      if (fmt === "pdf") {
        // print-ready PDF at the SELECTED physical paper size; image fills the page 1:1
        const img = canvas.toDataURL("image/jpeg", 0.95);
        const { conf } = posterDims(posterSize);
        const pdf = new jsPDF({ orientation: "portrait", unit: conf.pdf.unit, format: conf.pdf.format });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        pdf.addImage(img, "JPEG", 0, 0, pw, ph);
        pdf.save(`azoapp-poster-${code}-${posterSize}.pdf`);
      } else {
        const mime = fmt === "jpg" ? "image/jpeg" : "image/png";
        const a = document.createElement("a"); a.href = canvas.toDataURL(mime, 0.95); a.download = `azoapp-poster-${code}.${fmt}`; a.click();
      }
      toast.success(`Poster downloaded (${fmt.toUpperCase()})`);
    } catch { toast.error("Download failed — please retry"); } finally { setBusy(""); }
  };
  const downloadQrPng = () => {
    const c = qrCanvasRef.current?.querySelector("canvas"); if (!c) return;
    const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `azoapp-qr-${code}.png`; a.click(); toast.success("QR PNG downloaded");
  };
  const downloadQrSvg = () => {
    const svg = qrCanvasRef.current?.querySelector("svg"); if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `azoapp-qr-${code}.svg`; a.click(); URL.revokeObjectURL(a.href); toast.success("QR SVG downloaded");
  };
  const printPoster = async () => {
    setBusy("print");
    try {
      const canvas = await capturePoster(3); if (!canvas) return;
      const img = canvas.toDataURL("image/png");
      const { conf } = posterDims(posterSize);
      const w = window.open("", "_blank");
      w.document.write(`<html><head><title>AzoApp Poster</title><style>@page{size:${conf.page};margin:0}html,body{margin:0;padding:0}img{width:${conf.imgW};height:${conf.imgH};display:block}</style></head><body><img src="${img}" onload="window.print();window.close()"/></body></html>`);
      w.document.close();
    } catch { toast.error("Print failed"); } finally { setBusy(""); }
  };

  if (!config) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline text-primary-600" /></div>;

  const previewDims = posterDims(posterSize, 1);
  const previewBaseW = 340;
  const previewScale = (previewBaseW / previewDims.canvasW) * zoom;

  const Preview = (
    <div className="rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 p-4 flex flex-col items-center" data-testid="poster-preview">
      <div className="flex items-center gap-1 mb-3 self-end">
        <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))} className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid place-items-center text-slate-500" data-testid="zoom-out"><ZoomOut className="h-4 w-4" /></button>
        <button onClick={() => setZoom(1)} className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid place-items-center text-slate-500" data-testid="zoom-fit"><Maximize2 className="h-4 w-4" /></button>
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 grid place-items-center text-slate-500" data-testid="zoom-in"><ZoomIn className="h-4 w-4" /></button>
      </div>
      <div style={{ width: previewDims.canvasW * previewScale, height: previewDims.canvasH * previewScale, overflow: "hidden" }} className="rounded-xl shadow-xl transition-all duration-200">
        <div style={{ transform: `scale(${previewScale})`, transformOrigin: "top left" }}>
          <QrBookingPoster qrValue={link} token={code} merchantName={businessName} brand={posterBrand} trustLine={posterTrust} width={previewDims.canvasW} height={previewDims.canvasH} scale={previewDims.scale} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="pb-28 lg:pb-0" data-testid="scanqr-module">
      {/* Header actions */}
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="font-heading font-extrabold text-2xl lg:text-3xl text-slate-900 dark:text-white tracking-tight">Scan QR</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-xl">Share your booking link, generate branded QR posters and let customers book your services instantly.</p>
        </div>
        <div className="hidden lg:flex gap-2">
          <Button variant="outline" onClick={nativeShare} disabled={!!busy} data-testid="hdr-share">{busy === "share" ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Please wait…</> : <><Share2 className="h-4 w-4 mr-1" /> Share</>}</Button>
          <Button variant="outline" onClick={() => downloadPoster("png")} disabled={!!busy} data-testid="hdr-download">{busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Download</Button>
          <Button className="bg-primary-700 hover:bg-primary-800" onClick={printPoster} disabled={!!busy} data-testid="hdr-print">{busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Print</Button>
        </div>
      </div>

      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-primary-800 to-primary-600 text-white p-5 lg:p-6 mb-6 shadow-lg">
        <div className="grid lg:grid-cols-[auto,1fr] gap-6 items-center">
          <div className="bg-white rounded-2xl p-4 grid place-items-center mx-auto" ref={qrCanvasRef}>
            <QRCodeCanvas value={link} size={150} level="M" fgColor="#0b1220" />
            <QRCodeSVG value={link} size={150} level="M" fgColor="#0b1220" style={{ display: "none" }} />
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold mb-2"><ShieldCheck className="h-3.5 w-3.5" /> Verified Merchant QR</div>
            <h2 className="font-heading font-extrabold text-2xl">{businessName}</h2>
            <p className="text-primary-100 text-sm">{config.tagline || "Trusted Home Services"}</p>
            <p className="text-primary-100 text-xs mt-2 break-all">{link}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px]">
              <span className="bg-white/15 rounded px-2 py-0.5">Ref: <b>{code}</b></span>
              <span className="inline-flex items-center gap-1 text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
              <span className="inline-flex items-center gap-1 text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Verified</span>
              <span className="inline-flex items-center gap-1 text-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" /> Booking Enabled</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button onClick={nativeShare} disabled={!!busy} className="h-10 bg-white text-primary-800 hover:bg-primary-50 font-bold disabled:opacity-70" data-testid="hero-share">{busy === "share" ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Please wait…</> : <><Share2 className="h-4 w-4 mr-1" /> Share</>}</Button>
              <Button onClick={waShare} disabled={!!busy} className="h-10 bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-70" data-testid="hero-whatsapp">{busy === "wa" ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Please wait…</> : <><MessageCircle className="h-4 w-4 mr-1" /> WhatsApp</>}</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Poster builder */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 p-4 lg:p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white flex items-center gap-2"><QrCode className="h-5 w-5 text-primary-700" /> Create Your Booking Poster</h3>
          <div className="lg:hidden flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {[["preview", "Preview", Eye], ["edit", "Customize", SlidersHorizontal]].map(([v, l, I]) => (
              <button key={v} onClick={() => setTab(v)} className={`px-3 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 ${tab === v ? "bg-white dark:bg-slate-900 text-primary-700 shadow-sm" : "text-slate-500"}`}><I className="h-3.5 w-3.5" /> {l}</button>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className={tab === "preview" ? "block" : "hidden lg:block"}>
            {Preview}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              <Button variant="outline" onClick={() => downloadPoster("png")} disabled={!!busy} data-testid="dl-png">{busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} PNG</Button>
              <Button variant="outline" onClick={() => downloadPoster("jpg")} disabled={!!busy} data-testid="dl-jpg"><Download className="h-4 w-4 mr-1" /> JPG</Button>
              <Button variant="outline" onClick={() => downloadPoster("pdf")} disabled={!!busy} data-testid="dl-pdf">{busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} PDF</Button>
              <Button className="bg-primary-700 hover:bg-primary-800" onClick={printPoster} disabled={!!busy} data-testid="dl-print">{busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />} Print</Button>
            </div>
          </div>
          <div className={tab === "edit" ? "block" : "hidden lg:block"}>
            <PosterControls config={config} setConfig={setConfig} adminLogo={adminLogo} />
            <Button variant="ghost" className="mt-4 text-slate-500" onClick={() => setConfig({ ...DEFAULT_CONFIG, businessName: shopName, phone: user?.phone?.replace("+91", "") || "", logoUrl: adminLogo })} data-testid="reset-poster"><RotateCcw className="h-4 w-4 mr-1" /> Reset design</Button>
          </div>
        </div>
      </div>

      {/* Analytics */}
      <QRAnalytics />

      {/* Offscreen full-res poster for export (kept at 0,0 behind app content so html2canvas captures it fully & opaque). Rendered at the SELECTED paper size. */}
      <div style={{ position: "fixed", left: 0, top: 0, zIndex: -1000, pointerEvents: "none" }} aria-hidden>
        <div ref={posterRef}>
          <QrBookingPoster qrValue={link} token={code} merchantName={businessName} brand={posterBrand} trustLine={posterTrust} width={previewDims.canvasW} height={previewDims.canvasH} scale={previewDims.scale} />
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 p-2.5 grid grid-cols-3 gap-2" data-testid="sticky-bar">
        <Button onClick={nativeShare} variant="outline" className="h-11"><Share2 className="h-4 w-4 mr-1" /> Share</Button>
        <Button onClick={() => downloadPoster("png")} disabled={!!busy} variant="outline" className="h-11">{busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Save</Button>
        <Button onClick={printPoster} disabled={!!busy} className="h-11 bg-primary-700 hover:bg-primary-800"><Printer className="h-4 w-4 mr-1" /> Print</Button>
      </div>

      {/* Desktop share modal */}
      {shareOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-4" data-testid="share-modal">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setShareOpen(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">Share your booking link</h3>
              <button onClick={() => setShareOpen(false)} className="h-9 w-9 rounded-xl grid place-items-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-2">Edit the message before sharing (your booking link is already included):</p>
            <Textarea value={waMsg} onChange={(e) => setWaMsg(e.target.value)} className="min-h-[120px] text-sm" />
            <button
              type="button"
              onClick={() => downloadPoster("png")}
              disabled={!!busy}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary-300 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/20 px-3 py-2 text-xs font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-50 disabled:opacity-60"
              data-testid="share-save-poster"
            >
              {busy === "png" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Save designed poster to attach with your message
            </button>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Button onClick={waShare} disabled={!!busy} className="h-11 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-70">{busy === "wa" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageCircle className="h-4 w-4 mr-1" />} WhatsApp</Button>
              <Button onClick={() => { const textNoLink = waMsg.split(link).join("").replace(/\n{3,}/g, "\n\n").trim(); window.open(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(textNoLink)}`, "_blank"); }} variant="outline" className="h-11">Telegram</Button>
              <Button onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`, "_blank")} variant="outline" className="h-11">Facebook</Button>
              <Button onClick={copy} variant="outline" className="h-11">{copied ? <ClipboardCheck className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />} Copy Link</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
