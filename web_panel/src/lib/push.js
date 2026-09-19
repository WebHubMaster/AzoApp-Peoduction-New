/* Standard VAPID Web Push registration for the logged-in user.
 *
 * This uses the browser's own PushManager + a SELF-GENERATED VAPID key served by
 * the backend (GET /notifications/webpush/public-key). It does NOT depend on the
 * Firebase Installations API (which was blocked in Google Cloud and caused
 * getToken() to fail). Once the user grants permission, PushManager.subscribe()
 * mints a push subscription that we save to the backend — background delivery then
 * works with no manual browser-settings step.
 *
 * The service worker (/firebase-messaging-sw.js) already renders the FCM-style
 * payload {notification, data, fcmOptions} that the backend web-push sender emits.
 * Every outcome (success / exact failure) is reported so admin Diagnostics can show
 * WHY a device is not registered. Never throws.
 */
import api from "@/lib/api";

let _inFlightPromise = null;
let _registeredEndpoint = null;

export const PUSH_REASON_TEXT = {
  unsupported: "This browser doesn't support web push (use Chrome/Edge on Android or desktop; on iPhone add the site to the Home Screen first, then open it from there).",
  disabled: "Push is switched off by the admin.",
  not_configured: "Web push is not configured on the server yet.",
  needs_permission: "Notification permission not granted yet.",
  denied: "Notifications are blocked for this site in the browser.",
  sw_failed: "Service worker could not be installed (check that the site is served over HTTPS).",
  push_service: "The browser's push service refused the subscription. This is usually temporary — please tap Retry.",
  no_token: "The browser returned an empty push subscription.",
  register_failed: "Subscription obtained but could not be saved to the server.",
  error: "Unexpected error during registration.",
};

export function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

export function currentPermission() {
  try {
    return "Notification" in window ? Notification.permission : "unsupported";
  } catch (e) {
    return "unsupported";
  }
}

/** Stable per-browser identity so a re-subscribe updates the SAME device record. */
function deviceId() {
  try {
    let id = localStorage.getItem("azo_device_id");
    if (!id) {
      id = (crypto?.randomUUID?.() || ("d-" + Date.now() + "-" + Math.random().toString(36).slice(2)));
      localStorage.setItem("azo_device_id", id);
    }
    return id;
  } catch (e) { return ""; }
}

function deviceMeta() {
  const ua = navigator.userAgent || "";
  let platform = "web";
  if (/android/i.test(ua)) platform = "android";
  else if (/iphone|ipad|ipod/i.test(ua)) platform = "ios";
  else if (window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone) platform = "pwa";
  let browser = "browser";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua)) browser = "Safari";
  return { platform, browser };
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function report(result) {
  try {
    await api.post("/notifications/push-status", {
      ok: !!result.ok, reason: result.reason || (result.ok ? "registered" : ""),
      error: result.error || "", permission: currentPermission(),
      user_agent: navigator.userAgent,
    });
  } catch (e) { /* best-effort */ }
  try { window.dispatchEvent(new CustomEvent("azo-push-registered", { detail: result })); } catch (e) { /* ignore */ }
}

