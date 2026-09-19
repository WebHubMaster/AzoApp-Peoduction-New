import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  User, Store, MapPin, ClipboardCheck, Check, ChevronLeft, ChevronRight, Loader2,
  ShieldCheck, AlertTriangle, CheckCircle2, Camera, Search, Star, Zap, Wallet,
  LogOut, Navigation, Clock, FileText, X,
} from "lucide-react";
import api, { compactPlus } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import LivePhotoCapture from "@/components/partner/LivePhotoCapture";
import GpsPhotoCapture from "@/components/merchant/GpsPhotoCapture";

const DEFAULT_REG = "/merchant/registration";
const mediaUrl = (u) => (!u ? "" : u.startsWith("http") ? u : `${process.env.REACT_APP_BACKEND_URL || ""}${u}`);

const STEPS = [
  { key: "basic", label: "Owner", icon: User },
  { key: "shop", label: "Shop", icon: Store },
  { key: "address", label: "Address", icon: MapPin },
  { key: "review", label: "Review", icon: ClipboardCheck },
];
const TITLES = ["Owner Details", "Shop Details", "Shop Address", "Review & Submit"];

/* ---------------- Completion score ring ---------------- */
function ScoreRing({ score = 0, size = 76 }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth="6" className="stroke-white/20" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth="6" strokeLinecap="round"
          className="stroke-white transition-all duration-700" fill="none"
          strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
        <span className="font-extrabold text-lg leading-none">{score}%</span>
      </div>
    </div>
  );
}

