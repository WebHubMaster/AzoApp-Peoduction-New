import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Phone, ShieldCheck, ArrowRight, Loader2, RotateCw } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onlyDigits, onlyAlpha, isPhone10 } from "@/lib/validation";
import { toast } from "sonner";

export const OtpLogin = ({ onSuccess, registerRole = null }) => {
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const OTP_LEN = 6;
  const boxRefs = useRef([]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);
  // Auto-focus the first OTP box the moment we land on the verify step.
  useEffect(() => {
    if (step === 2) setTimeout(() => boxRefs.current[0]?.focus(), 60);
  }, [step]);

  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Segmented OTP helpers — type-to-advance, backspace-to-retreat, full paste.
  const setOtpDigit = (idx, val) => {
    const d = onlyDigits(val, 1);
    const arr = otp.padEnd(OTP_LEN, " ").split("");
    arr[idx] = d || " ";
    const next = arr.join("").replace(/\s+$/g, "").replace(/\s/g, "");
    setOtp(next);
    if (d && idx < OTP_LEN - 1) boxRefs.current[idx + 1]?.focus();
  };
  const onOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) boxRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowLeft" && idx > 0) boxRefs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < OTP_LEN - 1) boxRefs.current[idx + 1]?.focus();
    if (e.key === "Enter") verify();
  };
  const onOtpPaste = (e) => {
    e.preventDefault();
    const pasted = onlyDigits(e.clipboardData.getData("text"), OTP_LEN);
    if (!pasted) return;
    setOtp(pasted);
    const focusIdx = Math.min(pasted.length, OTP_LEN - 1);
    setTimeout(() => boxRefs.current[focusIdx]?.focus(), 20);
  };

  const normalized = () => {
    let p = phone.trim().replace(/\s/g, "");
    if (!p.startsWith("+")) p = "+91" + p.replace(/^0+/, "");
    return p;
  };

  const send = async () => {
    if (!isPhone10(phone)) return toast.error("Enter a valid 10-digit mobile number");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone: normalized() });
      if (data.sent === false) {
        // SMS gateway is configured but delivery failed / cooldown — stay on step 1.
        toast.error(data.message || "Could not send the OTP right now. Please try again.");
        if (data.retry_after) setCooldown(Number(data.retry_after) || 30);
        setBusy(false);
        return;
      }
      if (data.dev_otp) {
        toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`);
        setOtp(data.dev_otp);
      } else {
        toast.success(data.message || "OTP sent to your mobile");
      }
      setCooldown(30);
      setStep(2);
      // Drop the cursor onto the first box so the user can type the fresh code
      // right away (covers both initial send and resend). Keep any dev-OTP autofill.
      if (!data.dev_otp) setOtp("");
      setTimeout(() => boxRefs.current[0]?.focus(), 60);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to send OTP");
    }
    setBusy(false);
  };

  // Step 2 — verify OTP first (server-side), then decide existing vs new.
  const verify = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/verify-otp", {
        phone: normalized(), otp, create_if_new: false, role: registerRole || undefined,
      });
      if (data.new_user) {
        // New number → collect the name, then run the existing signup flow.
        setStep(3);
        setBusy(false);
        return;
      }
      // Existing user → direct login → their dashboard.
      login(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}!`);
      onSuccess?.(data.user);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Invalid OTP");
    }
    setBusy(false);
  };

  // Step 3 — new user provides name, then account is created (existing signup flow).
  const continueSignup = async () => {
    if (!name.trim()) return toast.error("Please enter your name");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/verify-otp", {
        phone: normalized(), otp, name, create_if_new: true, role: registerRole || undefined,
      });
      login(data.token, data.user);
      toast.success(`Welcome, ${data.user.name}!`);
      onSuccess?.(data.user);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not complete signup");
    }
    setBusy(false);
  };

  return (
    <div className="w-full" data-testid="otp-login">
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" strokeWidth={1.5} />
            <Input data-testid="login-phone-input" className="pl-9 h-11" placeholder="Enter 10-digit mobile number"
              inputMode="numeric" maxLength={10}
              value={phone} onChange={(e) => setPhone(onlyDigits(e.target.value, 10))}
              onKeyDown={(e) => e.key === "Enter" && send()} />
          </div>
          <Button data-testid="send-otp-button" onClick={send} disabled={busy}
            className="w-full bg-primary-700 hover:bg-primary-800 h-11">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
          <p className="text-xs text-slate-400 text-center">We&apos;ll take you to the right panel based on your number.</p>
        </motion.div>
      )}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" strokeWidth={2} />
            <span>Enter the 6-digit code sent to <b className="text-slate-700">{normalized()}</b></span>
          </div>
          <div className="flex justify-between gap-2" data-testid="otp-boxes" onPaste={onOtpPaste}>
            {Array.from({ length: OTP_LEN }).map((_, i) => (
              <input
                key={i}
                ref={(el) => (boxRefs.current[i] = el)}
                data-testid={`otp-box-${i}`}
                inputMode="numeric"
                maxLength={1}
                value={otp[i] || ""}
                onChange={(e) => setOtpDigit(i, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 h-12 text-center text-xl font-bold rounded-xl border-2 border-slate-200 bg-white text-slate-800 outline-none transition focus:border-primary-600 focus:ring-2 focus:ring-primary-100"
              />
            ))}
          </div>
          {/* hidden mirror input keeps the raw value discoverable for tooling */}
          <input type="hidden" data-testid="login-otp-input" value={otp} readOnly />
          <Button data-testid="verify-otp-button" onClick={verify} disabled={busy || otp.length < OTP_LEN}
            className="w-full bg-primary-700 hover:bg-primary-800 h-11">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify OTP"}
          </Button>
          <div className="flex items-center justify-between pt-0.5">
            <button className="text-xs text-slate-500 hover:text-primary-700" onClick={() => { setOtp(""); setStep(1); }}>
              ← Change number
            </button>
            {cooldown > 0 ? (
              <span className="inline-flex items-center gap-1 text-xs text-slate-400" data-testid="resend-countdown">
                <RotateCw className="h-3.5 w-3.5 text-slate-300" strokeWidth={2} />
                You can resend in <b className="text-slate-600 tabular-nums">{fmtTime(cooldown)}</b>
              </span>
            ) : (
              <button data-testid="resend-otp-button" disabled={busy} onClick={send}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-800 disabled:text-slate-400 disabled:cursor-not-allowed">
                <RotateCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} strokeWidth={2} />
                Resend OTP
              </button>
            )}
          </div>
        </motion.div>
      )}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3" data-testid="otp-name-step">
          <p className="text-sm text-slate-500">Welcome! Please tell us your name to continue.</p>
          <Input data-testid="login-name-input" className="h-11" placeholder="Your full name" autoFocus
            value={name} onChange={(e) => setName(onlyAlpha(e.target.value))}
            onKeyDown={(e) => e.key === "Enter" && continueSignup()} />
          <Button data-testid="continue-signup-button" onClick={continueSignup} disabled={busy}
            className="w-full bg-primary-700 hover:bg-primary-800 h-11">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
          <button className="text-xs text-slate-500 hover:text-primary-700" onClick={() => setStep(1)}>
            ← Change number
          </button>
        </motion.div>
      )}
    </div>
  );
};
