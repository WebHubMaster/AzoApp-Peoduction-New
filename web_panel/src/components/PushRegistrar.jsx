import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, X, CheckCircle2, Settings2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useRealtimeEvent } from "@/context/RealtimeContext";
import { initPush, isPushSupported, currentPermission, PUSH_REASON_TEXT } from "@/lib/push";

/** Event name any panel can dispatch to (re)open the permission popup. */
export const OPEN_PUSH_PROMPT_EVENT = "azo-open-push-prompt";
export const PUSH_PERMISSION_CHANGED_EVENT = "azo-push-permission-changed";
export function openPushPrompt() {
  try { window.dispatchEvent(new Event(OPEN_PUSH_PROMPT_EVENT)); } catch (e) { /* ignore */ }
}

/** Shared hook: browser permission + whether THIS account has a registered push device. */
export function usePushDeviceState() {
  const [perm, setPerm] = useState(() => currentPermission());
  const [registered, setRegistered] = useState(null); // null = unknown/loading
  useEffect(() => {
    let alive = true;
    const check = () => {
      setPerm(currentPermission());
      if (currentPermission() !== "granted" || !isPushSupported()) { setRegistered(false); return; }
      api.get("/notifications/my-devices").then((r) => { if (alive) setRegistered((r.data?.count || 0) > 0); }).catch(() => {});
    };
    check();
    window.addEventListener(PUSH_PERMISSION_CHANGED_EVENT, check);
    window.addEventListener("azo-push-registered", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      window.removeEventListener(PUSH_PERMISSION_CHANGED_EVENT, check);
      window.removeEventListener("azo-push-registered", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return { perm, registered };
}

/**
 * Notification permission gate (same look & feel as the location popup):
 *  - On login, if browser permission is still "default", shows a centered popup asking
 *    to turn on notifications (browsers require a user gesture).
 *  - If notifications are already granted, silently registers the FCM device token
 *    (when the admin has configured push).
 *  - If the user dismissed / denied by mistake, ANY panel can re-open this popup via
 *    `openPushPrompt()` (used by the bell menu in PanelLayout). When the browser has the
 *    site BLOCKED we show step-by-step unblock instructions + a "Retry" that re-checks.
 *  - Surfaces foreground push messages as toasts (background ones are shown by the SW).
 */
/**
 * Soft re-engagement banner — a slim, dismissible bottom bar that gently nudges the
 * user to turn on notifications whenever THIS account has no registered push device
 * (so background/OS push can actually be delivered). It never blocks the UI: one tap
 * opens the standard permission popup. Dismiss hides it for 24h. It stays out of the
 * way of the first-login opt-in modal (only appears once that has been seen/dismissed).
 */
export function PushNudge() {
  const { user } = useAuth();
  const { perm } = usePushDeviceState();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Never nag once the browser permission is granted — the device is (re)subscribed
    // silently in the background, so no "Turn on" popup should ever appear again.
    if (!user || perm === "unsupported" || perm === "granted") { setHidden(true); return undefined; }
    // Don't compete with the auto opt-in modal on a fresh "default" permission.
    if (perm === "default" && sessionStorage.getItem("azo_push_dismissed") !== "1") { setHidden(true); return undefined; }
    const last = Number(localStorage.getItem("azo_push_nudge_at") || 0);
    if (Date.now() - last < 24 * 60 * 60 * 1000) { setHidden(true); return undefined; }
    const t = setTimeout(() => setHidden(false), 5000); // let the app settle first
    return () => clearTimeout(t);
  }, [user, perm]);

  const close = () => { localStorage.setItem("azo_push_nudge_at", String(Date.now())); setHidden(true); };
  if (hidden || !user) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 pointer-events-none" data-testid="push-nudge">
      <div className="mx-auto max-w-md pointer-events-auto flex items-center gap-3 rounded-2xl bg-slate-900 text-white shadow-2xl ring-1 ring-white/10 px-4 py-3 azo-scale-in mb-16 sm:mb-3">
        <span className="h-9 w-9 rounded-xl bg-primary-600/25 grid place-items-center shrink-0"><BellRing className="h-4.5 w-4.5 text-primary-300" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight">Turn on alerts</p>
          <p className="text-[11px] text-white/60 leading-tight mt-0.5">Get booking &amp; offer updates even when the app is closed.</p>
        </div>
        <button data-testid="push-nudge-enable" onClick={() => { close(); openPushPrompt(); }}
          className="shrink-0 h-9 px-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-[13px] font-semibold transition-colors">Turn on</button>
        <button data-testid="push-nudge-close" onClick={close} aria-label="Dismiss" className="shrink-0 text-white/50 hover:text-white/90"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export default function PushRegistrar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [forced, setForced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(() => currentPermission());
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState(null);

  const refreshPerm = useCallback(() => {
    const p = currentPermission();
    setPerm(p);
    try { window.dispatchEvent(new CustomEvent(PUSH_PERMISSION_CHANGED_EVENT, { detail: { permission: p } })); } catch (e) { /* ignore */ }
    return p;
  }, []);

  // Decide what to do once a user is logged in.
  useEffect(() => {
    if (!user) { setOpen(false); return; }
    let cancelled = false;
    (async () => {
      if (!("Notification" in window)) return;
      const p = currentPermission();
      if (p === "granted") {
        if (isPushSupported()) initPush({ interactive: false }); // silent token refresh/registration
        return;
      }
      if (p === "default") {
        // Ask shortly after load (like the location popup) unless dismissed this session.
        if (sessionStorage.getItem("azo_push_dismissed") !== "1") {
          setTimeout(() => { if (!cancelled) { setForced(false); setDone(false); setOpen(true); } }, 2000);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Any panel can re-open the popup (e.g. bell menu → "Enable notifications").
  useEffect(() => {
    const h = () => { refreshPerm(); setDone(false); setFailure(null); setForced(true); setOpen(true); };
    window.addEventListener(OPEN_PUSH_PROMPT_EVENT, h);
    return () => window.removeEventListener(OPEN_PUSH_PROMPT_EVENT, h);
  }, [refreshPerm]);

  // TOKEN AUTO-HEAL: silently re-register whenever (a) the server says the push
  // setup was just fixed (SSE "push_reregister"), or (b) the tab regains focus while
  // permission is granted but this account has no registered device (throttled 10 min).
  useRealtimeEvent((ev) => {
    if (ev?.type === "push_reregister" && user && currentPermission() === "granted" && isPushSupported()) {
      initPush({ interactive: false }).then((r) => { if (r.ok) toast.success("Background alerts re-activated on this device"); });
    }
  }, [user]);
  useEffect(() => {
    if (!user) return undefined;
    const heal = async () => {
      if (document.visibilityState !== "visible" || currentPermission() !== "granted" || !isPushSupported()) return;
      const lastTry = Number(localStorage.getItem("azo_push_heal_at") || 0);
      if (Date.now() - lastTry < 10 * 60 * 1000) return;
      try {
        const { data } = await api.get("/notifications/my-devices");
        if ((data?.count || 0) > 0) return;
      } catch { return; }
      localStorage.setItem("azo_push_heal_at", String(Date.now()));
      initPush({ interactive: false });
    };
    const t = setTimeout(heal, 4000);
    document.addEventListener("visibilitychange", heal);
    window.addEventListener("focus", heal);
    window.addEventListener("online", heal);   // spec §15: retry when the network comes back
    window.addEventListener("pageshow", heal);  // spec §24: retry when the tab/app is reopened
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", heal); window.removeEventListener("focus", heal); window.removeEventListener("online", heal); window.removeEventListener("pageshow", heal); };
  }, [user]);

  // Foreground push -> toast (background push is rendered by the service worker).
  useEffect(() => {
    const onPush = (e) => {
      const d = (e && e.detail) || {};
      if (!d.title && !d.body) return;
      toast(d.title || "Notification", {
        description: d.body || "",
        duration: 6000,
        action: d.link
          ? {
              label: "View",
              onClick: () => {
                try {
                  if (/^https?:\/\//i.test(d.link)) window.open(d.link, "_blank");
                  else window.location.assign(d.link);
                } catch (err) { /* ignore */ }
              },
            }
          : undefined,
      });
    };
    window.addEventListener("azo-push", onPush);
    return () => window.removeEventListener("azo-push", onPush);
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      let p = currentPermission();
      if (p === "default") {
        try { p = await Notification.requestPermission(); } catch (e) { p = currentPermission(); }
      }
      p = refreshPerm();
      if (p === "granted") {
        // Respond INSTANTLY: close the popup right away and register the FCM device
        // token in the BACKGROUND (network/SW work must never block or delay the UI).
        setFailure(null);
        toast.success("Notifications enabled — this device will get alerts even when the browser is closed.");
        setOpen(false);
        if (isPushSupported()) {
          initPush({ interactive: true })
            .then((res) => {
              if (!res.ok) {
                // Don't block the happy path — the auto-heal effect retries later.
                toast.warning("Notifications are on; finishing device setup in the background…", {
                  description: PUSH_REASON_TEXT[res.reason] || res.error || res.reason, duration: 5000,
                });
              }
            })
            .catch(() => {});
        }
      } else if (p === "denied") {
        // stay open — the popup now shows unblock instructions
      } else {
        setOpen(false);
      }
    } finally { setBusy(false); }
  }, [refreshPerm]);

  const retry = useCallback(() => {
    const p = refreshPerm();
    if (p === "granted") { enable(); }
    else if (p === "default") { enable(); }
    else toast.error("Still blocked — please allow notifications for this site in your browser settings, then retry.");
  }, [enable, refreshPerm]);

  const dismiss = useCallback(() => {
    if (!forced) sessionStorage.setItem("azo_push_dismissed", "1");
    setOpen(false);
  }, [forced]);

  if (!open || !user) return null;

  const unsupported = perm === "unsupported";
  const blocked = perm === "denied";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={dismiss} data-testid="push-optin">
      <div className="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-7 text-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={dismiss} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600" aria-label="Dismiss" data-testid="push-close">
          <X className="h-4 w-4" />
        </button>

        {done ? (
          <>
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 mx-auto flex items-center justify-center mb-4"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Notifications on</h3>
            <p className="text-sm text-slate-500 mt-2">Device registered. You&apos;ll now get instant alerts for bookings, offers & updates — even when the app is closed.</p>
          </>
        ) : failure ? (
          <>
            <div className="h-16 w-16 rounded-2xl bg-amber-50 mx-auto flex items-center justify-center mb-4"><BellOff className="h-8 w-8 text-amber-600" /></div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Device not registered</h3>
            <p className="text-sm text-slate-500 mt-2" data-testid="push-failure-reason">{PUSH_REASON_TEXT[failure.reason] || "Registration failed."}</p>
            {failure.error && <p className="text-[11px] text-slate-400 mt-2 break-all rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2" data-testid="push-failure-detail">{failure.error}</p>}
            <p className="text-xs text-slate-500 mt-3">In-app ringing still works while this tab is open. The admin has been notified of this reason in Diagnostics.</p>
            <button data-testid="push-retry" onClick={enable} disabled={busy}
              className="w-full mt-5 h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm disabled:opacity-60">
              {busy ? "Retrying…" : "Retry registration"}
            </button>
            <button data-testid="push-skip" onClick={dismiss} className="mt-3 text-sm text-slate-500 hover:text-slate-700 font-medium">Close</button>
          </>
        ) : unsupported ? (
          <>
            <div className="h-16 w-16 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-4"><BellOff className="h-8 w-8 text-slate-500" /></div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Notifications not supported</h3>
            <p className="text-sm text-slate-500 mt-2">This browser doesn&apos;t support notifications. Try Chrome, Edge or Safari on a phone/desktop.</p>
            <button onClick={dismiss} className="mt-5 text-sm text-slate-500 hover:text-slate-700 font-medium">Close</button>
          </>
        ) : blocked ? (
          <>
            <div className="h-16 w-16 rounded-2xl bg-red-50 mx-auto flex items-center justify-center mb-4"><BellOff className="h-8 w-8 text-red-600" /></div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Notifications are blocked</h3>
            <p className="text-sm text-slate-500 mt-2">Your browser has blocked notifications for this site. Unblock it in 3 quick steps, then tap Retry.</p>
            <ol className="text-left text-xs text-slate-600 dark:text-slate-300 mt-4 space-y-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3" data-testid="push-unblock-steps">
              <li className="flex gap-2"><span className="font-bold text-primary-700">1.</span><span>Tap the lock / site-settings icon <Settings2 className="inline h-3.5 w-3.5 -mt-0.5" /> next to the address bar.</span></li>
              <li className="flex gap-2"><span className="font-bold text-primary-700">2.</span><span>Find <b>Notifications</b> and change it to <b>Allow</b>.</span></li>
              <li className="flex gap-2"><span className="font-bold text-primary-700">3.</span><span>Come back here and press <b>Retry</b>.</span></li>
            </ol>
            <button data-testid="push-retry" onClick={retry} disabled={busy}
              className="w-full mt-5 h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm disabled:opacity-60">
              {busy ? "Checking…" : "I've allowed it — Retry"}
            </button>
            <button data-testid="push-skip" onClick={dismiss} className="mt-3 text-sm text-slate-500 hover:text-slate-700 font-medium">Not now</button>
          </>
        ) : (
          <>
            <div className="h-16 w-16 rounded-2xl bg-primary-50 mx-auto flex items-center justify-center mb-4"><BellRing className="h-8 w-8 text-primary-700" /></div>
            <h3 className="font-heading font-bold text-xl text-slate-900 dark:text-white">Turn on notifications</h3>
            <p className="text-sm text-slate-500 mt-2">Get instant alerts for bookings, partner updates & offers — even when the app is closed. Your browser will ask for permission next.</p>
            <button data-testid="push-enable" onClick={enable} disabled={busy}
              className="w-full mt-5 h-11 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
              <Bell className="h-4 w-4" /> {busy ? "Waiting for permission…" : "Allow notifications"}
            </button>
            <button data-testid="push-skip" onClick={dismiss} className="mt-3 text-sm text-slate-500 hover:text-slate-700 font-medium">Not now</button>
          </>
        )}
      </div>
    </div>
  );
}
