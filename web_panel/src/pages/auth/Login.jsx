import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, Users, Wrench, Store, ShieldCheck, Sparkles, Loader2 } from "lucide-react";
import { GoogleOAuthProvider, GoogleLogin } from "@react-oauth/google";
import { OtpLogin } from "@/components/OtpLogin";
import BrandLogo from "@/components/site/BrandLogo";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const HOME = { customer: "/account", partner: "/partner", merchant: "/merchant", admin: "/admin", agent: "/agent" };
const ROLE_ICON = { customer: Users, partner: Wrench, merchant: Store, admin: ShieldCheck };
const ROLE_STYLE = {
  admin: { label: "Admin", portal: "Admin panel", border: "border-primary-200", hover: "hover:border-primary-500 hover:bg-primary-50", badge: "bg-primary-100 text-primary-700" },
  partner: { label: "Partner", portal: "Partner app", border: "border-emerald-200", hover: "hover:border-emerald-500 hover:bg-emerald-50", badge: "bg-emerald-100 text-emerald-700" },
  customer: { label: "Customer", portal: "Customer account", border: "border-amber-200", hover: "hover:border-amber-500 hover:bg-amber-50", badge: "bg-amber-100 text-amber-700" },
  merchant: { label: "Merchant", portal: "Merchant panel", border: "border-fuchsia-200", hover: "hover:border-fuchsia-500 hover:bg-fuchsia-50", badge: "bg-fuchsia-100 text-fuchsia-700" },
};

