import { useEffect, useState } from "react";
import api from "@/lib/api";
import {
  ShieldCheck, User, Phone, Mail, Cake, Users, GraduationCap, MapPin,
  Building2, Briefcase, IdCard, FileText, Camera, ZoomIn, X, Lock, Crown, Star,
} from "lucide-react";

const maskAadhaar = (n) => {
  const s = String(n || "").replace(/\s+/g, "");
  if (s.length < 4) return n || "—";
  return `XXXX XXXX ${s.slice(-4)}`;
};

const Field = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3.5">
    {Icon && (
      <span className="h-9 w-9 shrink-0 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 flex items-center justify-center">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
    )}
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-100 break-words">{value || "—"}</p>
    </div>
  </div>
);

const SectionCard = ({ icon: Icon, title, sub, children }) => (
  <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-card overflow-hidden">
    <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
      {Icon && (
        <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-600 to-primary-400 text-white flex items-center justify-center shadow-sm">
          <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
      )}
      <div>
        <h3 className="font-heading font-extrabold text-slate-900 dark:text-white leading-tight">{title}</h3>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const DocTile = ({ label, url, onZoom }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-800/50">
    {url ? (
      <button type="button" onClick={() => onZoom({ url, label })} className="relative block w-full group">
        <img src={url} alt={label} className="h-32 w-full object-cover" />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <ZoomIn className="h-6 w-6 text-white" />
        </span>
      </button>
    ) : (
      <div className="h-32 w-full grid place-items-center text-xs text-slate-400">Not uploaded</div>
    )}
    <p className="text-[11px] font-medium text-slate-500 px-2.5 py-2 border-t border-slate-100 dark:border-slate-800">{label}</p>
  </div>
);

export default function PartnerProfileView({ user, kit }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    api.get("/partner/registration/profile")
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="w-full space-y-4 animate-pulse">
        <div className="h-40 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-52 rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-52 rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  const p = data?.profile || {};
  const b = p.basic || {};
  const w = p.work || {};
  const d = p.documents || {};
  const a = p.address || {};
  const cats = w.categories || [];
  const isPremium = user?.premium_partner || kit?.purchased;
  const locality = [b.village, b.city, b.district, b.state].filter(Boolean).join(", ");
  const mapLink = a.lat && a.lng ? `https://www.google.com/maps?q=${a.lat},${a.lng}` : null;

  return (
    <div className="w-full space-y-5" data-testid="partner-profile-view">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 text-white p-6 shadow-xl">
        <div className="absolute -right-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -right-16 bottom-0 h-40 w-40 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            {b.live_photo_url ? (
              <img src={b.live_photo_url} alt={b.full_name} onClick={() => setZoom({ url: b.live_photo_url, label: "Live photo" })}
                className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/30 cursor-pointer" />
            ) : (
              <div className="h-20 w-20 rounded-2xl bg-white/20 flex items-center justify-center ring-4 ring-white/20">
                <User className="h-9 w-9" />
              </div>
            )}
            <span className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="font-heading font-black text-2xl leading-tight truncate">{b.full_name || user?.name || "Partner"}</h2>
            <p className="text-primary-100 text-sm flex items-center gap-1.5 mt-0.5"><Phone className="h-3.5 w-3.5" /> {b.mobile || user?.phone}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/90 text-emerald-950 text-[11px] font-bold px-2.5 py-1">
                <ShieldCheck className="h-3.5 w-3.5" /> KYC Verified
              </span>
              {isPremium && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold px-2.5 py-1">
                  <Crown className="h-3.5 w-3.5" /> {user?.partner_badge || kit?.badge_label || "AzoApp Pro"}
                </span>
              )}
              {typeof user?.rating === "number" && user.rating > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 text-[11px] font-bold px-2.5 py-1">
                  <Star className="h-3.5 w-3.5 fill-current" /> {user.rating.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Locked notice */}
      <div className="flex items-center gap-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
        <Lock className="h-5 w-5 text-amber-600 shrink-0" />
        <p className="text-sm text-amber-800 dark:text-amber-200">These are the details you submitted during registration. They are verified &amp; locked. To change anything, please contact admin / support.</p>
      </div>

      {/* Personal */}
      <SectionCard icon={User} title="Personal Information" sub="As submitted during registration">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field icon={User} label="Full Name" value={b.full_name} />
          <Field icon={Phone} label="Mobile" value={b.mobile} />
          <Field icon={Cake} label="Date of Birth" value={b.dob} />
          <Field icon={Users} label="Gender" value={b.gender ? b.gender[0].toUpperCase() + b.gender.slice(1) : ""} />
          <Field icon={Mail} label="Email" value={b.email} />
          <Field icon={GraduationCap} label="Education" value={b.education_name} />
          {(b.merchant_name || b.merchant_code) && (
            <Field icon={Building2} label="Referred / Onboarded by" value={b.merchant_name ? `${b.merchant_name}${b.merchant_code ? ` (${b.merchant_code})` : ""}` : b.merchant_code} />
          )}
        </div>
      </SectionCard>

      {/* Skills */}
      <SectionCard icon={Briefcase} title="Skills & Experience" sub={`${cats.length} service ${cats.length === 1 ? "category" : "categories"}`}>
        {cats.length ? (
          <div className="flex flex-wrap gap-2.5">
            {cats.map((c, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 px-3.5 py-2">
                <Briefcase className="h-4 w-4 text-primary-700 dark:text-primary-300" />
                <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{c.category_name}</span>
                {c.experience_label && <span className="text-[11px] font-bold text-primary-700 dark:text-primary-300 bg-white dark:bg-slate-900 rounded-full px-2 py-0.5">{c.experience_label}</span>}
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-400">No skills recorded.</p>}
      </SectionCard>

      {/* Address */}
      <SectionCard icon={MapPin} title="Address & Location">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field icon={MapPin} label="Full Address" value={a.manual_address || a.location_address} />
          <Field icon={Building2} label="Locality" value={locality} />
          <Field icon={MapPin} label="Pincode" value={b.pincode} />
          {mapLink && (
            <a href={mapLink} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-primary-600 text-white p-3.5 font-semibold hover:bg-primary-700 transition-colors">
              <MapPin className="h-5 w-5" /> View pinned location on map
            </a>
          )}
        </div>
      </SectionCard>

      {/* Documents + Live photo */}
      <SectionCard icon={IdCard} title="Documents & KYC">
        <div className="mb-4">
          <Field icon={IdCard} label="Aadhaar Number" value={maskAadhaar(d.aadhaar_number)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <DocTile label="Live Photo" url={b.live_photo_url} onZoom={setZoom} />
          <DocTile label="Aadhaar Front" url={d.aadhaar_front_url} onZoom={setZoom} />
          <DocTile label="Aadhaar Back" url={d.aadhaar_back_url} onZoom={setZoom} />
          <DocTile label="Education Cert" url={d.education_certificate_url} onZoom={setZoom} />
        </div>
      </SectionCard>

      {/* Zoom modal */}
      {zoom && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setZoom(null)}>
          <button className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center" onClick={() => setZoom(null)}>
            <X className="h-5 w-5" />
          </button>
          <div className="max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <img src={zoom.url} alt={zoom.label} className="w-full rounded-2xl" />
            <p className="text-center text-white/80 text-sm mt-3">{zoom.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}
