import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  User, Briefcase, FileCheck2, MapPin, ClipboardCheck, Check, ChevronRight,
  ChevronLeft, Search, Upload, Loader2, ShieldCheck, Clock, AlertTriangle,
  CheckCircle2, Crosshair, X, LogOut, Camera, GraduationCap, Wallet, Zap, Star,
} from "lucide-react";
import api, { compactPlus } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSiteConfig } from "@/context/SiteConfigContext";
import LivePhotoCapture from "@/components/partner/LivePhotoCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const STEPS = [
  { key: "basic", label: "Basic", icon: User },
  { key: "work", label: "Work", icon: Briefcase },
  { key: "documents", label: "Documents", icon: FileCheck2 },
  { key: "address", label: "Address", icon: MapPin },
  { key: "review", label: "Review", icon: ClipboardCheck },
];

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

/* ---------------- Searchable combo (client-side filter) ---------------- */
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
          ${disabled ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            : "bg-white border-slate-200 hover:border-primary-400 text-slate-800"}`}>
        <span className={display ? "" : "text-slate-400"}>{display || placeholder}</span>
        <Search className="h-4 w-4 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" className="h-9" />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-400">No results</p>}
            {filtered.map((o) => (
              <button type="button" key={o.id || o[labelKey]}
                onClick={() => { onSelect(o); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3.5 py-2.5 text-sm hover:bg-primary-50
                  ${value === (o.id || o[labelKey]) ? "bg-primary-50 text-primary-700 font-medium" : "text-slate-700"}`}>
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
    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
      {label}{required && <span className="text-red-500"> *</span>}
    </label>
    {children}
    {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
  </div>
);