export default function Login() {
  const navigate = useNavigate();
  const { user, login, loading } = useAuth();
  const [demo, setDemo] = useState({ demo_mode: false, accounts: [] });
  const [busy, setBusy] = useState("");
  const [registerRole, setRegisterRole] = useState(null);

  useEffect(() => { if (user) navigate(HOME[user.role] || "/", { replace: true }); }, [user, navigate]);
  useEffect(() => { api.get("/auth/demo-status").then((r) => setDemo(r.data)).catch(() => {}); }, []);
  const [cfg, setCfg] = useState({ auth_config: {}, integrations: {} });
  const [em, setEm] = useState({ email: "", password: "", name: "" });
  const [forgot, setForgot] = useState(false);
  useEffect(() => { api.get("/auth/config").then((r) => setCfg(r.data)).catch(() => {}); }, []);
  const emailLogin = async () => {
    try { const { data } = await api.post("/auth/email", em); login(data.token, data.user); toast.success(`Welcome, ${data.user.name}!`); navigate(HOME[data.user.role]); }
    catch (e) { toast.error(e?.response?.data?.detail || "Login failed"); }
  };

  const googleLogin = async (credential) => {
    try { const { data } = await api.post("/auth/google", { credential }); login(data.token, data.user); toast.success(`Welcome, ${data.user.name}!`); navigate(HOME[data.user.role]); }
    catch (e) { toast.error(e?.response?.data?.detail || "Google sign-in failed"); }
  };

  const quickLogin = async (acc) => {
    setBusy(acc.phone);
    try {
      await api.post("/auth/send-otp", { phone: acc.phone });
      const { data } = await api.post("/auth/verify-otp", { phone: acc.phone, otp: acc.otp });
      login(data.token, data.user);
      toast.success(`Demo login: ${data.user.name}`);
      navigate(HOME[data.user.role]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Demo login failed");
    }
    setBusy("");
  };

  return (
    <div className="min-h-[100dvh] flex w-full overflow-x-hidden">
      {(loading || user) && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white" data-testid="login-auth-loader">
          <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
        </div>
      )}
      <div className="hidden lg:flex w-1/2 bg-primary-700 text-white p-14 flex-col justify-between azo-grid-bg relative overflow-hidden">
        <div className="relative z-10">
          <BrandLogo to={null} variant="dark" imgClass="h-10 w-auto max-w-[180px] object-contain brightness-0 invert" />
        </div>
        <div className="relative z-10">
          <h1 className="font-heading font-black text-5xl leading-tight">Home services,<br />reimagined.</h1>
          <p className="text-primary-100 mt-4 text-lg max-w-md">One number, one login. We route you to the right panel automatically — customer, partner, merchant or admin.</p>
          <div className="flex gap-8 mt-10">
            <div><p className="text-3xl font-heading font-extrabold">3-way</p><p className="text-primary-200 text-sm">OTP verified jobs</p></div>
            <div><p className="text-3xl font-heading font-extrabold">Lifetime</p><p className="text-primary-200 text-sm">merchant referral</p></div>
            <div><p className="text-3xl font-heading font-extrabold">AI</p><p className="text-primary-200 text-sm">powered assistant</p></div>
          </div>
        </div>
        <div className="relative z-10 text-primary-200 text-sm">© 2026 AzoApp · Home Service OS</div>
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-primary-500/30 blur-3xl" />
      </div>

      <div className="flex-1 flex items-start lg:items-center justify-center px-5 py-8 sm:p-6 bg-white overflow-y-auto min-h-[100dvh]">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md my-auto">
          <div className="lg:hidden mb-8">
            <BrandLogo to="/" />
          </div>
          <h2 className="font-heading font-extrabold text-3xl text-slate-900">{registerRole ? `Register as ${registerRole}` : "Sign in to continue"}</h2>
          <p className="text-slate-500 mt-1 mb-6">{registerRole ? "Verify your mobile to create your account" : "Login with your mobile number"}</p>

          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60">
            {cfg.auth_config?.mobile_otp === false ? (
              <p className="text-sm text-slate-500 text-center py-2" data-testid="otp-disabled-note">Mobile OTP login is currently disabled. Please use another method below.</p>
            ) : (
              <OtpLogin registerRole={registerRole} onSuccess={(u) => navigate(HOME[u.role])} />
            )}
          </div>

          <div className="mt-4 flex gap-2 text-sm" data-testid="register-toggles">
            <button data-testid="reg-partner" onClick={() => setRegisterRole(registerRole === "partner" ? null : "partner")}
              className={`flex-1 py-2 rounded-lg border font-medium transition-all ${registerRole === "partner" ? "border-primary-700 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600 hover:border-primary-300"}`}>
              {registerRole === "partner" ? "← Back to login" : "Register as Partner"}
            </button>
            {registerRole !== "partner" && (
              <button data-testid="reg-merchant" onClick={() => setRegisterRole(registerRole === "merchant" ? null : "merchant")}
                className={`flex-1 py-2 rounded-lg border font-medium transition-all ${registerRole === "merchant" ? "border-primary-700 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600 hover:border-primary-300"}`}>
                {registerRole === "merchant" ? "← Back to login" : "Register as Merchant"}
              </button>
            )}
          </div>

          {cfg.auth_config?.email_login && (
            <div className="mt-4 p-5 rounded-2xl border border-slate-200 bg-white" data-testid="email-login">
              <p className="text-xs uppercase tracking-[0.2em] font-bold text-primary-700 mb-2">Email Login</p>
              <input data-testid="email-input" className="w-full mb-2 h-11 px-3 rounded-md border border-slate-200" placeholder="Email" value={em.email} onChange={(e) => setEm({ ...em, email: e.target.value })} />
              <input data-testid="email-name" className="w-full mb-2 h-11 px-3 rounded-md border border-slate-200" placeholder="Name (new users)" value={em.name} onChange={(e) => setEm({ ...em, name: e.target.value })} />
              <input data-testid="email-pass" type="password" className="w-full mb-2 h-11 px-3 rounded-md border border-slate-200" placeholder="Password" value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })} />
              <button data-testid="email-login-btn" onClick={emailLogin} className="w-full h-11 rounded-md bg-primary-700 hover:bg-primary-800 text-white font-medium">Continue with Email</button>
              <button data-testid="forgot-password-link" onClick={() => setForgot(true)} className="w-full text-center text-xs text-primary-700 hover:underline mt-2">Forgot password?</button>
            </div>
          )}
          {(cfg.auth_config?.social_login || cfg.auth_config?.whatsapp_login) && (
            <div className="mt-3 space-y-2" data-testid="alt-auth">
              {cfg.auth_config?.whatsapp_login && <button data-testid="wa-login" onClick={() => toast.info("WhatsApp OTP uses the same mobile flow above")} className="w-full h-10 rounded-lg border border-slate-200 text-sm font-medium hover:border-primary-300">Continue with WhatsApp OTP</button>}
              {cfg.auth_config?.social_login && (
                cfg.integrations?.google_client_id ? (
                  <div className="flex justify-center" data-testid="google-login">
                    <GoogleOAuthProvider clientId={cfg.integrations.google_client_id}>
                      <GoogleLogin
                        onSuccess={(resp) => googleLogin(resp.credential)}
                        onError={() => toast.error("Google sign-in failed")}
                        width="360"
                      />
                    </GoogleOAuthProvider>
                  </div>
                ) : (
                  <button data-testid="social-login-disabled" onClick={() => toast.info("Admin: add Google Client ID in Integrations to enable Google sign-in")} className="w-full h-10 rounded-lg border border-slate-200 text-sm font-medium hover:border-primary-300">Continue with Google</button>
                )
              )}
            </div>
          )}

          {demo.demo_mode && demo.accounts.length > 0 && (
            <div className="mt-6" data-testid="demo-accounts">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-accent" />
                <p className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500">One-click demo login · OTP 123456</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {["admin", "partner", "customer", "merchant"].map((role) => {
                  const a = demo.accounts.find((x) => x.role === role);
                  if (!a) return null;
                  const Icon = ROLE_ICON[role] || Users;
                  const style = ROLE_STYLE[role];
                  return (
                    <button key={role} data-testid={`demo-${role}`} onClick={() => quickLogin(a)} disabled={busy === a.phone}
                      className={`group relative flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all disabled:opacity-50 ${style.border} ${style.hover}`}>
                      <span className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${style.badge}`}>
                        {busy === a.phone ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" strokeWidth={1.8} />}
                      </span>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-800">Login as {style.label}</p>
                        <p className="text-[11px] text-slate-400 truncate">Opens {style.portal}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-400 mt-2 text-center">Each button signs you straight into that portal with pre-loaded demo data.</p>
            </div>
          )}

          <button onClick={() => navigate("/")} className="mt-6 text-sm text-slate-500 hover:text-primary-700">← Back to home</button>
        </motion.div>
      </div>
      <ForgotPasswordDialog open={forgot} onClose={() => setForgot(false)} />
    </div>
  );
}

const ForgotPasswordDialog = ({ open, onClose }) => {
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ identifier: "", otp: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const sendOtp = async () => {
    if (!f.identifier.trim()) return toast.error("Enter your email or mobile");
    setBusy(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { identifier: f.identifier.trim() });
      if (data.dev_otp) { toast.success(`OTP (dev): ${data.dev_otp}`); upd("otp", data.dev_otp); }
      else toast.success(data.message || "OTP sent");
      setStep(2);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to send OTP"); }
    setBusy(false);
  };
  const reset = async () => {
    if (f.otp.length < 4 || f.new_password.length < 4) return toast.error("Enter OTP and a new password (min 4 chars)");
    setBusy(true);
    try {
      await api.post("/auth/reset-password", { identifier: f.identifier.trim(), otp: f.otp, new_password: f.new_password });
      toast.success("Password reset! Please log in.");
      onClose(); setStep(1); setF({ identifier: "", otp: "", new_password: "" });
    } catch (e) { toast.error(e?.response?.data?.detail || "Reset failed"); }
    setBusy(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent data-testid="forgot-password-dialog">
        <DialogHeader><DialogTitle className="font-heading">Reset your password</DialogTitle><DialogDescription>Verify a one-time OTP sent to your registered mobile.</DialogDescription></DialogHeader>
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">We&apos;ll send a one-time OTP to your registered mobile.</p>
            <Input data-testid="forgot-identifier" placeholder="Email or mobile number" value={f.identifier} onChange={(e) => upd("identifier", e.target.value)} />
            <Button data-testid="forgot-send-otp" onClick={sendOtp} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">{busy ? "Sending…" : "Send OTP"}</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Input data-testid="forgot-otp" placeholder="Enter OTP" value={f.otp} onChange={(e) => upd("otp", e.target.value)} />
            <Input data-testid="forgot-new-password" type="password" placeholder="New password" value={f.new_password} onChange={(e) => upd("new_password", e.target.value)} />
            <Button data-testid="forgot-reset" onClick={reset} disabled={busy} className="w-full bg-primary-700 hover:bg-primary-800">{busy ? "Resetting…" : "Reset Password"}</Button>
            <button className="text-xs text-slate-500 hover:text-primary-700" onClick={() => setStep(1)}>← Change email/mobile</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