function waitActive(reg) {
  return new Promise((resolve) => {
    const sw = reg.installing || reg.waiting || reg.active;
    if (!sw) return resolve();
    if (sw.state === "activated") return resolve();
    const t = setTimeout(resolve, 8000);
    sw.addEventListener("statechange", () => {
      if (sw.state === "activated") { clearTimeout(t); resolve(); }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Attempt to enable push for the current user.
 * @param {Object} opts
 * @param {boolean} opts.interactive - if true, will prompt for permission when in 'default'.
 * @returns {Promise<{ok:boolean, reason?:string, error?:string, endpoint?:string}>}
 */
export async function initPush({ interactive = false } = {}) {
  if (_inFlightPromise) {
    const prev = await _inFlightPromise.catch(() => null);
    if (prev && (prev.ok || !interactive)) return prev;
  }
  const run = (async () => {
    let result;
    try {
      result = await _initPush({ interactive });
    } catch (e) {
      result = { ok: false, reason: "error", error: String((e && e.message) || e) };
    }
    if (result.reason !== "needs_permission") report(result);
    return result;
  })();
  _inFlightPromise = run;
  try {
    return await run;
  } finally {
    if (_inFlightPromise === run) _inFlightPromise = null;
  }
}

async function _initPush({ interactive }) {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  // Public VAPID application server key from the backend.
  let appKey = "";
  try {
    const { data } = await api.get("/notifications/webpush/public-key");
    if (!data || !data.enabled || !data.public_key) return { ok: false, reason: "not_configured" };
    appKey = data.public_key;
  } catch (e) {
    return { ok: false, reason: "not_configured", error: String((e && e.message) || e) };
  }

  let perm = Notification.permission;
  if (perm === "default") {
    if (!interactive) return { ok: false, reason: "needs_permission" };
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") return { ok: false, reason: "denied" };

  let swReg;
  try {
    swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
    await waitActive(swReg);
    // Make sure a controlling/ready registration is available before subscribing.
    swReg = await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, reason: "sw_failed", error: String((e && e.message) || e) };
  }

  const applicationServerKey = urlBase64ToUint8Array(appKey);

  let subscription = null, lastErr = null;
  const MAX_ATTEMPTS = 5; // controlled retry with exponential backoff: 1s,2s,4s,8s
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !subscription; attempt++) {
    try {
      const existing = await swReg.pushManager.getSubscription();
      if (existing) {
        // If the existing subscription was made with a DIFFERENT server key,
        // it can't be used — drop it and re-subscribe with the current key.
        const cur = existing.options && existing.options.applicationServerKey;
        let sameKey = true;
        try {
          if (cur) {
            const a = new Uint8Array(cur);
            sameKey = a.length === applicationServerKey.length &&
              a.every((v, i) => v === applicationServerKey[i]);
          }
        } catch (err) { sameKey = true; }
        if (sameKey) { subscription = existing; break; }
        try { await existing.unsubscribe(); } catch (err) { /* ignore */ }
      }
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    } catch (e) {
      lastErr = e;
      // A stale subscription cached in the SW is the #1 recoverable cause of
      // AbortError / "push service error" — drop it before the next attempt.
      try {
        const stale = await swReg.pushManager.getSubscription();
        if (stale) await stale.unsubscribe();
      } catch (err) { /* ignore */ }
      if (attempt < MAX_ATTEMPTS - 1) await sleep(Math.min(8000, 1000 * Math.pow(2, attempt)));
    }
  }

  if (!subscription) {
    const name = String((lastErr && lastErr.name) || "");
    const msg = String((lastErr && lastErr.message) || "");
    const code = lastErr && lastErr.code != null ? String(lastErr.code) : "";
    const detail = [name, msg || code].filter(Boolean).join(": ");
    const abort = name === "AbortError" || code === "20" || /push service/i.test(msg);
    return { ok: false, reason: abort ? "push_service" : (lastErr ? "error" : "no_token"), error: detail };
  }

  const json = subscription.toJSON ? subscription.toJSON() : {
    endpoint: subscription.endpoint,
    keys: subscription.keys || {},
  };
  const endpoint = json.endpoint || subscription.endpoint || "";

  if (endpoint && endpoint !== _registeredEndpoint) {
    try {
      const meta = deviceMeta();
      await api.post("/notifications/webpush/subscribe", {
        subscription: { endpoint, keys: json.keys },
        user_agent: navigator.userAgent, device_id: deviceId(),
        platform: meta.platform, browser: meta.browser,
      });
      _registeredEndpoint = endpoint;
    } catch (e) {
      return { ok: false, reason: "register_failed", error: String((e && e.message) || e) };
    }
  }

  return { ok: true, endpoint };
}