/* ---------------- Document uploader ---------------- */
function Uploader({ label, value, onUploaded, docType, aadhaar, ocr, required, regBase = "/partner/registration" }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType);
      if (aadhaar) fd.append("aadhaar_number", aadhaar);
      const { data } = await api.post(`${regBase}/upload`, fd,
        { headers: { "Content-Type": "multipart/form-data" } });
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
          ${value ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-primary-400"}`}
        data-testid={`upload-${docType}`}>
        {busy ? <Loader2 className="h-6 w-6 text-primary-600 animate-spin" />
          : value ? <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            : <Camera className="h-6 w-6 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700">
            {busy ? "Uploading…" : value ? "Uploaded — tap to replace" : "Tap to upload (JPG/PNG/PDF)"}
          </p>
          {value && !busy && <p className="text-xs text-emerald-600 truncate">{value.split("/").pop()}</p>}
        </div>
        {value && <img src={value} alt="" className="h-12 w-12 rounded-lg object-cover border border-emerald-200"
          onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </div>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={(e) => upload(e.target.files?.[0])} />
      {ocr && (
        ocr.matched ? (
          <p className="mt-1.5 text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Aadhaar number verified via OCR</p>
        ) : ocr.ocr_ran ? (
          <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Please enter a valid Aadhaar number or upload the correct ID.</p>
        ) : null
      )}
    </Field>
  );
}

/* =============================================================== */
export default function PartnerRegistration({ regBase = "/partner/registration", embedded = false, onComplete, adminEdit = false, lockedPhone = "" } = {}) {
  const RB = regBase;
  const { user, logout, refresh } = useAuth();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("incomplete");
  const [rejection, setRejection] = useState("");
  const [score, setScore] = useState({ score: 0, sections: {} });
  const [step, setStep] = useState(0);
  const [meta, setMeta] = useState({ educations: [], experiences: [], categories: [] });

  // form state
  const [basic, setBasic] = useState({ full_name: "", dob: "", email: "", education_id: "", education_name: "", live_photo_url: "", state: "", district: "", city: "", village: "", pincode: "" });
  const [work, setWork] = useState({ categories: [] });
  const [docs, setDocs] = useState({ aadhaar_number: "", aadhaar_front_url: "", aadhaar_back_url: "", education_certificate_url: "", aadhaar_ocr: {} });
  const [addr, setAddr] = useState({ manual_address: "", lat: null, lng: null, location_address: "" });

  // geo option lists
  const [states, setStates] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cities, setCities] = useState([]);
  const [villages, setVillages] = useState([]);
  const [locBusy, setLocBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  // Service-area check for the entered pincode (registration is blocked out-of-area)
  const [pinCov, setPinCov] = useState(null); // {serviceable, serviced_cities}
  const [pinChecking, setPinChecking] = useState(false);
  useEffect(() => {
    const pin = String(basic.pincode || "").trim();
    if (pin.length !== 6) { setPinCov(null); setPinChecking(false); return; }
    let alive = true;
    setPinChecking(true);
    api.get(`/geo/serviceability?pincode=${pin}`)
      .then((r) => { if (alive) setPinCov(r.data); })
      .catch(() => { if (alive) setPinCov(null); })
      .finally(() => { if (alive) setPinChecking(false); });
    return () => { alive = false; };
  }, [basic.pincode]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: m }] = await Promise.all([
        api.get(`${RB}/profile`),
        api.get(`${RB}/meta`),
      ]);
      setMeta(m);
      setStatus(p.kyc_status);
      setRejection(p.rejection_reason || "");
      setScore(p.score);
      const pr = p.profile;
      setBasic({ ...pr.basic });
      setWork({ categories: pr.work.categories || [] });
      setDocs({ ...pr.documents, aadhaar_ocr: pr.documents.aadhaar_ocr || {} });
      setAddr({ ...pr.address });
    } catch (e) { toast.error("Failed to load profile"); }
    setLoading(false);
  }, [RB]);
  useEffect(() => { loadProfile(); }, [loadProfile]);

  // load states once (public geo cascade — works for partner/admin/merchant)
  useEffect(() => { api.get("/geo/states").then((r) => setStates(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (basic.state) api.get(`/geo/districts?state=${encodeURIComponent(basic.state)}`).then((r) => setDistricts(r.data)).catch(() => {});
    else setDistricts([]);
  }, [basic.state]);
  useEffect(() => {
    if (basic.state && basic.district) api.get(`/geo/cities?state=${encodeURIComponent(basic.state)}&district=${encodeURIComponent(basic.district)}`).then((r) => setCities(r.data)).catch(() => {});
    else setCities([]);
  }, [basic.state, basic.district]);
  useEffect(() => {
    if (basic.state && basic.district && basic.city) api.get(`/geo/villages?state=${encodeURIComponent(basic.state)}&district=${encodeURIComponent(basic.district)}&city=${encodeURIComponent(basic.city)}`).then((r) => setVillages((r.data || []).map((v) => ({ id: v, name: v })))).catch(() => {});
    else setVillages([]);
  }, [basic.state, basic.district, basic.city]);

  const editable = adminEdit ? true : (status === "incomplete" || status === "rejected");
  const phoneDisplay = lockedPhone || user?.phone || "";

  /* ---------- section save ---------- */
  const saveSection = async (section, payload) => {
    setSaving(true);
    try {
      const { data } = await api.put(`${RB}/${section}`, payload);
      setScore(data.score);
      return true;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
      return false;
    } finally { setSaving(false); }
  };

  const validateStep = () => {
    if (step === 0) {
      // Education is locked for admin edit — don't require a value the admin can't set.
      const req = adminEdit
        ? ["full_name", "dob", "gender", "state", "district", "city", "pincode"]
        : ["full_name", "dob", "gender", "education_id", "state", "district", "city", "pincode"];
      for (const f of req)
        if (!String(basic[f] || "").trim()) return "Please fill all required fields";
      if (!String(basic.email || "").trim()) return "Email is required";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(basic.email).trim())) return "Enter a valid email address";
      if (!adminEdit && !String(basic.live_photo_url || "").trim()) return "Please capture your live photo";
      if (!adminEdit && pinCov && pinCov.serviceable === false) return "We don't serve this pincode yet — registration can't be submitted for this area.";
    }
    if (step === 1) {
      if (!work.categories.length) return "Please select your service category";
      if (work.categories.some((c) => !c.experience_id)) return "Select your experience for the service";
    }
    if (step === 2 && !adminEdit) {
      if (!/^\d{12}$/.test(docs.aadhaar_number)) return "Enter a valid 12-digit Aadhaar number";
      if (!docs.aadhaar_front_url || !docs.aadhaar_back_url) return "Upload Aadhaar front & back";
      if (basic.education_id && !docs.education_certificate_url) return "Upload your education certificate";
      if (docs.aadhaar_ocr?.ocr_ran && !docs.aadhaar_ocr?.matched) return "Please enter a valid Aadhaar number or upload the correct ID.";
    }
    if (step === 3) {
      if (!addr.manual_address.trim()) return "Enter your address";
    }
    return null;
  };

  const next = async () => {
    const err = validateStep();
    if (err) return toast.error(err);
    const map = ["basic", "work", "documents", "address"];
    // Admin edit never touches the locked Documents/KYC section.
    if (adminEdit && map[step] === "documents") { setStep((s) => Math.min(4, s + 1)); return; }
    if (step < 4) {
      const ok = await saveSection(map[step],
        step === 0 ? basic : step === 1 ? work : step === 2 ? docs : addr);
      if (!ok) return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const saveAdmin = async () => {
    // Persist every editable section, then hand control back to the admin panel.
    setSaving(true);
    try {
      await api.put(`${RB}/basic`, basic);
      await api.put(`${RB}/work`, work);
      await api.put(`${RB}/address`, addr);
      toast.success("Partner profile updated");
      onComplete?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`${RB}/submit`);
      toast.success("Application submitted!");
      if (embedded) { onComplete?.(); return; }
      await loadProfile();
      refresh?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Submit failed");
    } finally { setSaving(false); }
  };

  /* ---------- category select (single) ---------- */
  const toggleCat = (cat) => {
    setWork((w) => {
      const exists = w.categories.find((c) => c.category_id === cat.id);
      if (exists) return { categories: [] };           // tap the selected one again → clear
      // single-select: choosing a category replaces any previous selection
      return { categories: [{ category_id: cat.id, category_name: cat.name, experience_id: "", experience_label: "" }] };
    });
  };
  const setCatExp = (catId, exp) => {
    setWork((w) => ({ categories: w.categories.map((c) => c.category_id === catId ? { ...c, experience_id: exp.id, experience_label: exp.label } : c) }));
  };

  /* ---------- current location ---------- */
  const chooseLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const { data } = await api.get(`/geo/reverse?lat=${lat}&lng=${lng}`);
        setAddr((a) => ({
          ...a, lat, lng,
          location_address: data.display || "",
          manual_address: data.display || a.manual_address || "",
        }));
        if (data.pincode) setBasic((b) => ({ ...b, pincode: data.pincode }));
        toast.success("Location captured — address updated");
      } catch { toast.error("Could not fetch address"); }
      setLocBusy(false);
    }, () => { toast.error("Location permission denied"); setLocBusy(false); }, { enableHighAccuracy: true });
  };

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-slate-50">
      <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
    </div>
  );

  /* ---------- UNDER REVIEW ---------- */
  if (status === "under_review" && !adminEdit) {
    return (
      <Shell onLogout={logout}>
        <div className="text-center py-8" data-testid="reg-under-review">
          <div className="mx-auto h-20 w-20 rounded-full bg-amber-100 grid place-items-center mb-5">
            <Clock className="h-10 w-10 text-amber-500" />
          </div>
          <h2 className="font-heading font-extrabold text-2xl text-slate-900">Account Under Review</h2>
          <p className="text-slate-500 mt-2 max-w-md mx-auto">Your account is under review. You will receive an update within 24–48 hours. Please wait until your account is approved.</p>
          <Badge className="mt-5 bg-amber-100 text-amber-700 border-0 text-sm px-4 py-1.5">Under Review</Badge>
          <div className="mt-8"><Button variant="outline" onClick={refresh}>Refresh status</Button></div>
        </div>
      </Shell>
    );
  }

  /* ---------- WIZARD ---------- */
  const StepIcon = STEPS[step].icon;
  // NOTE: previously `Wrap` was defined inline here as a new component on every
  // render (either `Shell` or a plain div). React treated the freshly-created
  // function as a NEW component type on every keystroke, unmounting the whole
  // form and blowing away focus/scroll. Render the wrapper inline instead.
  const content = (
    <>
      {status === "rejected" && (
        <div className="mb-5 rounded-2xl bg-red-50 border border-red-200 p-4 flex items-start gap-3" data-testid="reg-rejected">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700">Application needs changes</p>
            <p className="text-sm text-red-600 mt-0.5">{rejection}</p>
            <p className="text-xs text-red-500 mt-1">Please correct the details below and submit again.</p>
          </div>
        </div>
      )}

      {/* step indicator */}
      <div className="flex items-center justify-between mb-6 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const done = i < step; const cur = i === step;
          const Ic = s.icon;
          return (
            <div key={s.key} className="flex items-center shrink-0">
              <button onClick={() => i <= step && setStep(i)} className="flex flex-col items-center gap-1">
                <div className={`h-9 w-9 rounded-full grid place-items-center text-sm font-bold transition
                  ${done ? "bg-emerald-500 text-white" : cur ? "bg-primary-700 text-white ring-4 ring-primary-100" : "bg-slate-100 text-slate-400"}`}>
                  {done ? <Check className="h-4 w-4" /> : <Ic className="h-4 w-4" />}
                </div>
                <span className={`text-[11px] font-medium ${cur ? "text-primary-700" : "text-slate-400"}`}>{s.label}</span>
              </button>
              {i < STEPS.length - 1 && <div className={`w-6 sm:w-10 h-0.5 mx-1 ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <StepIcon className="h-5 w-5 text-primary-700" />
        <h2 className="font-heading font-bold text-lg text-slate-900">
          {["Basic Information", "Work Details", "Documents & KYC", "Address", "Review & Submit"][step]}
        </h2>
      </div>

      {/* ---------- STEP 0: BASIC ---------- */}
      {step === 0 && (
        <div className="space-y-4" data-testid="step-basic">
          <LivePhotoCapture
            value={basic.live_photo_url}
            editable={editable}
            regBase={RB}
            onCaptured={(url) => setBasic((b) => ({ ...b, live_photo_url: url }))}
          />
          <Field label="Full Name (as per Aadhaar)" required>
            <Input data-testid="reg-name" value={basic.full_name} onChange={(e) => setBasic({ ...basic, full_name: e.target.value })} placeholder="Enter full name" className="h-12 rounded-xl" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Date of Birth" required>
              <PremiumDatePicker data-testid="reg-dob" value={basic.dob || ""} onChange={(e) => setBasic({ ...basic, dob: e.target.value })} placeholder="Select date of birth" min="1940-01-01" max={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })()} className="!h-12 rounded-xl" />
            </Field>
            <Field label="Gender" required>
              <PremiumSelect data-testid="reg-gender" value={basic.gender || ""} onChange={(e) => setBasic({ ...basic, gender: e.target.value })}
                className="h-12 w-full rounded-xl border border-slate-200 px-3 text-sm bg-white">
                <option value="">Select gender</option>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </PremiumSelect>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Mobile Number" hint="Used for login — cannot be changed">
              <Input data-testid="reg-mobile" value={phoneDisplay || basic.mobile} disabled className="h-12 rounded-xl bg-slate-100" />
            </Field>
            {!embedded && (
            <Field label="Merchant Code (optional)" hint="If a shopkeeper referred you, enter their code">
              <Input data-testid="reg-merchant-code" value={basic.merchant_code || ""} maxLength={7}
                onChange={(e) => setBasic({ ...basic, merchant_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7) })}
                placeholder="7-char code" className="h-12 rounded-xl uppercase" />
            </Field>
            )}
          </div>
          <Field label="Email ID" required>
            <Input data-testid="reg-email" type="email" value={basic.email} onChange={(e) => setBasic({ ...basic, email: e.target.value })} placeholder="you@example.com" className="h-12 rounded-xl" />
          </Field>
          <Field label="Education" required hint={adminEdit ? "Locked — cannot be changed by admin" : undefined}>
            <Combo testid="reg-education" placeholder="Search & select education" options={meta.educations}
              value={basic.education_id} display={basic.education_name} disabled={adminEdit}
              onSelect={(o) => setBasic({ ...basic, education_id: o.id, education_name: o.name })} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="State" required>
              <Combo testid="reg-state" placeholder="Search state" options={states} value={basic.state} display={basic.state}
                onSelect={(o) => setBasic({ ...basic, state: o.name, district: "", city: "", village: "" })} />
            </Field>
            <Field label="District" required>
              <Combo testid="reg-district" placeholder="Search district" options={districts} value={basic.district} display={basic.district} disabled={!basic.state}
                onSelect={(o) => setBasic({ ...basic, district: o.name, city: "", village: "" })} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="City / Sub-district" required>
              <Combo testid="reg-city" placeholder="Search city" options={cities} value={basic.city} display={basic.city} disabled={!basic.district}
                onSelect={(o) => setBasic({ ...basic, city: o.name, village: "" })} />
            </Field>
            <Field label="Village (optional)">
              <Combo testid="reg-village" placeholder="Search village" options={villages} value={basic.village} display={basic.village} disabled={!basic.city}
                onSelect={(o) => setBasic({ ...basic, village: o.name })} />
            </Field>
          </div>
          <Field label="Pincode" required hint="Auto-fills when you use Choose Current Location; you may also type it">
            <Input data-testid="reg-pincode" value={basic.pincode} maxLength={6}
              onChange={(e) => setBasic({ ...basic, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              placeholder="6-digit pincode" className="h-12 rounded-xl" />
          </Field>
          {String(basic.pincode || "").length === 6 && (
            <div data-testid="reg-pincode-badge" className="-mt-1">
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
              <p className="mt-1">Pincode <b>{basic.pincode}</b> is outside our current service areas, so registration can&apos;t be submitted for it.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ---------- STEP 1: WORK ---------- */}
      {step === 1 && (
        <div className="space-y-5" data-testid="step-work">
          <Field label="Service Category" hint="Choose your main service — only one can be selected" required>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {meta.categories.map((c) => {
                const sel = work.categories.find((x) => x.category_id === c.id);
                return (
                  <button key={c.id} type="button" data-testid={`reg-cat-${c.id}`} onClick={() => toggleCat(c)}
                    className={`rounded-xl border-2 px-3 py-3 text-sm font-medium text-left transition flex items-center gap-2
                      ${sel ? "border-primary-600 bg-primary-50 text-primary-700" : "border-slate-200 bg-white text-slate-600 hover:border-primary-300"}`}>
                    <span className={`h-4 w-4 rounded-full grid place-items-center shrink-0 ${sel ? "bg-primary-600" : "border-2 border-slate-300"}`}>
                      {sel && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {c.name}
                  </button>
                );
              })}
            </div>
          </Field>
          {work.categories.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Experience in this service <span className="text-red-500">*</span></p>
              <div className="space-y-2.5">
                {work.categories.map((c) => (
                  <div key={c.category_id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
                    <span className="text-sm font-medium text-slate-700 flex-1 min-w-0 truncate">{c.category_name}</span>
                    <div className="w-44">
                      <Combo testid={`reg-exp-${c.category_id}`} placeholder="Experience" options={meta.experiences} labelKey="label"
                        value={c.experience_id} display={c.experience_label}
                        onSelect={(o) => setCatExp(c.category_id, o)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- STEP 2: DOCUMENTS ---------- */}
      {step === 2 && adminEdit && (
        <div className="space-y-4" data-testid="step-documents">
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm text-slate-600 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-slate-400" />
            Aadhaar &amp; KYC documents are locked and cannot be edited by admin. They are shown here for reference only.
          </div>
          <Field label="Aadhaar Card Number">
            <Input value={docs.aadhaar_number ? docs.aadhaar_number.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3") : "—"} disabled className="h-12 rounded-xl bg-slate-100 tracking-widest" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            {[["Aadhaar Front", docs.aadhaar_front_url], ["Aadhaar Back", docs.aadhaar_back_url], ["Education Certificate", docs.education_certificate_url]].filter(([, u]) => u).map(([lbl, url]) => (
              <a key={lbl} href={url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 overflow-hidden hover:ring-2 hover:ring-primary-200">
                <div className="h-28 bg-slate-50 grid place-items-center overflow-hidden">
                  {/\.pdf($|\?)/i.test(url) ? <FileCheck2 className="h-9 w-9 text-rose-500" /> : <img src={url} alt={lbl} className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                </div>
                <p className="px-2 py-1.5 text-[11px] font-semibold border-t border-slate-100">{lbl}</p>
              </a>
            ))}
          </div>
        </div>
      )}
      {step === 2 && !adminEdit && (
        <div className="space-y-4" data-testid="step-documents">
          <Field label="Aadhaar Card Number" required hint="Please enter valid details.">
            <Input data-testid="reg-aadhaar" value={docs.aadhaar_number} maxLength={12}
              onChange={(e) => setDocs({ ...docs, aadhaar_number: e.target.value.replace(/\D/g, "").slice(0, 12), aadhaar_ocr: {} })}
              placeholder="12-digit Aadhaar number" className="h-12 rounded-xl tracking-widest" />
          </Field>
          <Uploader label="Aadhaar Front Image" docType="aadhaar_front" required regBase={RB}
            value={docs.aadhaar_front_url} aadhaar={docs.aadhaar_number} ocr={docs.aadhaar_ocr}
            onUploaded={(d) => setDocs((p) => ({ ...p, aadhaar_front_url: d.url, aadhaar_ocr: d.ocr || p.aadhaar_ocr }))} />
          <Uploader label="Aadhaar Back Image" docType="aadhaar_back" required regBase={RB}
            value={docs.aadhaar_back_url} aadhaar={docs.aadhaar_number}
            onUploaded={(d) => setDocs((p) => ({ ...p, aadhaar_back_url: d.url, aadhaar_ocr: d.ocr || p.aadhaar_ocr }))} />
          {basic.education_id && (
            <Uploader label={`Education Certificate (${basic.education_name})`} docType="education_certificate" required regBase={RB}
              value={docs.education_certificate_url}
              onUploaded={(d) => setDocs((p) => ({ ...p, education_certificate_url: d.url }))} />
          )}
        </div>
      )}

      {/* ---------- STEP 3: ADDRESS ---------- */}
      {step === 3 && (
        <div className="space-y-4" data-testid="step-address">
          <Field label="Full Address" required>
            <textarea data-testid="reg-address" value={addr.manual_address} rows={3}
              onChange={(e) => setAddr({ ...addr, manual_address: e.target.value })}
              placeholder="House / Street / Area / Landmark"
              className="w-full rounded-xl border border-slate-200 p-3.5 text-sm focus:border-primary-400 focus:outline-none" />
          </Field>
          <Button type="button" variant="outline" onClick={chooseLocation} disabled={locBusy}
            data-testid="reg-choose-location" className="w-full h-12 rounded-xl border-primary-200 text-primary-700 hover:bg-primary-50">
            {locBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Crosshair className="h-4 w-4 mr-2" />}
            Choose Current Location
          </Button>
          {addr.lat && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm" data-testid="reg-location-captured">
              <p className="text-emerald-700 font-medium flex items-center gap-1"><MapPin className="h-4 w-4" /> Location captured</p>
              <p className="text-emerald-600 text-xs mt-1">{addr.location_address}</p>
              <p className="text-emerald-500 text-[11px] mt-0.5">Lat {Number(addr.lat).toFixed(5)}, Lng {Number(addr.lng).toFixed(5)}</p>
            </div>
          )}
        </div>
      )}

      {/* ---------- STEP 4: REVIEW ---------- */}
      {step === 4 && (
        <div className="space-y-4" data-testid="step-review">
          {basic.live_photo_url && (
            <div className="flex items-center gap-4 rounded-xl bg-white border border-slate-200 p-4">
              <img src={basic.live_photo_url} alt="Live" className="h-16 w-16 rounded-2xl object-cover ring-2 ring-emerald-200" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Photo</p>
                <p className="text-sm font-semibold text-emerald-700 mt-0.5">Captured ✓</p>
              </div>
            </div>
          )}
          <ReviewCard title="Basic Information" onEdit={() => setStep(0)} rows={[
            ["Full Name", basic.full_name], ["Date of Birth", basic.dob], ["Mobile", phoneDisplay],
            ["Email", basic.email || "—"], ["Education", basic.education_name],
            ["Location", `${basic.city}, ${basic.district}, ${basic.state} - ${basic.pincode}`],
            ["Village", basic.village || "—"],
          ]} />
          <ReviewCard title="Work Details" onEdit={() => setStep(1)} rows={work.categories.map((c) => [c.category_name, c.experience_label])} />
          <ReviewCard title="Documents & KYC" onEdit={() => setStep(2)} rows={[
            ["Aadhaar Number", docs.aadhaar_number.replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3")],
            ["OCR Verified", docs.aadhaar_ocr?.matched ? "Yes ✓" : "Not verified"],
            ["Aadhaar Front", docs.aadhaar_front_url ? "Uploaded ✓" : "—"],
            ["Aadhaar Back", docs.aadhaar_back_url ? "Uploaded ✓" : "—"],
            ...(basic.education_id ? [["Education Certificate", docs.education_certificate_url ? "Uploaded ✓" : "—"]] : []),
          ]} />
          <ReviewCard title="Address" onEdit={() => setStep(3)} rows={[
            ["Address", addr.manual_address],
            ["GPS", addr.lat ? `${Number(addr.lat).toFixed(4)}, ${Number(addr.lng).toFixed(4)}` : "—"],
          ]} />
          <div className="rounded-xl bg-primary-50 border border-primary-100 p-3.5 text-sm text-primary-700 flex items-start gap-2">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            {adminEdit
              ? "Review the changes and click Save changes. Mobile, Aadhaar, education and KYC documents stay locked. All edits are recorded in the partner's Profile Changes."
              : "After submission your profile & KYC will be sent to admin for review. You’ll get an update within 24–48 hours."}
          </div>
        </div>
      )}

      {/* ---------- nav bar ---------- */}
      <div className="sticky bottom-0 mt-8 -mx-5 sm:-mx-8 px-5 sm:px-8 py-4 bg-white/90 backdrop-blur border-t border-slate-100 flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="rounded-xl">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {step < 4 ? (
          <Button data-testid="reg-next" onClick={next} disabled={saving || (step === 0 && !adminEdit && pinCov && pinCov.serviceable === false)} className="rounded-xl bg-primary-700 hover:bg-primary-800 min-w-[130px] disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save &amp; Continue <ChevronRight className="h-4 w-4 ml-1" /></>}
          </Button>
        ) : adminEdit ? (
          <Button data-testid="reg-admin-save" onClick={saveAdmin} disabled={saving} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 min-w-[130px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Save changes <Check className="h-4 w-4 ml-1" /></>}
          </Button>
        ) : (
          <Button data-testid="reg-submit" onClick={submit} disabled={saving} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 min-w-[130px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Submit Application <Check className="h-4 w-4 ml-1" /></>}
          </Button>
        )}
      </div>
    </>
  );
  return embedded
    ? <div data-testid="reg-embedded">{content}</div>
    : <Shell onLogout={logout} score={score.score}>{content}</Shell>;
}

/* ---------------- Shell (premium mobile-app frame) ---------------- */
function Shell({ children, onLogout, score }) {
  const { stats: siteStats = {} } = useSiteConfig();
  const perks = [
    { icon: Zap, title: "Instant job alerts", desc: "Get matched to nearby jobs the moment they come in." },
    { icon: Wallet, title: "Fast, secure payouts", desc: "Transparent earnings settled straight to your bank." },
    { icon: ShieldCheck, title: "3-way OTP verified", desc: "Every job is protected for you and the customer." },
  ];
  return (
    <div className="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[minmax(0,44%)_1fr]">
      {/* ---------- LEFT BRAND RAIL (desktop) ---------- */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden text-white p-10 xl:p-14"
        style={{ background: "linear-gradient(160deg, #0D47A1 0%, #0B3D8C 45%, #072a63 100%)" }}>
        {/* decorative glow */}
        <div className="pointer-events-none absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -left-20 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="h-11 w-11 rounded-2xl bg-white/15 backdrop-blur grid place-items-center font-black text-lg ring-1 ring-white/20">A</div>
            <div>
              <p className="font-heading font-extrabold text-lg leading-none">AzoApp Partner</p>
              <p className="text-sky-200/80 text-xs mt-1">Trusted professionals network</p>
            </div>
          </div>

          <h1 className="font-heading font-extrabold text-3xl xl:text-[2.6rem] leading-[1.1] mt-14">
            Grow your business<br />with India&rsquo;s trusted<br />service brand.
          </h1>
          <p className="text-sky-100/80 mt-4 max-w-md leading-relaxed">
            Join thousands of verified professionals earning more with a steady flow of quality jobs — on your schedule.
          </p>

          <div className="mt-10 space-y-4 max-w-md">
            {perks.map((p) => (
              <div key={p.title} className="flex items-start gap-3.5">
                <div className="h-10 w-10 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center shrink-0">
                  <p.icon className="h-5 w-5 text-sky-200" />
                </div>
                <div>
                  <p className="font-semibold leading-tight">{p.title}</p>
                  <p className="text-sky-100/70 text-sm leading-snug">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-10">
          <div className="flex items-center gap-1 text-amber-300">
            {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-amber-300" />)}
            <span className="text-sky-100/80 text-sm ml-2">Rated {siteStats.rating || "4.5"}/5 by {compactPlus(siteStats.partners) || "verified"} partners</span>
          </div>
          <p className="text-sky-200/50 text-xs mt-4 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Bank-grade encryption · Your data stays private
          </p>
        </div>
      </aside>

      {/* ---------- RIGHT CONTENT ---------- */}
      <main className="relative">
        {/* mobile brand bar */}
        <div className="lg:hidden text-white px-4 pt-4 pb-20"
          style={{ background: "linear-gradient(160deg, #0D47A1 0%, #0B3D8C 60%, #072a63 100%)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-xl bg-white/15 grid place-items-center font-black">A</div>
              <div>
                <p className="font-heading font-extrabold leading-none">AzoApp Partner</p>
                <p className="text-sky-200/80 text-[11px] mt-0.5">Trusted professionals network</p>
              </div>
            </div>
            <button onClick={onLogout} className="text-sky-100 hover:text-white flex items-center gap-1 text-sm">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-3 sm:px-6 py-6 lg:py-10 -mt-16 lg:mt-0">
          {/* desktop logout */}
          <div className="hidden lg:flex justify-end mb-3">
            <button onClick={onLogout} className="text-slate-400 hover:text-slate-700 flex items-center gap-1 text-sm">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>

          {/* score banner */}
          {typeof score === "number" && (
            <div className="rounded-3xl p-4 mb-4 flex items-center gap-4 shadow-lg lg:shadow-sm border border-primary-100"
              style={{ background: "linear-gradient(120deg, #0D47A1, #1565C0)" }}>
              <ScoreRing score={score} />
              <div className="text-white">
                <p className="font-heading font-bold text-lg">Complete your profile</p>
                <p className="text-sky-100/85 text-sm">A complete profile builds trust and speeds up approval.</p>
              </div>
            </div>
          )}

          {/* card */}
          <div className="bg-white rounded-3xl shadow-2xl lg:shadow-xl ring-1 ring-slate-100 p-5 sm:p-8" data-testid="partner-registration">
            {children}
          </div>
          <p className="text-center text-slate-400 text-xs mt-4">&copy; AzoApp · Your data is secure &amp; encrypted</p>
        </div>
      </main>
    </div>
  );
}

const ReviewCard = ({ title, rows, onEdit }) => (
  <div className="rounded-2xl border border-slate-200 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
      <p className="font-semibold text-slate-700 text-sm">{title}</p>
      <button onClick={onEdit} className="text-xs text-primary-600 font-medium hover:underline">Edit</button>
    </div>
    <div className="divide-y divide-slate-50">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
          <span className="text-slate-400">{k}</span>
          <span className="text-slate-800 font-medium text-right">{v || "—"}</span>
        </div>
      ))}
    </div>
  </div>
);
