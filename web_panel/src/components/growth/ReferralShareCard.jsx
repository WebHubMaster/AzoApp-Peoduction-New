import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Copy, Share2, Download } from "lucide-react";
import { drawReferralCard, shareReferral, whatsappUrl, shareText, downloadCard } from "@/lib/growthShare";

/** Premium branded referral share card + one-tap sharing (WhatsApp / native / copy / download). */
export default function ReferralShareCard({ code, reward, discount, link, card }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    try { drawReferralCard(canvasRef.current, { code, reward, discount, card }); setReady(true); } catch { /* ignore */ }
  }, [code, reward, discount, card]);

  const copy = (text, msg) => { navigator.clipboard?.writeText(text); toast.success(msg); };
  const onShare = async () => {
    const res = await shareReferral(canvasRef.current, { code, reward, discount, link });
    if (res === "whatsapp") toast.success("Opening WhatsApp…");
  };
  const onWhatsapp = () => window.open(whatsappUrl(shareText({ code, reward, discount, link })), "_blank");
  const onDownload = async () => { await downloadCard(canvasRef.current); toast.success("Card image downloaded"); };

  return (
    <div data-testid="referral-share-card" className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 azo-elev">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Your shareable card</p>
      <div className="rounded-2xl overflow-hidden shadow-lg mx-auto max-w-[320px] bg-slate-100">
        <canvas ref={canvasRef} className="w-full h-auto block" style={{ aspectRatio: "1 / 1" }} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <button data-testid="share-whatsapp" onClick={onWhatsapp} className="col-span-2 h-12 rounded-2xl bg-[#25D366] text-white font-bold inline-flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <MessageCircle className="h-5 w-5" /> Share on WhatsApp
        </button>
        <button data-testid="share-native" onClick={onShare} disabled={!ready} className="h-11 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-semibold inline-flex items-center justify-center gap-2">
          <Share2 className="h-4 w-4" /> Share card
        </button>
        <button data-testid="share-download" onClick={onDownload} disabled={!ready} className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center justify-center gap-2">
          <Download className="h-4 w-4" /> Save image
        </button>
        <button onClick={() => copy(code, "Referral code copied!")} className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center justify-center gap-2">
          <Copy className="h-4 w-4" /> Copy code
        </button>
        <button onClick={() => copy(link, "Referral link copied!")} className="h-11 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center justify-center gap-2">
          <Copy className="h-4 w-4" /> Copy link
        </button>
      </div>
    </div>
  );
}