/* ---------------- Searchable combo ---------------- */
function Combo({ value, display, onSelect, options, labelKey = "name", placeholder, disabled, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const arr = options || [];
    if (!ql) return arr.slice(0, 60);
    return arr.filter((o) => String(o[labelKey] || "").toLowerCase().includes(ql)).slice(0, 60);
  }, [q, options, labelKey]);
  return (
    <div className="relative" ref={boxRef}>
      <button type="button" data-testid={testid} disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left text-sm transition
          ${disabled ? "bg-slate-100 dark:bg-slate-800/60 text-slate-400 border-slate-200 dark:border-slate-700 cursor-not-allowed"
            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-primary-400 text-slate-800 dark:text-slate-100"}`}>
        <span className={display ? "" : "text-slate-400"}>{display || placeholder}</span>
        <Search className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" className="h-9" />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">No results</p>}
            {filtered.map((o) => (
              <button type="button" key={o.id || o[labelKey]}
                onClick={() => { onSelect(o); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm hover:bg-primary-50 dark:hover:bg-primary-900/20
                  ${value === (o.id || o[labelKey]) ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium" : "text-slate-700 dark:text-slate-200"}`}>
                {o[labelKey]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, children, hint, required }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
      {label}{required && <span className="text-red-500"> *</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
  </div>
);

/* ---------------- Document uploader ---------------- */
function Uploader({ label, value, onUploaded, docType, required, base = DEFAULT_REG }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType);
      const { data } = await api.post(`${base}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      onUploaded(data);
      toast.success(`${label} uploaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  };
  return (
    <Field label={label} required={required}>
      <div onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-4 flex items-center gap-3 transition
          ${value ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30" : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:border-primary-400"}`}
        data-testid={`upload-${docType}`}>
        {busy ? <Loader2 className="h-6 w-6 text-primary-600 animate-spin" />
          : value ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            : <FileText className="h-6 w-6 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {busy ? "Uploading…" : value ? "Uploaded — tap to replace" : "Tap to upload (JPG/PNG/PDF)"}
          </p>
          {value && !busy && <p className="text-xs text-emerald-600 truncate">{value.split("/").pop()}</p>}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={(e) => upload(e.target.files?.[0])} />
    </Field>
  );
}

/* =============================================================== */
export default function MerchantRegistration({ embedded = false, onComplete, adminEdit = false, regBase, lockedPhone } = {}) {
  const { logout, refresh } = useAuth();
  const REG = regBase || DEFAULT_REG;
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("incomplete");
  const [rejection, setRejection] = useState("");
  const [score, setScore] = useState({ score: 0, sections: {}, missing: [] });
  const [meta, setMeta] = useState({ categories: [], shop_types: [] });

  const [basic, setBasic] = useState({ full_name: "", dob: "", gender: "", email: "", mobile: "", owner_photo: "" });
  const [shop, setShop] = useState({ shop_name: "", shop_type_id: "", shop_type_name: "", categories: [], gst_number: "", gst_url: "", shop_verification_photo: "", shop_photo_lat: null, shop_photo_lng: null, shop_photo_distance_m: null, shop_photo_verified: false, shop_photo_gps_ok: false });
  const [addr, setAddr] = useState({ manual_address: "", city: "", district: "", state: "", pincode: "", lat: null, lng: null, location_address: "" });
  // Service-area check for the entered pincode (registration is blocked out-of-area)
  const [pinCov, setPinCov] = useState(null); // {serviceable, serviced_cities}
  const [pinChecking, setPinChecking] = useState(false);
  useEffect(() => {
    const pin = String(addr.pincode || "").trim();
    if (pin.length !== 6) { setPinCov(null); setPinChecking(false); return; }
    let alive = true;
    setPinChecking(true);
    api.get(`/geo/serviceability?pincode=${pin}`)
      .then((r) => { if (alive) setPinCov(r.data); })
      .catch(() => { if (alive) setPinCov(null); })
      .finally(() => { if (alive) setPinChecking(false); });
    return () => { alive = false; };
  }, [addr.pincode]);

  const load = useCallback(async () => {
    const { data } = await api.get(`${REG}/profile`);
    const p = data.profile;
    setBasic((b) => ({ ...b, ...p.basic }));
    setShop((s) => ({ ...s, ...p.shop }));
    setAddr((a) => ({ ...a, ...p.address }));
    setScore(data.score);
    setStatus(data.kyc_status || p.status);
    setRejection(data.rejection_reason || "");
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    api.get(`${REG}/meta`).then((r) => setMeta(r.data)).catch(() => {});
  }, [load]);

  const editable = adminEdit || (status !== "approved" && status !== "under_review");

  const saveSection = async (section, payload) => {
    const { data } = await api.put(`${REG}/${section}`, payload);
    setScore(data.score);
    return data;
  };

  const next = async () => {
    setSaving(true);
    try {
      if (step === 0) {
        const em = String(basic.email || "").trim();
        if (!em) { toast.error("Email is required"); setSaving(false); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { toast.error("Enter a valid email address"); setSaving(false); return; }
        await saveSection("basic", basic);
      }
      else if (step === 1) await saveSection("shop", shop);
      else if (step === 2) {
        if (!adminEdit && pinCov && pinCov.serviceable === false) {
          toast.error("We don't serve this pincode yet — your application can't be submitted for this area.");
          setSaving(false); return;
        }
        await saveSection("address", addr);
      }
      if (step < STEPS.length - 1) setStep(step + 1);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not save");
    } finally { setSaving(false); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`${REG}/submit`);
      toast.success("Application submitted for review");
      await load();
      setStep(STEPS.length - 1);  // show the Review / Under-review screen after submit
      await refresh?.();
      onComplete?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Please complete all required fields");
    } finally { setSaving(false); }
  };

  if (!loaded) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="h-7 w-7 animate-spin text-primary-400" /></div>;

  /* ---------- UNDER REVIEW (form locked, same as partner) ---------- */
  if (status === "under_review" && !adminEdit && !embedded) {
    return (
      <Shell onLogout={logout}>
        <div className="text-center py-8" data-testid="reg-under-review">
          <div className="mx-auto h-20 w-20 rounded-full bg-amber-100 grid place-items-center mb-5">
            <Clock className="h-10 w-10 text-amber-500" />
          </div>
          <h2 className="font-heading font-extrabold text-2xl text-slate-900">Account Under Review</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">Your account is under review. You will receive an update within 24–48 hours. Please wait until your account is approved.</p>
          <span className="inline-block mt-5 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold px-4 py-1.5">Under Review</span>
          <div className="mt-8">
            <Button variant="outline" data-testid="reg-refresh-status" onClick={async () => { await load(); await refresh?.(); }}>Refresh status</Button>
          </div>
        </div>
      </Shell>
    );
  }

  const StepIcon = STEPS[step].icon;

  const savePhoto = async ({ url, lat, lng, captured_at }) => {
    try {
      const { data } = await api.put(`${REG}/shop-photo`, { shop_verification_photo: url, lat, lng, captured_at });
      setShop((s) => ({ ...s, ...data.photo }));
      setScore(data.score);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save photo"); }
  };

  const content = (
    <>
      {status === "approved" && (
        <div className="mb-5 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5 flex items-start gap-3 shadow-lg" data-testid="reg-approved">
          <span className="h-11 w-11 rounded-2xl bg-white/15 grid place-items-center shrink-0"><ShieldCheck className="h-6 w-6" /></span>
          <div><p className="font-heading font-bold text-lg">Profile approved &amp; locked</p><p className="text-sm text-white/85 mt-0.5">You are a Verified Merchant. To change details, contact support.</p></div>
        </div>
      )}
      {status === "under_review" && (
        <div className="mb-5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 p-4 flex items-start gap-3" data-testid="reg-under-review">
          <Clock className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div><p className="font-semibold text-amber-700 dark:text-amber-400">Under review</p><p className="text-sm text-amber-600 dark:text-amber-300/90 mt-0.5">Your application is being reviewed. You&apos;ll be notified within 24–48 hours.</p></div>
        </div>
      )}
      {status === "rejected" && (
        <div className="mb-5 rounded-2xl bg-red-50 dark:bg-rose-950/30 border border-red-200 dark:border-rose-900/50 p-4 flex items-start gap-3" data-testid="reg-rejected">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-rose-400">Application needs changes</p>
            <p className="text-sm text-red-600 dark:text-rose-300/90 mt-0.5">{rejection}</p>
            <p className="text-xs text-red-500 mt-1">Please correct the details below and submit again.</p>
          </div>
        </div>
      )}

      {/* premium stepper */}
      <div className="mb-6" data-testid="reg-stepper">
        {/* mobile compact progress */}
        <div className="sm:hidden mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Step {step + 1} of {STEPS.length} · <span className="text-primary-600">{STEPS[step].label}</span></p>
            <span className="text-xs font-semibold text-slate-400">{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-primary-600 transition-all duration-500" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
        </div>
        {/* desktop horizontal stepper */}
        <div className="hidden sm:flex items-center">
          {STEPS.map((s, i) => {
            const done = i < step; const cur = i === step; const Ic = s.icon;
            return (
              <div key={s.key} className="flex items-center flex-1 last:flex-none">
                <button onClick={() => (!editable || i <= step) && setStep(i)} className="flex items-center gap-2.5 group" data-testid={`mstep-${s.key}`}>
                  <div className={`h-10 w-10 rounded-2xl grid place-items-center text-sm font-bold transition-all shrink-0
                    ${done ? "bg-emerald-500 text-white" : cur ? "bg-primary-700 text-white ring-4 ring-primary-100 dark:ring-primary-900/40 shadow-lg shadow-primary-500/30" : "bg-slate-100 dark:bg-slate-800 text-slate-400"}`}>
                    {done ? <Check className="h-4 w-4" /> : <Ic className="h-4 w-4" />}
                  </div>
                  <div className="text-left">
                    <p className={`text-[10px] uppercase tracking-wide ${cur || done ? "text-slate-400" : "text-slate-300 dark:text-slate-600"}`}>Step {i + 1}</p>
                    <p className={`text-sm font-bold leading-none mt-0.5 ${cur ? "text-primary-700 dark:text-primary-300" : done ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}`}>{s.label}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-3 rounded-full ${i < step ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <StepIcon className="h-5 w-5 text-primary-700 dark:text-primary-400" />
        <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">{TITLES[step]}</h2>
      </div>

      {/* STEP 0: OWNER */}
      {step === 0 && (
        <div className="space-y-4" data-testid="step-owner">
          <LivePhotoCapture value={mediaUrl(basic.owner_photo)} editable={editable} regBase={REG}
            onCaptured={(url) => setBasic((b) => ({ ...b, owner_photo: url }))} />
          <Field label="Owner Full Name" required>
            <Input data-testid="reg-name" value={basic.full_name} disabled={!editable} onChange={(e) => setBasic({ ...basic, full_name: e.target.value })} placeholder="Enter full name" className="h-12 rounded-xl" />
          </Field>
          <Field label="Mobile Number" hint="Locked to your login number">
            <Input value={basic.mobile} disabled className="h-12 rounded-xl bg-slate-100" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date of Birth" required>
              <PremiumDatePicker data-testid="reg-dob" value={basic.dob || ""} disabled={!editable} onChange={(e) => setBasic({ ...basic, dob: e.target.value })} className="!h-12 rounded-xl" placeholder="Date of Birth" />
            </Field>
            <Field label="Gender" required>
              <PremiumSelect data-testid="reg-gender" value={basic.gender || ""} disabled={!editable} onChange={(e) => setBasic({ ...basic, gender: e.target.value })} placeholder="Select gender"
                searchable={false} className="!h-12 w-full rounded-xl">
                <option value="">Select gender</option>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </PremiumSelect>
            </Field>
          </div>
          <Field label="Email" required>
            <Input type="email" value={basic.email || ""} disabled={!editable} onChange={(e) => setBasic({ ...basic, email: e.target.value })} placeholder="you@email.com" className="h-12 rounded-xl" />
          </Field>
        </div>
      )}

      {/* STEP 1: SHOP */}
      {step === 1 && (
        <div className="space-y-4" data-testid="step-shop">
          <Field label="Shop Name" required>
            <Input data-testid="reg-shop-name" value={shop.shop_name} disabled={!editable} onChange={(e) => setShop({ ...shop, shop_name: e.target.value })} placeholder="e.g. Sharma Electricals" className="h-12 rounded-xl" />
          </Field>
          <Field label="Shop Type" required>
            <Combo testid="reg-shop-type" disabled={!editable} value={shop.shop_type_id} display={shop.shop_type_name}
              options={meta.shop_types} placeholder="Select shop type"
              onSelect={(o) => setShop({ ...shop, shop_type_id: o.id, shop_type_name: o.name })} />
          </Field>
          <Field label="Category Served" required hint="Select one category">
            <div className="flex flex-wrap gap-2" data-testid="reg-categories">
              {meta.categories?.map((c) => {
                const on = (shop.categories || []).some((x) => (x.category_id || x) === c.id);
                return (
                  <button key={c.id} type="button" disabled={!editable}
                    onClick={() => setShop({ ...shop, categories: on ? [] : [{ category_id: c.id, category_name: c.name }] })}
                    className={`text-sm rounded-full px-3.5 py-1.5 border font-medium transition ${on ? "bg-primary-700 text-white border-primary-700" : "bg-white text-slate-600 border-slate-200 hover:border-primary-300"}`}>{c.name}</button>
                );
              })}
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="GST Number (optional)">
              <Input data-testid="reg-gst" value={shop.gst_number || ""} disabled={!editable} onChange={(e) => setShop({ ...shop, gst_number: e.target.value.toUpperCase() })} placeholder="22ABCDE1234F1Z5" className="h-12 rounded-xl uppercase" />
            </Field>
            <Uploader label="GST Certificate (optional)" docType="gst" base={REG} value={mediaUrl(shop.gst_url)} onUploaded={(d) => setShop({ ...shop, gst_url: d.url })} />
          </div>
          <GpsPhotoCapture value={mediaUrl(shop.shop_verification_photo)} lat={shop.shop_photo_lat} lng={shop.shop_photo_lng}
            distance={shop.shop_photo_distance_m} verified={shop.shop_photo_verified} gpsOk={shop.shop_photo_gps_ok}
            uploadBase={REG} editable={editable} onCaptured={savePhoto} />
        </div>
      )}

      {/* STEP 2: ADDRESS */}
      {step === 2 && (
        <div className="space-y-4" data-testid="step-address">
          <UseCurrentLocation addr={addr} setAddr={setAddr} editable={editable} />
          <Field label="Full Shop Address" required>
            <Textarea data-testid="reg-addr" value={addr.manual_address} disabled={!editable} onChange={(e) => setAddr({ ...addr, manual_address: e.target.value })} placeholder="Shop no, street, area…" rows={2} className="rounded-xl" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="City" required><Input value={addr.city} disabled={!editable} onChange={(e) => setAddr({ ...addr, city: e.target.value })} className="h-12 rounded-xl" data-testid="reg-city" /></Field>
            <Field label="District" required><Input value={addr.district} disabled={!editable} onChange={(e) => setAddr({ ...addr, district: e.target.value })} className="h-12 rounded-xl" /></Field>
            <Field label="State" required><Input value={addr.state} disabled={!editable} onChange={(e) => setAddr({ ...addr, state: e.target.value })} className="h-12 rounded-xl" /></Field>
            <Field label="Pincode" required><Input value={addr.pincode} disabled={!editable} onChange={(e) => setAddr({ ...addr, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })} className="h-12 rounded-xl" data-testid="reg-pincode" /></Field>
          </div>
          {String(addr.pincode || "").length === 6 && (
            <div data-testid="reg-pincode-badge" className="mt-1">
              {pinChecking ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold px-3 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking availability…
                </span>
              ) : pinCov && pinCov.serviceable === true ? (
                <span data-testid="reg-pincode-serviceable" className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-3 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> We serve your area
                </span>
              ) : pinCov && pinCov.serviceable === false ? (
                <span data-testid="reg-pincode-blocked" className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold px-3 py-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> Not serviceable
                </span>
              ) : null}
            </div>
          )}
          {pinCov && pinCov.serviceable === false && (
            <div data-testid="reg-out-of-area" className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">We&apos;re not in this area yet</p>
              <p className="mt-1">Pincode <b>{addr.pincode}</b> is outside our current service areas, so your application can&apos;t be submitted for it.
              </p>
            </div>
          )}
        </div>
      )}

      {/* STEP 3: REVIEW */}
      {step === 3 && (
        <div className="space-y-4" data-testid="step-review">
          <ReviewCard title="Owner Details" editable={editable} onEdit={() => setStep(0)} rows={[
            ["Name", basic.full_name], ["Mobile", basic.mobile], ["DOB", basic.dob],
            ["Gender", basic.gender], ["Live Photo", basic.owner_photo ? "Captured ✓" : "Missing"],
          ]} />
          <ReviewCard title="Shop Details" editable={editable} onEdit={() => setStep(1)} rows={[
            ["Shop Name", shop.shop_name], ["Type", shop.shop_type_name],
            ["Categories", (shop.categories || []).map((c) => c.category_name).join(", ")],
            ["GST", shop.gst_number || "—"],
            ["Shop Photo", shop.shop_verification_photo ? (shop.shop_photo_verified ? "Verified ✓ (GPS matched)" : "Captured (GPS)") : "Missing"],
          ]} />
          <ReviewCard title="Shop Address" editable={editable} onEdit={() => setStep(2)} rows={[
            ["Address", addr.manual_address], ["City", addr.city], ["District", addr.district],
            ["State", addr.state], ["Pincode", addr.pincode],
            ["GPS", addr.lat != null ? `${Number(addr.lat).toFixed(4)}, ${Number(addr.lng).toFixed(4)}` : "Not set"],
          ]} />
          {score.missing?.length > 0 && (
            <div className="rounded-xl bg-red-50 dark:bg-rose-950/30 border border-red-100 dark:border-rose-900/50 p-3 text-sm text-red-600 dark:text-rose-300">
              <p className="font-semibold mb-1">Still required:</p>
              <div className="flex flex-wrap gap-1.5">{score.missing.map((m) => <span key={m} className="text-[11px] bg-white dark:bg-slate-900 border border-red-100 dark:border-rose-900/50 rounded-full px-2 py-0.5">{m}</span>)}</div>
            </div>
          )}
          <div className="rounded-xl bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800/50 p-3.5 text-sm text-primary-700 dark:text-primary-300 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            After submission your profile will be sent to admin for verification. You&apos;ll get an update within 24–48 hours. Bank &amp; KYC details are collected later, only at your first withdrawal.
          </div>
        </div>
      )}

      {/* nav bar */}
      {editable && (
        <div className="sticky bottom-0 mt-8 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-xl">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button data-testid="reg-next" onClick={next} disabled={saving || (step === 2 && !adminEdit && pinCov && pinCov.serviceable === false)} className="rounded-xl bg-primary-700 hover:bg-primary-800 min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save &amp; Continue <ChevronRight className="h-4 w-4 ml-1" /></>}
            </Button>
          ) : adminEdit ? (
            <Button data-testid="reg-admin-save" onClick={() => onComplete?.()} disabled={saving} className="rounded-xl bg-primary-700 hover:bg-primary-800 min-w-[130px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save &amp; Close <Check className="h-4 w-4 ml-1" /></>}
            </Button>
          ) : (
            <Button data-testid="reg-submit" onClick={submit} disabled={saving || (score.score || 0) < 100} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 min-w-[130px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>{status === "rejected" ? "Re-submit" : "Submit Application"} <Check className="h-4 w-4 ml-1" /></>}
            </Button>
          )}
        </div>
      )}
      {/* view-only nav bar for approved/locked profile — lets merchant page through & VIEW all details */}
      {!editable && (
        <div className="sticky bottom-0 mt-8 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3" data-testid="reg-view-nav">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-xl" data-testid="reg-view-back">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <span className="text-xs font-medium text-slate-400">Step {step + 1} of {STEPS.length} · View only</span>
          <Button variant="outline" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1} className="rounded-xl" data-testid="reg-view-next">
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}
    </>
  );

  return embedded
    ? <div data-testid="reg-embedded" className={editable ? "" : "reg-readonly"}>{content}</div>
    : <Shell onLogout={logout} score={score.score}><div className={editable ? "" : "reg-readonly"}>{content}</div></Shell>;
}

/* ---------------- Use Current Location ---------------- */
function UseCurrentLocation({ addr, setAddr, editable }) {
  const [locating, setLocating] = useState(false);
  const useCurrent = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const { data } = await api.get(`/geo/reverse?lat=${lat}&lng=${lng}`);
        setAddr((a) => ({ ...a, lat, lng, manual_address: a.manual_address || data.line || data.display || "", location_address: data.display || "", city: data.city || a.city, state: data.state || a.state, district: a.district || data.city || "", pincode: data.pincode || a.pincode }));
        toast.success("Location detected & address filled");
      } catch (e) {
        setAddr((a) => ({ ...a, lat, lng }));
        toast.message("Location captured (autofill unavailable)");
      } finally { setLocating(false); }
    }, () => { setLocating(false); toast.error("Location permission denied. Please allow location and retry."); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  const hasGps = addr.lat != null && addr.lng != null;
  return (
    <div className="space-y-3">
      <button type="button" disabled={!editable || locating} onClick={useCurrent} data-testid="use-current-location"
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary-700 text-white font-semibold hover:bg-primary-800 disabled:opacity-60">
        {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
        {locating ? "Detecting location…" : "📍 Use Current Location"}
      </button>
      {hasGps && (
        <div className="rounded-xl overflow-hidden border border-slate-200" data-testid="address-map">
          <iframe title="map" width="100%" height="180" style={{ border: 0 }} loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${addr.lng - 0.004}%2C${addr.lat - 0.003}%2C${addr.lng + 0.004}%2C${addr.lat + 0.003}&layer=mapnik&marker=${addr.lat}%2C${addr.lng}`} />
          <div className="bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" /> {Number(addr.lat).toFixed(5)}, {Number(addr.lng).toFixed(5)}</div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Shell (premium mobile-app frame) ---------------- */
function Shell({ children, onLogout, score }) {
  const { stats: siteStats = {} } = useSiteConfig();
  const perks = [
    { icon: Zap, title: "Earn on every booking", desc: "Refer customers with your QR and earn lifetime commission." },
    { icon: Wallet, title: "Fast, secure payouts", desc: "Withdraw earnings straight to your bank, anytime." },
    { icon: ShieldCheck, title: "Verified merchant badge", desc: "Build trust with a verified shop profile." },
  ];
  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[minmax(0,44%)_1fr]">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden text-white p-10 xl:p-14"
        style={{ background: "linear-gradient(160deg, #0D47A1 0%, #0B3D8C 45%, #072a63 100%)" }}>
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-20 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur grid place-items-center font-black text-lg ring-1 ring-white/20">A</div>
            <div>
              <p className="font-heading font-extrabold text-lg leading-none">AzoApp Merchant</p>
              <p className="text-sky-200/80 text-xs mt-1">Grow your shop &amp; referral network</p>
            </div>
          </div>
          <h1 className="font-heading font-extrabold text-3xl xl:text-[2.6rem] leading-[1.1] mt-14">
            Turn your shop into<br />an earning<br />powerhouse.
          </h1>
          <p className="text-sky-100/80 mt-4 max-w-md leading-relaxed">
            Register your shop, share your QR and earn commission every time a customer books a service through you.
          </p>
          <div className="mt-10 space-y-4 max-w-md">
            {perks.map((p) => (
              <div key={p.title} className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center shrink-0"><p.icon className="h-5 w-5 text-sky-200" /></div>
                <div><p className="font-semibold leading-tight">{p.title}</p><p className="text-sky-100/70 text-sm leading-snug">{p.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative mt-10">
          <div className="flex items-center gap-1 text-amber-300">
            {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-amber-300" />)}
            <span className="text-sky-100/80 text-sm ml-2">Trusted by {compactPlus(siteStats.merchants) || "verified"} shops across India</span>
          </div>
          <p className="text-sky-200/50 text-xs mt-4 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Bank-grade encryption · Your data stays private</p>
        </div>
      </aside>

      <main className="relative">
        <div className="lg:hidden text-white px-4 pt-4 pb-20" style={{ background: "linear-gradient(160deg, #0D47A1 0%, #0B3D8C 60%, #072a63 100%)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-white/15 grid place-items-center font-black">A</div>
              <div><p className="font-heading font-extrabold leading-none">AzoApp Merchant</p><p className="text-sky-200/80 text-[11px] mt-0.5">Grow your shop &amp; network</p></div>
            </div>
            <button onClick={onLogout} className="text-sky-100 hover:text-white flex items-center gap-1 text-sm"><LogOut className="h-4 w-4" /> Logout</button>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 lg:py-10 -mt-16 lg:mt-0">
          <div className="hidden lg:flex justify-end mb-3">
            <button onClick={onLogout} className="text-slate-400 hover:text-slate-700 flex items-center gap-1 text-sm"><LogOut className="h-4 w-4" /> Logout</button>
          </div>
          {typeof score === "number" && (
            <div className="rounded-3xl p-4 mb-4 flex items-center gap-4 shadow-lg lg:shadow-sm border border-primary-100" style={{ background: "linear-gradient(120deg, #0D47A1, #1565C0)" }}>
              <ScoreRing score={score} />
              <div className="text-white">
                <p className="font-heading font-bold text-lg">Complete your shop profile</p>
                <p className="text-sky-100/85 text-sm">A complete profile builds trust and speeds up approval.</p>
              </div>
            </div>
          )}
          <div className="bg-white rounded-3xl shadow-2xl lg:shadow-xl ring-1 ring-slate-100 p-5 sm:p-8" data-testid="merchant-registration">{children}</div>
          <p className="text-center text-slate-400 text-xs mt-4">&copy; AzoApp · Your data is secure &amp; encrypted</p>
        </div>
      </main>
    </div>
  );
}

const ReviewCard = ({ title, rows, onEdit, editable = true }) => (
  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
      <p className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{title}</p>
      <button onClick={onEdit} className="text-xs text-primary-600 dark:text-primary-400 font-medium hover:underline">{editable ? "Edit" : "View"}</button>
    </div>
    <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
          <span className="text-slate-400 dark:text-slate-500">{k}</span>
          <span className="text-slate-800 dark:text-slate-100 font-medium text-right break-words max-w-[60%]">{v || "—"}</span>
        </div>
      ))}
    </div>
  </div>
);
