import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Phone, ShieldCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const normPhone = (p) => { let x = String(p).trim().replace(/\s/g, ""); if (!x.startsWith("+")) x = "+91" + x.replace(/^0+/, ""); return x; };

/*
  Deferred signup sheet: collect name+mobile -> OTP (30s resend timer) -> verify -> login.
  Props: open, onClose, defaultName, defaultPhone, onAuthed(user), title, subtitle
*/
export default function AuthSheet({ open, onClose, defaultName = "", defaultPhone = "", onAuthed, title = "Verify your mobile", subtitle = "Almost done! Confirm your number to place the booking." }) {
  const { login } = useAuth();
  const [step, setStep] = useState("phone");
  const [name, setName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef();

  useEffect(() => { if (open) { setStep("phone"); setOtp(""); setName(defaultName); setPhone(defaultPhone); setSeconds(0); } }, [open, defaultName, defaultPhone]);
  useEffect(() => () => clearInterval(timer.current), []);

  const startTimer = () => {
    setSeconds(30);
    clearInterval(timer.current);
    timer.current = setInterval(() => setSeconds((s) => { if (s <= 1) { clearInterval(timer.current); return 0; } return s - 1; }), 1000);
  };

  const sendOtp = async () => {
    if (!/^[6-9]\d{9}$/.test(phone.trim())) return toast.error("Enter a valid 10-digit mobile number");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/send-otp", { phone: normPhone(phone) });
      if (data.sent === false) { toast.error(data.message || "Could not send the OTP right now. Please try again."); setBusy?.(false); return; }
      if (data.dev_otp) { setOtp(data.dev_otp); toast.success(`OTP sent · Dev OTP: ${data.dev_otp}`); }
      else toast.success("OTP sent to your mobile");
      setStep("otp"); startTimer();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to send OTP"); }
    setBusy(false);
  };

  const verify = async () => {
    if (otp.length < 4) return toast.error("Enter the OTP");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/verify-otp", { phone: normPhone(phone), otp, name });
      login(data.token, data.user);
      toast.success(data.created ? "Account created!" : "Verified!");
      onAuthed?.(data.user);
    } catch (e) { toast.error(e?.response?.data?.detail || "Invalid OTP"); }
    setBusy(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/50 backdrop-blur-sm" data-testid="auth-sheet">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-7 animate-in slide-in-from-bottom duration-300">
        <div className="flex items-center justify-between mb-4">
          {step === "otp" ? (
            <button data-testid="auth-back" onClick={() => setStep("phone")} className="text-slate-500 hover:text-slate-700"><ArrowLeft className="h-5 w-5" /></button>
          ) : <div />}
          <button data-testid="auth-close" onClick={onClose} className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"><X className="h-5 w-5" /></button>
        </div>
        <div className="h-14 w-14 rounded-2xl bg-primary-50 flex items-center justify-center mb-4">
          {step === "phone" ? <Phone className="h-7 w-7 text-primary-700" /> : <ShieldCheck className="h-7 w-7 text-primary-700" />}
        </div>

        {step === "phone" ? (
          <>
            <h3 className="font-heading font-bold text-2xl text-slate-900">{title}</h3>
            <p className="text-sm text-slate-500 mt-1 mb-5">{subtitle}</p>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Your name</label>
            <Input data-testid="auth-name" className="mt-1 mb-3 h-12" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Mobile number</label>
            <div className="flex items-center mt-1 border border-slate-200 rounded-xl overflow-hidden h-12 focus-within:ring-2 focus-within:ring-primary-200">
              <span className="px-3 text-slate-500 border-r border-slate-200 h-full flex items-center bg-slate-50 font-medium">+91</span>
              <input data-testid="auth-phone" inputMode="numeric" maxLength={10} className="flex-1 px-3 h-full outline-none" placeholder="98765 43210" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} onKeyDown={(e) => e.key === "Enter" && sendOtp()} />
            </div>
            <Button data-testid="auth-send" onClick={sendOtp} disabled={busy} className="w-full mt-5 h-12 bg-primary-700 hover:bg-primary-800 text-base">{busy ? "Sending…" : "Send OTP"}</Button>
          </>
        ) : (
          <>
            <h3 className="font-heading font-bold text-2xl text-slate-900">Enter OTP</h3>
            <p className="text-sm text-slate-500 mt-1 mb-5">We sent a code to <b className="text-slate-700">+91 {phone}</b></p>
            <input data-testid="auth-otp" inputMode="numeric" maxLength={6}
              className="w-full h-14 text-center text-2xl tracking-[0.5em] font-bold border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-200"
              placeholder="••••••" value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))} onKeyDown={(e) => e.key === "Enter" && verify()} />
            <div className="flex items-center justify-between mt-3 text-sm">
              {seconds > 0 ? (
                <span className="text-slate-400" data-testid="auth-timer">Resend OTP in <b className="text-slate-600">0:{String(seconds).padStart(2, "0")}</b></span>
              ) : (
                <button data-testid="auth-resend" onClick={sendOtp} disabled={busy} className="text-primary-700 font-semibold hover:underline">Resend OTP</button>
              )}
              <span className="text-slate-400">Wrong number? <button onClick={() => setStep("phone")} className="text-primary-700 font-semibold">Edit</button></span>
            </div>
            <Button data-testid="auth-verify" onClick={verify} disabled={busy} className="w-full mt-5 h-12 bg-primary-700 hover:bg-primary-800 text-base">{busy ? "Verifying…" : "Verify & Continue"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
