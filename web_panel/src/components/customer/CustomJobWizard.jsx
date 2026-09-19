import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ArrowRight, ArrowLeft, Loader2, Phone, ShieldCheck, CheckCircle2,
  Wrench, IndianRupee, MapPin, ClipboardList, User as UserIcon, Sparkles,
  BadgeCheck, PartyPopper, PencilLine, Home as HomeIcon, Search,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { onlyDigits, onlyAlpha, isPhone10, isPincode6 } from "@/lib/validation";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const uid = () =>
  (window.crypto?.randomUUID?.() ||
    "cjr-" + Math.random().toString(36).slice(2) + Date.now().toString(36));

const STEPS = [
  { id: 1, label: "About You", icon: UserIcon },
  { id: 2, label: "Category", icon: Wrench },
  { id: 3, label: "The Work", icon: ClipboardList },
  { id: 4, label: "Budget & Area", icon: MapPin },
  { id: 5, label: "Review", icon: BadgeCheck },
];

const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

export default function CustomJobWizard({ open, onClose, onSubmitted }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [meta, setMeta] = useState({ min_budget: 299, max_budget: 500000 });
  const [categories, setCategories] = useState([]);
  const [step, setStep] = useState(1);
  const [idem] = useState(uid);

  // step 1
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [changingNumber, setChangingNumber] = useState(false);

  // step 2-4
  const [categoryId, setCategoryId] = useState("");
  const [catQuery, setCatQuery] = useState("");
  const [workName, setWorkName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [pincode, setPincode] = useState("");
  const [area, setArea] = useState(null); // {serviceable, area, reason}
  const [areaLoading, setAreaLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // {request_id}

  const normalized = useCallback(() => {
    let p = (phone || "").trim().replace(/\s/g, "");
    if (!p.startsWith("+")) p = "+91" + p.replace(/^0+/, "");
    return p;
  }, [phone]);

  // ---- bootstrap on open --------------------------------------------------
  useEffect(() => {
    if (!open) return;
    api.get("/custom-jobs/meta").then((r) => setMeta(r.data)).catch(() => {});
    api.get("/catalog/categories")
      .then((r) => setCategories((r.data || []).filter((c) => c.status === "active")))
      .catch(() => {});
    // logged-in customer → prefill + treat mobile as already verified (valid session)
    if (user && user.role === "customer") {
      setName(user.name || "");
      setPhone((user.phone || "").replace(/^\+91/, ""));
      setVerified(true);
    }
  }, [open, user]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  // ---- pincode serviceability (debounced) ---------------------------------
  const pinTimer = useRef(null);
  useEffect(() => {
    setArea(null);
    if (!isPincode6(pincode)) return;
    setAreaLoading(true);
    clearTimeout(pinTimer.current);
    pinTimer.current = setTimeout(() => {
      api.get(`/geo/serviceability?pincode=${pincode}`)
        .then((r) => setArea(r.data || { serviceable: false }))
        .catch(() => setArea({ serviceable: false, reason: "check_failed" }))
        .finally(() => setAreaLoading(false));
    }, 450);
    return () => clearTimeout(pinTimer.current);
  }, [pincode]);

  const reset = () => {
    setStep(1); setOtp(""); setOtpSent(false); setChangingNumber(false);
    setCategoryId(""); setCatQuery(""); setWorkName(""); setDescription("");
    setBudget(""); setPincode(""); setArea(null); setResult(null);
    if (!(user && user.role === "customer")) { setVerified(false); setName(""); setPhone(""); }
  };

  const close = () => { onClose?.(); setTimeout(reset, 250); };

  // ---- OTP ----------------------------------------------------------------
  const sendOtp = async () => {
    if (!isPhone10(phone)) return toast.error("Enter a valid 10-digit mobile number");
    if (!name.trim() || name.trim().length < 2) return toast.error("Please enter your full name");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone: normalized() });
      if (data.sent === false) {
        toast.error(data.message || "Could not send OTP. Please try again.");
        if (data.retry_after) setCooldown(Number(data.retry_after) || 30);
      } else {
        if (data.dev_otp) { toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); setOtp(data.dev_otp); }
        else toast.success(data.message || "OTP sent to your mobile");
        setOtpSent(true); setCooldown(30);
      }
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to send OTP"); }
    setBusy(false);
  };

  const verifyOtp = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone: normalized(), otp, name: name.trim() });
      login(data.token, data.user);
      setVerified(true); setChangingNumber(false); setOtpSent(false);
      toast.success("Mobile verified!");
    } catch (e) { toast.error(e?.response?.data?.detail || "Invalid OTP"); }
    setBusy(false);
  };

  // ---- validation gates per step ------------------------------------------
  const nameOk = name.trim().length >= 2 && name.trim().length <= 60;
  const step1Ok = verified && nameOk;
  const step2Ok = !!categoryId;
  const step3Ok = workName.trim().length >= 3 && workName.trim().length <= 100 &&
    description.trim().length >= 10 && description.trim().length <= 1000;
  const budgetNum = Number(budget);
  const budgetOk = budget !== "" && !Number.isNaN(budgetNum) &&
    budgetNum >= meta.min_budget && budgetNum <= meta.max_budget;
  const step4Ok = budgetOk && isPincode6(pincode) && area?.serviceable === true;

  const canNext = { 1: step1Ok, 2: step2Ok, 3: step3Ok, 4: step4Ok, 5: true }[step];

  const next = () => { if (canNext && step < 5) setStep(step + 1); };
  const back = () => { if (step > 1) setStep(step - 1); };

  const selectedCat = categories.find((c) => c.id === categoryId);

  const filteredCats = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, catQuery]);

  // ---- submit -------------------------------------------------------------
  const submit = async () => {
    if (!(step1Ok && step2Ok && step3Ok && step4Ok)) return;
    setBusy(true);
    try {
      const { data } = await api.post("/custom-jobs", {
        full_name: name.trim(),
        mobile: normalized(),
        category_id: categoryId,
        work_name: workName.trim(),
        description: description.trim(),
        expected_budget: budgetNum,
        pincode,
        city: area?.area || "",
        idempotency_key: idem,
      });
      setResult(data);
      onSubmitted?.(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not submit your request. Please try again.");
    }
    setBusy(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        data-testid="custom-job-wizard">
        {/* backdrop */}
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={close} />

        {/* sheet / modal */}
        <motion.div
          initial={{ y: "100%", opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="relative w-full sm:max-w-lg bg-white dark:bg-slate-900 sm:rounded-3xl rounded-t-3xl shadow-2xl
                     h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden">
          {result ? (
            <SuccessScreen result={result} onClose={close}
              onDashboard={() => { close(); navigate("/account?tab=custom_jobs"); }}
              onBrowse={() => { close(); navigate("/services"); }} />
          ) : (
            <>
              {/* header */}
              <div className="shrink-0 px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-primary-700 to-primary-600 text-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-8 w-8 rounded-xl bg-white/15 grid place-items-center">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-heading font-extrabold text-base leading-tight">Request a Custom Service</p>
                      <p className="text-[11px] text-primary-100">Can&apos;t find what you need? We&apos;ll build it for you.</p>
                    </div>
                  </div>
                  <button onClick={close} data-testid="cjr-close"
                    className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* stepper */}
                <div className="flex items-center gap-1.5 mt-3">
                  {STEPS.map((s) => (
                    <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                      <div className={`h-1.5 w-full rounded-full transition-all ${s.id <= step ? "bg-white" : "bg-white/25"}`} />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-primary-100 mt-1.5 font-medium">
                  Step {step} of 5 · {STEPS[step - 1].label}
                </p>
              </div>

              {/* body (scrollable) */}
              <div className="flex-1 overflow-y-auto px-5 py-5">
                {step === 1 && (
                  <Step1
                    name={name} setName={setName} phone={phone} setPhone={setPhone}
                    otp={otp} setOtp={setOtp} otpSent={otpSent} verified={verified}
                    cooldown={cooldown} busy={busy} sendOtp={sendOtp} verifyOtp={verifyOtp}
                    nameOk={nameOk} changingNumber={changingNumber}
                    onChangeNumber={() => { setChangingNumber(true); setVerified(false); setOtpSent(false); setOtp(""); }} />
                )}
                {step === 2 && (
                  <Step2 categories={filteredCats} categoryId={categoryId} setCategoryId={setCategoryId}
                    catQuery={catQuery} setCatQuery={setCatQuery} />
                )}
                {step === 3 && (
                  <Step3 workName={workName} setWorkName={setWorkName}
                    description={description} setDescription={setDescription} />
                )}
                {step === 4 && (
                  <Step4 budget={budget} setBudget={setBudget} meta={meta} budgetOk={budgetOk}
                    pincode={pincode} setPincode={setPincode} area={area} areaLoading={areaLoading} />
                )}
                {step === 5 && (
                  <Step5 data={{ name, phone: normalized(), selectedCat, workName, description, budget: budgetNum, pincode, area }}
                    onEdit={(s) => setStep(s)} />
                )}
              </div>

              {/* sticky footer */}
              <div className="shrink-0 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3"
                style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
                {step > 1 ? (
                  <button onClick={back} data-testid="cjr-back"
                    className="h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                ) : <span />}
                {step < 5 ? (
                  <button onClick={next} disabled={!canNext} data-testid="cjr-next"
                    className="flex-1 h-12 rounded-xl bg-primary-700 hover:bg-primary-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-1 shadow-primarybtn">
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={submit} disabled={busy} data-testid="cjr-submit"
                    className="flex-1 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 shadow-lg">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <><BadgeCheck className="h-5 w-5" /> Submit Custom Job Request</>}
                  </button>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ======================================================= STEP 1 ========= */
function Step1({ name, setName, phone, setPhone, otp, setOtp, otpSent, verified, cooldown, busy, sendOtp, verifyOtp, nameOk, changingNumber, onChangeNumber }) {
  return (
    <div className="space-y-4">
      <StepHead title="Tell us about you" sub="We'll verify your mobile with a one-time OTP." />
      <Field label="Full Name" required>
        <input data-testid="cjr-name" value={name} maxLength={60}
          onChange={(e) => setName(onlyAlpha(e.target.value))}
          placeholder="e.g. Rahul Kumar"
          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none" />
        {name && !nameOk && <Hint bad>Name must be 2–60 letters.</Hint>}
      </Field>

      {verified && !changingNumber ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4 flex items-center gap-3" data-testid="cjr-verified">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-emerald-800 dark:text-emerald-200 text-sm">Mobile verified</p>
            <p className="text-emerald-700/80 dark:text-emerald-300/80 text-xs truncate">+91 {phone}</p>
          </div>
          <button onClick={onChangeNumber} className="text-xs font-semibold text-emerald-700 hover:underline shrink-0">Change</button>
        </div>
      ) : (
        <>
          <Field label="Mobile Number" required>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input data-testid="cjr-phone" value={phone} inputMode="numeric" maxLength={10}
                onChange={(e) => setPhone(onlyDigits(e.target.value, 10))} placeholder="10-digit mobile number"
                className="w-full h-12 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none" />
            </div>
          </Field>

          {!otpSent ? (
            <button data-testid="cjr-send-otp" onClick={sendOtp} disabled={busy}
              className="w-full h-12 rounded-xl bg-primary-700 hover:bg-primary-800 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}
            </button>
          ) : (
            <div className="space-y-3">
              <Field label="Enter OTP" required>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input data-testid="cjr-otp" value={otp} inputMode="numeric" maxLength={6}
                    onChange={(e) => setOtp(onlyDigits(e.target.value, 6))} placeholder="6-digit OTP"
                    className="w-full h-12 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 tracking-[0.3em] font-semibold focus:border-primary-500 outline-none" />
                </div>
              </Field>
              <button data-testid="cjr-verify-otp" onClick={verifyOtp} disabled={busy}
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Continue"}
              </button>
              <div className="flex justify-end">
                <button disabled={cooldown > 0 || busy} onClick={sendOtp}
                  className="text-xs font-semibold text-primary-700 disabled:text-slate-400 disabled:cursor-not-allowed">
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ======================================================= STEP 2 ========= */
function Step2({ categories, categoryId, setCategoryId, catQuery, setCatQuery }) {
  return (
    <div className="space-y-4">
      <StepHead title="What service do you need?" sub="Pick the closest category for your work." />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder="Search categories…"
          className="w-full h-11 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2.5" data-testid="cjr-categories">
        {categories.length === 0 && <p className="col-span-2 text-center text-sm text-slate-400 py-6">No categories found.</p>}
        {categories.map((c) => {
          const sel = c.id === categoryId;
          return (
            <button key={c.id} data-testid={`cjr-cat-${c.id}`} onClick={() => setCategoryId(c.id)}
              className={`flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${sel ? "border-primary-600 bg-primary-50 dark:bg-primary-900/25 ring-2 ring-primary-200" : "border-slate-200 dark:border-slate-700 hover:border-primary-300"}`}>
              <span className="h-11 w-11 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 grid place-items-center">
                {c.image ? <img src={c.image} alt="" className="h-full w-full object-cover" /> : <Wrench className="h-5 w-5 text-slate-400" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold truncate ${sel ? "text-primary-700 dark:text-primary-200" : "text-slate-700 dark:text-slate-200"}`}>{c.name}</span>
                {sel && <span className="text-[11px] text-primary-600 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> Selected</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ======================================================= STEP 3 ========= */
function Step3({ workName, setWorkName, description, setDescription }) {
  return (
    <div className="space-y-4">
      <StepHead title="Tell us about the work" sub="Be clear so our team understands your requirement." />
      <Field label="Work Name" required hint={`${workName.trim().length}/100`}>
        <input data-testid="cjr-workname" value={workName} maxLength={100}
          onChange={(e) => setWorkName(e.target.value)} placeholder="e.g. Main Gate Grill Repair"
          className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none" />
        {workName && workName.trim().length < 3 && <Hint bad>At least 3 characters.</Hint>}
      </Field>
      <Field label="Describe Your Work" required hint={`${description.trim().length}/1000`}>
        <textarea data-testid="cjr-desc" value={description} maxLength={1000} rows={5}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. The main gate grill has come loose and needs welding / re-fixing."
          className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none resize-none" />
        {description && description.trim().length < 10 && <Hint bad>Please add at least 10 characters.</Hint>}
      </Field>
    </div>
  );
}

/* ======================================================= STEP 4 ========= */
function Step4({ budget, setBudget, meta, budgetOk, pincode, setPincode, area, areaLoading }) {
  return (
    <div className="space-y-5">
      <StepHead title="Your budget & location" sub="This is your expected budget — the final price is set by our team." />
      <Field label="Expected Budget" required>
        <div className="relative">
          <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input data-testid="cjr-budget" value={budget} inputMode="numeric"
            onChange={(e) => setBudget(onlyDigits(e.target.value, 7))} placeholder={`e.g. 1500 (min ${meta.min_budget})`}
            className="w-full h-12 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none" />
        </div>
        {budget && !budgetOk && (
          <Hint bad>Enter an amount between {rupee(meta.min_budget)} and {rupee(meta.max_budget)}.</Hint>
        )}
        <p className="text-[11px] text-slate-400 mt-1">Just an estimate — helps our team plan. Not the final price.</p>
      </Field>

      <Field label="Service Pincode" required>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input data-testid="cjr-pincode" value={pincode} inputMode="numeric" maxLength={6}
            onChange={(e) => setPincode(onlyDigits(e.target.value, 6))} placeholder="6-digit pincode"
            className="w-full h-12 pl-9 pr-4 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-primary-500 outline-none" />
        </div>
      </Field>

      {isPincode6(pincode) && (
        <div data-testid="cjr-area-status">
          {areaLoading ? (
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking service availability…
            </div>
          ) : area?.serviceable ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-3.5 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Great! AzoApp services are available in your area{area.area ? ` (${area.area})` : ""}.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-800 p-3.5 flex items-center gap-3" data-testid="cjr-area-unavailable">
              <X className="h-5 w-5 text-rose-500 shrink-0" />
              <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                Sorry, AzoApp currently does not provide services in this area.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ======================================================= STEP 5 ========= */
function Step5({ data, onEdit }) {
  const Row = ({ k, v, verified: vf }) => (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 w-28">{k}</span>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200 text-right flex-1 break-words">
        {v} {vf && <span className="inline-flex items-center gap-0.5 text-emerald-600 text-xs"><CheckCircle2 className="h-3 w-3" /> Verified</span>}
      </span>
    </div>
  );
  const Card = ({ title, editStep, children }) => (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</p>
        <button onClick={() => onEdit(editStep)} className="text-xs font-semibold text-primary-700 flex items-center gap-0.5">
          <PencilLine className="h-3 w-3" /> Edit
        </button>
      </div>
      {children}
    </div>
  );
  return (
    <div className="space-y-3.5" data-testid="cjr-review">
      <StepHead title="Review your request" sub="Please confirm the details before submitting." />
      <Card title="Customer" editStep={1}>
        <Row k="Name" v={data.name} />
        <Row k="Mobile" v={data.phone} verified />
      </Card>
      <Card title="Service" editStep={2}>
        <Row k="Category" v={data.selectedCat?.name || "—"} />
      </Card>
      <Card title="Work" editStep={3}>
        <Row k="Work Name" v={data.workName} />
        <Row k="Description" v={data.description} />
      </Card>
      <Card title="Budget & Location" editStep={4}>
        <Row k="Expected Budget" v={rupee(data.budget)} />
        <Row k="Pincode" v={data.pincode} />
        <Row k="Service Area" v={data.area?.serviceable ? "Available" : "—"} verified={data.area?.serviceable} />
      </Card>
    </div>
  );
}

/* ==================================================== SUCCESS =========== */
function SuccessScreen({ result, onClose, onDashboard, onBrowse }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10" data-testid="cjr-success">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 12 }}
        className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 grid place-items-center mb-5">
        <PartyPopper className="h-10 w-10 text-emerald-600" />
      </motion.div>
      <h3 className="font-heading font-black text-2xl text-slate-900 dark:text-white">Custom Job Request Submitted!</h3>
      <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
        Your request has been successfully submitted to AzoApp. Our team will review it and may convert it into a new service.
      </p>
      <div className="mt-5 px-5 py-3 rounded-2xl bg-primary-50 dark:bg-primary-900/25 border border-primary-200 dark:border-primary-800">
        <p className="text-[11px] uppercase tracking-wider text-primary-500 font-bold">Request ID</p>
        <p className="font-heading font-black text-xl text-primary-700 dark:text-primary-200 tracking-wide">{result.request_id}</p>
      </div>
      <div className="mt-7 w-full space-y-2.5">
        <button onClick={onDashboard} data-testid="cjr-view-request"
          className="w-full h-12 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-bold flex items-center justify-center gap-2">
          <ClipboardList className="h-4 w-4" /> View My Requests
        </button>
        <button onClick={onBrowse}
          className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold flex items-center justify-center gap-2">
          <HomeIcon className="h-4 w-4" /> Continue Browsing Services
        </button>
      </div>
    </div>
  );
}

/* ==================================================== helpers =========== */
function StepHead({ title, sub }) {
  return (
    <div className="mb-1">
      <h3 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">{title}</h3>
      {sub && <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}
function Field({ label, required, hint, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function Hint({ children, bad }) {
  return <p className={`text-[11px] mt-1 ${bad ? "text-rose-500" : "text-slate-400"}`}>{children}</p>;
}
