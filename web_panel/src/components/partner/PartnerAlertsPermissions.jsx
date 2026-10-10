import { useCallback, useEffect, useState } from "react";
import { BellRing, MapPin, Volume2, MonitorSmartphone, CheckCircle2, AlertCircle, AlertTriangle, PhoneCall, Bell, Radio, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { initPush, isPushSupported, currentPermission } from "@/lib/push";
import { previewTone, getRingPrefs } from "@/lib/ringPrefs";
import { PUSH_PERMISSION_CHANGED_EVENT } from "@/components/PushRegistrar";

const SOUND_KEY = "azo_sound_unlocked";
const isStandalone = () => window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

const CARDS = [
  { key: "notifications", icon: BellRing, title: "Notifications", why: "Ring loudly for every new job and show booking, chat & reminder alerts — even when this tab is in the background.", affected: "Without this you will NOT get the Job Ring or any push alerts.", tint: "#F59E0B", critical: true },
  { key: "sound", icon: Volume2, title: "Ring Sound", why: "Let the browser play the job ring sound out loud on this device.", affected: "Browsers mute sound until you allow it once — the ring may be silent.", tint: "#22C55E", critical: true },
  { key: "location", icon: MapPin, title: "Location", why: "Show each job's distance & travel time, and share your live location while online.", affected: "Distance/ETA and live tracking won't work.", tint: "#A78BFA" },
  { key: "install", icon: MonitorSmartphone, title: "Install as App", why: "Add AzoApp Partner to your home screen / desktop so alerts arrive reliably like a real app.", affected: "Alerts may stop when the browser tab is closed.", tint: "#38BDF8" },
];

async function readStates() {
  const notif = currentPermission();
  let loc = "prompt";
  try { loc = (await navigator.permissions?.query({ name: "geolocation" }))?.state || "prompt"; } catch { /* unsupported */ }
  return {
    notifications: { granted: notif === "granted", blocked: notif === "denied", available: notif !== "unsupported" && isPushSupported() },
    sound: { granted: sessionStorage.getItem(SOUND_KEY) === "1", blocked: false, available: !!(window.AudioContext || window.webkitAudioContext) },
    location: { granted: loc === "granted", blocked: loc === "denied", available: !!navigator.geolocation },
    install: { granted: isStandalone(), blocked: false, available: true },
  };
}

function PermCard({ c, st, busy, onAllow }) {
  const Ic = c.icon;
  const granted = !!st?.granted;
  const unavailable = st ? !st.available : false;
  return (
    <div data-testid={`perm-card-${c.key}`} className={`rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-2.5 ${granted ? "border-emerald-300/70" : c.critical ? "border-amber-300/70" : "border-slate-200 dark:border-slate-700"}`}>
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: c.tint + "22" }}><Ic className="h-6 w-6" style={{ color: c.tint }} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-extrabold text-slate-900 dark:text-white">{c.title}</p>
            {c.critical ? <span className="px-1.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-black">REQUIRED</span> : null}
          </div>
          <p data-testid={`perm-status-${c.key}`} className={`text-xs font-extrabold mt-0.5 inline-flex items-center gap-1 ${granted ? "text-emerald-600" : "text-amber-600"}`}>
            {granted ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {granted ? "Allowed" : unavailable ? "Not supported in this browser" : st?.blocked ? "Blocked in browser" : "Not allowed"}
          </p>
        </div>
        {granted ? (
          <span data-testid={`perm-${c.key}-granted`} className="h-8 w-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5" /></span>
        ) : unavailable ? null : (
          <button data-testid={`perm-${c.key}-allow`} disabled={busy} onClick={() => onAllow(c.key)} className="shrink-0 px-4 py-2 rounded-full bg-primary-700 hover:bg-primary-800 text-white text-xs font-extrabold disabled:opacity-60 active:scale-95 transition-transform">
            {busy ? "…" : st?.blocked ? "How to fix" : c.key === "install" ? "How to" : "Allow"}
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{c.why}</p>
      {!granted && !unavailable ? <p className="text-xs text-amber-700 leading-relaxed">{c.affected}</p> : null}
    </div>
  );
}

/** Alerts & Permissions — web counterpart of the Partner app's Permission Center. */
export default function PartnerAlertsPermissions() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(null);
  const [diag, setDiag] = useState(null);
  const [testing, setTesting] = useState(null);
  const [help, setHelp] = useState(null);

  const load = useCallback(async () => setS(await readStates()), []);
  const loadDiag = useCallback(async () => {
    const [dev, cfg] = await Promise.all([
      api.get("/notifications/my-devices").then((r) => r.data).catch(() => ({ count: 0 })),
      api.get("/notifications/push-config").then((r) => r.data).catch(() => ({ enabled: false })),
    ]);
    setDiag({ registered: dev?.count || 0, enabled: !!cfg?.enabled });
  }, []);
  useEffect(() => {
    load(); loadDiag();
    const h = () => { load(); loadDiag(); };
    window.addEventListener(PUSH_PERMISSION_CHANGED_EVENT, h);
    window.addEventListener("azo-push-registered", h);
    document.addEventListener("visibilitychange", h);
    return () => { window.removeEventListener(PUSH_PERMISSION_CHANGED_EVENT, h); window.removeEventListener("azo-push-registered", h); document.removeEventListener("visibilitychange", h); };
  }, [load, loadDiag]);

  const allow = async (key) => {
    const st = s?.[key];
    if (st?.blocked) { setHelp(key); return; }
    if (key === "install") { setHelp("install"); return; }
    setBusy(key);
    try {
      if (key === "notifications") {
        const r = await initPush({ interactive: true });
        if (r?.ok) toast.success("Notifications turned on");
        else if (currentPermission() === "denied") setHelp("notifications");
        window.dispatchEvent(new Event(PUSH_PERMISSION_CHANGED_EVENT));
      } else if (key === "sound") {
        const p = getRingPrefs();
        previewTone(p.tone, p.volume, p.customSoundUrl || "");
        sessionStorage.setItem(SOUND_KEY, "1");
        toast.success("Ring sound enabled");
      } else if (key === "location") {
        await new Promise((res) => navigator.geolocation.getCurrentPosition(res, () => res(null), { enableHighAccuracy: true, timeout: 15000 }));
      }
    } catch { /* ignore */ }
    await load(); loadDiag();
    setBusy(null);
  };

  const sendTest = async (kind) => {
    setTesting(kind);
    try {
      const { data } = await api.post("/notifications/test-self", { kind });
      if (data?.ok) toast.success(data.message || "Sent — check this device");
      else toast.error(data?.message || "Could not send test", { duration: 6000 });
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send test"); }
    setTesting(null); loadDiag();
  };

  const shown = CARDS;
  const readyCount = s ? shown.filter((c) => s[c.key]?.granted).length : 0;
  const criticalMissing = s ? shown.some((c) => c.critical && s[c.key]?.available && !s[c.key]?.granted) : false;

  return (
    <div data-testid="permission-center" className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary-700 text-white flex items-center justify-center shrink-0"><ShieldCheck className="h-5 w-5" /></div>
        <div>
          <h2 className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">Alerts &amp; Permissions</h2>
          <p data-testid="perm-ready-count" className="text-xs text-slate-500">{readyCount}/{shown.length} enabled</p>
        </div>
      </div>
      {criticalMissing ? (
        <div data-testid="perm-critical-banner" className="flex gap-2.5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-xs font-semibold leading-relaxed">A required permission is turned off. New jobs may not ring reliably until you allow it below.</p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((c) => <PermCard key={c.key} c={c} st={s?.[c.key]} busy={busy === c.key} onAllow={allow} />)}
      </div>

      {help ? (
        <div data-testid="perm-help" className="rounded-xl border border-primary-200 bg-primary-50 dark:bg-primary-900/20 p-4 text-sm text-slate-700 dark:text-slate-200 space-y-1.5">
          <p className="font-extrabold">{help === "install" ? "Install AzoApp Partner" : "Unblock in your browser"}</p>
          {help === "install" ? (
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>Android Chrome: tap the ⋮ menu → “Install app” / “Add to Home screen”.</li>
              <li>iPhone Safari: tap Share → “Add to Home Screen”.</li>
              <li>Desktop Chrome/Edge: click the install icon in the address bar.</li>
            </ol>
          ) : (
            <ol className="list-decimal pl-5 space-y-1 text-xs">
              <li>Click the lock / settings icon next to the website address.</li>
              <li>Open “Site settings” / “Permissions”.</li>
              <li>Set {help === "location" ? "Location" : "Notifications"} to “Allow”, then reload this page.</li>
            </ol>
          )}
          <button data-testid="perm-help-close" onClick={() => setHelp(null)} className="text-xs font-bold text-primary-700 hover:underline">Got it</button>
        </div>
      ) : null}

      <div data-testid="push-diagnostics" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <p className="font-extrabold text-slate-900 dark:text-white inline-flex items-center gap-2"><Radio className="h-5 w-5 text-primary-700" /> Push &amp; Ring Diagnostics</p>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          {diag?.enabled ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
          Server push service: <b className={diag?.enabled ? "text-emerald-600" : "text-amber-600"}>{diag?.enabled ? "Configured" : "Not configured (contact admin)"}</b>
        </p>
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          {diag?.registered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
          This device registered: <b className={diag?.registered ? "text-emerald-600" : "text-amber-600"}>{diag?.registered ? `Yes (${diag.registered})` : "No — allow notifications above"}</b>
        </p>
        <p className="text-[11.5px] text-slate-500 leading-relaxed">Send a real test to this device. For the ring test, switch to another tab or minimise the browser first.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button data-testid="test-ring-btn" disabled={!!testing} onClick={() => sendTest("ring")} className="h-11 rounded-md bg-primary-700 hover:bg-primary-800 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-60">
            <PhoneCall className="h-4 w-4" /> {testing === "ring" ? "Sending…" : "Test Job Ring"}
          </button>
          <button data-testid="test-push-btn" disabled={!!testing} onClick={() => sendTest("push")} className="h-11 rounded-md border-[1.5px] border-primary-700 text-primary-700 dark:text-primary-300 text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-60 hover:bg-primary-50 dark:hover:bg-primary-900/20">
            <Bell className="h-4 w-4" /> {testing === "push" ? "Sending…" : "Test Notification"}
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500 flex gap-2 leading-relaxed"><ShieldCheck className="h-4 w-4 shrink-0" /> Your browser controls these permissions — the site can never turn them on by itself. Tap Allow and confirm the browser prompt; if it doesn't appear, use “How to fix”.</p>
    </div>
  );
}
