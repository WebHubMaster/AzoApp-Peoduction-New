import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, MapPin, Clock, MessageCircle } from "lucide-react";
import api from "@/lib/api";
import Seo from "@/components/Seo";
import BrandLogo from "@/components/site/BrandLogo";
import MobileBottomNav from "@/components/MobileBottomNav";

const TITLES = {
  about: "About Us", contact: "Contact Us", privacy: "Privacy Policy",
  terms: "Terms & Conditions", refund: "Refund Policy",
};

export default function StaticPage({ pageKey }) {
  const [doc, setDoc] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    api.get(`/content/${pageKey}`).then((r) => setDoc(r.data || {})).catch(() => setDoc({}));
  }, [pageKey]);
  const isHtml = doc?.body && /<[a-z][\s\S]*>/i.test(doc.body);
  const seo = doc?.seo || {};
  const customJson = seo.custom_schema ? (() => { try { return JSON.parse(seo.custom_schema); } catch { return null; } })() : null;
  return (
    <div className="min-h-screen bg-white">
      {doc && (
        <Seo title={seo.seo_title || doc.seo_title || doc.title || TITLES[pageKey]}
          description={seo.meta_description || doc.seo_description}
          image={seo.og_image} path={`/${pageKey}`}
          noindex={seo.robots_index === false}
          jsonLd={customJson} />
      )}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-slate-500 hover:text-primary-700"><ArrowLeft className="h-5 w-5" /></button>
          <BrandLogo to="/" />
        </div>
      </header>
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="font-heading font-black text-3xl sm:text-4xl text-slate-900">{doc?.title || TITLES[pageKey] || "AzoApp"}</h1>
        {pageKey === "contact" && (
          <>
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              {doc?.phone && <a href={`tel:${doc.phone}`} className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 hover:bg-slate-100"><Phone className="h-5 w-5 text-primary-700" /><span className="text-slate-700">{doc.phone}</span></a>}
              {doc?.email && <a href={`mailto:${doc.email}`} className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 hover:bg-slate-100"><Mail className="h-5 w-5 text-primary-700" /><span className="text-slate-700">{doc.email}</span></a>}
              {doc?.whatsapp && <a href={`https://wa.me/${(doc.whatsapp || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-slate-50 rounded-xl p-4 hover:bg-slate-100"><MessageCircle className="h-5 w-5 text-emerald-600" /><span className="text-slate-700">{doc.whatsapp}</span></a>}
              {doc?.address && <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4"><MapPin className="h-5 w-5 text-primary-700" /><span className="text-slate-700">{doc.address}</span></div>}
              {doc?.hours && <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-4"><Clock className="h-5 w-5 text-primary-700" /><span className="text-slate-700">{doc.hours}</span></div>}
            </div>
            {doc?.cta_text && doc?.cta_url && <a href={doc.cta_url} target="_blank" rel="noopener noreferrer" className="inline-flex mt-4 h-11 px-5 items-center rounded-xl bg-[#0D47A1] text-white font-bold">{doc.cta_text}</a>}
            {doc?.map_embed && <div className="mt-6 rounded-2xl overflow-hidden ring-1 ring-slate-200"><iframe title="map" src={doc.map_embed} className="w-full h-72 border-0" loading="lazy" /></div>}
          </>
        )}
        {doc === null ? (
          <div className="mt-6 space-y-3 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-3/4" />
            <div className="h-4 bg-slate-100 rounded w-full" />
            <div className="h-4 bg-slate-100 rounded w-5/6" />
            <div className="h-4 bg-slate-100 rounded w-2/3" />
          </div>
        ) : doc?.body ? (isHtml
          ? <div className="rt-editor prose prose-slate max-w-none mt-6 text-slate-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: doc.body }} />
          : <p className="mt-6 text-slate-700 leading-relaxed whitespace-pre-wrap">{doc.body}</p>)
          : <p className="mt-6 text-slate-400">Content coming soon.</p>}
      </div>
      <MobileBottomNav />
    </div>
  );
}

