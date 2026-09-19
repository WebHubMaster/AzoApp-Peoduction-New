import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { User, Building2, Check, ChevronLeft, ChevronRight, ShieldCheck, MapPin, LocateFixed, CreditCard, Wrench } from "lucide-react";

const STEPS = ["Account", "Details", "Address", "KYC & Bank", "Skills & Area", "Review"];

export default function PartnerOnboarding({ onDone }) {
  const { user, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [cats, setCats] = useState([]);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState(() => ({
    account_type: user?.account_type || "individual",
    name: user?.name || "", email: user?.email || "", dob: "", gender: "",
    company_name: "", business_type: "", contact_person: "", gstin: "", business_pan: "",
    address: { line: "", city: "", state: "", pincode: "", lat: null, lng: null },
    kyc: { aadhaar: "", pan: "" },
    bank: { holder: "", bank_name: "", account_number: "", ifsc: "" },
    upi: "",
    skills: "", experience_years: "", certifications: "",
    categories: [], service_area: { type: "pincode", pincodes: "", radius_km: 10 },
  }));

  useEffect(() => { api.get("/catalog/categories").then((r) => setCats(r.data || [])).catch(() => {}); }, []);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setNested = (obj, k, v) => setF((p) => ({ ...p, [obj]: { ...p[obj], [k]: v } }));
  const toggleCat = (id) => setF((p) => ({ ...p, categories: p.categories.includes(id) ? p.categories.filter((x) => x !== id) : [...p.categories, id] }));

  const detectLoc = () => {
    if (!navigator.geolocation) return toast.error("Location not supported");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { data } = await api.get(`/geo/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
        setF((p) => ({ ...p, address: { ...p.address, city: data.city || p.address.city, state: data.state || p.address.state, pincode: data.postcode || p.address.pincode, lat: pos.coords.latitude, lng: pos.coords.longitude } }));
        toast.success("Location captured");
      } catch { toast.error("Could not detect"); }
    }, () => toast.error("Permission denied"));
  };

  const valid = useMemo(() => {
    if (step === 0) return !!f.account_type;
    if (step === 1) return f.account_type === "individual" ? f.name.trim().length > 1 : f.company_name.trim().length > 1;
    if (step === 2) return f.address.line && f.address.city && f.address.pincode;
    if (step === 3) return f.kyc.aadhaar && f.kyc.pan && f.bank.account_number && f.bank.ifsc;
    if (step === 4) return f.categories.length > 0 && f.skills.trim();
    return true;
  }, [step, f]);

  const savePartial = async (submit = false) => {
    setBusy(true);
    try {
      const payload = {
        ...f,
        skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
        certifications: f.certifications.split(",").map((s) => s.trim()).filter(Boolean),
        experience_years: Number(f.experience_years) || 0,
        service_area: { ...f.service_area, pincodes: String(f.service_area.pincodes).split(/[\s,]+/).filter(Boolean) },
        submit,
      };
      await api.put("/auth/partner/onboarding", payload);
      await refresh();
      if (submit) { toast.success("Application submitted for verification!"); onDone?.(); }
      else toast.success("Progress saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Save failed"); }
    setBusy(false);
  };

  const next = () => { if (!valid) return toast.error("Please fill required fields"); if (step < STEPS.length - 1) { savePartial(false); setStep(step + 1); } else savePartial(true); };

  return (
    <div className="max-w-3xl mx-auto" data-testid="partner-onboarding">
      {/* Stepper */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto no-scrollbar">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${i === step ? "bg-primary-700 text-white" : i < step ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-400"}`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>} {s}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-4 ${i < step ? "bg-primary-400" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {step === 0 && (
          <div>
            <h2 className="font-heading font-bold text-xl text-slate-900 mb-1">How do you want to join?</h2>
            <p className="text-sm text-slate-500 mb-5">Choose the account type that fits you.</p>
            <div className="grid grid-cols-2 gap-4">
              {[["individual", User, "Individual", "Solo professional / technician"], ["company", Building2, "Company", "Registered business / agency"]].map(([v, Icon, t, d]) => (
                <button key={v} data-testid={`acct-${v}`} onClick={() => set("account_type", v)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all ${f.account_type === v ? "border-primary-600 bg-primary-50" : "border-slate-200 hover:border-primary-300"}`}>
                  <Icon className={`h-8 w-8 mb-3 ${f.account_type === v ? "text-primary-700" : "text-slate-400"}`} />
                  <p className="font-bold text-slate-900">{t}</p><p className="text-xs text-slate-500 mt-1">{d}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h2 className="font-heading font-bold text-xl text-slate-900 mb-1">{f.account_type === "company" ? "Business details" : "Personal details"}</h2>
            {f.account_type === "individual" ? (
              <>
                <Field label="Full name *"><Input data-testid="ob-name" value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email"><Input data-testid="ob-email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
                  <Field label="Date of birth"><DatePicker value={f.dob} onChange={(v) => set("dob", v)} placeholder="Select date of birth" fromYear={1940} toYear={new Date().getFullYear()} maxDate={new Date()} /></Field>
                </div>
                <Field label="Gender"><Input placeholder="Male / Female / Other" value={f.gender} onChange={(e) => set("gender", e.target.value)} /></Field>
              </>
            ) : (
              <>
                <Field label="Company name *"><Input data-testid="ob-company" value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Business type"><Input value={f.business_type} onChange={(e) => set("business_type", e.target.value)} /></Field>
                  <Field label="Contact person"><Input value={f.contact_person} onChange={(e) => set("contact_person", e.target.value)} /></Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="GSTIN"><Input value={f.gstin} onChange={(e) => set("gstin", e.target.value)} /></Field>
                  <Field label="Business PAN"><Input inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={10} className="uppercase" value={f.business_pan} onChange={(e) => set("business_pan", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} /></Field>
                </div>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2"><MapPin className="h-5 w-5 text-primary-700" />Address</h2>
              <button data-testid="ob-detect" onClick={detectLoc} className="text-sm font-semibold text-primary-700 flex items-center gap-1"><LocateFixed className="h-4 w-4" />Use current location</button>
            </div>
            <Field label="Address line *"><Input data-testid="ob-line" value={f.address.line} onChange={(e) => setNested("address", "line", e.target.value)} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City *"><Input data-testid="ob-city" value={f.address.city} onChange={(e) => setNested("address", "city", e.target.value)} /></Field>
              <Field label="State"><Input value={f.address.state} onChange={(e) => setNested("address", "state", e.target.value)} /></Field>
              <Field label="PIN *"><Input data-testid="ob-pin" value={f.address.pincode} onChange={(e) => setNested("address", "pincode", e.target.value)} /></Field>
            </div>
            {f.address.lat && <p className="text-xs text-emerald-600">Location pinned ({f.address.lat.toFixed(4)}, {f.address.lng.toFixed(4)})</p>}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary-700" />KYC &amp; Bank</h2>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Aadhaar number *"><Input data-testid="ob-aadhaar" value={f.kyc.aadhaar} onChange={(e) => setNested("kyc", "aadhaar", e.target.value)} /></Field>
              <Field label="PAN number *"><Input data-testid="ob-pan" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={10} className="uppercase" value={f.kyc.pan} onChange={(e) => setNested("kyc", "pan", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} /></Field>
            </div>
            <div className="pt-2 border-t border-slate-100"><p className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1 mb-2"><CreditCard className="h-4 w-4" />Bank / UPI (for payouts)</p></div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Account holder"><Input value={f.bank.holder} onChange={(e) => setNested("bank", "holder", e.target.value)} /></Field>
              <Field label="Bank name"><Input value={f.bank.bank_name} onChange={(e) => setNested("bank", "bank_name", e.target.value)} /></Field>
              <Field label="Account number *"><Input data-testid="ob-acct" value={f.bank.account_number} onChange={(e) => setNested("bank", "account_number", e.target.value)} /></Field>
              <Field label="IFSC *"><Input data-testid="ob-ifsc" inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} className="uppercase" value={f.bank.ifsc} onChange={(e) => setNested("bank", "ifsc", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))} /></Field>
            </div>
            <Field label="UPI ID"><Input placeholder="name@upi" value={f.upi} onChange={(e) => set("upi", e.target.value)} /></Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h2 className="font-heading font-bold text-xl text-slate-900 flex items-center gap-2"><Wrench className="h-5 w-5 text-primary-700" />Skills &amp; Service Area</h2>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Service categories *</p>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <button key={c.id} data-testid={`ob-cat-${c.id}`} onClick={() => toggleCat(c.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${f.categories.includes(c.id) ? "border-primary-600 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600"}`}>{c.name}</button>
                ))}
              </div>
            </div>
            <Field label="Primary skills * (comma separated)"><Input data-testid="ob-skills" placeholder="AC Repair, Gas Charging" value={f.skills} onChange={(e) => set("skills", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Total experience (years)"><Input type="number" value={f.experience_years} onChange={(e) => set("experience_years", e.target.value)} /></Field>
              <Field label="Certifications (comma separated)"><Input value={f.certifications} onChange={(e) => set("certifications", e.target.value)} /></Field>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Service area</p>
              <div className="flex gap-2 mb-2">
                {["pincode", "radius"].map((t) => (
                  <button key={t} onClick={() => setNested("service_area", "type", t)} className={`px-3 py-1.5 rounded-lg text-sm border ${f.service_area.type === t ? "border-primary-600 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600"}`}>{t === "pincode" ? "By PIN codes" : "By radius"}</button>
                ))}
              </div>
              {f.service_area.type === "pincode"
                ? <Textarea placeholder="848101, 848102, 848103" value={f.service_area.pincodes} onChange={(e) => setNested("service_area", "pincodes", e.target.value)} />
                : <Field label="Radius (km)"><Input type="number" value={f.service_area.radius_km} onChange={(e) => setNested("service_area", "radius_km", Number(e.target.value))} /></Field>}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3" data-testid="ob-review">
            <h2 className="font-heading font-bold text-xl text-slate-900">Review &amp; submit</h2>
            <Review label="Account type" value={f.account_type} />
            <Review label="Name" value={f.account_type === "company" ? f.company_name : f.name} />
            <Review label="Address" value={`${f.address.line}, ${f.address.city} ${f.address.pincode}`} />
            <Review label="Aadhaar / PAN" value={`${maskTail(f.kyc.aadhaar)} · ${f.kyc.pan}`} />
            <Review label="Bank" value={`${maskTail(f.bank.account_number)} · ${f.bank.ifsc}`} />
            <Review label="Categories" value={f.categories.map((id) => cats.find((c) => c.id === id)?.name).filter(Boolean).join(", ")} />
            <Review label="Skills" value={f.skills} />
            <div className="rounded-lg bg-amber-50 text-amber-800 text-sm p-3 mt-2">On submit, your application goes to admin for KYC &amp; verification. You&apos;ll be notified at each stage.</div>
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Back</Button>
          <Button data-testid="ob-next" onClick={next} disabled={busy} className="bg-primary-700 hover:bg-primary-800">
            {step === STEPS.length - 1 ? (busy ? "Submitting…" : "Submit application") : <>Next <ChevronRight className="h-4 w-4 ml-1" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => <div><label className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</label><div className="mt-1">{children}</div></div>;
const Review = ({ label, value }) => <div className="flex justify-between text-sm border-b border-slate-100 py-2"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800 text-right max-w-[60%]">{value || "—"}</span></div>;
const maskTail = (s) => { const x = String(s || ""); return x.length > 4 ? "•••• " + x.slice(-4) : x; };
